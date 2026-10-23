import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, where,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
const _getToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve('');
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Plus, Trash2, Edit2, Link2, Copy, CheckCircle2,
  ClipboardList, ChevronDown, ChevronUp, Send, Eye,
  FileText, User, Clock, MessageSquare, Phone, X, PenLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'yesno';

export interface AnamneseField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];     // para select
  placeholder?: string;
}

export interface AnamneseTemplate {
  id: string;
  salonId: string;
  name: string;
  description?: string;
  fields: AnamneseField[];
  createdAt: number;
  updatedAt: number;
  active: boolean;
}

export interface AnamneseResponse {
  id: string;
  salonId: string;
  templateId: string;
  templateName: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  answers: Record<string, string | boolean | string[]>;
  submittedAt: number;
  linkedRecordId?: string;  // id do prontuário onde foi vinculado
  status: 'pending' | 'reviewed';
}

// ─── Templates pré-prontos ────────────────────────────────────────────────────

const PRESET_TEMPLATES: Omit<AnamneseTemplate, 'id' | 'salonId' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Anamnese Geral (Saúde)',
    description: 'Ficha padrão para clínicas e consultórios',
    active: true,
    fields: [
      { id: 'f1', label: 'Nome completo', type: 'text', required: true, placeholder: 'Seu nome completo' },
      { id: 'f2', label: 'Data de nascimento', type: 'date', required: true },
      { id: 'f3', label: 'Motivo da consulta', type: 'textarea', required: true, placeholder: 'Descreva o motivo da sua consulta...' },
      { id: 'f4', label: 'Tem alguma doença crônica?', type: 'yesno', required: true },
      { id: 'f5', label: 'Quais doenças (se sim)?', type: 'textarea', required: false, placeholder: 'Diabetes, hipertensão, etc.' },
      { id: 'f6', label: 'Está tomando algum medicamento?', type: 'yesno', required: true },
      { id: 'f7', label: 'Quais medicamentos?', type: 'textarea', required: false, placeholder: 'Nome, dosagem e frequência...' },
      { id: 'f8', label: 'Tem alguma alergia?', type: 'yesno', required: true },
      { id: 'f9', label: 'Descreva as alergias', type: 'textarea', required: false, placeholder: 'Alergias a medicamentos, alimentos, etc.' },
      { id: 'f10', label: 'Realizou alguma cirurgia?', type: 'yesno', required: false },
      { id: 'f11', label: 'É fumante?', type: 'yesno', required: false },
      { id: 'f12', label: 'Consome bebida alcoólica?', type: 'select', required: false, options: ['Não', 'Raramente', 'Socialmente', 'Frequentemente'] },
      { id: 'f13', label: 'Observações adicionais', type: 'textarea', required: false, placeholder: 'Alguma informação relevante que queira acrescentar...' },
    ],
  },
  {
    name: 'Anamnese Odontológica',
    description: 'Ficha específica para dentistas',
    active: true,
    fields: [
      { id: 'f1', label: 'Nome completo', type: 'text', required: true },
      { id: 'f2', label: 'Data de nascimento', type: 'date', required: true },
      { id: 'f3', label: 'Motivo da consulta', type: 'textarea', required: true, placeholder: 'Dor, revisão, limpeza, estética...' },
      { id: 'f4', label: 'Está com dor?', type: 'yesno', required: true },
      { id: 'f5', label: 'Tem medo de dentista?', type: 'yesno', required: false },
      { id: 'f6', label: 'Tem alguma doença cardíaca?', type: 'yesno', required: true },
      { id: 'f7', label: 'Tem diabetes?', type: 'yesno', required: true },
      { id: 'f8', label: 'Tem hipertensão?', type: 'yesno', required: true },
      { id: 'f9', label: 'Está grávida ou amamentando?', type: 'yesno', required: false },
      { id: 'f10', label: 'É alérgico a algum anestésico?', type: 'yesno', required: true },
      { id: 'f11', label: 'Está tomando anticoagulante?', type: 'yesno', required: true },
      { id: 'f12', label: 'Medicamentos em uso', type: 'textarea', required: false, placeholder: 'Liste todos os medicamentos...' },
      { id: 'f13', label: 'Última visita ao dentista', type: 'select', required: false, options: ['Menos de 6 meses', '6 a 12 meses', '1 a 2 anos', 'Mais de 2 anos', 'Nunca fui'] },
    ],
  },
  {
    name: 'Anamnese Estética / Beleza',
    description: 'Ficha para procedimentos estéticos',
    active: true,
    fields: [
      { id: 'f1', label: 'Nome completo', type: 'text', required: true },
      { id: 'f2', label: 'Procedimento desejado', type: 'text', required: true, placeholder: 'Ex: botox, preenchimento, limpeza de pele...' },
      { id: 'f3', label: 'Já realizou esse procedimento antes?', type: 'yesno', required: true },
      { id: 'f4', label: 'Tem pele sensível?', type: 'yesno', required: false },
      { id: 'f5', label: 'Tem alguma alergia cosmética?', type: 'yesno', required: true },
      { id: 'f6', label: 'Quais produtos costuma usar na pele?', type: 'textarea', required: false },
      { id: 'f7', label: 'Está gestante ou amamentando?', type: 'yesno', required: true },
      { id: 'f8', label: 'Faz uso de isotretinoína (Roacutan)?', type: 'yesno', required: true },
      { id: 'f9', label: 'Tem histórico de quelóide?', type: 'yesno', required: false },
      { id: 'f10', label: 'Expectativas com o tratamento', type: 'textarea', required: true, placeholder: 'O que espera alcançar com este procedimento?' },
    ],
  },
  {
    name: 'Anamnese Fisioterapia / Personal',
    description: 'Ficha para fisioterapeutas e personal trainers',
    active: true,
    fields: [
      { id: 'f1', label: 'Nome completo', type: 'text', required: true },
      { id: 'f2', label: 'Objetivo principal', type: 'select', required: true, options: ['Reabilitação', 'Emagrecimento', 'Ganho de massa', 'Condicionamento', 'Saúde geral'] },
      { id: 'f3', label: 'Pratica atividade física atualmente?', type: 'yesno', required: true },
      { id: 'f4', label: 'Qual atividade e frequência?', type: 'text', required: false },
      { id: 'f5', label: 'Tem alguma lesão ou limitação física?', type: 'yesno', required: true },
      { id: 'f6', label: 'Descreva a lesão/limitação', type: 'textarea', required: false },
      { id: 'f7', label: 'Já fez cirurgia ortopédica?', type: 'yesno', required: false },
      { id: 'f8', label: 'Tem alguma doença cardiovascular?', type: 'yesno', required: true },
      { id: 'f9', label: 'Nível de condicionamento atual', type: 'select', required: false, options: ['Sedentário', 'Pouco ativo', 'Moderadamente ativo', 'Ativo', 'Muito ativo'] },
      { id: 'f10', label: 'Observações adicionais', type: 'textarea', required: false },
    ],
  },
  {
    name: 'Design de Sobrancelha',
    description: 'Ficha para designers de sobrancelha',
    active: true,
    fields: [
      { id: 'f1', label: 'Nome completo', type: 'text', required: true },
      { id: 'f2', label: 'Data de nascimento', type: 'date', required: false },
      { id: 'f3', label: 'Procedimento desejado', type: 'select', required: true, options: ['Micropigmentação', 'Fio a fio', 'Henna', 'Design simples', 'Laminação de sobrancelhas'] },
      { id: 'f4', label: 'Já fez micropigmentação antes?', type: 'yesno', required: true },
      { id: 'f5', label: 'Está em tratamento com Roacutan ou ácido retinoico?', type: 'yesno', required: true },
      { id: 'f6', label: 'Tem pele oleosa?', type: 'yesno', required: false },
      { id: 'f7', label: 'Tem histórico de quelóide ou cicatriz hipertrófica?', type: 'yesno', required: true },
      { id: 'f8', label: 'Tem alergia a pigmentos ou tintas?', type: 'yesno', required: true },
      { id: 'f9', label: 'Está gestante ou amamentando?', type: 'yesno', required: true },
      { id: 'f10', label: 'Está em período menstrual? (pode aumentar sensibilidade)', type: 'yesno', required: false },
      { id: 'f11', label: 'Usa algum medicamento anticoagulante?', type: 'yesno', required: true },
      { id: 'f12', label: 'Formato de sobrancelha desejado', type: 'select', required: false, options: ['Natural', 'Marcado', 'Arqueado', 'Reto', 'Seguir o natural'] },
      { id: 'f13', label: 'Observações ou referências de sobrancelha', type: 'textarea', required: false, placeholder: 'Descreva ou mencione referências visuais...' },
    ],
  },
  {
    name: 'Extensão de Cílios / Lash Designer',
    description: 'Ficha completa para extensão e design de cílios',
    active: true,
    fields: [
      { id: 'f1', label: 'Nome completo', type: 'text', required: true },
      { id: 'f2', label: 'Procedimento', type: 'select', required: true, options: ['Extensão fio a fio', 'Volume russo', 'Volume megavolume', 'Lifting de cílios', 'Laminação de cílios', 'Manutenção'] },
      { id: 'f3', label: 'Já fez extensão de cílios antes?', type: 'yesno', required: true },
      { id: 'f4', label: 'Tem alergia a cola de cílios ou látex?', type: 'yesno', required: true },
      { id: 'f5', label: 'Tem olhos sensíveis ou síndrome do olho seco?', type: 'yesno', required: true },
      { id: 'f6', label: 'Usa lentes de contato?', type: 'yesno', required: false },
      { id: 'f7', label: 'Está gestante ou amamentando?', type: 'yesno', required: false },
      { id: 'f8', label: 'Curvatura preferida', type: 'select', required: false, options: ['J (natural)', 'B (suave)', 'C (mais curvado)', 'CC (intenso)', 'D (dramático)', 'Não sei — me ajude a escolher'] },
      { id: 'f9', label: 'Espessura preferida', type: 'select', required: false, options: ['Ultra fina (0.05)', 'Fina (0.07)', 'Média (0.10)', 'Grossa (0.12/0.15)', 'Não sei'] },
      { id: 'f10', label: 'Comprimento preferido', type: 'select', required: false, options: ['Natural (8-10mm)', 'Médio (10-12mm)', 'Longo (12-14mm)', 'Extra longo (14mm+)', 'Seguir o natural'] },
      { id: 'f11', label: 'Tem fobia a agulhas ou procedimentos nos olhos?', type: 'yesno', required: false },
      { id: 'f12', label: 'Observações e preferências de resultado', type: 'textarea', required: false, placeholder: 'Resultado natural, sexy, cat eye, fox eye...' },
    ],
  },
];

