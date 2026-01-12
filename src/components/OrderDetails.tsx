import { X, Clock, MapPin, Truck, CheckCircle, Info } from 'lucide-react';

interface OrderDetailsProps {
    order: any;
    onClose: () => void;
}

export default function OrderDetails({ order, onClose }: OrderDetailsProps) {
    if (!order) return null;

    const timeline = [
        { label: 'Aprovado', date: order.aprovado_at, icon: CheckCircle },
        { label: 'Disponível Faturamento', date: order.disponivel_faturamento_at, icon: Clock },
        { label: 'Transporte', date: order.despachado_at, icon: Truck },
        { label: 'Entregue', date: order.entregue_at, icon: CheckCircle },
    ].filter(t => t.date);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem'
        }}>
            <div className="stat-card" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
                <button
                    onClick={onClose}
                    style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                    <X size={24} />
                </button>

                <header style={{ marginBottom: '2rem' }}>
                    <span className="card-id">ID Interno: {order.pedido_id_interno}</span>
                    <h2 className="title">{order.nome_pessoa || 'Cliente não identificado'}</h2>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <span className={`sla-badge ${order.sla_status === 'ATRASADO' ? 'late' : 'on-time'}`}>
                            {order.sla_status} ({order.dias_uteis_desde_aprovacao} dias úteis)
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <MapPin size={14} /> {order.municipio_uf}
                        </span>
                    </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    <section>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Info size={18} color="var(--primary)" />
                            Timeline de Evolução
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', paddingLeft: '1.5rem' }}>
                            <div style={{ position: 'absolute', left: '7px', top: '5px', bottom: '5px', width: '2px', background: 'var(--border)' }}></div>
                            {timeline.map((step, i) => (
                                <div key={i} style={{ position: 'relative', display: 'flex', gap: '1rem' }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: '-23px',
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        background: 'var(--primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <step.icon size={10} color="white" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{step.label}</p>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {step.label === 'Entregue' || step.label === 'Aprovado'
                                                ? new Date(step.date).toLocaleDateString('pt-BR')
                                                : new Date(step.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            }
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginTop: '2rem', marginBottom: '1rem' }}>Última Ocorrência</h3>
                        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius)' }}>
                            <p style={{ fontSize: '0.875rem' }}>{order.ultima_ocorrencia || 'Nenhuma ocorrência registrada.'}</p>
                        </div>
                    </section>

                    <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                            <h4 style={{ fontSize: '0.75rem', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Dados de Match</h4>
                            <p style={{ fontSize: '0.75rem' }}><strong>ID Logística:</strong> {order.pedido_id_logistica || '-'}</p>
                            <p style={{ fontSize: '0.75rem' }}><strong>ID ERP (CSV):</strong> {order.pedido_id_erp_csv || '-'}</p>
                            <p style={{ fontSize: '0.75rem' }}><strong>Método:</strong> {order.match_key_used}</p>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius)' }}>
                            <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Transporte</h4>
                            <p style={{ fontSize: '0.875rem' }}><strong>Transportadora:</strong> {order.transportadora || '-'}</p>
                            <p style={{ fontSize: '0.875rem' }}><strong>Rota:</strong> {order.rota || '-'}</p>
                            <p style={{ fontSize: '0.875rem' }}><strong>Motorista:</strong> {order.motorista || '-'}</p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
