# Recuperação — o que foi alterado (out/2026)

Base: `site_plataforma_1.zip` (v2, arquivos de até 25/05/2026).

## Corrigido
- **server.ts não iniciava** (erro de sintaxe no reengajamento de clientes inativos): trecho restaurado.
- **Agenda visual**: o recurso "Agendar com Procedimentos" estava colado fora do componente e quebrava a aba. Refeito (lista do dia + modal + criar/remover), usando os endpoints `/api/appointments/custom`.
- **Checkout** quebrava ao abrir (hook usava `address`/`settings` antes de declarar) e o subtotal chamava função inexistente.
- **Booking**: nome do profissional ia vazio (`name` → `displayName`).
- **SettingsPanel**: botão do bot de vendas chamava `loadSettings` inexistente.
- **AdminDashboard**: `bizLabel` fora de escopo no detalhe do pedido.
- **server.ts**: `salonName`, `text`, `salonSlug`, `instance` indefinidos; `loyaltySnap.exists()`; consulta Asaas inválida.
- Tipos/defaults faltando (`slotInterval`, `heroLayout`, `hasQuotes`, `hasCRMPro`, `sports`, etc.). `tsc --noEmit` = 0 erros; `vite build` OK.
- Criados: `src/components/ui/switch.tsx`, `src/vite-env.d.ts`.

## Bot de WhatsApp
- Evita **resposta dupla** (bot principal + bot CRM Pro) e mensagens duplicadas no histórico.
- Respeita "bot desligado" e **atendente humano assumiu** (painel CRM Pro) também no bot principal.
- **Agendamento automático**: revalida o horário antes de confirmar; considera duração real, intervalo configurado e agendamentos com procedimentos; atalho "quero X sexta às 14h" só vale se o horário estiver livre.
- "sim" só inicia agendamento logo após o bot oferecer (antes sequestrava a confirmação de lembrete).
- Link da anamnese enviado após agendar estava errado (404).
- Rota `/api/whatsapp/status/:salonId` criada (banner do CRM Pro mostrava sempre "desconectado").

## Arquivos criados/refeitos
`whatsapp-service/package.json`, `.env.example` completo, `ecosystem.config.cjs` (2 processos, sem chave fixa), `DEPLOY_CONTABO.md`.

## Pendências conhecidas
- Chaves (.env) precisam ser recriadas; o `.env` do zip tem valores antigos.
- Baileys: `package.json` do whatsapp-service fixa a série 6.x. Se mensagens de alguns números (@lid) não receberem resposta, teste a versão 7.
- `firebase-admin-key.json` e `.env` estão dentro do projeto: não compartilhe o zip.
