import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import {
    Package,
    CheckCircle2,
    AlertTriangle,
    BarChart3,
    Calendar,
    Users
} from 'lucide-react';
import { checkPhaseSLAs, calculateBusinessDays } from '../lib/utils';

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [routesMap, setRoutesMap] = useState<Record<string, string>>({});

    useEffect(() => {
        const init = async () => {
            const map = await fetchRoutes();
            await fetchStats(map);
        };
        init();
    }, []);

    const fetchRoutes = async () => {
        try {
            const response = await fetch('https://docs.google.com/spreadsheets/d/1dTljUAvscAY-PpaiCkGnUK_ikgcB0S2Xzi2cK8I-GJM/export?format=csv&gid=0');
            const text = await response.text();
            const lines = text.split('\n');
            const map: Record<string, string> = {};
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line) continue;
                const cols = line.split(',');
                if (cols.length >= 5) {
                    const rawName = cols[1];
                    const rawRota = cols[4];
                    if (rawName && rawRota) {
                        const normalizedName = rawName.replace(/\*/g, '').trim().toUpperCase();
                        map[normalizedName] = rawRota.trim();
                    }
                }
            }
            setRoutesMap(map);
            return map;
        } catch (e) {
            console.error("Error fetching routes:", e);
            return {};
        }
    };

    const fetchStats = async (rMap: Record<string, string> = routesMap) => {
        setLoading(true);

        let allPedidos: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('pedidos_consolidados')
                .select('*')
                .range(from, from + pageSize - 1);

            if (error) {
                console.error(error);
                break;
            }

            if (data && data.length > 0) {
                allPedidos = [...allPedidos, ...data];
                from += pageSize;
                hasMore = data.length === pageSize;
            } else {
                hasMore = false;
            }
        }

        const activePedidos = allPedidos;
        const { data: holidaysData } = await supabase.from('feriados').select('data');
        const holidays = (holidaysData || []).map(h => h.data);
        const savedParams = localStorage.getItem('sla_phase_params');
        const slaParams = savedParams ? JSON.parse(savedParams) : null;

        // PHASES COUNT
        const phaseNames = ['Aprovado', 'Picking', 'Packing', 'Disponível para faturamento', 'Transporte', 'Entregue'];
        const phaseCounts = phaseNames.map(phase => ({
            name: phase,
            value: activePedidos.filter(p => p.fase_atual === phase).length
        }));

        // DELIVERY PERFORMANCE & ROUTES
        const routeStats: Record<string, { total: number, onTime: number, late: number }> = {};
        const deliveryDates: Record<string, number> = {};

        activePedidos.forEach(p => {
            const personName = p.nome_pessoa ? p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase() : '';
            const route = rMap[personName] || '-';

            if (!routeStats[route]) routeStats[route] = { total: 0, onTime: 0, late: 0 };

            // Re-calculate SLA based on 7 days rule for delivered or current dynamic SLA for others
            let isLate = false;
            if (p.aprovado_at) {
                const dStart = new Date(p.aprovado_at);
                const dEnd = p.entregue_at ? new Date(p.entregue_at) : new Date();
                dStart.setHours(0, 0, 0, 0);
                dEnd.setHours(0, 0, 0, 0);
                const days = Math.floor((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));

                const currentAlerts = checkPhaseSLAs(p, slaParams, holidays);
                isLate = currentAlerts.length > 0 || p.sla_status === 'ATRASADO' || days > 7;
            }

            // Total per route (includes all phases as per request "pedidos totais por rota")
            routeStats[route].total++;

            if (p.fase_atual === 'Entregue') {
                if (isLate) routeStats[route].late++;
                else routeStats[route].onTime++;

                if (p.entregue_at) {
                    const dateStr = new Date(p.entregue_at).toLocaleDateString('pt-BR');
                    deliveryDates[dateStr] = (deliveryDates[dateStr] || 0) + 1;
                }
            }
        });

        const globalDelivered = activePedidos.filter(p => p.fase_atual === 'Entregue');
        const globalDeliveredTotal = globalDelivered.length;
        const globalDeliveredLate = globalDelivered.filter(p => {
            if (!p.aprovado_at) return false;
            const dStart = new Date(p.aprovado_at);
            const dEnd = p.entregue_at ? new Date(p.entregue_at) : new Date();
            dStart.setHours(0, 0, 0, 0);
            dEnd.setHours(0, 0, 0, 0);
            const days = Math.floor((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));
            return days > 7;
        }).length;

        // SLA DAYS DISTRIBUTION
        const slaDistribution: Record<string, number> = {
            '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '>7': 0
        };

        globalDelivered.forEach(p => {
            if (p.aprovado_at && p.entregue_at) {
                const days = calculateBusinessDays(new Date(p.aprovado_at), new Date(p.entregue_at), holidays);
                if (days >= 1 && days <= 7) {
                    slaDistribution[String(days)]++;
                } else if (days > 7) {
                    slaDistribution['>7']++;
                } else {
                    // For 0 days (same day delivery), count as 1 or separate? 
                    // Usually same day is < 1, let's include in 1 for now or separate based on request. 
                    // Request has 1 to 7. Let's put 0 in 1.
                    slaDistribution['1']++;
                }
            }
        });

        const peakDay = Object.entries(deliveryDates).reduce((a, b) => a[1] > b[1] ? a : b, ['', 0]);

        setStats({
            total: activePedidos.length,
            phaseCounts,
            globalDeliveredTotal,
            globalDeliveredOnTime: globalDeliveredTotal - globalDeliveredLate,
            globalDeliveredLate,
            onTimeRate: globalDeliveredTotal > 0 ? (((globalDeliveredTotal - globalDeliveredLate) / globalDeliveredTotal) * 100).toFixed(1) : '0.0',
            lateRate: globalDeliveredTotal > 0 ? ((globalDeliveredLate / globalDeliveredTotal) * 100).toFixed(1) : '0.0',
            routeStats: Object.entries(routeStats).map(([name, s]) => ({
                name,
                ...s,
                rate: (s.onTime + s.late) > 0 ? ((s.onTime / (s.onTime + s.late)) * 100).toFixed(1) : '0.0'
            })).sort((a, b) => b.total - a.total), // Sort by total volume
            peakDay: peakDay[0] || '-',
            peakCount: peakDay[1] || 0,
            slaDistribution
        });
        setLoading(false);
    };

    if (loading) return <div className="animate-fade">Carregando Dashboard...</div>;

    return (
        <div className="animate-fade">
            <header className="header">
                <h1 className="title">Dashboard de Performance</h1>
            </header>

            <div className="dashboard-grid">
                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="stat-label">Total de Pedidos</span>
                        <Package size={20} color="var(--primary)" />
                    </div>
                    <span className="stat-value">{stats.total}</span>
                </div>
                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="stat-label">SLA Global (Entregues)</span>
                        <CheckCircle2 size={20} color="var(--success)" />
                    </div>
                    <span className="stat-value" style={{ color: 'var(--success)' }}>{stats.onTimeRate}%</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats.globalDeliveredOnTime} de {stats.globalDeliveredTotal} no prazo</p>
                </div>
                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="stat-label">Pico de Entrega</span>
                        <Calendar size={20} color="var(--warning)" />
                    </div>
                    <span className="stat-value">{stats.peakDay}</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats.peakCount} pedidos entregues</p>
                </div>
                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="stat-label">Entregues com Atraso</span>
                        <AlertTriangle size={20} color="var(--danger)" />
                    </div>
                    <span className="stat-value" style={{ color: 'var(--danger)' }}>{stats.globalDeliveredLate}</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats.lateRate}% do total entregue</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="stat-card" style={{ minHeight: '400px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <BarChart3 size={18} color="var(--primary)" />
                        <h3 className="stat-label" style={{ margin: 0 }}>Pedidos por Fase Atual</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.phaseCounts}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} interval={0} tickFormatter={(v) => v.length > 10 ? v.substring(0, 8) + '...' : v} />
                            <YAxis stroke="var(--text-muted)" fontSize={12} />
                            <Tooltip
                                contentStyle={{ background: '#0f172a', border: '1px solid var(--border)', borderRadius: '8px' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="stat-card" style={{ minHeight: '400px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Users size={18} color="var(--primary)" />
                        <h3 className="stat-label" style={{ margin: 0 }}>Quantidade de Pedidos por Rota</h3>
                    </div>
                    <div style={{ overflowY: 'auto', maxHeight: '300px' }}>
                        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Rota</th>
                                    <th style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Total</th>
                                    <th style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>SLA %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.routeStats.map((r: any) => (
                                    <tr key={r.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>{r.name}</td>
                                        <td style={{ padding: '0.75rem 0' }}>{r.total}</td>
                                        <td style={{ padding: '0.75rem 0' }}>
                                            <span style={{
                                                color: parseFloat(r.rate) > 90 ? 'var(--success)' : (parseFloat(r.rate) > 70 ? 'var(--warning)' : 'var(--danger)'),
                                                fontWeight: 700
                                            }}>
                                                {r.rate}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="stat-card" style={{ minHeight: '300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <CheckCircle2 size={18} color="var(--primary)" />
                        <h3 className="stat-label" style={{ margin: 0 }}>SLA de Entrega (Dias Úteis)</h3>
                    </div>
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-muted)' }}>Dias Úteis</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem 0', color: 'var(--text-muted)' }}>Qtd</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem 0', color: 'var(--text-muted)' }}>Percentual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {['1', '2', '3', '4', '5', '6', '7', '>7'].map(day => {
                                const count = stats.slaDistribution[day] || 0;
                                const total = stats.globalDeliveredTotal || 1; // Avoid div by 0
                                const percent = ((count / total) * 100).toFixed(2);
                                return (
                                    <tr key={day} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>{day === '>7' ? 'Acima de 7' : day}</td>
                                        <td style={{ textAlign: 'right', padding: '0.5rem 0' }}>{count}</td>
                                        <td style={{ textAlign: 'right', padding: '0.5rem 0' }}>{percent}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="stat-card" style={{ minHeight: '300px' }}>
                    <h3 className="stat-label" style={{ marginBottom: '1.5rem' }}>Proporção Global de Entregas</h3>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: 'No Prazo', value: stats.globalDeliveredOnTime },
                                        { name: 'Atrasado', value: stats.globalDeliveredLate }
                                    ]}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={90}
                                    paddingAngle={8}
                                    dataKey="value"
                                >
                                    <Cell fill="var(--success)" />
                                    <Cell fill="var(--danger)" />
                                </Pie>
                                <Tooltip
                                    contentStyle={{ background: '#0f172a', border: '1px solid var(--border)', borderRadius: '8px' }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>


        </div>
    );
}
