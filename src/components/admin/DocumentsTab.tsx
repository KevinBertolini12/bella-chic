import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, getDocs,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { BusinessType, MedicalDocument, DocumentType } from '../../types';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  Plus, Trash2, FileText, Printer, Copy, Search,
  PenLine, CheckCircle2, Eye, X, Sparkles, Phone,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Config ───────────────────────────────────────────────────────────────────

const DOC_TYPES: Record<DocumentType, string> = {
  prescription: 'Receituário',
  certificate:  'Atestado Médico',
  declaration:  'Declaração',
  report:       'Relatório / Laudo',
  custom:       'Documento Personalizado',
};

const DOC_ICONS: Record<DocumentType, string> = {
  prescription: '💊',
  certificate:  '📋',
  declaration:  '📝',
  report:       '🔬',
  custom:       '📄',
};

const TEMPLATES: Record<DocumentType, string> = {
  prescription: `Prescrevo ao(à) paciente {NOME}:\n\n1. _______________ - ___mg - ___ comprimido(s) - ___ vez(es) ao dia por ___ dias\n2. _______________ - ___mg - ___ comprimido(s) - ___ vez(es) ao dia por ___ dias\n\nUso: oral / externo / outro\n\nValidade: 30 dias`,
  certificate: `Atesto para os devidos fins que o(a) paciente {NOME}, portador(a) do CPF {CPF}, esteve sob meus cuidados profissionais no dia {DATA} e necessita de afastamento de suas atividades por ___ dia(s), a partir desta data.\n\nCID: ___________`,
  declaration: `Declaro que o(a) paciente {NOME}, portador(a) do CPF {CPF}, compareceu a esta clínica/consultório no dia {DATA} para atendimento das [horário] às [horário].`,
  report: `RELATÓRIO / LAUDO CLÍNICO\n\nPaciente: {NOME}\nData: {DATA}\n\nHISTÓRICO:\n_______________________________________________\n\nEXAME CLÍNICO:\n_______________________________________________\n\nDIAGNÓSTICO:\n_______________________________________________\n\nCONDUTA / TRATAMENTO PROPOSTO:\n_______________________________________________\n\nConclusão:\n_______________________________________________`,
  custom: '',
};

const fillTemplate = (template: string, clientName: string, clientCpf?: string): string => {
  const today = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
  return template
    .replace(/{NOME}/g, clientName || '[Nome do paciente]')
    .replace(/{CPF}/g, clientCpf || '[CPF]')
    .replace(/{DATA}/g, today)
    .replace(/{HORARIO}/g, '[horário]');
};

// ─── Patient Search ───────────────────────────────────────────────────────────

interface PatientSugg { name: string; phone: string; cpf?: string; source: string; }

const usePatientSearch = (salonId: string, q: string) => {
  const [results, setResults] = React.useState<PatientSugg[]>([]);
  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const all: PatientSugg[] = [];
      try {
        const cSnap = await getDocs(collection(db, `salons/${salonId}/crm_clients`));
        cSnap.docs.forEach(d => {
          const data = d.data();
          if ((data.name ?? '').toLowerCase().includes(q.toLowerCase()) || (data.phone ?? '').includes(q))
            all.push({ name: data.name, phone: data.phone ?? '', cpf: data.cpf, source: 'CRM' });
        });
        const rSnap = await getDocs(collection(db, `salons/${salonId}/client_records`));
        rSnap.docs.forEach(d => {
          const data = d.data();
          if ((data.clientName ?? '').toLowerCase().includes(q.toLowerCase()) || (data.clientPhone ?? '').includes(q))
            if (!all.find(a => a.phone === data.clientPhone))
              all.push({ name: data.clientName, phone: data.clientPhone ?? '', cpf: data.clientCpf, source: 'Prontuário' });
        });
      } catch {}
      const seen = new Set<string>();
      setResults(all.filter(a => { const k = a.phone || a.name; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5));
    }, 300);
    return () => clearTimeout(timer);
  }, [salonId, q]);
  return results;
};

