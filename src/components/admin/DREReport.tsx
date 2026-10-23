import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';
import { db } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DREData {
  // Receitas
  receitaAgendamentos: number;
  receitaLoja: number;
  receitaTotal: number;
  receitaSinais: number;        // sinais recebidos (aguardando confirmação)
  sinaisCount: number;
  // Comparativo mês anterior
  receitaAnterior: number;
  agendamentosCount: number;
  pedidosCount: number;
  ticketMedioAgendamento: number;
  ticketMedioPedido: number;
  // Por serviço
  porServico: { name: string; count: number; revenue: number }[];
  // Por profissional
  porProfissional: { name: string; count: number; revenue: number }[];
  // Histórico mensal
  historicoMensal: { month: string; agendamentos: number; loja: number; total: number }[];
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (curr: number, prev: number) => prev === 0 ? 0 : ((curr - prev) / prev) * 100;

export const DREReport: React.FC<{ salonId: string }> = ({ salonId }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DREData | null>(null);
  const [period, setPeriod] = useState('this_month');
  const [year, setYear] = useState(new Date().getFullYear());

  const getPeriodDates = () => {
    const now = new Date();
    if (period === 'this_month') return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, "MMMM 'de' yyyy", { locale: ptBR }) };
    if (period === 'last_month') { const m = subMonths(now, 1); return { start: startOfMonth(m), end: endOfMonth(m), label: format(m, "MMMM 'de' yyyy", { locale: ptBR }) }; }
    if (period === 'last_3') return { start: subMonths(startOfMonth(now), 3), end: endOfMonth(now), label: 'Últimos 3 meses' };
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59), label: `Ano ${year}` };
  };

  useEffect(() => {
    if (!salonId) return;
    fetchDRE();
  }, [salonId, period, year]);

  const fetchDRE = async () => {
    setLoading(true);
    const { start, end } = getPeriodDates();
    const startTs = start.getTime();
    const endTs = end.getTime();
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    try {
      // Agendamentos concluídos no período
      const [aptsSnap, ordersSnap, aptsAnteriorSnap] = await Promise.all([
        getDocs(query(collection(db, `salons/${salonId}/appointments`),
          where('status', 'in', ['COMPLETED', 'CONFIRMED']),
          where('date', '>=', startStr), where('date', '<=', endStr))),
        getDocs(query(collection(db, `salons/${salonId}/orders`),
          where('status', 'in', ['PAID', 'COMPLETED']),
          where('paidAt', '>=', startTs), where('paidAt', '<=', endTs))),
        // Mês anterior para comparativo
        getDocs(query(collection(db, `salons/${salonId}/appointments`),
          where('status', 'in', ['COMPLETED', 'CONFIRMED']),
          where('date', '>=', format(subMonths(start, 1), 'yyyy-MM-dd')),
          where('date', '<=', format(subMonths(end, 1), 'yyyy-MM-dd')))),
      ]);

      const apts = aptsSnap.docs.map(d => d.data());
      const orders = ordersSnap.docs.map(d => d.data());
      const aptsAnterior = aptsAnteriorSnap.docs.map(d => d.data());

      const receitaAgendamentos = apts.filter((a: any) => a.status !== 'AWAITING_DEPOSIT').reduce((s, a) => s + (a.totalAmount || 0), 0);
      const receitaLoja = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      const receitaAnterior = aptsAnterior.reduce((s, a) => s + (a.totalAmount || 0), 0);

      // Sinais recebidos (depositStatus PAID_PIX mas ainda AWAITING_DEPOSIT)
      const sinaisApts = apts.filter((a: any) => a.depositStatus === 'PAID_PIX' || a.depositStatus === 'PAID_ASAAS');
      const receitaSinais = sinaisApts.reduce((s, a) => s + ((a as any).depositAmount || 0), 0);
      const sinaisCount = sinaisApts.length;

      // Por serviço
      const servicoMap = new Map<string, { count: number; revenue: number }>();
      apts.forEach(a => {
        const key = a.serviceName || 'Outros';
        const curr = servicoMap.get(key) || { count: 0, revenue: 0 };
        servicoMap.set(key, { count: curr.count + 1, revenue: curr.revenue + (a.totalAmount || 0) });
      });
      const porServico = Array.from(servicoMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 8);

      // Por profissional
      const profMap = new Map<string, { count: number; revenue: number }>();
      apts.forEach(a => {
        const key = a.professionalName || 'Outros';
        const curr = profMap.get(key) || { count: 0, revenue: 0 };
        profMap.set(key, { count: curr.count + 1, revenue: curr.revenue + (a.totalAmount || 0) });
      });
      const porProfissional = Array.from(profMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue);

      // Histórico mensal (últimos 6 meses)
      const historicoMensal = await Promise.all(
        Array.from({ length: 6 }, (_, i) => {
          const m = subMonths(new Date(), 5 - i);
          return { m, label: format(m, 'MMM', { locale: ptBR }) };
        }).map(async ({ m, label }) => {
          const mStart = format(startOfMonth(m), 'yyyy-MM-dd');
          const mEnd = format(endOfMonth(m), 'yyyy-MM-dd');
          const mStartTs = startOfMonth(m).getTime();
          const mEndTs = endOfMonth(m).getTime();
          const [mApts, mOrds] = await Promise.all([
            getDocs(query(collection(db, `salons/${salonId}/appointments`),
              where('status', 'in', ['COMPLETED', 'CONFIRMED']),
              where('date', '>=', mStart), where('date', '<=', mEnd))),
            getDocs(query(collection(db, `salons/${salonId}/orders`),
              where('status', 'in', ['PAID', 'COMPLETED']),
              where('paidAt', '>=', mStartTs), where('paidAt', '<=', mEndTs))),
          ]);
          const agendamentos = mApts.docs.reduce((s, d) => s + (d.data().totalAmount || 0), 0);
          const loja = mOrds.docs.reduce((s, d) => s + (d.data().totalAmount || 0), 0);
          return { month: label, agendamentos, loja, total: agendamentos + loja };
        })
      );

      setData({
        receitaAgendamentos, receitaLoja,
        receitaTotal: receitaAgendamentos + receitaLoja,
        receitaSinais, sinaisCount,
        receitaAnterior, agendamentosCount: apts.filter((a: any) => a.status !== 'AWAITING_DEPOSIT').length, pedidosCount: orders.length,
        ticketMedioAgendamento: apts.length ? receitaAgendamentos / apts.length : 0,
        ticketMedioPedido: orders.length ? receitaLoja / orders.length : 0,
        porServico, porProfissional, historicoMensal,
      });
    } catch (e) {
      console.error('[DRE]', e);
    } finally {
      setLoading(false);
    }
  };

  const { label } = getPeriodDates();
  const variation = data ? pct(data.receitaTotal, data.receitaAnterior) : 0;

  if (loading) return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
    </div>
  );

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">Este mês</SelectItem>
            <SelectItem value="last_month">Mês passado</SelectItem>
            <SelectItem value="last_3">Últimos 3 meses</SelectItem>
            <SelectItem value="year">Ano inteiro</SelectItem>
          </SelectContent>
        </Select>
        {period === 'year' && (
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>

      {/* KPIs principais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          {
            label: 'Receita Total',
            value: fmt(data.receitaTotal),
            sub: `${variation >= 0 ? '+' : ''}${variation.toFixed(1)}% vs mês anterior`,
            up: variation >= 0,
            icon: <DollarSign className="h-5 w-5" />,
            color: 'text-green-600',
          },
          {
            label: 'Receita Agendamentos',
            value: fmt(data.receitaAgendamentos),
            sub: `${data.agendamentosCount} atendimentos`,
            up: true,
            icon: <BarChart3 className="h-5 w-5" />,
            color: 'text-blue-600',
          },
          {
            label: 'Receita Loja',
            value: fmt(data.receitaLoja),
            sub: `${data.pedidosCount} pedidos`,
            up: true,
            icon: <TrendingUp className="h-5 w-5" />,
            color: 'text-purple-600',
          },
          {
            label: 'Ticket Médio',
            value: fmt(data.ticketMedioAgendamento),
            sub: `Loja: ${fmt(data.ticketMedioPedido)}`,
            up: true,
            icon: <ArrowUpRight className="h-5 w-5" />,
            color: 'text-amber-600',
          },
          {
            label: 'Sinais Recebidos',
            value: fmt(data.receitaSinais),
            sub: `${data.sinaisCount} agend. aguardando confirmação`,
            up: data.receitaSinais > 0,
            icon: <DollarSign className="h-5 w-5" />,
            color: 'text-orange-600',
          },
        ].map(kpi => (
          <Card key={kpi.label} className="border-none shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <span className={kpi.color}>{kpi.icon}</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{kpi.value}</p>
              <p className={`text-xs mt-1 flex items-center gap-1 ${kpi.up ? 'text-green-600' : 'text-red-600'}`}>
                {kpi.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {kpi.sub}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Histórico mensal */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Evolução dos últimos 6 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.historicoMensal.map(m => {
              const maxVal = Math.max(...data.historicoMensal.map(x => x.total), 1);
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="w-8 text-xs text-muted-foreground text-right">{m.month}</span>
                  <div className="flex-1 flex gap-1 h-6 items-center">
                    <div className="h-4 rounded bg-primary/80 transition-all" style={{ width: `${(m.agendamentos / maxVal) * 100}%`, minWidth: m.agendamentos > 0 ? 4 : 0 }} title={`Agendamentos: ${fmt(m.agendamentos)}`} />
                    <div className="h-4 rounded bg-purple-400/80 transition-all" style={{ width: `${(m.loja / maxVal) * 100}%`, minWidth: m.loja > 0 ? 4 : 0 }} title={`Loja: ${fmt(m.loja)}`} />
                  </div>
                  <span className="w-24 text-right text-sm font-medium">{fmt(m.total)}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary/80 inline-block" /> Agendamentos</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-purple-400/80 inline-block" /> Loja</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Por Serviço + Por Profissional */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader><CardTitle className="text-base">Receita por Serviço</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.porServico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado neste período.</p>
              ) : data.porServico.map((s, i) => {
                const maxR = Math.max(...data.porServico.map(x => x.revenue), 1);
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="shrink-0 ml-2">{fmt(s.revenue)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${(s.revenue / maxR) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-14 text-right">{s.count}× serv.</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader><CardTitle className="text-base">Receita por Profissional</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.porProfissional.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado neste período.</p>
              ) : data.porProfissional.map(p => {
                const maxR = Math.max(...data.porProfissional.map(x => x.revenue), 1);
                return (
                  <div key={p.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 ml-2">{fmt(p.revenue)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500/70" style={{ width: `${(p.revenue / maxR) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{p.count} atend.</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
