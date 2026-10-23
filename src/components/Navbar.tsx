import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ShoppingCart, User, LogOut, Menu, X, Shield, Store, Calendar, Star } from 'lucide-react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useSettings } from '../contexts/SettingsContext';
import { useSalon } from '../contexts/SalonContext';
import { Button } from './ui/button';
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { PushNotificationButton } from './PushNotificationButton';

export const BellaChicLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="120" height="34" viewBox="0 0 340 96" className={className} aria-label="Bella &amp; Chic">
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

export const Navbar = () => {
  const { user, isSuperAdmin, isSalonAdmin, isProfessional } = useAuth();
  const { totalItems } = useCart();
  const { settings } = useSettings();
  const { plan } = useSalon(); // <-- adicionado
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  const handleLogout = async () => {
    closeMenu();
    try {
      await signOut(auth);
      // Limpa todo estado local
      localStorage.clear();
      sessionStorage.clear();
      // Espera Firebase confirmar logout via onAuthStateChanged
      // antes de redirecionar — evita auth/internal-error no próximo login
      await new Promise<void>((resolve) => {
        const unsub = auth.onAuthStateChanged((u) => {
          if (!u) { unsub(); resolve(); }
        });
        setTimeout(() => { unsub(); resolve(); }, 3000);
      });
      window.location.href = '/login';
    } catch (error) {
      console.error('Erro ao sair:', error);
      // Força o redirect mesmo se signOut falhar
      window.location.href = '/login';
    }
  };

  const baseUrl = slug ? `/s/${slug}` : '';

  const navLinks = slug
    ? [
        { name: 'Início',       path: `${baseUrl}/` },
        { name: 'Serviços',     path: `${baseUrl}/servicos` },
        { name: 'Equipe',       path: `${baseUrl}/equipe` },
        // Condição para exibir a loja apenas se o plano tiver hasStore = true
        ...(plan?.features.hasStore ? [{ name: 'Loja', path: `${baseUrl}/loja` }] : []),
        { name: 'Agendamento',  path: `${baseUrl}/agendamento` },
        { name: 'Sobre',        path: `${baseUrl}/sobre` },
      ]
    : [];

  // Link rápido para portal sem conta — visível para usuários não logados
  const guestAppointmentsLink = slug && !user
    ? `${baseUrl}/meus-agendamentos`
    : null;

  const brandName = settings?.branding?.headerName || 'Bella & Chic';
  const logoURL   = settings?.branding?.logoURL;
  const { salonId } = useSalon();
  const [avgRating, setAvgRating] = useState<{ avg: number; count: number } | null>(null);

  useEffect(() => {
    if (!salonId) return;
    getDocs(query(collection(db, `salons/${salonId}/reviews`))).then(snap => {
      if (snap.empty) return;
      const reviews = snap.docs.map(d => d.data());
      const avg = reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
      setAvgRating({ avg, count: reviews.length });
    }).catch(() => {});
  }, [salonId]);

  const getPanelLink = () => {
    if (isSuperAdmin) return '/super-admin';
    if (!slug) return '/';
    if (isSalonAdmin) return `${baseUrl}/admin`;
    if (isProfessional) return `${baseUrl}/profissional`;
    return `${baseUrl}/cliente`;
  };

  const getPanelLabel = () => {
    if (isSuperAdmin) return 'Super Admin';
    if (isSalonAdmin) return 'Painel Admin';
    if (isProfessional) return 'Meu Painel';
    return 'Minha Conta';
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname === path.replace(/\/$/, '');

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">

        <Link to={baseUrl || '/'} className="flex items-center gap-2" onClick={closeMenu}>
          {logoURL ? (
            <img src={logoURL} alt={brandName} className="h-8 w-auto object-contain" />
          ) : (brandName === 'Bella & Chic' || !brandName) ? (
            <BellaChicLogo />
          ) : (
            <span className="text-2xl font-bold tracking-tighter text-primary">{brandName}</span>
          )}
          {avgRating && avgRating.count >= 3 && (
            <a
              href={`${baseUrl}/avaliacoes`}
              onClick={closeMenu}
              className="hidden sm:flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
              title={`${avgRating.count} avaliações`}
            >
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {(avgRating?.avg ?? 0).toFixed(1)}
              <span className="text-amber-500/70">({avgRating.count})</span>
            </a>
          )}
        </Link>

        <div className="hidden md:flex md:items-center md:gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:text-primary',
                isActive(link.path) ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {link.name}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {slug && (
            <Link to={`${baseUrl}/carrinho`} className="relative p-2" aria-label="Carrinho">
              <ShoppingCart className="h-5 w-5" />
              {totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {totalItems > 9 ? '9+' : totalItems}
                </span>
              )}
            </Link>
          )}

          {guestAppointmentsLink && (
            <a href={guestAppointmentsLink} className="hidden md:block">
              <Button variant="outline" size="sm">Meus Agendamentos</Button>
            </a>
          )}

          {user && slug && (
            <div className="hidden md:block">
              <PushNotificationButton />
            </div>
          )}

          {user ? (
            <div className="hidden md:flex md:items-center md:gap-1">
              {isSuperAdmin && (
                <Link to="/super-admin">
                  <Button variant="outline" size="sm" className="border-primary text-primary">
                    <Shield className="mr-1.5 h-3.5 w-3.5" />
                    Super Admin
                  </Button>
                </Link>
              )}

              {slug && (
                <Link to={getPanelLink()}>
                  <Button variant="ghost" size="sm">
                    {isSalonAdmin || isSuperAdmin
                      ? <><Store className="mr-1.5 h-3.5 w-3.5" />{isSuperAdmin ? 'Painel Salão' : 'Admin'}</>
                      : <><User className="mr-1.5 h-3.5 w-3.5" />{getPanelLabel()}</>}
                  </Button>
                </Link>
              )}

              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Link to="/login" className="hidden md:block">
              <Button size="sm">Entrar</Button>
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 1, height: 1 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 1, height: 1 }}
            className="overflow-hidden border-b bg-background md:hidden"
          >
            <div className="flex flex-col gap-1 p-4">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={cn(
                    'rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-muted',
                    isActive(link.path) ? 'text-primary' : 'text-foreground'
                  )}
                  onClick={closeMenu}
                >
                  {link.name}
                </Link>
              ))}

              <div className="my-2 border-t" />

              {user ? (
                <>
                  {isSuperAdmin && (
                    <Link
                      to="/super-admin"
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium text-primary hover:bg-muted"
                      onClick={closeMenu}
                    >
                      <Shield className="h-4 w-4" /> Super Admin
                    </Link>
                  )}
                  {slug && (
                    <Link
                      to={getPanelLink()}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
                      onClick={closeMenu}
                    >
                      <User className="h-4 w-4" /> {getPanelLabel()}
                    </Link>
                  )}
                  {slug && (
                    <Link
                      to={`${baseUrl}/carrinho`}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
                      onClick={closeMenu}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Carrinho
                      {totalItems > 0 && (
                        <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                          {totalItems}
                        </span>
                      )}
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium text-destructive hover:bg-muted"
                  >
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </>
              ) : (
                <>
                  {guestAppointmentsLink && (
                    <Link
                      to={guestAppointmentsLink}
                      className="rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
                      onClick={closeMenu}
                    >
                      Meus Agendamentos
                    </Link>
                  )}
                  <Link
                    to="/login"
                    className="rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
                    onClick={closeMenu}
                  >
                    Entrar
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};