// ─── Formulário público (preenchido pelo paciente) ────────────────────────────

// ─── Signature Canvas (reutilizável) ─────────────────────────────────────────
const SigCanvas: React.FC<{ onSave: (url: string) => void; value?: string }> = ({ onSave, value }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = React.useState(false);
  const [hasSig, setHasSig] = React.useState(false);
  const last = React.useRef<{x:number;y:number}|null>(null);

  const pos = (e: React.MouseEvent|React.TouchEvent, cv: HTMLCanvasElement) => {
    const r = cv.getBoundingClientRect();
    const sx = cv.width/r.width, sy = cv.height/r.height;
    if ('touches' in e) return { x:(e.touches[0].clientX-r.left)*sx, y:(e.touches[0].clientY-r.top)*sy };
    return { x:(e.clientX-r.left)*sx, y:(e.clientY-r.top)*sy };
  };

  const start = (e: React.MouseEvent|React.TouchEvent) => { e.preventDefault(); const cv=canvasRef.current; if(!cv)return; setDrawing(true); last.current=pos(e,cv); };
  const move = (e: React.MouseEvent|React.TouchEvent) => {
    e.preventDefault(); if(!drawing)return;
    const cv=canvasRef.current; if(!cv)return;
    const ctx=cv.getContext('2d'); if(!ctx)return;
    const p=pos(e,cv);
    ctx.beginPath(); ctx.moveTo(last.current!.x,last.current!.y); ctx.lineTo(p.x,p.y);
    ctx.strokeStyle='#1e293b'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.stroke();
    last.current=p; setHasSig(true); onSave(cv.toDataURL('image/png'));
  };
  const stop = () => setDrawing(false);
  const clear = () => { canvasRef.current?.getContext('2d')?.clearRect(0,0,600,120); setHasSig(false); onSave(''); };

  if (value && !hasSig) return (
    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
      <div className="flex-1"><p className="text-sm font-medium text-green-700">Assinatura registrada</p><img src={value} alt="Assinatura" className="h-10 mt-1" /></div>
      <button onClick={clear} className="text-xs text-muted-foreground underline">Refazer</button>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="rounded-xl border-2 border-dashed border-muted overflow-hidden" style={{touchAction:'none'}}>
        <canvas ref={canvasRef} width={560} height={120} className="w-full cursor-crosshair" style={{height:'120px'}}
          onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={move} onTouchEnd={stop} />
        {!hasSig && <p className="text-center text-xs text-muted-foreground py-1.5 border-t bg-muted/20">Assine com o dedo ou mouse</p>}
      </div>
      {hasSig && <button onClick={clear} className="text-xs text-muted-foreground underline">Limpar</button>}
    </div>
  );
};

