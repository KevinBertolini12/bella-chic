import React, { useState, useEffect } from 'react';
import { auth } from '../../firebase';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import {
  Bot, MessageSquare, Bell, Clock, X, Save, RefreshCw,
  ChevronDown, ChevronUp, Volume2, UserCheck, Heart, Repeat,
} from 'lucide-react';

interface BotConfig {
  botEnabled: boolean;
  greetingText: string;
  greetingTextReturning: string;
  menuText: string;
  offlineMessage: string;
  humanKeyword: string;
  reminderMessage: string;
  reminderHour: number;
  confirmationMessage: string;
  cancellationMessage: string;
  audioReplyMessage: string;
  fallbackMessage: string;
  birthdayMessage: string;
  reengagementMessage: string;
  followUpMessage: string;
  humanMaxAttempts: number;
  agendaHour: number;
}

const DEFAULTS: BotConfig = {
  botEnabled: true,
  greetingText:
    '{{saudacao}}! {{emoji}} Seja bem-vindo ao *{{salao}}*!\n\nComo posso te ajudar hoje?',
  greetingTextReturning:
    '{{saudacao}}, {{nome}}! 😊 Que bom ter você de volta ao *{{salao}}*!\n\nComo posso te ajudar?',
  menuText:
    '1️⃣ Agendar horário\n2️⃣ Ver serviços e preços\n3️⃣ Horário de funcionamento\n4️⃣ Endereço\n5️⃣ Falar com a equipe\n6️⃣ Meus agendamentos',
  offlineMessage:
    'Olá! No momento estamos fora do horário de atendimento. Entraremos em contato em breve! 😊',
  humanKeyword: 'humano',
  reminderMessage:
    'Olá {{nome}}! 👋 Lembrando que você tem um agendamento amanhã:\n\n✂️ Serviço: {{servico}}\n👤 Profissional: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nTe esperamos! 😊',
  reminderHour: 8,
  confirmationMessage:
    '✅ *Agendamento confirmado!*\n\n👤 Nome: {{nome}}\n✂️ Serviço: {{servico}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n👤 Profissional: {{profissional}}\n💰 Valor: R$ {{valor}}\n\nTe esperamos! 😊',
  cancellationMessage:
    '❌ Seu agendamento foi *cancelado* conforme solicitado.\n\nQualquer dúvida, é só chamar! 😊',
  audioReplyMessage:
    '😊 Oi! No momento não consigo ouvir áudios. Por favor, *escreva sua mensagem* que te respondo na hora!',
  fallbackMessage:
    'Hmm, não entendi bem. 🤔\n\nDigite *menu* para ver as opções disponíveis ou *{{humanKeyword}}* para falar com nossa equipe.',
  birthdayMessage:
    '🎂 *Feliz aniversário, {{nome}}!* 🎉\n\nToda a equipe do *{{salao}}* deseja um dia incrível para você!\n\nVenha comemorar com a gente — temos uma surpresa especial esperando! 💖',
  reengagementMessage:
    'Oi, {{nome}}! 😊\n\nFaz um tempinho que não te vemos no *{{salao}}* e sentimos sua falta!\n\nQue tal agendar um horário? ✨\n🔗 {{link}}',
  followUpMessage:
    'Olá, {{nome}}! 💫\n\nEsperamos que tenha ficado satisfeito(a) com seu atendimento no *{{salao}}*!\n\nQue tal deixar uma avaliaçãozinha? É rapidinho e nos ajuda muito 🙏\n🔗 {{link_avaliacao}}',
  humanMaxAttempts: 3,
  agendaHour: 7,
};

const VARS: Record<keyof BotConfig, string[]> = {
  botEnabled: [],
  greetingText:           ['{{saudacao}}', '{{salao}}', '{{emoji}}'],
  greetingTextReturning:  ['{{saudacao}}', '{{nome}}', '{{salao}}'],
  menuText:               [],
  offlineMessage:         ['{{salao}}'],
  humanKeyword:           [],
  reminderMessage:        ['{{nome}}', '{{servico}}', '{{profissional}}', '{{data}}', '{{horario}}', '{{salao}}'],
  reminderHour:           [],
  confirmationMessage:    ['{{nome}}', '{{servico}}', '{{profissional}}', '{{data}}', '{{horario}}', '{{valor}}'],
  cancellationMessage:    ['{{nome}}', '{{salao}}'],
  audioReplyMessage:      [],
  fallbackMessage:        ['{{humanKeyword}}'],
  birthdayMessage:        ['{{nome}}', '{{salao}}'],
  reengagementMessage:    ['{{nome}}', '{{salao}}', '{{link}}'],
  followUpMessage:        ['{{nome}}', '{{salao}}', '{{link_avaliacao}}'],
  humanMaxAttempts:       [],
  agendaHour:             [],
};

const getToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve('');

interface Props { salonId: string; }

