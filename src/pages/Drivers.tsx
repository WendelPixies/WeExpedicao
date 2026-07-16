import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Phone, User, Trash2, Loader2, Plus, Search } from 'lucide-react';

interface Motorista {
    id: number;
    nome: string;
    celular: string;
    created_at?: string;
}

export default function DriversPage() {
    const [motoristas, setMotoristas] = useState<Motorista[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [nome, setNome] = useState('');
    const [celular, setCelular] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        fetchMotoristas();
    }, []);

    const fetchMotoristas = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('motoristas')
            .select('*')
            .order('nome', { ascending: true });

        if (error) {
            console.error('Erro ao buscar motoristas:', error);
            setError('Erro ao carregar motoristas. Verifique se a tabela "motoristas" existe no banco.');
        } else {
            setMotoristas(data || []);
            setError('');
        }
        setLoading(false);
    };

    // Mantém apenas dígitos e limita a um tamanho razoável (com DDI/DDD)
    const formatCelular = (value: string) => value.replace(/\D/g, '').slice(0, 13);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const nomeTrim = nome.trim();
        const celularDigits = formatCelular(celular);

        if (!nomeTrim || !celularDigits) {
            setError('Preencha nome e celular.');
            return;
        }
        if (celularDigits.length < 10) {
            setError('Celular incompleto. Use DDD + número (ex: 22999998888).');
            return;
        }

        setSaving(true);
        setError('');

        const { error } = await supabase
            .from('motoristas')
            .insert([{ nome: nomeTrim, celular: celularDigits }]);

        if (error) {
            console.error('Erro ao salvar motorista:', error);
            setError('Erro ao salvar motorista.');
        } else {
            setNome('');
            setCelular('');
            fetchMotoristas();
        }
        setSaving(false);
    };

    const handleDelete = async (id: number) => {
        const { error } = await supabase.from('motoristas').delete().eq('id', id);
        if (error) {
            console.error('Erro ao excluir motorista:', error);
            setError('Erro ao excluir motorista.');
        } else {
            setMotoristas(prev => prev.filter(m => m.id !== id));
        }
    };

    // Exibe o celular de forma amigável: (DD) 9XXXX-XXXX quando possível
    const displayCelular = (raw: string) => {
        const d = raw.replace(/\D/g, '');
        const local = d.length > 11 ? d.slice(-11) : d; // ignora DDI para exibição
        if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
        if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
        return raw;
    };

    const filtered = motoristas.filter(m =>
        m.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.celular?.includes(searchTerm.replace(/\D/g, ''))
    );

    return (
        <div className="animate-fade">
            <header className="header">
                <h1 className="title">Cadastro de Motoristas</h1>
            </header>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'start' }}>
                {/* Formulário de cadastro */}
                <div className="stat-card">
                    <label className="stat-label">Novo Motorista</label>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ position: 'relative' }}>
                            <User
                                size={18}
                                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                            />
                            <input
                                type="text"
                                className="input"
                                placeholder="Nome do motorista"
                                style={{ paddingLeft: '2.5rem', width: '100%' }}
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                            />
                        </div>

                        <div style={{ position: 'relative' }}>
                            <Phone
                                size={18}
                                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                            />
                            <input
                                type="tel"
                                className="input"
                                placeholder="Celular (DDD + número)"
                                style={{ paddingLeft: '2.5rem', width: '100%' }}
                                value={celular}
                                onChange={(e) => setCelular(formatCelular(e.target.value))}
                            />
                        </div>

                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
                            Somente números. Inclua o DDD (ex: 22999998888). Para WhatsApp via n8n, o DDI 55 pode ser prefixado.
                        </p>

                        {error && (
                            <p style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: 0 }}>{error}</p>
                        )}

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving}
                            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                        >
                            {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                            {saving ? 'Salvando...' : 'Cadastrar'}
                        </button>
                    </form>
                </div>

                {/* Lista de motoristas */}
                <div className="table-container" style={{ marginTop: 0 }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ position: 'relative', maxWidth: '320px' }}>
                            <Search
                                size={18}
                                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                            />
                            <input
                                type="text"
                                className="input"
                                placeholder="Buscar motorista..."
                                style={{ paddingLeft: '2.5rem', width: '100%' }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Celular</th>
                                <th style={{ width: '60px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((m) => (
                                <tr key={m.id}>
                                    <td style={{ fontWeight: 600 }}>{m.nome}</td>
                                    <td>{displayCelular(m.celular)}</td>
                                    <td>
                                        <button
                                            className="btn-icon"
                                            title="Excluir"
                                            onClick={() => handleDelete(m.id)}
                                            style={{
                                                padding: '4px',
                                                color: 'var(--danger)',
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                        Nenhum motorista cadastrado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
