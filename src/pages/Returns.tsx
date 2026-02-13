import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, AlertTriangle } from 'lucide-react';
import { checkPhaseSLAs, fetchRoutesFromSheet } from '../lib/utils';
import OrderDetails from '../components/OrderDetails';

export default function ReturnsPage() {
    const [pedidos, setPedidos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [routesMap, setRoutesMap] = useState<Record<string, string>>({});
    const [slaParams, setSlaParams] = useState<any>(null);
    const [holidays, setHolidays] = useState<string[]>([]);
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        fetchReturns();
        fetchHolidays();
        fetchRoutes();
        const savedParams = localStorage.getItem('sla_phase_params');
        if (savedParams) setSlaParams(JSON.parse(savedParams));
    }, []);

    const fetchHolidays = async () => {
        const { data } = await supabase.from('feriados').select('data');
        if (data) setHolidays(data.map(h => h.data));
    };

    const fetchRoutes = async () => {
        const map = await fetchRoutesFromSheet();
        setRoutesMap(map);
    };

    const fetchReturns = async () => {
        setLoading(true);
        // Fetch orders present in order_overrides with status_manual = 'Devolução'
        const { data: overrides, error } = await supabase
            .from('order_overrides')
            .select('*')
            .eq('status_manual', 'Devolução');

        if (error) {
            console.error('Error fetching returns:', error);
            setLoading(false);
            return;
        }

        if (!overrides || overrides.length === 0) {
            setPedidos([]);
            setLoading(false);
            return;
        }

        const ids = overrides.map(o => o.pedido_id_interno);
        const overridesMap = new Map(overrides.map(o => [o.pedido_id_interno, o]));

        const { data: orders, error: ordersError } = await supabase
            .from('pedidos_consolidados')
            .select('*')
            .in('pedido_id_interno', ids);

        if (ordersError) {
            console.error(ordersError);
        }

        if (orders) {
            // Check if resolution column exists in overrides, if not it will be undefined, handling that carefully
            const merged = orders.map(o => ({
                ...o,
                resolution: overridesMap.get(o.pedido_id_interno)?.resolution || null
            }));
            setPedidos(merged);
        }
        setLoading(false);
    };

    const handleResolutionChange = async (pedidoId: string, newValue: 'Cancelado' | 'Reentrega' | null) => {
        setUpdating(pedidoId);
        try {
            // Update the resolution column
            const { error } = await supabase
                .from('order_overrides')
                .update({ resolution: newValue })
                .eq('pedido_id_interno', pedidoId);

            if (error) throw error;

            // Update local state
            setPedidos(prev => prev.map(p =>
                p.pedido_id_interno === pedidoId ? { ...p, resolution: newValue } : p
            ));

        } catch (e) {
            console.error(e);
            alert('Erro ao atualizar resolução');
        } finally {
            setUpdating(null);
        }
    };

    const filtered = pedidos.filter(p => {
        const matchesSearch =
            p.pedido_id_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.pedido_id_externo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.nome_pessoa?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    const formatDate = (date: string) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('pt-BR');
    };

    return (
        <div className="animate-fade">
            <header className="header">
                <h1 className="title">Devoluções</h1>
                <div style={{ position: 'relative', width: '300px' }}>
                    <Search
                        size={18}
                        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                    />
                    <input
                        type="text"
                        className="input"
                        placeholder="Buscar devolução..."
                        style={{ paddingLeft: '2.5rem' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>ID Interno</th>
                            <th>Omni</th>
                            <th>Rota</th>
                            <th>Cliente</th>
                            <th>Fase Atual</th>
                            <th>Aprovado em</th>
                            <th>Entregue em</th>
                            <th>Dias Úteis</th>
                            <th>SLA</th>
                            <th>Motorista</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p) => {
                            const dStart = p.aprovado_at ? new Date(p.aprovado_at) : null;
                            let dEnd = new Date();
                            if (p.entregue_at) {
                                dEnd = new Date(p.entregue_at);
                            }

                            let days: number | '-' = '-';
                            if (dStart) {
                                const s = new Date(dStart);
                                const e = new Date(dEnd);
                                s.setHours(0, 0, 0, 0);
                                e.setHours(0, 0, 0, 0);
                                days = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
                            }

                            const currentAlerts = checkPhaseSLAs(p, slaParams, holidays);
                            const isLate = currentAlerts.length > 0 || p.sla_status === 'ATRASADO' || (typeof days === 'number' && days > 7);
                            const personName = p.nome_pessoa ? p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase() : '';
                            const route = routesMap[personName] || '-';

                            const isCancelado = p.resolution === 'Cancelado';
                            const isReentrega = p.resolution === 'Reentrega';

                            return (
                                <tr key={p.id}>
                                    <td style={{ fontWeight: 600 }}>{p.pedido_id_interno}</td>
                                    <td>
                                        {p.pedido_id_externo && (
                                            <span style={{
                                                color: '#10b981',
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                SIM
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{route}</span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span>{p.nome_pessoa}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {p.municipio_uf || '-'}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            background: 'rgba(255,255,255,0.05)',
                                            fontSize: '0.75rem',
                                            border: isLate ? '1px solid var(--danger)' : 'none',
                                            color: isLate ? 'var(--danger)' : 'inherit'
                                        }}>
                                            {p.fase_atual}
                                        </span>
                                    </td>
                                    <td>{formatDate(p.aprovado_at)}</td>
                                    <td>{p.entregue_at ? new Date(p.entregue_at).toLocaleDateString('pt-BR') : '-'}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            {days}
                                            {isLate && <AlertTriangle size={12} color="var(--danger)" />}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`sla-badge ${isLate ? 'late' : 'on-time'}`}>
                                            {isLate
                                                ? (p.fase_atual === 'Entregue'
                                                    ? (p.entregue_at ? 'ENTREGUE COM ATRASO' : 'SEM ENTREGA')
                                                    : 'ATRASADO')
                                                : 'NO PRAZO'}
                                        </span>
                                    </td>
                                    <td>{p.motorista || p.transportadora || '-'}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isCancelado}
                                                    disabled={updating === p.pedido_id_interno}
                                                    onChange={() => handleResolutionChange(p.pedido_id_interno, isCancelado ? null : 'Cancelado')}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <span style={{ color: isCancelado ? 'var(--danger)' : 'var(--text-muted)' }}>Cancelar</span>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isReentrega}
                                                    disabled={updating === p.pedido_id_interno}
                                                    onChange={() => handleResolutionChange(p.pedido_id_interno, isReentrega ? null : 'Reentrega')}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <span style={{ color: isReentrega ? 'var(--primary)' : 'var(--text-muted)' }}>Reentrega</span>
                                            </label>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && !loading && (
                            <tr>
                                <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                    Nenhuma devolução encontrada.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {selectedOrder && (
                <OrderDetails
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                />
            )}
        </div>
    );
}
