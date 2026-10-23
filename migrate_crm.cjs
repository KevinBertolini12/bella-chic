/**
 * migrate_crm.cjs
 * 
 * Adiciona hasCRM: true nos planos "Agenda Pro" e "Completo" no Firestore.
 * 
 * Uso:
 *   node migrate_crm.cjs
 */

const admin = require('firebase-admin');
const path = require('path');

// Carrega as variáveis do .env manualmente (sem dependência extra)
const fs = require('fs');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// Inicializa Firebase Admin
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db = admin.firestore();

async function migrateCRM() {
  console.log('🔧 Iniciando migração: hasCRM nos planos...\n');

  const plansSnap = await db.collection('plans').get();

  if (plansSnap.empty) {
    console.log('⚠️  Nenhum plano encontrado no Firestore.');
    console.log('   Execute o seed de planos primeiro ou crie os planos pelo SuperAdmin.\n');
    process.exit(0);
  }

  let updated = 0;
  let skipped = 0;

  for (const docSnap of plansSnap.docs) {
    const data = docSnap.data();
    const name = data.name || '';
    const features = data.features || {};

    // Planos que devem ter CRM
    const shouldHaveCRM =
      name.toLowerCase().includes('pro') ||
      name.toLowerCase().includes('completo') ||
      name.toLowerCase().includes('premium') ||
      name.toLowerCase().includes('enterprise');

    const hasCRM = shouldHaveCRM ? true : (features.hasCRM ?? false);

    if (features.hasCRM === hasCRM) {
      console.log(`  ✓ [sem mudança] ${name} — hasCRM: ${hasCRM}`);
      skipped++;
      continue;
    }

    await docSnap.ref.update({
      'features.hasCRM': hasCRM,
    });

    console.log(`  ✅ [atualizado] ${name} — hasCRM: ${hasCRM}`);
    updated++;
  }

  console.log(`\n📊 Resultado:`);
  console.log(`   ${updated} plano(s) atualizado(s)`);
  console.log(`   ${skipped} plano(s) sem alteração\n`);

  // Verifica também se o salão atual está com plano correto
  console.log('🔍 Verificando assinaturas ativas...');
  const salonsSnap = await db.collection('salons').get();
  let salonsOk = 0;

  for (const salonDoc of salonsSnap.docs) {
    const salon = salonDoc.data();
    if (salon.planId) {
      salonsOk++;
    }
  }
  console.log(`   ${salonsOk} salão(ões) com plano configurado\n`);

  console.log('✅ Migração concluída! Reinicie o servidor para aplicar.\n');
  process.exit(0);
}

migrateCRM().catch(err => {
  console.error('❌ Erro na migração:', err);
  process.exit(1);
});
