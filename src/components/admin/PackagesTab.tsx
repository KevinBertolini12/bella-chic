import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { BusinessType, ServicePackage, PackageSession, PackageStatus } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Plus, Trash2, Edit2, DollarSign, CheckCircle2,
  Circle, Package, Search, X, TrendingUp, Sparkles, Phone,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG: Record<PackageStatus, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Aguard. Pagamento', color: 'text-amber-700', bg: 'bg-amber-100' },
  active:          { label: 'Ativo',             color: 'text-green-700',  bg: 'bg-green-100' },
  completed:       { label: 'Concluído',          color: 'text-blue-700',  bg: 'bg-blue-100' },
  cancelled:       { label: 'Cancelado',          color: 'text-red-700',   bg: 'bg-red-100' },
};

const LABELS: Record<BusinessType, { title: string; packageLabel: string; sessionLabel: string; placeholder: string }> = {
  beauty:   { title: 'Pacotes',           packageLabel: 'Pacote',          sessionLabel: 'Sessão',   placeholder: 'Ex: Pacote Hidratação 5x' },
  health:   { title: 'Planos de Tratamento', packageLabel: 'Plano',        sessionLabel: 'Sessão',   placeholder: 'Ex: Plano Ortodôntico 12 meses' },
  fitness:  { title: 'Pacotes de Treino', packageLabel: 'Pacote',          sessionLabel: 'Aula',     placeholder: 'Ex: Pacote 10 Aulas' },
  sports:   { title: 'Pacotes de Horas',  packageLabel: 'Pacote',          sessionLabel: 'Reserva',  placeholder: 'Ex: Pacote 10 horas de quadra' },
  services: { title: 'Programas',         packageLabel: 'Programa',        sessionLabel: 'Reunião',  placeholder: 'Ex: Programa Consultoria 8 sessões' },
};

const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const getToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve('');

interface PatientSuggestion { name: string; phone: string; email?: string; source: string; }

const usePatientSearch = (salonId: string, searchQuery: string) => {
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
        const recSnap = await getDocs(collection(db, `salons/${salonId}/client_records`));
        recSnap.docs.forEach(d => {
          const data = d.data();
          if ((data.clientName ?? '').toLowerCase().includes(q) || (data.clientPhone ?? '').includes(q))
            if (!all.find(a => a.phone === data.clientPhone))
              all.push({ name: data.clientName, phone: data.clientPhone ?? '', email: data.clientEmail, source: 'Prontuário' });
        });
      } catch {}
      const seen = new Set<string>();
      setResults(all.filter(a => { const key = a.phone || a.name; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 5));
    }, 300);
    return () => clearTimeout(timer);
  }, [salonId, searchQuery]);
  return results;
};

