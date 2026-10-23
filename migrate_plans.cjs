/**
 * MIGRAÇÃO DE PLANOS — Bella & Chic
 * 
 * Atualiza os salões existentes que ainda têm planId antigo
 * (basic, pro, premium) para os novos IDs (agenda, agenda-pro, completo).
 * 
 * Rode no servidor:
 *   node migrate_plans.cjs
 */
const admin = require('firebase-admin');
const serviceAccount = require('./src/lib/firebase-admin-key.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Mapeamento: ID antigo -> ID novo
const PLAN_MAP = {
  'basic':   'agenda',
  'basico':  'agenda',
  'pro':     'agenda-pro',
  'premium': 'completo',
};

async function migrate() {
  console.log('🔍 Buscando salões com planos antigos...\n');

  const salonsSnap = await db.collection('salons').get();
  let migrated = 0;
  let alreadyOk = 0;
  let unknown = 0;

  const batch = db.batch();

  for (const doc of salonsSnap.docs) {
    const data = doc.data();
    const currentPlanId = data.planId;

    if (!currentPlanId) {
      // Salão sem plano — atribui agenda (básico)
      batch.update(doc.ref, { planId: 'agenda', updatedAt: Date.now() });
      console.log(`📋 ${data.name || doc.id}: sem plano → atribuído 'agenda'`);
      migrated++;
      continue;
    }

    const newPlanId = PLAN_MAP[currentPlanId.toLowerCase()];

    if (newPlanId) {
      batch.update(doc.ref, { planId: newPlanId, updatedAt: Date.now() });
      console.log(`✅ ${data.name || doc.id}: '${currentPlanId}' → '${newPlanId}'`);
      migrated++;
    } else if (['agenda', 'agenda-pro', 'loja', 'completo'].includes(currentPlanId)) {
      console.log(`⏭️  ${data.name || doc.id}: já está no formato novo ('${currentPlanId}')`);
      alreadyOk++;
    } else {
      console.log(`⚠️  ${data.name || doc.id}: planId desconhecido '${currentPlanId}' — mantido`);
      unknown++;
    }
  }

  if (migrated > 0) {
    await batch.commit();
  }

  console.log(`\n📊 Resultado:`);
  console.log(`   Migrados: ${migrated}`);
  console.log(`   Já corretos: ${alreadyOk}`);
  console.log(`   Desconhecidos: ${unknown}`);
  console.log('\n✅ Migração concluída!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
