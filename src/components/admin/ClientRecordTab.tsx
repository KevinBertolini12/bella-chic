import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, where, setDoc, getDocs,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';

const _tok = () => auth.currentUser?.getIdToken() ?? Promise.resolve('');
import { useAuth } from '../../contexts/AuthContext';
import { BusinessType, ClientRecord, ClientSession } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Plus, Search, Edit2, Trash2, FileText, User,
  Phone, Mail, Clock, ChevronDown, ChevronUp, X,
  Stethoscope, Scissors, Dumbbell, Briefcase, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Labels adaptáveis por tipo de negócio ────────────────────────────────────

const LABELS: Record<BusinessType, {
  title: string;
  clientLabel: string;
  sessionLabel: string;
  notesLabel: string;
  preferencesLabel: string;
  icon: React.ReactNode;
  sessionTitle: string;
}> = {
  beauty: {
    title: 'Fichas de Clientes',
    clientLabel: 'Cliente',
    sessionLabel: 'Atendimento',
    notesLabel: 'Observações gerais',
    preferencesLabel: 'Preferências (tom de pele, tipo de cabelo, produtos favoritos...)',
    icon: <Scissors className="h-5 w-5 text-rose-600" />,
    sessionTitle: 'Histórico de Atendimentos',
  },
  health: {
    title: 'Prontuários',
    clientLabel: 'Paciente',
    sessionLabel: 'Sessão/Consulta',
    notesLabel: 'Observações clínicas',
    preferencesLabel: 'Queixa principal / Motivo de consulta',
    icon: <Stethoscope className="h-5 w-5 text-blue-600" />,
    sessionTitle: 'Evoluções Clínicas',
  },
  fitness: {
    title: 'Fichas de Alunos',
    clientLabel: 'Aluno',
    sessionLabel: 'Sessão de treino',
    notesLabel: 'Observações gerais',
    preferencesLabel: 'Objetivos e restrições físicas',
    icon: <Dumbbell className="h-5 w-5 text-green-600" />,
    sessionTitle: 'Histórico de Treinos',
  },
  services: {
    title: 'Briefing de Clientes',
    clientLabel: 'Cliente',
    sessionLabel: 'Reunião/Sessão',
    notesLabel: 'Observações gerais',
    preferencesLabel: 'Necessidades e objetivos do cliente',
    icon: <Briefcase className="h-5 w-5 text-purple-600" />,
    sessionTitle: 'Histórico de Atendimentos',
  },
  sports: {
    title: 'Fichas de Clientes',
    clientLabel: 'Cliente',
    sessionLabel: 'Reserva/Treino',
    notesLabel: 'Observações gerais',
    preferencesLabel: 'Modalidade, nível e restrições',
    icon: <Dumbbell className="h-5 w-5 text-orange-600" />,
    sessionTitle: 'Histórico de Reservas',
  },
};

const getToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve('');

interface PatientSuggestion { name: string; phone: string; email?: string; source: string; }

const usePatientSearch2 = (salonId: string, searchQuery: string) => {
  const [results, setResults] = React.useState<PatientSuggestion[]>([]);
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const q = searchQuery.toLowerCase();
      const all: PatientSuggestion[] = [];
      try {
        const crmSnap = await getDocs(collection(db, `salons/${salonId}/crm_clients`));
        crmSnap.docs.forEach(d => {
          const data = d.data();
          if ((data.name ?? '').toLowerCase().includes(q) || (data.phone ?? '').includes(q))
            all.push({ name: data.name, phone: data.phone ?? '', email: data.email, source: 'CRM' });
        });
      } catch {}
      const seen = new Set<string>();
      setResults(all.filter(a => { const key = a.phone || a.name; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 5));
    }, 300);
    return () => clearTimeout(timer);
  }, [salonId, searchQuery]);
  return results;
};