export const AnamnesePublicForm = ({ salonId, templateId }: { salonId: string; templateId: string }) => {
  const [template, setTemplate] = useState<AnamneseTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean | string[]>>({});
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `salons/${salonId}/anamnese_templates`, templateId), snap => {
      if (snap.exists()) setTemplate({ id: snap.id, ...snap.data() } as AnamneseTemplate);
      setLoading(false);
    });
    return unsub;
  }, [salonId, templateId]);

  const submit = async () => {
    if (!clientName.trim()) { toast.error('Informe seu nome.'); return; }
    if (!template) return;

    const missing = template.fields.filter(f => f.required && !answers[f.id] && answers[f.id] !== false);
    if (missing.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/anamnese_responses`), {
        salonId, templateId, templateName: template.name,
        clientName, clientPhone, clientEmail,
        answers, submittedAt: Date.now(), status: 'pending',
      });

      // Sincroniza automaticamente com o CRM pelo telefone (chave universal)
      if (clientPhone) {
        const birthdate = Object.entries(answers).find(([, v]) =>
          typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v as string)
        )?.[1] as string | undefined;

        const allergiesEntry = Object.entries(answers).find(([, v]) =>
          typeof v === 'string' && (v as string).length > 3
        );

        fetch('/api/client/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            salonId,
            phone: clientPhone,
            name: clientName,
            email: clientEmail || undefined,
            birthdate: birthdate || undefined,
            source: 'anamnese',
          }),
        }).catch(() => {});
      }

      setSubmitted(true);
    } catch { toast.error('Erro ao enviar. Tente novamente.'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!template) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Formulário não encontrado.</div>;

  if (submitted) return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Enviado com sucesso!</h2>
        <p className="text-muted-foreground">Suas informações foram registradas. O profissional terá acesso antes da sua consulta.</p>
        <p className="mt-4 text-sm text-muted-foreground">Pode fechar esta janela.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <ClipboardList className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{template.name}</h1>
              {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3 border-t pt-3">
            Por favor, preencha este formulário antes da sua consulta. Suas informações são confidenciais e seguras.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4 mb-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Seus dados</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Seu nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="seu@email.com" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5 mb-6">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Perguntas</h3>
          {template.fields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <Label className="text-sm">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {field.type === 'text' && (
                <Input
                  placeholder={field.placeholder}
                  value={(answers[field.id] as string) || ''}
                  onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                />
              )}
              {field.type === 'textarea' && (
                <Textarea
                  placeholder={field.placeholder}
                  rows={3}
                  value={(answers[field.id] as string) || ''}
                  onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                />
              )}
              {field.type === 'date' && (
                <Input
                  type="date"
                  value={(answers[field.id] as string) || ''}
                  onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                />
              )}
              {field.type === 'yesno' && (
                <div className="flex gap-3">
                  {['Sim', 'Não'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswers(a => ({ ...a, [field.id]: opt }))}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        answers[field.id] === opt
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              {field.type === 'select' && field.options && (
                <Select
                  value={(answers[field.id] as string) || ''}
                  onValueChange={v => setAnswers(a => ({ ...a, [field.id]: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {field.options.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>

        {/* Assinatura Digital do Paciente */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
            <PenLine className="inline h-4 w-4 mr-1" />Assinatura
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Ao assinar, confirmo que as informações são verdadeiras.</p>
          <SigCanvas value={answers['__sig__'] as string|undefined}
            onSave={sig => setAnswers(a => ({ ...a, __sig__: sig }))} />
        </div>

        <Button className="w-full h-12 text-base" disabled={submitting} onClick={submit}>
          {submitting ? 'Enviando...' : 'Enviar Anamnese'}
          <Send className="ml-2 h-4 w-4" />
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-3">
          Seus dados são protegidos e usados apenas pelo profissional de saúde.
        </p>
      </div>
    </div>
  );
};

// ─── Componente principal (painel admin) ──────────────────────────────────────

interface AnamneseTabProps {
  salonId: string;
}

const emptyField = (): AnamneseField => ({
  id: Date.now().toString(),
  label: '',
  type: 'text',
  required: false,
  placeholder: '',
  options: [],
});

export const AnamneseTab = ({ salonId }: AnamneseTabProps) => {
  const [templates, setTemplates] = useState<AnamneseTemplate[]>([]);
  const [responses, setResponses] = useState<AnamneseResponse[]>([]);
  const [sendModal, setSendModal] = useState<string|null>(null); // templateId
  const [sendPhone, setSendPhone] = useState('');
  const [sendName, setSendName] = useState('');
  const [sendingLink, setSendingLink] = useState(false);

  const sendToPatient = async (templateId: string) => {
    if (!sendPhone.trim()) { toast.error('Informe o telefone'); return; }
    setSendingLink(true);
    try {
      const token = await _getToken();
      const r = await fetch('/api/anamnese/send-patient-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateId, clientPhone: sendPhone, clientName: sendName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(`📲 Link enviado para ${sendPhone}!`);
      setSendModal(null); setSendPhone(''); setSendName('');
    } catch (e: any) { toast.error(e.message || 'Erro ao enviar'); }
    setSendingLink(false);
  };
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'templates' | 'responses'>('templates');
  const [editingTemplate, setEditingTemplate] = useState<AnamneseTemplate | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<AnamneseResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFields, setFormFields] = useState<AnamneseField[]>([]);

  useEffect(() => {
    const q1 = query(collection(db, `salons/${salonId}/anamnese_templates`), orderBy('createdAt', 'desc'));
    const q2 = query(collection(db, `salons/${salonId}/anamnese_responses`), orderBy('submittedAt', 'desc'));
    const u1 = onSnapshot(q1, snap => { setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AnamneseTemplate)); setLoading(false); });
    const u2 = onSnapshot(q2, snap => setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AnamneseResponse)));
    return () => { u1(); u2(); };
  }, [salonId]);

  const openNew = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormDesc('');
    setFormFields([emptyField()]);
    setShowTemplateForm(true);
  };

  const openEdit = (t: AnamneseTemplate) => {
    setEditingTemplate(t);
    setFormName(t.name);
    setFormDesc(t.description || '');
    setFormFields([...t.fields]);
    setShowTemplateForm(true);
  };

  const usePreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setEditingTemplate(null);
    setFormName(preset.name);
    setFormDesc(preset.description || '');
    setFormFields(preset.fields.map(f => ({ ...f })));
    setShowTemplateForm(true);
  };

  const saveTemplate = async () => {
    if (!formName.trim()) { toast.error('Dê um nome ao formulário.'); return; }
    const invalidFields = formFields.filter(f => !f.label.trim());
    if (invalidFields.length > 0) { toast.error('Preencha o rótulo de todos os campos.'); return; }
    setSaving(true);
    try {
      const data = { salonId, name: formName, description: formDesc, fields: formFields, active: true, updatedAt: Date.now() };
      if (editingTemplate) {
        await updateDoc(doc(db, `salons/${salonId}/anamnese_templates`, editingTemplate.id), data);
        toast.success('Formulário atualizado!');
      } else {
        await addDoc(collection(db, `salons/${salonId}/anamnese_templates`), { ...data, createdAt: Date.now() });
        toast.success('Formulário criado!');
      }
      setShowTemplateForm(false);
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const deleteTemplate = async (t: AnamneseTemplate) => {
    if (!confirm(`Excluir "${t.name}"?`)) return;
    await deleteDoc(doc(db, `salons/${salonId}/anamnese_templates`, t.id));
    toast.success('Formulário excluído.');
  };

  const copyLink = (templateId: string) => {
    const link = `${window.location.origin}/anamnese/${salonId}/${templateId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(templateId);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const markReviewed = async (r: AnamneseResponse) => {
    await updateDoc(doc(db, `salons/${salonId}/anamnese_responses`, r.id), { status: 'reviewed' });
    toast.success('Marcado como revisado.');
  };

  const addField = () => setFormFields(f => [...f, emptyField()]);
  const removeField = (id: string) => setFormFields(f => f.filter(x => x.id !== id));
  const updateField = (id: string, patch: Partial<AnamneseField>) =>
    setFormFields(f => f.map(x => x.id === id ? { ...x, ...patch } : x));
  const moveField = (idx: number, dir: -1 | 1) => {
    const arr = [...formFields];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setFormFields(arr);
  };

  const pendingCount = responses.filter(r => r.status === 'pending').length;

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando anamneses...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" /> Anamnese Digital
          </h2>
          <p className="text-sm text-muted-foreground">
            Crie formulários personalizados e envie o link para o paciente preencher antes da consulta.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" /> Novo Formulário</Button>
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="templates">Formulários ({templates.length})</TabsTrigger>
          <TabsTrigger value="responses" className="relative">
            Respostas ({responses.length})
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Formulários ── */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          {templates.length === 0 && (
            <div className="py-10 text-center">
              <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground mb-4">Nenhum formulário criado ainda.</p>
              <p className="text-sm text-muted-foreground mb-6">Use um dos modelos prontos:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto text-left">
                {PRESET_TEMPLATES.map(p => (
                  <button key={p.name} onClick={() => usePreset(p)}
                    className="rounded-xl border-2 border-dashed border-muted p-4 hover:border-primary hover:bg-primary/5 transition-all text-left">
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    <p className="text-xs text-primary mt-1">{p.fields.length} perguntas</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {templates.length > 0 && (
            <>
              {/* Modelos prontos como atalho */}
              <div className="rounded-xl border border-dashed p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Usar modelo pronto:</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TEMPLATES.map(p => (
                    <button key={p.name} onClick={() => usePreset(p)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
                      + {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map(t => {
                  const templateResponses = responses.filter(r => r.templateId === t.id);
                  const pending = templateResponses.filter(r => r.status === 'pending').length;
                  return (
                    <Card key={t.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{t.name}</p>
                            {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs text-muted-foreground">{t.fields.length} perguntas</span>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">{templateResponses.length} resposta(s)</span>
                              {pending > 0 && (
                                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{pending} nova(s)</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => copyLink(t.id)}>
                            {copiedId === t.id ? <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-600" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                            {copiedId === t.id ? 'Copiado!' : 'Copiar Link'}
                          </Button>
                          <Button size="sm" variant="outline"
                            className="flex-1 text-green-700 border-green-200 hover:bg-green-50"
                            onClick={() => setSendModal(t.id)}>
                            <MessageSquare className="h-3.5 w-3.5 mr-1" /> Enviar ao Paciente
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(t)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteTemplate(t)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Respostas ── */}
        <TabsContent value="responses" className="space-y-3 mt-4">
          {responses.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 h-10 w-10 opacity-20" />
              <p>Nenhuma resposta recebida ainda.</p>
              <p className="text-sm mt-1">Copie o link de um formulário e envie para seus pacientes.</p>
            </div>
          ) : (
            responses.map(r => (
              <Card key={r.id} className={`cursor-pointer hover:shadow-md transition-shadow ${r.status === 'pending' ? 'border-blue-200' : ''}`}
                onClick={() => setSelectedResponse(r)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{r.clientName}</span>
                        <Badge variant={r.status === 'pending' ? 'default' : 'secondary'} className="text-[10px]">
                          {r.status === 'pending' ? '🔵 Nova' : '✅ Revisada'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.templateName}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(r.submittedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {r.clientPhone && <> · <span>{r.clientPhone}</span></>}
                      </div>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: criar/editar template ── */}
      <Dialog open={showTemplateForm} onOpenChange={o => { if (!o) setShowTemplateForm(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Editar Formulário' : 'Novo Formulário de Anamnese'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome do formulário *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Anamnese Odontológica" />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Descrição curta..." />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Campos do formulário</Label>
                <Button size="sm" variant="outline" onClick={addField}><Plus className="h-3.5 w-3.5 mr-1" /> Campo</Button>
              </div>

              {formFields.map((field, idx) => (
                <div key={field.id} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <button onClick={() => moveField(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => moveField(idx, 1)} disabled={idx === formFields.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Input
                      className="h-8 text-sm flex-1"
                      value={field.label}
                      onChange={e => updateField(field.id, { label: e.target.value })}
                      placeholder="Rótulo da pergunta *"
                    />
                    <Select value={field.type} onValueChange={v => updateField(field.id, { type: v as FieldType })}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Texto curto</SelectItem>
                        <SelectItem value="textarea">Texto longo</SelectItem>
                        <SelectItem value="yesno">Sim / Não</SelectItem>
                        <SelectItem value="select">Lista</SelectItem>
                        <SelectItem value="date">Data</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer">
                      <input type="checkbox" checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} />
                      Obrig.
                    </label>
                    <button onClick={() => removeField(field.id)} className="text-destructive hover:opacity-70">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {field.type === 'select' && (
                    <Input
                      className="h-7 text-xs"
                      value={(field.options || []).join(', ')}
                      onChange={e => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="Opções separadas por vírgula: Sim, Não, Talvez"
                    />
                  )}
                  {(field.type === 'text' || field.type === 'textarea') && (
                    <Input
                      className="h-7 text-xs"
                      value={field.placeholder || ''}
                      onChange={e => updateField(field.id, { placeholder: e.target.value })}
                      placeholder="Texto de exemplo (opcional)"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setShowTemplateForm(false)}>Cancelar</Button>
              <Button disabled={saving} onClick={saveTemplate}>{saving ? 'Salvando...' : 'Salvar Formulário'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: ver resposta ── */}
      <Dialog open={!!selectedResponse} onOpenChange={o => { if (!o) setSelectedResponse(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="sr-only">Resposta do Anamnese</DialogTitle></DialogHeader>
          {selectedResponse && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold">{selectedResponse.clientName}</h2>
                  <p className="text-sm text-muted-foreground">{selectedResponse.templateName}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(selectedResponse.submittedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <Badge variant={selectedResponse.status === 'pending' ? 'default' : 'secondary'}>
                  {selectedResponse.status === 'pending' ? 'Nova' : 'Revisada'}
                </Badge>
              </div>

              {(selectedResponse.clientPhone || selectedResponse.clientEmail) && (
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  {selectedResponse.clientPhone && <p><span className="font-medium">Telefone:</span> {selectedResponse.clientPhone}</p>}
                  {selectedResponse.clientEmail && <p><span className="font-medium">E-mail:</span> {selectedResponse.clientEmail}</p>}
                </div>
              )}

              <div className="space-y-3">
                {Object.entries(selectedResponse.answers).map(([fieldId, value]) => {
                  // Find field label from template
                  const tpl = templates.find(t => t.id === selectedResponse.templateId);
                  const field = tpl?.fields.find(f => f.id === fieldId);
                  if (!field) return null;
                  return (
                    <div key={fieldId} className="border-b pb-3 last:border-0">
                      <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
                      <p className="text-sm mt-0.5">{String(value) || '—'}</p>
                    </div>
                  );
                })}
              </div>

              {selectedResponse.status === 'pending' && (
                <Button className="w-full" onClick={() => { markReviewed(selectedResponse); setSelectedResponse(null); }}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como Revisado
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
      {/* Dialog: Enviar link de anamnese ao paciente */}
      <Dialog open={!!sendModal} onOpenChange={o => { if (!o) { setSendModal(null); setSendPhone(''); setSendName(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-green-600" /> Enviar Anamnese ao Paciente</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">O paciente receberá o link pelo WhatsApp para preencher antes da consulta.</p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome do paciente</label>
              <input value={sendName} onChange={e => setSendName(e.target.value)} placeholder="Nome completo (opcional)"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">WhatsApp *</label>
              <input value={sendPhone} onChange={e => setSendPhone(e.target.value)} placeholder="5511999999999"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setSendModal(null)} className="flex-1 bg-muted rounded-xl py-2.5 text-sm font-semibold">Cancelar</button>
              <button onClick={() => sendModal && sendToPatient(sendModal)} disabled={sendingLink || !sendPhone}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {sendingLink ? 'Enviando...' : '📲 Enviar Link'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

};