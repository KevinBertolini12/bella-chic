/**
 * testIsolation.ts
 *
 * Cria dois salões de teste com dados isolados para validar que
 * profissionais, serviços e agendamentos de um salão não aparecem no outro.
 *
 * ⚠️  USO EXCLUSIVO EM DESENVOLVIMENTO.
 * Não usar em produção — cria documentos com IDs fixos que podem colidir.
 *
 * Como usar: SuperAdminDashboard → botão "Testar Isolamento"
 */

import { db } from '../firebase';
import { collection, doc, setDoc, addDoc } from 'firebase/firestore';
import { Salon, Plan, SalonSettings } from '../types';

// Settings mínimas para os salões de teste
const minimalSettings = (name: string): SalonSettings => ({
  branding: {
    name,
    slogan: 'Salão de teste',
    shortDescription: 'Salão criado para testes de isolamento.',
    fullDescription: '',
    logoURL: '',
    faviconURL: '',
    headerName: name,
    footerName: name,
  },
  appearance: {
    primaryColor: '#e11d48',
    secondaryColor: '#4c0519',
    accentColor: '#fb7185',
    buttonColor: '#e11d48',
    backgroundColor: '#ffffff',
    textColor: '#0f172a',
    fontFamilyPrimary: 'Inter',
    fontFamilySecondary: 'Inter',
    buttonStyle: 'rounded',
    borderRadius: '0.5rem',
    theme: 'light',
    heroOverlayOpacity: 0.4,
  },
  business: {
    slotInterval: 30,
    allowDelivery: true,
    offerHomeService: false,
    homeServiceFee: 0,
    phone: '', whatsapp: '', email: '', address: '',
    neighborhood: '', city: '', state: '', zipCode: '', cnpj: '',
    workingHours: {
      monday:    { open: '09:00', close: '18:00', closed: false },
      tuesday:   { open: '09:00', close: '18:00', closed: false },
      wednesday: { open: '09:00', close: '18:00', closed: false },
      thursday:  { open: '09:00', close: '18:00', closed: false },
      friday:    { open: '09:00', close: '18:00', closed: false },
      saturday:  { open: '09:00', close: '14:00', closed: false },
      sunday:    { open: '00:00', close: '00:00', closed: true },
    },
    shippingFee: 12,
    allowPickup: true,
    pickupMessage: 'Retire no salão.',
  },
  social: { instagram: '', facebook: '', tiktok: '', youtube: '', whatsappLink: '' },
  home: {
    hero: { title: name, subtitle: '', description: '', imageURL: '', button1Text: 'Agendar', button1Link: '/agendamento', button2Text: 'Loja', button2Link: '/loja', heroLayout: 'background' },
    benefits: [],
    about: { title: 'Sobre', text: '', imageURL: '' },
    featuredServices: [],
    shopCTA: { title: 'Boutique', description: '', imageURL: '', buttonText: 'Ver Produtos' },
  },
  cms: { privacyPolicy: '', termsOfUse: '', aboutPage: '', contactText: '' },
});

export const seedTwoSalons = async () => {
  const now = Date.now();

  // ─── Planos ──────────────────────────────────────────────────────────────
  const plans: Plan[] = [
    {
      id: 'BASIC',
      name: 'Básico',
      price: 99,
      interval: 'MONTHLY',
      features: {
        hasBooking: true,
        hasCRM: false,
        hasQuotes: false,
        hasCRMPro: false,
        maxProfessionals: 2,
        maxAppointmentsPerMonth: 100,
        hasStore: false,
        hasReports: false,
        hasAdvancedCustomization: false,
        hasWhatsAppIntegration: false,
      },
    },
    {
      id: 'PRO',
      name: 'Profissional',
      price: 199,
      interval: 'MONTHLY',
      features: {
        hasBooking: true,
        hasCRM: false,
        hasQuotes: false,
        hasCRMPro: false,
        maxProfessionals: 5,
        maxAppointmentsPerMonth: 500,
        hasStore: true,
        hasReports: true,
        hasAdvancedCustomization: true,
        hasWhatsAppIntegration: true,
      },
    },
  ];

  for (const plan of plans) {
    await setDoc(doc(db, 'plans', plan.id), plan, { merge: true });
  }

  // ─── Salão A: Barbearia do João ──────────────────────────────────────────
  const salonAId = 'test-salon-a';
  const salonA: Salon = {
    id: salonAId,
    name: 'Barbearia do João',
    slug: 'barbearia-joao',
    ownerId: 'test-owner-a',
    planId: 'BASIC',
    status: 'ACTIVE',
    trialEndsAt: now + 15 * 24 * 60 * 60 * 1000,
    createdAt: now,
    settings: minimalSettings('Barbearia do João'),
  };
  await setDoc(doc(db, 'salons', salonAId), salonA, { merge: true });

  // Settings do salão A nas subcoleções
  const settingsA = minimalSettings('Barbearia do João');
  for (const [section, data] of Object.entries(settingsA)) {
    await setDoc(doc(db, `salons/${salonAId}/settings`, section), data, { merge: true });
  }

  // Serviço do salão A
  const serviceARef = await addDoc(collection(db, `salons/${salonAId}/services`), {
    name: 'Corte de Barba',
    description: 'Corte tradicional com toalha quente.',
    price: 45,
    duration: 30,
    category: 'Barba',
    active: true,
    salonId: salonAId,
  });

  // Profissional do salão A — specialties com o ID real do serviço
  await addDoc(collection(db, `salons/${salonAId}/professionals`), {
    displayName: 'João Silva',
    userId: 'test-user-prof-a',
    salonId: salonAId,
    bio: 'Especialista em barbas clássicas.',
    active: true,
    specialties: [serviceARef.id], // ← ID real, não string de nome
  });

  // ─── Salão B: Studio Bella ───────────────────────────────────────────────
  const salonBId = 'test-salon-b';
  const salonB: Salon = {
    id: salonBId,
    name: 'Studio Bella',
    slug: 'studio-bella',
    ownerId: 'test-owner-b',
    planId: 'PRO',
    status: 'ACTIVE',
    trialEndsAt: now + 15 * 24 * 60 * 60 * 1000,
    createdAt: now,
    settings: minimalSettings('Studio Bella'),
  };
  await setDoc(doc(db, 'salons', salonBId), salonB, { merge: true });

  const settingsB = minimalSettings('Studio Bella');
  for (const [section, data] of Object.entries(settingsB)) {
    await setDoc(doc(db, `salons/${salonBId}/settings`, section), data, { merge: true });
  }

  // Serviço do salão B
  const serviceBRef = await addDoc(collection(db, `salons/${salonBId}/services`), {
    name: 'Mechas e Coloração',
    description: 'Mechas criativas e coloração profissional.',
    price: 350,
    duration: 180,
    category: 'Cabelo',
    active: true,
    salonId: salonBId,
  });

  // Profissional do salão B
  await addDoc(collection(db, `salons/${salonBId}/professionals`), {
    displayName: 'Bella Souza',
    userId: 'test-user-prof-b',
    salonId: salonBId,
    bio: 'Especialista em coloração e mechas.',
    active: true,
    specialties: [serviceBRef.id], // ← ID real
  });

  console.log('[testIsolation] Salões de teste criados:', { salonAId, salonBId });
  return { salonA, salonB };
};