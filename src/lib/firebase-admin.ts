import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId   = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Valida presença das variáveis sem logar os valores em produção
if (!projectId || !clientEmail || !privateKey) {
  const missing = [
    !projectId   && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey  && 'FIREBASE_PRIVATE_KEY',
  ].filter(Boolean).join(', ');

  throw new Error(
    `Firebase Admin: variáveis de ambiente ausentes: ${missing}. ` +
    'Verifique o arquivo .env na raiz do projeto.'
  );
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export const adminAuth = getAuth();
export const adminDb   = getFirestore();