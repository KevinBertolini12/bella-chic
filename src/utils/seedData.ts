/**
 * seedData.ts — Popula o banco com dados de exemplo.
 * ⚠️ USO EXCLUSIVO EM DESENVOLVIMENTO.
 */

import { onboardingService } from '../services/onboardingService';
import { salonService } from '../services/salonService';
import { storeService } from '../services/storeService';
import { superAdminService } from '../services/superAdminService';
import { Plan } from '../types';

export const seedData = async () => {
  // ─── 1. Planos ────────────────────────────────────────────────────────────
  const plans: Omit<Plan, 'id'>[] = [
    {
      name: 'Agenda Básico',
      price: 49.90,
      interval: 'MONTHLY',
      features: {
        hasQuotes: false,
        hasCRMPro: false,
        maxProfessionals: 3,
        maxAppointmentsPerMonth: 100,
        hasBooking: true,
        hasStore: false,
        hasReports: false,
        hasAdvancedCustomization: false,
        hasWhatsAppIntegration: false,
        hasCRM: false,
      },
    },
    {
      name: 'Agenda Pro',
      price: 99.90,
      interval: 'MONTHLY',
      features: {
        hasQuotes: false,
        hasCRMPro: false,
        maxProfessionals: 10,
        maxAppointmentsPerMonth: 500,
        hasBooking: true,
        hasStore: false,
        hasReports: true,
        hasAdvancedCustomization: true,
        hasWhatsAppIntegration: false,
        hasCRM: true,  // CRM disponível no Pro
      },
    },
    {
      name: 'Loja',
      price: 79.90,
      interval: 'MONTHLY',
      features: {
        hasQuotes: false,
        hasCRMPro: false,
        maxProfessionals: 1,
        maxAppointmentsPerMonth: 0,
        hasBooking: false,
        hasStore: true,
        hasReports: false,
        hasAdvancedCustomization: false,
        hasWhatsAppIntegration: false,
        hasCRM: false,
      },
    },
    {
      name: 'Completo',
      price: 149.90,
      interval: 'MONTHLY',
      features: {
        hasQuotes: false,
        hasCRMPro: false,
        maxProfessionals: 999,
        maxAppointmentsPerMonth: 9999,
        hasBooking: true,
        hasStore: true,
        hasReports: true,
        hasAdvancedCustomization: true,
        hasWhatsAppIntegration: true,
        hasCRM: true,  // CRM no plano completo
      },
    },
  ];

  for (const plan of plans) {
    await superAdminService.createPlan(plan);
  }

  // ─── 2. Salão 1: Bella & Chic ─────────────────────────────────────────────
  const salon1Id = await onboardingService.registerSalon(
    'owner-1',
    'owner1@bellachic.com',
    'Bella & Chic Boutique',
    'bella-chic'
  );

  const s1a = await salonService.addService(salon1Id, {
    name: 'Corte Feminino',
    description: 'Corte moderno com lavagem e secagem incluídas.',
    duration: 60,
    price: 120,
    active: true,
    category: 'Cabelo',
  });

  const s1b = await salonService.addService(salon1Id, {
    name: 'Manicure Completa',
    description: 'Esmaltação em gel com hidratação.',
    duration: 45,
    price: 65,
    active: true,
    category: 'Unhas',
  });

  await salonService.addProfessional(salon1Id, {
    displayName: 'Ana Carolina',
    userId: 'prof-1-uid',
    bio: 'Especialista em cortes modernos e coloração.',
    active: true,
    specialties: [s1a.id, s1b.id],
  });

  await storeService.addProduct(salon1Id, {
    name: 'Vestido Floral Verão',
    description: 'Vestido leve e elegante para o verão.',
    price: 189.90,
    stock: 10,
    category: 'Roupas',
    images: ['https://picsum.photos/seed/dress1/400/600'],
    active: true,
    createdAt: Date.now(),
  });

  // ─── 3. Salão 2: Barbearia Vintage ───────────────────────────────────────
  const salon2Id = await onboardingService.registerSalon(
    'owner-2',
    'owner2@barbeavintage.com',
    'Barbearia Vintage',
    'barbearia-vintage'
  );

  const s2a = await salonService.addService(salon2Id, {
    name: 'Barba Completa',
    description: 'Barba feita com toalha quente e navalha.',
    duration: 30,
    price: 45,
    active: true,
    category: 'Barba',
  });

  const s2b = await salonService.addService(salon2Id, {
    name: 'Corte Masculino',
    description: 'Corte degradê com acabamento na navalha.',
    duration: 40,
    price: 55,
    active: true,
    category: 'Cabelo',
  });

  await salonService.addProfessional(salon2Id, {
    displayName: 'Roberto Barbeiro',
    userId: 'prof-2-uid',
    bio: 'Mestre em cortes clássicos e barbas.',
    active: true,
    specialties: [s2a.id, s2b.id],
  });

  await storeService.addProduct(salon2Id, {
    name: 'Óleo para Barba Premium',
    description: 'Hidratação e brilho para sua barba.',
    price: 59.90,
    stock: 25,
    category: 'Cuidados',
    images: ['https://picsum.photos/seed/beardoil/400/400'],
    active: true,
    createdAt: Date.now(),
  });

  console.log('[seedData] Concluído. Salões criados:', salon1Id, salon2Id);
  return { salon1Id, salon2Id };
};
