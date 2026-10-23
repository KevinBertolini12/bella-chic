// PM2 — dois processos: o site/API e o serviço de WhatsApp (Baileys).
// Subir:  pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'bella-chic',
      // start.sh carrega o .env (inclusive a chave PEM do Firebase) e inicia o tsx
      script: './start.sh',
      interpreter: 'bash',
      cwd: '/root/bella-chic',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'bella-wa',
      script: 'index.js',
      cwd: '/root/bella-chic/whatsapp-service',
      env: { WA_PORT: 8082, MAIN_SERVER: 'http://localhost:3066' },
      restart_delay: 3000,
    },
  ],
};
