import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, DollarSign, Calculator } from 'lucide-react';
import { fetchRoutesFromSheet } from '../lib/utils';

// Helper to format currency
const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

interface RouteCostData {
    route: string;
    count: number;
    unitCost: number;
    totalCost: number;
}

export default function CostPerRoutePanel() {
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [data, setData] = useState<RouteCostData[]>([]);
    const [totalGeneral, setTotalGeneral] = useState(0);

    // Initialize date range to current month
    useEffect(() => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        setStartDate(firstDay.toISOString().split('T')[0]);
        setEndDate(lastDay.toISOString().split('T')[0]);
    }, []);

    // Fetch data whenever date range changes
    useEffect(() => {
        if (startDate && endDate) {
            fetchData();
        }
    }, [startDate, endDate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Route Map from Google Sheet (Fallback for missing DB data)
            const routesMap = await fetchRoutesFromSheet();

            // 2. Fetch Route Costs (Reference Table)
            const { data: costsData, error: costsError } = await supabase
                .from('route_costs')
                .select('route, cost');

            if (costsError) throw costsError;

            // Map: Route Name -> Cost
            const costsRefMap = new Map<string, number>();
            costsData?.forEach(item => {
                costsRefMap.set(item.route.trim().toUpperCase(), Number(item.cost));
            });

            // 3. Fetch Delivered Orders within Range
            // Note: We use 'entregue_at' to determine if it falls in the period
            const { data: ordersData, error: ordersError } = await supabase
                .from('pedidos_consolidados')
                .select('rota, nome_pessoa, entregue_at') // Fetch name for lookup
                .eq('fase_atual', 'Entregue')
                .gte('entregue_at', `${startDate}T00:00:00`)
                .lte('entregue_at', `${endDate}T23:59:59`);

            if (ordersError) throw ordersError;

            // 4. Aggregate
            // Logic: Count orders per Route. If no route in DB, try to find in GoogleMap via Person Name.
            const aggregation = new Map<string, number>();

            ordersData?.forEach((order: any) => {
                let routeName = (order.rota || '').trim().toUpperCase();

                // If DB route is empty, try looking up via Person Name (same logic as existing Dashboard)
                if (!routeName && order.nome_pessoa) {
                    const cleanName = order.nome_pessoa.replace(/\*/g, '').trim().toUpperCase();
                    if (routesMap[cleanName]) {
                        routeName = routesMap[cleanName];
                    }
                }

                if (!routeName) routeName = 'SEM ROTA';

                aggregation.set(routeName, (aggregation.get(routeName) || 0) + 1);
            });

            // 5. Build Result
            const result: RouteCostData[] = [];
            let grandTotal = 0;

            aggregation.forEach((count, route) => {
                // Find cost in DB table. Handle case sensitivity
                const unitCost = costsRefMap.get(route) || 0;
                const totalCost = count * unitCost;

                result.push({
                    route,
                    count,
                    unitCost,
                    totalCost
                });
                grandTotal += totalCost;
            });

            // Sort by Total Cost descending
            result.sort((a, b) => b.totalCost - a.totalCost);

            setData(result);
            setTotalGeneral(grandTotal);

        } catch (error) {
            console.error('Error fetching cost data:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="stat-card" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <DollarSign size={18} color="var(--primary)" />
                    <h3 className="stat-label" style={{ margin: 0 }}>Custo por Rota</h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--background)', padding: '0.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <Calendar size={14} color="var(--text-muted)" />
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.8rem', outline: 'none' }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>até</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.8rem', outline: 'none' }}
                    />
                </div>
            </div>

            {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Carregando custos...
                </div>
            ) : (
                <>
                    <div style={{ overflowY: 'auto', maxHeight: '300px', flex: 1 }}>
                        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 10 }}>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Rota</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>Qtd</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Valor Unit.</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Nenhuma entrega no período selecionado.
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((row) => (
                                        <tr key={row.route} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{row.route}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>{row.count}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                {formatCurrency(row.unitCost)}
                                            </td>
                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>
                                                {formatCurrency(row.totalCost)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{
                        marginTop: '1rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calculator size={16} color="var(--primary)" />
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Custo Total do Período</span>
                        </div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                            {formatCurrency(totalGeneral)}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}
