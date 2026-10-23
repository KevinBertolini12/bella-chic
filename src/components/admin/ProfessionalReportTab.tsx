import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, where, addDoc, updateDoc, doc, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSalon } from '../../contexts/SalonContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  Users, DollarSign, Calendar, Star, TrendingUp,
  Award, Clock, Scissors, Plus, Wallet, ChevronDown, ChevronUp,
  Crown, ShieldCheck, Shield,
} from 'lucide-react';
import { format, getMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const COLORS = ['#e11d48', '#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface Vale {
  id: string;
  professionalId: string;
  professionalName: string;
  amount: number;
  description: string;
  createdAt: number;
  paidAt?: number;
  paid: boolean;
}

interface ProfessionalStats {
  id: string;
  name: string;
  commissionPercent: number; // padrão geral do profissional (se configurado)
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  totalRevenue: number;
  totalCommission: number; // comissão líquida calculada
  totalMaterialCost: number;
  totalPaymentFees: number;
  avgTicket: number;
  avgRating: number;
  totalRatings: number;
  services: Record<string, { name: string; count: number; revenue: number; commission: number }>;
  monthlyData: { month: string; appointments: number; revenue: number; commission: number }[];
  completionRate: number;
}

// ── Curva ABC ─────────────────────────────────────────────────────────────────
interface ClientABC {
  name: string;
  phone: string;
  totalSpent: number;
  visits: number;
  tier: 'A' | 'B' | 'C';
}

// ── Componente de Vales ───────────────────────────────────────────────────────
const ValesSection: React.FC<{ salonId: string; professionals: { id: string; name: string }[] }> = ({
  salonId, professionals,
}) => {
  const [vales, setVales] = useState<Vale[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    professionalId: '',
    amount: '',
    description: 'Adiantamento',
  });
  const [filterProf, setFilterProf] = useState('all');
  const [showPaid, setShowPaid] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, `salons/${salonId}/professional_vales`),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snap => {
      setVales(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Vale));
      setLoading(false);
    }, () => setLoading(false));
  }, [salonId]);

  const addVale = async () => {
    if (!form.professionalId || !form.amount) {
      toast.error('Selecione o profissional e informe o valor.');
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error('Valor inválido.'); return; }
    setSaving(true);
    try {
      const prof = professionals.find(p => p.id === form.professionalId);
      await addDoc(collection(db, `salons/${salonId}/professional_vales`), {
        professionalId: form.professionalId,
        professionalName: prof?.name || '',
        amount,
        description: form.description || 'Adiantamento',
        createdAt: Date.now(),
        paid: false,
      });
      toast.success('Vale registrado!');
      setForm({ professionalId: '', amount: '', description: 'Adiantamento' });
      setShowForm(false);
    } catch { toast.error('Erro ao salvar.'); }
    setSaving(false);
  };

  const markPaid = async (vale: Vale) => {
    await updateDoc(doc(db, `salons/${salonId}/professional_vales`, vale.id), {
      paid: true,
      paidAt: Date.now(),
    });
    toast.success('Vale marcado como pago!');
  };

  const filtered = vales.filter(v => {
    if (filterProf !== 'all' && v.professionalId !== filterProf) return false;
    if (!showPaid && v.paid) return false;
    return true;
  });

  const pending = vales.filter(v => !v.paid);
  const pendingByProf = professionals.map(p => ({
    ...p,
    total: pending.filter(v => v.professionalId === p.id).reduce((s, v) => s + v.amount, 0),
  })).filter(p => p.total > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> Vales e Adiantamentos
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Registre adiantamentos e veja o saldo a pagar no fechamento
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Lançar vale
        </Button>
      </div>

      {/* Saldo pendente por profissional */}
      {pendingByProf.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pendingByProf.map(p => (
            <div key={p.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-amber-700">Vales pendentes</p>
              </div>
              <p className="font-bold text-amber-800">R$ {p.total.toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Formulário de vale */}
      {showForm && (
        <div className="rounded-xl border p-4 bg-muted/20 space-y-3">
          <p className="text-sm font-semibold">Novo vale</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Profissional *</Label>
              <Select value={form.professionalId} onValueChange={v => setForm(f => ({ ...f, professionalId: v }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {professionals.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor (R$) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                className="h-8 text-xs"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Ex: Adiantamento semanal"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addVale} disabled={saving} className="flex-1">
              {saving ? 'Salvando...' : 'Registrar vale'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterProf} onValueChange={setFilterProf}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos profissionais</SelectItem>
            {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          onClick={() => setShowPaid(v => !v)}
          className={`text-xs px-3 h-8 rounded-lg border transition-colors ${showPaid ? 'bg-primary/10 border-primary text-primary' : 'text-muted-foreground hover:border-muted-foreground'}`}
        >
          {showPaid ? '✓ Mostrando pagos' : 'Mostrar pagos'}
        </button>
      </div>

      {/* Lista de vales */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum vale encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(vale => (
            <div key={vale.id} className={`rounded-lg border flex items-center justify-between gap-3 p-3 ${vale.paid ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{vale.professionalName}</p>
                <p className="text-xs text-muted-foreground">{vale.description} · {format(new Date(vale.createdAt), 'dd/MM/yyyy', { locale: ptBR })}</p>
                {vale.paid && vale.paidAt && (
                  <p className="text-xs text-green-600">Pago em {format(new Date(vale.paidAt), 'dd/MM/yyyy', { locale: ptBR })}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <p className={`font-bold text-sm ${vale.paid ? 'text-muted-foreground line-through' : 'text-amber-700'}`}>
                  R$ {vale.amount.toFixed(2)}
                </p>
                {!vale.paid && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markPaid(vale)}>
                    Marcar pago
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Curva ABC de Clientes ─────────────────────────────────────────────────────
const ABCCurve: React.FC<{ salonId: string }> = ({ salonId }) => {
  const [clients, setClients] = useState<ClientABC[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const aptsSnap = await getDocs(
          query(collection(db, `salons/${salonId}/appointments`), where('status', '==', 'COMPLETED'))
        );
        const map: Record<string, { name: string; phone: string; totalSpent: number; visits: number }> = {};
        for (const d of aptsSnap.docs) {
          const apt = d.data() as any;
          const key = apt.customerPhone || apt.clientPhone || apt.phone || apt.clientName || 'unknown';
          if (!map[key]) map[key] = { name: apt.clientName || key, phone: apt.customerPhone || apt.clientPhone || '', totalSpent: 0, visits: 0 };
          map[key].totalSpent += apt.totalAmount || apt.price || 0;
          map[key].visits++;
        }

        const sorted = Object.values(map)
          .filter(c => c.totalSpent > 0)
          .sort((a, b) => b.totalSpent - a.totalSpent);

        const total = sorted.length;
        const tiered: ClientABC[] = sorted.map((c, i) => ({
          ...c,
          tier: i < total * 0.2 ? 'A' : i < total * 0.5 ? 'B' : 'C',
        }));

        setClients(tiered);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [salonId]);

  const byTier = (tier: 'A' | 'B' | 'C') => clients.filter(c => c.tier === tier);
  const totalRevenue = clients.reduce((s, c) => s + c.totalSpent, 0);

  const tierConfig = {
    A: { label: 'Clientes A (Top 20%)', icon: <Crown className="h-4 w-4" />, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800' },
    B: { label: 'Clientes B (Médios 30%)', icon: <ShieldCheck className="h-4 w-4" />, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800' },
    C: { label: 'Clientes C (Base 50%)', icon: <Shield className="h-4 w-4" />, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', badge: 'bg-slate-100 text-slate-700' },
  };

  if (loading) return <p className="text-center text-muted-foreground py-8">Calculando curva ABC...</p>;
  if (clients.length === 0) return <p className="text-center text-muted-foreground py-8">Ainda não há dados suficientes de atendimentos concluídos.</p>;

  return (
    <div className="space-y-4">
      {/* Resumo */}
<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(['A', 'B', 'C'] as const).map(tier => {
          const list = byTier(tier);
          const rev = list.reduce((s, c) => s + c.totalSpent, 0);
          const cfg = tierConfig[tier];
          return (
            <div key={tier} className={`rounded-xl border p-3 ${cfg.bg}`}>
              <div className={`flex items-center gap-1.5 mb-1 ${cfg.color} font-semibold text-xs`}>
                {cfg.icon} Tier {tier}
              </div>
              <p className={`font-bold text-lg ${cfg.color}`}>{list.length} clientes</p>
              <p className="text-xs text-muted-foreground">
                {totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) : 0}% da receita total
              </p>
              <p className="text-xs font-medium mt-0.5">R$ {rev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          );
        })}
      </div>

      {/* Listagem por tier */}
      {(['A', 'B', 'C'] as const).map(tier => {
        const list = byTier(tier);
        const cfg = tierConfig[tier];
        return (
          <div key={tier}>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${cfg.color}`}>
              {cfg.label} — {list.length} clientes
            </p>
            <div className="space-y-1">
              {list.slice(0, 10).map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 bg-background">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${cfg.badge}`}>{tier}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">R$ {c.totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">{c.visits} visita(s)</p>
                  </div>
                </div>
              ))}
              {list.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  + {list.length - 10} outros clientes neste tier
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Componente Principal ──────────────────────────────────────────────────────
export const ProfessionalReportTab = () => {
  const { salonId } = useSalon();
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProfessionalStats[]>([]);
  const [profList, setProfList] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'desempenho' | 'vales' | 'abc'>('desempenho');

  useEffect(() => {
    if (!salonId) return;
    loadData();
  }, [salonId, year]);

  async function loadData() {
    setLoading(true);
    try {
      const startStr = `${year}-01-01`;
      const endStr = `${year}-12-31`;

      // Busca profissionais
      const profSnap = await getDocs(collection(db, `salons/${salonId}/professionals`));
      const professionals = profSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      setProfList(professionals.map(p => ({ id: p.id, name: p.displayName || p.name || 'Sem nome' })));

      // Busca serviços (para pegar comissão/materialCost configurados por serviço)
      const svcSnap = await getDocs(collection(db, `salons/${salonId}/services`));
      const serviceMap: Record<string, any> = {};
      svcSnap.docs.forEach(d => { serviceMap[d.id] = d.data(); });

      // Busca todos agendamentos do ano
      const aptsSnap = await getDocs(query(
        collection(db, `salons/${salonId}/appointments`),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
      ));
      const appointments = aptsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      // Busca avaliações
      const reviewsSnap = await getDocs(collection(db, `salons/${salonId}/reviews`));
      const reviews = reviewsSnap.docs.map(d => d.data() as any);

      const map: Record<string, ProfessionalStats> = {};

      for (const prof of professionals) {
        map[prof.id] = {
          id: prof.id,
          name: prof.displayName || prof.name || 'Sem nome',
          commissionPercent: prof.commissionPercent || 0,
          totalAppointments: 0,
          completedAppointments: 0,
          cancelledAppointments: 0,
          totalRevenue: 0,
          totalCommission: 0,
          totalMaterialCost: 0,
          totalPaymentFees: 0,
          avgTicket: 0,
          avgRating: 0,
          totalRatings: 0,
          services: {},
          monthlyData: MONTHS.map(m => ({ month: m, appointments: 0, revenue: 0, commission: 0 })),
          completionRate: 0,
        };
      }

      for (const apt of appointments) {
        const pid = apt.professionalId;
        if (!pid || !map[pid]) continue;

        const p = map[pid];
        p.totalAppointments++;

        const monthIdx = getMonth(new Date(apt.date));

        if (apt.status === 'COMPLETED') {
          p.completedAppointments++;
          const revenue = apt.totalAmount || 0;
          p.totalRevenue += revenue;
          p.monthlyData[monthIdx].revenue += revenue;

          // Pega configuração do serviço para cálculo de comissão
          const svc = serviceMap[apt.serviceId] || {};
          const commPct = svc.commissionPercent || p.commissionPercent || 0;
          const matCost = svc.materialCost || 0;
          const feePct = svc.paymentFeePercent || 0;

          const feeAmount = revenue * (feePct / 100);
          const netBase = Math.max(0, revenue - feeAmount - matCost);
          const commission = netBase * (commPct / 100);

          p.totalMaterialCost += matCost;
          p.totalPaymentFees += feeAmount;
          p.totalCommission += commission;
          p.monthlyData[monthIdx].commission += commission;

          // Serviços
          const sid = apt.serviceId || apt.serviceName;
          if (sid) {
            if (!p.services[sid]) p.services[sid] = { name: apt.serviceName || sid, count: 0, revenue: 0, commission: 0 };
            p.services[sid].count++;
            p.services[sid].revenue += revenue;
            p.services[sid].commission += commission;
          }
        }

        if (apt.status === 'CANCELLED') p.cancelledAppointments++;
        p.monthlyData[monthIdx].appointments++;
      }

      // Avaliações
      for (const rev of reviews) {
        const pid = rev.professionalId;
        if (!pid || !map[pid]) continue;
        const p = map[pid];
        p.avgRating = ((p.avgRating * p.totalRatings) + rev.rating) / (p.totalRatings + 1);
        p.totalRatings++;
      }

      // Métricas derivadas
      for (const p of Object.values(map)) {
        p.avgTicket = p.completedAppointments > 0 ? p.totalRevenue / p.completedAppointments : 0;
        p.completionRate = p.totalAppointments > 0
          ? Math.round((p.completedAppointments / p.totalAppointments) * 100)
          : 0;
        p.avgRating = p.totalRatings > 0 ? Math.round(p.avgRating * 10) / 10 : 0;
      }

      const sorted = Object.values(map).sort((a, b) => b.totalRevenue - a.totalRevenue);
      setStats(sorted);
    } catch (e) {
      console.error('[ProfReport]', e);
    } finally {
      setLoading(false);
    }
  }

  const current = useMemo(() => {
    if (selected === 'all') return null;
    return stats.find(s => s.id === selected) || null;
  }, [selected, stats]);

  const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return (
    <div className="py-16 text-center text-muted-foreground animate-pulse">Carregando relatório...</div>
  );

  if (stats.length === 0) return (
    <div className="py-16 text-center text-muted-foreground">
      <Users className="mx-auto mb-3 h-10 w-10 opacity-20" />
      <p>Nenhum profissional cadastrado ainda.</p>
    </div>
  );

  const comparativeData = stats.map((p, i) => ({
    name: p.name.split(' ')[0],
    receita: p.totalRevenue,
    comissao: p.totalCommission,
    agendamentos: p.completedAppointments,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" /> Relatório de Profissionais
        </h2>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0, 1, 2].map(i => {
                const y = new Date().getFullYear() - i;
                return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 rounded-xl border p-1 bg-muted/20 w-fit">
        {([
          { id: 'desempenho', label: 'Desempenho' },
          { id: 'vales', label: 'Vales' },
          { id: 'abc', label: 'Curva ABC' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-background shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── ABA DESEMPENHO ── */}
      {activeTab === 'desempenho' && (
        <div className="space-y-6">
          {/* Seletor profissional */}
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Selecionar profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Visão geral</SelectItem>
              {stats.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Visão geral */}
          {selected === 'all' && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((p, i) => (
                  <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(p.id)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white"
                            style={{ background: COLORS[i % COLORS.length] }}>
                            {i + 1}
                          </span>
                          <span className="font-semibold truncate">{p.name}</span>
                        </div>
                        {p.avgRating > 0 && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {p.avgRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Receita</p>
                          <p className="font-bold text-green-600">{fmt(p.totalRevenue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Comissão líquida</p>
                          <p className="font-bold text-purple-600">{fmt(p.totalCommission)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Ticket médio</p>
                          <p className="font-semibold">{fmt(p.avgTicket)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Conclusão</p>
                          <p className={`font-semibold ${p.completionRate >= 80 ? 'text-green-600' : p.completionRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                            {p.completionRate}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Receita vs Comissão por Profissional — {year}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={comparativeData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="comissao" name="Comissão" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Profissional específico */}
          {current && (
            <div className="space-y-6">
              {/* KPIs */}
<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Receita total', value: fmt(current.totalRevenue), icon: <DollarSign className="h-5 w-5" />, color: 'text-green-600', bg: 'bg-green-100' },
                  { label: 'Comissão líquida', value: fmt(current.totalCommission), icon: <Wallet className="h-5 w-5" />, color: 'text-purple-600', bg: 'bg-purple-100' },
                  { label: 'Ticket médio', value: fmt(current.avgTicket), icon: <TrendingUp className="h-5 w-5" />, color: 'text-blue-600', bg: 'bg-blue-100' },
                  {
                    label: 'Avaliação',
                    value: current.avgRating > 0 ? `${current.avgRating.toFixed(1)} ⭐` : '—',
                    icon: <Star className="h-5 w-5" />,
                    color: 'text-amber-600',
                    bg: 'bg-amber-100',
                  },
                ].map(({ label, value, icon, color, bg }) => (
                  <Card key={label}>
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg} ${color} shrink-0`}>
                        {icon}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`text-base font-bold ${color}`}>{value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Breakdown da comissão */}
              {current.totalRevenue > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold mb-3">Breakdown financeiro — {year}</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Receita bruta</span>
                        <span className="font-medium">{fmt(current.totalRevenue)}</span>
                      </div>
                      {current.totalPaymentFees > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>− Taxas de maquininha</span>
                          <span>− {fmt(current.totalPaymentFees)}</span>
                        </div>
                      )}
                      {current.totalMaterialCost > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>− Custo de materiais</span>
                          <span>− {fmt(current.totalMaterialCost)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-purple-700 border-t pt-2">
                        <span>Comissão líquida a pagar</span>
                        <span>{fmt(current.totalCommission)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Taxa de conclusão */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-2 text-sm">
                    <span className="font-medium flex items-center gap-1.5"><Clock className="h-4 w-4" /> Taxa de conclusão</span>
                    <span className={`font-bold ${current.completionRate >= 80 ? 'text-green-600' : current.completionRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {current.completionRate}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${current.completionRate >= 80 ? 'bg-green-500' : current.completionRate >= 60 ? 'bg-amber-400' : 'bg-red-500'}`}
                      style={{ width: `${current.completionRate}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                    <span>{current.completedAppointments} concluídos</span>
                    <span>{current.cancelledAppointments} cancelados</span>
                    <span>{current.totalAppointments} total</span>
                  </div>
                </CardContent>
              </Card>

              {/* Evolução mensal */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Evolução Mensal — {year}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={current.monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis yAxisId="left" tickFormatter={v => `R$${v}`} />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip formatter={(value: number, name: string) => name === 'Receita' || name === 'Comissão' ? fmt(value) : value} />
                      <Bar yAxisId="left" dataKey="revenue" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="left" dataKey="commission" name="Comissão" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="appointments" name="Agendamentos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Serviços */}
              {Object.keys(current.services).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Scissors className="h-4 w-4" /> Serviços Realizados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.values(current.services)
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 8)
                      .map((svc, i) => (
                        <div key={i} className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="truncate font-medium">{svc.name}</span>
                              <span className="text-muted-foreground ml-2 shrink-0">
                                {svc.count}x · {fmt(svc.revenue)}
                                {svc.commission > 0 && ` · comissão: ${fmt(svc.commission)}`}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(svc.count / Math.max(...Object.values(current.services).map(s => s.count))) * 100}%`,
                                  background: COLORS[i % COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ABA VALES ── */}
      {activeTab === 'vales' && (
        <Card>
          <CardContent className="p-4">
            <ValesSection salonId={salonId!} professionals={profList} />
          </CardContent>
        </Card>
      )}

      {/* ── ABA ABC ── */}
      {activeTab === 'abc' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Curva ABC de Clientes
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Classificação dos clientes por receita gerada. A = top 20%, B = próximos 30%, C = base 50%.
            </p>
          </CardHeader>
          <CardContent>
            <ABCCurve salonId={salonId!} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
