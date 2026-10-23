import React, { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, where, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Plus, Trash2, Camera, ArrowLeftRight, Search,
  Calendar, User, Upload, X, Eye, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhotoRecord {
  id: string;
  salonId: string;
  clientName: string;
  clientId?: string;
  professionalName?: string;
  procedure: string;
  notes?: string;
  date: string;           // YYYY-MM-DD
  beforeUrl: string;      // base64 ou URL
  afterUrl?: string;      // pode ser adicionado depois
  createdAt: number;
  updatedAt: number;
}

// ─── Upload de imagem (base64 para Firebase) ──────────────────────────────────

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const resizeImage = async (file: File, maxWidth = 1200): Promise<string> => {
  const base64 = await toBase64(file);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = base64;
  });
};

// ─── Componente de upload de foto ─────────────────────────────────────────────

const PhotoUpload = ({
  label, value, onChange, disabled,
}: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Imagem muito grande. Máximo 10MB.'); return; }
    setUploading(true);
    try {
      const resized = await resizeImage(file);
      onChange(resized);
    } catch { toast.error('Erro ao processar imagem.'); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {value ? (
        <div className="relative group">
          <img src={value} alt={label} className="w-full h-48 object-cover rounded-xl border" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-xl flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-full bg-white p-2 shadow-lg hover:bg-gray-100"
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                className="rounded-full bg-white p-2 shadow-lg hover:bg-gray-100 text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full h-48 rounded-xl border-2 border-dashed border-muted hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground disabled:opacity-50"
        >
          {uploading ? (
            <div className="animate-spin h-6 w-6 rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <>
              <Upload className="h-8 w-8 opacity-40" />
              <span className="text-sm font-medium">Clique para enviar foto</span>
              <span className="text-xs">JPG, PNG, WEBP — máx. 10MB</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
};

// ─── Comparador lado a lado ───────────────────────────────────────────────────

const BeforeAfterCompare = ({ record }: { record: PhotoRecord }) => {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!record.afterUrl) {
    return (
      <div className="relative">
        <img src={record.beforeUrl} alt="Antes" className="w-full rounded-xl max-h-96 object-contain bg-black/5" />
        <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white font-medium">Antes</div>
      </div>
    );
  }

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pos);
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none overflow-hidden rounded-xl cursor-col-resize"
      style={{ userSelect: 'none' }}
      onMouseMove={e => { if (e.buttons === 1) handleMove(e.clientX); }}
      onTouchMove={e => handleMove(e.touches[0].clientX)}
    >
      {/* Depois (fundo) */}
      <img src={record.afterUrl} alt="Depois" className="w-full max-h-96 object-contain" />
      {/* Antes (clipado) */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
        <img src={record.beforeUrl} alt="Antes" className="w-full max-h-96 object-contain" />
      </div>
      {/* Slider */}
      <div className="absolute top-0 bottom-0" style={{ left: `${sliderPos}%` }}>
        <div className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-lg" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
        </div>
      </div>
      {/* Labels */}
      <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white font-medium">Antes</div>
      <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white font-medium">Depois</div>
      <p className="absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white">
        ← Arraste →
      </p>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

interface BeforeAfterTabProps {
  salonId: string;
}

export const BeforeAfterTab = ({ salonId }: BeforeAfterTabProps) => {
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PhotoRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAfter, setEditingAfter] = useState<PhotoRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formClient, setFormClient] = useState('');
  const [formProcedure, setFormProcedure] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');
  const [formBefore, setFormBefore] = useState('');
  const [formAfter, setFormAfter] = useState('');
  const [afterUrl, setAfterUrl] = useState('');

  useEffect(() => {
    const q = query(collection(db, `salons/${salonId}/photo_records`), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PhotoRecord));
      setLoading(false);
    }, () => setLoading(false));
  }, [salonId]);

  const filtered = photos.filter(p =>
    !search ||
    p.clientName.toLowerCase().includes(search.toLowerCase()) ||
    p.procedure.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setFormClient(''); setFormProcedure(''); setFormNotes('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormBefore(''); setFormAfter('');
  };

  const savePhoto = async () => {
    if (!formClient.trim()) { toast.error('Informe o nome do paciente.'); return; }
    if (!formProcedure.trim()) { toast.error('Informe o procedimento.'); return; }
    if (!formBefore) { toast.error('Adicione a foto "Antes".'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, `salons/${salonId}/photo_records`), {
        salonId, clientName: formClient, procedure: formProcedure,
        notes: formNotes, date: formDate,
        beforeUrl: formBefore, afterUrl: formAfter || undefined,
        professionalName: profile?.displayName || '',
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      toast.success('Foto registrada!');
      resetForm();
      setShowForm(false);
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const saveAfter = async () => {
    if (!editingAfter || !afterUrl) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, `salons/${salonId}/photo_records`, editingAfter.id), {
        afterUrl, updatedAt: Date.now(),
      });
      toast.success('Foto "Depois" adicionada!');
      setEditingAfter(null);
      setAfterUrl('');
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const deletePhoto = async (p: PhotoRecord) => {
    if (!confirm(`Excluir fotos de ${p.clientName}?`)) return;
    await deleteDoc(doc(db, `salons/${salonId}/photo_records`, p.id));
    if (selected?.id === p.id) setSelected(null);
    toast.success('Fotos excluídas.');
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando fotos...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Camera className="h-5 w-5 text-purple-600" /> Fotos Antes & Depois
          </h2>
          <p className="text-sm text-muted-foreground">
            Documente a evolução dos tratamentos com comparação visual lado a lado.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Novo Registro
        </Button>
      </div>

      {photos.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por paciente ou procedimento..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Camera className="mx-auto mb-3 h-12 w-12 opacity-20" />
          <p className="font-medium">Nenhuma foto registrada ainda.</p>
          <p className="text-sm mt-1">Registre fotos antes e depois dos procedimentos para acompanhar a evolução.</p>
          <Button className="mt-4" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Registrar primeira foto
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => (
            <Card key={p.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelected(p)}>
              <div className="relative h-40 bg-muted/20">
                {p.afterUrl ? (
                  <div className="flex h-full">
                    <div className="flex-1 relative overflow-hidden">
                      <img src={p.beforeUrl} alt="Antes" className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-medium">Antes</div>
                    </div>
                    <div className="w-px bg-white" />
                    <div className="flex-1 relative overflow-hidden">
                      <img src={p.afterUrl} alt="Depois" className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-medium">Depois</div>
                    </div>
                  </div>
                ) : (
                  <div className="relative h-full">
                    <img src={p.beforeUrl} alt="Antes" className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-medium">Antes</div>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingAfter(p); setAfterUrl(''); }}
                      className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group"
                    >
                      <span className="opacity-0 group-hover:opacity-100 rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-lg">
                        + Adicionar "Depois"
                      </span>
                    </button>
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{p.clientName}</p>
                    <p className="text-xs text-muted-foreground">{p.procedure}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(p.date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deletePhoto(p); }}
                    className="text-muted-foreground hover:text-destructive p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog — novo registro */}
      <Dialog open={showForm} onOpenChange={o => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Registro de Fotos</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome do paciente *</Label>
                <Input value={formClient} onChange={e => setFormClient(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label>Procedimento *</Label>
                <Input value={formProcedure} onChange={e => setFormProcedure(e.target.value)} placeholder="Ex: Botox, Limpeza de pele..." />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notas (opcional)</Label>
                <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Observações..." />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PhotoUpload label="📷 Foto ANTES *" value={formBefore} onChange={setFormBefore} />
              <PhotoUpload label="📷 Foto DEPOIS (opcional)" value={formAfter} onChange={setFormAfter} />
            </div>
            <p className="text-xs text-muted-foreground">
              💡 Você pode adicionar a foto "Depois" agora ou depois do procedimento ser concluído.
            </p>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button disabled={saving} onClick={savePhoto}>{saving ? 'Salvando...' : 'Salvar Fotos'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — adicionar foto depois */}
      <Dialog open={!!editingAfter} onOpenChange={o => { if (!o) { setEditingAfter(null); setAfterUrl(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Foto "Depois"</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Paciente: <strong>{editingAfter?.clientName}</strong> — {editingAfter?.procedure}
            </p>
            <PhotoUpload label="📷 Foto DEPOIS" value={afterUrl} onChange={setAfterUrl} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditingAfter(null); setAfterUrl(''); }}>Cancelar</Button>
              <Button disabled={!afterUrl || saving} onClick={saveAfter}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — visualizar comparação */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="sr-only">Antes e Depois</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold">{selected.clientName}</h2>
                  <p className="text-sm text-muted-foreground">{selected.procedure}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(selected.date + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    {selected.professionalName && ` · ${selected.professionalName}`}
                  </p>
                </div>
              </div>

              <BeforeAfterCompare record={selected} />

              {selected.notes && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm">{selected.notes}</p>
                </div>
              )}

              {!selected.afterUrl && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setEditingAfter(selected); setAfterUrl(''); setSelected(null); }}
                >
                  <Camera className="mr-2 h-4 w-4" /> Adicionar Foto "Depois"
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
