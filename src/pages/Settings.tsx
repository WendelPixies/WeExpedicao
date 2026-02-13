import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, Plus, Trash2, Save, RefreshCw, DollarSign } from 'lucide-react';
import { fetchRoutesFromSheet } from '../lib/utils';

export default function Settings() {
    const [holidays, setHolidays] = useState<any[]>([]);
    const [slaMax, setSlaMax] = useState(5);
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
    const [routeCosts, setRouteCosts] = useState<Record<string, number>>({});

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
        const map = await fetchRoutesFromSheet();
        const uniqueRoutes = Array.from(new Set(Object.values(map))).sort();
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
