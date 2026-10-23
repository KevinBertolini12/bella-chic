import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, getDocs, where,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Quote, QuoteItem, QuoteStatus, QuotePaymentMethod } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import {
  Plus, Trash2, Edit2, Send, CheckCircle2,
  DollarSign, FileText, Clock, Copy, ExternalLink,
  QrCode, CreditCard, Receipt, Search, MessageSquare,
  User, Phone, X, ChevronDown, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Types ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<QuoteStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Rascunho',  color: 'text-gray-600',   bg: 'bg-gray-100',   border: 'border-gray-200' },
  sent:      { label: 'Enviado',   color: 'text-blue-700',   bg: 'bg-blue-100',   border: 'border-blue-200' },
  accepted:  { label: 'Aceito',    color: 'text-amber-700',  bg: 'bg-amber-100',  border: 'border-amber-200' },
  paid:      { label: 'Pago',      color: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-200' },
  cancelled: { label: 'Cancelado', color: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-200' },
};

const fmt = (v: number) => `R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const newItem = (): QuoteItem => ({ id: Date.now().toString(), description: '', quantity: 1, unitPrice: 0 });
const getToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve('');

// ─── Patient Autocomplete ────────────────────────────────────────────────────

interface PatientSuggestion { name: string; phone: string; email?: string; source: string; }

const usePatientSearch = (salonId: string, query: string) => {
  const [results, setResults] = useState<PatientSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const q = query.toLowerCase();
      const all: PatientSuggestion[] = [];

      try {
        // Search CRM clients
        const crmSnap = await getDocs(collection(db, `salons/${salonId}/crm_clients`));
        crmSnap.docs.forEach(d => {
          const data = d.data();
          if ((data.name ?? '').toLowerCase().includes(q) || (data.phone ?? '').includes(q)) {
            all.push({ name: data.name, phone: data.phone ?? '', email: data.email, source: 'CRM' });
          }
        });

        // Search client records (prontuários)
        const recSnap = await getDocs(collection(db, `salons/${salonId}/client_records`));
        recSnap.docs.forEach(d => {
          const data = d.data();
          if ((data.clientName ?? '').toLowerCase().includes(q) || (data.clientPhone ?? '').includes(q)) {
            if (!all.find(a => a.phone === data.clientPhone)) {
              all.push({ name: data.clientName, phone: data.clientPhone ?? '', email: data.clientEmail, source: 'Prontuário' });
            }
          }
        });

        // Search appointments (booked clients)
        const apptSnap = await getDocs(
          query2(collection(db, `salons/${salonId}/appointments`),
            orderBy('createdAt', 'desc'), limit2(50))
        );
        apptSnap.docs.forEach(d => {
          const data = d.data();
          if ((data.clientName ?? '').toLowerCase().includes(q) || (data.clientPhone ?? '').includes(q)) {
            if (!all.find(a => a.phone === data.clientPhone)) {
              all.push({ name: data.clientName, phone: data.clientPhone ?? '', email: data.clientEmail, source: 'Agendamento' });
            }
          }
        });
      } catch {}

      // Deduplicate by phone and limit
      const seen = new Set<string>();
      setResults(all.filter(a => {
        const key = a.phone || a.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 6));
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [salonId, query]);

  return { results, loading };
};

// workaround: alias firestore query functions to avoid name collision with our state variable
import { query as query2, limit as limit2 } from 'firebase/firestore';

// ─── Patient Search Input ─────────────────────────────────────────────────────

interface PatientSearchInputProps {
  salonId: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (p: PatientSuggestion) => void;
  placeholder?: string;
}

const PatientSearchInput: React.FC<PatientSearchInputProps> = ({ salonId, value, onChange, onSelect, placeholder }) => {
  const [open, setOpen] = useState(false);
  const { results, loading } = usePatientSearch(salonId, value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const SOURCE_COLORS: Record<string, string> = {
    'CRM': 'bg-violet-100 text-violet-700',
    'Prontuário': 'bg-blue-100 text-blue-700',
    'Agendamento': 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => value.length >= 2 && setOpen(true)}
          placeholder={placeholder ?? 'Nome completo ou pesquise...'}
          className="pl-9"
        />
        {value && (
          <button onClick={() => { onChange(''); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[9999] mt-1 rounded-xl border border-border bg-white shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Pacientes encontrados</p>
          </div>
          {results.map((p, i) => (
            <button key={i} onMouseDown={() => { onSelect(p); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-start gap-2.5">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                {(p.name?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />{p.phone}
                </p>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 self-start mt-0.5 ${SOURCE_COLORS[p.source] ?? 'bg-gray-100 text-gray-600'}`}>
                {p.source}
              </span>
            </button>
          ))}
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Buscando...</div>}
        </div>
      )}
    </div>
  );
};

