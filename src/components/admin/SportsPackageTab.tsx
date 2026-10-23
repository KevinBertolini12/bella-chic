import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSalon } from '../../contexts/SalonContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import {
  Plus, Trash2, Copy, CheckCircle2, AlertCircle,
  Trophy, Calendar, Clock, DollarSign, User, Phone,
  QrCode, RefreshCw, X, Loader2, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { salonService } from '../../services/salonService';
import { Professional } from '../../types';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../../firebase';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SportPackage {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  pricePerMonth: number;
  billingDay: number;
  method: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
  status: 'pending_payment' | 'active' | 'cancelled' | 'paused';
  asaasSubscriptionId?: string;
  invoiceUrl?: string;
  pixQrCode?: string;
  pixKey?: string;
  nextDueDate?: string;
  createdAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAY_FULL  = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Aguardando pagamento', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  active:          { label: 'Ativo',                color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  cancelled:       { label: 'Cancelado',            color: 'bg-red-100 text-red-700 border-red-200' },
  paused:          { label: 'Pausado',              color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

// ─── 3D KPI Card ─────────────────────────────────────────────────────────────

const KpiCard = ({ label, value, Icon, color }: { label: string; value: number | string; Icon: any; color: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [rot, setRot] = useState({ x: 0, y: 0 });
  return (
    <div ref={ref}
      onMouseMove={e => {
        if (!ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setRot({ x: ((e.clientY - r.top - r.height/2)/r.height)*10, y: -((e.clientX - r.left - r.width/2)/r.width)*10 });
      }}
      onMouseLeave={() => setRot({ x: 0, y: 0 })}
      style={{ transform: `perspective(700px) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, transition: 'transform 0.15s ease' }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 cursor-default hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`h-9 w-9 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-3xl font-black text-slate-900">{value}</p>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { salonId: string; }

export const SportsPackageTab = ({ salonId }: Props) => {
  const { profile } = useAuth();
  const { salon } = useSalon();

  const [packages, setPackages] = useState<SportPackage[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientName: '', clientPhone: '', clientEmail: '',
    daysOfWeek: [] as number[],
    startTime: '20:00', endTime: '21:00',
    professionalId: '', professionalName: '',
    serviceId: '', serviceName: '',
    pricePerMonth: '', billingDay: '10',
    method: 'PIX' as 'PIX' | 'CREDIT_CARD' | 'BOLETO',
  });

  // Result dialog
  const [paymentResult, setPaymentResult] = useState<null | {
    packageId: string; invoiceUrl: string; pixQrCode: string; pixKey: string; nextDueDate: string;
  }>(null);
  const [copiedPixKey, setCopiedPixKey] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    salonService.getProfessionals(salonId, false).then(setProfessionals).catch(() => {});
    salonService.getServices(salonId).then(setServices).catch(() => {});
  }, [salonId]);

  useEffect(() => {
    const q = query(
      collection(db, `salons/${salonId}/sport_packages`),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snap => {
      setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SportPackage)));
      setLoading(false);
    }, () => setLoading(false));
  }, [salonId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter(d => d !== day)
        : [...f.daysOfWeek, day].sort(),
    }));
  };

  const handleProfessional = (profId: string) => {
    const prof = professionals.find(p => p.id === profId);
    setForm(f => ({ ...f, professionalId: profId, professionalName: prof?.displayName || '' }));
  };

  const handleService = (svcId: string) => {
    const svc = services.find(s => s.id === svcId);
    setForm(f => ({ ...f, serviceId: svcId, serviceName: svc?.name || '' }));
  };

  const createPackage = async () => {
    if (!form.clientName.trim() || !form.clientPhone.trim()) {
      toast.error('Informe nome e telefone do cliente.'); return;
    }
    if (form.daysOfWeek.length === 0) {
      toast.error('Selecione pelo menos um dia da semana.'); return;
    }
    if (!form.professionalId) {
      toast.error('Selecione a quadra/espaço.'); return;
    }
    if (!form.pricePerMonth || isNaN(Number(form.pricePerMonth)) || Number(form.pricePerMonth) <= 0) {
      toast.error('Informe um valor mensal válido.'); return;
    }

    setSaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { toast.error('Não autenticado.'); return; }

      const res = await fetch('/api/sport-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          salonId,
          clientName:       form.clientName.trim(),
          clientPhone:      form.clientPhone.trim(),
          clientEmail:      form.clientEmail.trim() || undefined,
          daysOfWeek:       form.daysOfWeek,
          startTime:        form.startTime,
          endTime:          form.endTime,
          professionalId:   form.professionalId,
          professionalName: form.professionalName,
          serviceId:        form.serviceId,
          serviceName:      form.serviceName,
          pricePerMonth:    Number(form.pricePerMonth),
          billingDay:       Number(form.billingDay),
          method:           form.method,
        }),
      });

      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Erro ao criar pacote.'); return; }

      toast.success('Pacote criado! Link de pagamento enviado via WhatsApp.');
      setShowForm(false);
      setPaymentResult({
        packageId:   data.packageId,
        invoiceUrl:  data.invoiceUrl || '',
        pixQrCode:   data.pixQrCode  || '',
        pixKey:      data.pixKey     || '',
        nextDueDate: data.nextDueDate || '',
      });
      // Reset form
      setForm({
        clientName: '', clientPhone: '', clientEmail: '',
        daysOfWeek: [], startTime: '20:00', endTime: '21:00',
        professionalId: '', professionalName: '',
        serviceId: '', serviceName: '',
        pricePerMonth: '', billingDay: '10', method: 'PIX',
      });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar pacote.');
    } finally {
      setSaving(false);
    }
  };

  const cancelPackage = async (pkg: SportPackage) => {
    if (!confirm(`Cancelar pacote de ${pkg.clientName}? Os slots futuros serão liberados.`)) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/sport-packages/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ salonId, packageId: pkg.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`Pacote cancelado. ${data.slotsRemoved} slots liberados.`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const markAsPaid = async (pkg: SportPackage) => {
    if (!confirm(`Marcar pacote de ${pkg.clientName} como pago manualmente?\nOs slots serão reservados agora.`)) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/sport-packages/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ salonId, packageId: pkg.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Erro ao marcar como pago.'); return; }
      toast.success(`✅ Pago! ${data.slotsGenerated} horários reservados automaticamente.`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const copyPixKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedPixKey(true);
    toast.success('Chave PIX copiada!');
    setTimeout(() => setCopiedPixKey(false), 2000);
  };

  // ── Computed ───────────────────────────────────────────────────────────────

  const active   = packages.filter(p => p.status === 'active');
  const pending  = packages.filter(p => p.status === 'pending_payment');
  const mrr      = active.reduce((acc, p) => acc + (p.pricePerMonth || 0), 0);

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando pacotes...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-600" /> Pacotes Mensais
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crie pacotes de locação recorrente com cobrança automática via Asaas.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Novo Pacote
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Pacotes ativos"   value={active.length}  Icon={Trophy}      color="bg-emerald-50 text-emerald-600" />
        <KpiCard label="MRR estimado"     value={`R$ ${(mrr ?? 0).toFixed(0)}`} Icon={DollarSign} color="bg-blue-50 text-blue-600" />
        <KpiCard label="Ag. pagamento"    value={pending.length} Icon={Clock}       color="bg-amber-50 text-amber-600" />
        <KpiCard label="Total pacotes"    value={packages.length} Icon={Package}    color="bg-violet-50 text-violet-600" />
      </div>

      {/* Info banners */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">PIX automático via Asaas</p>
            <p className="text-xs mt-0.5">Configure sua chave em <strong>Configurações → PIX/Pagamentos</strong> para gerar links e QR Codes automáticos.</p>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Pagamento manual</p>
            <p className="text-xs mt-0.5">Cliente pagou em dinheiro ou direto no WhatsApp? Use o botão <strong>"Pago manual"</strong> para reservar os slots na hora.</p>
          </div>
        </div>
      </div>

      {/* Package list */}
      {packages.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Package className="mx-auto mb-3 h-10 w-10 opacity-20" />
          <p>Nenhum pacote cadastrado ainda.</p>
          <p className="text-sm mt-1">Crie o primeiro pacote mensal para seus clientes fixos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => {
            const st = STATUS_CONFIG[pkg.status] || STATUS_CONFIG.pending_payment;
            const daysLabel = (pkg.daysOfWeek || []).map(d => DAY_NAMES[d]).join(' · ');
            return (
              <Card key={pkg.id} className={`border-0 shadow-sm ${pkg.status === 'cancelled' ? 'opacity-50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    {/* Avatar */}
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold text-base">
                      {pkg.clientName.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{pkg.clientName}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.color}`}>
                          {st.label.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {pkg.clientPhone}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {daysLabel}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {pkg.startTime}–{pkg.endTime}</span>
                        <span className="flex items-center gap-1"><Trophy className="h-3 w-3" /> {pkg.professionalName}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-semibold">
                          R$ {pkg.pricePerMonth.toFixed(2)}/mês
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                          Vence todo dia {pkg.billingDay}
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                          {pkg.method}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {pkg.status === 'pending_payment' && (
                        <>
                          {/* Marcar como pago manualmente (dinheiro/pix avulso) */}
                          <Button size="sm" variant="outline"
                            className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => markAsPaid(pkg)}>
                            <CheckCircle2 className="mr-1.5 h-3 w-3" /> Pago manual
                          </Button>
                          {/* Ver QR Code se tiver PIX */}
                          {pkg.pixKey && (
                            <Button size="sm" variant="outline" className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => setPaymentResult({
                                packageId: pkg.id, invoiceUrl: pkg.invoiceUrl || '',
                                pixQrCode: pkg.pixQrCode || '', pixKey: pkg.pixKey || '',
                                nextDueDate: pkg.nextDueDate || '',
                              })}>
                              <QrCode className="mr-1.5 h-3 w-3" /> Ver PIX
                            </Button>
                          )}
                        </>
                      )}
                      {pkg.status !== 'cancelled' && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-red-50"
                          title="Cancelar pacote"
                          onClick={() => cancelPackage(pkg)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Dialog: Criar pacote ─────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={o => !o && setShowForm(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-600" /> Novo Pacote Mensal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">

            {/* Cliente */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Dados do cliente</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Nome completo *</Label>
                  <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                    placeholder="Ex: João Silva" />
                </div>
                <div className="space-y-1.5">
                  <Label>WhatsApp *</Label>
                  <Input type="tel" value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))}
                    placeholder="(11) 99999-9999" />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail (opcional)</Label>
                  <Input type="email" value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))}
                    placeholder="email@exemplo.com" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Horário */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Dias e horário reservado</p>

              <div className="flex flex-wrap gap-2 mb-3">
                {DAY_NAMES.map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i)}
                    className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-all ${
                      form.daysOfWeek.includes(i)
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
              {form.daysOfWeek.length > 0 && (
                <p className="text-xs text-emerald-600 mb-3">
                  {form.daysOfWeek.map(d => DAY_FULL[d]).join(', ')} — bloqueado toda semana
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Horário início *</Label>
                  <Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Horário fim *</Label>
                  <Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Recurso */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Espaço/Quadra</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Quadra/Espaço *</Label>
                  <Select value={form.professionalId} onValueChange={handleProfessional}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Serviço (opcional)</Label>
                  <Select value={form.serviceId} onValueChange={handleService}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Pagamento */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Cobrança mensal</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor R$/mês *</Label>
                  <Input type="number" min="1" step="0.01" value={form.pricePerMonth}
                    onChange={e => setForm(f => ({ ...f, pricePerMonth: e.target.value }))}
                    placeholder="150.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Dia de vencimento</Label>
                  <Input type="number" min="1" max="28" value={form.billingDay}
                    onChange={e => setForm(f => ({ ...f, billingDay: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Forma de pagamento</Label>
                  <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="CREDIT_CARD">Cartão de crédito</SelectItem>
                      <SelectItem value="BOLETO">Boleto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                O Asaas cria uma assinatura mensal automática. O cliente recebe o link por WhatsApp e paga. Na confirmação, os slots são bloqueados automaticamente.
              </p>
            </div>

          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={createPackage}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</> : <><Package className="mr-2 h-4 w-4" />Criar e Enviar</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Resultado do pagamento ──────────────────────────────── */}
      <Dialog open={!!paymentResult} onOpenChange={o => !o && setPaymentResult(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-emerald-600" /> Link de Pagamento
            </DialogTitle>
          </DialogHeader>
          {paymentResult && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-semibold">✅ Pacote criado!</p>
                <p>O link de pagamento foi enviado ao cliente via WhatsApp.</p>
                {paymentResult.nextDueDate && (
                  <p className="text-xs mt-1">Primeiro vencimento: {
                    (() => { try { return format(new Date(paymentResult.nextDueDate + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR }); } catch { return paymentResult.nextDueDate; } })()
                  }</p>
                )}
              </div>

              {paymentResult.pixQrCode && (
                <div className="text-center space-y-2">
                  <p className="text-xs font-semibold text-slate-600">QR Code PIX</p>
                  <div className="flex justify-center">
                    <img src={`data:image/png;base64,${paymentResult.pixQrCode}`} alt="QR Code PIX"
                      className="w-48 h-48 border rounded-xl" />
                  </div>
                </div>
              )}

              {paymentResult.pixKey && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Chave PIX copia e cola</Label>
                  <div className="flex gap-2">
                    <Input value={paymentResult.pixKey} readOnly className="text-xs font-mono" />
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => copyPixKey(paymentResult.pixKey)}>
                      {copiedPixKey ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {paymentResult.invoiceUrl && !paymentResult.pixKey && (
                <a href={paymentResult.invoiceUrl} target="_blank" rel="noreferrer">
                  <Button className="w-full" variant="outline">
                    Abrir fatura para pagamento →
                  </Button>
                </a>
              )}

              <p className="text-xs text-center text-slate-400">
                Após o pagamento, o Asaas confirma automaticamente e os slots são reservados.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