export const BotConfigTab: React.FC<Props> = ({ salonId }) => {
  const [config, setConfig] = useState<BotConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('greeting');

  useEffect(() => {
    const load = async () => {
      try {
        const t = await getToken();
        const r = await fetch('/api/bot/config', { headers: { Authorization: `Bearer ${t}` } });
        if (r.ok) {
          const d = await r.json();
          setConfig(c => ({ ...c, ...d }));
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [salonId]);

  const save = async () => {
    setSaving(true);
    try {
      const t = await getToken();
      const r = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(config),
      });
      if (!r.ok) throw new Error('Erro ao salvar');
      toast.success('✅ Configurações do bot salvas!');
    } catch { toast.error('Erro ao salvar.'); }
    setSaving(false);
  };

  const reset = (key: keyof BotConfig) => {
    setConfig(c => ({ ...c, [key]: DEFAULTS[key] }));
    toast.info('Mensagem restaurada para o padrão.');
  };

  const patch = (key: keyof BotConfig, value: any) =>
    setConfig(c => ({ ...c, [key]: value }));

  // ── Section accordion ──────────────────────────────────────────────────────
  const Section: React.FC<{
    id: string; icon: React.ReactNode; title: string; desc: string; children: React.ReactNode;
  }> = ({ id, icon, title, desc, children }) => {
    const open = expandedSection === id;
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <button
          onClick={() => setExpandedSection(open ? null : id)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
            <div>
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {open && <div className="px-5 pb-5 border-t pt-4 space-y-4">{children}</div>}
      </div>
    );
  };

  // ── Textarea + variáveis ───────────────────────────────────────────────────
  const MsgField: React.FC<{
    label: string; field: keyof BotConfig; rows?: number; hint?: string;
  }> = ({ label, field, rows = 4, hint }) => {
    const vars = VARS[field] || [];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">{label}</Label>
          <button
            onClick={() => reset(field)}
            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
            <RefreshCw className="h-2.5 w-2.5" /> Restaurar padrão
          </button>
        </div>
        <Textarea
          rows={rows}
          value={config[field] as string}
          onChange={e => patch(field, e.target.value)}
          className="font-mono text-sm resize-y" />
        {vars.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {vars.map(v => (
              <button
                key={v}
                onClick={() => patch(field, (config[field] as string) + v)}
                className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors font-mono">
                {v}
              </button>
            ))}
          </div>
        )}
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    );
  };

  // ── Hour selector ──────────────────────────────────────────────────────────
  const HourSelector: React.FC<{
    label: string; field: 'reminderHour' | 'agendaHour'; hint?: string;
  }> = ({ label, field, hint }) => {
    const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    return (
      <div className="space-y-2">
        <Label className="text-xs font-semibold">{label}</Label>
        <div className="flex flex-wrap gap-2">
          {hours.map(h => (
            <button
              key={h}
              onClick={() => patch(field, h)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                config[field] === h
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:border-primary text-muted-foreground'
              }`}>
              {String(h).padStart(2, '0')}:00
            </button>
          ))}
        </div>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    );
  };

  if (loading) return (
    <div className="py-12 text-center text-muted-foreground">
      <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p>Carregando configurações do bot...</p>
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Configuração do Bot
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Personalize todas as mensagens enviadas automaticamente pelo WhatsApp.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? 'Salvando...' : 'Salvar todas'}
        </Button>
      </div>

      {/* Bot on/off */}
      <div className="flex items-center justify-between gap-3 rounded-xl border p-4 bg-card">
        <div>
          <p className="font-semibold text-sm">Bot ativo</p>
          <p className="text-xs text-muted-foreground">
            Quando desativado, o bot não responde nenhuma mensagem.
          </p>
        </div>
        <Switch checked={config.botEnabled} onCheckedChange={v => patch('botEnabled', v)} />
      </div>

      {/* ── Boas-vindas ─────────────────────────────────────────────────────── */}
      <Section id="greeting" icon={<MessageSquare className="h-4 w-4" />}
        title="Boas-vindas" desc="Mensagens para cliente novo e cliente recorrente">
        <MsgField label="Cliente novo (primeira mensagem)" field="greetingText" rows={4}
          hint="Use {{saudacao}} para 'Bom dia/tarde/noite', {{salao}} para o nome do negócio, {{emoji}} para o ícone do tipo." />
        <MsgField label="Cliente recorrente (já conhecido)" field="greetingTextReturning" rows={4}
          hint="Enviada quando o número já está no CRM. Use {{nome}} para o primeiro nome do cliente." />
        <MsgField label="Menu de opções" field="menuText" rows={7}
          hint="As opções do menu. Use emojis numerados (1️⃣, 2️⃣...) para manter o padrão." />
      </Section>

      {/* ── Fora do horário ─────────────────────────────────────────────────── */}
      <Section id="offline" icon={<Clock className="h-4 w-4" />}
        title="Fora do horário" desc="Enviada quando o cliente escreve fora do horário de funcionamento">
        <MsgField label="Mensagem fora do horário" field="offlineMessage" rows={3} />
      </Section>

      {/* ── Agendamentos ────────────────────────────────────────────────────── */}
      <Section id="appointments" icon={<Bell className="h-4 w-4" />}
        title="Agendamentos" desc="Confirmação, lembrete D-1 e cancelamento">
        <MsgField label="Confirmação de agendamento" field="confirmationMessage" rows={8}
          hint="Enviada imediatamente após o cliente confirmar o agendamento." />

        <div className="rounded-xl border p-4 space-y-4 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lembrete D-1</p>
          <MsgField label="Texto do lembrete" field="reminderMessage" rows={7}
            hint="Enviada automaticamente 1 dia antes do horário agendado." />
          <HourSelector label="Horário de envio do lembrete" field="reminderHour"
            hint="A que horas o lembrete será disparado no dia anterior ao agendamento." />
        </div>

        <MsgField label="Cancelamento" field="cancellationMessage" rows={3}
          hint="Enviada quando o agendamento é cancelado." />
      </Section>

      {/* ── Resumo da agenda (profissionais) ────────────────────────────────── */}
      <Section id="agenda" icon={<UserCheck className="h-4 w-4" />}
        title="Resumo da agenda" desc="Horário de envio do resumo diário para profissionais e dono">
        <HourSelector label="Horário do resumo diário da agenda" field="agendaHour"
          hint="O resumo da agenda do dia é enviado a este horário para profissionais e administradores." />
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
          💡 O texto do resumo é gerado automaticamente com os agendamentos do dia — não é editável aqui.
        </div>
      </Section>

      {/* ── Bot CRM proativo ────────────────────────────────────────────────── */}
      <Section id="proactive" icon={<Heart className="h-4 w-4" />}
        title="Mensagens proativas (CRM)" desc="Aniversário, reengajamento e follow-up pós-atendimento">
        <MsgField label="🎂 Mensagem de aniversário" field="birthdayMessage" rows={6}
          hint="Enviada automaticamente no aniversário do cliente. Use {{nome}} e {{salao}}." />
        <MsgField label="💬 Reengajamento (clientes sem visita há 45+ dias)" field="reengagementMessage" rows={6}
          hint="Use {{link}} para incluir o link de agendamento do seu negócio." />
        <MsgField label="⭐ Follow-up pós-atendimento (pedido de avaliação)" field="followUpMessage" rows={6}
          hint="Enviada 1 dia após o atendimento ser marcado como concluído. Use {{link_avaliacao}}." />
      </Section>

      {/* ── Respostas automáticas ────────────────────────────────────────────── */}
      <Section id="auto" icon={<Repeat className="h-4 w-4" />}
        title="Respostas automáticas" desc="Áudio, mensagem não entendida e transferência para humano">
        <MsgField label="Resposta para mensagem de áudio" field="audioReplyMessage" rows={3}
          hint="Enviada quando o cliente manda um áudio. O bot não consegue ouvir — oriente a digitar." />
        <MsgField label="Mensagem não entendida (fallback)" field="fallbackMessage" rows={4}
          hint="Enviada quando o bot não reconhece o que o cliente digitou. Use {{humanKeyword}} para mostrar a palavra-chave de atendimento humano." />

        <div className="space-y-2">
          <Label className="text-xs font-semibold">Máximo de tentativas antes de transferir</Label>
          <div className="flex flex-wrap gap-2">
            {[2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => patch('humanMaxAttempts', n)}
                className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
                  config.humanMaxAttempts === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:border-primary text-muted-foreground'
                }`}>
                {n}x
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Após {config.humanMaxAttempts} mensagens não reconhecidas seguidas, o bot transfere para atendimento humano automaticamente.
          </p>
        </div>
      </Section>

      {/* ── Palavra-chave humano ─────────────────────────────────────────────── */}
      <Section id="human" icon={<X className="h-4 w-4" />}
        title="Transferência para humano" desc="Palavra-chave que pausa o bot e aciona atendimento manual">
        <div className="space-y-1.5">
          <Label>Palavra-chave</Label>
          <Input
            value={config.humanKeyword}
            onChange={e => patch('humanKeyword', e.target.value)}
            placeholder="ex: humano, atendente, pessoa" />
          <p className="text-[10px] text-muted-foreground">
            Quando o cliente digitar esta palavra, o bot para de responder e o atendimento fica aguardando você.
          </p>
        </div>
      </Section>

      {/* ── Áudio info ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <Volume2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          <strong>Áudios:</strong> o bot detecta automaticamente mensagens de voz e responde com a mensagem configurada acima, orientando o cliente a digitar.
          O controle desse comportamento está na seção "Respostas automáticas".
        </p>
      </div>

      {/* Save button bottom */}
      <Button onClick={save} disabled={saving} className="w-full">
        <Save className="h-4 w-4 mr-1.5" />
        {saving ? 'Salvando...' : 'Salvar configurações'}
      </Button>
    </div>
  );
};
