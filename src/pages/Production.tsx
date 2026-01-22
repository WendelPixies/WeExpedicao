import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, Factory, Loader2, Package } from 'lucide-react';

export default function Production() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        totalToday: number;
        stillInPicking: number;
        completed: number;
        orders: any[];
    }>({ totalToday: 0, stillInPicking: 0, completed: 0, orders: [] });

    const fetchProductionData = async () => {
        try {
            setLoading(true);
            const today = new Date().toISOString().split('T')[0];

            // 1. Get all orders that were in picking today (from our tracker table)
            const { data: adjustments, error: trackerError } = await supabase
                .from('daily_picking_tracker')
                .select('pedido_id')
                .eq('data_referencia', today);

            if (trackerError) throw trackerError;

            if (!adjustments || adjustments.length === 0) {
                setData({ totalToday: 0, stillInPicking: 0, completed: 0, orders: [] });
                return;
            }

            const pedidoIds = adjustments.map(a => a.pedido_id);

            // 2. Get the *current* status of these orders from the main table
            // We need to fetch details to see if they are still in picking or moved on
            const { data: currentOrders, error: ordersError } = await supabase
                .from('pedidos_consolidados')
                .select('*')
                .in('pedido_id_interno', pedidoIds);

            if (ordersError) throw ordersError;

            // 3. Process the data
            let stillInPicking = 0;
            let completed = 0;

            // Map for easier lookup
            const orderMap = new Map(currentOrders.map(o => [o.pedido_id_interno, o]));

            const enrichedOrders = pedidoIds.map(id => {
                const order = orderMap.get(id);
                if (!order) return null; // Should not happen ideally

                // Define what counts as "passed picking"
                // If fase_atual is NOT picking AND NOT Cancelado, it progressed.
                // Or verify specific phases: Packing, Disponível, Faturado, Transporte, Entregue.
                const isPicking = order.fase_atual === 'Picking';
                const isCompleted = !isPicking && order.fase_atual !== 'Cancelado' && order.fase_atual !== 'Aprovado';
                // Note: 'Aprovado' is before Picking. If it went back to Aprovado (unlikely), it's not "completed" picking. 
                // However, the rule says "identify... orders in picking... and as they are subtracted...".
                // If it's Cancelled, it's removed from the workflow, but should it count as "produced"? Probably not "completed" success, but "processed".
                // For now, let's assume "Completed" means moved forward.

                if (isPicking) stillInPicking++;
                else if (isCompleted) completed++;

                return {
                    ...order,
                    is_picking: isPicking,
                    is_completed: isCompleted
                };
            }).filter(Boolean);

            setData({
                totalToday: pedidoIds.length,
                stillInPicking,
                completed,
                orders: enrichedOrders
            });

        } catch (error) {
            console.error('Error fetching production data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProductionData();
        // Set up generic subscription for realtime updates if needed, 
        // but for now let's rely on manual refresh or page load as data comes from Import
        const channel = supabase
            .channel('production_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'pedidos_consolidados' },
                () => {
                    fetchProductionData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const percentage = data.totalToday > 0
        ? Math.round((data.completed / data.totalToday) * 100)
        : 0;

    return (
        <div className="animate-fade">
            <header className="header">
                <h1 className="title">Produção Diária (Picking)</h1>
                <span className="text-sm text-muted">Acompanhamento de pedidos que passaram pelo Picking hoje</span>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Summary Card */}
                <div className="stat-card md:col-span-3">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-primary/10 rounded-lg text-primary">
                                <Factory size={24} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">Progresso Diário</h3>
                                <p className="text-sm text-muted">Pedidos processados no Picking hoje</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-3xl font-bold">{percentage}%</span>
                            <p className="text-xs text-muted">Concluídos</p>
                        </div>
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700 overflow-hidden">
                        <div
                            className="bg-primary h-4 rounded-full transition-all duration-1000 ease-out flex items-center justify-center text-[10px] text-white font-bold"
                            style={{ width: `${percentage}%` }}
                        >
                            {percentage > 5 && `${percentage}%`}
                        </div>
                    </div>

                    <div className="flex justify-between mt-4 text-sm">
                        <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg flex-1 mr-2">
                            <span className="text-muted mb-1">Total no Picking Hoje</span>
                            <span className="font-bold text-xl">{data.totalToday}</span>
                        </div>
                        <div className="flex flex-col items-center p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg flex-1 mx-2 border border-yellow-200 dark:border-yellow-800/30">
                            <span className="text-yellow-700 dark:text-yellow-500 mb-1 flex items-center gap-2">
                                <Package size={14} /> Em Picking
                            </span>
                            <span className="font-bold text-xl text-yellow-700 dark:text-yellow-500">{data.stillInPicking}</span>
                        </div>
                        <div className="flex flex-col items-center p-4 bg-green-50 dark:bg-green-900/10 rounded-lg flex-1 ml-2 border border-green-200 dark:border-green-800/30">
                            <span className="text-green-700 dark:text-green-500 mb-1 flex items-center gap-2">
                                <CheckCircle2 size={14} /> Finalizados
                            </span>
                            <span className="font-bold text-xl text-green-700 dark:text-green-500">{data.completed}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* List of Orders */}
            <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30">
                    <h3 className="font-semibold">Detalhamento dos Pedidos</h3>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                ) : data.orders.length === 0 ? (
                    <div className="p-12 text-center text-muted">
                        <Package size={48} className="mx-auto mb-4 opacity-20" />
                        <p>Nenhum pedido entrou em picking hoje ainda.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-muted">
                                    <th className="p-3 font-medium">Pedido</th>
                                    <th className="p-3 font-medium">Cliente</th>
                                    <th className="p-3 font-medium">Fase Atual</th>
                                    <th className="p-3 font-medium">Situação</th>
                                    <th className="p-3 font-medium text-right">Horas no Fluxo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.orders.map((order, i) => (
                                    <tr key={i} className="border-b border-border hover:bg-muted/20 transition-colors">
                                        <td className="p-3 font-medium">{order.pedido_id_interno}</td>
                                        <td className="p-3">{order.nome_pessoa || 'N/A'}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${order.is_picking
                                                ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800'
                                                : 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
                                                }`}>
                                                {order.fase_atual}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted">{order.ultima_ocorrencia || '-'}</td>
                                        <td className="p-3 text-right font-mono">
                                            {order.dias_uteis_desde_aprovacao ? `${order.dias_uteis_desde_aprovacao}d` : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
