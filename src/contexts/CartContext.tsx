import React, { createContext, useContext, useEffect, useState } from 'react';
import { OrderItem, Product } from '../types';
import { SHIPPING_FEE } from '../constants';
import { couponService, Coupon } from '../services/couponService';
import { useSettings } from './SettingsContext';

interface CartContextType {
  items: OrderItem[];
  addItem: (product: Product, quantity: number, variantId?: string) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string, maxStock?: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  total: number;
  shippingFee: number;
  shippingMethod: 'FIXED' | 'PICKUP';
  setShippingMethod: (method: 'FIXED' | 'PICKUP') => void;
  coupon: Coupon | null;
  discount: number;
  applyCoupon: (code: string, salonId: string) => Promise<void>;
  removeCoupon: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [shippingMethod, setShippingMethod] = useState<'FIXED' | 'PICKUP'>('FIXED');
  const [coupon, setCoupon] = useState<Coupon | null>(null);

  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    const savedShipping = localStorage.getItem('cart_shipping_method');
    if (savedCart) {
      try { setItems(JSON.parse(savedCart)); } catch { /* ignora parse inválido */ }
    }
    if (savedShipping === 'FIXED' || savedShipping === 'PICKUP') {
      setShippingMethod(savedShipping);
    }
  }, []);

  useEffect(() => { localStorage.setItem('cart', JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem('cart_shipping_method', shippingMethod); }, [shippingMethod]);

  const addItem = (product: Product, quantity: number, variantId?: string) => {
    // Valida estoque disponível
    const availableStock = variantId
      ? (product.variants?.find(v => v.id === variantId)?.stock ?? product.stock)
      : product.stock;

    setItems((prev) => {
      const existing = prev.find(
        (i) => i.productId === product.id && i.variantId === variantId
      );
      if (existing) {
        const newQty = existing.quantity + quantity;
        if (newQty > availableStock) return prev; // não deixa passar do estoque
        return prev.map((i) =>
          i.productId === product.id && i.variantId === variantId
            ? { ...i, quantity: newQty }
            : i
        );
      }
      if (quantity > availableStock) return prev; // sem estoque suficiente
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.promotionalPrice || product.price,
          quantity,
          variantId,
          image: product.images[0],
        },
      ];
    });
  };

  const removeItem = (productId: string, variantId?: string) => {
    setItems((prev) =>
      prev.filter((i) => !(i.productId === productId && i.variantId === variantId))
    );
  };

  const updateQuantity = (productId: string, quantity: number, variantId?: string, maxStock?: number) => {
    if (quantity <= 0) {
      removeItem(productId, variantId);
      return;
    }
    // Respeita limite de estoque se informado
    const safeQty = maxStock ? Math.min(quantity, maxStock) : quantity;
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId && i.variantId === variantId
          ? { ...i, quantity: safeQty }
          : i
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    setShippingMethod('FIXED');
    setCoupon(null);
    localStorage.removeItem('cart');
    localStorage.removeItem('cart_shipping_method');
  };

  const applyCoupon = async (code: string, salonId: string) => {
    const valid = await couponService.validateCoupon(salonId, code, subtotal);
    if (!valid) throw new Error('Cupom inválido');
    setCoupon(valid);
  };

  const removeCoupon = () => {
    setCoupon(null);
  };

  const totalItems = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  // Usa o frete configurado no painel do salão; fallback para a constante
  const deliveryEnabled = settings?.business?.allowDelivery !== false;
  const baseShippingFee = settings?.business?.shippingFee ?? SHIPPING_FEE;
  // Se entrega desabilitada, força retirada
  const effectiveShippingMethod = !deliveryEnabled ? 'PICKUP' : shippingMethod;
  const shippingFee = effectiveShippingMethod === 'PICKUP' ? 0 : baseShippingFee;

  // Desconto recalculado em tempo real — nunca excede o subtotal
  const discount = coupon
    ? Math.min(couponService.calculateDiscount(coupon, subtotal), subtotal)
    : 0;

  // Total nunca fica negativo
  const total = Math.max(0, subtotal + shippingFee - discount);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      totalItems, subtotal, total, shippingFee, shippingMethod, setShippingMethod,
      coupon, discount, applyCoupon, removeCoupon,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
};
