import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, PackageCheck, Tag, Smartphone, Banknote, CreditCard, QrCode, CheckCircle2, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Separator } from '../components/ui/separator';
import { Badge } from '../components/ui/badge';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useSalon } from '../contexts/SalonContext';
import { useSettings } from '../contexts/SettingsContext';
import { storeService } from '../services/storeService';
import { Address, Order, PaymentMethod } from '../types';
import { toast } from 'sonner';
import { SEO } from '../components/SEO';
import { cn } from '../lib/utils';

// ─── PIX QR Code display ─────────────────────────────────────────────────────
const PixPayment = ({
  qrCode, qrCodeBase64, copyPaste, orderId, salonSlug, onSuccess, isSimple, pixKey, pixOwnerName,
}: {
  qrCode: string;
  qrCodeBase64?: string;
  copyPaste: string;
  orderId: string;
  salonSlug: string;
  onSuccess: () => void;
  isSimple?: boolean;
  pixKey?: string;
  pixOwnerName?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [comprovante, setComprovante] = useState<File | null>(null);
  const [uploadingComp, setUploadingComp] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleCheckPayment = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/pix/check-payment?orderId=${orderId}`);
      const data = await res.json();
      if (data.paid) {
        toast.success('Pagamento confirmado! Obrigado pela compra!');
        onSuccess();
      } else {
        toast.info('Pagamento ainda não confirmado. Aguarde alguns instantes.');
      }
    } catch {
      toast.error('Erro ao verificar pagamento.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-2">
          <QrCode className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="font-semibold text-lg">Pague com PIX</h3>
        <p className="text-sm text-muted-foreground">
          {isSimple
            ? 'Escaneie o QR Code ou copie a chave PIX'
            : 'Escaneie o QR Code ou copie o código'}
        </p>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        {qrCodeBase64 ? (
          // Asaas: imagem base64
          <img
            src={`data:image/png;base64,${qrCodeBase64}`}
            alt="QR Code PIX"
            className="h-52 w-52 rounded-lg border-2 border-green-200"
          />
        ) : copyPaste ? (
          // PIX Simples: gera QR Code no browser com qrcode.react
          <div className="rounded-lg border-2 border-green-200 p-2 bg-white">
            <QRCodeSVG value={copyPaste} size={200} level="M" />
          </div>
        ) : (
          <div className="h-52 w-52 rounded-lg border-2 border-dashed border-muted flex items-center justify-center">
            <QrCode className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Copia e cola */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">PIX Copia e Cola</Label>
        <div className="flex gap-2">
          <Input
            readOnly
            value={copyPaste}
            className="font-mono text-xs"
          />
          <Button variant="outline" size="icon" onClick={handleCopy}>
            {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Chave PIX visível para PIX simples */}
      {isSimple && pixKey && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Chave PIX do estabelecimento:</p>
          <p className="text-sm font-mono font-semibold break-all">{pixKey}</p>
          {pixOwnerName && <p className="text-xs text-muted-foreground">Recebedor: {pixOwnerName}</p>}
        </div>
      )}

      <div className={`rounded-lg p-3 text-sm ${isSimple ? 'bg-blue-50 border border-blue-200 text-blue-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
        {isSimple
          ? '📎 Após pagar, anexe o comprovante abaixo e clique em "Enviar comprovante". O salão confirmará sua compra em breve.'
          : '⏰ QR Code válido por 30 minutos. Após pagar, clique em "Confirmar pagamento".'}
      </div>

      {/* Upload de comprovante para PIX simples */}
      {isSimple && (
        <div className="space-y-2">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 p-4 text-center hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={e => setComprovante(e.target.files?.[0] || null)}
            />
            {comprovante ? (
              <div className="text-sm">
                <p className="font-medium text-green-700">✅ {comprovante.name}</p>
                <p className="text-xs text-muted-foreground">Clique para trocar</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p className="font-medium">Toque aqui para anexar o comprovante</p>
                <p className="text-xs">Foto, print ou PDF — qualquer formato</p>
              </div>
            )}
          </label>
          {comprovante && (
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={uploadingComp}
              onClick={async () => {
                setUploadingComp(true);
                try {
                  const fd = new FormData();
                  fd.append('file', comprovante);
                  fd.append('orderId', orderId);
                  const res = await fetch('/api/pix/upload-comprovante', { method: 'POST', body: fd });
                  if (res.ok) {
                    toast.success('Comprovante enviado! O salão irá confirmar em breve.');
                    onSuccess();
                  } else {
                    toast.error('Erro ao enviar comprovante. Tente novamente.');
                  }
                } catch { toast.error('Erro ao enviar comprovante.'); }
                finally { setUploadingComp(false); }
              }}
            >
              {uploadingComp ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : '📎 Enviar comprovante'}
            </Button>
          )}
        </div>
      )}

      {!isSimple && (
        <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleCheckPayment} disabled={checking}>
          {checking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando...</> : '✓ Já paguei — Confirmar pagamento'}
        </Button>
      )}
    </motion.div>
  );
};

