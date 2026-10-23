import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc,
  updateDoc, doc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SEO } from '../components/SEO';
import { toast } from 'sonner';
import {
  LayoutGrid, MessageSquare, CheckSquare, BarChart3,
  MoreHorizontal, Plus, Search, X, ArrowRight, Send,
  Paperclip, ChevronLeft, Bot, User, Tag, StickyNote,
  Clock, CheckCircle2, Circle, Calendar, TrendingUp,
  WifiOff, Wifi, Zap, Repeat2, Radio, Film,
  Trash2, Image, FileAudio, FileText, Bell,
  Star, Moon, Users, Hash, ChevronRight,
  AlertTriangle, Activity, Inbox, Filter, Target,
  ToggleLeft, ToggleRight, Phone, GripVertical,
  Sparkles, Shield, Crown, Flame, Scissors,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type LeadStatus = 'lead' | 'prospect' | 'client' | 'inactive' | 'vip';
type MainTab = 'funil' | 'inbox' | 'tasks' | 'stats' | 'more';
type MoreTab = 'followup' | 'quickreplies' | 'bulk' | 'media' | 'whatsapp' | 'postservice' | 'context';

interface Lead {
  id: string; name: string; phone: string; email?: string;
  notes?: string; status: LeadStatus; tags?: string[];
  lastContact?: number; lastMessage?: { text: string; from: string; timestamp: number };
  humanTakeover?: boolean; source?: string; createdAt?: number;
  birthdate?: string;      // "YYYY-MM-DD"
  lastServiceDate?: number; // timestamp do último atendimento marcado
  lastServiceName?: string; // nome do serviço realizado → vira tag automática
}
interface Message {
  id: string; text: string; from: 'client' | 'bot' | 'owner';
  timestamp: number; mediaType?: string; mediaUrl?: string;
}
interface QuickReply { id: string; title: string; text: string; createdAt: number; }
interface FollowUpStep { delayDays: number; message: string; }
interface FollowUpSequence {
  id: string; name: string; triggerStatus: LeadStatus;
  steps: FollowUpStep[]; active: boolean; createdAt: number;
}
interface Task {
  id: string; title: string; clientId?: string; clientName?: string;
  dueDate: string; done: boolean; createdAt: number;
}
interface Note { id: string; text: string; type: string; createdAt: number; }
interface PostServiceSequence {
  id: string; name: string; delayDays: number; message: string;
  active: boolean; createdAt: number;
  serviceName?: string; // se preenchido, só dispara para clientes com essa tag de serviço
}
interface DailyAlert {
  type: 'birthday' | 'no_response' | 'post_service';
  leadId: string; leadName: string; leadPhone: string; detail: string;
}

// ── Daily Alerts Hook ─────────────────────────────────────────────────────────
function useDailyAlerts(leads: Lead[], postServiceSeqs: PostServiceSequence[]) {
  return React.useMemo(() => {
    const alerts: DailyAlert[] = [];
    const now = Date.now();
    const today = new Date();
    const todayMD = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const dayMs = 24 * 60 * 60 * 1000;
    for (const lead of leads) {
      if (lead.birthdate && lead.birthdate.slice(5) === todayMD) {
        alerts.push({ type: 'birthday', leadId: lead.id, leadName: lead.name || lead.phone, leadPhone: lead.phone, detail: 'Aniversário hoje 🎂' });
      }
      if (lead.lastMessage?.from === 'client' && lead.lastMessage.timestamp) {
        const daysSince = (now - lead.lastMessage.timestamp) / dayMs;
        if (daysSince >= 3 && daysSince <= 30) {
          const d = Math.floor(daysSince);
          alerts.push({ type: 'no_response', leadId: lead.id, leadName: lead.name || lead.phone, leadPhone: lead.phone, detail: `Sem resposta há ${d} dia${d !== 1 ? 's' : ''}` });
        }
      }
      if (lead.lastServiceDate) {
        const daysSinceService = (now - lead.lastServiceDate) / dayMs;
        for (const seq of postServiceSeqs) {
          if (!seq.active) continue;
          // Se sequência tem serviço específico, só aplica se cliente tem essa tag
          if (seq.serviceName && !(lead.tags || []).includes(seq.serviceName)) continue;
          if (Math.abs(daysSinceService - seq.delayDays) < 1) {
            alerts.push({ type: 'post_service', leadId: lead.id, leadName: lead.name || lead.phone, leadPhone: lead.phone, detail: `${seq.name} (${seq.delayDays}d pós-serviço)` });
          }
        }
      }
    }
    return alerts;
  }, [leads, postServiceSeqs]);
}

// ── Post-Service Sequences Hook ───────────────────────────────────────────────
function usePostServiceSequences() {
  const [seqs, setSeqs] = useState<PostServiceSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const t = await getToken();
      const r = await fetch('/api/crm-pro/postservice', { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      setSeqs(d.sequences || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { seqs, loading, reload: load };
}

// ── Stage config ──────────────────────────────────────────────────────────────
const STAGES: { key: LeadStatus; label: string; Icon: React.FC<any>; color: string; glow: string; bg: string }[] = [
  { key: 'lead',     label: 'Novos',      Icon: Flame,        color: 'text-slate-300',   glow: 'shadow-slate-500/20',  bg: 'bg-slate-800/40' },
  { key: 'prospect', label: 'Em contato', Icon: MessageSquare, color: 'text-violet-300',  glow: 'shadow-violet-500/20', bg: 'bg-violet-900/20' },
  { key: 'client',   label: 'Alunas',     Icon: CheckCircle2, color: 'text-emerald-300', glow: 'shadow-emerald-500/20',bg: 'bg-emerald-900/20' },
  { key: 'vip',      label: 'VIP',        Icon: Crown,        color: 'text-amber-300',   glow: 'shadow-amber-500/20',  bg: 'bg-amber-900/20' },
  { key: 'inactive', label: 'Inativos',   Icon: Moon,         color: 'text-slate-600',   glow: 'shadow-slate-900/20',  bg: 'bg-slate-900/40' },
];

const ALL_TAGS = [
  'Interesse: tranças', 'Interesse: penteado', 'Curso básico',
  'Curso avançado', 'Manutenção', 'Orçamento solicitado',
  'Sem resposta', 'Pagou', 'Indicação', 'Instagram', 'VIP potencial',
];

const getToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve('');

const fmt = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// ── 3D Tilt Hook (desktop only) ───────────────────────────────────────────────
function use3DTilt(intensity = 8) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | undefined>(undefined);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current || window.innerWidth < 768) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * intensity;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -intensity;
    cancelAnimationFrame(frame.current!);
    frame.current = requestAnimationFrame(() => {
      if (ref.current)
        ref.current.style.transform = `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(4px)`;
    });
  }, [intensity]);

  const onMouseLeave = useCallback(() => {
    cancelAnimationFrame(frame.current!);
    if (ref.current)
      ref.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}

// ── AI Summary Hook ───────────────────────────────────────────────────────────
function useAISummary(salonId?: string, clientId?: string) {
  const [summary, setSummary] = useState<{ summary: string; tags: string[]; suggestion: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!salonId || !clientId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const r = await fetch('/api/crm-pro/ai-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId }),
      });
      const d = await r.json();
      if (!d.error) setSummary(d);
    } catch {}
    setLoading(false);
  }, [salonId, clientId]);
  return { summary, loading, refresh };
}

// ── Baileys Status + conexão ─────────────────────────────────────────────────
function useBaileysStatus() {
  const [connected, setConnected] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [mode, setMode] = useState<'qr' | 'pairing'>('qr');
  const [pairingPhone, setPairingPhone] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const check = () => getToken().then(t =>
      fetch('/api/crm-pro/evolution/status', { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.json())
        .then(d => { setConnected(d.connected); if (d.connected) { setQrCode(null); setPairingCode(null); } })
        .catch(() => {})
    );
    check();
    const id = setInterval(check, 8000);
    return () => clearInterval(id);
  }, []);

  const connectQR = async () => {
    setConnecting(true); setQrCode(null); setPairingCode(null);
    try {
      const t = await getToken();
      const r = await fetch('/api/crm-pro/evolution/connect', { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao conectar');
      if (d.qrcode) setQrCode(d.qrcode);
      else toast.error('QR não disponível ainda. Aguarde alguns segundos e tente novamente.');
    } catch (e: any) { toast.error(e.message); }
    setConnecting(false);
  };

  const connectPairing = async () => {
    if (!pairingPhone.trim()) { toast.error('Digite o número do WhatsApp'); return; }
    setConnecting(true); setQrCode(null); setPairingCode(null);
    try {
      const t = await getToken();
      const r = await fetch('/api/crm-pro/connect/pairing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phoneNumber: pairingPhone }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao gerar código');
      setPairingCode(d.pairingCode);
      toast.success('Código gerado! Digite-o no WhatsApp → Dispositivos vinculados → Vincular com número de telefone');
    } catch (e: any) { toast.error(e.message); }
    setConnecting(false);
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
      setConnected(false); setQrCode(null); setPairingCode(null);
      toast.success('Desconectado.');
    } catch { toast.error('Erro ao desconectar'); }
    setDisconnecting(false);
  };

  // Legacy compat
  const connect = connectQR;

  return { connected, qrCode, setQrCode, pairingCode, setPairingCode, mode, setMode, pairingPhone, setPairingPhone, connecting, disconnecting, connect, connectQR, connectPairing, disconnect };
}
// Alias
const useEvolutionStatus = useBaileysStatus;

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'from-violet-600 to-violet-800', 'from-rose-600 to-rose-800',
  'from-emerald-600 to-emerald-800', 'from-amber-600 to-amber-800',
  'from-blue-600 to-blue-800', 'from-pink-600 to-pink-800',
];
const Avatar: React.FC<{ name: string; size?: 'xs' | 'sm' | 'md'; human?: boolean }> = ({ name, size = 'md', human }) => {
  const sz = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm' };
  const grad = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  return (
    <div className={`relative ${sz[size]} rounded-full bg-gradient-to-br ${grad} flex items-center justify-center font-black text-white flex-shrink-0 shadow-lg`}>
      {(name?.[0] || '?').toUpperCase()}
      {human && (
        <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 border-2 border-[#07070f] flex items-center justify-center">
          <User className="h-1.5 w-1.5 text-white" />
        </span>
      )}
    </div>
  );
};

// ── Message Bubble ────────────────────────────────────────────────────────────
const Bubble: React.FC<{ msg: Message }> = ({ msg }) => {
  const isClient = msg.from === 'client';
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className={`flex ${isClient ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-lg
        ${isClient ? 'bg-white/[0.08] text-slate-100 rounded-tl-sm border border-white/[0.06]' : ''}
        ${msg.from === 'bot' ? 'bg-violet-600/70 text-white rounded-tr-sm' : ''}
        ${msg.from === 'owner' ? 'bg-gradient-to-br from-rose-600/80 to-rose-700/80 text-white rounded-tr-sm' : ''}
      `}>
        <p>{msg.text}</p>
        <p className="text-[10px] opacity-40 mt-0.5 text-right flex items-center justify-end gap-1">
          {msg.from === 'bot' && <Bot className="h-2.5 w-2.5" />}
          {msg.from === 'owner' && <User className="h-2.5 w-2.5" />}
          {time}
        </p>
      </div>
    </div>
  );
};

