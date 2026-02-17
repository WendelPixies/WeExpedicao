import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Plus, Trash2, Save, RefreshCw, DollarSign, MapPin, Edit2, X, Check } from 'lucide-react';
import { fetchRoutesFromSheet } from '../lib/utils';
import * as XLSX from 'xlsx';

export default function Settings() {
    const [holidays, setHolidays] = useState<any[]>([]);
    const [slaMax, setSlaMax] = useState(7);
    const [newHoliday, setNewHoliday] = useState({ data: '', descricao: '' });
    const [slaParams, setSlaParams] = useState({
        sla_picking: 24,
        sla_packing: 24,
        sla_disponivel: 48,
        sla_faturado: 48,
        sla_despachado: 96,
        sla_entregue: 120
    });

    const [routes, setRoutes] = useState<string[]>([]);
    const [dbRoutes, setDbRoutes] = useState<any[]>([]);
    const [newRouteName, setNewRouteName] = useState('');
    const [newRouteMunicipio, setNewRouteMunicipio] = useState('');
    const [newRouteBairro, setNewRouteBairro] = useState('');
    const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
    const [editingRouteName, setEditingRouteName] = useState('');
    const [routeCosts, setRouteCosts] = useState<Record<string, number>>({});

    // Filters
    const [filterMunicipio, setFilterMunicipio] = useState('');
    const [filterBairro, setFilterBairro] = useState('');
    const [filterRota, setFilterRota] = useState('');

    useEffect(() => {
        fetchHolidays();
        loadRouteData();
        const savedSla = localStorage.getItem('sla_max_dias_uteis');
        if (savedSla) setSlaMax(Number(savedSla));

        const savedParams = localStorage.getItem('sla_phase_params');
        if (savedParams) {
            setSlaParams(JSON.parse(savedParams));
        }
    }, []);

    const fetchHolidays = async () => {
        const { data } = await supabase.from('feriados').select('*').order('data', { ascending: true });
        if (data) setHolidays(data);
    };

    const handleAddHoliday = async () => {
        if (!newHoliday.data || !newHoliday.descricao) return;
        const { error } = await supabase.from('feriados').insert([newHoliday]);
        if (!error) {
            fetchHolidays();
            setNewHoliday({ data: '', descricao: '' });
        }
    };

    const handleDeleteHoliday = async (id: string) => {
        const { error } = await supabase.from('feriados').delete().eq('id', id);
        if (!error) fetchHolidays();
    };

    const loadRouteData = async () => {
        // Fetch from Sheet
        const map = await fetchRoutesFromSheet();
        const sheetRoutes = Array.from(new Set(Object.values(map))).sort();

        // Fetch from DB
        const { data: dbData } = await supabase.from('routes').select('*').order('municipio', { ascending: true }).order('bairro', { ascending: true }).order('name', { ascending: true });
        const dbRoutesList = dbData || [];
        setDbRoutes(dbRoutesList);

        // Merge distinct routes
        const dbRouteNames = dbRoutesList.map((r: any) => r.name);
        // Combine and dedup
        const uniqueRoutes = Array.from(new Set([...sheetRoutes, ...dbRouteNames])).sort();
        setRoutes(uniqueRoutes);

        const { data } = await supabase.from('route_costs').select('*');
        if (data) {
            const costs: Record<string, number> = {};
            data.forEach((r: any) => {
                costs[r.route] = r.cost;
            });
            setRouteCosts(costs);
        }
    };

    const handleAddRoute = async () => {
        if (!newRouteName.trim() || !newRouteMunicipio.trim() || !newRouteBairro.trim()) {
            alert('Município, Bairro e Rota são obrigatórios');
            return;
        }

        const normalizedMunicipio = newRouteMunicipio.trim().toUpperCase();
        const normalizedBairro = newRouteBairro.trim().toUpperCase();
        const normalizedRota = newRouteName.trim().toUpperCase();

        // Check duplicate in current loaded data
        const exists = dbRoutes.some(r =>
            r.municipio === normalizedMunicipio &&
            r.bairro === normalizedBairro
        );

        if (exists) {
            alert(`Já existe uma rota cadastrada para ${normalizedMunicipio} - ${normalizedBairro}.`);
            return;
        }

        try {
            const payload = {
                name: normalizedRota,
                municipio: normalizedMunicipio,
                bairro: normalizedBairro
            };

            const { error } = await supabase.from('routes').insert([payload]);
            if (error) throw error;

            setNewRouteName('');
            setNewRouteMunicipio('');
            setNewRouteBairro('');
            loadRouteData();
            alert('Rota cadastrada com sucesso!');
        } catch (error: any) {
            alert('Erro ao adicionar rota: ' + error.message);
        }
    };

    const handleDeleteRoute = async (id: number) => {
        if (!confirm('Tem certeza que deseja excluir esta rota?')) return;

        try {
            const { error } = await supabase.from('routes').delete().eq('id', id);
            if (error) throw error;
            loadRouteData();
        } catch (error: any) {
            alert('Erro ao excluir rota: ' + error.message);
        }
    };

    const startEditingRoute = (route: any) => {
        setEditingRouteId(route.id);
        setEditingRouteName(route.name);
    };

    const cancelEditingRoute = () => {
        setEditingRouteId(null);
        setEditingRouteName('');
    };

    const saveEditedRoute = async () => {
        if (!editingRouteName.trim() || !editingRouteId) return;

        try {
            const { error } = await supabase.from('routes').update({ name: editingRouteName.trim().toUpperCase() }).eq('id', editingRouteId);
            if (error) throw error;

            cancelEditingRoute();
            loadRouteData();
        } catch (error: any) {
            alert('Erro ao atualizar rota: ' + error.message);
        }
    };

    const saveRouteCosts = async () => {
        const updates = Object.entries(routeCosts).map(([route, cost]) => ({
            route,
            cost,
            updated_at: new Date()
        }));

        const { error } = await supabase.from('route_costs').upsert(updates);
        if (error) {
            console.error('Error saving costs:', error);
            alert('Erro ao salvar custos das rotas. Verifique se a tabela route_costs foi criada.');
        } else {
            alert('Custos das rotas salvos com sucesso!');
        }
    };

    const handleDownloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet([
            { "Município": "Campos dos Goytacazes", "Bairro": "Centro", "Rota": "A" },
            { "Município": "Campos dos Goytacazes", "Bairro": "Goitacazes", "Rota": "B" }
        ]);
        XLSX.utils.book_append_sheet(wb, ws, "Modelo");
        XLSX.writeFile(wb, "template_rotas.xlsx");
    };

    const handleImportXLSX = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);

                if (!jsonData || jsonData.length === 0) {
                    alert('Nenhum dado encontrado no arquivo.');
                    return;
                }

                // Carregar dados atuais para validação
                const { data: currentDbData } = await supabase.from('routes').select('municipio, bairro');
                const existingSet = new Set(currentDbData?.map((r: any) => `${r.municipio}|${r.bairro}`) || []);

                const rowsToInsert: any[] = [];
                const rejected: string[] = [];

                jsonData.forEach((row: any) => {
                    const municipio = (row['Município'] || row['município'] || row['Municipio'] || row['municipio'])?.trim().toUpperCase();
                    const bairro = (row['Bairro'] || row['bairro'])?.trim().toUpperCase();
                    let rota = (row['Rotas'] || row['Rota'] || row['rota'] || row['rotas'])?.trim().toUpperCase();

                    if (!municipio || !bairro || !rota) return;

                    if (rota && rota.startsWith('ROTA ')) {
                        rota = rota.replace('ROTA ', '').trim();
                    }

                    const key = `${municipio}|${bairro}`;

                    if (existingSet.has(key)) {
                        rejected.push(`${municipio} - ${bairro} (Já existente)`);
                    } else {
                        // Verifica duplicidade no próprio arquivo
                        const fileDuplicate = rowsToInsert.find(r => r.municipio === municipio && r.bairro === bairro);
                        if (fileDuplicate) {
                            rejected.push(`${municipio} - ${bairro} (Duplicado no arquivo)`);
                        } else {
                            rowsToInsert.push({
                                municipio,
                                bairro,
                                name: rota
                            });
                        }
                    }
                });

                if (rowsToInsert.length > 0) {
                    const { error } = await supabase.from('routes').insert(rowsToInsert);
                    if (error) throw error;
                    loadRouteData();
                }

                let message = `Processamento concluído!\n\nInseridos: ${rowsToInsert.length}`;
                if (rejected.length > 0) {
                    message += `\nRejeitados: ${rejected.length}\n\nDetalhes (primeiros 10):\n${rejected.slice(0, 10).join('\n')}`;
                    if (rejected.length > 10) message += `\n... e mais ${rejected.length - 10} itens.`;
                }

                alert(message);
            } catch (err: any) {
                console.error(err);
                alert('Erro ao processar arquivo: ' + err.message);
            }
        };
        reader.readAsBinaryString(file);
        event.target.value = '';
    };

    const saveSettings = () => {
        localStorage.setItem('sla_max_dias_uteis', String(slaMax));
        localStorage.setItem('sla_phase_params', JSON.stringify(slaParams));
        alert('Configurações salvas!');
    };

    return (
        <div className="animate-fade">
            <header className="header">
                <h1 className="title">Configurações</h1>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <section className="stat-card">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={20} color="var(--primary)" />
                        Regras de SLA
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <label className="stat-label">SLA Máximo Geral (Dias Úteis)</label>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <input
                                    type="number"
                                    className="input"
                                    value={slaMax}
                                    onChange={(e) => setSlaMax(Number(e.target.value))}
                                    style={{ width: '100px' }}
                                />
                                <button className="btn btn-primary" onClick={saveSettings}>
                                    <Save size={18} />
                                </button>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                Limite para o status geral do pedido ser "ATRASADO" (em dias úteis).
                            </p>
                        </div>

                        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)' }} />

                        <div>
                            <h3 style={{ fontSize: '0.875rem', marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Alertas por Fase (Horas desde Aprovação)
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                {[
                                    { label: 'Picking', key: 'sla_picking' },
                                    { label: 'Packing', key: 'sla_packing' },
                                    { label: 'Disp. Faturamento', key: 'sla_disponivel' },
                                    { label: 'Transporte', key: 'sla_despachado' },
                                    { label: 'Entregue', key: 'sla_entregue' },
                                ].map((item) => (
                                    <div key={item.key}>
                                        <label className="stat-label" style={{ fontSize: '0.75rem' }}>{item.label}</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={slaParams[item.key as keyof typeof slaParams] || ''}
                                            onChange={(e) => setSlaParams({ ...slaParams, [item.key]: Number(e.target.value) })}
                                            style={{ marginTop: '0.25rem' }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={saveSettings}>
                                <Save size={18} style={{ marginRight: '0.5rem' }} /> Salvar Parâmetros
                            </button>
                        </div>
                    </div>
                </section>

                <section className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={20} color="var(--primary)" />
                            Feriados
                        </h2>
                        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                            <RefreshCw size={14} />
                            Sincronizar API
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <input
                            type="date"
                            className="input"
                            value={newHoliday.data}
                            onChange={(e) => setNewHoliday({ ...newHoliday, data: e.target.value })}
                        />
                        <input
                            type="text"
                            className="input"
                            placeholder="Descrição"
                            value={newHoliday.descricao}
                            onChange={(e) => setNewHoliday({ ...newHoliday, descricao: e.target.value })}
                        />
                        <button className="btn btn-primary" onClick={handleAddHoliday}>
                            <Plus size={18} />
                        </button>
                    </div>

                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <table style={{ background: 'transparent' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr>
                                    <th>Data</th>
                                    <th>Descrição</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {holidays.map((h) => (
                                    <tr key={h.id}>
                                        <td>{new Date(h.data).toLocaleDateString('pt-BR')}</td>
                                        <td>{h.descricao}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                onClick={() => handleDeleteHoliday(h.id)}
                                                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <div style={{ marginTop: '2rem' }}>
                <section className="stat-card">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <MapPin size={20} color="var(--primary)" />
                        Mapeamento de Rotas por Localidade
                    </h2>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'end' }}>
                        <div>
                            <label className="stat-label" style={{ fontSize: '0.75rem' }}>Município</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Ex: Campos"
                                value={newRouteMunicipio}
                                onChange={(e) => setNewRouteMunicipio(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="stat-label" style={{ fontSize: '0.75rem' }}>Bairro</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Ex: Centro"
                                value={newRouteBairro}
                                onChange={(e) => setNewRouteBairro(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="stat-label" style={{ fontSize: '0.75rem' }}>Rota</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Ex: A"
                                value={newRouteName}
                                onChange={(e) => setNewRouteName(e.target.value)}
                            />
                        </div>
                        <button className="btn btn-primary" onClick={handleAddRoute} style={{ height: '42px' }}>
                            <Plus size={18} /> Adicionar
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button className="btn btn-outline" onClick={handleDownloadTemplate} style={{ fontSize: '0.8rem' }}>
                            Baixar Modelo XLSX
                        </button>
                        <label className="btn btn-outline" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                            Importar XLSX
                            <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleImportXLSX} />
                        </label>
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <table style={{ background: 'transparent', width: '100%' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'var(--bg-card)' }}>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Município</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Bairro</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Rota</th>
                                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            placeholder="Filtrar..."
                                            value={filterMunicipio}
                                            onChange={e => setFilterMunicipio(e.target.value)}
                                            className="input"
                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}
                                        />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            placeholder="Filtrar..."
                                            value={filterBairro}
                                            onChange={e => setFilterBairro(e.target.value)}
                                            className="input"
                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}
                                        />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            placeholder="Filtrar..."
                                            value={filterRota}
                                            onChange={e => setFilterRota(e.target.value)}
                                            className="input"
                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto' }}
                                        />
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                                        <button
                                            onClick={() => {
                                                setFilterMunicipio('');
                                                setFilterBairro('');
                                                setFilterRota('');
                                            }}
                                            className="btn btn-outline"
                                            style={{ padding: '0.25rem 0.5rem', height: 'auto', fontSize: '0.75rem' }}
                                            title="Limpar Filtros"
                                        >
                                            <X size={14} />
                                        </button>
                                    </td>
                                </tr>
                                {dbRoutes.length === 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Nenhum mapeamento cadastrado.
                                        </td>
                                    </tr>
                                )}
                                {dbRoutes.filter(route => {
                                    if (filterMunicipio && !route.municipio?.toLowerCase().includes(filterMunicipio.toLowerCase())) return false;
                                    if (filterBairro && !route.bairro?.toLowerCase().includes(filterBairro.toLowerCase())) return false;
                                    if (filterRota && !route.name?.toLowerCase().includes(filterRota.toLowerCase())) return false;
                                    return true;
                                }).map((route) => (
                                    <tr key={route.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.5rem' }}>{route.municipio || '-'}</td>
                                        <td style={{ padding: '0.5rem' }}>{route.bairro || '-'}</td>
                                        <td style={{ padding: '0.5rem' }}>
                                            {editingRouteId === route.id ? (
                                                <input
                                                    className="input"
                                                    value={editingRouteName}
                                                    onChange={(e) => setEditingRouteName(e.target.value)}
                                                    autoFocus
                                                />
                                            ) : (
                                                route.name
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                {editingRouteId === route.id ? (
                                                    <>
                                                        <button
                                                            onClick={saveEditedRoute}
                                                            className="btn btn-primary"
                                                            style={{ padding: '0.25rem 0.5rem', height: 'auto' }}
                                                            title="Salvar"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                        <button
                                                            onClick={cancelEditingRoute}
                                                            className="btn btn-outline"
                                                            style={{ padding: '0.25rem 0.5rem', height: 'auto' }}
                                                            title="Cancelar"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => startEditingRoute(route)}
                                                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                                            title="Editar Rota"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteRoute(route.id)}
                                                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <div style={{ marginTop: '2rem' }}>
                <section className="stat-card">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <DollarSign size={20} color="var(--primary)" />
                        Custos de Entrega por Rota
                    </h2>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                        {routes.map(route => (
                            <div key={route}>
                                <label className="stat-label" style={{ fontSize: '0.75rem' }}>Rota {route}</label>
                                <div style={{ position: 'relative', marginTop: '0.25rem' }}>
                                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>R$</span>
                                    <input
                                        type="number"
                                        className="input"
                                        style={{ paddingLeft: '2rem' }}
                                        value={routeCosts[route] || ''}
                                        onChange={(e) => setRouteCosts({ ...routeCosts, [route]: Number(e.target.value) })}
                                        placeholder="0,00"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '200px' }} onClick={saveRouteCosts}>
                        <Save size={18} style={{ marginRight: '0.5rem' }} /> Salvar Custos
                    </button>
                </section>
            </div>

            <div style={{ marginTop: '2rem' }}>
                <section className="stat-card" style={{ borderColor: 'var(--danger)' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
                        <Trash2 size={20} />
                        Zona de Perigo
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        Ações irreversíveis que afetam todos os dados do sistema.
                    </p>

                    <button
                        className="btn btn-primary"
                        style={{
                            backgroundColor: 'var(--danger)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                        onClick={async () => {
                            if (window.confirm('TEM CERTEZA? Isso apagará TODOS os pedidos importados e histórico. Essa ação não pode ser desfeita.')) {
                                try {
                                    // Delete in order to avoid FK constraints if they exist
                                    await supabase.from('raw_xlsx').delete().neq('id', 0); // Delete all
                                    await supabase.from('raw_csv').delete().neq('id', 0); // Delete all
                                    await supabase.from('imports').delete().neq('id', 0); // Delete all
                                    await supabase.from('pedidos_consolidados').delete().neq('id', 0); // Delete all
                                    alert('Todos os dados foram limpos com sucesso.');
                                    window.location.reload();
                                } catch (error: any) {
                                    alert('Erro ao limpar dados: ' + error.message);
                                }
                            }
                        }}
                    >
                        <Trash2 size={18} />
                        Limpar Todas as Importações e Pedidos
                    </button>
                </section>
            </div>
        </div>
    );
}
