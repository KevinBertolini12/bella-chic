import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy, addDoc, setDoc, doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Appointment, SalonService } from '../../types';
import { format, parseISO, addWeeks, addMonths, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Phone, Calendar, Trash2, ChevronDown, ChevronUp, MessageSquare, User, Repeat, Search } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { toast } from 'sonner';
import { salonService } from '../../services/salonService';

// ─── Types ───────────────────────────────────────────────────────────────────
type RecurrenceType = 'weekly' | 'biweekly' | 'monthly';

interface ManualClient {
  id: string;
  name: string;
  phone: string;
  createdAt: number;
  professionalId: string;
  recurringDay?: number;
  recurringTime?: string;
  recurringServiceId?: string;
  recurringServiceName?: string;
  recurrenceType?: RecurrenceType;
}

const DAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string; weeks: number | null }[] = [
  { value: 'weekly',   label: 'Toda semana',       weeks: 1 },
  { value: 'biweekly', label: 'A cada 2 semanas',  weeks: 2 },
  { value: 'monthly',  label: 'Todo mês (aprox.)', weeks: null },
];

const formatPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
};
const normalizePhone = (p: string) => p.replace(/\D/g, '');

// ─── Component ───────────────────────────────────────────────────────────────
interface Props {
  salonId: string;
  professionalId: string;
  professionalName: string;
}

