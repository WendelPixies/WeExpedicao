import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Truck, XCircle } from 'lucide-react';
import { fetchRoutesFromSheet } from '../lib/utils';
import OrderDetails from '../components/OrderDetails';

export default function ReturnsPage() {
    const [pedidos, setPedidos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [routesMap, setRoutesMap] = useState<Record<string, string>>({});
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        fetchReturns();
        fetchRoutes();
    }, []);

    const fetchRoutes = async () => {
        const map = await fetchRoutesFromSheet();
        setRoutesMap(map);
    };

    const fetchReturns = async () => {
        setLoading(true);
        // Fetch orders present in order_overrides with status_manual = 'Devolução'
        // AND fetch their data from consolidated

        // Since we can't do a join easily across these, we'll fetch overrides first
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

        const { data: orders, error: ordersError } = await supabase
            .from('pedidos_consolidados')
            .select('*')
            .in('pedido_id_interno', ids);

        if (ordersError) {
            console.error(ordersError);
        }

        if (orders) {
            // Merge override data if needed, though mostly we just need the order data
            setPedidos(orders);
        }
        setLoading(false);
    };

    const handleAction = async (pedidoId: string, action: 'Cancelado' | 'Reentrega') => {
        setActionLoading(pedidoId);
        try {
            if (action === 'Cancelado') {
                // Update override to 'Cancelado'
                // This means Import.tsx logic will filter it out or mark it as Cancelado
                await supabase
                    .from('order_overrides')
                    .update({ status_manual: 'Cancelado' })
                    .eq('pedido_id_interno', pedidoId);

                // Optionally update local state to remove from list immediately
                setPedidos(prev => prev.filter(p => p.pedido_id_interno !== pedidoId));
            } else if (action === 'Reentrega') {
                // Delete override so it falls back to spreadsheet status
                await supabase
                    .from('order_overrides')
                    .delete()
                    .eq('pedido_id_interno', pedidoId);

                setPedidos(prev => prev.filter(p => p.pedido_id_interno !== pedidoId));
            }
        } catch (e) {
            console.error(e);
            alert('Erro ao processar ação');
        } finally {
            setActionLoading(null);
        }
    };

    const filtered = pedidos.filter(p => {
        const matchesSearch =
            p.pedido_id_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.pedido_id_externo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.nome_pessoa?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

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
                            <th>Cliente</th>
                            <th>Rota</th>
                            <th>Motorista</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p) => {
                            const personName = p.nome_pessoa ? p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase() : '';
                            const route = routesMap[personName] || '-';

                            return (
                                <tr key={p.id}>
                                    <td style={{ fontWeight: 600 }}>{p.pedido_id_interno}</td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span>{p.nome_pessoa}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {p.municipio_uf || '-'}
                                            </span>
                                        </div>
                                    </td>
                                    <td><span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{route}</span></td>
                                    <td>{p.motorista || p.transportadora || '-'}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn btn-outline"
                                                style={{ fontSize: '0.75rem', padding: '4px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                                onClick={() => handleAction(p.pedido_id_interno, 'Cancelado')}
                                                disabled={actionLoading === p.pedido_id_interno}
                                            >
                                                {actionLoading === p.pedido_id_interno ? '...' : <><XCircle size={14} style={{ marginRight: 4 }} /> Cancelar</>}
                                            </button>
                                            <button
                                                className="btn btn-outline"
                                                style={{ fontSize: '0.75rem', padding: '4px 8px', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                                                onClick={() => handleAction(p.pedido_id_interno, 'Reentrega')}
                                                disabled={actionLoading === p.pedido_id_interno}
                                            >
                                                {actionLoading === p.pedido_id_interno ? '...' : <><Truck size={14} style={{ marginRight: 4 }} /> Reentrega</>}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && !loading && (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
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
