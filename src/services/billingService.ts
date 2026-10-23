import { auth } from '../firebase';

export const billingService = {
  // ─── Stripe: assinatura SaaS ────────────────────────────────────────────
  async createCheckoutSession(params: {
    priceId: string;
    salonId: string;
    salonSlug: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const user = auth.currentUser;
    if (!user) throw new Error('Usuário não autenticado');

    const idToken = await user.getIdToken();

    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Falha ao criar sessão de checkout');
    }

    const { url } = await response.json();
    return url as string;
  },

  // ─── Mercado Pago: loja (sem login obrigatório) ─────────────────────────
  async createMpCheckoutSession(params: {
    salonId: string;
    orderId: string;
    salonSlug: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const user = auth.currentUser;
    let idToken: string | null = null;

    if (user) {
      try {
        idToken = await user.getIdToken();
      } catch {
        // cliente não logado — segue como convidado
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch('/api/create-mp-checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Falha ao criar checkout no Mercado Pago');
    }

    const { url } = await response.json();
    return url as string;
  },

  // ─── Stripe: Portal do cliente (gerenciar/cancelar assinatura) ──────────
  async createPortalSession(returnUrl: string): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('Usuário não autenticado');

    const idToken = await user.getIdToken();

    const response = await fetch('/api/create-portal-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ returnUrl }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Falha ao abrir portal do cliente');
    }

    const { url } = await response.json();
    return url as string;
  },
};