export const ProfClientsTab: React.FC<Props> = ({ salonId, professionalId, professionalName }) => {
  const [manualClients, setManualClients] = useState<ManualClient[]>([]);
  const [autoClients, setAutoClients] = useState<Appointment[]>([]);
  const [services, setServices] = useState<SalonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBookForm, setShowBookForm] = useState<string | null>(null);
  const [showRecurringForm, setShowRecurringForm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // New client form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Book form
  const [bookDate, setBookDate] = useState('');
  const [bookTime, setBookTime] = useState('');
  const [bookServiceId, setBookServiceId] = useState('');
  const [bookNotes, setBookNotes] = useState('');

  // Recurring form
  const [recDay, setRecDay] = useState<number>(1);
  const [recTime, setRecTime] = useState('');
  const [recServiceId, setRecServiceId] = useState('');
  const [recType, setRecType] = useState<RecurrenceType>('weekly');

  useEffect(() => {
    if (!salonId || !professionalId) return;

    const unsub = onSnapshot(
      query(collection(db, `salons/${salonId}/manual_clients`)),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ManualClient));
        setManualClients(all.filter(c => c.professionalId === professionalId));
      }
    );

    getDocs(query(collection(db, `salons/${salonId}/appointments`), orderBy('date', 'desc'))).then(snap => {
      const apts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment))
        .filter(a => a.professionalId === professionalId);
      setAutoClients(apts);
      setLoading(false);
    });

    salonService.getServices(salonId).then(setServices);
    return () => unsub();
  }, [salonId, professionalId]);

  // Merge auto + manual by phone
  const allClients = useMemo(() => {
    const map = new Map<string, {
      name: string; phone: string; source: 'auto'|'manual'|'both';
      visits: number; manualId?: string; manualData?: ManualClient;
    }>();

    autoClients.forEach(apt => {
      if (!apt.customerPhone) return;
      const phone = normalizePhone(apt.customerPhone);
      const ex = map.get(phone);
      if (!ex) map.set(phone, { name: apt.clientName || 'Cliente', phone, source: 'auto', visits: 1 });
      else ex.visits++;
    });

    manualClients.forEach(c => {
      const phone = normalizePhone(c.phone);
      const ex = map.get(phone);
      if (!ex) map.set(phone, { name: c.name, phone, source: 'manual', visits: 0, manualId: c.id, manualData: c });
      else { ex.source = 'both'; ex.manualId = c.id; ex.manualData = c; }
    });

    return Array.from(map.values()).sort((a, b) => b.visits - a.visits);
  }, [autoClients, manualClients]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allClients;
    const s = search.toLowerCase();
    return allClients.filter(c =>
      c.name.toLowerCase().includes(s) || c.phone.includes(s.replace(/\D/g,''))
    );
  }, [allClients, search]);

  const handleAddClient = async () => {
    if (!newName.trim() || !newPhone.trim()) { toast.error('Nome e telefone são obrigatórios'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/manual_clients`), {
        name: newName.trim(), phone: newPhone.replace(/\D/g,''),
        professionalId, createdAt: Date.now(),
      });
      toast.success('Cliente cadastrado!');
      setNewName(''); setNewPhone(''); setShowAddForm(false);
    } catch { toast.error('Erro ao cadastrar cliente'); }
    finally { setSaving(false); }
  };

  const calcEndTime = (start: string, duration: number) => {
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + duration;
    return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  };

  const handleBook = async (client: { name: string; phone: string }) => {
    if (!bookDate || !bookTime || !bookServiceId) { toast.error('Preencha data, horário e serviço'); return; }
    const service = services.find(s => s.id === bookServiceId);
    if (!service) return;
    setSaving(true);
    try {
      const aptData = {
        clientId: `manual_${normalizePhone(client.phone)}`,
        clientName: client.name, customerPhone: client.phone,
        professionalId, professionalName,
        serviceId: bookServiceId, serviceName: service.name,
        date: bookDate, startTime: bookTime,
        endTime: calcEndTime(bookTime, service.duration || 30),
        status: 'CONFIRMED', totalAmount: service.price, createdAt: Date.now(),
        notes: bookNotes || undefined,
        depositRequired: false, depositStatus: 'NOT_REQUIRED',
      };
      await salonService.createAppointment(salonId, aptData as any);
      toast.success(`Agendamento criado para ${client.name}!`);
      // Notifica cliente via WhatsApp (best-effort)
      fetch('/api/appointments/notify-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonId, appointment: aptData }),
      }).catch(() => {});
      setShowBookForm(null); setBookDate(''); setBookTime(''); setBookServiceId(''); setBookNotes('');
    } catch (e: any) { toast.error('Erro: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleSaveRecurring = async (manualId: string, client: { name: string; phone: string }) => {
    if (!recTime || !recServiceId) { toast.error('Preencha horário e serviço'); return; }
    const service = services.find(s => s.id === recServiceId);
    setSaving(true);
    try {
      await setDoc(doc(db, `salons/${salonId}/manual_clients`, manualId), {
        recurringDay: recDay, recurringTime: recTime,
        recurringServiceId: recServiceId, recurringServiceName: service?.name || '',
        recurrenceType: recType,
      }, { merge: true });

      // Create occurrences
      const endTime = calcEndTime(recTime, service?.duration || 30);
      const today = startOfToday();
      let d = new Date(today);
      while (d.getDay() !== recDay) d = new Date(d.getTime() + 86400000);

      const OCCURRENCES = recType === 'monthly' ? 3 : recType === 'biweekly' ? 6 : 8;
      const created: string[] = [];

      for (let i = 0; i < OCCURRENCES; i++) {
        const dateStr = format(d, 'yyyy-MM-dd');
        const exists = autoClients.find(a =>
          a.date === dateStr && a.startTime === recTime &&
          a.professionalId === professionalId && a.clientName === client.name
        );
        if (!exists) {
          await salonService.createAppointment(salonId, {
            clientId: `manual_${normalizePhone(client.phone)}`,
            clientName: client.name, customerPhone: client.phone,
            professionalId, professionalName,
            serviceId: recServiceId, serviceName: service?.name || '',
            date: dateStr, startTime: recTime, endTime,
            status: 'CONFIRMED', totalAmount: service?.price || 0,
            createdAt: Date.now(), isRecurring: true,
            recurrenceType: recType,
            depositRequired: false, depositStatus: 'NOT_REQUIRED',
          } as any);
          created.push(dateStr);
        }

        if (recType === 'monthly') d = addMonths(d, 1);
        else d = addWeeks(d, recType === 'biweekly' ? 2 : 1);
      }

      const label = RECURRENCE_OPTIONS.find(r => r.value === recType)?.label || '';
      toast.success(`Horário fixo salvo! ${created.length} agendamento(s) criado(s) — ${label}`);
      setShowRecurringForm(null);
    } catch (e: any) { toast.error('Erro: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleRemoveClient = async (manualId: string) => {
    if (!confirm('Remover este cliente da sua lista?')) return;
    await deleteDoc(doc(db, `salons/${salonId}/manual_clients`, manualId));
    toast.success('Cliente removido');
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center space-y-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        <p className="text-sm text-muted-foreground">Carregando clientes...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground shrink-0">{allClients.length} cliente{allClients.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowAddForm(v => !v)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Novo cliente
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou telefone..." value={search}
          onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Add form */}
      {showAddForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 space-y-3">
            <p className="font-semibold text-sm">Cadastrar cliente manualmente</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input placeholder="Nome completo" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefone *</Label>
                <Input placeholder="(11) 99999-9999" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddClient} disabled={saving} className="flex-1">
                {saving ? 'Salvando...' : 'Cadastrar'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => {
            const isExp = expanded === client.phone;
            const md = client.manualData;
            const recLabel = md?.recurrenceType ? RECURRENCE_OPTIONS.find(r => r.value === md.recurrenceType)?.label : null;
            const hasRec = md?.recurringDay !== undefined;

            return (
              <div key={client.phone} className={`rounded-xl border transition-all ${hasRec ? 'border-primary/30 bg-primary/5' : 'border-border bg-background'}`}>
                {/* Header row */}
                <div className="flex items-center gap-2.5 p-3 cursor-pointer" onClick={() => setExpanded(isExp ? null : client.phone)}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${client.source === 'manual' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'}`}>
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{formatPhone(client.phone)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasRec && (
                      <Badge className="bg-primary/10 text-primary text-[10px] px-1.5 border-0 hidden sm:flex items-center gap-0.5">
                        <Repeat className="h-2.5 w-2.5" /> {recLabel || 'Fixo'}
                      </Badge>
                    )}
                    {hasRec && <Repeat className="h-3.5 w-3.5 text-primary sm:hidden" />}
                    {client.visits > 0 && <span className="text-[10px] text-muted-foreground">{client.visits}x</span>}
                  </div>
                  {isExp ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </div>

                {/* Expanded */}
                {isExp && (
                  <div className="border-t px-3 pb-3 pt-3 space-y-3">
                    {/* Recurring info */}
                    {hasRec && md && (
                      <div className="rounded-lg bg-primary/10 p-2.5 text-sm">
                        <p className="font-semibold text-primary text-xs mb-0.5 flex items-center gap-1">
                          <Repeat className="h-3.5 w-3.5" /> Horário fixo — {recLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {DAY_NAMES[md.recurringDay!]}s às {md.recurringTime} — {md.recurringServiceName}
                        </p>
                      </div>
                    )}

                    {/* Action buttons - 2 col grid on mobile */}
                    <div className="grid grid-cols-2 gap-2">
                      <a href={`https://wa.me/55${normalizePhone(client.phone)}`} target="_blank" rel="noreferrer" className="col-span-1">
                        <Button size="sm" variant="outline" className="w-full border-green-200 text-green-700 hover:bg-green-50 text-xs">
                          <MessageSquare className="h-3.5 w-3.5 mr-1" /> WhatsApp
                        </Button>
                      </a>
                      <Button size="sm" variant="outline" className="text-xs"
                        onClick={() => setShowBookForm(showBookForm === client.phone ? null : client.phone)}>
                        <Calendar className="h-3.5 w-3.5 mr-1" /> Agendar
                      </Button>
                      {client.manualId && (
                        <>
                          <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/5 text-xs"
                            onClick={() => {
                              setShowRecurringForm(showRecurringForm === client.manualId ? null : client.manualId!);
                              setRecDay(md?.recurringDay ?? 1);
                              setRecTime(md?.recurringTime ?? '');
                              setRecServiceId(md?.recurringServiceId ?? '');
                              setRecType(md?.recurrenceType ?? 'weekly');
                            }}>
                            <Repeat className="h-3.5 w-3.5 mr-1" /> {hasRec ? 'Editar fixo' : 'Horário fixo'}
                          </Button>
                          <Button size="sm" variant="outline" className="border-red-200 text-red-500 hover:bg-red-50 text-xs"
                            onClick={() => handleRemoveClient(client.manualId!)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Book form */}
                    {showBookForm === client.phone && (
                      <div className="rounded-xl border bg-background p-3 space-y-3">
                        <p className="text-sm font-semibold">Agendar para {client.name}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Data *</Label>
                            <Input type="date" value={bookDate} min={format(startOfToday(), 'yyyy-MM-dd')}
                              onChange={e => setBookDate(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Horário *</Label>
                            <Input type="time" value={bookTime} onChange={e => setBookTime(e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Serviço *</Label>
                          <select value={bookServiceId} onChange={e => setBookServiceId(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                            <option value="">Selecione...</option>
                            {services.map(s => <option key={s.id} value={s.id}>{s.name} — R$ {(s.price ?? 0).toFixed(2)}</option>)}
                          </select>
                        </div>
                        <Input placeholder="Observação (opcional)" value={bookNotes} onChange={e => setBookNotes(e.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1" onClick={() => handleBook(client)} disabled={saving}>
                            {saving ? 'Criando...' : 'Criar agendamento'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setShowBookForm(null)}>Cancelar</Button>
                        </div>
                      </div>
                    )}

                    {/* Recurring form */}
                    {showRecurringForm === client.manualId && (
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          <Repeat className="h-4 w-4 text-primary" /> Horário fixo recorrente
                        </p>

                        {/* Recurrence type selector */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">Frequência *</Label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {RECURRENCE_OPTIONS.map(opt => (
                              <button key={opt.value} type="button"
                                onClick={() => setRecType(opt.value)}
                                className={`rounded-lg border py-2 px-1 text-xs font-medium transition-colors ${recType === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:border-primary/50'}`}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Dia da semana *</Label>
                            <select value={recDay} onChange={e => setRecDay(Number(e.target.value))}
                              className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                              {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Horário *</Label>
                            <Input type="time" value={recTime} onChange={e => setRecTime(e.target.value)} />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Serviço *</Label>
                          <select value={recServiceId} onChange={e => setRecServiceId(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                            <option value="">Selecione...</option>
                            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {recType === 'weekly' && '📅 Serão criados agendamentos para as próximas 8 semanas.'}
                          {recType === 'biweekly' && '📅 Serão criados agendamentos para as próximas 6 quinzenas.'}
                          {recType === 'monthly' && '📅 Serão criados agendamentos para os próximos 3 meses.'}
                        </p>

                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1" onClick={() => handleSaveRecurring(client.manualId!, client)} disabled={saving}>
                            {saving ? 'Salvando...' : '✅ Salvar horário fixo'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setShowRecurringForm(null)}>Cancelar</Button>
                        </div>
                      </div>
                    )}
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
