# 🤖 Bella & Chic — WhatsApp Bot Completo

## Fluxo de Agendamento pelo Bot

```
Cliente manda "oi" / "quero agendar" / "1"
         │
         ▼
┌─────────────────────────────────────┐
│  MENU PRINCIPAL                      │
│  1️⃣ Agendar horário                 │
│  2️⃣ Ver serviços e preços           │
│  3️⃣ Horário de funcionamento        │
│  4️⃣ Endereço                        │
│  5️⃣ Falar com a equipe              │
└─────────────────────────────────────┘
         │ cliente escolhe "1" ou "quero agendar"
         ▼
┌─────────────────────────────────────┐
│  ESCOLHA DO SERVIÇO                  │
│  1️⃣ Corte — R$ 50 (30min)          │
│  2️⃣ Escova — R$ 80 (60min)         │
│  3️⃣ Coloração — R$ 120 (90min)     │
│  (lista dinâmica do Firestore)       │
└─────────────────────────────────────┘
         │ cliente digita "1", "corte", "quero fazer escova"
         ▼
┌─────────────────────────────────────┐
│  ESCOLHA DO PROFISSIONAL             │
│  (só aparece se tiver > 1 prof)     │
│  1️⃣ Ana Lima                        │
│  2️⃣ Carlos Silva                    │
└─────────────────────────────────────┘
         │ cliente escolhe
         ▼
┌─────────────────────────────────────┐
│  ESCOLHA DA DATA                     │
│  "Para qual data?"                   │
│  Aceita: amanhã, sexta, 15/01, etc. │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  HORÁRIOS DISPONÍVEIS               │
│  🕐 09:00 · 10:30 · 14:00 · 15:30  │
│  (busca Firestore em tempo real)    │
└─────────────────────────────────────┘
         │ cliente escolhe "10:30" ou "10h30"
         ▼
┌─────────────────────────────────────┐
│  COLETA O NOME                       │
│  "Qual é seu nome completo?"        │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  CONFIRMAÇÃO                         │
│  ✅ Confirmar agendamento?           │
│  👤 João Silva                      │
│  ✂️ Corte                           │
│  📅 17/01 às 10:30                  │
│  💰 R$ 50,00                        │
│  Responda SIM ou NÃO               │
└─────────────────────────────────────┘
         │ SIM
         ▼
┌─────────────────────────────────────┐
│  🎉 AGENDAMENTO CRIADO!             │
│  • Salvo no Firestore               │
│  • Cliente sincronizado no CRM      │
│  • Admin notificado via push        │
└─────────────────────────────────────┘
```

## Funcionalidades por Tipo de Bot

| Feature | Bot Simples | Bot Inteligente (Groq) |
|---------|-------------|----------------------|
| Menu por palavras-chave | ✅ | ✅ |
| **Agendamento completo** | ✅ | ✅ |
| Confirmar/cancelar consulta | ✅ | ✅ |
| Linguagem natural livre | ❌ | ✅ |
| Contexto de conversa | ❌ | ✅ (últimas 20 msgs) |
| Link anamnese automático | ✅ | ✅ |
| Bloqueio de grupos | ✅ | ✅ |

## Notificações Automáticas

### Para Clientes
- ✅ Lembrete D-1 via WhatsApp (8h)
- ✅ Confirmação com 2 cliques (Sim/Não)
- ✅ Push notification no app
- ✅ Email de lembrete
- ✅ Notificação de status (confirmado, cancelado, concluído)
- ✅ Pedido de avaliação pós-atendimento

### Para Profissionais
- ✅ **Agenda do dia** às 7h30 (novo!)
- ✅ **Lembrete de agendamento D-1** (novo!)
- ✅ Notificação de novo agendamento confirmado
- ✅ Push notification no painel

### Para o Dono/Salão
- ✅ **Resumo da agenda do dia** às 7h30 (novo!)
- ✅ Lembrete de pedido reservado >4h sem confirmar
- ✅ Push notification de novo agendamento

## Configuração Necessária

### .env
```bash
# Bot inteligente (opcional - sem isso usa bot simples)
GROQ_API_KEY=sua_chave_groq

# WhatsApp via Evolution API (obrigatório para envios)
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=sua-chave
EVOLUTION_INSTANCE=nome-instancia-global

# Para push notifications
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

### Por Profissional
Cadastre o **WhatsApp do profissional** no campo "WhatsApp (lembretes)" no formulário de profissional. Sem isso, ele não recebe a agenda do dia.

## Novas Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/whatsapp/send-agenda` | Dispara agenda do dia manualmente |
| POST | `/api/client/sync` | Sincroniza cliente no CRM por telefone |
| GET  | `/api/client/history?salonId=&phone=` | Histórico completo do cliente |
| POST | `/api/sms/send` | Envia mensagem pelo número do salão |

## Comportamento com Grupos

Mensagens de grupos WhatsApp são **completamente ignoradas** — o bot não lê nem responde grupos. Isso é feito verificando se o JID contém `@g.us`.
