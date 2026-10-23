import React, { useEffect, useState, useMemo } from 'react';
import {
  collection, getDocs, query, orderBy, addDoc, doc,
  setDoc, deleteDoc, onSnapshot, getDoc
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Appointment, SalonService } from '../../types';
import { format, parseISO, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search, Phone, Calendar, TrendingUp, Users, ChevronDown,
  ChevronUp, MessageSquare, Plus, Trash2, Edit2, Repeat,
  Check, X, Star
} from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
type RecurrenceType = 'weekly' | 'biweekly' | 'monthly';

interface ManualClient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  birthdate?: string;
  createdAt: number;
  recurringDay?: number;
  recurringTime?: string;
  recurringServiceId?: string;
  recurringServiceName?: string;
  recurrenceType?: RecurrenceType;
}

const DAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const REC_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'weekly',   label: 'Toda semana' },
  { value: 'biweekly', label: 'A cada 2 semanas' },
  { value: 'monthly',  label: 'Todo mês' },
];

const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g,'');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
};

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { salonId: string; }

export const ClientsTab: React.FC<Props> = ({ salonId }) => {
  const [manualClients, setManualClients] = useState<ManualClient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<SalonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all'|'upcoming'|'frequent'|'inactive'|'recurring'>('all');
  const [expanded, setExpanded] = useState<string|null>(null);

  // Forms
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingClient, setEditingClient] = useState<ManualClient|null>(null);
  const [showRecurringForm, setShowRecurringForm] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string|null>(null);

  // New/edit form fields
  const [fName, setFName] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fBirthdate, setFBirthdate] = useState('');

  // Recurring form
  const [recDay, setRecDay] = useState(1);
  const [recTime, setRecTime] = useState('09:00');
  const [recServiceId, setRecServiceId] = useState('');
  const [recType, setRecType] = useState<RecurrenceType>('weekly');

  const today = startOfToday();

  useEffect(() => {
    if (!salonId) return;
    setLoading(true);

    // Listen to manual clients
    const unsub = onSnapshot(
      collection(db, `salons/${salonId}/manual_clients`),
      snap => setManualClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as ManualClient)))
    );

    // Load appointments
    getDocs(query(collection(db, `salons/${salonId}/appointments`), orderBy('date','desc')))
      .then(snap => setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment))))
      .catch(() => {});

    // Load services
    getDocs(collection(db, `salons/${salonId}/services`))
      .then(snap => setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as SalonService)).filter((s: any) => s.active)))
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => unsub();
  }, [salonId]);

  // Merge manual clients + appointment-derived clients
  const allClients = useMemo(() => {
    const todayStr = format(today, 'yyyy-MM-dd');
    const map = new Map<string, ManualClient & {
      totalVisits: number; totalSpent: number;
      lastVisit?: string; nextVisit?: string;
      services: string[]; source: 'manual'|'auto';
    }>();

    // Start with manual clients
    manualClients.forEach(mc => {
      const phone = mc.phone.replace(/\D/g,'');
      map.set(phone, {
        ...mc,
        totalVisits: 0, totalSpent: 0,
        services: [], source: 'manual',
      });
    });

    // Merge appointments
    appointments.forEach(apt => {
      if (!apt.customerPhone) return;
      const phone = apt.customerPhone.replace(/\D/g,'');
      if (!phone || phone.length < 8) return;
      const isCompleted = apt.status === 'COMPLETED';
      const isFuture = apt.date >= todayStr && apt.status !== 'CANCELLED';

      const existing = map.get(phone);
      if (!existing) {
        map.set(phone, {
          id: phone, name: apt.clientName || 'Cliente', phone,
          createdAt: Date.now(), totalVisits: isCompleted ? 1 : 0,
          totalSpent: isCompleted ? (apt.totalAmount||0) : 0,
          lastVisit: isCompleted ? apt.date : undefined,
          nextVisit: isFuture ? apt.date : undefined,
          services: apt.serviceName ? [apt.serviceName] : [],
          source: 'auto',
        });
      } else {
        if (isCompleted) {
          existing.totalVisits++;
          existing.totalSpent += apt.totalAmount||0;
          if (!existing.lastVisit || apt.date > existing.lastVisit) existing.lastVisit = apt.date;
        }
        if (isFuture && (!existing.nextVisit || apt.date < existing.nextVisit)) existing.nextVisit = apt.date;
        if (apt.serviceName && !existing.services.includes(apt.serviceName)) existing.services.push(apt.serviceName);
        if (apt.clientName && apt.clientName !== 'Cliente' && (existing.name === 'Cliente' || existing.name === phone)) existing.name = apt.clientName;
      }
    });

    return Array.from(map.values()).sort((a,b) => {
      if (a.nextVisit && !b.nextVisit) return -1;
      if (!a.nextVisit && b.nextVisit) return 1;
      return (b.lastVisit||'').localeCompare(a.lastVisit||'');
    });
  }, [manualClients, appointments, today]);

  // Stats
  const stats = useMemo(() => ({
    total: allClients.length,
    withUpcoming: allClients.filter(c => c.nextVisit).length,
    frequent: allClients.filter(c => c.totalVisits >= 3).length,
    recurring: manualClients.filter(c => c.recurringDay !== undefined).length,
  }), [allClients, manualClients]);

  // Filtered
  const filtered = useMemo(() => {
    let result = allClients;
    if (filter === 'upcoming')  result = result.filter(c => c.nextVisit);
    if (filter === 'frequent')  result = result.filter(c => c.totalVisits >= 3);
    if (filter === 'inactive')  result = result.filter(c => !c.nextVisit && c.totalVisits > 0);
    if (filter === 'recurring') result = result.filter(c => manualClients.find(m => m.phone.replace(/\D/g,'') === c.phone.replace(/\D/g,''))?.recurringDay !== undefined);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(s) || c.phone.replace(/\D/g,'').includes(s.replace(/\D/g,'')));
    }
    return result;
  }, [allClients, filter, search, manualClients]);

  const openNewForm = () => {
    setEditingClient(null);
    setFName(''); setFPhone(''); setFEmail(''); setFNotes(''); setFBirthdate('');
    setShowNewForm(true);
  };

  const openEditForm = (c: ManualClient) => {
    setEditingClient(c);
    setFName(c.name); setFPhone(c.phone); setFEmail(c.email||'');
    setFNotes(c.notes||''); setFBirthdate(c.birthdate||'');
    setShowNewForm(true);
  };

  const saveClient = async () => {
    if (!fName.trim() || !fPhone.trim()) { toast.error('Nome e telefone obrigatórios'); return; }
    setSaving(true);
    try {
      const phone = fPhone.replace(/\D/g,'');
      const data = {
        name: fName.trim(), phone,
        email: fEmail.trim(), notes: fNotes.trim(),
        birthdate: fBirthdate, updatedAt: Date.now(),
      };
      if (editingClient) {
        await setDoc(doc(db, `salons/${salonId}/manual_clients`, editingClient.id), { ...editingClient, ...data }, { merge: true });
        toast.success('Cliente atualizado!');
      } else {
        await addDoc(collection(db, `salons/${salonId}/manual_clients`), { ...data, createdAt: Date.now() });
        toast.success('Cliente cadastrado!');
      }
      setShowNewForm(false);
      setEditingClient(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const deleteClient = async (id: string) => {
    try {
      await deleteDoc(doc(db, `salons/${salonId}/manual_clients`, id));
      toast.success('Cliente removido.');
      setConfirmDelete(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const openRecurringForm = (c: ManualClient) => {
    setRecDay(c.recurringDay ?? 1);
    setRecTime(c.recurringTime ?? '09:00');
    setRecServiceId(c.recurringServiceId ?? '');
    setRecType(c.recurrenceType ?? 'weekly');
    setShowRecurringForm(c.id);
  };

  const saveRecurring = async (clientId: string) => {
    if (!recTime) { toast.error('Informe o horário'); return; }
    setSaving(true);
    try {
      const service = services.find(s => s.id === recServiceId);
      await setDoc(doc(db, `salons/${salonId}/manual_clients`, clientId), {
        recurringDay: recDay,
        recurringTime: recTime,
        recurringServiceId: recServiceId,
        recurringServiceName: service?.name || '',
        recurrenceType: recType,
      }, { merge: true });
      toast.success('Recorrência salva! O horário ficará bloqueado para outros clientes.');
      setShowRecurringForm(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const removeRecurring = async (clientId: string) => {
    try {
      await setDoc(doc(db, `salons/${salonId}/manual_clients`, clientId), {
        recurringDay: null, recurringTime: null,
        recurringServiceId: null, recurringServiceName: null, recurrenceType: null,
      }, { merge: true });
      toast.success('Recorrência removida.');
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Clientes</h3>
          <p className="text-xs text-muted-foreground">{allClients.length} clientes cadastrados</p>
        </div>
        <Button size="sm" onClick={openNewForm}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Novo Cliente
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: stats.total, icon: <Users className="h-3.5 w-3.5" />, color: 'text-primary' },
          { label: 'Agendados', value: stats.withUpcoming, icon: <Calendar className="h-3.5 w-3.5" />, color: 'text-emerald-600' },
          { label: 'Frequentes', value: stats.frequent, icon: <TrendingUp className="h-3.5 w-3.5" />, color: 'text-amber-600' },
          { label: 'Recorrentes', value: stats.recurring, icon: <Repeat className="h-3.5 w-3.5" />, color: 'text-violet-600' },
        ].map(s => (
          <Card key={s.label} className="border-none shadow-sm">
            <CardContent className="pt-3 pb-2.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">{s.icon} {s.label}</div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: `Todos (${stats.total})` },
            { id: 'upcoming', label: `Com agenda (${stats.withUpcoming})` },
            { id: 'frequent', label: `Frequentes (${stats.frequent})` },
            { id: 'recurring', label: `Recorrentes (${stats.recurring})` },
            { id: 'inactive', label: 'Sem retorno' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id as any)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${filter === f.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* New/Edit Form */}
      {showNewForm && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <h4 className="font-semibold text-sm">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input value={fName} onChange={e => setFName(e.target.value)} placeholder="Nome completo" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone/WhatsApp *</Label>
              <Input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="(11) 99999-9999" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@exemplo.com" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data de Aniversário</Label>
              <Input type="date" value={fBirthdate} onChange={e => setFBirthdate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Input value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Alergias, preferências, etc." className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={saveClient} disabled={saving} className="flex-1">
              {saving ? 'Salvando...' : editingClient ? 'Atualizar' : 'Cadastrar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowNewForm(false); setEditingClient(null); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum cliente encontrado</p>
          <Button className="mt-3" size="sm" onClick={openNewForm}><Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar primeiro</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => {
            const isExpanded = expanded === client.phone;
            const manualData = manualClients.find(m => m.phone.replace(/\D/g,'') === client.phone.replace(/\D/g,''));
            const hasRecurring = manualData?.recurringDay !== undefined && manualData?.recurringDay !== null;
            const isManual = !!manualData;

            return (
              <div key={client.phone} className={`rounded-xl border transition-all ${client.nextVisit ? 'border-primary/30 bg-primary/5' : hasRecurring ? 'border-violet-200 bg-violet-50/30' : 'border-border bg-background'}`}>

                {/* Header */}
                <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : client.phone)}>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${client.nextVisit ? 'bg-primary text-primary-foreground' : hasRecurring ? 'bg-violet-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{client.name}</p>
                      {hasRecurring && <Repeat className="h-3 w-3 text-violet-500 shrink-0" aria-label="Agendamento recorrente" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtPhone(client.phone)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {client.nextVisit && <Badge className="bg-emerald-100 text-emerald-800 text-[10px] border-0 px-1.5 py-0">Agendado</Badge>}
                    {hasRecurring && <Badge className="bg-violet-100 text-violet-800 text-[10px] border-0 px-1.5 py-0">🔄 {REC_OPTIONS.find(r => r.value === manualData?.recurrenceType)?.label || 'Recorrente'}</Badge>}
                    {client.totalVisits >= 5 && <Badge className="bg-amber-100 text-amber-800 text-[10px] border-0 px-1.5 py-0">⭐ Fiel</Badge>}
                    <span className="text-[10px] text-muted-foreground">{client.totalVisits} visita{client.totalVisits !== 1 ? 's' : ''}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="border-t px-3 pb-3 pt-2 space-y-3">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Visitas</p>
                        <p className="font-bold text-sm">{client.totalVisits}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Total gasto</p>
                        <p className="font-bold text-sm text-primary">R$ {client.totalSpent.toFixed(0)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Ticket médio</p>
                        <p className="font-bold text-sm">{client.totalVisits > 0 ? `R$ ${(client.totalSpent/client.totalVisits).toFixed(0)}` : '—'}</p>
                      </div>
                    </div>

                    {/* Recurring info */}
                    {hasRecurring && manualData && (
                      <div className="rounded-lg bg-violet-50 border border-violet-200 p-2.5">
                        <p className="text-xs font-semibold text-violet-700 mb-1 flex items-center gap-1">
                          <Repeat className="h-3 w-3" /> Agendamento Recorrente
                        </p>
                        <p className="text-xs text-violet-800">
                          {REC_OPTIONS.find(r => r.value === manualData.recurrenceType)?.label} — {DAY_NAMES[manualData.recurringDay!]}s às {manualData.recurringTime}
                          {manualData.recurringServiceName && ` — ${manualData.recurringServiceName}`}
                        </p>
                        <p className="text-[10px] text-violet-600 mt-1">🔒 Este horário está bloqueado para outros clientes</p>
                      </div>
                    )}

                    {/* Next appointment */}
                    {client.nextVisit && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs">
                        <p className="font-semibold text-emerald-700 mb-0.5">Próximo agendamento</p>
                        {appointments.filter(a => a.customerPhone?.replace(/\D/g,'') === client.phone.replace(/\D/g,'') && a.date >= format(today,'yyyy-MM-dd') && a.status !== 'CANCELLED')
                          .slice(0,1).map(a => (
                          <p key={a.id} className="text-emerald-800">
                            {format(parseISO(a.date),"EEE, dd/MM", {locale:ptBR})} às {a.startTime} — {a.serviceName}
                          </p>
                        ))}
                      </div>
                    )}

                    {client.lastVisit && (
                      <p className="text-xs text-muted-foreground">
                        Última visita: {format(parseISO(client.lastVisit), "dd 'de' MMMM 'de' yyyy", {locale:ptBR})}
                      </p>
                    )}

                    {(client.services ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(client.services ?? []).slice(0,4).map(s => (
                          <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{s}</span>
                        ))}
                        {(client.services ?? []).length > 4 && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">+{(client.services ?? []).length - 4}</span>}
                      </div>
                    )}

                    {/* Recurring form */}
                    {showRecurringForm === manualData?.id && (
                      <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-3 space-y-3">
                        <p className="text-xs font-semibold text-violet-700">🔄 Configurar Agendamento Recorrente</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Dia da semana</Label>
                            <select value={recDay} onChange={e => setRecDay(Number(e.target.value))}
                              className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs">
                              {DAY_NAMES.map((d,i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Horário</Label>
                            <input type="time" value={recTime} onChange={e => setRecTime(e.target.value)}
                              className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Frequência</Label>
                            <select value={recType} onChange={e => setRecType(e.target.value as RecurrenceType)}
                              className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs">
                              {REC_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Serviço (opcional)</Label>
                            <select value={recServiceId} onChange={e => setRecServiceId(e.target.value)}
                              className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs">
                              <option value="">Qualquer serviço</option>
                              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <p className="text-[10px] text-violet-600">O horário ficará bloqueado automaticamente na agenda pública para que outros clientes não consigam agendar no mesmo horário.</p>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700" onClick={() => saveRecurring(manualData!.id)} disabled={saving}>
                            {saving ? 'Salvando...' : 'Salvar Recorrência'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setShowRecurringForm(null)}>Cancelar</Button>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <a href={`https://wa.me/55${client.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá, ${client.name}! Tudo bem?`)}`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-xl border-2 border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors">
                        <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                      </a>

                      {isManual && (
                        <>
                          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5" onClick={() => openEditForm(manualData!)}>
                            <Edit2 className="h-3 w-3 mr-1" /> Editar
                          </Button>
                          <Button size="sm" variant="outline" className={`text-xs h-7 px-2.5 ${hasRecurring ? 'text-violet-700 border-violet-200' : 'text-violet-600'}`}
                            onClick={() => hasRecurring ? removeRecurring(manualData!.id) : openRecurringForm(manualData!)}>
                            <Repeat className="h-3 w-3 mr-1" />
                            {hasRecurring ? 'Remover recorrência' : 'Definir recorrência'}
                          </Button>
                          {showRecurringForm !== manualData?.id && !hasRecurring && null}
                          {confirmDelete === manualData?.id ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-red-600">Confirmar exclusão?</span>
                              <button onClick={() => deleteClient(manualData!.id)} className="rounded bg-red-500 text-white px-2 py-0.5 text-xs">Sim</button>
                              <button onClick={() => setConfirmDelete(null)} className="rounded border px-2 py-0.5 text-xs">Não</button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                              onClick={() => setConfirmDelete(manualData!.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </>
                      )}

                      {!isManual && (
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2.5" onClick={async () => {
                          await addDoc(collection(db, `salons/${salonId}/manual_clients`), {
                            name: client.name, phone: client.phone.replace(/\D/g,''),
                            createdAt: Date.now(),
                          });
                          toast.success('Cliente salvo no cadastro! Agora você pode editar e configurar recorrência.');
                        }}>
                          <Plus className="h-3 w-3 mr-1" /> Salvar no cadastro
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
