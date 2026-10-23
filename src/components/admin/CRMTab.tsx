import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, where, getDocs, setDoc, getDoc,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  CRMClient, CRMInteraction, CRMTask,
  CRMLeadStatus, CRMInteractionType,
} from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import {
  Users, Plus, Search, Phone, Mail, Star, Clock, MessageSquare,
  CheckCircle2, Circle, Trash2, Edit2, ChevronDown, ChevronUp,
  TrendingUp, DollarSign, Calendar, Tag, Filter, X, BarChart2,
  Gift, AlertCircle, ArrowRight, Activity, Target, Zap,
  UserPlus, RefreshCw, Eye, Send, Heart, Award,
  Download, Upload, Settings, Flame, Thermometer,
  PlusCircle, LayoutGrid, FileText, ChevronRight,
  ArrowUpDown, BarChart, Layers, Hash, Bot, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isTomorrow, differenceInDays, addDays, parseISO, isThisMonth, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend,
} from 'recharts';

// ─── Tipos adicionais ─────────────────────────────────────────────────────────

interface CustomStage {
  key: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  emoji: string;
  order: number;
}

interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[]; // para type === 'select'
}

interface CRMFunnel {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

// ─── API helper ──────────────────────────────────────────────────────────────
const getToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve('');

// ─── Configurações de Status padrão ───────────────────────────────────────────

const DEFAULT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  lead:     { label: 'Lead',     color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',  emoji: '🔵' },
  prospect: { label: 'Prospect', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200', emoji: '🟡' },
  client:   { label: 'Cliente',  color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200', emoji: '🟢' },
  inactive: { label: 'Inativo',  color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200',  emoji: '⚫' },
  vip:      { label: 'VIP',      color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200',emoji: '👑' },
};

const INTERACTION_CONFIG: Record<CRMInteractionType, { label: string; icon: React.ReactNode; color: string }> = {
  call:        { label: 'Ligação',     icon: <Phone className="h-3.5 w-3.5" />,        color: 'text-blue-600' },
  whatsapp:    { label: 'WhatsApp',    icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'text-green-600' },
  email:       { label: 'E-mail',      icon: <Mail className="h-3.5 w-3.5" />,          color: 'text-purple-600' },
  visit:       { label: 'Visita',      icon: <Calendar className="h-3.5 w-3.5" />,      color: 'text-amber-600' },
  note:        { label: 'Anotação',    icon: <Edit2 className="h-3.5 w-3.5" />,         color: 'text-gray-600' },
  appointment: { label: 'Agendamento', icon: <Calendar className="h-3.5 w-3.5" />,      color: 'text-rose-600' },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Baixa',  color: 'text-gray-500',  bg: 'bg-gray-100' },
  medium: { label: 'Média',  color: 'text-amber-600', bg: 'bg-amber-100' },
  high:   { label: 'Alta',   color: 'text-red-600',   bg: 'bg-red-100' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyClient = (): Omit<CRMClient, 'id' | 'salonId' | 'createdAt' | 'updatedAt' | 'totalSpent' | 'totalVisits'> => ({
  name: '', phone: '', email: '', birthdate: '', address: '',
  status: 'lead', tags: [], source: '', notes: '',
});

const formatCurrency = (v?: number) => `R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function getBirthdayThisMonth(birthdate?: string): boolean {
  if (!birthdate) return false;
  const [, month] = birthdate.split('-');
  return parseInt(month) === new Date().getMonth() + 1;
}

function getDaysUntilBirthday(birthdate?: string): number | null {
  if (!birthdate) return null;
  const today = new Date();
  const [, month, day] = birthdate.split('-').map(Number);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return differenceInDays(next, today);
}

// ─── Lead Score ───────────────────────────────────────────────────────────────

function computeLeadScore(client: CRMClient): number {
  let score = 50;
  const visits = client.totalVisits ?? 0;
  const spent = client.totalSpent ?? 0;
  if (client.phone) score += 5;
  if (client.email) score += 5;
  if (visits > 5) score += 15;
  else if (visits > 2) score += 10;
  else if (visits > 0) score += 5;
  if (spent > 500) score += 10;
  else if (spent > 200) score += 5;
  const lastContact = client.lastVisit || client.updatedAt;
  if (lastContact) {
    const daysSince = differenceInDays(new Date(), new Date(lastContact));
    if (daysSince < 1) score += 25;
    else if (daysSince < 7) score += 15;
    else if (daysSince < 30) score += 5;
    else if (daysSince > 90) score -= 20;
    else if (daysSince > 60) score -= 15;
    else if (daysSince > 30) score -= 10;
  }
  if (client.status === 'vip') score += 20;
  else if (client.status === 'client') score += 15;
  else if (client.status === 'prospect') score += 5;
  else if (client.status === 'inactive') score -= 20;
  return Math.max(0, Math.min(100, score));
}

const LeadScoreBadge: React.FC<{ score: number; size?: 'sm' | 'md' }> = ({ score, size = 'sm' }) => {
  const isHot = score >= 70;
  const isWarm = score >= 40;
  const color = isHot ? 'text-red-600 bg-red-50 border-red-200' : isWarm ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-blue-600 bg-blue-50 border-blue-200';
  const icon = isHot ? '🔥' : isWarm ? '☀️' : '❄️';
  const label = isHot ? 'Quente' : isWarm ? 'Morno' : 'Frio';
  if (size === 'sm') {
    return (
      <span title={`Lead Score: ${score} — ${label}`} className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${color}`}>
        {icon} {score}
      </span>
    );
  }
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${color}`}>
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-xs font-bold">{label}</p>
        <p className="text-[10px] opacity-70">Score: {score}/100</p>
      </div>
      <div className="ml-auto w-16 h-2 rounded-full bg-white/60 overflow-hidden">
        <div className="h-full rounded-full bg-current transition-all" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
};

// ─── CSV Utilities ─────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
  });
}

function clientsToCSV(clients: CRMClient[], statusConfig: Record<string, { label: string }>): string {
  const headers = ['Nome', 'Telefone', 'Email', 'Status', 'Tags', 'Origem', 'Total Gasto', 'Total Visitas', 'Última Visita', 'Observações'];
  const rows = clients.map(c => [
    c.name, c.phone || '', c.email || '',
    statusConfig[c.status]?.label || c.status,
    (c.tags || []).join(';'),
    c.source || '',
    (c.totalSpent ?? 0).toFixed(2),
    c.totalVisits.toString(),
    c.lastVisit ? format(new Date(c.lastVisit), 'dd/MM/yyyy') : '',
    (c.notes || '').replace(/,/g, ';'),
  ]);
  return [headers, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

interface CSVImportModalProps {
  salonId: string;
  funnelId: string;
  statusConfig: Record<string, { label: string }>;
  onClose: () => void;
  onImported: (count: number) => void;
}

const CSVImportModal: React.FC<CSVImportModalProps> = ({ salonId, funnelId, statusConfig, onClose, onImported }) => {
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const FIELDS = [
    { key: 'name', label: 'Nome *', required: true },
    { key: 'phone', label: 'Telefone' },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status' },
    { key: 'tags', label: 'Tags (separadas por ;)' },
    { key: 'source', label: 'Origem' },
    { key: 'notes', label: 'Observações' },
    { key: 'birthdate', label: 'Data de nascimento (YYYY-MM-DD)' },
    { key: '_ignore', label: '— Ignorar coluna —' },
  ];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) { toast.error('Arquivo inválido ou vazio'); return; }
      setRows(parsed);
      setHeaders(Object.keys(parsed[0]));
      // Auto-map obvious columns
      const autoMap: Record<string, string> = {};
      Object.keys(parsed[0]).forEach(h => {
        const hl = h.toLowerCase();
        if (hl.includes('nome') || hl === 'name') autoMap[h] = 'name';
        else if (hl.includes('tel') || hl.includes('fone') || hl.includes('phone') || hl.includes('whats')) autoMap[h] = 'phone';
        else if (hl.includes('email') || hl.includes('mail')) autoMap[h] = 'email';
        else if (hl.includes('status')) autoMap[h] = 'status';
        else if (hl.includes('tag')) autoMap[h] = 'tags';
        else if (hl.includes('origem') || hl.includes('source')) autoMap[h] = 'source';
        else if (hl.includes('obs') || hl.includes('note')) autoMap[h] = 'notes';
        else if (hl.includes('nasc') || hl.includes('birth')) autoMap[h] = 'birthdate';
        else autoMap[h] = '_ignore';
      });
      setMapping(autoMap);
      setStep('map');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const startImport = async () => {
    setStep('preview');
    setImporting(true);
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const clientData: Partial<CRMClient> & { funnelId?: string } = {
        salonId, funnelId, totalSpent: 0, totalVisits: 0,
        createdAt: Date.now(), updatedAt: Date.now(), tags: [],
      };
      Object.entries(mapping).forEach(([col, field]) => {
        if (field === '_ignore' || !row[col]) return;
        if (field === 'tags') {
          (clientData as any).tags = row[col].split(';').map(t => t.trim()).filter(Boolean);
        } else if (field === 'status') {
          const statusLower = row[col].toLowerCase();
          const found = Object.entries(statusConfig).find(([k, v]) => k === statusLower || v.label.toLowerCase() === statusLower);
          (clientData as any).status = found ? found[0] : 'lead';
        } else {
          (clientData as any)[field] = row[col].trim();
        }
      });
      if (!clientData.name) continue;
      if (!(clientData as any).status) (clientData as any).status = 'lead';
      try {
        await addDoc(collection(db, `salons/${salonId}/crm_clients`), clientData);
        count++;
      } catch {}
      setProgress(Math.round(((i + 1) / rows.length) * 100));
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 50));
    }
    setImporting(false);
    onImported(count);
    setStep('done');
  };

  return (
    <div className="space-y-4">
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => fileRef.current?.click()}>
            <Upload className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-sm">Clique para selecionar o arquivo CSV</p>
            <p className="text-xs text-muted-foreground mt-1">ou arraste e solte aqui</p>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          </div>
          <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Formato esperado:</p>
            <p>• Arquivo CSV com cabeçalho na primeira linha</p>
            <p>• Colunas: nome, telefone, email, status, tags (separadas por ;)</p>
            <p>• Encoding UTF-8 (padrão do Excel ao "Salvar como CSV")</p>
            <p>• Máximo de 500 contatos por importação</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            const sample = '"nome","telefone","email","status","tags","origem"\n"Ana Silva","11999999999","ana@email.com","lead","tranças;penteado","Instagram"\n"Maria Santos","11888888888","","prospect","curso básico","Indicação"';
            downloadCSV(sample, 'modelo_importacao.csv');
          }} className="w-full">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar modelo de exemplo
          </Button>
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
            <strong>{rows.length} contatos</strong> encontrados. Mapeie as colunas abaixo:
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {headers.map(header => (
              <div key={header} className="flex items-center gap-3">
                <span className="text-sm font-medium w-40 truncate" title={header}>{header}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <Select value={mapping[header] || '_ignore'} onValueChange={v => setMapping(m => ({ ...m, [header]: v }))}>
                  <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELDS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Prévia (primeiras 3 linhas):</p>
            {rows.slice(0, 3).map((row, i) => {
              const name = row[Object.entries(mapping).find(([, v]) => v === 'name')?.[0] || ''] || '(sem nome)';
              const phone = row[Object.entries(mapping).find(([, v]) => v === 'phone')?.[0] || ''] || '';
              return <p key={i} className="text-xs">{name} {phone && `— ${phone}`}</p>;
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
            <Button onClick={startImport} disabled={!Object.values(mapping).includes('name')} className="flex-1">
              Importar {rows.length} contatos
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="py-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <p className="font-medium">Importando contatos...</p>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">{progress}% concluído</p>
        </div>
      )}

      {step === 'done' && (
        <div className="py-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <p className="font-bold text-lg">Importação concluída!</p>
          <p className="text-muted-foreground text-sm">{rows.length} contatos processados com sucesso</p>
          <Button onClick={onClose} className="mt-2">Fechar</Button>
        </div>
      )}
    </div>
  );
};

// ─── Configurações do Funil (Etapas Personalizáveis) ─────────────────────────

interface FunnelSettingsProps {
  salonId: string;
  customStages: CustomStage[];
  customFields: CustomField[];
  funnels: CRMFunnel[];
  onClose: () => void;
  onRefresh: () => void;
}

const FunnelSettings: React.FC<FunnelSettingsProps> = ({ salonId, customStages, customFields, funnels, onClose, onRefresh }) => {
  const [tab, setTab] = useState<'stages' | 'fields' | 'funnels'>('stages');
  const [stages, setStages] = useState<CustomStage[]>(
    customStages.length > 0 ? customStages : Object.entries(DEFAULT_STATUS_CONFIG).map(([key, v], i) => ({ key, ...v, order: i }))
  );
  const [fields, setFields] = useState<CustomField[]>(customFields);
  const [localFunnels, setLocalFunnels] = useState<CRMFunnel[]>(funnels);
  const [newFunnelName, setNewFunnelName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomField['type']>('text');
  const [saving, setSaving] = useState(false);

  const STAGE_COLORS = [
    { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
    { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
    { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
    { color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' },
    { color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
    { color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200' },
    { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  ];

  const saveStages = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, `salons/${salonId}/crm_settings/stages`), { stages, updatedAt: Date.now() });
      toast.success('Etapas salvas!');
      onRefresh();
    } catch { toast.error('Erro ao salvar etapas'); }
    setSaving(false);
  };

  const saveFields = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, `salons/${salonId}/crm_settings/custom_fields`), { fields, updatedAt: Date.now() });
      toast.success('Campos salvos!');
      onRefresh();
    } catch { toast.error('Erro ao salvar campos'); }
    setSaving(false);
  };

  const addStage = () => {
    const color = STAGE_COLORS[stages.length % STAGE_COLORS.length];
    const key = `stage_${Date.now()}`;
    setStages(prev => [...prev, { key, label: 'Nova etapa', emoji: '🔘', order: prev.length, ...color }]);
  };

  const updateStage = (key: string, field: keyof CustomStage, value: any) =>
    setStages(prev => prev.map(s => s.key === key ? { ...s, [field]: value } : s));

  const removeStage = (key: string) => setStages(prev => prev.filter(s => s.key !== key));

  const addField = () => {
    if (!newFieldLabel.trim()) return;
    const key = `field_${newFieldLabel.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    setFields(prev => [...prev, { key, label: newFieldLabel.trim(), type: newFieldType }]);
    setNewFieldLabel('');
  };

  const removeField = (key: string) => setFields(prev => prev.filter(f => f.key !== key));

  const addFunnel = async () => {
    if (!newFunnelName.trim()) return;
    try {
      const ref = await addDoc(collection(db, `salons/${salonId}/crm_funnels`), {
        name: newFunnelName.trim(), createdAt: Date.now(),
      });
      setLocalFunnels(prev => [...prev, { id: ref.id, name: newFunnelName.trim(), createdAt: Date.now() }]);
      setNewFunnelName('');
      onRefresh();
    } catch { toast.error('Erro ao criar funil'); }
  };

  const deleteFunnel = async (id: string) => {
    if (!confirm('Remover este funil? Os contatos não serão apagados.')) return;
    await deleteDoc(doc(db, `salons/${salonId}/crm_funnels`, id));
    setLocalFunnels(prev => prev.filter(f => f.id !== id));
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b pb-1">
        {[
          { key: 'stages', label: 'Etapas', Icon: LayoutGrid },
          { key: 'fields', label: 'Campos', Icon: Hash },
          { key: 'funnels', label: 'Funis', Icon: Layers },
        ].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'stages' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Personalize as etapas do seu funil. Arraste para reordenar.</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {stages.map((stage, idx) => (
              <div key={stage.key} className={`flex items-center gap-2 rounded-lg border p-2.5 ${stage.bg} ${stage.border}`}>
                <span className="text-base flex-shrink-0 cursor-move">⠿</span>
                <input value={stage.emoji} onChange={e => updateStage(stage.key, 'emoji', e.target.value)}
                  className="w-10 bg-white/50 border border-white/80 rounded px-1 py-0.5 text-center text-sm" maxLength={2} />
                <input value={stage.label} onChange={e => updateStage(stage.key, 'label', e.target.value)}
                  className="flex-1 bg-white/50 border border-white/80 rounded px-2 py-1 text-sm font-medium" />
                <Select value={`${idx % STAGE_COLORS.length}`}
                  onValueChange={v => { const c = STAGE_COLORS[parseInt(v)]; updateStage(stage.key, 'color', c.color); updateStage(stage.key, 'bg', c.bg); updateStage(stage.key, 'border', c.border); }}>
                  <SelectTrigger className="h-7 w-20 text-xs bg-white/50"><SelectValue placeholder="Cor" /></SelectTrigger>
                  <SelectContent>
                    {STAGE_COLORS.map((c, i) => (
                      <SelectItem key={i} value={String(i)}>
                        <span className={`font-medium ${c.color}`}>Cor {i + 1}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button onClick={() => removeStage(stage.key)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addStage} className="flex-1">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar etapa
            </Button>
            <Button size="sm" onClick={saveStages} disabled={saving} className="flex-1">
              {saving ? 'Salvando...' : 'Salvar etapas'}
            </Button>
          </div>
        </div>
      )}

      {tab === 'fields' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Campos extras que aparecem no cadastro de cada cliente.</p>
          <div className="space-y-2">
            {fields.map(field => (
              <div key={field.key} className="flex items-center gap-2 rounded-lg border p-2.5">
                <span className="flex-1 text-sm font-medium">{field.label}</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{field.type}</span>
                <button onClick={() => removeField(field.key)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {fields.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum campo personalizado ainda</p>}
          </div>
          <div className="flex gap-2">
            <Input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="Nome do campo" className="flex-1 h-8 text-xs" />
            <Select value={newFieldType} onValueChange={v => setNewFieldType(v as any)}>
              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="number">Número</SelectItem>
                <SelectItem value="date">Data</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={addField}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <Button size="sm" onClick={saveFields} disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar campos'}
          </Button>
        </div>
      )}

      {tab === 'funnels' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Crie funis separados para diferentes finalidades (ex: Captação de Alunas, Clientes do Salão).</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border p-2.5 bg-primary/5 border-primary/20">
              <Layers className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="flex-1 text-sm font-medium">Funil Principal</span>
              <span className="text-xs text-muted-foreground">padrão</span>
            </div>
            {localFunnels.map(funnel => (
              <div key={funnel.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm font-medium">{funnel.name}</span>
                <button onClick={() => deleteFunnel(funnel.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newFunnelName} onChange={e => setNewFunnelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFunnel()}
              placeholder="Nome do novo funil" className="flex-1 h-8 text-xs" />
            <Button variant="outline" size="sm" onClick={addFunnel} disabled={!newFunnelName.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Gráficos / Relatórios ─────────────────────────────────────────────────────

const ChartsView: React.FC<{ clients: CRMClient[] }> = ({ clients }) => {
  const [months, setMonths] = useState(6);

  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: months }, (_, i) => {
      const monthDate = subMonths(now, months - 1 - i);
      const start = startOfMonth(monthDate).getTime();
      const end = endOfMonth(monthDate).getTime();
      const monthClients = clients.filter(c => c.createdAt >= start && c.createdAt <= end);
      const converted = monthClients.filter(c => c.status === 'client' || c.status === 'vip').length;
      const total = monthClients.length;
      return {
        mes: format(monthDate, 'MMM/yy', { locale: ptBR }),
        novos: total,
        convertidos: converted,
        taxa: total > 0 ? Math.round(converted / total * 100) : 0,
        receita: monthClients.reduce((s, c) => s + c.totalSpent, 0),
      };
    });
  }, [clients, months]);

  const scoreData = useMemo(() => {
    const hot = clients.filter(c => computeLeadScore(c) >= 70).length;
    const warm = clients.filter(c => { const s = computeLeadScore(c); return s >= 40 && s < 70; }).length;
    const cold = clients.filter(c => computeLeadScore(c) < 40).length;
    return [
      { name: '🔥 Quentes', value: hot, fill: '#ef4444' },
      { name: '☀️ Mornos', value: warm, fill: '#f59e0b' },
      { name: '❄️ Frios', value: cold, fill: '#3b82f6' },
    ];
  }, [clients]);

  const totalRevenue = clients.reduce((s, c) => s + c.totalSpent, 0);
  const avgScore = clients.length > 0 ? Math.round(clients.reduce((s, c) => s + computeLeadScore(c), 0) / clients.length) : 0;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Relatórios do CRM</h3>
        <div className="flex gap-1">
          {[3, 6, 12].map(m => (
            <button key={m} onClick={() => setMonths(m)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${months === m ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {m}m
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de clientes', value: clients.length, color: 'text-primary' },
          { label: 'Receita total', value: formatCurrency(totalRevenue), color: 'text-green-600' },
          { label: 'Score médio', value: `${avgScore}/100`, color: avgScore >= 70 ? 'text-red-600' : avgScore >= 40 ? 'text-amber-600' : 'text-blue-600' },
          { label: 'Taxa de conversão', value: `${clients.length > 0 ? Math.round(clients.filter(c => c.status === 'client' || c.status === 'vip').length / clients.length * 100) : 0}%`, color: 'text-purple-600' },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-xl font-black mt-1 ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Novos contatos por mês */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Novos contatos por mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorNovos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [v, 'Novos contatos']} />
              <Area type="monotone" dataKey="novos" stroke="#7c3aed" fill="url(#colorNovos)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Taxa de conversão por mês */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Taxa de conversão mensal (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <ReBarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit="%" />
              <Tooltip formatter={(v) => [`${v}%`, 'Conversão']} />
              <Bar dataKey="taxa" fill="#10b981" radius={[4, 4, 0, 0]} />
            </ReBarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Lead Score distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Distribuição de temperatura dos leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {scoreData.map(item => (
              <div key={item.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{item.name}</span>
                  <span className="font-bold">{item.value} clientes</span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${clients.length > 0 ? (item.value / clients.length * 100) : 0}%`, backgroundColor: item.fill }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Receita por mês */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Receita por mês (R$)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <ReBarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} />
              <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Receita']} />
              <Bar dataKey="receita" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </ReBarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Formulário de Cliente (com campos personalizados) ────────────────────────

interface ClientFormProps {
  initial?: Partial<CRMClient & { customFields?: Record<string, any> }>;
  onSave: (data: Partial<CRMClient & { customFields?: Record<string, any> }>) => void;
  onClose: () => void;
  saving: boolean;
  statusConfig: Record<string, { label: string; emoji: string }>;
  customFields: CustomField[];
}

const ClientForm = ({ initial, onSave, onClose, saving, statusConfig, customFields }: ClientFormProps) => {
  const [form, setForm] = useState({ ...emptyClient(), ...initial });
  const [customData, setCustomData] = useState<Record<string, any>>((initial as any)?.customFields || {});
  const [tagInput, setTagInput] = useState('');
  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !(form.tags ?? []).includes(t)) set('tags', [...form.tags, t]);
    setTagInput('');
  };

  const SOURCES = ['Instagram', 'Facebook', 'Google', 'Indicação', 'WhatsApp', 'Passagem na rua', 'Evento', 'Outro'];

  return (
    <div className="space-y-4 py-2 max-h-[72vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome completo" />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => set('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(statusConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Telefone / WhatsApp</Label>
          <Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="(11) 99999-9999" />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Data de nascimento</Label>
          <Input type="date" value={form.birthdate || ''} onChange={e => set('birthdate', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Origem</Label>
          <Select value={form.source || ''} onValueChange={v => set('source', v)}>
            <SelectTrigger><SelectValue placeholder="Como nos conheceu?" /></SelectTrigger>
            <SelectContent>
              {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Endereço</Label>
        <Input value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="Rua, número, bairro, cidade" />
      </div>

      {/* Campos personalizados */}
      {customFields.length > 0 && (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campos personalizados</p>
          {customFields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs">{field.label}</Label>
              {field.type === 'date'
                ? <Input type="date" value={customData[field.key] || ''} onChange={e => setCustomData(d => ({ ...d, [field.key]: e.target.value }))} className="h-8 text-xs" />
                : field.type === 'number'
                ? <Input type="number" value={customData[field.key] || ''} onChange={e => setCustomData(d => ({ ...d, [field.key]: e.target.value }))} className="h-8 text-xs" />
                : <Input value={customData[field.key] || ''} onChange={e => setCustomData(d => ({ ...d, [field.key]: e.target.value }))} className="h-8 text-xs" />
              }
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Ex: frequente, cabelo, coloração..." />
          <Button type="button" variant="outline" size="sm" onClick={addTag}>Adicionar</Button>
        </div>
        {(form.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(form.tags ?? []).map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium">
                {tag}
                <button onClick={() => set('tags', (form.tags ?? []).filter(t => t !== tag))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Observações internas</Label>
        <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)}
          placeholder="Preferências, alergias, informações importantes..." rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!form.name.trim() || saving} onClick={() => onSave({ ...form, customFields: customData })}>
          {saving ? 'Salvando...' : (initial?.name ? 'Atualizar' : 'Adicionar ao CRM')}
        </Button>
      </div>
    </div>
  );
};

// ─── Card de Cliente (Kanban) — com Lead Score ────────────────────────────────

interface KanbanCardProps {
  client: CRMClient;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  statusConfig: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }>;
}

const KanbanCard = ({ client, onClick, onEdit, onDelete, onStatusChange, statusConfig }: KanbanCardProps) => {
  const st = statusConfig[client.status] || DEFAULT_STATUS_CONFIG.lead;
  const daysUntilBirthday = getDaysUntilBirthday(client.birthdate);
  const isBirthdaySoon = daysUntilBirthday !== null && daysUntilBirthday <= 7;
  const score = computeLeadScore(client);

  return (
    <div
      className={`rounded-xl border-2 ${st.border} bg-white cursor-pointer transition-all duration-200 group hover:shadow-lg hover:-translate-y-1 active:scale-[0.98]`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}
      onClick={onClick}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm truncate">{client.name}</span>
              {isBirthdaySoon && <span title={`Aniversário em ${daysUntilBirthday} dia(s)`}>🎂</span>}
            </div>
            {client.phone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" /> {client.phone}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit}>
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <LeadScoreBadge score={score} size="sm" />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {formatCurrency(client.totalSpent ?? 0)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {client.totalVisits ?? 0}x
          </span>
        </div>


      {(client.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(client.tags ?? []).slice(0, 2).map(tag => (
              <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{tag}</span>
            ))}
            {(client.tags ?? []).length > 2 && <span className="text-[10px] text-muted-foreground">+{(client.tags ?? []).length - 2}</span>}
          </div>
        )}

        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          {Object.keys(statusConfig).filter(s => s !== client.status).slice(0, 3).map(s => (
            <button key={s}
              title={`Mover para ${statusConfig[s]?.label}`}
              className="text-[10px] rounded px-1.5 py-0.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => onStatusChange(s)}>
              → {statusConfig[s]?.emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Coluna do Kanban ─────────────────────────────────────────────────────────

interface KanbanColumnProps {
  statusKey: string;
  config: { label: string; color: string; bg: string; border: string; emoji: string };
  clients: CRMClient[];
  onClientClick: (c: CRMClient) => void;
  onEdit: (c: CRMClient) => void;
  onDelete: (c: CRMClient) => void;
  onStatusChange: (client: CRMClient, status: string) => void;
  onAdd: (status: string) => void;
  statusConfig: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }>;
}

const KanbanColumn = ({ statusKey, config, clients, onClientClick, onEdit, onDelete, onStatusChange, onAdd, statusConfig }: KanbanColumnProps) => {
  const totalValue = clients.reduce((s, c) => s + (c.totalSpent ?? 0), 0);
  const avgScore = clients.length > 0 ? Math.round(clients.reduce((s, c) => s + computeLeadScore(c), 0) / clients.length) : 0;

  return (
    <div className={`rounded-2xl border-2 ${config.border} ${config.bg} w-full sm:min-w-[200px] sm:w-auto sm:flex-1 shrink-0 flex flex-col snap-start shadow-md hover:shadow-xl transition-all duration-300 relative overflow-hidden`}
      style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 15px -3px rgba(0,0,0,0.05), 0 0 0 1px rgba(255,255,255,0.4) inset' }}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      <div className="p-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{config.emoji}</span>
            <span className="font-semibold text-sm">{config.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${config.color} bg-white/80 border ${config.border}`}>{clients.length}</span>
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onAdd(statusKey)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {totalValue > 0 && <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(totalValue)}</p>}
        {clients.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Thermometer className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Score médio: {avgScore}</span>
          </div>
        )}
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-none sm:max-h-[55vh]">
        {clients.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">Nenhum {config.label.toLowerCase()} aqui</div>
        )}
        {clients
          .sort((a, b) => computeLeadScore(b) - computeLeadScore(a)) // Ordenar por score
          .map(c => (
          <KanbanCard
            key={c.id}
            client={c}
            onClick={() => onClientClick(c)}
            onEdit={() => onEdit(c)}
            onDelete={() => onDelete(c)}
            onStatusChange={s => onStatusChange(c, s)}
            statusConfig={statusConfig}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Return Date Setter ───────────────────────────────────────────────────────
const ReturnDateSetter: React.FC<{
  client: CRMClient;
  salonId: string;
  onUpdate: (data: Partial<CRMClient>) => void;
}> = ({ client, salonId, onUpdate }) => {
  const [date, setDate] = React.useState(client.returnDate || '');
  const [time, setTime] = React.useState(client.returnTime || '09:00');
  const [notes, setNotes] = React.useState(client.returnNotes || '');
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!date) return;
    setSaving(true);
    try {
      const token = await getToken();
      await fetch('/api/clients/set-return-date', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: client.id, returnDate: date, returnTime: time, clientPhone: client.phone, clientName: client.name }),
      });
      onUpdate({ returnDate: date, returnTime: time, returnNotes: notes });
      toast.success('✅ Retorno salvo! Paciente receberá confirmação + lembrete 1 dia antes.');
    } catch { toast.error('Erro ao salvar'); }
    setSaving(false);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] font-semibold text-blue-700 uppercase mb-1">Data</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-blue-700 uppercase mb-1">Horário</p>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>
      <input value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Observações do retorno (opcional)"
        className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300" />
      <button onClick={save} disabled={!date || saving}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl disabled:opacity-40 transition-colors">
        {saving ? 'Salvando...' : '📅 Salvar Retorno e Notificar Paciente'}
      </button>
      {client.returnDate && (
        <button onClick={() => onUpdate({ returnDate: undefined, returnTime: undefined })}
          className="w-full text-xs text-muted-foreground hover:text-destructive underline py-0.5">
          Remover data de retorno
        </button>
      )}
      <p className="text-[10px] text-blue-600">
        💬 Paciente recebe confirmação agora + lembrete automático 1 dia antes.
      </p>
    </div>
  );
};

// ─── Detalhes do Cliente ──────────────────────────────────────────────────────

interface ClientDetailProps {
  client: CRMClient;
  salonId: string;
  onClose: () => void;
  onUpdate: (data: Partial<CRMClient>) => void;
  statusConfig: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }>;
  customFields: CustomField[];
}

const ClientDetail = ({ client, salonId, onClose, onUpdate, statusConfig, customFields }: ClientDetailProps) => {
  const { user, profile } = useAuth();
  const [interactions, setInteractions] = useState<CRMInteraction[]>([]);
  const [tasks, setTasks] = useState<CRMTask[]>([]);
  const [activeTab, setActiveTab] = useState('timeline');
  const [interactionForm, setInteractionForm] = useState({ type: 'note' as CRMInteractionType, title: '', description: '', outcome: '', scheduledAt: '' });
  const [taskForm, setTaskForm] = useState({ title: '', description: '', dueDate: '', priority: 'medium' as 'low' | 'medium' | 'high' });
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [savingTask, setSavingTask] = useState(false);

  useEffect(() => {
    const q1 = query(collection(db, `salons/${salonId}/crm_interactions`), where('clientId', '==', client.id), orderBy('createdAt', 'desc'));
    const q2 = query(collection(db, `salons/${salonId}/crm_tasks`), where('clientId', '==', client.id), orderBy('createdAt', 'desc'));
    const u1 = onSnapshot(q1, snap => setInteractions(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CRMInteraction)));
    const u2 = onSnapshot(q2, snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CRMTask)));
    return () => { u1(); u2(); };
  }, [salonId, client.id]);

  const addInteraction = async () => {
    if (!interactionForm.title.trim()) return;
    setSavingInteraction(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/crm_interactions`), {
        salonId, clientId: client.id, type: interactionForm.type,
        title: interactionForm.title, description: interactionForm.description,
        outcome: interactionForm.outcome,
        scheduledAt: interactionForm.scheduledAt ? new Date(interactionForm.scheduledAt).getTime() : null,
        completedAt: Date.now(), createdBy: user?.uid || '', createdByName: profile?.displayName || '', createdAt: Date.now(),
      });
      setInteractionForm({ type: 'note', title: '', description: '', outcome: '', scheduledAt: '' });
      setShowInteractionForm(false);
      toast.success('Interação registrada!');
    } catch { toast.error('Erro ao salvar interação.'); }
    finally { setSavingInteraction(false); }
  };

  const addTask = async () => {
    if (!taskForm.title.trim()) return;
    setSavingTask(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/crm_tasks`), {
        salonId, clientId: client.id, clientName: client.name, ...taskForm, status: 'pending',
        assignedTo: user?.uid || '', assignedToName: profile?.displayName || '', createdAt: Date.now(),
      });
      setTaskForm({ title: '', description: '', dueDate: '', priority: 'medium' });
      setShowTaskForm(false);
      toast.success('Tarefa criada!');
    } catch { toast.error('Erro ao criar tarefa.'); }
    finally { setSavingTask(false); }
  };

  const toggleTask = async (task: CRMTask) => {
    await updateDoc(doc(db, `salons/${salonId}/crm_tasks`, task.id), { status: task.status === 'done' ? 'pending' : 'done' });
  };

  const deleteInteraction = async (id: string) => {
    if (!confirm('Remover esta interação?')) return;
    await deleteDoc(doc(db, `salons/${salonId}/crm_interactions`, id));
    toast.success('Interação removida.');
  };

  const st = statusConfig[client.status] || DEFAULT_STATUS_CONFIG.lead;
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const daysUntilBirthday = getDaysUntilBirthday(client.birthdate);
  const score = computeLeadScore(client);
  const customData = (client as any).customFields || {};

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold">{client.name}</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.color} ${st.border} border`}>{st.emoji} {st.label}</span>
            {daysUntilBirthday !== null && daysUntilBirthday <= 30 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 border border-pink-200 text-pink-700 px-2.5 py-0.5 text-xs font-medium">
                🎂 {daysUntilBirthday === 0 ? 'Hoje!' : daysUntilBirthday === 1 ? 'Amanhã!' : `em ${daysUntilBirthday} dias`}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {client.phone && (
              <a href={`https://wa.me/55${client.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-green-600 transition-colors">
                <Phone className="h-3.5 w-3.5" /> {client.phone}
              </a>
            )}
            {client.email && (
              <a href={`mailto:${client.email}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                <Mail className="h-3.5 w-3.5" /> {client.email}
              </a>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {/* Lead Score */}
      <LeadScoreBadge score={score} size="md" />

      {/* Status change */}
      <div className="flex gap-1.5 flex-wrap">
        {Object.entries(statusConfig).map(([s, cfg]) => (
          <button key={s} onClick={() => onUpdate({ status: s as CRMLeadStatus })}
            className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-all ${
              client.status === s ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm` : 'bg-muted text-muted-foreground border-transparent hover:bg-muted/80'
            }`}>
            {cfg.emoji} {cfg.label}
          </button>
        ))}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total gasto', value: formatCurrency(client.totalSpent ?? 0), icon: <DollarSign className="h-4 w-4" />, color: 'text-green-600' },
          { label: 'Visitas', value: `${client.totalVisits ?? 0}x`, icon: <Calendar className="h-4 w-4" />, color: 'text-blue-600' },
          { label: 'Última visita', value: client.lastVisit ? format(new Date(client.lastVisit), 'dd/MM/yy') : '—', icon: <Clock className="h-4 w-4" />, color: 'text-muted-foreground' },
        ].map(({ label, value, icon, color }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
              <p className="text-sm font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Infos */}
      {(client.source || client.birthdate || client.address || client.notes) && (
        <div className="rounded-lg border p-3 space-y-1.5 text-sm bg-muted/30">
          {client.source && <p><span className="font-medium text-muted-foreground">Origem:</span> {client.source}</p>}
          {client.birthdate && <p><span className="font-medium text-muted-foreground">Nascimento:</span> {format(parseISO(client.birthdate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>}
          {client.address && <p><span className="font-medium text-muted-foreground">Endereço:</span> {client.address}</p>}
          {client.notes && <p><span className="font-medium text-muted-foreground">Obs:</span> {client.notes}</p>}
        </div>
      )}

      {/* ── Próximo Retorno ── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-600" />
          <p className="text-sm font-semibold text-blue-800">Próximo Retorno</p>
          {client.returnDate && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {client.returnDate.split('-').reverse().join('/')}
              {client.returnTime ? ` às ${client.returnTime}` : ''}
            </span>
          )}
        </div>
        <ReturnDateSetter client={client} salonId={salonId} onUpdate={onUpdate} />
      </div>

      {/* Campos personalizados */}
      {customFields.length > 0 && Object.keys(customData).length > 0 && (
        <div className="rounded-lg border p-3 space-y-1.5 text-sm bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campos personalizados</p>
          {customFields.map(field => customData[field.key] ? (
            <p key={field.key}><span className="font-medium text-muted-foreground">{field.label}:</span> {customData[field.key]}</p>
          ) : null)}
        </div>
      )}

      {(client.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(client.tags ?? []).map(tag => (
            <span key={tag} className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">{tag}</span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="timeline"><Activity className="h-3.5 w-3.5 mr-1.5" /> Histórico ({interactions.length})</TabsTrigger>
          <TabsTrigger value="tasks"><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Tarefas ({pendingTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-3 mt-3">
          <Button size="sm" onClick={() => setShowInteractionForm(v => !v)} variant="outline" className="w-full">
            <Plus className="mr-1.5 h-3.5 w-3.5" />{showInteractionForm ? 'Cancelar' : 'Registrar Interação'}
          </Button>
          {showInteractionForm && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={interactionForm.type} onValueChange={v => setInteractionForm(f => ({ ...f, type: v as CRMInteractionType }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(INTERACTION_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Título *</Label>
                  <Input className="h-8 text-xs" value={interactionForm.title} onChange={e => setInteractionForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Ligação sobre retorno" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Textarea className="text-xs" rows={2} value={interactionForm.description} onChange={e => setInteractionForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Resultado</Label>
                  <Input className="h-8 text-xs" value={interactionForm.outcome} onChange={e => setInteractionForm(f => ({ ...f, outcome: e.target.value }))} placeholder="Ex: Agendou para semana" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Follow-up (opcional)</Label>
                  <Input type="date" className="h-8 text-xs" value={interactionForm.scheduledAt} onChange={e => setInteractionForm(f => ({ ...f, scheduledAt: e.target.value }))} />
                </div>
              </div>
              <Button size="sm" className="w-full" disabled={!interactionForm.title.trim() || savingInteraction} onClick={addInteraction}>
                {savingInteraction ? 'Salvando...' : 'Salvar Interação'}
              </Button>
            </div>
          )}
          {interactions.length === 0 && !showInteractionForm ? (
            <div className="py-8 text-center text-sm text-muted-foreground"><MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-20" />Nenhuma interação registrada ainda.</div>
          ) : (
            <div className="relative space-y-3">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              {interactions.map(interaction => {
                const cfg = INTERACTION_CONFIG[interaction.type];
                return (
                  <div key={interaction.id} className="relative pl-10">
                    <div className={`absolute left-2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-background border-2 border-border ${cfg.color}`}>{cfg.icon}</div>
                    <div className="rounded-lg border p-3 bg-background">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{interaction.title}</p>
                          <p className="text-[10px] text-muted-foreground">{cfg.label} · {format(new Date(interaction.createdAt), "dd/MM/yy 'às' HH:mm")}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteInteraction(interaction.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {interaction.description && <p className="text-xs text-muted-foreground mt-1">{interaction.description}</p>}
                      {interaction.outcome && <p className="text-xs mt-1.5 font-medium text-green-700 bg-green-50 rounded px-2 py-0.5">✓ {interaction.outcome}</p>}
                      {interaction.scheduledAt && <p className="text-xs mt-1.5 text-amber-700 bg-amber-50 rounded px-2 py-0.5">📅 Follow-up: {format(new Date(interaction.scheduledAt), "dd/MM/yyyy")}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-3 mt-3">
          <Button size="sm" onClick={() => setShowTaskForm(v => !v)} variant="outline" className="w-full">
            <Plus className="mr-1.5 h-3.5 w-3.5" />{showTaskForm ? 'Cancelar' : 'Nova Tarefa'}
          </Button>
          {showTaskForm && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Título *</Label>
                  <Input className="h-8 text-xs" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Ligar para confirmar" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prioridade</Label>
                  <Select value={taskForm.priority} onValueChange={v => setTaskForm(f => ({ ...f, priority: v as any }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Input type="date" className="h-8 text-xs" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} />
              <Button size="sm" className="w-full" disabled={!taskForm.title.trim() || savingTask} onClick={addTask}>
                {savingTask ? 'Criando...' : 'Criar Tarefa'}
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {pendingTasks.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa pendente. 🎉</p>}
            {pendingTasks.map(task => {
              const pri = PRIORITY_CONFIG[task.priority];
              const isOverdue = task.dueDate && new Date(task.dueDate + 'T23:59:59') < new Date();
              return (
                <div key={task.id} className={`flex items-start gap-3 rounded-lg border p-3 ${isOverdue ? 'border-red-200 bg-red-50' : ''}`}>
                  <button className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-600 transition-colors" onClick={() => toggleTask(task)}>
                    <Circle className="h-4 w-4" />
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-xs font-medium ${pri.color}`}>● {pri.label}</span>
                      {task.dueDate && <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{isOverdue ? '⚠️ Atrasada · ' : ''}até {format(new Date(task.dueDate + 'T00:00:00'), 'dd/MM/yy')}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {client.phone && (
        <div className="border-t pt-3 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" asChild>
            <a href={`https://wa.me/55${client.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
              <MessageSquare className="mr-1.5 h-3.5 w-3.5 text-green-600" /> WhatsApp
            </a>
          </Button>
          <Button size="sm" variant="outline" className="flex-1" asChild>
            <a href={`tel:${client.phone}`}><Phone className="mr-1.5 h-3.5 w-3.5 text-blue-600" /> Ligar</a>
          </Button>
        </div>
      )}
    </div>
  );
};

// ─── Painéis de Insights ──────────────────────────────────────────────────────

const BirthdayPanel = ({ clients }: { clients: CRMClient[] }) => {
  const thisMonth = clients.filter(c => c.birthdate && getBirthdayThisMonth(c.birthdate));
  const upcoming = thisMonth.map(c => ({ ...c, days: getDaysUntilBirthday(c.birthdate) ?? 999 })).sort((a, b) => a.days - b.days);
  if (thisMonth.length === 0) return null;
  return (
    <Card className="border-pink-200 bg-gradient-to-br from-pink-50 to-rose-50">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2 text-pink-700"><Gift className="h-4 w-4" /> Aniversariantes do mês ({thisMonth.length})</CardTitle></CardHeader>
      <CardContent className="pt-0 space-y-2">
        {upcoming.map(client => (
          <div key={client.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 border border-pink-100 p-2.5">
            <div>
              <p className="text-sm font-medium">{client.name}</p>
              <p className="text-xs text-muted-foreground">{format(parseISO(client.birthdate!), "dd 'de' MMMM", { locale: ptBR })}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-pink-600">{client.days === 0 ? '🎂 Hoje!' : client.days === 1 ? '🎉 Amanhã!' : `${client.days} dias`}</p>
              {client.phone && (
                <a href={`https://wa.me/55${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`🎂 Feliz aniversário, ${client.name.split(' ')[0]}! Temos um presente especial esperando por você. 🎁`)}`}
                  target="_blank" rel="noreferrer" className="text-[10px] text-green-600 hover:underline flex items-center gap-0.5 justify-end">
                  <MessageSquare className="h-3 w-3" /> Parabéns
                </a>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const ReengagementPanel = ({ clients }: { clients: CRMClient[] }) => {
  const inactive = clients.filter(c => c.lastVisit && differenceInDays(new Date(), new Date(c.lastVisit)) >= 45 && c.status !== 'inactive')
    .sort((a, b) => (a.lastVisit || 0) - (b.lastVisit || 0)).slice(0, 5);
  if (inactive.length === 0) return null;
  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2 text-amber-700"><RefreshCw className="h-4 w-4" /> Precisam de atenção ({inactive.length})</CardTitle></CardHeader>
      <CardContent className="pt-0 space-y-2">
        {inactive.map(client => {
          const days = differenceInDays(new Date(), new Date(client.lastVisit!));
          return (
            <div key={client.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 border border-amber-100 p-2.5">
              <div>
                <p className="text-sm font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">Última visita há {days} dias</p>
              </div>
              {client.phone && (
                <a href={`https://wa.me/55${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá, ${client.name.split(' ')[0]}! 😊 Sentimos sua falta! Que tal agendar uma visita?`)}`}
                  target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="text-xs border-amber-200 text-amber-700 hover:bg-amber-100 h-7">
                    <Send className="h-3 w-3 mr-1" /> Chamar
                  </Button>
                </a>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

// ─── Tarefas Gerais ───────────────────────────────────────────────────────────

const TasksOverview = ({ salonId }: { salonId: string }) => {
  const { user, profile } = useAuth();
  const [tasks, setTasks] = useState<CRMTask[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending');
  const [form, setForm] = useState({ title: '', description: '', dueDate: '', priority: 'medium' as 'low' | 'medium' | 'high' });

  useEffect(() => {
    const q = query(collection(db, `salons/${salonId}/crm_tasks`), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CRMTask)));
  }, [salonId]);

  const filtered = tasks.filter(t => filter === 'pending' ? t.status === 'pending' : filter === 'done' ? t.status === 'done' : true);
  const pending = tasks.filter(t => t.status === 'pending');
  const overdue = pending.filter(t => t.dueDate && new Date(t.dueDate + 'T23:59:59') < new Date());

  const addTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/crm_tasks`), {
        salonId, ...form, status: 'pending', assignedTo: user?.uid || '', assignedToName: profile?.displayName || '', createdAt: Date.now(),
      });
      setForm({ title: '', description: '', dueDate: '', priority: 'medium' });
      setShowForm(false);
      toast.success('Tarefa criada!');
    } catch { toast.error('Erro ao criar tarefa.'); }
    finally { setSaving(false); }
  };

  const toggleTask = async (task: CRMTask) => {
    await updateDoc(doc(db, `salons/${salonId}/crm_tasks`, task.id), { status: task.status === 'done' ? 'pending' : 'done' });
  };

  const deleteTask = async (id: string) => {
    await deleteDoc(doc(db, `salons/${salonId}/crm_tasks`, id));
    toast.success('Tarefa removida.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Tarefas</h3>
          <p className="text-sm text-muted-foreground">
            {pending.length} pendente(s)
            {overdue.length > 0 && <span className="text-red-600"> · {overdue.length} atrasada(s) ⚠️</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={v => setFilter(v as any)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="done">Concluídas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowForm(v => !v)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Nova</Button>
        </div>
      </div>
      {showForm && (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Título *</Label>
              <Input className="h-8 text-xs" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Título da tarefa" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prioridade</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input type="date" className="h-8 text-xs" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          <Button size="sm" className="w-full" disabled={!form.title.trim() || saving} onClick={addTask}>
            {saving ? 'Criando...' : 'Criar Tarefa'}
          </Button>
        </div>
      )}
      {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{filter === 'pending' ? 'Nenhuma tarefa pendente. 🎉' : 'Nenhuma tarefa encontrada.'}</p>}
      <div className="space-y-2">
        {filtered.map(task => {
          const pri = PRIORITY_CONFIG[task.priority];
          const isOverdue = task.status === 'pending' && task.dueDate && new Date(task.dueDate + 'T23:59:59') < new Date();
          const isDone = task.status === 'done';
          return (
            <div key={task.id} className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${isDone ? 'opacity-60 bg-muted/30' : isOverdue ? 'border-red-200 bg-red-50' : 'bg-background'}`}>
              <button className={`mt-0.5 shrink-0 transition-colors ${isDone ? 'text-green-600' : 'text-muted-foreground hover:text-green-600'}`} onClick={() => toggleTask(task)}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-muted-foreground">
                  {task.clientName && <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {task.clientName}</span>}
                  <span className={`font-medium ${pri.color}`}>● {pri.label}</span>
                  {task.dueDate && <span className={isOverdue ? 'text-red-600 font-medium' : ''}>{isOverdue ? '⚠️ ' : ''}até {format(new Date(task.dueDate + 'T00:00:00'), 'dd/MM/yy')}</span>}
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteTask(task.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Métricas Avançadas ───────────────────────────────────────────────────────

const AdvancedMetrics = ({ clients, statusConfig }: { clients: CRMClient[]; statusConfig: Record<string, { label: string }> }) => {
  const now = new Date();
  const metrics = useMemo(() => {
    const total = clients.length;
    const vip = clients.filter(c => c.status === 'vip').length;
    const activeClients = clients.filter(c => c.status === 'client').length;
    const totalRevenue = clients.reduce((s, c) => s + (c.totalSpent ?? 0), 0);
    const avgTicket = (activeClients + vip) > 0 ? clients.filter(c => c.status === 'client' || c.status === 'vip').reduce((s, c) => s + c.totalSpent, 0) / (activeClients + vip) : 0;
    const recentlyActive = clients.filter(c => c.lastVisit && differenceInDays(now, new Date(c.lastVisit)) <= 30).length;
    const atRisk = clients.filter(c => c.lastVisit && differenceInDays(now, new Date(c.lastVisit)) >= 45 && c.status !== 'inactive').length;
    const conversionRate = total > 0 ? ((activeClients + vip) / (total || 1) * 100).toFixed(1) : '0';
    return { total, vip, activeClients, totalRevenue, avgTicket, recentlyActive, atRisk, conversionRate };
  }, [clients]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total de Clientes', value: metrics.total, icon: <Users className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Receita Total', value: formatCurrency(metrics.totalRevenue), icon: <DollarSign className="h-5 w-5" />, color: 'text-green-600', bg: 'bg-green-100' },
          { label: 'Ticket Médio', value: formatCurrency(metrics.avgTicket), icon: <TrendingUp className="h-5 w-5" />, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Taxa de Conversão', value: `${metrics.conversionRate}%`, icon: <Target className="h-5 w-5" />, color: 'text-purple-600', bg: 'bg-purple-100' },
        ].map(({ label, value, icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg} ${color} shrink-0`}>{icon}</div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Funil por etapa</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(statusConfig).map(([status, cfg]) => {
              const count = clients.filter(c => c.status === status).length;
              const pct = clients.length > 0 ? count / clients.length * 100 : 0;
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{cfg.label}</span><span className="font-medium">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Engajamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Ativos (30 dias)', value: metrics.recentlyActive, color: 'text-green-600', dot: 'bg-green-500' },
              { label: 'Em risco (+45 dias)', value: metrics.atRisk, color: 'text-amber-600', dot: 'bg-amber-500' },
              { label: 'Aniversários (mês)', value: clients.filter(c => getBirthdayThisMonth(c.birthdate)).length, color: 'text-pink-600', dot: 'bg-pink-500' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <div className={`h-2 w-2 rounded-full ${item.dot}`} />{item.label}
                </div>
                <span className={`font-bold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ─── Inbox (Chat ao vivo com bot/humano toggle) ──────────────────────────────

interface InboxMessage { id: string; text: string; from: 'client' | 'bot' | 'owner'; timestamp: number; }


const InboxTab: React.FC<{ salonId: string; clients: CRMClient[]; statusConfig: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> }> = ({ salonId, clients, statusConfig }) => {
  const [selectedClient, setSelectedClient] = useState<CRMClient | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [aiSummary, setAISummary] = useState<{ summary: string; tags: string[]; suggestion: string } | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [quickReplies, setQuickReplies] = useState<{ id: string; title: string; text: string }[]>([]);
  const [showQReplies, setShowQReplies] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load messages real-time
  useEffect(() => {
    if (!selectedClient?.id) { setMessages([]); return; }
    const q = query(collection(db, `salons/${salonId}/crm_clients/${selectedClient.id}/messages`), orderBy('timestamp', 'asc'));
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as InboxMessage)));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });
  }, [salonId, selectedClient?.id]);

  // Sync selected client with live data
  useEffect(() => {
    if (selectedClient) {
      const fresh = clients.find(c => c.id === selectedClient.id);
      if (fresh) setSelectedClient(fresh);
    }
  }, [clients]);

  // Load quick replies
  useEffect(() => {
    getToken().then(t =>
      fetch('/api/crm/quick-replies', { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.json()).then(d => setQuickReplies(d.items || [])).catch(() => {})
    );
  }, [salonId]);

  const refreshAI = async () => {
    if (!selectedClient) return;
    setLoadingAI(true);
    try {
      const t = await getToken();
      const r = await fetch('/api/crm/ai-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ clientId: selectedClient.id }),
      });
      const d = await r.json();
      if (!d.error) setAISummary(d);
    } catch {}
    setLoadingAI(false);
  };

  const toggleTakeover = async (client: CRMClient) => {
    try {
      const t = await getToken();
      await fetch('/api/crm/takeover', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phone: client.phone, active: !client.humanTakeover }),
      });
      await updateDoc(doc(db, `salons/${salonId}/crm_clients/${client.id}`), { humanTakeover: !client.humanTakeover });
      toast.success(client.humanTakeover ? 'Bot reativado' : 'Você assumiu a conversa');
    } catch { toast.error('Erro'); }
  };

  const sendMessage = async (override?: string) => {
    const text = (override || draft).trim();
    if (!text || !selectedClient || sending) return;
    if (!override) setDraft('');
    setShowQReplies(false);
    setSending(true);
    try {
      const finalText = text.replace(/\{\{nome\}\}/gi, selectedClient.name || 'você');
      const t = await getToken();
      const r = await fetch('/api/crm/send-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phone: selectedClient.phone, message: finalText }),
      });
      if (!r.ok) {
        await addDoc(collection(db, `salons/${salonId}/crm_clients/${selectedClient.id}/messages`), {
          text: finalText, from: 'owner', timestamp: Date.now(),
        });
        toast.info('Salvo no histórico (WhatsApp não conectado)');
      }
    } catch { toast.error('Erro ao enviar'); }
    setSending(false);
    inputRef.current?.focus();
  };

  const sortedClients = [...clients].sort((a, b) => (b.lastContact || 0) - (a.lastContact || 0));
  const fmt = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const isToday = d.toDateString() === new Date().toDateString();
    return isToday ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="flex h-[70vh] border rounded-xl overflow-hidden bg-background">
      {/* Left: client list */}
      <div className={`flex flex-col ${selectedClient ? 'hidden sm:flex' : 'flex'} w-full sm:w-64 border-r`}>
        <div className="p-3 border-b bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversas</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedClients.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">Nenhum contato ainda</div>
          )}
          {sortedClients.map(client => {
            const st = statusConfig[client.status];
            const isSelected = selectedClient?.id === client.id;
            return (
              <button key={client.id} onClick={() => { setSelectedClient(client); setAISummary(null); setTimeout(() => refreshAI(), 400); }}
                className={`w-full text-left flex items-start gap-2.5 p-3 border-b transition-colors ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/30'}`}>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0 relative">
                  {(client.name?.[0] || '?').toUpperCase()}
                  {client.humanTakeover && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-rose-500 border border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold truncate">{client.name || client.phone}</p>
                    <p className="text-[9px] text-muted-foreground flex-shrink-0">{fmt(client.lastMessage?.timestamp || client.lastContact)}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{client.lastMessage?.text || (st ? `${st.emoji} ${st.label}` : '')}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: chat */}
      {selectedClient ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 p-3 border-b bg-muted/20 flex-shrink-0">
            <button onClick={() => setSelectedClient(null)} className="sm:hidden text-muted-foreground mr-1">
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
              {(selectedClient.name?.[0] || '?').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{selectedClient.name || selectedClient.phone}</p>
              <div className="flex items-center gap-1.5">
                {(() => { const s = statusConfig[selectedClient.status]; return s ? <span className={`text-[10px] font-medium ${s.color}`}>{s.emoji} {s.label}</span> : null; })()}
                {selectedClient.phone && <span className="text-[10px] text-muted-foreground">· {selectedClient.phone}</span>}
              </div>
            </div>
            {/* AI Summary refresh */}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={refreshAI} disabled={loadingAI} title="Análise IA">
              <Activity className={`h-3.5 w-3.5 ${loadingAI ? 'animate-spin' : ''}`} />
            </Button>
            {/* Bot/Human toggle */}
            <button onClick={() => toggleTakeover(selectedClient)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all ${selectedClient.humanTakeover ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
              {selectedClient.humanTakeover ? <><User className="h-3 w-3" /> Humano</> : <><Bot className="h-3 w-3" /> Bot</>}
            </button>
          </div>

          {/* AI Summary banner */}
          {aiSummary && (
            <div className="border-b bg-violet-50 px-3 py-2.5 flex-shrink-0">
              <p className="text-[9px] text-violet-500 font-bold uppercase tracking-wide mb-1">🧠 Análise IA</p>
              <p className="text-xs text-violet-800 leading-relaxed">{aiSummary.summary}</p>
              {aiSummary.tags?.length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {(aiSummary.tags ?? []).map((tag: string) => <span key={tag} className="text-[9px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full border border-violet-200">{tag}</span>)}
                </div>
              )}
              {aiSummary.suggestion && (
                <button onClick={() => setDraft(aiSummary.suggestion)} className="mt-1.5 text-[10px] text-rose-600 hover:underline">💡 Usar sugestão de resposta</button>
              )}
            </div>
          )}

          {/* Takeover notice */}
          {selectedClient.humanTakeover && (
            <div className="bg-rose-50 border-b border-rose-100 px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
              <User className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
              <span className="text-xs text-rose-600">Você está atendendo — bot pausado</span>
              <button onClick={() => toggleTakeover(selectedClient)} className="ml-auto text-[10px] text-rose-500 underline">Reativar bot</button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="h-8 w-8 opacity-20 mx-auto mb-2" />
                  <p className="text-sm">Sem mensagens ainda</p>
                </div>
              </div>
            )}
            {messages.map(msg => {
              const isClient = msg.from === 'client';
              const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
              return (
                <div key={msg.id} className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words ${isClient ? 'bg-muted text-foreground rounded-tl-sm' : msg.from === 'bot' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-rose-600 text-white rounded-tr-sm'}`}>
                    <p>{msg.text}</p>
                    <p className="text-[9px] opacity-50 mt-0.5 text-right flex items-center justify-end gap-1">
                      {msg.from === 'bot' && <Bot className="h-2.5 w-2.5" />}
                      {msg.from === 'owner' && <User className="h-2.5 w-2.5" />}
                      {time}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 flex-shrink-0 bg-muted/10">
            {!selectedClient.humanTakeover && (
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" /> Bot ativo</div>
                <button onClick={() => toggleTakeover(selectedClient)} className="text-xs text-rose-600 border border-rose-200 bg-rose-50 px-2.5 py-1 rounded-lg hover:bg-rose-100 transition-colors">Assumir conversa</button>
              </div>
            )}

            {/* Quick Replies */}
            {showQReplies && selectedClient.humanTakeover && (
              <div className="mb-2 rounded-lg border bg-background p-2 space-y-1 max-h-36 overflow-y-auto">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Respostas rápidas</span>
                  <button onClick={() => setShowQReplies(false)}><X className="h-3 w-3 text-muted-foreground" /></button>
                </div>
                {quickReplies.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhum template. Crie no CRM Pro.</p>}
                {quickReplies.map(r => (
                  <button key={r.id} onClick={() => { setDraft(r.text); setShowQReplies(false); }}
                    className="w-full text-left rounded-lg bg-muted/50 hover:bg-muted px-2.5 py-2 transition-colors">
                    <p className="text-xs font-semibold">{r.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{r.text}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 items-center">
              {selectedClient.humanTakeover && (
                <Button size="sm" variant="ghost" className={`h-9 w-9 p-0 flex-shrink-0 ${showQReplies ? 'bg-primary/10 text-primary' : ''}`} onClick={() => setShowQReplies(!showQReplies)} title="Respostas rápidas">
                  <Zap className="h-4 w-4" />
                </Button>
              )}
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                disabled={!selectedClient.humanTakeover || sending}
                placeholder={selectedClient.humanTakeover ? 'Digite... (Enter para enviar)' : 'Ative o modo humano para responder'}
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-40 disabled:cursor-not-allowed min-w-0"
              />
              <Button size="sm" onClick={() => sendMessage()} disabled={!selectedClient.humanTakeover || !draft.trim() || sending} className="h-9 w-9 p-0 flex-shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden sm:flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageSquare className="h-10 w-10 opacity-20 mx-auto mb-2" />
            <p className="text-sm font-medium">Selecione uma conversa</p>
            <p className="text-xs mt-1">As mensagens do WhatsApp aparecem aqui automaticamente</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────

interface CRMTabProps { salonId: string; }

export const CRMTab = ({ salonId }: CRMTabProps) => {
  const [clients, setClients] = useState<CRMClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<CRMClient | null>(null);
  const [editingClient, setEditingClient] = useState<CRMClient | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormStatus, setNewFormStatus] = useState<string>('lead');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('kanban');
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [botReport, setBotReport] = useState<any>(null);

  // Custom configuration
  const [customStages, setCustomStages] = useState<CustomStage[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [funnels, setFunnels] = useState<CRMFunnel[]>([]);
  const [activeFunnelId, setActiveFunnelId] = useState<string>('');

  // Computed status config (custom stages or defaults)
  const statusConfig = useMemo(() => {
    if (customStages.length > 0) {
      return Object.fromEntries(customStages.map(s => [s.key, { label: s.label, color: s.color, bg: s.bg, border: s.border, emoji: s.emoji }]));
    }
    return DEFAULT_STATUS_CONFIG;
  }, [customStages]);

  // Load settings from Firestore
  const loadSettings = useCallback(async () => {
    try {
      const [stagesDoc, fieldsDoc] = await Promise.all([
        getDoc(doc(db, `salons/${salonId}/crm_settings/stages`)),
        getDoc(doc(db, `salons/${salonId}/crm_settings/custom_fields`)),
      ]);
      if (stagesDoc.exists()) setCustomStages(stagesDoc.data().stages || []);
      if (fieldsDoc.exists()) setCustomFields(fieldsDoc.data().fields || []);
    } catch {}
  }, [salonId]);

  // Load funnels
  useEffect(() => {
    const q = query(collection(db, `salons/${salonId}/crm_funnels`), orderBy('createdAt', 'asc'));
    return onSnapshot(q, snap => setFunnels(snap.docs.map(d => ({ id: d.id, ...d.data() } as CRMFunnel))));
  }, [salonId]);

  // Load settings
  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Load clients (filtered by funnel)
  useEffect(() => {
    let q: any;
    if (activeFunnelId) {
      q = query(collection(db, `salons/${salonId}/crm_clients`), where('funnelId', '==', activeFunnelId), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, `salons/${salonId}/crm_clients`), orderBy('createdAt', 'desc'));
    }
    return onSnapshot(q, (snap: any) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CRMClient));
      setLoading(false);
    }, () => setLoading(false));
  }, [salonId, activeFunnelId]);

  // Load bot report
  useEffect(() => {
    if (!salonId) return;
    import('../../firebase').then(({ auth }) => {
      auth.currentUser?.getIdToken().then(token => {
        fetch('/api/bot/conversion-report', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).then(setBotReport).catch(() => {});
      });
    });
  }, [salonId]);

  const filtered = useMemo(() => clients.filter(c => {
    const matchSearch = !search || (c.name ?? '').toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()) || (c.tags ?? []).some(t => t.includes(search.toLowerCase()));
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  }), [clients, search, statusFilter]);

  const clientsByStatus = useMemo(() => {
    const result: Record<string, CRMClient[]> = {};
    Object.keys(statusConfig).forEach(k => result[k] = []);
    filtered.forEach(c => { if (result[c.status]) result[c.status].push(c); else { result['lead'] = result['lead'] || []; result['lead'].push(c); } });
    return result;
  }, [filtered, statusConfig]);

  const saveClient = async (data: Partial<CRMClient & { customFields?: Record<string, any> }>) => {
    if (!data.name?.trim()) return;
    setSaving(true);
    try {
      if (editingClient) {
        await updateDoc(doc(db, `salons/${salonId}/crm_clients`, editingClient.id), { ...data, updatedAt: Date.now() });
        toast.success('Cliente atualizado!');
        setEditingClient(null);
      } else {
        await addDoc(collection(db, `salons/${salonId}/crm_clients`), {
          ...data, status: data.status || newFormStatus, funnelId: activeFunnelId || null,
          salonId, totalSpent: 0, totalVisits: 0, createdAt: Date.now(), updatedAt: Date.now(),
        });
        toast.success('Cliente adicionado ao CRM!');
        setShowNewForm(false);
      }
    } catch { toast.error('Erro ao salvar cliente.'); }
    finally { setSaving(false); }
  };

  const updateClientStatus = async (client: CRMClient, status: string) => {
    await updateDoc(doc(db, `salons/${salonId}/crm_clients`, client.id), { status, updatedAt: Date.now() });
    if (selectedClient?.id === client.id) setSelectedClient(prev => prev ? { ...prev, status: status as CRMLeadStatus } : null);
    toast.success(`${client.name} → ${statusConfig[status]?.label || status}`);
  };

  const deleteClient = async (client: CRMClient) => {
    if (!confirm(`Remover ${client.name} do CRM?`)) return;
    await deleteDoc(doc(db, `salons/${salonId}/crm_clients`, client.id));
    if (selectedClient?.id === client.id) setSelectedClient(null);
    toast.success('Cliente removido.');
  };

  const openNewForm = (status: string = 'lead') => {
    setNewFormStatus(status);
    setEditingClient(null);
    setShowNewForm(true);
  };

  const handleExport = () => {
    const data = clientsToCSV(filtered, statusConfig);
    downloadCSV(data, `clientes_crm_${format(new Date(), 'dd-MM-yyyy')}.csv`);
    toast.success(`${filtered.length} clientes exportados!`);
  };

  if (loading) return (
    <div className="py-16 text-center text-muted-foreground">
      <Activity className="mx-auto mb-3 h-8 w-8 animate-pulse opacity-40" /> Carregando CRM...
    </div>
  );

  const TABS = [
    { value: 'kanban', label: 'Funil', icon: <Target className="h-3.5 w-3.5" /> },
    { value: 'inbox', label: 'Inbox', icon: <MessageSquare className="h-3.5 w-3.5" /> },
    { value: 'list', label: 'Clientes', icon: <Users className="h-3.5 w-3.5" /> },
    { value: 'tasks', label: 'Tarefas', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { value: 'metrics', label: 'Métricas', icon: <BarChart2 className="h-3.5 w-3.5" /> },
    { value: 'charts', label: 'Relatórios', icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { value: 'insights', label: 'Insights', icon: <Zap className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 truncate">
            <Zap className="h-5 w-5 text-primary shrink-0" /> CRM — Gestão de Clientes
          </h2>
          <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Funnel selector */}
          {funnels.length > 0 && (
            <Select value={activeFunnelId || '__main__'} onValueChange={v => setActiveFunnelId(v === '__main__' ? '' : v)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <Layers className="mr-1.5 h-3 w-3" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__main__">Funil Principal</SelectItem>
                {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)} className="h-8 text-xs">
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Importar
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} className="h-8 text-xs" disabled={filtered.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowSettings(true)} className="h-8 w-8 p-0">
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={() => openNewForm()} className="h-8 text-xs">
            <UserPlus className="mr-1.5 h-4 w-4" /> <span className="hidden sm:inline">Novo </span>Cliente
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {(() => {
        const birthdays = clients.filter(c => getBirthdayThisMonth(c.birthdate));
        const atRisk = clients.filter(c => c.lastVisit && differenceInDays(new Date(), new Date(c.lastVisit)) >= 45 && c.status !== 'inactive');
        const hotLeads = clients.filter(c => computeLeadScore(c) >= 70);
        return (
          <div className="flex flex-wrap gap-2">
            {birthdays.length > 0 && (
              <button className="flex items-center gap-1.5 rounded-full bg-pink-50 border border-pink-200 text-pink-700 px-3 py-1 text-xs font-medium hover:bg-pink-100 transition-colors" onClick={() => setActiveTab('insights')}>
                🎂 {birthdays.length} aniversariante(s) este mês
              </button>
            )}
            {atRisk.length > 0 && (
              <button className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 text-xs font-medium hover:bg-amber-100 transition-colors" onClick={() => setActiveTab('insights')}>
                ⚠️ {atRisk.length} cliente(s) precisam de atenção
              </button>
            )}
            {hotLeads.length > 0 && (
              <button className="flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 px-3 py-1 text-xs font-medium hover:bg-red-100 transition-colors" onClick={() => setActiveTab('charts')}>
                🔥 {hotLeads.length} lead(s) quente(s) agora
              </button>
            )}
          </div>
        );
      })()}

      {/* Bot report */}
      {botReport && botReport.totalContacts > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Contatos (30d)', value: botReport.totalContacts, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
            { label: 'Agendaram', value: botReport.converted, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
            { label: 'Conversão', value: `${botReport.conversionRate}%`, color: botReport.conversionRate >= 30 ? 'text-emerald-700' : 'text-amber-700', bg: botReport.conversionRate >= 30 ? 'bg-emerald-50' : 'bg-amber-50', border: botReport.conversionRate >= 30 ? 'border-emerald-200' : 'border-amber-200' },
            { label: 'Semana', value: `${botReport.week?.rate || 0}%`, color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
          ].map(item => (
            <div key={item.label} className={`rounded-xl border ${item.border} ${item.bg} p-2.5 text-center`}>
              <p className="text-[10px] text-slate-500 mb-0.5">{item.label}</p>
              <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto gap-0 p-0 bg-transparent border-b rounded-none w-full justify-start overflow-x-auto scrollbar-hide">
          {TABS.map(({ value, label, icon }) => (
            <button key={value} onClick={() => setActiveTab(value)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${activeTab === value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {icon} {label}
            </button>
          ))}
        </TabsList>

        {/* Search & filter bar */}
        {(activeTab === 'kanban' || activeTab === 'list') && (
          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar nome, telefone, tag..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}><X className="h-4 w-4 text-muted-foreground" /></button>}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="mr-1.5 h-3.5 w-3.5" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Sort by score */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5">
              <Thermometer className="h-3.5 w-3.5" /> Ordenados por score
            </div>
          </div>
        )}

        {/* Kanban */}
        <TabsContent value="kanban" className="mt-4">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 h-12 w-12 opacity-20" />
              <p className="font-medium">Nenhum cliente ainda</p>
              <p className="text-sm mt-1">Adicione manualmente ou importe via CSV</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button onClick={() => openNewForm()}><UserPlus className="mr-1.5 h-4 w-4" /> Adicionar</Button>
                <Button variant="outline" onClick={() => setShowImport(true)}><Upload className="mr-1.5 h-4 w-4" /> Importar CSV</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:overflow-x-auto sm:pb-6" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
              {Object.entries(statusConfig).map(([statusKey, config]) => (
                <KanbanColumn
                  key={statusKey}
                  statusKey={statusKey}
                  config={config}
                  clients={clientsByStatus[statusKey] || []}
                  onClientClick={setSelectedClient}
                  onEdit={c => { setEditingClient(c); setShowNewForm(false); }}
                  onDelete={deleteClient}
                  onStatusChange={updateClientStatus}
                  onAdd={openNewForm}
                  statusConfig={statusConfig}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Lista */}
        <TabsContent value="inbox" className="mt-4">
          <InboxTab salonId={salonId} clients={clients} statusConfig={statusConfig} />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 h-10 w-10 opacity-20" /><p>Nenhum cliente encontrado.</p>
              <Button className="mt-4" variant="outline" onClick={() => openNewForm()}><Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar cliente</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.sort((a, b) => computeLeadScore(b) - computeLeadScore(a)).map(client => {
                const st = statusConfig[client.status] || DEFAULT_STATUS_CONFIG.lead;
                const score = computeLeadScore(client);
                return (
                  <div key={client.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 cursor-pointer transition-colors group" onClick={() => setSelectedClient(client)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{client.name}</span>
                        <span className={`text-xs rounded-full px-2 py-0.5 ${st.bg} ${st.color} ${st.border} border`}>{st.emoji} {st.label}</span>
                        <LeadScoreBadge score={score} size="sm" />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        {client.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {client.phone}</span>}
                        <span>{formatCurrency(client.totalSpent)}</span>
                        <span>{client.totalVisits} visitas</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingClient(client); setShowNewForm(false); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteClient(client)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4"><TasksOverview salonId={salonId} /></TabsContent>
        <TabsContent value="metrics" className="mt-4"><AdvancedMetrics clients={clients} statusConfig={statusConfig} /></TabsContent>
        <TabsContent value="charts" className="mt-4"><ChartsView clients={clients} /></TabsContent>
        <TabsContent value="insights" className="mt-4 space-y-4">
          <BirthdayPanel clients={clients} />
          <ReengagementPanel clients={clients} />
          {clients.filter(c => getBirthdayThisMonth(c.birthdate)).length === 0 && clients.filter(c => c.lastVisit && differenceInDays(new Date(), new Date(c.lastVisit)) >= 45).length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <Award className="mx-auto mb-3 h-10 w-10 opacity-20" />
              <p className="font-medium">Tudo em dia! ✨</p>
              <p className="text-sm mt-1">Nenhum aniversariante este mês e todos os clientes ativos.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* CSV Import Dialog */}
      <Dialog open={showImport} onOpenChange={o => { if (!o) setShowImport(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Importar contatos via CSV</DialogTitle></DialogHeader>
          <CSVImportModal salonId={salonId} funnelId={activeFunnelId} statusConfig={statusConfig}
            onClose={() => setShowImport(false)}
            onImported={count => { toast.success(`${count} contatos importados!`); setShowImport(false); }} />
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={o => { if (!o) setShowSettings(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Configurações do CRM</DialogTitle></DialogHeader>
          <FunnelSettings salonId={salonId} customStages={customStages} customFields={customFields} funnels={funnels}
            onClose={() => setShowSettings(false)} onRefresh={loadSettings} />
        </DialogContent>
      </Dialog>

      {/* New/Edit Client Dialog */}
      <Dialog open={showNewForm || !!editingClient} onOpenChange={o => { if (!o) { setShowNewForm(false); setEditingClient(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingClient ? `Editar — ${editingClient.name}` : `Novo Cliente ${statusConfig[newFormStatus]?.emoji || ''}`}</DialogTitle>
          </DialogHeader>
          <ClientForm initial={editingClient || { status: newFormStatus as CRMLeadStatus }}
            onSave={saveClient} onClose={() => { setShowNewForm(false); setEditingClient(null); }}
            saving={saving} statusConfig={statusConfig} customFields={customFields} />
        </DialogContent>
      </Dialog>

      {/* Client Detail Dialog */}
      <Dialog open={!!selectedClient} onOpenChange={o => { if (!o) setSelectedClient(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="sr-only">Detalhes do Cliente</DialogTitle></DialogHeader>
          {selectedClient && (
            <ClientDetail client={selectedClient} salonId={salonId} statusConfig={statusConfig} customFields={customFields}
              onClose={() => setSelectedClient(null)}
              onUpdate={async (data) => {
                await updateDoc(doc(db, `salons/${salonId}/crm_clients`, selectedClient.id), { ...data, updatedAt: Date.now() });
                setSelectedClient(prev => prev ? { ...prev, ...data } : null);
                toast.success('Cliente atualizado!');
              }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
