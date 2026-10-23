import React, { useState } from 'react';
import { X, Plus, GripVertical, Loader2 } from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { storeService } from '../../services/storeService';
import { toast } from 'sonner';
import { FileUpload } from './FileUpload';
import { useSalon } from '../../contexts/SalonContext';

const CATEGORIES = [
  'Roupas', 'Acessórios', 'Calçados', 'Bolsas', 'Cabelo',
  'Unhas', 'Pele', 'Maquiagem', 'Perfumes', 'Cuidados', 'Outros',
];

interface ProductFormProps {
  product?: Product;
  onSuccess: () => void;
  onCancel: () => void;
}

const genId = () => Math.random().toString(36).slice(2, 9);

export const ProductForm: React.FC<ProductFormProps> = ({ product, onSuccess, onCancel }) => {
  const { salonId } = useSalon();
  const [loading, setLoading] = useState(false);
  const [hasVariants, setHasVariants] = useState(!!(product?.variants?.length));
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    promotionalPrice: product?.promotionalPrice ?? '' as number | '',
    category: product?.category || '',
    images: (product?.images || []) as string[],
    stock: product?.stock || 0,
    active: product?.active ?? true,
    createdAt: product?.createdAt || Date.now(),
  });
  const [variants, setVariants] = useState<ProductVariant[]>(
    product?.variants?.length
      ? product.variants
      : []
  );

  const addVariant = () => {
    setVariants(v => [...v, { id: genId(), name: '', price: formData.price || 0, stock: 0 }]);
  };

  const updateVariant = (id: string, field: keyof ProductVariant, value: any) => {
    setVariants(v => v.map(vt => vt.id === id ? { ...vt, [field]: value } : vt));
  };

  const removeVariant = (id: string) => {
    setVariants(v => v.filter(vt => vt.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salonId) { toast.error('ID do salão não encontrado.'); return; }
    if (!formData.name.trim()) { toast.error('Nome do produto é obrigatório.'); return; }
    if (!formData.category) { toast.error('Selecione uma categoria.'); return; }
    if (!hasVariants && formData.price <= 0) { toast.error('Informe um preço válido.'); return; }

    if (hasVariants) {
      if (variants.length === 0) { toast.error('Adicione ao menos uma variante.'); return; }
      const invalid = variants.find(v => !v.name.trim() || v.price <= 0);
      if (invalid) { toast.error('Preencha nome e preço de todas as variantes.'); return; }
    }

    const promoPrice = formData.promotionalPrice !== '' ? Number(formData.promotionalPrice) : undefined;
    if (!hasVariants && promoPrice !== undefined && promoPrice >= formData.price) {
      toast.error('O preço promocional deve ser menor que o preço original.');
      return;
    }

    setLoading(true);
    try {
      // If using variants, base price = lowest variant price
      const basePrice = hasVariants
        ? Math.min(...variants.map(v => v.price))
        : formData.price;
      const baseStock = hasVariants
        ? variants.reduce((s, v) => s + (v.stock ?? 0), 0)
        : formData.stock;

      const payload = {
        ...formData,
        price: basePrice,
        stock: baseStock,
        promotionalPrice: hasVariants ? undefined : promoPrice,
        variants: hasVariants ? variants : [],
      };

      if (product) {
        await storeService.updateProduct(salonId, product.id, payload);
        toast.success('Produto atualizado!');
      } else {
        await storeService.addProduct(salonId, payload);
        toast.success('Produto criado!');
      }
      onSuccess();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar produto.');
    } finally {
      setLoading(false);
    }
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({ ...prev, images: (prev.images ?? []).filter((_, i) => i !== index) }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Nome */}
      <div className="space-y-2">
        <Label htmlFor="prod-name">Nome do Produto *</Label>
        <Input id="prod-name" placeholder="Ex: Perfume Floral"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })} required />
      </div>

      {/* Descrição */}
      <div className="space-y-2">
        <Label htmlFor="prod-desc">Descrição</Label>
        <textarea id="prod-desc"
          placeholder="Descreva o produto — ingredientes, fragrância, uso, etc."
          rows={3}
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      {/* Categoria */}
      <div className="space-y-2">
        <Label>Categoria *</Label>
        <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Variantes toggle */}
      <div className="rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Variantes de produto</p>
            <p className="text-xs text-muted-foreground">Tamanhos, volumes ou versões com preços diferentes</p>
          </div>
          <button type="button"
            onClick={() => { setHasVariants(h => !h); if (!hasVariants && variants.length === 0) addVariant(); }}
            className={`relative h-6 w-11 rounded-full transition-colors ${hasVariants ? 'bg-primary' : 'bg-muted'}`}>
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${hasVariants ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {hasVariants ? (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-1 text-xs text-muted-foreground px-1">
              <span className="col-span-4">Nome/Tamanho</span>
              <span className="col-span-3">Preço (R$)</span>
              <span className="col-span-3">Estoque</span>
              <span className="col-span-2"></span>
            </div>
            {variants.map((v, i) => (
              <div key={v.id} className="grid grid-cols-12 gap-1 items-center">
                <Input className="col-span-4 h-9 text-sm" placeholder="Ex: 50ml"
                  value={v.name} onChange={e => updateVariant(v.id, 'name', e.target.value)} />
                <Input className="col-span-3 h-9 text-sm" type="number" step="0.01" min="0" placeholder="0,00"
                  value={v.price || ''} onChange={e => updateVariant(v.id, 'price', parseFloat(e.target.value) || 0)} />
                <Input className="col-span-3 h-9 text-sm" type="number" min="0" placeholder="0"
                  value={v.stock || ''} onChange={e => updateVariant(v.id, 'stock', parseInt(e.target.value) || 0)} />
                <button type="button" onClick={() => removeVariant(v.id)}
                  className="col-span-2 flex justify-center text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-full mt-1" onClick={addVariant}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar variante
            </Button>
            {variants.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Estoque total: {variants.reduce((s, v) => s + (v.stock ?? 0), 0)} un · Preço base: R$ {Math.min(...variants.map(v => v.price)).toFixed(2)}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prod-price">Preço (R$) *</Label>
              <Input id="prod-price" type="number" step="0.01" min="0"
                value={formData.price || ''}
                onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-promo">Preço Promocional (R$)</Label>
              <Input id="prod-promo" type="number" step="0.01" min="0"
                placeholder="Deixe vazio para sem promoção"
                value={formData.promotionalPrice}
                onChange={e => setFormData({ ...formData, promotionalPrice: e.target.value === '' ? '' : Number(e.target.value) })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="prod-stock">Estoque *</Label>
              <Input id="prod-stock" type="number" min="0"
                value={formData.stock || ''}
                onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })} required />
            </div>
          </div>
        )}
      </div>

      {/* Imagens */}
      <div className="space-y-2">
        <Label>Imagens do Produto <span className="text-muted-foreground font-normal text-xs">(máx. 5)</span></Label>
        <div className="flex flex-wrap gap-3">
          {(formData.images ?? []).map((url, idx) => (
            <div key={idx} className="relative h-24 w-24 overflow-hidden rounded-xl border">
              <img src={url} alt={`img ${idx + 1}`} className="h-full w-full object-cover" />
              <button type="button"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                onClick={() => removeImage(idx)}>
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {(formData.images ?? []).length < 5 && (
            <FileUpload label="+ Foto" path="products"
              onUploadComplete={url => setFormData({ ...formData, images: [...formData.images, url] })} />
          )}
        </div>
      </div>

      {/* Ativo */}
      <div className="flex items-center gap-3 rounded-xl border p-3">
        <button type="button"
          onClick={() => setFormData(p => ({ ...p, active: !p.active }))}
          className={`relative h-6 w-11 rounded-full transition-colors ${formData.active ? 'bg-primary' : 'bg-muted'}`}>
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formData.active ? 'translate-x-5' : ''}`} />
        </button>
        <div>
          <p className="text-sm font-medium">Produto ativo</p>
          <p className="text-xs text-muted-foreground">Apenas produtos ativos aparecem na loja.</p>
        </div>
      </div>

      {/* Save - fixed at bottom of dialog scroll area */}
      <div className="pt-4 border-t mt-4 flex gap-2 bg-background">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {product ? 'Atualizar' : 'Criar'} Produto
        </Button>
      </div>
    </form>
  );
};