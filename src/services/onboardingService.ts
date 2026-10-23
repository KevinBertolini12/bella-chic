import { 
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Salon, SalonSettings } from '../types';
import { settingsService } from './settingsService';
import { platformSettingsService } from './platformSettingsService';

export const onboardingService = {
  /**
   * Registra um novo salão/negócio no sistema.
   * @param planId - ID do plano escolhido para o trial ('agenda' | 'agenda-pro' | 'loja' | 'completo')
   *                 Deve corresponder a um documento real na coleção /plans do Firestore.
   */
  async registerSalon(
    ownerId: string,
    ownerEmail: string,
    salonName: string,
    slug: string,
    referredBySlug?: string,
    businessType?: string,
    planId: string = 'agenda-pro', // padrão: Agenda Pro para trial completo
  ) {
    // 1. Verifica se o slug está disponível
    const q = query(collection(db, 'salons'), where('slug', '==', slug));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      throw new Error('Este endereço já está em uso.');
    }

    // 2. Busca configurações da plataforma para duração do trial
    const platformSettings = await platformSettingsService.getSettings();
    const trialDays = platformSettings.trialDays ?? 30;

    // 3. Cria o documento do salão
    const salonId = doc(collection(db, 'salons')).id;
    const now = Date.now();

    // 4. Inicializa as coleções de configurações
    const defaultSettings: SalonSettings = {
      branding:   { ...settingsService.getDefaultBranding(), name: salonName, headerName: salonName, footerName: salonName },
      appearance: settingsService.getDefaultAppearance(),
      business:   { ...settingsService.getDefaultBusiness(), email: ownerEmail },
      social:     settingsService.getDefaultSocial(),
      home:       settingsService.getDefaultHome(),
      cms:        settingsService.getDefaultCMS(),
    };

    const newSalon: Salon = {
      id: salonId,
      name: salonName,
      slug: slug,
      ownerId: ownerId,
      planId,                                                    // ← plano real escolhido
      status: 'TRIAL',
      trialEndsAt: now + (trialDays * 24 * 60 * 60 * 1000),
      createdAt: now,
      settings: defaultSettings,
      businessType: (businessType as any) || 'beauty',
      ...(referredBySlug ? { referredBy: referredBySlug, referralCredits: 0 } : {}),
    };

    // 5. Salva no Firestore
    await setDoc(doc(db, 'salons', salonId), newSalon);

    const sections = Object.keys(defaultSettings) as (keyof SalonSettings)[];
    for (const section of sections) {
      await setDoc(doc(db, `salons/${salonId}/settings`, section), defaultSettings[section]);
    }

    // 6. Chama o servidor para promover o usuário e criar a assinatura
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Usuário não autenticado.');

    const promoteRes = await fetch('/api/onboarding/promote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ salonId, trialDays, planId }),
    });

    if (!promoteRes.ok) {
      const err = await promoteRes.json();
      throw new Error(err.error || 'Erro ao configurar permissões do salão.');
    }

    // 7. Crédito de indicação
    if (referredBySlug) {
      try {
        const refQuery = query(collection(db, 'salons'), where('slug', '==', referredBySlug));
        const refSnap = await getDocs(refQuery);
        if (!refSnap.empty) {
          const refDoc = refSnap.docs[0];
          const currentCredits = refDoc.data().referralCredits || 0;
          await setDoc(doc(db, 'salons', refDoc.id), { referralCredits: currentCredits + 1 }, { merge: true });
        }
      } catch (e) {
        console.warn('[Referral] Erro ao incrementar crédito:', e);
      }
    }

    return salonId;
  }
};
