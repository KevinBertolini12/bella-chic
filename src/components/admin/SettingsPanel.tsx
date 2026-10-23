import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSalon } from '../../contexts/SalonContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { FileUpload } from './FileUpload';
import { toast } from 'sonner';
import { Save, Palette, Globe, Home, Briefcase, Share2, FileText, Loader2, Clock, Bell, Smartphone, CheckCircle2, XCircle, RefreshCw, Wifi, WifiOff, QrCode, CreditCard } from 'lucide-react';
import { SalonSettings, BrandingSettings, AppearanceSettings, BusinessSettings, SocialSettings, CMSSettings } from '../../types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

// ─── Hook utilitário: estado local sincronizado com settings ─────────────────

function useLocalSection<T>(source: T | null | undefined): [T | null, React.Dispatch<React.SetStateAction<T | null>>, (patch: Partial<T>) => void] {
  const [local, setLocal] = useState<T | null>(source ?? null);

  useEffect(() => {
    if (source) setLocal(JSON.parse(JSON.stringify(source)));
  }, [source]);

  const patch = (changes: Partial<T>) =>
    setLocal((prev) => prev ? { ...prev, ...changes } : prev);

  return [local, setLocal, patch];
}

// ─── Mensagem padrão de lembrete ─────────────────────────────────────────────

const REMINDER_TEMPLATES: Record<string, { label: string; emoji: string; msg: string }> = {
  beauty: {
    label: 'Salão de Beleza',
    emoji: '✂️',
    msg: `Olá {{nome}}! 👋\n\nLembrando que você tem um agendamento amanhã:\n\n✂️ Serviço: {{servico}}\n👤 Profissional: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nEstamos te esperando! Até lá 😊`,
  },
  health: {
    label: 'Clínica / Saúde',
    emoji: '🏥',
    msg: `Olá {{nome}}! 👋\n\nLembrando que você tem uma consulta agendada amanhã:\n\n🩺 Procedimento: {{servico}}\n👨‍⚕️ Profissional: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nPor favor, chegue com 10 minutos de antecedência. Até lá! 😊`,
  },
  fitness: {
    label: 'Academia / Estúdio',
    emoji: '💪',
    msg: `Olá {{nome}}! 💪\n\nSua aula está confirmada para amanhã:\n\n🏋️ Aula: {{servico}}\n👤 Instrutor: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nNão esqueça de se hidratar bem! Até lá 🚀`,
  },
  services: {
    label: 'Serviços Gerais',
    emoji: '🔧',
    msg: `Olá {{nome}}! 👋\n\nLembrando do seu agendamento para amanhã:\n\n🔧 Serviço: {{servico}}\n👤 Responsável: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nQualquer dúvida, pode nos chamar. Até lá! 😊`,
  },
  sports: {
    label: 'Esporte / Lazer',
    emoji: '⚽',
    msg: `Olá {{nome}}! 🏃\n\nSeu horário está reservado para amanhã:\n\n⚽ Atividade: {{servico}}\n👤 Responsável: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nBora que vai ser incrível! Até lá 🎉`,
  },
};

const DEFAULT_REMINDER_MSG = REMINDER_TEMPLATES.beauty.msg;

// ─── Componente ──────────────────────────────────────────────────────────────

