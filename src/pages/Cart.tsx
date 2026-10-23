import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, Truck, Store } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { useCart } from '../contexts/CartContext';
import { useSalon } from '../contexts/SalonContext';
import { useSettings } from '../contexts/SettingsContext';
import { motion, AnimatePresence } from 'motion/react';
import { SEO } from '../components/SEO';

export const Cart = () => {
  const {
    items, removeItem, updateQuantity,
    totalItems, subtotal, total, shippingFee,
    shippingMethod, setShippingMethod,
  } = useCart();
  const { salon } = useSalon();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const slug = salon?.slug;
  const fixedShippingFee = settings?.business?.shippingFee != null
    ? settings.business.shippingFee
    : shippingFee;
  const allowPickup = settings?.business?.allowPickup !== false;

  if (items.length === 0) {
    return (
      <>
        <SEO title="Carrinho" description="Seu carrinho de compras" />
        <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="h-12 w-12 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Seu carrinho está vazio</h1>
          <p className="mt-4 text-muted-foreground">Que tal conferir as novidades da nossa boutique?</p>
          <Button
            size="lg"
            className="mt-8"
            onClick={() => slug ? navigate(`/s/${slug}/loja`) : navigate(-1)}
          >
            Ir para a Loja
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title="Carrinho" description="Seu carrinho de compras" />
      <div className="container mx-auto px-4 py-12">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">
          Meu Carrinho
          <span className="ml-3 text-lg font-normal text-muted-foreground">
            ({totalItems} {totalItems === 1 ? 'item' : 'itens'})
          </span>
        </h1>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

          {/* Lista de itens */}
          <div className="space-y-4 lg:col-span-2">
            <AnimatePresence>
              {items.map((item) => (
                <motion.div
                  key={`${item.productId}-${item.variantId ?? 'default'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm"
                >
                  {/* Imagem */}
                  <div className="h-24 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ShoppingBag className="h-8 w-8 text-muted-foreground opacity-40" />
                      </div>
                    )}
                  </div>

                  {/* Detalhes */}
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold leading-tight">{item.name}</h3>
                        {item.variantId && (
                          <p className="text-xs text-muted-foreground">Variação: {item.variantId}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(item.productId, item.variantId)}
                        aria-label="Remover item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-lg border p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1, item.variantId, item.stock)}
                          aria-label="Diminuir quantidade"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                              if (item.stock !== undefined && item.quantity >= item.stock) {
                                return; // não passa do estoque
                              }
                              updateQuantity(item.productId, item.quantity + 1, item.variantId, item.stock);
                            }}
                          aria-label="Aumentar quantidade"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="text-right">
                        <p className="font-bold">R$ {((item.price ?? 0) * (item.quantity ?? 1)).toFixed(2)}</p>
                        {item.stock !== undefined && item.quantity >= item.stock && (
                          <p className="text-xs text-amber-600 font-medium">Estoque máximo atingido</p>
                        )}
                        {item.quantity > 1 && (
                          <p className="text-xs text-muted-foreground">
                            R$ {(item.price ?? 0).toFixed(2)} cada
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <button
              className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
              onClick={() => slug ? navigate(`/s/${slug}/loja`) : navigate(-1)}
            >
              ← Continuar comprando
            </button>
          </div>

          {/* Resumo */}
          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Resumo do Pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>R$ {(subtotal ?? 0).toFixed(2)}</span>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Forma de entrega</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs transition-colors ${
                        shippingMethod === 'FIXED'
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background hover:bg-muted'
                      }`}
                      onClick={() => setShippingMethod('FIXED')}
                    >
                      <Truck className="h-4 w-4" />
                      <span>Entrega</span>
                      <span className="font-bold">R$ {fixedShippingFee.toFixed(2)}</span>
                    </button>

                    {allowPickup && (
                      <button
                        className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs transition-colors ${
                          shippingMethod === 'PICKUP'
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input bg-background hover:bg-muted'
                        }`}
                        onClick={() => setShippingMethod('PICKUP')}
                      >
                        <Store className="h-4 w-4" />
                        <span>Retirada</span>
                        <span className="font-bold">Grátis</span>
                      </button>
                    )}
                  </div>

                  {shippingMethod === 'PICKUP' && settings?.business?.pickupMessage && (
                    <p className="text-xs text-muted-foreground">
                      {settings.business.pickupMessage}
                    </p>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frete</span>
                  <span>
                    {shippingMethod === 'PICKUP'
                      ? <span className="text-green-600 font-medium">Grátis</span>
                      : `R$ ${fixedShippingFee.toFixed(2)}`}
                  </span>
                </div>

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">R$ {(total ?? 0).toFixed(2)}</span>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => slug ? navigate(`/s/${slug}/checkout`) : navigate('/checkout')}
                >
                  Finalizar Compra
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};