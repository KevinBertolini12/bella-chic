import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Scissors, Stethoscope, Dumbbell, Briefcase, Trophy,
  Calendar, ShoppingBag, ShieldCheck, Zap, Globe,
  ArrowRight, Star, Clock, Users, CheckCircle2,
  MessageSquare, TrendingUp, Award, Smartphone,
  ChevronDown, Play, Sparkles,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import { SEO } from '../components/SEO';

const FloatingCard = ({ children, className = '', delay = 0 }) => {
  const ref = useRef(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientY - rect.top - rect.height / 2) / 15;
    const y = -(e.clientX - rect.left - rect.width / 2) / 15;
    setRotate({ x, y });
  };
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.6, ease: "easeOut" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setRotate({ x: 0, y: 0 })}
      style={{ transform: `perspective(1000px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`, transition: "transform 0.15s ease" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const Counter = ({ end, suffix = "", duration = 2000 }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = Date.now();
        const timer = setInterval(() => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 3);
          setCount(Math.round(end * ease));
          if (progress >= 1) clearInterval(timer);
        }, 16);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{count.toLocaleString("pt-BR")}{suffix}</span>;
};

const SupportMenu = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-white transition-colors">Suporte</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 mb-2 flex flex-col gap-1 bg-slate-800 rounded-xl p-2 w-52 shadow-2xl z-50 border border-slate-700">
            <a href="https://wa.me/message/CEH7ODLF63LJD1" target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
              <MessageSquare className="h-4 w-4 text-green-400" /> WhatsApp
            </a>
            <a href="mailto:bellachic.plataforma@gmail.com" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
              <span className="text-blue-400">@</span> E-mail
            </a>
          </div>
        </>
      )}
    </div>
  );
};

// ── Carrossel de funcionalidades do hero ──────────────────────────────────────
const HERO_FEATURES = [
  {
    icon: '📅',
    color: 'bg-rose-50 text-rose-600 border-rose-100',
    title: 'Agendamento online 24h',
    desc: 'Clientes agendam pelo celular, qualquer hora, sem você precisar atender.',
  },
  {
    icon: '🤖',
    color: 'bg-green-50 text-green-600 border-green-100',
    title: 'Bot WhatsApp com IA',
    desc: 'Responde, agenda e confirma automaticamente pelo WhatsApp.',
  },
  {
    icon: '💰',
    color: 'bg-blue-50 text-blue-600 border-blue-100',
    title: 'Financeiro completo',
    desc: 'PIX, dinheiro, débito e crédito separados no relatório diário.',
  },
  {
    icon: '👥',
    color: 'bg-purple-50 text-purple-600 border-purple-100',
    title: 'CRM de clientes',
    desc: 'Histórico, follow-up automático e funil de vendas completo.',
  },
  {
    icon: '📦',
    color: 'bg-amber-50 text-amber-600 border-amber-100',
    title: 'Produtos & Estoque',
    desc: 'Cadastra produtos, controla estoque e registra vendas presenciais.',
  },
  {
    icon: '⭐',
    color: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    title: 'Programa de fidelidade',
    desc: 'Pontos por atendimento e recompensas para clientes fiéis.',
  },
  {
    icon: '🔔',
    color: 'bg-rose-50 text-rose-600 border-rose-100',
    title: 'Lembretes automáticos',
    desc: 'Confirmação e lembrete 1 dia antes — zero no-show.',
  },
];

