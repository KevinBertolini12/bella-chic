import React, { useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../firebase';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { salonService } from '../services/salonService';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SEO } from '../components/SEO';

type Mode = 'login' | 'register';

function extractSalonSlug(pathname: string): string | null {
  const parts = pathname.split('/');
  if (parts[1] === 's' && parts[2]) return parts[2];
  return null;
}

export const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading } = useAuth();

  const [loading, setLoading] = React.useState(false);
  const redirectingRef = useRef(false);
  const [mode, setMode] = React.useState<Mode>('login');

  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const from = (location.state as any)?.from?.pathname as string | undefined;
  const fromSalonSlug = from ? extractSalonSlug(from) : null;

  React.useEffect(() => {
    const redirectUser = async () => {
      // Usa ref para guard — evita race condition se o auth state mudar 2x rápido
      if (authLoading || redirectingRef.current) return;
      if (!user || !profile) return;

      redirectingRef.current = true;
      try {
        if (from) {
          navigate(from, { replace: true });
          return;
        }

        if (profile.role === 'SUPER_ADMIN') {
          navigate('/super-admin', { replace: true });
          return;
        }

        if (profile.salonId) {
          const salon = await salonService.getSalonById(profile.salonId);
          if (salon?.slug) {
            if (profile.role === 'SALON_ADMIN') {
              navigate(`/s/${salon.slug}/admin`, { replace: true });
              return;
            }
            if (profile.role === 'PROFESSIONAL') {
              navigate(`/s/${salon.slug}/profissional`, { replace: true });
              return;
            }
            if (profile.role === 'CLIENT') {
              navigate(`/s/${salon.slug}/cliente`, { replace: true });
              return;
            }
          }
        }

        if (fromSalonSlug) {
          navigate(`/s/${fromSalonSlug}`, { replace: true });
          return;
        }

        if (!profile.salonId) {
          navigate('/cadastro-salao', { replace: true });
          return;
        }

        navigate('/', { replace: true });
      } catch (error) {
        console.error('Erro ao redirecionar após login:', error);
        toast.error('Erro ao carregar sua conta. Tente novamente.');
        redirectingRef.current = false; // permite tentar de novo em caso de erro
      }
    };

    redirectUser();
  }, [user, profile, authLoading]);

  const resetClientSession = async () => {
    try {
      await signOut(auth);
      // Aguarda o Firebase propagar o estado de logout completamente
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch { /* já deslogado */ }
    localStorage.removeItem('cart');
    localStorage.removeItem('cart_shipping_method');
    sessionStorage.clear();
  };

  const waitForSignOut = (): Promise<void> =>
    new Promise((resolve) => {
      if (!auth.currentUser) { resolve(); return; }
      const unsub = auth.onAuthStateChanged((u) => {
        if (!u) { unsub(); resolve(); }
      });
      // Timeout de segurança: 4s
      setTimeout(() => { unsub(); resolve(); }, 4000);
    });

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      // Garante que o Firebase está 100% limpo antes do popup.
      // Usar onAuthStateChanged ao invés de setTimeout — é o único jeito
      // confiável de saber que o estado interno do Firebase foi zerado.
      if (auth.currentUser) {
        await signOut(auth).catch(() => {});
        await waitForSignOut();
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      provider.addScope('profile');
      provider.addScope('email');
      await signInWithPopup(auth, provider);
      toast.success('Login realizado com sucesso!');
    } catch (error: any) {
      console.error('[Google Login]', error?.code, error?.message);
      const code = error?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return; // silencioso — usuário fechou o popup
      }
      if (code === 'auth/popup-blocked') {
        toast.error('Popup bloqueado. Permita popups para este site e tente novamente.');
        return;
      }
      if (code === 'auth/internal-error' || code === 'auth/network-request-failed') {
        toast.error('Erro de conexão com o Google. Verifique sua internet e tente novamente.');
        return;
      }
      toast.error('Erro ao entrar com Google. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetClientSession();
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      toast.success('Login realizado com sucesso!');
    } catch (error: any) {
      console.error(error);
      if (error?.code === 'auth/invalid-credential') {
        toast.error('Email ou senha inválidos.');
      } else if (error?.code === 'auth/user-not-found') {
        toast.error('Usuário não encontrado.');
      } else if (error?.code === 'auth/wrong-password') {
        toast.error('Senha incorreta.');
      } else {
        toast.error('Erro ao entrar com email e senha.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) { toast.error('Digite seu nome.'); return; }
    if (!formData.email.trim()) { toast.error('Digite seu email.'); return; }
    if (formData.password.length < 6) { toast.error('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (formData.password !== formData.confirmPassword) { toast.error('As senhas não coincidem.'); return; }

    setLoading(true);
    try {
      await resetClientSession();
      const cred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      if (cred.user) {
        await updateProfile(cred.user, { displayName: formData.name });
      }
      toast.success('Conta criada com sucesso!');
    } catch (error: any) {
      console.error(error);
      if (error?.code === 'auth/email-already-in-use') {
        toast.error('Esse email já está em uso.');
      } else if (error?.code === 'auth/invalid-email') {
        toast.error('Email inválido.');
      } else if (error?.code === 'auth/weak-password') {
        toast.error('Senha muito fraca.');
      } else {
        toast.error('Erro ao criar conta.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      toast.error('Digite seu email para recuperar a senha.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, formData.email);
      toast.success('Enviamos um link para recuperar sua senha. Verifique seu email.');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/user-not-found') {
        toast.error('Nenhum usuário encontrado com este email.');
      } else {
        toast.error('Erro ao enviar email de recuperação.');
      }
    }
  };

  const handleResetSession = async () => {
    try {
      await signOut(auth).catch(() => {});
      localStorage.clear();
      sessionStorage.clear();
      toast.success('Sessão limpa. Agora você pode entrar com outra conta.');
      window.location.href = '/login';
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível limpar a sessão.');
    }
  };

  const isDisabled = loading || authLoading || redirectingRef.current;

  return (
    <>
      <SEO title="Entrar — Bella & Chic" description="Acesse sua conta na plataforma Bella & Chic" />
      <div className="min-h-screen flex bg-slate-950 overflow-hidden">

        {/* ── LEFT: 3D visual panel ── */}
        <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12 overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-rose-950 via-slate-950 to-slate-900" />
          {/* Grid lines */}
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(225,29,72,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(225,29,72,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px'
          }} />
          {/* Glow orbs */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-rose-600/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-rose-500/10 blur-3xl" />

          <div className="relative z-10 max-w-lg">
            {/* Logo */}
            <div className="mb-12">
              <div className="inline-flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-rose-600 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.5 3C4.6 3 3 4.6 3 6.5V11h8V3H6.5zM13 3v8h8V6.5C21 4.6 19.4 3 17.5 3H13zM3 13v4.5C3 19.4 4.6 21 6.5 21H11v-8H3zM13 21h4.5c1.9 0 3.5-1.6 3.5-3.5V13h-8v8z"/>
                  </svg>
                </div>
                <span className="text-2xl font-black text-white tracking-tight">Bella <span className="text-rose-500">&</span> Chic</span>
              </div>
              <h1 className="text-4xl font-black text-white leading-tight">
                Seu negócio no<br /><span className="text-rose-500">automático.</span>
              </h1>
              <p className="text-slate-400 mt-4 text-lg leading-relaxed">
                Agendamento, bot WhatsApp com IA, financeiro e muito mais em um só lugar.
              </p>
            </div>

            {/* Feature cards — 3D stack effect */}
            <div className="space-y-3">
              {[
                { icon: '📅', title: 'Agendamento online 24h', desc: 'Clientes agendam pelo link ou WhatsApp' },
                { icon: '🤖', title: 'Bot WhatsApp com IA', desc: 'Responde e agenda automaticamente' },
                { icon: '💰', title: 'Financeiro completo', desc: 'PIX, dinheiro e cartão separados' },
              ].map((feat, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 backdrop-blur-sm"
                  style={{ transform: `perspective(1000px) rotateX(${i * -1}deg) translateZ(${i * 2}px)` }}
                >
                  <span className="text-2xl">{feat.icon}</span>
                  <div>
                    <p className="text-white font-bold text-sm">{feat.title}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{feat.desc}</p>
                  </div>
                  <div className="ml-auto w-2 h-2 rounded-full bg-emerald-500" />
                </div>
              ))}
            </div>

            <p className="text-slate-600 text-xs mt-8">
              30 dias grátis · Sem cartão · Cancela quando quiser
            </p>
          </div>
        </div>

        {/* ── RIGHT: Form panel ── */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white">
          <div className="w-full max-w-md">

            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-2 mb-8">
              <div className="h-8 w-8 rounded-lg bg-rose-600 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6.5 3C4.6 3 3 4.6 3 6.5V11h8V3H6.5zM13 3v8h8V6.5C21 4.6 19.4 3 17.5 3H13zM3 13v4.5C3 19.4 4.6 21 6.5 21H11v-8H3zM13 21h4.5c1.9 0 3.5-1.6 3.5-3.5V13h-8v8z"/></svg>
              </div>
              <span className="text-xl font-black text-slate-900">Bella <span className="text-rose-600">&</span> Chic</span>
            </div>

            <h2 className="text-2xl font-black text-slate-900 mb-1">
              {mode === 'login' ? 'Bem-vindo de volta 👋' : 'Criar sua conta'}
            </h2>
            <p className="text-slate-500 text-sm mb-8">
              {mode === 'login'
                ? 'Entre para acessar seu painel'
                : 'Comece grátis, sem cartão, cancele quando quiser'}
            </p>

            {/* Mode toggle */}
            <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
              {(['login', 'register'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              ))}
            </div>

            {/* Google button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading || authLoading}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all text-sm disabled:opacity-50 mb-4"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar com Google
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">ou com email</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Email form */}
            <form onSubmit={mode === 'login' ? handleEmailLogin : handleEmailRegister} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nome</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    placeholder="Seu nome"
                    className="mt-1.5 w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-rose-500 focus:outline-none text-sm transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  placeholder="seuemail@exemplo.com"
                  className="mt-1.5 w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-rose-500 focus:outline-none text-sm transition-colors"
                  autoComplete={mode === 'login' ? 'email' : 'new-email'}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Senha</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder={mode === 'login' ? 'Sua senha' : 'Mínimo 6 caracteres'}
                  className="mt-1.5 w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-rose-500 focus:outline-none text-sm transition-colors"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
              {mode === 'register' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Confirmar senha</label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={e => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Repita a senha"
                    className="mt-1.5 w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-rose-500 focus:outline-none text-sm transition-colors"
                    autoComplete="new-password"
                  />
                </div>
              )}

              {mode === 'login' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || authLoading}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 rounded-xl transition-all text-sm mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {(loading || authLoading) ? (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : null}
                {mode === 'login' ? 'Entrar na minha conta' : 'Criar conta grátis →'}
              </button>
            </form>

            {/* Quer cadastrar salão link */}
            <div className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-xl">
              <p className="text-sm text-slate-600 text-center">
                Quer usar o sistema no seu próprio salão?{' '}
                <Link to="/cadastro-salao" className="text-rose-600 font-bold hover:underline">
                  Cadastre seu negócio →
                </Link>
              </p>
            </div>

            <p className="text-center text-xs text-slate-400 mt-5">
              Ao continuar, você concorda com os{' '}
              <Link to="/termos" className="underline hover:text-slate-600">termos de uso</Link>
              {' '}e{' '}
              <Link to="/privacidade" className="underline hover:text-slate-600">política de privacidade</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