const PatientSearch: React.FC<{ salonId: string; value: string; onChange: (v: string) => void; onSelect: (p: PatientSugg) => void }> = ({ salonId, value, onChange, onSelect }) => {
  const [open, setOpen] = useState(false);
  const results = usePatientSearch(salonId, value);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const SRC: Record<string, string> = { 'CRM': 'bg-violet-100 text-violet-700', 'Prontuário': 'bg-blue-100 text-blue-700' };
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => value.length >= 2 && setOpen(true)}
          placeholder="Nome ou busque nos pacientes..." className="pl-9" />
        {value && <button onClick={() => { onChange(''); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[9999] mt-1 rounded-xl border border-border bg-white shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Pacientes encontrados</p>
          </div>
          {results.map((p, i) => (
            <button key={i} onMouseDown={() => { onSelect(p); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs flex-shrink-0">
                {(p.name?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{p.name}</p>
                {p.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</p>}
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${SRC[p.source] ?? 'bg-gray-100 text-gray-600'}`}>{p.source}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Signature Pad ────────────────────────────────────────────────────────────

const SignaturePad: React.FC<{ onSave: (url: string) => void; onClear: () => void; value?: string }> = ({ onSave, onClear, value }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    setDrawing(true); lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(lastPos.current!.x, lastPos.current!.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    lastPos.current = pos; setHasSig(true);
  };

  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false); onClear();
  };

  const save = () => {
    const canvas = canvasRef.current; if (!canvas || !hasSig) return;
    onSave(canvas.toDataURL('image/png')); toast.success('Assinatura confirmada!');
  };

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">Assinatura digital registrada</span>
        </div>
        <div className="flex items-center gap-3">
          <img src={value} alt="Assinatura" className="h-10 w-auto" />
          <button onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive underline">Refazer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border-2 border-dashed border-muted bg-white overflow-hidden" style={{ touchAction: 'none' }}>
        <canvas ref={canvasRef} width={600} height={140} className="w-full cursor-crosshair" style={{ height: '140px' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={() => setDrawing(false)} onMouseLeave={() => setDrawing(false)}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={() => setDrawing(false)} />
        {!hasSig && <p className="text-center text-xs text-muted-foreground py-1.5 border-t bg-muted/20">Assine aqui com o mouse ou dedo</p>}
      </div>
      <div className="flex gap-2 items-center">
        <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground underline">Limpar</button>
        {hasSig && <Button size="sm" onClick={save} className="h-7 text-xs px-3 ml-auto"><CheckCircle2 className="h-3 w-3 mr-1" /> Confirmar</Button>}
      </div>
    </div>
  );
};

// ─── Print function ───────────────────────────────────────────────────────────

const printDocument = (
  docItem: MedicalDocument & { stampNote?: string },
  settings: any,
  withDigitalSig: boolean,
) => {
  const win = window.open('', '_blank');
  if (!win) { toast.error('Popup bloqueado. Permita popups para imprimir.'); return; }

  const logoUrl = settings?.branding?.logoURL || '';
  const salonName = settings?.branding?.name || docItem.professionalName;
  const salonPhone = settings?.business?.phone || '';
  const salonAddress = [
    settings?.business?.address, settings?.business?.number,
    settings?.business?.neighborhood, settings?.business?.city, settings?.business?.state,
  ].filter(Boolean).join(', ');

  const sigImg = withDigitalSig && docItem.signatureUrl
    ? `<img src="${docItem.signatureUrl}" style="max-height:70px;max-width:280px;display:block;margin:0 auto 4px;" />`
    : `<div style="height:56px;border-bottom:1px solid #222;width:280px;margin:0 auto 4px;"></div>`;

  const stampHtml = (docItem as any).stampNote
    ? `<div style="margin-left:24px;text-align:center;">
        <div style="border:2px solid #444;border-radius:50%;width:100px;height:100px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;font-size:9px;font-weight:bold;color:#333;padding:10px;line-height:1.3;">${(docItem as any).stampNote}</div>
        <div style="font-size:9px;color:#999;">Carimbo</div>
       </div>`
    : '';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${docItem.title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;max-width:740px;margin:0 auto;padding:32px 40px;font-size:13px;line-height:1.8;color:#111}
  .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #e11d48;padding-bottom:14px;margin-bottom:22px}
  .logo{max-height:70px;max-width:200px;object-fit:contain}
  .clinic-name{font-size:20px;font-weight:900;color:#111}
  .clinic-info{text-align:right;font-size:11px;color:#555;line-height:1.6}
  .doc-title{font-size:14px;font-weight:bold;text-align:center;text-transform:uppercase;letter-spacing:2px;margin:0 0 18px;padding:10px 20px;border:2px solid #111;border-radius:4px}
  .patient{background:#f8f8f8;border:1px solid #ddd;border-radius:6px;padding:10px 14px;margin-bottom:20px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:12px}
  .content{white-space:pre-wrap;margin:0 0 36px;font-size:13px;line-height:2.2;min-height:160px}
  .footer{display:flex;align-items:flex-end;justify-content:space-between;margin-top:40px;border-top:1px solid #eee;padding-top:20px}
  .sig-block{text-align:center;flex:1}
  .sig-name{font-size:12px;font-weight:bold;margin-top:4px}
  .sig-doc{font-size:11px;color:#555}
  .validity{font-size:9px;color:#bbb;text-align:center;margin-top:24px;padding-top:8px;border-top:1px solid #f0f0f0}
  @media print{body{padding:16px 24px}@page{margin:1.5cm}}
</style></head><body>
<div class="header">
  <div>${logoUrl ? `<img src="${logoUrl}" class="logo" alt="${salonName}">` : `<div class="clinic-name">${salonName}</div>`}</div>
  <div class="clinic-info">
    ${salonName ? `<div style="font-weight:bold;font-size:13px">${salonName}</div>` : ''}
    ${salonPhone ? `<div>Tel: ${salonPhone}</div>` : ''}
    ${salonAddress ? `<div>${salonAddress}</div>` : ''}
  </div>
</div>
<div class="doc-title">${docItem.title}</div>
<div class="patient">
  <div>Paciente: <strong>${docItem.clientName}</strong>${docItem.clientCpf ? ` &nbsp;|&nbsp; CPF: ${docItem.clientCpf}` : ''}</div>
  <div>Data: <strong>${format(new Date(docItem.createdAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</strong></div>
</div>
<div class="content">${docItem.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>
<div class="footer">
  <div class="sig-block">
    ${sigImg}
    <div class="sig-name">${docItem.professionalName}</div>
    ${docItem.professionalDocument ? `<div class="sig-doc">${docItem.professionalDocument}</div>` : ''}
  </div>
  ${stampHtml}
</div>
<div class="validity">
  Emitido em ${format(new Date(docItem.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
  ${withDigitalSig && docItem.signatureUrl ? ' · Com assinatura digital do profissional' : ' · Aguardando assinatura manual'}
</div>
</body></html>`;

  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 500);
};

// ─── Document Preview ─────────────────────────────────────────────────────────

const DocPreview: React.FC<{ docItem: MedicalDocument & { stampNote?: string }; settings: any }> = ({ docItem: d, settings }) => {
  const logoUrl = settings?.branding?.logoURL || '';
  const salonName = settings?.branding?.name || d.professionalName;
  const salonPhone = settings?.business?.phone || '';
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm font-sans text-[13px] leading-relaxed" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="flex items-start justify-between border-b-[3px] border-primary pb-4 mb-5">
        <div>
          {logoUrl ? <img src={logoUrl} alt={salonName} className="max-h-14 max-w-[180px] object-contain" /> : <p className="text-xl font-black">{salonName}</p>}
        </div>
        <div className="text-right text-xs text-muted-foreground leading-relaxed">
          {salonName && <p className="font-bold text-foreground">{salonName}</p>}
          {salonPhone && <p>Tel: {salonPhone}</p>}
        </div>
      </div>
      <div className="text-center font-bold uppercase tracking-widest text-sm border-2 border-foreground rounded py-2 px-4 mb-5">{d.title}</div>
      <div className="flex justify-between bg-muted/40 rounded-lg px-4 py-2.5 mb-5 text-xs flex-wrap gap-2">
        <span>Paciente: <strong className="text-sm">{d.clientName || '[Nome]'}</strong>{d.clientCpf ? ` | CPF: ${d.clientCpf}` : ''}</span>
        <span>Data: <strong>{format(new Date(d.createdAt), "dd/MM/yyyy", { locale: ptBR })}</strong></span>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-[13px] leading-loose min-h-[120px] mb-8">{d.content || '[Conteúdo do documento]'}</pre>
      <div className="flex justify-between items-end gap-6 mt-8 pt-4 border-t">
        <div className="flex-1 text-center">
          {d.signatureUrl
            ? <img src={d.signatureUrl} alt="Assinatura" className="max-h-12 mx-auto mb-1" />
            : <div className="h-10 border-b border-foreground/40 mb-1" />}
          <p className="text-xs font-bold">{d.professionalName}</p>
          {d.professionalDocument && <p className="text-[10px] text-muted-foreground">{d.professionalDocument}</p>}
        </div>
        {(d as any).stampNote && (
          <div className="text-center">
            <div className="h-20 w-20 rounded-full border-2 border-foreground/30 flex items-center justify-center text-[9px] text-center p-2 mx-auto text-muted-foreground leading-tight">{(d as any).stampNote}</div>
            <p className="text-[9px] text-muted-foreground mt-1">Carimbo</p>
          </div>
        )}
      </div>
      <p className="text-[9px] text-muted-foreground text-center mt-4 border-t pt-3">
        {d.signatureUrl ? '✓ Com assinatura digital' : 'Aguardando assinatura manual'}
        {' · '}Emitido em {format(new Date(d.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </p>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

interface DocumentsTabProps { salonId: string; businessType: BusinessType; }

export const DocumentsTab = ({ salonId, businessType }: DocumentsTabProps) => {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const [documents, setDocuments] = useState<(MedicalDocument & { stampNote?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<(MedicalDocument & { stampNote?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [stampNote, setStampNote] = useState('');
  const [showStamp, setShowStamp] = useState(false);

  const [form, setForm] = useState({
    clientName: '', clientCpf: '',
    professionalDocument: '',
    type: 'prescription' as DocumentType,
    title: '', content: '',
  });

  useEffect(() => {
    const q = query(collection(db, `salons/${salonId}/documents`), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as MedicalDocument & { stampNote?: string }));
      setLoading(false);
    }, () => setLoading(false));
  }, [salonId]);

  const filtered = documents.filter(d =>
    !search ||
    (d.clientName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (d.title ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleTypeChange = (type: DocumentType) => {
    const template = fillTemplate(TEMPLATES[type], form.clientName, form.clientCpf);
    setForm(f => ({ ...f, type, title: DOC_TYPES[type], content: template }));
  };

  const handleClientChange = (name: string) => {
    setForm(f => ({ ...f, clientName: name, content: fillTemplate(TEMPLATES[f.type], name, f.clientCpf) }));
  };

  const handlePatientSelect = (p: PatientSugg) => {
    setForm(f => ({
      ...f, clientName: p.name, clientCpf: p.cpf || f.clientCpf,
      content: fillTemplate(TEMPLATES[f.type], p.name, p.cpf || f.clientCpf),
    }));
    toast.success(`${p.name} preenchido automaticamente`);
  };

  const buildDocItem = (): MedicalDocument & { stampNote?: string } => ({
    id: 'preview', salonId,
    clientName: form.clientName || '[Nome do paciente]',
    clientCpf: form.clientCpf,
    professionalName: profile?.displayName || '',
    professionalDocument: form.professionalDocument,
    signatureUrl: signatureUrl || undefined,
    type: form.type,
    title: form.title || DOC_TYPES[form.type],
    content: form.content,
    stampNote: stampNote || undefined,
    createdAt: Date.now(),
  });

  const saveDocument = async () => {
    if (!form.clientName.trim() || !form.content.trim()) {
      toast.error('Preencha o nome do paciente e o conteúdo.');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/documents`), {
        salonId, clientName: form.clientName, clientCpf: form.clientCpf,
        professionalName: profile?.displayName || '',
        professionalDocument: form.professionalDocument,
        signatureUrl: signatureUrl || null,
        type: form.type,
        title: form.title || DOC_TYPES[form.type],
        content: form.content,
        stampNote: stampNote || null,
        createdAt: Date.now(),
      });
      toast.success('Documento salvo!');
      setShowForm(false); setSignatureUrl(''); setShowPreview(false);
      setStampNote(''); setShowStamp(false);
      setForm({ clientName: '', clientCpf: '', professionalDocument: '', type: 'prescription', title: '', content: '' });
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('Excluir este documento?')) return;
    await deleteDoc(doc(db, `salons/${salonId}/documents`, id));
    toast.success('Documento excluído.');
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando documentos...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {businessType === 'health' ? 'Receituário & Documentos' : 'Documentos'}
          </h2>
          <p className="text-sm text-muted-foreground">Receitas, atestados e declarações com timbrado profissional.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus className="mr-1.5 h-4 w-4" /> Novo Documento</Button>
      </div>

      {/* Info banner */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex gap-3">
        <Printer className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold">Como imprimir ou salvar como PDF</p>
          <p className="text-xs text-blue-600 mt-0.5">Clique em <strong>Imprimir / PDF</strong> — a janela de impressão abrirá. Escolha a impressora para imprimir em papel, ou selecione <strong>"Salvar como PDF"</strong> para gerar o arquivo. Se não assinou digitalmente, o documento sai com linha em branco para assinar à caneta.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por paciente ou tipo..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <FileText className="mx-auto mb-3 h-10 w-10 opacity-20" />
          <p className="font-medium">Nenhum documento emitido ainda.</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}><Plus className="mr-1.5 h-4 w-4" /> Criar primeiro documento</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => (
            <Card key={d.id} className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary" onClick={() => setViewing(d)}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-2xl flex-shrink-0">{DOC_ICONS[d.type] || '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{d.title}</p>
                      {d.signatureUrl && (
                        <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Assinado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{d.clientName} · {format(new Date(d.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => printDocument(d, settings, true)}>
                    <Printer className="h-3.5 w-3.5" /><span className="hidden sm:inline">Imprimir / PDF</span>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteDocument(d.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: Novo documento */}
      <Dialog open={showForm} onOpenChange={o => { if (!o) { setShowForm(false); setShowPreview(false); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Novo Documento</DialogTitle></DialogHeader>

          {!showPreview ? (
            <div className="space-y-4 py-2">
              {/* Paciente */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Dados do paciente</p>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">Busca automática</span>
                </div>
                <div className="space-y-1.5">
                  <Label>Nome *</Label>
                  <PatientSearch salonId={salonId} value={form.clientName} onChange={handleClientChange} onSelect={handlePatientSelect} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>CPF</Label>
                    <Input value={form.clientCpf}
                      onChange={e => setForm(f => ({ ...f, clientCpf: e.target.value, content: fillTemplate(TEMPLATES[f.type], f.clientName, e.target.value) }))}
                      placeholder="000.000.000-00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Registro profissional</Label>
                    <Input value={form.professionalDocument}
                      onChange={e => setForm(f => ({ ...f, professionalDocument: e.target.value }))}
                      placeholder="CRO-SP 12345" />
                  </div>
                </div>
              </div>

              {/* Tipo e título */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={v => handleTypeChange(v as DocumentType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{DOC_ICONS[k as DocumentType]} {v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Título</Label>
                  <Input value={form.title || DOC_TYPES[form.type]} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
              </div>

              {/* Conteúdo */}
              <div className="space-y-1.5">
                <Label>Conteúdo</Label>
                <Textarea rows={10} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} className="font-mono text-sm resize-y" />
              </div>

              {/* Assinatura */}
              <div className="space-y-2 border-t pt-4">
                <Label className="flex items-center gap-2">
                  <PenLine className="h-4 w-4" /> Assinatura Digital
                  <span className="text-xs font-normal text-muted-foreground">(opcional — ou assine à caneta após imprimir)</span>
                </Label>
                <SignaturePad value={signatureUrl} onSave={setSignatureUrl} onClear={() => setSignatureUrl('')} />
              </div>

              {/* Carimbo opcional */}
              <div className="border-t pt-4">
                <button onClick={() => setShowStamp(!showStamp)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  🔲 {showStamp ? 'Ocultar área de carimbo' : 'Adicionar espaço para carimbo (opcional)'}
                </button>
                {showStamp && (
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Texto do carimbo (aparece em círculo no impresso)</Label>
                    <Input value={stampNote} onChange={e => setStampNote(e.target.value)} placeholder="Ex: Dr. João Silva · CRO-SP 12345" />
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex flex-wrap gap-2 justify-between border-t pt-4">
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={() => setShowPreview(true)}>
                    <Eye className="mr-1.5 h-4 w-4" /> Pré-visualizar
                  </Button>
                  <Button variant="outline" onClick={() => printDocument(buildDocItem(), settings, true)}>
                    <Printer className="mr-1.5 h-4 w-4" /> Imprimir agora
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button disabled={saving} onClick={saveDocument}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">Pré-visualização</p>
                <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                  <X className="h-4 w-4 mr-1" /> Voltar
                </Button>
              </div>
              <DocPreview docItem={buildDocItem()} settings={settings} />
              <div className="flex flex-wrap gap-2 justify-between border-t pt-4">
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={() => printDocument(buildDocItem(), settings, true)}>
                    <Printer className="mr-1.5 h-4 w-4" /> Imprimir com assinatura digital
                  </Button>
                  <Button variant="outline" onClick={() => printDocument(buildDocItem(), settings, false)}>
                    <Printer className="mr-1.5 h-4 w-4" /> Imprimir sem assinatura (linha em branco)
                  </Button>
                </div>
                <Button disabled={saving} onClick={saveDocument}>{saving ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Visualizar */}
      <Dialog open={!!viewing} onOpenChange={o => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{viewing && DOC_ICONS[viewing.type]} {viewing?.title}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <DocPreview docItem={viewing} settings={settings} />
              <div className="flex flex-wrap gap-2 justify-between border-t pt-4">
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => printDocument(viewing, settings, true)}>
                    <Printer className="mr-1.5 h-4 w-4" /> Imprimir / PDF
                  </Button>
                  {!viewing.signatureUrl && (
                    <Button variant="outline" onClick={() => printDocument(viewing, settings, false)}>
                      <Printer className="mr-1.5 h-4 w-4" /> Sem assinatura digital
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(viewing.content); toast.success('Copiado!'); }}>
                    <Copy className="mr-1.5 h-4 w-4" /> Copiar texto
                  </Button>
                </div>
                <Button variant="ghost" className="text-destructive" onClick={() => { deleteDocument(viewing.id); setViewing(null); }}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