// ─── Quote Form ───────────────────────────────────────────────────────────────

interface QuoteFormProps {
  initial?: Partial<Quote>;
  onSave: (data: Partial<Quote>) => void;
  onClose: () => void;
  saving: boolean;
  salonId: string;
}

const QuoteForm = ({ initial, onSave, onClose, saving, salonId }: QuoteFormProps) => {
  const [form, setForm] = useState<Partial<Quote>>({
    clientName: '', clientPhone: '', clientEmail: '', clientCpf: '',
    items: [newItem()], discount: 0, notes: '',
    ...initial,
  });

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));
  const setItem = (id: string, field: keyof QuoteItem, value: any) =>
    set('items', (form.items || []).map(i => i.id === id ? { ...i, [field]: value } : i));
  const addItem = () => set('items', [...(form.items || []), newItem()]);
  const removeItem = (id: string) => set('items', (form.items || []).filter(i => i.id !== id));

  const subtotal = (form.items || []).reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
  const total = Math.max(0, subtotal - (form.discount || 0));

  const handleSave = () => {
    if (!form.clientName?.trim()) { toast.error('Nome do cliente obrigatório.'); return; }
    if ((form.items || []).length === 0) { toast.error('Adicione pelo menos um item.'); return; }
    onSave({ ...form, subtotal, total });
  };

  const handlePatientSelect = (p: PatientSuggestion) => {
    set('clientName', p.name);
    set('clientPhone', p.phone);
    if (p.email) set('clientEmail', p.email);
    toast.success(`${p.name} preenchido automaticamente`);
  };

  return (
    <div className="space-y-5 py-2 max-h-[75vh] overflow-y-auto pr-1">
      {/* Cliente com busca */}
      <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <User className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Dados do cliente</p>
          <span className="text-[10px] text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full">Busca automática</span>
        </div>
        <div className="space-y-1.5">
          <Label>Nome do cliente *</Label>
          <PatientSearchInput
            salonId={salonId}
            value={form.clientName || ''}
            onChange={v => set('clientName', v)}
            onSelect={handlePatientSelect}
            placeholder="Digite para buscar entre seus pacientes..."
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Telefone / WhatsApp</Label>
            <Input value={form.clientPhone || ''} onChange={e => set('clientPhone', e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={form.clientEmail || ''} onChange={e => set('clientEmail', e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>CPF (para boleto/cartão)</Label>
            <Input value={form.clientCpf || ''} onChange={e => set('clientCpf', e.target.value)} placeholder="000.000.000-00" />
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Itens / Procedimentos</Label>
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
          </Button>
        </div>
        <div className="space-y-2">
          {(form.items || []).map((item, idx) => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-start rounded-xl border p-2.5 bg-muted/10">
              <div className="col-span-5 space-y-1">
                {idx === 0 && <Label className="text-xs text-muted-foreground">Procedimento / Item</Label>}
                <Input className="h-8 text-xs" value={item.description}
                  onChange={e => setItem(item.id, 'description', e.target.value)}
                  placeholder="Ex: Consulta de avaliação" />
              </div>
              <div className="col-span-2 space-y-1">
                {idx === 0 && <Label className="text-xs text-muted-foreground">Qtd</Label>}
                <Input className="h-8 text-xs" type="number" min="1" value={item.quantity}
                  onChange={e => setItem(item.id, 'quantity', Number(e.target.value))} />
              </div>
              <div className="col-span-3 space-y-1">
                {idx === 0 && <Label className="text-xs text-muted-foreground">Valor unit.</Label>}
                <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.unitPrice}
                  onChange={e => setItem(item.id, 'unitPrice', Number(e.target.value))} placeholder="0,00" />
              </div>
              <div className="col-span-1 space-y-1">
                {idx === 0 && <Label className="text-xs invisible">X</Label>}
                <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive"
                  onClick={() => removeItem(item.id)} disabled={(form.items || []).length <= 1}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="col-span-1 text-xs text-right text-muted-foreground self-end pb-1.5">
                {fmt(item.quantity * item.unitPrice)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totais */}
      <div className="rounded-xl border p-3.5 space-y-2 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{fmt(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Desconto (R$)</span>
          <Input className="h-7 w-32 text-xs text-right" type="number" min="0" step="0.01"
            value={form.discount || 0} onChange={e => set('discount', Number(e.target.value))} />
        </div>
        <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
          <span>Total</span>
          <span className="text-primary text-lg">{fmt(total)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Observações / Validade</Label>
        <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)}
          placeholder="Condições, prazo de validade do orçamento, informações adicionais..." rows={3} />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={saving} onClick={handleSave}>
          {saving ? 'Salvando...' : initial?.id ? 'Atualizar' : 'Criar Orçamento'}
        </Button>
      </div>
    </div>
  );
};

// ─── Payment Modal ─────────────────────────────────────────────────────────────

interface PaymentModalProps {
  quote: Quote; salonId: string;
  onClose: () => void; onPaid: () => void;
}

const PaymentModal = ({ quote, salonId, onClose, onPaid }: PaymentModalProps) => {
  const [method, setMethod] = useState<QuotePaymentMethod>('PIX');
  const [installments, setInstallments] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; copyPaste: string } | null>(null);
  const [boletoUrl, setBoletoUrl] = useState('');
  const [cardLink, setCardLink] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/quotes/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ salonId, quoteId: quote.id, method, installments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar cobrança');
      if (method === 'PIX') setPixData({ qrCode: data.qrCodeBase64, copyPaste: data.copyPaste });
      else if (method === 'BOLETO') setBoletoUrl(data.boletoUrl);
      else setCardLink(data.paymentLink);
      toast.success('Cobrança gerada!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gerar cobrança');
    } finally { setLoading(false); }
  };

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copiado!'); };

  const sendViaWA = (msg: string) => {
    const phone = quote.clientPhone?.replace(/\D/g, '');
    if (!phone) { toast.error('Cliente sem telefone'); return; }
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-primary/5 to-transparent border p-3.5 text-sm">
        <p className="font-semibold">{quote.clientName}</p>
        <p className="text-muted-foreground">{(quote.items ?? []).length} item(s) · <span className="font-bold text-primary">{fmt(quote.total)}</span></p>
        {quote.clientPhone && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Phone className="h-3 w-3" />{quote.clientPhone}</p>}
      </div>

      {!pixData && !boletoUrl && !cardLink && (
        <>
          <div className="space-y-3">
            <Label>Forma de pagamento</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'PIX', icon: <QrCode className="h-4 w-4" />, label: 'PIX' },
                { v: 'CREDIT_CARD', icon: <CreditCard className="h-4 w-4" />, label: 'Cartão' },
                { v: 'BOLETO', icon: <Receipt className="h-4 w-4" />, label: 'Boleto' },
              ] as const).map(({ v, icon, label }) => (
                <button key={v} onClick={() => setMethod(v as QuotePaymentMethod)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all ${method === v ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-muted text-muted-foreground hover:border-primary/40'}`}>
                  {icon}
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {method === 'CREDIT_CARD' && (
            <div className="space-y-1.5">
              <Label>Parcelamento</Label>
              <Select value={String(installments)} onValueChange={v => setInstallments(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,10,12].map(n => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1 ? `À vista — ${fmt(quote.total)}` : `${n}x de ${fmt(quote.total / n)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!quote.clientCpf && method !== 'PIX' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              CPF do cliente é necessário para cartão e boleto. Edite o orçamento e adicione o CPF.
            </div>
          )}

          <Button className="w-full" size="lg" disabled={loading || (!quote.clientCpf && method !== 'PIX')} onClick={handleGenerate}>
            {loading ? 'Gerando...' : 'Gerar Cobrança'}
          </Button>
        </>
      )}

      {pixData && (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium text-green-700">PIX gerado com sucesso!</p>
          {pixData.qrCode && <div className="flex justify-center"><img src={`data:image/png;base64,${pixData.qrCode}`} alt="QR Code PIX" className="h-48 w-48 rounded-xl border shadow" /></div>}
          <Button variant="outline" className="w-full" onClick={() => copyText(pixData.copyPaste)}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar código PIX
          </Button>
          {quote.clientPhone && (
            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() =>
              sendViaWA(`Olá ${quote.clientName}! Seu orçamento está pronto. 💰 Valor: ${fmt(quote.total)}\n\nPague via PIX:\n${pixData.copyPaste}`)}>
              <MessageSquare className="mr-1.5 h-4 w-4" /> Enviar por WhatsApp
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onPaid}>Marcar como pago manualmente</Button>
        </div>
      )}

      {boletoUrl && (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium">Boleto gerado!</p>
          <Button className="w-full" onClick={() => window.open(boletoUrl, '_blank')}>
            <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir Boleto
          </Button>
          {quote.clientPhone && (
            <Button variant="outline" className="w-full" onClick={() =>
              sendViaWA(`Olá ${quote.clientName}! Seu boleto está pronto. Valor: ${fmt(quote.total)}\n\nAcesse: ${boletoUrl}`)}>
              <MessageSquare className="mr-1.5 h-4 w-4" /> Enviar por WhatsApp
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onPaid}>Marcar como pago</Button>
        </div>
      )}

      {cardLink && (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium">Link de pagamento gerado!</p>
          <Button className="w-full" onClick={() => window.open(cardLink, '_blank')}>
            <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir Link
          </Button>
          <Button variant="outline" className="w-full text-xs" onClick={() => copyText(cardLink)}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link
          </Button>
          {quote.clientPhone && (
            <Button variant="outline" className="w-full" onClick={() =>
              sendViaWA(`Olá ${quote.clientName}! Seu link de pagamento está pronto. Valor: ${fmt(quote.total)}\n\nPague aqui: ${cardLink}`)}>
              <MessageSquare className="mr-1.5 h-4 w-4" /> Enviar por WhatsApp
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onPaid}>Marcar como pago</Button>
        </div>
      )}
    </div>
  );
};

// ─── Quote Card (3D) ──────────────────────────────────────────────────────────

interface QuoteCardProps {
  quote: Quote;
  onSend: () => void;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: QuoteStatus) => void;
  sending: string | null;
}

const QuoteCard: React.FC<QuoteCardProps> = ({ quote, onSend, onPay, onEdit, onDelete, onStatusChange, sending }) => {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const st = STATUS_CONFIG[quote.status];
  const isSending = sending === quote.id;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || window.innerWidth < 768) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
    cancelAnimationFrame(frameRef.current!);
    frameRef.current = requestAnimationFrame(() => {
      if (ref.current) ref.current.style.transform = `perspective(800px) rotateX(${y}deg) rotateY(${x}deg) translateZ(2px)`;
    });
  };
  const handleMouseLeave = () => {
    cancelAnimationFrame(frameRef.current!);
    if (ref.current) ref.current.style.transform = '';
  };

  return (
    <div ref={ref} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      style={{ transition: 'transform 0.15s ease-out' }}
      className={`rounded-2xl border-2 ${st.border} bg-white hover:shadow-xl transition-shadow duration-300 overflow-hidden`}>
      {/* Color stripe */}
      <div className={`h-1 w-full ${st.bg}`} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                {(quote.clientName?.[0] ?? '?').toUpperCase()}
              </div>
              <span className="font-bold text-base">{quote.clientName}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${st.bg} ${st.color}`}>{st.label}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground ml-10">
              <span>{(quote.items ?? []).length} item(s)</span>
              <span className="font-bold text-foreground">{fmt(quote.total)}</span>
              <span>{format(new Date(quote.createdAt), 'dd/MM/yyyy', { locale: ptBR })}</span>
              {quote.clientPhone && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{quote.clientPhone}</span>}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
            {quote.status === 'draft' && (
              <Button size="sm" onClick={onSend} disabled={isSending}
                className="bg-green-600 hover:bg-green-700 text-white">
                {isSending
                  ? <><span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />Enviando...</>
                  : <><MessageSquare className="h-3.5 w-3.5 mr-1" />Enviar WA</>}
              </Button>
            )}
            {['sent', 'accepted'].includes(quote.status) && (
              <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={onPay}>
                <DollarSign className="h-3.5 w-3.5 mr-1" /> Cobrar
              </Button>
            )}
            {quote.status !== 'paid' && quote.status !== 'cancelled' && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {quote.status !== 'paid' && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Items preview */}
        {(quote.items ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 ml-10">
            {(quote.items ?? []).slice(0, 3).map(item => (
              <span key={item.id} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium">
                {item.description} · {fmt(item.quantity * item.unitPrice)}
              </span>
            ))}
            {(quote.items ?? []).length > 3 && <span className="text-xs text-muted-foreground self-center">+{(quote.items ?? []).length - 3}</span>}
          </div>
        )}

        {/* Status changer for sent quotes */}
        {quote.status === 'sent' && (
          <div className="mt-3 flex gap-2 ml-10">
            <Button size="sm" variant="outline" className="text-xs h-7"
              onClick={() => onStatusChange('accepted')}>
              Marcar como aceito
            </Button>
            <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive"
              onClick={() => onStatusChange('cancelled')}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface QuotesTabProps { salonId: string; }

export const QuotesTab = ({ salonId }: QuotesTabProps) => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [paying, setPaying] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    const q = query2(collection(db, `salons/${salonId}/quotes`), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Quote));
      setLoading(false);
    }, () => setLoading(false));
  }, [salonId]);

  const filtered = useMemo(() => quotes.filter(q => {
    const ms = !search || (q.clientName ?? '').toLowerCase().includes(search.toLowerCase()) || (q.clientPhone ?? '').includes(search);
    const mst = statusFilter === 'all' || q.status === statusFilter;
    return ms && mst;
  }), [quotes, search, statusFilter]);

  const metrics = useMemo(() => ({
    total: quotes.length,
    pending: quotes.filter(q => ['sent', 'accepted'].includes(q.status)).length,
    paid: quotes.filter(q => q.status === 'paid').length,
    revenue: quotes.filter(q => q.status === 'paid').reduce((s, q) => s + (q.total ?? 0), 0),
  }), [quotes]);

  const saveQuote = async (data: Partial<Quote>) => {
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, `salons/${salonId}/quotes`, editing.id), { ...data, updatedAt: Date.now() });
        toast.success('Orçamento atualizado!');
        setEditing(null);
      } else {
        await addDoc(collection(db, `salons/${salonId}/quotes`), {
          ...data, salonId, status: 'draft', createdAt: Date.now(), updatedAt: Date.now(),
        });
        toast.success('Orçamento criado!');
        setShowForm(false);
      }
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const sendQuoteViaWhatsApp = async (quote: Quote) => {
    if (!quote.clientPhone) {
      toast.error('Cliente sem telefone. Edite o orçamento e adicione o WhatsApp.');
      return;
    }
    setSending(quote.id);
    try {
      const token = await getToken();
      const res = await fetch('/api/quotes/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
      toast.success(`Orçamento enviado para ${quote.clientName} no WhatsApp!`);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar via WhatsApp');
    } finally { setSending(null); }
  };

  const updateStatus = async (quote: Quote, status: QuoteStatus) => {
    await updateDoc(doc(db, `salons/${salonId}/quotes`, quote.id), { status, updatedAt: Date.now() });
    if (status === 'paid') { setPaying(null); toast.success('Marcado como pago!'); }
  };

  const deleteQuote = async (quote: Quote) => {
    if (!confirm(`Excluir orçamento de ${quote.clientName}?`)) return;
    await deleteDoc(doc(db, `salons/${salonId}/quotes`, quote.id));
    toast.success('Orçamento excluído.');
  };

  if (loading) return (
    <div className="py-16 text-center text-muted-foreground">
      <FileText className="mx-auto mb-3 h-8 w-8 opacity-20 animate-pulse" />
      Carregando orçamentos...
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Orçamentos
          </h2>
          <p className="text-sm text-muted-foreground">Crie, envie e cobre pacientes diretamente pelo WhatsApp.</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} size="lg">
          <Plus className="mr-1.5 h-4 w-4" /> Novo Orçamento
        </Button>
      </div>

      {/* Métricas 3D */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: metrics.total, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', icon: <FileText className="h-5 w-5" /> },
          { label: 'Pendentes', value: metrics.pending, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: <Clock className="h-5 w-5" /> },
          { label: 'Pagos', value: metrics.paid, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: <CheckCircle2 className="h-5 w-5" /> },
          { label: 'Receita', value: fmt(metrics.revenue), color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: <DollarSign className="h-5 w-5" /> },
        ].map(({ label, value, color, bg, border, icon }) => (
          <div key={label}
            className={`rounded-2xl border-2 ${border} ${bg} p-4 flex items-center gap-3 hover:shadow-md transition-shadow`}
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.8) inset' }}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} bg-white/60 shadow-sm flex-shrink-0`}>{icon}</div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-black ${color} truncate`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <FileText className="mx-auto mb-3 h-10 w-10 opacity-20" />
          <p className="font-medium">Nenhum orçamento encontrado.</p>
          <p className="text-sm mt-1">Crie um orçamento e envie diretamente pelo WhatsApp do paciente.</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Criar primeiro orçamento
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(quote => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              onSend={() => sendQuoteViaWhatsApp(quote)}
              onPay={() => setPaying(quote)}
              onEdit={() => { setEditing(quote); setShowForm(false); }}
              onDelete={() => deleteQuote(quote)}
              onStatusChange={s => updateStatus(quote, s)}
              sending={sending}
            />
          ))}
        </div>
      )}

      {/* Dialog — criar/editar */}
      <Dialog open={showForm || !!editing} onOpenChange={o => { if (!o) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Orçamento' : 'Novo Orçamento'}</DialogTitle>
          </DialogHeader>
          <QuoteForm
            initial={editing || undefined}
            onSave={saveQuote}
            onClose={() => { setShowForm(false); setEditing(null); }}
            saving={saving}
            salonId={salonId}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog — pagamento */}
      <Dialog open={!!paying} onOpenChange={o => { if (!o) setPaying(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cobrar Orçamento</DialogTitle></DialogHeader>
          {paying && (
            <PaymentModal
              quote={paying} salonId={salonId}
              onClose={() => setPaying(null)}
              onPaid={() => updateStatus(paying, 'paid')}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
