import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, ChevronDown, X, GripVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Appointment, CustomAppointment, CustomProcedure } from '../../types';
import { auth } from '../../firebase';
import { salonService } from '../../services/salonService';
import { toast } from 'sonner';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Props {
  date: string;
  appointments: Appointment[];
  professionals: { id: string; displayName: string }[];
  settings: any;
  salonId: string;
  onAppointmentUpdate: (id: string, changes: Partial<Appointment>) => void;
  onSendReminder: (apt: Appointment) => void;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:     'bg-amber-100 border-amber-400 text-amber-900',
  CONFIRMED:   'bg-blue-100 border-blue-400 text-blue-900',
  COMPLETED:   'bg-green-100 border-green-400 text-green-900 opacity-60',
  CANCELLED:   'bg-red-100 border-red-300 text-red-800 opacity-50 line-through',
  RESCHEDULED: 'bg-purple-100 border-purple-400 text-purple-900',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente', CONFIRMED: 'Confirmado',
  COMPLETED: 'Concluído', CANCELLED: 'Cancelado', RESCHEDULED: 'Reagendado',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fromMin(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function buildSlots(open: string, close: string, interval: number, lunchStart?: string, lunchEnd?: string) {
  const slots: string[] = [];
  let cur = toMin(open);
  const end = toMin(close);
  const lS = lunchStart ? toMin(lunchStart) : null;
  const lE = lunchEnd   ? toMin(lunchEnd)   : null;
  while (cur < end) {
    const isInLunch = lS !== null && lE !== null && cur >= lS && cur < lE;
    if (!isInLunch) slots.push(fromMin(cur));
    else if (cur === lS) slots.push('__lunch__');
    cur += interval;
  }
  return slots;
}

// ─── Move Dialog — funciona em mobile e desktop ───────────────────────────────
const MoveDialog: React.FC<{
  apt: Appointment;
  freeSlots: { slot: string; profId: string; profName: string }[];
  onMove: (slot: string, profId: string) => void;
  onClose: () => void;
}> = ({ apt, freeSlots, onMove, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50" onClick={onClose}>
    <div
      className="w-full max-w-sm rounded-2xl bg-background shadow-2xl overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <p className="font-semibold">Mover agendamento</p>
          <p className="text-sm text-muted-foreground">{apt.clientName} · {apt.serviceName}</p>
        </div>
        <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Slots disponíveis */}
      <div className="max-h-72 overflow-y-auto p-2">
        {freeSlots.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Nenhum horário livre disponível hoje.
          </p>
        ) : (
          <div className="space-y-1">
            {freeSlots.map(({ slot, profId, profName }) => (
              <button
                key={`${profId}-${slot}`}
                onClick={() => onMove(slot, profId)}
                className="w-full rounded-xl border px-4 py-2.5 text-left text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <span className="font-mono font-semibold">{slot}</span>
                <span className="ml-2 text-xs opacity-70">— {profName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

// ─── Componente principal ─────────────────────────────────────────────────────
export const InteractiveSchedule: React.FC<Props> = ({
  date, appointments, professionals, settings, salonId, onAppointmentUpdate, onSendReminder,
}) => {
  const [moving, setMoving] = useState<Appointment | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  // Desktop drag state
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ profId: string; slot: string } | null>(null);
  const dragRef = React.useRef<Appointment | null>(null);

  // ── Agendamento customizado (procedimentos + duração) ──────────────────────
  const emptyForm = () => ({
    clientName: '', clientPhone: '', startTime: '09:00', professionalId: '', professionalName: '', notes: '',
    procedures: [{ id: String(Date.now()), name: '', durationMinutes: 30 }] as CustomProcedure[],
  });
  const [customAppointments, setCustomAppointments] = useState<CustomAppointment[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [savingCustom, setSavingCustom] = useState(false);
  const [customForm, setCustomForm] = useState(emptyForm);

  const authHeaders = async () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await (auth.currentUser?.getIdToken() ?? Promise.resolve(''))}`,
  });

  const loadCustomAppointments = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/appointments/custom?date=${date}`, { headers: await authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setCustomAppointments((data.items ?? []).filter((c: CustomAppointment) => c.status !== 'cancelled'));
    } catch { /* silencioso */ }
  }, [date, salonId]);

  React.useEffect(() => { loadCustomAppointments(); }, [loadCustomAppointments]);

  const totalDuration = (customForm.procedures ?? []).reduce((s, p) => s + (Number(p.durationMinutes) || 0), 0);
  const calcEndTime = (start: string, minutes: number) => fromMin(toMin(start || '00:00') + minutes);
  const addProcedure = () => setCustomForm(f => ({ ...f, procedures: [...f.procedures, { id: String(Date.now() + Math.random()), name: '', durationMinutes: 30 }] }));
  const updateProcedure = (id: string, field: 'name' | 'durationMinutes', value: string | number) =>
    setCustomForm(f => ({ ...f, procedures: f.procedures.map(p => p.id === id ? { ...p, [field]: value } : p) }));
  const removeProcedure = (id: string) =>
    setCustomForm(f => ({ ...f, procedures: f.procedures.filter(p => p.id !== id) }));

  const saveCustomAppointment = async () => {
    if (!customForm.clientName.trim()) { toast.error('Informe o nome do paciente.'); return; }
    const procs = customForm.procedures.filter(p => p.name.trim());
    if (procs.length === 0) { toast.error('Adicione ao menos um procedimento.'); return; }
    setSavingCustom(true);
    try {
      const res = await fetch('/api/appointments/custom', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ ...customForm, procedures: procs, date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      toast.success(`Agenda bloqueada até ${data.endTime}.`);
      setShowCustomModal(false);
      setCustomForm(emptyForm());
      loadCustomAppointments();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSavingCustom(false);
    }
  };

  const removeCustomAppointment = async (id: string) => {
    if (!window.confirm('Remover este agendamento?')) return;
    try {
      const res = await fetch(`/api/appointments/custom/${id}`, { method: 'DELETE', headers: await authHeaders() });
      if (!res.ok) throw new Error();
      setCustomAppointments(prev => prev.filter(c => c.id !== id));
    } catch { toast.error('Erro ao remover.'); }
  };
  const dayCustom = customAppointments.filter(c => c.date === date);

  const business = settings?.business;
  const interval = business?.slotInterval || 30;
  const dayKey = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][
    new Date(date + 'T12:00:00').getDay()
  ];
  const dayConf = business?.workingHours?.[dayKey] || { open: '08:00', close: '20:00' };

  if (dayConf.closed) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed p-12 text-muted-foreground">
        Estabelecimento fechado neste dia.
      </div>
    );
  }

  const slots = buildSlots(dayConf.open, dayConf.close, interval, dayConf.lunchStart, dayConf.lunchEnd);
  const todayApts = appointments.filter(a => a.date === date && a.status !== 'CANCELLED');

  const visibleProfs = (() => {
    const profsWithApts = professionals.filter(p => todayApts.some(a => a.professionalId === p.id));
    return profsWithApts.length > 0 ? profsWithApts : professionals.slice(0, 3);
  })();

  const aptMap: Record<string, Appointment> = {};
  for (const apt of todayApts) {
    aptMap[`${apt.professionalId}__${apt.startTime}`] = apt;
  }

  // ── Horários livres para o dialog de mover ──────────────────────────────────
  const getFreeSlots = (apt: Appointment) => {
    const freeSlots: { slot: string; profId: string; profName: string }[] = [];
    for (const prof of visibleProfs) {
      for (const slot of slots) {
        if (slot === '__lunch__') continue;
        if (prof.id === apt.professionalId && slot === apt.startTime) continue; // slot atual
        if (!aptMap[`${prof.id}__${slot}`]) {
          freeSlots.push({ slot, profId: prof.id, profName: prof.displayName });
        }
      }
    }
    return freeSlots;
  };

  // ── Ações ──────────────────────────────────────────────────────────────────
  const doMove = async (apt: Appointment, slot: string, profId: string) => {
    if (!salonId) return;
    setUpdating(apt.id!);
    setMoving(null);
    try {
      const duration = toMin(apt.endTime) - toMin(apt.startTime);
      const newEnd = fromMin(toMin(slot) + duration);
      const prof = professionals.find(p => p.id === profId);
      await (salonService as any).updateAppointment(salonId, apt.id!, {
        startTime: slot,
        endTime: newEnd,
        professionalId: profId,
        professionalName: prof?.displayName || apt.professionalName,
        status: 'RESCHEDULED',
        date,
      });
      onAppointmentUpdate(apt.id!, {
        startTime: slot, endTime: newEnd,
        professionalId: profId,
        professionalName: prof?.displayName || apt.professionalName,
        status: 'RESCHEDULED',
      });
      toast.success(`${apt.clientName} movido para ${slot}`);
    } catch {
      toast.error('Erro ao mover agendamento.');
    } finally {
      setUpdating(null);
    }
  };

  const doStatus = async (apt: Appointment, status: Appointment['status']) => {
    if (!salonId) return;
    setUpdating(apt.id!);
    try {
      await salonService.updateAppointmentStatus(salonId, apt.id!, status);
      onAppointmentUpdate(apt.id!, { status });
      const labels: Record<string, string> = { COMPLETED: 'Concluído!', CONFIRMED: 'Confirmado!', CANCELLED: 'Cancelado.' };
      toast.success(labels[status] || 'Atualizado!');
    } catch {
      toast.error('Erro ao atualizar.');
    } finally {
      setUpdating(null);
    }
  };

  // ── Desktop drag handlers ──────────────────────────────────────────────────
  const handleDragStart = (apt: Appointment) => {
    setDragging(apt.id!);
    dragRef.current = apt;
  };

  const handleDrop = (profId: string, slot: string) => {
    const apt = dragRef.current;
    if (!apt || slot === '__lunch__') return;
    if (apt.professionalId === profId && apt.startTime === slot) return;
    if (aptMap[`${profId}__${slot}`]) { toast.error('Horário ocupado.'); return; }
    doMove(apt, slot, profId);
    setDragging(null);
    setDragOver(null);
    dragRef.current = null;
  };

  return (
    <>
      {/* Move Dialog (mobile + desktop) */}
      {moving && (
        <MoveDialog
          apt={moving}
          freeSlots={getFreeSlots(moving)}
          onMove={(slot, profId) => doMove(moving, slot, profId)}
          onClose={() => setMoving(null)}
        />
      )}

      <div className="w-full overflow-x-auto rounded-xl border">
        {/* Cabeçalho */}
        <div
          className="grid border-b bg-muted/30 sticky top-0 z-10"
          style={{ gridTemplateColumns: `72px repeat(${visibleProfs.length}, minmax(160px, 1fr))` }}
        >
          <div className="p-2 text-xs font-semibold text-muted-foreground">Hora</div>
          {visibleProfs.map(prof => (
            <div key={prof.id} className="border-l p-2 text-sm font-semibold truncate">
              {prof.displayName}
            </div>
          ))}
        </div>

        {/* Grade */}
        {slots.map((slot) => {
          const isLunch = slot === '__lunch__';
          return (
            <div
              key={slot}
              className={cn('grid border-b last:border-0', isLunch && 'bg-orange-50/60')}
              style={{ gridTemplateColumns: `72px repeat(${visibleProfs.length}, minmax(160px, 1fr))`, minHeight: '60px' }}
            >
              {/* Coluna horário */}
              <div className="flex items-center border-r px-2 py-1">
                {isLunch
                  ? <span className="text-[10px] text-orange-500 font-medium leading-tight text-center w-full">🍽️<br/>Almoço</span>
                  : <span className="text-xs font-mono text-muted-foreground">{slot}</span>}
              </div>

              {/* Colunas por profissional */}
              {visibleProfs.map(prof => {
                const apt = isLunch ? null : aptMap[`${prof.id}__${slot}`];
                const isDropTarget = dragOver?.profId === prof.id && dragOver?.slot === slot;
                return (
                  <div
                    key={prof.id}
                    className={cn(
                      'border-l relative min-h-[60px] transition-colors',
                      isLunch && 'bg-orange-50/40',
                      !isLunch && !apt && 'hover:bg-muted/20',
                      isDropTarget && !apt && 'bg-blue-50 ring-2 ring-inset ring-blue-400',
                    )}
                    onDragOver={e => { if (!isLunch && !apt) { e.preventDefault(); setDragOver({ profId: prof.id, slot }); } }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => !isLunch && handleDrop(prof.id, slot)}
                  >
                    {apt && (
                      <AptCard
                        apt={apt}
                        isUpdating={updating === apt.id}
                        isDragging={dragging === apt.id}
                        onDragStart={() => handleDragStart(apt)}
                        onDragEnd={() => { setDragging(null); setDragOver(null); dragRef.current = null; }}
                        onMove={() => setMoving(apt)}
                        onComplete={() => doStatus(apt, 'COMPLETED')}
                        onCancel={() => doStatus(apt, 'CANCELLED')}
                        onConfirm={() => doStatus(apt, 'CONFIRMED')}
                        onReminder={() => onSendReminder(apt)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {slots.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum horário configurado para este dia.
          </div>
        )}
      </div>

      {/* ── Botão: Novo agendamento customizado ─────────────────────────── */}
      <div className="mt-4 flex justify-end">
        <button onClick={() => setShowCustomModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
          <Plus className="h-4 w-4" />
          Agendar com Procedimentos
        </button>
      </div>

      {/* ── Agendamentos com procedimentos do dia ───────────────────────── */}
      {dayCustom.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agendamentos com procedimentos</p>
          {dayCustom.map(ca => (
            <div key={ca.id} className="flex items-start justify-between gap-3 rounded-lg border-2 border-violet-300 bg-violet-50 p-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-violet-800 truncate">🔬 {ca.clientName}</p>
                <p className="text-xs text-violet-600">{ca.startTime}–{ca.endTime} · {ca.totalDurationMinutes}min{ca.professionalName ? ` · ${ca.professionalName}` : ''}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(ca.procedures ?? []).map(p => (
                    <span key={p.id} className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] text-violet-700">{p.name} ({p.durationMinutes}min)</span>
                  ))}
                </div>
              </div>
              <button onClick={() => removeCustomAppointment(ca.id)} className="text-destructive flex-shrink-0" title="Remover">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: criar agendamento customizado ────────────────────────── */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCustomModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-base">🔬 Agendar com Procedimentos</h3>
              <button onClick={() => setShowCustomModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Paciente */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do paciente</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                    <input value={customForm.clientName}
                      onChange={e => setCustomForm(f => ({...f, clientName: e.target.value}))}
                      placeholder="Nome completo"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">WhatsApp</label>
                    <input value={customForm.clientPhone}
                      onChange={e => setCustomForm(f => ({...f, clientPhone: e.target.value}))}
                      placeholder="(11) 99999-9999"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Início</label>
                    <input type="time" value={customForm.startTime}
                      onChange={e => setCustomForm(f => ({...f, startTime: e.target.value}))}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Profissional</label>
                    <select value={customForm.professionalId}
                      onChange={e => {
                        const opt = professionals.find(p => p.id === e.target.value);
                        setCustomForm(f => ({...f, professionalId: e.target.value, professionalName: opt?.displayName || ''}));
                      }}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="">Sem profissional</option>
                      {professionals.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Procedimentos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Procedimentos</p>
                  <button onClick={addProcedure} className="text-xs text-primary font-semibold flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                </div>
                {(customForm.procedures ?? []).map((proc, idx) => (
                  <div key={proc.id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4 flex-shrink-0">{idx+1}.</span>
                    <input value={proc.name}
                      onChange={e => updateProcedure(proc.id, 'name', e.target.value)}
                      placeholder="Nome do procedimento"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <input type="number" min="5" max="480" value={proc.durationMinutes}
                      onChange={e => updateProcedure(proc.id, 'durationMinutes', Number(e.target.value))}
                      className="w-20 border rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <span className="text-xs text-muted-foreground">min</span>
                    {(customForm.procedures ?? []).length > 1 && (
                      <button onClick={() => removeProcedure(proc.id)} className="text-destructive flex-shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Resumo */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-bold text-sm">{totalDuration} minutos</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Horário</p>
                    <p className="font-bold text-sm">{customForm.startTime} → {calcEndTime(customForm.startTime, totalDuration)}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Observações</label>
                <textarea value={customForm.notes}
                  onChange={e => setCustomForm(f => ({...f, notes: e.target.value}))}
                  rows={2} placeholder="Anotações adicionais..."
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
              </div>
            </div>

            <div className="p-5 border-t flex gap-3">
              <button onClick={() => setShowCustomModal(false)}
                className="flex-1 bg-muted text-muted-foreground font-semibold py-2.5 rounded-xl text-sm">
                Cancelar
              </button>
              <button onClick={saveCustomAppointment} disabled={savingCustom}
                className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {savingCustom ? 'Salvando...' : '✅ Bloquear Agenda'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

// ─── Card de agendamento ──────────────────────────────────────────────────────
const AptCard: React.FC<{
  apt: Appointment;
  isUpdating: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onReminder: () => void;
}> = ({ apt, isUpdating, isDragging, onDragStart, onDragEnd, onMove, onComplete, onCancel, onConfirm, onReminder }) => {
  const canEdit = !['CANCELLED', 'COMPLETED'].includes(apt.status);
  const color = STATUS_COLORS[apt.status] || STATUS_COLORS.PENDING;

  return (
    <div
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'absolute inset-0.5 rounded-lg border-l-4 p-1.5 text-xs select-none transition-all overflow-hidden',
        color,
        isDragging && 'opacity-30 scale-95',
        isUpdating && 'animate-pulse pointer-events-none',
        canEdit && 'cursor-grab active:cursor-grabbing',
        !canEdit && 'cursor-default',
      )}
    >
      {/* Nome + grip */}
      <div className="flex items-start justify-between gap-0.5">
        <span className="font-semibold leading-tight line-clamp-1">{apt.clientName}</span>
        {canEdit && <GripVertical className="h-3 w-3 shrink-0 opacity-40 hidden sm:block" />}
      </div>

      {/* Serviço */}
      <div className="line-clamp-1 opacity-80 mt-0.5">{apt.serviceName}</div>
      <div className="flex items-center gap-0.5 opacity-60 mt-0.5">
        <Clock className="h-2.5 w-2.5" />
        <span>{apt.startTime}–{apt.endTime}</span>
      </div>

      {/* Ações */}
      <div className="mt-1 flex flex-wrap gap-1">
        {/* Mover — funciona em mobile (seletor) e desktop (drag) */}
        {canEdit && (
          <button
            onClick={e => { e.stopPropagation(); onMove(); }}
            className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium hover:bg-white border border-current/20"
            title="Mover para outro horário"
          >📅 Mover</button>
        )}
        {apt.status === 'PENDING' && (
          <button onClick={e => { e.stopPropagation(); onConfirm(); }}
            className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700">
            ✓ Confirmar
          </button>
        )}
        {apt.status === 'CONFIRMED' && (
          <button onClick={e => { e.stopPropagation(); onComplete(); }}
            className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-green-700">
            ✓ Concluir
          </button>
        )}
        {canEdit && (
          <button onClick={e => { e.stopPropagation(); onCancel(); }}
            className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-200">
            ✕
          </button>
        )}
        {(apt as any).customerPhone && canEdit && (
          <button onClick={e => { e.stopPropagation(); onReminder(); }}
            className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 hover:bg-green-200"
            title="Lembrete WhatsApp">
            📱
          </button>
        )}
      </div>
    </div>
  );
};