const PatientSearchInput: React.FC<{ salonId: string; value: string; onChange: (v: string) => void; onSelect: (p: PatientSuggestion) => void; placeholder?: string }> = ({ salonId, value, onChange, onSelect, placeholder }) => {
  const [open, setOpen] = React.useState(false);
  const results = usePatientSearch(salonId, value);
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const SOURCE_COLORS: Record<string, string> = { 'CRM': 'bg-violet-100 text-violet-700', 'Prontuário': 'bg-blue-100 text-blue-700' };
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => value.length >= 2 && setOpen(true)}
          placeholder={placeholder ?? 'Nome completo ou pesquise...'} className="pl-9" />
        {value && <button onClick={() => { onChange(''); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[9999] mt-1 rounded-xl border border-border bg-white shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" /><p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Pacientes</p>
          </div>
          {results.map((p, i) => (
            <button key={i} onMouseDown={() => { onSelect(p); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs flex-shrink-0">{(p.name?.[0] ?? '?').toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</p>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${SOURCE_COLORS[p.source] ?? 'bg-gray-100 text-gray-600'}`}>{p.source}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const newPackageSession = (n: number): PackageSession => ({
  id: Date.now().toString() + n,
  sessionNumber: n,
  description: '',
  status: 'pending',
});

// ─── Formulário de Pacote ─────────────────────────────────────────────────────

interface PackageFormProps {
  initial?: Partial<ServicePackage>;
  businessType: BusinessType;
  salonId: string;
  onSave: (data: Partial<ServicePackage>) => void;
  onClose: () => void;
  saving: boolean;
}

const PackageForm = ({ initial, businessType, salonId, onSave, onClose, saving }: PackageFormProps) => {
  const lb = LABELS[businessType];
  const [form, setForm] = useState<Partial<ServicePackage>>({
    clientName: '', clientPhone: '', clientEmail: '', clientCpf: '',
    name: '', description: '', totalSessions: 5,
    pricePerSession: 0, discount: 0, sessions: [],
    ...initial,
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const totalPrice = (form.totalSessions || 0) * (form.pricePerSession || 0);
  const finalPrice = Math.max(0, totalPrice - (form.discount || 0));

  const buildSessions = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      (form.sessions || [])[i] || newPackageSession(i + 1)
    );

  const handleSessionCount = (n: number) => {
    set('totalSessions', n);
    set('sessions', buildSessions(n));
  };

  const updateSession = (idx: number, field: keyof PackageSession, val: any) => {
    const updated = [...(form.sessions || [])];
    updated[idx] = { ...updated[idx], [field]: val };
    set('sessions', updated);
  };

  const handleSave = () => {
    if (!form.clientName?.trim()) { toast.error('Nome do cliente obrigatório.'); return; }
    if (!form.name?.trim()) { toast.error('Nome do pacote obrigatório.'); return; }
    onSave({ ...form, totalPrice, finalPrice });
  };

  // Inicializa sessões se não tiver
  useEffect(() => {
    if (!form.sessions || (form.sessions ?? []).length === 0) {
      set('sessions', buildSessions(form.totalSessions || 5));
    }
  }, []);

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 py-2">
      {/* Cliente */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nome do cliente *</Label>
          <Input value={form.clientName || ''} onChange={e => set('clientName', e.target.value)} placeholder="Nome completo" />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone / WhatsApp</Label>
          <Input value={form.clientPhone || ''} onChange={e => set('clientPhone', e.target.value)} placeholder="(11) 99999-9999" />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.clientEmail || ''} onChange={e => set('clientEmail', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>CPF (para cobrança)</Label>
          <Input value={form.clientCpf || ''} onChange={e => set('clientCpf', e.target.value)} placeholder="000.000.000-00" />
        </div>
      </div>

      {/* Pacote */}
      <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
        <div className="space-y-1.5">
          <Label>Nome do {lb.packageLabel} *</Label>
          <Input value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder={lb.placeholder} />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="O que está incluído..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label>Qtd. {lb.sessionLabel}s</Label>
            <Input type="number" min="1" max="100" value={form.totalSessions || 0}
              onChange={e => handleSessionCount(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor por {lb.sessionLabel}</Label>
            <Input type="number" min="0" step="0.01" value={form.pricePerSession || 0}
              onChange={e => set('pricePerSession', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Desconto (R$)</Label>
            <Input type="number" min="0" step="0.01" value={form.discount || 0}
              onChange={e => set('discount', Number(e.target.value))} />
          </div>
        </div>
        <div className="rounded-lg bg-background border p-3 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {form.totalSessions}x {fmt(form.pricePerSession || 0)} = {fmt(totalPrice)}
            {(form.discount || 0) > 0 && ` − ${fmt(form.discount || 0)}`}
          </div>
          <div className="text-lg font-bold text-primary">{fmt(finalPrice)}</div>
        </div>
      </div>

      {/* Sessões */}
      {(form.sessions || []).length > 0 && (
        <div className="space-y-2">
          <Label>{lb.sessionLabel}s do {lb.packageLabel}</Label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {(form.sessions || []).map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6 shrink-0">{i + 1}.</span>
                <Input className="h-7 text-xs flex-1" value={s.description}
                  onChange={e => updateSession(i, 'description', e.target.value)}
                  placeholder={`${lb.sessionLabel} ${i + 1} — descrição opcional`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={saving} onClick={handleSave}>
          {saving ? 'Salvando...' : initial?.id ? 'Atualizar' : `Criar ${lb.packageLabel}`}
        </Button>
      </div>
    </div>
  );
};

// ─── Detalhe do Pacote ────────────────────────────────────────────────────────

interface PackageDetailProps {
  pkg: ServicePackage;
  businessType: BusinessType;
  salonId: string;
  onClose: () => void;
  onEdit: () => void;
}

const PackageDetail = ({ pkg, businessType, salonId, onClose, onEdit }: PackageDetailProps) => {
  const lb = LABELS[businessType];
  const [sessions, setSessions] = useState<PackageSession[]>(pkg.sessions || []);
  const progress = sessions.filter(s => s.status === 'completed').length;
  const pct = pkg.totalSessions > 0 ? Math.round((progress / pkg.totalSessions) * 100) : 0;

  const toggleSession = async (idx: number) => {
    const updated = sessions.map((s, i) => i === idx
      ? { ...s, status: s.status === 'completed' ? 'pending' as const : 'completed' as const, completedAt: Date.now() }
      : s
    );
    const allDone = updated.every(s => s.status === 'completed');
    setSessions(updated);
    await updateDoc(doc(db, `salons/${salonId}/packages`, pkg.id), {
      sessions: updated,
      sessionsUsed: updated.filter(s => s.status === 'completed').length,
      status: allDone ? 'completed' : 'active',
      updatedAt: Date.now(),
    });
    if (allDone) toast.success(`${lb.packageLabel} concluído! 🎉`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{pkg.name}</h2>
          <p className="text-muted-foreground text-sm">{pkg.clientName}</p>
          {pkg.clientPhone && <p className="text-xs text-muted-foreground">{pkg.clientPhone}</p>}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onEdit}><Edit2 className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Progresso */}
      <div className="rounded-xl border p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">{progress} de {pkg.totalSessions} {lb.sessionLabel.toLowerCase()}s</span>
          <span className="font-bold text-primary">{pct}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Valor total: {fmt(pkg.finalPrice)}</span>
          <span className={STATUS_CONFIG[pkg.status].color}>{STATUS_CONFIG[pkg.status].label}</span>
        </div>
      </div>

      {/* Lista de sessões */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">{lb.sessionLabel}s</h3>
        {sessions.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${s.status === 'completed' ? 'bg-green-50 border-green-200' : 'hover:bg-muted/30'}`}
            onClick={() => toggleSession(i)}>
            {s.status === 'completed'
              ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${s.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                {lb.sessionLabel} {s.sessionNumber}{s.description ? ` — ${s.description}` : ''}
              </p>
              {s.completedAt && (
                <p className="text-xs text-green-600">Concluída em {format(new Date(s.completedAt), "dd/MM/yyyy")}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────

interface PackagesTabProps {
  salonId: string;
  businessType: BusinessType;
}

export const PackagesTab = ({ salonId, businessType }: PackagesTabProps) => {
  const lb = LABELS[businessType];
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PackageStatus | 'all'>('all');
  const [selected, setSelected] = useState<ServicePackage | null>(null);
  const [editing, setEditing] = useState<ServicePackage | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, `salons/${salonId}/packages`), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ServicePackage));
      setLoading(false);
    }, () => setLoading(false));
  }, [salonId]);

  const filtered = useMemo(() => packages.filter(p => {
    const ms = !search || p.clientName.toLowerCase().includes(search.toLowerCase()) || p.name.toLowerCase().includes(search.toLowerCase());
    const mst = statusFilter === 'all' || p.status === statusFilter;
    return ms && mst;
  }), [packages, search, statusFilter]);

  const metrics = useMemo(() => ({
    total: packages.length,
    active: packages.filter(p => p.status === 'active').length,
    completed: packages.filter(p => p.status === 'completed').length,
    revenue: packages.filter(p => ['active', 'completed'].includes(p.status)).reduce((s, p) => s + p.finalPrice, 0),
  }), [packages]);

  const savePkg = async (data: Partial<ServicePackage>) => {
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, `salons/${salonId}/packages`, editing.id), { ...data, updatedAt: Date.now() });
        toast.success(`${lb.packageLabel} atualizado!`);
        setEditing(null);
      } else {
        await addDoc(collection(db, `salons/${salonId}/packages`), {
          ...data, salonId, status: 'active', sessionsUsed: 0,
          createdAt: Date.now(), updatedAt: Date.now(),
        });
        toast.success(`${lb.packageLabel} criado!`);
        setShowForm(false);
      }
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const deletePkg = async (pkg: ServicePackage) => {
    if (!confirm(`Excluir ${lb.packageLabel.toLowerCase()} de ${pkg.clientName}?`)) return;
    await deleteDoc(doc(db, `salons/${salonId}/packages`, pkg.id));
    if (selected?.id === pkg.id) setSelected(null);
    toast.success('Excluído.');
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando {lb.title.toLowerCase()}...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> {lb.title}</h2>
          <p className="text-sm text-muted-foreground">Gerencie {lb.packageLabel.toLowerCase()}s e acompanhe o progresso.</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Novo {lb.packageLabel}
        </Button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: metrics.total, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Ativos', value: metrics.active, color: 'text-green-600', bg: 'bg-green-100' },
          { label: 'Concluídos', value: metrics.completed, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Receita', value: fmt(metrics.revenue), color: 'text-purple-600', bg: 'bg-purple-100' },
        ].map(({ label, value, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente ou pacote..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Package className="mx-auto mb-3 h-10 w-10 opacity-20" />
          <p>Nenhum {lb.packageLabel.toLowerCase()} encontrado.</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Criar primeiro {lb.packageLabel.toLowerCase()}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(pkg => {
            const st = STATUS_CONFIG[pkg.status];
            const pct = pkg.totalSessions > 0 ? Math.round((pkg.sessionsUsed / pkg.totalSessions) * 100) : 0;
            return (
              <Card key={pkg.id} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelected(pkg)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{pkg.name}</span>
                        <span className={`text-xs rounded-full px-2 py-0.5 ${st.bg} ${st.color}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{pkg.clientName} · {fmt(pkg.finalPrice)}</p>
                    </div>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => { setEditing(pkg); setShowForm(false); }}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                        onClick={() => deletePkg(pkg)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{pkg.sessionsUsed}/{pkg.totalSessions} {lb.sessionLabel.toLowerCase()}s</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={showForm || !!editing} onOpenChange={o => { if (!o) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? `Editar ${lb.packageLabel}` : `Novo ${lb.packageLabel}`}</DialogTitle></DialogHeader>
          <PackageForm initial={editing || undefined} businessType={businessType} salonId={salonId}
            onSave={savePkg} onClose={() => { setShowForm(false); setEditing(null); }} saving={saving} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="sr-only">Detalhes do Pacote</DialogTitle></DialogHeader>
          {selected && <PackageDetail pkg={selected} businessType={businessType} salonId={salonId}
            onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setSelected(null); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};
