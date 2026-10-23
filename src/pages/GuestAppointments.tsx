import React, { useState } from 'react';
import { useSalon } from '../contexts/SalonContext';
import { salonService } from '../services/salonService';
import { Appointment } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { SEO } from '../components/SEO';
import { format, isAfter, parseISO, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Phone, XCircle, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

const STATUS_INFO: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING:          { label: 'Pendente',         variant: 'outline' },
  CONFIRMED:        { label: 'Confirmado',        variant: 'default' },
  COMPLETED:        { label: 'Concluído',         variant: 'secondary' },
  CANCELLED:        { label: 'Cancelado',         variant: 'destructive' },
  RESCHEDULED:      { label: 'Reagendado',        variant: 'outline' },
  AWAITING_DEPOSIT: { label: 'Aguardando Sinal',  variant: 'outline' },
};

function normalizePhone(phone: string): string {
  // Remove tudo que não for dígito
  const digits = phone.replace(/\D/g, '');
  // Remove DDI 55 se presente para comparação uniforme
  return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
}

export const GuestAppointments = () => {
  const { salonId, salon } = useSalon();

  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showBirthday, setShowBirthday] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [birthdaySaved, setBirthdaySaved] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salonId) return;

    const cleanPhone = normalizePhone(phone);
    if (cleanPhone.length < 10) {
      toast.error('Digite um número de celular válido com DDD.');
      return;
    }


    setLoading(true);
    setNotFound(false);
    setAppointments(null);

    try {
      const matched = await salonService.getAppointmentsByPhone(salonId, cleanPhone);

      if (matched.length === 0) {
        setNotFound(true);
      } else {
        // Ordena: futuros primeiro (desc por data), depois histórico
        const sorted = [...matched].sort((a, b) => {
          const aFuture = !isAfter(startOfToday(), parseISO(a.date + 'T00:00:00'));
          const bFuture = !isAfter(startOfToday(), parseISO(b.date + 'T00:00:00'));
          if (aFuture && !bFuture) return -1;
          if (!aFuture && bFuture) return 1;
          return b.date.localeCompare(a.date);
        });
        setAppointments(sorted);
      }
    } catch {
      toast.error('Erro ao buscar agendamentos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (apt: Appointment) => {
    if (!salonId || !apt.id) return;
    if (!confirm(`Cancelar o agendamento de ${apt.serviceName} em ${formatDate(apt.date)} às ${apt.startTime}?`)) return;

    setCancellingId(apt.id);
    try {
      const r = await fetch('/api/public/appointment/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonId, appointmentId: apt.id, phone }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro ao cancelar');
      setAppointments(prev =>
        prev ? prev.map(a => a.id === apt.id ? { ...a, status: 'CANCELLED' } : a) : prev
      );
      toast.success('Agendamento cancelado com sucesso.');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cancelar. Tente novamente.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleSaveBirthday = async () => {
    if (!birthDate || !salonId) return;
    setSavingBirthday(true);
    try {
      const r = await fetch('/api/public/client/birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonId, phone, birthDate }),
      });
      if (r.ok) { setBirthdaySaved(true); toast.success('🎂 Data de nascimento salva!'); }
    } catch { toast.error('Erro ao salvar data de nascimento'); }
    setSavingBirthday(false);
  };

  const formatDate = (dateStr: string) =>
    format(parseISO(dateStr + 'T00:00:00'), "EEE, dd 'de' MMM 'de' yyyy", { locale: ptBR });

  const isFuture = (apt: Appointment) =>
    !isAfter(startOfToday(), parseISO(apt.date + 'T00:00:00')) ||
    apt.date === format(startOfToday(), 'yyyy-MM-dd');

  const canCancel = (apt: Appointment) =>
    isFuture(apt) && !['CANCELLED', 'COMPLETED'].includes(apt.status);

  const futureApts = appointments?.filter(isFuture) ?? [];
  const pastApts = appointments?.filter(a => !isFuture(a)) ?? [];

  return (
    <>
      <SEO title="Meus Agendamentos" description="Consulte e gerencie seus agendamentos" />
      <div className="container mx-auto max-w-2xl px-4 py-10">

        {/* Cabeçalho */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Calendar className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Meus Agendamentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Digite seu celular para ver seus horários
          </p>
        </div>

        {/* Formulário de busca */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Celular (WhatsApp)</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    className="pl-9"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Buscando...</>
                  : 'Ver meus agendamentos'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Não encontrado */}
        {notFound && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-3 py-5">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium text-amber-900">Nenhum agendamento encontrado</p>
                <p className="text-sm text-amber-700">
                  Verifique se o número de celular está correto — use o mesmo número que usou ao agendar.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resultados */}
        {appointments !== null && appointments.length > 0 && (
          <div className="space-y-6">

            {/* Próximos */}
            {futureApts.length > 0 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Próximos agendamentos
                </h2>
                {futureApts.map(apt => (
                  <AppointmentCard
                    key={apt.id}
                    apt={apt}
                    canCancel={canCancel(apt)}
                    cancellingId={cancellingId}
                    onCancel={handleCancel}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            )}

            {/* Histórico */}
            {/* Aniversario */}
            {!birthdaySaved && appointments !== null && (
              <div className="rounded-2xl border bg-amber-50 border-amber-100 p-4 mt-2">
                <p className="font-semibold text-sm text-amber-800 mb-1">🎂 Seu aniversário</p>
                <p className="text-xs text-amber-700 mb-3">Salve sua data e receba uma surpresa no seu aniversário!</p>
                {!showBirthday ? (
                  <button onClick={() => setShowBirthday(true)} className="text-xs font-semibold text-amber-800 border border-amber-300 px-3 py-1.5 rounded-lg bg-white hover:bg-amber-50 transition-colors">
                    Informar data de nascimento
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="border border-amber-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white" />
                    <button onClick={handleSaveBirthday} disabled={!birthDate || savingBirthday}
                      className="text-xs font-semibold bg-amber-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">
                      {savingBirthday ? '...' : 'Salvar'}
                    </button>
                    <button onClick={() => setShowBirthday(false)} className="text-xs text-amber-600 px-2">Pular</button>
                  </div>
                )}
              </div>
            )}

            {pastApts.length > 0 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Histórico
                </h2>
                {pastApts.map(apt => (
                  <AppointmentCard
                    key={apt.id}
                    apt={apt}
                    canCancel={false}
                    cancellingId={cancellingId}
                    onCancel={handleCancel}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

// ─── Card individual de agendamento ──────────────────────────────────────────

interface AppointmentCardProps {
  apt: Appointment;
  canCancel: boolean;
  cancellingId: string | null;
  onCancel: (apt: Appointment) => void;
  formatDate: (d: string) => string;
}

const AppointmentCard = ({ apt, canCancel, cancellingId, onCancel, formatDate }: AppointmentCardProps) => {
  const statusInfo = STATUS_INFO[apt.status] ?? { label: apt.status, variant: 'outline' as const };
  const isAwaitingDeposit = apt.status === 'AWAITING_DEPOSIT';
  const depositPaid = (apt as any).depositStatus === 'PAID_PIX' || (apt as any).depositStatus === 'PAID_ASAAS';
  const isCancelling = cancellingId === apt.id;

  return (
    <Card className={cn(
      'transition-all',
      apt.status === 'CANCELLED' && 'opacity-60',
      isAwaitingDeposit && !depositPaid && 'border-amber-300 bg-amber-50/50',
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{apt.serviceName}</CardTitle>
          <Badge variant={statusInfo.variant} className={`shrink-0 ${isAwaitingDeposit ? 'border-amber-400 bg-amber-100 text-amber-800' : ''}`}>
            {statusInfo.label}
          </Badge>
        </div>
        <CardDescription>com {apt.professionalName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 pb-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0" />
          <span>{formatDate(apt.date)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0" />
          <span>{apt.startTime} — {apt.endTime}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="font-semibold text-foreground">R$ {apt.totalAmount.toFixed(2)}</span>
          {(apt as any).status === 'AWAITING_DEPOSIT' && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
              Sinal pendente
            </span>
          )}
          {(apt as any).status === 'AWAITING_DEPOSIT' && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {(apt as any).depositStatus === 'PAID_PIX' ? (
                <p className="flex items-center gap-1.5">✅ Comprovante enviado — aguardando confirmação do salão.</p>
              ) : (
                <>
                  <p className="font-semibold flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /> Sinal pendente</p>
                  <p className="text-xs mt-1">Valor do sinal: <strong>R$ {((apt as any).depositAmount || 0).toFixed(2)}</strong>. Volte ao agendamento para pagar e confirmar seu horário.</p>
                </>
              )}
            </div>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onCancel(apt)}
              disabled={isCancelling}
            >
              {isCancelling
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
              Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
