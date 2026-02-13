import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { normalize_id, determinePhase, calculateBusinessDays, checkPhaseSLAs, calculateBusinessHours } from '../lib/utils';
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

            // 3. Create Import Record
            const { data: importRec, error: importErr } = await supabase
                .from('imports')
                .insert({
                    tipo: xlsxFile && csvFile ? 'both' : xlsxFile ? 'xlsx' : 'csv',
                    nome_arquivo: [xlsxFile?.name, csvFile?.name].filter(Boolean).join(' | '),
                })
                .select()
                .single();

            if (importErr) throw importErr;

            // 4. Fetch Holidays and SLA Settings
            const { data: holidaysData } = await supabase.from('feriados').select('data');
            const holidays = (holidaysData || []).map(h => h.data);
            const slaMax = Number(localStorage.getItem('sla_max_dias_uteis') || '5');

            // 4.1 Fetch Order Overrides
            const { data: overridesData } = await supabase.from('order_overrides').select('pedido_id_interno, status_manual');
            const overridesMap = new Map<string, string>();
            if (overridesData) {
                overridesData.forEach(o => overridesMap.set(o.pedido_id_interno, o.status_manual));
            }

            // 5. Save Raw Data
            if (xlsxRows.length) {
                await supabase.from('raw_xlsx').insert(xlsxRows.map(row => ({ import_id: importRec.id, data: row })));
            }
            if (csvRows.length) {
                await supabase.from('raw_csv').insert(csvRows.map(row => ({ import_id: importRec.id, data: row })));
            }

            // 6. Consolidate Pedidos
            // We will match rows and update pedidos_consolidados
            // This is the core logic
            const consolidated: any[] = [];

            // We'll iterate through XLSX first as the source of truth for "Aprovado" orders
            for (const rx of xlsxRows) {
                const codPedido = getVal(rx, ['CodigoPedido', 'Pedido', 'Código Pedido']);
                const codExterno = getVal(rx, ['Cód Externo Pedido', 'CodExterno', 'Cód. Externo Pedido']);

                // Find matching CSV row
                const match = csvRows.find(rc => {
                    const normCsvPed = normalize_id(rc.Pedido);
                    const normXlsxPed = normalize_id(codPedido);
                    const normCsvErp = normalize_id(rc['Pedido ERP']);
                    const normXlsxExt = normalize_id(codExterno);

                    return (normCsvPed && normCsvPed === normXlsxPed) ||
                        (normCsvErp && normCsvErp === normXlsxExt) ||
                        (normCsvPed && normCsvPed === normXlsxExt);
                });

                const parseExcelDate = (val: any) => {
                    if (!val) return null;

                    // Se já for uma data
                    if (val instanceof Date) {
                        return val.toISOString();
                    }

                    if (typeof val === 'string') {
                        const clean = val.trim();
                        if (!clean) return null;

                        try {
                            const formats = [
                                'dd/MM/yyyy HH:mm:ss',
                                'dd/MM/yyyy HH:mm',
                                'yyyy-MM-dd HH:mm:ss',
                                'dd/MM/yyyy',
                                'yyyy-MM-dd'
                            ];

                            for (const fmt of formats) {
                                try {
                                    const parsed = parseDateFns(clean, fmt, new Date());
                                    if (!isNaN(parsed.getTime())) {
                                        return parsed.toISOString();
                                    }
                                } catch (e) { }
                            }
                        } catch (e) { }
                    }

                    return null;
                };

                const aprovadoAtRaw = getVal(rx, ['Data Aprovação', 'DataAprovação', 'Data de Aprovação']);
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
                    rota: match?.Rota || null,
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
                        const b = getVal(rx, ['Bairro']) || match?.Bairro || '';
                        const c = getVal(rx, ['Município', 'Municipio', 'Cidade']) || match?.Cidade || '';
                        const loc = [b, c].filter(p => p && p.trim()).join(' - ');
                        return loc.replace(/\/RJ/g, '').trim() || 'Localização não informada';
                    })(),
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
            </div>
        </div>
    );
}
