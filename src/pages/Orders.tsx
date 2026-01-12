import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, AlertTriangle } from 'lucide-react';
import { checkPhaseSLAs, calculateBusinessDays } from '../lib/utils';
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
        try {
            const response = await fetch('https://docs.google.com/spreadsheets/d/1dTljUAvscAY-PpaiCkGnUK_ikgcB0S2Xzi2cK8I-GJM/export?format=csv&gid=0');
            const text = await response.text();
            const lines = text.split('\n');
            const map: Record<string, string> = {};

            // Skip header (index 0)
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
        } catch (e) {
            console.error("Error fetching routes:", e);
        }
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

    const filtered = pedidos.filter(p => {
        const matchesSearch =
            p.pedido_id_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.pedido_id_externo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.nome_pessoa?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesPhase = phaseFilter ? p.fase_atual === phaseFilter : true;

        const personName = p.nome_pessoa ? p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase() : '';
        const route = routesMap[personName];
        const matchesRoute = !filterRoute || (route === filterRoute);

        return matchesSearch && matchesPhase && matchesRoute;
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
                            <th>Faturado em</th>
                            <th>Entregue em</th>
                            <th>Dias Úteis</th>
                            <th>SLA</th>
                            <th>Motorista</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p) => {
                            const currentAlerts = checkPhaseSLAs(p, slaParams, holidays);
                            const isLate = currentAlerts.length > 0 || p.sla_status === 'ATRASADO';
                            const personName = p.nome_pessoa ? p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase() : '';
                            const route = routesMap[personName] || '-';

                            return (
                                <tr key={p.id}>
                                    <td
                                        style={{ fontWeight: 600 }}
                                    >
                                        {p.pedido_id_interno}
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
                                    <td>{formatDate(p.faturado_at)}</td>
                                    <td>{p.entregue_at ? new Date(p.entregue_at).toLocaleDateString('pt-BR') : '-'}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            {(() => {
                                                if (!p.aprovado_at) return 0;

                                                const start = new Date(p.aprovado_at);
                                                let end = new Date();

                                                if (p.entregue_at) {
                                                    end = new Date(p.entregue_at);
                                                } else if (p.fase_atual === 'Entregue') {
                                                    // Se está entregue mas não tem data, não podemos calcular o total real.
                                                    // Mantemos 0 ou algum indicador? O usuário disse 'faz o calculo certo'.
                                                    // Sem data de entrega, o cálculo certo do tempo total é impossível.
                                                    return '-';
                                                }

                                                const days = calculateBusinessDays(start, end, holidays);
                                                return days;
                                            })()}
                                            {isLate && <AlertTriangle size={12} color="var(--danger)" />}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`sla-badge ${isLate ? 'late' : 'on-time'}`}>
                                            {isLate
                                                ? (p.fase_atual === 'Entregue' ? 'ENTREGUE COM ATRASO' : 'ATRASADO')
                                                : 'NO PRAZO'}
                                        </span>
                                    </td>
                                    <td>{p.motorista || p.transportadora || '-'}</td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && !loading && (
                            <tr>
                                <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
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
        </div>
    );
}
