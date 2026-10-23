'use strict';

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const P = require('pino');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.WA_PORT || 8082;
const MAIN_SERVER = process.env.MAIN_SERVER || 'http://localhost:3066';
const SESSIONS_DIR = path.join(__dirname, 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ─── Armazena sockets e QR Codes por instância ──────────────────────────────
const sockets = {};    // instanceName → socket
const qrCodes = {};    // instanceName → base64 QR
const statuses = {};   // instanceName → 'connecting' | 'open' | 'close'

// ─── Logger silencioso ───────────────────────────────────────────────────────
const logger = P({ level: 'silent' });

// ─── Inicia uma instância Baileys ────────────────────────────────────────────
async function startInstance(instanceName, webhookUrl) {
  const sessionDir = path.join(SESSIONS_DIR, instanceName);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  statuses[instanceName] = 'connecting';

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ['Bella & Chic', 'Chrome', '120.0.0'],
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
  });

  sockets[instanceName] = sock;

  // ── QR Code ────────────────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Converte QR para base64 PNG usando qrcode
      try {
        const QRCode = require('qrcode');
        const base64 = await QRCode.toDataURL(qr);
        qrCodes[instanceName] = base64;
        statuses[instanceName] = 'qr';
        console.log(`[${instanceName}] QR Code gerado`);

        // Notifica o servidor principal
        axios.post(`${MAIN_SERVER}/api/whatsapp/internal/qr`, {
          instanceName,
          qrcode: base64,
        }).catch(() => {});
      } catch (e) {
        console.error(`[${instanceName}] Erro ao gerar QR:`, e.message);
      }
    }

    if (connection === 'open') {
      qrCodes[instanceName] = null;
      statuses[instanceName] = 'open';
      console.log(`[${instanceName}] ✅ Conectado!`);

      // Registra webhook
      if (webhookUrl) {
        axios.post(`${MAIN_SERVER}/api/whatsapp/internal/connected`, {
          instanceName,
          phone: sock.user?.id?.replace(/:[0-9]+@/, '@') || '',
        }).catch(() => {});
      }
    }

    if (connection === 'close') {
      statuses[instanceName] = 'close';
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[${instanceName}] Desconectado (${code}). Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => startInstance(instanceName, webhookUrl), 5000);
      } else {
        // Logout — apaga sessão
        delete sockets[instanceName];
        delete qrCodes[instanceName];
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
  });

  // ── Salva credenciais ──────────────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Mensagens recebidas ────────────────────────────────────────────────────
  // Registra quando esta instância foi iniciada
  const instanceStartTime = Date.now();

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'notify' = nova mensagem real | 'append' = histórico → SEMPRE ignora append
    if (type !== 'notify') {
      console.log(`[${instanceName}] Ignorando mensagens tipo '${type}' (histórico)`);
      return;
    }

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid || '';
      if (remoteJid.includes('@g.us')) continue; // ignora grupos

      // ── Filtro de timestamp: rejeita mensagens antigas ─────────────────────
      const msgTsRaw = msg.messageTimestamp;
      if (!msgTsRaw) {
        console.log(`[${instanceName}] Msg sem timestamp ignorada (histórica?)`);
        continue;
      }
      // Converte para ms se vier em segundos
      const msgTsMs = Number(msgTsRaw) > 1e12 ? Number(msgTsRaw) : Number(msgTsRaw) * 1000;

      // Rejeita se a mensagem é anterior ao start desta instância (com 30s de margem)
      if (msgTsMs < instanceStartTime - 30000) {
        console.log(`[${instanceName}] Msg histórica ignorada: ${new Date(msgTsMs).toISOString()} (instância iniciou ${new Date(instanceStartTime).toISOString()})`);
        continue;
      }

      // Rejeita se a mensagem tem mais de 2 minutos
      if (Date.now() - msgTsMs > 2 * 60 * 1000) {
        console.log(`[${instanceName}] Msg muito antiga ignorada (${Math.round((Date.now() - msgTsMs)/1000)}s atrás)`);
        continue;
      }

      // Extrai número real — Baileys já resolve @lid internamente
      const phone = remoteJid
        .replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '')
        .replace(/:[0-9]+$/, '')
        .replace(/\D/g, '');

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      const pushName = msg.pushName || '';

      if (text) console.log(`[${instanceName}] Msg de ${phone}: "${text}"`);

      // Repassa para o servidor principal
      try {
        await axios.post(`${MAIN_SERVER}/api/whatsapp/webhook`, {
          event: 'messages.upsert',
          instance: instanceName,
          data: {
            key: msg.key,
            pushName,
            message: msg.message,
            messageType: Object.keys(msg.message || {})[0] || 'conversation',
            messageTimestamp: msg.messageTimestamp,
            from: phone,
            remoteJid,
            text,
          },
          sender: sock.user?.id || '',
        });
      } catch (e) {
        console.error(`[${instanceName}] Erro ao repassar mensagem:`, e.message);
      }
    }
  });

  return sock;
}

