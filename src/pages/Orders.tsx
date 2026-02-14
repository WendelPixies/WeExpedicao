import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Search, AlertTriangle, RotateCcw } from 'lucide-react';
import { checkPhaseSLAs, fetchRoutesFromSheet } from '../lib/utils';
import OrderDetails from '../components/OrderDetails';

export default function OrdersPage() {
    const [pedidos, setPedidos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [phaseFilter, setPhaseFilter] = useState('');
    const [slaParams, setSlaParams] = useState<any>(null);
    const [holidays, setHolidays] = useState<string[]>([]);

    const [routesMap, setRoutesMap] = useState<Record<string, string>>({});
    const [filterRoute, setFilterRoute] = useState('');
    const [driverFilter, setDriverFilter] = useState('');
    const [onlyMissingDelivery, setOnlyMissingDelivery] = useState(false);

    const [confirmDevolucao, setConfirmDevolucao] = useState<string | null>(null);
    const [returnReason, setReturnReason] = useState('');

    useEffect(() => {
        fetchPedidos();
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

    const fetchPedidos = async () => {
        setLoading(true);

        // Fetch all data without pagination limit
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('pedidos_consolidados')
                .select('*')
                .order('aprovado_at', { ascending: true })
                .range(from, from + pageSize - 1);

            if (error) {
                console.error('Error fetching pedidos:', error);
                break;
            }

            if (data && data.length > 0) {
                allData = [...allData, ...data];
                from += pageSize;
                hasMore = data.length === pageSize;
            } else {
                hasMore = false;
            }
        }

        setPedidos(allData);
        setLoading(false);
    };

    const handleDevolucao = async () => {
        if (!confirmDevolucao || !returnReason) return;

        try {
            const { error } = await supabase
                .from('order_overrides')
                .upsert({
                    pedido_id_interno: confirmDevolucao,
                    status_manual: 'Devolução',
                    reason: returnReason
                });

            if (error) throw error;

            setPedidos(prev => prev.filter(p => p.pedido_id_interno !== confirmDevolucao));

        } catch (e) {
            console.error(e);
            alert('Erro ao enviar para devolução');
        } finally {
            setConfirmDevolucao(null);
            setReturnReason('');
        }
    };

    const filtered = pedidos.filter(p => {
        const matchesSearch =
            p.pedido_id_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.pedido_id_externo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.nome_pessoa?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesPhase = phaseFilter ? p.fase_atual === phaseFilter : true;

        const personName = p.nome_pessoa ? p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase() : '';
        const route = routesMap[personName];
        const matchesRoute = !filterRoute || (route === filterRoute);

        const driver = p.motorista || p.transportadora || '-';
        const matchesDriver = !driverFilter || (driver === driverFilter);

        const matchesMissing = onlyMissingDelivery ? (p.fase_atual === 'Entregue' && !p.entregue_at) : true;

        return matchesSearch && matchesPhase && matchesRoute && matchesDriver && matchesMissing;
    });

    const PHASES = ['Aprovado', 'Picking', 'Packing', 'Disponível para faturamento', 'Transporte', 'Entregue'];

    const formatDate = (date: string) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('pt-BR');
    };

    return (
        <div className="animate-fade">
            <header className="header">
                <h1 className="title">Lista de Pedidos</h1>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', width: '300px' }}>
                        <Search
                            size={18}
                            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                        />
                        <input
                            type="text"
                            className="input"
                            placeholder="Buscar pedido..."
                            style={{ paddingLeft: '2.5rem' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        className="input"
                        style={{ width: '180px' }}
                        value={phaseFilter}
                        onChange={(e) => setPhaseFilter(e.target.value)}
                    >
                        <option value="">Todas as Fases</option>
                        {PHASES.map(phase => (
                            <option key={phase} value={phase}>{phase}</option>
                        ))}
                    </select>

                    <select
                        className="input"
                        style={{ width: '150px' }}
                        value={filterRoute}
                        onChange={(e) => setFilterRoute(e.target.value)}
                    >
                        <option value="">Todas Rotas</option>
                        {Array.from(new Set(Object.values(routesMap))).sort().map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>

                    <select
                        className="input"
                        style={{ width: '180px' }}
                        value={driverFilter}
                        onChange={(e) => setDriverFilter(e.target.value)}
                    >
                        <option value="">Todos Motoristas</option>
                        {Array.from(new Set(pedidos.map(p => p.motorista || p.transportadora || '-')))
                            .filter(d => d !== '-')
                            .sort()
                            .map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))
                        }
                    </select>

                    <button
                        onClick={() => setOnlyMissingDelivery(!onlyMissingDelivery)}
                        className="btn"
                        style={{
                            background: onlyMissingDelivery ? 'var(--danger)' : 'rgba(255,255,255,0.05)',
                            borderColor: onlyMissingDelivery ? 'var(--danger)' : 'rgba(255,255,255,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {onlyMissingDelivery && <AlertTriangle size={14} />}
                        Sem Entrega/Calc
                    </button>
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

                            return (
                                <tr key={p.id} className="group relative">
                                    <td style={{ fontWeight: 600 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {p.pedido_id_interno}
                                            <button
                                                className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Devolução"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setConfirmDevolucao(p.pedido_id_interno);
                                                }}
                                                style={{
                                                    padding: '4px',
                                                    height: 'auto',
                                                    color: 'var(--text-muted)',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                        </div>
                                    </td>
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
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && !loading && (
                            <tr>
                                <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                    Nenhum pedido encontrado.
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

            {confirmDevolucao && createPortal(
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }} onClick={() => {
                    setConfirmDevolucao(null);
                    setReturnReason('');
                }}>
                    <div
                        className="stat-card"
                        style={{ maxWidth: '400px', width: '100%', margin: '1rem' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold mb-2">Enviar para Devolução?</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Deseja confirmar o envio do pedido <strong>{confirmDevolucao}</strong> para a aba de Devolução?
                        </p>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Motivo:</label>
                            <select
                                className="input"
                                style={{ width: '100%' }}
                                value={returnReason}
                                onChange={(e) => setReturnReason(e.target.value)}
                            >
                                <option value="">Selecione um motivo...</option>
                                <option value="Não fez o pedido">Não fez o pedido</option>
                                <option value="Endereço não localizado">Endereço não localizado</option>
                                <option value="Endereço Insuficiente">Endereço Insuficiente</option>
                                <option value="Destinatário ausente">Destinatário ausente</option>
                                <option value="Destinatário desconhecido">Destinatário desconhecido</option>
                                <option value="Destinatário faleceu">Destinatário faleceu</option>
                                <option value="Destinatário mudou de endereço">Destinatário mudou de endereço</option>
                                <option value="Não quer mais o pedido">Não quer mais o pedido</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button className="btn btn-outline" onClick={() => {
                                setConfirmDevolucao(null);
                                setReturnReason('');
                            }}>Cancelar</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleDevolucao}
                                disabled={!returnReason}
                            >
                                Sim, Confirmar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