const HeroFeatureCarousel: React.FC = () => {
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => {
      setActive(p => (p + 1) % HERO_FEATURES.length);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const feat = HERO_FEATURES[active];

  return (
    <div className="p-4">
      {/* Feature display */}
      <div className="flex items-start gap-3 mb-4 min-h-[56px]">
        <div className={`flex items-center justify-center w-10 h-10 rounded-xl border text-xl flex-shrink-0 ${feat.color}`}>
          {feat.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-sm">{feat.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{feat.desc}</p>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center gap-1.5">
        {HERO_FEATURES.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? 'bg-rose-500 w-5' : 'bg-slate-200 w-1.5'
            }`}
          />
        ))}
        <span className="ml-auto text-[10px] text-slate-400 font-medium">
          {active + 1}/{HERO_FEATURES.length} funcionalidades
        </span>
      </div>
    </div>
  );
};


export const BellaChicNavLogo: React.FC = () => (
  <svg width="120" height="34" viewBox="0 0 340 96" aria-label="Bella &amp; Chic">
    <circle cx="48" cy="44" r="38" fill="none" stroke="#e11d48" strokeWidth="1"/>
    <circle cx="48" cy="44" r="30" fill="none" stroke="#e11d48" strokeWidth="0.4" opacity="0.5"/>
    <text x="36" y="58" fontFamily="Georgia,serif" fontSize="28" fontWeight="300" fill="#e11d48" textAnchor="middle">B</text>
    <text x="48" y="49" fontFamily="Georgia,serif" fontSize="8" fontWeight="300" fill="#e11d48" textAnchor="middle" fontStyle="italic">&amp;</text>
    <text x="60" y="58" fontFamily="Georgia,serif" fontSize="28" fontWeight="300" fill="#e11d48" textAnchor="middle">C</text>
    <line x1="92" y1="73" x2="130" y2="73" stroke="#e11d48" strokeWidth="0.5" opacity="0.5"/>
    <circle cx="90" cy="73" r="1.5" fill="#e11d48" opacity="0.5"/>
    <text x="214" y="50" fontFamily="Georgia,serif" fontSize="22" fontWeight="300" fill="#1a1a1a" textAnchor="middle" letterSpacing="4">BELLA &amp; CHIC</text>
    <text x="214" y="66" fontFamily="Arial,sans-serif" fontSize="7" fontWeight="300" fill="#888" textAnchor="middle" letterSpacing="3">PLATAFORMA</text>
  </svg>
);

export const LandingPage = () => {
  // Hooks do componente original — precisam vir primeiro (Rules of Hooks)
  const [activeType, setActiveType] = useState(0);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 500], [0, -80]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0.3]);

  const businessTypes = [
    { icon: <Scissors className="h-5 w-5" />, label: "Beleza & Estética", bg: "bg-rose-500", examples: "Salão · Barbearia · Studio · Spa" },
    { icon: <Stethoscope className="h-5 w-5" />, label: "Saúde & Clínicas", bg: "bg-blue-500", examples: "Dentista · Psicólogo · Nutricionista" },
    { icon: <Dumbbell className="h-5 w-5" />, label: "Fitness & Bem-estar", bg: "bg-green-500", examples: "Personal · Pilates · Yoga · Crossfit" },
    { icon: <Briefcase className="h-5 w-5" />, label: "Serviços em Geral", bg: "bg-purple-500", examples: "Consultoria · Arquitetura · Fotografia" },
    { icon: <Trophy className="h-5 w-5" />, label: "Esportes & Lazer", bg: "bg-emerald-500", examples: "Quadra · Natação · Clube · Escola de luta" },
  ];

  useEffect(() => {
    const interval = setInterval(() => setActiveType(t => (t + 1) % businessTypes.length), 3000);
    return () => clearInterval(interval);
  }, []);

  const { user, isSuperAdmin, isSalonAdmin, isProfessional, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Se usuário logado sem salão → manda pro cadastro
  React.useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) return;
    if (!profile.salonId) {
      navigate('/cadastro-salao', { replace: true });
    }
  }, [user?.uid, !!profile?.salonId, authLoading]);

  return (
    <>
      <SEO title="Bella & Chic | Plataforma para Beleza, Saúde e Serviços" description="Agendamento online, prontuários, anamnese, CRM e loja virtual. Para salões, clínicas, personal trainers e qualquer prestador de serviço." />
      <div className="min-h-screen bg-white overflow-x-hidden">

        {/* NAVBAR */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <BellaChicNavLogo />
            <div className="hidden md:flex items-center gap-6 text-sm text-slate-600">
              <a href="#funcionalidades" className="hover:text-rose-600 transition-colors">Funcionalidades</a>
              <a href="#para-quem" className="hover:text-rose-600 transition-colors">Para quem</a>
              <a href="#precos" className="hover:text-rose-600 transition-colors">Preços</a>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <button
                  disabled={authLoading}
                  onClick={async () => {
                    try {
                      // Usa token claims do Firebase — não depende do Firestore carregar
                      const { auth } = await import('../firebase');
                      const token = await auth.currentUser?.getIdTokenResult();
                      const role = (token?.claims?.role as string) || '';
                      const salonId = (token?.claims?.salonId as string) || profile?.salonId || '';

                      if (role === 'SUPER_ADMIN' || isSuperAdmin) {
                        window.location.href = '/super-admin'; return;
                      }
                      if (salonId) {
                        const { salonService } = await import('../services/salonService');
                        const salon = await salonService.getSalonById(salonId);
                        if (salon?.slug) {
                          if (role === 'SALON_ADMIN' || isSalonAdmin) {
                            window.location.href = `/s/${salon.slug}/admin`;
                          } else if (role === 'PROFESSIONAL' || isProfessional)
                            window.location.href = `/s/${salon.slug}/profissional`;
                          else
                            window.location.href = `/s/${salon.slug}/cliente`;
                          return;
                        }
                      }
                      // Sem salão — vai direto pro cadastro
                      window.location.href = '/cadastro-salao';
                    } catch {
                      window.location.href = '/cadastro-salao';
                    }
                  }}
                  className="text-sm font-semibold text-rose-600 hover:text-rose-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  {authLoading ? 'Carregando...' : 'Ir para o Painel →'}
                </button>
              ) : (
                <>
                  <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Entrar</Link>
                  <Link to="/cadastro-salao">
                    <button className="bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-rose-700 transition-colors">Teste grátis</button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-64 h-64 sm:w-[600px] sm:h-[600px] bg-rose-100 rounded-full blur-3xl opacity-60" />
            <div className="absolute -bottom-40 -left-40 w-48 h-48 sm:w-[500px] sm:h-[500px] bg-pink-100 rounded-full blur-3xl opacity-40" />
          </div>
          <div className="container mx-auto px-4 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                  <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-full px-4 py-1.5 text-rose-700 text-xs font-semibold mb-6">
                    <Sparkles className="h-3.5 w-3.5" /> Plataforma completa para qualquer negócio
                  </div>
                  <h1 className="text-3xl sm:text-5xl lg:text-7xl font-black text-slate-900 leading-tight mb-4 sm:mb-6">
                    Seu negócio{" "}
                    <span className="text-rose-600 relative">
                      digital
                      <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 300 12" fill="none">
                        <path d="M2 10 Q150 2 298 10" stroke="#e11d48" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    {" "}começa aqui.
                  </h1>
                  <div className="h-14 mb-6 overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.div key={activeType} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ duration: 0.4 }} className="flex items-center gap-3">
                        <div className={`flex items-center justify-center h-10 w-10 rounded-xl ${businessTypes[activeType].bg} text-white`}>{businessTypes[activeType].icon}</div>
                        <div>
                          <p className="font-bold text-slate-800">{businessTypes[activeType].label}</p>
                          <p className="text-sm text-slate-500">{businessTypes[activeType].examples}</p>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <p className="text-lg text-slate-600 mb-8 max-w-lg leading-relaxed">
                    Agendamento online, prontuários, anamnese, CRM, loja virtual e muito mais. Tudo configurado para o seu tipo de negócio.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link to="/cadastro-salao">
                      <button className="group flex items-center gap-2 bg-rose-600 text-white font-bold px-6 py-3.5 rounded-xl hover:bg-rose-700 transition-all hover:-translate-y-0.5 shadow-lg shadow-rose-200">
                        Começar grátis por 30 dias <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </Link>
                    <a href="#para-quem">
                      <button className="flex items-center gap-2 text-slate-700 font-semibold px-6 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all">
                        Ver funcionalidades <ChevronDown className="h-4 w-4" />
                      </button>
                    </a>
                  </div>
                  <p className="text-xs text-slate-400 mt-4">Sem cartão de crédito · Cancele quando quiser</p>

                  {/* ── Carrossel de funcionalidades ── */}
                  <div className="mt-5 sm:mt-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-400" />
                        <div className="w-3 h-3 rounded-full bg-yellow-400" />
                        <div className="w-3 h-3 rounded-full bg-green-400" />
                      </div>
                      <span className="text-xs text-slate-400 ml-2 font-mono">bella-chic.app/s/seu-negocio</span>
                    </div>
                    <HeroFeatureCarousel />
                  </div>

                </motion.div>
              </div>

              <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative hidden lg:block">
                <div className="relative" style={{ perspective: "1200px" }}>
                  <FloatingCard delay={0.2} className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 relative z-20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-9 w-9 rounded-xl bg-rose-600 flex items-center justify-center"><Calendar className="h-4 w-4 text-white" /></div>
                      <div><p className="font-bold text-slate-800 text-sm">Próximos agendamentos</p><p className="text-xs text-slate-500">Hoje · 3 confirmados</p></div>
                    </div>
                    {[
                      { time: "09:00", name: "Maria Silva", service: "Corte + Escova", color: "bg-rose-100 text-rose-700" },
                      { time: "11:30", name: "João Costa", service: "Barba completa", color: "bg-blue-100 text-blue-700" },
                      { time: "14:00", name: "Ana Lima", service: "Coloração", color: "bg-purple-100 text-purple-700" },
                    ].map(item => (
                      <div key={item.time} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                        <span className="text-xs font-bold text-slate-400 w-10">{item.time}</span>
                        <div className="flex-1"><p className="text-sm font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.service}</p></div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.color}`}>✓</span>
                      </div>
                    ))}
                  </FloatingCard>
                  <FloatingCard delay={0.4} className="absolute -top-6 -right-8 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-30">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-green-100 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-green-600" /></div>
                      <div><p className="text-xs text-slate-500">Receita hoje</p><p className="font-black text-slate-900">R$ 1.240</p></div>
                    </div>
                  </FloatingCard>
                  <FloatingCard delay={0.5} className="absolute -bottom-4 -left-8 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-30">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center"><Star className="h-4 w-4 text-amber-500" /></div>
                      <div><p className="text-xs text-slate-500">Avaliação média</p><p className="font-black text-slate-900">4.9 ⭐</p></div>
                    </div>
                  </FloatingCard>
                  <FloatingCard delay={0.6} className="absolute top-1/2 -right-12 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-30">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-rose-100 flex items-center justify-center"><Users className="h-4 w-4 text-rose-600" /></div>
                      <div><p className="text-xs text-slate-500">Novos clientes</p><p className="font-black text-slate-900">+12 hoje</p></div>
                    </div>
                  </FloatingCard>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="py-16 bg-slate-900">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8">
              {[{ value: 500, suffix: "+", label: "Negócios ativos" }, { value: 50000, suffix: "+", label: "Agendamentos/mês" }, { value: 98, suffix: "%", label: "Satisfação" }, { value: 14, suffix: " dias", label: "Trial grátis" }].map(({ value, suffix, label }) => (
                <div key={label} className="text-center">
                  <p className="text-4xl font-black text-white mb-1"><Counter end={value} suffix={suffix} /></p>
                  <p className="text-slate-400 text-sm">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PARA QUEM */}
        <section id="para-quem" className="py-24 bg-slate-50">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
              <h2 className="text-4xl font-black text-slate-900 mb-4">Para quem é a plataforma?</h2>
              <p className="text-slate-600 max-w-xl mx-auto">Adaptada automaticamente para o seu tipo de negócio.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { Icon: Scissors, title: "Beleza & Estética", color: "rose", examples: ["Salão", "Barbearia", "Studio", "Nail designer", "Spa"], features: ["Agendamento 24h", "Gestão de equipe", "Fidelidade", "Loja virtual", "CRM"] },
                { Icon: Stethoscope, title: "Saúde & Clínicas", color: "blue", examples: ["Dentista", "Psicólogo", "Nutricionista", "Fisioterapeuta"], features: ["Prontuário eletrônico", "Anamnese digital", "Orçamentos", "Receituário", "Planos de tratamento"] },
                { Icon: Dumbbell, title: "Fitness & Bem-estar", color: "green", examples: ["Personal", "Pilates", "Yoga", "Crossfit"], features: ["Agenda de aulas", "Fichas de alunos", "Pacotes de treino", "Avaliações", "Relatórios"] },
                { Icon: Briefcase, title: "Serviços em Geral", color: "purple", examples: ["Consultoria", "Arquitetura", "Fotografia", "Advocacia"], features: ["Agenda de reuniões", "Orçamentos", "Documentos", "Briefings", "CRM"] },
                { Icon: Trophy, title: "Esportes & Lazer", color: "green", examples: ["Quadra esportiva", "Academia de natação", "Clube", "Escola de luta"], features: ["Aluguel de espaço/quadra", "Gestão de recursos", "Bloqueios de horário", "Eventos e promoções", "Agenda em tempo real"] },
              ].map(({ Icon, title, color, examples, features }, i) => {
                const c = { rose: { icon: "text-rose-600", bg: "bg-rose-50", badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500" }, blue: { icon: "text-blue-600", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" }, green: { icon: "text-green-600", bg: "bg-green-50", badge: "bg-green-100 text-green-700", dot: "bg-green-500" }, purple: { icon: "text-purple-600", bg: "bg-purple-50", badge: "bg-purple-100 text-purple-700", dot: "bg-purple-500" } }[color];
                return (
                  <FloatingCard key={title} delay={i * 0.1} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
                    <div className={`h-12 w-12 rounded-xl ${c.bg} ${c.icon} flex items-center justify-center mb-4`}><Icon className="h-6 w-6" /></div>
                    <h3 className="font-bold text-slate-900 text-lg mb-3">{title}</h3>
                    <div className="flex flex-wrap gap-1.5 mb-4">{examples.map(e => <span key={e} className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{e}</span>)}</div>
                    <ul className="space-y-1.5">{features.map(f => <li key={f} className="flex items-center gap-2 text-sm text-slate-600"><div className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />{f}</li>)}</ul>
                  </FloatingCard>
                );
              })}
            </div>
          </div>
        </section>

        {/* FUNCIONALIDADES */}
        <section id="funcionalidades" className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
              <h2 className="text-4xl font-black text-slate-900 mb-4">Tudo que você precisa em um lugar</h2>
              <p className="text-slate-600 max-w-xl mx-auto">Desenvolvido para substituir 5 ferramentas por uma só.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { Icon: Calendar, title: "Agendamento Online", desc: "Clientes agendam 24h/dia. Confirmações automáticas via WhatsApp.", color: "rose" },
                { Icon: MessageSquare, title: "Bot WhatsApp", desc: "Bot inteligente responde, manda lembretes e confirma consultas com 2 cliques.", color: "green" },
                { Icon: Users, title: "CRM Completo", desc: "Funil de clientes, histórico, tarefas, aniversários e reengajamento automático.", color: "blue" },
                { Icon: ShoppingBag, title: "Loja Virtual", desc: "Venda produtos com PIX automático, estoque, cupons e checkout completo.", color: "purple" },
                { Icon: TrendingUp, title: "Relatórios & DRE", desc: "Receita, ticket médio, desempenho por profissional e financeiro completo.", color: "amber" },
                { Icon: ShieldCheck, title: "Prontuários & Docs", desc: "Prontuário eletrônico, anamnese digital, receituário e PDF.", color: "teal" },
              ].map(({ Icon, title, desc, color }, i) => {
                const c = { rose: "bg-rose-50 text-rose-600", green: "bg-green-50 text-green-600", blue: "bg-blue-50 text-blue-600", purple: "bg-purple-50 text-purple-600", amber: "bg-amber-50 text-amber-600", teal: "bg-teal-50 text-teal-600" }[color];
                return (
                  <FloatingCard key={title} delay={i * 0.1} className="group p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all bg-white">
                    <div className={`h-12 w-12 rounded-xl ${c} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}><Icon className="h-6 w-6" /></div>
                    <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{desc}</p>
                  </FloatingCard>
                );
              })}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="precos" className="py-24 bg-slate-50">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
              <h2 className="text-4xl font-black text-slate-900 mb-4">Planos para todo tipo de negócio</h2>
              <p className="text-slate-600">30 dias grátis. Sem cartão. Cancele quando quiser.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto" style={{ perspective: "1200px" }}>
              {[
                { tag: "Agenda", tagColor: "text-rose-500", name: "Só Agenda", price: "64,99", desc: "Para autônomos e pequenos negócios", features: [
                  "✓ Agendamento online 24h",
                  "✓ Até 3 profissionais",
                  "✓ Ficha de clientes básica",
                  "✓ Anamnese digital",
                  "✓ Fotos antes e depois",
                  "✓ Programa de fidelidade",
                  "✓ Avaliações dos clientes",
                  "✓ Bot WhatsApp simples",
                  "✓ Confirmação automática",
                  "✓ Relatório básico",
                  "✗ CRM completo",
                  "✗ Sinal antecipado",
                  "✗ Orçamentos e cobranças",
                  "✗ Loja virtual",
                ], cta: "Testar 30 dias grátis", ctaStyle: "border-2 border-slate-200 text-slate-700 hover:border-rose-500 hover:text-rose-600", highlight: false, badge: null, delay: 0 },
                { tag: "Mais popular", tagColor: "text-rose-200", name: "Agenda Pro", price: "89,99", desc: "Para negócios em crescimento", features: [
                  "✓ Tudo do Só Agenda",
                  "✓ Profissionais ilimitados",
                  "✓ CRM completo com funil",
                  "✓ Prontuários e fichas completos",
                  "✓ Orçamentos com PIX/cartão/boleto",
                  "✓ Pacotes e planos de tratamento",
                  "✓ Documentos e receituário",
                  "✓ Sinal antecipado no agendamento",
                  "✓ Bot WhatsApp inteligente (IA)",
                  "✓ Relatório financeiro completo",
                  "✓ Suporte prioritário",
                  "✓ Produtos e controle de vendas",
                  "✗ Loja virtual online (checkout)",
                ], cta: "Testar 30 dias grátis", ctaStyle: "bg-white text-rose-600 font-bold hover:bg-rose-50", highlight: true, badge: "⭐ MAIS POPULAR", delay: 0.1 },
                { tag: "Loja", tagColor: "text-purple-500", name: "Só Loja", price: "64,99", desc: "Para quem vende produtos online", features: [
                  "✓ Loja virtual completa",
                  "✓ PIX automático (Asaas)",
                  "✓ Controle de estoque",
                  "✓ Cupons de desconto",
                  "✓ Checkout cartão/boleto",
                  "✓ Gerador de story",
                  "✓ Avaliações de produtos",
                  "✓ Relatório básico",
                  "✗ Agendamento",
                  "✗ CRM",
                  "✗ Bot WhatsApp",
                  "✗ Prontuários",
                ], cta: "Testar 30 dias grátis", ctaStyle: "border-2 border-slate-200 text-slate-700 hover:border-purple-500 hover:text-purple-600", highlight: false, badge: null, delay: 0.2 },
                { tag: "Completo", tagColor: "text-amber-400", name: "Agenda + Loja", price: "159,90", desc: "O plano mais completo", features: [
                  "✓ Tudo do Agenda Pro",
                  "✓ Loja virtual completa",
                  "✓ PIX automático Asaas",
                  "✓ Cupons de desconto",
                  "✓ Bot WhatsApp IA + notif. push",
                  "✓ Relatório DRE completo",
                  "✓ Split de pagamento automático",
                  "✓ Suporte VIP",
                ], cta: "Testar 30 dias grátis", ctaStyle: "bg-rose-600 text-white font-bold hover:bg-rose-700", highlight: false, badge: "👑 TUDO INCLUSO", delay: 0.3 },
              ].map(({ tag, tagColor, name, price, desc, features, cta, ctaStyle, highlight, badge, delay }) => (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay, duration: 0.5 }}
                  whileHover={{ y: -8, rotateX: 2 }}
                  style={{ zIndex: highlight ? 10 : 1 }}
                  className={`relative rounded-3xl p-7 flex flex-col transition-all duration-300 ${highlight ? "bg-gradient-to-br from-rose-600 to-rose-800 shadow-2xl shadow-rose-300/50" : "bg-white border border-slate-200 shadow-md hover:shadow-xl"}`}
                >
                  {badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap shadow-lg">{badge}</div>
                  )}
                  <div className="mb-5">
                    <span className={`text-xs font-bold uppercase tracking-wider mb-2 block ${tagColor}`}>{tag}</span>
                    <h3 className={`text-xl font-bold mb-1 ${highlight ? "text-white" : "text-slate-900"}`}>{name}</h3>
                    <p className={`text-sm ${highlight ? "text-rose-200" : "text-slate-500"}`}>{desc}</p>
                  </div>
                  <div className="mb-6">
                    <span className={`text-5xl font-black leading-none ${highlight ? "text-white" : "text-slate-900"}`}>R$ {price}</span>
                    <span className={`text-sm ml-1 ${highlight ? "text-rose-200" : "text-slate-500"}`}>/mês</span>
                  </div>
                  <ul className="space-y-2.5 mb-7 flex-1">
                    {features.map(f => (
                      <li key={f} className={`flex items-start gap-2 text-sm ${f.startsWith("✗") ? "opacity-30" : ""} ${highlight ? "text-rose-100" : "text-slate-600"}`}>
                        <span className={`mt-0.5 shrink-0 font-bold ${f.startsWith("✓") ? (highlight ? "text-rose-200" : "text-emerald-500") : ""}`}>{f[0]}</span>
                        {f.slice(2)}
                      </li>
                    ))}
                  </ul>
                  <Link to="/cadastro-salao">
                    <button className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${ctaStyle}`}>{cta}</button>
                  </Link>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-sm text-slate-500 mt-10">Todos os planos incluem 30 dias de teste grátis. Sem cartão. Cancele quando quiser.</p>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
              <h2 className="text-4xl font-black text-slate-900 mb-4">O que nossos clientes dizem</h2>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                { name: "Ana Carolina", role: "Salão de Beleza", text: "Minha agenda estava uma bagunça. Hoje tudo é automático — confirmação, lembrete e pagamento. Nunca mais perdi cliente por falta de confirmação.", delay: 0 },
                { name: "Dr. Roberto Lima", role: "Dentista", text: "O prontuário eletrônico e a anamnese digital mudaram completamente minha rotina. Meus pacientes adoram poder preencher antes da consulta.", delay: 0.1 },
                { name: "Carla Santos", role: "Personal Trainer", text: "Vendi meu primeiro pacote de 10 aulas pelo sistema e o cliente pagou via PIX na hora. Simples assim!", delay: 0.2 },
              ].map(({ name, role, text, delay }) => (
                <FloatingCard key={name} delay={delay} className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <div className="flex gap-1 mb-4">{[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}</div>
                  <p className="text-slate-700 text-sm leading-relaxed mb-4">"{text}"</p>
                  <div><p className="font-bold text-slate-900 text-sm">{name}</p><p className="text-slate-500 text-xs">{role}</p></div>
                </FloatingCard>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="py-24 bg-slate-900 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-96 h-96 bg-rose-900/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-rose-900/20 rounded-full blur-3xl" />
          </div>
          <div className="container mx-auto px-4 text-center relative z-10">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="text-2xl sm:text-3xl lg:text-5xl font-black text-white mb-4">Pronto para digitalizar seu negócio?</h2>
              <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">30 dias grátis, sem cartão. Configure em menos de 5 minutos.</p>
              <Link to="/cadastro-salao">
                <button className="group inline-flex items-center gap-2 bg-rose-600 text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-rose-700 transition-all hover:-translate-y-1 shadow-2xl shadow-rose-900/50">
                  Criar minha conta grátis <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
              <p className="text-slate-500 text-sm mt-4">Sem cartão · Sem contrato · Cancele quando quiser</p>
            </motion.div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="bg-slate-950 text-slate-400 py-12">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <span className="text-white font-black text-xl">Bella <span className="text-rose-500">&</span> Chic</span>
                <p className="text-xs mt-1">{`© ${new Date().getFullYear()} Bella & Chic SaaS. Todos os direitos reservados.`}</p>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <Link to="/privacidade" className="hover:text-white transition-colors">Privacidade</Link>
                <Link to="/termos" className="hover:text-white transition-colors">Termos</Link>
                <Link to="/login" className="hover:text-white transition-colors">Entrar</Link>
                <Link to="/app" className="hover:text-white transition-colors flex items-center gap-1">📱 Baixar App</Link>
                <SupportMenu />
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
};
