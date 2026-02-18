import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    DollarSign,
    Calendar,
    Package,
    TrendingUp,
    MapPin,
    RefreshCw,
    AlertTriangle,
} from 'lucide-react';

interface AggregatedRoute {
    route: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
}

// Fetches ALL rows from a table/query by paginating in chunks to bypass 1000-row limit
async function fetchAllRows(
    query: any,
    chunkSize = 1000
): Promise<any[]> {
    let allRows: any[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await query.range(from, from + chunkSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < chunkSize) break;
        from += chunkSize;
    }
    return allRows;
}

export default function CostsPage() {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [aggregatedData, setAggregatedData] = useState<AggregatedRoute[]>([]);
    const [totalCost, setTotalCost] = useState(0);
    const [totalOrders, setTotalOrders] = useState(0);

    useEffect(() => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setStartDate(firstDay.toISOString().split('T')[0]);
        setEndDate(lastDay.toISOString().split('T')[0]);
    }, []);

    useEffect(() => {
        if (startDate && endDate) {
            fetchData();
        }
    }, [startDate, endDate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Routes mapping
            const { data: routesData, error: routesErr } = await supabase
                .from('routes')
                .select('municipio, bairro, name');
            if (routesErr) throw routesErr;

            const routeLookup = new Map<string, string>();
            routesData?.forEach(r => {
                if (r.municipio && r.bairro) {
                    const key = `${r.municipio.trim().toUpperCase()} - ${r.bairro.trim().toUpperCase()}`;
                    routeLookup.set(key, r.name);
                }
            });

            // 2. Route costs
            const { data: costsData, error: costsErr } = await supabase
                .from('route_costs')
                .select('route, cost');
            if (costsErr) throw costsErr;

            const costLookup = new Map<string, number>();
            costsData?.forEach(c => {
                costLookup.set(c.route, Number(c.cost));
            });

            // 3. Fetch ALL consolidated orders
            const ordersData = await fetchAllRows(
                supabase
                    .from('pedidos_consolidados')
                    .select('municipio, bairro, fase_atual, situacao, data_arquivo')
                    .gte('data_arquivo', `${startDate}T00:00:00`)
                    .lte('data_arquivo', `${endDate}T23:59:59`)
            );

            // 4. Aggregate by route
            const aggregation = new Map<string, AggregatedRoute>();
            let grandTotalCost = 0;
            let grandTotalOrders = 0;

            ordersData.forEach(order => {
                const status = (order.fase_atual || '').toLowerCase();
                const situacao = (order.situacao || '').toLowerCase();

                if (status.includes('aguardando motorista') || status.includes('aguardando geração')) return;
                if (situacao.includes('aguardando motorista') || situacao.includes('aguardando geração')) return;
                if (status === 'cancelado') return;

                const muni = (order.municipio || '').trim().toUpperCase();
                const bair = (order.bairro || '').trim().toUpperCase();
                const key = `${muni} - ${bair}`;

                const routeName = routeLookup.get(key) || 'Sem Rota Definida';
                const unitCost = costLookup.get(routeName) || 0;

                const existing = aggregation.get(routeName) || {
                    route: routeName,
                    quantity: 0,
                    unit_cost: unitCost,
                    total_cost: 0,
                };

                existing.quantity += 1;
                existing.total_cost += unitCost;
                aggregation.set(routeName, existing);

                grandTotalOrders += 1;
                grandTotalCost += unitCost;
            });

            const sortedData = Array.from(aggregation.values()).sort((a, b) =>
                a.route.localeCompare(b.route)
            );

            setAggregatedData(sortedData);
            setTotalCost(grandTotalCost);
            setTotalOrders(grandTotalOrders);
        } catch (error) {
            console.error('Error fetching costs data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    return (
        <div className="main-content">
            <div className="header">
                <div>
                    <h1 className="title">Gestão de Custos</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        Acompanhamento financeiro detalhado por rota de entrega
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                        <Calendar size={18} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Período</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <input
                            type="date"
                            className="input"
                            style={{ width: 'auto' }}
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span style={{ color: 'var(--text-muted)' }}>até</span>
                        <input
                            type="date"
                            className="input"
                            style={{ width: 'auto' }}
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={fetchData}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            <span>Atualizar</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* KPI Section using dashboard-grid and stat-card */}
            <div className="dashboard-grid">
                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="stat-label">TOTAL DE PEDIDOS</div>
                        <Package size={20} color="var(--primary)" />
                    </div>
                    <div className="stat-value">{totalOrders.toLocaleString('pt-BR')}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>pedidos no período</div>
                </div>

                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="stat-label">CUSTO MÉDIO</div>
                        <TrendingUp size={20} color="var(--warning)" />
                    </div>
                    <div className="stat-value">
                        {totalOrders > 0 ? formatCurrency(totalCost / totalOrders) : 'R$ 0,00'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>por pedido entregue</div>
                </div>

                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="stat-label">CUSTO TOTAL</div>
                        <DollarSign size={20} color="var(--success)" />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--success)' }}>
                        {formatCurrency(totalCost)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>custo operacional total</div>
                </div>
            </div>

            <div style={{ marginTop: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <MapPin size={20} color="var(--text-muted)" />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Detalhamento por Rota</h2>
                    <span style={{
                        marginLeft: 'auto',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        background: 'var(--border)',
                        padding: '2px 8px',
                        borderRadius: '999px'
                    }}>
                        {aggregatedData.length} rotas
                    </span>
                </div>

                {loading ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
                        <p>Carregando dados...</p>
                    </div>
                ) : aggregatedData.length === 0 ? (
                    <div className="table-container" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <AlertTriangle size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                        <p>Nenhum dado encontrado para o período selecionado.</p>
                    </div>
                ) : (
                    <div className="dashboard-grid">
                        {aggregatedData.map((item, idx) => (
                            <div key={idx} className="stat-card" style={{
                                borderLeft: item.route === 'Sem Rota Definida' ? '4px solid var(--danger)' : '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div style={{
                                        fontSize: '0.625rem',
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                        background: 'rgba(255,255,255,0.05)',
                                        padding: '2px 6px',
                                        borderRadius: '4px'
                                    }}>
                                        #{idx + 1}
                                    </div>
                                    <MapPin size={16} color={item.route === 'Sem Rota Definida' ? 'var(--danger)' : 'var(--primary)'} />
                                </div>

                                <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: item.route === 'Sem Rota Definida' ? 'var(--danger)' : 'var(--text-main)' }}>
                                    {item.route}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PEDIDOS</span>
                                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{item.quantity}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>UNITÁRIO</span>
                                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{formatCurrency(item.unit_cost)}</span>
                                    </div>
                                    <div style={{
                                        marginTop: '0.5rem',
                                        paddingTop: '0.75rem',
                                        borderTop: '1px solid var(--border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CUSTO TOTAL</span>
                                        <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)' }}>
                                            {formatCurrency(item.total_cost)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
