// ─── Configuração do sistema de afiliados ────────────────────────────────────
export const REFERRAL_CONFIG = {
  // Salão indicando salão
  salon: {
    discountPerReferral: 15,   // 15% de desconto por indicação paga
    maxDiscount: 50,           // máximo de 50% (5 indicações)
    newUserDiscount: 15,       // 15% off 1º mês para quem foi indicado
  },
  // Marketeiro
  marketer: {
    newUserDiscount: 20,       // 20% off 1º mês para quem usou link do marketeiro
    marketerCommission: 30,    // 30% do valor pago vai para o marketeiro
  },
};
