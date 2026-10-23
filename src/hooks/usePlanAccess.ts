import { useSalon } from '../contexts/SalonContext';
import { Plan } from '../types';

/**
 * Hook de controle de acesso por plano.
 *
 * hasAccess: false quando o salão está BLOCKED, CANCELLED ou com trial/plano expirado.
 *
 * checkLimit(feature, currentCount):
 *   - Para features numéricas (ex: maxProfessionals): retorna true se currentCount < limite.
 *   - Para features booleanas (ex: hasStore): retorna o valor da feature diretamente.
 *   - Se o plano não estiver carregado: retorna true (permissivo — carregando).
 *
 * hasFeature(feature): atalho para features booleanas.
 *
 * NOTA: hasBooking e hasCRM têm fallback para compatibilidade com planos antigos
 * que não tinham esses campos.
 */
export const usePlanAccess = () => {
  const { salon, plan } = useSalon();

  const isBlocked   = salon?.status === 'BLOCKED';
  const isCancelled = salon?.status === 'CANCELLED';
  const isExpired   =
    salon?.status === 'EXPIRED' ||
    (salon?.status === 'TRIAL' && !!salon?.trialEndsAt && Date.now() > salon.trialEndsAt);

  const hasAccess = !isBlocked && !isExpired && !isCancelled;

  const checkLimit = (feature: keyof Plan['features'], currentCount = 0): boolean => {
    if (!plan) return true;

    const limit = plan.features[feature];

    if (typeof limit === 'number') {
      return currentCount < limit;
    }

    return !!limit;
  };

  const hasFeature = (feature: keyof Plan['features']): boolean => {
    if (!plan) return false;

    // Compatibilidade retroativa: planos antigos sem hasBooking são considerados
    // planos de agenda (o produto original tinha só agenda)
    if (feature === 'hasBooking') {
      const val = plan.features[feature];
      return val === undefined ? true : !!val;
    }

    // hasCRM: planos antigos sem esse campo não têm CRM
    if (feature === 'hasCRM') {
      const val = plan.features[feature];
      return val === undefined ? false : !!val;
    }

    return !!plan.features[feature];
  };

  return {
    hasAccess,
    isBlocked,
    isExpired,
    isCancelled,
    status: salon?.status,
    plan,
    checkLimit,
    hasFeature,
  };
};
