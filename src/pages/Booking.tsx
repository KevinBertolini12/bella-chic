import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addMinutes, startOfToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, CheckCircle2, User, Phone, Loader2, CalendarDays, Home, Building } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Calendar } from '../components/ui/calendar';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { salonService } from '../services/salonService';
// firebase/firestore não é mais necessário aqui — disponibilidade vem via /api/availability
import { SalonService, Professional, Appointment, Address } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSalon } from '../contexts/SalonContext';
import { usePlanAccess } from '../hooks/usePlanAccess';
import { useSettings } from '../contexts/SettingsContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { SEO } from '../components/SEO';
import { QRCodeSVG } from 'qrcode.react';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Gera slots dentro do horário de funcionamento com intervalo configurável.
 * O bloqueio de conflito é feito por isSlotOccupiedByDuration,
 * que considera a duração total do serviço selecionado.
 */
function buildTimeSlots(
  open: string,
  close: string,
  interval = 10,
  lunchStart?: string,
  lunchEnd?: string
): string[] {
  const slots: string[] = [];
  const [openH, openM] = open.split(':').map(Number);
  const [closeH, closeM] = close.split(':').map(Number);
  let cur = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  // Horário de almoço (opcional)
  const lS = lunchStart ? (() => { const [h,m] = lunchStart.split(':').map(Number); return h*60+m; })() : null;
  const lE = lunchEnd   ? (() => { const [h,m] = lunchEnd.split(':').map(Number);   return h*60+m; })() : null;

  while (cur + interval <= end) {
    // Pula slots que colidem com o horário de almoço
    const isLunch = lS !== null && lE !== null && cur < lE && (cur + interval) > lS;
    if (!isLunch) {
      const h = String(Math.floor(cur / 60)).padStart(2, '0');
      const m = String(cur % 60).padStart(2, '0');
      slots.push(`${h}:${m}`);
    }
    cur += interval;
  }
  return slots;
}

/**
 * Verifica se iniciar um serviço no horário 'time' conflita com algum
 * agendamento existente, levando em conta a duração do serviço.
 * Exemplo: serviço de 60 min às 10:00 bloqueia 10:00, 10:10 … 10:50.
 */
function isSlotOccupiedByDuration(
  time: string,
  serviceDuration: number,
  booked: Appointment[]
): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMin(time);
  const end = start + serviceDuration;
  return booked.some((apt) => {
    if (apt.status === 'CANCELLED') return false;
    const aStart = toMin(apt.startTime);
    // Se endTime não estiver disponível, estimamos 60 min como fallback
    const aEnd = apt.endTime ? toMin(apt.endTime) : aStart + 60;
    // Bloqueia se:
    // 1. O novo slot começaria durante um agendamento existente
    // 2. O novo slot terminaria durante um agendamento existente
    // 3. O novo slot cobriria completamente um agendamento existente
    return start < aEnd && end > aStart;
  });
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ─── Componente principal ────────────────────────────────────────────────────

