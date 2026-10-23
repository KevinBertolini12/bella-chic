# Bella & Chic SaaS

Plataforma multi-tenant para salões de beleza e boutiques.
Stack: React + TypeScript + Vite + Express + Firebase + Stripe + Mercado Pago.

---

## Pré-requisitos

- Node.js 20+
- Conta Firebase (Firestore + Auth + Storage)
- Conta Stripe (assinaturas)
- Conta Mercado Pago (checkout da loja)

---

## Configuração local

### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha todas as variáveis no `.env`. Veja comentários no arquivo para saber onde obter cada uma.

### 2. Firebase — Regras do Firestore

No console do Firebase, vá em **Firestore → Regras** e cole o conteúdo de `firestore.rules`.

### 3. Instalar dependências e rodar

```bash
npm install
npm run dev
```

O servidor sobe em `http://localhost:3066` servindo tanto a API (`/api/*`) quanto o frontend React.

---

## Deploy em produção

### Opção A — Servidor VPS / Linux (recomendado para começar)

```bash
# 1. Clone o repositório no servidor
git clone <seu-repo> && cd bella-chic

# 2. Configure as variáveis
cp .env.example .env
nano .env   # preencha tudo

# 3. Instale dependências
npm install

# 4. Build do frontend
npm run build

# 5. Inicie com PM2 (reinicia automaticamente em caso de crash)
npm install -g pm2
pm2 start "npm run start" --name bella-chic
pm2 save
pm2 startup   # configura para iniciar com o sistema
```

> O servidor Express serve o `dist/` em produção automaticamente.

### Opção B — Docker

```bash
# Build passando as variáveis VITE_ como args
docker build \
  --build-arg VITE_FIREBASE_API_KEY=... \
  --build-arg VITE_FIREBASE_PROJECT_ID=... \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY=... \
  -t bella-chic .

# Run passando variáveis de runtime
docker run -p 3066:3066 \
  --env-file .env \
  bella-chic
```

### Opção C — Railway / Render / Fly.io

1. Conecte o repositório à plataforma.
2. Configure as variáveis de ambiente no painel da plataforma.
3. Defina o comando de build: `npm run build`
4. Defina o comando de start: `npm run start`
5. Porta: `3066`

> **Variáveis VITE_** precisam estar disponíveis no **build time**, não só no runtime. Configure-as como "Build Variables" na plataforma.

---

## Webhooks

### Stripe (assinaturas)
- URL: `https://seu-dominio.com/api/webhook`
- Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

### Mercado Pago (loja)
- URL: `https://seu-dominio.com/api/mp-webhook`
- Tipo: Notificações IPN / Webhooks → Pagamentos

---

## Primeiro acesso

1. Acesse `https://seu-dominio.com/login`
2. Faça login com o e-mail configurado em `SUPER_ADMIN_EMAIL`
3. Verifique o e-mail se necessário
4. Você será redirecionado para `/super-admin`
5. No painel Super Admin, use "Popular Dados" para criar os planos iniciais

---

## Estrutura de rotas

```
/                       → Landing page da plataforma
/login                  → Login / Cadastro
/cadastro-salao         → Onboarding de novo salão
/super-admin            → Painel da plataforma (SUPER_ADMIN)

/s/:slug/               → Home do salão
/s/:slug/servicos       → Página de serviços
/s/:slug/equipe         → Página da equipe
/s/:slug/loja           → Loja de produtos
/s/:slug/carrinho       → Carrinho
/s/:slug/checkout       → Checkout (Mercado Pago)
/s/:slug/agendamento    → Agendamento (sem login)
/s/:slug/sobre          → Sobre o salão
/s/:slug/contato        → Contato
/s/:slug/admin          → Painel admin do salão (SALON_ADMIN)
/s/:slug/profissional   → Painel do profissional (PROFESSIONAL)
/s/:slug/cliente        → Painel do cliente (CLIENT)
```