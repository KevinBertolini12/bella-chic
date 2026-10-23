import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { SalonProvider, useSalon } from './contexts/SalonContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LGPDConsent } from './components/LGPDConsent';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Toaster } from './components/ui/sonner';
import { Loader2 } from 'lucide-react';
import { getDocFromServer, doc } from 'firebase/firestore';
import { db } from './firebase';
import { Button } from './components/ui/button';

// ── Páginas leves — carregam junto (necessárias logo de início)
import { Login } from './pages/Login';
import { LandingPage } from './pages/LandingPage';
import { Home } from './pages/Home';

// ── Páginas pesadas — lazy (só carregam quando o usuário navegar até elas)
const About                = lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const Contact              = lazy(() => import('./pages/Contact').then(m => ({ default: m.Contact })));
const Services             = lazy(() => import('./pages/Services').then(m => ({ default: m.Services })));
const Team                 = lazy(() => import('./pages/Team').then(m => ({ default: m.Team })));
const Booking              = lazy(() => import('./pages/Booking').then(m => ({ default: m.Booking })));
const Shop                 = lazy(() => import('./pages/Shop').then(m => ({ default: m.Shop })));
const Cart                 = lazy(() => import('./pages/Cart').then(m => ({ default: m.Cart })));
const Checkout             = lazy(() => import('./pages/Checkout').then(m => ({ default: m.Checkout })));
const ClientDashboard      = lazy(() => import('./pages/ClientDashboard').then(m => ({ default: m.ClientDashboard })));
const ProfessionalDashboard= lazy(() => import('./pages/ProfessionalDashboard').then(m => ({ default: m.ProfessionalDashboard })));
const AdminDashboard       = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const SalonRegistration    = lazy(() => import('./pages/SalonRegistration').then(m => ({ default: m.SalonRegistration })));
const SuperAdminDashboard  = lazy(() => import('./pages/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
const PrivacyPolicy        = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const ServicesPublic       = lazy(() => import('./pages/ServicesPublic').then(m => ({ default: m.ServicesPublic })));
const TermsOfUse           = lazy(() => import('./pages/TermsOfUse').then(m => ({ default: m.TermsOfUse })));
const AppDownload          = lazy(() => import('./pages/AppDownload').then(m => ({ default: m.AppDownload })));
const GuestAppointments    = lazy(() => import('./pages/GuestAppointments').then(m => ({ default: m.GuestAppointments })));
const RegistrationSuccess  = lazy(() => import('./pages/RegistrationSuccess').then(m => ({ default: m.RegistrationSuccess })));
const Avaliacoes           = lazy(() => import('./pages/Avaliacoes').then(m => ({ default: m.Avaliacoes })));
const CRMProDashboard      = lazy(() => import('./pages/CRMProDashboard'));

// ── Anamnese pública
import { AnamnesePublicForm } from './components/admin/AnamneseTab';
const AnamneseRoute = () => {
  const { salonId, templateId } = useParams<{ salonId: string; templateId: string }>();
  if (!salonId || !templateId) return null;
  return <AnamnesePublicForm salonId={salonId} templateId={templateId} />;
};

// ── Loading spinner usado pelo Suspense
const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-slate-900">Algo deu errado</h2>
          <p className="mb-6 max-w-md text-slate-600">
            Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
          </p>
          <pre className="mb-6 max-w-full overflow-auto rounded bg-slate-100 p-4 text-left text-xs">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <Button onClick={() => window.location.reload()}>Recarregar Página</Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// SaaS Landing Page (Platform Home) – mantido
const PlatformHome = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 text-center">
    <h1 className="mb-4 text-4xl font-bold text-slate-900">Bella & Chic SaaS Platform</h1>
    <p className="mb-8 max-w-2xl text-xl text-slate-600">
      A solução completa para gestão de salões de beleza e boutiques.
      Crie seu próprio salão online em minutos.
    </p>
    <div className="flex gap-4">
      <a
        href="/login"
        className="rounded-lg bg-primary px-6 py-3 font-medium text-white transition-colors hover:bg-primary/90"
      >
        Entrar
      </a>
      <a
        href="/cadastro-salao"
        className="rounded-lg bg-rose-600 px-6 py-3 font-medium text-white transition-colors hover:bg-rose-700"
      >
        Criar meu Salão
      </a>
      <a
        href="/s/bella-chic"
        className="rounded-lg border border-slate-200 bg-white px-6 py-3 font-medium text-slate-900 transition-colors hover:bg-slate-50"
      >
        Ver Exemplo
      </a>
    </div>
  </div>
);

const SalonLayout = () => {
  const { loading, error, salon } = useSalon();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !salon) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-8 text-center">
        <h2 className="mb-2 text-2xl font-bold text-slate-900">Salão não encontrado</h2>
        <p className="mb-6 text-slate-600">O salão que você está procurando não existe ou foi removido.</p>
        <a href="/" className="text-primary hover:underline">
          Voltar para a plataforma
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/servicos" element={<Services />} />
          <Route path="/equipe" element={<Team />} />
          <Route path="/loja" element={<Shop />} />
          <Route path="/contato" element={<Contact />} />
          <Route path="/sobre" element={<About />} />
          <Route path="/agendamento" element={<Booking />} />
          <Route path="/carrinho" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route
            path="/cliente"
            element={
              <ProtectedRoute allowedRoles={['CLIENT']} requireSalonMatch>
                <ClientDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profissional"
            element={
              <ProtectedRoute allowedRoles={['PROFESSIONAL']} requireSalonMatch>
                <ProfessionalDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['SALON_ADMIN']} requireSalonMatch>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/meus-agendamentos" element={<GuestAppointments />} />
          <Route path="/avaliacoes" element={<Avaliacoes />} />
          <Route path="/bem-vindo" element={<RegistrationSuccess />} />
          <Route path="/privacidade" element={<PrivacyPolicy />} />
          <Route path="/termos" element={<TermsOfUse />} />
          <Route path="/app" element={<AppDownload />} />

          <Route path="/s/:slug/servicos" element={<ServicesPublic />} />
                    <Route path="/anamnese/:salonId/:templateId" element={
                      <AnamneseRoute />
                    } />
        </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
};

export default function App() {
  React.useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error('Please check your Firebase configuration.');
        }
      }
    }
    testConnection();
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <AuthProvider>
          <Router>
            <SalonProvider>
              <SettingsProvider>
                <CartProvider>
                  <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/cadastro-salao" element={<SalonRegistration />} />
                    <Route
                      path="/super-admin"
                      element={
                        <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                          <SuperAdminDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/s/:slug/*" element={<SalonLayout />} />
                    <Route path="/privacidade" element={<PrivacyPolicy />} />
                    <Route path="/termos" element={<TermsOfUse />} />
                    <Route path="/anamnese/:salonId/:templateId" element={
                      <AnamneseRoute />
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  <Toaster />
                </CartProvider>
              </SettingsProvider>
            </SalonProvider>
          </Router>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}