const PatientSearchInput2: React.FC<{ salonId: string; value: string; onChange: (v: string) => void; onSelect: (p: PatientSuggestion) => void; placeholder?: string }> = ({ salonId, value, onChange, onSelect, placeholder }) => {
  const [open, setOpen] = React.useState(false);
  const results = usePatientSearch2(salonId, value);
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => value.length >= 2 && setOpen(true)}
          placeholder={placeholder ?? 'Nome completo...'} className="pl-9" />
        {value && <button onClick={() => { onChange(''); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[9999] mt-1 rounded-xl border border-border bg-white shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" /><p className="text-[10px] text-muted-foreground font-semibold uppercase">Do CRM</p>
          </div>
          {results.map((p, i) => (
            <button key={i} onMouseDown={() => { onSelect(p); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">{(p.name?.[0] ?? '?').toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{p.name}</p>
                {p.phone && <p className="text-xs text-muted-foreground">{p.phone}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const newSession = (): ClientSession => ({
  id: Date.now().toString(),
  date: new Date().toISOString().split('T')[0],
  title: '',
  notes: '',
  professionalName: '',
});

// ─── Formulário de Ficha ──────────────────────────────────────────────────────

interface RecordFormProps {
  salonId: string;
  initial?: Partial<ClientRecord>;
  businessType: BusinessType;
  onSave: (data: Partial<ClientRecord>) => void;
  onClose: () => void;
  saving: boolean;
}

const RecordForm = ({ initial, businessType, salonId, onSave, onClose, saving }: RecordFormProps) => {
  const lb = LABELS[businessType];
  const [form, setForm] = useState<Partial<ClientRecord>>({
    clientName: '', clientPhone: '', clientEmail: '',
    notes: '', allergies: '', preferences: '',
    birthdate: '', bloodType: '', medications: '', medicalHistory: '',
    sessions: [],
    ...initial,
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 py-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nome do {lb.clientLabel} *</Label>
          <PatientSearchInput2 salonId={salonId} value={form.clientName || ''}
            onChange={v => set('clientName', v)}
            onSelect={p => { set('clientName', p.name); set('clientPhone', p.phone); if (p.email) set('clientEmail', p.email); }}
            placeholder={`Buscar entre seus pacientes do CRM...`} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone / WhatsApp</Label>
          <Input value={form.clientPhone || ''} onChange={e => set('clientPhone', e.target.value)} placeholder="(11) 99999-9999" />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.clientEmail || ''} onChange={e => set('clientEmail', e.target.value)} placeholder="email@exemplo.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Data de nascimento</Label>
          <Input type="date" value={form.birthdate || ''} onChange={e => set('birthdate', e.target.value)} />
        </div>
      </div>

      {/* Campos específicos de saúde */}
      {businessType === 'health' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 p-3 rounded-lg border border-blue-100 bg-blue-50/50">
          <div className="space-y-1.5">
            <Label className="text-blue-800">Tipo sanguíneo</Label>
            <Input className="h-8" value={form.bloodType || ''} onChange={e => set('bloodType', e.target.value)} placeholder="Ex: A+" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-blue-800">Medicamentos em uso</Label>
            <Input value={form.medications || ''} onChange={e => set('medications', e.target.value)} placeholder="Listar medicamentos, dosagens..." />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-blue-800">Histórico médico relevante</Label>
            <Textarea rows={2} value={form.medicalHistory || ''} onChange={e => set('medicalHistory', e.target.value)} placeholder="Doenças pré-existentes, cirurgias, alergias a medicamentos..." />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Alergias / Restrições</Label>
        <Input value={form.allergies || ''} onChange={e => set('allergies', e.target.value)} placeholder="Ex: alergia a latex, glúten, amendoim..." />
      </div>

      <div className="space-y-1.5">
        <Label>{lb.preferencesLabel}</Label>
        <Textarea rows={3} value={form.preferences || ''} onChange={e => set('preferences', e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>{lb.notesLabel}</Label>
        <Textarea rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Observações adicionais..." />
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!form.clientName?.trim() || saving} onClick={() => onSave(form)}>
          {saving ? 'Salvando...' : initial?.id ? 'Atualizar' : 'Criar Ficha'}
        </Button>
      </div>
    </div>
  );
};

// ─── Detalhe da Ficha ─────────────────────────────────────────────────────────

interface RecordDetailProps {
  record: ClientRecord;
  businessType: BusinessType;
  salonId: string;
  onClose: () => void;
  onEdit: () => void;
}

const RecordDetail = ({ record, businessType, salonId, onClose, onEdit }: RecordDetailProps) => {
  const { profile } = useAuth();
  const lb = LABELS[businessType];
  const [sessions, setSessions] = useState<ClientSession[]>(record.sessions || []);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionForm, setSessionForm] = useState(newSession());
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scoreData, setScoreData] = useState<any>(null);
  const [loadingScore, setLoadingScore] = useState(false);

  const checkScore = async () => {
    if (!record.clientCpf) { toast.error('CPF não cadastrado nesta ficha.'); return; }
    setLoadingScore(true);
    try {
      const token = await _tok();
      const r = await fetch('/api/clients/score-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cpf: record.clientCpf }),
      });
      const d = await r.json();
      if (r.status === 403 && d.error === 'add-on-required') {
        toast.error('Função premium — ative o add-on de Score em Configurações > Assinatura.');
        return;
      }
      if (!r.ok) throw new Error(d.error);
      setScoreData(d);
      if (d.isMock) toast.info('Resultado simulado — integração real disponível como add-on.');
    } catch (e: any) { toast.error(e.message || 'Erro'); }
    setLoadingScore(false);
  };

  const addSession = async () => {
    if (!sessionForm.title.trim() || !sessionForm.notes.trim()) {
      toast.error('Preencha o título e as anotações.');
      return;
    }
    setSaving(true);
    try {
      const newSess: ClientSession = {
        ...sessionForm,
        id: Date.now().toString(),
        professionalName: sessionForm.professionalName || profile?.displayName || '',
      };
      const updated = [newSess, ...sessions];
      await updateDoc(doc(db, `salons/${salonId}/client_records`, record.id), {
        sessions: updated,
        updatedAt: Date.now(),
      });
      setSessions(updated);
      setSessionForm(newSession());
      setShowSessionForm(false);
      toast.success(`${lb.sessionLabel} registrado!`);
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const deleteSession = async (sessionId: string) => {
    const updated = sessions.filter(s => s.id !== sessionId);
    await updateDoc(doc(db, `salons/${salonId}/client_records`, record.id), {
      sessions: updated, updatedAt: Date.now(),
    });
    setSessions(updated);
    toast.success('Registro removido.');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{record.clientName}</h2>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
            {record.clientPhone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {record.clientPhone}</span>}
            {record.clientEmail && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {record.clientEmail}</span>}
            {record.birthdate && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {format(new Date(record.birthdate + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}</span>}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onEdit}><Edit2 className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Dados clínicos (só saúde) */}
      {businessType === 'health' && (record.bloodType || record.medications || record.medicalHistory) && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-1.5 text-sm">
          <p className="font-semibold text-blue-800 text-xs uppercase tracking-wide">Dados Clínicos</p>
          {record.bloodType && <p><span className="font-medium">Tipo sanguíneo:</span> {record.bloodType}</p>}
          {record.medications && <p><span className="font-medium">Medicamentos:</span> {record.medications}</p>}
          {record.medicalHistory && <p><span className="font-medium">Histórico:</span> {record.medicalHistory}</p>}
        </div>
      )}

      {/* Info geral */}
      {(record.allergies || record.preferences || record.notes) && (
        <div className="rounded-lg border p-3 space-y-1.5 text-sm bg-muted/20">
          {record.allergies && <p><span className="font-medium">Alergias/Restrições:</span> {record.allergies}</p>}
          {record.preferences && <p><span className="font-medium">{lb.preferencesLabel.split('(')[0].trim()}:</span> {record.preferences}</p>}
          {record.notes && <p><span className="font-medium">Obs:</span> {record.notes}</p>}
        </div>
      )}

      {/* Score Check (add-on) */}
      {record.clientCpf && (
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Consulta de Score / CPF</p>
              {record.clientCpf && <p className="text-xs text-muted-foreground mt-0.5">CPF: {record.clientCpf}</p>}
            </div>
            <button onClick={checkScore} disabled={loadingScore}
              className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
              {loadingScore ? 'Consultando...' : '🔍 Consultar Score'}
            </button>
          </div>
          {scoreData && (
            <div className="mt-3 rounded-lg border p-3 bg-white space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Score: {scoreData.score}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  scoreData.score >= 700 ? 'bg-green-100 text-green-700' :
                  scoreData.score >= 400 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>{scoreData.classification}</span>
              </div>
              <p className="text-xs text-muted-foreground">{scoreData.risk}</p>
              <p className="text-xs font-medium">{scoreData.recommendation}</p>
              {scoreData.isMock && <p className="text-[9px] text-muted-foreground italic">* Resultado simulado</p>}
            </div>
          )}
        </div>
      )}

      {/* Sessões */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{lb.sessionTitle} ({sessions.length})</h3>
          <Button size="sm" onClick={() => setShowSessionForm(v => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo registro
          </Button>
        </div>

        {showSessionForm && (
          <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input type="date" className="h-8 text-xs" value={sessionForm.date}
                  onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Título / Procedimento *</Label>
                <Input className="h-8 text-xs" value={sessionForm.title}
                  onChange={e => setSessionForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={businessType === 'health' ? 'Ex: Consulta de retorno' : 'Ex: Atendimento'} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Anotações / Evolução *</Label>
              <Textarea className="text-xs" rows={4} value={sessionForm.notes}
                onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={businessType === 'health'
                  ? 'Queixa, exame clínico, diagnóstico, conduta, prescrição...'
                  : 'Descreva o que foi realizado...'} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" disabled={saving} onClick={addSession}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowSessionForm(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {sessions.length === 0 && !showSessionForm && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum registro ainda.</p>
        )}

        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} className="rounded-lg border bg-background">
              <div className="flex items-center justify-between gap-2 p-3 cursor-pointer"
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(s.date + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                    {s.professionalName && ` · ${s.professionalName}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                    onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  {expanded === s.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
              {expanded === s.id && (
                <div className="border-t px-3 pb-3 pt-2">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{s.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────

interface ClientRecordTabProps {
  salonId: string;
  businessType: BusinessType;
}

export const ClientRecordTab = ({ salonId, businessType }: ClientRecordTabProps) => {
  const lb = LABELS[businessType];
  const [records, setRecords] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, `salons/${salonId}/client_records`),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClientRecord));
      setLoading(false);
    }, () => setLoading(false));
  }, [salonId]);

  const filtered = useMemo(() => records.filter(r =>
    !search ||
    r.clientName.toLowerCase().includes(search.toLowerCase()) ||
    r.clientPhone?.includes(search) ||
    r.clientEmail?.toLowerCase().includes(search.toLowerCase())
  ), [records, search]);

  const saveRecord = async (data: Partial<ClientRecord>) => {
    if (!data.clientName?.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, `salons/${salonId}/client_records`, editing.id), { ...data, updatedAt: Date.now() });
        toast.success('Ficha atualizada!');
        setEditing(null);
        if (selected?.id === editing.id) setSelected(prev => prev ? { ...prev, ...data } as ClientRecord : null);
      } else {
        await addDoc(collection(db, `salons/${salonId}/client_records`), {
          ...data, salonId, sessions: [], businessType, createdAt: Date.now(), updatedAt: Date.now(),
        });
        toast.success('Ficha criada!');
        setShowForm(false);
      }

      // Sincroniza com o CRM universal pelo telefone
      if (data.clientPhone) {
        fetch('/api/client/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            salonId,
            phone: data.clientPhone,
            name: data.clientName || undefined,
            email: data.clientEmail || undefined,
            birthdate: data.birthdate || undefined,
            allergies: data.allergies || undefined,
            notes: data.notes || undefined,
            source: 'ficha',
          }),
        }).catch(() => {});
      }
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const deleteRecord = async (record: ClientRecord) => {
    if (!confirm(`Excluir ficha de ${record.clientName}?`)) return;
    await deleteDoc(doc(db, `salons/${salonId}/client_records`, record.id));
    if (selected?.id === record.id) setSelected(null);
    toast.success('Ficha excluída.');
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando fichas...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">{lb.icon} {lb.title}</h2>
          <p className="text-sm text-muted-foreground">{records.length} {lb.clientLabel.toLowerCase()}(s) cadastrado(s)</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova Ficha
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder={`Buscar ${lb.clientLabel.toLowerCase()}...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <User className="mx-auto mb-3 h-10 w-10 opacity-20" />
          <p>Nenhuma ficha encontrada.</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}><Plus className="mr-1.5 h-4 w-4" /> Criar primeira ficha</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(record => (
            <Card key={record.id} className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelected(record)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{record.clientName}</p>
                    {record.clientPhone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {record.clientPhone}</p>}
      {record.returnDate && (
        <p className="text-xs text-blue-600 font-medium mt-0.5">
          📅 Retorno: {record.returnDate.split('-').reverse().join('/')}{record.returnTime ? ` às ${record.returnTime}` : ''}
        </p>
      )}
                    <p className="text-xs text-muted-foreground mt-1">{record.sessions?.length || 0} registro(s)</p>
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => { setEditing(record); setShowForm(false); }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                      onClick={() => deleteRecord(record)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {record.allergies && (
                  <p className="mt-2 rounded bg-red-50 border border-red-100 px-2 py-0.5 text-xs text-red-700 truncate">
                    ⚠️ {record.allergies}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog — criar/editar */}
      <Dialog open={showForm || !!editing} onOpenChange={o => { if (!o) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar — ${editing.clientName}` : `Nova Ficha`}</DialogTitle>
          </DialogHeader>
          <RecordForm
            initial={editing || undefined}
            businessType={businessType}
            salonId={salonId}
            onSave={saveRecord}
            onClose={() => { setShowForm(false); setEditing(null); }}
            saving={saving}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog — detalhe */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="sr-only">Detalhes do Paciente</DialogTitle></DialogHeader>
          {selected && (
            <RecordDetail
              record={selected}
              businessType={businessType}
              salonId={salonId}
              onClose={() => setSelected(null)}
              onEdit={() => { setEditing(selected); setSelected(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
