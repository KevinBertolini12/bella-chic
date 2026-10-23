import React, { useState } from 'react';
import { SalonService } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { salonService } from '../../services/salonService';
import { toast } from 'sonner';;
import { Loader2, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useSalon } from '../../contexts/SalonContext';
import { usePlanAccess } from '../../hooks/usePlanAccess';

const CATEGORIES = [
  'Cabelo', 'Barba', 'Unhas', 'Sobrancelhas', 'Pele', 'Maquiagem',
  'Massagem', 'Depilação', 'Estética', 'Outros',
];

interface ServiceFormProps {
  service?: SalonService;
  onSuccess: () => void;
  onCancel: () => void;
}

export const ServiceForm: React.FC<ServiceFormProps> = ({ service, onSuccess, onCancel }) => {
  const { salonId } = useSalon();
  const { hasFeature, plan } = usePlanAccess();
  const canUseDeposit = plan?.name === 'Agenda Pro' || plan?.name === 'Completo';

  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>(service?.images || []);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [showCommission, setShowCommission] = useState(
    !!(service as any)?.commissionPercent || !!(service as any)?.materialCost
  );

  const CLOUDINARY_CLOUD_NAME = 'dyddwpxfm';
  const CLOUDINARY_UPLOAD_PRESET = 'bella_chic_uploads';

  const uploadImage = async (file: File) => {
    if (images.length >= 5) { alert('Máximo de 5 imagens por serviço.'); return; }
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      fd.append('folder', 'services');
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.secure_url) setImages(prev => [...prev, data.secure_url]);
    } catch { alert('Erro ao fazer upload.'); }
    finally { setUploadingImg(false); }
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const [formData, setFormData] = useState({
    name: service?.name || '',
    description: service?.description || '',
    duration: service?.duration || 30,
    price: service?.price || 0,
    category: service?.category || '',
    active: service?.active ?? true,
    requireDeposit: service?.requireDeposit ?? false,
    depositPercent: service?.depositPercent ?? 50,
    // Campos de comissão
    commissionPercent: (service as any)?.commissionPercent ?? 0,
    materialCost: (service as any)?.materialCost ?? 0,
    paymentFeePercent: (service as any)?.paymentFeePercent ?? 0,
  });

  const depositAmount = formData.price > 0
    ? ((formData.price ?? 0) * (formData.depositPercent ?? 0) / 100).toFixed(2)
    : '0,00';

  // Cálculo da comissão líquida
  const grossRevenue = formData.price;
  const paymentFeeAmount = grossRevenue * (formData.paymentFeePercent / 100);
  const materialCost = formData.materialCost;
  const netBase = grossRevenue - paymentFeeAmount - materialCost;
  const commissionAmount = netBase > 0 ? netBase * (formData.commissionPercent / 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salonId) { toast.error('ID do salão não encontrado.'); return; }
    if (!formData.name.trim()) { toast.error('Nome do serviço é obrigatório.'); return; }
    if (!formData.category) { toast.error('Selecione uma categoria.'); return; }
    if (formData.price <= 0) { toast.error('Informe um preço válido.'); return; }
    if (formData.duration <= 0) { toast.error('Informe uma duração válida.'); return; }
    if (formData.requireDeposit && (formData.depositPercent < 1 || formData.depositPercent > 100)) {
      toast.error('A porcentagem do sinal deve ser entre 1% e 100%.'); return;
    }

    setLoading(true);
    try {
      const data = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        duration: formData.duration,
        price: formData.price,
        category: formData.category,
        active: formData.active,
        images,
        requireDeposit: canUseDeposit ? formData.requireDeposit : false,
        depositPercent: canUseDeposit && formData.requireDeposit ? formData.depositPercent : 0,
        // Campos de comissão
        commissionPercent: formData.commissionPercent,
        materialCost: formData.materialCost,
        paymentFeePercent: formData.paymentFeePercent,
      };

      if (service) {
        await salonService.updateService(salonId, service.id, data);
        toast.success('Serviço atualizado com sucesso!');
      } else {
        await salonService.addService(salonId, data);
        toast.success('Serviço criado com sucesso!');
      }
      onSuccess();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar serviço.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome do Serviço *</Label>
        <Input
          id="name"
          placeholder="Ex: Corte Feminino"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          placeholder="Breve descrição do serviço"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Preço (R$) *</Label>
          <Input
            id="price"
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={formData.price || ''}
            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Duração (min) *</Label>
          <Input
            id="duration"
            type="number"
            min="5"
            step="5"
            placeholder="30"
            value={formData.duration || ''}
            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Categoria *</Label>
        <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Imagens do serviço ──────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm">Fotos do serviço <span className="text-muted-foreground font-normal">(máx. 5)</span></Label>

        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((url, i) => (
              <div key={i} className="relative shrink-0">
                <img src={url} alt={`img ${i + 1}`} className="h-24 w-24 rounded-lg object-cover border" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow hover:bg-red-600"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {images.length < 5 && (
          <label className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground cursor-pointer hover:border-primary hover:text-primary transition-colors ${uploadingImg ? 'opacity-50' : ''}`}>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingImg}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ''; }}
            />
            {uploadingImg ? '⏳ Enviando...' : `📷 Adicionar foto (${images.length}/5)`}
          </label>
        )}
        <p className="text-xs text-muted-foreground">As fotos aparecem para o cliente na hora de escolher o serviço.</p>
      </div>

      {/* ── Comissão e custos ──────────────────────────────────────────────── */}
      <div className="rounded-xl border overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCommission(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        >
          <div>
            <p className="font-medium text-sm flex items-center gap-2">
              💰 Comissão e custos do serviço
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure comissão padrão, custo de material e taxa de maquininha
            </p>
          </div>
          {showCommission
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showCommission && (
          <div className="border-t px-4 pb-4 pt-3 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Comissão do profissional (%)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="0"
                    value={formData.commissionPercent || ''}
                    onChange={e => setFormData(p => ({ ...p, commissionPercent: parseFloat(e.target.value) || 0 }))}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Custo de material (R$)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={formData.materialCost || ''}
                    onChange={e => setFormData(p => ({ ...p, materialCost: parseFloat(e.target.value) || 0 }))}
                    className="pl-6"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Taxa de maquininha (%)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    placeholder="0"
                    value={formData.paymentFeePercent || ''}
                    onChange={e => setFormData(p => ({ ...p, paymentFeePercent: parseFloat(e.target.value) || 0 }))}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* Atalhos de percentual de comissão */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">Comissão rápida:</p>
              <div className="flex gap-1.5 flex-wrap">
                {[20, 30, 40, 50, 60].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, commissionPercent: p }))}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                      formData.commissionPercent === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:border-primary'
                    }`}
                  >{p}%</button>
                ))}
              </div>
            </div>

            {/* Preview do cálculo */}
            {formData.price > 0 && formData.commissionPercent > 0 && (
              <div className="rounded-lg bg-muted/50 border p-3 text-xs space-y-1">
                <p className="font-semibold text-sm mb-2">Cálculo da comissão</p>
                <div className="flex justify-between text-muted-foreground">
                  <span>Valor do serviço</span>
                  <span>R$ {formData.price.toFixed(2)}</span>
                </div>
                {formData.paymentFeePercent > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>− Taxa maquininha ({formData.paymentFeePercent}%)</span>
                    <span>− R$ {paymentFeeAmount.toFixed(2)}</span>
                  </div>
                )}
                {formData.materialCost > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>− Custo de material</span>
                    <span>− R$ {formData.materialCost.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground border-t pt-1 mt-1">
                  <span>Base de cálculo</span>
                  <span>R$ {Math.max(0, netBase).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-green-700 text-sm">
                  <span>Comissão do profissional ({formData.commissionPercent}%)</span>
                  <span>R$ {Math.max(0, commissionAmount).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                A comissão configurada aqui é o <strong>padrão para o serviço</strong>. 
                No relatório de profissionais você verá o cálculo líquido já com os descontos de material e taxa aplicados.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Sinal/Adiantamento ─────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 space-y-3 ${!canUseDeposit ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm flex items-center gap-2">
              💳 Exigir sinal para agendar
              {!canUseDeposit && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-normal">
                  Agenda Pro ou Completo
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cliente paga uma parte antes de confirmar o horário
            </p>
          </div>
          <button
            type="button"
            disabled={!canUseDeposit}
            onClick={() => setFormData(p => ({ ...p, requireDeposit: !p.requireDeposit }))}
            className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed ${formData.requireDeposit && canUseDeposit ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formData.requireDeposit && canUseDeposit ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {formData.requireDeposit && canUseDeposit && (
          <div className="space-y-3 pt-1 border-t">
            <div className="space-y-1.5">
              <Label className="text-sm">Porcentagem do sinal</Label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={formData.depositPercent}
                  onChange={e => setFormData(p => ({ ...p, depositPercent: Number(e.target.value) }))}
                  className="flex-1 h-2 accent-primary cursor-pointer"
                  style={{ touchAction: 'none' }}
                />
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.depositPercent}
                    onChange={e => {
                      const v = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                      setFormData(p => ({ ...p, depositPercent: v }));
                    }}
                    className="w-14 rounded-lg border px-2 py-1 text-center text-sm font-bold text-primary"
                  />
                  <span className="text-sm font-bold text-primary">%</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[25, 30, 50, 60, 100].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, depositPercent: p }))}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${formData.depositPercent === p ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary'}`}
                  >{p}%</button>
                ))}
              </div>
            </div>

            {formData.price > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                <p className="text-muted-foreground">
                  Para este serviço de <strong>R$ {(formData.price ?? 0).toFixed(2)}</strong>,
                  o cliente pagará um sinal de{' '}
                  <strong className="text-primary">R$ {depositAmount}</strong> na hora do agendamento.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                O cliente tem <strong>30 minutos</strong> para pagar o sinal.
                Se não pagar, o horário é liberado automaticamente.
                <br />
                <strong>Cancelamento após sinal pago = sem reembolso automático.</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setFormData(p => ({ ...p, active: !p.active }))}
          className={`relative h-6 w-11 rounded-full transition-colors ${formData.active ? 'bg-primary' : 'bg-muted'}`}
        >
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formData.active ? 'translate-x-5' : ''}`} />
        </button>
        <Label className="cursor-pointer" onClick={() => setFormData(p => ({ ...p, active: !p.active }))}>
          Serviço ativo
        </Label>
      </div>

      {/* Botões de ação */}
      <div className="flex gap-2 pt-4 mt-2 border-t">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {service ? 'Salvar alterações' : 'Criar serviço'}
        </Button>
      </div>
    </form>
  );
};
