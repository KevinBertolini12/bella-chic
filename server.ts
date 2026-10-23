import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminAuth } from "./src/lib/firebase-admin.js";
import cron from 'node-cron';
import webpush from 'web-push';
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Web Push (notificações) ──────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.GMAIL_USER || 'admin@seusite.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPushToUser(userId: string, payload: object) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  try {
    const subsSnap = await adminDb.collection("push_subscriptions")
      .where("userId", "==", userId).get();
    for (const d of subsSnap.docs) {
      try {
        await webpush.sendNotification(d.data().subscription, JSON.stringify(payload));
      } catch (e: any) {
        if (e.statusCode === 410) await d.ref.delete(); // expirada
      }
    }
  } catch (e) {
    console.error("[Push]", e);
  }
}

async function sendPushToSalon(salonId: string, payload: object) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  try {
    const subsSnap = await adminDb.collection("push_subscriptions")
      .where("salonId", "==", salonId).get();
    for (const d of subsSnap.docs) {
      try {
        await webpush.sendNotification(d.data().subscription, JSON.stringify(payload));
      } catch (e: any) {
        if (e.statusCode === 410) await d.ref.delete();
      }
    }
  } catch (e) {
    console.error("[Push salon]", e);
  }
}
import nodemailer from 'nodemailer';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ─── Email via Gmail/Nodemailer ───────────────────────────────────────────────
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[Email] GMAIL_USER ou GMAIL_APP_PASSWORD não configurado.');
    return;
  }
  try {
    const info = await emailTransporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Bella & Chic Plataforma'}" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] ✓ Enviado para ${to}: ${subject} (${info.messageId})`);
  } catch (error) {
    console.error('[Email] Erro ao enviar:', error);
  }
}

// ─── Evolution API (WhatsApp) ────────────────────────────────────────────────
// Configure no .env:
//   EVOLUTION_API_URL=https://sua-evolution.com
//   EVOLUTION_API_KEY=sua-chave-aqui
//   EVOLUTION_INSTANCE=nome-da-instancia
const EVOLUTION_URL      = process.env.EVOLUTION_API_URL || "";
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY || "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || "";

// ─── Baileys microservice ────────────────────────────────────────────────────
const WA_SERVICE_URL = process.env.WA_SERVICE_URL || "http://localhost:8082";
const SUPPORT_INSTANCE = "support_bellachic";
const BELLA_CHIC_NUMBER = "5516994563354"; // Número da Bella&Chic — notificações para profissionais

/**
 * Notifica o DONO/PROFISSIONAL sempre pelo número da Bella&Chic (SUPPORT_INSTANCE).
 * O número do salão só fala com clientes finais — nunca com o dono.
 * Isso protege o chip do salão de ban por volume e separa os fluxos.
 */


/**
 * Envia mensagem de WhatsApp via Evolution API.
 * number: formato internacional sem +, ex: 5511999999999
 */
// ── Pega o melhor número para notificar o dono ───────────────────────────────
// Prioridade: ownerNotificationPhone > whatsapp (se for diferente do número conectado)
async function getOwnerNotificationPhone(salonId: string): Promise<string> {
  // Retorna o telefone do DESTINO (dono/profissional)
  // O REMETENTE é sempre SUPPORT_INSTANCE (número da Bella & Chic)
  try {
    const salonDoc = await adminDb.doc(`salons/${salonId}`).get();
    const salon = salonDoc.data() as any;
    // Usa o número conectado ao WhatsApp do salão como destino
    const phone = (salon?.whatsapp || salon?.phone || '').replace(/\D/g, '');
    return phone;
  } catch { return ''; }
}
/**
 * Notifica o DONO/PROFISSIONAL do salão.
 * REMETENTE: Bella & Chic (SUPPORT_INSTANCE)
 * DESTINATÁRIO: número conectado ao WhatsApp do salão (via getOwnerNotificationPhone)
 */
async function notifyOwner(salonId: string, message: string): Promise<void> {
  try {
    const destPhone = await getOwnerNotificationPhone(salonId);
    if (!destPhone) return;
    await sendWhatsApp(destPhone, message, SUPPORT_INSTANCE);
  } catch (e) { console.error('[NotifyOwner]', e); }
}



// ── Evolution API — CRM Pro rich messaging ───────────────────────────────────
const CRM_PRO_EVOLUTION_INSTANCE = process.env.CRM_PRO_EVOLUTION_INSTANCE || "crm_pro_instance";

// ── CRM Pro: Busca e dispara mídia pré-definida baseada no contexto ────────────
async function checkAndSendMediaTriggers(
  salonId: string,
  phone: string,
  text: string,
  isFirstMessage: boolean
): Promise<void> {
  try {
    const triggersSnap = await adminDb.collection(`salons/${salonId}/crm_pro_media`)
      .where('active', '==', true).get();

    if (triggersSnap.empty) return;

    const tLower = text.toLowerCase();

    for (const triggerDoc of triggersSnap.docs) {
      const trigger = triggerDoc.data() as any;

      let shouldSend = false;

      // Tipo especial: boas-vindas automática na primeira mensagem
      if (trigger.triggerType === 'welcome' && isFirstMessage) {
        shouldSend = true;
      }

      // Gatilho por palavras-chave
      if (trigger.triggerType === 'keyword' && trigger.keywords?.length > 0) {
        const keywords: string[] = trigger.keywords;
        shouldSend = keywords.some((kw: string) => tLower.includes(kw.toLowerCase()));
      }

      if (!shouldSend) continue;

      // Pequena pausa para parecer natural (após o texto do bot)
      await new Promise(r => setTimeout(r, 1500));

      const _inst = getCRMProInstance(salonId);

      // Tipo link — envia como mensagem de texto com o link
      if (trigger.mediaType === 'link') {
        const linkMsg = trigger.caption
          ? `${trigger.caption}\n\n🔗 ${trigger.mediaUrl}`
          : `🔗 ${trigger.mediaUrl}`;
        await sendWhatsApp(phone, linkMsg, _inst).catch(() => {});

      } else if (trigger.mediaType === 'audio') {
        await sendBaileysAudio(phone, trigger.mediaUrl, _inst).catch(() => {});
      } else if (trigger.mediaType === 'image' || trigger.mediaType === 'video' || trigger.mediaType === 'document') {
        await sendBaileysMedia(phone, trigger.mediaUrl, trigger.mediaType, _inst, trigger.caption||'', trigger.fileName||'').catch(() => {});
      }

      console.log(`[CRMPro Media] Trigger "${trigger.name}" sent to ${phone}`);

      // Não dispara mais de um trigger por vez (evita spam)
      break;
    }
  } catch (e: any) {
    console.error('[CRMPro Media Trigger] Error:', e.message);
  }
}

// ── Baileys — envio de mídia (imagem, vídeo, áudio, documento) ───────────────
const getCRMProInstance = (salonId: string) => `salon_${salonId}`;

async function sendBaileysMedia(
  number: string, mediaUrl: string, mediaType: 'image'|'video'|'document',
  instanceName: string, caption?: string, fileName?: string
): Promise<boolean> {
  const num = number.replace(/\D/g, '');
  const fmt = num.startsWith('55') ? num : `55${num}`;
  try {
    const r = await fetch(`${WA_SERVICE_URL}/message/send-media`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceName, number: fmt, mediaUrl, mediaType, caption: caption||'', fileName: fileName||'' }),
    });
    if (!r.ok) { console.error('[Baileys Media]', await r.text()); return false; }
    console.log(`[Baileys] ✅ Mídia (${mediaType}) → ${fmt}`);
    return true;
  } catch (e: any) { console.error('[Baileys Media]', e.message); return false; }
}

async function sendBaileysAudio(number: string, audioUrl: string, instanceName: string): Promise<boolean> {
  const num = number.replace(/\D/g, '');
  const fmt = num.startsWith('55') ? num : `55${num}`;
  try {
    const r = await fetch(`${WA_SERVICE_URL}/message/send-audio`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceName, number: fmt, audioUrl }),
    });
    if (!r.ok) { console.error('[Baileys Audio]', await r.text()); return false; }
    console.log(`[Baileys] ✅ Áudio → ${fmt}`);
    return true;
  } catch (e: any) { console.error('[Baileys Audio]', e.message); return false; }
}


async function sendWhatsApp(number: string, message: string, instanceName?: string): Promise<boolean> {
  const instance = instanceName || EVOLUTION_INSTANCE || "default";

  let formatted: string;
  if (number.includes("@")) {
    formatted = number;
  } else {
    const cleaned = number.replace(/\D/g, "");
    if (cleaned.length < 8) {
      console.warn("[WhatsApp] Número inválido:", number);
      return false;
    }
    formatted = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
  }

  try {
    const res = await fetch(`${WA_SERVICE_URL}/message/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceName: instance, number: formatted, text: message }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[WhatsApp] Erro ao enviar:", err);
      return false;
    }

    console.log(`[WhatsApp] ✅ Mensagem enviada para ${formatted} via Baileys`);
    return true;
  } catch (error) {
    console.error("[WhatsApp] Falha na requisição Baileys:", error);
    return false;
  }
}

// ─── SMS via SMSDev (Brasil) ─────────────────────────────────────────────────
// Provedor brasileiro de SMS — sem instalar nada, sem celular configurado.
// Preço: ~R$ 0,09 por SMS. Plano gratuito com créditos de teste.
//
// SETUP (2 minutos):
//   1. Crie conta grátis em https://www.smsdev.com.br
//   2. Acesse o painel → "Chave de API" → copie a chave
//   3. Adicione no .env:  SMSDEV_API_KEY=sua_chave_aqui
//
// Pronto. O sistema passa a enviar SMS automaticamente.
// Se a chave não estiver configurada, apenas ignora (sem erro).

const SMSDEV_API_KEY = process.env.SMSDEV_API_KEY || '';

/**
 * Envia SMS via SMSDev.
 * number: com ou sem DDI, com ou sem formatação — normalizamos internamente.
 */
async function sendSMS(number: string, message: string): Promise<boolean> {
  if (!SMSDEV_API_KEY) {
    // Silencioso: SMS é opcional. Só loga em debug.
    console.debug('[SMS] SMSDEV_API_KEY não configurado — SMS ignorado.');
    return false;
  }

  // Normaliza: remove tudo que não for dígito e garante DDI 55
  const digits  = number.replace(/\D/g, '');
  const cleaned = digits.startsWith('55') ? digits : `55${digits}`;
  if (cleaned.length < 12) {
    console.warn('[SMS] Número inválido:', number);
    return false;
  }

  // Trunca a mensagem para 160 chars (1 SMS simples)
  const msg = message.slice(0, 160);

  try {
    const url = new URL('https://api.smsdev.com.br/v1/send');
    url.searchParams.set('key',    SMSDEV_API_KEY);
    url.searchParams.set('type',   '9');           // SMS texto simples
    url.searchParams.set('number', cleaned);
    url.searchParams.set('msg',    msg);

    const res = await fetch(url.toString());
    const data = await res.json() as any;

    if (data?.situacao === 'OK' || data?.return === 'OK' || data?.id) {
      console.log(`[SMS] ✓ Enviado para ${cleaned} | id: ${data?.id || '—'}`);
      return true;
    }

    console.error('[SMS] Resposta inesperada:', JSON.stringify(data));
    return false;
  } catch (e) {
    console.error('[SMS] Falha na requisição:', e);
    return false;
  }
}

/**
 * Envia WhatsApp + SMS ao mesmo tempo (best-effort).
 * Garante entrega mesmo se o cliente estiver sem internet ou sem WhatsApp.
 */
async function sendSMSAndWhatsApp(
  phone: string,
  message: string,
  instanceName?: string,
): Promise<void> {
  await Promise.allSettled([
    sendWhatsApp(phone, message, instanceName),
    sendSMS(phone, message),
  ]);
}


/**
 * Formata a mensagem de lembrete substituindo as variáveis:
 *   {{nome}}       → nome do cliente
 *   {{data}}       → data do agendamento (dd/mm/yyyy)
 *   {{horario}}    → horário de início
 *   {{servico}}    → nome do serviço
 *   {{profissional}} → nome do profissional
 */
function formatReminderMessage(template: string, vars: {
  nome: string;
  data: string;
  horario: string;
  servico: string;
  profissional: string;
}): string {
  return template
    .replace(/\{\{nome\}\}/gi, vars.nome)
    .replace(/\{\{data\}\}/gi, vars.data)
    .replace(/\{\{horario\}\}/gi, vars.horario)
    .replace(/\{\{servico\}\}/gi, vars.servico)
    .replace(/\{\{profissional\}\}/gi, vars.profissional);
}

// ─── Helper: verifica se mensagens proativas do CRM estão habilitadas por salão
async function isCRMProactiveEnabled(salonId: string): Promise<boolean> {
  try {
    const doc = await adminDb.doc(`salons/${salonId}/settings/crm_bot_settings`).get();
    const data = doc.data() as any;
    // Se nunca foi configurado, default = habilitado (retrocompatibilidade)
    if (!data || data.crmProactiveEnabled === undefined) return true;
    return data.crmProactiveEnabled === true;
  } catch { return true; }
}

// ─── Função de lembrete de agendamentos ──────────────────────────────────────
async function sendAppointmentReminders() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  try {
    const appointmentsRef = adminDb.collectionGroup('appointments');
    const q = appointmentsRef
      .where('date', '==', tomorrowStr)
      .where('status', 'in', ['CONFIRMED', 'PENDING'])
      .where('reminderSent', '==', false);

    const snapshot = await q.get();
    console.log(`[Lembrete] Enviando para ${snapshot.size} agendamentos de amanhã.`);

    for (const doc of snapshot.docs) {
      const apt = doc.data();

      // Busca o salonId a partir do path do documento (salons/{salonId}/appointments/{id})
      const pathParts = doc.ref.path.split('/');
      const salonId = pathParts[1];

      // Busca a mensagem personalizada do dono do salão
      let reminderTemplate = "";
      let salonBusinessType = "beauty";
      try {
        const settingsDoc = await adminDb.doc(`salons/${salonId}/settings/notifications`).get();
        const settingsData = settingsDoc.data() as any;
        reminderTemplate = settingsData?.whatsappReminderMessage || "";
        const salonDoc = await adminDb.doc(`salons/${salonId}`).get();
        salonBusinessType = (salonDoc.data() as any)?.businessType || "beauty";
      } catch {
        // sem settings, usa template padrão
      }

      // Templates padrão por tipo de negócio
      const REMINDER_TEMPLATES: Record<string, string> = {
        beauty: "Olá {{nome}}! 👋\n\nLembrando que você tem um agendamento amanhã:\n\n✂️ Serviço: {{servico}}\n👤 Profissional: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nEstamos te esperando! Até lá 😊",
        health: "Olá {{nome}}! 👋\n\nLembrando que você tem uma consulta agendada amanhã:\n\n🩺 Procedimento: {{servico}}\n👨‍⚕️ Profissional: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nPor favor, chegue com 10 minutos de antecedência. Até lá! 😊",
        fitness: "Olá {{nome}}! 💪\n\nSua aula está confirmada para amanhã:\n\n🏋️ Aula: {{servico}}\n👤 Instrutor: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nNão esqueça de se hidratar bem! Até lá 🚀",
        services: "Olá {{nome}}! 👋\n\nLembrando do seu agendamento para amanhã:\n\n🔧 Serviço: {{servico}}\n👤 Responsável: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nQualquer dúvida, pode nos chamar. Até lá! 😊",
        sports: "Olá {{nome}}! 🏃\n\nSeu horário está reservado para amanhã:\n\n⚽ Atividade: {{servico}}\n👤 Responsável: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nBora que vai ser incrível! Até lá 🎉",
      };

      // Template padrão se o dono não configurou — usa o do tipo de negócio
      if (!reminderTemplate) {
        reminderTemplate = REMINDER_TEMPLATES[salonBusinessType] || REMINDER_TEMPLATES.beauty;
      }

      // Formata a data no padrão br
      const [year, month, day] = apt.date.split('-');
      const dataBR = `${day}/${month}/${year}`;

      const message = formatReminderMessage(reminderTemplate, {
        nome: apt.clientName || "Cliente",
        data: dataBR,
        horario: apt.startTime,
        servico: apt.serviceName,
        profissional: apt.professionalName,
      });

      // Envia WhatsApp + SMS D-1 para o cliente
      if (apt.customerPhone) {
        await sendWhatsApp(apt.customerPhone, message, `salon_${salonId}`);
        // SMS simples — garante entrega mesmo sem internet/dados no celular do cliente
        const smsMsgClient =
          `Lembrete: ${apt.serviceName} amanha (${dataBR}) as ${apt.startTime}` +
          (apt.professionalName ? ` c/ ${apt.professionalName}` : '') +
          `. Duvidas, responda esta mensagem.`;
        await sendSMS(apt.customerPhone, smsMsgClient);
      }

      // Também envia email se tiver (mantém compatibilidade)
      if (apt.customerEmail) {
        await sendEmail({
          to: apt.customerEmail,
          subject: `Lembrete: agendamento amanhã às ${apt.startTime}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
              <h2>Olá ${apt.clientName}!</h2>
              <p>Você tem um agendamento amanhã (<strong>${dataBR}</strong>) às <strong>${apt.startTime}</strong> para <strong>${apt.serviceName}</strong> com <strong>${apt.professionalName}</strong>.</p>
              <p>Estamos te esperando!</p>
              <hr />
              <p style="font-size: 12px; color: #666;">Se precisar reagendar ou cancelar, entre em contato conosco.</p>
            </div>
          `,
        });
      }

      // ── Push para o CLIENTE: lembrete de amanhã ─────────────────────────
      if (apt.clientId && apt.clientId !== 'guest') {
        try {
          await sendPushToUser(apt.clientId, {
            title: '🔔 Lembrete de Amanhã!',
            body: `${apt.serviceName} amanhã às ${apt.startTime} com ${apt.professionalName}`,
            url: `/s/${salonId}/meus-agendamentos`,
            requireInteraction: true,
            tag: `reminder-${apt.clientId}-${apt.date}`,
          });
        } catch (pushErr) {
          console.error('[Push] Erro ao enviar push lembrete:', pushErr);
        }
      }

      // ── Push para o DONO/PROFISSIONAL: agenda de amanhã ──────────────────
      try {
        const salonDoc = await adminDb.collection('salons').doc(salonId).get();
        const salonSlugForPush = salonDoc.data()?.slug || '';
        await sendPushToSalon(salonId, {
          title: '📋 Agendamento Amanhã',
          body: `${apt.clientName} — ${apt.serviceName} às ${apt.startTime}`,
          url: `/s/${salonSlugForPush}/admin?tab=appointments`,
          tag: `reminder-salon-${salonId}-${apt.date}-${apt.startTime}`,
        });
      } catch (pushErr) {
        console.error('[Push] Erro ao enviar push lembrete salão:', pushErr);
      }

      // ── WhatsApp para o PROFISSIONAL: agenda de amanhã ─────────────────────
      try {
        const salonNameDoc = await adminDb.collection('salons').doc(salonId).get().catch(() => null);
        const salonName: string = salonNameDoc?.data()?.name || '';
        const profDoc = await adminDb.collection(`salons/${salonId}/professionals`)
          .where('displayName', '==', apt.professionalName).limit(1).get().catch(() => null);
        const profPhone: string = profDoc?.docs?.[0]?.data()?.phone || apt.professionalPhone || '';
        if (profPhone) {
          const profMsg =
            `📋 *Sua agenda de amanhã — ${dataBR}*

` +
            `👤 Cliente: *${apt.clientName}*
` +
            `✂️ Serviço: *${apt.serviceName}*
` +
            `🕐 Horário: *${apt.startTime}*

` +
            `Verifique o painel para mais detalhes. — *${salonName || 'Bella & Chic'}*`;
          await sendWhatsApp(profPhone, profMsg, `salon_${salonId}`);
          // SMS backup para o profissional
          await sendSMS(profPhone,
            `Lembrete amanha: ${apt.clientName} — ${apt.serviceName} as ${apt.startTime} (${dataBR}). Bom atendimento!`
          );
        }
      } catch { /* profissional sem phone cadastrado */ }

      await doc.ref.update({ reminderSent: true });
    }
  } catch (error) {
    console.error("[Lembrete] Erro:", error);
  }
}

// ─── Confirmação de consulta via WhatsApp (2 cliques) ────────────────────────
async function sendConfirmationRequests() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  try {
    const q = adminDb.collectionGroup('appointments')
      .where('date', '==', tomorrowStr)
      .where('status', 'in', ['CONFIRMED', 'PENDING'])
      .where('confirmationSent', '==', false);

    const snap = await q.get();
    for (const d of snap.docs) {
      const apt = d.data();
      const pathParts = d.ref.path.split('/');
      const salonId = pathParts[1];
      if (!apt.customerPhone) continue;

      const salonDoc = await adminDb.collection('salons').doc(salonId).get();
      const salonName = salonDoc.data()?.name || 'o salão';
      const [y, m, day] = apt.date.split('-');
      const dataBR = `${day}/${m}/${y}`;

      const msg =
        `Olá, ${apt.clientName}! 👋\n\n` +
        `Lembrando que você tem um agendamento *amanhã* no *${salonName}*:\n\n` +
        `✂️ *${apt.serviceName}*\n` +
        `📅 ${dataBR} às ${apt.startTime}\n\n` +
        `Por favor, confirme sua presença:\n` +
        `👉 Responda *SIM* para confirmar\n` +
        `👉 Responda *NÃO* para cancelar`;

      await sendWhatsApp(apt.customerPhone, msg, `salon_${salonId}`);
      await d.ref.update({ confirmationSent: true, confirmationSentAt: Date.now() });
      console.log(`[Confirmação] Enviado para ${apt.clientName} (${salonId})`);
    }
  } catch (e) {
    console.error('[Confirmação Cron]', e);
  }
}

// ─── CRM: Mensagem de aniversário ────────────────────────────────────────────
async function sendBirthdayMessages() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayMD = `${mm}-${dd}`; // "MM-DD"

  try {
    const salonsSnap = await adminDb.collection('salons').get();
    for (const salonDoc of salonsSnap.docs) {
      const salonId  = salonDoc.id;
      const salon    = salonDoc.data();
      const instance = `salon_${salonId}`;
      const salonName = salon.name || 'nosso salão';

      // Verifica se mensagens proativas estão habilitadas para este salão
      if (!(await isCRMProactiveEnabled(salonId))) {
        console.log(`[CRM Birthday] Mensagens proativas desabilitadas para ${salonId} — pulando`);
        continue;
      }

      const clientsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`).get();
      for (const clientDoc of clientsSnap.docs) {
        const client = clientDoc.data();
        if (!client.birthdate || !client.phone) continue;

        const clientMD = client.birthdate.slice(5); // "YYYY-MM-DD" → "MM-DD"
        if (clientMD !== todayMD) continue;

        const thisYear = today.getFullYear();
        if (client.birthdayMsgYear === thisYear) continue; // já enviou esse ano

        const firstName = (client.name || 'Cliente').split(' ')[0];
        // Usa mensagem customizada do bot_config se disponível
        const botCfgDoc2 = await adminDb.doc(`salons/${salonId}/settings/bot_config`).get().catch(() => null);
        const botCfg2 = botCfgDoc2?.data() as any || {};
        const bdayTemplate = botCfg2.birthdayMessage ||
          `🎂 Feliz aniversário, {{nome}}!\n\nToda a equipe do *{{salao}}* deseja um dia incrível para você! 🥳🎉\n\nQue tal comemorar com a gente? Venha nos visitar! 💖`;
        const msg = bdayTemplate.replace(/{{nome}}/g, firstName).replace(/{{salao}}/g, salonName);

        await sendWhatsApp(client.phone, msg, instance);
        await clientDoc.ref.update({ birthdayMsgYear: thisYear });
        console.log(`[CRM Birthday] Enviado para ${client.name} (${salonId})`);
      }
    }
  } catch (e) {
    console.error('[CRM Birthday]', e);
  }
}

// ─── CRM: Reengajamento (45 dias sem visita) ─────────────────────────────────
async function checkReengagement() {
  const cutoff45   = Date.now() - 45 * 24 * 60 * 60 * 1000;
  const cooldown30 = 30 * 24 * 60 * 60 * 1000;

  try {
    const salonsSnap = await adminDb.collection('salons').get();
    for (const salonDoc of salonsSnap.docs) {
      const salonId   = salonDoc.id;
      const salon     = salonDoc.data();
      const instance  = `salon_${salonId}`;
      const salonName = salon.name || 'nosso salão';

      // Verifica se mensagens proativas estão habilitadas para este salão
      if (!(await isCRMProactiveEnabled(salonId))) {
        console.log(`[CRM Reengajamento] Mensagens proativas desabilitadas para ${salonId} — pulando`);
        continue;
      }

      const clientsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`).get();
      for (const clientDoc of clientsSnap.docs) {
        const client = clientDoc.data();
        if (!client.phone || !client.lastVisit) continue;
        if (client.status === 'inactive') continue;
        if (client.lastVisit > cutoff45) continue; // visitou nos últimos 45 dias

        const lastSent = client.lastReengagementSent || 0;
        if (Date.now() - lastSent < cooldown30) continue; // cooldown de 30 dias

        const firstName = (client.name || 'Cliente').split(' ')[0];
        const diasSem   = Math.floor((Date.now() - client.lastVisit) / (24 * 60 * 60 * 1000));
        const msg =
          `Oi, ${firstName}! 😊\n\n` +
          `Faz um tempinho que a gente não se vê no *${salonName}* e sentimos sua falta!\n\n` +
          `Que tal agendar um horário? Estamos prontos para te atender com todo o carinho de sempre. ✨\n\n` +
          `É só responder essa mensagem ou acessar nosso site para agendar!`;

        await sendWhatsApp(client.phone, msg, instance);
        await clientDoc.ref.update({ lastReengagementSent: Date.now() });
        console.log(`[CRM Reengajamento] ${client.name} — ${diasSem} dias sem visita (${salonId})`);
      }
    }
  } catch (e) {
    console.error('[CRM Reengajamento]', e);
  }
}

// ─── CRM Pro: Follow-up pós-serviço ──────────────────────────────────────────
async function checkPostServiceFollowup() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  try {
    const salonsSnap = await adminDb.collection('salons').get();

    for (const salonDoc of salonsSnap.docs) {
      const salonId  = salonDoc.id;
      const salon    = salonDoc.data() as any;
      const instance = salon?.whatsappInstance || `salon_${salonId}`;

      // Verifica se mensagens proativas estão habilitadas para este salão
      if (!(await isCRMProactiveEnabled(salonId))) {
        console.log(`[PostService FollowUp] Mensagens proativas desabilitadas para ${salonId} — pulando`);
        continue;
      }

      const seqSnap = await adminDb
        .collection(`salons/${salonId}/crm_postservice_sequences`)
        .where('active', '==', true)
        .get();
      if (seqSnap.empty) continue;

      const clientsSnap = await adminDb
        .collection(`salons/${salonId}/crm_clients`)
        .get();

      for (const clientDoc of clientsSnap.docs) {
        const client = clientDoc.data() as any;
        if (!client.phone || !client.lastServiceDate) continue;

        const daysSinceService = (now - client.lastServiceDate) / dayMs;

        for (const seqDoc of seqSnap.docs) {
          const seq = seqDoc.data() as any;

          // Tolerância de 12 horas em torno do dia-alvo
          if (Math.abs(daysSinceService - seq.delayDays) > 0.5) continue;

          // Verifica se já enviou para este ciclo de serviço
          const alreadySent = await adminDb
            .collection(`salons/${salonId}/crm_clients/${clientDoc.id}/postservice_sent`)
            .where('sequenceId', '==', seqDoc.id)
            .where('serviceDate', '==', client.lastServiceDate)
            .limit(1)
            .get();
          if (!alreadySent.empty) continue;

          try {
            const firstName = (client.name || 'você').split(' ')[0];
            const msg = (seq.message as string).replace(/\{\{nome\}\}/gi, firstName);

            await sendWhatsApp(client.phone.replace(/\D/g, ''), msg, instance);

            await adminDb
              .collection(`salons/${salonId}/crm_clients/${clientDoc.id}/postservice_sent`)
              .add({ sequenceId: seqDoc.id, serviceDate: client.lastServiceDate, sentAt: now, message: msg });

            await adminDb
              .collection(`salons/${salonId}/crm_clients/${clientDoc.id}/messages`)
              .add({ text: `✂️ [Pós-serviço +${seq.delayDays}d] ${msg}`, from: 'bot', timestamp: now });

            console.log(`[PostService] ${client.name} — ${seq.name} (${salonId})`);
          } catch (e: any) {
            console.error(`[PostService] Erro para ${client.name}:`, e.message);
          }
        }
      }
    }
  } catch (e) {
    console.error('[PostService Cron]', e);
  }
}

// ─── CRM: Upgrade automático para VIP ────────────────────────────────────────
// Critério: 8+ visitas OU R$1.000+ gastos
async function upgradeVIPClients() {
  const VIP_VISITS = 8;
  const VIP_SPENT  = 1000;

  try {
    const salonsSnap = await adminDb.collection('salons').get();
    for (const salonDoc of salonsSnap.docs) {
      const salonId  = salonDoc.id;
      const instance = `salon_${salonId}`;

      const clientsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`).get();
      for (const clientDoc of clientsSnap.docs) {
        const client = clientDoc.data();
        if (client.status === 'vip' || client.status === 'inactive') continue;

        const isVIP =
          (client.totalVisits || 0) >= VIP_VISITS ||
          (client.totalSpent  || 0) >= VIP_SPENT;

        if (!isVIP) continue;

        await clientDoc.ref.update({ status: 'vip', updatedAt: Date.now() });
        console.log(`[CRM VIP] ${client.name} promovido a VIP (${salonId})`);

        // Avisa o dono pelo WhatsApp
        const businessDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
        const business    = businessDoc.data() as any;
        if (business?.whatsapp) {
          await sendWhatsApp(
            business.whatsapp,
            `⭐ *Novo cliente VIP!*\n\n` +
            `*${client.name}* atingiu o status VIP no seu CRM!\n` +
            `Visitas: ${client.totalVisits || 0} | Total gasto: R$ ${Number(client.totalSpent || 0).toFixed(2)}\n\n` +
            `Que tal mandar uma mensagem especial para ele? 🥰`,
            instance
          );
        }
      }
    }
  } catch (e) {
    console.error('[CRM VIP Upgrade]', e);
  }
}

// ─── CRM: Auto-cadastro quando agendamento é COMPLETED ───────────────────────
// ─── Universal client upsert (phone as primary key) ─────────────────────────
/**
 * Cria ou atualiza um cliente em crm_clients usando o telefone como chave universal.
 * Usado por agendamentos, anamnese, fichas de cliente e qualquer ponto de entrada.
 */
async function upsertClientByPhone(salonId: string, phone: string, data: {
  name?: string;
  email?: string;
  birthdate?: string;
  allergies?: string;
  notes?: string;
  source?: string;
  // contadores opcionais (agendamento)
  addVisit?: boolean;
  addSpent?: number;
  // texto da mensagem recebida (opcional) — salva no histórico e avança o funil
  text?: string;
}) {
  const text = data.text;
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 8) return null;

  try {
    const existing = await adminDb.collection(`salons/${salonId}/crm_clients`)
      .where('phone', '==', cleanPhone).limit(1).get();

    const now = Date.now();

    if (!existing.empty) {
      const docRef = existing.docs[0];
      const current = docRef.data();
      const patch: any = { updatedAt: now };
      if (data.name && !current.name) patch.name = data.name;
      if (data.email && !current.email) patch.email = data.email;
      if (data.birthdate && !current.birthdate) patch.birthdate = data.birthdate;
      if (data.allergies) patch.allergies = data.allergies;
      if (data.addVisit) {
        patch.totalVisits = (current.totalVisits || 0) + 1;
        patch.lastVisit = now;
      }
      if (data.addSpent) patch.totalSpent = (current.totalSpent || 0) + data.addSpent;
      await docRef.ref.update(patch);
      console.log(`[CRM Universal] Atualizado: ${cleanPhone} (${salonId})`);

      // Salva mensagem e avança funil automaticamente
      if (text) {
        try {
          const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
            .where('phone', '==', cleanPhone).limit(1).get();
          if (!crmSnap.empty) {
            const crmDoc = crmSnap.docs[0];
            const crmData = crmDoc.data() as any;
            
            // Salva mensagem
            await adminDb.collection(`salons/${salonId}/crm_clients/${crmDoc.id}/messages`).add({
              text, from: 'client', timestamp: Date.now(),
            });

            // Auto-progressão do funil: lead → prospect quando inicia conversa
            if (crmData.status === 'lead') {
              await crmDoc.ref.update({ status: 'prospect', updatedAt: Date.now() });
            }
            // prospect → client quando agenda (detectado pelo texto)
            const tLower = text.toLowerCase();
            const bookedKeywords = ['confirmado', 'agendado', 'combinado', 'fechou', 'obrigad'];
            if (crmData.status === 'prospect' && bookedKeywords.some(k => tLower.includes(k))) {
              await crmDoc.ref.update({ status: 'client', updatedAt: Date.now() });
            }
          }
        } catch {}
      }
      return docRef.id;
    } else {
      const ref = await adminDb.collection(`salons/${salonId}/crm_clients`).add({
        salonId,
        name:        data.name || 'Cliente',
        phone:       cleanPhone,
        email:       data.email || '',
        birthdate:   data.birthdate || '',
        allergies:   data.allergies || '',
        notes:       data.notes || '',
        status:      'client',
        tags:        [],
        source:      data.source || 'sistema',
        totalVisits: data.addVisit ? 1 : 0,
        totalSpent:  data.addSpent || 0,
        lastVisit:   data.addVisit ? now : null,
        createdAt:   now,
        updatedAt:   now,
      });
      console.log(`[CRM Universal] Criado: ${cleanPhone} (${salonId})`);
      return ref.id;
    }
  } catch (e) {
    console.error('[CRM Universal Upsert]', e);
    return null;
  }
}

async function upsertCRMClient(salonId: string, apt: any) {
  const phone = (apt.customerPhone || '').replace(/\D/g, '');
  if (!phone || !apt.clientName) return;
  await upsertClientByPhone(salonId, phone, {
    name: apt.clientName,
    email: apt.customerEmail || '',
    source: 'agendamento',
    addVisit: true,
    addSpent: apt.totalAmount || 0,
  });
}

// ─── CRM Pro: Bot empático com IA por salão ──────────────────────────────────
async function handleCRMProBot(salonId: string, clientPhone: string, clientName: string, text: string, isFirstMsg: boolean): Promise<string | null> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  if (!GROQ_API_KEY) return null;

  try {
    // Carrega contexto do salão
    const salonDoc = await adminDb.doc(`salons/${salonId}`).get();
    const salon = salonDoc.data() as any;
    const salonName = salon?.name || 'nosso negócio';
    const businessType = salon?.businessType || 'beauty';
    const bizLabel: Record<string, string> = {
      beauty: 'salão de beleza', health: 'clínica', fitness: 'estúdio fitness',
      services: 'prestador de serviços', sports: 'espaço esportivo',
    };

    // Carrega histórico recente do cliente (últimas 10 mensagens)
    const msgsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
      .where('phone', '==', clientPhone).limit(1).get();
    let recentHistory = '';
    if (!msgsSnap.empty) {
      const clientDoc = msgsSnap.docs[0];
      const histSnap = await adminDb.collection(`salons/${salonId}/crm_clients/${clientDoc.id}/messages`)
        .orderBy('timestamp', 'desc').limit(10).get();
      const msgs = histSnap.docs.reverse().map(d => {
        const m = d.data() as any;
        return `${m.from === 'client' ? clientName : salonName}: ${m.text}`;
      });
      recentHistory = msgs.join('\n');
    }

    // Carrega configurações de mensagem personalizada do salão
    const settingsDoc = await adminDb.doc(`salons/${salonId}/settings/notifications`).get();
    const customPersonality = settingsDoc.data()?.crmBotPersonality || '';

    // Carrega contexto do bot configurado pela dona
    const ctxDoc = await adminDb.doc(`salons/${salonId}/settings/crm_bot_context`).get();
    const botCtx = ctxDoc.data() as any || {};
    const ctxBlock = [
      botCtx.businessName ? `Nome do negócio: ${botCtx.businessName}` : '',
      botCtx.businessDescription ? `O que fazemos: ${botCtx.businessDescription}` : '',
      botCtx.pricing ? `Serviços e preços:\n${botCtx.pricing}` : '',
      botCtx.workingHours ? `Horários: ${botCtx.workingHours}` : '',
      botCtx.specialInstructions ? `Instruções especiais:\n${botCtx.specialInstructions}` : '',
    ].filter(Boolean).join('\n\n');

    const systemPrompt = `Você é o assistente virtual de ${botCtx.businessName || salonName}, um ${bizLabel[businessType] || 'negócio'} brasileiro.

${ctxBlock ? `## Informações do negócio\n${ctxBlock}\n\n` : ''}Sua personalidade:
- ${botCtx.botPersonality || 'Empática, calorosa e genuinamente interessada na cliente'}
- Cria relacionamento antes de vender — nunca pareça robô ou fria
- Use o nome da cliente quando souber
- Use emojis com naturalidade (não exagere)
- Resposta curta e natural como uma conversa de WhatsApp (máximo 3 frases)
- Nunca diga "como posso te ajudar" de forma genérica — seja específica
- Se a cliente não respondeu antes (follow-up), seja leve e natural, não pressione
${customPersonality ? `\nPersonalidade adicional:\n${customPersonality}` : ''}

${isFirstMsg ? `Esta é a PRIMEIRA mensagem desta cliente. Dê boas-vindas de forma calorosa e pessoal.` : ''}

Histórico recente:
${recentHistory || '(sem histórico anterior)'}`;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${clientName}: ${text}` },
        ],
      }),
    });
    const data = await resp.json() as any;
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error('[CRMProBot]', e);
    return null;
  }
}

// ─── CRM Pro: Follow-up pós-serviço automático ───────────────────────────────
async function runCRMProFollowUps() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  try {
    // Busca todos os salões com CRM Pro ativo
    const salonsSnap = await adminDb.collection('salons').get();
    for (const salonDoc of salonsSnap.docs) {
      const salonId = salonDoc.id;
      const salonData = salonDoc.data() as any;
      const salonName = salonData.name || 'Nós';
      const instanceName = `salon_${salonId}`;

      // Verifica se mensagens proativas estão habilitadas para este salão
      if (!(await isCRMProactiveEnabled(salonId))) {
        console.log(`[CRMPro FollowUp] Mensagens proativas desabilitadas para ${salonId} — pulando`);
        continue;
      }

      try {
        // Busca clientes com lastServiceDate configurada
        const clientsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
          .where('status', 'in', ['client', 'vip', 'prospect']).get();

        for (const clientDoc of clientsSnap.docs) {
          const c = clientDoc.data() as any;
          if (!c.phone || !c.lastServiceDate) continue;

          const daysSince = Math.floor((now - c.lastServiceDate) / dayMs);
          const followUpDays: number[] = c.followUpDays || [7, 30];
          const alreadySent: number[] = c.followUpSent || [];

          for (const day of followUpDays) {
            if (daysSince >= day && !alreadySent.includes(day)) {
              const firstName = (c.name || '').split(' ')[0] || 'cliente';
              let msg = '';

              if (day <= 7) {
                msg = `Oi ${firstName}! 😊 Passaram ${day} dias desde o seu atendimento. Espero que tenha gostado! Como ficou? 💜 — *${salonName}*`;
              } else if (day <= 30) {
                msg = `Oi ${firstName}! Faz ${day} dias desde sua última visita. Bate aquela saudade! 😄 Quando vem nos ver de novo? — *${salonName}*`;
              } else {
                msg = `${firstName}, já faz ${day} dias! 💜 Você ficou linda da última vez. Vamos marcar de novo? — *${salonName}*`;
              }

              await sendWhatsApp(c.phone, msg, instanceName).catch(() => {});
              await adminDb.collection(`salons/${salonId}/crm_clients/${clientDoc.id}/messages`).add({
                text: msg, from: 'bot', timestamp: now, type: 'post_service_followup', day,
              }).catch(() => {});
              await clientDoc.ref.update({
                followUpSent: [...alreadySent, day], updatedAt: now,
              }).catch(() => {});
              console.log(`[CRMPro FollowUp] ${salonId}/${c.phone}: ${day} dias`);
              break; // Só um follow-up por execução
            }
          }
        }

        // ── Aniversário ────────────────────────────────────────────────────
        const today = new Date();
        const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const birthSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
          .where('birthdayMMDD', '==', todayMMDD).get();
        for (const bDoc of birthSnap.docs) {
          const b = bDoc.data() as any;
          if (!b.phone) continue;
          const alreadySentToday = b.lastBirthdayYear === today.getFullYear();
          if (alreadySentToday) continue;

          const firstName = (b.name || '').split(' ')[0] || 'cliente';
          const msg = `🎂 *Feliz aniversário, ${firstName}!* 🎉\n\nQue seu dia seja incrível! É uma alegria ter você como cliente. Você tem um presente especial esperando por você 💜\n— *${salonName}*`;

          await sendWhatsApp(b.phone, msg, instanceName).catch(() => {});
          await bDoc.ref.update({ lastBirthdayYear: today.getFullYear(), updatedAt: now }).catch(() => {});
          await adminDb.collection(`salons/${salonId}/crm_clients/${bDoc.id}/messages`).add({
            text: msg, from: 'bot', timestamp: now, type: 'birthday',
          }).catch(() => {});
          console.log(`[CRMPro Birthday] ${salonId}/${b.phone}`);
        }

      } catch (e) {
        console.error(`[CRMPro FollowUp] Erro salão ${salonId}:`, e);
      }
    }
  } catch (e) {
    console.error('[CRMPro FollowUp] Erro geral:', e);
  }
}

// ─── CRM Pro: Alerta diário de tarefas ───────────────────────────────────────
async function sendCRMProDailyAlerts() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  try {
    const salonsSnap = await adminDb.collection('salons').get();
    for (const salonDoc of salonsSnap.docs) {
      const salonId = salonDoc.id;
      const salonData = salonDoc.data() as any;
      if (!salonData.adminPhone) continue;

      try {
        const instanceName = `salon_${salonId}`;
        const tasks: string[] = [];

        // Leads sem resposta há 3+ dias
        const leadsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
          .where('status', '==', 'lead').get();
        const coldLeads = leadsSnap.docs.filter(d => {
          const last = (d.data() as any).lastContact || 0;
          return (now - last) > 3 * dayMs;
        });
        if (coldLeads.length > 0)
          tasks.push(`🔥 *${coldLeads.length} lead(s) sem resposta há 3+ dias* — retome o contato!`);

        // Clientes com follow-up pendente hoje
        const clientsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
          .where('status', 'in', ['client', 'vip', 'prospect']).get();
        let followupPending = 0;
        let birthdaysToday = 0;
        const today = new Date();
        const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        for (const doc of clientsSnap.docs) {
          const c = doc.data() as any;
          if (c.birthdayMMDD === todayMMDD && c.lastBirthdayYear !== today.getFullYear()) birthdaysToday++;
          if (!c.lastServiceDate) continue;
          const daysSince = Math.floor((now - c.lastServiceDate) / dayMs);
          const followUpDays: number[] = c.followUpDays || [7, 30];
          const alreadySent: number[] = c.followUpSent || [];
          const hasPending = followUpDays.some(d => daysSince >= d && !alreadySent.includes(d));
          if (hasPending) followupPending++;
        }

        if (followupPending > 0)
          tasks.push(`📬 *${followupPending} follow-up(s) pendente(s)* — mensagens serão enviadas automaticamente`);
        if (birthdaysToday > 0)
          tasks.push(`🎂 *${birthdaysToday} aniversariante(s) hoje* — parabéns enviado automaticamente`);

        // Prospects parados há 7+ dias
        const prospectsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
          .where('status', '==', 'prospect').get();
        const stuckProspects = prospectsSnap.docs.filter(d => {
          const last = (d.data() as any).lastContact || 0;
          return (now - last) > 7 * dayMs;
        });
        if (stuckProspects.length > 0)
          tasks.push(`⚠️ *${stuckProspects.length} prospect(s) parado(s) há 7+ dias*`);

        if (tasks.length === 0) return;

        const alertMsg = `📋 *Resumo do seu CRM — ${today.toLocaleDateString('pt-BR')}*\n\n${tasks.join('\n\n')}\n\n_Acesse o painel para mais detalhes_ 💜`;
        await sendWhatsApp(salonData.adminPhone, alertMsg, instanceName).catch(() => {});
        console.log(`[CRMPro Alert] ${salonId}: ${tasks.length} tarefas`);

      } catch (e) {
        console.error(`[CRMPro Alert] Erro salão ${salonId}:`, e);
      }
    }
  } catch (e) {
    console.error('[CRMPro Alert] Erro geral:', e);
  }
}

// ─── Cron: CRM Pro follow-up + aniversário (diário às 9h) ────────────────────
cron.schedule('0 9 * * *', () => {
  runCRMProFollowUps().catch(console.error);
  sendCRMProDailyAlerts().catch(console.error);
});
const botConversations = new Map<string, { messages: any[]; lastAt: number }>();

// ─── Bot: follow-up timers (30 min sem agendamento) ──────────────────────────
const followUpTimers = new Map<string, NodeJS.Timeout>();
const followUpSent   = new Set<string>();
// Timestamp (ms) de quando cada instância Baileys conectou — usado para rejeitar msgs históricas
const instanceConnectedAt = new Map<string, number>();
const BOT_GLOBAL_START = Date.now(); // nunca processa msg anterior ao start do servidor

// Carrega connectedAt persistido do Firestore (sobrevive a restarts)
;(async () => {
  try {
    const salonsSnap = await adminDb.collection('salons').select().get();
    for (const s of salonsSnap.docs) {
      const stateDoc = await adminDb.doc(`salons/${s.id}/settings/bot_state`).get().catch(() => null);
      const connectedAt = stateDoc?.data()?.connectedAt;
      if (connectedAt && typeof connectedAt === 'number') {
        const instanceName = `salon_${s.id}`;
        instanceConnectedAt.set(instanceName, connectedAt);
      }
    }
    console.log(`[Bot] connectedAt restaurado para ${instanceConnectedAt.size} instância(s) do Firestore.`);
  } catch (e) {
    console.error('[Bot] Erro ao restaurar connectedAt:', e);
  }
})();

function scheduleFollowUp(salonId: string, phone: string, instanceName: string) {
  const key = `${salonId}:${phone}`;
  // Cancela timer anterior se existir
  if (followUpTimers.has(key)) {
    clearTimeout(followUpTimers.get(key)!);
    followUpTimers.delete(key);
  }
  // Não reenvia se já enviou
  if (followUpSent.has(key)) return;

  const timer = setTimeout(async () => {
    followUpTimers.delete(key);
    // Verifica se fez agendamento no últimos 30 min
    try {
      const since = Date.now() - 35 * 60 * 1000;
      const aptSnap = await adminDb.collection(`salons/${salonId}/appointments`)
        .where('customerPhone', '==', phone)
        .where('createdAt', '>=', since)
        .limit(1).get();
      if (!aptSnap.empty) return; // já agendou

      // Busca contexto do salão
      const salonDoc = await adminDb.collection('salons').doc(salonId).get();
      const salonData = salonDoc.data() as any;
      const salonName = salonData?.name || 'nós';
      const slug = salonData?.slug || salonId;
      const APP_URL = process.env.APP_URL || 'http://localhost:3066';
      const bookingLink = `${APP_URL}/s/${slug}`;

      const msg = `Oi! 😊 Vi que você entrou em contato com *${salonName}* mas ainda não agendou.

` +
        `Posso te ajudar a marcar agora mesmo! É rápido 👇

` +
        `Digite *AGENDAR* e eu cuido de tudo pra você, ou acesse:
${bookingLink}`;

      await sendWhatsApp(phone, msg, instanceName);
      followUpSent.add(key);
      // Remove do set após 24h
      setTimeout(() => followUpSent.delete(key), 24 * 60 * 60 * 1000);
      console.log(`[FollowUp] Enviado para ${phone} (${salonId})`);
    } catch (e) {
      console.error('[FollowUp] Erro:', e);
    }
  }, 30 * 60 * 1000); // 30 minutos

  followUpTimers.set(key, timer);
}

// ─── Registra conversão do bot (contato → agendamento) ──────────────────────
async function trackBotConversion(salonId: string, phone: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Verifica se tinha contato sem agendamento
    const contactDoc = await adminDb.doc(`salons/${salonId}/bot_contacts/${phone}`).get();
    if (contactDoc.exists) {
      const data = contactDoc.data() as any;
      if (data?.status === 'contacted') {
        await adminDb.doc(`salons/${salonId}/bot_contacts/${phone}`).update({
          status: 'converted', convertedAt: Date.now(), convertedDate: today,
        });
        console.log(`[BotConversion] Convertido: ${phone} (${salonId})`);
      }
    }
  } catch {}
}

function cancelFollowUp(salonId: string, phone: string) {
  const key = `${salonId}:${phone}`;
  if (followUpTimers.has(key)) {
    clearTimeout(followUpTimers.get(key)!);
    followUpTimers.delete(key);
  }
  followUpSent.add(key); // Marca como "não precisa de follow-up"
  setTimeout(() => followUpSent.delete(key), 24 * 60 * 60 * 1000);
}

function getBotHistory(key: string) {
  const entry = botConversations.get(key);
  if (!entry) return [];
  if (Date.now() - entry.lastAt > 30 * 60 * 1000) { // 30min TTL
    botConversations.delete(key);
    return [];
  }
  return entry.messages;
}

function addBotMessage(key: string, role: 'user' | 'assistant', content: string) {
  const history = getBotHistory(key);
  history.push({ role, content });
  // mantém só as últimas 20 mensagens
  const trimmed = history.slice(-20);
  botConversations.set(key, { messages: trimmed, lastAt: Date.now() });
}

// Limpa conversas antigas a cada 30 minutos
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, val] of botConversations.entries()) {
    if (val.lastAt < cutoff) botConversations.delete(key);
  }
}, 30 * 60 * 1000);

// ─── Bot: busca dados do salão para contexto ─────────────────────────────────
async function getSalonBotContext(salonId: string) {
  const [businessDoc, salonDoc, servicesSnap, profsSnap, productsSnap, anamneseSnap, reviewsSnap] = await Promise.all([
    adminDb.doc(`salons/${salonId}/settings/business`).get(),
    adminDb.collection('salons').doc(salonId).get(),
    adminDb.collection(`salons/${salonId}/services`).where('active', '==', true).get(),
    adminDb.collection(`salons/${salonId}/professionals`).where('active', '==', true).get().catch(() => ({ docs: [] } as any)),
    adminDb.collection(`salons/${salonId}/products`).where('active', '==', true).limit(20).get().catch(() => ({ docs: [] } as any)),
    adminDb.collection(`salons/${salonId}/anamnese_templates`).where('active', '==', true).limit(3).get().catch(() => ({ docs: [] } as any)),
    adminDb.collection(`salons/${salonId}/reviews`).where('approved', '==', true).limit(50).get().catch(() => ({ docs: [] } as any)),
  ]);

  const business  = businessDoc.data() as any || {};
  const salon     = salonDoc.data()    as any || {};
  const services  = servicesSnap.docs.map(d => d.data() as any);
  const profs     = (profsSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() }) as any);
  const products  = (productsSnap as any).docs.map((d: any) => d.data() as any);
  const anamneses = (anamneseSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() }) as any);
  const reviewDocs = (reviewsSnap as any).docs.map((d: any) => d.data() as any);
  const avgRating = reviewDocs.length > 0
    ? (reviewDocs.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviewDocs.length).toFixed(1)
    : null;
  const totalReviews = reviewDocs.length;
  const reviewsText = avgRating
    ? `⭐ ${avgRating}/5 com base em ${totalReviews} avaliação${totalReviews !== 1 ? 'ões' : ''}`
    : null;

  const APP_URL = process.env.APP_URL || 'http://localhost:3066';
  const slug    = salon.slug || salonId;
  const bookingLink = `${APP_URL}/s/${slug}`;
  const storeLink   = `${APP_URL}/s/${slug}/loja`;
  const reviewsLink = `${APP_URL}/s/${slug}/avaliacoes`;

  const dayNames: Record<string, string> = {
    monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta',
    thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo',
  };
  const hoursText = Object.entries(business.workingHours || {})
    .filter(([, v]: any) => !v.closed)
    .map(([day, v]: any) => `${dayNames[day] || day}: ${v.open}–${v.close}`)
    .join('\n') || 'Consulte pelo WhatsApp';

  const servicesText = services
    .map((s: any) => `• ${s.name} — R$ ${Number(s.price).toFixed(2)} (${s.duration} min${s.description ? ' — ' + s.description : ''})`)
    .join('\n') || 'Consulte nossos serviços';

  const profsText = profs.length > 0
    ? profs.map((p: any) => `• ${p.displayName}${p.bio ? ' — ' + p.bio : ''}`).join('\n')
    : '';

  const productsText = products.length > 0
    ? products.map((p: any) => `• ${p.name} — R$ ${Number(p.price).toFixed(2)}${p.description ? ' — ' + p.description : ''}`).join('\n')
    : '';

  const addressText = [business.address, business.number, business.neighborhood, business.city, business.state]
    .filter(Boolean).join(', ') || 'Consulte pelo WhatsApp';

  const anamneseLinks = anamneses.map((a: any) =>
    `• ${a.name}: ${APP_URL}/s/${slug}/anamnese/${a.id}`
  ).join('\n');

  const businessType: string = salon.businessType || salon.type || 'beauty';

  // Labels por tipo de negócio
  const typeLabels: Record<string, { clientLabel: string; bookingLabel: string; serviceLabel: string; emoji: string }> = {
    beauty:   { clientLabel: 'cliente',  bookingLabel: 'horário',  serviceLabel: 'serviço',  emoji: '✂️' },
    health:   { clientLabel: 'paciente', bookingLabel: 'consulta', serviceLabel: 'consulta', emoji: '🏥' },
    fitness:  { clientLabel: 'aluno',    bookingLabel: 'aula',     serviceLabel: 'aula',     emoji: '💪' },
    services: { clientLabel: 'cliente',  bookingLabel: 'reunião',  serviceLabel: 'serviço',  emoji: '💼' },
    sports:   { clientLabel: 'cliente',  bookingLabel: 'reserva',  serviceLabel: 'espaço',   emoji: '🏆' },
  };
  const typeLabel = typeLabels[businessType] || typeLabels.beauty;

  return {
    business, salon, services, profs, products, anamneses, slug,
    bookingLink, storeLink, reviewsLink,
    hoursText, servicesText, profsText, productsText, addressText, anamneseLinks, avgRating, totalReviews, reviewsText,
    businessType, typeLabel,
  };
}

// ─── Booking Agent: estado de agendamento por conversa ──────────────────────
interface BookingState {
  step: 'idle' | 'service' | 'professional' | 'date' | 'time' | 'name' | 'confirm' | 'done';
  serviceId?: string;
  serviceName?: string;
  servicePrice?: number;
  serviceDuration?: number;
  professionalId?: string;
  professionalName?: string;
  date?: string;       // yyyy-MM-dd
  time?: string;       // HH:MM
  clientName?: string;
  clientPhone?: string;
}

// ── Bot de Vendas — Estado do carrinho ────────────────────────────────────────
interface CartItem { id: string; name: string; price: number; qty: number; imageUrl?: string; }
interface CartState {
  step: 'browsing' | 'cart' | 'delivery_method' | 'address' | 'schedule' | 'payment' | 'awaiting_payment' | 'done';
  items: CartItem[];
  deliveryMethod?: 'delivery' | 'pickup';
  address?: string;
  scheduledTime?: string;
  orderId?: string;
  asaasPaymentId?: string;
  pixCopyPaste?: string;
  customerName?: string;
  customerPhone?: string;
  pollCount?: number;
}

// ── Fluxo "Meus Agendamentos" — consulta, cancelamento e reagendamento ──────────
interface MyApptsState {
  step: 'list' | 'action' | 'reschedule_date' | 'reschedule_time';
  appointments?: any[];            // lista buscada do Firestore
  selectedAptId?: string;          // id do agendamento escolhido
  selectedApt?: any;               // dados completos do agendamento
  newDate?: string;                // nova data (reagendamento)
}
const myApptsStates = new Map<string, MyApptsState>();
function getMyApptsState(key: string): MyApptsState | null { return myApptsStates.get(key) || null; }
function setMyApptsState(key: string, state: MyApptsState) {
  myApptsStates.set(key, state);
  setTimeout(() => myApptsStates.delete(key), 2 * 60 * 60 * 1000); // TTL 2h
}
function clearMyApptsState(key: string) { myApptsStates.delete(key); }

const bookingStates = new Map<string, BookingState>();
// Quando o bot ofereceu "responda AQUI para agendar" (para aceitar "sim" só logo depois da oferta)
const bookingOffers = new Map<string, number>();
const cartStates = new Map<string, CartState>();
function getCartState(key: string): CartState | null { return cartStates.get(key) || null; }
function setCartState(key: string, state: CartState) {
  cartStates.set(key, state);
  setTimeout(() => cartStates.delete(key), 3 * 60 * 60 * 1000); // 3h timeout
}
function clearCartState(key: string) { cartStates.delete(key); }

function getBookingState(key: string): BookingState {
  return bookingStates.get(key) || { step: 'idle' };
}
function setBookingState(key: string, state: BookingState) {
  bookingStates.set(key, state);
  // TTL 2h
  setTimeout(() => bookingStates.delete(key), 2 * 60 * 60 * 1000);
}
function clearBookingState(key: string) {
  bookingStates.delete(key);
}


// ─── Bot Config helper ──────────────────────────────────────────────────────
async function getBotConfig(salonId: string): Promise<{
  greetingText?: string;
  menuText?: string;
  botEnabled: boolean;
  humanKeyword: string;
  offlineMessage?: string;
}> {
  try {
    const doc = await adminDb.doc(`salons/${salonId}/settings/bot_config`).get();
    const d = doc.data() as any || {};
    return {
      greetingText: d.greetingText || null,
      menuText: d.menuText || null,
      botEnabled: d.botEnabled !== false,
      humanKeyword: d.humanKeyword || 'humano',
      offlineMessage: d.offlineMessage || null,
    };
  } catch { return { botEnabled: true, humanKeyword: 'humano' }; }
}

/** Retorna saudação conforme horário de Brasília */
function getGreeting(): string {
  const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Parseia datas em PT-BR: "amanhã", "hoje", "sexta", "15/01", "15/01/2025" */
function parseDatePTBR(text: string): string | null {
  const t = text.toLowerCase().trim();
  let now: Date;
  try {
    now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  } catch {
    now = new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC-3 manual
  }
  const today = new Date(now);

  if (t.includes('hoje')) return today.toISOString().split('T')[0];

  if (t.includes('amanhã') || t.includes('amanha')) {
    today.setDate(today.getDate() + 1);
    return today.toISOString().split('T')[0];
  }

  if (t.includes('depois de amanhã') || t.includes('depois de amanha')) {
    today.setDate(today.getDate() + 2);
    return today.toISOString().split('T')[0];
  }

  const dayMap: Record<string, number> = {
    domingo: 0, dom: 0,
    segunda: 1, 'segunda-feira': 1, seg: 1,
    terça: 2, 'terça-feira': 2, terca: 2, 'terca-feira': 2, ter: 2,
    quarta: 3, 'quarta-feira': 3, qua: 3,
    quinta: 4, 'quinta-feira': 4, qui: 4,
    sexta: 5, 'sexta-feira': 5, sex: 5,
    sábado: 6, sabado: 6, sab: 6,
  };
  for (const [dayName, dayNum] of Object.entries(dayMap)) {
    if (t.includes(dayName)) {
      const d = new Date(now);
      // "próxima" força a semana seguinte mesmo se o dia já passou hoje
      const forceNext = t.includes('próxim') || t.includes('proxim');
      const diff = (dayNum - d.getDay() + 7) % 7 || (forceNext ? 7 : 7);
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }
  }

  // Mês por extenso — "dia 15 de maio", "15 maio", "15 de maio"
  const months: Record<string, number> = {
    jan:0, fev:1, mar:2, abr:3, mai:4, jun:5,
    jul:6, ago:7, set:8, out:9, nov:10, dez:11,
    janeiro:0, fevereiro:1, março:2, marco:2, abril:3, maio:4, junho:5,
    julho:6, agosto:7, setembro:8, outubro:9, novembro:10, dezembro:11,
  };
  const mMonth = t.match(/(\d{1,2})\s*(?:de\s*)?([a-záéíóúãõç]+)/);
  if (mMonth) {
    for (const [monthName, monthNum] of Object.entries(months)) {
      if (mMonth[2].startsWith(monthName.slice(0, 3))) {
        const day = parseInt(mMonth[1]);
        let year = now.getFullYear();
        const d = new Date(year, monthNum, day);
        if (d < now) d.setFullYear(year + 1); // passa pro próximo ano se já foi
        return d.toISOString().split('T')[0];
      }
    }
  }

  // dd/MM ou dd/MM/yyyy ou dd-MM-yyyy
  const mSlash = t.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/);
  if (mSlash) {
    const year = mSlash[3] ? parseInt(mSlash[3]) : now.getFullYear();
    const month = parseInt(mSlash[2]) - 1;
    const day = parseInt(mSlash[1]);
    const d = new Date(year, month, day);
    return d.toISOString().split('T')[0];
  }

  return null;
}

/** Parseia horário: "10h", "10:30", "10h30", "às 10", "1 da tarde", "meio dia" */
function parseTimePTBR(text: string): string | null {
  const t = text.toLowerCase().trim();

  // meio dia / meia noite
  if (t.includes('meio dia') || t.includes('meio-dia')) return '12:00';
  if (t.includes('meia noite') || t.includes('meia-noite')) return '00:00';

  // HH:MM ou HH:MM:SS
  let m = t.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;

  // HHhMM ou HHh
  m = t.match(/(\d{1,2})h(\d{2})?/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;

  // "às X" ou "as X"
  m = t.match(/[àa]s?\s*(\d{1,2})/);
  if (m) {
    let h = parseInt(m[1]);
    if (t.includes('tarde') && h < 12) h += 12;
    if (t.includes('noite') && h < 12) h += 12;
    return `${h.toString().padStart(2, '0')}:00`;
  }

  // "X da tarde", "X da manhã", "X da noite"
  m = t.match(/(\d{1,2})\s*(?:da|de)?\s*(tarde|manhã|manha|noite)/);
  if (m) {
    let h = parseInt(m[1]);
    if ((m[2].includes('tard') || m[2].includes('noit')) && h < 12) h += 12;
    return `${h.toString().padStart(2, '0')}:00`;
  }

  // "X horas"
  m = t.match(/(\d{1,2})\s*hora/);
  if (m) return `${m[1].padStart(2, '0')}:00`;

  // número sozinho (1–23)
  m = t.match(/^(\d{1,2})$/);
  if (m && parseInt(m[1]) <= 23) return `${m[1].padStart(2, '0')}:00`;

  return null;
}

/** Fuzzy match de serviço pelo texto do usuário */
function matchService(text: string, services: any[]): any | null {
  const t = text.toLowerCase();
  // Match exato primeiro
  for (const s of services) {
    if (t.includes(s.name.toLowerCase())) return s;
  }
  // Match por palavras-chave
  for (const s of services) {
    const words = s.name.toLowerCase().split(/\s+/);
    if (words.some((w: string) => w.length > 3 && t.includes(w))) return s;
  }
  // Match por número de opção (ex: "1", "2")
  const num = parseInt(t.trim());
  if (!isNaN(num) && num >= 1 && num <= services.length) {
    return services[num - 1];
  }
  return null;
}

/** Retorna slots disponíveis para um dia/serviço/profissional */
async function getAvailableSlots(
  salonId: string,
  date: string,
  serviceDuration: number,
  professionalId?: string,
): Promise<string[]> {
  try {
    const [businessDoc, appointmentsSnap, settingsSnap, customSnap] = await Promise.all([
      adminDb.doc(`salons/${salonId}/settings/business`).get(),
      adminDb.collection(`salons/${salonId}/appointments`)
        .where('date', '==', date)
        .where('status', 'in', ['PENDING', 'CONFIRMED', 'AWAITING_DEPOSIT'])
        .get(),
      adminDb.doc(`salons/${salonId}/settings/schedule`).get().catch(() => null),
      adminDb.collection(`salons/${salonId}/custom_appointments`)
        .where('date', '==', date).get().catch(() => null),
    ]);

    const business = businessDoc.data() as any || {};
    const d = new Date(date + 'T00:00:00');
    const dayKeys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const dayKey = dayKeys[d.getDay()];
    const hours = business.workingHours?.[dayKey];

    if (!hours || hours.closed) return [];

    const slotInterval = Number(business.slotInterval) || Number(settingsSnap?.data()?.slotInterval) || 30;
    const [openH, openM] = (hours.open || '09:00').split(':').map(Number);
    const [closeH, closeM] = (hours.close || '18:00').split(':').map(Number);
    const openMin  = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;

    const booked = appointmentsSnap.docs
      .filter(doc => !professionalId || doc.data().professionalId === professionalId)
      .map(doc => {
        const ap = doc.data();
        const [h, m] = (ap.startTime || '00:00').split(':').map(Number);
        const start = h * 60 + m;
        let end = start + (Number(ap.duration) || serviceDuration);
        if (ap.endTime) {
          const [eh, em] = String(ap.endTime).split(':').map(Number);
          if (!isNaN(eh) && !isNaN(em) && eh * 60 + em > start) end = eh * 60 + em;
        }
        return { start, end };
      });

    // Agendamentos com procedimentos (bloqueiam a agenda do profissional ou de todos)
    customSnap?.docs.forEach(doc => {
      const ca = doc.data() as any;
      if (ca.status === 'cancelled') return;
      if (professionalId && ca.professionalId && ca.professionalId !== professionalId) return;
      const [h, m] = (ca.startTime || '00:00').split(':').map(Number);
      booked.push({ start: h * 60 + m, end: h * 60 + m + (Number(ca.totalDurationMinutes) || serviceDuration) });
    });

    // Bloquear horário de almoço configurado pelo profissional/salão
    if (hours.lunchStart && hours.lunchEnd) {
      const [lhS, lmS] = hours.lunchStart.split(':').map(Number);
      const [lhE, lmE] = hours.lunchEnd.split(':').map(Number);
      booked.push({ start: lhS * 60 + lmS, end: lhE * 60 + lmE });
    }

    const slots: string[] = [];
    // Usa horário de Brasília para comparação com "hoje"
    const nowBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const nowMin = nowBR.getHours() * 60 + nowBR.getMinutes();
    const todayBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const isToday = date === todayBR;

    // Itera todos os slots dentro do horário de funcionamento.
    // O último slot do dia é SEMPRE incluído mesmo que o serviço
    // ultrapasse o horário de fechamento — o profissional se vira depois.
    for (let min = openMin; min < closeMin; min += slotInterval) {
      if (isToday && min <= nowMin + 30) continue; // margem de 30min para agendamentos no mesmo dia

      // Verifica conflito somente com agendamentos existentes e almoço
      const conflict = booked.some(b => min < b.end && min + serviceDuration > b.start);
      if (!conflict) {
        const h = Math.floor(min / 60);
        const m = min % 60;
        slots.push(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`);
      }
    }
    return slots; // retorna TODOS os horários disponíveis sem limite artificial
  } catch { return []; }
}

/** Cria um agendamento "guest" pelo bot */
async function createBotAppointment(salonId: string, state: BookingState, initialStatus: string = 'CONFIRMED'): Promise<string> {
  const now = Date.now();
  const [h, m] = (state.time!).split(':').map(Number);
  const endMin = h * 60 + m + (state.serviceDuration || 60);
  const endTime = `${Math.floor(endMin/60).toString().padStart(2,'0')}:${(endMin%60).toString().padStart(2,'0')}`;

  const clientId = `bot_${state.clientPhone?.replace(/\D/g,'')||'guest'}_${now}`;

  const apt = {
    salonId,
    clientId,
    clientName: state.clientName || 'Cliente Bot',
    customerPhone: state.clientPhone || '',
    professionalId: state.professionalId || '',
    professionalName: state.professionalName || '',
    serviceId: state.serviceId || '',
    serviceName: state.serviceName || '',
    date: state.date!,
    startTime: state.time!,
    endTime,
    duration: state.serviceDuration || 60,
    status: initialStatus,
    totalAmount: state.servicePrice || 0,
    notes: 'Agendado via WhatsApp Bot',
    reminderSent: false,
    createdAt: now,
    updatedAt: now,
    source: 'whatsapp_bot',
  };

  const ref = await adminDb.collection(`salons/${salonId}/appointments`).add(apt);

  // Auto-sync CRM
  if (state.clientPhone) {
    // Always sync to CRM when booking completes — regardless of plan
    await upsertClientByPhone(salonId, state.clientPhone, {
      name: state.clientName,
      source: 'bot_agendamento',
    });
  }

  // SMS de confirmação para o cliente após agendamento pelo bot
  if (state.clientPhone) {
    const [y2, m2, d2] = state.date!.split('-');
    await sendSMS(state.clientPhone,
      `Agendamento confirmado! ${state.serviceName} em ${d2}/${m2}/${y2} as ${state.time}. Ate logo!`
    );
  }

  // SMS para o profissional
  if (state.professionalId) {
    try {
      const profDoc = await adminDb.collection(`salons/${salonId}/professionals`)
        .doc(state.professionalId).get();
      const profPhone = profDoc.data()?.phone || '';
      if (profPhone) {
        const [y2, m2, d2] = state.date!.split('-');
        await sendSMS(profPhone,
          `Novo agendamento via WhatsApp! ${state.clientName} — ${state.serviceName} em ${d2}/${m2}/${y2} as ${state.time}.`
        );
      }
    } catch { /* sem phone */ }
  }

  // ── Notifica dono do salão ────────────────────────────────────────────────
  try {
    const bizDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
    const biz = bizDoc.data() as any;
    const ownerPhone = await getOwnerNotificationPhone(salonId);
    if (ownerPhone) {
      const [y2, m2, d2] = state.date!.split('-');
      const ownerMsg = `🔔 *Novo agendamento pelo Bot!*

` +
        `👤 ${state.clientName} (${state.clientPhone})
` +
        `✂️ ${state.serviceName}
` +
        `📅 ${d2}/${m2}/${y2} às ${state.time}
` +
        (state.professionalName ? `👥 ${state.professionalName}
` : '') +
        `💰 R$ ${Number(state.servicePrice||0).toFixed(2)}`;
      await sendWhatsApp(ownerPhone, ownerMsg, SUPPORT_INSTANCE);
    }
  } catch { /* sem phone do dono */ }

  // ── Envia anamnese para clínicas e negócios de saúde ─────────────────────
  try {
    const salonSnap = await adminDb.collection('salons').doc(salonId).get();
    const salonData2 = salonSnap.data() as any;
    const bType = salonData2?.businessType || 'beauty';
    const needsAnamnese = ['health', 'fitness', 'services'].includes(bType);

    if (needsAnamnese && state.clientPhone) {
      const anamneseSnap = await adminDb.collection(`salons/${salonId}/anamnese_templates`)
        .where('active', '==', true).limit(1).get();
      if (!anamneseSnap.empty) {
        const tmpl = anamneseSnap.docs[0];
        const APP_URL2 = process.env.APP_URL || 'http://localhost:3066';
        const link = `${APP_URL2}/anamnese/${salonId}/${tmpl.id}`;
        await new Promise(r => setTimeout(r, 2000)); // pequeno delay
        await sendWhatsApp(
          state.clientPhone,
          `📋 *Antes da sua consulta*, preencha nossa ficha de anamnese — é rápido e nos ajuda a te atender melhor!

👉 ${link}`,
          `salon_${salonId}`
        );
      }
    }
  } catch { /* silencioso */ }

  // ── Cancela follow-up (cliente já agendou) ────────────────────────────────
  if (state.clientPhone) {
    cancelFollowUp(salonId, state.clientPhone.replace(/\D/g, ''));
  }

  return ref.id;
}

/** Fluxo completo do agendamento via bot */
async function handleBookingFlow(
  salonId: string,
  from: string,
  text: string,
  ctx: any,
): Promise<string | null> {
  const stateKey = `booking:${salonId}:${from}`;
  const state = getBookingState(stateKey);
  const t = text.toLowerCase().trim();

  // Cancela o fluxo
  if (['cancelar', 'cancel', 'sair', 'menu', '0'].includes(t)) {
    clearBookingState(stateKey);
    return null; // volta para o menu principal
  }

  const { services, profs, bookingLink } = ctx;

  // ── STEP: idle → detecta intenção de agendar ─────────────────────────────
  if (state.step === 'idle') {
    // ── 1. Usuário quer agendar pelo bot (resposta "AQUI" ou similar) ──────
    const offeredAt = bookingOffers.get(stateKey) || 0;
    const offerFresh = Date.now() - offeredAt < 15 * 60 * 1000;
    const wantsBotFlow =
      t === 'aqui' || ((t === 'sim' || t === 's') && offerFresh) ||
      t.includes('por aqui') || t.includes('pelo zap') || t.includes('pelo whats') ||
      t.includes('me ajud') || t.includes('aqui mesmo') || t.includes('pode ajud');

    if (wantsBotFlow) {
      if (services.length === 0) return `Para agendar acesse: ${bookingLink}`;
      const list = services
        .map((sv: any, i: number) => `${i + 1}️⃣ *${sv.name}* — R$ ${Number(sv.price).toFixed(2)} (${sv.duration}min)`)
        .join('\n');
      setBookingState(stateKey, { step: 'service', clientPhone: from });
      return `📅 *Ótimo! Vamos agendar!*

Qual serviço você quer?

${list}

0️⃣ Cancelar`;
    }

    // ── 2. Quer agendar diretamente pelo bot (já diz "por aqui" na primeira msg) ──
    const wantsBookingHere =
      (t.includes('agend') || t.includes('marcar') || t.includes('reserv') || t.includes('consulta')) &&
      (t.includes('aqui') || t.includes('pelo zap') || t.includes('whats') || t.includes('por aqui'));

    if (wantsBookingHere) {
      if (services.length === 0) return `Para agendar acesse: ${bookingLink}`;
      const list = services
        .map((sv: any, i: number) => `${i + 1}️⃣ *${sv.name}* — R$ ${Number(sv.price).toFixed(2)} (${sv.duration}min)`)
        .join('\n');
      setBookingState(stateKey, { step: 'service', clientPhone: from });
      return `📅 *Claro! Vamos agendar pelo WhatsApp!*

Escolha o serviço:

${list}

0️⃣ Cancelar`;
    }

    // ── 3. Frase completa: serviço + data + horário de uma vez ──────────────────
    // (ex: "quero um degrade na sexta às 14h")
    // Só tenta se a mensagem tem PELO MENOS uma pista de data OU horário, + serviço
    try {
      const parsedDate = parseDatePTBR(text);
      const parsedTime = parseTimePTBR(text);
      if (parsedDate || parsedTime) {
        const matched = matchService(text, services);
        if (matched) {
          const safeProfs = Array.isArray(ctx.profs) ? ctx.profs : [];
          const prof = safeProfs.length === 1 ? safeProfs[0] : null;
          const shortcutFree = (parsedDate && parsedTime && prof)
            ? (await getAvailableSlots(salonId, parsedDate, matched.duration || 30, prof.id)).includes(parsedTime)
            : false;
          if (parsedDate && parsedTime && prof && shortcutFree) {
            setBookingState(stateKey, {
              step: 'name', clientPhone: from,
              serviceId: matched.id, serviceName: matched.name,
              servicePrice: matched.price, serviceDuration: matched.duration,
              professionalId: prof.id, professionalName: prof.displayName,
              date: parsedDate, time: parsedTime,
            });
            return `✂️ *${matched.name}* · 📅 ${parsedDate.split('-').reverse().join('/')} às ${parsedTime}

Perfeito! Para finalizar, qual é o seu *nome completo*?

0️⃣ Cancelar`;
          }
          if (parsedDate) {
            const slots = await getAvailableSlots(salonId, parsedDate, matched.duration || 30, prof?.id);
            const dd = parsedDate.split('-').reverse().join('/');
            if (!slots.length) return `😕 Sem horários em ${dd}. Tente outra data!

0️⃣ Cancelar`;
            setBookingState(stateKey, {
              step: 'time', clientPhone: from,
              serviceId: matched.id, serviceName: matched.name,
              servicePrice: matched.price, serviceDuration: matched.duration,
              professionalId: prof?.id, professionalName: prof?.displayName, date: parsedDate,
            });
            if (parsedTime && slots.includes(parsedTime)) {
              setBookingState(stateKey, { ...getBookingState(stateKey), step: 'name', time: parsedTime });
              return `🕐 *${parsedTime}* — ótimo!

Para finalizar, qual é o seu *nome completo*?

0️⃣ Cancelar`;
            }
            return `📅 *${dd}* — Horários disponíveis:

🕐 ${slots.join(' · ')}

Qual horário prefere?

0️⃣ Cancelar`;
          }
        }
      }
    } catch (e) {
      console.error('[BookingFlow frase completa]', e);
      // continua normalmente
    }

    // ── 4. Consulta de disponibilidade com data mencionada → responde de forma natural ─
    // Detecta frases como: "tem horario pra segunda?", "teria vaga amanha?", "salve, consegue encaixar sexta?"
    const availabilityKeywords = [
      'tem horario', 'tem horário', 'teria horario', 'teria horário',
      'tem vaga', 'teria vaga', 'tem como', 'consegue encaixar',
      'encaixar', 'disponivel', 'disponível', 'livre', 'aberto',
      'tem agenda', 'teria agenda', 'tem espaço', 'consegue',
    ];
    const hasAvailabilityIntent = availabilityKeywords.some(k => t.includes(k));
    const dateFromMsg = parseDatePTBR(text);

    if (hasAvailabilityIntent && dateFromMsg) {
      // Usa a duração do primeiro serviço disponível como referência, ou 30min
      const refDuration = services[0]?.duration || 30;
      const slots = await getAvailableSlots(salonId, dateFromMsg, refDuration);
      const dd = dateFromMsg.split('-').reverse().join('/');
      const saudacao = getGreeting();

      if (!slots.length) {
        return (
          `${saudacao}! 😊

` +
          `Infelizmente não tem horários disponíveis em *${dd}*. 😕

` +
          `Quer tentar outra data? É só mandar qual dia te interessa!`
        );
      }

      bookingOffers.set(stateKey, Date.now());
      // Mostra todos os slots disponíveis sem limite artificial
      const displaySlots = slots.join(' · ');
      return (
        `${saudacao}! 😊

` +
        `📅 *${dd}* — Horários disponíveis:

` +
        `🕐 ${displaySlots}

` +
        `Quer agendar? Acesse o link ou responda *AQUI* que faço pelo WhatsApp mesmo! 😊

` +
        `🔗 ${bookingLink}`
      );
    }

    // ── 5. Quer agendar mas não especificou canal → manda link + opção WhatsApp ─
    const wantsBooking =
      t.includes('agend') || t.includes('marcar') || t.includes('reserv') ||
      t === '1' || t.includes('horár') || t.includes('consulta') || t === 'agendar' ||
      t.includes('teria horário') || t.includes('tem horário') || t.includes('tem vaga') ||
      t.includes('tem horario') || t.includes('teria horario') || t.includes('horario');

    if (wantsBooking) {
      setBookingState(stateKey, { step: 'idle', clientPhone: from });
      const saudacao = getGreeting();
      bookingOffers.set(stateKey, Date.now());
      return (
        `${saudacao}! 😊

` +
        `📅 Para agendar é só acessar:

` +
        `🔗 ${bookingLink}

` +
        `Leva menos de 1 minuto! 😊

` +
        `Ou se preferir, responda *AQUI* que te ajudo pelo WhatsApp mesmo!`
      );
    }

    return null;
  }

  // ── STEP: escolha do serviço ──────────────────────────────────────────────
  if (state.step === 'service') {
    const matched = matchService(text, services);
    if (!matched) {
      const list = services.map((s: any, i: number) => `${i+1}. ${s.name}`).join('\n');
      return `Não encontrei esse serviço. Escolha um número:

${list}`;
    }

    const newState: BookingState = {
      ...state,
      step: profs.length > 1 ? 'professional' : 'date',
      serviceId: matched.id,
      serviceName: matched.name,
      servicePrice: matched.price,
      serviceDuration: matched.duration,
      professionalId: profs.length === 1 ? profs[0].id : undefined,
      professionalName: profs.length === 1 ? profs[0].displayName : undefined,
    };

    setBookingState(stateKey, newState);

    if (profs.length > 1) {
      const list = profs.map((p: any, i: number) => `${i+1}️⃣ ${p.displayName}`).join('\n');
      return `✂️ *${matched.name}* selecionado!

Com qual profissional?

${list}

0️⃣ Cancelar`;
    }

    return (
      `✂️ *${matched.name}* selecionado!

` +
      `📅 Para qual data? (ex: *amanhã*, *sexta*, *15/01*)

0️⃣ Cancelar`
    );
  }

  // ── STEP: escolha do profissional ─────────────────────────────────────────
  if (state.step === 'professional') {
    const num = parseInt(t.trim());
    let prof = !isNaN(num) && num >= 1 && num <= profs.length ? profs[num-1] : null;
    if (!prof) prof = profs.find((p: any) => p.displayName.toLowerCase().includes(t)) || null;
    if (!prof) {
      const list = profs.map((p: any, i: number) => `${i+1}. ${p.displayName}`).join('\n');
      return `Não encontrei. Escolha:

${list}`;
    }
    setBookingState(stateKey, { ...state, step: 'date', professionalId: prof.id, professionalName: prof.displayName });
    return `👤 *${prof.displayName}* escolhido!

📅 Para qual data? (ex: *amanhã*, *sexta*, *15/01*)

0️⃣ Cancelar`;
  }

  // ── STEP: escolha da data ─────────────────────────────────────────────────
  if (state.step === 'date') {
    const parsed = parseDatePTBR(text);
    if (!parsed) return `Não entendi a data. Tente: *amanhã*, *sexta*, *15/01*

0️⃣ Cancelar`;

    const slots = await getAvailableSlots(salonId, parsed, state.serviceDuration || 60, state.professionalId);
    if (slots.length === 0) {
      return `Infelizmente não há horários disponíveis nessa data. Tente outra data:

0️⃣ Cancelar`;
    }

    const [y, mo, d] = parsed.split('-');
    const dateLabel = `${d}/${mo}/${y}`;
    const slotList = slots.join(' · ');

    setBookingState(stateKey, { ...state, step: 'time', date: parsed });
    return (
      `📅 *${dateLabel}* — Horários disponíveis:

` +
      `🕐 ${slotList}

` +
      `Qual horário prefere?
0️⃣ Cancelar`
    );
  }

  // ── STEP: escolha do horário ──────────────────────────────────────────────
  if (state.step === 'time') {
    const parsed = parseTimePTBR(text);
    if (!parsed) return `Não entendi o horário. Tente: *10:00*, *14h30*

0️⃣ Cancelar`;

    // Verifica disponibilidade
    const slots = await getAvailableSlots(salonId, state.date!, state.serviceDuration || 60, state.professionalId);
    if (slots.length > 0 && !slots.includes(parsed)) {
      return `Esse horário não está disponível. Escolha um dos horários:

🕐 ${slots.join(' · ')}

0️⃣ Cancelar`;
    }

    setBookingState(stateKey, { ...state, step: 'name', time: parsed });
    return `🕐 *${parsed}* — ótimo!

Para finalizar, qual é o seu *nome completo*?

0️⃣ Cancelar`;
  }

  // ── STEP: coleta o nome ───────────────────────────────────────────────────
  if (state.step === 'name') {
    const name = text.trim();
    if (name.length < 2) return `Por favor, informe seu nome completo.

0️⃣ Cancelar`;

    const [y, mo, d] = state.date!.split('-');
    const dateLabel = `${d}/${mo}/${y}`;

    setBookingState(stateKey, { ...state, step: 'confirm', clientName: name });
    return (
      `✅ *Confirmar agendamento?*

` +
      `👤 Nome: *${name}*
` +
      `✂️ Serviço: *${state.serviceName}*
` +
      (state.professionalName ? `💇 Profissional: *${state.professionalName}*
` : '') +
      `📅 Data: *${dateLabel}*
` +
      `🕐 Horário: *${state.time}*
` +
      `💰 Valor: *R$ ${Number(state.servicePrice||0).toFixed(2)}*

` +
      `Responda *SIM* para confirmar ou *NÃO* para cancelar.`
    );
  }

  // ── STEP: confirmação ─────────────────────────────────────────────────────
  if (state.step === 'confirm') {
    if (t === 'não' || t === 'nao' || t === 'n') {
      clearBookingState(stateKey);
      return `Agendamento cancelado. Se quiser tentar de novo, é só falar! 😊`;
    }
    if (t !== 'sim' && t !== 's' && t !== '✅' && t !== 'confirmar') {
      return `Responda *SIM* para confirmar ou *NÃO* para cancelar.`;
    }

    // Revalida o horário (alguém pode ter marcado enquanto o cliente decidia)
    const freeNow = await getAvailableSlots(salonId, state.date!, state.serviceDuration || 30, state.professionalId || undefined);
    if (!freeNow.includes(state.time!)) {
      const dd = state.date!.split('-').reverse().join('/');
      if (!freeNow.length) {
        clearBookingState(stateKey);
        return `😕 Poxa, esse horário acabou de ser preenchido e não há mais vagas em *${dd}*. Quer tentar outro dia? É só me dizer a data!`;
      }
      setBookingState(stateKey, { ...state, step: 'time', time: undefined });
      return `😕 Poxa, esse horário acabou de ser ocupado!\n\n📅 *${dd}* — Horários ainda disponíveis:\n\n🕐 ${freeNow.join(' · ')}\n\nQual prefere?\n\n0️⃣ Cancelar`;
    }

    // Verifica se o serviço requer sinal
    let requireDeposit = false;
    let depositPercent = 0;
    try {
      if (state.serviceId) {
        const svcDoc = await adminDb.doc(`salons/${salonId}/services/${state.serviceId}`).get();
        const svcData = svcDoc.data() as any;
        requireDeposit = !!(svcData?.requireDeposit);
        depositPercent = svcData?.depositPercent || 0;
      }
    } catch { /* sem dados de sinal */ }

    if (requireDeposit && depositPercent > 0) {
      const depositAmount = Math.ceil((state.servicePrice || 0) * depositPercent / 100);
      try {
        await createBotAppointment(salonId, state, 'AWAITING_DEPOSIT');
        clearBookingState(stateKey);
        return (
          `📅 *Quase lá!*\n\n` +
          `Para confirmar *${state.serviceName}*, precisamos de um sinal de *R$ ${depositAmount.toFixed(2)}*.\n\n` +
          `Acesse o link para pagar: ${bookingLink}\n\n` +
          `Após o pagamento, seu horário é confirmado automaticamente! 😊`
        );
      } catch (e) {
        console.error('[BookingBot] Erro (sinal):', e);
        clearBookingState(stateKey);
        return `Tivemos um problema. Agende pelo link: ${bookingLink}`;
      }
    }

    // Sem sinal → confirma direto como CONFIRMED
    try {
      await createBotAppointment(salonId, state, 'CONFIRMED');
      const [y, mo, d] = state.date!.split('-');
      clearBookingState(stateKey);
      return (
        `🎉 *Agendamento confirmado!*\n\n` +
        `✂️ ${state.serviceName}\n` +
        `📅 ${d}/${mo}/${y} às ${state.time}\n` +
        (state.professionalName ? `👤 ${state.professionalName}\n` : '') +
        `\nTe esperamos! Qualquer dúvida, fale conosco 😊`
      );
    } catch (e) {
      console.error('[BookingBot] Erro ao criar agendamento:', e);
      clearBookingState(stateKey);
      return `Tivemos um problema ao registrar. Agende pelo link: ${bookingLink}`;
    }
  }


  return null;
}

// ─── Fluxo: Meus Agendamentos (consulta / cancelamento / reagendamento) ────────
async function handleMyAppointmentsFlow(
  salonId: string,
  from: string,
  text: string,
): Promise<string | null> {
  const stateKey = `myapts:${salonId}:${from}`;
  const state = getMyApptsState(stateKey);
  const t = text.toLowerCase().trim();

  // Palavras-chave que ativam o fluxo
  const entryKeywords = [
    'meus agendamentos', 'meu agendamento', 'minha marcação', 'minhas marcações',
    'ver meu agendamento', 'consultar agendamento', 'meus horários', 'meu horario',
    'cancelar meu', 'remarcar', 'reagendar', 'alterar meu', 'trocar meu horário',
    'trocar meu horario', 'mudar meu horário', 'mudar meu horario',
  ];
  const isEntry = entryKeywords.some(k => t.includes(k));

  // Se não está em nenhum step e nem é palavra de entrada, ignora
  if (!state && !isEntry) return null;

  // ── Cancelar o fluxo a qualquer momento ──────────────────────────────────
  if (state && (t === '0' || t === 'cancelar' || t === 'cancela' || t === 'sair')) {
    clearMyApptsState(stateKey);
    return `Ok! Se precisar de mais alguma coisa, é só chamar 😊`;
  }

  // ── ENTRY: busca os agendamentos futuros do cliente por telefone ──────────
  if (isEntry || !state) {
    const cleanPhone = from.replace(/\D/g, '');
    const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
      .toISOString().split('T')[0];

    const snap = await adminDb.collection(`salons/${salonId}/appointments`)
      .where('customerPhone', '==', cleanPhone)
      .where('status', 'in', ['CONFIRMED', 'PENDING'])
      .orderBy('date', 'asc')
      .get().catch(() => null);

    // Tenta também com o número sem DDI (55) se não achou nada
    let docs = snap?.docs || [];
    if (docs.length === 0) {
      const phoneAlt = cleanPhone.startsWith('55') ? cleanPhone.slice(2) : `55${cleanPhone}`;
      const snap2 = await adminDb.collection(`salons/${salonId}/appointments`)
        .where('customerPhone', '==', phoneAlt)
        .where('status', 'in', ['CONFIRMED', 'PENDING'])
        .orderBy('date', 'asc')
        .get().catch(() => null);
      docs = snap2?.docs || [];
    }

    // Filtra apenas futuros
    const futureDocs = docs.filter(d => {
      const apt = d.data();
      return apt.date >= todayStr;
    });

    if (futureDocs.length === 0) {
      clearMyApptsState(stateKey);
      return `📅 Você não tem agendamentos futuros por aqui.\n\nQuer marcar um? É só responder *AGENDAR* 😊`;
    }

    const apts = futureDocs.map(d => ({ id: d.id, ...d.data() }));
    setMyApptsState(stateKey, { step: 'list', appointments: apts });

    const lines = apts.map((apt: any, i: number) => {
      const [y, mo, d] = apt.date.split('-');
      return `*${i + 1}️⃣* ${d}/${mo}/${y} às *${apt.startTime}* — ${apt.serviceName}${apt.professionalName ? ` c/ ${apt.professionalName}` : ''}`;
    });

    return (
      `📋 *Seus agendamentos:*\n\n` +
      lines.join('\n') +
      `\n\nEscolha o *número* do agendamento para gerenciar, ou *0️⃣* para sair.`
    );
  }

  // ── STEP: list — usuário escolhe qual agendamento gerenciar ──────────────
  if (state.step === 'list') {
    const num = parseInt(t.trim());
    const apts = state.appointments || [];
    if (isNaN(num) || num < 1 || num > apts.length) {
      return `Por favor, escolha um número de *1* a *${apts.length}*, ou *0️⃣* para sair.`;
    }
    const chosen = apts[num - 1] as any;
    setMyApptsState(stateKey, { ...state, step: 'action', selectedAptId: chosen.id, selectedApt: chosen });

    const [y, mo, d] = chosen.date.split('-');
    return (
      `✂️ *${chosen.serviceName}*\n` +
      `📅 ${d}/${mo}/${y} às *${chosen.startTime}*` +
      (chosen.professionalName ? `\n👤 ${chosen.professionalName}` : '') +
      `\n\nO que deseja fazer?\n\n` +
      `1️⃣ Cancelar este agendamento\n` +
      `2️⃣ Reagendar para outra data\n` +
      `0️⃣ Voltar`
    );
  }

  // ── STEP: action — cancelar ou reagendar ─────────────────────────────────
  if (state.step === 'action') {
    const apt = state.selectedApt as any;

    if (t === '1' || t.includes('cancelar') || t.includes('cancela')) {
      // Cancela o agendamento
      try {
        await adminDb.doc(`salons/${salonId}/appointments/${state.selectedAptId}`).update({
          status: 'CANCELLED',
          cancelledReason: 'Cancelado pelo cliente via WhatsApp Bot',
          cancelledAt: Date.now(),
          updatedAt: Date.now(),
        });
        // Notifica fila de espera
        try {
          const { notifyWaitlistChain } = (global as any).__waitlistChain || {};
          if (notifyWaitlistChain) await notifyWaitlistChain(salonId, apt.date, apt.professionalId || '');
        } catch {}
        // Notifica dono
        const ownerPhone = await getOwnerNotificationPhone(salonId);
        if (ownerPhone) {
          const [y, mo, d] = apt.date.split('-');
          await sendWhatsApp(ownerPhone,
            `⚠️ *Agendamento cancelado pelo cliente (bot)*\n\nServiço: ${apt.serviceName}\nCliente: ${apt.clientName || from}\nData: ${d}/${mo}/${y} às ${apt.startTime}`,
            SUPPORT_INSTANCE
          ).catch(() => {});
        }
        clearMyApptsState(stateKey);
        return `❌ *Agendamento cancelado com sucesso!*\n\nSentiremos sua falta! Quando quiser remarcar, é só chamar 😊`;
      } catch (e) {
        clearMyApptsState(stateKey);
        return `Não consegui cancelar agora. Tente novamente ou ligue para nós.`;
      }
    }

    if (t === '2' || t.includes('reagendar') || t.includes('remarcar') || t.includes('outra data')) {
      setMyApptsState(stateKey, { ...state, step: 'reschedule_date' });
      return `📅 Para qual data você quer reagendar?\n\n(ex: *amanhã*, *sexta*, *20/05*)\n\n0️⃣ Cancelar`;
    }

    return `Escolha *1️⃣* para cancelar, *2️⃣* para reagendar ou *0️⃣* para voltar.`;
  }

  // ── STEP: reschedule_date — escolhe nova data ─────────────────────────────
  if (state.step === 'reschedule_date') {
    const parsed = parseDatePTBR(text);
    if (!parsed) return `Não entendi a data. Tente: *amanhã*, *sexta*, *20/05*\n\n0️⃣ Cancelar`;

    const apt = state.selectedApt as any;
    const slots = await getAvailableSlots(salonId, parsed, apt.duration || apt.serviceDuration || 30, apt.professionalId);

    if (!slots.length) {
      return `😕 Não há horários disponíveis em ${parsed.split('-').reverse().join('/')}.\nTente outra data:\n\n0️⃣ Cancelar`;
    }

    const [y, mo, d] = parsed.split('-');
    setMyApptsState(stateKey, { ...state, step: 'reschedule_time', newDate: parsed });
    return (
      `📅 *${d}/${mo}/${y}* — Horários disponíveis:\n\n` +
      `🕐 ${slots.join(' · ')}\n\n` +
      `Qual horário prefere?\n0️⃣ Cancelar`
    );
  }

  // ── STEP: reschedule_time — escolhe novo horário e confirma ──────────────
  if (state.step === 'reschedule_time') {
    const parsed = parseTimePTBR(text);
    if (!parsed) return `Não entendi o horário. Tente: *10:00*, *14h30*\n\n0️⃣ Cancelar`;

    const apt = state.selectedApt as any;
    const slots = await getAvailableSlots(salonId, state.newDate!, apt.duration || apt.serviceDuration || 30, apt.professionalId);
    if (slots.length > 0 && !slots.includes(parsed)) {
      return `Esse horário não está disponível.\n\n🕐 ${slots.join(' · ')}\n\n0️⃣ Cancelar`;
    }

    try {
      // Cancela o agendamento antigo
      await adminDb.doc(`salons/${salonId}/appointments/${state.selectedAptId}`).update({
        status: 'CANCELLED',
        cancelledReason: 'Reagendado pelo cliente via WhatsApp Bot',
        cancelledAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Cria novo agendamento com os mesmos dados, nova data e horário
      const now = Date.now();
      const [h, m] = parsed.split(':').map(Number);
      const dur = apt.duration || apt.serviceDuration || 30;
      const endMin = h * 60 + m + dur;
      const endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;

      await adminDb.collection(`salons/${salonId}/appointments`).add({
        salonId,
        clientId: apt.clientId || `bot_${from.replace(/\D/g, '')}_${now}`,
        clientName: apt.clientName || apt.customerName || 'Cliente',
        customerPhone: apt.customerPhone || from,
        professionalId: apt.professionalId || '',
        professionalName: apt.professionalName || '',
        serviceId: apt.serviceId || '',
        serviceName: apt.serviceName || '',
        duration: dur,
        date: state.newDate!,
        startTime: parsed,
        endTime,
        status: 'CONFIRMED',
        totalAmount: apt.totalAmount || apt.price || 0,
        notes: `Reagendado via WhatsApp Bot (era ${apt.date} às ${apt.startTime})`,
        reminderSent: false,
        createdAt: now,
        updatedAt: now,
        source: 'whatsapp_bot_reschedule',
      });

      // Notifica dono
      const ownerPhone = await getOwnerNotificationPhone(salonId);
      if (ownerPhone) {
        const [y, mo, d] = state.newDate!.split('-');
        await sendWhatsApp(ownerPhone,
          `🔄 *Agendamento reagendado pelo cliente (bot)*\n\nServiço: ${apt.serviceName}\nCliente: ${apt.clientName || from}\nNova data: ${d}/${mo}/${y} às ${parsed}`,
          SUPPORT_INSTANCE
        ).catch(() => {});
      }

      clearMyApptsState(stateKey);
      const [y, mo, d] = state.newDate!.split('-');
      return (
        `✅ *Reagendado com sucesso!*\n\n` +
        `✂️ ${apt.serviceName}\n` +
        `📅 ${d}/${mo}/${y} às *${parsed}*` +
        (apt.professionalName ? `\n👤 ${apt.professionalName}` : '') +
        `\n\nTe esperamos! 😊`
      );
    } catch (e) {
      console.error('[Reagendamento Bot]', e);
      clearMyApptsState(stateKey);
      return `Não consegui reagendar agora. Tente novamente ou ligue para nós.`;
    }
  }

  return null;
}

// ─── Bot simples: responde por palavras-chave ─────────────────────────────────
async function handleSimpleBot(salonId: string, from: string, text: string): Promise<string> {
  const ctx = await getSalonBotContext(salonId);
  const { business, salon, bookingLink, hoursText, servicesText, addressText, anamneseLinks } = ctx;
  const salonName = salon.name || business.name || 'nosso salão';
  const t = text.toLowerCase().trim();

  // ── Tenta fluxo de agendamento ───────────────────────────────────────────
  const bookingReply = await handleBookingFlow(salonId, from, text, ctx);
  if (bookingReply !== null) return bookingReply;

  // ── Tenta fluxo de meus agendamentos (consulta/cancelamento/reagendamento)
  const myApptsReply = await handleMyAppointmentsFlow(salonId, from, text);
  if (myApptsReply !== null) return myApptsReply;

  // ── Detecta confirmação/cancelamento de consulta (2 cliques) ────────────
  if (t === 'sim' || t === '✅' || t === 'confirmar' || t === 'confirmado') {
    try {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const apts = await adminDb.collectionGroup('appointments')
        .where('date', '==', tomorrowStr).where('status', 'in', ['CONFIRMED', 'PENDING'])
        .where('confirmationSent', '==', true).get();
      let found = false;
      for (const d of apts.docs) {
        const apt = d.data(); const pathParts = d.ref.path.split('/'); const aptSalonId = pathParts[1];
        if (aptSalonId !== salonId) continue;
        const aptPhone = (apt.customerPhone || '').replace(/\D/g, '');
        if (aptPhone && from.includes(aptPhone.slice(-8))) {
          await d.ref.update({ status: 'CONFIRMED', confirmedByClient: true }); found = true; break;
        }
      }
      return found ? '✅ *Presença confirmada!* Te esperamos amanhã. Se precisar remarcar, fale conosco.' : '✅ Obrigado pela confirmação! Até amanhã.';
    } catch { return '✅ Confirmação registrada! Até amanhã.'; }
  }

  if (t === 'não' || t === 'nao' || t === '❌' || t === 'cancelar' || t === 'cancela') {
    try {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const apts = await adminDb.collectionGroup('appointments')
        .where('date', '==', tomorrowStr).where('status', 'in', ['CONFIRMED', 'PENDING']).get();
      let found = false;
      for (const d of apts.docs) {
        const apt = d.data(); const pathParts = d.ref.path.split('/'); const aptSalonId = pathParts[1];
        if (aptSalonId !== salonId) continue;
        const aptPhone = (apt.customerPhone || '').replace(/\D/g, '');
        if (aptPhone && from.includes(aptPhone.slice(-8))) {
          await d.ref.update({ status: 'CANCELLED', cancelledReason: 'Cancelado pelo cliente via WhatsApp' }); found = true; break;
        }
      }
      return found ? '❌ *Agendamento cancelado.* Sentiremos sua falta! Quando quiser remarcar, é só agendar.' : '❌ Cancelamento registrado. Obrigado por avisar!';
    } catch { return '❌ Cancelamento registrado. Obrigado por avisar!'; }
  }

  // ── Agradecimentos e despedidas — resposta natural, sem mostrar menu ─────────
  const thanks = ['obrigad', 'valeu', 'vlw', 'brigad', 'thanks', 'thank'];
  const bye    = ['tchau', 'até logo', 'ate logo', 'xau', 'flw', 'bye', 'até mais', 'ate mais', 'falou'];
  if (thanks.some(k => t.includes(k))) {
    const responses = [
      'De nada! 😊 Qualquer coisa é só chamar!',
      'Por nada! Fico feliz em ajudar 😄',
      'Imagina! Se precisar de mais alguma coisa, é só falar 😊',
      'De nada! Te esperamos em breve! 🙌',
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  if (bye.some(k => t.includes(k))) {
    return `Até logo! 👋 Foi um prazer! Qualquer coisa, pode chamar 😊`;
  }

  // ── Elogios e confirmações genéricas ──────────────────────────────────────
  const positives = ['ótimo', 'otimo', 'perfeito', 'show', 'massa', 'top', 'legal', 'incrível', 'maravilh'];
  if (positives.some(k => t.includes(k)) && t.split(' ').length <= 3) {
    return `Fico feliz! 😄 Se precisar de mais alguma coisa, é só falar!`;
  }

  const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'hi', 'menu', 'ajuda', 'início', 'inicio', 'salve', 'e aí', 'eai', 'eaí', 'opa', 'oie', 'oi sumido', 'tudo bem', 'tudo bom', 'como vai'];
  // Só mostra o menu se for uma saudação pura — se tiver data/horário na msg, deixa o fluxo de agendamento tratar
  const hasDayMention = ['segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado', 'domingo', 'hoje', 'amanhã', 'amanha', 'semana', '/'].some(d => t.includes(d));
  const hasAvailQuery = ['tem horario', 'tem horário', 'teria horario', 'teria horário', 'tem vaga', 'teria vaga', 'tem como', 'encaixar', 'disponivel', 'disponível', 'tem agenda', 'consegue'].some(k => t.includes(k));
  if ((greetings.some(g => t.includes(g)) || t === '' || t === '0') && !(hasDayMention && hasAvailQuery)) {
    const bType = salon.businessType || 'beauty';
    const saudacao = getGreeting();
    const emoji = { health:'🏥', fitness:'💪', sports:'🏆', services:'💼', beauty:'✂️' }[bType] || '👋';
    const menuByType: Record<string, string> = {
      health:   `1️⃣ Agendar consulta\n2️⃣ Serviços e valores\n3️⃣ Horário de atendimento\n4️⃣ Endereço\n5️⃣ Falar com a equipe\n6️⃣ Meus agendamentos`,
      fitness:  `1️⃣ Agendar aula/treino\n2️⃣ Modalidades e valores\n3️⃣ Horário de funcionamento\n4️⃣ Endereço\n5️⃣ Falar com a equipe\n6️⃣ Meus agendamentos`,
      sports:   `1️⃣ Reservar espaço/quadra\n2️⃣ Valores e disponibilidade\n3️⃣ Horário de funcionamento\n4️⃣ Endereço\n5️⃣ Falar com a equipe\n6️⃣ Meus agendamentos`,
      services: `1️⃣ Agendar reunião/serviço\n2️⃣ Serviços e valores\n3️⃣ Horário de atendimento\n4️⃣ Endereço\n5️⃣ Falar com a equipe\n6️⃣ Meus agendamentos`,
      beauty:   `1️⃣ Agendar horário\n2️⃣ Ver serviços e preços\n3️⃣ Horário de funcionamento\n4️⃣ Endereço\n5️⃣ Falar com a equipe\n6️⃣ Meus agendamentos`,
    };
    const defaultMenu = menuByType[bType] || menuByType.beauty;

    // Carrega configuração personalizada do bot (se o dono customizou)
    const botCfg = await getBotConfig(salonId);

    // Aplica variáveis nas mensagens customizadas: {{nome}}, {{salao}}, {{saudacao}}
    const applyVars = (txt: string) =>
      txt.replace(/\{\{nome\}\}/gi, salonName)
         .replace(/\{\{salao\}\}/gi, salonName)
         .replace(/\{\{saudacao\}\}/gi, saudacao)
         .replace(/\{\{emoji\}\}/gi, emoji);

    const greetingText = botCfg.greetingText
      ? applyVars(botCfg.greetingText)
      : `${saudacao}! ${emoji} Seja bem-vindo ao *${salonName}*!\n\nComo posso te ajudar hoje?`;

    const menuText = botCfg.menuText
      ? applyVars(botCfg.menuText)
      : defaultMenu;

    return `${greetingText}\n\n${menuText}\n\nResponda com o número da opção ou palavra-chave 😊`;
  }

  if (t === '2' || t.includes('serviç') || t.includes('preço') || t.includes('valor') || t.includes('quanto')) {
    return `💈 *Nossos Serviços*\n\n${servicesText}\n\nPara agendar: ${bookingLink}\n\n0️⃣ Voltar ao menu`;
  }
  if (t === '3' || t.includes('funciona') || t.includes('abre') || t.includes('fecha')) {
    return `🕐 *Horário de Funcionamento*\n\n${hoursText}\n\n0️⃣ Voltar ao menu`;
  }
  if (t === '4' || t.includes('endereço') || t.includes('localiz') || t.includes('onde') || t.includes('fica')) {
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
    return `📍 *Endereço*\n\n${addressText}\n\n🗺️ Ver no mapa: ${mapsLink}\n\n0️⃣ Voltar ao menu`;
  }
  if (t === '5' || t.includes('falar') || t.includes('contato') || t.includes('atendente') || t.includes('humano')) {
    const phone = business.whatsapp || business.phone || '';
    return `💬 *Falar com a Equipe*\n\nNossa equipe está pronta para te atender!\n${phone ? `📞 ${phone}\n` : ''}\nOu agende online: ${bookingLink}\n\n0️⃣ Voltar ao menu`;
  }

  if (t === '6' || t.includes('meus agendamentos') || t.includes('meu agendamento') || t.includes('minha marcação') || t.includes('ver meu')) {
    const myReply = await handleMyAppointmentsFlow(salonId, from, 'meus agendamentos');
    if (myReply) return myReply;
  }

  // Intenção de pacote mensal
  if (t.includes('pacote') || t.includes('mensalidade') || t.includes('mensalid') ||
      (t.includes('todo') && (t.includes('semana') || t.includes('seg') || t.includes('sex') || t.includes('sab'))) ||
      t.includes('reserva fixa') || t.includes('horario fixo')) {
    return (
      `📦 *Pacote Mensal de Locação*\n\n` +
      `Reserve seu horário fixo toda semana e pague mensalmente.\n\n` +
      `Para criar, mande:\n` +
      `*PACOTE + dia + horário + quadra*\n\n` +
      `Ex: *PACOTE toda segunda 20h quadra 1*\n\n` +
      `Vou gerar o link de pagamento na hora! 😊`
    );
  }

  // ── Consulta natural de disponibilidade no handleSimpleBot ──────────────
  // Cobre casos como "salve, tem horario pra segunda?" que chegam aqui sem passar pelo bookingFlow
  const simpleAvailKeywords = [
    'tem horario', 'tem horário', 'teria horario', 'teria horário',
    'tem vaga', 'teria vaga', 'tem como', 'consegue encaixar',
    'encaixar', 'disponivel', 'disponível', 'livre',
    'tem agenda', 'teria agenda', 'consegue',
  ];
  const simpleHasAvail = simpleAvailKeywords.some(k => t.includes(k));
  const simpleDateParsed = parseDatePTBR(text);
  if (simpleHasAvail && simpleDateParsed) {
    const refDuration = ctx.services?.[0]?.duration || 30;
    const slots = await getAvailableSlots(salonId, simpleDateParsed, refDuration);
    const dd = simpleDateParsed.split('-').reverse().join('/');
    const saudacao = getGreeting();
    if (!slots.length) {
      return (
        `${saudacao}! 😊

` +
        `Infelizmente não tem horários disponíveis em *${dd}*. 😕

` +
        `Quer tentar outra data? É só mandar qual dia te interessa!`
      );
    }
    const displaySlots = slots.join(' · ');
    return (
      `${saudacao}! 😊

` +
      `📅 *${dd}* — Horários disponíveis:

` +
      `🕐 ${displaySlots}

` +
      `Quer agendar? Acesse o link ou responda *AQUI* que faço pelo WhatsApp mesmo! 😊

` +
      `🔗 ${bookingLink}`
    );
  }

  // Fallback inteligente — resposta natural sem lista enorme
  const fallbacks = [
    `Hmm, não entendi bem 😅 Posso te ajudar a *agendar*, ver *serviços*, *horários* ou *endereço*. O que precisa?`,
    `Não captei muito bem! 😄 Fala mais um pouco — quer *agendar*, saber sobre *preços* ou outra coisa?`,
    `Pode me dizer melhor? 😊 Estou aqui para ajudar com agendamentos, serviços e qualquer dúvida!`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}


// ─── Bot inteligente: usa Groq (gratuito) ────────────────────────────────────
// Cadastre em groq.com e pegue uma API key gratuita
// Adicione no .env: GROQ_API_KEY=sua_chave
// ══════════════════════════════════════════════════════════════════════════════
// BOT DE VENDAS — fluxo de carrinho via WhatsApp
// Só ativo quando plan.features.hasStore && settings.botSalesEnabled === true
// ══════════════════════════════════════════════════════════════════════════════
async function handleSalesBot(
  salonId: string,
  from: string,
  text: string
): Promise<string | null> {
  const t = text.trim().toLowerCase();
  const stateKey = `${salonId}:${from}:cart`;

  // ── Carregar context do salão (produtos, config entrega) ──────────────────
  const [productsSnap, storeSettingsDoc, businessDoc] = await Promise.all([
    adminDb.collection(`salons/${salonId}/products`).where('active', '==', true).get(),
    adminDb.doc(`salons/${salonId}/settings/store`).get().catch(() => null),
    adminDb.doc(`salons/${salonId}/settings/business`).get().catch(() => null),
  ]);

  const products = productsSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter((p: any) => p.active !== false && p.price > 0);

  const storeSettings = storeSettingsDoc?.data() as any || {};
  const business = businessDoc?.data() as any || {};
  const deliveryEnabled = storeSettings.deliveryEnabled ?? business.deliveryEnabled ?? false;
  const deliveryFee = Number(storeSettings.deliveryFee ?? business.homeServiceFee ?? 0);
  const ownerPhone = await getOwnerNotificationPhone(salonId);
  const salonName = business.name || salonId;

  // ── Verificar se bot de vendas está ativo ────────────────────────────────
  const botSalesEnabled = storeSettings.botSalesEnabled ?? false;
  if (!botSalesEnabled) return null;

  // ── Verificar se plano tem loja ──────────────────────────────────────────
  const planCheck = await adminDb.collection('salons').doc(salonId).get();
  const planId = planCheck.data()?.planId || '';
  const planDoc = await adminDb.doc(`plans/${planId}`).get().catch(() => null);
  const planFeatures = planDoc?.data()?.features as any || {};
  if (!planFeatures.hasStore) return null;

  if (products.length === 0) return null;

  const state = getCartState(stateKey);

  // ── TRIGGER: cliente quer ver produtos ───────────────────────────────────
  const isSalesTrigger =
    t.includes('comprar') || t.includes('cardápio') || t.includes('catálogo') ||
    t.includes('ver produto') || t.includes('ver itens') || t.includes('quero pedir') ||
    t.includes('tem à venda') || t.includes('o que tem') || t.includes('cardapio') ||
    t === 'loja' || t === 'produtos' || t === 'menu' || t === 'pedido';

  // ── CANCELAR fluxo ───────────────────────────────────────────────────────
  if (state && (t === '0' || t.includes('cancelar') || t.includes('sair'))) {
    clearCartState(stateKey);
    return `Tudo bem! Se precisar de algo é só falar 😊`;
  }

  // ── NENHUM estado ativo — verificar trigger ──────────────────────────────
  if (!state) {
    if (!isSalesTrigger) return null;
    // Inicia catálogo
    const catalog = products
      .map((p: any, i: number) => `${i + 1}️⃣ *${p.name}* — R$ ${Number(p.price).toFixed(2)}${p.description ? `\n   _${p.description}_` : ''}`)
      .join('\n\n');
    setCartState(stateKey, { step: 'browsing', items: [], customerPhone: from });
    return `🛍️ *${salonName} — Nossos Produtos*\n\n${catalog}\n\n📝 Digite o *número* do item pra adicionar ao carrinho\n🛒 Digite *carrinho* pra ver o que você escolheu\n0️⃣ Cancelar`;
  }

  // ── BROWSING: adicionar itens ────────────────────────────────────────────
  if (state.step === 'browsing' || state.step === 'cart') {
    // Mostrar carrinho
    if (t === 'carrinho' || t === 'ver carrinho' || t.includes('meu carrinho')) {
      if (state.items.length === 0) {
        return `🛒 Seu carrinho está vazio! Digite o número de um produto pra adicionar 😊`;
      }
      const cartLines = state.items
        .map(it => `• ${it.name} x${it.qty} — R$ ${(it.price * it.qty).toFixed(2)}`)
        .join('\n');
      const subtotal = state.items.reduce((sum, it) => sum + it.price * it.qty, 0);
      return `🛒 *Seu carrinho:*\n\n${cartLines}\n\n💰 Subtotal: R$ ${subtotal.toFixed(2)}\n\n✅ Digite *finalizar* pra continuar\n➕ Ou adicione mais itens pelo número\n0️⃣ Cancelar`;
    }

    // Finalizar
    if (t === 'finalizar' || t === 'finalizar pedido' || t.includes('quero finalizar')) {
      if (state.items.length === 0) {
        return `Seu carrinho está vazio! Adicione um item antes de finalizar 😊`;
      }
      setCartState(stateKey, { ...state, step: 'delivery_method' });
      if (deliveryEnabled) {
        return `🚚 Como você prefere receber?\n\n1️⃣ Entrega (frete: R$ ${deliveryFee.toFixed(2)})\n2️⃣ Retirada no local\n\n0️⃣ Cancelar`;
      } else {
        // Sem entrega — vai direto pro pagamento
        setCartState(stateKey, { ...state, step: 'payment', deliveryMethod: 'pickup' });
        const total = state.items.reduce((sum, it) => sum + it.price * it.qty, 0);
        return `✅ *Resumo do pedido:*\n\n${state.items.map(it => `• ${it.name} x${it.qty} = R$ ${(it.price * it.qty).toFixed(2)}`).join('\n')}\n\n💰 *Total: R$ ${total.toFixed(2)}*\n\nDigite *pagar* pra gerar o PIX ou *cancelar*`;
      }
    }

    // Adicionar por número
    const num = parseInt(t);
    if (!isNaN(num) && num >= 1 && num <= products.length) {
      const product = products[num - 1] as any;
      const existingIdx = state.items.findIndex(it => it.id === product.id);
      let newItems = [...state.items];
      if (existingIdx >= 0) {
        newItems[existingIdx] = { ...newItems[existingIdx], qty: newItems[existingIdx].qty + 1 };
      } else {
        newItems.push({ id: product.id, name: product.name, price: Number(product.price), qty: 1 });
      }
      setCartState(stateKey, { ...state, step: 'browsing', items: newItems });
      const subtotal = newItems.reduce((sum, it) => sum + it.price * it.qty, 0);
      return `✅ *${product.name}* adicionado!\n\n🛒 Carrinho: ${newItems.length} ${newItems.length === 1 ? 'item' : 'itens'} — R$ ${subtotal.toFixed(2)}\n\nAdicione mais ou digite *finalizar* pra concluir 😊`;
    }

    // Se está no meio do fluxo mas não reconheceu o comando
    if (state.step === 'browsing') {
      return `Digite o *número* do produto, *carrinho* pra ver seus itens, ou *finalizar* pra concluir 😊`;
    }
  }

  // ── DELIVERY METHOD ──────────────────────────────────────────────────────
  if (state.step === 'delivery_method') {
    if (t === '1' || t.includes('entrega') || t.includes('delivery')) {
      setCartState(stateKey, { ...state, step: 'address', deliveryMethod: 'delivery' });
      return `📍 Qual o seu endereço de entrega?\n\n_Ex: Rua das Flores, 123, Centro_`;
    }
    if (t === '2' || t.includes('retirada') || t.includes('buscar') || t.includes('pegar')) {
      const total = state.items.reduce((sum, it) => sum + it.price * it.qty, 0);
      setCartState(stateKey, { ...state, step: 'payment', deliveryMethod: 'pickup' });
      return `✅ *Resumo:*\n\n${state.items.map(it => `• ${it.name} x${it.qty} = R$ ${(it.price * it.qty).toFixed(2)}`).join('\n')}\n\n🏪 Retirada no local\n💰 *Total: R$ ${total.toFixed(2)}*\n\nDigite *pagar* pra gerar o PIX 🙂`;
    }
    return `Digite *1* pra entrega ou *2* pra retirada 😊`;
  }

  // ── ADDRESS ──────────────────────────────────────────────────────────────
  if (state.step === 'address') {
    if (text.trim().length < 5) {
      return `Por favor, me informe o endereço completo para entrega 📍`;
    }
    const total = state.items.reduce((sum, it) => sum + it.price * it.qty, 0) + deliveryFee;
    setCartState(stateKey, { ...state, step: 'payment', address: text.trim() });
    return `✅ *Resumo do pedido:*\n\n${state.items.map(it => `• ${it.name} x${it.qty} = R$ ${(it.price * it.qty).toFixed(2)}`).join('\n')}\n\n🚚 Entrega em: ${text.trim()}\n📦 Frete: R$ ${deliveryFee.toFixed(2)}\n💰 *Total: R$ ${total.toFixed(2)}*\n\nDigite *pagar* pra gerar o PIX 🙂`;
  }

  // ── COUPON ───────────────────────────────────────────────────────────────
  if (state.step === 'payment') {
    // Check if client is trying to apply a coupon
    const couponTrigger = t.startsWith('cupom') || t.startsWith('desconto') || t.includes('tenho cupom') || t.includes('código') || t.includes('promo');
    if (couponTrigger || (state as any).awaitingCoupon) {
      const couponCode = t.replace(/cupom|desconto|código|promo|tenho|use|aplicar/gi, '').trim().toUpperCase();
      if (couponCode.length >= 3) {
        // Lookup coupon in Firestore
        try {
          const couponSnap = await adminDb.collection(`salons/${salonId}/coupons`)
            .where('code', '==', couponCode).where('active', '==', true).limit(1).get();
          if (!couponSnap.empty) {
            const coupon = couponSnap.docs[0].data() as any;
            const now = Date.now();
            const isExpired = coupon.expiresAt && coupon.expiresAt < now;
            const usedUp = coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses;
            if (isExpired || usedUp) {
              return `❌ Cupom *${couponCode}* expirado ou esgotado. Tenta outro ou digita *pagar* sem cupom 😊`;
            }
            const subtotal = state.items.reduce((sum, it) => sum + it.price * it.qty, 0);
            const frete = state.deliveryMethod === 'delivery' ? deliveryFee : 0;
            let discount = 0;
            if (coupon.type === 'percent') discount = (subtotal * coupon.value) / 100;
            else if (coupon.type === 'fixed') discount = Math.min(coupon.value, subtotal);
            const newTotal = Math.max(0, subtotal + frete - discount);
            setCartState(stateKey, { ...state, step: 'payment', couponApplied: couponCode, couponDiscount: discount } as any);
            return `✅ Cupom *${couponCode}* aplicado!\n💸 Desconto: R$ ${discount.toFixed(2)}\n💰 *Novo total: R$ ${newTotal.toFixed(2)}*\n\nDigite *pagar* pra gerar o PIX 🎉`;
          } else {
            return `❌ Cupom *${couponCode}* não encontrado. Verifique o código e tente novamente, ou digita *pagar* sem cupom.`;
          }
        } catch { /* silencioso */ }
      }
      // Awaiting coupon code
      setCartState(stateKey, { ...state, awaitingCoupon: true } as any);
      return `🎟️ Qual é o código do seu cupom?`;
    }
  }

  // ── PAYMENT ──────────────────────────────────────────────────────────────
  if (state.step === 'payment') {
    if (t !== 'pagar' && t !== 'pagar agora' && !t.includes('gerar pix') && !t.includes('quero pagar')) {
      return `Digite *pagar* pra gerar o PIX, *cupom* se tiver um código de desconto, ou *cancelar* 😊`;
    }

    const subtotal = state.items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const frete = state.deliveryMethod === 'delivery' ? deliveryFee : 0;
    const couponDiscount = (state as any).couponDiscount || 0;
    const total = Math.max(0, subtotal + frete - couponDiscount);

    // Verificar se salão tem Asaas configurado
    const salonDoc = await adminDb.collection('salons').doc(salonId).get();
    const salonData = salonDoc.data() as any;
    const asaasKey = salonData?.asaasApiKey || process.env.ASAAS_API_KEY || '';

    if (!asaasKey) {
      // Sem Asaas — notifica dono e confirma pedido manualmente
      const orderId = await adminDb.collection(`salons/${salonId}/orders`).add({
        items: state.items,
        deliveryMethod: state.deliveryMethod || 'pickup',
        address: state.address || '',
        subtotal, shippingFee: frete, totalAmount: total,
        customerPhone: from, status: 'PENDING', paymentMethod: 'MANUAL',
        createdAt: Date.now(), source: 'whatsapp_bot',
      });
      if (ownerPhone) {
        const ownerMsg = `🛍️ *Novo pedido pelo WhatsApp!*\n\n${state.items.map(it => `• ${it.name} x${it.qty} — R$ ${(it.price * it.qty).toFixed(2)}`).join('\n')}\n\n${state.address ? `📍 Entrega: ${state.address}\n💰 Frete: R$ ${frete.toFixed(2)}\n` : '🏪 Retirada\n'}💰 *Total: R$ ${total.toFixed(2)}*\n📱 Cliente: ${from}`;
        await sendWhatsApp(ownerPhone, ownerMsg, SUPPORT_INSTANCE).catch(() => {});
      }
      clearCartState(stateKey);
      return `✅ *Pedido recebido!*\n\nTotal: R$ ${total.toFixed(2)}\n\nO ${salonName} vai entrar em contato pra confirmar o pagamento. Obrigado! 😊`;
    }

    // Com Asaas — gera PIX
    try {
      const orderRef = await adminDb.collection(`salons/${salonId}/orders`).add({
        items: state.items,
        deliveryMethod: state.deliveryMethod || 'pickup',
        address: state.address || '',
        subtotal, shippingFee: frete, totalAmount: total,
        customerPhone: from, status: 'AWAITING_PIX', paymentMethod: 'PIX',
        createdAt: Date.now(), source: 'whatsapp_bot',
      });

      // Cria cobrança no Asaas
      const dueDate = new Date();
      dueDate.setMinutes(dueDate.getMinutes() + 15);
      const chargeRes = await fetch('https://api.asaas.com/v3/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
        body: JSON.stringify({
          billingType: 'PIX',
          value: Number(total.toFixed(2)),
          dueDate: dueDate.toISOString().split('T')[0],
          description: `Pedido WhatsApp #${orderRef.id.slice(-6).toUpperCase()} — ${salonName}`,
          externalReference: `${salonId}__${orderRef.id}`,
        }),
      });
      const charge = await chargeRes.json();
      if (!charge.id) throw new Error('Erro ao gerar PIX');

      const qrRes = await fetch(`https://api.asaas.com/v3/payments/${charge.id}/pixQrCode`, {
        headers: { 'access_token': asaasKey },
      });
      const qrData = await qrRes.json();
      const pixCopyPaste = qrData.payload || '';

      await orderRef.update({ asaasPaymentId: charge.id, pixCopyPaste });

      setCartState(stateKey, {
        ...state, step: 'awaiting_payment',
        orderId: orderRef.id, asaasPaymentId: charge.id, pixCopyPaste,
      });

      // Inicia polling de pagamento
      pollPaymentBot(salonId, from, orderRef.id, charge.id, asaasKey, ownerPhone, state, total, stateKey);

      return `💳 *PIX gerado!*\n\nCopie o código abaixo e cole no seu banco:\n\n\`${pixCopyPaste}\`\n\n⏰ Expira em 15 minutos\n💰 Valor: R$ ${total.toFixed(2)}\n\nAssim que o pagamento for confirmado, te aviso aqui! 🔔`;
    } catch (e: any) {
      console.error('[SalesBot] Erro PIX:', e.message);
      clearCartState(stateKey);
      return `Ops, tive um problema pra gerar o PIX 😞 Por favor entre em contato diretamente com o ${salonName}.`;
    }
  }

  // ── AWAITING PAYMENT ─────────────────────────────────────────────────────
  if (state.step === 'awaiting_payment') {
    if (t.includes('paguei') || t.includes('já paguei') || t.includes('pix feito')) {
      return `✅ Estou verificando o pagamento... pode levar alguns segundos 🔄`;
    }
    return `⏳ Aguardando confirmação do PIX...\n\nAssim que confirmar te aviso aqui! Se precisar cancelar, digite *cancelar*.`;
  }

  return null;
}

// ── Polling de pagamento do bot ──────────────────────────────────────────────
async function pollPaymentBot(
  salonId: string, from: string, orderId: string, asaasPaymentId: string,
  asaasKey: string, ownerPhone: string, state: CartState, total: number, stateKey: string
) {
  const maxPolls = 30; // 15 min (30 x 30s)
  let pollCount = 0;

  const interval = setInterval(async () => {
    pollCount++;
    try {
      const res = await fetch(`https://api.asaas.com/v3/payments/${asaasPaymentId}`, {
        headers: { 'access_token': asaasKey },
      });
      const payment = await res.json();

      if (payment.status === 'RECEIVED' || payment.status === 'CONFIRMED') {
        clearInterval(interval);
        await adminDb.doc(`salons/${salonId}/orders/${orderId}`).update({ status: 'PAID', paidAt: Date.now() });
        clearCartState(stateKey);

        // Avisa o cliente
        await sendWhatsApp(from, `✅ *Pagamento confirmado!* Obrigado 🎉\n\nSeu pedido foi recebido e já estamos preparando tudo para você! 😊`, `salon_${salonId}`);

        // Avisa o dono
        if (ownerPhone) {
          const itemsText = state.items.map(it => `• ${it.name} x${it.qty} = R$ ${(it.price * it.qty).toFixed(2)}`).join('\n');
          const ownerMsg = `✅ *Pagamento confirmado!*\n\n🛍️ Pedido do WhatsApp #${orderId.slice(-6).toUpperCase()}\n\n${itemsText}\n\n${state.address ? `📍 Entregar em: ${state.address}\n` : '🏪 Retirada no local\n'}💰 *Total: R$ ${total.toFixed(2)}*\n📱 Cliente: ${from}`;
          await sendWhatsApp(ownerPhone, ownerMsg, SUPPORT_INSTANCE);
        }
      } else if (pollCount >= maxPolls || payment.status === 'OVERDUE') {
        clearInterval(interval);
        await adminDb.doc(`salons/${salonId}/orders/${orderId}`).update({ status: 'CANCELLED' });
        clearCartState(stateKey);
        await sendWhatsApp(from, `⏰ O tempo para pagamento expirou. Se quiser tentar novamente, é só falar *comprar*!`, `salon_${salonId}`);
      }
    } catch (e) {
      console.error('[PollPayment]', e);
    }
  }, 30000); // a cada 30s
}

async function handleSmartBot(
  salonId: string,
  from: string,
  text: string,
  pageContext?: string
): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  if (!GROQ_API_KEY) return handleSimpleBot(salonId, from, text);

  try {
    const ctx = await getSalonBotContext(salonId);

    // ── Tenta fluxo de agendamento primeiro ───────────────────────────────
    const bookingReply = await handleBookingFlow(salonId, from, text, ctx);
    if (bookingReply !== null) return bookingReply;

    // ── Tenta fluxo de meus agendamentos (consulta/cancelamento/reagendamento)
    const myApptsReply = await handleMyAppointmentsFlow(salonId, from, text);
    if (myApptsReply !== null) return myApptsReply;

    const {
      salon, business,
      bookingLink, storeLink, reviewsLink,
      hoursText, servicesText, profsText, productsText, addressText, anamneseLinks, avgRating, totalReviews, reviewsText,
    } = ctx;
    const salonName = salon.name || business.name || 'Salão';
    const phone     = business.whatsapp || business.phone || '';
    const mapsUrl   = addressText !== 'Consulte pelo WhatsApp'
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
      : '';

    // Contexto de página — dá dicas ao bot sobre onde o cliente está
    const pageCtxLine = pageContext
      ? `O cliente está atualmente na página: *${pageContext}*. Priorize informações e links relevantes a essa página.`
      : '';

    const { businessType, typeLabel } = ctx;

  // ── IA de sugestão: histórico do cliente ─────────────────────────────────
  let aiSuggestion = '';
  try {
    const histSnap = await adminDb.collection(`salons/${salonId}/appointments`)
      .where('customerPhone', '==', from)
      .where('status', '==', 'COMPLETED')
      .orderBy('date', 'desc').limit(1).get();
    if (!histSnap.empty) {
      const lastApt = histSnap.docs[0].data();
      const daysSince = Math.floor((Date.now() - new Date(lastApt.date + 'T00:00:00').getTime()) / 86400000);
      if (daysSince >= 25 && daysSince <= 120 && lastApt.serviceName) {
        aiSuggestion = `CONTEXTO: Este cliente fez "${lastApt.serviceName}" há ${daysSince} dias. Se for relevante na conversa, sugira que pode ser hora de retornar.`;
      }
    }
  } catch {}

    // Persona e comportamento por tipo de negócio
    const businessPersona: Record<string, string> = {
      beauty:   'assistente de beleza',
      health:   'assistente clínico',
      fitness:  'assistente de academia/estúdio',
      services: 'assistente de negócios',
      sports:   'assistente de esportes e lazer',
    };
    const persona = businessPersona[businessType] || 'assistente virtual';

    // Instruções extras por tipo
    const businessInstructions: Record<string, string> = {
      health:   'Para saúde: sempre sugira anamnese antes da primeira consulta. Use "paciente" em vez de "cliente". Chame agendamentos de "consultas".',
      fitness:  'Para fitness: use "aluno" em vez de "cliente". Mencione fichas de treino e avaliações físicas. Chame de "aulas" ou "treinos".',
      sports:   'Para esportes: mencione disponibilidade de quadras/espaços. Use "reserva" para agendamentos.',
      services: 'Para serviços profissionais: use linguagem formal. Mencione briefings e orçamentos quando relevante.',
      beauty:   'Para beleza: mencione programa de fidelidade quando relevante. Use "horário" para agendamentos.',
    };
    const extraInstructions = businessInstructions[businessType] || businessInstructions.beauty;

    const systemPrompt = [
      `Você é o ${persona} inteligente do *${salonName}*.`,
      `Responda SEMPRE em português brasileiro, com tom amigável, descontraído e natural — como um atendente simpático, não um robô.`,
      `Use emojis com naturalidade. Varie as respostas — nunca repita a mesma frase. Para agradecimentos, responda de forma curta e calorosa.`,
      `Nunca mostre o menu completo quando o cliente já está em uma conversa. Só mostre o menu no primeiro contato ou se o cliente pedir.`,
      `Nunca invente preços, horários ou serviços — use SOMENTE os dados abaixo.`,
      `IMPORTANTE: Se o cliente disser "aqui", "sim", "pode ser", "quero" em resposta a uma oferta de agendamento, ele quer AGENDAR — NÃO interprete como pergunta sobre endereço ou localização.`,
      `Se o cliente já demonstrou interesse em agendar, SEMPRE continue o assunto de agendamento, não mude de assunto.`,
      `Para perguntas sobre endereço, use apenas o endereço cadastrado abaixo. Não invente nem use placeholders como "Rua das Flores".`,
      `Se perguntarem se o negócio é bom, de confiança, ou pedirem avaliações: responda usando os dados de avaliação abaixo se disponíveis. Nunca invente avaliações.`,
      extraInstructions,
      pageCtxLine,
      ``,
      `═══════════════════════════════`,
      `📋 INFORMAÇÕES DO ESTABELECIMENTO`,
      `═══════════════════════════════`,
      `🏠 Nome: ${salonName}`,
      `📍 Endereço: ${addressText}`,
      mapsUrl ? `🗺️ Mapa: ${mapsUrl}` : '',
      `📞 WhatsApp/Tel: ${phone || 'Não informado'}`,
      ``,
      `⏰ HORÁRIOS DE FUNCIONAMENTO`,
      hoursText,
      ``,
      reviewsText ? `⭐ AVALIAÇÕES\n${reviewsText}` : '',
      ``,
      `✂️ SERVIÇOS E PREÇOS`,
      servicesText,
      profsText ? `
👥 EQUIPE
${profsText}` : '',
      productsText ? `
🛍️ PRODUTOS DA LOJA
${productsText}` : '',
      ``,
      `═══════════════════════════════`,
      `🔗 LINKS DIRETOS (use sempre que pertinente)`,
      `═══════════════════════════════`,
      `• Agendar online: ${bookingLink}`,
      `• Loja / produtos: ${storeLink}`,
      `• Deixar avaliação: ${reviewsLink}`,
      ``,
      `═══════════════════════════════`,
      `📌 REGRAS OBRIGATÓRIAS`,
      `═══════════════════════════════`,
      `1. Para agendamentos → sempre envie o link: ${bookingLink}`,
      `2. Para produtos/loja → sempre envie: ${storeLink}`,
      `3. Para avaliações → sempre envie: ${reviewsLink}`,
      `4. Para falar com humano → informe o WhatsApp: ${phone || bookingLink}`,
      `5. Não sabe a resposta → diga "vou verificar" e peça que entre em contato`,
      `6. Seja BREVE — máximo 3 parágrafos curtos ou 5 bullets por resposta`,
      `7. Nunca invente horários, preços ou profissionais que não estão listados acima`,
      anamneseLinks ? `\n📋 FORMULÁRIOS DE ANAMNESE (envie quando relevante):\n${anamneseLinks}` : '',
      `8. Se o salão tiver formulário de anamnese e o cliente mencionar consulta/avaliação, envie o link da anamnese para ele preencher antes`,
    ].filter(l => l !== undefined && l !== '').join('\n');

    const convKey = `${salonId}:${from}`;
    const history = getBotHistory(convKey);
    addBotMessage(convKey, 'user', text);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text },
    ];

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 600,
        temperature: 0.5,
      }),
    });

    if (!res.ok) throw new Error(`Groq error: ${res.status}`);
    const data = await res.json() as any;
    const reply = data.choices?.[0]?.message?.content || '';

    if (reply) addBotMessage(convKey, 'assistant', reply);
    return reply || handleSimpleBot(salonId, from, text);
  } catch (e) {
    console.error('[SmartBot]', e);
    return handleSimpleBot(salonId, from, text);
  }
}

// ─── Agenda diária para profissionais (WhatsApp 7h30) ───────────────────────
async function sendOwnerDailyAgenda(isNoon = false) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [y, m, d] = todayStr.split('-');
  const dateLabel = `${d}/${m}/${y}`;

  try {
    const salonsSnap = await adminDb.collection('salons')
      .where('status', 'in', ['ACTIVE', 'TRIAL']).get();

    for (const salonDoc of salonsSnap.docs) {
      const salonId = salonDoc.id;
      const salonData = salonDoc.data() as any;
      const salonName = salonData.name || 'Salão';

      try {
        const bizDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
        const biz = bizDoc.data() as any;
        const ownerPhone = await getOwnerNotificationPhone(salonId);
        if (!ownerPhone) continue;

        const aptsSnap = await adminDb.collection(`salons/${salonId}/appointments`)
          .where('date', '==', todayStr)
          .where('status', 'in', ['CONFIRMED', 'PENDING'])
          .orderBy('startTime', 'asc').get();

        if (aptsSnap.empty) {
          if (!isNoon) {
            await sendWhatsApp(ownerPhone,
              `☀️ *Bom dia, ${salonName}!*

Nenhum agendamento confirmado para hoje. Aproveite para divulgar! 📣`,
              `salon_${salonId}`);
          }
          continue;
        }

        const total = aptsSnap.size;
        const list = aptsSnap.docs.map(doc => {
          const a = doc.data();
          return `🕐 *${a.startTime}* — ${a.clientName} | ${a.serviceName}${a.professionalName ? ' | ' + a.professionalName : ''}`;
        }).join('\n');

        // Horários livres
        const allTimes = aptsSnap.docs.map(doc => doc.data().startTime);
        const workHours = biz?.workingHours;
        const dayKeys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        const dayKey = dayKeys[new Date(todayStr + 'T00:00:00').getDay()];
        const hours = workHours?.[dayKey];
        let freeSlotsMsg = '';
        if (hours && !hours.closed) {
          freeSlotsMsg = `
💡 Horários disponíveis para agendamento!`;
        }

        const header = isNoon
          ? `📋 *Resumo do meio-dia — ${dateLabel}*

`
          : `☀️ *Bom dia! Agenda de hoje — ${dateLabel}*

`;

        const msg = header + list +
          (total > 10 ? `
…e mais ${total - 10}` : '') +
          `

📊 Total: *${total} agendamento(s)*` + freeSlotsMsg;

        await sendWhatsApp(ownerPhone, msg, SUPPORT_INSTANCE);
        console.log(`[AgendaDono] ${isNoon ? 'Meio-dia' : 'Manhã'} enviado para ${salonName}`);
      } catch (e) {
        console.error(`[AgendaDono] Erro salão ${salonId}:`, e);
      }
    }
  } catch (e) {
    console.error('[AgendaDono] Erro geral:', e);
  }
}

async function sendProfessionalDailyAgenda() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [y, m, d] = todayStr.split('-');
  const dateLabel = `${d}/${m}/${y}`;

  try {
    // Busca todos os salões ativos
    const salonsSnap = await adminDb.collection('salons')
      .where('status', 'in', ['ACTIVE', 'TRIAL']).get();

    for (const salonDoc of salonsSnap.docs) {
      const salonId  = salonDoc.id;
      const salonData = salonDoc.data() as any;
      const salonName = salonData.name || 'Salão';

      try {
        // Agendamentos de hoje
        const aptsSnap = await adminDb.collection(`salons/${salonId}/appointments`)
          .where('date', '==', todayStr)
          .where('status', 'in', ['CONFIRMED', 'PENDING'])
          .orderBy('startTime', 'asc').get();

        if (aptsSnap.empty) continue;

        // Agrupa por profissional
        const byProf = new Map<string, any[]>();
        for (const doc of aptsSnap.docs) {
          const apt = doc.data();
          const pid = apt.professionalId || '__sem_prof__';
          if (!byProf.has(pid)) byProf.set(pid, []);
          byProf.get(pid)!.push(apt);
        }

        // Busca profissionais com phone cadastrado
        const profsSnap = await adminDb.collection(`salons/${salonId}/professionals`)
          .where('active', '==', true).get();

        for (const profDoc of profsSnap.docs) {
          const prof = profDoc.data() as any;
          const profPhone: string = prof.phone || '';
          if (!profPhone) continue;

          const myApts = byProf.get(profDoc.id) || [];
          if (myApts.length === 0) continue;

          const list = myApts.map((a: any) =>
            `🕐 *${a.startTime}* — ${a.clientName} (${a.serviceName})`
          ).join('\n');

          const msg =
            `☀️ *Bom dia, ${prof.displayName}!*

` +
            `Sua agenda de hoje — *${dateLabel}*:

${list}

` +
            `Total: *${myApts.length} atendimento(s)*

` +
            `Tenha um ótimo dia! 💪 — *${salonName}*`;

          await sendWhatsApp(profPhone, msg, `salon_${salonId}`);
          console.log(`[AgendaDiária] Enviado para ${prof.displayName} (${salonId})`);
        }

        // Envia resumo também para o dono do salão (whatsapp do business)
        try {
          const bizDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
          const biz = bizDoc.data() as any;
          const ownerPhone = await getOwnerNotificationPhone(salonId);
          if (ownerPhone) {
            const total = aptsSnap.size;
            const list = aptsSnap.docs.slice(0, 8).map(doc => {
              const a = doc.data();
              return `🕐 *${a.startTime}* — ${a.clientName} | ${a.serviceName} | ${a.professionalName || '—'}`;
            }).join('\n');
            const msg =
              `📋 *Agenda do dia — ${dateLabel}*

${list}` +
              (total > 8 ? `
…e mais ${total - 8} agendamento(s)` : '') +
              `

Total: *${total} atendimento(s)*`;
            await sendWhatsApp(ownerPhone, msg, SUPPORT_INSTANCE);
          }
        } catch { /* sem whatsapp do dono */ }

      } catch (e) {
        console.error(`[AgendaDiária] Erro salão ${salonId}:`, e);
      }
    }
  } catch (e) {
    console.error('[AgendaDiária] Erro geral:', e);
  }
}

// ─── Cron: renova slots de pacotes esportivos ────────────────────────────────
// Todo dia às 6h verifica pacotes cujo billingDay é hoje → gera novos slots
cron.schedule('0 6 * * *', async () => {
  const today = new Date();
  const todayDay = today.getDate();
  try {
    const salonsSnap = await adminDb.collection('salons')
      .where('status', 'in', ['ACTIVE', 'TRIAL']).get();
    for (const salonDoc of salonsSnap.docs) {
      const salonId = salonDoc.id;
      const pkgsSnap = await adminDb.collection(`salons/${salonId}/sport_packages`)
        .where('status', '==', 'active')
        .where('billingDay', '==', todayDay).get();
      for (const pkgDoc of pkgsSnap.docs) {
        const pkg = pkgDoc.data();
        const generated = await _generatePackageSlots(salonId, pkgDoc.id, pkg).catch(() => 0);
        if (generated > 0) {
          console.log(`[PackageCron] ${generated} slots renovados: ${salonId}/${pkgDoc.id}`);
        }
      }
    }
  } catch (e) { console.error('[PackageCron]', e); }
});

// Roda todo dia às 8h da manhã
// Roda todo dia às 8h da manhã
cron.schedule('0 8 * * *', () => {
  console.log('[Cron 8h] Rodando jobs diários...');
  sendAppointmentReminders().catch(console.error);
  sendBirthdayMessages().catch(console.error);
  checkReengagement().catch(console.error);
  upgradeVIPClients().catch(console.error);
  sendConfirmationRequests().catch(console.error);
  checkPostServiceFollowup().catch(console.error);
});

// Agenda diária para profissionais — 7h30
cron.schedule('30 7 * * *', () => {
  console.log('[Cron 7h30] Enviando agenda diária para profissionais...');
  sendProfessionalDailyAgenda().catch(console.error);
});

// Agenda do dono às 7h30
cron.schedule('30 7 * * *', () => {
  sendOwnerDailyAgenda(false).catch(console.error);
});

// Resumo do meio-dia para o dono
cron.schedule('0 12 * * *', () => {
  sendOwnerDailyAgenda(true).catch(console.error);
});

// ─── Cron: verifica reservas expiradas (a cada hora) ─────────────────────────
// ── Cron: libera horários com sinal expirado (a cada 5 minutos) ─────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = Date.now();
    const expired = await adminDb.collectionGroup('appointments')
      .where('status', '==', 'AWAITING_DEPOSIT')
      .where('depositExpiresAt', '<=', now)
      .get();

    const batch = adminDb.batch();
    expired.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'CANCELLED',
        depositStatus: 'PENDING',
        cancelledReason: 'Sinal não pago no prazo de 30 minutos',
        updatedAt: now,
      });
    });
    if (!expired.empty) {
      await batch.commit();
      console.log(`[Deposit Cron] ${expired.size} agendamentos cancelados por falta de sinal`);
    }
  } catch (e) {
    console.error('[Deposit Cron]', e);
  }
});

// ── Cron: Lembrete de retorno de pacientes (08h30 diário) ─────────────────────
cron.schedule('30 8 * * *', async () => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const [y, m, d] = tomorrowStr.split('-');
    const dateLabel = `${d}/${m}/${y}`;

    const salonsSnap = await adminDb.collection('salons')
      .where('status', 'in', ['ACTIVE', 'TRIAL']).get().catch(() => ({ docs: [] } as any));

    let sent = 0;
    for (const sDoc of (salonsSnap as any).docs) {
      const salonId = sDoc.id;
      try {
        const snap = await adminDb.collection(`salons/${salonId}/client_returns`)
          .where('returnDate', '==', tomorrowStr)
          .where('reminderSent', '==', false).get().catch(() => ({ docs: [] } as any));

        for (const rDoc of snap.docs) {
          const r = rDoc.data() as any;
          if (!r.clientPhone) continue;
          await sendWhatsApp(r.clientPhone,
            `Olá, ${r.clientName}! 📅 Lembrete: seu retorno é *amanhã (${dateLabel})*${r.returnTime ? ` às *${r.returnTime}*` : ''}.

Te esperamos! 😊`,
            `salon_${salonId}`).catch(() => {});
          await rDoc.ref.update({ reminderSent: true, reminderSentAt: Date.now() });
          sent++;
          await new Promise(res => setTimeout(res, 1200));
        }
      } catch {}
    }
    if (sent > 0) console.log(`[RetornoCron] ${sent} lembretes enviados`);
  } catch (e) { console.error('[RetornoCron]', e); }
});

cron.schedule('0 * * * *', async () => {
  try {
    const now = Date.now();
    const fourHoursAgo = now - 4 * 60 * 60 * 1000;
    const eightHoursAgo = now - 8 * 60 * 60 * 1000;

    const reservedOrders = await adminDb.collectionGroup("orders")
      .where("status", "==", "RESERVED")
      .get();

    for (const d of reservedOrders.docs) {
      const order = d.data();
      const path = d.ref.path.split("/");
      const salonId = path[1];
      const createdAt = order.createdAt || 0;

      // Auto-completa como COMPLETED após 8h (dono esqueceu de dar baixa)
      if (createdAt < eightHoursAgo) {
        await d.ref.update({ status: "COMPLETED", updatedAt: now });
        console.log("[Reserva] Auto-completado:", d.id);
        continue;
      }

      // Lembrete para o dono após 4h sem confirmar pagamento
      if (createdAt < fourHoursAgo && !order.reservationReminderSent) {
        const businessDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
        const business = businessDoc.data() as any;
        if (business?.whatsapp) {
          await sendWhatsApp(
            business.whatsapp,
            `⚠️ Lembrete: reserva pendente de confirmação!\n\n` +
            `Cliente: ${order.customerName || "—"}\n` +
            `Valor: R$ ${Number(order.totalAmount || 0).toFixed(2)}\n\n` +
            `Acesse o painel para confirmar o pagamento e dar baixa no pedido.`,
            `salon_${salonId}`
          );
        }
        await d.ref.update({ reservationReminderSent: true });
      }
    }
  } catch (e) {
    console.error("[Reserva Cron]", e);
  }
});

// ─── Sistema de Follow-up e Alertas do CRM ───────────────────────────────────
// Roda todo dia às 8h junto com os lembretes normais
async function runCRMFollowUps() {
  console.log('[CRM FollowUp] Iniciando verificações...');
  try {
    const salonsSnap = await adminDb.collection('salons')
      .where('status', 'in', ['ACTIVE', 'TRIAL']).get();

    for (const salonDoc of salonsSnap.docs) {
      const salonId = salonDoc.id;
      const salonData = salonDoc.data() as any;

      try {
        // Busca whatsapp do dono
        const bizDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
        const ownerPhone = bizDoc.data()?.whatsapp || '';
        const salonName = salonData.name || 'seu negócio';
        const instance = `salon_${salonId}`;

        if (!ownerPhone) continue;

        const todayStr = new Date().toISOString().split('T')[0];
        const today = new Date(todayStr + 'T00:00:00');

        // ── 1. Follow-up pós-atendimento ──────────────────────────────────────
        // Busca atendimentos completados há 7 dias sem follow-up
        const followUpDays = [7, 30, 60]; // dias para follow-up

        for (const days of followUpDays) {
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() - days);
          const targetDateStr = targetDate.toISOString().split('T')[0];

          const aptsSnap = await adminDb.collection(`salons/${salonId}/appointments`)
            .where('date', '==', targetDateStr)
            .where('status', '==', 'COMPLETED')
            .get();

          if (aptsSnap.empty) continue;

          // Agrupa por cliente
          const clientsToFollowUp = new Map<string, any>();
          for (const d of aptsSnap.docs) {
            const apt = d.data();
            const phone = (apt.customerPhone || '').replace(/\D/g, '');
            if (!phone || phone.length < 10) continue;

            // Verifica se já criou tarefa de follow-up para esse cliente nessa data
            const existingTask = await adminDb.collection(`salons/${salonId}/crm_tasks`)
              .where('type', '==', 'follow_up_auto')
              .where('clientPhone', '==', phone)
              .where('followUpDate', '==', targetDateStr)
              .limit(1).get();

            if (!existingTask.empty) continue;

            if (!clientsToFollowUp.has(phone)) {
              clientsToFollowUp.set(phone, {
                name: apt.clientName || 'Cliente',
                phone,
                service: apt.serviceName || '',
                date: targetDateStr,
              });
            }
          }

          if (clientsToFollowUp.size === 0) continue;

          // Monta lista de follow-ups
          const list = Array.from(clientsToFollowUp.values());
          const label = days === 7 ? '7 dias' : days === 30 ? '1 mês' : '2 meses';

          // Cria tarefas no CRM
          for (const client of list) {
            await adminDb.collection(`salons/${salonId}/crm_tasks`).add({
              salonId,
              clientName: client.name,
              clientPhone: client.phone,
              title: `Follow-up ${label} — ${client.name}`,
              description: `Serviço: ${client.service} em ${client.date.split('-').reverse().join('/')}. Mande uma mensagem perguntando como está!`,
              dueDate: todayStr,
              priority: days === 7 ? 'high' : 'medium',
              status: 'pending',
              type: 'follow_up_auto',
              followUpDate: client.date,
              followUpDays: days,
              createdAt: Date.now(),
            });
          }

          // Notifica dono via WhatsApp
          const listText = list.slice(0, 5).map(c =>
            `• ${c.name} — ${c.service}`
          ).join('\n');

          const msg = `🔔 *Follow-up de ${label} — ${salonName}*

` +
            `${list.length} cliente(s) aguardam mensagem de acompanhamento:

` +
            listText +
            (list.length > 5 ? `
…e mais ${list.length - 5}` : '') +
            `

Acesse o CRM → Tarefas para ver todos. 💬`;

          const _fp = await getOwnerNotificationPhone(salonId);
          if (_fp) await sendWhatsApp(_fp, msg, SUPPORT_INSTANCE);
          console.log(`[FollowUp] ${salonId}: ${list.length} follow-ups de ${days} dias`);
        }

        // ── 2. Alertas de conversa sem resposta ───────────────────────────────
        // Tarefas criadas manualmente com dueDate = hoje que ainda estão pendentes
        const overdueTasks = await adminDb.collection(`salons/${salonId}/crm_tasks`)
          .where('status', '==', 'pending')
          .where('dueDate', '<=', todayStr)
          .get();

        const pendingToday = overdueTasks.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(t => t.type !== 'follow_up_auto' || t.dueDate === todayStr);

        if (pendingToday.length > 0) {
          const taskList = pendingToday.slice(0, 5).map((t: any) =>
            `• ${t.title}${t.clientName ? ` — ${t.clientName}` : ''}`
          ).join('\n');

          const overdueMsg = `📋 *Tarefas para hoje — ${salonName}*

` +
            `${pendingToday.length} tarefa(s) pendente(s):

` +
            taskList +
            (pendingToday.length > 5 ? `
…e mais ${pendingToday.length - 5}` : '') +
            `

Abra o CRM para resolver! ✅`;

          const _op = await getOwnerNotificationPhone(salonId);
          if (_op) await sendWhatsApp(_op, overdueMsg, SUPPORT_INSTANCE);
        }

        // ── 3. Reengajamento automático avançado ──────────────────────────────
        // Clientes que foram atendidos há X dias sem retornar
        const reengageDays = [45, 90];
        for (const days of reengageDays) {
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() - days);
          const targetDateStr = targetDate.toISOString().split('T')[0];
          const cutoffDate = new Date(today);
          cutoffDate.setDate(cutoffDate.getDate() - (days - 5)); // janela de 5 dias

          const oldApts = await adminDb.collection(`salons/${salonId}/appointments`)
            .where('date', '>=', targetDate.toISOString().split('T')[0])
            .where('date', '<=', cutoffDate.toISOString().split('T')[0])
            .where('status', '==', 'COMPLETED')
            .get();

          for (const d of oldApts.docs) {
            const apt = d.data();
            const phone = (apt.customerPhone || '').replace(/\D/g, '');
            if (!phone) continue;

            // Verifica se já tem agendamento futuro
            const futureApt = await adminDb.collection(`salons/${salonId}/appointments`)
              .where('customerPhone', '==', apt.customerPhone)
              .where('date', '>=', todayStr)
              .where('status', 'in', ['PENDING', 'CONFIRMED'])
              .limit(1).get();

            if (!futureApt.empty) continue;

            // Verifica se já enviou reengajamento recente
            const existingRe = await adminDb.collection(`salons/${salonId}/crm_tasks`)
              .where('type', '==', 'reengagement_auto')
              .where('clientPhone', '==', phone)
              .where('createdAt', '>=', Date.now() - 30 * 24 * 60 * 60 * 1000)
              .limit(1).get();

            if (!existingRe.empty) continue;

            // Envia mensagem de reengajamento para o cliente via bot
            const daysLabel = days === 45 ? '45 dias' : '3 meses';
            // Usa mensagem customizada do bot_config se disponível
            const reBotDoc = await adminDb.doc(`salons/${salonId}/settings/bot_config`).get().catch(() => null);
            const reBotCfg = reBotDoc?.data() as any || {};
            const reTemplate = reBotCfg.reengagementMessage ||
              `Oi, {{nome}}! 😊\n\nFaz um tempinho que não te vemos no *{{salao}}* e sentimos sua falta!\n\nQue tal agendar um horário? ✨\n🔗 {{link}}`;
            const reMsg = reTemplate
              .replace(/{{nome}}/g, apt.clientName || 'cliente')
              .replace(/{{salao}}/g, salonName)
              .replace(/{{link}}/g, `${process.env.APP_URL || ''}/s/${salonData.slug || salonId}`);

            await sendWhatsApp(phone, reMsg, instance);

            // Registra no CRM
            await adminDb.collection(`salons/${salonId}/crm_tasks`).add({
              salonId, clientName: apt.clientName, clientPhone: phone,
              title: `Reengajamento ${daysLabel} — ${apt.clientName}`,
              description: `Mensagem de reengajamento enviada automaticamente.`,
              dueDate: todayStr, priority: 'low',
              status: 'done', type: 'reengagement_auto',
              createdAt: Date.now(),
            });

            console.log(`[Reengajamento] ${salonId}: ${apt.clientName} (${daysLabel})`);
          }
        }

      } catch (e) {
        console.error(`[CRM FollowUp] Erro salão ${salonId}:`, e);
      }
    }
  } catch (e) {
    console.error('[CRM FollowUp] Erro geral:', e);
  }
}

// ─── Cron: Follow-up CRM às 8h30 (depois dos lembretes normais) ──────────────
cron.schedule('30 8 * * *', () => {
  runCRMFollowUps().catch(console.error);
});

// ── Cron: CRM Pro — follow-up automático de sequências (a cada hora) ─────────
cron.schedule('0 * * * *', async () => {
  try {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const salonsSnap = await adminDb.collection('salons')
      .where('plan', '==', 'crm-pro').get().catch(() => ({ docs: [] } as any));

    let totalSent = 0;

    for (const salonDoc of (salonsSnap as any).docs) {
      const salonId = salonDoc.id;
      try {
        const seqSnap = await adminDb.collection(`salons/${salonId}/crm_followup_sequences`)
          .where('active', '==', true).get();
        if (seqSnap.empty) continue;

        const leadsSnap = await adminDb.collection(`salons/${salonId}/crm_clients`).get();

        for (const leadDoc of leadsSnap.docs) {
          const lead = leadDoc.data() as any;
          if (!lead.phone || lead.humanTakeover) continue;

          const lastContactAge = now - (lead.lastContact || 0);

          for (const seqDoc of seqSnap.docs) {
            const seq = seqDoc.data() as any;
            if (seq.triggerStatus !== lead.status) continue;

            // ── Fix: só dispara se o lead foi adicionado/atualizado DEPOIS que a sequência foi criada
            // Isso evita disparar para clientes antigas que já estavam no funil
            const seqCreatedAt = seq.createdAt || 0;
            const leadEnteredAt = lead.createdAt || lead.updatedAt || 0;
            if (leadEnteredAt < seqCreatedAt - (7 * 24 * 60 * 60 * 1000)) {
              // Lead é mais antigo que a sequência (com 7 dias de tolerância) — pula
              continue;
            }

            // ── Fix: para se o cliente respondeu depois do último envio do bot
            const lastBotMsg = (lead as any).lastBotMessageAt || 0;
            const lastClientMsg = (lead as any).lastClientMessageAt || lead.lastContact || 0;
            if (lastClientMsg > lastBotMsg && lastBotMsg > 0) {
              // Cliente já respondeu o último follow-up — para a sequência
              continue;
            }

            const sentSnap = await adminDb.collection(`salons/${salonId}/crm_clients/${leadDoc.id}/followup_sent`)
              .where('sequenceId', '==', seqDoc.id).get();
            const sentStepIndexes = new Set(sentSnap.docs.map((d: any) => d.data().stepIndex));

            for (let i = 0; i < seq.steps.length; i++) {
              if (sentStepIndexes.has(i)) continue;
              const step = seq.steps[i];
              const requiredAge = step.delayDays * dayMs;

              if (lastContactAge >= requiredAge) {
                try {
                  const salonData = salonDoc.data() as any;
                  const instanceName = salonData?.whatsappInstance || `salon_${salonId}`;
                  const msg = (step.message as string).replace(/\{\{nome\}\}/gi, lead.name || 'você');
                  await sendWhatsApp(lead.phone.replace(/\D/g, ''), msg, instanceName);

                  await adminDb.collection(`salons/${salonId}/crm_clients/${leadDoc.id}/followup_sent`).add({
                    sequenceId: seqDoc.id, stepIndex: i, sentAt: now, message: msg,
                  });
                  await adminDb.collection(`salons/${salonId}/crm_clients/${leadDoc.id}/messages`).add({
                    text: `🔄 [Follow-up] ${msg}`, from: 'bot', timestamp: now,
                  });
                  await leadDoc.ref.update({ lastContact: now, lastBotMessageAt: now });
                  totalSent++;
                } catch {}
                break;
              }
            }
          }
        }
      } catch (e: any) {
        console.error(`[CRM Followup] Salon ${salonId}:`, e.message);
      }
    }

    if (totalSent > 0) console.log(`[CRM Followup Cron] ${totalSent} follow-ups enviados`);
  } catch (e) {
    console.error('[CRM Followup Cron]', e);
  }
});

// ─── Mercado Pago ────────────────────────────────────────────────────────────
const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || "";
const MP_BASE_URL = "https://api.mercadopago.com";

async function createMpPreference(payload: object): Promise<any> {
  const res = await fetch(`${MP_BASE_URL}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mercado Pago error: ${err}`);
  }
  return res.json();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware to verify Firebase Auth Token
const authenticateUser = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying auth token:", error);
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

async function getRequestUserProfile(uid: string) {
  const userDoc = await adminDb.collection("users").doc(uid).get();
  return userDoc.exists ? userDoc.data() as any : null;
}

// Gera slots de agendamento para um pacote esportivo (chamado pelo webhook + renovação)
async function _generatePackageSlots(salonId: string, packageId: string, pkg: any) {
  const { daysOfWeek = [], startTime, endTime, professionalId, professionalName,
          serviceId, serviceName, clientName, clientPhone, pricePerMonth } = pkg;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 35); // próximos 35 dias

  const existing = await adminDb.collection(`salons/${salonId}/appointments`)
    .where("sportPackageId", "==", packageId).get();
  const existingDates = new Set(existing.docs.map(d => d.data().date));

  const batch = adminDb.batch();
  let count = 0;
  for (let d = new Date(today); d <= horizon; d.setDate(d.getDate() + 1)) {
    if (!daysOfWeek.includes(d.getDay())) continue;
    const dateStr = d.toISOString().split("T")[0];
    if (existingDates.has(dateStr)) continue;

    const newRef = adminDb.collection(`salons/${salonId}/appointments`).doc();
    batch.set(newRef, {
      salonId, sportPackageId: packageId,
      clientId:    `pkg_${packageId}`,
      clientName:  clientName  || "Pacote",
      customerPhone: clientPhone || "",
      professionalId,
      professionalName: professionalName || "",
      serviceId:   serviceId || "",
      serviceName: serviceName || "",
      date:        dateStr,
      startTime:   startTime,
      endTime:     endTime,
      status:      "CONFIRMED",
      totalAmount: Number(pricePerMonth) || 0,
      notes:       "Reservado via pacote mensal",
      reminderSent: false,
      source:      "sport_package",
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    });
    count++;
  }
  if (count > 0) await batch.commit();
  console.log(`[SportPackage] ${count} slots gerados para pacote ${packageId}`);
  return count;
}

// ─── Bot de Suporte da Plataforma Bella & Chic ───────────────────────────────
async function handleSupportBot(from: string, text: string): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  const t = text.toLowerCase().trim();

  const thanks = ['obrigad', 'valeu', 'brigad', 'vlw'];
  if (thanks.some(k => t.includes(k))) return 'De nada! 😊 Qualquer outra dúvida é só chamar!';
  const bye = ['tchau', 'até', 'falou', 'flw', 'xau'];
  if (bye.some(k => t.includes(k))) return 'Até logo! 👋 Estamos sempre aqui!';

  if (!GROQ_API_KEY) return getSimpleSupportResponse(t);

  const systemPrompt = `Você é o assistente virtual de SUPORTE da plataforma *Bella & Chic* — SaaS brasileiro para salões, barbearias, clínicas, academias e qualquer negócio de serviços.

Responda em português brasileiro, com tom amigável e direto. Use emojis com naturalidade. Máximo 3 parágrafos.

PLANOS:
• Agenda R$64,99: agendamento 24h, até 3 profissionais, ficha clientes, anamnese, fidelidade, bot simples
• Agenda Pro R$89,99: tudo + ilimitado, CRM, prontuários, orçamentos PIX/cartão, bot IA, relatório completo
• Loja R$64,99: loja virtual, PIX Asaas, estoque, cupons, checkout
• Completo R$159,90: TUDO + DRE + suporte VIP
• Trial: 30 dias grátis sem cartão

COMO CONFIGURAR:
• Asaas PIX: Admin → Configurações → Financeiro → colar API key
• Personalizar: Admin → Configurações → Aparência
• Profissional: Admin → Equipe → Adicionar
• Serviço: Admin → Serviços → Novo
• WhatsApp bot: Admin → Configurações → WhatsApp → Conectar
• Anamnese: Admin → Anamnese → Novo template
• CRM: Admin → CRM → Funil

REGRAS:
1. Para atendimento humano diga "em instantes nosso time entra em contato"
2. Nunca invente preços ou funções
3. Seja breve e claro
4. Site: bella-chic.duckdns.org`;

  const convKey = `support:${from}`;
  const history = getBotHistory(convKey);
  addBotMessage(convKey, 'user', text);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...history.slice(-8), { role: 'user', content: text }],
        max_tokens: 500, temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error('Groq error');
    const data = await res.json() as any;
    const reply = data.choices?.[0]?.message?.content || '';
    if (reply) addBotMessage(convKey, 'assistant', reply);
    return reply || getSimpleSupportResponse(t);
  } catch { return getSimpleSupportResponse(t); }
}

function getSimpleSupportResponse(t: string): string {
  if (t.includes('plano') || t.includes('preço') || t.includes('valor')) {
    return `💳 *Nossos planos:*

• *Agenda* — R$ 64,99/mês
• *Agenda Pro* — R$ 89,99/mês
• *Loja* — R$ 64,99/mês
• *Completo* — R$ 159,90/mês

Todos com *30 dias grátis* sem cartão! 🎉`;
  }
  if (t.includes('asaas') || t.includes('pix')) {
    return `💰 PIX via Asaas:

1. Crie conta em asaas.com
2. Admin → *Configurações → Financeiro*
3. Cole sua API key

Pronto! Clientes pagam via PIX automático 😊`;
  }
  if (t.includes('whatsapp') || t.includes('bot')) {
    return `🤖 Para conectar o WhatsApp:

Admin → *Configurações → WhatsApp → Conectar*

Escaneie o QR Code e o bot começa a responder seus clientes! 😊`;
  }
  const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'hey'];
  if (greetings.some(g => t.includes(g)) || t.length < 5) {
    return `Olá! 👋 Bem-vindo ao suporte da *Bella & Chic*!

Posso te ajudar com planos, configuração, bot WhatsApp, Asaas PIX e muito mais.

O que você precisa? 😊`;
  }
  return `Entendi! 😊 Para atendimento humano fale *"quero falar com atendente"* — te transfiro na hora! 👨‍💻`;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3066;
  const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

  // Middleware para definir cabeçalhos de segurança e charset
  app.use((req, res, next) => {
    if (req.url.endsWith('.html') || req.accepts('html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (req.url.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (req.url.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    // REMOVIDO: Cross-Origin-Opener-Policy bloqueava o popup do Google OAuth
    next();
  });

  // ─── Stripe Webhook (raw body obrigatório) ───────────────────────────────
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripe || !endpointSecret) {
      return res.status(400).send("Stripe not configured");
    }

    const sig = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const kind = session.metadata?.kind;

          if (kind === "subscription") {
            const salonId = session.metadata?.salonId;
            if (salonId && session.subscription) {
              const subscriptionId = String(session.subscription);
              let subscriptionData: Stripe.Subscription | null = null;
              try {
                subscriptionData = await stripe.subscriptions.retrieve(subscriptionId);
              } catch (error) {
                console.error("Error retrieving Stripe subscription:", error);
              }

              await adminDb.collection("subscriptions").doc(subscriptionId).set(
                {
                  salonId,
                  status: "ACTIVE",
                  stripeSubscriptionId: subscriptionId,
                  planId:
                    subscriptionData?.items?.data?.[0]?.price?.id ||
                    session.metadata?.priceId ||
                    null,
                  currentPeriodEnd:
                    subscriptionData?.items?.data?.[0]?.current_period_end
                      ? subscriptionData.items.data[0].current_period_end * 1000
                      : null,
                  cancelAtPeriodEnd: subscriptionData?.cancel_at_period_end || false,
                  customerId:
                    typeof session.customer === "string" ? session.customer : null,
                  checkoutSessionId: session.id,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
                { merge: true }
              );

              await adminDb.collection("salons").doc(salonId).set(
                {
                  status: "ACTIVE",
                  subscriptionId,
                  updatedAt: Date.now(),
                },
                { merge: true }
              );

              await adminDb.collection("billing_events").add({
                salonId,
                type: "SUBSCRIPTION_CHECKOUT_COMPLETED",
                status: "SUCCESS",
                metadata: {
                  subscriptionId,
                  checkoutSessionId: session.id,
                },
                createdAt: Date.now(),
              });

              console.log(`Subscription payment successful for salon ${salonId}, session: ${session.id}`);

              // ── Processa afiliado após pagamento confirmado ────────────────
              const salonSnapForAff = await adminDb.collection("salons").doc(salonId).get();
              const salonDataAff = salonSnapForAff.data() as any;
              const affRef = session.metadata?.affiliateRef || salonDataAff?.affiliateRef;
              const discountApplied = Number(session.metadata?.discountApplied || 0);

              if (affRef && !salonDataAff?.affiliateDiscountApplied) {
                // Marca desconto como aplicado
                await adminDb.collection("salons").doc(salonId).update({
                  affiliateDiscountApplied: true,
                  affiliateDiscountValue: discountApplied,
                  affiliatePaidAt: Date.now(),
                });

                // Descobre se é salão indicador ou marketeiro
                const [refSalonSnap, marketerSnap] = await Promise.all([
                  adminDb.collection("salons").where("slug", "==", affRef).limit(1).get(),
                  adminDb.collection("affiliates").doc(affRef).get(),
                ]);

                // Verifica se link de marketeiro está ativo e não expirado
                if (marketerSnap.exists) {
                  const mData = marketerSnap.data() as any;
                  const expired = mData?.expiresAt && Date.now() > mData.expiresAt;
                  const inactive = mData?.active === false;
                  if (expired || inactive) {
                    console.log(`[Affiliate] Link ${affRef} ${expired ? 'expirado' : 'inativo'} — comissão não registrada`);
                    break;
                  }
                }

                if (!refSalonSnap.empty) {
                  // SALÃO INDICADOR: ganha crédito de 10% de desconto
                  const refSalonRef = refSalonSnap.docs[0].ref;
                  const currentCredits = refSalonSnap.docs[0].data().referralCredits || 0;
                  const newCredits = currentCredits + 1;
                  const newDiscount = Math.min(newCredits * 15, 50);
                  await refSalonRef.update({
                    referralCredits: newCredits,
                    referralDiscountPct: newDiscount,
                    updatedAt: Date.now(),
                  });
                  // Registra evento de crédito
                  await adminDb.collection("affiliate_events").add({
                    type: "SALON_REFERRAL_CREDIT",
                    referrerSlug: affRef,
                    newSalonId: salonId,
                    creditsGranted: 1,
                    discountEarned: newDiscount,
                    createdAt: Date.now(),
                  });
                  console.log(`[Affiliate] Crédito +1 para salão ${affRef} → desconto agora ${newDiscount}%`);

                } else if (marketerSnap.exists) {
                  // MARKETEIRO: registra comissão de 30% a pagar
                  const planPrice = subscriptionData?.items?.data?.[0]?.price?.unit_amount
                    ? subscriptionData.items.data[0].price.unit_amount / 100
                    : 0;
                  const commissionValue = planPrice * (30 / 100);

                  await marketerSnap.ref.update({
                    totalConversions: FieldValue.increment(1),
                    pendingPayment: FieldValue.increment(commissionValue),
                    updatedAt: Date.now(),
                  });
                  await adminDb.collection("affiliate_events").add({
                    type: "MARKETER_COMMISSION",
                    marketerSlug: affRef,
                    newSalonId: salonId,
                    planPrice,
                    commissionValue,
                    commissionPct: 30,
                    paid: false,
                    createdAt: Date.now(),
                  });
                  console.log(`[Affiliate] Comissão R$${commissionValue.toFixed(2)} para marketeiro ${affRef}`);
                }
              }
            }
          }
          break;
        }

        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;

          // ── Quando um salão cancela, remove crédito do indicador ──────────
          if (event.type === "customer.subscription.deleted") {
            try {
              // Acha o salão que cancelou
              const cancelledSalonSnap = await adminDb.collection("salons")
                .where("subscriptionId", "==", subscription.id).limit(1).get();
              if (!cancelledSalonSnap.empty) {
                const cancelledSalon = cancelledSalonSnap.docs[0].data() as any;
                const referrerSlug = cancelledSalon.affiliateRef;
                const affiliateType = cancelledSalon.affiliateType;

                if (referrerSlug && affiliateType === "salon") {
                  // Busca o salão indicador e remove 1 crédito
                  const referrerSnap = await adminDb.collection("salons")
                    .where("slug", "==", referrerSlug).limit(1).get();
                  if (!referrerSnap.empty) {
                    const refDoc = referrerSnap.docs[0];
                    const currentCredits = Math.max(0, (refDoc.data().referralCredits || 0) - 1);
                    const newDiscount = Math.min(currentCredits * 15, 50);
                    await refDoc.ref.update({
                      referralCredits: currentCredits,
                      referralDiscountPct: newDiscount,
                      updatedAt: Date.now(),
                    });
                    console.log(`[Affiliate] Crédito removido de ${referrerSlug}: agora ${currentCredits} créditos (${newDiscount}% desconto)`);
                  }
                }
              }
            } catch (e) {
              console.error("[Affiliate] Erro ao remover crédito:", e);
            }
          }

          const status =
            subscription.status === "active"
              ? "ACTIVE"
              : subscription.status === "trialing"
              ? "TRIAL"
              : subscription.status === "past_due"
              ? "PAST_DUE"
              : "CANCELLED";

          const subDoc = await adminDb.collection("subscriptions").doc(subscription.id).get();
          if (subDoc.exists) {
            const data = subDoc.data();
            await adminDb.collection("subscriptions").doc(subscription.id).set(
              {
                status,
                currentPeriodEnd: subscription.items.data[0]?.current_period_end
                  ? subscription.items.data[0].current_period_end * 1000
                  : null,
                planId: subscription.items.data[0]?.price?.id || null,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
            if (data?.salonId) {
              await adminDb.collection("salons").doc(data.salonId).set(
                {
                  status:
                    status === "ACTIVE"
                      ? "ACTIVE"
                      : status === "TRIAL"
                      ? "TRIAL"
                      : status === "CANCELLED"
                      ? "CANCELLED"
                      : "BLOCKED",
                  updatedAt: Date.now(),
                },
                { merge: true }
              );
            }
          }
          await adminDb.collection("billing_events").add({
            salonId: subDoc.exists ? subDoc.data()?.salonId : "unknown",
            type:
              event.type === "customer.subscription.updated"
                ? "SUBSCRIPTION_UPDATED"
                : "SUBSCRIPTION_CANCELLED",
            status: "SUCCESS",
            metadata: {
              subscriptionId: subscription.id,
              status,
            },
            createdAt: Date.now(),
          });
          console.log(`Subscription ${subscription.id} updated to status: ${status}`);
          break;
        }

        default:
          console.log(`Unhandled Stripe event type: ${event.type}`);
          break;
      }
    } catch (error) {
      console.error("Error processing webhook event:", error);
      return res.status(500).send("Internal Server Error");
    }

    res.json({ received: true });
  });

  // ─── Mercado Pago Webhook ────────────────────────────────────────────────
  app.post("/api/mp-webhook", express.json(), async (req, res) => {
    try {
      const { type, data } = req.body;

      if (type !== "payment") {
        return res.status(200).json({ received: true });
      }

      const paymentId = data?.id;
      if (!paymentId) {
        return res.status(400).json({ error: "Missing payment id" });
      }

      const paymentRes = await fetch(`${MP_BASE_URL}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });

      if (!paymentRes.ok) {
        console.error("MP: falha ao buscar pagamento", paymentId);
        return res.status(200).json({ received: true });
      }

      const payment = await paymentRes.json();
      const { status: mpStatus, metadata } = payment;

      const salonId = metadata?.salon_id as string | undefined;
      const orderId = metadata?.order_id as string | undefined;

      if (!salonId || !orderId) {
        console.warn("MP webhook: metadata incompleto", metadata);
        return res.status(200).json({ received: true });
      }

      const orderRef = adminDb.doc(`salons/${salonId}/orders/${orderId}`);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        console.warn(`MP webhook: pedido não encontrado salon=${salonId} order=${orderId}`);
        return res.status(200).json({ received: true });
      }

      const orderData = orderSnap.data() as any;

      if (mpStatus === "approved") {
        if (orderData?.status === "PAID") {
          return res.status(200).json({ received: true });
        }

        await orderRef.set(
          {
            status: "PAID",
            paymentId: String(paymentId),
            mpPaymentStatus: mpStatus,
            paidAt: Date.now(),
            updatedAt: Date.now(),
          },
          { merge: true }
        );

        const items = Array.isArray(orderData?.items) ? orderData.items : [];
        const batch = adminDb.batch();

        for (const item of items) {
          if (!item?.productId || !item?.quantity) continue;
          const productRef = adminDb.doc(`salons/${salonId}/products/${item.productId}`);
          batch.set(productRef, { stock: FieldValue.increment(-Number(item.quantity)), updatedAt: Date.now() }, { merge: true });
        }

        await batch.commit();

        await adminDb.collection("billing_events").add({
          salonId,
          type: "STORE_ORDER_PAID",
          status: "SUCCESS",
          metadata: { orderId, paymentId: String(paymentId), gateway: "mercadopago" },
          createdAt: Date.now(),
        });

        console.log(`[MP] Pedido pago: salon=${salonId} order=${orderId} payment=${paymentId}`);
      } else if (["cancelled", "rejected", "refunded", "charged_back"].includes(mpStatus)) {
        await orderRef.set(
          {
            status: "CANCELLED",
            mpPaymentStatus: mpStatus,
            updatedAt: Date.now(),
          },
          { merge: true }
        );

        console.log(`[MP] Pedido cancelado/recusado: salon=${salonId} order=${orderId} status=${mpStatus}`);
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("[MP] Erro no webhook:", error);
      return res.status(200).json({ received: true });
    }
  });

  // ─── Security headers (OWASP recommendations) ───────────────────────────
  app.use((req, res, next) => {
    // COOP: permite Firebase Auth popup funcionar
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');

    // Impede clickjacking — nosso site não deve ser embedado em iframes de terceiros
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Impede MIME sniffing — browser não tenta "adivinhar" o tipo do arquivo
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Referrer Policy — não vaza URL completa para sites externos
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy — bloqueia APIs perigosas que não usamos
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    // Content Security Policy — controla de onde o browser pode carregar recursos
    // Inclui Firebase, Google Fonts, Groq, Asaas, nosso próprio domínio
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https: http:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://api.groq.com https://api.asaas.com https://www.asaas.com https://api.mercadopago.com https://api.cloudinary.com https://res.cloudinary.com https://viacep.com.br https://api.smsdev.com.br https://www.smsdev.com.br https://ws.correios.com.br https://rastreamento.correios.com.br https://sua-evolution.com",
      "frame-src https://accounts.google.com https://*.firebaseapp.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '));

    // Remove X-Powered-By (não precisa revelar que usa Express)
    res.removeHeader('X-Powered-By');

    next();
  });

  // ─── Rate Limiting (proteção contra brute force e abuso) ─────────────────
  // Implementação manual sem dependência externa (compatível com qualquer Node)
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

  function rateLimit(maxRequests: number, windowMs: number) {
    return (req: any, res: any, next: any) => {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
                 || req.socket?.remoteAddress
                 || 'unknown';
      const now = Date.now();
      const entry = rateLimitStore.get(ip);

      if (!entry || now > entry.resetAt) {
        rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
        return next();
      }

      entry.count++;
      if (entry.count > maxRequests) {
        res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
        return res.status(429).json({
          error: 'Muitas requisições. Aguarde antes de tentar novamente.',
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        });
      }
      next();
    };
  }

  // Limpa o store de rate limit a cada 10 minutos para não vazar memória
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitStore.entries()) {
      if (now > val.resetAt) rateLimitStore.delete(key);
    }
  }, 10 * 60 * 1000);

  // Rotas de autenticação: máx 10 tentativas por 15 min por IP
  const authRateLimit = rateLimit(10, 15 * 60 * 1000);

  // Rotas de API geral: máx 200 req por minuto por IP
  const apiRateLimit = rateLimit(200, 60 * 1000);

  // Webhooks WhatsApp: mais permissivo (mensagens legítimas em volume)
  const webhookRateLimit = rateLimit(500, 60 * 1000);

  // Aplica rate limit global em todas as rotas /api/
  app.use('/api/', apiRateLimit);

  // Rate limit mais rígido em endpoints sensíveis
  app.use('/api/bootstrap-admin', authRateLimit);
  app.use('/api/whatsapp/webhook', webhookRateLimit);

  app.use(express.json({ limit: '10mb' }));

  // ─── Input sanitization helper ────────────────────────────────────────────
  // Remove tags HTML/JS de strings para evitar XSS persistente no banco
  function sanitizeString(str: any): string {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  function sanitizeObject(obj: any, depth = 0): any {
    if (depth > 5) return obj; // evita recursão infinita
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(v => sanitizeObject(v, depth + 1));
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = sanitizeObject(v, depth + 1);
      }
      return result;
    }
    return obj;
  }

  // Middleware: sanitiza body em todas as rotas POST/PUT/PATCH
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      req.body = sanitizeObject(req.body);
    }
    next();
  });

  // ─── Rotas da API ────────────────────────────────────────────────────────

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Bella & Chic API is running" });
  });

  // Bootstrap Super Admin
  app.post("/api/bootstrap-admin", authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "icaromoreira1313@gmail.com";

    if (user.email === superAdminEmail && user.email_verified) {
      try {
        await adminAuth.setCustomUserClaims(user.uid, { superAdmin: true });

        await adminDb.collection("users").doc(user.uid).set(
          {
            role: "SUPER_ADMIN",
            updatedAt: Date.now(),
          },
          { merge: true }
        );

        return res.json({ success: true, message: "Super Admin privileges granted." });
      } catch (error) {
        console.error("Error bootstrapping admin:", error);
        return res.status(500).json({ error: "Failed to bootstrap admin" });
      }
    }

    return res.status(403).json({ error: "Unauthorized to claim Super Admin" });
  });

  // ─── Gestão de usuários (Super Admin) ───────────────────────────────────
  app.get("/api/admin/users", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const requesterProfile = await getRequestUserProfile(requester.uid);
      if (!requesterProfile || requesterProfile.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Apenas o Super Admin pode listar usuários" });
      }
      const snapshot = await adminDb.collection("users").orderBy("createdAt", "desc").limit(1000).get();
      const users = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));
      return res.json({ users });
    } catch (error: any) {
      console.error("[admin/users GET] Erro:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/users/:uid", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const targetUid = String(req.params.uid || "").trim();

    if (!targetUid) {
      return res.status(400).json({ error: "UID do usuário é obrigatório" });
    }

    try {
      const requesterProfile = await getRequestUserProfile(requester.uid);

      if (!requesterProfile || requesterProfile.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Apenas o Super Admin pode excluir usuários" });
      }

      if (requester.uid === targetUid) {
        return res.status(400).json({ error: "Você não pode excluir sua própria conta por este painel" });
      }

      const targetUserRef = adminDb.collection("users").doc(targetUid);
      const targetUserSnap = await targetUserRef.get();

      if (!targetUserSnap.exists) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const targetUser = targetUserSnap.data() as any;

      if (targetUser?.role === "SUPER_ADMIN") {
        return res.status(400).json({ error: "Não é permitido excluir outro Super Admin por este painel" });
      }

      const ownedSalons = await adminDb.collection("salons").where("ownerId", "==", targetUid).limit(1).get();
      if (!ownedSalons.empty) {
        return res.status(409).json({
          error: "Este usuário é dono de um salão. Transfira a propriedade ou remova o salão antes de excluir a conta.",
        });
      }

      const professionalRefs = await adminDb
        .collectionGroup("professionals")
        .where("userId", "==", targetUid)
        .get();

      const batch = adminDb.batch();
      professionalRefs.docs.forEach((professionalDoc) => batch.delete(professionalDoc.ref));
      batch.delete(targetUserRef);
      await batch.commit();

      try {
        await adminAuth.deleteUser(targetUid);
      } catch (error: any) {
        if (error?.code !== "auth/user-not-found") {
          throw error;
        }
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ error: error.message || "Erro ao excluir usuário" });
    }
  });

  // ─── Stripe: Portal do cliente (gerenciar/cancelar assinatura) ──────────
  app.post("/api/create-portal-session", authenticateUser, async (req, res) => {
    if (!stripe) {
      return res.status(400).json({ error: "Stripe not configured" });
    }

    const user = (req as any).user;
    const { returnUrl } = req.body;

    try {
      const userDoc = await adminDb.collection("users").doc(user.uid).get();
      const userData = userDoc.data();

      if (!userData?.salonId) {
        return res.status(400).json({ error: "Salão não encontrado para este usuário" });
      }

      const subSnap = await adminDb
        .collection("subscriptions")
        .where("salonId", "==", userData.salonId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (subSnap.empty) {
        return res.status(404).json({ error: "Nenhuma assinatura encontrada para este salão" });
      }

      const customerId = subSnap.docs[0].data()?.customerId;
      if (!customerId) {
        return res.status(404).json({ error: "ID do cliente Stripe não encontrado" });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || APP_URL,
      });

      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("[portal] Erro:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Stripe: Checkout de assinatura SaaS ────────────────────────────────
  app.post("/api/create-checkout-session", authenticateUser, async (req, res) => {
    if (!stripe) {
      return res.status(400).json({ error: "Stripe not configured" });
    }

    const { priceId, salonId, salonSlug, successUrl, cancelUrl } = req.body;
    const user = (req as any).user;

    try {
      const userDoc = await adminDb.collection("users").doc(user.uid).get();
      const userData = userDoc.data();

      if (!userData) {
        return res.status(403).json({ error: "User not found in database" });
      }

      if (userData.role !== "SUPER_ADMIN" && userData.salonId !== salonId) {
        return res.status(403).json({ error: "Unauthorized: You do not have permission for this salon" });
      }

      // Verifica desconto de afiliado para este salão
      const salonDocForDiscount = await adminDb.collection("salons").doc(salonId).get();
      const salonDataForDiscount = salonDocForDiscount.data() as any;
      let discountCoupon: string | undefined;

      const affiliateRef = salonDataForDiscount?.affiliateRef;
      const affiliateApplied = salonDataForDiscount?.affiliateDiscountApplied;
      const referralCredits = salonDataForDiscount?.referralCredits || 0;

      // Desconto por ser indicado (1º pagamento) ou por ter indicado outros
      const newUserDiscount = affiliateRef && !affiliateApplied ? (salonDataForDiscount?.affiliateDiscountPct || 0) : 0;
      const referralDiscount = Math.min(referralCredits * 15, 50);
      const finalDiscount = Math.max(newUserDiscount, referralDiscount);

      if (finalDiscount > 0 && stripe) {
        try {
          // Cria um cupom Stripe one-off com o percentual calculado
          const coupon = await stripe.coupons.create({
            percent_off: finalDiscount,
            duration: "once",
            name: affiliateRef
              ? `Desconto indicação ${affiliateRef} (${finalDiscount}%)`
              : `Desconto fidelidade (${finalDiscount}%)`,
            metadata: { salonId, affiliateRef: affiliateRef || "fidelidade", discountType: newUserDiscount > 0 ? "new_user" : "referral" },
          });
          discountCoupon = coupon.id;
        } catch (e) {
          console.warn("[Affiliate] Erro ao criar cupom Stripe:", e);
        }
      }

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        ...(discountCoupon ? { discounts: [{ coupon: discountCoupon }] } : {}),
        metadata: {
          kind: "subscription",
          salonId,
          salonSlug,
          priceId,
          affiliateRef: affiliateRef || "",
          discountApplied: finalDiscount > 0 ? String(finalDiscount) : "0",
        },
      });

      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating subscription checkout session:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Mercado Pago: Checkout da loja (SEM LOGIN OBRIGATÓRIO) ─────────────
  app.post("/api/create-mp-checkout", async (req, res) => {
    if (!MP_ACCESS_TOKEN) {
      return res.status(400).json({ error: "Mercado Pago não configurado. Adicione MERCADOPAGO_ACCESS_TOKEN no .env" });
    }

    const authHeader = req.headers.authorization;
    let decodedUser: any = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        decodedUser = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
      } catch {
        // token inválido — tudo bem, segue como convidado
      }
    }

    const { salonId, orderId, salonSlug, successUrl, cancelUrl } = req.body;

    if (!salonId || !orderId || !salonSlug || !successUrl || !cancelUrl) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    try {
      const orderRef = adminDb.doc(`salons/${salonId}/orders/${orderId}`);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return res.status(404).json({ error: "Pedido não encontrado" });
      }

      const orderData = orderSnap.data() as any;

      if (decodedUser) {
        const userDoc = await adminDb.collection("users").doc(decodedUser.uid).get();
        const userData = userDoc.data();

        if (userData) {
          const isSuperAdmin = userData.role === "SUPER_ADMIN";
          const isSalonAdmin = userData.role === "SALON_ADMIN" && userData.salonId === salonId;
          const isOrderOwner = orderData.clientId === decodedUser.uid;

          if (!isSuperAdmin && !isSalonAdmin && !isOrderOwner) {
            return res.status(403).json({ error: "Sem permissão para este pedido" });
          }
        }
      } else {
        if (!String(orderData.clientId || "").startsWith("guest_")) {
          return res.status(403).json({ error: "Checkout de convidado não permitido para este pedido" });
        }
      }

      if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
        return res.status(400).json({ error: "Pedido sem itens" });
      }

      const mpItems = orderData.items.map((item: any) => ({
        id: item.productId || item.variantId || "produto",
        title: item.name || "Produto",
        quantity: Number(item.quantity) || 1,
        unit_price: Number(Number(item.price).toFixed(2)),
        currency_id: "BRL",
        picture_url: item.image || undefined,
      }));

      if (Number(orderData.shippingFee) > 0) {
        mpItems.push({
          id: "frete",
          title: "Frete",
          quantity: 1,
          unit_price: Number(Number(orderData.shippingFee).toFixed(2)),
          currency_id: "BRL",
        });
      }

      const preference = {
        items: mpItems,
        payer: {
          name: orderData.customerName || undefined,
          email: orderData.customerEmail || undefined,
          phone: orderData.customerPhone
            ? { number: orderData.customerPhone }
            : undefined,
        },
        back_urls: {
          success: `${successUrl}`,
          failure: `${cancelUrl}&mp_status=failure`,
          pending: `${cancelUrl}&mp_status=pending`,
        },
        auto_return: "approved" as const,
        notification_url: `${APP_URL}/api/mp-webhook`,
        external_reference: `${salonId}__${orderId}`,
        metadata: {
          salon_id: salonId,
          order_id: orderId,
          salon_slug: salonSlug,
        },
        statement_descriptor: "BELLA E CHIC",
      };

      const mpResponse = await createMpPreference(preference);

      await orderRef.set(
        {
          mpPreferenceId: mpResponse.id,
          mpExternalReference: `${salonId}__${orderId}`,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      const checkoutUrl =
        process.env.NODE_ENV === "production"
          ? mpResponse.init_point
          : mpResponse.sandbox_init_point || mpResponse.init_point;

      return res.json({ url: checkoutUrl, preferenceId: mpResponse.id });
    } catch (error: any) {
      console.error("[MP] Erro ao criar preferência:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── NOVA ROTA: Criar profissional com login ────────────────────────────
  app.post("/api/admin/create-professional-user", authenticateUser, async (req, res) => {
    const { email, password, displayName, salonId, specialties, bio, photoURL } = req.body;
    const requester = (req as any).user;

    if (!email || !password || !displayName || !salonId) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    try {
      const requesterProfile = await getRequestUserProfile(requester.uid);
      if (requesterProfile?.role !== "SALON_ADMIN" || requesterProfile.salonId !== salonId) {
        return res.status(403).json({ error: "Apenas o administrador do salão pode criar profissionais" });
      }

      const salonDoc = await adminDb.collection("salons").doc(salonId).get();
      const salonName = salonDoc.exists ? salonDoc.data()?.name : "o salão";

      const userRecord = await adminAuth.createUser({
        email,
        password,
        displayName,
      });

      await adminDb.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        email,
        displayName,
        role: "PROFESSIONAL",
        salonId,
        createdAt: Date.now(),
      });

      const professionalData = {
        userId: userRecord.uid,
        displayName,
        bio: bio || "",
        specialties: specialties || [],
        active: true,
        photoURL: photoURL || "",
        salonId,
      };
      await adminDb.collection(`salons/${salonId}/professionals`).add(professionalData);

      await sendEmail({
          to: email,
          subject: `Bem-vindo(a) à equipe do ${salonName}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
              <h2>Olá ${displayName},</h2>
              <p>Você foi adicionado como profissional no salão <strong>${salonName}</strong>.</p>
              <p>Suas credenciais de acesso são:</p>
              <ul>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Senha:</strong> ${password}</li>
              </ul>
              <p>Acesse: ${APP_URL}/login</p>
              <p>Recomendamos trocar sua senha no primeiro acesso.</p>
              <hr />
              <p style="font-size: 12px; color: #666;">Este é um e-mail automático, por favor não responda.</p>
            </div>
          `,
        });

      res.json({ success: true, uid: userRecord.uid });
    } catch (error: any) {
      console.error("Erro ao criar profissional:", error);
      res.status(500).json({ error: error.message || "Erro ao criar profissional" });
    }
  });

  // ─── Onboarding: promover usuário a SALON_ADMIN após criar salão ────────
  app.post("/api/onboarding/promote", authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const { salonId, trialDays = 30, planId = 'agenda-pro' } = req.body;

    if (!salonId) {
      return res.status(400).json({ error: "salonId é obrigatório" });
    }

    try {
      // Verifica se o salão existe e pertence ao usuário
      const salonDoc = await adminDb.collection("salons").doc(salonId).get();
      if (!salonDoc.exists) {
        return res.status(404).json({ error: "Salão não encontrado" });
      }

      const salonData = salonDoc.data();
      if (salonData?.ownerId !== user.uid) {
        return res.status(403).json({ error: "Você não é o dono deste salão" });
      }

      const now = Date.now();

      // Garante que o planId seja um plano real (não FREE_TRIAL)
      const validPlanId = ['agenda', 'agenda-pro', 'loja', 'completo'].includes(planId)
        ? planId
        : 'agenda-pro';

      // Atualiza o salão com o planId correto (caso tenha ficado FREE_TRIAL no frontend)
      await adminDb.collection("salons").doc(salonId).update({
        planId: validPlanId,
        updatedAt: now,
      });

      // Atualiza o role para SALON_ADMIN usando Admin SDK
      await adminDb.collection("users").doc(user.uid).set(
        { salonId, role: "SALON_ADMIN", updatedAt: now },
        { merge: true }
      );

      // Cria o registro de assinatura inicial com o plano real
      await adminDb.collection("subscriptions").add({
        salonId,
        planId: validPlanId,
        status: "TRIAL",
        currentPeriodStart: now,
        currentPeriodEnd: now + (trialDays * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        createdAt: now,
      });

      // Registra evento de cobrança
      await adminDb.collection("billing_events").add({
        salonId,
        planId: validPlanId,
        type: "TRIAL_STARTED",
        status: "SUCCESS",
        createdAt: now,
      });

      return res.json({ success: true, planId: validPlanId });
    } catch (error: any) {
      console.error("[onboarding/promote]", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── WhatsApp: conectar instância por salão (QR Code) ───────────────────
  // Cada salão tem sua própria instância na Evolution API: "salon_{salonId}"
  // O admin escaneia o QR Code pela tela de Configurações → WhatsApp

  // Inicia conexão e retorna o QR Code em base64
  // QR Codes em memória
  const pendingQRCodes: Record<string, string> = {};

  app.post("/api/whatsapp/internal/qr", express.json(), (req, res) => {
    const { instanceName, qrcode } = req.body;
    if (instanceName && qrcode) pendingQRCodes[instanceName] = qrcode;
    return res.json({ ok: true });
  });

  app.post("/api/whatsapp/internal/connected", express.json(), async (req, res) => {
    const { instanceName } = req.body;
    if (instanceName) {
      delete pendingQRCodes[instanceName];
      const connectedAt = Date.now();
      // Registra o momento exato da conexão — mensagens anteriores a isso serão ignoradas
      instanceConnectedAt.set(instanceName, connectedAt);
      // Persiste no Firestore para sobreviver a restarts do servidor
      if (instanceName.startsWith('salon_')) {
        const sId = instanceName.replace('salon_', '');
        adminDb.doc(`salons/${sId}/settings/bot_state`).set({ connectedAt, instanceName, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      }
      console.log(`[Bot] Instância conectada: ${instanceName} às ${new Date().toISOString()}`);
    }
    return res.json({ ok: true });
  });

  app.post("/api/whatsapp/connect", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: "Salão não encontrado." });
      const instanceName = `salon_${profile.salonId}`;
      const APP_URL_WH = process.env.APP_URL || `http://localhost:${process.env.PORT || 3066}`;

      // ── IMPORTANTE: registra o tempo de pedido de conexão AGORA ──────────────
      // O Baileys entrega msgs históricas ANTES de avisar que conectou,
      // então precisamos marcar o instante do pedido para filtrar essas msgs.
      instanceConnectedAt.set(instanceName, Date.now());
      console.log(`[Bot] ✅ Conexão registrada: ${instanceName} — msgs anteriores a ${new Date().toISOString()} serão ignoradas`);

      // Cria ou reconecta instância no microserviço Baileys
      const createRes = await fetch(`${WA_SERVICE_URL}/instance/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName, webhookUrl: `${APP_URL_WH}/api/whatsapp/webhook` }),
      });
      const createData = await createRes.json();

      if (createData.status === "open") {
        return res.json({ qrcode: null, status: "open", connected: true });
      }

      // Aguarda até 8s pelo QR Code
      let qrBase64: string | null = null;
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const qrRes = await fetch(`${WA_SERVICE_URL}/instance/qr/${instanceName}`);
          const qrData = await qrRes.json();
          if (qrData?.qrcode) { qrBase64 = qrData.qrcode; break; }
        } catch {}
        if (pendingQRCodes[instanceName]) {
          qrBase64 = pendingQRCodes[instanceName];
          delete pendingQRCodes[instanceName];
          break;
        }
      }

      return res.json({ qrcode: qrBase64, status: qrBase64 ? "qr" : "connecting" });
    } catch (error: any) {
      console.error("[WhatsApp connect]", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Gera pairing code para conectar sem QR Code
  app.post("/api/whatsapp/pairing-code", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: "Salão não encontrado." });
      const instanceName = `salon_${profile.salonId}`;
      const { phone } = req.body;

      if (!phone || phone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: "Número inválido. Use o formato: 5511999999999" });
      }

      const phoneClean = phone.replace(/\D/g, '');
      const formatted = phoneClean.startsWith('55') ? phoneClean : `55${phoneClean}`;

      // ── IMPORTANTE: registra o tempo do pedido de conexão AGORA ─────────────
      instanceConnectedAt.set(instanceName, Date.now());
      console.log(`[Bot] Pedido pairing-code registrado para ${instanceName} — msgs anteriores serão ignoradas`);

      // Cria instância no Baileys (se não existir)
      const APP_URL_WH = process.env.APP_URL || `http://localhost:${process.env.PORT || 3066}`;
      await fetch(`${WA_SERVICE_URL}/instance/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName, webhookUrl: `${APP_URL_WH}/api/whatsapp/webhook` }),
      }).catch(() => {});

      // Aguarda instância inicializar
      await new Promise(r => setTimeout(r, 3000));

      // Solicita pairing code ao Baileys
      const pairRes = await fetch(`${WA_SERVICE_URL}/instance/pairing-code/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: formatted }),
      });

      if (!pairRes.ok) {
        const err = await pairRes.text();
        console.error("[PairingCode] Error:", err);
        return res.status(500).json({ error: "Não foi possível gerar o código. Tente pelo QR Code." });
      }

      const pairData = await pairRes.json();
      const code = pairData?.code || pairData?.pairingCode || null;

      if (!code) {
        return res.status(500).json({ error: "Código não retornado. Tente pelo QR Code." });
      }

      console.log(`[PairingCode] Gerado para ${instanceName}: ${code}`);
      return res.json({ code });
    } catch (error: any) {
      console.error("[PairingCode]", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Verifica status da conexão
  app.get("/api/whatsapp/status", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: "Salão não encontrado." });
      const instanceName = `salon_${profile.salonId}`;

      const statusRes = await fetch(`${WA_SERVICE_URL}/instance/status/${instanceName}`);
      const statusData = await statusRes.json();
      const connected = statusData?.connected === true || statusData?.status === "open";

      return res.json({ connected, state: statusData?.status || "close" });
    } catch (error: any) {
      return res.json({ connected: false, state: "close" });
    }
  });

  // Status por salão (usado pelo banner do CRM Pro) — só do próprio salão
  app.get("/api/whatsapp/status/:salonId", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId || profile.salonId !== req.params.salonId) {
        return res.status(403).json({ connected: false, error: "Não autorizado" });
      }
      const statusRes = await fetch(`${WA_SERVICE_URL}/instance/status/salon_${profile.salonId}`);
      const statusData: any = await statusRes.json();
      const connected = statusData?.connected === true || statusData?.status === "open";
      return res.json({ connected, state: statusData?.status || "close" });
    } catch {
      return res.json({ connected: false, state: "close" });
    }
  });

  // Desconecta e deleta a instância
  app.post("/api/whatsapp/disconnect", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: "Salão não encontrado." });
      const instanceName = `salon_${profile.salonId}`;

      await fetch(`${WA_SERVICE_URL}/instance/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName }),
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Suporte WhatsApp (SuperAdmin) ──────────────────────────────────────────
  // Conversas em modo humano (bot silenciado por 24h)
  const humanModeChats = new Map<string, number>(); // phone → timestamp

  // Conecta o WhatsApp de suporte da plataforma
  app.post("/api/whatsapp/connect-support", authenticateUser, async (req, res) => {
    const user = (req as any).user;
    // Verifica se é superAdmin pelo Firestore
    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    const userRole = userDoc.data()?.role || '';
    if (userRole !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const APP_URL_WH = process.env.APP_URL || `http://localhost:${process.env.PORT || 3066}`;
    try {
      const createRes = await fetch(`${WA_SERVICE_URL}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: SUPPORT_INSTANCE,
          webhookUrl: `${APP_URL_WH}/api/whatsapp/webhook`,
        }),
      });
      const data = await createRes.json();
      if (data.status === 'open') return res.json({ connected: true, qrcode: null });

      // Aguarda QR
      let qrBase64: string | null = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const qrRes = await fetch(`${WA_SERVICE_URL}/instance/qr/${SUPPORT_INSTANCE}`);
          const qrData = await qrRes.json();
          if (qrData?.qrcode) { qrBase64 = qrData.qrcode; break; }
        } catch {}
      }
      return res.json({ qrcode: qrBase64, connected: false });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Status do WhatsApp de suporte
  app.get("/api/whatsapp/status-support", authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const userDoc2 = await adminDb.collection('users').doc(user.uid).get();
    if (userDoc2.data()?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const r = await fetch(`${WA_SERVICE_URL}/instance/status/${SUPPORT_INSTANCE}`);
      const d = await r.json();
      return res.json({ connected: d?.status === 'open' || d?.connected === true });
    } catch {
      return res.json({ connected: false });
    }
  });

  // ─── PIX via Asaas ─────────────────────────────────────────────────────────
  // ─── Push Notifications: subscribe / unsubscribe ────────────────────────────
  app.post("/api/push/subscribe", async (req, res) => {
    const { subscription, userId, salonId, role } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Subscription inválida" });
    }
    try {
      // Usa o endpoint como ID único (cada dispositivo/browser tem um endpoint único)
      const docId = Buffer.from(subscription.endpoint).toString('base64').slice(0, 100);
      await adminDb.collection("push_subscriptions").doc(docId).set({
        subscription,
        userId:   userId  || null,
        salonId:  salonId || null,
        role:     role    || 'CLIENT',
        updatedAt: Date.now(),
      }, { merge: true });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[Push Subscribe]", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
    const { endpoint, userId } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Endpoint ausente" });
    try {
      const docId = Buffer.from(endpoint).toString('base64').slice(0, 100);
      await adminDb.collection("push_subscriptions").doc(docId).delete();
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[Push Unsubscribe]", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Push: envia notificação de teste (usado no painel admin) ────────────────
  app.post("/api/push/test", async (req, res) => {
    const { salonId } = req.body;
    if (!salonId) return res.status(400).json({ error: "salonId ausente" });
    try {
      await sendPushToSalon(salonId, {
        title: '🔔 Notificações funcionando!',
        body: 'Você receberá alertas de novos agendamentos e pedidos aqui.',
        requireInteraction: false,
        tag: 'push-test',
      });
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/pix/create", async (req, res) => {
    const { salonId, order, salonSlug } = req.body;
    if (!salonId || !order) return res.status(400).json({ error: "Dados faltando" });

    const asaasKey = process.env.ASAAS_API_KEY;
    if (!asaasKey) return res.status(400).json({ error: "ASAAS_API_KEY não configurado" });

    try {
      // 1. Cria pedido no Firestore com status AWAITING_PIX
      const orderRef = await adminDb.collection(`salons/${salonId}/orders`).add({
        ...order,
        salonId,
        status: "AWAITING_PIX",
        paymentMethod: "PIX",
        pixExpiresAt: Date.now() + 30 * 60 * 1000, // 30 min
      });

      // 2. Cria ou busca cliente no Asaas
      let asaasCustomerId = "";
      try {
        const cpfCnpj = order.customerPhone?.replace(/\D/g, "").slice(0, 11) || "";
        const customerRes = await fetch("https://api.asaas.com/v3/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": asaasKey },
          body: JSON.stringify({
            name: order.customerName || "Cliente",
            email: order.customerEmail || undefined,
            phone: order.customerPhone || undefined,
            cpfCnpj: cpfCnpj.length >= 11 ? cpfCnpj : undefined,
          }),
        });
        const customerData = await customerRes.json();
        asaasCustomerId = customerData.id;
      } catch (e) {
        console.warn("[Asaas] Erro ao criar cliente:", e);
      }

      // 3. Cria cobrança PIX no Asaas
      const dueDate = new Date();
      dueDate.setMinutes(dueDate.getMinutes() + 30);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      const chargeRes = await fetch("https://api.asaas.com/v3/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": asaasKey },
        body: JSON.stringify({
          customer: asaasCustomerId || undefined,
          billingType: "PIX",
          value: Number(order.totalAmount.toFixed(2)),
          dueDate: dueDateStr,
          description: `Pedido #${orderRef.id.slice(-6).toUpperCase()} — ${salonSlug}`,
          externalReference: `${salonId}__${orderRef.id}`,
        }),
      });
      const charge = await chargeRes.json();
      if (!charge.id) throw new Error(charge.errors?.[0]?.description || "Erro Asaas");

      // 4. Busca QR Code
      const qrRes = await fetch(`https://api.asaas.com/v3/payments/${charge.id}/pixQrCode`, {
        headers: { "access_token": asaasKey },
      });
      const qrData = await qrRes.json();

      // 5. Atualiza pedido com dados do PIX
      await orderRef.update({
        asaasPaymentId: charge.id,
        pixQrCode: qrData.encodedImage || "",
        pixQrCodeBase64: qrData.encodedImage || "",
        pixCopyPaste: qrData.payload || "",
      });

      return res.json({
        orderId: orderRef.id,
        qrCode: qrData.encodedImage || "",
        qrCodeBase64: qrData.encodedImage || "",
        copyPaste: qrData.payload || "",
      });
    } catch (error: any) {
      console.error("[PIX] Erro:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── PIX Simples — QR Code estático com chave do dono ──────────────────────
  app.post("/api/pix/simple", async (req, res) => {
    const { salonId, order, salonSlug } = req.body;
    if (!salonId || !order) return res.status(400).json({ error: "Dados faltando" });

    try {
      // Busca chave PIX do dono nas settings do salão
      const businessDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
      const business = businessDoc.data() as any;
      const pixKey = business?.pixKey;
      const pixOwnerName = business?.pixOwnerName || "Recebedor";

      if (!pixKey) {
        return res.status(400).json({ error: "Chave PIX não configurada neste salão" });
      }

      // Cria pedido com status AWAITING_PIX
      const orderRef = await adminDb.collection(`salons/${salonId}/orders`).add({
        ...order,
        salonId,
        status: "AWAITING_PIX",
        paymentMethod: "PIX",
        pixMode: "simple",
        pixExpiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h para PIX simples
      });

      // Gera payload PIX Brasil (EMV QR Code) sem dependência externa
      const amount = Number(order.totalAmount.toFixed(2));
      const amountStr = amount.toFixed(2);
      const description = `Pedido #${orderRef.id.slice(-6).toUpperCase()}`;
      const city = (business?.city || "SAO PAULO").toUpperCase().slice(0, 15);
      const name = pixOwnerName.toUpperCase().slice(0, 25);

      // Monta o payload PIX EMV
      function crc16(str: string): string {
        let crc = 0xFFFF;
        for (let i = 0; i < str.length; i++) {
          crc ^= str.charCodeAt(i) << 8;
          for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
          }
        }
        return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
      }

      function emv(id: string, value: string): string {
        return `${id}${String(value.length).padStart(2, "0")}${value}`;
      }

      const gui = "BR.GOV.BCB.PIX";
      const pixKeyField = emv("01", pixKey);
      const infoAdicional = emv("02", description.slice(0, 72));
      const merchantAccount = emv("26", emv("00", gui) + pixKeyField + infoAdicional);
      const txid = "***";

      let payload =
        emv("00", "01") +                          // Payload Format Indicator
        merchantAccount +                           // Merchant Account Information
        emv("52", "0000") +                        // Merchant Category Code
        emv("53", "986") +                         // Transaction Currency (BRL)
        emv("54", amountStr) +                     // Transaction Amount
        emv("58", "BR") +                          // Country Code
        emv("59", name) +                          // Merchant Name
        emv("60", city) +                          // Merchant City
        emv("62", emv("05", txid));                // Additional Data Field

      payload += emv("63", crc16(payload + "6304")); // CRC16

      await orderRef.update({ pixCopyPaste: payload });

      // Notifica dono
      fetch("/api/order/notify-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          orderId: orderRef.id,
          order: { ...order, id: orderRef.id, paymentMethod: "PIX" },
          salonSlug,
        }),
      }).catch(() => {});

      return res.json({
        orderId: orderRef.id,
        copyPaste: payload,
        pixOwnerName,
        pixKey,
      });
    } catch (error: any) {
      console.error("[PIX Simple]", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Upload de comprovante PIX Simples ─────────────────────────────────────
  app.post("/api/pix/upload-comprovante", upload.single('file'), async (req: any, res) => {
    const { orderId } = req.body;
    const file = req.file;
    if (!orderId || !file) return res.status(400).json({ error: "Dados faltando" });

    try {
      // Busca o pedido para saber o salonId
      const orderSnaps = await adminDb.collectionGroup("orders")
        .where("__name__", ">=", "")
        .get().catch(() => null);

      // Busca o pedido diretamente pelo collectionGroup
      let orderDoc: any = null;
      let salonIdFound = "";
      const allOrders = await adminDb.collectionGroup("orders").get();
      for (const d of allOrders.docs) {
        if (d.id === orderId) {
          orderDoc = d;
          salonIdFound = d.ref.path.split("/")[1];
          break;
        }
      }

      if (!orderDoc) return res.status(404).json({ error: "Pedido não encontrado" });

      // Salva base64 do comprovante no Firestore (até 1MB funciona bem)
      if (file.size <= 1024 * 1024) {
        const base64 = file.buffer.toString('base64');
        await orderDoc.ref.update({
          comprovanteBase64: base64,
          comprovanteMimeType: file.mimetype,
          comprovanteUploadedAt: Date.now(),
          status: "AWAITING_PIX", // mantém aguardando confirmação manual
        });
      } else {
        // Para arquivos maiores, salva só o nome e marca como recebido
        await orderDoc.ref.update({
          comprovanteNome: file.originalname,
          comprovanteUploadedAt: Date.now(),
        });
      }

      // Notifica o dono do salão que tem comprovante para conferir
      const businessDoc = await adminDb.doc(`salons/${salonIdFound}/settings/business`).get();
      const business = businessDoc.data() as any;
      if (business?.whatsapp) {
        await sendWhatsApp(business.whatsapp,
          `📎 Comprovante recebido!\n\nUm cliente enviou o comprovante do PIX para o pedido *#${orderId.slice(-6).toUpperCase()}*.\n\nAcesse o painel para conferir e confirmar o pagamento.`,
          `salon_${salonIdFound}`
        );
      }

      return res.json({ ok: true });
    } catch (error: any) {
      console.error("[Comprovante]", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Verificar pagamento PIX ────────────────────────────────────────────────
  app.get("/api/pix/check-payment", async (req, res) => {
    const { orderId } = req.query as { orderId: string };
    if (!orderId) return res.status(400).json({ error: "orderId obrigatório" });

    const asaasKey = process.env.ASAAS_API_KEY;
    if (!asaasKey) return res.json({ paid: false });

    try {
      // Busca o pedido em todos os salões via collectionGroup
      const snap = await adminDb.collectionGroup("orders")
        .where("asaasPaymentId", "!=", "")
        .get().catch(() => null);

      // Busca direta por ID se soubermos o salonId
      // Neste caso o frontend deve passar salonId também — simplificamos buscando pelo asaasPaymentId
      const orderSnaps = await adminDb.collectionGroup("orders")
        .where("asaasPaymentId", "!=", "")
        .get();

      let orderDoc: any = null;
      let salonIdFound = "";
      for (const d of orderSnaps.docs) {
        const path = d.ref.path.split("/");
        if (d.id === orderId || d.ref.path.includes(orderId)) {
          orderDoc = d;
          salonIdFound = path[1];
          break;
        }
      }

      if (!orderDoc) return res.json({ paid: false });
      const orderData = orderDoc.data();
      const asaasId = orderData.asaasPaymentId;

      const payRes = await fetch(`https://api.asaas.com/v3/payments/${asaasId}`, {
        headers: { "access_token": asaasKey },
      });
      const payment = await payRes.json();

      if (payment.status === "RECEIVED" || payment.status === "CONFIRMED") {
        await orderDoc.ref.update({ status: "PAID", paidAt: Date.now() });
        // Desconta estoque
        const items = orderData.items || [];
        const batch = adminDb.batch();
        for (const item of items) {
          if (item.productId) {
            const ref = adminDb.doc(`salons/${salonIdFound}/products/${item.productId}`);
            batch.update(ref, { stock: FieldValue.increment(-Number(item.quantity)) });
          }
        }
        await batch.commit();
        return res.json({ paid: true });
      }
      return res.json({ paid: false, status: payment.status });
    } catch (error: any) {
      console.error("[PIX Check]", error);
      return res.json({ paid: false });
    }
  });

  // ─── Webhook Asaas (confirmação automática de PIX) ──────────────────────────

  // ═══════════════════════════════════════════════════════════════════════════
  //  PACOTES ESPORTIVOS — locação recorrente de quadras com cobrança Asaas
  //  Coleção: salons/{salonId}/sport_packages
  //  Fluxo: Owner cria pacote → Asaas gera cobrança recorrente → webhook confirma
  //         pagamento → sistema bloqueia os slots automaticamente
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cria um pacote recorrente de locação de quadra.
   * Gera cliente no Asaas (se não existir), cria assinatura mensal e
   * retorna link de pagamento + QR Code PIX.
   * Body: { salonId, clientName, clientPhone, clientEmail?,
   *         daysOfWeek: number[], startTime, endTime,
   *         professionalId, professionalName, serviceId, serviceName,
   *         pricePerMonth, billingDay, method: 'PIX'|'CREDIT_CARD'|'BOLETO' }
   */
  app.post("/api/sport-packages/create", authenticateUser, express.json(), async (req, res) => {
    const {
      salonId, clientName, clientPhone, clientEmail,
      daysOfWeek, startTime, endTime,
      professionalId, professionalName, serviceId, serviceName,
      pricePerMonth, billingDay, method = "PIX",
    } = req.body;

    if (!salonId || !clientName || !clientPhone || !daysOfWeek?.length || !startTime || !endTime
        || !professionalId || !pricePerMonth || !billingDay) {
      return res.status(400).json({ error: "Dados obrigatórios faltando" });
    }

    try {
      const bizDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
      const biz = bizDoc.data() as any;
      const asaasKey = biz?.asaasApiKey || process.env.ASAAS_API_KEY || "";

      if (!asaasKey) {
        return res.status(400).json({
          error: "Asaas não configurado. Vá em Configurações → PIX/Pagamentos e adicione sua chave Asaas.",
        });
      }

      const masterWalletId = process.env.ASAAS_WALLET_ID || "";
      const SPLIT_PERCENT  = 1.2;

      // ── 1. Cria ou reutiliza cliente no Asaas ───────────────────────────
      let asaasCustomerId = "";
      const cleanPhone = clientPhone.replace(/\D/g, "");
      const cpfSearch  = clientPhone.replace(/\D/g, "").slice(-11); // fallback

      try {
        const searchRes = await fetch(
          `https://api.asaas.com/v3/customers?mobilePhone=${cleanPhone}&limit=1`,
          { headers: { "access_token": asaasKey } }
        );
        const searchData = await searchRes.json() as any;
        if (searchData.data?.length > 0) {
          asaasCustomerId = searchData.data[0].id;
        }
      } catch { /* ignora erro de busca */ }

      if (!asaasCustomerId) {
        const custRes = await fetch("https://api.asaas.com/v3/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": asaasKey },
          body: JSON.stringify({
            name: clientName,
            mobilePhone: cleanPhone,
            email: clientEmail || undefined,
          }),
        });
        const custData = await custRes.json() as any;
        asaasCustomerId = custData.id || "";
      }

      // ── 2. Cria assinatura recorrente mensal ─────────────────────────────
      // nextDueDate = próxima ocorrência do billingDay (dia de vencimento)
      const now  = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = Number(billingDay);
      const candidateThisMonth = new Date(year, month - 1, day);
      const nextDueDate = candidateThisMonth > now
        ? candidateThisMonth
        : new Date(year, month, day); // próximo mês

      const dueDateStr = nextDueDate.toISOString().split("T")[0];

      // packageId antecipado para usar no externalReference
      const packageRef = adminDb.collection(`salons/${salonId}/sport_packages`).doc();
      const packageId  = packageRef.id;
      const externalRef = `sport__${salonId}__${packageId}`;

      const splitPayload = masterWalletId
        ? [{ walletId: masterWalletId, percentualValue: SPLIT_PERCENT }]
        : [];

      const subPayload: any = {
        customer:          asaasCustomerId,
        billingType:       method,
        value:             Number(pricePerMonth),
        nextDueDate:       dueDateStr,
        cycle:             "MONTHLY",
        description:       `Pacote quadra — ${serviceName || "Locação"} — ${daysOfWeek.map((d: number) => ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d]).join("/")} ${startTime}–${endTime}`,
        externalReference: externalRef,
        ...(splitPayload.length ? { split: splitPayload } : {}),
      };

      const subRes = await fetch("https://api.asaas.com/v3/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": asaasKey },
        body: JSON.stringify(subPayload),
      });
      const sub = await subRes.json() as any;

      if (!sub.id) {
        console.error("[SportPackage] Asaas subscription error:", sub);
        return res.status(500).json({ error: sub.errors?.[0]?.description || "Erro ao criar assinatura no Asaas" });
      }

      // ── 3. Busca a primeira fatura gerada pela assinatura ─────────────────
      let invoiceUrl = "";
      let pixQrCode = "";
      let pixKey    = "";

      try {
        // Aguarda ~1s para o Asaas gerar a fatura
        await new Promise(r => setTimeout(r, 1500));
        const invRes = await fetch(
          `https://api.asaas.com/v3/payments?subscription=${sub.id}&limit=1`,
          { headers: { "access_token": asaasKey } }
        );
        const invData = await invRes.json() as any;
        const firstInvoice = invData.data?.[0];

        if (firstInvoice) {
          invoiceUrl = firstInvoice.bankSlipUrl || firstInvoice.invoiceUrl || "";

          if (method === "PIX" && firstInvoice.id) {
            const pixRes = await fetch(
              `https://api.asaas.com/v3/payments/${firstInvoice.id}/pixQrCode`,
              { headers: { "access_token": asaasKey } }
            );
            const pixData = await pixRes.json() as any;
            pixQrCode = pixData.encodedImage || "";
            pixKey    = pixData.payload    || "";
          }
        }
      } catch (e) {
        console.warn("[SportPackage] Erro ao buscar fatura:", e);
      }

      // ── 4. Salva o pacote no Firestore ────────────────────────────────────
      const now2 = Date.now();
      await packageRef.set({
        salonId,
        clientName,   clientPhone: cleanPhone,
        clientEmail:  clientEmail || "",
        daysOfWeek,   startTime, endTime,
        professionalId, professionalName: professionalName || "",
        serviceId: serviceId || "", serviceName: serviceName || "",
        pricePerMonth: Number(pricePerMonth),
        billingDay:    Number(billingDay),
        method,
        status:        "pending_payment",
        asaasCustomerId,
        asaasSubscriptionId: sub.id,
        invoiceUrl,
        pixQrCode,
        pixKey,
        nextDueDate:   dueDateStr,
        createdAt: now2, updatedAt: now2,
      });

      // ── 5. Notifica o cliente via WhatsApp ────────────────────────────────
      const salonDoc  = await adminDb.collection("salons").doc(salonId).get();
      const salonData = salonDoc.data() as any;
      const salonName = salonData?.name || "Sua quadra";
      const APP_URL   = process.env.APP_URL || "http://localhost:3066";
      const dayNames  = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
      const daysLabel = daysOfWeek.map((d: number) => dayNames[d]).join("/");

      const msgLines = [
        `🏟️ *Pacote criado — ${salonName}*`,
        ``,
        `👤 Cliente: *${clientName}*`,
        `📅 Dias: *${daysLabel}* às *${startTime}–${endTime}*`,
        `🏟️ Espaço: *${professionalName || serviceName}*`,
        `💰 Valor: *R$ ${Number(pricePerMonth).toFixed(2)}/mês* (todo dia ${billingDay})`,
        ``,
        method === "PIX" && pixKey
          ? `💡 Pague via PIX — chave/cópia:\n${pixKey}`
          : invoiceUrl
            ? `📄 Acesse o link para pagar: ${invoiceUrl}`
            : `✅ Aguardando pagamento.`,
        ``,
        `Após a confirmação do pagamento, os horários serão reservados automaticamente. 😊`,
      ].join("\n");

      await sendWhatsApp(cleanPhone, msgLines, `salon_${salonId}`).catch(() => {});

      return res.json({
        ok:      true,
        packageId,
        asaasSubscriptionId: sub.id,
        invoiceUrl,
        pixQrCode,
        pixKey,
        nextDueDate: dueDateStr,
      });
    } catch (e: any) {
      console.error("[SportPackage] create error:", e);
      return res.status(500).json({ error: e.message || "Erro interno" });
    }
  });

  /**
   * Lista pacotes esportivos de um salão.
   */
  app.get("/api/sport-packages/list", authenticateUser, async (req, res) => {
    const { salonId } = req.query as Record<string, string>;
    if (!salonId) return res.status(400).json({ error: "salonId obrigatório" });
    try {
      const snap = await adminDb.collection(`salons/${salonId}/sport_packages`)
        .orderBy("createdAt", "desc").get();
      return res.json({ packages: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e) {
      return res.status(500).json({ error: "Erro ao listar pacotes" });
    }
  });

  /**
   * Cancela um pacote esportivo (cancela assinatura no Asaas + limpa slots).
   */
  app.post("/api/sport-packages/cancel", authenticateUser, express.json(), async (req, res) => {
    const { salonId, packageId } = req.body;
    if (!salonId || !packageId) return res.status(400).json({ error: "salonId e packageId obrigatórios" });
    try {
      const pkgRef  = adminDb.doc(`salons/${salonId}/sport_packages/${packageId}`);
      const pkgSnap = await pkgRef.get();
      if (!pkgSnap.exists) return res.status(404).json({ error: "Pacote não encontrado" });

      const pkg = pkgSnap.data() as any;

      // Cancela assinatura no Asaas
      if (pkg.asaasSubscriptionId) {
        const bizDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
        const asaasKey = (bizDoc.data() as any)?.asaasApiKey || process.env.ASAAS_API_KEY || "";
        if (asaasKey) {
          await fetch(`https://api.asaas.com/v3/subscriptions/${pkg.asaasSubscriptionId}`, {
            method: "DELETE",
            headers: { "access_token": asaasKey },
          }).catch(() => {});
        }
      }

      // Remove agendamentos futuros gerados pelo pacote
      const today = new Date().toISOString().split("T")[0];
      const aptsToDelete = await adminDb.collection(`salons/${salonId}/appointments`)
        .where("sportPackageId", "==", packageId)
        .where("date", ">=", today)
        .get();

      const batch = adminDb.batch();
      aptsToDelete.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      await pkgRef.update({ status: "cancelled", updatedAt: Date.now() });

      return res.json({ ok: true, slotsRemoved: aptsToDelete.size });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  
  // ─── Pacote esportivo: marcar pagamento manual ──────────────────────────────
  // Para clientes que pagam em dinheiro, presencialmente ou por fora do Asaas.
  app.post("/api/sport-packages/mark-paid", authenticateUser, express.json(), async (req, res) => {
    const { salonId, packageId } = req.body;
    if (!salonId || !packageId) return res.status(400).json({ error: "salonId e packageId obrigatórios" });
    try {
      const pkgRef  = adminDb.doc(`salons/${salonId}/sport_packages/${packageId}`);
      const pkgSnap = await pkgRef.get();
      if (!pkgSnap.exists) return res.status(404).json({ error: "Pacote não encontrado" });

      const pkg = pkgSnap.data() as any;
      if (pkg.status === "cancelled") return res.status(400).json({ error: "Pacote cancelado" });

      // Ativa o pacote e gera os slots
      await pkgRef.update({ status: "active", paidAt: Date.now(), paidManually: true, updatedAt: Date.now() });
      const generated = await _generatePackageSlots(salonId, packageId, pkg);

      // Notifica o cliente se tiver WhatsApp
      if (pkg.clientPhone) {
        const salonDoc  = await adminDb.collection("salons").doc(salonId).get();
        const salonName = salonDoc.data()?.name || "Seu espaço";
        const dayNames  = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
        const daysLabel = (pkg.daysOfWeek || []).map((d: number) => dayNames[d]).join("/");
        await sendWhatsApp(pkg.clientPhone,
          `✅ *Pagamento confirmado — ${salonName}!*\n\nSeus horários estão reservados:\n📅 ${daysLabel} • ${pkg.startTime}–${pkg.endTime}\n🏟️ ${pkg.professionalName || pkg.serviceName}\n\nObrigado! 🎉`,
          SUPPORT_INSTANCE
        ).catch(() => {});
      }

      return res.json({ ok: true, slotsGenerated: generated });
    } catch (e: any) {
      console.error("[sport-packages/mark-paid]", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/asaas-webhook", express.json(), async (req, res) => {
    const { event, payment } = req.body;
    if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event)) {
      return res.json({ received: true });
    }
    try {
      const externalRef = payment?.externalReference as string;
      if (!externalRef) return res.json({ received: true });

      // ── Pacote esportivo ──────────────────────────────────────────────────
      if (externalRef.startsWith("sport__")) {
        const parts = externalRef.split("__");
        const salonId   = parts[1];
        const packageId = parts[2];
        if (!salonId || !packageId) return res.json({ received: true });

        const pkgRef  = adminDb.doc(`salons/${salonId}/sport_packages/${packageId}`);
        const pkgSnap = await pkgRef.get();
        if (!pkgSnap.exists) return res.json({ received: true });

        const pkg = pkgSnap.data() as any;
        if (pkg.status === "cancelled") return res.json({ received: true });

        const now = Date.now();
        await pkgRef.update({ status: "active", paidAt: now, updatedAt: now });

        // Gera os agendamentos bloqueados para os próximos 35 dias
        await _generatePackageSlots(salonId, packageId, pkg);

        // Notifica o cliente
        const salonDoc  = await adminDb.collection("salons").doc(salonId).get();
        const salonName = salonDoc.data()?.name || "Sua quadra";
        const dayNames  = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
        const daysLabel = (pkg.daysOfWeek || []).map((d: number) => dayNames[d]).join("/");
        if (pkg.clientPhone) {
          await sendWhatsApp(pkg.clientPhone,
            `✅ *Pagamento confirmado — ${salonName}!*\n\nSeus horários estão reservados:\n📅 ${daysLabel} • ${pkg.startTime}–${pkg.endTime}\n🏟️ ${pkg.professionalName || pkg.serviceName}\n\nObrigado! 🎉`,
            `salon_${salonId}`
          ).catch(() => {});
        }

        console.log(`[Asaas Webhook] Pacote esportivo ativo: ${salonId}/${packageId}`);
        return res.json({ received: true });
      }

      // ── Pedido de loja (fluxo original) ──────────────────────────────────
      if (!externalRef.includes("__")) return res.json({ received: true });
      const [salonId, orderId] = externalRef.split("__");
      const orderRef = adminDb.doc(`salons/${salonId}/orders/${orderId}`);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists || orderSnap.data()?.status === "PAID") return res.json({ received: true });

      await orderRef.update({ status: "PAID", paidAt: Date.now(), updatedAt: Date.now() });

      const items = orderSnap.data()?.items || [];
      const batch = adminDb.batch();
      for (const item of items) {
        if (item.productId) {
          batch.update(adminDb.doc(`salons/${salonId}/products/${item.productId}`), {
            stock: FieldValue.increment(-Number(item.quantity))
          });
        }
      }
      await batch.commit();
      console.log(`[Asaas Webhook] PIX loja confirmado: ${salonId}/${orderId}`);
    } catch (e) {
      console.error("[Asaas Webhook]", e);
    }
    return res.json({ received: true });
  });



  // ─── Disponibilidade pública de agenda ─────────────────────────────────────
  // Retorna apenas os horários ocupados (startTime, endTime, status) sem dados pessoais.
  // Usado pelo frontend para bloquear slots mesmo para visitantes não logados.
  // ─── Realocar agendamentos ao mudar intervalo da agenda ──────────────────────
  app.post("/api/appointments/reallocate", authenticateUser, async (req, res) => {
    const { salonId, newInterval } = req.body;
    const user = (req as any).user;

    if (!salonId || !newInterval) {
      return res.status(400).json({ error: "salonId e newInterval obrigatórios" });
    }

    try {
      // Verifica permissão
      const userDoc = await adminDb.collection("users").doc(user.uid).get();
      const userData = userDoc.data();
      if (!userData || (userData.role !== "SUPER_ADMIN" && userData.salonId !== salonId)) {
        return res.status(403).json({ error: "Sem permissão" });
      }

      const today = new Date().toISOString().split("T")[0];

      // Busca agendamentos futuros não cancelados
      const aptsSnap = await adminDb
        .collection(`salons/${salonId}/appointments`)
        .where("date", ">=", today)
        .where("status", "in", ["PENDING", "CONFIRMED"])
        .get();

      const toMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      };
      const fromMin = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

      let reallocated = 0;
      const batch = adminDb.batch();

      for (const doc of aptsSnap.docs) {
        const apt = doc.data() as any;
        const startMin = toMin(apt.startTime);

        // Verifica se o horário já está no grid novo
        if (startMin % newInterval === 0) continue;

        // Encontra o slot mais próximo no grid
        const lower = Math.floor(startMin / newInterval) * newInterval;
        const upper = lower + newInterval;

        // Busca outros agendamentos do mesmo profissional no mesmo dia para verificar conflito
        const conflicts = aptsSnap.docs
          .filter(d => d.id !== doc.id && d.data().professionalId === apt.professionalId && d.data().date === apt.date)
          .map(d => d.data() as any);

        const hasConflict = (candidateMin: number) => {
          const candEnd = candidateMin + (apt.duration || 30);
          return conflicts.some((c: any) => {
            const cStart = toMin(c.startTime);
            const cEnd = toMin(c.endTime || c.startTime);
            return candidateMin < cEnd && candEnd > cStart;
          });
        };

        // Tenta o slot mais próximo (primeiro lower, depois upper)
        let newStart: number | null = null;
        if (!hasConflict(lower)) {
          newStart = lower;
        } else if (!hasConflict(upper)) {
          newStart = upper;
        }

        if (newStart === null) continue; // Não conseguiu realocar sem conflito

        const duration = apt.duration || (toMin(apt.endTime) - startMin) || 30;
        const newStartStr = fromMin(newStart);
        const newEndStr = fromMin(newStart + duration);

        batch.update(doc.ref, {
          startTime: newStartStr,
          endTime: newEndStr,
          updatedAt: Date.now(),
          reallocatedFrom: apt.startTime,
        });
        reallocated++;
      }

      await batch.commit();
      console.log(`[Reallocate] ${reallocated} agendamentos realocados para intervalo de ${newInterval}min no salão ${salonId}`);
      return res.json({ ok: true, reallocated });
    } catch (e: any) {
      console.error("[Reallocate]", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/availability", async (req, res) => {
    const { salonId, professionalId, date } = req.query as Record<string, string>;
    if (!salonId || !professionalId || !date) {
      return res.status(400).json({ error: "salonId, professionalId e date são obrigatórios" });
    }
    try {
      // ── 1. Agendamentos normais ───────────────────────────────────────────
      const [aptsSnap, blocksSnap, eventsSnap] = await Promise.all([
        adminDb.collection(`salons/${salonId}/appointments`)
          .where("professionalId", "==", professionalId)
          .where("date", "==", date)
          .get(),

        // ── 2. Bloqueios de agenda ───────────────────────────────────────
        adminDb.collection(`salons/${salonId}/schedule_blocks`)
          .where("active", "==", true)
          .get(),

        // ── 3. Eventos (fechamentos e promoções) ─────────────────────────
        adminDb.collection(`salons/${salonId}/events`)
          .where("active", "==", true)
          .get(),
      ]);

      // Agendamentos normais
      const slots = aptsSnap.docs
        .map(d => d.data())
        .filter(d => d.status !== "CANCELLED")
        .map(d => ({ startTime: d.startTime, endTime: d.endTime, status: d.status, type: "appointment" }));

      // ── 4. Clientes recorrentes — bloqueiam o horário deles ───────────────
      try {
        const recurringSnap = await adminDb.collection(`salons/${salonId}/manual_clients`)
          .where("recurringDay", "!=", null).get();

        const dateObj2  = new Date(date + "T00:00:00");
        const dayOfWeek2 = dateObj2.getDay();

        for (const rd of recurringSnap.docs) {
          const mc = rd.data();
          if (mc.recurringDay !== dayOfWeek2) continue;
          if (!mc.recurringTime) continue;

          const recType = mc.recurrenceType || 'weekly';

          // Check frequency
          let applies = false;
          if (recType === 'weekly') {
            applies = true;
          } else if (recType === 'biweekly') {
            // Check if this is the right week (every 2 weeks from createdAt)
            const createdAt = mc.createdAt || 0;
            const createdDate = new Date(createdAt);
            const msSinceCreated = dateObj2.getTime() - createdDate.getTime();
            const weeksSinceCreated = Math.floor(msSinceCreated / (7 * 24 * 60 * 60 * 1000));
            applies = weeksSinceCreated % 2 === 0;
          } else if (recType === 'monthly') {
            // Same week-of-month as when created
            const createdAt = mc.createdAt || 0;
            const createdDate = new Date(createdAt);
            applies = Math.ceil(dateObj2.getDate() / 7) === Math.ceil(createdDate.getDate() / 7);
          }

          if (!applies) continue;

          // Get service duration to calculate end time
          let duration = 60; // default 1h
          if (mc.recurringServiceId) {
            const svcDoc = await adminDb.doc(`salons/${salonId}/services/${mc.recurringServiceId}`).get().catch(() => null);
            if (svcDoc?.exists) duration = svcDoc.data()?.duration || 60;
          }

          const [rh, rm] = mc.recurringTime.split(':').map(Number);
          const startMin = rh * 60 + rm;
          const endMin = startMin + duration;
          const endTime = `${Math.floor(endMin/60).toString().padStart(2,'0')}:${(endMin%60).toString().padStart(2,'0')}`;

          slots.push({
            startTime: mc.recurringTime,
            endTime,
            status: "BLOCKED",
            type: "recurring",
            title: `🔄 ${mc.name} (recorrente)`,
          } as any);
        }
      } catch { /* silencioso — não quebra a disponibilidade */ }

      // Processa bloqueios
      const dateObj   = new Date(date + "T00:00:00");
      const dayOfWeek = dateObj.getDay(); // 0=dom … 6=sáb

      for (const bd of blocksSnap.docs) {
        const block = bd.data();
        const appliesToResource = block.professionalId === "all" || block.professionalId === professionalId;
        if (!appliesToResource) continue;

        const appliesToDate = block.recurring
          ? block.dayOfWeek === dayOfWeek
          : block.date === date;

        if (appliesToDate) {
          slots.push({
            startTime: block.startTime,
            endTime:   block.endTime,
            status:    "BLOCKED",
            type:      "block",
            title:     block.title,
          } as any);
        }
      }

      // Verifica se o dia está completamente fechado por evento de closure
      let fullDayClosed = false;
      const promotions: any[] = [];

      for (const ed of eventsSnap.docs) {
        const event = ed.data();
        // Checa se a data cai dentro do range do evento
        const inRange =
          (event.date && event.date === date) ||
          (event.startDate && event.endDate && date >= event.startDate && date <= event.endDate);

        if (!inRange) continue;

        if (event.type === "closure") {
          fullDayClosed = true;
        } else if (event.type === "promotion") {
          promotions.push({
            startTime:       event.startTime,
            endTime:         event.endTime,
            discountPercent: event.discountPercent,
            serviceIds:      event.serviceIds,
            title:           event.title,
            color:           event.color,
          });
        }
      }

      return res.json({ slots, fullDayClosed, promotions });
    } catch (err) {
      console.error("[availability]", err);
      return res.status(500).json({ error: "Erro ao buscar disponibilidade" });
    }
  });

  // ─── Sinal/Depósito — upload de comprovante ─────────────────────────────────
  app.post("/api/deposit/upload-comprovante", upload.single('file'), async (req: any, res) => {
    const { salonId, appointmentId, amount } = req.body;
    if (!salonId || !appointmentId || !req.file) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }
    try {
      // Faz upload para Cloudinary (evita limite de 1MB do Firestore)
      const base64 = req.file.buffer.toString('base64');
      const dataUri = `data:${req.file.mimetype};base64,${base64}`;

      const formData = new FormData();
      formData.append('file', dataUri);
      formData.append('upload_preset', 'bella_chic_uploads');
      formData.append('folder', 'comprovantes');

      const cloudRes = await fetch('https://api.cloudinary.com/v1_1/dyddwpxfm/image/upload', {
        method: 'POST',
        body: formData,
      });

      let comprovanteUrl = '';
      if (cloudRes.ok) {
        const cloudData = await cloudRes.json() as any;
        comprovanteUrl = cloudData.secure_url || '';
      } else {
        // Fallback: salva URL vazia mas ainda confirma o status
        console.warn('[Deposit] Cloudinary upload falhou, salvando sem URL');
      }

      await adminDb
        .collection(`salons/${salonId}/appointments`)
        .doc(appointmentId)
        .update({
          depositStatus: 'PAID_PIX',
          depositComprovanteUrl: comprovanteUrl,
          depositPaidAt: Date.now(),
          updatedAt: Date.now(),
        });

      // Busca dados do agendamento
      const aptSnap = await adminDb.collection(`salons/${salonId}/appointments`).doc(appointmentId).get();
      const apt = aptSnap.data() as any;

      // Notifica CLIENTE
      if (apt?.customerPhone) {
        const phone = apt.customerPhone.replace(/\D/g, '');
        const num = phone.startsWith('55') ? phone : `55${phone}`;
        await sendWhatsApp(num,
          `Olá, ${apt.clientName}! ✅ Recebemos seu comprovante de sinal para o agendamento de *${apt.serviceName}* no dia *${apt.date}* às *${apt.startTime}*. Aguardando confirmação do salão. 😊`
        );
      }

      // Notifica DONO DO SALÃO
      const salonSnap = await adminDb.collection('salons').doc(salonId).get();
      const salonData = salonSnap.data() as any;
      if (salonData?.phone) {
        const ownerPhone = salonData.phone.replace(/\D/g, '');
        const ownerNum = ownerPhone.startsWith('55') ? ownerPhone : `55${ownerPhone}`;
        await sendWhatsApp(ownerNum,
          `💰 *Sinal recebido!*\n\nCliente: *${apt.clientName}*\nServiço: *${apt.serviceName}*\nData: *${apt.date}* às *${apt.startTime}*\nValor do sinal: *R$ ${Number(apt.depositAmount || amount).toFixed(2)}*\n\nAcesse o painel para confirmar o agendamento.`,
          `salon_${salonId}`
        );
      }

      console.log(`[Deposit] Comprovante recebido para apt ${appointmentId} no salão ${salonId}`);
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[Deposit]", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Sinal/Depósito — confirmar manualmente (admin) ──────────────────────────
  app.post("/api/deposit/confirm", authenticateUser, async (req, res) => {
    const { salonId, appointmentId } = req.body;
    const user = (req as any).user;
    try {
      const userDoc = await adminDb.collection("users").doc(user.uid).get();
      if (userDoc.data()?.salonId !== salonId && userDoc.data()?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Sem permissão" });
      }
      await adminDb.collection(`salons/${salonId}/appointments`).doc(appointmentId).update({
        status: "CONFIRMED",
        depositStatus: "PAID_PIX",
        depositPaidAt: Date.now(),
        updatedAt: Date.now(),
      });
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Reserva — desconta estoque imediatamente ───────────────────────────────
  app.post("/api/order/reserve-stock", async (req, res) => {
    const { salonId, orderId, items } = req.body;
    if (!salonId || !items) return res.status(400).json({ error: "Dados faltando" });
    try {
      const batch = adminDb.batch();
      for (const item of items) {
        if (item.productId && item.quantity) {
          const ref = adminDb.doc(`salons/${salonId}/products/${item.productId}`);
          batch.update(ref, { stock: FieldValue.increment(-Number(item.quantity)) });
        }
      }
      await batch.commit();
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Cancelar pedido e restaurar estoque ────────────────────────────────────
  app.post("/api/order/cancel", authenticateUser, async (req, res) => {
    const { salonId, orderId } = req.body;
    const user = (req as any).user;
    if (!salonId || !orderId) return res.status(400).json({ error: "Dados faltando" });
    try {
      // Verifica permissão
      const userDoc = await adminDb.collection("users").doc(user.uid).get();
      const userData = userDoc.data() as any;
      if (userData?.salonId !== salonId && userData?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Sem permissão" });
      }

      const orderRef = adminDb.doc(`salons/${salonId}/orders/${orderId}`);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) return res.status(404).json({ error: "Pedido não encontrado" });

      const order = orderSnap.data() as any;
      if (order.status === "CANCELLED") return res.json({ ok: true, msg: "Já cancelado" });

      const batch = adminDb.batch();

      // Restaura estoque de cada item
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          if (item.productId && item.quantity) {
            const productRef = adminDb.doc(`salons/${salonId}/products/${item.productId}`);
            batch.update(productRef, {
              stock: FieldValue.increment(Number(item.quantity)),
              updatedAt: Date.now(),
            });
          }
        }
      }

      // Cancela o pedido
      batch.update(orderRef, { status: "CANCELLED", cancelledAt: Date.now(), updatedAt: Date.now() });
      await batch.commit();

      console.log(`[Order] Pedido ${orderId} cancelado — estoque restaurado (${order.items?.length || 0} itens)`);
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[Order Cancel]", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Notificação WhatsApp por evento de agendamento ─────────────────────────
  // Chamado pelo frontend quando o status de um agendamento muda.
  // Envia mensagem ao cliente (e/ou profissional) via Evolution API.
  app.post("/api/appointments/notify-event", async (req, res) => {
    const { salonId, appointmentId, newStatus, appointment } = req.body;
    if (!salonId || !newStatus || !appointment) {
      return res.status(400).json({ error: "Dados insuficientes" });
    }

    try {
      // Busca dados do salão para personalizar a mensagem e obter instância WA
      const businessDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
      const business = businessDoc.data() as any;
      const salonName = business?.name || "Seu salão";

      const clientPhone: string = appointment.customerPhone || "";
      const clientName: string  = appointment.clientName    || "Cliente";
      const serviceName: string = appointment.serviceName   || "Serviço";
      const profName: string    = appointment.professionalName || "Profissional";
      const dateStr: string     = appointment.date          || "";
      const startTime: string   = appointment.startTime     || "";

      // Formata data BR
      let dataBR = dateStr;
      if (dateStr && dateStr.includes("-")) {
        const [y, m, d] = dateStr.split("-");
        dataBR = `${d}/${m}/${y}`;
      }

      let clientMsg = "";

      switch (newStatus) {
        case "CONFIRMED":
          clientMsg =
            `✅ *Agendamento Confirmado!*\n\n` +
            `Olá, ${clientName}! Seu atendimento foi confirmado:\n\n` +
            `✂️ *Serviço:* ${serviceName}\n` +
            `👤 *Profissional:* ${profName}\n` +
            `📅 *Data:* ${dataBR}\n` +
            `🕐 *Horário:* ${startTime}\n\n` +
            `Te esperamos! 😊 — *${salonName}*`;
          break;

        case "CANCELLED":
          clientMsg =
            `❌ *Agendamento Cancelado*\n\n` +
            `Olá, ${clientName}. Seu agendamento de *${serviceName}* ` +
            `no dia *${dataBR}* às *${startTime}* foi cancelado.\n\n` +
            `Para remarcar, entre em contato conosco. — *${salonName}*`;
          break;

        case "COMPLETED":
          clientMsg =
            `🌟 *Atendimento Concluído!*\n\n` +
            `Obrigado, ${clientName}! Foi um prazer te atender hoje.\n\n` +
            `Se gostou do serviço, conta pra um amigo! 😊\n` +
            `— *${salonName}*`;
          // Auto-cadastra/atualiza cliente no CRM
          upsertCRMClient(salonId, appointment).catch(console.error);
          break;

        case "RESCHEDULED":
          clientMsg =
            `📅 *Agendamento Remarcado*\n\n` +
            `Olá, ${clientName}! Seu atendimento de *${serviceName}* foi remarcado.\n\n` +
            `📅 *Nova data:* ${dataBR}\n` +
            `🕐 *Novo horário:* ${startTime}\n\n` +
            `Qualquer dúvida, fale com a gente! — *${salonName}*`;
          break;

        default:
          // Status sem notificação padrão (PENDING, AWAITING_DEPOSIT, etc.)
          return res.json({ sent: false, reason: "status_sem_notificacao" });
      }

      let sent = false;

      // Envia para o cliente se tiver telefone
      if (clientPhone && clientMsg) {
        sent = await sendWhatsApp(clientPhone, clientMsg, `salon_${salonId}`);
      }

      // Para CONFIRMED: notifica também o profissional (se tiver phone cadastrado)
      if (newStatus === "CONFIRMED") {
        const profPhone: string = appointment.professionalPhone || "";
        if (profPhone) {
          const profMsg =
            `📋 *Novo agendamento confirmado!*\n\n` +
            `👤 Cliente: *${clientName}*\n` +
            `✂️ Serviço: *${serviceName}*\n` +
            `📅 Data: *${dataBR}* às *${startTime}*\n\n` +
            `Verifique sua agenda no painel. — *${salonName}*`;
          await sendWhatsApp(profPhone, profMsg, `salon_${salonId}`);
        }
      }

      // ── Push para o CLIENTE: notifica sobre mudança de status ──────────────
      const pushTitles: Record<string, string> = {
        CONFIRMED:   '✅ Agendamento Confirmado!',
        CANCELLED:   '❌ Agendamento Cancelado',
        COMPLETED:   '🌟 Atendimento Concluído!',
        RESCHEDULED: '📅 Agendamento Remarcado',
      };
      const pushBodies: Record<string, string> = {
        CONFIRMED:   `${serviceName} em ${dataBR} às ${startTime} — te esperamos!`,
        CANCELLED:   `${serviceName} em ${dataBR} foi cancelado.`,
        COMPLETED:   `Obrigado pela visita! Que tal avaliar o atendimento?`,
        RESCHEDULED: `${serviceName} remarcado para ${dataBR} às ${startTime}`,
      };

      if (pushTitles[newStatus] && appointment.clientId && appointment.clientId !== 'guest') {
        try {
          await sendPushToUser(appointment.clientId, {
            title: pushTitles[newStatus],
            body: pushBodies[newStatus],
            url: `/s/${salonId}/meus-agendamentos`,
            requireInteraction: newStatus === 'CONFIRMED',
            tag: `apt-status-${appointment.clientId}-${newStatus}`,
          });
        } catch (pushErr) {
          console.error('[Push] Erro ao enviar push status cliente:', pushErr);
        }
      }

      // ── Push para o DONO DO SALÃO: cliente cancelou ───────────────────────
      if (newStatus === 'CANCELLED') {
        try {
          const salonDoc = await adminDb.collection('salons').doc(salonId).get();
          const salonSlugForPush = salonDoc.data()?.slug || '';
          await sendPushToSalon(salonId, {
            title: '❌ Agendamento Cancelado',
            body: `${clientName} cancelou ${serviceName} em ${dataBR} às ${startTime}`,
            url: `/s/${salonSlugForPush}/admin?tab=appointments`,
            requireInteraction: true,
            tag: `apt-cancelled-salon-${salonId}-${Date.now()}`,
          });
        } catch (pushErr) {
          console.error('[Push] Erro ao enviar push cancelamento dono:', pushErr);
        }
      }

      console.log(`[WA Event] ${newStatus} → cliente ${clientPhone || "sem tel"} | sent=${sent}`);
      return res.json({ sent });
    } catch (error: any) {
      console.error("[WA Event] Erro:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Notificação de novo agendamento (chamado pelo Booking/AdminDashboard) ──
  app.post("/api/appointments/notify-new", async (req, res) => {
    const { salonId, appointment } = req.body;
    if (!salonId || !appointment) {
      return res.status(400).json({ error: "Dados insuficientes" });
    }

    try {
      const businessDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
      const business = businessDoc.data() as any;
      const salonName = business?.name || "Seu salão";

      const clientPhone: string = appointment.customerPhone || "";
      const clientName: string  = appointment.clientName    || "Cliente";
      const serviceName: string = appointment.serviceName   || "Serviço";
      const profName: string    = appointment.professionalName || "";
      const dateStr: string     = appointment.date          || "";
      const startTime: string   = appointment.startTime     || "";

      let dataBR = dateStr;
      if (dateStr && dateStr.includes("-")) {
        const [y, m, d] = dateStr.split("-");
        dataBR = `${d}/${m}/${y}`;
      }

      // Confirmação para o cliente via WhatsApp + SMS
      if (clientPhone) {
        const msg =
          `📅 Agendamento recebido!\n\n` +
          `Olá, ${clientName}! Recebemos seu agendamento:\n` +
          `✂️ ${serviceName}` +
          (profName ? ` c/ ${profName}` : "") +
          `\n📅 ${dataBR} às ${startTime}\n` +
          `Aguarde confirmação. — ${salonName}`;
        // WhatsApp (mensagem rica) + SMS (texto simples — chega mesmo sem internet)
        await sendWhatsApp(clientPhone,
          `📅 *Agendamento Recebido!*\n\nOlá, ${clientName}! Recebemos seu pedido:\n\n` +
          `✂️ *Serviço:* ${serviceName}\n` +
          (profName ? `👤 *Profissional:* ${profName}\n` : "") +
          `📅 *Data:* ${dataBR}\n🕐 *Horário:* ${startTime}\n\n` +
          `Assim que for confirmado, você receberá um aviso aqui. 😊 — *${salonName}*`,
          `salon_${salonId}`
        );
        await sendSMS(clientPhone, msg);
      }

      // Avisa o dono/profissional do salão via WhatsApp + SMS
      const ownerMsg =
        `🔔 *Novo Agendamento!*\n\n` +
        `👤 Cliente: *${clientName}*\n` +
        `✂️ Serviço: *${serviceName}*\n` +
        (profName ? `💈 Profissional: *${profName}*\n` : "") +
        `📅 Data: *${dataBR}* às *${startTime}*\n\n` +
        `Acesse o painel para confirmar. — *${salonName}*`;

      if (business?.whatsapp) {
        await sendWhatsApp(business.whatsapp, ownerMsg, `salon_${salonId}`);
      }

      // SMS para o PROFISSIONAL específico (se tiver phone cadastrado)
      if (profName) {
        try {
          const profSnap = await adminDb.collection(`salons/${salonId}/professionals`)
            .where('displayName', '==', profName).limit(1).get();
          const profPhone = profSnap.docs[0]?.data()?.phone || appointment.professionalPhone || '';
          if (profPhone) {
            await sendSMS(profPhone,
              `Novo agendamento para voce!\n${clientName} — ${serviceName}\n${dataBR} as ${startTime}\n— ${salonName}`
            );
          }
        } catch { /* profissional sem phone */ }
      }

      // ── Push para o DONO DO SALÃO: novo agendamento chegou ─────────────────
      try {
        const salonDoc = await adminDb.collection('salons').doc(salonId).get();
        const salonSlugForPush = salonDoc.data()?.slug || '';
        await sendPushToSalon(salonId, {
          title: '📅 Novo Agendamento!',
          body: `${clientName} — ${serviceName} em ${dataBR} às ${startTime}`,
          url: `/s/${salonSlugForPush}/admin?tab=appointments`,
          requireInteraction: true,
          tag: `new-apt-${salonId}-${Date.now()}`,
        });
      } catch (pushErr) {
        console.error('[Push] Erro ao enviar push novo agendamento:', pushErr);
      }

      // ── Push para o CLIENTE: confirmação de recebimento ───────────────────
      if (appointment.clientId && appointment.clientId !== 'guest') {
        try {
          await sendPushToUser(appointment.clientId, {
            title: '📅 Agendamento Recebido!',
            body: `${serviceName} em ${dataBR} às ${startTime} — aguardando confirmação`,
            url: `/s/${salonId}/meus-agendamentos`,
            tag: `apt-received-${appointment.clientId}`,
          });
        } catch (pushErr) {
          console.error('[Push] Erro ao enviar push cliente:', pushErr);
        }
      }

      return res.json({ sent: true });
    } catch (error: any) {
      console.error("[WA New Appointment] Erro:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Notificação de novo pedido para o dono da loja ────────────────────────
  app.post("/api/order/notify-owner", async (req, res) => {
    const { salonId, orderId, order } = req.body;
    if (!salonId) return res.status(400).json({ error: "Dados faltando" });
    try {
      const salonDoc = await adminDb.collection("salons").doc(salonId).get();
      const salon = salonDoc.data() as any;
      const ownerDoc = await adminDb.collection("users").doc(salon?.ownerId).get();
      const owner = ownerDoc.data() as any;
      const businessDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
      const business = businessDoc.data() as any;
      const ownerWhatsapp = await getOwnerNotificationPhone(salonId);

      const paymentLabels: Record<string, string> = {
        PIX: "PIX", CASH: "Dinheiro na entrega", CARD_MACHINE: "Cartão (maquininha)",
        ON_SITE: "Pagar no local/retirada",
      };
      const payLabel = paymentLabels[order?.paymentMethod || ""] || order?.paymentMethod || "—";
      const isReserve = order?.paymentMethod === "ON_SITE";

      if (ownerWhatsapp) {
        const msg =
          `🛍️ *${isReserve ? "Nova reserva" : "Novo pedido"}!*\n\n` +
          `👤 ${order?.customerName}\n` +
          `📱 ${order?.customerPhone || "—"}\n` +
          `💳 Pagamento: ${payLabel}\n` +
          (order?.cardBrand ? `🃏 Bandeira: ${order.cardBrand}\n` : "") +
          (order?.orderNote ? `📝 Obs: ${order.orderNote}\n` : "") +
          (order?.changeFor ? `💵 Troco para: R$ ${order.changeFor}\n` : "") +
          `🚚 Entrega: ${order?.shippingMethod === "PICKUP" ? "Retirada no salão" : "Entrega"}\n` +
          `💰 Total: R$ ${Number(order?.totalAmount || 0).toFixed(2)}\n\n` +
          (isReserve ? `⚠️ Separe o item! Confirme o pagamento no painel quando o cliente pagar.` : `✅ Pedido confirmado.`);
        await sendWhatsApp(ownerWhatsapp, msg, SUPPORT_INSTANCE);
      }

      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: `🛍️ ${isReserve ? "Nova reserva" : "Novo pedido"} — ${order?.customerName}`,
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
            <h2 style="color:#e11d48;">${isReserve ? "Nova reserva!" : "Novo pedido!"}</h2>
            <p><strong>Cliente:</strong> ${order?.customerName}<br>
            <strong>Telefone:</strong> ${order?.customerPhone || "—"}<br>
            <strong>Pagamento:</strong> ${payLabel}<br>
            <strong>Total:</strong> R$ ${Number(order?.totalAmount || 0).toFixed(2)}</p>
            ${isReserve ? '<p style="color:#f97316;"><strong>⚠️ Separe o item e aguarde o cliente confirmar o pagamento no painel.</strong></p>' : ""}
          </div>`,
        });
      }
      // Push notification para o dono
      await sendPushToSalon(salonId, {
        title: isReserve ? '🛍️ Nova reserva!' : '🛍️ Novo pedido!',
        body: `${order?.customerName} — R$ ${Number(order?.totalAmount || 0).toFixed(2)} — ${payLabel}`,
        url: `/s/${salon?.slug || ''}/admin?tab=store`,
        requireInteraction: true,
      });

      return res.json({ sent: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Sistema de Afiliados ───────────────────────────────────────────────────

  // Configuração de descontos (centralizados aqui)
  const REFERRAL = {
    salon:    { newUserDiscount: 15, discountPerReferral: 15, maxDiscount: 50 },
    marketer: { newUserDiscount: 20, marketerCommission: 30 },
  };

  // Registra signup vindo de um link de afiliado
  app.post("/api/affiliate/register-signup", async (req, res) => {
    const { affiliateSlug, newSalonId, ownerEmail } = req.body;
    if (!affiliateSlug || !newSalonId) return res.json({ ok: false });

    try {
      // Descobre se é salão ou marketeiro
      const [salonSnap, marketerSnap] = await Promise.all([
        adminDb.collection("salons").where("slug", "==", affiliateSlug).limit(1).get(),
        adminDb.collection("affiliates").doc(affiliateSlug).get(),
      ]);

      const isSalon    = !salonSnap.empty;
      const isMarketer = marketerSnap.exists && !isSalon;

      // Salva o ref no documento do novo salão (para aplicar desconto no 1º pagamento)
      const newSalonSnap = await adminDb.collection("salons").where("slug", "==", newSalonId).limit(1).get();
      if (!newSalonSnap.empty) {
        const newSalonRef = newSalonSnap.docs[0].ref;
        await newSalonRef.update({
          affiliateRef: affiliateSlug,
          affiliateType: isSalon ? "salon" : "marketer",
          // Usa o desconto personalizado do afiliado, se configurado, senão usa o padrão
          affiliateDiscountPct: isSalon
            ? REFERRAL.salon.newUserDiscount
            : (marketerSnap.data()?.discountPercent || REFERRAL.marketer.newUserDiscount),
          affiliateTrialExtra: isMarketer ? (marketerSnap.data()?.trialDays || 0) : 0,
          affiliateDiscountApplied: false,
          referredAt: Date.now(),
        });

        // Aplica trial extra se o afiliado configurou
        const trialExtra = isMarketer ? (marketerSnap.data()?.trialDays || 0) : 0;
        if (trialExtra > 0) {
          const currentTrial = newSalonSnap.docs[0].data()?.trialEndsAt || Date.now();
          await newSalonRef.update({
            trialEndsAt: Math.max(currentTrial, Date.now()) + trialExtra * 86400000,
          });
        }
      }

      // Incrementa cliques/conversões no registro de afiliado
      if (isMarketer) {
        await marketerSnap.ref.update({
          conversions: FieldValue.increment(1),
          pendingCommissions: FieldValue.increment(1),
        });
      }

      console.log(`[Affiliate] Signup via ${isSalon ? "salon" : "marketer"} ref: ${affiliateSlug} → ${newSalonId}`);
      return res.json({ ok: true, type: isSalon ? "salon" : "marketer" });
    } catch (e: any) {
      console.error("[Affiliate] register-signup error:", e);
      return res.json({ ok: false });
    }
  });

  // Retorna o desconto pendente para um salão (usado antes do checkout Stripe)
  // ── Lista de espera — notifica quando vaga abre ─────────────────────────
  app.post("/api/waitlist/notify", authenticateUser, async (req, res) => {
    const { salonId, date, serviceId } = req.body;
    if (!salonId || !date) return res.status(400).json({ error: 'Missing params' });
    try {
      const salonDoc = await adminDb.doc(`salons/${salonId}`).get();
      const slug = salonDoc.data()?.slug || salonId;
      const APP_URL_BASE = process.env.APP_URL || '';
      const waitSnap = await adminDb.collection(`salons/${salonId}/waitlist`)
        .where('date', '==', date).where('status', '==', 'waiting').get();
      let notified = 0;
      for (const wDoc of waitSnap.docs) {
        const w = wDoc.data();
        const phone = (w.phone || '').replace(/\D/g, '');
        if (!phone) continue;
        const msg = `🎉 Boa notícia! Uma vaga abriu para *${w.serviceName}* no dia ${date.split('-').reverse().join('/')}!\n\n` +
          `Corre agendar agora 👉 ${APP_URL_BASE}/s/${slug}`;
        await sendWhatsApp(phone, msg, `salon_${salonId}`);
        await wDoc.ref.update({ status: 'notified', notifiedAt: Date.now() });
        notified++;
      }
      return res.json({ notified });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── Relatório de conversão do bot ─────────────────────────────────────────
  app.get("/api/bot/conversion-report", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Salão não encontrado' });
      const salonId = profile.salonId;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

      const contactsSnap = await adminDb.collection(`salons/${salonId}/bot_contacts`)
        .where('date', '>=', cutoff).get();

      const total = contactsSnap.size;
      const converted = contactsSnap.docs.filter(d => d.data().status === 'converted').length;
      const rate = total > 0 ? Math.round((converted / total) * 100) : 0;

      // Últimos 7 dias
      const sevenAgo = new Date();
      sevenAgo.setDate(sevenAgo.getDate() - 7);
      const cutoff7 = sevenAgo.toISOString().split('T')[0];
      const week = contactsSnap.docs.filter(d => d.data().date >= cutoff7);
      const weekConverted = week.filter(d => d.data().status === 'converted').length;

      return res.json({
        period: '30 dias',
        totalContacts: total,
        converted,
        conversionRate: rate,
        week: { contacts: week.length, converted: weekConverted, rate: week.length > 0 ? Math.round(weekConverted/week.length*100) : 0 },
      });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

    app.get("/api/affiliate/discount/:salonId", authenticateUser, async (req, res) => {
    const { salonId } = req.params;
    try {
      const salonDoc = await adminDb.collection("salons").doc(salonId).get();
      const salon = salonDoc.data() as any;

      // Desconto por ser indicado (1º pagamento)
      let newUserDiscount = 0;
      if (salon?.affiliateRef && !salon?.affiliateDiscountApplied) {
        newUserDiscount = salon.affiliateDiscountPct || 0;
      }

      // Desconto acumulado por ter indicado outros salões (10% por indicação, max 50%)
      const referralCredits = salon?.referralCredits || 0;
      const referralDiscount = Math.min(referralCredits * REFERRAL.salon.discountPerReferral, REFERRAL.salon.maxDiscount);

      // Usa o maior desconto disponível
      const totalDiscount = Math.max(newUserDiscount, referralDiscount);

      return res.json({
        newUserDiscount,
        referralDiscount,
        totalDiscount,
        referralCredits,
        affiliateType: salon?.affiliateType || null,
        affiliateRef: salon?.affiliateRef || null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // SuperAdmin: lista todos os afiliados (marketeiros + salões indicadores) com comissões pendentes
  app.get("/api/affiliate/report", authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const userDoc = await adminDb.collection("users").doc(user.uid).get();
    if (userDoc.data()?.role !== "SUPER_ADMIN") return res.status(403).json({ error: "Unauthorized" });

    try {
      // Marketeiros
      const marketersSnap = await adminDb.collection("affiliates").orderBy("conversions", "desc").get();
      const marketers = marketersSnap.docs.map(d => ({ id: d.id, ...d.data(), type: "marketer" }));

      // Salões com créditos de indicação
      const salonsSnap = await adminDb.collection("salons").where("referralCredits", ">", 0).get();
      const referringSalons = salonsSnap.docs.map(d => ({
        id: d.id, ...d.data(), type: "salon",
        discount: Math.min((d.data().referralCredits || 0) * 10, 50),
      }));

      // Salões que foram indicados mas ainda não pagaram (desconto pendente)
      const pendingSnap = await adminDb.collection("salons")
        .where("affiliateDiscountApplied", "==", false)
        .get();
      const pendingDiscounts = pendingSnap.docs
        .filter(d => d.data().affiliateRef)
        .map(d => ({ id: d.id, ...d.data() }));

      return res.json({ marketers, referringSalons, pendingDiscounts });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Marca comissão do marketeiro como paga (SuperAdmin)
  app.post("/api/affiliate/pay-commission", authenticateUser, async (req, res) => {
    const { affiliateSlug, amount, note } = req.body;
    const user = (req as any).user;
    const userDoc = await adminDb.collection("users").doc(user.uid).get();
    if (userDoc.data()?.role !== "SUPER_ADMIN") return res.status(403).json({ error: "Unauthorized" });

    try {
      await adminDb.collection("affiliates").doc(affiliateSlug).update({
        pendingCommissions: FieldValue.increment(-1),
        totalPaid: FieldValue.increment(amount || 0),
        lastPaymentAt: Date.now(),
        lastPaymentNote: note || "",
      });
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Notificação de evento (promoção/fechamento) ─────────────────────────────
  app.post("/api/events/notify", authenticateUser, express.json(), async (req, res) => {
    const { salonId, event } = req.body;
    if (!salonId || !event) return res.status(400).json({ error: "Dados insuficientes" });

    try {
      const salonDoc = await adminDb.collection("salons").doc(salonId).get();
      const salonData = salonDoc.data() as any;
      const slug = salonData?.slug || salonId;
      const salonName = salonData?.name || "Seu negócio";
      const APP_URL = process.env.APP_URL || "http://localhost:3066";

      const isPromo = event.type === "promotion";
      const pushTitle = isPromo
        ? `🎉 ${event.title || "Promoção especial!"}`
        : `📢 ${event.title || "Comunicado importante"}`;

      const pushBody = event.description ||
        (isPromo
          ? `Aproveite a promoção${event.discountPercent ? " de " + event.discountPercent + "%" : ""}! Agende agora.`
          : "Acesse o app para mais detalhes.");

      // Push para todos os inscritos do salão
      await sendPushToSalon(salonId, {
        title: pushTitle,
        body: pushBody,
        url: `${APP_URL}/s/${slug}`,
        tag: `event-${salonId}-${Date.now()}`,
        requireInteraction: event.type === "closure",
      });

      // Marca o evento como notificação enviada
      const eventsSnap = await adminDb.collection(`salons/${salonId}/events`)
        .where("title", "==", event.title)
        .where("type", "==", event.type)
        .orderBy("createdAt", "desc")
        .limit(1).get();

      if (!eventsSnap.empty) {
        await eventsSnap.docs[0].ref.update({ notificationSent: true });
      }

      console.log(`[Events] Push enviado para salão ${salonId}: ${pushTitle}`);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[/api/events/notify]", e);
      return res.status(500).json({ error: "Erro ao notificar" });
    }
  });

  // ─── Buscar eventos e bloqueios do dia (para Booking.tsx) ────────────────────
  app.get("/api/events/day", async (req, res) => {
    const { salonId, date } = req.query as Record<string, string>;
    if (!salonId || !date) return res.status(400).json({ error: "salonId e date obrigatórios" });

    try {
      const dateObj   = new Date(date + "T00:00:00");
      const dayOfWeek = dateObj.getDay();

      const [blocksSnap, eventsSnap] = await Promise.all([
        adminDb.collection(`salons/${salonId}/schedule_blocks`).where("active", "==", true).get(),
        adminDb.collection(`salons/${salonId}/events`).where("active", "==", true).get(),
      ]);

      let fullDayClosed = false;
      const promotions: any[] = [];
      const blocks: any[] = [];

      for (const bd of blocksSnap.docs) {
        const block = bd.data();
        const appliesToDate = block.recurring
          ? block.dayOfWeek === dayOfWeek
          : block.date === date;
        if (appliesToDate) {
          blocks.push({ startTime: block.startTime, endTime: block.endTime, title: block.title, professionalId: block.professionalId });
        }
      }

      for (const ed of eventsSnap.docs) {
        const event = ed.data();
        const inRange =
          (event.date && event.date === date) ||
          (event.startDate && event.endDate && date >= event.startDate && date <= event.endDate);
        if (!inRange) continue;
        if (event.type === "closure") fullDayClosed = true;
        else if (event.type === "promotion") {
          promotions.push({ startTime: event.startTime, endTime: event.endTime, discountPercent: event.discountPercent, serviceIds: event.serviceIds, title: event.title, color: event.color });
        }
      }

      return res.json({ fullDayClosed, blocks, promotions });
    } catch (e) {
      console.error("[/api/events/day]", e);
      return res.status(500).json({ error: "Erro" });
    }
  });

  // ─── Cliente Universal: sync por telefone ────────────────────────────────────
  // Chamado pelo formulário de anamnese pública, fichas de cliente e outros pontos de entrada.
  // Cria ou atualiza o cliente no CRM pelo telefone como chave.
  app.post("/api/client/sync", express.json(), async (req, res) => {
    const { salonId, phone, name, email, birthdate, allergies, notes, source } = req.body;
    if (!salonId || !phone) {
      return res.status(400).json({ error: "salonId e phone são obrigatórios" });
    }
    try {
      const clientId = await upsertClientByPhone(salonId, phone, {
        name: name || undefined,
        email: email || undefined,
        birthdate: birthdate || undefined,
        allergies: allergies || undefined,
        notes: notes || undefined,
        source: source || 'formulario',
      });
      return res.json({ ok: true, clientId });
    } catch (e) {
      console.error("[/api/client/sync]", e);
      return res.status(500).json({ error: "Erro ao sincronizar cliente" });
    }
  });

  // ─── Testar envio de SMS (do painel de configurações) ───────────────────────
  app.post("/api/sms/test", authenticateUser, express.json(), async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "phone obrigatório" });
    if (!SMSDEV_API_KEY) {
      return res.status(400).json({
        error: "SMS não configurado. Adicione SMSDEV_API_KEY no .env",
        docs: "https://www.smsdev.com.br — crie conta grátis e copie a chave de API",
      });
    }
    const ok = await sendSMS(phone, "Teste de SMS do Bella & Chic. Funcionando! ✅");
    return res.json({ ok, message: ok ? "SMS enviado com sucesso!" : "Falha ao enviar. Verifique as credenciais." });
  });

  // ─── Disparar agenda diária manualmente (do painel) ─────────────────────────
  app.post("/api/whatsapp/send-agenda", authenticateUser, express.json(), async (req, res) => {
    const { salonId } = req.body;
    if (!salonId) return res.status(400).json({ error: "salonId obrigatório" });
    try {
      await sendProfessionalDailyAgenda();
      return res.json({ ok: true, message: "Agenda enviada para todos os profissionais com phone cadastrado." });
    } catch (e) {
      console.error("[/api/whatsapp/send-agenda]", e);
      return res.status(500).json({ error: "Erro ao enviar agenda" });
    }
  });

  // ─── SMS / Notificação pelo número do proprietário ────────────────────────────
  // Envia uma mensagem de WhatsApp usando a instância do salão (número próprio do dono).
  // Body: { salonId, to, message, instanceName? }
  app.post("/api/sms/send", authenticateUser, express.json(), async (req, res) => {
    const { salonId, to, message, instanceName } = req.body;
    if (!salonId || !to || !message) {
      return res.status(400).json({ error: "salonId, to e message são obrigatórios" });
    }
    // Usa a instância do salão (formato: salon_{salonId}) ou uma passada explicitamente
    const instance = instanceName || `salon_${salonId}`;
    try {
      const sent = await sendWhatsApp(to, message, instance);
      return res.json({ ok: sent, instance });
    } catch (e) {
      console.error("[/api/sms/send]", e);
      return res.status(500).json({ error: "Erro ao enviar mensagem" });
    }
  });

  // ─── Buscar dados relacionados ao cliente por telefone (para painel CRM) ─────
  // Retorna agendamentos, anamneses, fichas e orçamentos de um telefone
  app.get("/api/client/history", authenticateUser, async (req, res) => {
    const { salonId, phone } = req.query as { salonId: string; phone: string };
    if (!salonId || !phone) {
      return res.status(400).json({ error: "salonId e phone são obrigatórios" });
    }
    const cleanPhone = phone.replace(/\D/g, "");
    try {
      const [aptsSnap, anamneseSnap, recordsSnap] = await Promise.all([
        adminDb.collection(`salons/${salonId}/appointments`)
          .where("customerPhone", "in", [cleanPhone, `55${cleanPhone}`, phone])
          .orderBy("date", "desc").limit(20).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection(`salons/${salonId}/anamnese_responses`)
          .where("clientPhone", "==", cleanPhone).orderBy("submittedAt", "desc").limit(10).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection(`salons/${salonId}/client_records`)
          .where("clientPhone", "==", cleanPhone).limit(5).get().catch(() => ({ docs: [] } as any)),
      ]);

      return res.json({
        appointments: (aptsSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() })),
        anamneses:    (anamneseSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() })),
        records:      (recordsSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() })),
      });
    } catch (e) {
      console.error("[/api/client/history]", e);
      return res.status(500).json({ error: "Erro ao buscar histórico" });
    }
  });

  // ─── Email de boas-vindas ao cadastrar salão ─────────────────────────────
  // ─── Indicação de clientes (client referral) ─────────────────────────────────
  // Chamado quando um cliente agenda e veio de um link de indicação (?ref=CODE)
  app.post("/api/client-referral/register", express.json(), async (req, res) => {
    const { salonId, referralCode, newClientName, newClientId } = req.body;
    if (!salonId || !referralCode) return res.status(400).json({ error: "salonId e referralCode obrigatórios" });

    try {
      // Descobre o clientId que gerou esse código (os 8 primeiros chars do uid em maiúsculo)
      const clientsSnap = await adminDb.collection(`salons/${salonId}/client_referrals`).get();
      let referrerDoc: any = null;

      for (const d of clientsSnap.docs) {
        const data = d.data();
        if (data.referralCode === referralCode) {
          referrerDoc = d;
          break;
        }
      }

      if (!referrerDoc) return res.status(404).json({ error: "Código de indicação não encontrado" });

      const referrerData = referrerDoc.data();

      // Evita indicar a si mesmo
      if (referrerData.clientId === newClientId) {
        return res.status(400).json({ error: "Não pode usar seu próprio link" });
      }

      // Verifica se esse cliente já foi indicado antes pelo mesmo referrer
      const alreadyReferred = (referrerData.referrals || []).some((r: any) => r.clientId === newClientId);
      if (alreadyReferred) return res.json({ ok: true, message: "Já registrado" });

      const POINTS_PER_REFERRAL = 50;
      const newReferrals = [
        ...(referrerData.referrals || []),
        { clientId: newClientId, name: newClientName || 'Amigo', date: Date.now() },
      ];

      await referrerDoc.ref.update({
        totalReferrals: (referrerData.totalReferrals || 0) + 1,
        earnedPoints:   (referrerData.earnedPoints || 0) + POINTS_PER_REFERRAL,
        referrals:      newReferrals,
        updatedAt:      Date.now(),
      });

      // Adiciona pontos de fidelidade ao referrer
      const loyaltyRef = adminDb.doc(`salons/${salonId}/loyalty_accounts/${referrerData.clientId}`);
      const loyaltySnap = await loyaltyRef.get();
      if (loyaltySnap.exists) {
        await loyaltyRef.update({ points: FieldValue.increment(POINTS_PER_REFERRAL), updatedAt: Date.now() });
      }

      console.log(`[Referral] ${referrerData.clientName} ganhou ${POINTS_PER_REFERRAL} pts por indicar ${newClientName} (${salonId})`);
      return res.json({ ok: true, pointsEarned: POINTS_PER_REFERRAL });
    } catch (e: any) {
      console.error("[Referral]", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── WhatsApp Webhook (Baileys → Bot) ───────────────────────────────────────
  app.post("/api/whatsapp/webhook", express.json({ limit: "10mb" }), async (req, res) => {
    try {
      const body = req.body;

      // Aceita tanto 'messages.upsert' quanto variações do Baileys
      const event = (body?.event || body?.type || '').toLowerCase();
      const isMessageEvent = event.includes('message') || event.includes('upsert');
      if (!isMessageEvent) {
        return res.json({ ok: true });
      }

      const data = body?.data || body;

      // Nome da instância — usado para filtro de tempo de conexão
      const instanceNameRaw: string = (
        body?.instance ||
        body?.instanceName ||
        data?.instanceName || ''
      );

      // ── Filtro de mensagens históricas (robusto) ────────────────────────────
      // Baileys entrega mensagens antigas na reconexão (às vezes meses atrás).
      // Estratégia em camadas:
      //   1) Se o timestamp da msg é anterior ao start do servidor → rejeita
      //   2) Se o timestamp da msg é anterior à conexão da instância → rejeita
      //   3) Se msg não tem timestamp nenhum → rejeita (não processa msg sem data)
      //   4) Se msg tem mais de 3 minutos → rejeita
      const msgTsRaw =
        data?.messageTimestamp ??
        data?.message?.messageTimestamp ??
        data?.key?.timestamp ??
        null;

      if (msgTsRaw === null || msgTsRaw === undefined) {
        // Sem timestamp = mensagem suspeita (histórica ou mal-formada) → ignora
        console.log('[Webhook] Mensagem sem timestamp ignorada, instance=' + instanceNameRaw);
        return res.json({ ok: true });
      }

      const msgTsMs = Number(msgTsRaw) > 1e12
        ? Number(msgTsRaw)           // já em milissegundos
        : Number(msgTsRaw) * 1000;   // converter de segundos

      // Camada 1: anterior ao start do servidor
      if (msgTsMs < BOT_GLOBAL_START) {
        console.log(`[Webhook] Msg anterior ao start do servidor ignorada (${new Date(msgTsMs).toISOString()}) from=${data?.from}`);
        return res.json({ ok: true });
      }

      // Camada 2: anterior à conexão da instância (se já conectou)
      const connectedAt = instanceConnectedAt.get(instanceNameRaw);
      if (connectedAt && msgTsMs < connectedAt - 5000) { // 5s de margem
        console.log(`[Webhook] Msg anterior à conexão ignorada (${new Date(msgTsMs).toISOString()}) instance=${instanceNameRaw}`);
        return res.json({ ok: true });
      }

      // Camada 3: mais de 60 segundos de idade — muito provável que seja msg histórica replay
      // Se Baileys filtrou corretamente, mensagens aqui têm < 2 min
      // Mas mantemos 90s como última barreira de segurança
      const MSG_MAX_AGE_MS = 300 * 1000; // 5 min — protege contra histórico sem descartar msgs lentas
      if (Date.now() - msgTsMs > MSG_MAX_AGE_MS) {
        console.log(`[Webhook] Msg antiga ignorada (${Math.round((Date.now() - msgTsMs) / 1000)}s atrás) from=${data?.from}`);
        return res.json({ ok: true });
      }

      // Extrai o texto
      const text: string = (
        data?.message?.conversation ||
        data?.message?.extendedTextMessage?.text ||
        data?.message?.text ||
        data?.text ||
        data?.body || ''
      ).trim();

      // Detecta tipo de mídia (áudio, imagem, etc.)
      const messageType: string = data?.messageType || data?.message?.messageType || '';
      const isAudio = !!(
        data?.message?.audioMessage ||
        data?.message?.pttMessage ||
        messageType === 'audioMessage' ||
        messageType === 'pttMessage'
      );

      // Extrai o remetente — Baileys envia remoteJidAlt com o número real quando @lid
      const rawJid: string = (
        data?.key?.remoteJid ||
        data?.remoteJid ||
        data?.from || ''
      );
      const remoteJidAlt: string = data?.key?.remoteJidAlt || '';
      const altPhone = remoteJidAlt.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');

      // @s.whatsapp.net → número real BR | @c.us → formato antigo | @lid → Meta device ID
      const isLidFormat = rawJid.endsWith('@lid');
      const fromRaw = rawJid
        .replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '')
        .replace(/\D/g, '');
      const from = (altPhone.length >= 8 ? altPhone : fromRaw).slice(0, 15);
      const replyTargetBase = altPhone.length >= 8 ? altPhone : (isLidFormat ? null : from);
      if (altPhone) console.log('[Webhook] @lid resolvido via remoteJidAlt:', altPhone);

      // Ignora mensagens próprias (enviadas pelo bot)
      const fromMe = data?.key?.fromMe ?? data?.fromMe ?? false;

      console.log(`[Webhook] event=${event} from=${from} fromMe=${fromMe} isAudio=${isAudio} text="${text.slice(0,60)}" jid=${rawJid}`);

      if (fromMe || !from) return res.json({ ok: true });

      // ── Responde áudio com mensagem amigável ──────────────────────────────
      // Bot não consegue ouvir áudios — orienta a pessoa a digitar
      if (isAudio && !text) {
        // Descobre instanceName e salonId para conseguir enviar a resposta
        const audioInstanceName: string = instanceNameRaw;
        const audioSalonId = audioInstanceName.startsWith('salon_')
          ? audioInstanceName.replace('salon_', '')
          : null;
        const audioReplyTarget = replyTargetBase || from;
        if (from && audioReplyTarget) {
          await sendWhatsApp(
            audioReplyTarget,
            `🎙️ Oi! Por enquanto não consigo ouvir áudios, tudo bem? 😊\n\nPode me mandar em texto que respondo rapidinho! ✍️`,
            audioInstanceName
          ).catch(() => {});
        }
        return res.json({ ok: true });
      }

      if (!text) return res.json({ ok: true });

      // ── Ignora mensagens de grupos (@g.us) ──────────────────────────────────
      if (rawJid.includes('@g.us') || rawJid.includes('-')) {
        console.log('[Webhook] Mensagem de grupo ignorada:', rawJid);
        return res.json({ ok: true });
      }

      // Descobre o salonId a partir da instância
      const instanceName: string = (
        body?.instance ||
        body?.instanceName ||
        data?.instanceName || ''
      );

      const salonId = instanceName.startsWith('salon_')
        ? instanceName.replace('salon_', '')
        : null;

      // ── Bot de suporte da plataforma ─────────────────────────────────────
      if (instanceName === SUPPORT_INSTANCE) {
        // Verifica se está em modo humano (bot silenciado por 24h)
        const humanExpiry = humanModeChats.get(from);
        if (humanExpiry && Date.now() < humanExpiry) {
          return res.json({ ok: true }); // silêncio
        }
        if (humanExpiry) humanModeChats.delete(from); // expirou

        const tLow = text.toLowerCase();
        const wantsHuman = tLow.includes('humano') || tLow.includes('atendente') ||
          tLow.includes('pessoa') || tLow.includes('suporte') || tLow.includes('falar com');

        if (wantsHuman) {
          humanModeChats.set(from, Date.now() + 24 * 60 * 60 * 1000);
          await sendWhatsApp(from,
            `Claro! 😊 Em instantes um de nossos atendentes entrará em contato.\n\nObrigado pela paciência! 🙏`,
            SUPPORT_INSTANCE
          );
          return res.json({ ok: true });
        }

        // Bot de suporte inteligente
        const supportReply = await handleSupportBot(from, text);
        if (supportReply) {
          await sendWhatsApp(from, supportReply, SUPPORT_INSTANCE);
        }
        return res.json({ ok: true });
      }

      if (!salonId) {
        console.log('[Webhook] salonId não encontrado, instanceName:', instanceName);
        return res.json({ ok: true });
      }

      // replyTarget: Baileys resolve @lid via remoteJidAlt
      const replyTarget = replyTargetBase || from;
      console.log(`[Webhook] from=${from} replyTarget=${replyTarget}`);

      // Busca o plano do salão para decidir qual bot usar
      const salonDoc = await adminDb.collection('salons').doc(salonId).get();
      if (!salonDoc.exists) return res.json({ ok: true });

      const salonData = salonDoc.data() as any;
      const planDoc = salonData?.planId
        ? await adminDb.collection('plans').doc(salonData.planId).get()
        : null;
      const planFeatures = planDoc?.data()?.features || {};

      // Bot inteligente: planos com hasWhatsAppIntegration ou hasCRM avançado (Completo/AgendaPro)
      const useSmartBot = !!planFeatures.hasWhatsAppIntegration;

      // Detecta contexto de página a partir do texto (URL ou palavra-chave)
      let pageContext: string | undefined;
      const tLow = text.toLowerCase();
      if (tLow.includes('loja') || tLow.includes('produto') || tLow.includes('comprar')) pageContext = 'loja';
      else if (tLow.includes('agend') || tLow.includes('horár') || tLow.includes('marcar')) pageContext = 'agendar';
      else if (tLow.includes('avaliaç') || tLow.includes('nota') || tLow.includes('review')) pageContext = 'avaliacoes';
      else if (tLow.includes('preço') || tLow.includes('valor') || tLow.includes('quanto')) pageContext = 'servicos';

      // Marcar que o usuário é novo nessa instância (para envio de anamnese proativo)
      const convKey = `${salonId}:${from}`;
      const isFirstMessage = getBotHistory(convKey).length === 0;

      // ── CRM: registra/atualiza contato ao receber mensagem ──────────────────
      // Só salva se o plano tiver hasCRM ou hasWhatsAppIntegration
      const hasCRM = !!(planFeatures.hasCRM || planFeatures.hasWhatsAppIntegration);

      // Agenda follow-up de 30 min para quem ainda não agendou
      scheduleFollowUp(salonId, from, instanceName);

      // ── CRM Universal: sync completo de mensagem e funil ────────────────────
      if (hasCRM && from && text) {
        const phoneForCRM = from.replace(/\D/g, '');
        if (phoneForCRM.length >= 8) {
          (async () => {
            try {
              const now = Date.now();
              const lastMsgData = { text: text.slice(0, 300), from: 'client', timestamp: now };
              const existingSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
                .where('phone', '==', phoneForCRM).limit(1).get();

              if (!existingSnap.empty) {
                const crmDoc = existingSnap.docs[0];
                const crmData = crmDoc.data() as any;

                // Se modo humano ativo, salva mensagem mas não executa bot abaixo
                await adminDb.collection(`salons/${salonId}/crm_clients/${crmDoc.id}/messages`).add({
                  text: text.slice(0, 1000), from: 'client', timestamp: now,
                });

                const patch: any = { lastContact: now, lastMessage: lastMsgData, updatedAt: now };

                // Progressão automática de funil
                if (crmData.status === 'lead') {
                  patch.status = 'prospect';
                  adminDb.collection(`salons/${salonId}/crm_clients/${crmDoc.id}/notes`).add({
                    text: 'Movido para Em Contato automaticamente via WhatsApp', type: 'stage_change', createdAt: now,
                  }).catch(() => {});
                }
                const bookedKeywords = ['confirmado', 'agendado', 'combinado', 'fechou', 'pagou'];
                if (crmData.status === 'prospect' && bookedKeywords.some(k => text.toLowerCase().includes(k))) {
                  patch.status = 'client';
                  adminDb.collection(`salons/${salonId}/crm_clients/${crmDoc.id}/notes`).add({
                    text: 'Movido para Cliente automaticamente via WhatsApp', type: 'stage_change', createdAt: now,
                  }).catch(() => {});
                }

                await crmDoc.ref.update(patch);

                // Atualiza nome se disponível no push
                const nameFromWA = data?.pushName || data?.notifyName || '';
                if (nameFromWA && nameFromWA.length > 1 && (!crmData.name || crmData.name === phoneForCRM)) {
                  await crmDoc.ref.update({ name: nameFromWA }).catch(() => {});
                }

              } else {
                const nameFromWA = data?.pushName || data?.notifyName || '';
                const newRef = await adminDb.collection(`salons/${salonId}/crm_clients`).add({
                  salonId, phone: phoneForCRM, name: nameFromWA || phoneForCRM,
                  email: '', birthdate: '', status: 'lead', tags: [], source: 'whatsapp',
                  totalSpent: 0, totalVisits: 0, lastContact: now, lastMessage: lastMsgData,
                  humanTakeover: false, createdAt: now, updatedAt: now,
                });
                await adminDb.collection(`salons/${salonId}/crm_clients/${newRef.id}/messages`).add({
                  text: text.slice(0, 1000), from: 'client', timestamp: now,
                });
              }
            } catch (e) {
              console.error('[CRM Sync]', e);
            }
          })();
        }
      }

      // Bot desligado no painel ou atendente humano assumiu (painel CRM Pro) → não responde
      const crmBotSettings = (await adminDb.doc(`salons/${salonId}/settings/crm_bot_settings`).get().catch(() => null))?.data() as any || {};
      const takeoverSnap = await adminDb.doc(`salons/${salonId}/human_takeover/${from.replace(/\D/g, '')}`).get().catch(() => null);
      const botSilenced = crmBotSettings.botEnabled === false || !!(takeoverSnap?.exists && takeoverSnap.data()?.active);

      let reply = '';
      if (botSilenced) {
        reply = '';
      } else if (useSmartBot) {
        // ── Bot de vendas (só para planos com loja) ──────────────────────────
        const salesReply = await handleSalesBot(salonId, from, text).catch(() => null);
        if (salesReply !== null) {
          reply = salesReply;
        } else {
          reply = await handleSmartBot(salonId, from, text, pageContext);
        }
      } else {
        reply = await handleSimpleBot(salonId, from, text);
      }

      // ── Anamnese proativo: envia link na primeira mensagem se salão tiver templates ──
      if (isFirstMessage && reply) {
        try {
          const anamneseSnap = await adminDb.collection(`salons/${salonId}/anamnese_templates`)
            .where('active', '==', true).limit(1).get();
          if (!anamneseSnap.empty) {
            const tmpl = anamneseSnap.docs[0];
            const salonSlugDoc = await adminDb.collection('salons').doc(salonId).get();
            const slug = salonSlugDoc.data()?.slug || salonId;
            const APP_URL_WH = process.env.APP_URL || 'http://localhost:3066';
            const link = `${APP_URL_WH}/anamnese/${salonId}/${tmpl.id}`;
            await sendWhatsApp(
              replyTarget,
              `📋 *Antes da sua consulta*, que tal preencher nossa ficha de anamnese? É rápido e nos ajuda a te atender melhor!

👉 ${link}`,
              instanceName
            );
          }
        } catch { /* silencioso */ }
      }

      if (reply) {
        // Verifica se está em modo humano (humanTakeover) — se sim, bot não responde
        let isHumanMode = false;
        if (hasCRM && from) {
          try {
            const phoneForHuman = from.replace(/\D/g, '');
            const humanSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
              .where('phone', '==', phoneForHuman).limit(1).get();
            if (!humanSnap.empty && humanSnap.docs[0].data().humanTakeover === true) {
              isHumanMode = true;
            }
          } catch {}
        }

        if (!isHumanMode) {
          await sendWhatsApp(replyTarget, reply, instanceName);

          // Salva resposta do bot no histórico CRM
          if (hasCRM && salonId && from) {
            try {
              const phoneForCRMBot = from.replace(/\D/g, '');
              const crmSnap2 = await adminDb.collection(`salons/${salonId}/crm_clients`)
                .where('phone', '==', phoneForCRMBot).limit(1).get();
              if (!crmSnap2.empty) {
                const botMsgData = { text: reply.slice(0, 500), from: 'bot', timestamp: Date.now() };
                await adminDb.collection(`salons/${salonId}/crm_clients/${crmSnap2.docs[0].id}/messages`).add(botMsgData);
                await crmSnap2.docs[0].ref.update({ lastMessage: botMsgData, updatedAt: Date.now() });
              }
            } catch {}
          }
        }
      }

      // ── Forward para CRM Pro se a instância é de um salão ─────────────────
    if (instanceNameRaw?.startsWith('salon_')) {
      const _sid = instanceNameRaw.replace('salon_', '');
      // Async - não bloqueia a resposta do webhook
      setTimeout(() => {
        fetch(`http://127.0.0.1:${PORT}/api/crm-pro/baileys/webhook`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // botReplied/crmLogged evitam resposta dupla e mensagem duplicada no histórico
          body: JSON.stringify({ instance: instanceNameRaw, data, botReplied: !!reply, crmLogged: !!hasCRM }),
        }).catch(() => {});
      }, 1500);
    }

    return res.json({ ok: true });
    } catch (e: any) {
      console.error('[Webhook]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Registra webhook na Evolution quando instância conecta ──────────────────
  app.post("/api/whatsapp/register-webhook", authenticateUser, express.json(), async (req, res) => {
    const { salonId } = req.body;
    if (!salonId || !EVOLUTION_URL || !EVOLUTION_API_KEY) {
      return res.status(400).json({ error: "Dados insuficientes ou Evolution não configurada" });
    }
    const instanceName = `salon_${salonId}`;
    const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3066}`;
    const webhookUrl = `${APP_URL}/api/whatsapp/webhook`;

    try {
      const r = await fetch(`${EVOLUTION_URL}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            webhookBase64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
          }
        }),
      });
      const d = await r.json();
      console.log(`[Webhook Register] ${instanceName} → ${webhookUrl}`, d);
      return res.json({ ok: true, data: d });
    } catch (e: any) {
      console.error('[Webhook Register]', e);
      return res.status(500).json({ error: e.message });
    }
  });

    // ─── Orçamentos: gerar cobrança com split Asaas ──────────────────────────────
  // Split: 1,2% vai para a conta master (ASAAS_WALLET_ID no .env)
  // O resto vai para a conta do salão (asaasApiKey cadastrado nas settings)
  app.post("/api/quotes/payment", authenticateUser, express.json(), async (req, res) => {
    const { salonId, quoteId, method, installments } = req.body;
    if (!salonId || !quoteId || !method) return res.status(400).json({ error: "Dados insuficientes" });

    try {
      // Busca o orçamento
      const quoteDoc = await adminDb.doc(`salons/${salonId}/quotes/${quoteId}`).get();
      if (!quoteDoc.exists) return res.status(404).json({ error: "Orçamento não encontrado" });
      const quote = quoteDoc.data() as any;

      // Busca a key Asaas do salão (cada salão tem a sua)
      const businessDoc = await adminDb.doc(`salons/${salonId}/settings/business`).get();
      const business = businessDoc.data() as any;
      const salonAsaasKey = business?.asaasApiKey;

      if (!salonAsaasKey) {
        return res.status(400).json({ error: "Chave Asaas não configurada. Vá em Configurações → PIX/Pagamentos e adicione sua chave." });
      }

      // Wallet ID da conta master (seu split de 1,2%)
      const masterWalletId = process.env.ASAAS_WALLET_ID || "";
      const SPLIT_PERCENT = 1.2;

      // Cria ou busca cliente no Asaas usando a key do salão
      let asaasCustomerId = "";
      if (quote.clientCpf || quote.clientEmail) {
        try {
          const custRes = await fetch("https://api.asaas.com/v3/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json", "access_token": salonAsaasKey },
            body: JSON.stringify({
              name: quote.clientName,
              email: quote.clientEmail || undefined,
              phone: quote.clientPhone || undefined,
              cpfCnpj: quote.clientCpf?.replace(/\D/g, "") || undefined,
            }),
          });
          const custData = await custRes.json();
          asaasCustomerId = custData.id || "";
        } catch (e) { console.warn("[Quotes] Erro ao criar cliente Asaas:", e); }
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (method === "BOLETO" ? 3 : 1));
      const dueDateStr = dueDate.toISOString().split("T")[0];

      // Monta o payload de cobrança
      const chargePayload: any = {
        customer: asaasCustomerId || undefined,
        billingType: method === "CREDIT_CARD" ? "CREDIT_CARD" : method,
        value: Number(quote.total.toFixed(2)),
        dueDate: dueDateStr,
        description: `Orçamento #${quoteId.slice(-6).toUpperCase()} — ${quote.clientName}`,
        externalReference: `${salonId}__quote__${quoteId}`,
      };

      // Parcelamento cartão
      if (method === "CREDIT_CARD" && installments > 1) {
        chargePayload.installmentCount = installments;
        chargePayload.installmentValue = Number((quote.total / installments).toFixed(2));
      }

      // Split de 1,2% para a conta master (só se tiver walletId configurado)
      if (masterWalletId) {
        chargePayload.split = [{
          walletId: masterWalletId,
          percentualValue: SPLIT_PERCENT,
        }];
      }

      const chargeRes = await fetch("https://api.asaas.com/v3/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": salonAsaasKey },
        body: JSON.stringify(chargePayload),
      });
      const charge = await chargeRes.json();
      if (!charge.id) throw new Error(charge.errors?.[0]?.description || "Erro ao criar cobrança no Asaas");

      let responseData: any = { chargeId: charge.id };

      if (method === "PIX") {
        const qrRes = await fetch(`https://api.asaas.com/v3/payments/${charge.id}/pixQrCode`, {
          headers: { "access_token": salonAsaasKey },
        });
        const qrData = await qrRes.json();
        responseData.qrCodeBase64 = qrData.encodedImage || "";
        responseData.copyPaste = qrData.payload || "";
      } else if (method === "BOLETO") {
        const boletoRes = await fetch(`https://api.asaas.com/v3/payments/${charge.id}/identificationField`, {
          headers: { "access_token": salonAsaasKey },
        });
        const boletoData = await boletoRes.json();
        responseData.boletoUrl = charge.bankSlipUrl || boletoData.identificationField || "";
        responseData.boletoLine = boletoData.identificationField || "";
      } else if (method === "CREDIT_CARD") {
        // Link de pagamento para o cliente pagar online
        const linkRes = await fetch("https://api.asaas.com/v3/paymentLinks", {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": salonAsaasKey },
          body: JSON.stringify({
            name: `Orçamento — ${quote.clientName}`,
            value: quote.total,
            billingType: "CREDIT_CARD",
            maxInstallmentCount: installments,
            description: `Orçamento #${quoteId.slice(-6).toUpperCase()}`,
          }),
        });
        const linkData = await linkRes.json();
        responseData.paymentLink = linkData.url || charge.invoiceUrl || "";
      }

      // Atualiza o orçamento com os dados de pagamento
      await quoteDoc.ref.update({
        status: "accepted",
        paymentMethod: method,
        installments: installments || 1,
        asaasPaymentId: charge.id,
        ...(responseData.copyPaste ? { pixCopyPaste: responseData.copyPaste } : {}),
        ...(responseData.boletoUrl ? { boletoUrl: responseData.boletoUrl } : {}),
        ...(responseData.paymentLink ? { asaasPaymentLink: responseData.paymentLink } : {}),
        updatedAt: Date.now(),
      });

      console.log(`[Quotes] Cobrança gerada: ${charge.id} (${method}) para ${quote.clientName} — R$${quote.total}`);
      return res.json(responseData);
    } catch (e: any) {
      console.error("[Quotes Payment]", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // ─── Asaas Webhook: marca orçamento como pago ─────────────────────────────
  app.post("/api/quotes/webhook", express.json(), async (req, res) => {
    const { event, payment } = req.body;
    if (event !== "PAYMENT_RECEIVED" && event !== "PAYMENT_CONFIRMED") return res.json({ ok: true });

    const externalRef: string = payment?.externalReference || "";
    if (!externalRef.includes("__quote__")) return res.json({ ok: true });

    const [salonId, , quoteId] = externalRef.split("__");
    if (!salonId || !quoteId) return res.json({ ok: true });

    try {
      await adminDb.doc(`salons/${salonId}/quotes/${quoteId}`).update({
        status: "paid",
        paidAt: Date.now(),
        updatedAt: Date.now(),
      });
      console.log(`[Quotes Webhook] Orçamento ${quoteId} pago (${salonId})`);
    } catch (e) { console.error("[Quotes Webhook]", e); }

    return res.json({ ok: true });
  });

  // ─── Quotes: Enviar orçamento via WhatsApp ───────────────────────────────
  app.post("/api/quotes/send-whatsapp", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { quoteId } = req.body;
    if (!quoteId) return res.status(400).json({ error: "quoteId obrigatório" });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: "Não autorizado" });
      const salonId = profile.salonId;

      const quoteDoc = await adminDb.doc(`salons/${salonId}/quotes/${quoteId}`).get();
      if (!quoteDoc.exists) return res.status(404).json({ error: "Orçamento não encontrado" });
      const quote = quoteDoc.data() as any;

      if (!quote.clientPhone) return res.status(400).json({ error: "Cliente sem telefone cadastrado" });

      const phone = quote.clientPhone.replace(/\D/g, "");
      const itemsText = (quote.items || []).map((i: any) => `• ${i.description} — R$ ${Number(i.unitPrice * i.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`).join("\n");
      const discountLine = quote.discount > 0 ? `\n🎁 Desconto: - R$ ${Number(quote.discount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "";
      const msg = `Olá, ${quote.clientName}! 😊

Segue seu orçamento:

${itemsText}${discountLine}

💰 *Total: R$ ${Number(quote.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*

${quote.notes ? quote.notes + "\n\n" : ""}Qualquer dúvida, é só chamar! 🙌`;

      const instanceName = `salon_${salonId}`;
      await sendWhatsApp(phone, msg, instanceName);

      // Atualiza status para 'sent'
      await adminDb.doc(`salons/${salonId}/quotes/${quoteId}`).update({
        status: "sent",
        sentAt: Date.now(),
        updatedAt: Date.now(),
      });

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

    app.post("/api/appointments/send-confirmations", authenticateUser, async (req, res) => {
    try {
      await sendConfirmationRequests();
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

      app.post("/api/salon/welcome-email", express.json(), async (req, res) => {
    const { salonName, slug, ownerEmail, ownerName, businessType } = req.body;
    if (!ownerEmail) return res.status(400).json({ error: "ownerEmail obrigatório" });

    const APP_URL_EMAIL = process.env.APP_URL || "https://bella-chic.duckdns.org";
    const logoImg = `<img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiB2aWV3Qm94PSIwIDAgMzQwIDE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNzAiIGN5PSI3MiIgcj0iNTIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2UxMWQ0OCIgc3Ryb2tlLXdpZHRoPSIwLjgiLz48Y2lyY2xlIGN4PSIxNzAiIGN5PSI3MiIgcj0iNDQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2UxMWQ0OCIgc3Ryb2tlLXdpZHRoPSIwLjMiIG9wYWNpdHk9IjAuNSIvPjx0ZXh0IHg9IjE1MiIgeT0iOTQiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhLHNlcmlmIiBmb250LXNpemU9IjQwIiBmb250LXdlaWdodD0iMzAwIiBmaWxsPSIjZTExZDQ4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5CPC90ZXh0Pjx0ZXh0IHg9IjE3MCIgeT0iODAiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhLHNlcmlmIiBmb250LXNpemU9IjExIiBmb250LXdlaWdodD0iMzAwIiBmaWxsPSIjZTExZDQ4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXN0eWxlPSJpdGFsaWMiPiZhbXA7PC90ZXh0Pjx0ZXh0IHg9IjE4OCIgeT0iOTQiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhLHNlcmlmIiBmb250LXNpemU9IjQwIiBmb250LXdlaWdodD0iMzAwIiBmaWxsPSIjZTExZDQ4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DPC90ZXh0PjxsaW5lIHgxPSI2MCIgeTE9IjEyNCIgeDI9IjEzMCIgeTI9IjEyNCIgc3Ryb2tlPSIjZTExZDQ4IiBzdHJva2Utd2lkdGg9IjAuNSIgb3BhY2l0eT0iMC42Ii8+PGxpbmUgeDE9IjIxMCIgeTE9IjEyNCIgeDI9IjI4MCIgeTI9IjEyNCIgc3Ryb2tlPSIjZTExZDQ4IiBzdHJva2Utd2lkdGg9IjAuNSIgb3BhY2l0eT0iMC42Ii8+PGNpcmNsZSBjeD0iMTcwIiBjeT0iMTI0IiByPSIyIiBmaWxsPSIjZTExZDQ4IiBvcGFjaXR5PSIwLjYiLz48dGV4dCB4PSIxNzAiIHk9IjE1MCIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iMTgiIGZvbnQtd2VpZ2h0PSIzMDAiIGZpbGw9IiMxYTFhMWEiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGxldHRlci1zcGFjaW5nPSI1Ij5CRUxMQSAmYW1wOyBDSElDPC90ZXh0Pjx0ZXh0IHg9IjE3MCIgeT0iMTY4IiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSI3IiBmb250LXdlaWdodD0iMzAwIiBmaWxsPSIjODg4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBsZXR0ZXItc3BhY2luZz0iNCI+UExBVEFGT1JNQTwvdGV4dD48L3N2Zz4=" width="160" height="90" alt="Bella &amp; Chic" style="display:block;margin:0 auto;" />`;

    const typeConfig: Record<string, {emoji:string;noun:string;headline:string;stepsHtml:string;featuresHtml:string}> = {
      beauty: {
        emoji: "✂️",
        noun: "estabelecimento de beleza",
        headline: "Seu espaço de beleza foi criado!",
        stepsHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🎨</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">1. Personalize seu perfil</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Adicione logo, cores, fotos e descrição para impressionar seus clientes.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📅</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">2. Configure seus serviços</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Cadastre serviços com preços, duração e profissionais responsáveis.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🔗</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">3. Compartilhe seu link</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Divulgue no Instagram, WhatsApp e onde seus clientes estão.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🤖</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">4. Ative o bot do WhatsApp</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Conecte seu WhatsApp e deixe o bot responder e agendar automaticamente.</p></td></tr></table>`,
        featuresHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Agendamento online 24h</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Bot de WhatsApp automático</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Gestão de equipe</span></div></td><td width="50%" valign="top" style="padding-left:16px;"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Programa de fidelidade</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">CRM de clientes</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Loja virtual</span></div></td></tr></table>`,
      },
      health: {
        emoji: "🏥",
        noun: "clínica / consultório",
        headline: "Sua clínica foi criada com sucesso!",
        stepsHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🏥</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">1. Configure a clínica</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Personalize logo, cores e informações do consultório.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📋</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">2. Crie templates de anamnese</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Fichas que os pacientes preenchem antes da consulta pelo link.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📅</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">3. Cadastre procedimentos</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Consultas, exames e procedimentos com preços e duração.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🔗</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">4. Compartilhe o agendamento</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Divulgue para os pacientes agendarem sozinhos a qualquer hora.</p></td></tr></table>`,
        featuresHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Agenda de consultas</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Prontuário eletrônico</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Anamnese com assinatura digital</span></div></td><td width="50%" valign="top" style="padding-left:16px;"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Orçamentos e cobranças</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Receituário e documentos</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">CRM de pacientes</span></div></td></tr></table>`,
      },
      fitness: {
        emoji: "💪",
        noun: "espaço fitness",
        headline: "Seu estúdio foi criado com sucesso!",
        stepsHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">💪</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">1. Configure o estúdio</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Personalize com logo, fotos e informações das modalidades.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📅</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">2. Monte aulas e horários</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Cadastre aulas, pacotes e disponibilidade da equipe.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📋</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">3. Crie fichas de alunos</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Registre evolução e histórico de cada aluno.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🔗</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">4. Comece a receber alunos</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Compartilhe seu link para inscrições online.</p></td></tr></table>`,
        featuresHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Agenda de aulas online</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Fichas de alunos</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Pacotes de treino</span></div></td><td width="50%" valign="top" style="padding-left:16px;"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Programa de fidelidade</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Relatórios de evolução</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">CRM de alunos</span></div></td></tr></table>`,
      },
      services: {
        emoji: "💼",
        noun: "negócio de serviços",
        headline: "Seu negócio foi criado com sucesso!",
        stepsHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">💼</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">1. Configure seu negócio</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Personalize com logo, descrição e informações de contato.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📅</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">2. Defina seus serviços</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Cadastre o que você oferece com preços e prazos.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📋</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">3. Use orçamentos</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Gere orçamentos e envie direto pelo WhatsApp do cliente.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🔗</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">4. Divulgue e cresça</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Link de agendamento para receber clientes automaticamente.</p></td></tr></table>`,
        featuresHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Agenda de reuniões</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Briefings de clientes</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Orçamentos profissionais</span></div></td><td width="50%" valign="top" style="padding-left:16px;"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Documentos e contratos</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">CRM completo</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Relatórios financeiros</span></div></td></tr></table>`,
      },
      sports: {
        emoji: "🏟️",
        noun: "espaço esportivo",
        headline: "Seu espaço esportivo foi criado!",
        stepsHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🏟️</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">1. Configure o espaço</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Personalize com logo e fotos das quadras.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📅</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">2. Cadastre espaços e horários</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Quadras e campos com disponibilidade e preços.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">📦</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">3. Crie pacotes mensais</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Planos mensais para fidelizar seus clientes.</p></td></tr></table>\n        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td width="52" valign="top" style="padding-right:14px;"><div style="width:42px;height:42px;border-radius:50%;background:#fdf2f4;border:1.5px solid #fca5a5;text-align:center;line-height:42px;font-size:20px;">🔗</div></td><td valign="top"><p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#111827;">4. Abra para reservas</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Link para reservas online sem precisar de ligações.</p></td></tr></table>`,
        featuresHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Reservas online de quadras</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Gestão de espaços</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Pacotes mensais</span></div></td><td width="50%" valign="top" style="padding-left:16px;"><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Eventos e torneios</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">CRM de clientes</span></div><div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;"><span style="color:#e11d48;font-weight:700;font-size:14px;flex-shrink:0;">&#10003;</span><span style="color:#374151;font-size:13px;line-height:1.4;">Relatórios financeiros</span></div></td></tr></table>`,
      },
    };

    const normalizedType = (businessType === "dental" || businessType === "clinic") ? "health" : (businessType || "beauty");
    const cfg = typeConfig[normalizedType] || typeConfig.beauty;

    const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
      <tr><td align="center" style="padding-bottom:20px;">${logoImg}</td></tr>
      <tr><td style="background:#fff;border-radius:20px 20px 0 0;padding:40px 40px 28px;text-align:center;border-bottom:3px solid #e11d48;">
        <div style="font-size:42px;margin-bottom:14px;">${cfg.emoji}</div>
        <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.3px;">${cfg.headline}</h1>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.7;">Olá, <strong style="color:#111827;">${ownerName || "Administrador"}</strong>!<br>Seu ${cfg.noun} <strong style="color:#e11d48;">${salonName}</strong> já está no ar. 🎉</p>
      </td></tr>
      <tr><td style="background:#fff;padding:28px 40px;text-align:center;">
        <a href="${APP_URL_EMAIL}/s/${slug}/admin" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 36px;border-radius:12px;">Acessar meu painel →</a>
        <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">Link público: <a href="${APP_URL_EMAIL}/s/${slug}" style="color:#e11d48;text-decoration:none;">${APP_URL_EMAIL}/s/${slug}</a></p>
      </td></tr>
      <tr><td style="background:#fff;padding:0 40px;"><hr style="border:none;border-top:1px solid #f3f4f6;margin:0;"></td></tr>
      <tr><td style="background:#fff;padding:28px 40px;">
        <p style="margin:0 0 18px;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:2.5px;text-transform:uppercase;">Primeiros passos</p>
        ${cfg.stepsHtml}
      </td></tr>
      <tr><td style="background:#fdf2f4;padding:24px 40px;border-top:1px solid #fce7eb;border-bottom:1px solid #fce7eb;">
        <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:2.5px;text-transform:uppercase;">O que você tem disponível</p>
        ${cfg.featuresHtml}
      </td></tr>
      <tr><td style="background:#fff;padding:24px 40px;text-align:center;border-radius:0 0 20px 20px;">
        <a href="${APP_URL_EMAIL}/politica" style="display:inline-block;margin:0 6px 8px;padding:10px 18px;border:1.5px solid #d1d5db;border-radius:8px;color:#374151;text-decoration:none;font-size:13px;font-weight:600;">🔒 Políticas de Privacidade</a>
      </td></tr>
      <tr><td style="padding:20px 40px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.8;">Você recebeu este email ao criar sua conta na Bella &amp; Chic Plataforma.<br>Dúvidas? Responda este email — estamos aqui.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

    try {
      await sendEmail({
        to: ownerEmail,
        subject: `${cfg.emoji} ${cfg.headline} — Bem-vindo(a) à Bella & Chic!`,
        html: htmlBody,
      });
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[welcome-email]", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ─── Vite / Static ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
  
  // ── Cálculo de frete via Correios ─────────────────────────────────────────
  app.post("/api/shipping/calculate", async (req, res) => {
    const { cepOrigem, cepDestino, weight = 0.5, length = 20, height = 10, width = 15 } = req.body;
    if (!cepDestino || !cepOrigem) return res.status(400).json({ error: "cepOrigem e cepDestino obrigatórios" });

    const cepO = cepOrigem.replace(/\D/g, '');
    const cepD = cepDestino.replace(/\D/g, '');
    if (cepO.length !== 8 || cepD.length !== 8) return res.status(400).json({ error: "CEP inválido" });

    try {
      // PAC = 04510, SEDEX = 04014
      const services = ['04510', '04014'];
      const results: any[] = [];

      for (const svc of services) {
        const url = `https://ws.correios.com.br/calculador/CalcPrecoPrazo.asmx/CalcPrecoPrazo?nCdEmpresa=&sDsSenha=&sCepOrigem=${cepO}&sCepDestino=${cepD}&nVlPeso=${weight}&nCdFormato=1&nVlComprimento=${length}&nVlAltura=${height}&nVlLargura=${width}&nVlDiametro=0&nCdServico=${svc}&nVlValorDeclarado=0&sCdMaoPropria=n&sCdAvisoRecebimento=n&StrRetorno=xml`;
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
          const xml = await r.text();
          // Parse XML
          const priceMatch = xml.match(/<Valor>([\d,]+)<\/Valor>/);
          const daysMatch = xml.match(/<PrazoEntrega>(\d+)<\/PrazoEntrega>/);
          const errorMatch = xml.match(/<MsgErro>([^<]*)<\/MsgErro>/);
          if (priceMatch && daysMatch && !errorMatch?.[1]) {
            const price = parseFloat(priceMatch[1].replace(',', '.'));
            const days = parseInt(daysMatch[1]);
            if (price > 0) {
              results.push({
                service: svc === '04510' ? 'PAC' : 'SEDEX',
                code: svc,
                price,
                days,
                label: svc === '04510' ? `PAC — ${days} dia${days !== 1 ? 's' : ''} úteis` : `SEDEX — ${days} dia${days !== 1 ? 's' : ''} úteis`,
              });
            }
          }
        } catch { /* timeout ou erro — ignora este serviço */ }
      }

      if (results.length === 0) {
        return res.json({ options: [], fallback: true, message: "Não foi possível calcular. Use o frete fixo." });
      }
      return res.json({ options: results });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── CEP lookup ─────────────────────────────────────────────────────────────
  app.get("/api/cep/:cep", async (req, res) => {
    const cep = req.params.cep.replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ error: "CEP inválido" });
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4000) });
      const data = await r.json();
      if ((data as any).erro) return res.status(404).json({ error: "CEP não encontrado" });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Adicionar código de rastreio ao pedido ─────────────────────────────────
  app.post("/api/order/tracking", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { orderId, trackingCode, carrier = 'Correios' } = req.body;
    if (!orderId || !trackingCode) return res.status(400).json({ error: "orderId e trackingCode obrigatórios" });

    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: "Salão não encontrado" });
      const salonId = profile.salonId;

      const orderRef = adminDb.doc(`salons/${salonId}/orders/${orderId}`);
      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) return res.status(404).json({ error: "Pedido não encontrado" });
      const order = orderDoc.data() as any;

      await orderRef.update({
        trackingCode, carrier, status: 'SHIPPED',
        shippedAt: Date.now(), updatedAt: Date.now(),
      });

      // Notifica cliente via WhatsApp
      const customerPhone = (order.customerPhone || '').replace(/\D/g, '');
      if (customerPhone) {
        const trackingUrl = `https://rastreamento.correios.com.br/app/index.php?objeto=${trackingCode}`;
        const msg =
          `📦 *Seu pedido foi enviado!*\n\n` +
          `🚚 Transportadora: ${carrier}\n` +
          `🔍 Código de rastreio: *${trackingCode}*\n\n` +
          `Acompanhe em tempo real:\n${trackingUrl}\n\n` +
          `Qualquer dúvida é só falar aqui! 😊`;
        await sendWhatsApp(customerPhone, msg, `salon_${salonId}`).catch(() => {});
      }

      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });


  // ── CRM Pro: Controle humano por conversa ────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  // ── CRM PADRÃO — Rotas compartilhadas (Agenda Pro + Completo) ─────────────
  // ══════════════════════════════════════════════════════════════════════════

  // ── CRM: Send message (modo humano) ────────────────────────────────────────
  app.post("/api/crm/send-message", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone e message obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      const cleanPhone = phone.replace(/\D/g, '');
      const instanceName = `salon_${salonId}`;

      await sendWhatsApp(cleanPhone, message, instanceName);

      const now = Date.now();
      const msgData = { text: message.slice(0, 500), from: 'owner', timestamp: now };
      const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
        .where('phone', '==', cleanPhone).limit(1).get();
      if (!crmSnap.empty) {
        await adminDb.collection(`salons/${salonId}/crm_clients/${crmSnap.docs[0].id}/messages`).add(msgData);
        await crmSnap.docs[0].ref.update({ lastMessage: msgData, lastContact: now, updatedAt: now });
      }
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM: Toggle modo humano ────────────────────────────────────────────────
  app.post("/api/crm/takeover", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { phone, active } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      const cleanPhone = phone.replace(/\D/g, '');
      const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
        .where('phone', '==', cleanPhone).limit(1).get();
      if (!crmSnap.empty) {
        await crmSnap.docs[0].ref.update({ humanTakeover: !!active, updatedAt: Date.now() });
        if (active) {
          await adminDb.collection(`salons/${salonId}/crm_clients/${crmSnap.docs[0].id}/notes`).add({
            text: 'Modo humano ativado — bot pausado', type: 'system', createdAt: Date.now(),
          });
        } else {
          await adminDb.collection(`salons/${salonId}/crm_clients/${crmSnap.docs[0].id}/notes`).add({
            text: 'Bot reativado', type: 'system', createdAt: Date.now(),
          });
        }
      }
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM: AI Summary ────────────────────────────────────────────────────────
  app.post("/api/crm/ai-summary", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId obrigatório' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;

      const [clientDoc, messagesSnap] = await Promise.all([
        adminDb.doc(`salons/${salonId}/crm_clients/${clientId}`).get(),
        adminDb.collection(`salons/${salonId}/crm_clients/${clientId}/messages`)
          .orderBy('timestamp', 'desc').limit(20).get(),
      ]);

      if (!clientDoc.exists) return res.status(404).json({ error: 'Cliente não encontrado' });

      const client = clientDoc.data() as any;
      const msgs = messagesSnap.docs.reverse().map(m => {
        const d = m.data() as any;
        return `[${d.from === 'client' ? 'CLIENTE' : d.from === 'bot' ? 'BOT' : 'VOCÊ'}]: ${d.text}`;
      }).join('\n');

      const prompt = `Analise o cliente abaixo e retorne JSON com 3 campos:
- "summary": resumo em 1-2 frases sobre o perfil e interesse
- "tags": array de até 3 tags relevantes (ex: ["Interesse: tranças", "Orçamento solicitado"])
- "suggestion": uma sugestão de próxima mensagem para enviar agora

Cliente: ${client.name} | Status: ${client.status} | Visitas: ${client.totalVisits} | Gasto: R$${client.totalSpent}
Últimas mensagens:
${msgs || 'Sem histórico de mensagens ainda.'}

Responda APENAS o JSON, sem texto extra.`;

      const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400, temperature: 0.4,
        }),
      });
      const groqData = await groqResp.json() as any;
      const raw = groqData?.choices?.[0]?.message?.content || '{}';
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return res.json(parsed);
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM: Quick Replies (leitura — compartilhada com crm-pro) ───────────────
  app.get("/api/crm/quick-replies", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const snap = await adminDb.collection(`salons/${profile.salonId}/crm_quick_replies`)
        .orderBy('createdAt', 'desc').get();
      return res.json({ items: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm/quick-replies", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { title, text } = req.body;
    if (!title || !text) return res.status(400).json({ error: 'title e text obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const ref = await adminDb.collection(`salons/${profile.salonId}/crm_quick_replies`)
        .add({ title, text, createdAt: Date.now() });
      return res.json({ id: ref.id });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/crm/quick-replies/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_quick_replies/${req.params.id}`).delete();
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM: Tasks (compartilhado) ─────────────────────────────────────────────
  app.get("/api/crm/tasks", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const snap = await adminDb.collection(`salons/${profile.salonId}/crm_tasks`)
        .orderBy('dueDate', 'asc').get();
      return res.json({ tasks: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm/tasks", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { title, clientId, clientName, dueDate, done } = req.body;
    if (!title || !dueDate) return res.status(400).json({ error: 'title e dueDate obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const ref = await adminDb.collection(`salons/${profile.salonId}/crm_tasks`).add({
        title, clientId: clientId || null, clientName: clientName || null,
        dueDate, done: done || false, createdAt: Date.now(),
      });
      return res.json({ id: ref.id });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/crm/tasks/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_tasks/${req.params.id}`).update({ ...req.body, updatedAt: Date.now() });
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/crm/tasks/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_tasks/${req.params.id}`).delete();
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ── RETORNO DE PACIENTE ───────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  app.post("/api/clients/set-return-date", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { clientId, returnDate, returnTime, clientPhone, clientName } = req.body;
    if (!clientId || !returnDate) return res.status(400).json({ error: 'clientId e returnDate obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;

      await adminDb.doc(`salons/${salonId}/client_returns/${clientId}`).set({
        clientId, salonId,
        clientPhone: (clientPhone || '').replace(/\D/g, ''),
        clientName: clientName || '',
        returnDate, returnTime: returnTime || '09:00',
        reminderSent: false, createdAt: Date.now(),
      }, { merge: true });

      // Confirmação imediata ao paciente (via número do salão)
      const phone = (clientPhone || '').replace(/\D/g, '');
      if (phone) {
        const [y, m, d] = returnDate.split('-');
        await sendWhatsApp(phone,
          `Olá, ${clientName}! 📅 Seu retorno foi agendado para *${d}/${m}/${y}*${returnTime ? ` às *${returnTime}*` : ''}.

Vou te lembrar um dia antes! 😊`,
          `salon_${salonId}`).catch(() => {});
      }

      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ── ANAMNESE: Envio de link para paciente preencher ───────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  app.post("/api/anamnese/send-patient-link", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { templateId, clientPhone, clientName } = req.body;
    if (!templateId || !clientPhone) return res.status(400).json({ error: 'templateId e clientPhone obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      const phone = clientPhone.replace(/\D/g, '');
      const appUrl = (process.env.APP_URL || 'https://bella-chic.duckdns.org').replace(/\/+$/, '');
      const link = `${appUrl}/s/${salonId}/anamnese/${templateId}`;

      await sendWhatsApp(phone,
        `Olá, ${clientName || 'cliente'}! 📋

Para otimizar seu atendimento, preencha nossa ficha antes da consulta:

🔗 ${link}

Leva menos de 2 minutos! 😊`,
        `salon_${salonId}`);

      return res.json({ ok: true, link });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ── SCORE CHECK (add-on pago) ─────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  app.post("/api/clients/score-check", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { cpf } = req.body;
    if (!cpf) return res.status(400).json({ error: 'CPF obrigatório' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });

      const salonDoc = await adminDb.doc(`salons/${profile.salonId}`).get();
      if (!salonDoc.data()?.hasScoreCheck) {
        return res.status(403).json({
          error: 'add-on-required',
          message: 'Consulta de Score é um add-on pago. Ative em Configurações > Assinatura.',
        });
      }

      const clean = cpf.replace(/\D/g, '');
      if (clean.length !== 11) return res.status(400).json({ error: 'CPF inválido' });

      // MOCK — Substituir por integração real (Serasa/Boa Vista/SPC) quando contratar API
      const score = Math.floor(Math.random() * 700) + 150;
      const result = {
        cpf: clean,
        score,
        classification: score >= 700 ? 'Excelente' : score >= 500 ? 'Bom' : score >= 300 ? 'Regular' : 'Baixo',
        risk: score >= 700 ? 'Baixo risco' : score >= 400 ? 'Risco moderado' : 'Alto risco',
        recommendation: score >= 500
          ? 'Cliente confiável — pode oferecer parcelamento'
          : 'Cautela — recomendamos pagamento antecipado',
        consultedAt: new Date().toISOString(),
        isMock: true, // Remover quando integração real ativa
      };

      await adminDb.collection(`salons/${profile.salonId}/score_checks`).add({
        ...result, consultedBy: requester.uid, createdAt: Date.now(),
      });

      return res.json(result);
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ── AGENDAMENTO CUSTOMIZADO (procedimentos + duração) ─────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  app.post("/api/appointments/custom", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { clientName, clientPhone, date, startTime, procedures, notes, professionalId, professionalName } = req.body;
    if (!clientName || !date || !startTime || !procedures?.length) {
      return res.status(400).json({ error: 'Dados obrigatórios: clientName, date, startTime, procedures' });
    }
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;

      const totalMin = procedures.reduce((s: number, p: any) => s + (p.durationMinutes || 30), 0);
      const [h, m] = startTime.split(':').map(Number);
      const endTotalMin = h * 60 + m + totalMin;
      const endTime = `${String(Math.floor(endTotalMin / 60)).padStart(2, '0')}:${String(endTotalMin % 60).padStart(2, '0')}`;

      const ref = await adminDb.collection(`salons/${salonId}/custom_appointments`).add({
        salonId, clientName, clientPhone: (clientPhone || '').replace(/\D/g, ''),
        date, startTime, endTime, totalDurationMinutes: totalMin,
        procedures, notes: notes || '',
        professionalId: professionalId || null,
        professionalName: professionalName || null,
        status: 'scheduled', createdAt: Date.now(),
      });

      // Notifica dono via Bella&Chic
      await notifyOwner(salonId,
        `📅 *Novo agendamento customizado!*
👤 ${clientName}
📆 ${date} às ${startTime} — ${endTime}
⏱ ${totalMin}min
📋 ${procedures.map((p: any) => p.name).join(', ')}`
      );

      return res.json({ ok: true, id: ref.id, endTime, totalDurationMinutes: totalMin });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.get("/api/appointments/custom", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { date } = req.query as any;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      let q: any = adminDb.collection(`salons/${profile.salonId}/custom_appointments`);
      if (date) q = q.where('date', '==', date);
      const snap = await q.orderBy('startTime', 'asc').get();
      return res.json({ items: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/appointments/custom/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/custom_appointments/${req.params.id}`)
        .update({ ...req.body, updatedAt: Date.now() });
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/appointments/custom/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/custom_appointments/${req.params.id}`).delete();
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM: Conversas (inbox) ─────────────────────────────────────────────────
  app.get("/api/crm/conversations", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      const snap = await adminDb.collection(`salons/${salonId}/crm_clients`)
        .orderBy('lastContact', 'desc').limit(100).get();
      const clients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.json({ clients });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM: Disparo em massa (igual crm-pro, para plano completo) ─────────────
  app.post("/api/crm/bulk-send", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { message, phones } = req.body;
    if (!message || !phones?.length) return res.status(400).json({ error: 'message e phones obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      let sent = 0, failed = 0;
      for (const phone of phones.slice(0, 200)) {
        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone) { failed++; continue; }
        try {
          let personalMsg = message;
          if (message.includes('{{nome}}')) {
            const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
              .where('phone', '==', cleanPhone).limit(1).get();
            const name = crmSnap.docs[0]?.data()?.name || 'você';
            personalMsg = message.replace(/\{\{nome\}\}/gi, name);
          }
          await sendWhatsApp(cleanPhone, personalMsg, `salon_${salonId}`);
          const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
            .where('phone', '==', cleanPhone).limit(1).get();
          if (!crmSnap.empty) {
            await adminDb.collection(`salons/${salonId}/crm_clients/${crmSnap.docs[0].id}/messages`).add({
              text: personalMsg, from: 'owner', timestamp: Date.now(),
            });
            await crmSnap.docs[0].ref.update({ lastContact: Date.now() });
          }
          sent++;
          await new Promise(r => setTimeout(r, 1500));
        } catch { failed++; }
      }
      return res.json({ ok: true, sent, failed, total: phones.length });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm-pro/takeover", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { phone, active } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      await adminDb.doc(`salons/${salonId}/human_takeover/${phone.replace(/\D/g, '')}`).set({
        active: !!active, updatedAt: Date.now(), updatedBy: requester.uid,
      });
      return res.json({ ok: true, active });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM Pro: Enviar mensagem manual pelo painel ───────────────────────────
  app.post("/api/crm-pro/send-message", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone e message obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      const cleanPhone = phone.replace(/\D/g, '');

      // Envia via WhatsApp
      await sendWhatsApp(cleanPhone, message, `salon_${salonId}`);

      // Salva no histórico do CRM
      const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
        .where('phone', '==', cleanPhone).limit(1).get();
      if (!crmSnap.empty) {
        await adminDb.collection(`salons/${salonId}/crm_clients/${crmSnap.docs[0].id}/messages`).add({
          text: message, from: 'owner', timestamp: Date.now(),
        });
      }
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM Pro: Listar todas as conversas com última mensagem ─────────────────
  app.get("/api/crm-pro/conversations", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;

      const [clientsSnap, takeoverSnap] = await Promise.all([
        adminDb.collection(`salons/${salonId}/crm_clients`).orderBy('lastContact', 'desc').limit(50).get().catch(() => ({ docs: [] } as any)),
        adminDb.collection(`salons/${salonId}/human_takeover`).get().catch(() => ({ docs: [] } as any)),
      ]);

      const takeovers: Record<string, boolean> = {};
      (takeoverSnap as any).docs.forEach((d: any) => { takeovers[d.id] = d.data().active; });

      const conversations = await Promise.all(
        (clientsSnap as any).docs.map(async (d: any) => {
          const client = { id: d.id, ...d.data() };
          const msgSnap = await adminDb.collection(`salons/${salonId}/crm_clients/${d.id}/messages`)
            .orderBy('timestamp', 'desc').limit(1).get().catch(() => ({ docs: [] } as any));
          const lastMsg = (msgSnap as any).docs[0]?.data() || null;
          return {
            ...client,
            lastMessage: lastMsg,
            humanTakeover: takeovers[(client as any).phone?.replace(/\D/g, '')] || false,
          };
        })
      );
      return res.json({ conversations });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });


  // ── CRM Pro: Groq AI — resumo da conversa ────────────────────────────────
  app.post("/api/crm-pro/ai-summary", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId obrigatório' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      const GROQ_KEY = process.env.GROQ_API_KEY || '';
      if (!GROQ_KEY) return res.status(400).json({ error: 'Groq não configurado' });

      // Busca dados do cliente e histórico
      const [clientDoc, msgSnap] = await Promise.all([
        adminDb.doc(`salons/${salonId}/crm_clients/${clientId}`).get(),
        adminDb.collection(`salons/${salonId}/crm_clients/${clientId}/messages`)
          .orderBy('timestamp', 'desc').limit(30).get(),
      ]);

      const client = clientDoc.data() as any;
      const msgs = msgSnap.docs.reverse().map(d => {
        const m = d.data() as any;
        return `[${m.from === 'client' ? 'ALUNA' : m.from === 'bot' ? 'BOT' : 'VOCÊ'}]: ${m.text}`;
      });

      if (msgs.length === 0) {
        return res.json({ summary: 'Sem histórico de mensagens ainda.', tags: [], suggestion: '' });
      }

      const prompt = `Você é um assistente de CRM. Analise o histórico de conversa abaixo e forneça:
1. Um resumo conciso em 2-3 linhas sobre o que a aluna quer e em que estágio está.
2. 2-3 tags relevantes (ex: "Interesse: tranças", "Curso: finalização", "Precisa de follow-up").
3. Uma sugestão de próxima mensagem para enviar a ela.

Cliente: ${client?.name || 'Desconhecido'}
Status atual: ${client?.status || 'lead'}
Notas: ${client?.notes || 'Nenhuma'}

Histórico (últimas ${msgs.length} mensagens):
${msgs.join('\n')}

Responda APENAS em JSON válido, sem markdown:
{"summary": "...", "tags": ["...", "..."], "suggestion": "..."}`;

      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500, temperature: 0.3,
        }),
      });

      const data = await r.json();
      const text = data.choices?.[0]?.message?.content || '{}';
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        return res.json(parsed);
      } catch {
        return res.json({ summary: text, tags: [], suggestion: '' });
      }
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════════════════════
  // ── Bot Config: leitura e salvamento das mensagens customizadas ───────────
  // ════════════════════════════════════════════════════════════════════════════

  app.get("/api/bot/config", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const doc = await adminDb.doc(`salons/${profile.salonId}/settings/bot_config`).get();
      const d = doc.data() || {};
      return res.json({
        botEnabled: (d as any).botEnabled !== false,
        greetingText: (d as any).greetingText || '',
        greetingTextReturning: (d as any).greetingTextReturning || '',
        menuText: (d as any).menuText || '',
        offlineMessage: (d as any).offlineMessage || '',
        humanKeyword: (d as any).humanKeyword || 'humano',
        reminderMessage: (d as any).reminderMessage || '',
        reminderHour: (d as any).reminderHour ?? 8,
        confirmationMessage: (d as any).confirmationMessage || '',
        cancellationMessage: (d as any).cancellationMessage || '',
        audioReplyMessage: (d as any).audioReplyMessage || '',
        fallbackMessage: (d as any).fallbackMessage || '',
        birthdayMessage: (d as any).birthdayMessage || '',
        reengagementMessage: (d as any).reengagementMessage || '',
        followUpMessage: (d as any).followUpMessage || '',
        humanMaxAttempts: (d as any).humanMaxAttempts ?? 3,
        agendaHour: (d as any).agendaHour ?? 7,
      });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/bot/config", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const allowed = ['botEnabled','greetingText','greetingTextReturning','menuText','offlineMessage','humanKeyword','reminderMessage','reminderHour','confirmationMessage','cancellationMessage','audioReplyMessage','fallbackMessage','birthdayMessage','reengagementMessage','followUpMessage','humanMaxAttempts','agendaHour'];
      const data: Record<string, any> = {};
      for (const k of allowed) { if (req.body[k] !== undefined) data[k] = req.body[k]; }
      data.updatedAt = Date.now();
      await adminDb.doc(`salons/${profile.salonId}/settings/bot_config`).set(data, { merge: true });
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM Pro: WhatsApp via Baileys ─────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════

  // ── Status da conexão (usa a instância salon_{salonId} do Baileys) ────────
  app.get("/api/crm-pro/evolution/status", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const instanceName = getCRMProInstance(profile.salonId);
      const r = await fetch(`${WA_SERVICE_URL}/instance/status/${instanceName}`);
      if (!r.ok) return res.json({ connected: false });
      const d = await r.json();
      return res.json({ connected: d.connected === true, status: d.status, instanceName });
    } catch { return res.json({ connected: false }); }
  });

  // ── Conectar via QR Code ──────────────────────────────────────────────────
  app.post("/api/crm-pro/evolution/connect", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const instanceName = getCRMProInstance(profile.salonId);

      // Cria/reinicia a instância Baileys
      const r = await fetch(`${WA_SERVICE_URL}/instance/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName }),
      });
      if (!r.ok) return res.status(500).json({ error: 'Erro ao criar instância' });

      // Aguarda QR ficar disponível
      await new Promise(res => setTimeout(res, 2500));

      const qrRes = await fetch(`${WA_SERVICE_URL}/instance/qr/${instanceName}`);
      const qrData = await qrRes.json();

      return res.json({
        instanceName,
        qrcode: qrData.qrcode || null,
        status: qrData.status || 'connecting',
      });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── Conectar via Pairing Code (sem precisar escanear QR) ─────────────────
  app.post("/api/crm-pro/connect/pairing", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber obrigatório' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const instanceName = getCRMProInstance(profile.salonId);

      const r = await fetch(`${WA_SERVICE_URL}/instance/pairing-code/${instanceName}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(500).json({ error: d.error || 'Erro ao gerar código' });
      return res.json({ pairingCode: d.code || d.pairingCode });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── Desconectar instância ─────────────────────────────────────────────────
  app.post("/api/crm-pro/disconnect", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await fetch(`${WA_SERVICE_URL}/instance/disconnect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: getCRMProInstance(profile.salonId) }),
      });
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── Enviar mensagem rica (texto, mídia, áudio) ────────────────────────────
  app.post("/api/crm-pro/send-rich", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { phone, type, content, caption, fileName } = req.body;
    if (!phone || !type || !content) return res.status(400).json({ error: 'phone, type e content obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;
      const cleanPhone = phone.replace(/\D/g, '');
      const instanceName = getCRMProInstance(salonId);

      let ok = false;
      if (type === 'text') {
        ok = await sendWhatsApp(cleanPhone, content, instanceName);
      } else if (type === 'image' || type === 'video' || type === 'document') {
        ok = await sendBaileysMedia(cleanPhone, content, type, instanceName, caption, fileName);
      } else if (type === 'audio') {
        ok = await sendBaileysAudio(cleanPhone, content, instanceName);
      }

      // Salva no histórico do CRM
      const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
        .where('phone', '==', cleanPhone).limit(1).get().catch(() => null);
      if (crmSnap && !crmSnap.empty) {
        await adminDb.collection(`salons/${salonId}/crm_clients/${crmSnap.docs[0].id}/messages`).add({
          text: type === 'text' ? content : `[${type.toUpperCase()}] ${caption || fileName || content}`,
          from: 'owner', mediaType: type, mediaUrl: type !== 'text' ? content : undefined,
          timestamp: Date.now(),
        });
      }
      return res.json({ ok, sent: ok });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── Webhook: mensagens recebidas do Baileys → CRM Pro ────────────────────
  // As mensagens já chegam via /api/whatsapp/webhook — este endpoint processa
  // mensagens do contexto CRM Pro especificamente
  app.post("/api/crm-pro/baileys/webhook", async (req, res) => {
    const { instance, data, botReplied, crmLogged } = req.body;
    if (!instance || !data) return res.json({ ok: true });

    // Ignora se não é instância de salão
    if (!instance.startsWith('salon_')) return res.json({ ok: true });
    const salonId = instance.replace('salon_', '');

    try {
      const from = (data.from || '').replace(/\D/g, '');
      const text = data.text || '';
      const pushName = data.pushName || from;
      if (!from || data.key?.fromMe) return res.json({ ok: true });

      // ── Filtro de mensagens históricas (CRM Pro) ─────────────────────────
      const crmMsgTsRaw = data?.messageTimestamp ?? data?.key?.timestamp ?? null;
      if (crmMsgTsRaw === null || crmMsgTsRaw === undefined) {
        return res.json({ ok: true }); // sem timestamp = ignora
      }
      const crmMsgTsMs = Number(crmMsgTsRaw) > 1e12 ? Number(crmMsgTsRaw) : Number(crmMsgTsRaw) * 1000;
      if (crmMsgTsMs < BOT_GLOBAL_START) {
        return res.json({ ok: true }); // anterior ao start do servidor
      }
      const crmConnectedAt = instanceConnectedAt.get(instance || '');
      if (crmConnectedAt && crmMsgTsMs < crmConnectedAt - 5000) {
        return res.json({ ok: true }); // anterior à conexão da instância
      }
      if (Date.now() - crmMsgTsMs > 60 * 1000) {
        console.log(`[CRM Webhook] Mensagem antiga ignorada (${Math.round((Date.now() - crmMsgTsMs) / 1000)}s atrás) from=${from}`);
        return res.json({ ok: true });
      }

      // Verifica se o salão tem CRM Pro ativo
      const salonDoc = await adminDb.doc(`salons/${salonId}`).get();
      const salonData = salonDoc.data() as any;
      if (!salonData?.hasCRMPro) {
        // Também aceita se o plano inclui CRM
        const planId = salonData?.planId || salonData?.plan;
        const planDoc = planId ? await adminDb.doc(`plans/${planId}`).get().catch(() => null) : null;
        const planFeatures = planDoc?.data()?.features as any || {};
        if (!planFeatures.hasCRM && !planFeatures.hasWhatsAppIntegration) {
          return res.json({ ok: true });
        }
      }

      // Busca ou cria cliente no CRM
      let crmRef: any = null;
      let isNew = false;
      const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
        .where('phone', '==', from).limit(1).get();

      if (!crmSnap.empty && crmLogged) {
        crmRef = crmSnap.docs[0].ref; // já registrado pelo webhook principal
      } else if (!crmSnap.empty) {
        crmRef = crmSnap.docs[0].ref;
        await crmRef.update({
          lastContact: Date.now(),
          lastClientMessageAt: Date.now(),
          lastMessage: { text: text || '[mídia]', from: 'client', timestamp: Date.now() },
          ...(crmSnap.docs[0].data().status === 'lead' ? { status: 'prospect' } : {}),
        });
      } else {
        isNew = true;
        const newRef = await adminDb.collection(`salons/${salonId}/crm_clients`).add({
          salonId, phone: from, name: pushName, status: 'lead',
          tags: [], source: 'whatsapp_baileys', totalSpent: 0, totalVisits: 0,
          createdAt: Date.now(), updatedAt: Date.now(), lastContact: Date.now(),
          lastMessage: { text: text || '[mídia]', from: 'client', timestamp: Date.now() },
        });
        crmRef = newRef;
      }

      // Salva mensagem no histórico (se o webhook principal já salvou, não duplica)
      if (crmRef && !crmLogged) {
        await adminDb.collection(`salons/${salonId}/crm_clients/${crmRef.id}/messages`).add({
          text: text || '[mídia recebida]', from: 'client',
          mediaType: data.messageType !== 'conversation' ? data.messageType : undefined,
          timestamp: Date.now(),
        });
      }

      // Verifica configurações do bot
      const botSettingsDoc = await adminDb.doc(`salons/${salonId}/settings/crm_bot_settings`).get().catch(() => null);
      const botSettings = botSettingsDoc?.data() as any || { botEnabled: true, defaultMode: 'bot', requireManualAdd: false };

      // Se bot global estiver desligado, só registra a mensagem
      if (!botSettings.botEnabled) {
        return res.json({ ok: true });
      }

      // Verifica se humano assumiu controle (por cliente)
      const takeoverDoc = await adminDb.doc(`salons/${salonId}/human_takeover/${from}`).get().catch(() => null);
      if (takeoverDoc?.exists && takeoverDoc.data()?.active) return res.json({ ok: true });

      // Modo híbrido: se requireManualAdd=true, só responde se cliente já estiver no funil
      if (botSettings.requireManualAdd && isNew) {
        // Nova conversa → só registra, bot não responde (dona vai adicionar manualmente)
        return res.json({ ok: true });
      }

      // Verifica humanTakeover por cliente
      const clientData = crmSnap.empty ? null : crmSnap.docs[0].data() as any;
      if (clientData?.humanTakeover) return res.json({ ok: true });

      // Bot empático com IA responde (específico para o negócio da dona)
      if (text) {
        const isFirstMsg = isNew;
        // Se o bot principal (agendamento/IA) já respondeu, não manda segunda resposta
        const botReply = botReplied ? null : await handleCRMProBot(salonId, from, pushName, text, isFirstMsg).catch(() => null);
        if (botReply) {
          await sendWhatsApp(from, botReply, getCRMProInstance(salonId));
          if (crmRef) {
            await adminDb.collection(`salons/${salonId}/crm_clients/${crmRef.id}/messages`).add({
              text: botReply, from: 'bot', timestamp: Date.now(),
            });
          }
        }
        // Dispara mídia pré-definida se configurada
        await checkAndSendMediaTriggers(salonId, from, text, isFirstMsg);
      }

      return res.json({ ok: true });
    } catch (e: any) { console.error('[CRMPro Baileys webhook]', e.message); return res.json({ ok: true }); }
  });

  // ── CRM Pro: CRUD de mídias pré-definidas ────────────────────────────────
  // ── Bot settings: ON/OFF global + modo padrão ──────────────────────────────
  app.get("/api/crm-pro/bot-settings", authenticateUser, async (req: any, res) => {
    try {
      const salonId = req.user?.salonId;
      if (!salonId) return res.status(403).json({ error: 'Sem salonId' });
      const doc = await adminDb.doc(`salons/${salonId}/settings/crm_bot_settings`).get();
      const data = doc.data() || {};
      // crmProactiveEnabled controla birthday, reengajamento e follow-up proativos
      // Default true para não quebrar comportamento existente
      res.json({ botEnabled: true, defaultMode: 'bot', requireManualAdd: false, crmProactiveEnabled: true, ...data });
    } catch { res.status(500).json({ error: 'Erro' }); }
  });

  app.post("/api/crm-pro/bot-settings", authenticateUser, async (req: any, res) => {
    try {
      const salonId = req.user?.salonId;
      if (!salonId) return res.status(403).json({ error: 'Sem salonId' });
      await adminDb.doc(`salons/${salonId}/settings/crm_bot_settings`).set({
        ...req.body, updatedAt: Date.now(),
      }, { merge: true });
      res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Erro' }); }
  });

  app.get("/api/crm-pro/bot-context", authenticateUser, async (req: any, res) => {
    try {
      const salonId = req.user?.salonId;
      if (!salonId) return res.status(403).json({ error: 'Sem salonId' });
      const doc = await adminDb.doc(`salons/${salonId}/settings/crm_bot_context`).get();
      res.json({ context: doc.data() || {} });
    } catch (e) { res.status(500).json({ error: 'Erro ao buscar contexto' }); }
  });

  app.post("/api/crm-pro/bot-context", authenticateUser, async (req: any, res) => {
    try {
      const salonId = req.user?.salonId;
      if (!salonId) return res.status(403).json({ error: 'Sem salonId' });
      const { context } = req.body;
      await adminDb.doc(`salons/${salonId}/settings/crm_bot_context`).set({
        ...context, updatedAt: Date.now(),
      }, { merge: true });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Erro ao salvar contexto' }); }
  });

  app.get("/api/crm-pro/media", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const snap = await adminDb.collection(`salons/${profile.salonId}/crm_pro_media`)
        .orderBy('createdAt', 'desc').get();
      return res.json({ items: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm-pro/media", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { name, mediaType, mediaUrl, triggerType, keywords, caption, fileName } = req.body;
    if (!name || !mediaType || !mediaUrl || !triggerType) {
      return res.status(400).json({ error: 'name, mediaType, mediaUrl e triggerType são obrigatórios' });
    }
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const ref = await adminDb.collection(`salons/${profile.salonId}/crm_pro_media`).add({
        name, mediaType, mediaUrl, triggerType,
        keywords: keywords || [],
        caption: caption || '',
        fileName: fileName || '',
        active: true,
        createdAt: Date.now(),
      });
      return res.json({ id: ref.id });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/crm-pro/media/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_pro_media/${req.params.id}`).delete();
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/crm-pro/media/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_pro_media/${req.params.id}`).update({
        ...req.body, updatedAt: Date.now(),
      });
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });


  // ── CRM Pro: Quick Replies (Respostas Rápidas) ────────────────────────────
  app.get("/api/crm-pro/quick-replies", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const snap = await adminDb.collection(`salons/${profile.salonId}/crm_quick_replies`)
        .orderBy('createdAt', 'desc').get();
      return res.json({ items: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm-pro/quick-replies", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { title, text } = req.body;
    if (!title || !text) return res.status(400).json({ error: 'title e text obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const ref = await adminDb.collection(`salons/${profile.salonId}/crm_quick_replies`).add({
        title, text, createdAt: Date.now(),
      });
      return res.json({ id: ref.id });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/crm-pro/quick-replies/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_quick_replies/${req.params.id}`).delete();
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM Pro: Follow-up Sequences ─────────────────────────────────────────
  app.get("/api/crm-pro/followup", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const snap = await adminDb.collection(`salons/${profile.salonId}/crm_followup_sequences`)
        .orderBy('createdAt', 'desc').get();
      return res.json({ sequences: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm-pro/followup", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { name, triggerStatus, steps, active } = req.body;
    if (!name || !triggerStatus || !steps?.length) {
      return res.status(400).json({ error: 'name, triggerStatus e steps são obrigatórios' });
    }
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const ref = await adminDb.collection(`salons/${profile.salonId}/crm_followup_sequences`).add({
        name, triggerStatus, steps, active: active !== false, createdAt: Date.now(),
      });
      return res.json({ id: ref.id });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/crm-pro/followup/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_followup_sequences/${req.params.id}`).update({
        ...req.body, updatedAt: Date.now(),
      });
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/crm-pro/followup/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_followup_sequences/${req.params.id}`).delete();
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM Pro: Bulk Send (Disparo em Massa) ─────────────────────────────────
  app.post("/api/crm-pro/bulk-send", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { message, phones } = req.body;
    if (!message || !phones?.length) return res.status(400).json({ error: 'message e phones obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const salonId = profile.salonId;

      let sent = 0;
      let failed = 0;

      for (const phone of phones.slice(0, 200)) {
        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone) { failed++; continue; }
        try {
          let personalMsg = message;
          if (message.includes('{{nome}}')) {
            const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
              .where('phone', '==', cleanPhone).limit(1).get();
            const name = crmSnap.docs[0]?.data()?.name || 'você';
            personalMsg = message.replace(/\{\{nome\}\}/gi, name);
          }

          await sendWhatsApp(cleanPhone, personalMsg, `salon_${salonId}`);

          const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
            .where('phone', '==', cleanPhone).limit(1).get();
          if (!crmSnap.empty) {
            await adminDb.collection(`salons/${salonId}/crm_clients/${crmSnap.docs[0].id}/messages`).add({
              text: personalMsg, from: 'owner', timestamp: Date.now(),
            });
            await crmSnap.docs[0].ref.update({ lastContact: Date.now() });
          }

          sent++;
          await new Promise(r => setTimeout(r, 1500));
        } catch {
          failed++;
        }
      }

      return res.json({ ok: true, sent, failed, total: phones.length });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM Pro: Tasks (Tarefas e Lembretes) ─────────────────────────────────
  app.get("/api/crm-pro/tasks", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const snap = await adminDb.collection(`salons/${profile.salonId}/crm_tasks`)
        .orderBy('dueDate', 'asc').get();
      return res.json({ tasks: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm-pro/tasks", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    const { title, clientId, clientName, dueDate, done } = req.body;
    if (!title || !dueDate) return res.status(400).json({ error: 'title e dueDate obrigatórios' });
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const ref = await adminDb.collection(`salons/${profile.salonId}/crm_tasks`).add({
        title, clientId: clientId || null, clientName: clientName || null,
        dueDate, done: done || false, createdAt: Date.now(),
      });
      return res.json({ id: ref.id });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/crm-pro/tasks/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_tasks/${req.params.id}`).update({
        ...req.body, updatedAt: Date.now(),
      });
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/crm-pro/tasks/:id", authenticateUser, async (req, res) => {
    const requester = (req as any).user;
    try {
      const profile = await getRequestUserProfile(requester.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb.doc(`salons/${profile.salonId}/crm_tasks/${req.params.id}`).delete();
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM Pro: Post-Service Sequences ──────────────────────────────────────────
  app.get("/api/crm-pro/postservice", authenticateUser, async (req, res) => {
    try {
      const profile = await getRequestUserProfile((req as any).user.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const snap = await adminDb
        .collection(`salons/${profile.salonId}/crm_postservice_sequences`)
        .orderBy('createdAt', 'asc')
        .get();
      return res.json({ sequences: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/crm-pro/postservice", authenticateUser, async (req, res) => {
    try {
      const profile = await getRequestUserProfile((req as any).user.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const { name, delayDays, message, active } = req.body;
      const ref = await adminDb
        .collection(`salons/${profile.salonId}/crm_postservice_sequences`)
        .add({ name, delayDays: Number(delayDays), message, active: active !== false, createdAt: Date.now() });
      return res.json({ id: ref.id });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/crm-pro/postservice/:id", authenticateUser, async (req, res) => {
    try {
      const profile = await getRequestUserProfile((req as any).user.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb
        .doc(`salons/${profile.salonId}/crm_postservice_sequences/${req.params.id}`)
        .update({ ...req.body, updatedAt: Date.now() });
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/crm-pro/postservice/:id", authenticateUser, async (req, res) => {
    try {
      const profile = await getRequestUserProfile((req as any).user.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      await adminDb
        .doc(`salons/${profile.salonId}/crm_postservice_sequences/${req.params.id}`)
        .delete();
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── CRM Pro: Marcar serviço realizado hoje ────────────────────────────────────
  app.post("/api/crm-pro/mark-service", authenticateUser, async (req, res) => {
    try {
      const profile = await getRequestUserProfile((req as any).user.uid);
      if (!profile?.salonId) return res.status(403).json({ error: 'Não autorizado' });
      const { clientId } = req.body;
      if (!clientId) return res.status(400).json({ error: 'clientId obrigatório' });
      const now = Date.now();
      await adminDb
        .doc(`salons/${profile.salonId}/crm_clients/${clientId}`)
        .update({ lastServiceDate: now, updatedAt: now });
      await adminDb
        .collection(`salons/${profile.salonId}/crm_clients/${clientId}/notes`)
        .add({ text: '✂️ Serviço realizado — follow-ups pós-serviço ativados', type: 'service', createdAt: now });
      return res.json({ ok: true, lastServiceDate: now });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });
  app.post("/api/public/appointment/cancel", async (req, res) => {
    const { salonId, appointmentId, phone } = req.body;
    if (!salonId || !appointmentId || !phone) {
      return res.status(400).json({ error: 'salonId, appointmentId e phone são obrigatórios' });
    }
    try {
      const aptRef = adminDb.doc(`salons/${salonId}/appointments/${appointmentId}`);
      const aptDoc = await aptRef.get();
      if (!aptDoc.exists) return res.status(404).json({ error: 'Agendamento não encontrado' });

      const apt = aptDoc.data() as any;
      
      // Verifica se o phone bate com o agendamento (segurança básica)
      const cleanPhone = phone.replace(/\D/g, '');
      const aptPhone = (apt.customerPhone || '').replace(/\D/g, '');
      const phoneMatch = aptPhone.endsWith(cleanPhone) || cleanPhone.endsWith(aptPhone) ||
        aptPhone.slice(-11) === cleanPhone.slice(-11);
      
      if (!phoneMatch) {
        return res.status(403).json({ error: 'Telefone não confere com o agendamento' });
      }
      
      if (['CANCELLED', 'COMPLETED'].includes(apt.status)) {
        return res.status(400).json({ error: 'Agendamento já foi cancelado ou concluído' });
      }

      // Verifica se é futuro
      const aptDateTime = new Date(`${apt.date}T${apt.startTime}`);
      if (aptDateTime < new Date()) {
        return res.status(400).json({ error: 'Não é possível cancelar agendamentos passados' });
      }

      await aptRef.update({ 
        status: 'CANCELLED', 
        cancelledReason: 'Cancelado pelo cliente', 
        cancelledAt: Date.now(),
        updatedAt: Date.now() 
      });

      // Notifica fila de espera em cadeia
      notifyWaitlistChain(salonId, apt.date, apt.professionalId || '').catch(() => {});

      // Notifica dono
      const ownerPhone = await getOwnerNotificationPhone(salonId);
      if (ownerPhone) {
        const [y, m, d] = apt.date.split('-');
        const dateStr = `${d}/${m}/${y}`;
        await sendWhatsApp(ownerPhone, 
          `⚠️ *Agendamento cancelado pelo cliente*\n\nServiço: ${apt.serviceName}\nCliente: ${apt.clientName || apt.customerPhone}\nData: ${dateStr} às ${apt.startTime}`,
          `salon_${salonId}`
        ).catch(() => {});
      }

      return res.json({ ok: true });
    } catch (e: any) {
      console.error('[PublicCancel]', e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Salvar data de nascimento público (guest) ─────────────────────────────
  app.post("/api/public/client/birthday", async (req, res) => {
    const { salonId, phone, birthDate } = req.body;
    if (!salonId || !phone || !birthDate) return res.status(400).json({ error: 'Campos obrigatórios' });
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const crmSnap = await adminDb.collection(`salons/${salonId}/crm_clients`)
        .where('phone', '==', cleanPhone).limit(1).get();
      if (!crmSnap.empty) {
        await crmSnap.docs[0].ref.update({ birthDate, updatedAt: Date.now() });
      } else {
        await adminDb.collection(`salons/${salonId}/crm_clients`).add({
          salonId, phone: cleanPhone, birthDate, status: 'client',
          source: 'guest_appointment', createdAt: Date.now(), updatedAt: Date.now(),
        });
      }
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });


  // ── Waitlist: entrar na lista de espera ──────────────────────────────────
  app.post("/api/waitlist/join", async (req, res) => {
    const { salonId, name, phone, date, serviceId, serviceName, professionalId, professionalName, createdAt } = req.body;
    if (!salonId || !phone || !date) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      // Avoid duplicates for same person/date
      const existing = await adminDb.collection(`salons/${salonId}/waitlist`)
        .where('phone', '==', cleanPhone).where('date', '==', date).where('status', '==', 'waiting').limit(1).get();
      if (!existing.empty) {
        return res.json({ ok: true, alreadyInList: true });
      }
      // Count position in queue
      const countSnap = await adminDb.collection(`salons/${salonId}/waitlist`)
        .where('date', '==', date).where('status', '==', 'waiting').get();
      const position = countSnap.size + 1;
      
      await adminDb.collection(`salons/${salonId}/waitlist`).add({
        salonId, name, phone: cleanPhone, date, serviceId: serviceId || '',
        serviceName: serviceName || 'Qualquer serviço',
        professionalId: professionalId || '', professionalName: professionalName || '',
        status: 'waiting', position, createdAt: createdAt || Date.now(),
      });

      // Confirm to client via WhatsApp
      await sendWhatsApp(cleanPhone,
        `📋 *Você está na lista de espera!*\n\nSe abrir uma vaga para o dia ${date.split('-').reverse().join('/')}, você será o ${position}º a ser avisado! 😊`,
        `salon_${salonId}`
      ).catch(() => {});

      return res.json({ ok: true, position });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  // ── Waitlist: notificação em cadeia quando vaga abre ────────────────────
  // Chamado automaticamente quando agendamento é cancelado
  async function notifyWaitlistChain(salonId: string, date: string, professionalId: string): Promise<void> {
    try {
      const salonDoc = await adminDb.doc(`salons/${salonId}`).get();
      const slug = salonDoc.data()?.slug || salonId;
      const APP_URL_BASE = process.env.APP_URL || '';

      const waitSnap = await adminDb.collection(`salons/${salonId}/waitlist`)
        .where('date', '==', date).where('status', '==', 'waiting')
        .orderBy('position', 'asc').limit(1).get();

      if (waitSnap.empty) return;

      const firstDoc = waitSnap.docs[0];
      const first = firstDoc.data();
      const phone = first.phone.replace(/\D/g, '');
      if (!phone) return;

      // Mark as notified
      await firstDoc.ref.update({ status: 'notified', notifiedAt: Date.now() });

      // Send WhatsApp with booking link
      const bookingLink = `${APP_URL_BASE}/s/${slug}`;
      await sendWhatsApp(phone,
        `🎉 *Surgiu uma vaga!*\n\nUma vaga abriu para o dia *${date.split('-').reverse().join('/')}*!\n\n` +
        `👉 Corra agendar em: ${bookingLink}\n\n` +
        `⏰ Você tem *5 minutos* para agendar antes de passar para o próximo na fila.`,
        `salon_${salonId}`
      );

      // 5-minute timeout — if they don't book, notify next
      setTimeout(async () => {
        try {
          // Check if they actually booked
          const stillNotified = await firstDoc.ref.get();
          if (stillNotified.data()?.status === 'notified') {
            // Mark as expired and notify next
            await firstDoc.ref.update({ status: 'expired' });
            await notifyWaitlistChain(salonId, date, professionalId);
          }
        } catch { /* silencioso */ }
      }, 5 * 60 * 1000);

    } catch (e: any) {
      console.error('[WaitlistChain]', e.message);
    }
  }

  app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (filePath.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
        }
      }
    }));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);