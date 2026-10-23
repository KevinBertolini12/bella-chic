import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useSalon } from '../../contexts/SalonContext';
import { couponService, Coupon } from '../../services/couponService';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '../ui/badge';

export const CouponsManager = () => {
  const { salonId } = useSalon();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: 0,
    minOrderValue: '',
    maxDiscount: '',
    expiresAt: '',
    usageLimit: '',
    active: true,
  });

  const fetchCoupons = async () => {
    if (!salonId) return;
    const data = await couponService.getCoupons(salonId);
    setCoupons(data);
  };

  useEffect(() => {
    fetchCoupons();
  }, [salonId]);

  const handleSubmit = async () => {
    if (!salonId) return;
    if (!form.code.trim()) { toast.error('Código do cupom é obrigatório'); return; }
    if (form.value <= 0) { toast.error('Valor do desconto deve ser positivo'); return; }

    try {
      await couponService.createCoupon(salonId, {
        code: form.code.toUpperCase(),
        type: form.type,
        value: form.value,
        minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : undefined,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        active: form.active,
      });
      toast.success('Cupom criado!');
      setOpen(false);
      fetchCoupons();
      setForm({ code: '', type: 'percentage', value: 0, minOrderValue: '', maxDiscount: '', expiresAt: '', usageLimit: '', active: true });
    } catch (error) {
      toast.error('Erro ao criar cupom');
    }
  };

  const handleDelete = async (id: string) => {
    if (!salonId) return;
    await couponService.deleteCoupon(salonId, id);
    toast.success('Cupom removido');
    fetchCoupons();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Novo Cupom</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Cupom de Desconto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Código</Label>
                <Input placeholder="DESCONTO10" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentual (%)</SelectItem>
                      <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor</Label>
                  <Input type="number" step={form.type === 'percentage' ? 1 : 0.01} value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Valor mínimo do pedido (opcional)</Label>
                <Input type="number" step="0.01" placeholder="Ex: 50" value={form.minOrderValue} onChange={e => setForm({ ...form, minOrderValue: e.target.value })} />
              </div>
              <div>
                <Label>Desconto máximo (opcional, só para percentual)</Label>
                <Input type="number" step="0.01" placeholder="Ex: 20" value={form.maxDiscount} onChange={e => setForm({ ...form, maxDiscount: e.target.value })} />
              </div>
              <div>
                <Label>Data de expiração (opcional)</Label>
                <Input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
              <div>
                <Label>Limite de uso (opcional)</Label>
                <Input type="number" placeholder="Ex: 100" value={form.usageLimit} onChange={e => setForm({ ...form, usageLimit: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="active-switch">Ativo</Label>
                <input
                  type="checkbox"
                  id="active-switch"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>
              <Button onClick={handleSubmit} className="w-full">Criar Cupom</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {coupons.map(coupon => (
          <Card key={coupon.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between">
                <CardTitle className="text-lg font-mono">{coupon.code}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(coupon.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {coupon.type === 'percentage' ? `${coupon.value ?? 0}% de desconto` : `R$ ${coupon.value.toFixed(2)} de desconto`}
              </p>
              {coupon.minOrderValue && <p className="text-xs text-muted-foreground">Mínimo: R$ {coupon.minOrderValue.toFixed(2)}</p>}
              {coupon.expiresAt && <p className="text-xs text-muted-foreground">Expira: {format(coupon.expiresAt, 'dd/MM/yyyy')}</p>}
              {coupon.usageLimit && <p className="text-xs text-muted-foreground">Usos: {coupon.usedCount}/{coupon.usageLimit}</p>}
              <Badge variant={coupon.active ? 'default' : 'secondary'} className="mt-2">
                {coupon.active ? 'Ativo' : 'Inativo'}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};