export const Booking = () => {
  const { user, profile } = useAuth();
  const { salon, salonId } = useSalon();
  const { settings } = useSettings();
  const [reviewStats, setReviewStats] = useState<{ avg: number; total: number } | null>(null);

  useEffect(() => {
    if (!salonId) return;
    import('firebase/firestore').then(({ collection, query: fq, where, getDocs, limit }) => {
      import('../firebase').then(({ db: fdb }) => {
        getDocs(fq(collection(fdb, `salons/${salonId}/reviews`), where('approved', '==', true), limit(100)))
          .then(snap => {
            if (snap.empty) return;
            const ratings = snap.docs.map(d => (d.data() as any).rating || 0).filter((r: number) => r > 0);
            if (ratings.length > 0) {
              const avg = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
              setReviewStats({ avg: Math.round(avg * 10) / 10, total: ratings.length });
            }
          }).catch(() => {});
      });
    });
  }, [salonId]);
  const navigate = useNavigate();
  const { hasFeature, plan } = usePlanAccess();
  const hasBooking = plan ? (plan.features as any).hasBooking !== false : true;

  const offerHomeService = settings?.business?.offerHomeService === true;
  const homeServiceFee = settings?.business?.homeServiceFee || 0;
  const salonName = settings?.branding?.headerName || salon?.name || 'Estabelecimento';

  const [showWaitlist, setShowWaitlist] = React.useState(false);
  const [waitlistName, setWaitlistName] = React.useState('');
  const [waitlistPhone, setWaitlistPhone] = React.useState('');
  const [waitlistSaved, setWaitlistSaved] = React.useState(false);
  const [waitlistSaving, setWaitlistSaving] = React.useState(false);

  const submitWaitlist = async () => {
    if (!waitlistName.trim() || !waitlistPhone.trim() || !salonId) return;
    setWaitlistSaving(true);
    try {
      const serviceId = selectedService?.id || '';
      const serviceName = selectedService?.name || '';
      const date = selectedDate ? selectedDate.toISOString().split('T')[0] : '';
      await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salonId, name: waitlistName.trim(),
          phone: waitlistPhone.replace(/\D/g, ''),
          date, serviceId, serviceName,
          professionalId: selectedProfessional?.id || '',
          professionalName: selectedProfessional?.displayName || '',
          createdAt: Date.now(),
        }),
      });
      setWaitlistSaved(true);
    } catch { /* silencioso — já mostra o badge de sucesso */ }
    setWaitlistSaving(false);
  };
  const [step, setStep] = useState(1);
  const [services, setServices] = useState<SalonService[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Appointment[]>([]);
  const [fullDayClosed, setFullDayClosed] = useState(false);
  const [dayPromos, setDayPromos] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selectedService, setSelectedService] = useState<SalonService | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(startOfToday());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [locationType, setLocationType] = useState<'SALON' | 'HOME'>('SALON');
  const [homeAddress, setHomeAddress] = useState<Address>({
    street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zipCode: ''
  });
  // Email removido — apenas nome e telefone são obrigatórios para o cliente
  const [customerData, setCustomerData] = useState({ name: '', phone: '' });

  // ── Sinal/Adiantamento ──────────────────────────────────────────────────
  const [depositStep, setDepositStep] = useState(false);
  const [serviceImgIdx, setServiceImgIdx] = useState<Record<string, number>>({});
  const [depositAptId, setDepositAptId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositExpires, setDepositExpires] = useState<Date | null>(null);
  const [depositPaid, setDepositPaid] = useState(false);
  const [depositComprovante, setDepositComprovante] = useState<File | null>(null);
  const [depositUploading, setDepositUploading] = useState(false);
  const [depositTimeLeft, setDepositTimeLeft] = useState(1800); // 30 min em segundos

  // Preenche nome se o usuário estiver logado
  useEffect(() => {
    setCustomerData((prev) => ({
      name: prev.name || profile?.displayName || user?.displayName || '',
      phone: prev.phone,
    }));
  }, [user, profile]);

  // Carrega serviços e profissionais
  useEffect(() => {
    if (!salonId) return;
    (async () => {
      try {
        const [s, p] = await Promise.all([
          salonService.getServices(salonId),
          salonService.getProfessionals(salonId),
        ]);
        setServices(s);
        setProfessionals(p);
      } catch {
        toast.error('Erro ao carregar dados.');
      } finally {
        setLoading(false);
      }
    })();
  }, [salonId]);

  // Profissionais filtrados pelo serviço selecionado
  const eligibleProfessionals = useMemo(() => {
    if (!selectedService) return professionals;
    return professionals.filter(
      (p) => p.specialties.length === 0 || p.specialties.includes(selectedService.id)
    );
  }, [professionals, selectedService]);

  // Busca horários ocupados via rota pública do servidor (sem exigir login)
  useEffect(() => {
    if (!salonId || !selectedProfessional || !selectedDate) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    setLoadingSlots(true);

    let cancelled = false;

    const parseAvailability = (data: any) => {
      setBookedSlots((data.slots || []).map((s: any) => ({
        ...s,
        id: '',
        clientId: '',
        clientName: '',
        professionalId: selectedProfessional.id,
        date: dateStr,
      })));
      setFullDayClosed(!!data.fullDayClosed);
      setDayPromos(data.promotions || []);
    };

    fetch(`/api/availability?salonId=${salonId}&professionalId=${selectedProfessional.id}&date=${dateStr}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) { parseAvailability(data); setLoadingSlots(false); }
      })
      .catch(() => {
        if (!cancelled) { setBookedSlots([]); setFullDayClosed(false); setDayPromos([]); setLoadingSlots(false); }
      });

    // Recarrega a cada 15 segundos para manter sincronizado em tempo real
    const interval = setInterval(() => {
      fetch(`/api/availability?salonId=${salonId}&professionalId=${selectedProfessional.id}&date=${dateStr}`)
        .then(r => r.json())
        .then(data => { if (!cancelled) parseAvailability(data); })
        .catch(() => {});
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [salonId, selectedProfessional, selectedDate]);

  // Slots filtrados pelo horário de funcionamento com intervalo configurável
  // Horários já passados são automaticamente removidos quando a data é hoje
  const timeSlots = useMemo(() => {
    const dayKey = selectedDate ? DAY_KEYS[selectedDate.getDay()] : null;
    const dayConfig = dayKey ? settings?.business?.workingHours?.[dayKey] : null;
    if (!dayConfig || dayConfig.closed) return [];
    const interval = settings?.business?.slotInterval || 10;
    const allSlots = buildTimeSlots(
      dayConfig.open || '09:00',
      dayConfig.close || '18:00',
      interval,
      dayConfig.lunchStart,
      dayConfig.lunchEnd,
    );

    // Se é hoje, remove horários que já passaram (com margem de 30 min)
    const isToday = selectedDate
      ? format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
      : false;

    if (isToday) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes() + 30; // 30 min de margem
      return allSlots.filter(slot => {
        const [h, m] = slot.split(':').map(Number);
        return h * 60 + m > nowMin;
      });
    }

    return allSlots;
  }, [settings, selectedDate]);

  // Countdown do sinal
  React.useEffect(() => {
    if (!depositStep || depositPaid) return;
    const timer = setInterval(() => {
      setDepositTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          setDepositStep(false);
          toast.error('Tempo esgotado! O horário foi liberado. Tente novamente.');
          navigate(`/s/${salon?.slug || ''}`);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [depositStep, depositPaid]);

  // Verifica se um slot está bloqueado pelo serviço em andamento
  const isOccupied = (time: string) => {
    if (!selectedService) return false;
    // Blocos de schedule_blocks também são retornados em bookedSlots (type=BLOCKED)
    return isSlotOccupiedByDuration(time, selectedService.duration, bookedSlots);
  };

  // Verifica se o horário tem promoção ativa
  const getSlotPromo = (time: string) => {
    if (!dayPromos.length) return null;
    const [h, m] = time.split(':').map(Number);
    const tMin = h * 60 + m;
    return dayPromos.find(p => {
      if (!p.startTime || !p.endTime) return true; // promoção sem horário = dia todo
      const [sh, sm] = p.startTime.split(':').map(Number);
      const [eh, em] = p.endTime.split(':').map(Number);
      return tMin >= sh * 60 + sm && tMin < eh * 60 + em;
    }) || null;
  };

  // Cache de dias fechados por evento (fetched lazily)
  const [closedDates, setClosedDates] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (!salonId) return;
    // Busca eventos de fechamento dos próximos 90 dias
    import('firebase/firestore').then(({ collection: col, query: q, where, getDocs }) => {
      import('../firebase').then(({ db: fdb }) => {
        const today = new Date().toISOString().split('T')[0];
        const future = new Date(Date.now() + 90*86400000).toISOString().split('T')[0];
        getDocs(q(col(fdb, `salons/${salonId}/events`),
          where('active', '==', true),
          where('type', '==', 'closure')
        )).then(snap => {
          const dates = new Set<string>();
          snap.docs.forEach(d => {
            const ev = d.data();
            if (ev.date) dates.add(ev.date);
            if (ev.startDate && ev.endDate) {
              let cur = ev.startDate;
              while (cur <= ev.endDate && cur <= future) {
                dates.add(cur);
                const next = new Date(cur + 'T00:00:00');
                next.setDate(next.getDate() + 1);
                cur = next.toISOString().split('T')[0];
              }
            }
          });
          setClosedDates(dates);
        }).catch(() => {});
      });
    });
  }, [salonId]);

  const isDateDisabled = (date: Date) => {
    // Bloqueia datas passadas
    if (date < startOfToday()) return true;
    const dayKey = DAY_KEYS[date.getDay()];
    // Bloqueia dias fechados por horário de funcionamento
    if (settings?.business?.workingHours?.[dayKey]?.closed === true) return true;
    // Bloqueia dias com evento de fechamento
    const dateStr = format(date, 'yyyy-MM-dd');
    if (closedDates.has(dateStr)) return true;
    return false;
  };

  const handleConfirm = async () => {
    if (!selectedService || !selectedProfessional || !selectedDate || !selectedTime || !salonId) return;
    if (!customerData.name || !customerData.phone) {
      toast.error('Preencha seu nome e telefone antes de confirmar.');
      if (offerHomeService) setStep(5);
      else setStep(4);
      return;
    }
    if (locationType === 'HOME') {
      if (!homeAddress.street || !homeAddress.number || !homeAddress.neighborhood || !homeAddress.city || !homeAddress.state || !homeAddress.zipCode) {
        toast.error('Preencha o endereço completo para atendimento a domicílio.');
        setStep(4);
        return;
      }
    }

    setSubmitting(true);
    try {
      // ── Verificação de conflito no momento do envio ──────────────────────
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const freshSlots = await salonService.getAppointmentsByProfessional(
        salonId, selectedProfessional.id, dateStr
      );
      if (isSlotOccupiedByDuration(selectedTime, selectedService.duration, freshSlots)) {
        toast.error('Este horário acabou de ser ocupado. Por favor, escolha outro.');
        setSelectedTime(null);
        setStep(3);
        setSubmitting(false);
        return;
      }
      // ────────────────────────────────────────────────────────────────────

      const endTime = format(
        addMinutes(parseISO(`2000-01-01T${selectedTime}`), selectedService.duration),
        'HH:mm'
      );

      const appointment: any = {
        salonId,
        clientId: user?.uid || `guest_${Date.now()}`,
        clientName: customerData.name,
        customerPhone: customerData.phone,
        professionalId: selectedProfessional.id,
        professionalName: selectedProfessional.displayName,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: selectedTime,
        endTime,
        status: 'CONFIRMED',
        totalAmount: selectedService.price + (locationType === 'HOME' ? homeServiceFee : 0),
        createdAt: Date.now(),
        locationType,
        homeAddress: locationType === 'HOME' ? homeAddress : undefined,
        homeServiceFee: locationType === 'HOME' ? homeServiceFee : undefined,
      };

      // Verifica se serviço exige sinal
      const needsDeposit = selectedService.requireDeposit && selectedService.depositPercent;
      const depositAmt = needsDeposit
        ? Math.round(((selectedService.price * (selectedService.depositPercent || 0)) / 100) * 100) / 100
        : 0;

      const aptData = {
        ...appointment,
        status: needsDeposit ? 'AWAITING_DEPOSIT' : 'CONFIRMED',
        depositRequired: !!needsDeposit,
        depositAmount: depositAmt,
        depositPercent: selectedService.depositPercent || 0,
        depositStatus: needsDeposit ? 'PENDING' : 'NOT_REQUIRED',
        depositExpiresAt: needsDeposit ? Date.now() + 30 * 60 * 1000 : null,
      };

      const aptRef = await salonService.createAppointment(salonId, aptData);

      if (needsDeposit) {
        // Vai para step de pagamento do sinal
        setDepositAptId(aptRef?.id || null);
        setDepositAmount(depositAmt);
        setDepositExpires(new Date(Date.now() + 30 * 60 * 1000));
        setDepositTimeLeft(1800);
        setDepositStep(true);
        setSubmitting(false);
        return;
      }

      toast.success('Agendamento realizado com sucesso!');

      // Notifica dono do salão e confirma para o cliente (em paralelo, sem bloquear)
      // Notifica dono do salão + confirma para o cliente via WhatsApp (best-effort)
      fetch('/api/appointments/notify-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonId, appointment: aptData }),
      }).catch(() => {});

      if (salon?.slug) {
        navigate(`/s/${salon.slug}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao realizar agendamento. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // Define os labels dos steps dinamicamente
  const getStepLabels = () => {
    const base = ['Serviço', 'Profissional', 'Data & Hora'];
    if (offerHomeService) base.push('Local');
    base.push('Seus Dados', 'Confirmar');
    return base;
  };

  const stepLabels = getStepLabels();
  const totalSteps = stepLabels.length;

  const StepIndicator = ({ step }: { step: number }) => (
    <div className="mb-10 flex items-center justify-center flex-wrap gap-2">
      {stepLabels.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <React.Fragment key={n}>
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors',
                done ? 'border-primary bg-primary text-primary-foreground' :
                active ? 'border-primary text-primary' : 'border-muted text-muted-foreground'
              )}>
                {done ? <CheckCircle2 className="h-5 w-5" /> : n}
              </div>
              <span className={cn('hidden text-[10px] sm:block', active ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                {label}
              </span>
            </div>
            {n < totalSteps && (
              <div className={cn('mb-4 h-0.5 w-8 sm:w-12 transition-colors', step > n ? 'bg-primary' : 'bg-muted')} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const slide = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

  if (loading) {
    return (
      <>
        <SEO title="Agendamento" description="Agende seu horário" />
        <div className="container mx-auto px-4 py-12">
          <div className="mb-8 text-center space-y-2">
            <Skeleton className="mx-auto h-9 w-64" />
            <Skeleton className="mx-auto h-4 w-80" />
          </div>
          <div className="mx-auto max-w-4xl grid gap-4 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-6 w-40" /><Skeleton className="mt-1 h-4 w-56" /></CardHeader>
                <CardContent><Skeleton className="h-4 w-24" /></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    );
  }

  // Plano Loja não tem agendamento
  if (plan && (plan.features as any).hasBooking === false) {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-4">
        <div className="text-4xl mb-4">🛍️</div>
        <h2 className="text-2xl font-bold">Agendamento não incluído no seu plano</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Seu plano atual é focado na loja online. Para ter agendamento, faça upgrade para o plano Agenda ou Completo.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          {salon?.slug && (
            <a href={`/s/${salon.slug}/loja`}
              className="rounded-xl bg-primary px-6 py-3 text-white font-semibold hover:bg-primary/90 transition-colors">
              Ir para a Loja
            </a>
          )}
          <a href={`/s/${salon?.slug}/admin`}
            className="rounded-xl border px-6 py-3 font-semibold hover:bg-muted transition-colors">
            Ver planos
          </a>
        </div>
      </div>
    );
  }

  // ── Tela de pagamento do sinal ──────────────────────────────────────────
  if (depositStep) {
    const hasAsaas = !!(settings?.business?.asaasApiKey);
    const pixKey = settings?.business?.pixKey || '';
    const pixOwnerName = settings?.business?.pixOwnerName || salonName;
    const mins = Math.floor(depositTimeLeft / 60);
    const secs = depositTimeLeft % 60;

    return (
      <>
        <SEO title="Pagamento do Sinal" description="Pague o sinal para confirmar seu agendamento" />
        <div className="container mx-auto max-w-md px-4 py-12 space-y-6">
          {/* Timer - esconde quando comprovante foi enviado */}
          {!depositPaid && (
            <div className={`rounded-xl border p-4 text-center ${depositTimeLeft < 300 ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className={`text-sm font-medium ${depositTimeLeft < 300 ? 'text-red-700' : 'text-amber-700'}`}>
                ⏱️ Pague em até
              </p>
              <p className={`text-3xl font-bold mt-1 ${depositTimeLeft < 300 ? 'text-red-600' : 'text-amber-600'}`}>
                {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
              </p>
              <p className={`text-xs mt-1 ${depositTimeLeft < 300 ? 'text-red-500' : 'text-amber-500'}`}>
                O horário será liberado se não pagar no prazo
              </p>
            </div>
          )}

          {/* Resumo */}
          <div className="rounded-xl border p-4 space-y-2">
            <h2 className="font-bold text-lg">Sinal para confirmar o agendamento</h2>
            <p className="text-sm text-muted-foreground">
              {selectedService?.name} com {selectedProfessional?.displayName}
            </p>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Valor total do serviço</span>
              <span className="font-medium">R$ {(selectedService?.price ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Sinal ({selectedService?.depositPercent}%)</span>
              <span className="text-xl font-bold text-primary">R$ {depositAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Restante no dia do atendimento</span>
              <span>R$ {((selectedService?.price || 0) - depositAmount).toFixed(2)}</span>
            </div>
          </div>

          {/* Aviso sem reembolso */}
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex items-start gap-2">
            <span className="shrink-0 text-base">⚠️</span>
            <span>
              <strong>Atenção:</strong> ao pagar o sinal e cancelar o agendamento posteriormente,
              o valor não será reembolsado automaticamente. Qualquer dúvida, entre em contato com o salão.
            </span>
          </div>

          {/* PIX Asaas (automático) ou PIX simples */}
          {hasAsaas ? (
            <div className="rounded-xl border p-4 text-center space-y-3">
              <p className="font-semibold">PIX — Confirmação Automática</p>
              <p className="text-sm text-muted-foreground">
                Após o pagamento, seu agendamento será confirmado automaticamente via Asaas.
              </p>
              <div className="animate-pulse text-4xl">💸</div>
            </div>
          ) : pixKey ? (
            <div className="rounded-xl border p-4 space-y-4">
              <p className="font-semibold text-center">Pague o sinal via PIX</p>
              <div className="flex justify-center">
                <QRCodeSVG value={pixKey} size={180} level="M" />
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Chave PIX</p>
                <p className="font-mono text-sm font-semibold break-all">{pixKey}</p>
                {pixOwnerName && <p className="text-xs text-muted-foreground mt-1">Recebedor: {pixOwnerName}</p>}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(pixKey); toast.success('Chave PIX copiada!'); }}
                className="w-full rounded-xl border-2 border-primary py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
              >
                Copiar chave PIX
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
              <p className="font-semibold">⚠️ PIX não configurado pelo estabelecimento</p>
              <p className="text-xs mt-1">Entre em contato com o estabelecimento para efetuar o pagamento.</p>
            </div>
          )}

          {/* Upload comprovante - sempre visível quando PIX simples */}
          {!hasAsaas && !depositPaid && (
            <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-center">
                📎 Após pagar, anexe o comprovante aqui
              </p>
              <p className="text-xs text-muted-foreground text-center">
                O estabelecimento receberá uma notificação e confirmará seu agendamento.
                O contador para assim que você enviar.
              </p>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setDepositComprovante(e.target.files?.[0] || null)}
                className="w-full text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-xs file:font-medium cursor-pointer"
              />
              {depositComprovante && (
                <>
                  <p className="text-xs text-emerald-600 font-medium">✅ Arquivo selecionado: {depositComprovante.name}</p>
                  <button
                    disabled={depositUploading}
                    onClick={async () => {
                      if (!depositAptId || !depositComprovante) return;
                      setDepositUploading(true);
                      try {
                        const fd = new FormData();
                        fd.append('file', depositComprovante);
                        fd.append('salonId', salonId!);
                        fd.append('appointmentId', depositAptId);
                        fd.append('amount', String(depositAmount));
                        const res = await fetch('/api/deposit/upload-comprovante', { method: 'POST', body: fd });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.error || 'Erro no servidor');
                        }
                        toast.success('Comprovante enviado! Aguardando confirmação.');
                        setDepositPaid(true); // para o contador
                      } catch {
                        toast.error('Erro ao enviar comprovante. Tente novamente.');
                      } finally {
                        setDepositUploading(false);
                      }
                    }}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {depositUploading ? '⏳ Enviando...' : '📤 Enviar comprovante'}
                  </button>
                </>
              )}
            </div>
          )}

          {depositPaid && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center text-green-800 space-y-2">
              <p className="text-3xl">✅</p>
              <p className="font-bold text-lg">Comprovante enviado!</p>
              <p className="text-sm">O estabelecimento foi notificado e confirmará em breve.</p>
              <p className="text-xs text-green-600">Você receberá uma confirmação pelo WhatsApp.</p>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title="Agendamento" description="Agende seu horário" />
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Agende seu Horário</h1>
          <p className="mt-1 text-muted-foreground">Escolha o serviço, profissional e horário de sua preferência.</p>
          {reviewStats && reviewStats.total >= 1 && (
            <div className="inline-flex items-center gap-1.5 mt-2 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              <span className="text-amber-500 text-sm">{'★'.repeat(Math.round((reviewStats?.avg ?? 0)))}</span>
              <span className="text-sm font-bold text-amber-700">{(reviewStats?.avg ?? 0).toFixed(1)}</span>
              <span className="text-xs text-amber-600">({reviewStats.total} avaliação{reviewStats.total !== 1 ? 'ões' : ''})</span>
            </div>
          )}
          <a href={`/s/${salonId}/servicos`} className="inline-flex items-center gap-1.5 mt-2 text-xs text-primary hover:underline">
            📋 Ver todos os serviços e preços
          </a>
        </div>

        <div className="mx-auto max-w-4xl">
          <StepIndicator step={step} />

          <AnimatePresence mode="wait">

            {/* Step 1: Serviço */}
            {step === 1 && (
              <motion.div key="step1" {...slide}>
                {services.length === 0 ? (
                  <p className="py-12 text-center text-muted-foreground">Nenhum serviço disponível no momento.</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {services.map((service) => {
                      const imgs = (service as any).images as string[] | undefined;
                      const imgIdx = serviceImgIdx[service.id] || 0;
                      const hasImages = imgs && imgs.length > 0;
                      return (
                        <Card
                          key={service.id}
                          className={cn('cursor-pointer transition-all hover:border-primary hover:shadow-sm overflow-hidden',
                            selectedService?.id === service.id && 'border-primary bg-primary/5')}
                          onClick={() => { setSelectedService(service); setSelectedProfessional(null); setSelectedTime(null); setStep(2); }}
                        >
                          {/* Carrossel de imagens */}
                          {hasImages && (
                            <div className="relative h-40 bg-muted overflow-hidden">
                              <img
                                src={imgs[imgIdx]}
                                alt={service.name}
                                className="h-full w-full object-cover"
                              />
                              {imgs.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); setServiceImgIdx(p => ({ ...p, [service.id]: (imgIdx - 1 + imgs.length) % imgs.length })); }}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/40 text-white text-xs flex items-center justify-center hover:bg-black/60"
                                  >‹</button>
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); setServiceImgIdx(p => ({ ...p, [service.id]: (imgIdx + 1) % imgs.length })); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/40 text-white text-xs flex items-center justify-center hover:bg-black/60"
                                  >›</button>
                                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                                    {imgs.map((_, i) => (
                                      <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`} />
                                    ))}
                                  </div>
                                </>
                              )}
                              {(service as any).requireDeposit && (
                                <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                                  Sinal {(service as any).depositPercent}%
                                </span>
                              )}
                            </div>
                          )}
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-base">{service.name}</CardTitle>
                              {!(service as any).images?.length && (service as any).requireDeposit && (
                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                  Sinal {(service as any).depositPercent}%
                                </span>
                              )}
                            </div>
                            {service.description && (
                              <CardDescription className="line-clamp-2 text-xs">{service.description}</CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />{service.duration} min
                              </span>
                              <span className="font-bold text-primary">R$ {(service.price ?? 0).toFixed(2)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: Profissional */}
            {step === 2 && (
              <motion.div key="step2" {...slide} className="space-y-4">
                {eligibleProfessionals.length === 0 ? (
                  <p className="py-12 text-center text-muted-foreground">Nenhum profissional disponível para este serviço.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    {eligibleProfessionals.map((prof) => (
                      <Card
                        key={prof.id}
                        className={cn('cursor-pointer transition-all hover:border-primary hover:shadow-sm',
                          selectedProfessional?.id === prof.id && 'border-primary bg-primary/5')}
                        onClick={() => { setSelectedProfessional(prof); setSelectedTime(null); setStep(3); }}
                      >
                        <CardHeader className="text-center">
                          <div className="mx-auto mb-3 h-20 w-20 overflow-hidden rounded-full bg-muted">
                            <img
                              src={prof.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(prof.displayName)}&background=random`}
                              alt={prof.displayName}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <CardTitle className="text-base">{prof.displayName}</CardTitle>
                          <CardDescription className="line-clamp-2 text-xs">{prof.bio}</CardDescription>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
                <div className="pt-2">
                  <Button variant="outline" onClick={() => setStep(1)}>← Voltar</Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Data & Horário */}
            {step === 3 && (
              <motion.div key="step3" {...slide} className="grid gap-6 md:grid-cols-2">
                <Card className="bg-white shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Escolha a Data</CardTitle>
                  </CardHeader>
                  <CardContent className="flex justify-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => { setSelectedDate(d); setSelectedTime(null); }}
                      disabled={isDateDisabled}
                      className="rounded-md border"
                      locale={ptBR}
                    />
                  </CardContent>
                </Card>

                <Card className="bg-white shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Escolha o Horário</CardTitle>
                    <CardDescription>
                      {selectedDate ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR }) : 'Selecione uma data'}
                    </CardDescription>
                    {selectedService && (
                      <p className="text-xs text-muted-foreground">
                        Duração do serviço: {selectedService.duration} min — horários ocupados ficam bloqueados automaticamente.
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    {loadingSlots ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : fullDayClosed ? (
                      <div className="py-8 text-center space-y-2">
                        <div className="mx-auto h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
                          <span className="text-2xl">🔒</span>
                        </div>
                        <p className="text-sm font-semibold text-red-700">Fechado neste dia</p>
                        <p className="text-xs text-muted-foreground">Escolha outra data no calendário.</p>
                      </div>
                    ) : timeSlots.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {selectedDate ? 'Sem horários disponíveis neste dia.' : 'Selecione uma data primeiro.'}
                      </p>
                    ) : (
                      <>
                        {dayPromos.length > 0 && (
                          <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 flex items-center gap-2">
                            <span className="text-base">🎉</span>
                            <span className="font-semibold">{dayPromos[0].title}</span>
                            {dayPromos[0].discountPercent ? <span className="ml-auto font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">-{dayPromos[0].discountPercent}%</span> : null}
                          </div>
                        )}
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2 max-h-72 overflow-y-auto pr-1">
                          {timeSlots.map((time) => {
                            const occupied = isOccupied(time);
                            const promo    = !occupied ? getSlotPromo(time) : null;
                            return (
                              <Button
                                key={time}
                                size="sm"
                                variant={selectedTime === time ? 'default' : 'outline'}
                                className={cn(
                                  'w-full relative text-xs',
                                  occupied && 'cursor-not-allowed bg-slate-50 text-slate-300 border-slate-100',
                                  promo && !occupied && selectedTime !== time && 'border-green-400 text-green-700 hover:bg-green-50',
                                )}
                                disabled={occupied}
                                onClick={() => { if (occupied) { setShowWaitlist(true); } else { setSelectedTime(time); setShowWaitlist(false); } }}
                              >
                                {time}
                                {occupied && <span className="absolute -top-1 -right-1 text-[9px] bg-slate-400 text-white rounded-full px-1">🔒</span>}
                                {promo && !occupied && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 text-[8px] font-bold text-white">%</span>
                                )}
                              </Button>
                            );
                          })}
                        </div>

                        {/* Lista de Espera */}
                        {showWaitlist && !waitlistSaved && (
                          <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="font-semibold text-sm text-amber-800">📋 Entrar na Lista de Espera</p>
                              <button onClick={() => setShowWaitlist(false)} className="text-amber-500 text-xs">Fechar</button>
                            </div>
                            <p className="text-xs text-amber-700">Esse horário está ocupado. Deixa seu contato e te avisamos se abrir vaga!</p>
                            <input
                              placeholder="Seu nome"
                              value={waitlistName}
                              onChange={e => setWaitlistName(e.target.value)}
                              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none"
                            />
                            <input
                              placeholder="WhatsApp (ex: 11999999999)"
                              value={waitlistPhone}
                              onChange={e => setWaitlistPhone(e.target.value)}
                              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none"
                            />
                            <Button
                              size="sm"
                              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                              onClick={submitWaitlist}
                              disabled={waitlistSaving || !waitlistName.trim() || !waitlistPhone.trim()}
                            >
                              {waitlistSaving ? 'Salvando...' : 'Entrar na lista de espera'}
                            </Button>
                          </div>
                        )}
                        {waitlistSaved && (
                          <div className="mt-4 rounded-xl border-2 border-green-200 bg-green-50 p-4 text-center">
                            <p className="text-green-800 font-semibold text-sm">✅ Você está na lista!</p>
                            <p className="text-xs text-green-700 mt-1">Te avisamos pelo WhatsApp se abrir vaga 😊</p>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(2)}>← Voltar</Button>
                    <Button disabled={!selectedTime} onClick={() => setStep(4)}>Continuar →</Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}

            {/* Step 4: Local (apenas se oferecer domicílio) */}
            {offerHomeService && step === 4 && (
              <motion.div key="step4" {...slide} className="mx-auto max-w-md">
                <Card className="bg-white shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5" /> Onde deseja ser atendido?
                    </CardTitle>
                    <CardDescription>
                      Escolha se prefere atendimento no local ou a domicílio.
                      {homeServiceFee > 0 && ' Há uma taxa adicional para domicílio.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RadioGroup
                      value={locationType}
                      onValueChange={(v) => setLocationType(v as 'SALON' | 'HOME')}
                      className="space-y-3"
                    >
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition hover:border-primary">
                        <RadioGroupItem value="SALON" id="location-salon" className="mt-1" />
                        <div>
                          <div className="font-medium">No salão</div>
                          <div className="text-sm text-muted-foreground">
                            Atendimento no local. Sem custo adicional.
                          </div>
                        </div>
                      </label>

                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition hover:border-primary">
                        <RadioGroupItem value="HOME" id="location-home" className="mt-1" />
                        <div>
                          <div className="font-medium">A domicílio</div>
                          <div className="text-sm text-muted-foreground">
                            {homeServiceFee > 0 ? `Taxa extra: R$ ${homeServiceFee.toFixed(2)}` : 'Sem custo adicional'}
                          </div>
                        </div>
                      </label>
                    </RadioGroup>

                    {locationType === 'HOME' && (
                      <div className="space-y-3 pt-2 border-t">
                        <p className="text-sm font-medium">Endereço para atendimento</p>
                        <div className="grid gap-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label>CEP</Label>
                              <Input
                                placeholder="00000-000"
                                value={homeAddress.zipCode}
                                onChange={(e) => setHomeAddress({ ...homeAddress, zipCode: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Número</Label>
                              <Input
                                placeholder="123"
                                value={homeAddress.number}
                                onChange={(e) => setHomeAddress({ ...homeAddress, number: e.target.value })}
                              />
                            </div>
                          </div>
                          <div>
                            <Label>Rua</Label>
                            <Input
                              placeholder="Rua das Flores"
                              value={homeAddress.street}
                              onChange={(e) => setHomeAddress({ ...homeAddress, street: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Bairro</Label>
                            <Input
                              placeholder="Centro"
                              value={homeAddress.neighborhood}
                              onChange={(e) => setHomeAddress({ ...homeAddress, neighborhood: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label>Cidade</Label>
                              <Input
                                placeholder="São Paulo"
                                value={homeAddress.city}
                                onChange={(e) => setHomeAddress({ ...homeAddress, city: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Estado</Label>
                              <Input
                                placeholder="SP"
                                value={homeAddress.state}
                                onChange={(e) => setHomeAddress({ ...homeAddress, state: e.target.value })}
                              />
                            </div>
                          </div>
                          <div>
                            <Label>Complemento (opcional)</Label>
                            <Input
                              placeholder="Apto 101"
                              value={homeAddress.complement || ''}
                              onChange={(e) => setHomeAddress({ ...homeAddress, complement: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(3)}>← Voltar</Button>
                    <Button onClick={() => setStep(5)}>Continuar →</Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}

            {/* Step Dados do cliente */}
            {((!offerHomeService && step === 4) || (offerHomeService && step === 5)) && (
              <motion.div key="step-customer" {...slide} className="mx-auto max-w-md">
                <Card className="bg-white shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Seus Dados</CardTitle>
                    <CardDescription>
                      {user
                        ? 'Confirme seus dados de contato.'
                        : 'Informe seu nome e WhatsApp para confirmar o agendamento. Não é necessário criar conta.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="booking-name">Nome completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input id="booking-name" className="pl-9" placeholder="Seu nome"
                          value={customerData.name} onChange={(e) => setCustomerData((p) => ({ ...p, name: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="booking-phone">WhatsApp / Telefone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input id="booking-phone" className="pl-9" placeholder="(00) 00000-0000"
                          value={customerData.phone} onChange={(e) => setCustomerData((p) => ({ ...p, phone: e.target.value }))} />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(offerHomeService ? 4 : 3)}>← Voltar</Button>
                    <Button
                      disabled={!customerData.name || !customerData.phone}
                      onClick={() => setStep(offerHomeService ? 6 : 5)}
                    >
                      Revisar →
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}

            {/* Step final: Confirmação */}
            {((!offerHomeService && step === 5) || (offerHomeService && step === 6)) && (
              <motion.div key="step-confirm" {...slide} className="mx-auto max-w-md">
                <Card className="border-2 border-primary bg-white shadow">
                  <CardHeader className="text-center">
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <CheckCircle2 className="h-10 w-10 text-primary" />
                    </div>
                    <CardTitle>Confirme seu Agendamento</CardTitle>
                    <CardDescription>Revise os detalhes abaixo antes de confirmar.</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-2 text-sm">
                    {[
                      { label: 'Serviço', value: selectedService?.name },
                      { label: 'Profissional', value: selectedProfessional?.displayName },
                      { label: 'Data', value: selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : '' },
                      { label: 'Horário', value: selectedTime },
                      { label: 'Local', value: locationType === 'SALON' ? 'No local' : 'A domicílio' },
                      locationType === 'HOME' && homeAddress.street
                        ? {
                            label: 'Endereço',
                            value: `${homeAddress.street}, ${homeAddress.number} - ${homeAddress.neighborhood}, ${homeAddress.city}/${homeAddress.state}`
                          }
                        : null,
                      { label: 'Nome', value: customerData.name },
                      { label: 'Telefone', value: customerData.phone },
                    ].filter((item): item is { label: string; value: string } => Boolean(item)).map(({ label, value }) => (
                      <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-right max-w-[55%] truncate">{value}</span>
                      </div>
                    ))}

                    <div className="flex justify-between pt-2 text-base font-bold">
                      <span>Total</span>
                      <span className="text-primary">
                        R$ {((selectedService?.price || 0) + (locationType === 'HOME' ? homeServiceFee : 0)).toFixed(2)}
                      </span>
                    </div>

                    {selectedService?.requireDeposit && selectedService?.depositPercent && (
                      <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
                        <p className="font-semibold text-amber-800">💰 Este serviço exige sinal antecipado</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-700">Sinal ({selectedService.depositPercent}%) — pagar agora</span>
                          <span className="font-bold text-amber-800">
                            R$ {(((selectedService?.price || 0) * (selectedService.depositPercent || 0)) / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600">Restante no dia</span>
                          <span className="font-medium text-amber-700">
                            R$ {((selectedService?.price || 0) - (((selectedService?.price || 0) * (selectedService.depositPercent || 0)) / 100)).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-amber-600 border-t border-amber-200 pt-2">
                          ⏱️ Você terá 30 min após confirmar para pagar o sinal via PIX.
                        </p>
                        <p className="text-xs text-red-600 font-medium">
                          ⚠️ Cancelamento após sinal pago = sem reembolso automático.
                        </p>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="flex flex-col gap-2">
                    <Button className="w-full" size="lg" disabled={submitting} onClick={handleConfirm}>
                      {submitting
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirmando...</>
                        : selectedService?.requireDeposit
                          ? `Confirmar e ir para pagamento do sinal`
                          : 'Confirmar Agendamento'}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setStep(offerHomeService ? 5 : 4)}>← Alterar dados</Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </>
  );
};