export const SettingsPanel = () => {
  const { settings, updateSection, refreshSettings } = useSettings();
  const { profile, user } = useAuth();
  const { salon, plan } = useSalon();
  const businessType = (salon as any)?.businessType || 'beauty';
  const bizName = { beauty: 'estabelecimento', health: 'clínica', fitness: 'estúdio', services: 'negócio', sports: 'espaço' }[businessType] || 'negócio';
  const bizNameCap = bizName.charAt(0).toUpperCase() + bizName.slice(1);
  const salonId = profile?.salonId;
  const [saving, setSaving] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);

  // Pega token Firebase para chamadas autenticadas ao servidor
  const getToken = async () => {
    if (!user) throw new Error('Não autenticado');
    return user.getIdToken();
  };

  // Estado local por seção
  const [branding,    , patchBranding]    = useLocalSection<BrandingSettings>(settings?.branding);
  const [appearance,  , patchAppearance]  = useLocalSection<AppearanceSettings>(settings?.appearance);
  const [business,    , patchBusiness]    = useLocalSection<BusinessSettings>(settings?.business);
  const [intervalWarning, setIntervalWarning] = React.useState<number | null>(null);
  const [reallocating, setReallocating] = React.useState(false);
  const [social,      , patchSocial]      = useLocalSection<SocialSettings>(settings?.social);
  const [cms,         , patchCms]         = useLocalSection<CMSSettings>(settings?.cms);
  const [homeSettings,, patchHome]        = useLocalSection<SalonSettings['home']>(settings?.home);

  // ─── Estado para loading de CEP e CNPJ ──────────────────────────────────
  const [loadingCep,  setLoadingCep]  = React.useState(false);
  const [loadingCnpj, setLoadingCnpj] = React.useState(false);

  // ─── Busca CEP via ViaCEP (gratuito, sem chave) ───────────────────────────
  const fetchCep = async (rawCep: string) => {
    const cep = rawCep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error('CEP não encontrado.'); return; }
      patchBusiness({
        address:      data.logradouro || '',
        neighborhood: data.bairro     || '',
        city:         data.localidade || '',
        state:        data.uf         || '',
      });
      toast.success('Endereço preenchido automaticamente!');
    } catch {
      toast.error('Erro ao buscar CEP. Tente novamente.');
    } finally {
      setLoadingCep(false);
    }
  };

  // ─── Busca CNPJ via ReceitaWS (gratuito, sem chave) ──────────────────────
  const fetchCnpj = async (rawCnpj: string) => {
    const cnpj = rawCnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) return;
    setLoadingCnpj(true);
    try {
      const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
      const data = await res.json();
      if (data.status === 'ERROR') { toast.error('CNPJ não encontrado ou inválido.'); return; }
      // Preenche nome do negócio (fantasia se existir, razão social caso contrário)
      const nome = data.fantasia && data.fantasia.trim() ? data.fantasia : data.nome;
      const updates: Partial<typeof business> = {};
      if (data.logradouro)  updates.address      = `${data.logradouro}${data.numero ? '' : ''}`;
      if (data.numero)      updates.number       = data.numero;
      if (data.bairro)      updates.neighborhood = data.bairro;
      if (data.municipio)   updates.city         = data.municipio;
      if (data.uf)          updates.state        = data.uf;
      if (data.cep)         updates.zipCode      = data.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2');
      if (data.telefone)    updates.phone        = data.telefone;
      if (data.email)       updates.email        = data.email;
      patchBusiness(updates as any);
      toast.success(`Dados de "${nome}" preenchidos!`);
    } catch {
      toast.error('Erro ao consultar CNPJ. Tente novamente.');
    } finally {
      setLoadingCnpj(false);
    }
  };

  // ─── Estado do WhatsApp ──────────────────────────────────────────────────
  type WaStatus = 'idle' | 'loading' | 'qrcode' | 'pairing' | 'connected' | 'error';
  const [waStatus, setWaStatus]   = useState<WaStatus>('idle');
  const [waQrCode, setWaQrCode]   = useState<string | null>(null);
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);
  const [waPhone, setWaPhone]     = useState('');
  const [connectMode, setConnectMode] = useState<'qr' | 'phone'>('qr');
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Estado do toggle do Bot CRM Proativo ────────────────────────────────
  const [crmProactiveEnabled, setCrmProactiveEnabled] = useState<boolean>(true);
  const [savingBotToggle, setSavingBotToggle] = useState(false);

  // Carrega configuração do bot ao montar
  useEffect(() => {
    if (!user) return;
    getToken().then(token =>
      fetch('/api/crm-pro/bot-settings', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          if (typeof data.crmProactiveEnabled === 'boolean') {
            setCrmProactiveEnabled(data.crmProactiveEnabled);
          }
        })
        .catch(() => {})
    );
  }, [user]);

  const handleBotProactiveToggle = async (enabled: boolean) => {
    setSavingBotToggle(true);
    try {
      const token = await getToken();
      await fetch('/api/crm-pro/bot-settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ crmProactiveEnabled: enabled }),
      });
      setCrmProactiveEnabled(enabled);
      toast.success(enabled
        ? '✅ Bot CRM proativo ativado — aniversários, reengajamento e follow-ups voltarão a rodar.'
        : '🔕 Bot CRM proativo desativado — apenas o bot de agendamento continuará funcionando.'
      );
    } catch {
      toast.error('Erro ao salvar configuração do bot.');
    } finally {
      setSavingBotToggle(false);
    }
  };

  // Verifica status ao abrir a aba
  const checkWaStatus = async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/whatsapp/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.connected) {
        setWaStatus('connected');
        setWaQrCode(null);
        stopPolling();
        // Garante que o webhook está registrado
        const tok = await getToken();
        fetch('/api/whatsapp/register-webhook', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ salonId }),
        }).catch(console.error);
      } else if (waStatus === 'qrcode') {
        // ainda aguardando escaneamento — mantém
      }
    } catch {
      // silencioso
    }
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => stopPolling(), []);

  const handleWaConnect = async () => {
    setWaStatus('loading');
    setWaQrCode(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao conectar');

      if (data.status === 'open') {
        setWaStatus('connected');
        // Registra webhook do bot automaticamente
        fetch('/api/whatsapp/register-webhook', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ salonId }),
        }).catch(console.error);
      } else if (data.qrcode) {
        setWaStatus('qrcode');
        setWaQrCode(data.qrcode);
        // Fica verificando a cada 3s se o usuário escaneou
        stopPolling();
        pollRef.current = setInterval(checkWaStatus, 3000);
      } else {
        setWaStatus('error');
        toast.error('Não foi possível gerar o QR Code. Verifique a Evolution API.');
      }
    } catch (err: any) {
      setWaStatus('error');
      toast.error(err.message || 'Erro ao conectar WhatsApp');
    }
  };

  const handleWaPairingCode = async () => {
    const phone = waPhone.replace(/\D/g, '');
    if (phone.length < 10) { toast.error('Digite o número completo com DDD (ex: 5511999999999)'); return; }
    setWaStatus('loading');
    setWaPairingCode(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/whatsapp/pairing-code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar código');
      if (data.code) {
        setWaPairingCode(data.code);
        setWaStatus('pairing');
        // Poll para verificar se conectou
        stopPolling();
        pollRef.current = setInterval(checkWaStatus, 3000);
      } else {
        throw new Error('Código não gerado');
      }
    } catch (err: any) {
      setWaStatus('error');
      toast.error(err.message || 'Erro ao gerar código de pareamento');
    }
  };

  const handleWaDisconnect = async () => {
    stopPolling();
    try {
      const token = await getToken();
      await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setWaStatus('idle');
      setWaQrCode(null);
      toast.success('WhatsApp desconectado.');
    } catch {
      toast.error('Erro ao desconectar.');
    }
  };

  // Verifica status ao montar o componente
  useEffect(() => { checkWaStatus(); }, []);
  const [reminderMsg, setReminderMsg] = useState(DEFAULT_REMINDER_MSG);
  const [loadingNotif, setLoadingNotif] = useState(true);

  // Carrega a mensagem de lembrete salva no Firestore
  useEffect(() => {
    if (!salonId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `salons/${salonId}/settings`, 'notifications'));
        if (snap.exists()) {
          const data = snap.data() as any;
          setReminderMsg(data.whatsappReminderMessage || DEFAULT_REMINDER_MSG);
        }
      } catch {
        // sem dados ainda, usa o padrão
      } finally {
        setLoadingNotif(false);
      }
    })();
  }, [salonId]);

  const handleSave = async (section: keyof SalonSettings, data: any) => {
    if (!salonId) { toast.error('ID do salão não encontrado.'); return; }
    setSaving(true);
    try {
      await updateSection(section, data);
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  // Salva a mensagem de lembrete diretamente no path que o server.ts lê
  const handleSaveNotifications = async () => {
    if (!salonId) { toast.error('ID do salão não encontrado.'); return; }
    setSavingNotif(true);
    try {
      await setDoc(
        doc(db, `salons/${salonId}/settings`, 'notifications'),
        { whatsappReminderMessage: reminderMsg },
        { merge: true }
      );
      toast.success('Mensagem de lembrete salva!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar a mensagem.');
    } finally {
      setSavingNotif(false);
    }
  };

  if (!settings || !branding || !appearance || !business || !social || !cms || !homeSettings) return null;

  const SaveButton = ({ section, data }: { section: keyof SalonSettings; data: any }) => (
    <div className="flex justify-end pt-4">
      <Button onClick={() => handleSave(section, data)} disabled={saving}>
        {saving
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
          : <><Save className="mr-2 h-4 w-4" />Salvar</>}
      </Button>
    </div>
  );

  const DAYS: { key: string; label: string }[] = [
    { key: 'monday',    label: 'Segunda-feira' },
    { key: 'tuesday',   label: 'Terça-feira' },
    { key: 'wednesday', label: 'Quarta-feira' },
    { key: 'thursday',  label: 'Quinta-feira' },
    { key: 'friday',    label: 'Sexta-feira' },
    { key: 'saturday',  label: 'Sábado' },
    { key: 'sunday',    label: 'Domingo' },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground">Personalize a identidade visual e as informações do seu {bizName}.</p>
      </div>

      <Tabs defaultValue="branding" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1 rounded-lg">
          <TabsTrigger value="branding" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            Marca
          </TabsTrigger>
          <TabsTrigger value="appearance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            Visual
          </TabsTrigger>
          <TabsTrigger value="home" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            Home
          </TabsTrigger>
          <TabsTrigger value="business" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            Negócio
          </TabsTrigger>
          <TabsTrigger value="social" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            Social
          </TabsTrigger>
          <TabsTrigger value="cms" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            CMS
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            Avisos
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="pix" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
            PIX
          </TabsTrigger>
        </TabsList>

        {/* Branding */}
        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>Identidade da Marca</CardTitle>
              <CardDescription>Nome, logo e descrições do {bizNameCap}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome do {bizNameCap}</Label>
                  <Input value={branding.name} onChange={(e) => patchBranding({ name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Slogan</Label>
                  <Input value={branding.slogan} onChange={(e) => patchBranding({ slogan: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Nome no Header</Label>
                  <Input value={branding.headerName} onChange={(e) => patchBranding({ headerName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Nome no Footer</Label>
                  <Input value={branding.footerName} onChange={(e) => patchBranding({ footerName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição Curta (Footer)</Label>
                <Input value={branding.shortDescription} onChange={(e) => patchBranding({ shortDescription: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descrição Completa (Sobre)</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={branding.fullDescription}
                  onChange={(e) => patchBranding({ fullDescription: e.target.value })}
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <FileUpload label="Logo Principal" path="branding" currentUrl={branding.logoURL}
                  onUploadComplete={(url) => patchBranding({ logoURL: url })} />
                <FileUpload label="Favicon" path="branding" currentUrl={branding.faviconURL}
                  onUploadComplete={(url) => patchBranding({ faviconURL: url })} />
              </div>
              <SaveButton section="branding" data={branding} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aparência */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Identidade Visual</CardTitle>
              <CardDescription>
                Cores e estilos globais do site.{' '}
                <a
                  href="https://htmlcolorcodes.com/color-chart/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline hover:opacity-80"
                >
                  🎨 Ver tabela de cores com códigos
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Preview ao vivo das cores */}
              <div className="rounded-xl border p-4 bg-muted/30 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview ao vivo</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {(['primaryColor','secondaryColor','accentColor','backgroundColor','textColor','buttonColor'] as const).map(key => (
                    <div key={key} className="flex items-center gap-1.5">
                      <div className="h-6 w-6 rounded-full border shadow-sm"
                        style={{ backgroundColor: (appearance[key] as string) || '#ccc' }} />
                      <span className="text-[10px] text-muted-foreground">{(appearance[key] as string) || '—'}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg p-3 flex items-center justify-between"
                  style={{ backgroundColor: appearance.backgroundColor || '#fff', color: appearance.textColor || '#000' }}>
                  <span className="text-sm font-medium">Exemplo de texto</span>
                  <button className="px-3 py-1 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: appearance.buttonColor || appearance.primaryColor || '#e11d48' }}>
                    Botão
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {([
                  { label: 'Cor Principal',    key: 'primaryColor' },
                  { label: 'Cor Secundária',   key: 'secondaryColor' },
                  { label: 'Cor de Destaque',  key: 'accentColor' },
                  { label: 'Cor de Fundo',     key: 'backgroundColor' },
                  { label: 'Cor do Texto',     key: 'textColor' },
                  { label: 'Cor dos Botões',   key: 'buttonColor' },
                ] as { label: string; key: keyof AppearanceSettings }[]).map(({ label, key }) => {
                  const val = (appearance[key] as string) || '';
                  // Valida hex — só aceita #RGB ou #RRGGBB
                  const isValidHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val);
                  const handleTextChange = (v: string) => {
                    // Normaliza: adiciona # se esquecer
                    const normalized = v.startsWith('#') ? v : v ? `#${v}` : v;
                    patchAppearance({ [key]: normalized } as any);
                  };
                  return (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <div className="flex gap-2">
                        <Input type="color" className="h-10 w-12 cursor-pointer p-1 flex-shrink-0"
                          value={isValidHex ? val : '#cccccc'}
                          onChange={(e) => patchAppearance({ [key]: e.target.value } as any)} />
                        <div className="flex-1 space-y-0.5">
                          <Input value={val}
                            onChange={(e) => handleTextChange(e.target.value)}
                            placeholder="#000000"
                            className={!isValidHex && val ? 'border-red-400 focus-visible:ring-red-400' : ''} />
                          {!isValidHex && val && (
                            <p className="text-[10px] text-red-500">Formato inválido. Use #RGB ou #RRGGBB</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Raio de Borda</Label>
                  <Input value={appearance.borderRadius}
                    onChange={(e) => patchAppearance({ borderRadius: e.target.value })}
                    placeholder="0.5rem" />
                </div>
                <div className="space-y-2">
                  <Label>Opacidade do Overlay Hero (0–1)</Label>
                  <Input type="number" step="0.1" min="0" max="1"
                    value={appearance.heroOverlayOpacity}
                    onChange={(e) => patchAppearance({ heroOverlayOpacity: parseFloat(e.target.value) })} />
                </div>
              </div>
              <SaveButton section="appearance" data={appearance} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Home */}
        <TabsContent value="home">
          <Card>
            <CardHeader>
              <CardTitle>Conteúdo da Home</CardTitle>
              <CardDescription>Banner principal e seção de boutique.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 border-b pb-6">
                <h3 className="font-semibold">Hero (Banner Principal)</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Título Principal</Label>
                    <Input value={homeSettings.hero.title}
                      onChange={(e) => patchHome({ hero: { ...homeSettings.hero, title: e.target.value } })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Subtítulo</Label>
                    <Input value={homeSettings.hero.subtitle}
                      onChange={(e) => patchHome({ hero: { ...homeSettings.hero, subtitle: e.target.value } })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto do Botão 1</Label>
                    <Input value={homeSettings.hero.button1Text}
                      onChange={(e) => patchHome({ hero: { ...homeSettings.hero, button1Text: e.target.value } })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto do Botão 2</Label>
                    <Input value={homeSettings.hero.button2Text}
                      onChange={(e) => patchHome({ hero: { ...homeSettings.hero, button2Text: e.target.value } })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={homeSettings.hero.description}
                    onChange={(e) => patchHome({ hero: { ...homeSettings.hero, description: e.target.value } })} />
                </div>
                <div className="space-y-2">
                  <Label>Layout do Hero</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={homeSettings.hero.heroLayout || 'background'}
                    onChange={(e) => patchHome({ hero: { ...homeSettings.hero, heroLayout: e.target.value as 'background' | 'split' } })}
                  >
                    <option value="background">Imagem de fundo (padrão)</option>
                    <option value="split">Imagem à direita, texto à esquerda</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    "Imagem à direita" fica melhor com fotos verticais. No celular a foto aparece em cima.
                  </p>
                </div>
                <FileUpload label="Imagem do Banner" path="home" currentUrl={homeSettings.hero.imageURL}
                  onUploadComplete={(url) => patchHome({ hero: { ...homeSettings.hero, imageURL: url } })} />
              </div>

              {/* Diferenciais / Benefits */}
              <div className="space-y-4">
                <h3 className="font-semibold">Diferenciais (cards da home)</h3>
                <p className="text-xs text-muted-foreground">Edite os 4 cards que aparecem abaixo do banner principal.</p>
                <div className="space-y-3">
                  {(homeSettings.benefits || []).map((b, i) => (
                    <div key={i} className="rounded-xl border p-4 space-y-2 bg-muted/30">
                      <p className="text-xs font-semibold text-muted-foreground">Card {i + 1}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Título</label>
                          <input
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                            value={b.title}
                            onChange={(e) => {
                              const updated = [...homeSettings.benefits];
                              updated[i] = { ...updated[i], title: e.target.value };
                              patchHome({ benefits: updated });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Descrição</label>
                          <input
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                            value={b.description}
                            onChange={(e) => {
                              const updated = [...homeSettings.benefits];
                              updated[i] = { ...updated[i], description: e.target.value };
                              patchHome({ benefits: updated });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Seção Boutique</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input value={homeSettings.shopCTA.title}
                      onChange={(e) => patchHome({ shopCTA: { ...homeSettings.shopCTA, title: e.target.value } })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto do Botão</Label>
                    <Input value={homeSettings.shopCTA.buttonText}
                      onChange={(e) => patchHome({ shopCTA: { ...homeSettings.shopCTA, buttonText: e.target.value } })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={homeSettings.shopCTA.description}
                    onChange={(e) => patchHome({ shopCTA: { ...homeSettings.shopCTA, description: e.target.value } })} />
                </div>
                <FileUpload label="Imagem da Boutique" path="home" currentUrl={homeSettings.shopCTA.imageURL}
                  onUploadComplete={(url) => patchHome({ shopCTA: { ...homeSettings.shopCTA, imageURL: url } })} />
              </div>

              <SaveButton section="home" data={homeSettings} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Negócio */}
        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Negócio</CardTitle>
              <CardDescription>Contato, endereço e horários de funcionamento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Contato */}
              <div className="space-y-4">
                <h3 className="font-semibold">Contato</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {([
                    { label: 'Telefone',  key: 'phone' },
                    { label: 'WhatsApp do salão (número do chip conectado)', key: 'whatsapp' },
                    { label: 'E-mail',    key: 'email' },
                  ] as { label: string; key: keyof BusinessSettings }[]).map(({ label, key }) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <Input value={business[key] as string}
                        onChange={(e) => patchBusiness({ [key]: e.target.value } as any)} />
                    </div>
                  ))}

                  {/* CNPJ com busca automática */}
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <div className="flex gap-2">
                      <Input
                        value={business.cnpj || ''}
                        placeholder="00.000.000/0001-00"
                        onChange={(e) => patchBusiness({ cnpj: e.target.value })}
                        onBlur={(e) => fetchCnpj(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={loadingCnpj}
                        onClick={() => fetchCnpj(business.cnpj || '')}
                        className="shrink-0 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                        title="Preencher dados pelo CNPJ"
                      >
                        {loadingCnpj ? '...' : '🔍'}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">Digite o CNPJ e os dados serão preenchidos automaticamente.</p>
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">Endereço</h3>
                <p className="text-xs text-muted-foreground -mt-2">Digite o CEP para preencher automaticamente.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* CEP com busca automática */}
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <div className="flex gap-2">
                      <Input
                        value={business.zipCode || ''}
                        placeholder="00000-000"
                        maxLength={9}
                        onChange={(e) => {
                          // Formata enquanto digita: 00000-000
                          const v = e.target.value.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9);
                          patchBusiness({ zipCode: v });
                          // Dispara busca automaticamente quando CEP completo (9 chars com máscara)
                          if (v.replace(/\D/g, '').length === 8) {
                            fetchCep(v);
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value.replace(/\D/g, '').length === 8) {
                            fetchCep(e.target.value);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={loadingCep}
                        onClick={() => fetchCep(business.zipCode || '')}
                        className="shrink-0 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                        title="Buscar endereço pelo CEP"
                      >
                        {loadingCep ? '...' : '🔍'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input value={business.number || ''}
                      onChange={(e) => patchBusiness({ number: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Rua / Avenida</Label>
                    <Input value={business.address}
                      onChange={(e) => patchBusiness({ address: e.target.value })} />
                  </div>
                  {([
                    { label: 'Bairro',  key: 'neighborhood' },
                    { label: 'Cidade',  key: 'city' },
                    { label: 'Estado',  key: 'state' },
                  ] as { label: string; key: keyof BusinessSettings }[]).map(({ label, key }) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <Input value={business[key] as string}
                        onChange={(e) => patchBusiness({ [key]: e.target.value } as any)} />
                    </div>
                  ))}
                </div>

                {/* Mini preview do mapa */}
                {business?.address && business?.city && (
                  <div className="mt-2 overflow-hidden rounded-xl border shadow-sm">
                    <iframe
                      title="Prévia da localização"
                      width="100%"
                      height="200"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(
                        [business.address, business.number, business.neighborhood, business.city, business.state]
                          .filter(Boolean).join(', ')
                      )}&output=embed`}
                    />
                    <p className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/50">
                      📍 Prévia de como o mapa aparecerá para seus clientes
                    </p>
                  </div>
                )}
              </div>

              {/* Entrega */}
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Entrega</h3>
                    <p className="text-xs text-muted-foreground">Habilite se você faz entregas dos produtos</p>
                  </div>
                  <button type="button"
                    onClick={() => patchBusiness({ allowDelivery: !(business.allowDelivery ?? true) })}
                    className={`relative h-6 w-11 rounded-full transition-colors ${(business.allowDelivery ?? true) ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${(business.allowDelivery ?? true) ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {(business.allowDelivery ?? true) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Taxa de Frete (R$)</Label>
                      <Input type="number" min="0" step="0.5"
                        value={business.shippingFee}
                        onChange={(e) => patchBusiness({ shippingFee: parseFloat(e.target.value) || 0 })} />
                      <p className="text-xs text-muted-foreground">Cobrado por pedido. Use 0 para frete grátis.</p>
                    </div>

                    {/* Zona de entrega */}
                    <div className="space-y-2 md:col-span-2">
                      <Label>Zona de entrega</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {([
                          { value: 'local', label: '📍 Só na cidade', desc: 'Motoboy ou entrega própria' },
                          { value: 'national', label: '📦 Todo o Brasil', desc: 'Calcula frete pelos Correios' },
                          { value: 'fixed', label: '💰 Taxa fixa', desc: 'Você define o valor' },
                        ] as { value: string; label: string; desc: string }[]).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => patchBusiness({ deliveryZone: opt.value as any })}
                            className={`text-left rounded-xl border p-3 transition-all ${(business.deliveryZone || 'fixed') === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                          >
                            <p className="font-semibold text-sm">{opt.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* CEP de origem — só para Correios */}
                    {(business.deliveryZone || 'fixed') === 'national' && (
                      <div className="space-y-2 md:col-span-2">
                        <Label>CEP de origem (seu CEP para calcular frete)</Label>
                        <Input
                          value={business.cepOrigem || ''}
                          placeholder="00000-000"
                          maxLength={9}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                            const fmt = v.length > 5 ? v.slice(0,5) + '-' + v.slice(5) : v;
                            patchBusiness({ cepOrigem: fmt });
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          O sistema vai calcular automaticamente PAC e SEDEX para o CEP do cliente.
                        </p>
                      </div>
                    )}

                    {/* Peso médio — para cálculo Correios */}
                    {(business.deliveryZone || 'fixed') === 'national' && (
                      <div className="space-y-2">
                        <Label>Peso médio dos produtos (kg)</Label>
                        <Input
                          type="number" min={0.1} step={0.1}
                          value={business.avgWeightKg || 0.5}
                          onChange={(e) => patchBusiness({ avgWeightKg: parseFloat(e.target.value) || 0.5 })}
                        />
                      </div>
                    )}

                  {/* Bot de Vendas */}
                  <div className="flex items-center justify-between rounded-xl border bg-slate-50/50 p-4 mt-2">
                    <div className="flex-1 mr-4">
                      <p className="font-semibold text-sm flex items-center gap-2">
                        🤖 Bot de Vendas no WhatsApp
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Plano Completo / Loja</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Quando ativado, o bot pode mostrar o catálogo, adicionar itens ao carrinho, gerar PIX e confirmar pagamento automaticamente pelo WhatsApp.
                      </p>
                    </div>
                    <button
                      onClick={() => patchBusiness({ botSalesEnabled: !(business.botSalesEnabled ?? false) })}
                      className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${business.botSalesEnabled ? 'bg-green-500' : 'bg-slate-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${business.botSalesEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                    <div className="space-y-2">
                      <Label>Permitir Retirada no Local</Label>
                      <div className="flex items-center gap-2 pt-2">
                        <input type="checkbox" id="allowPickup" className="h-4 w-4 accent-primary"
                          checked={business.allowPickup}
                          onChange={(e) => patchBusiness({ allowPickup: e.target.checked })} />
                        <label htmlFor="allowPickup" className="text-sm">Habilitar opção de retirada</label>
                      </div>
                    </div>
                    {business.allowPickup && (
                      <div className="space-y-2 md:col-span-2">
                        <Label>Mensagem de Retirada</Label>
                        <Input value={business.pickupMessage}
                          onChange={(e) => patchBusiness({ pickupMessage: e.target.value })}
                          placeholder="Ex: Retire na loja de seg a sex das 9h às 18h" />
                      </div>
                    )}
                  </div>
                )}

                {!(business.allowDelivery ?? true) && (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    🚫 Entrega desabilitada — clientes só poderão escolher retirada no local.
                  </div>
                )}
              </div>

              {/* Horários */}
              {/* Intervalo de agendamento */}
              <div className="space-y-2 border-t pt-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Clock className="h-4 w-4" /> Intervalo entre Horários
                </h3>
                <p className="text-sm text-muted-foreground">
                  Define o espaçamento entre os slots disponíveis na agenda de agendamentos.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 20, 25, 30, 35, 45, 50, 55, 60].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => {
                        if (min !== (business.slotInterval || 10)) {
                          setIntervalWarning(min);
                        }
                      }}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        (business.slotInterval || 10) === min
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background hover:border-primary'
                      }`}
                    >
                      {min} min
                    </button>
                  ))}

                  {/* Warning dialog when changing interval */}
                  {intervalWarning !== null && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                      onClick={() => setIntervalWarning(null)}>
                      <div className="bg-background rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                            <Clock className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold">Alterar intervalo para {intervalWarning} min?</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Agendamentos futuros que não se encaixam no novo intervalo serão 
                              <strong> realocados automaticamente</strong> para o horário disponível mais próximo.
                            </p>
                            <p className="text-sm text-muted-foreground mt-2">
                              Nenhum agendamento será apagado — apenas ajustado.
                            </p>
                          </div>
                        </div>
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                          ⚠️ Avise seus clientes caso o horário deles seja alterado.
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
                            onClick={() => setIntervalWarning(null)}>
                            Cancelar
                          </button>
                          <button
                            disabled={reallocating}
                            className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                            onClick={async () => {
                              const newInterval = intervalWarning;
                              patchBusiness({ slotInterval: newInterval });
                              setReallocating(true);
                              try {
                                const { auth } = await import('../../firebase');
                                const token = await auth.currentUser?.getIdToken();
                                if (token && salon?.id) {
                                  await fetch('/api/appointments/reallocate', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({
                                      salonId: salon.id,
                                      newInterval,
                                    }),
                                  });
                                }
                              } catch (e) {
                                console.error('[reallocate]', e);
                              } finally {
                                setReallocating(false);
                                setIntervalWarning(null);
                              }
                            }}>
                            {reallocating ? 'Realocando...' : 'Confirmar e realocar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Clock className="h-4 w-4" /> Horários de Funcionamento
                </h3>
                <div className="space-y-3">
                  {DAYS.map(({ key, label }) => {
                    const day = business.workingHours?.[key] || { open: '09:00', close: '18:00', closed: false };
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                        <div className="w-36 text-sm font-medium">{label}</div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4 accent-destructive"
                            checked={day.closed}
                            onChange={(e) => patchBusiness({
                              workingHours: {
                                ...business.workingHours,
                                [key]: { ...day, closed: e.target.checked },
                              },
                            })} />
                          <span className="text-xs text-muted-foreground">Fechado</span>
                        </div>
                        {!day.closed && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Abre</span>
                              <Input type="time" className="h-8 w-28 text-sm"
                                value={day.open}
                                onChange={(e) => patchBusiness({
                                  workingHours: {
                                    ...business.workingHours,
                                    [key]: { ...day, open: e.target.value },
                                  },
                                })} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Fecha</span>
                              <Input type="time" className="h-8 w-28 text-sm"
                                value={day.close}
                                onChange={(e) => patchBusiness({
                                  workingHours: {
                                    ...business.workingHours,
                                    [key]: { ...day, close: e.target.value },
                                  },
                                })} />
                            </div>
                            {/* Almoço — opcional */}
                            <div className="flex items-center gap-1 ml-1 border-l pl-3">
                              <span className="text-xs text-muted-foreground">🍽️ Almoço:</span>
                              <Input type="time" className="h-8 w-24 text-sm"
                                placeholder="--:--"
                                value={day.lunchStart || ''}
                                onChange={(e) => patchBusiness({
                                  workingHours: {
                                    ...business.workingHours,
                                    [key]: { ...day, lunchStart: e.target.value || undefined },
                                  },
                                })} />
                              <span className="text-xs text-muted-foreground">até</span>
                              <Input type="time" className="h-8 w-24 text-sm"
                                placeholder="--:--"
                                value={day.lunchEnd || ''}
                                onChange={(e) => patchBusiness({
                                  workingHours: {
                                    ...business.workingHours,
                                    [key]: { ...day, lunchEnd: e.target.value || undefined },
                                  },
                                })} />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Atendimento a domicílio */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">Atendimento a Domicílio</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="offerHomeService"
                        className="h-4 w-4 accent-primary"
                        checked={business.offerHomeService}
                        onChange={(e) => patchBusiness({ offerHomeService: e.target.checked })}
                      />
                      <label htmlFor="offerHomeService" className="text-sm">
                        Oferecer atendimento a domicílio
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Se ativado, os clientes poderão escolher se querem atendimento no {bizName} ou em casa.
                    </p>
                  </div>
                  {business.offerHomeService && (
                    <div className="space-y-2">
                      <Label>Taxa adicional para domicílio (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={business.homeServiceFee || 0}
                        onChange={(e) => patchBusiness({ homeServiceFee: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  )}
                </div>
              </div>

              <SaveButton section="business" data={business} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social */}
        <TabsContent value="social">
          <Card>
            <CardHeader>
              <CardTitle>Redes Sociais</CardTitle>
              <CardDescription>Links para suas redes. Deixe em branco para não exibir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {([
                { label: 'Instagram',        key: 'instagram',    placeholder: 'https://instagram.com/seu-perfil' },
                { label: 'Facebook',         key: 'facebook',     placeholder: 'https://facebook.com/sua-pagina' },
                { label: 'TikTok',           key: 'tiktok',       placeholder: 'https://tiktok.com/@seu-perfil' },
                { label: 'YouTube',          key: 'youtube',      placeholder: 'https://youtube.com/@seu-canal' },
                { label: 'Link do WhatsApp', key: 'whatsappLink', placeholder: 'https://wa.me/5511999999999' },
              ] as { label: string; key: keyof SocialSettings; placeholder: string }[]).map(({ label, key, placeholder }) => (
                <div key={key} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    type="url"
                    placeholder={placeholder}
                    value={social[key]}
                    onChange={(e) => patchSocial({ [key]: e.target.value } as any)}
                  />
                </div>
              ))}
              <SaveButton section="social" data={social} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* CMS */}
        <TabsContent value="cms">
          <Card>
            <CardHeader>
              <CardTitle>Páginas Institucionais</CardTitle>
              <CardDescription>Texto das páginas fixas do site.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Sobre Nós</Label>
                <Textarea className="min-h-[160px]"
                  value={cms.aboutPage}
                  onChange={(e) => patchCms({ aboutPage: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Política de Privacidade</Label>
                <Textarea className="min-h-[160px]"
                  value={cms.privacyPolicy}
                  onChange={(e) => patchCms({ privacyPolicy: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Termos de Uso</Label>
                <Textarea className="min-h-[160px]"
                  value={cms.termsOfUse}
                  onChange={(e) => patchCms({ termsOfUse: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Texto da Página de Contato</Label>
                <Textarea className="min-h-[100px]"
                  value={cms.contactText}
                  onChange={(e) => patchCms({ contactText: e.target.value })} />
              </div>
              <SaveButton section="cms" data={cms} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notificações / WhatsApp */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" /> Lembretes Automáticos
              </CardTitle>
              <CardDescription>
                Configure a mensagem enviada automaticamente pelo WhatsApp 1 dia antes do agendamento.
                O sistema roda todo dia às 8h da manhã.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* ── Bot de Vendas WhatsApp ── */}
              {(plan?.features?.hasStore || (plan?.features as any)?.hasProductsInternal) && (
                <div className="flex items-center justify-between rounded-xl border p-4 bg-green-50 border-green-200">
                  <div>
                    <p className="font-semibold text-sm flex items-center gap-2">🛍️ Bot de Vendas pelo WhatsApp</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cliente faz pedido, monta carrinho e paga tudo pelo WhatsApp automático
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const { doc: fsDoc, updateDoc } = await import('firebase/firestore');
                        const cur = (settings as any)?.storeBotEnabled ?? false;
                        await updateDoc(fsDoc(db, `salons/${profile?.salonId}/settings`, 'main'), { storeBotEnabled: !cur });
                        toast.success(!cur ? '🛍️ Bot de vendas ativado!' : 'Bot de vendas desativado.');
                        refreshSettings();
                      } catch(e: any) { toast.error(e.message); }
                    }}
                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${(settings as any)?.storeBotEnabled ? 'bg-green-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(settings as any)?.storeBotEnabled ? 'left-6' : 'left-0.5'}`} />
                  </button>
                </div>
              )}

              {/* Variáveis disponíveis */}
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="text-sm font-semibold">Variáveis disponíveis na mensagem:</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { var: '{{nome}}',          desc: 'Nome do cliente' },
                    { var: '{{servico}}',        desc: 'Serviço agendado' },
                    { var: '{{profissional}}',   desc: 'Nome do profissional' },
                    { var: '{{data}}',           desc: 'Data (dd/mm/aaaa)' },
                    { var: '{{horario}}',        desc: 'Horário de início' },
                  ].map(({ var: v, desc }) => (
                    <div key={v} className="flex items-start gap-1.5 text-xs">
                      <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{v}</code>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Editor da mensagem */}
              <div className="space-y-2">
                <Label htmlFor="reminder-msg">Mensagem de Lembrete</Label>
                {loadingNotif ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                  </div>
                ) : (
                  <>
                    {/* Botões de template por tipo de negócio */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Usar mensagem padrão para:</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(REMINDER_TEMPLATES).map(([key, t]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setReminderMsg(t.msg)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary hover:text-primary ${businessType === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                          >
                            <span>{t.emoji}</span> {t.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Clique para preencher a mensagem com o template do seu tipo de negócio. Você pode editar depois.</p>
                    </div>
                    <Textarea
                      id="reminder-msg"
                      className="min-h-[200px] font-mono text-sm"
                      value={reminderMsg}
                      onChange={(e) => setReminderMsg(e.target.value)}
                      placeholder={REMINDER_TEMPLATES[businessType]?.msg || DEFAULT_REMINDER_MSG}
                    />
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  Use emojis à vontade! Essa mensagem é enviada exatamente como você escrever, apenas as variáveis são substituídas.
                </p>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">Preview (como o cliente vai receber):</p>
                <div className="rounded-xl bg-[#DCF8C6] p-4 text-sm whitespace-pre-line shadow-sm max-w-sm border border-green-200">
                  {reminderMsg
                    .replace(/\{\{nome\}\}/gi, 'João Silva')
                    .replace(/\{\{servico\}\}/gi, 'Corte + Barba')
                    .replace(/\{\{profissional\}\}/gi, 'Carlos')
                    .replace(/\{\{data\}\}/gi, '03/04/2026')
                    .replace(/\{\{horario\}\}/gi, '14:00')
                  }
                </div>
              </div>

              {/* Botão de reset + salvar */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReminderMsg(REMINDER_TEMPLATES[businessType]?.msg || DEFAULT_REMINDER_MSG)}
                >
                  Restaurar padrão
                </Button>
                <Button onClick={handleSaveNotifications} disabled={savingNotif}>
                  {savingNotif
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
                    : <><Save className="mr-2 h-4 w-4" />Salvar Mensagem</>}
                </Button>
              </div>


            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp */}
        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-green-600" /> Conectar WhatsApp
              </CardTitle>
              <CardDescription>
                Conecte o WhatsApp do {bizName} para enviar lembretes automáticos 1 dia antes de cada agendamento.
                Escolha entre QR Code ou código por número de telefone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Status atual */}
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${
                waStatus === 'connected'
                  ? 'border-green-200 bg-green-50'
                  : waStatus === 'qrcode'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-muted bg-muted/30'
              }`}>
                {waStatus === 'connected' && <><Wifi className="h-5 w-5 text-green-600" /><div><p className="font-semibold text-green-800">WhatsApp conectado ✓</p><p className="text-sm text-green-700">Os lembretes automáticos estão ativos. Mensagens saem todo dia às 8h.</p></div></>}
                {waStatus === 'qrcode'    && <><RefreshCw className="h-5 w-5 animate-spin text-amber-600" /><div><p className="font-semibold text-amber-800">Aguardando escaneamento...</p><p className="text-sm text-amber-700">Abra o WhatsApp no celular → três pontinhos → Aparelhos conectados → Conectar.</p></div></>}
                {waStatus === 'loading'   && <><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /><p className="text-sm text-muted-foreground">Gerando QR Code...</p></>}
                {waStatus === 'error'     && <><WifiOff className="h-5 w-5 text-red-500" /><div><p className="font-semibold text-red-700">Erro na conexão</p><p className="text-sm text-red-600">Verifique se a Evolution API está configurada no servidor.</p></div></>}
                {waStatus === 'idle'      && <><WifiOff className="h-5 w-5 text-muted-foreground" /><div><p className="font-semibold">Não conectado</p><p className="text-sm text-muted-foreground">Escolha o método de conexão abaixo.</p></div></>}
              </div>

              {/* Modo de conexão */}
              {(waStatus === 'idle' || waStatus === 'error') && (
                <div className="flex gap-2 rounded-xl border p-1 bg-muted/30">
                  <button
                    onClick={() => setConnectMode('qr')}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${connectMode === 'qr' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <QrCode className="h-4 w-4" /> QR Code
                  </button>
                  <button
                    onClick={() => setConnectMode('phone')}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${connectMode === 'phone' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Smartphone className="h-4 w-4" /> Número de Telefone
                  </button>
                </div>
              )}

              {/* Input de número para pairing code */}
              {connectMode === 'phone' && (waStatus === 'idle' || waStatus === 'error') && (
                <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-800">📱 Conectar pelo número</p>
                  <p className="text-xs text-blue-700">Digite o número do WhatsApp que vai se conectar (com código do país). Um código de 8 dígitos será gerado para você digitar no seu celular.</p>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="5511999999999"
                      value={waPhone}
                      onChange={e => setWaPhone(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      maxLength={15}
                    />
                  </div>
                  <p className="text-xs text-blue-600">Ex: 5511999999999 (55 = Brasil, 11 = DDD, + número)</p>
                </div>
              )}

              {/* Pairing Code gerado */}
              {waStatus === 'pairing' && waPairingCode && (
                <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-blue-400 bg-blue-50 p-6">
                  <p className="text-sm font-semibold text-blue-800">📱 Digite esse código no WhatsApp</p>
                  <div className="flex items-center gap-2">
                    {waPairingCode.split('').map((char, i) => (
                      <span key={i} className={`flex h-12 w-10 items-center justify-center rounded-xl text-2xl font-black ${i === 4 ? 'ml-3' : ''} ${char === '-' ? 'text-blue-400 bg-transparent' : 'bg-white border-2 border-blue-300 text-blue-900 shadow'}`}>
                        {char}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-blue-700 text-center space-y-1">
                    <p>1. Abra o WhatsApp no celular</p>
                    <p>2. Vá em <strong>⋮ → Aparelhos conectados → Conectar com número de telefone</strong></p>
                    <p>3. Digite o código acima</p>
                  </div>
                  <p className="text-xs text-red-500 font-medium">⏱ Expira em ~60 segundos — se não funcionar, gere um novo</p>
                  <div className="flex gap-2 w-full">
                    <button onClick={checkWaStatus} className="flex-1 text-xs text-blue-600 border border-blue-300 rounded-lg py-1.5 hover:bg-blue-100">
                      ✓ Já digitei — verificar
                    </button>
                    <button onClick={() => { setWaPairingCode(null); setWaStatus('idle'); }} className="flex-1 text-xs text-slate-600 border border-slate-200 rounded-lg py-1.5 hover:bg-slate-50">
                      🔄 Gerar novo código
                    </button>
                  </div>
                </div>
              )}

              {/* QR Code */}
              {waStatus === 'qrcode' && waQrCode && (
                <div className="flex flex-col items-center gap-4">
                  <div className="rounded-2xl border-4 border-green-500 p-3 bg-white shadow-lg">
                    <img
                      src={waQrCode.startsWith('data:') ? waQrCode : `data:image/png;base64,${waQrCode}`}
                      alt="QR Code WhatsApp"
                      className="h-56 w-56"
                    />
                  </div>
                  <p className="text-sm text-center text-muted-foreground max-w-xs">
                    Aponte a câmera do WhatsApp para este código. Ele expira em 60 segundos — se sumir, clique em Reconectar.
                  </p>
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex flex-wrap gap-3">
                {waStatus === 'qrcode' && (
                  <Button
                    variant="outline"
                    onClick={() => { stopPolling(); setWaStatus('idle'); setWaQrCode(null); }}
                    className="text-slate-600"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Gerar novo QR Code
                  </Button>
                )}

                {waStatus !== 'connected' && waStatus !== 'pairing' && (
                  <Button
                    onClick={connectMode === 'phone' && (waStatus === 'idle' || waStatus === 'error') ? handleWaPairingCode : handleWaConnect}
                    disabled={waStatus === 'loading' || (connectMode === 'phone' && waPhone.replace(/\D/g,'').length < 10)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {waStatus === 'loading'
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{connectMode === 'phone' ? 'Gerando código...' : 'Gerando QR Code...'}</>
                      : waStatus === 'qrcode'
                      ? <><RefreshCw className="mr-2 h-4 w-4" />Reconectar</>
                      : connectMode === 'phone'
                      ? <><Smartphone className="mr-2 h-4 w-4" />Gerar Código de Pareamento</>
                      : <><Smartphone className="mr-2 h-4 w-4" />Conectar via QR Code</>}
                  </Button>
                )}
                {waStatus === 'connected' && (
                  <>
                    <Button variant="outline" onClick={checkWaStatus}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Verificar Status
                    </Button>
                    <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={handleWaDisconnect}>
                      <XCircle className="mr-2 h-4 w-4" /> Desconectar
                    </Button>
                  </>
                )}
                {waStatus === 'qrcode' && (
                  <Button variant="outline" onClick={checkWaStatus}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Já escaniei, verificar
                  </Button>
                )}
              </div>

              {/* Info sobre o número */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                ⚠️ O WhatsApp precisa ficar conectado para enviar mensagens automáticas. Se o celular perder internet por muito tempo, a conexão cai — volte aqui e escaneie o QR Code novamente.
              </div>

              {/* ── Toggle Bot CRM Proativo ── */}
              <div className="rounded-xl border p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm flex items-center gap-2">
                      🤖 Bot de Agendamento
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sempre ativo — responde clientes que mandarem mensagem e processa agendamentos automaticamente.
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2 py-1">Sempre ativo</span>
                </div>

                <div className="border-t pt-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm flex items-center gap-2">
                      📣 Bot CRM Proativo
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Quando <strong>ativo</strong>, o sistema envia automaticamente mensagens de <strong>aniversário</strong>, <strong>reengajamento</strong> (clientes sem visita há 45+ dias) e <strong>follow-up pós-serviço</strong>.<br />
                      Desative se quiser que o sistema pare de mandar mensagens para clientes que não iniciaram contato.
                    </p>
                  </div>
                  <button
                    onClick={() => handleBotProactiveToggle(!crmProactiveEnabled)}
                    disabled={savingBotToggle}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      crmProactiveEnabled ? 'bg-green-500' : 'bg-slate-300'
                    } ${savingBotToggle ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    aria-label={crmProactiveEnabled ? 'Desativar bot CRM proativo' : 'Ativar bot CRM proativo'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        crmProactiveEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className={`text-xs font-medium ${crmProactiveEnabled ? 'text-green-700' : 'text-slate-500'}`}>
                  {crmProactiveEnabled
                    ? '✅ Bot CRM proativo ativo — mensagens automáticas de aniversário, reengajamento e follow-up serão enviadas.'
                    : '🔕 Bot CRM proativo desativado — nenhuma mensagem proativa será enviada. Apenas respostas a quem chamar.'}
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">📱 Qual número usar?</p>
                <p>Pode ser o número do próprio {bizName} ou um chip separado. O número fica conectado igual ao WhatsApp Web — enquanto o celular tiver internet, as mensagens saem automaticamente.</p>
                <p>Se o celular ficar sem internet por muito tempo, a conexão cai. Basta voltar aqui e escanear de novo.</p>
                <p className="text-xs">Se você só tem um celular e não consegue escanear o QR Code da tela, peça para alguém abrir esta página no computador enquanto você escaneia.</p>
              </div>

            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PIX ── */}
        <TabsContent value="pix">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" /> Recebimento via PIX
              </CardTitle>
              <CardDescription>
                Configure como sua loja recebe pagamentos via PIX. O dinheiro cai direto na sua conta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Status atual */}
              {business.asaasApiKey ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  ✅ <strong>PIX Automático (Asaas)</strong> ativo — confirmação automática.
                </div>
              ) : business.pixKey ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  ✅ <strong>PIX Simples</strong> ativo — QR Code com sua chave. Confirmação manual.
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  ⚠️ PIX não configurado — a opção PIX não aparece no checkout até você configurar.
                </div>
              )}

              {/* Opção 1: PIX Simples */}
              <div className="space-y-4 rounded-xl border p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <QrCode className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Opção 1 — PIX Simples (recomendado)</h3>
                    <p className="text-sm text-muted-foreground">
                      Cadastre sua chave PIX. O QR Code é gerado na hora e o dinheiro cai direto na sua conta bancária. Você confirma o pagamento manualmente no painel.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo da Chave PIX</Label>
                    <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={business.pixKeyType || 'cpf'}
                      onChange={e => patchBusiness({ pixKeyType: e.target.value as any })}>
                      <option value="cpf">CPF</option>
                      <option value="cnpj">CNPJ</option>
                      <option value="email">Email</option>
                      <option value="phone">Telefone</option>
                      <option value="random">Chave Aleatória</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Chave PIX</Label>
                    <Input placeholder={business.pixKeyType === 'email' ? 'seuemail@gmail.com' : business.pixKeyType === 'phone' ? '(11) 99999-9999' : business.pixKeyType === 'random' ? 'chave aleatória' : '000.000.000-00'}
                      value={business.pixKey || ''}
                      onChange={e => patchBusiness({ pixKey: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nome do recebedor (aparece no QR Code)</Label>
                  <Input placeholder={`Ex: João Silva ou ${bizNameCap} da Ana`}
                    value={business.pixOwnerName || ''}
                    onChange={e => patchBusiness({ pixOwnerName: e.target.value })} />
                </div>
              </div>

              {/* Opção 2: Asaas */}
              <div className="space-y-4 rounded-xl border p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
                    <CreditCard className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Opção 2 — PIX Automático via Asaas</h3>
                    <p className="text-sm text-muted-foreground">
                      Confirmação automática. Taxa de R$0,99 por PIX recebido.
                    </p>
                  </div>
                </div>

                {!business.asaasApiKey && (
                  <div className="rounded-xl bg-muted/40 border p-4 space-y-3">
                    <p className="text-sm font-semibold">Como configurar em 3 passos:</p>
                    <ol className="space-y-3 text-sm">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                        <span>Acesse <a href="https://asaas.com" target="_blank" rel="noreferrer" className="font-medium text-primary underline">asaas.com</a> e crie uma conta gratuita.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                        <span>Vá em <strong>Configurações → Integrações → API Key</strong> e clique em <strong>"Gerar nova chave"</strong>.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                        <span>Copie a chave (começa com <code className="bg-muted px-1 rounded">$aact_...</code>) e cole abaixo.</span>
                      </li>
                    </ol>
                    <a href="https://asaas.com" target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors">
                      Criar conta no Asaas gratuitamente →
                    </a>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>API Key do Asaas</Label>
                  <Input type="password" placeholder="$aact_..."
                    value={business.asaasApiKey || ''}
                    onChange={e => patchBusiness({ asaasApiKey: e.target.value })} />
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  ℹ️ O Asaas exige conta verificada com CPF ou CNPJ. Após criar a conta, complete o cadastro e verifique sua identidade para liberar os pagamentos.
                </div>

                {business.asaasApiKey && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 space-y-1">
                    <p>✅ <strong>Asaas conectado!</strong> Confirmação automática ativa.</p>
                    <button type="button" className="text-xs text-green-600 underline"
                      onClick={() => patchBusiness({ asaasApiKey: '' })}>
                      Remover e usar PIX Simples
                    </button>
                  </div>
                )}
              </div>

              {business.pixKey && business.asaasApiKey && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  ⚠️ Ambos configurados. O sistema usa o <strong>Asaas</strong> por padrão.
                </div>
              )}

            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
};