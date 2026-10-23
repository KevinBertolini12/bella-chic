import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Scissors, Stethoscope, Dumbbell, Briefcase,
  ArrowRight, CheckCircle2, Globe, ShieldCheck, Zap,
  Loader2, AlertCircle, Store, ChevronLeft, Check, X, Trophy,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuth } from '../contexts/AuthContext';
import { onboardingService } from '../services/onboardingService';
import { salonService } from '../services/salonService';
import { toast } from 'sonner';
import { SEO } from '../components/SEO';
import { BusinessType } from '../types';
import { motion, AnimatePresence } from 'motion/react';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugify = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');

// ─── Tipos de negócio ─────────────────────────────────────────────────────────
const BUSINESS_TYPES = [
  { type: 'beauty' as BusinessType, label: 'Beleza & Estética', examples: 'Salão, barbearia, studio, spa, nail designer', icon: <Scissors className="h-6 w-6" />, color: 'rose' },
  { type: 'health' as BusinessType, label: 'Saúde & Clínicas', examples: 'Dentista, psicólogo, nutricionista, fisioterapeuta, clínica estética', icon: <Stethoscope className="h-6 w-6" />, color: 'blue' },
  { type: 'fitness' as BusinessType, label: 'Fitness & Bem-estar', examples: 'Personal trainer, pilates, yoga, crossfit', icon: <Dumbbell className="h-6 w-6" />, color: 'green' },
  { type: 'services' as BusinessType, label: 'Serviços em Geral', examples: 'Arquiteto, advogado, consultoria, fotógrafo', icon: <Briefcase className="h-6 w-6" />, color: 'purple' },
  { type: 'sports' as BusinessType, label: 'Esportes & Lazer', examples: 'Quadra esportiva, academia de natação, clube, escola de luta', icon: <Trophy className="h-6 w-6" />, color: 'green' },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-500',   text: 'text-rose-700',   icon: 'text-rose-600' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-500',   text: 'text-blue-700',   icon: 'text-blue-600' },
  green:  { bg: 'bg-green-50',  border: 'border-green-500',  text: 'text-green-700',  icon: 'text-green-600' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-700', icon: 'text-purple-600' },
};

// ─── Planos disponíveis para escolha no trial ─────────────────────────────────
const PLANS = [
  {
    id: 'agenda',
    name: 'Só Agenda',
    price: 'R$ 64,99',
    desc: 'Para autônomos e pequenos negócios',
    highlight: false,
    badge: null,
    color: 'slate',
    features: {
      yes: ['Agendamento online 24h', 'Até 3 profissionais', 'Anamnese digital', 'Fotos antes e depois', 'Programa de fidelidade', 'Bot WhatsApp simples', 'Relatório básico'],
      no:  ['CRM completo', 'Sinal antecipado', 'Orçamentos e cobranças', 'Loja virtual'],
    },
  },
  {
    id: 'agenda-pro',
    name: 'Agenda Pro',
    price: 'R$ 89,99',
    desc: 'Para negócios em crescimento',
    highlight: true,
    badge: '⭐ MAIS POPULAR',
    color: 'rose',
    features: {
      yes: ['Tudo do Só Agenda', 'Profissionais ilimitados', 'CRM completo com funil', 'Prontuários e fichas completos', 'Orçamentos com PIX/cartão/boleto', 'Sinal antecipado', 'Bot WhatsApp inteligente (IA)', 'Relatório financeiro completo'],
      no:  ['Loja virtual'],
    },
  },
  {
    id: 'loja',
    name: 'Só Loja',
    price: 'R$ 64,99',
    desc: 'Para quem vende produtos online',
    highlight: false,
    badge: null,
    color: 'purple',
    features: {
      yes: ['Loja virtual completa', 'PIX automático (Asaas)', 'Controle de estoque', 'Cupons de desconto', 'Avaliações de produtos', 'Gerador de story'],
      no:  ['Agendamento', 'CRM', 'Bot WhatsApp', 'Prontuários'],
    },
  },
  {
    id: 'completo',
    name: 'Agenda + Loja',
    price: 'R$ 159,90',
    desc: 'O plano mais completo',
    highlight: false,
    badge: '👑 TUDO INCLUSO',
    color: 'amber',
    features: {
      yes: ['Tudo do Agenda Pro', 'Loja virtual completa', 'PIX automático Asaas', 'Bot WhatsApp IA', 'Relatório DRE completo', 'Suporte VIP'],
      no:  [],
    },
  },
];

