import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSalon } from '../../contexts/SalonContext';
import { ScheduleBlock, SalonEvent, SalonEventType } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Plus, Trash2, Edit2, Clock, Calendar, Bell,
  X, Lock, Tag, Zap, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { salonService } from '../../services/salonService';
import { Professional } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const EVENT_COLORS: { value: string; label: string; bg: string; text: string }[] = [
  { value: 'red',   label: 'Vermelho (urgente)', bg: 'bg-red-100',   text: 'text-red-700' },
  { value: 'amber', label: 'Âmbar (atenção)',    bg: 'bg-amber-100', text: 'text-amber-700' },
  { value: 'green', label: 'Verde (promoção)',   bg: 'bg-green-100', text: 'text-green-700' },
  { value: 'blue',  label: 'Azul (informativo)', bg: 'bg-blue-100',  text: 'text-blue-700' },
];

const colorBadge = (color: string) => {
  const c = EVENT_COLORS.find(x => x.value === color) || EVENT_COLORS[0];
  return `${c.bg} ${c.text}`;
};

const formatDateLabel = (event: SalonEvent) => {
  if (event.date) {
    try { return format(parseISO(event.date), "dd/MM/yyyy (EEEE)", { locale: ptBR }); }
    catch { return event.date; }
  }
  if (event.startDate && event.endDate) {
    try {
      const s = format(parseISO(event.startDate), 'dd/MM', { locale: ptBR });
      const e = format(parseISO(event.endDate), 'dd/MM', { locale: ptBR });
      return `${s} até ${e}`;
    } catch { return `${event.startDate} – ${event.endDate}`; }
  }
  return 'Data não definida';
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface EventsTabProps {
  salonId: string;
}

// ─── Empty states ─────────────────────────────────────────────────────────────

const emptyBlock = (): Partial<ScheduleBlock> => ({
  title: '',
  professionalId: 'all',
  recurring: true,
  dayOfWeek: 1,
  date: '',
  startTime: '08:00',
  endTime: '10:00',
  reason: '',
  active: true,
});

const emptyEvent = (): Partial<SalonEvent> => ({
  type: 'closure',
  title: '',
  description: '',
  date: '',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  discountPercent: 0,
  serviceIds: [],
  color: 'red',
  active: true,
});

// ─── Main component ───────────────────────────────────────────────────────────

export const EventsTab = ({ salonId }: EventsTabProps) => {
  const { profile } = useAuth();
  const { salon } = useSalon();

  const [activeTab, setActiveTab] = useState<'events' | 'blocks'>('events');
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [events, setEvents] = useState<SalonEvent[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [blockDialog, setBlockDialog] = useState(false);
  const [blockForm, setBlockForm] = useState<Partial<ScheduleBlock>>(emptyBlock());
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [savingBlock, setSavingBlock] = useState(false);

  const [eventDialog, setEventDialog] = useState(false);
  const [eventForm, setEventForm] = useState<Partial<SalonEvent>>(emptyEvent());
  const [editingEvent, setEditingEvent] = useState<SalonEvent | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const q1 = query(collection(db, `salons/${salonId}/schedule_blocks`), orderBy('createdAt', 'desc'));
    const q2 = query(collection(db, `salons/${salonId}/events`), orderBy('createdAt', 'desc'));
    const u1 = onSnapshot(q1, snap => {
      setBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleBlock)));
      setLoading(false);
    }, () => setLoading(false));
    const u2 = onSnapshot(q2, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as SalonEvent)));
    });
    return () => { u1(); u2(); };
  }, [salonId]);

  useEffect(() => {
    salonService.getProfessionals(salonId, false).then(setProfessionals).catch(() => {});
    salonService.getServices(salonId).then(setServices).catch(() => {});
  }, [salonId]);

  // ── Block handlers ─────────────────────────────────────────────────────────
  const openNewBlock = () => {
    setEditingBlock(null);
    setBlockForm(emptyBlock());
    setBlockDialog(true);
  };

  const openEditBlock = (b: ScheduleBlock) => {
    setEditingBlock(b);
    setBlockForm({ ...b });
    setBlockDialog(true);
  };

  const saveBlock = async () => {
    if (!blockForm.title?.trim()) { toast.error('Informe o título do bloqueio.'); return; }
    if (!blockForm.startTime || !blockForm.endTime) { toast.error('Informe os horários.'); return; }
    if (!blockForm.recurring && !blockForm.date) { toast.error('Informe a data.'); return; }

    setSavingBlock(true);
    try {
      const profName = blockForm.professionalId === 'all'
        ? 'Todas as quadras/recursos'
        : professionals.find(p => p.id === blockForm.professionalId)?.displayName || '';

      const data: any = {
        salonId,
        title: blockForm.title,
        professionalId: blockForm.professionalId || 'all',
        professionalName: profName,
        recurring: !!blockForm.recurring,
        dayOfWeek: blockForm.recurring ? (blockForm.dayOfWeek ?? 1) : null,
        date: !blockForm.recurring ? (blockForm.date || null) : null,
        startTime: blockForm.startTime,
        endTime: blockForm.endTime,
        reason: blockForm.reason || '',
        active: true,
        updatedAt: Date.now(),
      };

      if (editingBlock) {
        await updateDoc(doc(db, `salons/${salonId}/schedule_blocks`, editingBlock.id), data);
        toast.success('Bloqueio atualizado!');
      } else {
        await addDoc(collection(db, `salons/${salonId}/schedule_blocks`), { ...data, createdAt: Date.now() });
        toast.success('Bloqueio criado!');
      }
      setBlockDialog(false);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar bloqueio.');
    } finally {
      setSavingBlock(false);
    }
  };

  const deleteBlock = async (b: ScheduleBlock) => {
    if (!confirm(`Excluir bloqueio "${b.title}"?`)) return;
    await deleteDoc(doc(db, `salons/${salonId}/schedule_blocks`, b.id));
    toast.success('Bloqueio removido.');
  };

  const toggleBlock = async (b: ScheduleBlock) => {
    await updateDoc(doc(db, `salons/${salonId}/schedule_blocks`, b.id), {
      active: !b.active, updatedAt: Date.now(),
    });
    toast.success(b.active ? 'Bloqueio desativado.' : 'Bloqueio ativado.');
  };

  // ── Event handlers ─────────────────────────────────────────────────────────
  const openNewEvent = () => {
    setEditingEvent(null);
    setEventForm(emptyEvent());
    setEventDialog(true);
  };

  const openEditEvent = (e: SalonEvent) => {
    setEditingEvent(e);
    setEventForm({ ...e });
    setEventDialog(true);
  };

  const saveEvent = async () => {
    if (!eventForm.title?.trim()) { toast.error('Informe o título do evento.'); return; }
    if (eventForm.type === 'closure' && !eventForm.date && !eventForm.startDate) {
      toast.error('Informe a data ou período do fechamento.'); return;
    }
    if (eventForm.type === 'promotion' && !eventForm.date && !eventForm.startDate) {
      toast.error('Informe a data da promoção.'); return;
    }

    setSavingEvent(true);
    try {
      const data: any = {
        salonId,
        type: eventForm.type,
        title: eventForm.title,
        description: eventForm.description || '',
        date: eventForm.date || null,
        startDate: eventForm.startDate || null,
        endDate: eventForm.endDate || null,
        startTime: eventForm.startTime || null,
        endTime: eventForm.endTime || null,
        discountPercent: eventForm.discountPercent || 0,
        serviceIds: eventForm.serviceIds || [],
        color: eventForm.color || 'red',
        active: true,
        notificationSent: false,
        updatedAt: Date.now(),
      };

      if (editingEvent) {
        await updateDoc(doc(db, `salons/${salonId}/events`, editingEvent.id), data);
        toast.success('Evento atualizado!');
      } else {
        await addDoc(collection(db, `salons/${salonId}/events`), { ...data, createdAt: Date.now() });
        toast.success('Evento criado!');
      }

      // Envia push notification se configurado
      if (!editingEvent || !editingEvent.notificationSent) {
        const token = await import('../../firebase').then(m => m.auth.currentUser?.getIdToken());
        if (token) {
          fetch('/api/events/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ salonId, event: data }),
          }).catch(() => {});
        }
      }

      setEventDialog(false);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar evento.');
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteEvent = async (e: SalonEvent) => {
    if (!confirm(`Excluir evento "${e.title}"?`)) return;
    await deleteDoc(doc(db, `salons/${salonId}/events`, e.id));
    toast.success('Evento removido.');
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;

  const activeBlocks  = blocks.filter(b => b.active);
  const inactiveBlocks = blocks.filter(b => !b.active);
  const upcomingEvents = events.filter(e => {
    const d = e.date || e.endDate;
    if (!d) return true;
    return d >= new Date().toISOString().split('T')[0];
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-rose-600" /> Eventos & Bloqueios
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Bloqueie horários específicos (ex: treino da escolinha) e crie eventos de promoção ou fechamento.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Bloqueios ativos', value: activeBlocks.length, icon: Lock, color: 'bg-amber-50 text-amber-600' },
          { label: 'Eventos futuros', value: upcomingEvents.length, icon: Calendar, color: 'bg-blue-50 text-blue-600' },
          { label: 'Fechamentos', value: events.filter(e => e.type === 'closure' && e.active).length, icon: X, color: 'bg-red-50 text-red-600' },
          { label: 'Promoções', value: events.filter(e => e.type === 'promotion' && e.active).length, icon: Tag, color: 'bg-green-50 text-green-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`h-9 w-9 rounded-xl ${color} flex items-center justify-center shrink-0`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="events" className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Eventos
          </TabsTrigger>
          <TabsTrigger value="blocks" className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Bloqueios de Horário
          </TabsTrigger>
        </TabsList>

        {/* ── EVENTOS ─────────────────────────────────────────────────────── */}
        <TabsContent value="events" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Crie fechamentos (dia inteiro bloqueado) ou promoções em destaque.
            </p>
            <Button size="sm" onClick={openNewEvent}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo Evento
            </Button>
          </div>

          {/* Info banner */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 flex items-start gap-3">
            <Bell className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Notificação automática</p>
              <p>Ao salvar um evento, todos os clientes com push ativado recebem uma notificação automática.</p>
            </div>
          </div>

          {events.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Calendar className="mx-auto mb-3 h-10 w-10 opacity-20" />
              <p>Nenhum evento criado ainda.</p>
              <p className="text-sm mt-1">Crie um fechamento ou promoção para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map(event => (
                <Card key={event.id} className={`border-0 shadow-sm ${!event.active ? 'opacity-50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        event.type === 'closure' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {event.type === 'closure' ? <X className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{event.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${colorBadge(event.color)}`}>
                            {event.type === 'closure' ? 'FECHAMENTO' : 'PROMOÇÃO'}
                          </span>
                          {!event.active && <span className="text-[10px] text-slate-400 font-medium">INATIVO</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDateLabel(event)}</p>
                        {event.description && <p className="text-xs text-slate-600 mt-1">{event.description}</p>}
                        {event.type === 'promotion' && (
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {event.startTime && <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{event.startTime}{event.endTime ? `–${event.endTime}` : ''}</span>}
                            {event.discountPercent ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">-{event.discountPercent}%</span> : null}
                            {event.serviceIds && event.serviceIds.length > 0 && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                {event.serviceIds.length} serviço(s)
                              </span>
                            )}
                          </div>
                        )}
                        {event.notificationSent && (
                          <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                            <Bell className="h-3 w-3" /> Notificação enviada
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditEvent(event)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteEvent(event)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── BLOQUEIOS ────────────────────────────────────────────────────── */}
        <TabsContent value="blocks" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Bloqueie horários fixos (ex: treino semanal) ou pontuais (ex: manutenção).
            </p>
            <Button size="sm" onClick={openNewBlock}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo Bloqueio
            </Button>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Horários bloqueados aparecem cinza na agenda pública — o cliente não consegue agendar naquele intervalo.</p>
          </div>

          {blocks.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Lock className="mx-auto mb-3 h-10 w-10 opacity-20" />
              <p>Nenhum bloqueio configurado.</p>
              <p className="text-sm mt-1">Ex: toda segunda das 18h às 20h a quadra está ocupada com o treino.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blocks.map(block => (
                <Card key={block.id} className={`border-0 shadow-sm ${!block.active ? 'opacity-50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        block.active ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Lock className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{block.title}</p>
                          {block.recurring
                            ? <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">RECORRENTE</span>
                            : <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">PONTUAL</span>}
                          {!block.active && <span className="text-[10px] text-slate-400">INATIVO</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {block.recurring
                            ? `Toda ${DAY_NAMES[block.dayOfWeek ?? 0]}`
                            : block.date
                              ? (() => { try { return format(parseISO(block.date), "dd/MM/yyyy", { locale: ptBR }); } catch { return block.date; } })()
                              : 'Data não definida'}
                          {' '}{block.startTime}–{block.endTime}
                        </p>
                        <p className="text-xs text-slate-500">
                          {block.professionalName || 'Todos os recursos'}
                          {block.reason && ` · ${block.reason}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleBlock(block)}
                          className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${
                            block.active ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}>
                          {block.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditBlock(block)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteBlock(block)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Criar/editar bloqueio ───────────────────────────────── */}
      <Dialog open={blockDialog} onOpenChange={o => !o && setBlockDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBlock ? 'Editar Bloqueio' : 'Novo Bloqueio de Horário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={blockForm.title || ''} onChange={e => setBlockForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Ex: Treino da escolinha" />
            </div>

            <div className="space-y-1.5">
              <Label>Recurso/Quadra</Label>
              <Select value={blockForm.professionalId || 'all'} onValueChange={v => setBlockForm(p => ({ ...p, professionalId: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os recursos</SelectItem>
                  {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início *</Label>
                <Input type="time" value={blockForm.startTime || ''} onChange={e => setBlockForm(p => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Fim *</Label>
                <Input type="time" value={blockForm.endTime || ''} onChange={e => setBlockForm(p => ({ ...p, endTime: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de recorrência</Label>
              <div className="flex gap-2">
                <button onClick={() => setBlockForm(p => ({ ...p, recurring: true }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${blockForm.recurring ? 'border-primary bg-primary text-primary-foreground' : 'border-muted hover:border-primary/50'}`}>
                  Semanal (recorrente)
                </button>
                <button onClick={() => setBlockForm(p => ({ ...p, recurring: false }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${!blockForm.recurring ? 'border-primary bg-primary text-primary-foreground' : 'border-muted hover:border-primary/50'}`}>
                  Data específica
                </button>
              </div>
            </div>

            {blockForm.recurring ? (
              <div className="space-y-1.5">
                <Label>Dia da semana *</Label>
                <Select value={String(blockForm.dayOfWeek ?? 1)} onValueChange={v => setBlockForm(p => ({ ...p, dayOfWeek: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={blockForm.date || ''} min={new Date().toISOString().split('T')[0]}
                  onChange={e => setBlockForm(p => ({ ...p, date: e.target.value }))} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Input value={blockForm.reason || ''} onChange={e => setBlockForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="Ex: reservado para aula particular" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setBlockDialog(false)}>Cancelar</Button>
            <Button className="flex-1" disabled={savingBlock} onClick={saveBlock}>
              {savingBlock ? 'Salvando...' : editingBlock ? 'Atualizar' : 'Criar Bloqueio'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Criar/editar evento ─────────────────────────────────── */}
      <Dialog open={eventDialog} onOpenChange={o => !o && setEventDialog(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Editar Evento' : 'Novo Evento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de evento</Label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setEventForm(p => ({ ...p, type: 'closure', color: 'red' }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${eventForm.type === 'closure' ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <X className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-semibold text-red-700">Fechamento</span>
                  </div>
                  <p className="text-xs text-slate-500">Bloqueia o dia inteiro. Ninguém consegue agendar.</p>
                </button>
                <button onClick={() => setEventForm(p => ({ ...p, type: 'promotion', color: 'green' }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${eventForm.type === 'promotion' ? 'border-green-500 bg-green-50' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-700">Promoção</span>
                  </div>
                  <p className="text-xs text-slate-500">Destaque de horários com preço especial.</p>
                </button>
              </div>
            </div>

            {/* Título */}
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={eventForm.title || ''} onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))}
                placeholder={eventForm.type === 'closure' ? 'Ex: Feriado — fechado amanhã' : 'Ex: Promoção de segunda-feira'} />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Textarea rows={2} value={eventForm.description || ''}
                onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Mais detalhes sobre o evento..." />
            </div>

            {/* Data */}
            <div className="space-y-2">
              <Label>Data do evento</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Dia único</p>
                  <Input type="date" value={eventForm.date || ''} min={new Date().toISOString().split('T')[0]}
                    onChange={e => setEventForm(p => ({ ...p, date: e.target.value, startDate: '', endDate: '' }))} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Início período</p>
                  <Input type="date" value={eventForm.startDate || ''} min={new Date().toISOString().split('T')[0]}
                    onChange={e => setEventForm(p => ({ ...p, startDate: e.target.value, date: '' }))} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Fim período</p>
                  <Input type="date" value={eventForm.endDate || ''} min={eventForm.startDate || new Date().toISOString().split('T')[0]}
                    onChange={e => setEventForm(p => ({ ...p, endDate: e.target.value, date: '' }))} />
                </div>
              </div>
            </div>

            {/* Campos específicos de promoção */}
            {eventForm.type === 'promotion' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Hora início</Label>
                    <Input type="time" value={eventForm.startTime || ''} onChange={e => setEventForm(p => ({ ...p, startTime: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Hora fim</Label>
                    <Input type="time" value={eventForm.endTime || ''} onChange={e => setEventForm(p => ({ ...p, endTime: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Desconto %</Label>
                    <Input type="number" min={0} max={100} value={eventForm.discountPercent || 0}
                      onChange={e => setEventForm(p => ({ ...p, discountPercent: Number(e.target.value) }))} />
                  </div>
                </div>

                {services.length > 0 && (
                  <div className="space-y-2">
                    <Label>Serviços em promoção</Label>
                    <p className="text-xs text-muted-foreground">Deixe em branco para todos os serviços.</p>
                    <div className="flex flex-wrap gap-2">
                      {services.map(s => {
                        const selected = (eventForm.serviceIds || []).includes(s.id);
                        return (
                          <button key={s.id}
                            onClick={() => setEventForm(p => ({
                              ...p,
                              serviceIds: selected
                                ? (p.serviceIds || []).filter(id => id !== s.id)
                                : [...(p.serviceIds || []), s.id],
                            }))}
                            className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
                              selected ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-200 hover:border-primary/50'
                            }`}>
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Cor do badge */}
            <div className="space-y-2">
              <Label>Cor do destaque</Label>
              <div className="flex gap-2">
                {EVENT_COLORS.map(c => (
                  <button key={c.value} onClick={() => setEventForm(p => ({ ...p, color: c.value }))}
                    className={`flex-1 py-2 rounded-lg border-2 text-xs font-medium transition-all ${c.bg} ${c.text} ${eventForm.color === c.value ? 'border-current' : 'border-transparent opacity-60 hover:opacity-90'}`}>
                    {c.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2">
              <Bell className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Uma notificação push será enviada automaticamente para clientes que instalaram o app ao salvar.</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setEventDialog(false)}>Cancelar</Button>
            <Button className="flex-1" disabled={savingEvent} onClick={saveEvent}>
              {savingEvent ? 'Salvando...' : editingEvent ? 'Atualizar' : 'Criar Evento'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
