import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSalon } from '../contexts/SalonContext';

type AllowedRole = 'SUPER_ADMIN' | 'SALON_ADMIN' | 'PROFESSIONAL' | 'CLIENT';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
  /** Se true, valida que o salonId do perfil bate com o salão da rota */
  requireSalonMatch?: boolean;
  skipSalonCheck?: boolean;
}

export const ProtectedRoute = ({
  children,
  allowedRoles,
  requireSalonMatch = false,
  skipSalonCheck = false,
}: ProtectedRouteProps) => {
  const { user, profile, loading: authLoading, isSuperAdmin } = useAuth();
  const { salon, salonId, loading: salonLoading } = useSalon();
  const location = useLocation();

  // Aguarda auth + salão carregarem
  if (authLoading || (salonLoading && !skipSalonCheck)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Não autenticado → manda para login salvando a rota de origem
  if (!user || !profile) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Super Admin passa por tudo
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Papel não permitido → redireciona para o painel correto do usuário
  if (allowedRoles && !allowedRoles.includes(profile.role as AllowedRole)) {
    // Se está vinculado a um salão, tenta redirecionar para o painel certo
    if (profile.salonId && salon?.slug) {
      if (profile.role === 'SALON_ADMIN') return <Navigate to={`/s/${salon.slug}/admin`} replace />;
      if (profile.role === 'PROFESSIONAL') return <Navigate to={`/s/${salon.slug}/profissional`} replace />;
      if (profile.role === 'CLIENT') return <Navigate to={`/s/${salon.slug}`} replace />;
    }

    // Sem salão vinculado → home da plataforma
    return <Navigate to="/" replace />;
  }

  // Verifica se o salão do perfil bate com o salão da rota atual
  if (requireSalonMatch && salonId) {
    if (profile.salonId && profile.salonId !== salonId) {
      // Usuário de outro salão tentando entrar no painel errado
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};