// ─── Carrega instâncias existentes na inicialização ──────────────────────────
async function loadExistingSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const dirs = fs.readdirSync(SESSIONS_DIR);
  for (const dir of dirs) {
    const sessionPath = path.join(SESSIONS_DIR, dir);
    if (fs.statSync(sessionPath).isDirectory()) {
      console.log(`[Boot] Carregando sessão: ${dir}`);
      startInstance(dir, null).catch(console.error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /instance/create — Cria e inicia uma instância (ou reconecta se já existir)
app.post('/instance/create', async (req, res) => {
  const { instanceName, webhookUrl } = req.body;
  if (!instanceName) return res.status(400).json({ error: 'instanceName obrigatório' });

  // Se já está open, só retorna
  if (sockets[instanceName] && statuses[instanceName] === 'open') {
    return res.json({ status: 'open', instanceName });
  }

  // Se existe mas não está open, reinicia
  if (sockets[instanceName]) {
    try { sockets[instanceName].ws?.close(); } catch {}
    delete sockets[instanceName];
  }

  try {
    await startInstance(instanceName, webhookUrl);
    res.json({ status: 'connecting', instanceName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /instance/qr/:instanceName — Retorna o QR Code atual
app.get('/instance/qr/:instanceName', (req, res) => {
  const { instanceName } = req.params;
  const qr = qrCodes[instanceName];
  const status = statuses[instanceName] || 'not_found';

  if (qr) {
    return res.json({ qrcode: qr, status });
  }
  res.json({ qrcode: null, status });
});

// GET /instance/status/:instanceName — Status da instância
app.get('/instance/status/:instanceName', (req, res) => {
  const { instanceName } = req.params;
  res.json({
    instanceName,
    status: statuses[instanceName] || 'not_found',
    connected: statuses[instanceName] === 'open',
  });
});

// POST /instance/pairing-code/:instanceName — Gera pairing code
// CHAVE: requestPairingCode deve ser chamado IMEDIATAMENTE após criar o socket
// antes de qualquer evento de conexão — especialmente antes do QR aparecer
app.post('/instance/pairing-code/:instanceName', async (req, res) => {
  const { instanceName } = req.params;
  const { phoneNumber, webhookUrl } = req.body;

  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber obrigatório' });

  const phoneClean = phoneNumber.replace(/\D/g, '');
  if (phoneClean.length < 10) return res.status(400).json({ error: 'Número inválido' });

  const phoneFormatted = phoneClean.startsWith('55') ? phoneClean : '55' + phoneClean;

  try {
    // Para e limpa qualquer instância existente
    if (sockets[instanceName]) {
      try { sockets[instanceName].ws?.close(); } catch {}
      delete sockets[instanceName];
    }
    delete qrCodes[instanceName];
    delete statuses[instanceName];

    // Apaga sessão para forçar novo registro limpo
    const sessionDir = path.join(SESSIONS_DIR, instanceName);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds: _saveCreds } = await useMultiFileAuthState(sessionDir);
    const saveCreds = async () => {
      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
      return _saveCreds();
    };
    const { version } = await fetchLatestBaileysVersion();

    statuses[instanceName] = 'connecting';

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ['Ubuntu', 'Chrome', '120.0.0'],
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
    });

    sockets[instanceName] = sock;
    sock.ev.on('creds.update', saveCreds);

    // ── PASSO CRÍTICO: solicita o pairing code IMEDIATAMENTE ──────────────
    // Deve ser chamado antes dos eventos de conexão, enquanto creds.registered = false
    let code = null;
    let pairingError = null;

    // Pequena pausa mínima para WebSocket iniciar a conexão TCP
    await new Promise(r => setTimeout(r, 1500));

    // Tenta gerar o código — deve ser quando !sock.authState.creds.registered
    if (!sock.authState.creds.registered) {
      try {
        code = await sock.requestPairingCode(phoneFormatted);
        console.log(`[PairingCode] ✅ ${instanceName}: ${code}`);
      } catch (e) {
        pairingError = e.message;
        console.error(`[PairingCode] Erro:`, e.message);
        // Tenta sem o 55 se tinha
        if (phoneFormatted !== phoneClean) {
          try {
            code = await sock.requestPairingCode(phoneClean);
            console.log(`[PairingCode] ✅ (sem DDI) ${instanceName}: ${code}`);
          } catch (e2) {
            console.error(`[PairingCode] Erro (sem DDI):`, e2.message);
          }
        }
      }
    } else {
      console.log(`[PairingCode] Sessão já registrada — reconectando`);
    }

    if (!code) {
      try { sock.ws?.close(); } catch {}
      delete sockets[instanceName];
      return res.status(500).json({
        error: `Não foi possível gerar o código: ${pairingError || 'Tente desconectar e usar o QR Code'}`,
      });
    }

    // Formata o código XXXX-XXXX
    const clean = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const display = clean.length === 8 ? clean.slice(0,4) + '-' + clean.slice(4) : code;

    // Configura handlers para quando conectar após o usuário digitar o código
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        statuses[instanceName] = 'open';
        qrCodes[instanceName] = null;
        console.log(`[${instanceName}] ✅ Conectado via pairing code!`);
        const wh = webhookUrl || `${MAIN_SERVER}/api/whatsapp/webhook`;
        axios.post(wh.replace('/api/whatsapp/webhook', '/api/whatsapp/internal/connected'),
          { instanceName }).catch(() => {});
      }
      if (connection === 'close') {
        statuses[instanceName] = 'close';
        const code2 = lastDisconnect?.error?.output?.statusCode;
        console.log(`[${instanceName}] Desconectado (${code2})`);
        if (code2 !== DisconnectReason.loggedOut) {
          setTimeout(() => startInstance(instanceName, webhookUrl || null), 5000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const remoteJid = msg.key.remoteJid || '';
        if (remoteJid.includes('@g.us')) continue;
        const remoteJidAlt = msg.key.remoteJidAlt || '';
        const phone = (remoteJidAlt || remoteJid)
          .replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '').replace(/:[0-9]+$/, '').replace(/\D/g, '');
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (!text) continue;
        const wh = webhookUrl || `${MAIN_SERVER}/api/whatsapp/webhook`;
        try {
          await axios.post(wh, {
            event: 'messages.upsert', instance: instanceName,
            data: {
              key: { ...msg.key, remoteJidAlt },
              pushName: msg.pushName, message: msg.message,
              messageType: Object.keys(msg.message || {})[0] || 'conversation',
              messageTimestamp: msg.messageTimestamp,
              from: phone, remoteJid, text,
            },
            sender: sock.user?.id || '',
          });
        } catch (e) { console.error(`[${instanceName}] Erro webhook:`, e.message); }
      }
    });

    return res.json({ code: display, pairingCode: display });

  } catch (e) {
    console.error('[PairingCode] Erro geral:', e.message);
    return res.status(500).json({ error: 'Erro: ' + e.message });
  }
});

// POST /message/send — Envia mensagem
app.post('/message/send', async (req, res) => {
  const { instanceName, number, text } = req.body;
  const sock = sockets[instanceName];

  if (!sock) return res.status(404).json({ error: 'Instância não encontrada ou desconectada' });
  if (!number || !text) return res.status(400).json({ error: 'number e text obrigatórios' });

  try {
    // Formata o JID — Baileys resolve @lid automaticamente
    let jid = number;
    if (!jid.includes('@')) {
      const num = jid.replace(/\D/g, '');
      jid = `${num}@s.whatsapp.net`;
    }

    await sock.sendMessage(jid, { text });
    res.json({ status: 'sent', to: jid });
  } catch (e) {
    console.error(`[${instanceName}] Erro ao enviar:`, e.message);
    res.status(500).json({ error: e.message });
  }
});


// POST /message/send-media — Envia imagem, vídeo ou documento por URL
app.post('/message/send-media', async (req, res) => {
  const { instanceName, number, mediaUrl, mediaType, caption, fileName } = req.body;
  const sock = sockets[instanceName];
  if (!sock || statuses[instanceName] !== 'open') return res.status(404).json({ error: 'Instância não conectada' });
  if (!number || !mediaUrl || !mediaType) return res.status(400).json({ error: 'number, mediaUrl e mediaType obrigatórios' });
  try {
    const jid = `${number.replace(/\D/g, '')}@s.whatsapp.net`;
    let msg;
    if (mediaType === 'image') msg = { image: { url: mediaUrl }, caption: caption || '' };
    else if (mediaType === 'video') msg = { video: { url: mediaUrl }, caption: caption || '' };
    else if (mediaType === 'document') msg = { document: { url: mediaUrl }, mimetype: 'application/octet-stream', fileName: fileName || 'arquivo' };
    else return res.status(400).json({ error: `mediaType inválido: ${mediaType}` });
    await sock.sendMessage(jid, msg);
    console.log(`[${instanceName}] ✅ Mídia (${mediaType}) → ${number}`);
    res.json({ status: 'sent', to: jid, mediaType });
  } catch (e) {
    console.error(`[${instanceName}] Erro ao enviar mídia:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /message/send-audio — Envia áudio como nota de voz (PTT) por URL
app.post('/message/send-audio', async (req, res) => {
  const { instanceName, number, audioUrl } = req.body;
  const sock = sockets[instanceName];
  if (!sock || statuses[instanceName] !== 'open') return res.status(404).json({ error: 'Instância não conectada' });
  if (!number || !audioUrl) return res.status(400).json({ error: 'number e audioUrl obrigatórios' });
  try {
    const jid = `${number.replace(/\D/g, '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: true });
    console.log(`[${instanceName}] ✅ Áudio PTT → ${number}`);
    res.json({ status: 'sent', to: jid });
  } catch (e) {
    console.error(`[${instanceName}] Erro ao enviar áudio:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /instance/list — Lista todas as instâncias
app.get('/instance/list', (req, res) => {
  res.json({
    instances: Object.keys(statuses).map(name => ({
      instanceName: name, status: statuses[name], connected: statuses[name] === 'open',
    })),
  });
});

// POST /instance/disconnect — Desconecta, apaga sessão e permite reconectar com outro número
app.post('/instance/disconnect', async (req, res) => {
  const { instanceName } = req.body;
  const sock = sockets[instanceName];

  // Fecha conexão sem fazer logout oficial (logout bloqueia reconexão)
  if (sock) {
    try { sock.ws?.close(); } catch {}
    try { sock.end(undefined); } catch {}
    delete sockets[instanceName];
  }
  delete qrCodes[instanceName];
  delete statuses[instanceName];

  // Apaga sessão para permitir conectar com outro número
  const sessionDir = path.join(SESSIONS_DIR, instanceName);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }

  console.log(`[${instanceName}] Desconectado e sessão limpa.`);
  res.json({ status: 'disconnected', instanceName });
});

// GET /health
app.get('/health', (req, res) => {
  const instances = Object.keys(statuses).map(name => ({
    name,
    status: statuses[name],
  }));
  res.json({ ok: true, instances });
});

// ─── Inicia servidor ─────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[WhatsApp Service] Rodando na porta ${PORT}`);
  await loadExistingSessions();
});