// ── WA Status Banner ──────────────────────────────────────────────────────────
const WABanner: React.FC<{ salonId: string }> = ({ salonId }) => {
  const [status, setStatus] = useState<'checking' | 'ok' | 'off'>('checking');
  useEffect(() => {
    getToken().then(t =>
      fetch(`/api/whatsapp/status/${salonId}`, { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.json()).then(d => setStatus(d.connected ? 'ok' : 'off')).catch(() => setStatus('off'))
    );
  }, [salonId]);
  if (status !== 'off') return null;
  return (
    <div className="mx-4 mb-3 flex items-center gap-3 bg-amber-950/30 border border-amber-800/30 rounded-xl px-4 py-2.5">
      <WifiOff className="h-4 w-4 text-amber-500 flex-shrink-0" />
      <p className="text-amber-400 text-xs font-medium">WhatsApp desconectado — o CRM funciona, mas envios automáticos estão pausados</p>
    </div>
  );
};

// ── Add Lead Modal ─────────────────────────────────────────────────────────────
const AddLeadModal: React.FC<{ salonId: string; onClose: () => void }> = ({ salonId, onClose }) => {
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', status: 'lead' as LeadStatus, birthdate: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/crm_clients`), {
        ...form, salonId, tags: [], source: 'manual',
        createdAt: Date.now(), updatedAt: Date.now(), lastContact: Date.now(),
      });
      toast.success('Contato adicionado');
      onClose();
    } catch { toast.error('Erro ao salvar'); }
    setSaving(false);
  };
  const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
  const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 focus:bg-white/[0.06] transition-all";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#0d0d1a] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h3 className="font-bold text-white">Novo contato</h3>
            <p className="text-slate-500 text-xs mt-0.5">Adicionar manualmente ao CRM</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Nome *">
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome da aluna" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="WhatsApp">
              <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="5516999..." className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@..." className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Etapa">
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as LeadStatus }))} className={`${inputCls} bg-[#0d0d1a] appearance-none cursor-pointer`}>
                {STAGES.map(s => <option key={s.key} value={s.key} className="bg-[#0d0d1a] text-white">{s.label}</option>)}
              </select>
            </Field>
            <Field label="Aniversário 🎂">
              <input type="date" value={form.birthdate} onChange={e => setForm(p => ({ ...p, birthdate: e.target.value }))} className={`${inputCls} text-slate-300`} />
            </Field>
          </div>
          <Field label="Observações">
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Cursos de interesse..." className={`${inputCls} resize-none`} />
          </Field>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-semibold py-3 rounded-xl text-sm transition-all">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-sm transition-all">
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Daily Alerts Panel ────────────────────────────────────────────────────────
const DailyAlertsPanel: React.FC<{
  alerts: DailyAlert[];
  onOpenLead: (leadId: string) => void;
}> = ({ alerts, onOpenLead }) => {
  const [collapsed, setCollapsed] = useState(false);
  if (alerts.length === 0) return null;

  const icons = { birthday: '🎂', no_response: '💬', post_service: '✂️' };
  const colors = {
    birthday: 'text-pink-400 border-pink-800/30 bg-pink-950/20',
    no_response: 'text-amber-400 border-amber-800/30 bg-amber-950/20',
    post_service: 'text-violet-400 border-violet-800/30 bg-violet-950/20',
  };

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-all">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-violet-600/30 border border-violet-500/30 flex items-center justify-center">
            <Bell className="h-3 w-3 text-violet-400" />
          </div>
          <span className="text-sm font-bold text-white">Hoje</span>
          <span className="text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded-full font-bold">{alerts.length}</span>
        </div>
        <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 space-y-1.5">
          {alerts.map((a, i) => (
            <button key={i} onClick={() => onOpenLead(a.leadId)}
              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all hover:brightness-110 ${colors[a.type]}`}>
              <span className="text-base flex-shrink-0">{icons[a.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{a.leadName}</p>
                <p className="text-[10px] opacity-70 truncate">{a.detail}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Post-Service Sequences View ───────────────────────────────────────────────
const PostServiceView: React.FC<{ salonId: string }> = ({ salonId }) => {
  const { seqs, loading, reload } = usePostServiceSequences();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', serviceName: '', delayDays: 15, message: '' });
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-all";

  const save = async () => {
    if (!form.name || !form.message) { toast.error('Preencha todos os campos'); return; }
    setSaving(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/postservice', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ...form, serviceName: form.serviceName.trim() || undefined, active: true }),
      });
      setShowForm(false);
      setForm({ name: '', serviceName: '', delayDays: 15, message: '' });
      reload();
    } catch {}
    setSaving(false);
  };

  const toggle = async (seq: PostServiceSequence) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/postservice/${seq.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ active: !seq.active }),
    });
    reload();
  };

  const remove = async (id: string) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/postservice/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    reload();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Follow-up Pós-Serviço</h2>
          <p className="text-slate-500 text-xs mt-0.5">Mensagens automáticas depois de marcar um atendimento</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-all">
          <Plus className="h-3.5 w-3.5" /> Nova
        </button>
      </div>

      {/* Como funciona */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { Icon: Clock, label: 'Marcar serviço', desc: 'Toque "✂️ Serviço hoje" na conversa' },
          { Icon: Calendar, label: 'Conta os dias', desc: 'Sistema calcula quando enviar cada msg' },
          { Icon: CheckCircle2, label: 'Envia sozinho', desc: 'Você não precisa lembrar de nada' },
        ].map(({ Icon, label, desc }) => (
          <div key={label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
            <Icon className="h-4 w-4 text-violet-500 mb-2" />
            <p className="text-white text-xs font-semibold">{label}</p>
            <p className="text-slate-600 text-[10px] mt-0.5 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Nome do lembrete</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Retorno Cachoterapia 15 dias" className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">
                Serviço específico <span className="text-violet-400 normal-case font-normal">(opcional)</span>
              </label>
              <input type="text" value={form.serviceName} onChange={e => setForm(p => ({ ...p, serviceName: e.target.value }))}
                placeholder="Ex: Cachoterapia (deixe vazio para todos os serviços)"
                className={inputCls} />
              <p className="text-[10px] text-slate-700 mt-1">Se preenchido, só dispara para clientes com essa tag de serviço</p>
            </div>
            <div>
              <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Dias após o serviço</label>
              <input type="number" min={1} max={365} value={form.delayDays}
                onChange={e => setForm(p => ({ ...p, delayDays: parseInt(e.target.value) || 1 }))}
                className={`${inputCls} text-center`} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Mensagem enviada</label>
            <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
              rows={4} placeholder="Oi {{nome}}! Faz 7 dias que você veio fazer as tranças aqui. Tá gostando? 😍"
              className={`${inputCls} resize-none`} />
            <p className="text-[10px] text-slate-600 mt-1">Use {'{{nome}}'} para personalizar</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 bg-white/[0.04] text-slate-400 py-2.5 rounded-xl text-xs">Cancelar</button>
            <button onClick={save} disabled={saving}
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all disabled:opacity-40">
              {saving ? 'Salvando...' : 'Ativar lembrete'}
            </button>
          </div>
        </div>
      )}

      {/* Sugestões rápidas */}
      {seqs.length === 0 && !showForm && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Sugestões para começar</p>
          {[
            { name: 'Follow-up 7 dias', delayDays: 7, message: 'Oi {{nome}}! Faz uma semana que você passou por aqui. Tá amando o resultado? 😍 Se precisar de qualquer ajuda, é só falar!' },
            { name: 'Lembrete 30 dias', delayDays: 30, message: 'Oi {{nome}}! Já faz um mês desde o seu último atendimento. 🌟 Que tal agendar uma manutenção? Você merece!' },
            { name: 'Reativação 40 dias', delayDays: 40, message: 'Oi {{nome}}! Já faz 40 dias... sentimos sua falta! 💖 Tem novidades esperando por você. Quando quer agendar?' },
          ].map(s => (
            <button key={s.name} onClick={() => { setForm({ serviceName: '', ...s }); setShowForm(true); }}
              className="w-full flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] rounded-xl px-4 py-3 text-left transition-all group">
              <div className="h-8 w-8 rounded-lg bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                <Clock className="h-4 w-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">{s.name}</p>
                <p className="text-slate-500 text-[10px] truncate">{s.message.slice(0, 60)}...</p>
              </div>
              <Plus className="h-4 w-4 text-slate-600 group-hover:text-violet-400 transition-all" />
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}</div>
      ) : seqs.length > 0 ? (
        <div className="space-y-3">
          {seqs.map(seq => (
            <div key={seq.id} className={`rounded-xl border ${seq.active ? 'border-white/[0.08] bg-white/[0.03]' : 'border-white/[0.04] bg-white/[0.01] opacity-50'} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold">{seq.name}</p>
                    {seq.serviceName && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-400 border border-violet-800/30 font-bold">
                        🏷️ {seq.serviceName}
                      </span>
                    )}
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${seq.active ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                      {seq.active ? 'Ativo' : 'Pausado'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="bg-black/30 border border-white/[0.06] rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-violet-400" />
                      <p className="text-violet-400 font-bold text-[10px]">+{seq.delayDays} dias</p>
                    </div>
                    <p className="text-slate-500 text-[10px] truncate flex-1">{seq.message.slice(0, 60)}...</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggle(seq)}
                    className={`relative h-5 w-9 rounded-full transition-all ${seq.active ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${seq.active ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <button onClick={() => remove(seq.id)} className="text-slate-700 hover:text-rose-500 transition-all">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};


const KPICard: React.FC<{
  label: string; value: string | number; Icon: React.FC<any>;
  accent: string; sub?: string;
}> = ({ label, value, Icon, accent, sub }) => {
  const tilt = use3DTilt(6);
  return (
    <div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}
      style={{ transition: 'transform 0.15s ease-out', transformStyle: 'preserve-3d' }}
      className="relative rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 overflow-hidden group cursor-default">
      {/* glow background */}
      <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full ${accent} opacity-20 blur-2xl group-hover:opacity-30 transition-opacity`} />
      {/* inner shine */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent rounded-2xl" />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
          <div className={`h-8 w-8 rounded-lg ${accent} bg-opacity-20 flex items-center justify-center`}>
            <Icon className="h-4 w-4 text-white opacity-80" />
          </div>
        </div>
        <p className="text-3xl font-black text-white tracking-tight">{value}</p>
        {sub && <p className="text-slate-600 text-xs mt-1">{sub}</p>}
      </div>
    </div>
  );
};

// ── Lead Card (Kanban) ────────────────────────────────────────────────────────
const LeadCard: React.FC<{
  lead: Lead; onOpen: () => void; onMove: (s: LeadStatus) => void; currentStage: typeof STAGES[number];
}> = ({ lead, onOpen, onMove, currentStage }) => {
  const now = Date.now();
  const todayMD = `${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const isBirthday = lead.birthdate && lead.birthdate.slice(5) === todayMD;
  const noResponse = lead.lastMessage?.from === 'client' && lead.lastMessage.timestamp &&
    (now - lead.lastMessage.timestamp) > 3 * 24 * 60 * 60 * 1000 &&
    (now - lead.lastMessage.timestamp) < 30 * 24 * 60 * 60 * 1000;

  return (
    <div
    draggable
    onDragStart={e => e.dataTransfer.setData('leadId', lead.id)}
    onClick={onOpen}
    className={`group relative border rounded-xl p-3.5 cursor-pointer transition-all duration-200 active:scale-[0.97] ${
      isBirthday ? 'bg-pink-950/20 border-pink-800/30 hover:border-pink-700/50' :
      noResponse ? 'bg-amber-950/10 border-amber-900/20 hover:border-amber-800/40' :
      'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06] hover:border-white/[0.12]'
    }`}
    style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
  >
    <div className="flex items-start gap-2.5 mb-3">
      <Avatar name={lead.name || '?'} size="sm" human={lead.humanTakeover} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-white text-xs font-bold truncate leading-tight">{lead.name || lead.phone}</p>
          {isBirthday && <span className="text-[9px]">🎂</span>}
          {noResponse && <span className="text-[9px] text-amber-500 font-bold">!</span>}
        </div>
        {lead.lastMessage && (
          <p className="text-slate-600 text-[10px] truncate mt-0.5 leading-tight">{lead.lastMessage.text}</p>
        )}
        {!lead.lastMessage && lead.phone && (
          <p className="text-slate-700 text-[10px] mt-0.5">{lead.phone}</p>
        )}
      </div>
      {lead.lastContact && <p className="text-[9px] text-slate-700 flex-shrink-0">{fmt(lead.lastContact)}</p>}
    </div>
    {lead.tags && (lead.tags ?? []).length > 0 && (
      <div className="flex gap-1 mb-2.5 flex-wrap">
        {(lead.tags ?? []).slice(0, 2).map(tag => (
          <span key={tag} className="text-[9px] bg-violet-900/30 text-violet-400 border border-violet-800/30 px-1.5 py-0.5 rounded-full">{tag}</span>
        ))}
        {(lead.tags ?? []).length > 2 && <span className="text-[9px] text-slate-600">+{(lead.tags ?? []).length - 2}</span>}
      </div>
    )}
    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {STAGES.filter(s => s.key !== currentStage.key).slice(0, 2).map(s => (
        <button key={s.key} onClick={e => { e.stopPropagation(); onMove(s.key); }}
          className="text-[9px] px-2 py-0.5 rounded-full border border-white/[0.08] text-slate-500 hover:text-white hover:border-white/20 transition-all flex items-center gap-0.5">
          <ArrowRight className="h-2 w-2" />{s.label}
        </button>
      ))}
      {lead.phone && (
        <button onClick={e => { e.stopPropagation(); window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank'); }}
          className="text-[9px] px-2 py-0.5 rounded-full border border-emerald-800/40 text-emerald-600 hover:text-emerald-400 transition-all ml-auto">
          WA
        </button>
      )}
    </div>
  </div>
  );
};

// ── Notes Panel ───────────────────────────────────────────────────────────────
const NotesPanel: React.FC<{ salonId: string; lead: Lead }> = ({ salonId, lead }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>(lead.tags || []);
  const [showTags, setShowTags] = useState(false);

  useEffect(() => {
    const q = query(collection(db, `salons/${salonId}/crm_clients/${lead.id}/notes`), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Note))));
  }, [salonId, lead.id]);

  useEffect(() => { setTags(lead.tags || []); }, [lead.tags]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    await addDoc(collection(db, `salons/${salonId}/crm_clients/${lead.id}/notes`), {
      text: newNote.trim(), type: 'note', createdAt: Date.now(),
    }).catch(() => {});
    setNewNote('');
    setSaving(false);
  };

  const toggleTag = async (tag: string) => {
    const next = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
    setTags(next);
    await updateDoc(doc(db, `salons/${salonId}/crm_clients/${lead.id}`), { tags: next }).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tags section */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={() => setShowTags(!showTags)}
          className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-full">
          <Tag className="h-3 w-3" /> Tags
          <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${showTags ? 'rotate-90' : ''}`} />
        </button>
        {tags.length > 0 && !showTags && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map(t => <span key={t} className="text-[9px] bg-violet-900/30 text-violet-400 border border-violet-800/30 px-2 py-0.5 rounded-full">{t}</span>)}
          </div>
        )}
        {showTags && (
          <div className="flex flex-wrap gap-1 mt-2">
            {ALL_TAGS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)}
                className={`text-[9px] px-2 py-0.5 rounded-full border transition-all ${tags.includes(tag) ? 'bg-violet-600 border-violet-500 text-white' : 'border-white/[0.08] text-slate-500 hover:text-white hover:border-white/20'}`}>
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Add note */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && e.ctrlKey && addNote()}
          placeholder="Adicionar nota... (Ctrl+Enter)"
          rows={2}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none transition-all" />
        <button onClick={addNote} disabled={!newNote.trim() || saving}
          className="mt-2 w-full bg-violet-600/60 hover:bg-violet-600 disabled:opacity-30 text-white font-semibold py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5">
          <StickyNote className="h-3 w-3" /> Salvar nota
        </button>
      </div>
      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold">Timeline</p>
        {notes.length === 0 && <p className="text-slate-700 text-xs text-center py-6">Nenhuma nota ainda</p>}
        {notes.map(note => (
          <div key={note.id} className="flex gap-2.5">
            <div className="h-5 w-5 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
              <StickyNote className="h-2.5 w-2.5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs text-slate-300 leading-relaxed">{note.text}</p>
              <p className="text-[10px] text-slate-700 mt-0.5">{fmt(note.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Quick Replies ─────────────────────────────────────────────────────────────
const QuickRepliesView: React.FC<{ salonId: string; onUse?: (t: string) => void; compact?: boolean }> = ({ salonId, onUse, compact }) => {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', text: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const t = await getToken();
    const r = await fetch('/api/crm-pro/quick-replies', { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    setReplies(d.items || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title || !form.text) { toast.error('Preencha título e mensagem'); return; }
    setSaving(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/quick-replies', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(form),
      });
      setForm({ title: '', text: '' }); setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: string) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/quick-replies/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    load();
  };

  if (compact) return (
    <div className="space-y-1.5 max-h-52 overflow-y-auto">
      {loading ? <p className="text-slate-600 text-xs text-center py-3">Carregando...</p> :
        replies.length === 0 ? <p className="text-slate-700 text-xs text-center py-4">Nenhum template. Crie na aba Rápidas.</p> :
        replies.map(r => (
          <button key={r.id} onClick={() => onUse?.(r.text)}
            className="w-full text-left bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] rounded-xl px-3 py-2.5 transition-all">
            <p className="text-white text-xs font-semibold">{r.title}</p>
            <p className="text-slate-500 text-[10px] truncate mt-0.5">{r.text}</p>
          </button>
        ))}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Respostas Rápidas</h2>
          <p className="text-slate-500 text-xs mt-0.5">Templates para enviar com 1 clique no chat</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-all">
          <Plus className="h-3.5 w-3.5" /> Novo
        </button>
      </div>
      {showForm && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
          <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Título do template"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-all" />
          <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
            placeholder="Olá {{nome}}! Como posso te ajudar?"
            rows={4}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 resize-none transition-all" />
          <p className="text-[10px] text-slate-600">Use {'{{nome}}'} para inserir o nome da aluna</p>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 bg-white/[0.04] text-slate-400 font-semibold py-2.5 rounded-xl text-xs">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all disabled:opacity-40">
              {saving ? 'Salvando...' : 'Salvar template'}
            </button>
          </div>
        </div>
      )}
      {loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}</div> :
        replies.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-12 w-12 rounded-2xl bg-violet-900/20 border border-violet-800/20 flex items-center justify-center mx-auto mb-3">
              <Zap className="h-6 w-6 text-violet-500" />
            </div>
            <p className="text-slate-400 font-semibold">Nenhum template ainda</p>
            <p className="text-slate-600 text-xs mt-1">Crie templates para responder sem digitar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {replies.map(r => (
              <div key={r.id} className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 group">
                <div className="h-9 w-9 rounded-lg bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-4 w-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{r.title}</p>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed line-clamp-2">{r.text}</p>
                </div>
                <button onClick={() => remove(r.id)} className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-rose-500 transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

// ── Follow-up Sequences ───────────────────────────────────────────────────────
const FollowUpView: React.FC<{ salonId: string }> = ({ salonId }) => {
  const [seqs, setSeqs] = useState<FollowUpSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; triggerStatus: LeadStatus; steps: FollowUpStep[] }>({
    name: '', triggerStatus: 'lead', steps: [{ delayDays: 1, message: '' }],
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const t = await getToken();
    const r = await fetch('/api/crm-pro/followup', { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    setSeqs(d.sequences || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || (form.steps ?? []).some(s => !s.message)) { toast.error('Preencha todos os campos'); return; }
    setSaving(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/followup', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ...form, active: true }),
      });
      setShowForm(false);
      setForm({ name: '', triggerStatus: 'lead', steps: [{ delayDays: 1, message: '' }] });
      load();
    } catch {}
    setSaving(false);
  };

  const toggle = async (seq: FollowUpSequence) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/followup/${seq.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ active: !seq.active }),
    });
    load();
  };

  const remove = async (id: string) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/followup/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    load();
  };

  const addStep = () => setForm(p => ({ ...p, steps: [...p.steps, { delayDays: (p.steps.at(-1)?.delayDays || 0) + 2, message: '' }] }));
  const updateStep = (i: number, k: keyof FollowUpStep, v: any) =>
    setForm(p => ({ ...p, steps: (p.steps ?? []).map((s, idx) => idx === i ? { ...s, [k]: v } : s) }));

  const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-all";

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Follow-up Automático</h2>
          <p className="text-slate-500 text-xs mt-0.5">Sequências enviadas pelo bot quando aluna não responde</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-all">
          <Plus className="h-3.5 w-3.5" /> Nova
        </button>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { Icon: Clock, label: 'Automático', desc: 'Verifica todo dia, envia no prazo certo' },
          { Icon: Target, label: 'Por etapa', desc: 'Cada funil tem sua sequência' },
          { Icon: CheckCircle2, label: 'Para ao responder', desc: 'Cancelado quando a aluna responde' },
        ].map(({ Icon, label, desc }) => (
          <div key={label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
            <Icon className="h-4 w-4 text-violet-500 mb-2" />
            <p className="text-white text-xs font-semibold">{label}</p>
            <p className="text-slate-600 text-[10px] mt-0.5 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Nome da sequência</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Leads sem resposta" className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Para leads na etapa</label>
              <select value={form.triggerStatus} onChange={e => setForm(p => ({ ...p, triggerStatus: e.target.value as LeadStatus }))}
                className={`${inputCls} bg-[#0d0d1a] appearance-none cursor-pointer`}>
                {STAGES.map(s => <option key={s.key} value={s.key} className="bg-[#0d0d1a] text-white">{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold">Mensagens da sequência</label>
              <button onClick={addStep} className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1"><Plus className="h-3 w-3" /> Adicionar</button>
            </div>
            <div className="space-y-3">
              {(form.steps ?? []).map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-shrink-0">
                    <label className="text-[9px] text-slate-600 block mb-1">Após dias</label>
                    <input type="number" min={0} value={step.delayDays}
                      onChange={e => updateStep(i, 'delayDays', parseInt(e.target.value) || 0)}
                      className="w-16 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-2 text-xs text-white text-center focus:outline-none focus:border-violet-500/60" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] text-slate-600 block mb-1">Mensagem {i + 1}</label>
                    <textarea value={step.message} onChange={e => updateStep(i, 'message', e.target.value)}
                      rows={2} placeholder="Mensagem enviada automaticamente..."
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 resize-none transition-all" />
                  </div>
                  {(form.steps ?? []).length > 1 && (
                    <button onClick={() => setForm(p => ({ ...p, steps: (p.steps ?? []).filter((_, idx) => idx !== i) }))}
                      className="mt-5 text-slate-700 hover:text-rose-500 transition-all flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 bg-white/[0.04] text-slate-400 py-2.5 rounded-xl text-xs">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all disabled:opacity-40">
              {saving ? 'Salvando...' : 'Ativar sequência'}
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="space-y-2">{[0,1].map(i => <div key={i} className="h-24 rounded-xl bg-white/[0.03] animate-pulse" />)}</div> :
        seqs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-12 w-12 rounded-2xl bg-violet-900/20 border border-violet-800/20 flex items-center justify-center mx-auto mb-3">
              <Repeat2 className="h-6 w-6 text-violet-500" />
            </div>
            <p className="text-slate-400 font-semibold">Nenhuma sequência</p>
            <p className="text-slate-600 text-xs mt-1">Nunca deixe uma aluna sem acompanhamento</p>
          </div>
        ) : (
          <div className="space-y-3">
            {seqs.map(seq => {
              const stage = STAGES.find(s => s.key === seq.triggerStatus);
              return (
                <div key={seq.id} className={`rounded-xl border ${seq.active ? 'border-white/[0.08] bg-white/[0.03]' : 'border-white/[0.04] bg-white/[0.01] opacity-50'} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold">{seq.name}</p>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${seq.active ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/30' : 'bg-slate-800 text-slate-500'}`}>
                          {seq.active ? 'Ativa' : 'Pausada'}
                        </span>
                        {stage && <span className="text-[9px] text-slate-600">{stage.label}</span>}
                      </div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {(seq.steps ?? []).map((step, i) => (
                          <div key={i} className="bg-black/30 border border-white/[0.06] rounded-lg px-3 py-1.5">
                            <p className="text-violet-400 font-bold text-[10px]">+{step.delayDays}d</p>
                            <p className="text-slate-500 text-[9px] max-w-[100px] truncate">{step.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => toggle(seq)}
                        className={`relative h-5 w-9 rounded-full transition-all ${seq.active ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${seq.active ? 'left-4' : 'left-0.5'}`} />
                      </button>
                      <button onClick={() => remove(seq.id)} className="text-slate-700 hover:text-rose-500 transition-all">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

// ── Bulk Send ─────────────────────────────────────────────────────────────────
const BulkSendView: React.FC<{ salonId: string; leads: Lead[]; postServiceSeqs?: PostServiceSequence[] }> = ({ salonId, leads, postServiceSeqs = [] }) => {
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all');
  const [filterTag, setFilterTag] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  const allTags = Array.from(new Set(leads.flatMap(l => l.tags || [])));
  const targets = leads.filter(l => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    if (filterTag && !(l.tags || []).includes(filterTag)) return false;
    return !!l.phone;
  });

  const send = async () => {
    if (!message.trim()) { toast.error('Escreva a mensagem'); return; }
    if (targets.length === 0) { toast.error('Nenhum contato no filtro'); return; }
    if (!confirm(`Enviar para ${targets.length} contatos?`)) return;
    setSending(true); setResult(null);
    try {
      const t = await getToken();
      const r = await fetch('/api/crm-pro/bulk-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ message, phones: targets.map(t => t.phone) }),
      });
      const d = await r.json();
      setResult({ sent: d.sent || 0, failed: d.failed || 0 });
    } catch { toast.error('Erro no disparo'); }
    setSending(false);
  };

  const selectCls = "w-full bg-[#0d0d1a] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500/60 transition-all appearance-none cursor-pointer";

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div>
        <h2 className="text-base font-bold text-white">Disparo em Massa</h2>
        <p className="text-slate-500 text-xs mt-0.5">Envie para grupos filtrados por etapa ou tag</p>
      </div>
      <div className="rounded-xl border border-amber-800/20 bg-amber-950/20 p-4 flex gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-amber-600 text-xs leading-relaxed">Use com moderação. Disparos excessivos podem bloquear o número. Máximo recomendado: 50 por vez.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Etapa do funil</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className={selectCls}>
            <option value="all" className="bg-[#0d0d1a] text-white">Todas as etapas</option>
            {STAGES.map(s => <option key={s.key} value={s.key} className="bg-[#0d0d1a] text-white">{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Filtrar por serviço / tag</label>
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className={selectCls}>
            <option value="" className="bg-[#0d0d1a] text-white">Todos os clientes</option>
            {/* Serviços cadastrados nas sequências - aparecem primeiro */}
            {postServiceSeqs.filter(s => s.serviceName).map(s => (
              <option key={`svc-${s.id}`} value={s.serviceName!} className="bg-[#0d0d1a] text-violet-300">
                🏷️ {s.serviceName} ({leads.filter(l => (l.tags||[]).includes(s.serviceName!)).length})
              </option>
            ))}
            {/* Demais tags */}
            {allTags.filter(t => !postServiceSeqs.some(s => s.serviceName === t)).map(t => (
              <option key={t} value={t} className="bg-[#0d0d1a] text-white">{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="rounded-xl border border-violet-800/20 bg-violet-950/20 px-4 py-3 flex items-center gap-3">
        <Users className="h-5 w-5 text-violet-500 flex-shrink-0" />
        <div>
          <p className="text-violet-300 font-bold text-lg leading-none">{targets.length}</p>
          <p className="text-slate-500 text-xs">contatos atingidos com esse filtro</p>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Mensagem *</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Olá {{nome}}! Temos uma novidade especial para você..."
          rows={5}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 resize-none transition-all" />
        <p className="text-[10px] text-slate-600 mt-1.5">Use {'{{nome}}'} para personalizar com o nome de cada aluna</p>
      </div>
      {result && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 flex gap-6">
          <div className="text-center">
            <p className="text-emerald-400 font-black text-2xl">{result.sent}</p>
            <p className="text-slate-600 text-xs">Enviados</p>
          </div>
          <div className="text-center">
            <p className="text-rose-400 font-black text-2xl">{result.failed}</p>
            <p className="text-slate-600 text-xs">Falharam</p>
          </div>
        </div>
      )}
      <button onClick={send} disabled={sending || targets.length === 0 || !message.trim()}
        className="w-full bg-gradient-to-r from-violet-600 to-rose-600 hover:opacity-90 disabled:opacity-30 text-white font-black py-4 rounded-xl text-sm transition-all">
        {sending ? `Enviando para ${targets.length} contatos...` : `Disparar para ${targets.length} contatos`}
      </button>
    </div>
  );
};

// ── Tasks ─────────────────────────────────────────────────────────────────────
const TasksView: React.FC<{ salonId: string; leads: Lead[] }> = ({ salonId, leads }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', clientId: '', dueDate: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const t = await getToken();
    const r = await fetch('/api/crm-pro/tasks', { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    setTasks((d.tasks || []).sort((a: Task, b: Task) => a.dueDate.localeCompare(b.dueDate)));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title.trim()) { toast.error('Título obrigatório'); return; }
    setSaving(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ...form, clientName: leads.find(l => l.id === form.clientId)?.name, done: false }),
      });
      setForm({ title: '', clientId: '', dueDate: new Date().toISOString().split('T')[0] });
      load();
    } catch {}
    setSaving(false);
  };

  const toggleDone = async (task: Task) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/tasks/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ done: !task.done }),
    });
    load();
  };

  const remove = async (id: string) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/tasks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    load();
  };

  const today = new Date().toISOString().split('T')[0];
  const overdue = tasks.filter(t => !t.done && t.dueDate < today);
  const pending = tasks.filter(t => !t.done && t.dueDate >= today);
  const done = tasks.filter(t => t.done).slice(0, 5);

  const TaskItem: React.FC<{ task: Task; isOverdue?: boolean }> = ({ task, isOverdue }) => (
    <div className={`flex items-start gap-3 rounded-xl border ${task.done ? 'border-white/[0.04] opacity-50' : isOverdue ? 'border-rose-800/30 bg-rose-950/20' : 'border-white/[0.06] bg-white/[0.02]'} p-3.5 group`}>
      <button onClick={() => toggleDone(task)}
        className={`mt-0.5 h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          task.done ? 'border-emerald-500 bg-emerald-500' : isOverdue ? 'border-rose-700 hover:border-rose-500' : 'border-slate-700 hover:border-violet-500'
        }`}>
        {task.done && <CheckCircle2 className="h-3 w-3 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${task.done ? 'line-through text-slate-600' : 'text-white'}`}>{task.title}</p>
        <div className="flex items-center gap-3 mt-1">
          {task.clientName && (
            <span className="flex items-center gap-1 text-[10px] text-violet-400">
              <User className="h-2.5 w-2.5" />{task.clientName}
            </span>
          )}
          <span className={`flex items-center gap-1 text-[10px] ${isOverdue && !task.done ? 'text-rose-400 font-bold' : 'text-slate-600'}`}>
            <Calendar className="h-2.5 w-2.5" />{new Date(task.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
          </span>
        </div>
      </div>
      <button onClick={() => remove(task.id)} className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-rose-500 transition-all">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div>
        <h2 className="text-base font-bold text-white">Tarefas e Lembretes</h2>
        <p className="text-slate-500 text-xs mt-0.5">Organize acompanhamentos por aluna e data</p>
      </div>
      {/* Quick add */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
        <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="Nova tarefa... (Enter para salvar)"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-all" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))}
            className="w-full bg-[#0d0d1a] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500/60 transition-all appearance-none cursor-pointer">
            <option value="" className="bg-[#0d0d1a] text-white">Sem vínculo</option>
            {leads.map(l => <option key={l.id} value={l.id} className="bg-[#0d0d1a] text-white">{l.name || l.phone}</option>)}
          </select>
          <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500/60 transition-all" />
        </div>
        <button onClick={save} disabled={saving || !form.title.trim()}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-semibold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5">
          <Plus className="h-4 w-4" /> {saving ? 'Salvando...' : 'Criar tarefa'}
        </button>
      </div>

      {loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}</div> : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <div>
              <p className="text-[10px] text-rose-500 uppercase tracking-widest font-bold flex items-center gap-1.5 mb-2.5">
                <AlertTriangle className="h-3 w-3" /> Atrasadas ({overdue.length})
              </p>
              <div className="space-y-2">{overdue.map(t => <TaskItem key={t.id} task={t} isOverdue />)}</div>
            </div>
          )}
          {pending.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-1.5 mb-2.5">
                <Circle className="h-3 w-3" /> Pendentes ({pending.length})
              </p>
              <div className="space-y-2">{pending.map(t => <TaskItem key={t.id} task={t} />)}</div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold flex items-center gap-1.5 mb-2.5">
                <CheckCircle2 className="h-3 w-3" /> Concluídas
              </p>
              <div className="space-y-2">{done.map(t => <TaskItem key={t.id} task={t} />)}</div>
            </div>
          )}
          {tasks.length === 0 && (
            <div className="py-16 text-center">
              <div className="h-12 w-12 rounded-2xl bg-violet-900/20 border border-violet-800/20 flex items-center justify-center mx-auto mb-3">
                <CheckSquare className="h-6 w-6 text-violet-500" />
              </div>
              <p className="text-slate-400 font-semibold">Nenhuma tarefa</p>
              <p className="text-slate-600 text-xs mt-1">Crie lembretes para nenhuma aluna ser esquecida</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Stats ─────────────────────────────────────────────────────────────────────
const StatsView: React.FC<{ leads: Lead[]; salonId: string }> = ({ leads, salonId }) => {
  const { connected, qrCode, setQrCode, pairingCode, setPairingCode, mode, setMode, pairingPhone, setPairingPhone, connecting, disconnecting, connect, connectQR, connectPairing, disconnect } = useEvolutionStatus();
  const convRate = leads.length > 0 ? Math.round((leads.filter(l => l.status === 'client' || l.status === 'vip').length / leads.length) * 100) : 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="Total de contatos" value={leads.length} Icon={Users} accent="bg-violet-600" sub="no CRM" />
        <KPICard label="Em contato" value={leads.filter(l => l.status === 'prospect').length} Icon={MessageSquare} accent="bg-blue-600" sub="ativos" />
        <KPICard label="Alunas" value={leads.filter(l => l.status === 'client' || l.status === 'vip').length} Icon={CheckCircle2} accent="bg-emerald-600" sub="convertidas" />
        <KPICard label="Conversão" value={`${convRate}%`} Icon={TrendingUp} accent="bg-amber-600" sub="do funil" />
      </div>

      {/* Funil visual */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Funil de conversão</p>
        {STAGES.map(stage => {
          const count = leads.filter(l => l.status === stage.key).length;
          const pct = leads.length > 0 ? Math.round(count / leads.length * 100) : 0;
          return (
            <div key={stage.key} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-semibold flex items-center gap-1.5 ${stage.color}`}>
                  <stage.Icon className="h-3 w-3" />{stage.label}
                </span>
                <span className="text-xs text-slate-600">{count} <span className="text-slate-700">({pct}%)</span></span>
              </div>
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-rose-600 transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* New this week */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Novos esta semana</p>
        {(() => {
          const newLeads = leads.filter(l => (l.createdAt || 0) > weekAgo);
          return newLeads.length === 0
            ? <p className="text-slate-700 text-xs text-center py-4">Nenhum novo contato esta semana</p>
            : <div className="space-y-2.5">
              {newLeads.slice(0, 5).map(l => (
                <div key={l.id} className="flex items-center gap-3">
                  <Avatar name={l.name || '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-semibold truncate">{l.name || l.phone}</p>
                    <p className="text-xs text-slate-600">{STAGES.find(s => s.key === l.status)?.label}</p>
                  </div>
                  <p className="text-[10px] text-slate-700">{fmt(l.createdAt)}</p>
                </div>
              ))}
            </div>;
        })()}
      </div>

      {/* WhatsApp */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />
            <p className="text-sm font-semibold text-white">WhatsApp</p>
          </div>
          {!connected && (
            <div className="flex gap-2">
              <button onClick={connectQR} disabled={connecting}
                className="text-xs bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                {connecting && mode === 'qr' ? '...' : '📷 QR Code'}
              </button>
              <button onClick={() => { setMode('pairing'); setQrCode(null); setPairingCode(null); }}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg transition-all">
                📱 Código
              </button>
            </div>
          )}
          {connected && (
            <button onClick={disconnect} disabled={disconnecting}
              className="text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
              {disconnecting ? '...' : 'Desconectar'}
            </button>
          )}
        </div>
        <p className="text-slate-600 text-xs mt-1.5">{connected ? '✅ Imagens, áudios e documentos ativados' : 'Conecte para enviar mídias pelo WhatsApp'}</p>
        {!connected && mode === 'pairing' && !pairingCode && (
          <div className="mt-2 flex gap-2">
            <input value={pairingPhone} onChange={e => setPairingPhone(e.target.value)}
              placeholder="5511999999999" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500" />
            <button onClick={connectPairing} disabled={connecting}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
              {connecting ? '...' : 'Gerar'}
            </button>
          </div>
        )}
        {!connected && pairingCode && (
          <div className="mt-2 bg-slate-800/80 border border-violet-500/30 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 mb-1">WhatsApp → Dispositivos vinculados → Vincular com número</p>
            <p className="text-2xl font-black tracking-[0.3em] text-violet-300">{pairingCode}</p>
          </div>
        )}
        {qrCode && !connected && (
          <div className="mt-3 bg-white rounded-xl p-3 inline-block">
            {qrCode.startsWith('CODE:')
              ? <p className="font-mono font-black text-2xl text-slate-900 tracking-widest">{qrCode.replace('CODE:', '')}</p>
              : <img src={qrCode} alt="QR Code" className="w-44 h-44 object-contain" />}
          </div>
        )}
      </div>
    </div>
  );
};

// ── WhatsApp Status Block (aba separada) ─────────────────────────────────────
const WAStatusBlock: React.FC<{
  connected: boolean; connecting: boolean; disconnecting: boolean;
  mode: string; setMode: (m: any) => void;
  qrCode: string | null; setQrCode: (v: any) => void;
  pairingCode: string | null; setPairingCode: (v: any) => void;
  pairingPhone: string; setPairingPhone: (v: string) => void;
  connectQR: () => void; connectPairing: () => void; disconnect: () => void;
}> = ({ connected, connecting, disconnecting, mode, setMode, qrCode, setQrCode, pairingCode, setPairingCode, pairingPhone, setPairingPhone, connectQR, connectPairing, disconnect }) => (
  <div className="space-y-4">
    {/* Status card */}
    <div className={`rounded-2xl border p-5 flex items-center gap-4 transition-all ${connected ? 'border-emerald-500/30 bg-emerald-900/10' : 'border-white/[0.07] bg-white/[0.02]'}`}
      style={{ boxShadow: connected ? '0 0 24px rgba(16,185,129,0.08)' : undefined }}>
      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${connected ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>
        {connected ? <Wifi className="h-6 w-6 text-emerald-400" /> : <WifiOff className="h-6 w-6 text-slate-600" />}
      </div>
      <div className="flex-1">
        <p className="text-white font-bold text-sm">{connected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}</p>
        <p className="text-xs text-slate-500 mt-0.5">{connected ? 'Mídias e mensagens automáticas ativas' : 'Conecte para ativar envios automáticos'}</p>
      </div>
      {connected && (
        <button onClick={disconnect} disabled={disconnecting}
          className="text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 font-semibold px-3 py-1.5 rounded-xl transition-all disabled:opacity-50">
          {disconnecting ? '...' : 'Desconectar'}
        </button>
      )}
    </div>

    {!connected && (
      <>
        {/* Method selector */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setMode('qr'); setQrCode(null); setPairingCode(null); }}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${mode === 'qr' ? 'border-violet-500/50 bg-violet-900/20' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'}`}>
            <span className="text-2xl">📷</span>
            <p className="text-white font-bold text-xs">QR Code</p>
            <p className="text-slate-600 text-[10px] text-center">Escaneie com o WhatsApp</p>
          </button>
          <button onClick={() => { setMode('pairing'); setQrCode(null); setPairingCode(null); }}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${mode === 'pairing' ? 'border-blue-500/50 bg-blue-900/20' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'}`}>
            <span className="text-2xl">📱</span>
            <p className="text-white font-bold text-xs">Código</p>
            <p className="text-slate-600 text-[10px] text-center">Use seu número de telefone</p>
          </button>
        </div>

        {/* QR mode */}
        {mode === 'qr' && (
          <div className="text-center space-y-4">
            {!qrCode ? (
              <button onClick={connectQR} disabled={connecting}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-2xl text-sm transition-all disabled:opacity-50 shadow-lg shadow-violet-900/30">
                {connecting ? '⏳ Aguarde...' : '📷 Gerar QR Code'}
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white rounded-2xl p-4 shadow-2xl">
                  {qrCode.startsWith('CODE:')
                    ? <p className="font-mono font-black text-2xl text-slate-900 tracking-widest">{qrCode.replace('CODE:', '')}</p>
                    : <img src={qrCode} alt="QR Code" className="w-52 h-52 object-contain" />}
                </div>
                <p className="text-slate-500 text-xs">Abra o WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
                <button onClick={connectQR} disabled={connecting} className="text-violet-400 text-xs hover:text-violet-300 underline">
                  {connecting ? 'Atualizando...' : 'Atualizar QR'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Pairing mode */}
        {mode === 'pairing' && (
          <div className="space-y-3">
            {!pairingCode ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Número do WhatsApp</label>
                  <input value={pairingPhone} onChange={e => setPairingPhone(e.target.value)}
                    placeholder="5511999999999 (com código do país)"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-all" />
                </div>
                <button onClick={connectPairing} disabled={connecting || !pairingPhone.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-2xl text-sm transition-all disabled:opacity-50 shadow-lg shadow-blue-900/30">
                  {connecting ? '⏳ Gerando...' : '📱 Gerar Código de Pareamento'}
                </button>
              </>
            ) : (
              <div className="bg-slate-800/80 border border-blue-500/30 rounded-2xl p-5 text-center space-y-2">
                <p className="text-[11px] text-slate-400">WhatsApp → Dispositivos vinculados → Vincular com número</p>
                <p className="text-4xl font-black tracking-[0.4em] text-blue-300">{pairingCode}</p>
                <p className="text-[10px] text-slate-600">O código expira em alguns minutos</p>
              </div>
            )}
          </div>
        )}
      </>
    )}
  </div>
);

// ── Bot IA — Configurações e Contexto ────────────────────────────────────────
const BotContextView: React.FC<{ salonId: string }> = ({ salonId }) => {
  const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-all";
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ botEnabled: true, requireManualAdd: false });
  const [form, setForm] = useState({
    businessName: '', businessDescription: '', pricing: '',
    botPersonality: '', workingHours: '', specialInstructions: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const t = await getToken();
        const [ctxRes, setRes] = await Promise.all([
          fetch('/api/crm-pro/bot-context', { headers: { Authorization: `Bearer ${t}` } }),
          fetch('/api/crm-pro/bot-settings', { headers: { Authorization: `Bearer ${t}` } }),
        ]);
        if (ctxRes.ok) { const d = await ctxRes.json(); if (d.context) setForm(p => ({ ...p, ...d.context })); }
        if (setRes.ok) { const d = await setRes.json(); setSettings(d); }
      } catch { /* usa defaults */ }
      setLoading(false);
    };
    load();
  }, [salonId]);

  const saveSettings = async (s: typeof settings) => {
    setSettings(s);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/bot-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(s),
      });
      toast.success('Configuração salva!');
    } catch { toast.error('Erro ao salvar'); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/bot-context', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ context: form }),
      });
      toast.success('Contexto salvo!');
    } catch { toast.error('Erro ao salvar'); }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div>
        <h2 className="text-base font-bold text-white">🤖 Bot IA</h2>
        <p className="text-slate-500 text-xs mt-0.5">Configure o comportamento e o que o bot sabe sobre seu negócio</p>
      </div>

      {/* Toggle ON/OFF global */}
      <div className={`rounded-2xl border p-4 transition-all ${settings.botEnabled ? 'border-emerald-500/30 bg-emerald-900/10' : 'border-red-500/30 bg-red-900/10'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">{settings.botEnabled ? '🟢 Bot ativo' : '🔴 Bot desligado'}</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {settings.botEnabled ? 'Respondendo mensagens automaticamente' : 'Só registra conversas, não responde nada'}
            </p>
          </div>
          <button
            onClick={() => saveSettings({ ...settings, botEnabled: !settings.botEnabled })}
            className={`relative h-7 w-12 rounded-full transition-all ${settings.botEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${settings.botEnabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Modo de operação */}
      <div className="space-y-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Modo de operação</p>
        <div className="grid grid-cols-1 gap-2">
          {[
            { key: false, label: '🤖 Bot responde todos', desc: 'Qualquer nova mensagem é respondida automaticamente' },
            { key: true,  label: '👤 Modo híbrido',       desc: 'Você decide quem entra no funil — bot só age em quem você escolher' },
          ].map(opt => (
            <button key={String(opt.key)}
              onClick={() => saveSettings({ ...settings, requireManualAdd: opt.key })}
              className={`text-left p-3.5 rounded-xl border transition-all ${settings.requireManualAdd === opt.key ? 'border-violet-500/50 bg-violet-900/20' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'}`}>
              <p className="text-white font-semibold text-xs">{opt.label}</p>
              <p className="text-slate-600 text-[10px] mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
        {settings.requireManualAdd && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-3">
            <p className="text-amber-300 text-[10px] font-semibold">💡 Modo híbrido ativo</p>
            <p className="text-slate-500 text-[10px] mt-1">
              Mensagens novas chegam no inbox silenciosamente. Você lê, decide quem entra no funil e ativa o bot por cliente no botão <strong className="text-white">Bot/Humano</strong> dentro do chat.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.05]" />
      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Contexto do bot</p>
      <p className="text-[10px] text-slate-700">Quanto mais detalhes você preencher, mais natural e preciso o bot responde.</p>

      <div className="space-y-1.5">
        <label className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Nome do Negócio</label>
        <input className={inputCls} placeholder="Ex: Studio Tranças da Ju"
          value={form.businessName} onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">O que você faz / vende</label>
        <textarea className={`${inputCls} min-h-[80px] resize-none`}
          placeholder="Ex: Especialista em tranças, box braids, twist e cursos. Atendo em SP, zona sul."
          value={form.businessDescription} onChange={e => setForm(p => ({ ...p, businessDescription: e.target.value }))} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Serviços e Preços</label>
        <textarea className={`${inputCls} min-h-[100px] resize-none`}
          placeholder={"- Box Braid curto: R$ 250\n- Cachoterapia: R$ 180\n- Twist: R$ 150\n- Curso presencial: R$ 800"}
          value={form.pricing} onChange={e => setForm(p => ({ ...p, pricing: e.target.value }))} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Horários de Atendimento</label>
        <input className={inputCls} placeholder="Ex: Seg a Sex das 9h às 19h, Sáb das 9h às 16h"
          value={form.workingHours} onChange={e => setForm(p => ({ ...p, workingHours: e.target.value }))} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Personalidade do Bot</label>
        <textarea className={`${inputCls} min-h-[80px] resize-none`}
          placeholder="Ex: Seja calorosa, fale como uma amiga, use o nome da cliente, nunca pareça robô. Crie relacionamento antes de vender."
          value={form.botPersonality} onChange={e => setForm(p => ({ ...p, botPersonality: e.target.value }))} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Instruções Especiais</label>
        <textarea className={`${inputCls} min-h-[80px] resize-none`}
          placeholder="Ex: Se pedir desconto, ofereça parcelamento. Para cursos, peça o WhatsApp e diga que vai ligar. Não faça permanente."
          value={form.specialInstructions} onChange={e => setForm(p => ({ ...p, specialInstructions: e.target.value }))} />
      </div>

      <button onClick={save} disabled={saving}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-2xl text-sm transition-all disabled:opacity-50 shadow-lg shadow-violet-900/30">
        {saving ? '⏳ Salvando...' : '💾 Salvar Contexto do Bot'}
      </button>
    </div>
  );
};

// ── Media Library ─────────────────────────────────────────────────────────────
const MediaView: React.FC<{ salonId: string }> = ({ salonId }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', mediaType: 'image', mediaUrl: '', triggerType: 'welcome', keywords: '', caption: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'url' | 'file'>('file');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = async () => {
    const t = await getToken();
    const r = await fetch('/api/crm-pro/media', { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    setItems(d.items || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const CLOUD = 'dyddwpxfm';
      const PRESET = 'bella_chic_uploads';
      // Cloudinary: image→image, video→video, audio→video (áudio usa endpoint de video)
      const resourceType = file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'video'
        : 'image';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', PRESET);
      formData.append('folder', 'crm-media');
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/upload`, {
        method: 'POST', body: formData,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Erro ${r.status}`);
      }
      const d = await r.json();
      if (d.secure_url) {
        setForm(p => ({ ...p, mediaUrl: d.secure_url }));
        toast.success('Arquivo enviado com sucesso!');
      } else {
        throw new Error('URL não retornada');
      }
    } catch (e: any) {
      console.error('[MediaUpload]', e);
      toast.error(`Erro no upload: ${e.message || 'verifique sua conexão'}`);
    }
    setUploading(false);
  };

  const save = async () => {
    if (!form.name || !form.mediaUrl) { toast.error('Nome e arquivo obrigatórios'); return; }
    setSaving(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ...form, keywords: form.keywords.split(',').map((k: string) => k.trim()).filter(Boolean) }),
      });
      setShowForm(false);
      setForm({ name: '', mediaType: 'image', mediaUrl: '', triggerType: 'welcome', keywords: '', caption: '' });
      setUploadMode('file');
      load();
    } catch {}
    setSaving(false);
  };

  const toggle = async (item: any) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ active: !item.active }) });
    load();
  };

  const remove = async (id: string) => {
    const t = await getToken();
    await fetch(`/api/crm-pro/media/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    load();
  };

  const typeIcon = { image: Image, audio: FileAudio, document: FileText, video: Film };
  const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-all";

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Biblioteca de Mídias</h2>
          <p className="text-slate-500 text-xs mt-0.5">Arquivos enviados automaticamente pelo bot</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-all">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Nome *</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Tabela de preços" className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Tipo</label>
              <select value={form.mediaType} onChange={e => setForm(p => ({ ...p, mediaType: e.target.value }))} className={`${inputCls} bg-[#0d0d1a] appearance-none cursor-pointer`}>
                <option value="image" className="bg-[#0d0d1a] text-white">Imagem</option>
                <option value="audio" className="bg-[#0d0d1a] text-white">Áudio</option>
                <option value="document" className="bg-[#0d0d1a] text-white">Documento</option>
                <option value="video" className="bg-[#0d0d1a] text-white">Vídeo</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-600 uppercase tracking-wide font-bold mb-1.5 block">Arquivo</label>
            {/* Toggle upload mode */}
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-2">
              {[{ v: 'file', label: '📁 Galeria / Câmera' }, { v: 'url', label: '🔗 URL' }].map(opt => (
                <button key={opt.v} type="button" onClick={() => { setUploadMode(opt.v as any); setForm(p => ({ ...p, mediaUrl: '' })); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${uploadMode === opt.v ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:text-white'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {uploadMode === 'file' ? (
              <div>
                <input ref={fileInputRef} type="file"
                  accept={form.mediaType === 'image' ? 'image/*' : form.mediaType === 'video' ? 'video/*' : form.mediaType === 'audio' ? 'audio/*' : '*/*'}
                  capture={form.mediaType === 'image' ? 'environment' : undefined}
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className={`w-full border-2 border-dashed rounded-xl py-6 text-center transition-all ${form.mediaUrl ? 'border-emerald-500/40 bg-emerald-900/10' : 'border-white/[0.10] hover:border-violet-500/40 hover:bg-violet-900/10'} disabled:opacity-50`}>
                  {uploading ? (
                    <p className="text-sm text-violet-400 font-semibold">⏳ Enviando...</p>
                  ) : form.mediaUrl ? (
                    <div>
                      <p className="text-emerald-400 font-bold text-sm">✅ Arquivo enviado!</p>
                      <p className="text-[10px] text-slate-600 mt-1 truncate px-4">{form.mediaUrl}</p>
                      <p className="text-[10px] text-violet-400 mt-1">Toque para trocar</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-2xl mb-1">{form.mediaType === 'image' ? '🖼️' : form.mediaType === 'video' ? '🎬' : form.mediaType === 'audio' ? '🎵' : '📄'}</p>
                      <p className="text-slate-400 font-semibold text-sm">Toque para escolher</p>
                      <p className="text-slate-700 text-xs mt-1">Galeria, câmera ou arquivos</p>
                    </div>
                  )}
                </button>
              </div>
            ) : (
              <input type="url" value={form.mediaUrl} onChange={e => setForm(p => ({ ...p, mediaUrl: e.target.value }))} placeholder="https://..." className={inputCls} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[{ value: 'welcome', label: 'Primeira mensagem' }, { value: 'keyword', label: 'Por palavra-chave' }].map(opt => (
              <button key={opt.value} onClick={() => setForm(p => ({ ...p, triggerType: opt.value }))}
                className={`text-left p-3 rounded-xl border transition-all ${form.triggerType === opt.value ? 'border-violet-500/50 bg-violet-900/20' : 'border-white/[0.08] hover:border-white/20'}`}>
                <p className="text-white text-xs font-semibold">{opt.label}</p>
              </button>
            ))}
          </div>
          {form.triggerType === 'keyword' && (
            <input type="text" value={form.keywords} onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))}
              placeholder="preço, valor, quanto custa (separados por vírgula)" className={inputCls} />
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 bg-white/[0.04] text-slate-400 py-2.5 rounded-xl text-xs">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all disabled:opacity-40">
              {saving ? 'Salvando...' : 'Salvar mídia'}
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}</div> :
        items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-12 w-12 rounded-2xl bg-violet-900/20 border border-violet-800/20 flex items-center justify-center mx-auto mb-3">
              <Film className="h-6 w-6 text-violet-500" />
            </div>
            <p className="text-slate-400 font-semibold">Nenhuma mídia configurada</p>
            <p className="text-slate-600 text-xs mt-1">Adicione áudios de boas-vindas ou imagens de preços</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item: any) => {
              const TypeIcon = (typeIcon as any)[item.mediaType] || FileText;
              return (
                <div key={item.id} className={`flex items-center gap-3 rounded-xl border ${item.active ? 'border-white/[0.07] bg-white/[0.03]' : 'border-white/[0.04] opacity-50'} p-4`}>
                  <div className="h-10 w-10 rounded-xl bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                    <TypeIcon className="h-5 w-5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{item.name}</p>
                    <p className="text-slate-600 text-xs mt-0.5">{item.triggerType === 'welcome' ? 'Primeira mensagem' : `Palavra-chave: ${item.keywords?.join(', ')}`}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => toggle(item)}
                      className={`relative h-5 w-9 rounded-full transition-all ${item.active ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${item.active ? 'left-4' : 'left-0.5'}`} />
                    </button>
                    <button onClick={() => remove(item.id)} className="text-slate-700 hover:text-rose-500 transition-all">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const CRMProDashboard: React.FC = () => {
  const { profile } = useAuth();
  const salonId = profile?.salonId;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>('funil');
  const [moreTab, setMoreTab] = useState<MoreTab>('postservice');
  const [showMore, setShowMore] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showRichPanel, setShowRichPanel] = useState(false);
  const [richType, setRichType] = useState<'image' | 'audio' | 'document'>('image');
  const [richUrl, setRichUrl] = useState('');
  const [richCaption, setRichCaption] = useState('');
  const [sendingRich, setSendingRich] = useState(false);
  const [notif, setNotif] = useState<string | null>(null);
  const [markingService, setMarkingService] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { connected, qrCode, setQrCode, pairingCode, setPairingCode, mode, setMode, pairingPhone, setPairingPhone, connecting, disconnecting, connectQR, connectPairing, disconnect } = useEvolutionStatus();
  const evolutionConnected = connected;
  const aiSummary = useAISummary(salonId, selected?.id);
  const { seqs: postServiceSeqs } = usePostServiceSequences();
  const dailyAlerts = useDailyAlerts(leads, postServiceSeqs);

  // ── Load leads ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!salonId) return;
    const q = query(collection(db, `salons/${salonId}/crm_clients`), orderBy('lastContact', 'desc'));
    return onSnapshot(q, snap => {
      setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    });
  }, [salonId]);

  // ── Sync selected lead ─────────────────────────────────────────────────────
  useEffect(() => {
    if (selected) {
      const fresh = leads.find(l => l.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [leads]);

  // ── Load messages ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!salonId || !selected?.id) { setMessages([]); return; }
    const q = query(collection(db, `salons/${salonId}/crm_clients/${selected.id}/messages`), orderBy('timestamp', 'asc'));
    return onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      const last = msgs.at(-1);
      if (last?.from === 'client' && ['atendente', 'humano', 'pessoa'].some(k => last.text.toLowerCase().includes(k))) {
        setNotif(`${selected.name} quer falar com você!`);
        setTimeout(() => setNotif(null), 6000);
      }
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });
  }, [salonId, selected?.id]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const moveToStage = async (lead: Lead, status: LeadStatus) => {
    if (!salonId || lead.status === status) return;
    await updateDoc(doc(db, `salons/${salonId}/crm_clients/${lead.id}`), { status, updatedAt: Date.now() }).catch(() => {});
    await addDoc(collection(db, `salons/${salonId}/crm_clients/${lead.id}/notes`), {
      text: `Movido para ${STAGES.find(s => s.key === status)?.label}`, type: 'stage_change', createdAt: Date.now(),
    }).catch(() => {});
    toast.success(`Movido para ${STAGES.find(s => s.key === status)?.label}`);
  };

  const toggleTakeover = async (lead: Lead) => {
    if (!salonId) return;
    const newActive = !lead.humanTakeover;
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/takeover', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phone: lead.phone, active: newActive }),
      });
      await updateDoc(doc(db, `salons/${salonId}/crm_clients/${lead.id}`), { humanTakeover: newActive });
      toast.success(newActive ? 'Você assumiu a conversa' : 'Bot reativado');
    } catch {}
  };

  const markServiceToday = async (lead: Lead, serviceName?: string) => {
    if (!salonId || markingService) return;
    setMarkingService(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/mark-service', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ clientId: lead.id, serviceName }),
      });
      // Auto-adiciona a tag do serviço se informado
      if (serviceName) {
        const currentTags = lead.tags || [];
        if (!currentTags.includes(serviceName)) {
          await updateDoc(doc(db, `salons/${salonId}/crm_clients/${lead.id}`), {
            tags: [...currentTags, serviceName],
            lastServiceName: serviceName,
          }).catch(() => {});
        }
      }
      await addDoc(collection(db, `salons/${salonId}/crm_clients/${lead.id}/notes`), {
        text: `✂️ Serviço${serviceName ? ` (${serviceName})` : ''} realizado hoje — follow-ups automáticos ativados`,
        type: 'service', createdAt: Date.now(),
      }).catch(() => {});
      toast.success(`Serviço marcado!${serviceName ? ` Tag "${serviceName}" adicionada.` : ''} Follow-ups agendados.`);
    } catch { toast.error('Erro ao marcar serviço'); }
    setMarkingService(false);
  };


  const sendMessage = async (override?: string) => {
    const text = (override || draft).trim();
    if (!text || !selected || sending) return;
    if (!override) setDraft('');
    setShowQuickReplies(false);
    setSending(true);
    try {
      const finalText = text.replace(/\{\{nome\}\}/gi, selected.name || 'você');
      const t = await getToken();
      const r = await fetch('/api/crm-pro/send-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phone: selected.phone, message: finalText }),
      });
      if (!r.ok && salonId) {
        await addDoc(collection(db, `salons/${salonId}/crm_clients/${selected.id}/messages`), {
          text: finalText, from: 'owner', timestamp: Date.now(),
        });
      }
    } catch {}
    setSending(false);
    inputRef.current?.focus();
  };

  const sendRich = async () => {
    if (!richUrl.trim() || !selected || sendingRich) return;
    setSendingRich(true);
    try {
      const t = await getToken();
      await fetch('/api/crm-pro/send-rich', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phone: selected.phone, type: richType, content: richUrl.trim(), caption: richCaption }),
      });
      setRichUrl(''); setRichCaption(''); setShowRichPanel(false);
      toast.success('Mídia enviada');
    } catch { toast.error('Erro ao enviar'); }
    setSendingRich(false);
  };

  const filteredLeads = leads.filter(l =>
    !searchQ || l.name?.toLowerCase().includes(searchQ.toLowerCase()) || l.phone?.includes(searchQ)
  );
  const byStage = (s: LeadStatus) => filteredLeads.filter(l => l.status === s);

  // ── Bottom Nav config ──────────────────────────────────────────────────────
  const NAV: { key: MainTab; Icon: React.FC<any>; label: string }[] = [
    { key: 'funil',  Icon: LayoutGrid,    label: 'Funil' },
    { key: 'inbox',  Icon: MessageSquare, label: 'Inbox' },
    { key: 'tasks',  Icon: CheckSquare,   label: 'Tarefas' },
    { key: 'stats',  Icon: BarChart3,     label: 'Stats' },
    { key: 'more',   Icon: MoreHorizontal,label: 'Mais' },
  ];

  const MORE_TABS: { key: MoreTab; Icon: React.FC<any>; label: string }[] = [
    { key: 'postservice',  Icon: Scissors,     label: 'Pós-serv' },
    { key: 'followup',    Icon: Repeat2,      label: 'Follow-up' },
    { key: 'quickreplies',Icon: Zap,          label: 'Rápidas' },
    { key: 'bulk',        Icon: Radio,        label: 'Disparo' },
    { key: 'media',       Icon: Film,         label: 'Mídias' },
    { key: 'whatsapp',    Icon: Wifi,         label: 'WhatsApp' },
    { key: 'context',     Icon: Sparkles,     label: 'Bot IA' },
  ];

  return (
    <>
      <SEO title="CRM Pro — Bella & Chic" description="Painel CRM Pro" />

      {/* Global notification */}
      {notif && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-rose-600 text-white px-5 py-3 rounded-2xl shadow-2xl max-w-[90vw]">
          <Bell className="h-4 w-4 flex-shrink-0" />
          <p className="font-semibold text-sm truncate">{notif}</p>
          <button onClick={() => setNotif(null)}><X className="h-4 w-4 opacity-70" /></button>
        </div>
      )}

      {showAddModal && salonId && (
        <AddLeadModal salonId={salonId} onClose={() => setShowAddModal(false)} />
      )}

      {/* More drawer */}
      {showMore && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end sm:justify-center sm:items-end" onClick={e => { if (e.target === e.currentTarget) setShowMore(false); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMore(false)} />
          <div className="relative w-full sm:w-80 sm:h-full bg-[#0a0a16] border-t sm:border-t-0 sm:border-l border-white/[0.08] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-rose-600 flex items-center justify-center">
                  <Crown className="h-3.5 w-3.5 text-white" />
                </div>
                <p className="text-white font-bold text-sm">Ferramentas Pro</p>
              </div>
              <button onClick={() => setShowMore(false)} className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Tab selector */}
            <div className="flex gap-1 p-3 border-b border-white/[0.06] flex-shrink-0">
              {MORE_TABS.map(t => (
                <button key={t.key} onClick={() => setMoreTab(t.key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-semibold transition-all ${moreTab === t.key ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-white hover:bg-white/[0.04]'}`}>
                  <t.Icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
              {moreTab === 'postservice' && salonId && <PostServiceView salonId={salonId} />}
              {moreTab === 'followup' && salonId && <FollowUpView salonId={salonId} />}
              {moreTab === 'quickreplies' && salonId && <QuickRepliesView salonId={salonId} />}
              {moreTab === 'bulk' && salonId && <BulkSendView salonId={salonId} leads={leads} postServiceSeqs={postServiceSeqs} />}
              {moreTab === 'media' && salonId && <MediaView salonId={salonId} />}
              {moreTab === 'context' && salonId && <BotContextView salonId={salonId} />}
              {moreTab === 'whatsapp' && (
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="mb-5">
                    <h2 className="text-base font-bold text-white">Conectar WhatsApp</h2>
                    <p className="text-slate-500 text-xs mt-0.5">Vincule seu número para enviar mídias e mensagens automáticas</p>
                  </div>
                  <WAStatusBlock
                    connected={connected} connecting={connecting} disconnecting={disconnecting}
                    mode={mode} setMode={setMode} qrCode={qrCode} setQrCode={setQrCode}
                    pairingCode={pairingCode} setPairingCode={setPairingCode}
                    pairingPhone={pairingPhone} setPairingPhone={setPairingPhone}
                    connectQR={connectQR} connectPairing={connectPairing} disconnect={disconnect}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* App shell */}
      <div className="h-screen bg-[#07070f] text-white flex flex-col overflow-hidden">
        {/* Background texture */}
        <div className="fixed inset-0 pointer-events-none" style={{
          backgroundImage: `radial-gradient(ellipse at 20% 0%, rgba(124,58,237,0.07) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 100%, rgba(244,63,94,0.05) 0%, transparent 60%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.01'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />

        {/* Header */}
        <header className="relative z-10 flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#07070f]/80 backdrop-blur-xl">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-600 to-rose-600 flex items-center justify-center shadow-lg">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-white font-black text-sm tracking-tight leading-none">CRM Pro</p>
              <p className="text-slate-700 text-[9px] tracking-widest">BELLA & CHIC</p>
            </div>
          </div>
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
            <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar contato..."
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/40 focus:bg-white/[0.06] transition-all" />
            {searchQ && (
              <button onClick={() => setSearchQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Add button */}
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs transition-all flex-shrink-0 shadow-lg shadow-violet-900/30">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Adicionar</span>
          </button>
        </header>

        {salonId && <WABanner salonId={salonId} />}

        {(mainTab === 'funil' || mainTab === 'inbox') && (
          <DailyAlertsPanel
            alerts={dailyAlerts}
            onOpenLead={leadId => {
              const lead = leads.find(l => l.id === leadId);
              if (lead) { setSelected(lead); setMainTab('inbox'); }
            }}
          />
        )}


        {/* Content area */}
        <div className="flex-1 overflow-hidden flex flex-col relative z-10" style={{ paddingBottom: '72px' }}>

          {/* ═══ FUNIL TAB ═══════════════════════════════════════════════════ */}
          {mainTab === 'funil' && (
            <div className="flex-1 overflow-x-auto px-4 pb-4 pt-3">
              {loading ? (
                <div className="flex gap-3">{STAGES.slice(0,4).map(s => <div key={s.key} className="h-64 w-52 rounded-2xl bg-white/[0.03] animate-pulse flex-shrink-0" />)}</div>
              ) : (
                <div className="flex gap-3 min-w-max h-full">
                  {STAGES.map(stage => (
                    <div key={stage.key}
                      onDragOver={e => { e.preventDefault(); setDragOver(stage.key); }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={async e => {
                        e.preventDefault(); setDragOver(null);
                        const lead = leads.find(l => l.id === e.dataTransfer.getData('leadId'));
                        if (lead) await moveToStage(lead, stage.key);
                      }}
                      className={`flex flex-col w-52 sm:w-60 rounded-2xl border transition-all duration-200 ${
                        dragOver === stage.key ? 'border-violet-500/50 bg-violet-900/10 scale-[1.01]' : 'border-white/[0.06] bg-white/[0.015]'
                      }`}>
                      {/* Column header */}
                      <div className={`flex items-center gap-2 px-3.5 py-3 rounded-t-2xl ${stage.bg} border-b border-white/[0.04]`}>
                        <stage.Icon className={`h-3.5 w-3.5 ${stage.color}`} />
                        <span className={`font-bold text-sm ${stage.color}`}>{stage.label}</span>
                        <span className="ml-auto text-[10px] text-slate-700 bg-black/20 px-2 py-0.5 rounded-full font-bold">
                          {byStage(stage.key).length}
                        </span>
                      </div>
                      {/* Cards */}
                      <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 230px)' }}>
                        {byStage(stage.key).map(lead => (
                          <LeadCard key={lead.id} lead={lead} currentStage={stage}
                            onOpen={() => { setSelected(lead); setMainTab('inbox'); setTimeout(() => aiSummary.refresh(), 300); }}
                            onMove={s => moveToStage(lead, s)} />
                        ))}
                        {byStage(stage.key).length === 0 && (
                          <div className="py-8 text-center">
                            <p className="text-slate-800 text-[10px] font-medium">Solte aqui</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ INBOX TAB ═══════════════════════════════════════════════════ */}
          {mainTab === 'inbox' && (
            <div className="flex-1 flex overflow-hidden px-3 py-3 gap-3">
              {/* Conversation list */}
              <div className={`flex flex-col ${selected ? 'hidden sm:flex' : 'flex'} w-full sm:w-64 lg:w-72 flex-shrink-0`}>
                <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
                  {loading ? [0,1,2,3,4].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />) :
                    leads.length === 0 ? (
                      <div className="py-16 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-violet-900/20 border border-violet-800/20 flex items-center justify-center mx-auto mb-3">
                          <Inbox className="h-6 w-6 text-violet-500" />
                        </div>
                        <p className="text-slate-500 font-semibold text-sm">Nenhum contato</p>
                        <button onClick={() => setShowAddModal(true)} className="mt-2 text-xs text-violet-400 underline">Adicionar</button>
                      </div>
                    ) : filteredLeads.map(lead => (
                      <button key={lead.id}
                        onClick={() => { setSelected(lead); setTimeout(() => aiSummary.refresh(), 300); }}
                        className={`w-full text-left rounded-xl p-3 transition-all border ${
                          selected?.id === lead.id
                            ? 'bg-violet-600/10 border-violet-500/30'
                            : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08]'
                        }`}>
                        <div className="flex items-start gap-2.5">
                          <Avatar name={lead.name || '?'} size="sm" human={lead.humanTakeover} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-bold text-white truncate">{lead.name || lead.phone}</p>
                              <p className="text-[10px] text-slate-700 flex-shrink-0">{fmt(lead.lastMessage?.timestamp || lead.lastContact)}</p>
                            </div>
                            <p className="text-[11px] text-slate-600 truncate mt-0.5 leading-snug">
                              {lead.lastMessage?.from === 'bot' ? '· Bot: ' : lead.lastMessage?.from === 'owner' ? '· Você: ' : ''}
                              {lead.lastMessage?.text || STAGES.find(s => s.key === lead.status)?.label}
                            </p>
                            {lead.tags && (lead.tags ?? []).length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {(lead.tags ?? []).slice(0, 1).map(tag => (
                                  <span key={tag} className="text-[9px] bg-violet-900/20 text-violet-600 px-1.5 py-0 rounded-full">{tag}</span>
                                ))}
                                {(lead.tags ?? []).length > 1 && <span className="text-[9px] text-slate-700">+{(lead.tags ?? []).length - 1}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              {/* Chat panel */}
              {selected ? (
                <div className="flex-1 flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden min-w-0">
                  {/* Chat header */}
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] bg-white/[0.03] flex-shrink-0">
                    <button onClick={() => setSelected(null)} className="sm:hidden text-slate-500 hover:text-white transition-all mr-1">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <Avatar name={selected.name || '?'} size="sm" human={selected.humanTakeover} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate leading-tight">{selected.name || selected.phone}</p>
                      <div className="flex items-center gap-1.5">
                        {(() => { const s = STAGES.find(x => x.key === selected.status); return s ? <s.Icon className={`h-3 w-3 ${s.color}`} /> : null; })()}
                        <span className={`text-[10px] font-semibold ${STAGES.find(s => s.key === selected.status)?.color}`}>
                          {STAGES.find(s => s.key === selected.status)?.label}
                        </span>
                        {selected.phone && <span className="text-[10px] text-slate-700">· {selected.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <select value={selected.status} onChange={e => moveToStage(selected, e.target.value as LeadStatus)}
                        className="hidden sm:block bg-[#0d0d1a] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white focus:outline-none cursor-pointer appearance-none">
                        {STAGES.map(s => <option key={s.key} value={s.key} className="bg-[#0d0d1a] text-white">{s.label}</option>)}
                      </select>
                      {/* Notes toggle */}
                      <button onClick={() => setShowNotesPanel(!showNotesPanel)}
                        className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${showNotesPanel ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-slate-500 hover:text-white'}`}>
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                      {/* Mark service button — com seleção de serviço */}
                      <div className="relative group">
                        <button
                          disabled={markingService}
                          title="Marcar atendimento hoje (ativa follow-ups automáticos)"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-800/40 bg-emerald-900/20 text-emerald-400 text-[10px] font-bold hover:bg-emerald-900/40 transition-all disabled:opacity-50">
                          <Scissors className="h-3 w-3" />
                          <span className="hidden sm:inline">{markingService ? '...' : 'Serviço ▾'}</span>
                        </button>
                        {/* Dropdown de serviços */}
                        <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block min-w-[180px] bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-1.5 space-y-0.5">
                          <button onClick={() => markServiceToday(selected, undefined)}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/[0.07] hover:text-white transition-all">
                            ✂️ Serviço genérico (sem tag)
                          </button>
                          {/* Serviços das sequências pós-serviço */}
                          {postServiceSeqs.filter(s => s.serviceName).map(s => (
                            <button key={s.id} onClick={() => markServiceToday(selected, s.serviceName)}
                              className="w-full text-left px-3 py-2 rounded-lg text-xs text-violet-300 hover:bg-violet-900/30 hover:text-white transition-all">
                              🏷️ {s.serviceName}
                            </button>
                          ))}
                          {/* Input manual */}
                          <div className="border-t border-white/[0.05] pt-1.5 mt-1">
                            <form onSubmit={e => {
                              e.preventDefault();
                              const input = (e.target as HTMLFormElement).querySelector('input') as HTMLInputElement;
                              const val = input.value.trim();
                              if (val) { markServiceToday(selected, val); input.value = ''; }
                            }}>
                              <input
                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
                                placeholder="Outro serviço... (Enter)"
                              />
                            </form>
                          </div>
                        </div>
                      </div>
                      {/* Bot/human toggle */}
                      <button onClick={() => toggleTakeover(selected)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                          selected.humanTakeover ? 'border-rose-700/50 bg-rose-900/20 text-rose-400' : 'border-emerald-800/50 bg-emerald-900/20 text-emerald-400'
                        }`}>
                        {selected.humanTakeover ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                        <span className="hidden sm:inline">{selected.humanTakeover ? 'Humano' : 'Bot'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Takeover notice */}
                  {selected.humanTakeover && (
                    <div className="bg-rose-950/30 border-b border-rose-900/20 px-4 py-2 flex items-center gap-2 flex-shrink-0">
                      <User className="h-3 w-3 text-rose-400 flex-shrink-0" />
                      <span className="text-xs text-rose-400">Você está atendendo — bot pausado</span>
                      <button onClick={() => toggleTakeover(selected)} className="ml-auto text-[10px] text-rose-500/70 hover:text-rose-400 underline">Reativar bot</button>
                    </div>
                  )}

                  {/* AI Summary */}
                  {aiSummary.summary && (
                    <div className="border-b border-violet-900/20 bg-violet-950/10 px-4 py-3 flex-shrink-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] text-violet-500 font-bold uppercase tracking-widest mb-1.5">Análise IA</p>
                          <p className="text-xs text-slate-300 leading-relaxed">{aiSummary.summary.summary}</p>
                          {aiSummary.summary.tags?.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {(aiSummary?.summary?.tags ?? []).map((tag: string) => (
                                <span key={tag} className="text-[9px] bg-violet-900/30 text-violet-400 border border-violet-800/30 px-2 py-0.5 rounded-full">{tag}</span>
                              ))}
                            </div>
                          )}
                          {aiSummary.summary.suggestion && (
                            <button onClick={() => setDraft(aiSummary.summary!.suggestion)} className="mt-2 text-[10px] text-rose-400 hover:text-rose-300 underline">
                              Usar sugestão de resposta
                            </button>
                          )}
                        </div>
                        <button onClick={aiSummary.refresh} disabled={aiSummary.loading} className="text-violet-600 hover:text-violet-400 transition-all flex-shrink-0">
                          <Activity className={`h-3.5 w-3.5 ${aiSummary.loading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    {messages.length === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                          <MessageSquare className="h-8 w-8 text-slate-800 mx-auto mb-2" />
                          <p className="text-slate-700 text-xs">Sem mensagens ainda</p>
                        </div>
                      </div>
                    ) : messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input area */}
                  <div className="border-t border-white/[0.06] px-3 py-3 bg-black/20 flex-shrink-0">
                    {!selected.humanTakeover && (
                      <div className="flex items-center justify-between mb-2.5 px-1">
                        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                          <Bot className="h-3.5 w-3.5" /> Bot ativo
                        </div>
                        <button onClick={() => toggleTakeover(selected)}
                          className="text-xs text-rose-500 border border-rose-900/50 bg-rose-950/30 px-3 py-1 rounded-lg hover:bg-rose-900/30 transition-all">
                          Assumir conversa
                        </button>
                      </div>
                    )}
                    {/* Quick replies panel */}
                    {showQuickReplies && selected.humanTakeover && salonId && (
                      <div className="mb-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Zap className="h-3 w-3" /> Rápidas</span>
                          <button onClick={() => setShowQuickReplies(false)}><X className="h-3.5 w-3.5 text-slate-600" /></button>
                        </div>
                        <QuickRepliesView salonId={salonId} compact onUse={t => { setDraft(t); setShowQuickReplies(false); }} />
                      </div>
                    )}
                    {/* Rich media panel */}
                    {showRichPanel && selected.humanTakeover && (
                      <div className="mb-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-2">
                        <div className="flex gap-1.5">
                          {(['image', 'audio', 'document'] as const).map(t => (
                            <button key={t} onClick={() => setRichType(t)}
                              className={`flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border transition-all ${richType === t ? 'bg-violet-600 border-violet-500 text-white' : 'border-white/[0.08] text-slate-500 hover:text-white'}`}>
                              {t === 'image' ? <Image className="h-3 w-3" /> : t === 'audio' ? <FileAudio className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                              {t === 'image' ? 'Imagem' : t === 'audio' ? 'Áudio' : 'Doc'}
                            </button>
                          ))}
                          <button onClick={() => setShowRichPanel(false)} className="ml-auto"><X className="h-4 w-4 text-slate-600" /></button>
                        </div>
                        <input type="url" value={richUrl} onChange={e => setRichUrl(e.target.value)} placeholder="URL do arquivo..."
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-all" />
                        {richType !== 'audio' && (
                          <input type="text" value={richCaption} onChange={e => setRichCaption(e.target.value)} placeholder="Legenda (opcional)"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-all" />
                        )}
                        <button onClick={sendRich} disabled={!richUrl.trim() || sendingRich}
                          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold py-2 rounded-xl text-xs transition-all">
                          {sendingRich ? 'Enviando...' : 'Enviar mídia via WhatsApp'}
                        </button>
                      </div>
                    )}
                    {/* Main input row */}
                    <div className="flex gap-2 items-center">
                      {selected.humanTakeover && (
                        <>
                          <button onClick={() => { setShowQuickReplies(!showQuickReplies); setShowRichPanel(false); }}
                            className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all ${
                              showQuickReplies ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/[0.04] border-white/[0.08] text-slate-500 hover:text-white'
                            }`}>
                            <Zap className="h-4 w-4" />
                          </button>
                          {evolutionConnected && (
                            <button onClick={() => { setShowRichPanel(!showRichPanel); setShowQuickReplies(false); }}
                              className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all ${
                                showRichPanel ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/[0.04] border-white/[0.08] text-slate-500 hover:text-white'
                              }`}>
                              <Paperclip className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                      <input ref={inputRef} type="text" value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        disabled={!selected.humanTakeover || sending}
                        placeholder={selected.humanTakeover ? 'Digite... (Enter para enviar)' : 'Ative o modo humano para responder'}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/40 disabled:opacity-30 disabled:cursor-not-allowed min-w-0 transition-all" />
                      <button onClick={() => sendMessage()}
                        disabled={!selected.humanTakeover || !draft.trim() || sending}
                        className="h-10 w-10 bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white rounded-xl flex items-center justify-center flex-shrink-0 transition-all shadow-lg shadow-violet-900/30">
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 hidden sm:flex items-center justify-center rounded-2xl border border-white/[0.05]">
                  <div className="text-center">
                    <div className="h-14 w-14 rounded-2xl bg-violet-900/20 border border-violet-800/20 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="h-7 w-7 text-violet-600" />
                    </div>
                    <p className="text-slate-500 font-semibold">Selecione uma conversa</p>
                    <p className="text-slate-700 text-xs mt-1">ou adicione um contato pelo botão +</p>
                  </div>
                </div>
              )}

              {/* Notes panel (desktop only) */}
              {selected && showNotesPanel && salonId && (
                <div className="w-60 flex-shrink-0 rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden hidden lg:flex flex-col">
                  <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.03] flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <StickyNote className="h-3.5 w-3.5 text-slate-400" />
                      <p className="text-xs font-bold text-white">Notas</p>
                    </div>
                    <button onClick={() => setShowNotesPanel(false)} className="text-slate-600 hover:text-white transition-all">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <NotesPanel salonId={salonId} lead={selected} />
                </div>
              )}
            </div>
          )}

          {/* ═══ TASKS TAB ═══════════════════════════════════════════════════ */}
          {mainTab === 'tasks' && salonId && <TasksView salonId={salonId} leads={leads} />}

          {/* ═══ STATS TAB ═══════════════════════════════════════════════════ */}
          {mainTab === 'stats' && salonId && <StatsView leads={leads} salonId={salonId} />}
        </div>

        {/* ── Bottom Navigation (mobile-first) ─────────────────────────────── */}
        <nav className="fixed bottom-0 left-0 right-0 z-20 flex-shrink-0 border-t border-white/[0.06] bg-[#07070f]/95 backdrop-blur-xl px-2 pb-safe">
          <div className="flex items-center justify-around py-2">
            {NAV.map(({ key, Icon, label }) => {
              const isActive = key === 'more' ? showMore : mainTab === key;
              return (
                <button key={key}
                  onClick={() => {
                    if (key === 'more') { setShowMore(!showMore); }
                    else { setMainTab(key); setShowMore(false); if (key !== 'inbox') setSelected(null); }
                  }}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[56px] ${
                    isActive ? 'text-white' : 'text-slate-600 hover:text-slate-400'
                  }`}>
                  <div className={`relative h-8 w-8 flex items-center justify-center rounded-xl transition-all ${
                    isActive ? 'bg-violet-600 shadow-lg shadow-violet-900/50' : ''
                  }`}>
                    <Icon className="h-4 w-4" />
                    {key === 'inbox' && leads.filter(l => l.lastMessage?.from === 'client').length > 0 && !isActive && (
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 border border-[#07070f]" />
                    )}
                  </div>
                  <span className="text-[9px] font-semibold tracking-wide">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
};

export default CRMProDashboard;
