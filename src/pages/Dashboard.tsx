import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import {
    Package,
    CheckCircle2,
    Clock,
    AlertTriangle,
} from 'lucide-react';
import { checkPhaseSLAs } from '../lib/utils';

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        const { data: pedidos, error } = await supabase
            .from('pedidos_consolidados')
            .select('*');
        // .neq('fase_atual', 'Cancelado'); // We can filter in memory or query to be safe

        if (error) {
            console.error(error);
            return;
        }

        // All orders from the database
        const activePedidos = pedidos || [];

        // Process stats
        const { data: holidaysData } = await supabase.from('feriados').select('data');
        const holidays = (holidaysData || []).map(h => h.data);

        const savedParams = localStorage.getItem('sla_phase_params');
        const slaParams = savedParams ? JSON.parse(savedParams) : null;

        const phaseOrder = ['Aprovado', 'Picking', 'Packing', 'Disponível para faturamento', 'Transporte', 'Entregue'];
        const phaseCounts = phaseOrder.map(phase => ({
            name: phase,
            value: activePedidos.filter(p => p.fase_atual === phase).length
        }));

        const analyzedPedidos = activePedidos.map(p => ({
            ...p,
            is_dynamic_late: checkPhaseSLAs(p, slaParams, holidays).length > 0 || p.sla_status === 'ATRASADO'
        }));

        // Filter delivered orders without external code (Omni)
        const deliveredNonOmni = analyzedPedidos.filter(p =>
            p.fase_atual === 'Entregue' && !p.pedido_id_externo
        );

        const deliveredOnTime = deliveredNonOmni.filter(p => !p.is_dynamic_late).length;
        const deliveredLate = deliveredNonOmni.filter(p => p.is_dynamic_late).length;
        const totalDelivered = deliveredNonOmni.length;

        const onTime = analyzedPedidos.filter(p => !p.is_dynamic_late).length;
        const late = analyzedPedidos.filter(p => p.is_dynamic_late).length;

        const ranges = [
            { name: '1-2 dias', value: analyzedPedidos.filter(p => p.dias_uteis_desde_aprovacao <= 2 && p.is_dynamic_late).length },
            { name: '3-5 dias', value: analyzedPedidos.filter(p => p.dias_uteis_desde_aprovacao > 2 && p.dias_uteis_desde_aprovacao <= 5 && p.is_dynamic_late).length },
            { name: '> 5 dias', value: analyzedPedidos.filter(p => p.dias_uteis_desde_aprovacao > 5 && p.is_dynamic_late).length },
        ];

        setStats({
            total: activePedidos.length,
            phaseCounts,
            onTime,
            late,
            ranges,
            deliveredOnTime,
            deliveredLate,
            totalDelivered,
            deliveredOnTimeRate: totalDelivered > 0 ? ((deliveredOnTime / totalDelivered) * 100).toFixed(1) : '0.0',
            deliveredLateRate: totalDelivered > 0 ? ((deliveredLate / totalDelivered) * 100).toFixed(1) : '0.0',
            onTimeRate: ((onTime / (activePedidos.length || 1)) * 100).toFixed(1),
            avgLeadTime: (activePedidos.reduce((acc, p) => acc + (p.dias_uteis_desde_aprovacao || 0), 0) / (activePedidos.length || 1)).toFixed(1)
        });
        setLoading(false);
    };

    if (loading) return <div className="animate-fade">Carregando...</div>;


    return (
        <div className="animate-fade">
            <header className="header">
                <h1 className="title">Monitor de Operações</h1>
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
                        <span className="stat-label">No Prazo (SLA)</span>
                        <CheckCircle2 size={20} color="var(--success)" />
                    </div>
                    <span className="stat-value">{stats.onTimeRate}%</span>
                </div>
                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="stat-label">Atrasados</span>
                        <AlertTriangle size={20} color="var(--danger)" />
                    </div>
                    <span className="stat-value" color="var(--danger)">{stats.late}</span>
                </div>
                <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="stat-label">Lead Time Médio</span>
                        <Clock size={20} color="var(--warning)" />
                    </div>
                    <span className="stat-value">{stats.avgLeadTime} dias</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="stat-card" style={{ height: '400px' }}>
                    <h3 className="stat-label" style={{ marginBottom: '1rem' }}>Pedidos por Fase</h3>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart data={stats.phaseCounts}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => v.split(' ')[0]} />
                            <YAxis stroke="var(--text-muted)" fontSize={12} />
                            <Tooltip
                                contentStyle={{ background: '#0f172a', border: '1px solid var(--border)', borderRadius: '8px' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="stat-card" style={{ height: '400px' }}>
                    <h3 className="stat-label" style={{ marginBottom: '1rem' }}>Compliance SLA - Entregues (Exceto Omni)</h3>
                    <ResponsiveContainer width="100%" height="90%">
                        <PieChart>
                            <Pie
                                data={[
                                    { name: 'No Prazo', value: stats.deliveredOnTime },
                                    { name: 'Atrasado', value: stats.deliveredLate }
                                ]}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                                label={({ percent }) => percent ? `${(percent * 100).toFixed(1)}%` : ''}
                                labelLine={false}
                            >
                                <Cell fill="var(--success)" />
                                <Cell fill="var(--danger)" />
                            </Pie>
                            <Tooltip
                                contentStyle={{ background: '#0f172a', border: '1px solid var(--border)', borderRadius: '8px' }}
                            />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