const FeatureItem = ({ icon: Icon, title, description }: { icon: any; title: string; description: string }) => (
  <div className="flex gap-4">
    <div className="h-fit rounded-lg bg-white/10 p-2"><Icon className="h-5 w-5" /></div>
    <div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="text-sm text-rose-100">{description}</p>
    </div>
  </div>
);

export const SalonRegistration = () => {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const affiliateRef = React.useMemo(() => {
    const fromUrl = searchParams.get('ref');
    if (fromUrl) { sessionStorage.setItem('affiliate_ref', fromUrl); return fromUrl; }
    return sessionStorage.getItem('affiliate_ref') || null;
  }, []);

  const [affiliateValid, setAffiliateValid] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!affiliateRef) return;
    import('firebase/firestore').then(({ doc, getDoc }) => {
      import('../firebase').then(({ db }) => {
        getDoc(doc(db, 'affiliates', affiliateRef)).then(snap => {
          if (!snap.exists()) { setAffiliateValid(false); return; }
          const data = snap.data() as any;
          setAffiliateValid(!data.expiresAt || Date.now() <= data.expiresAt);
        });
      });
    });
  }, [affiliateRef]);

  const [selectedType, setSelectedType] = useState<BusinessType | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('agenda-pro');
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({ salonName: '', slug: '' });
  const [errors, setErrors] = useState({ salonName: '', slug: '' });

  const handleNameChange = (name: string) => {
    setFormData({ salonName: name, slug: slugify(name) });
    setSlugAvailable(null);
    setErrors({ salonName: '', slug: '' });
  };

  const handleSlugChange = (slug: string) => {
    const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
    setFormData(p => ({ ...p, slug: clean }));
    setSlugAvailable(null);
  };

  const checkSlugAvailability = async () => {
    const slug = formData.slug.trim();
    if (!slug || !SLUG_REGEX.test(slug)) return;
    setCheckingSlug(true);
    try {
      const existing = await salonService.getSalonBySlug(slug);
      setSlugAvailable(!existing);
    } catch { setSlugAvailable(null); }
    finally { setCheckingSlug(false); }
  };

  const validate = (): boolean => {
    const errs = { salonName: '', slug: '' };
    let valid = true;
    if (!formData.salonName.trim()) { errs.salonName = 'O nome é obrigatório.'; valid = false; }
    if (!formData.slug.trim()) { errs.slug = 'O endereço é obrigatório.'; valid = false; }
    else if (!SLUG_REGEX.test(formData.slug)) { errs.slug = 'Use apenas letras minúsculas, números e hifens.'; valid = false; }
    else if (slugAvailable === false) { errs.slug = 'Este endereço já está em uso.'; valid = false; }
    setErrors(errs);
    return valid;
  };

  const handleSubmit = async () => {
    if (!user) { toast.error('Você precisa estar logado.'); navigate('/login', { state: { from: { pathname: '/cadastro-salao' } } }); return; }
    if (!validate()) return;
    if (slugAvailable === null) {
      const existing = await salonService.getSalonBySlug(formData.slug);
      if (existing) { setErrors(p => ({ ...p, slug: 'Este endereço já está em uso.' })); setSlugAvailable(false); return; }
    }
    try {
      setLoading(true);
      await onboardingService.registerSalon(
        user.uid, user.email || '',
        formData.salonName.trim(), formData.slug.trim(),
        affiliateRef || undefined,
        selectedType || 'beauty',
        selectedPlanId,
      );
      await refreshProfile();
      fetch('/api/salon/welcome-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonName: formData.salonName.trim(), slug: formData.slug.trim(), ownerEmail: user.email, ownerName: user.displayName || user.email, businessType: selectedType || 'beauty', planId: selectedPlanId }),
      }).catch(() => {});
      if (affiliateRef) {
        fetch('/api/affiliate/register-signup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ affiliateRef, salonSlug: formData.slug.trim() }),
        }).catch(() => {});
      }
      // Aguarda o Firestore propagar antes de navegar
      await new Promise(resolve => setTimeout(resolve, 1200));
      navigate(`/s/${formData.slug.trim()}/bem-vindo`, { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar. Tente novamente.');
    } finally { setLoading(false); }
  };

  const handleGoToPanel = async () => {
    if (!profile?.salonId) {
      navigate('/cadastro-salao', { replace: true });
      return;
    }
    try {
      const salon = await salonService.getSalonById(profile.salonId);
      if (salon?.slug) {
        navigate(`/s/${salon.slug}/admin`, { replace: true });
      } else {
        // Salão existe no profile mas não no banco — limpa e reinicia
        toast.error('Houve um problema com seu cadastro. Vamos reiniciar.');
        navigate('/cadastro-salao', { replace: true });
      }
    } catch (err) { 
      console.error('[handleGoToPanel]', err);
      toast.error('Não foi possível acessar o painel. Recarregue a página.');
    }
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (profile?.salonId) return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-rose-50 to-white">
      <div className="space-y-5 text-center max-w-sm">
        <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Você já possui um negócio cadastrado!</h1>
          <p className="text-slate-500 mt-2">Acesse seu painel para gerenciar tudo.</p>
        </div>
        <Button size="lg" className="w-full bg-rose-600 hover:bg-rose-700" onClick={handleGoToPanel}>
          Ir para o Painel →
        </Button>
        <button
          className="text-xs text-slate-400 underline mt-2"
          onClick={() => navigate('/')}
        >
          Voltar para o início
        </button>
      </div>
    </div>
  );

  const selectedPlan = PLANS.find(p => p.id === selectedPlanId);

  return (
    <>
      <SEO title="Cadastrar — Bella & Chic" description="Crie sua conta na plataforma" />
      <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">

        {/* ── Left panel ── */}
        <div className="flex flex-col justify-center space-y-6 bg-rose-600 p-6 sm:p-8 text-white lg:w-5/12 lg:p-16">
          <div className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <Store className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold leading-tight lg:text-4xl">
              {step === 1 && 'Qual é o seu negócio?'}
              {step === 2 && 'Dados do seu negócio'}
              {step === 3 && 'Escolha seu plano de teste'}
            </h1>
            <p className="text-rose-100 text-sm">
              {step === 3
                ? '30 dias grátis com todas as funcionalidades do plano escolhido. Sem cartão.'
                : 'Plataforma completa para qualquer tipo de negócio.'}
            </p>
          </div>

          <div className="space-y-4">
            <FeatureItem icon={Zap} title="Setup em Minutos" description="Configuramos tudo automaticamente." />
            <FeatureItem icon={Globe} title="Link exclusivo" description="Seus clientes agendam 24h pelo link." />
            <FeatureItem icon={ShieldCheck} title="30 dias grátis" description="Sem cartão, cancele quando quiser." />
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm text-rose-200">
            {[1, 2, 3].map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${step >= s ? 'bg-white text-rose-600' : 'bg-white/20 text-white'}`}>
                  {step > s ? <Check className="h-3.5 w-3.5" /> : s}
                </div>
                {i < 2 && <div className={`h-px flex-1 transition-all ${step > s ? 'bg-white' : 'bg-white/30'}`} />}
              </React.Fragment>
            ))}
            <span className="ml-2 text-rose-200 text-xs">
              {step === 1 ? 'Tipo' : step === 2 ? 'Dados' : 'Plano'}
            </span>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex flex-col justify-center bg-white p-8 lg:w-7/12 lg:p-16 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl">
            <AnimatePresence mode="wait">

              {/* ── STEP 1: Tipo de negócio ── */}
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  {!user && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>Você precisa estar logado para criar uma conta.{' '}
                        <Link to="/login" state={{ from: { pathname: '/cadastro-salao' } }} className="font-semibold underline">Entrar ou criar conta</Link>
                      </div>
                    </div>
                  )}
                  {affiliateRef && affiliateValid && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <div><p className="font-semibold">Desconto especial ativo!</p><p>Você ganha desconto no primeiro mês por ter entrado via indicação.</p></div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {BUSINESS_TYPES.map(bt => {
                      const c = COLOR_MAP[bt.color];
                      const active = selectedType === bt.type;
                      return (
                        <button key={bt.type} type="button" onClick={() => setSelectedType(bt.type)}
                          className={`flex flex-col gap-3 rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${active ? `${c.bg} ${c.border} shadow-sm` : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? `${c.bg} ${c.icon}` : 'bg-slate-100 text-slate-500'}`}>
                            {bt.icon}
                          </div>
                          <div>
                            <p className={`font-semibold ${active ? c.text : 'text-slate-800'}`}>{bt.label}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{bt.examples}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <Button className="h-12 w-full bg-rose-600 text-base hover:bg-rose-700" disabled={!selectedType || !user} onClick={() => setStep(2)}>
                    Continuar <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              )}

              {/* ── STEP 2: Dados do negócio ── */}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </button>
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="salonName">Nome do negócio *</Label>
                      <Input id="salonName"
                        placeholder={selectedType === 'health' ? 'Ex: Clínica Dr. Silva' : selectedType === 'fitness' ? 'Ex: Studio Fit' : selectedType === 'services' ? 'Ex: Consultoria Bertolini' : 'Ex: Bella & Chic'}
                        required value={formData.salonName} onChange={e => handleNameChange(e.target.value)}
                        className={errors.salonName ? 'border-destructive' : ''} />
                      {errors.salonName && <p className="text-xs text-destructive">{errors.salonName}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slug">Endereço exclusivo *</Label>
                      <div className="flex items-center overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-ring">
                        <span className="shrink-0 border-r bg-slate-50 px-3 py-2 text-sm text-slate-500">/s/</span>
                        <input id="slug" className="flex-1 bg-transparent px-3 py-2 text-sm outline-none" placeholder="meu-negocio"
                          required value={formData.slug} onChange={e => handleSlugChange(e.target.value)} onBlur={checkSlugAvailability} />
                        <div className="pr-3">
                          {checkingSlug && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          {!checkingSlug && slugAvailable === true && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                          {!checkingSlug && slugAvailable === false && <AlertCircle className="h-4 w-4 text-destructive" />}
                        </div>
                      </div>
                      {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
                      {!errors.slug && slugAvailable === true && <p className="text-xs text-emerald-600">Endereço disponível!</p>}
                      <p className="text-xs text-slate-400">Apenas letras minúsculas, números e hifens.</p>
                    </div>
                    <Button className="h-12 w-full bg-rose-600 text-base hover:bg-rose-700"
                      disabled={!user || slugAvailable === false || !formData.salonName.trim()}
                      onClick={() => { if (validate()) setStep(3); }}>
                      Escolher plano <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: Escolha do plano ── */}
              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Teste qualquer plano por 30 dias grátis</h2>
                    <p className="text-sm text-slate-500 mt-1">Sem cartão. Você escolhe qual plano testar — pode mudar depois.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {PLANS.map(plan => {
                      const active = selectedPlanId === plan.id;
                      return (
                        <button key={plan.id} onClick={() => setSelectedPlanId(plan.id)}
                          className={`relative flex flex-col text-left rounded-2xl border-2 p-4 transition-all hover:shadow-md ${active ? 'border-rose-500 bg-rose-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                          {plan.badge && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 px-3 py-0.5 text-[10px] font-bold text-amber-900 shadow">
                              {plan.badge}
                            </span>
                          )}
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                              <p className={`font-bold text-sm ${active ? 'text-rose-700' : 'text-slate-800'}`}>{plan.name}</p>
                              <p className="text-xs text-slate-500">{plan.desc}</p>
                            </div>
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${active ? 'border-rose-500 bg-rose-500' : 'border-slate-300'}`}>
                              {active && <Check className="h-3 w-3 text-white" />}
                            </div>
                          </div>
                          <p className={`text-xl font-black mb-3 ${active ? 'text-rose-600' : 'text-slate-900'}`}>{plan.price}<span className="text-xs font-normal text-slate-500">/mês</span></p>
                          <ul className="space-y-1">
                            {plan.features.yes.slice(0, 4).map(f => (
                              <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600">
                                <Check className="h-3 w-3 text-emerald-500 shrink-0" /> {f}
                              </li>
                            ))}
                            {plan.features.no.slice(0, 2).map(f => (
                              <li key={f} className="flex items-center gap-1.5 text-xs text-slate-400">
                                <X className="h-3 w-3 shrink-0" /> {f}
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>

                  {selectedPlan && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <p className="font-semibold">✅ {selectedPlan.name} selecionado — 30 dias grátis</p>
                      <p className="text-xs mt-0.5 text-emerald-700">Após o trial, você pode assinar ou cancelar. Sem compromisso.</p>
                    </div>
                  )}

                  <Button className="h-12 w-full bg-rose-600 text-base hover:bg-rose-700" disabled={loading || !user} onClick={handleSubmit}>
                    {loading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando sua conta...</>
                      : <>Começar trial grátis <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                  <p className="text-center text-xs text-slate-400">
                    Ao criar, você concorda com nossos{' '}
                    <Link to="/termos" className="underline">termos de uso</Link> e{' '}
                    <Link to="/privacidade" className="underline">política de privacidade</Link>.
                  </p>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
};
