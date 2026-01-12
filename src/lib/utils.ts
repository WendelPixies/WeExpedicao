export const normalize_id = (v: any): string => {
    if (v === null || v === undefined) return '';
    const str = String(v).trim();
    // Remove non-numeric characters
    const onlyNumbers = str.replace(/\D/g, '');
    // Remove leading zeros
    return onlyNumbers.replace(/^0+/, '') || onlyNumbers;
};

export const isBusinessDay = (date: Date, holidays: string[]): boolean => {
    const day = date.getDay();
    if (day === 0 || day === 6) return false; // Sunday or Saturday
    const dateStr = date.toISOString().split('T')[0];
    if (holidays.includes(dateStr)) return false;
    return true;
};

export const calculateBusinessDays = (start: Date, end: Date, holidays: string[]): number => {
    if (!start) return 0;
    const d1 = new Date(start);
    const d2 = end ? new Date(end) : new Date();

    if (d1 > d2) return 0;

    let count = 0;
    let current = new Date(d1);
    // Clear time to avoid issues with same-day calculations
    current.setHours(0, 0, 0, 0);
    const target = new Date(d2);
    target.setHours(0, 0, 0, 0);

    while (current <= target) {
        if (isBusinessDay(current, holidays)) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }
    return count;
};

export const fetchHolidaysFromAPI = async (year: number) => {
    try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/BR`);
        const data = await res.json();
        return data.map((h: any) => ({
            data: h.date,
            descricao: h.localName
        }));
    } catch (err) {
        console.error('Error fetching holidays:', err);
        return [];
    }
};

export type Phase = 'Aprovado' | 'Picking' | 'Packing' | 'Disponível para faturamento' | 'Transporte' | 'Entregue' | 'Cancelado';

export const determinePhase = (xlsxData: any, csvData: any): Phase => {
    // Helper para buscar valor ignorando case nas chaves
    const getVal = (obj: any, keys: string[]) => {
        if (!obj) return null;
        for (const k of keys) {
            if (obj[k] !== undefined) return obj[k];
            if (obj[k.toUpperCase()] !== undefined) return obj[k.toUpperCase()];
            if (obj[k.toLowerCase()] !== undefined) return obj[k.toLowerCase()];
        }
        return null;
    };

    const sitFiscal = String(getVal(xlsxData, ['SituaçãoFiscal', 'Situação Fiscal']) || '').trim();
    const sitComercial = String(getVal(xlsxData, ['SituaçãoComercial', 'Situação Comercial']) || '').trim();
    const detComercial = String(getVal(xlsxData, ['DetalheSituaçãoComercial', 'Detalhe da Situação Comercial']) || '').trim();
    const dataEntrega = getVal(xlsxData, ['DataEntrega', 'Data Entrega']);

    // Normalização para facilitar comparação
    const f = sitFiscal.toLowerCase().trim();
    const c = sitComercial.toLowerCase().trim();
    const d = detComercial.toLowerCase().trim();

    const csvStatus = String(getVal(csvData, ['Status']) || '').toLowerCase().trim();
    const csvOcorrencia = String(getVal(csvData, ['Última Ocorrência', 'Ultima Ocorrencia']) || '').toLowerCase().trim();

    // LÓGICA BASEADA NA TABELA DO USUÁRIO

    // 0. CANCELADO
    if (c === 'cancelado' || c === 'cancelada' ||
        f === 'cancelado' || f === 'cancelada' ||
        d.includes('cancelado') || d.includes('cancelada') ||
        csvStatus.includes('cancelado') || csvStatus.includes('cancelada') ||
        csvOcorrencia.includes('cancelado') || csvOcorrencia.includes('cancelada')) {
        return 'Cancelado';
    }

    // 1. ENTREGUE
    // NF Emitida + Entregue + Entregue para Revendedor
    // OU se tiver data de entrega no XLSX ou status CSV entregue ou data em AC (index 28)
    const hasCsvDeliveryDate = csvData?._rawValues?.[28] || csvData?.['Data de Entrega'] || csvData?.['Data Entrega'];
    if ((f === 'nf emitida' && c === 'entregue' && d === 'entregue para revendedor') ||
        (csvStatus === 'entregue' || csvStatus === 'entregue.') ||
        (dataEntrega) ||
        (hasCsvDeliveryDate)) {
        return 'Entregue';
    }

    // 2. TRANSPORTE (CASO ESPECIAL DA TABELA)
    // NF Emitida + Separação + Disponível para Retirada/Entrega
    // (Pela tabela do usuário, isso vira TRANSPORTE agora)
    if (f === 'nf emitida' && (c === 'separação' || c === 'separacao') && d === 'disponível para retirada/entrega') {
        return 'Transporte';
    }

    // 3. DISPONÍVEL PARA FATURAMENTO
    // Disp. Faturamento + Separação + Disponível para Retirada/Entrega
    // OU Não Faturado + Separação + Disponível para Retirada/Entrega
    if (((f === 'disp. faturamento' || f === 'disponível para faturamento') || f === 'não faturado' || f === 'nao faturado') &&
        (c === 'separação' || c === 'separacao') &&
        d === 'disponível para retirada/entrega') {
        return 'Disponível para faturamento';
    }

    // 4. PACKING
    // Não Faturado + Separação + Em Packing
    if ((f === 'não faturado' || f === 'nao faturado') &&
        (c === 'separação' || c === 'separacao') &&
        d === 'em packing') {
        return 'Packing';
    }

    // 5. PICKING
    // Não Faturado + Separação + Em Picking
    if ((f === 'não faturado' || f === 'nao faturado') &&
        (c === 'separação' || c === 'separacao') &&
        d === 'em picking') {
        return 'Picking';
    }

    // 6. TRANSPORTE (REGRA GERAL)
    // NF Emitida + Transporte + (Qualquer detalhe em amarelo ou genérico)
    // OU dados de logística que confirmem transporte
    if ((f === 'nf emitida' && c === 'transporte') ||
        (csvData?.['Data de Coleta']) ||
        ['Em transito', 'No cliente'].includes(csvData?.Status)) {
        return 'Transporte';
    }

    // 7. APROVADO
    // Situação Fiscal: Não Faturado
    // Situação Comercial: Aprovado
    // Detalhe da Situação Comercial: Aprovado
    if ((f === 'não faturado' || f === 'nao faturado') && c === 'aprovado' && d === 'aprovado') {
        return 'Aprovado';
    }

    // Removido o fallback genérico que forçava "Aprovado" para qualquer coisa que não fosse explicitamente "cancelado".
    // Isso evita que status desconhecidos (ex: Bloqueado, Pendente) apareçam como Aprovados.
    // Se não entrou em nenhuma regra acima, cairá no return 'Cancelado' abaixo.

    return 'Cancelado';
};

export const checkPhaseSLAs = (p: any, params?: any, holidays: string[] = []) => {
    const now = new Date();
    const alerts: string[] = [];

    const sla = params || {
        sla_picking: 24,
        sla_packing: 24,
        sla_disponivel: 48,
        sla_faturado: 48,
        sla_despachado: 96,
        sla_entregue: 120
    };

    if (p.fase_atual === 'Cancelado' ||
        p.fase_atual === 'cancelado' ||
        p.situacao?.toLowerCase().includes('cancelado') ||
        p.ultima_ocorrencia?.toLowerCase().includes('cancelado')) {
        return [];
    }

    if (!p.aprovado_at) return [];

    const aprov = p.aprovado_at;

    // 1. Picking
    // Se já temos data de picking ou fases posteriores, não criticamos o picking, a menos que ele tenha de fato demorado
    // Mas a lógica original criticava se o DIFF fosse maior que SLA. 
    // O ajuste é: Só mostramos "Atraso no Início" se ele AINDA NÃO começou e já estourou o tempo.
    if (!p.picking_at && !p.disponivel_faturamento_at && !p.faturado_at && !p.despachado_at && !p.entregue_at) {
        if (calculateBusinessHours(aprov, now, holidays) > sla.sla_picking) {
            alerts.push(`Atraso no Início do Picking (>${sla.sla_picking}h úteis)`);
        }
    }

    // 2. Packing
    if (!p.packing_at && !p.disponivel_faturamento_at && !p.faturado_at && !p.despachado_at && !p.entregue_at) {
        if (calculateBusinessHours(aprov, now, holidays) > sla.sla_packing) {
            alerts.push(`Atraso no Packing (>${sla.sla_packing}h úteis)`);
        }
    }

    // 3. Disponível
    if (!p.disponivel_faturamento_at && !p.faturado_at && !p.despachado_at && !p.entregue_at) {
        if (calculateBusinessHours(aprov, now, holidays) > sla.sla_disponivel) {
            alerts.push(`Atraso na Disponibilidade (>${sla.sla_disponivel}h úteis)`);
        }
    }

    // 4. Faturado
    if (!p.faturado_at && !p.despachado_at && !p.entregue_at) {
        if (calculateBusinessHours(aprov, now, holidays) > sla.sla_faturado) {
            alerts.push(`Atraso no Faturamento (>${sla.sla_faturado}h úteis)`);
        }
    }

    // 5. Despachado
    if (!p.despachado_at && !p.entregue_at) {
        if (calculateBusinessHours(aprov, now, holidays) > sla.sla_despachado) {
            alerts.push(`Atraso no Transporte (>${sla.sla_despachado}h úteis)`);
        }
    }

    // 6. Entregue
    if (!p.entregue_at) {
        // Se ainda não entregou e estourou
        if (calculateBusinessHours(aprov, now, holidays) > sla.sla_entregue) {
            alerts.push(`Atraso na Entrega (>${sla.sla_entregue}h úteis)`);
        }
    } else {
        // Se JÁ entregou, verificamos se entregou atrasado
        if (calculateBusinessHours(aprov, p.entregue_at, holidays) > sla.sla_entregue) {
            // Nota: Geralmente não se mostra alerta em card entregue, mas o status fica "ENTREGUE COM ATRASO"
            // Se quiser manter o alerta de texto:
            // alerts.push(`Entregue com atraso`);
        }
    }

    return alerts;
};

export const calculateBusinessHours = (start: string | null, end: string | null | Date, holidays: string[] = []) => {
    if (!start) return 0;
    const now = new Date();
    const dStart = new Date(start);
    const dEnd = end ? (end instanceof Date ? end : new Date(end)) : now;

    if (dStart > dEnd) return 0;

    let totalBusinessHours = 0;
    let current = new Date(dStart);

    // If it starts on a weekend, we shift to Monday 00:00 as requested
    // "se o pedido foi aprovado dia 03/01 (sábado) ele só poderá contar a partir de 05/01 (segunda feira)"
    while (!isBusinessDay(current, holidays)) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        if (current > dEnd) return 0;
    }

    // Now iterate through the days
    const tempDate = new Date(current);
    while (tempDate <= dEnd) {
        const isLastDay = tempDate.toDateString() === dEnd.toDateString();
        const isFirstDay = tempDate.toDateString() === current.toDateString();

        if (isBusinessDay(tempDate, holidays)) {
            if (isFirstDay && isLastDay) {
                totalBusinessHours += (dEnd.getTime() - current.getTime()) / (1000 * 60 * 60);
            } else if (isFirstDay) {
                const endOfDay = new Date(tempDate);
                endOfDay.setHours(23, 59, 59, 999);
                totalBusinessHours += (endOfDay.getTime() - current.getTime()) / (1000 * 60 * 60);
            } else if (isLastDay) {
                const startOfDay = new Date(tempDate);
                startOfDay.setHours(0, 0, 0, 0);
                totalBusinessHours += (dEnd.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
            } else {
                totalBusinessHours += 24;
            }
        }
        tempDate.setDate(tempDate.getDate() + 1);
        tempDate.setHours(0, 0, 0, 0);
    }

    return Number(totalBusinessHours.toFixed(2));
};


