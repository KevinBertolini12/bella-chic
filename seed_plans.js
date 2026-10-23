/**
 * SCRIPT DE SEED DOS PLANOS — Bella & Chic
 *
 * Rode UMA VEZ no servidor após qualquer mudança nos planos:
 *   node seed_plans.js
 *
 * Cria ou atualiza os 4 planos no Firestore com as features corretas.
 * Usa merge:true — não apaga dados existentes.
 */

const admin = require('firebase-admin');

// Ajuste o path da chave se necessário
let serviceAccount;
try {
  serviceAccount = require('./src/lib/firebase-admin-key.json');
} catch {
  serviceAccount = require('./firebase-admin-key.json');
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const PLANS = [
  // ─── SÓ AGENDA — R$ 64,99 ─────────────────────────────────────────────────
  {
    id: 'agenda',
    name: 'Agenda',
    label: 'Só Agenda',
    price: 64.99,
    interval: 'MONTHLY',
    stripePriceId: 'price_1THG2tPJdJwQwazDo4sddar3',
    description: 'Para autônomos e pequenos negócios',
    features: {
      // Agenda & equipe
      maxProfessionals:       3,
      maxAppointmentsPerMonth: 9999,
      hasBooking:             true,
      hasDeposit:             false,   // ✗ Sinal antecipado

      // Clientes & prontuários
      hasCRM:                 false,   // ✗ CRM completo
      hasClientRecords:       false,   // ✗ Prontuário completo
      hasAnamnese:            true,    // ✓ Anamnese digital
      hasBeforeAfter:         true,    // ✓ Fotos antes e depois

      // Financeiro
      hasQuotes:              false,   // ✗ Orçamentos e cobranças
      hasPackages:            false,   // ✗ Pacotes e programas
      hasDocuments:           false,   // ✗ Documentos e receituário
      hasStore:               false,   // ✗ Loja virtual pública (checkout online)
      hasProductsInternal:    true,    // ✓ Cadastro de produtos + controle de vendas presenciais
      hasReports:             false,   // Relatório básico apenas (sem DRE)

      // Marketing & engajamento
      hasLoyalty:             true,    // ✓ Programa de fidelidade
      hasReviews:             true,    // ✓ Avaliações dos clientes
      hasStory:               true,    // ✓ Gerador de story

      // WhatsApp
      hasWhatsAppIntegration: true,    // ✓ Bot WhatsApp simples
      hasWhatsAppSmartBot:    false,   // ✗ Bot IA (só no Pro/Completo)

      // Misc
      hasAdvancedCustomization: false,
    
      hasEvents: true,    // ✓ Eventos e comunicados
      hasScheduleBlocks: true,    // ✓ Bloqueios de horário
      hasSportsPackages: false,   // ✗ Pacotes mensais
    },
  },

  // ─── AGENDA PRO — R$ 89,99 ────────────────────────────────────────────────
  {
    id: 'agenda-pro',
    name: 'Agenda Pro',
    label: 'Agenda Pro',
    price: 89.99,
    interval: 'MONTHLY',
    stripePriceId: 'price_1THG2HPJdJwQwazDHFJtJHbp',
    description: 'Para negócios em crescimento',
    features: {
      // Agenda & equipe
      maxProfessionals:       9999,    // ✓ Ilimitados
      maxAppointmentsPerMonth: 9999,
      hasBooking:             true,
      hasDeposit:             true,    // ✓ Sinal antecipado

      // Clientes & prontuários
      hasCRM:                 true,    // ✓ CRM completo com funil
      hasClientRecords:       true,    // ✓ Prontuários e fichas completos
      hasAnamnese:            true,    // ✓ Anamnese digital
      hasBeforeAfter:         true,    // ✓ Fotos antes e depois

      // Financeiro
      hasQuotes:              true,    // ✓ Orçamentos com PIX/cartão/boleto
      hasPackages:            true,    // ✓ Pacotes e planos de tratamento
      hasDocuments:           true,    // ✓ Documentos e receituário
      hasStore:               false,   // ✗ Loja virtual
      hasReports:             true,    // ✓ Relatório financeiro completo (DRE)

      // Marketing & engajamento
      hasLoyalty:             true,
      hasReviews:             true,
      hasStory:               true,

      // WhatsApp
      hasWhatsAppIntegration: true,
      hasWhatsAppSmartBot:    true,    // ✓ Bot WhatsApp inteligente (IA)

      // Misc
      hasAdvancedCustomization: true,
    
      hasEvents: true,    // ✓ Eventos e comunicados
      hasScheduleBlocks: true,    // ✓ Bloqueios de horário
      hasSportsPackages: true,    // ✓ Pacotes mensais de locação
    },
  },

  // ─── SÓ LOJA — R$ 64,99 ───────────────────────────────────────────────────
  {
    id: 'loja',
    name: 'Loja',
    label: 'Só Loja',
    price: 64.99,
    interval: 'MONTHLY',
    stripePriceId: 'price_1TK2NtPJdJwQwazDUy2TITxP',
    description: 'Para quem vende produtos online',
    features: {
      // Agenda & equipe (desabilitados)
      maxProfessionals:       0,
      maxAppointmentsPerMonth: 0,
      hasBooking:             false,   // ✗ Sem agendamento
      hasDeposit:             false,

      // Clientes & prontuários (desabilitados)
      hasCRM:                 false,   // ✗ Sem CRM
      hasClientRecords:       false,
      hasAnamnese:            false,
      hasBeforeAfter:         false,

      // Financeiro
      hasQuotes:              false,
      hasPackages:            false,
      hasDocuments:           false,
      hasStore:               true,    // ✓ Loja virtual completa
      hasReports:             false,   // Relatório básico

      // Marketing
      hasLoyalty:             false,
      hasReviews:             true,    // ✓ Avaliações de produtos
      hasStory:               true,    // ✓ Gerador de story

      // WhatsApp (desabilitado)
      hasWhatsAppIntegration: false,   // ✗ Sem bot
      hasWhatsAppSmartBot:    false,

      hasAdvancedCustomization: false,
    
      hasEvents: false,
      hasScheduleBlocks: false,
      hasSportsPackages: false,
    },
  },

  // ─── AGENDA + LOJA — R$ 159,90 ────────────────────────────────────────────
  {
    id: 'completo',
    name: 'Completo',
    label: 'Agenda + Loja',
    price: 159.90,
    interval: 'MONTHLY',
    stripePriceId: 'price_1TK2NUPJdJwQwazDFgZ5fzUQ',
    description: 'O plano mais completo — tudo incluso',
    features: {
      // Agenda & equipe
      maxProfessionals:       9999,
      maxAppointmentsPerMonth: 9999,
      hasBooking:             true,
      hasDeposit:             true,

      // Clientes & prontuários
      hasCRM:                 true,
      hasClientRecords:       true,
      hasAnamnese:            true,
      hasBeforeAfter:         true,

      // Financeiro
      hasQuotes:              true,
      hasPackages:            true,
      hasDocuments:           true,
      hasStore:               true,    // ✓ Loja virtual completa
      hasReports:             true,    // ✓ DRE completo

      // Marketing
      hasLoyalty:             true,
      hasReviews:             true,
      hasStory:               true,

      // WhatsApp
      hasWhatsAppIntegration: true,
      hasWhatsAppSmartBot:    true,    // ✓ Bot IA
      hasScheduleBlocks:      true,    // ✓ Bloqueios de horário

      hasAdvancedCustomization: true,
    
      hasEvents: true,    // ✓ Eventos e comunicados
      hasScheduleBlocks: true,    // ✓ Bloqueios de horário
      hasSportsPackages: true,    // ✓ Pacotes mensais de locação
    },
  },  CRM_PRO_PLAN,

  // ─── CRM PRO — invisível, só pelo SuperAdmin ─────────────────────────────
  {
    id: 'crm-pro',
    name: 'CRM Pro',
    label: 'CRM Pro',
    price: 0,
    interval: 'MONTHLY',
    stripePriceId: '',
    description: 'CRM completo com inbox WhatsApp. Exclusivo, não aparece publicamente.',
    visible: false,
    features: {
      maxProfessionals:         1,
      maxAppointmentsPerMonth:  0,
      hasBooking:               false,
      hasStore:                 false,
      hasProductsInternal:      false,
      hasReports:               true,
      hasAdvancedCustomization: false,
      hasWhatsAppIntegration:   true,
      hasCRM:                   true,
      hasCRMPro:                true,
      hasQuotes:                false,
    },
  },
];

async function seed() {
  console.log('🌱 Criando/atualizando planos no Firestore...\n');
  for (const plan of PLANS) {
    const { id, ...data } = plan;
    await db.collection('plans').doc(id).set(data, { merge: true });
    console.log(`✅ "${plan.label}" (${plan.name}) — R$ ${plan.price}/mês [id: ${id}]`);
  }

  // Corrige salões com planId FREE_TRIAL sem features
  console.log('\n🔧 Verificando salões com planId FREE_TRIAL...');
  const trialing = await db.collection('salons')
    .where('planId', '==', 'FREE_TRIAL')
    .where('status', '==', 'TRIAL')
    .get();

  if (!trialing.empty) {
    console.log(`   ${trialing.size} salão(ões) com FREE_TRIAL encontrado(s).`);
    console.log('   ⚠️  Esses salões não têm features. Acesse o SuperAdmin para atribuir um plano real.');
    trialing.docs.forEach(d => {
      const s = d.data();
      console.log(`   → ${s.name} (${s.slug}) — status: ${s.status}`);
    });
  } else {
    console.log('   Nenhum salão com FREE_TRIAL. ✓');
  }

  console.log('\n✅ Planos atualizados com sucesso!');
  console.log('   Os 4 planos agora têm todas as features corretas.');
  process.exit(0);
}


// ── Limpar planos extras do Firestore ────────────────────────────────────────
async function cleanupExtraPlans() {
  const validIds = ['agenda', 'agenda-pro', 'loja', 'completo', 'crm-pro'];
  const snap = await db.collection('plans').get();
  let removed = 0;
  for (const d of snap.docs) {
    if (!validIds.includes(d.id)) {
      await d.ref.delete();
      console.log(`🗑️  Plano "${d.id}" removido do Firestore`);
      removed++;
    }
  }
  if (removed === 0) console.log('✓ Nenhum plano extra encontrado');
}

async function main() {
  await seed();
  await cleanupExtraPlans();
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