// ─── Checkout principal ───────────────────────────────────────────────────────
export const Checkout = () => {
  const navigate = useNavigate();
  const { items, subtotal, shippingFee, total, clearCart, shippingMethod, setShippingMethod, applyCoupon, removeCoupon, coupon, discount } = useCart();
  const [correiosOptions, setCorreiosOptions] = React.useState<{service: string; label: string; price: number; days: number}[]>([]);
  const [selectedCorreiosOption, setSelectedCorreiosOption] = React.useState<string | null>(null);
  const [calculatingFrete, setCalculatingFrete] = React.useState(false);

  const { user } = useAuth();
  const { salon, salonId } = useSalon();
  const { settings } = useSettings();

  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [changeFor, setChangeFor] = useState('');
  const [cardBrand, setCardBrand] = useState('');
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64?: string; copyPaste: string; orderId: string; isSimple?: boolean; pixKey?: string; pixOwnerName?: string } | null>(null);

  const [customerData, setCustomerData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const [address, setAddress] = useState<Address>({
    street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zipCode: '',
  });

  // Calcular frete Correios quando CEP completo
  React.useEffect(() => {
    const cepRaw = address.zipCode.replace(/\D/g, '');
    if (cepRaw.length !== 8) { setCorreiosOptions([]); return; }
    const cepOrigem = (settings?.business as any)?.cepOrigem?.replace(/\D/g, '');
    const deliveryZone = (settings?.business as any)?.deliveryZone || 'fixed';
    if (deliveryZone !== 'national' || !cepOrigem || cepOrigem.length !== 8) return;
    setCalculatingFrete(true);
    fetch('/api/shipping/calculate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cepOrigem, cepDestino: cepRaw, weight: (settings?.business as any)?.avgWeightKg || 0.5 }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.options?.length > 0) {
          setCorreiosOptions(d.options);
          setSelectedCorreiosOption(d.options[0].service);
        }
      })
      .catch(() => {})
      .finally(() => setCalculatingFrete(false));
  }, [address.zipCode, settings?.business]);

  const allowPickup = settings?.business?.allowPickup !== false;
  const allowDelivery = settings?.business?.allowDelivery !== false;
  const hasAsaas = !!(settings?.business?.asaasApiKey);
  const hasPixKey = !!(settings?.business?.pixKey && settings?.business?.pixOwnerName);
  const pixEnabled = hasAsaas || hasPixKey; // PIX só aparece se configurado

  const canSubmit = useMemo(() => {
    if (!items.length || !salonId || !salon?.slug) return false;
    if (!customerData.name || !customerData.phone) return false;
    if (paymentMethod === 'PIX' && hasAsaas && !customerData.email) return false;
    if (shippingMethod === 'PICKUP') return true;
    return Boolean(address.street && address.number && address.neighborhood && address.city && address.state && address.zipCode);
  }, [items.length, salonId, salon?.slug, shippingMethod, address, customerData, paymentMethod]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim() || !salonId) return;
    setApplyingCoupon(true);
    try {
      await applyCoupon(couponCode, salonId);
      toast.success('Cupom aplicado!');
    } catch (error: any) {
      toast.error(error.message || 'Cupom inválido');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const buildOrderPayload = () => ({
    clientId: user?.uid || `guest_${Date.now()}`,
    items: items.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      ...(item.variantId ? { variantId: item.variantId } : {}),
      ...(item.image ? { image: item.image } : {}),
    })),
    totalAmount: total,
    shippingFee,
    shippingMethod,
    paymentMethod,
    ...(shippingMethod === 'FIXED' && address.street ? { address } : {}),
    createdAt: Date.now(),
    customerName: customerData.name,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    ...(coupon ? { couponCode: coupon.code, discount } : {}),
    ...(orderNote.trim() ? { orderNote: orderNote.trim() } : {}),
    ...(paymentMethod === 'CASH' && changeFor ? { changeFor: parseFloat(changeFor) || 0 } : {}),
    ...(paymentMethod === 'CARD_MACHINE' && cardBrand ? { cardBrand } : {}),
  });

  const handleCheckout = async () => {
    if (!salonId || !salon?.slug) { toast.error('Salão não identificado.'); return; }
    if (!items.length) { toast.error('Seu carrinho está vazio.'); navigate(`/s/${salon.slug}/loja`); return; }
    if (!customerData.name || !customerData.phone) { toast.error('Preencha seu nome e telefone.'); return; }
    if (paymentMethod === 'PIX' && hasAsaas && !customerData.email) { toast.error('Informe seu email para o PIX automático.'); return; }
    if (shippingMethod === 'FIXED') {
      if (!address.street || !address.number || !address.city || !address.state || !address.zipCode) {
        toast.error('Preencha o endereço de entrega.'); return;
      }
    }

    try {
      setLoading(true);
      const orderPayload = buildOrderPayload();

      if (paymentMethod === 'PIX') {
        if (hasAsaas) {
          // ── PIX Automático via Asaas ──────────────────────────────────────
          const res = await fetch('/api/pix/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ salonId, order: orderPayload, salonSlug: salon.slug }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erro ao gerar PIX');
          }
          const data = await res.json();
          setPixData({ qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64, copyPaste: data.copyPaste, orderId: data.orderId });
          clearCart();
        } else {
          // ── PIX Simples — gera QR Code com chave do dono ─────────────────
          const res = await fetch('/api/pix/simple', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ salonId, order: orderPayload, salonSlug: salon.slug }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erro ao gerar PIX');
          }
          const data = await res.json();
          setPixData({ qrCode: '', copyPaste: data.copyPaste, orderId: data.orderId, isSimple: true, pixKey: data.pixKey, pixOwnerName: data.pixOwnerName });
          clearCart();
        }
      } else {
        // Reserva / pagar na entrega — cria pedido com status RESERVED
        const status = paymentMethod === 'ON_SITE' ? 'RESERVED' : 'RESERVED';
        const orderRef = await storeService.createOrder(salonId, { ...orderPayload, status } as any);
        // Desconta estoque imediatamente na reserva
        await fetch('/api/order/reserve-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salonId, orderId: orderRef.id, items: orderPayload.items }),
        }).catch(() => {});
        // Notifica dono do salão
        fetch('/api/order/notify-owner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salonId, orderId: orderRef.id, order: { ...orderPayload, id: orderRef.id } }),
        }).catch(() => {});

        clearCart();
        toast.success(paymentMethod === 'ON_SITE' ? 'Reserva realizada! Aguarde confirmação do salão.' : 'Pedido realizado! Pague na entrega.');
        navigate(`/s/${salon.slug}/cliente?payment=success&order=${orderRef.id}`);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Erro ao finalizar pedido.');
    } finally {
      setLoading(false);
    }
  };

  const handlePixSuccess = () => {
    navigate(`/s/${salon?.slug}/cliente?payment=success`);
  };

  if (pixData) {
    return (
      <div className="container mx-auto max-w-md px-4 py-10">
        <SEO title="Pagamento PIX" description="Finalize seu pagamento via PIX" />
        <Card>
          <CardHeader><CardTitle>Finalizar Pagamento</CardTitle></CardHeader>
          <CardContent>
            <PixPayment
              qrCode={pixData.qrCode}
              qrCodeBase64={pixData.qrCodeBase64}
              copyPaste={pixData.copyPaste}
              orderId={pixData.orderId}
              salonSlug={salon?.slug || ''}
              onSuccess={handlePixSuccess}
              isSimple={pixData.isSimple}
              pixKey={pixData.pixKey}
              pixOwnerName={pixData.pixOwnerName}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <SEO title="Finalizar compra" description="Finalize seu pedido" />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl">

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Finalizar compra</h1>
            <p className="mt-1 text-muted-foreground">Revise os dados e escolha como pagar.</p>
          </div>
          <Button variant="outline" onClick={() => salon?.slug ? navigate(`/s/${salon.slug}/carrinho`) : navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">

            {/* Dados do cliente */}
            <Card>
              <CardHeader><CardTitle>Seus dados</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="customer-name">Nome completo *</Label>
                  <Input id="customer-name" value={customerData.name} onChange={e => setCustomerData(p => ({ ...p, name: e.target.value }))} placeholder="Seu nome" />
                </div>
                <div>
                  <Label htmlFor="customer-phone">WhatsApp *</Label>
                  <Input id="customer-phone" value={customerData.phone} onChange={e => setCustomerData(p => ({ ...p, phone: e.target.value }))} placeholder="(00) 00000-0000" inputMode="tel" />
                </div>
                <div>
                  <Label htmlFor="customer-email">Email {paymentMethod === 'PIX' && hasAsaas ? '*' : '(opcional)'}</Label>
                  <Input id="customer-email" type="email" value={customerData.email} onChange={e => setCustomerData(p => ({ ...p, email: e.target.value }))} placeholder="seuemail@gmail.com" />
                </div>
              </CardContent>
            </Card>

            {/* Entrega */}
            <Card>
              <CardHeader><CardTitle>Entrega</CardTitle></CardHeader>
              <CardContent>
                <RadioGroup value={shippingMethod} onValueChange={v => setShippingMethod(v as 'FIXED' | 'PICKUP')} className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  {allowDelivery && (
                    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition', shippingMethod === 'FIXED' ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
                      <RadioGroupItem value="FIXED" id="ship-fixed" className="mt-1" />
                      <div>
                        <div className="font-medium">Entrega</div>
                        <div className="text-sm text-muted-foreground">
                          {correiosOptions.length > 0 ? 'Frete calculado pelos Correios' : `Taxa: R$ ${shippingFee.toFixed(2)}`}
                        </div>
                      </div>
                    </label>
                  )}
                  {allowPickup && (
                    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition', shippingMethod === 'PICKUP' ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
                      <RadioGroupItem value="PICKUP" id="ship-pickup" className="mt-1" />
                      <div>
                        <div className="font-medium">Retirar no salão</div>
                        <div className="text-sm text-muted-foreground">Grátis</div>
                      </div>
                    </label>
                  )}
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Endereço (só para entrega) */}
            <AnimatePresence>
              {shippingMethod === 'FIXED' && (
                <motion.div key="address" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Endereço de entrega</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label>Rua *</Label>
                        <Input value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Número *</Label>
                        <Input value={address.number} onChange={e => setAddress(p => ({ ...p, number: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Complemento</Label>
                        <Input value={address.complement || ''} onChange={e => setAddress(p => ({ ...p, complement: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Bairro *</Label>
                        <Input value={address.neighborhood} onChange={e => setAddress(p => ({ ...p, neighborhood: e.target.value }))} />
                      </div>
                      <div>
                        <Label>CEP *</Label>
                        <div className="relative">
                          <Input
                            value={address.zipCode}
                            onChange={async (e) => {
                              const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
                              const fmt = raw.length > 5 ? raw.slice(0,5) + '-' + raw.slice(5) : raw;
                              setAddress(p => ({ ...p, zipCode: fmt }));
                              if (raw.length === 8) {
                                try {
                                  const r = await fetch(`/api/cep/${raw}`);
                                  if (r.ok) {
                                    const d = await r.json();
                                    setAddress(p => ({
                                      ...p,
                                      street: d.logradouro || p.street,
                                      neighborhood: d.bairro || p.neighborhood,
                                      city: d.localidade || p.city,
                                      state: d.uf || p.state,
                                    }));
                                  }
                                } catch {}
                              }
                            }}
                            inputMode="numeric"
                            placeholder="00000-000"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Cidade *</Label>
                        <Input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Estado *</Label>
                        <Input value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} maxLength={2} />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Forma de pagamento */}
            <Card>
              <CardHeader><CardTitle>Como prefere pagar?</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <RadioGroup value={paymentMethod} onValueChange={v => setPaymentMethod(v as PaymentMethod)} className="space-y-3">

                  {/* PIX — só aparece se configurado nas settings */}
                  {pixEnabled && (
                    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition', paymentMethod === 'PIX' ? 'border-green-500 bg-green-50' : 'hover:border-green-300')}>
                      <RadioGroupItem value="PIX" id="pay-pix" className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          <QrCode className="h-4 w-4 text-green-600" />
                          PIX
                          <Badge variant="outline" className={cn('text-[10px]', hasAsaas ? 'border-green-500 text-green-700' : 'border-blue-400 text-blue-700')}>
                            {hasAsaas ? 'Confirmação automática' : 'Aprovação manual'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {hasAsaas
                            ? 'QR Code gerado na hora. Aprovação automática.'
                            : `Pague para ${settings?.business?.pixOwnerName || 'o salão'}. Confirmação manual pelo estabelecimento.`}
                        </div>
                      </div>
                    </label>
                  )}

                  {/* Dinheiro na entrega */}
                  {shippingMethod === 'FIXED' && (
                    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition', paymentMethod === 'CASH' ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
                      <RadioGroupItem value="CASH" id="pay-cash" className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          <Banknote className="h-4 w-4" />
                          Dinheiro na entrega
                        </div>
                        <div className="text-sm text-muted-foreground">Pague ao receber o produto.</div>
                        {paymentMethod === 'CASH' && (
                          <div className="mt-3">
                            <Label className="text-xs">Troco para quanto? (deixe em branco se não precisar)</Label>
                            <Input className="mt-1 h-8 w-40" placeholder="Ex: R$ 50,00" value={changeFor} onChange={e => setChangeFor(e.target.value)} inputMode="decimal" />
                          </div>
                        )}
                      </div>
                    </label>
                  )}

                  {/* Cartão via maquininha */}
                  {shippingMethod === 'FIXED' && (
                    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition', paymentMethod === 'CARD_MACHINE' ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
                      <RadioGroupItem value="CARD_MACHINE" id="pay-card" className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          <CreditCard className="h-4 w-4" />
                          Cartão — maquininha na entrega
                        </div>
                        <div className="text-sm text-muted-foreground">O entregador leva a maquininha.</div>
                        {paymentMethod === 'CARD_MACHINE' && (
                          <div className="mt-3">
                            <Label className="text-xs">Bandeira do cartão</Label>
                            <RadioGroup value={cardBrand} onValueChange={setCardBrand} className="mt-1 flex flex-wrap gap-2">
                              {['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard'].map(brand => (
                                <label key={brand} className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition', cardBrand === brand ? 'border-primary bg-primary/5 font-medium' : 'hover:border-primary/50')}>
                                  <RadioGroupItem value={brand} />
                                  {brand}
                                </label>
                              ))}
                            </RadioGroup>
                          </div>
                        )}
                      </div>
                    </label>
                  )}

                  {/* Pagar no local (reserva) */}
                  <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition', paymentMethod === 'ON_SITE' ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
                    <RadioGroupItem value="ON_SITE" id="pay-onsite" className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <PackageCheck className="h-4 w-4" />
                        {shippingMethod === 'PICKUP' ? 'Pagar ao retirar no salão' : 'Pagar na entrega (combinar forma)'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {shippingMethod === 'PICKUP'
                          ? 'Reserve agora, pague qualquer forma quando retirar.'
                          : 'O salão entrará em contato para combinar a forma de pagamento.'}
                      </div>
                    </div>
                  </label>
                </RadioGroup>

                {/* Aviso maquininha */}
                {(paymentMethod === 'CARD_MACHINE' || paymentMethod === 'ON_SITE') && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                    💡 Não tem maquininha ainda? Veja opções com taxas baixas:{' '}
                    <a href="https://www.ton.com.br" target="_blank" rel="noreferrer" className="font-medium underline">Ton</a>{', '}
                    <a href="https://www.mercadopago.com.br/point" target="_blank" rel="noreferrer" className="font-medium underline">MP Point</a>{', '}
                    <a href="https://www.stone.com.br" target="_blank" rel="noreferrer" className="font-medium underline">Stone</a>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Resumo do pedido */}
          <div>
            <Card className="sticky top-24">
              <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={`${item.productId}-${item.variantId || 'default'}-${idx}`} className="flex items-center gap-3">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.quantity}× R$ {(item.price ?? 0).toFixed(2)}</div>
                      </div>
                      <div className="text-sm font-medium">R$ {((item.price ?? 0) * (item.quantity ?? 1)).toFixed(2)}</div>
                    </div>
                  ))}
                </div>

                <Separator />
                <div className="flex justify-between text-sm"><span>Subtotal</span><span>R$ {(subtotal ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-sm">
                  <span>Frete</span>
                  <span>{shippingMethod === 'PICKUP' ? <span className="text-green-600 font-medium">Grátis</span> : `R$ ${shippingFee.toFixed(2)}`}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600"><span>Desconto</span><span>- R$ {discount.toFixed(2)}</span></div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">R$ {(total ?? 0).toFixed(2)}</span>
                </div>

                {/* Cupom */}
                <div className="space-y-2 pt-1">
                  <Label className="text-xs">Cupom de desconto</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Código" value={couponCode} onChange={e => setCouponCode(e.target.value)} disabled={!!coupon} className="text-sm" />
                    {!coupon ? (
                      <Button variant="outline" size="sm" onClick={handleApplyCoupon} disabled={applyingCoupon}>
                        {applyingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => { removeCoupon(); setCouponCode(''); }}>Remover</Button>
                    )}
                  </div>
                  {coupon && <p className="text-xs text-green-600">✓ {coupon.code} aplicado</p>}
                </div>

                {/* Observação do pedido */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Observação (opcional)</Label>
                  <textarea
                    placeholder="Ex: Embrulho para presente, deixar com porteiro, sem glúten..."
                    value={orderNote}
                    onChange={e => setOrderNote(e.target.value)}
                    rows={2}
                    maxLength={300}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  {orderNote.length > 0 && (
                    <p className="text-right text-xs text-muted-foreground">{orderNote.length}/300</p>
                  )}
                </div>

                <Button className="mt-2 w-full" size="lg" disabled={loading || !canSubmit} onClick={handleCheckout}>
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</>
                    : paymentMethod === 'PIX'
                      ? <><QrCode className="mr-2 h-4 w-4" />Gerar QR Code PIX</>
                      : paymentMethod === 'ON_SITE' || paymentMethod === 'CASH' || paymentMethod === 'CARD_MACHINE'
                        ? <><PackageCheck className="mr-2 h-4 w-4" />Confirmar pedido</>
                        : 'Finalizar'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {paymentMethod === 'PIX' ? 'Pagamento seguro via PIX. Aprovação instantânea.' : 'Seu pedido será reservado e o salão entrará em contato.'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
