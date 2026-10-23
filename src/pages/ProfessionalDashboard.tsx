import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSalon } from '../contexts/SalonContext';
import { useSettings } from '../contexts/SettingsContext';
import { salonService } from '../services/salonService';
import { Appointment } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Calendar, Clock, User, CheckCircle2, XCircle, Edit2, Loader2, Users } from 'lucide-react';
import { ProfClientsTab } from '../components/admin/ProfClientsTab';
import { format, addMinutes, parseISO, startOfToday } from 'date-fns';
import { db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APT_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING:     { label: 'Pendente',    variant: 'outline' },
  CONFIRMED:   { label: 'Confirmado',  variant: 'default' },
  COMPLETED:   { label: 'Concluído',   variant: 'secondary' },
  CANCELLED:   { label: 'Cancelado',   variant: 'destructive' },
  RESCHEDULED: { label: 'Reagendado',  variant: 'outline' },
};

const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function buildSlots(open: string, close: string): string[] {
  const slots: string[] = [];
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  let cur = oh * 60 + om;
  const end = ch * 60 + cm;
  while (cur < end) {
    slots.push(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`);
    cur += 10;
  }
  return slots;
}

const ProfSkeleton = () => (
  <div className="container mx-auto px-4 py-12 space-y-6">
    <Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-48" />
    <div className="space-y-4">{[...Array(3)].map((_,i) => (
      <Card key={i}><CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-8 w-full" /></CardContent></Card>
    ))}</div>
  </div>
);

// ─── Dialog de reagendamento ──────────────────────────────────────────────────

interface RescheduleDialogProps {
  apt: Appointment | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, date: string, start: string, end: string) => Promise<void>;
  workingHours?: any;
}

const RescheduleDialog = ({ apt, open, onClose, onSave, workingHours }: RescheduleDialogProps) => {
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (apt) { setNewDate(apt.date); setNewTime(apt.startTime); }
  }, [apt]);

  const daySlots = useMemo(() => {
    if (!newDate) return [];
    const dayKey = DAY_KEYS[new Date(newDate + 'T00:00:00').getDay()];
    const dayConfig = workingHours?.[dayKey];
    if (!dayConfig || dayConfig.closed) return [];
    return buildSlots(dayConfig.open || '09:00', dayConfig.close || '18:00');
  }, [newDate, workingHours]);

  const handleSave = async () => {
    if (!apt || !newDate || !newTime) return;
    setSaving(true);
    try {
      const duration = apt.totalAmount > 0 ? undefined : 30;
      // calcula endTime baseado na duração original
      const startMin = newTime.split(':').map(Number).reduce((h, m) => h*60+m);
      const orig = apt.startTime.split(':').map(Number).reduce((h: number, m: number) => h*60+m);
      const origEnd = apt.endTime.split(':').map(Number).reduce((h: number, m: number) => h*60+m);
      const dur = origEnd - orig || 30;
      const endMin = startMin + dur;
      const end = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
      await onSave(apt.id!, newDate, newTime, end);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reagendar Atendimento</DialogTitle>
          <DialogDescription>
            {apt?.clientName} — {apt?.serviceName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nova data</Label>
            <Input type="date" value={newDate}
              min={format(startOfToday(), 'yyyy-MM-dd')}
              onChange={(e) => { setNewDate(e.target.value); setNewTime(''); }} />
          </div>
          <div className="space-y-2">
            <Label>Novo horário</Label>
            {daySlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Salão fechado neste dia ou data não selecionada.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                {daySlots.map((slot) => (
                  <button key={slot} type="button"
                    className={`rounded-lg border py-2 text-sm font-medium transition-colors ${newTime === slot ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary'}`}
                    onClick={() => setNewTime(slot)}>
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!newDate || !newTime || saving} onClick={handleSave}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Confirmar Reagendamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Card de agendamento ──────────────────────────────────────────────────────

const AppointmentCard = ({
  apt, showDate = false, onStatusChange, onReschedule, onAdvance, advancingId,
}: {
  apt: Appointment;
  showDate?: boolean;
  onStatusChange: (id: string, status: Appointment['status']) => void;
  onReschedule: (apt: Appointment) => void;
  onAdvance?: (apt: Appointment) => void;
  advancingId?: string | null;
}) => {
  const statusInfo = APT_STATUS[apt.status] || { label: apt.status, variant: 'outline' as const };
  const canEdit = !['CANCELLED', 'COMPLETED'].includes(apt.status);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <CardTitle className="text-base">
              {showDate ? format(new Date(apt.date + 'T00:00:00'), "dd/MM", { locale: ptBR }) + ' — ' : ''}
              {apt.startTime}–{apt.endTime} · {apt.serviceName}
            </CardTitle>
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        <CardDescription className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1"><User className="h-3 w-3" /> {apt.clientName}</span>
          {(apt as any).customerPhone && (
            <a href={`https://wa.me/55${(apt as any).customerPhone.replace(/\D/g,'')}`}
              target="_blank" rel="noreferrer"
              className="text-green-600 hover:underline text-xs font-medium">
              📱 {(apt as any).customerPhone}
            </a>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-muted-foreground">R$ {apt.totalAmount.toFixed(2)}</span>
        <div className="flex gap-2 flex-wrap">
          {canEdit && onAdvance && apt.status === 'CONFIRMED' && (
            <Button
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              disabled={advancingId === apt.id}
              onClick={() => onAdvance(apt)}
              title="Adiantar para agora e avisar o cliente"
            >
              {advancingId === apt.id
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : '⚡'}
              Adiantar
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => onReschedule(apt)}>
              <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Reagendar
            </Button>
          )}
          {apt.status === 'PENDING' && (
            <Button size="sm" onClick={() => onStatusChange(apt.id!, 'CONFIRMED')}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Confirmar
            </Button>
          )}
          {apt.status === 'CONFIRMED' && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(apt.id!, 'COMPLETED')}>
              Concluir
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
              onClick={() => onStatusChange(apt.id!, 'CANCELLED')}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

export const ProfessionalDashboard = () => {
  const { user, profile } = useAuth();
  const { salonId } = useSalon();
  const { settings } = useSettings();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [advancing, setAdvancing] = useState<string | null>(null);

  // Realtime — agenda atualiza instantaneamente
  useEffect(() => {
    if (!user || !salonId) return;
    const q = query(
      collection(db, `salons/${salonId}/appointments`),
      where('professionalId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const apts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setAppointments(apts);
      setLoading(false);
    }, () => {
      toast.error('Erro ao carregar sua agenda.');
      setLoading(false);
    });
    return () => unsub();
  }, [user, salonId]);

  const handleStatusChange = async (id: string, status: Appointment['status']) => {
    if (!salonId) return;
    try {
      await salonService.updateAppointmentStatus(salonId, id, status);
      setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status } : a));
      toast.success('Status atualizado!');

      // Dispara notificação WhatsApp para o cliente (não bloqueia o fluxo)
      const apt = appointments.find((a) => a.id === id);
      if (apt) {
        fetch('/api/appointments/notify-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salonId, appointmentId: id, newStatus: status, appointment: apt }),
        }).catch(() => {}); // silencia erros de rede — notificação é best-effort
      }
    } catch { toast.error('Erro ao atualizar status.'); }
  };

  const handleReschedule = async (id: string, date: string, start: string, end: string) => {
    if (!salonId) return;
    await salonService.rescheduleAppointment(salonId, id, date, start, end);
    setAppointments((prev) => prev.map((a) =>
      a.id === id ? { ...a, date, startTime: start, endTime: end, status: 'RESCHEDULED' } : a
    ));
    toast.success('Atendimento reagendado com sucesso!');
  };

  // Adianta o próximo cliente — recalcula horário baseado na hora atual
  const handleAdvance = async (apt: Appointment) => {
    if (!salonId || !apt.id) return;
    setAdvancing(apt.id);
    try {
      const now = new Date();
      const newStart = format(now, 'HH:mm');
      // Mantém a duração original do serviço
      const origDuration = (() => {
        const [sh, sm] = apt.startTime.split(':').map(Number);
        const [eh, em] = apt.endTime.split(':').map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
      })();
      const newEndMin = now.getHours() * 60 + now.getMinutes() + origDuration;
      const newEnd = `${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}`;

      await salonService.rescheduleAppointment(salonId, apt.id, apt.date, newStart, newEnd);

      // Avisa o cliente via WhatsApp (pelo servidor)
      const phone = (apt as any).customerPhone;
      if (phone) {
        const cleaned = phone.replace(/\D/g, '');
        const number = cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
        const msg = encodeURIComponent(
          `Olá, ${apt.clientName}! 👋\n\nBoa notícia: estamos disponíveis mais cedo! ` +
          `Você pode vir agora às *${newStart}* para seu atendimento de *${apt.serviceName}*.\n\n` +
          `Se não puder, não se preocupe — seu horário original continua confirmado. 😊`
        );
        window.open(`https://wa.me/${number}?text=${msg}`, '_blank');
      }

      toast.success(`${apt.clientName} adiantado para ${newStart}!`);
    } catch {
      toast.error('Erro ao adiantar atendimento.');
    } finally {
      setAdvancing(null);
    }
  };

  if (loading) return <ProfSkeleton />;

  const today = format(new Date(), 'yyyy-MM-dd');

  // ── Hoje: todos não cancelados (aba mostra tudo, incluindo concluídos) ──────
  const todayApts = appointments
    .filter((a) => a.date === today && a.status !== 'CANCELLED')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Contador de hoje só conta ativos (pendente + confirmado) — ao concluir, cai
  const todayActiveCount = todayApts.filter((a) => ['PENDING', 'CONFIRMED'].includes(a.status)).length;

  // ── Próximos: futuros não cancelados nem concluídos ───────────────────────
  const upcomingApts = appointments
    .filter((a) => a.date > today && !['CANCELLED', 'COMPLETED'].includes(a.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  // ── Histórico: datas passadas (não cancelados) + cancelados de qualquer data
  //    + concluídos de datas passadas. Excluímos concluídos de HOJE do histórico
  //    (eles aparecem na aba "Hoje" para o profissional acompanhar o dia)
  const historyApts = appointments
    .filter((a) =>
      (a.date < today && a.status !== 'CANCELLED') ||
      a.status === 'CANCELLED' ||
      (a.date < today && a.status === 'COMPLETED')
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const EmptyState = ({ message }: { message: string }) => (
    <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center">
      <Calendar className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
      <h3 className="text-lg font-medium">{message}</h3>
    </CardContent></Card>
  );

  return (
    <>
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Olá, {profile?.displayName || 'Profissional'} 👋</h1>
          <p className="text-muted-foreground">Gerencie seus atendimentos e horários.</p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: 'Hoje',
              count: todayActiveCount,
              color: 'text-primary',
              sub: todayApts.length > todayActiveCount
                ? `${todayApts.length - todayActiveCount} concluído(s) hoje`
                : undefined,
            },
            { label: 'Próximos',  count: upcomingApts.length, color: 'text-amber-600',       sub: undefined },
            { label: 'Histórico', count: historyApts.length,  color: 'text-muted-foreground', sub: undefined },
          ].map(({ label, count, color, sub }) => (
            <Card key={label}><CardContent className="flex items-center justify-between pt-6">
              <div>
                <span className="text-sm font-medium text-muted-foreground">{label}</span>
                {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
              </div>
              <span className={`text-3xl font-bold ${color}`}>{count}</span>
            </CardContent></Card>
          ))}
        </div>

        <Tabs defaultValue="today" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[640px]">
            <TabsTrigger value="today">Hoje</TabsTrigger>
            <TabsTrigger value="upcoming">Próximos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="clients" className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Clientes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4">
            {todayApts.length === 0 ? <EmptyState message="Sem atendimentos para hoje." />
              : todayApts.map((apt) => <AppointmentCard key={apt.id} apt={apt}
                  onStatusChange={handleStatusChange} onReschedule={setRescheduleTarget}
                  onAdvance={handleAdvance} advancingId={advancing} />)}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingApts.length === 0 ? <EmptyState message="Nenhum agendamento futuro." />
              : upcomingApts.map((apt) => <AppointmentCard key={apt.id} apt={apt} showDate
                  onStatusChange={handleStatusChange} onReschedule={setRescheduleTarget} />)}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {historyApts.length === 0 ? <EmptyState message="Nenhum histórico ainda." />
              : historyApts.slice(0, 30).map((apt) => <AppointmentCard key={apt.id} apt={apt} showDate
                  onStatusChange={handleStatusChange} onReschedule={setRescheduleTarget} />)}
          </TabsContent>

          <TabsContent value="clients" className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Meus Clientes</h2>
              <p className="text-sm text-muted-foreground">Cadastre clientes manualmente, crie agendamentos e configure horários fixos.</p>
            </div>
            <ProfClientsTab
              salonId={salonId || ''}
              professionalId={user?.uid || ''}
              professionalName={profile?.displayName || 'Profissional'}
            />
          </TabsContent>
        </Tabs>
      </div>

      <RescheduleDialog
        apt={rescheduleTarget}
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onSave={handleReschedule}
        workingHours={settings?.business?.workingHours}
      />
    </>
  );
};