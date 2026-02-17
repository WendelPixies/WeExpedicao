import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { normalize_id, determinePhase, calculateBusinessDays, checkPhaseSLAs, calculateBusinessHours, fetchRoutesFromSheet } from '../lib/utils';
import { FileUp, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { parse as parseDateFns } from 'date-fns';

// Helper duplicated here for simplicity in this file context, ideally could be exported from utils
const getVal = (obj: any, keys: string[]) => {
    if (!obj) return null;
    for (const k of keys) {
        if (obj[k] !== undefined) return obj[k];
        if (obj[k.toUpperCase()] !== undefined) return obj[k.toUpperCase()];
        if (obj[k.toLowerCase()] !== undefined) return obj[k.toLowerCase()];
    }
    return null;
};

export default function ImportPage() {
    const [xlsxFile, setXlsxFile] = useState<File | null>(null);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [routesMap, setRoutesMap] = useState<Record<string, string>>({});
    const [lastImport, setLastImport] = useState<any>(null);

    // Load routes map and last import on component mount
    React.useEffect(() => {
        fetchRoutesFromSheet().then(setRoutesMap);
        fetchLastImport();
    }, []);

    const fetchLastImport = async () => {
        const { data } = await supabase
            .from('imports')
            .select('*')
            .order('imported_at', { ascending: false })
            .limit(1)
            .single();
        if (data) setLastImport(data);
    };

    const handleXlsxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setXlsxFile(e.target.files[0]);
    };

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setCsvFile(e.target.files[0]);
    };

    const processImport = async () => {
        if (!xlsxFile && !csvFile) {
            setStatus({ type: 'error', message: 'Selecione ao menos um arquivo para importar.' });
            return;
        }

        setImporting(true);
        setStatus({ type: 'info', message: 'Processando arquivos...' });

        try {
            // LIMPEZA AUTOMÁTICA: Remove dados anteriores para manter apenas o snapshot atual
            setStatus({ type: 'info', message: 'Limpando dados anteriores...' });

            // 1. Delete consolidados (não tem FK)
            await supabase.from('pedidos_consolidados').delete().neq('id', 0);

            // 2. Delete imports (Cascade deleta raw_xlsx e raw_csv)
            // Caso o cascade não funcione por algum motivo, deletamos explicitamente
            await supabase.from('raw_xlsx').delete().neq('id', 0);
            await supabase.from('raw_csv').delete().neq('id', 0);
            await supabase.from('imports').delete().neq('id', 0);

            let xlsxRows: any[] = [];
            let csvRows: any[] = [];

            // 1. Process XLSX
            if (xlsxFile) {
                const data = await xlsxFile.arrayBuffer();
                const workbook = XLSX.read(data, { cellDates: true });
                const sheetName = workbook.SheetNames.includes('Pag') ? 'Pag' : workbook.SheetNames[0];
                xlsxRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false, dateNF: 'yyyy-mm-dd HH:mm:ss' });
            }

            // 2. Process CSV
            if (csvFile) {
                const text = await csvFile.text();
                const lines = text.split('\n');
                if (lines.length > 0) {
                    const firstLine = lines[0];
                    const separator = firstLine.includes(';') && (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';

                    const parseCSVLine = (line: string) => {
                        const values = [];
                        let current = '';
                        let inQuotes = false;
                        for (let i = 0; i < line.length; i++) {
                            const char = line[i];
                            if (char === '"') {
                                inQuotes = !inQuotes;
                            } else if (char === separator && !inQuotes) {
                                values.push(current.trim().replace(/^"|"$/g, ''));
                                current = '';
                            } else {
                                current += char;
                            }
                        }
                        values.push(current.trim().replace(/^"|"$/g, ''));
                        return values;
                    };

                    const headers = parseCSVLine(lines[0]);
                    csvRows = lines.slice(1).filter(l => l.trim()).map(line => {
                        const values = parseCSVLine(line);
                        const row: any = { _rawValues: values };
                        headers.forEach((h, i) => {
                            if (h) row[h] = values[i];
                        });
                        return row;
                    });
                }
            }

            // 3. Save to Supabase (Raw)
            const { data: importData, error: importError } = await supabase
                .from('imports')
                .insert([{
                    nome_arquivo: xlsxFile ? xlsxFile.name : (csvFile ? csvFile.name : 'Import'),
                    tipo: xlsxFile && csvFile ? 'both' : (xlsxFile ? 'xlsx' : 'csv')
                }])
                .select()
                .single();

            if (importError) throw importError;
            const importId = importData.id;

            if (xlsxRows.length > 0) {
                // Batch insert raw_xlsx
                const batchSize = 1000;
                for (let i = 0; i < xlsxRows.length; i += batchSize) {
                    const batch = xlsxRows.slice(i, i + batchSize).map(row => ({
                        import_id: importId,
                        data: row
                    }));
                    await supabase.from('raw_xlsx').insert(batch);
                }
            }

            if (csvRows.length > 0) {
                // Batch insert raw_csv
                const batchSize = 1000;
                for (let i = 0; i < csvRows.length; i += batchSize) {
                    const batch = csvRows.slice(i, i + batchSize).map(row => ({
                        import_id: importId,
                        data: row
                    }));
                    await supabase.from('raw_csv').insert(batch);
                }
            }

            // 4. Fetch Holidays
            const { data: holidaysData } = await supabase.from('feriados').select('*');
            const holidays = (holidaysData || []).map((h: any) => h.data);
            const slaMax = Number(localStorage.getItem('sla_max_dias_uteis') || '7');

            // 5. Fetch Overrides
            const { data: overridesData } = await supabase.from('order_overrides').select('*');
            const overridesMap = new Map();
            overridesData?.forEach((ov: any) => {
                overridesMap.set(String(ov.pedido_id), ov.new_phase);
            });

            // 6. Consolidate Data
            // Logic: Iterate XLSX (base), find match in CSV (complement)
            // If XLSX is missing, we check CSV? Usually system is based on XLSX orders.

            const consolidated: any[] = [];
            const processedIds = new Set();

            // Helper to parsing Excel dates which might be numbers or strings
            const parseExcelDate = (val: any) => {
                if (!val) return null;
                if (val instanceof Date) return val.toISOString();
                // If number (Excel serial date)
                if (typeof val === 'number') {
                    // (val - 25569) * 86400 * 1000
                    // But XLSX library with cellDates: true handles this mostly.
                    return null;
                }
                // If string DD/MM/YYYY
                if (typeof val === 'string') {
                    if (val.includes('/')) {
                        const parts = val.split(/[/\s:-]/); // Split by various separators
                        // Expect DD/MM/YYYY HH:mm:ss or similar
                        if (parts.length >= 3) {
                            // Assuming PT-BR format DD/MM/YYYY
                            let day = parseInt(parts[0]);
                            let month = parseInt(parts[1]) - 1;
                            let year = parseInt(parts[2]);

                            if (year < 100) year += 2000; // Fix 2 digit years

                            let hour = 0, min = 0, sec = 0;
                            if (parts.length > 3) hour = parseInt(parts[3]) || 0;
                            if (parts.length > 4) min = parseInt(parts[4]) || 0;
                            if (parts.length > 5) sec = parseInt(parts[5]) || 0;

                            const d = new Date(year, month, day, hour, min, sec);
                            if (!isNaN(d.getTime())) return d.toISOString();
                        }
                    }
                    // Try direct parse
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) return d.toISOString();
                }
                return null;
            };

            for (const rx of xlsxRows) {
                const codPedido = getVal(rx, ['Pedido', 'Número do Pedido', 'Numero Pedido', 'CodigoPedido', 'Código Pedido']);
                const codExterno = getVal(rx, ['Pedido Externo', 'Cod Externo', 'PedidoExterno', 'Cód Externo Pedido', 'Codigo Externo']);

                if (!codPedido) continue;

                // Find match in CSV
                // Match Logic: Try by Internal ID match, then External ID match
                let match = null;
                if (csvRows.length > 0) {
                    match = csvRows.find(c => {
                        const cPed = getVal(c, ['Pedido', 'Número do Pedido', 'Numero Pedido']);
                        const cExt = getVal(c, ['Pedido ERP', 'PedidoERP']);
                        return (cPed && String(cPed) === String(codPedido)) ||
                            (cExt && String(cExt) === String(codExterno));
                    });
                }

                // DETERMINE DATA
                const aprovadoAtRaw = getVal(rx, ['DataAprovação', 'Data Aprovação', 'Data de Aprovação']);
                const faturadoAtRaw = getVal(rx, ['DataFaturamento', 'Data Faturamento', 'Data de Faturamento']);
                const disponivelAtRaw = getVal(rx, ['DataAutorizaçãoFaturamento', 'Data Autorização Faturamento', 'Data de Autorização Faturamento', 'DataAutorização']);

                let phase = determinePhase(rx, match);

                // CHECK OVERRIDE
                if (codPedido && overridesMap.has(String(codPedido))) {
                    console.log(`ℹ️ Pedido ${codPedido} possui override: ${overridesMap.get(String(codPedido))}`);
                    phase = overridesMap.get(String(codPedido)) as any;
                }
                // Parse dates first
                const aprovadoAt = aprovadoAtRaw ? new Date(aprovadoAtRaw) : null;
                const disponivelAt = parseExcelDate(disponivelAtRaw);
                const faturadoAt = parseExcelDate(faturadoAtRaw);
                const despachadoAt = parseExcelDate(match?.['Data de Coleta']);

                // Use delivery date from CSV 'Status (hora efetuada)' column or Column AC
                let entregueAt = null;

                // Check if order is delivered (case-insensitive)
                const xlsxDeliveryRaw = getVal(rx, ['DataEntrega', 'Data Entrega', 'Data de Entrega']);

                if (match) {
                    // Try multiple possible column names for delivery date, prioritizing Column AC (index 28) from CSV
                    const csvDeliveryDate = match._rawValues?.[28] ||
                        match['Status (hora efetuada)'] ||
                        match['Status (Hora Efetuada)'] ||
                        match['status (hora efetuada)'] ||
                        match['Data de Entrega'] ||
                        match['Data Entrega'];

                    if (csvDeliveryDate) {
                        const parsed = parseExcelDate(csvDeliveryDate);
                        if (parsed) {
                            entregueAt = parsed;
                            console.log(`✅ Pedido ${codPedido}: Data de entrega encontrada no CSV: ${csvDeliveryDate} -> ${parsed}`);
                        }
                    }
                }

                // Fallback to XLSX data if CSV didn't have a date or if there was no match
                if (!entregueAt && xlsxDeliveryRaw) {
                    const parsed = parseExcelDate(xlsxDeliveryRaw);
                    if (parsed) {
                        entregueAt = parsed;
                        console.log(`✅ Pedido ${codPedido}: Data de entrega encontrada no XLSX: ${xlsxDeliveryRaw} -> ${parsed}`);
                    }
                }

                // Removed the fallback that used new Date() if no date was found.
                // If it's empty in the spreadsheet, it stays empty in the system.

                // Calculate business days total
                const entregueDateObj = entregueAt ? new Date(entregueAt) : null;
                const diasUteis = (aprovadoAt && entregueDateObj) ? calculateBusinessDays(aprovadoAt, entregueDateObj, holidays) : 0;

                const pedidoData = {
                    pedido_id_interno: String(codPedido || ''),
                    pedido_id_externo: String(codExterno || ''),
                    pedido_id_logistica: match?.Pedido || null,
                    pedido_id_erp_csv: match?.['Pedido ERP'] || null,
                    fase_atual: phase,
                    aprovado_at: parseExcelDate(aprovadoAtRaw),
                    disponivel_faturamento_at: disponivelAt,
                    faturado_at: faturadoAt,
                    despachado_at: despachadoAt,
                    entregue_at: entregueAt,
                    dias_uteis_desde_aprovacao: diasUteis,
                    sla_status: diasUteis > slaMax ? 'ATRASADO' : 'NO PRAZO',
                    transportadora: match?.Transportadora || null,
                    rota: (() => {
                        // 1. Try CSV 'Rota'
                        if (match?.Rota) return match.Rota;
                        // 2. Try Google Sheet Map using Person Name
                        if (codPedido) {
                            // Try multiple name fields
                            const pName = (getVal(rx, ['NomePessoa', 'Nome Pessoa']) || match?.Cliente || '').replace(/\*/g, '').trim().toUpperCase();
                            if (pName && routesMap[pName]) return routesMap[pName];
                        }
                        return null;
                    })(),
                    motorista: match?.Motorista || null,

                    // New fields for Real Metrics
                    horas_disponivel: calculateBusinessHours(parseExcelDate(aprovadoAtRaw), disponivelAt, holidays),
                    horas_faturado: calculateBusinessHours(disponivelAt, faturadoAt, holidays),
                    horas_transporte: calculateBusinessHours(despachadoAt, entregueAt, holidays),

                    horas_picking: null,
                    horas_packing: null,

                    // Combinamos o Detalhe Comercial (Excel) com a Última Ocorrência (CSV) para garantir que a informação apareça
                    ultima_ocorrencia: [
                        getVal(rx, ['DetalheSituaçãoComercial', 'Detalhe da Situação Comercial', 'DetalheSituacaoComercial']),
                        match?.['Última Ocorrência']
                    ].filter(Boolean).join(' | ') || null,
                    municipio_uf: (() => {
                        const b = getVal(rx, ['Bairro']) || getVal(match, ['Bairro']) || '';
                        const c = getVal(rx, ['Município', 'Municipio', 'Cidade']) || getVal(match, ['Município', 'Municipio', 'Cidade']) || '';
                        const loc = [b, c].filter(p => p && p.trim()).join(' - ');
                        return loc.replace(/\/RJ/g, '').trim() || 'Localização não informada';
                    })(),
                    municipio: getVal(rx, ['Município', 'Municipio', 'Cidade']) || getVal(match, ['Município', 'Municipio', 'Cidade']) || null,
                    bairro: getVal(rx, ['Bairro']) || getVal(match, ['Bairro']) || null,
                    nome_pessoa: getVal(rx, ['NomePessoa', 'Nome Pessoa']) || null,
                    situacao: getVal(rx, ['SituaçãoComercial', 'Situação Comercial', 'SituacaoComercial']) || null,
                    match_key_used: match ? 'matched' : 'none'
                };

                const phaseAlerts = checkPhaseSLAs(pedidoData, null, holidays);

                consolidated.push({
                    ...pedidoData,
                    sla_detalhado: { alerts: phaseAlerts }
                });
            }

            // Deduplicate consolidated array by pedido_id_interno to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
            const uniqueConsolidated = Array.from(
                new Map(consolidated.map(item => [item.pedido_id_interno, item])).values()
            );

            // Save consolidated
            const { error: consErr } = await supabase
                .from('pedidos_consolidados')
                .upsert(uniqueConsolidated, { onConflict: 'pedido_id_interno' });

            if (consErr) throw consErr;

            // 7. Track Daily Picking
            // Identify orders currently in 'Picking' and add them to the daily tracker if not already there
            const pickingOrders = uniqueConsolidated.filter((p: any) => p.fase_atual === 'Picking');

            if (pickingOrders.length > 0) {
                const today = new Date().toISOString().split('T')[0];
                const trackerRows = pickingOrders.map((p: any) => ({
                    pedido_id: p.pedido_id_interno,
                    data_referencia: today
                }));

                const { error: trackErr } = await supabase
                    .from('daily_picking_tracker')
                    .upsert(trackerRows, { onConflict: 'pedido_id,data_referencia', ignoreDuplicates: true });

                if (trackErr) console.error('Error tracking daily picking:', trackErr);
            }

            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            setStatus({ type: 'success', message: `Importação concluída com sucesso às ${timeStr}!` });
            fetchLastImport(); // Refresh last import log
        } catch (err: any) {
            console.error(err);
            setStatus({ type: 'error', message: `Erro na importação: ${err.message}` });
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="animate-fade">
            <header className="header">
                <h1 className="title">Importar Dados</h1>
            </header>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="stat-card">
                    <label className="stat-label">XLSX (ConsultaPedidos)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleXlsxUpload}
                                style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer' }}
                            />
                            <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileUp size={18} />
                                {xlsxFile ? xlsxFile.name : 'Selecionar XLSX'}
                            </button>
                        </div>
                        {xlsxFile && <CheckCircle size={20} color="var(--success)" />}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        Necessário aba "Pag" com colunas de pedidos.
                    </p>
                </div>

                <div className="stat-card">
                    <label className="stat-label">CSV (Logística)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleCsvUpload}
                                style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer' }}
                            />
                            <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileUp size={18} />
                                {csvFile ? csvFile.name : 'Selecionar CSV'}
                            </button>
                        </div>
                        {csvFile && <CheckCircle size={20} color="var(--success)" />}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        Arquivo exportado do sistema de logística.
                    </p>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', marginTop: '2rem' }}>
                <button
                    className="btn btn-primary"
                    onClick={processImport}
                    disabled={importing}
                    style={{ width: '200px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                >
                    {importing ? <Loader2 className="animate-spin" size={20} /> : 'Processar Agora'}
                </button>

                {status && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '1rem',
                        borderRadius: 'var(--radius)',
                        background: status.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : (status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)'),
                        color: status.type === 'error' ? 'var(--danger)' : (status.type === 'success' ? 'var(--success)' : 'var(--primary)'),
                        maxWidth: '500px',
                        fontWeight: status.type === 'success' ? 600 : 400
                    }}>
                        {status.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                        <span>{status.message}</span>
                    </div>
                )}

                {lastImport && (
                    <div style={{
                        maxWidth: '500px',
                        padding: '1rem',
                        borderRadius: 'var(--radius)',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Última Importação
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Data/Hora:</span>
                                <span style={{ fontWeight: 600 }}>
                                    {new Date(lastImport.imported_at).toLocaleString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </span>
                            </div>
                            {lastImport.xlsx_filename && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>XLSX:</span>
                                    <span style={{ fontWeight: 600, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {lastImport.xlsx_filename}
                                    </span>
                                </div>
                            )}
                            {lastImport.csv_filename && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>CSV:</span>
                                    <span style={{ fontWeight: 600, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {lastImport.csv_filename}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
