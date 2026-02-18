import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    DollarSign,
    Calendar,
    Package,
    AlertCircle,
    MapPin
} from 'lucide-react';

interface AggregatedRoute {
    route: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
}

export default function CostsPage() {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [aggregatedData, setAggregatedData] = useState<AggregatedRoute[]>([]);
    const [totalCost, setTotalCost] = useState(0);
    const [totalOrders, setTotalOrders] = useState(0);

    // Initialize filters with current month
    useEffect(() => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setStartDate(firstDay.toISOString().split('T')[0]);
        setEndDate(lastDay.toISOString().split('T')[0]);
    }, []);

    useEffect(() => {
        if (startDate && endDate) {
            fetchData();
        }
    }, [startDate, endDate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Routes Mapping (Municipio + Bairro -> Route Name)
            const { data: routesData, error: routesErr } = await supabase
                .from('routes')
                .select('municipio, bairro, name');

            if (routesErr) throw routesErr;

            const routeLookup = new Map<string, string>();
            routesData?.forEach(r => {
                if (r.municipio && r.bairro) {
                    const key = `${r.municipio.trim().toUpperCase()} - ${r.bairro.trim().toUpperCase()}`;
                    routeLookup.set(key, r.name);
                }
            });

            // 2. Fetch Route Costs (Route Name -> Cost)
            const { data: costsData, error: costsErr } = await supabase
                .from('route_costs')
                .select('route, cost');

            if (costsErr) throw costsErr;

            const costLookup = new Map<string, number>();
            costsData?.forEach(c => {
                costLookup.set(c.route, Number(c.cost));
            });

            // 3. Fetch Consolidated Orders (no limit - removed .limit())
            const { data: ordersData, error: ordersErr } = await supabase
                .from('pedidos_consolidados')
                .select('municipio, bairro, fase_atual, situacao, data_arquivo')
                .gte('data_arquivo', `${startDate}T00:00:00`)
                .lte('data_arquivo', `${endDate}T23:59:59`);

            if (ordersErr) throw ordersErr;

            // 4. Aggregate
            const aggregation = new Map<string, AggregatedRoute>();
            let grandTotalCost = 0;
            let grandTotalOrders = 0;

            ordersData?.forEach(order => {
                const status = (order.fase_atual || '').toLowerCase();
                const situacao = (order.situacao || '').toLowerCase();

                if (status.includes('aguardando motorista') || status.includes('aguardando geração')) return;
                if (situacao.includes('aguardando motorista') || situacao.includes('aguardando geração')) return;
                if (status === 'cancelado') return;

                const muni = (order.municipio || '').trim().toUpperCase();
                const bair = (order.bairro || '').trim().toUpperCase();
                const key = `${muni} - ${bair}`;

                let routeName = routeLookup.get(key) || 'Sem Rota Definida';
                const unitCost = costLookup.get(routeName) || 0;

                const existing = aggregation.get(routeName) || {
                    route: routeName,
                    quantity: 0,
                    unit_cost: unitCost,
                    total_cost: 0
                };

                existing.quantity += 1;
                existing.total_cost += unitCost;

                aggregation.set(routeName, existing);

                grandTotalOrders += 1;
                grandTotalCost += unitCost;
            });

            const sortedData = Array.from(aggregation.values()).sort((a, b) => b.total_cost - a.total_cost);

            setAggregatedData(sortedData);
            setTotalCost(grandTotalCost);
            setTotalOrders(grandTotalOrders);

        } catch (error) {
            console.error('Error fetching costs data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    return (
        <div className="w-full h-full p-6 space-y-6 overflow-y-auto">
            {/* Header Section: Title + Filters */}
            <div className="space-y-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Gestão de Custos
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Acompanhamento financeiro detalhado por rota de entrega
                    </p>
                </div>

                {/* Date Filters */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-slate-400">
                        <Calendar size={18} />
                        <span className="text-sm font-semibold">Período</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        <span className="text-slate-500 text-sm">até</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        <button
                            onClick={fetchData}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            Atualizar
                        </button>
                    </div>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Card 1: Total de Pedidos */}
                <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/60 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-500/10 rounded-xl">
                            <Package size={24} className="text-blue-400" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
                            Total de Pedidos
                        </p>
                        <p className="text-4xl font-bold text-white">
                            {totalOrders.toLocaleString('pt-BR')}
                        </p>
                    </div>
                </div>

                {/* Card 2: Custo Médio */}
                <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/60 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-amber-500/10 rounded-xl">
                            <AlertCircle size={24} className="text-amber-400" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
                            Custo Médio
                        </p>
                        <p className="text-4xl font-bold text-white">
                            {totalOrders > 0 ? formatCurrency(totalCost / totalOrders) : 'R$ 0,00'}
                        </p>
                    </div>
                </div>

                {/* Card 3: Custo Total */}
                <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/60 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl">
                            <DollarSign size={24} className="text-emerald-400" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
                            Custo Total
                        </p>
                        <p className="text-4xl font-bold text-white">
                            {formatCurrency(totalCost)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-slate-800 border border-slate-700/60 rounded-xl shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-700/60 bg-slate-800/50 flex justify-between items-center">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <MapPin size={18} className="text-slate-400" /> Detalhamento por Rota
                    </h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-semibold border-b border-slate-700/60">Rota</th>
                                <th className="p-4 font-semibold border-b border-slate-700/60 text-center">Quantidade</th>
                                <th className="p-4 font-semibold border-b border-slate-700/60 text-right">Custo Unitário</th>
                                <th className="p-4 font-semibold border-b border-slate-700/60 text-right">Custo Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 text-sm text-slate-300">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-xs uppercase tracking-wide">Carregando dados...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : aggregatedData.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center text-slate-500 italic">
                                        Nenhum dado encontrado para o período selecionado.
                                    </td>
                                </tr>
                            ) : (
                                aggregatedData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-700/30 transition-colors group">
                                        <td className="p-4 font-medium text-white">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${row.route === 'Sem Rota Definida'
                                                    ? 'bg-red-500/10 text-red-400'
                                                    : 'bg-emerald-500/10 text-emerald-400'
                                                    }`}>
                                                    <MapPin size={16} />
                                                </div>
                                                <span>{row.route}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="bg-slate-900 border border-slate-700 px-2.5 py-0.5 rounded-full text-xs font-mono">
                                                {row.quantity}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-mono text-slate-400">
                                            {formatCurrency(row.unit_cost)}
                                        </td>
                                        <td className="p-4 text-right font-bold font-mono text-emerald-400 group-hover:text-emerald-300 transition-colors">
                                            {formatCurrency(row.total_cost)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-900/80 border-t border-slate-700 font-bold text-white">
                                <td className="p-4">TOTAL GERAL</td>
                                <td className="p-4 text-center">{totalOrders}</td>
                                <td className="p-4"></td>
                                <td className="p-4 text-right text-emerald-400 text-lg">{formatCurrency(totalCost)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}
