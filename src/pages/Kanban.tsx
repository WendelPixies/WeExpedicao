import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Search, MapPin, ExternalLink, Clock, AlertTriangle, Calendar, CheckCircle, Route } from 'lucide-react';
import { motion } from 'framer-motion';
import { checkPhaseSLAs } from '../lib/utils';

const PHASES = ['Aprovado', 'Picking', 'Packing', 'Disponível para faturamento', 'Transporte', 'Entregue'];

export default function Kanban() {
    const [pedidos, setPedidos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRoute, setFilterRoute] = useState('');
    const [slaParams, setSlaParams] = useState<any>(null);
    const [holidays, setHolidays] = useState<string[]>([]);

    const [routesMap, setRoutesMap] = useState<Record<string, string>>({});

    const boardRef = useRef<HTMLDivElement>(null);
    const topScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchPedidos();
        fetchHolidays();
        fetchRoutes(); // Fetch routes on mount
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

                // Simple CSV split (works for this specific dataset which doesn't seem to have commas in fields)
                const cols = line.split(',');
                if (cols.length >= 5) {
                    // Column 1 is Name, Column 4 is Rota
                    const rawName = cols[1];
                    const rawRota = cols[4];

                    if (rawName && rawRota) {
                        // Normalize name: remove * and trim
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

    const filteredPedidos = pedidos.filter(p => {
        const matchesSearch =
            p.pedido_id_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.nome_pessoa?.toLowerCase().includes(searchTerm.toLowerCase());

        const route = p.nome_pessoa ? routesMap[p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase()] : null;
        const matchesRoute = !filterRoute || (route === filterRoute);

        const isCancelled = p.fase_atual === 'Cancelado';

        return matchesSearch && matchesRoute && !isCancelled;
    });

    // Sync scrollbars
    useEffect(() => {
        const board = boardRef.current;
        const topScroll = topScrollRef.current;

        if (!board || !topScroll) return;

        const syncTop = () => {
            topScroll.scrollLeft = board.scrollLeft;
        };
        const syncBoard = () => {
            board.scrollLeft = topScroll.scrollLeft;
        };

        board.addEventListener('scroll', syncTop);
        topScroll.addEventListener('scroll', syncBoard);

        return () => {
            board.removeEventListener('scroll', syncTop);
            topScroll.removeEventListener('scroll', syncBoard);
        };
    }, [pedidos, loading]);

    if (loading) return <div>Carregando Kanban...</div>;

    return (
        <div className="animate-fade">
            <header className="header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1.5rem' }}>
                <h1 className="title">Kanban de Pedidos</h1>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', width: '100%' }}>
                    <div style={{ position: 'relative' }}>
                        <Search
                            size={18}
                            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                        />
                        <input
                            type="text"
                            className="input"
                            placeholder="Buscar ID ou Nome..."
                            style={{ paddingLeft: '2.5rem' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>


                    <select className="input" value={filterRoute} onChange={(e) => setFilterRoute(e.target.value)}>
                        <option value="">Rota: Todas</option>
                        {Array.from(new Set(Object.values(routesMap))).sort().map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
            </header>

            <div className="kanban-container-outer" style={{ position: 'relative', marginTop: '2rem' }}>
                {/* Dummy Top Scrollbar */}
                <div
                    ref={topScrollRef}
                    className="top-scrollbar-container"
                    style={{
                        overflowX: 'auto',
                        overflowY: 'hidden',
                        height: '16px',
                        marginBottom: '1.5rem',
                        width: '100%',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.05)'
                    }}
                >
                    <div style={{ width: `${PHASES.length * 344}px`, height: '1px' }}></div>
                </div>

                <div
                    ref={boardRef}
                    className="kanban-board"
                    style={{
                        overflowX: 'auto',
                        display: 'flex',
                        gap: '1.5rem',
                        padding: '0.5rem 0 1.5rem 0',
                    }}
                >
                    {PHASES.map((phase) => (
                        <div key={phase} className="kanban-column">
                            <div className="column-header">
                                <span className="column-title">{phase}</span>
                                <span className="column-badge">
                                    {filteredPedidos.filter(p => p.fase_atual === phase).length}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '100px' }}>
                                {filteredPedidos
                                    .filter(p => p.fase_atual === phase)
                                    .map((p) => {
                                        const alerts = checkPhaseSLAs(p, slaParams, holidays);
                                        const slaIsLate = alerts.length > 0 || p.sla_status === 'ATRASADO';

                                        // CUSTOM LOGIC: PEDIDO ACIMA DO PRAZO
                                        // Uses parameters from Settings (Hours since approval)
                                        let isCustomDelay = false;
                                        let customAlertMsg = '';

                                        const currentPhase = (p.fase_atual || '').toLowerCase().trim();

                                        if (p.aprovado_at) {
                                            const diffMs = new Date().getTime() - new Date(p.aprovado_at).getTime();
                                            const diffHours = diffMs / (1000 * 60 * 60);

                                            // Map thresholds based on Settings keys
                                            const thresholds = {
                                                'aprovado': Number(slaParams?.sla_picking || 24),
                                                'picking': Number(slaParams?.sla_packing || 30),
                                                'packing': Number(slaParams?.sla_disponivel || 72),
                                                'disponível para faturamento': Number(slaParams?.sla_despachado || 96),
                                                'transporte': Number(slaParams?.sla_entregue || 154)
                                            };

                                            const limit = thresholds[currentPhase as keyof typeof thresholds];

                                            if (limit && (diffHours > limit || slaIsLate)) {
                                                isCustomDelay = true;
                                                if (currentPhase === 'aprovado') customAlertMsg = 'PEDIDO ACIMA DO PRAZO DE APROVAÇÃO';
                                                else if (currentPhase === 'picking') customAlertMsg = 'PEDIDO ACIMA DO PRAZO DE PICKING';
                                                else if (currentPhase === 'packing') customAlertMsg = 'PEDIDO ACIMA DO PRAZO DE PACKING';
                                                else if (currentPhase === 'disponível para faturamento') customAlertMsg = 'PEDIDO ACIMA DO PRAZO DE DISPONIBILIDADE';
                                                else if (currentPhase === 'transporte') customAlertMsg = 'PEDIDO ACIMA DO PRAZO DE TRANSPORTE';
                                            }
                                        }

                                        // Override alerts if custom delay is active to show only the yellow message
                                        let displayAlerts = isCustomDelay ? [customAlertMsg] : alerts;

                                        const isLate = slaIsLate || isCustomDelay;

                                        const borderStyle = isCustomDelay
                                            ? '4px solid #facc15'
                                            : (isLate ? '4px solid var(--danger)' : '1px solid var(--border)');

                                        const backgroundLimit = isCustomDelay
                                            ? 'rgba(250, 204, 21, 0.05)'
                                            : (isLate ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-card)');

                                        return (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                key={p.id}
                                                className="kanban-card"
                                                style={{
                                                    borderLeft: borderStyle,
                                                    background: backgroundLimit
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <span className="card-id" style={{ fontSize: '1rem', fontWeight: 700 }}>#{p.pedido_id_interno}</span>
                                                    <div className={`sla-badge ${isLate ? 'late' : 'on-time'}`} style={{
                                                        padding: '2px 6px',
                                                        fontSize: '0.65rem',
                                                        ...(isCustomDelay ? { background: '#facc15', color: '#854d0e' } : {})
                                                    }}>
                                                        {isCustomDelay
                                                            ? 'ATRASADO'
                                                            : (isLate
                                                                ? (p.fase_atual === 'Entregue' ? 'ENTREGUE COM ATRASO' : 'ATRASADO')
                                                                : 'NO PRAZO')}
                                                    </div>
                                                </div>

                                                <h4 className="card-title" style={{ fontSize: '0.875rem', margin: '0.5rem 0' }}>{p.nome_pessoa || 'Sem Nome'}</h4>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                                    <MapPin size={12} />
                                                    <span>{p.municipio_uf || 'Localização não informada'}</span>
                                                </div>

                                                {p.nome_pessoa && routesMap[p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase()] && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                                        <Route size={12} />
                                                        <span>Rota: {routesMap[p.nome_pessoa.replace(/\*/g, '').trim().toUpperCase()]}</span>
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                    <Calendar size={12} />
                                                    <span>Aprovado em: {new Date(p.aprovado_at).toLocaleDateString('pt-BR')}</span>
                                                </div>

                                                {/* Exibição especial para pedidos ENTREGUES */}
                                                {p.fase_atual === 'Entregue' && (
                                                    <>
                                                        {p.entregue_at && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                                <CheckCircle size={12} />
                                                                <span>Entregue em: {new Date(p.entregue_at).toLocaleDateString('pt-BR')}</span>
                                                            </div>
                                                        )}

                                                        {/* Tempo total entre aprovação e entrega */}
                                                        {p.aprovado_at && p.entregue_at && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: isLate ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                                                                <Clock size={12} />
                                                                {(() => {
                                                                    const dStart = new Date(p.aprovado_at);
                                                                    const dEnd = new Date(p.entregue_at);

                                                                    // Normalize to midnight for "7 - 1 = 6" calendar logic
                                                                    dStart.setHours(0, 0, 0, 0);
                                                                    dEnd.setHours(0, 0, 0, 0);

                                                                    const diffMs = dEnd.getTime() - dStart.getTime();
                                                                    const totalMin = Math.floor(diffMs / (1000 * 60));
                                                                    const d = Math.floor(totalMin / (24 * 60));
                                                                    const h = Math.floor((totalMin % (24 * 60)) / 60);
                                                                    const m = totalMin % 60;

                                                                    const parts = [];
                                                                    if (d > 0) parts.push(`${d} ${d === 1 ? 'dia' : 'dias'}`);
                                                                    if (h > 0) parts.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
                                                                    if (m > 0 || (d === 0 && h === 0)) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`);

                                                                    let breakdown = '';
                                                                    if (parts.length === 1) breakdown = parts[0];
                                                                    else if (parts.length === 2) breakdown = `${parts[0]} e ${parts[1]}`;
                                                                    else breakdown = `${parts.slice(0, -1).join(', ')} e ${parts.slice(-1)}`;

                                                                    return <span>Tempo total: {breakdown}</span>;
                                                                })()}
                                                            </div>
                                                        )}
                                                    </>
                                                )}

                                                {/* Exibição para pedidos NÃO ENTREGUES */}
                                                {p.fase_atual !== 'Entregue' && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: isCustomDelay ? '#854d0e' : (isLate ? 'var(--danger)' : 'var(--text-muted)') }}>
                                                        <Clock size={12} />
                                                        {(() => {
                                                            if (!p.aprovado_at) return <span>-</span>;
                                                            const diffMs = new Date().getTime() - new Date(p.aprovado_at).getTime();

                                                            const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
                                                            const remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                                                            const totalMin = Math.floor(diffMs / (1000 * 60));
                                                            const d = Math.floor(totalMin / (24 * 60));
                                                            const h = Math.floor((totalMin % (24 * 60)) / 60);
                                                            const m = totalMin % 60;

                                                            const parts = [];
                                                            if (d > 0) parts.push(`${d} ${d === 1 ? 'dia' : 'dias'}`);
                                                            if (h > 0) parts.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
                                                            if (m > 0 || (d === 0 && h === 0)) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`);

                                                            let breakdown = '';
                                                            if (parts.length === 1) breakdown = parts[0];
                                                            else if (parts.length === 2) breakdown = `${parts[0]} e ${parts[1]}`;
                                                            else breakdown = `${parts.slice(0, -1).join(', ')} e ${parts.slice(-1)}`;

                                                            return <span>{totalHours}h {remainingMinutes}min ({breakdown})</span>;
                                                        })()}
                                                        {isLate && !isCustomDelay && <span style={{ fontWeight: 600 }}>({displayAlerts.length > 0 ? displayAlerts[0] : 'SLA Geral'})</span>}
                                                    </div>
                                                )}

                                                {p.fase_atual === 'Transporte' && p.ultima_ocorrencia && (() => {
                                                    const texto = p.ultima_ocorrencia.toLowerCase().trim();
                                                    // Lista de mensagens genéricas que NÃO precisam aparecer (o que está em branco na imagem)
                                                    const mensagensGenericas = [
                                                        'transporte',
                                                        'em transporte',
                                                        'transportador a caminho da coleta do pedido',
                                                        'transportador a caminho da coleta'
                                                    ];

                                                    // Se for genérico, retorna null (não exibe)
                                                    if (mensagensGenericas.includes(texto)) return null;

                                                    // Se for um status importante ("O que está em amarelo" na imagem), EXIBE
                                                    return (
                                                        <div style={{
                                                            marginTop: '0.5rem',
                                                            fontSize: '0.75rem',
                                                            color: '#facc15', // Amarelo
                                                            fontWeight: 600,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.25rem'
                                                        }}>
                                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#facc15' }}></span>
                                                            {p.ultima_ocorrencia}
                                                        </div>
                                                    );
                                                })()}

                                                {displayAlerts.length > 0 && p.fase_atual !== 'Entregue' && (
                                                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                        {displayAlerts.map((alert: string, idx: number) => (
                                                            <div key={idx} style={{
                                                                fontSize: '0.65rem',
                                                                color: isCustomDelay ? '#ffffff' : 'var(--danger)',
                                                                background: isCustomDelay ? 'rgba(250, 204, 21, 0.4)' : 'rgba(239, 68, 68, 0.1)',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <AlertTriangle size={10} stroke={isCustomDelay ? '#ffffff' : 'currentColor'} />
                                                                {alert}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="card-footer">
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ext: {p.pedido_id_externo}</span>
                                                    <a href="#" className="nav-link" style={{ padding: 0, color: 'var(--primary)' }}>
                                                        <ExternalLink size={14} />
                                                    </a>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
