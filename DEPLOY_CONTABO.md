# Deploy do Bella & Chic no VPS (Contabo)

> Guia reescrito a partir do código (o original se perdeu). Servidor: Ubuntu 22.04+, usuário root,
> projeto em `/root/bella-chic`, site na porta **3066**, serviço WhatsApp na **8082**.

## 1. Preparar o servidor (uma vez)
```bash
apt update && apt install -y nginx certbot python3-certbot-nginx python3 git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
npm install -g pm2
```

## 2. Enviar o projeto
No seu PC, dentro da pasta do projeto (sem `node_modules`):
```bash
scp -r "site plataforma" root@SEU_IP:/root/bella-chic
```
No servidor:
```bash
cd /root/bella-chic
cp .env.example .env && nano .env      # preencha as chaves (veja .env.example)
chmod +x start.sh
npm install
npm run build                           # gera ./dist (frontend)
cd whatsapp-service && npm install && cd ..
```

## 3. Subir com PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup                 # reinicia sozinho após reboot
pm2 logs bella-chic                     # ver logs
```
Processos: `bella-chic` (site + API, porta 3066) e `bella-wa` (WhatsApp/Baileys, porta 8082).

## 4. Nginx + HTTPS
Arquivo `/etc/nginx/sites-available/bella-chic`:
```nginx
server {
  listen 80;
  server_name bella-chic.duckdns.org;
  client_max_body_size 15m;
  location / {
    proxy_pass http://127.0.0.1:3066;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
ln -s /etc/nginx/sites-available/bella-chic /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d bella-chic.duckdns.org
```
**Não** exponha a porta 8082 (WhatsApp) na internet — ela só é usada pelo próprio servidor.

## 5. Firebase
- Cole `firestore.rules` em Firestore → Regras (ou `firebase deploy --only firestore:rules,firestore:indexes`).
- Índices: `firestore.indexes.json`.

## 6. Conectar o WhatsApp do salão
Painel do salão → Configurações → WhatsApp → escanear o QR Code (ou código de pareamento).
O QR é gerado pelo `bella-wa`; se não aparecer, veja `pm2 logs bella-wa`.

## 7. Atualizar depois
```bash
cd /root/bella-chic && npm install && npm run build && pm2 restart all
```

## Problemas comuns
- **Servidor não sobe / erro de chave Firebase:** confira `FIREBASE_PRIVATE_KEY` entre aspas, com `\n` literal.
- **Bot não responde:** `pm2 logs bella-wa` e `pm2 logs bella-chic`; confira se `WA_SERVICE_URL` e `MAIN_SERVER` estão certos.
- **Bot sem IA:** falta `GROQ_API_KEY` (usa respostas simples).
