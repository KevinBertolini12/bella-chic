import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Users, Store, CreditCard, TrendingUp, Search, Plus, Edit, Trash2,
  CheckCircle, XCircle, Clock, Filter, Database, RefreshCw, Copy,
  Settings, ExternalLink, Loader2, LogOut, BarChart2, Home, Shield,
  Scissors, Stethoscope, Dumbbell, Briefcase, ChevronLeft, ChevronRight,
  Activity, DollarSign, Building, Link2, X, Check, AlertTriangle,
  UserCheck, Package, Globe, Zap, Trophy,
  MessageCircle, Wifi, WifiOff, QrCode,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Separator } from '../components/ui/separator';
import { Tabs, TabsContent } from '../components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { superAdminService } from '../services/superAdminService';
import { Salon, Plan, Subscription, UserProfile, BusinessType } from '../types';
import { toast } from 'sonner';
import { seedData } from '../utils/seedData';
import { seedTwoSalons } from '../utils/testIsolation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { platformSettingsService, PlatformSettings } from '../services/platformSettingsService';
import { useNavigate } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { cn } from '../lib/utils';

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo', TRIAL: 'Teste', EXPIRED: 'Expirado',
  BLOCKED: 'Bloqueado', CANCELLED: 'Cancelado', PENDING: 'Pendente',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  TRIAL:     'bg-amber-100 text-amber-700 border-amber-200',
  EXPIRED:   'bg-red-100 text-red-700 border-red-200',
  BLOCKED:   'bg-red-200 text-red-800 border-red-300',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  PENDING:   'bg-orange-100 text-orange-700 border-orange-200',
};

const BUSINESS_TYPES: { value: BusinessType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'beauty',   label: 'Beleza & Estética',   icon: <Scissors className="h-4 w-4" />,    color: 'text-rose-600' },
  { value: 'health',   label: 'Saúde & Clínicas',    icon: <Stethoscope className="h-4 w-4" />, color: 'text-blue-600' },
  { value: 'fitness',  label: 'Fitness & Bem-estar',  icon: <Dumbbell className="h-4 w-4" />,   color: 'text-green-600' },
  { value: 'services', label: 'Serviços em Geral',   icon: <Briefcase className="h-4 w-4" />,   color: 'text-purple-600' },
  { value: 'sports',   label: 'Esportes & Lazer',   icon: <Trophy className="h-4 w-4" />,      color: 'text-emerald-600' },
];

const PLAN_FEATURES_LABELS: { key: string; label: string }[] = [
  { key: 'hasBooking',              label: 'Agendamento' },
  { key: 'hasStore',                label: 'Loja Virtual' },
  { key: 'hasReports',              label: 'Relatórios (DRE)' },
  { key: 'hasCRM',                  label: 'CRM Completo' },
  { key: 'hasDeposit',              label: 'Sinal Antecipado' },
  { key: 'hasQuotes',               label: 'Orçamentos' },
  { key: 'hasPackages',             label: 'Pacotes/Programas' },
  { key: 'hasDocuments',            label: 'Documentos/Receituário' },
  { key: 'hasAnamnese',             label: 'Anamnese Digital' },
  { key: 'hasBeforeAfter',          label: 'Fotos Antes/Depois' },
  { key: 'hasClientRecords',        label: 'Prontuários Completos' },
  { key: 'hasLoyalty',              label: 'Fidelidade' },
  { key: 'hasReviews',              label: 'Avaliações' },
  { key: 'hasStory',                label: 'Gerador de Story' },
  { key: 'hasWhatsAppIntegration',  label: 'Bot WhatsApp Simples' },
  { key: 'hasWhatsAppSmartBot',     label: 'Bot WhatsApp IA' },
  { key: 'hasAdvancedCustomization',label: 'Personalização Avançada' },
];

// ─── 3D Card KPI ─────────────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, Icon, color, ring }: {
  label: string; value: string | number; sub: string;
  Icon: any; color: string; ring: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [rot, setRot] = useState({ x: 0, y: 0 });
  return (
    <div
      ref={ref}
      onMouseMove={e => {
        if (!ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setRot({
          x: ((e.clientY - r.top - r.height / 2) / r.height) * 12,
          y: -((e.clientX - r.left - r.width / 2) / r.width) * 12,
        });
      }}
      onMouseLeave={() => setRot({ x: 0, y: 0 })}
      style={{ transform: `perspective(700px) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, transition: 'transform 0.15s ease' }}
      className={`bg-white rounded-2xl border border-slate-100 shadow-sm ring-1 ${ring} p-5 cursor-default hover:shadow-lg transition-shadow`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`h-10 w-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-3xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
};

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { value: 'overview',      label: 'Visão Geral',    Icon: Home },
  { value: 'salons',        label: 'Negócios',       Icon: Building },
  { value: 'plans',         label: 'Planos',         Icon: CreditCard },
  { value: 'subscriptions', label: 'Assinaturas',    Icon: Activity },
  { value: 'users',         label: 'Usuários',       Icon: Users },
  { value: 'affiliates',    label: 'Afiliados',      Icon: Link2 },
  { value: 'platform',      label: 'Plataforma',     Icon: Settings },
  { value: 'suporte',       label: 'Suporte WhatsApp', Icon: MessageCircle },
  { value: 'devtools',      label: 'Dev Tools',      Icon: Database },
];

const PRICE_PLAN_MAP: Record<string, string> = {
  'price_1THG2tPJdJwQwazDo4sddar3': 'Só Agenda',
  'price_1THG2HPJdJwQwazDHFJtJHbp': 'Agenda Pro',
  'price_1TK2NtPJdJwQwazDUy2TITxP': 'Só Loja',
  'price_1TK2NUPJdJwQwazDFgZ5fzUQ': 'Agenda + Loja',
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

const SuperAdminSkeleton = () => (
  <div className="flex min-h-screen bg-slate-50">
    <div className="w-60 bg-white border-r" />
    <div className="flex-1 p-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [supportWaStatus, setSupportWaStatus] = useState<'disconnected'|'connecting'|'connected'>('disconnected');
  const [supportQr, setSupportQr] = useState<string|null>(null);
  const [supportConnecting, setSupportConnecting] = useState(false);
  const [humanModeActive, setHumanModeActive] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [salons, setSalons] = useState<Salon[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isSeeding, setIsSeeding] = useState(false);
  const [isTestingIsolation, setIsTestingIsolation] = useState(false);
  const [deletingUserUid, setDeletingUserUid] = useState<string | null>(null);

  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    trialDays: 30, supportEmail: '', platformName: 'Bella & Chic',
  });
  const [savingPlatform, setSavingPlatform] = useState(false);

  // Affiliates
  const [affiliateReport, setAffiliateReport] = useState<any>(null);
  const [loadingAffiliates, setLoadingAffiliates] = useState(false);
  const [newAffiliate, setNewAffiliate] = useState({ name: '', email: '', slug: '', expiryDays: 0, discountPercent: 10, trialDays: 0 });
  const [editingAffiliate, setEditingAffiliate] = useState<any>(null);
  const [deletingAffiliate, setDeletingAffiliate] = useState<string|null>(null);
  const [creatingAffiliate, setCreatingAffiliate] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState('');

  // Dialogs
  const [salonDialog, setSalonDialog] = useState<{ open: boolean; mode: 'create' | 'edit'; salon?: Salon }>({ open: false, mode: 'create' });
  const [salonForm, setSalonForm] = useState({ name: '', slug: '', businessType: 'beauty' as BusinessType, planId: 'agenda-pro', status: 'TRIAL' as Salon['status'], trialDays: 30 });
  const [savingSalon, setSavingSalon] = useState(false);

  const [planDialog, setPlanDialog] = useState<{ open: boolean; mode: 'create' | 'edit'; plan?: Plan }>({ open: false, mode: 'create' });
  const [planForm, setPlanForm] = useState<any>({ name: '', price: '', maxProfessionals: '3' });
  const [planFeatureForm, setPlanFeatureForm] = useState<Record<string, boolean>>({});
  const [savingPlan, setSavingPlan] = useState(false);

  const [deleteUserDialog, setDeleteUserDialog] = useState<{ open: boolean; user?: UserProfile }>({ open: false });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: '' | 'seed' | 'isolation' }>({ open: false, type: '' });
  const [extendTrialDialog, setExtendTrialDialog] = useState<{ open: boolean; salon?: Salon; days: number }>({ open: false, days: 7 });

  // Load data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [plansData, subscriptionsData, usersData, metricsData] = await Promise.all([
          superAdminService.getAllPlans(),
          superAdminService.getAllSubscriptions(),
          superAdminService.getAllUsers(),
          superAdminService.getGlobalMetrics(),
        ]);
        setPlans(plansData);
        setSubscriptions(subscriptionsData);
        setUsers(usersData);
        setMetrics(metricsData);
      } catch (error) {
        console.error(error);
        toast.error('Erro ao carregar dados.');
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();

    const unsubSalons = onSnapshot(collection(db, 'salons'), snap => {
      setSalons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Salon)));
      superAdminService.getGlobalMetrics().then(setMetrics).catch(console.error);
    });
    return () => unsubSalons();
  }, []);

  useEffect(() => { platformSettingsService.getSettings().then(setPlatformSettings); }, []);

  // Handlers
  const loadAffiliates = async () => {
    setLoadingAffiliates(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/affiliate/report', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAffiliateReport(await res.json());
    } catch (e) { console.error('[Affiliates]', e); }
    finally { setLoadingAffiliates(false); }
  };

  const handleCreateAffiliate = async () => {
    if (!newAffiliate.name || !newAffiliate.slug) { toast.error('Nome e slug obrigatórios'); return; }
    const slug = newAffiliate.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    setCreatingAffiliate(true);
    try {
      const { doc: fsDoc, setDoc } = await import('firebase/firestore');
      const expiresAt = newAffiliate.expiryDays > 0 ? Date.now() + newAffiliate.expiryDays * 86400000 : null;
      await setDoc(fsDoc(db, 'affiliates', slug), {
        name: newAffiliate.name, email: newAffiliate.email, slug,
        clicks: 0, conversions: 0, totalConversions: 0,
        pendingPayment: 0, totalPaid: 0, type: 'marketer',
        active: true, expiresAt, expiryDays: newAffiliate.expiryDays,
        discountPercent: newAffiliate.discountPercent || 10,
        trialDays: newAffiliate.trialDays || 0,
        createdAt: Date.now(),
      });
      toast.success(`Afiliado criado! Link: /?ref=${slug}`);
      setNewAffiliate({ name: '', email: '', slug: '', expiryDays: 0, discountPercent: 10, trialDays: 0 });
      loadAffiliates();
    } catch (e: any) { toast.error('Erro: ' + e.message); }
    finally { setCreatingAffiliate(false); }
  };

  const handleEditAffiliate = async (af: any, updates: any) => {
    try {
      const { doc: fsDoc, setDoc } = await import('firebase/firestore');
      await setDoc(fsDoc(db, 'affiliates', af.slug), { ...af, ...updates }, { merge: true });
      toast.success('Afiliado atualizado!');
      setEditingAffiliate(null);
      loadAffiliates();
    } catch (e: any) { toast.error('Erro: ' + e.message); }
  };

  const handleDeleteAffiliate = async (slug: string) => {
    setDeletingAffiliate(slug);
    try {
      const { doc: fsDoc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(fsDoc(db, 'affiliates', slug));
      toast.success('Afiliado excluído!');
      setDeletingAffiliate(null);
      loadAffiliates();
    } catch (e: any) { toast.error('Erro: ' + e.message); setDeletingAffiliate(null); }
  };

  const handlePayCommission = async (slug: string, amount: number) => {
    if (!confirm(`Confirmar pagamento de R$ ${(amount ?? 0).toFixed(2)} para ${slug}?`)) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/affiliate/pay-commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ affiliateSlug: slug, amount }),
      });
      toast.success('Pagamento registrado!');
      loadAffiliates();
    } catch { toast.error('Erro ao registrar pagamento.'); }
  };

  const openCreateSalon = () => {
    setSalonForm({ name: '', slug: '', businessType: 'beauty', planId: 'agenda-pro', status: 'TRIAL', trialDays: 30 });
    setSalonDialog({ open: true, mode: 'create' });
  };

  const openEditSalon = (salon: Salon) => {
    setSalonForm({
      name: salon.name, slug: salon.slug,
      businessType: (salon as any).businessType || 'beauty',
      planId: salon.planId || 'agenda-pro',
      status: salon.status || 'TRIAL',
      trialDays: 30,
    });
    setSalonDialog({ open: true, mode: 'edit', salon });
  };

  const saveSalon = async () => {
    const name = salonForm.name.trim();
    const slug = salonForm.slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name || !slug) { toast.error('Preencha nome e slug.'); return; }
    setSavingSalon(true);
    try {
      if (salonDialog.mode === 'create') {
        await superAdminService.createSalon({
          name, slug,
          businessType: salonForm.businessType,
          ownerId: '', status: salonForm.status,
          planId: salonForm.planId,
          trialEndsAt: Date.now() + salonForm.trialDays * 86400000,
          createdAt: Date.now(),
        } as any);
        toast.success('Negócio criado!');
      } else if (salonDialog.salon) {
        await superAdminService.updateSalon(salonDialog.salon.id, {
          name, slug,
          businessType: salonForm.businessType,
          planId: salonForm.planId,
          status: salonForm.status,
        });
        toast.success('Negócio atualizado!');
      }
      setSalonDialog({ open: false, mode: 'create' });
    } catch (e) { console.error(e); toast.error('Erro ao salvar.'); }
    finally { setSavingSalon(false); }
  };

  const handleExtendTrial = async () => {
    if (!extendTrialDialog.salon) return;
    const newEnd = Date.now() + extendTrialDialog.days * 86400000;
    try {
      await superAdminService.updateSalon(extendTrialDialog.salon.id, {
        status: 'TRIAL', trialEndsAt: newEnd,
      });
      toast.success(`Trial estendido por ${extendTrialDialog.days} dias!`);
      setExtendTrialDialog({ open: false, days: 7 });
    } catch { toast.error('Erro ao estender trial.'); }
  };

  const handleUpdateSalonStatus = async (id: string, status: Salon['status']) => {
    try { await superAdminService.updateSalon(id, { status }); toast.success('Status atualizado!'); }
    catch { toast.error('Erro ao atualizar status.'); }
  };

  const handleUpdateSalonPlan = async (id: string, planId: string) => {
    try { await superAdminService.updateSalon(id, { planId }); toast.success('Plano atualizado!'); }
    catch { toast.error('Erro ao atualizar plano.'); }
  };

  const handleUpdateBusinessType = async (id: string, businessType: BusinessType) => {
    try { await superAdminService.updateSalon(id, { businessType } as any); toast.success('Categoria atualizada!'); }
    catch { toast.error('Erro ao atualizar categoria.'); }
  };

  const copySalonUrl = async (slug: string) => {
    const url = `${window.location.origin}/s/${slug}`;
    try { await navigator.clipboard.writeText(url); toast.success('URL copiada!'); }
    catch { toast.info(`URL: ${url}`); }
  };

  const openCreatePlan = () => {
    setPlanForm({ name: '', price: '', maxProfessionals: '3' });
    setPlanFeatureForm(Object.fromEntries(PLAN_FEATURES_LABELS.map(f => [f.key, false])));
    setPlanDialog({ open: true, mode: 'create' });
  };

  const openEditPlan = (plan: Plan) => {
    setPlanForm({ name: plan.name, price: String(plan.price), maxProfessionals: String(plan.features.maxProfessionals) });
    setPlanFeatureForm(Object.fromEntries(PLAN_FEATURES_LABELS.map(f => [f.key, !!(plan.features as any)[f.key]])));
    setPlanDialog({ open: true, mode: 'edit', plan });
  };

  const savePlan = async () => {
    const name = planForm.name.trim();
    const price = Number(planForm.price);
    if (!name || isNaN(price) || price <= 0) { toast.error('Preencha nome e preço válido.'); return; }
    setSavingPlan(true);
    try {
      const data: any = {
        name, price, interval: 'MONTHLY',
        features: {
          maxProfessionals: Number(planForm.maxProfessionals) || 3,
          maxAppointmentsPerMonth: 9999,
          ...planFeatureForm,
        },
      };
      if (planDialog.mode === 'create') {
        await superAdminService.createPlan(data);
        toast.success('Plano criado!');
      } else if (planDialog.plan) {
        await superAdminService.updatePlan(planDialog.plan.id, data);
        toast.success('Plano atualizado!');
      }
      setPlanDialog({ open: false, mode: 'create' });
      setPlans(await superAdminService.getAllPlans());
    } catch (e) { console.error(e); toast.error('Erro ao salvar plano.'); }
    finally { setSavingPlan(false); }
  };

  const handleSavePlatformSettings = async () => {
    setSavingPlatform(true);
    try { await platformSettingsService.updateSettings(platformSettings); toast.success('Configurações salvas!'); }
    catch (e: any) { toast.error(e.message || 'Erro ao salvar.'); }
    finally { setSavingPlatform(false); }
  };

  const handleLogout = async () => {
    try { await signOut(auth); localStorage.clear(); sessionStorage.clear(); navigate('/login', { replace: true }); }
    catch { toast.error('Erro ao sair.'); }
  };

  const runConfirmedAction = async () => {
    const type = confirmDialog.type;
    setConfirmDialog({ open: false, type: '' });
    if (type === 'seed') {
      setIsSeeding(true);
      try { await seedData(); toast.success('Banco populado!'); } catch { toast.error('Erro.'); }
      finally { setIsSeeding(false); }
    }
    if (type === 'isolation') {
      setIsTestingIsolation(true);
      try { await seedTwoSalons(); toast.success('Salões de teste criados!'); } catch { toast.error('Erro.'); }
      finally { setIsTestingIsolation(false); }
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserDialog.user) return;
    setDeletingUserUid(deleteUserDialog.user.uid);
    try {
      await superAdminService.deleteUser(deleteUserDialog.user.uid);
      toast.success('Usuário excluído!');
      setDeleteUserDialog({ open: false });
      setUsers(await superAdminService.getAllUsers());
    } catch (e: any) { toast.error(e?.message || 'Erro.'); }
    finally { setDeletingUserUid(null); }
  };

  const filteredSalons = useMemo(() =>
    salons.filter(s => {
      const q = searchTerm.toLowerCase();
      return (s.name.toLowerCase().includes(q) || s.slug.includes(q)) &&
        (statusFilter === 'ALL' || s.status === statusFilter);
    }), [salons, searchTerm, statusFilter]);

  const filteredUsers = useMemo(() =>
    users.filter(u => {
      const q = userSearchTerm.trim().toLowerCase();
      if (!q) return true;
      return [u.displayName, u.email, u.role, u.salonId || '', u.uid].join(' ').toLowerCase().includes(q);
    }), [users, userSearchTerm]);

  if (loading) return <SuperAdminSkeleton />;

  const activeSalons  = salons.filter(s => s.status === 'ACTIVE').length;
  const trialSalons   = salons.filter(s => s.status === 'TRIAL').length;
  const expiredSalons = salons.filter(s => ['EXPIRED', 'BLOCKED', 'CANCELLED'].includes(s.status)).length;
  const mrr = subscriptions
    .filter(s => s.status === 'ACTIVE')
    .reduce((acc, s) => {
      const plan = plans.find(p => p.id === s.planId);
      return acc + (plan?.price || 0);
    }, 0);

  return (
    <>
      <SEO title="Super Admin — Bella & Chic" description="Painel administrativo da plataforma" />
      <div className="flex min-h-screen bg-slate-50">

        {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
        <aside className={`hidden md:flex flex-col bg-white border-r border-slate-100 shadow-sm transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-60'} fixed top-0 left-0 h-full z-30`}>
          <div className="flex items-center justify-between px-4 h-16 border-b border-slate-100 shrink-0">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-rose-600" />
                <span className="font-black text-slate-800">Super<span className="text-rose-600">Admin</span></span>
              </div>
            )}
            <button onClick={() => setSidebarCollapsed(v => !v)}
              className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
            {NAV_ITEMS.map(({ value, label, Icon }) => (
              <button key={value} onClick={() => setActiveTab(value)} title={sidebarCollapsed ? label : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  activeTab === value ? 'bg-rose-50 text-rose-600 border-l-2 border-rose-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}>
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{label}</span>}
              </button>
            ))}
          </nav>

          <div className="border-t border-slate-100 p-3 shrink-0">
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 font-black text-sm">SA</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800">Super Admin</p>
                  <p className="text-[10px] text-slate-500">Bella & Chic</p>
                </div>
                <button onClick={handleLogout} title="Sair" className="text-slate-400 hover:text-rose-600 transition-colors">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button onClick={handleLogout} className="w-full flex justify-center text-slate-400 hover:text-rose-600 py-1">
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </aside>

        {/* ── MAIN ────────────────────────────────────────────────────────── */}
        <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-60'} px-4 py-6 pb-24 md:pb-8 md:px-8 md:py-8`}>

          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-2xl font-black text-slate-900">
              {NAV_ITEMS.find(i => i.value === activeTab)?.label || 'Painel'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{salons.length} negócios · {users.length} usuários · MRR estimado: R$ {(mrr ?? 0).toFixed(0)}</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>

            {/* ── VISÃO GERAL ─────────────────────────────────────────────── */}
            <TabsContent value="overview" className="mt-0 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Total de Negócios"  value={salons.length}  sub={`${activeSalons} ativos · ${trialSalons} em trial`} Icon={Building}    color="bg-blue-50 text-blue-600"    ring="ring-blue-100" />
                <KpiCard label="MRR Estimado"       value={`R$ ${(mrr ?? 0).toFixed(0)}`} sub="Assinaturas ativas"                          Icon={DollarSign}  color="bg-emerald-50 text-emerald-600" ring="ring-emerald-100" />
                <KpiCard label="Usuários"           value={users.length}   sub="Contas cadastradas"                                  Icon={Users}       color="bg-violet-50 text-violet-600"  ring="ring-violet-100" />
                <KpiCard label="Expirados/Bloqueados" value={expiredSalons} sub="Precisam de atenção"                               Icon={AlertTriangle} color="bg-amber-50 text-amber-600"   ring="ring-amber-100" />
              </div>

              {/* Quick actions */}
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Gerenciar Negócios', tab: 'salons', Icon: Building, color: 'bg-blue-600' },
                  { label: 'Ver Planos', tab: 'plans', Icon: CreditCard, color: 'bg-violet-600' },
                  { label: 'Afiliados', tab: 'affiliates', Icon: Link2, color: 'bg-amber-600' },
                ].map(item => (
                  <button key={item.tab} onClick={() => setActiveTab(item.tab)}
                    className={`${item.color} text-white rounded-xl p-4 text-left hover:opacity-90 transition-opacity flex items-center gap-3`}>
                    <item.Icon className="h-5 w-5" />
                    <span className="font-semibold text-sm">{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Status summary */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Status dos Negócios</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(STATUS_LABEL).map(([status, label]) => {
                      const count = salons.filter(s => s.status === status).length;
                      if (count === 0) return null;
                      return (
                        <button key={status} onClick={() => { setActiveTab('salons'); setStatusFilter(status); }}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all hover:shadow-sm ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
                          {label} <span className="font-black">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Recent salons */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Negócios Recentes</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab('salons')}>Ver todos</Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[...salons].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6).map(salon => (
                      <div key={salon.id} className="flex items-center justify-between rounded-xl border bg-slate-50/50 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600 font-bold text-sm">
                            {salon.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{salon.name}</p>
                            <p className="text-xs text-slate-500">/s/{salon.slug} · {plans.find(p => p.id === salon.planId)?.name || salon.planId}</p>
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[salon.status] || ''}`}>
                          {STATUS_LABEL[salon.status] || salon.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── NEGÓCIOS ────────────────────────────────────────────────── */}
            <TabsContent value="salons" className="mt-0 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Buscar por nome ou slug..." className="pl-9 bg-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os status</SelectItem>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={openCreateSalon}><Plus className="mr-2 h-4 w-4" /> Novo negócio</Button>
              </div>

              <div className="space-y-2">
                {filteredSalons.map(salon => {
                  const bt = BUSINESS_TYPES.find(b => b.value === ((salon as any).businessType || 'beauty'));
                  const planName = plans.find(p => p.id === salon.planId)?.name || salon.planId;
                  return (
                    <Card key={salon.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Avatar + info */}
                          <div className="flex items-center gap-3 flex-1 min-w-[160px]">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 font-black text-base">
                              {salon.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{salon.name}</p>
                              <p className="text-xs text-slate-500 flex items-center gap-1">
                                {bt && <span className={bt.color}>{bt.icon}</span>}
                                /s/{salon.slug}
                              </p>
                            </div>
                          </div>

                          {/* Plan */}
                          <Select value={salon.planId} onValueChange={v => handleUpdateSalonPlan(salon.id, v)}>
                            <SelectTrigger className="w-36 h-8 text-xs bg-white border-slate-200">
                              <SelectValue placeholder="Plano" />
                            </SelectTrigger>
                            <SelectContent>
                              {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>

                          {/* Business type */}
                          <Select value={(salon as any).businessType || 'beauty'} onValueChange={v => handleUpdateBusinessType(salon.id, v as BusinessType)}>
                            <SelectTrigger className="w-40 h-8 text-xs bg-white border-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BUSINESS_TYPES.map(b => (
                                <SelectItem key={b.value} value={b.value}>
                                  <span className={`flex items-center gap-1.5 ${b.color}`}>{b.icon} {b.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Status */}
                          <Select value={salon.status} onValueChange={v => handleUpdateSalonStatus(salon.id, v as Salon['status'])}>
                            <SelectTrigger className={`w-32 h-8 text-xs border ${STATUS_COLORS[salon.status] || 'bg-white'}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                            </SelectContent>
                          </Select>

                          {/* Trial expiry */}
                          {salon.status === 'TRIAL' && salon.trialEndsAt && (
                            <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                              Expira {format(new Date(salon.trialEndsAt), "dd/MM", { locale: ptBR })}
                            </span>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Editar" onClick={() => openEditSalon(salon)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Estender trial" onClick={() => setExtendTrialDialog({ open: true, salon, days: 7 })}>
                              <Clock className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Copiar URL" onClick={() => copySalonUrl(salon.slug)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <a href={`/s/${salon.slug}/admin`} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Abrir painel">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {filteredSalons.length === 0 && (
                  <div className="py-16 text-center text-slate-400">
                    <Building className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    <p>Nenhum negócio encontrado.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── PLANOS ──────────────────────────────────────────────────── */}
            <TabsContent value="plans" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Planos gerenciados via Stripe. Clientes ativos por plano:</p>
                <div className="flex gap-2 flex-wrap">
                  {['agenda','agenda-pro','loja','completo','crm-pro'].map(pid => {
                    const count = salons.filter(s => s.status === 'ACTIVE' && s.planId === pid).length;
                    return count > 0 ? <Badge key={pid} variant="outline">{pid}: {count}</Badge> : null;
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                {/* Agenda */}
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-hidden">
                  <CardHeader className="pb-3">
                    <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide">Agenda</p>
                    <CardTitle className="text-lg">Só Agenda</CardTitle>
                    <p className="text-xs text-slate-500">Para autônomos e pequenos negócios</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">R$ 64<span className="text-base font-normal text-slate-400">,99/mês</span></p>
                    <p className="text-xs text-slate-400">{salons.filter(s => s.status === 'ACTIVE' && s.planId === 'agenda').length} negócio(s) ativo(s)</p>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-1.5 text-xs">
                    {[['Agendamento online 24h',true],['Até 3 profissionais',true],['Ficha de clientes básica',true],['Anamnese digital',true],['Fotos antes e depois',true],['Programa de fidelidade',true],['Avaliações dos clientes',true],['Bot WhatsApp simples',true],['Confirmação automática',true],['Relatório básico',true],['CRM completo',false],['Sinal antecipado',false],['Orçamentos e cobranças',false],['Loja virtual',false]].map(([label, has]) => (
                      <div key={label as string} className={`flex items-center gap-1.5 ${has ? 'text-slate-700' : 'text-slate-300'}`}>
                        {has ? <Check className="h-3 w-3 text-emerald-500 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                        {label as string}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Agenda Pro */}
                <Card className="border-0 shadow-md hover:shadow-lg transition-shadow flex flex-col relative overflow-hidden ring-2 ring-rose-500">
                  <div className="absolute top-3 right-3"><Badge className="bg-rose-500 text-white text-xs">⭐ POPULAR</Badge></div>
                  <CardHeader className="pb-3">
                    <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide">Agenda Pro</p>
                    <CardTitle className="text-lg">Para crescimento</CardTitle>
                    <p className="text-xs text-slate-500">Para negócios em crescimento</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">R$ 89<span className="text-base font-normal text-slate-400">,99/mês</span></p>
                    <p className="text-xs text-slate-400">{salons.filter(s => s.status === 'ACTIVE' && s.planId === 'agenda-pro').length} negócio(s) ativo(s)</p>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-1.5 text-xs">
                    {[['Tudo do Só Agenda',true],['Profissionais ilimitados',true],['CRM completo com funil',true],['Prontuários e fichas completos',true],['Orçamentos PIX/cartão/boleto',true],['Pacotes e planos de tratamento',true],['Documentos e receituário',true],['Sinal antecipado',true],['Bot WhatsApp IA',true],['Produtos e controle de vendas',true],['Relatório financeiro completo',true],['Suporte prioritário',true],['Loja virtual online',false]].map(([label, has]) => (
                      <div key={label as string} className={`flex items-center gap-1.5 ${has ? 'text-slate-700' : 'text-slate-300'}`}>
                        {has ? <Check className="h-3 w-3 text-emerald-500 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                        {label as string}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Loja */}
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-hidden">
                  <CardHeader className="pb-3">
                    <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Loja</p>
                    <CardTitle className="text-lg">Só Loja</CardTitle>
                    <p className="text-xs text-slate-500">Para quem vende produtos online</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">R$ 64<span className="text-base font-normal text-slate-400">,99/mês</span></p>
                    <p className="text-xs text-slate-400">{salons.filter(s => s.status === 'ACTIVE' && s.planId === 'loja').length} negócio(s) ativo(s)</p>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-1.5 text-xs">
                    {[['Loja virtual completa',true],['PIX automático (Asaas)',true],['Controle de estoque',true],['Cupons de desconto',true],['Checkout cartão/boleto',true],['Gerador de story',true],['Avaliações de produtos',true],['Relatório básico',true],['Agendamento',false],['CRM',false],['Bot WhatsApp',false],['Prontuários',false]].map(([label, has]) => (
                      <div key={label as string} className={`flex items-center gap-1.5 ${has ? 'text-slate-700' : 'text-slate-300'}`}>
                        {has ? <Check className="h-3 w-3 text-emerald-500 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                        {label as string}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Completo */}
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-hidden bg-gradient-to-b from-amber-50 to-white">
                  <div className="absolute top-3 right-3"><Badge className="bg-amber-500 text-white text-xs">👑 COMPLETO</Badge></div>
                  <CardHeader className="pb-3">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Completo</p>
                    <CardTitle className="text-lg">Agenda + Loja</CardTitle>
                    <p className="text-xs text-slate-500">O plano mais completo</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">R$ 159<span className="text-base font-normal text-slate-400">,90/mês</span></p>
                    <p className="text-xs text-slate-400">{salons.filter(s => s.status === 'ACTIVE' && s.planId === 'completo').length} negócio(s) ativo(s)</p>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-1.5 text-xs">
                    {[['Tudo do Agenda Pro',true],['Loja virtual completa',true],['PIX automático Asaas',true],['Cupons de desconto',true],['Bot WhatsApp IA avançado',true],['Relatório DRE completo',true],['Split de pagamento auto',true],['Suporte VIP',true]].map(([label, has]) => (
                      <div key={label as string} className={`flex items-center gap-1.5 ${has ? 'text-slate-700' : 'text-slate-300'}`}>
                        {has ? <Check className="h-3 w-3 text-emerald-500 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                        {label as string}
                      </div>
                    ))}
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

            {/* ── ASSINATURAS ─────────────────────────────────────────────── */}
            <TabsContent value="subscriptions" className="mt-0">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-slate-50">
                        <th className="p-4 text-left font-medium text-slate-500">Negócio</th>
                        <th className="p-4 text-left font-medium text-slate-500">Plano</th>
                        <th className="p-4 text-left font-medium text-slate-500">Status</th>
                        <th className="p-4 text-left font-medium text-slate-500">Período</th>
                      </tr></thead>
                      <tbody>
                        {subscriptions.map(sub => {
                          const salon = salons.find(s => s.id === sub.salonId);
                          const planName = plans.find(p => p.id === sub.planId)?.name || PRICE_PLAN_MAP[sub.planId] || sub.planId;
                          return (
                            <tr key={sub.id} className="border-b last:border-0 hover:bg-slate-50/50">
                              <td className="p-4 font-medium">{salon?.name || sub.salonId}</td>
                              <td className="p-4 text-slate-600">{planName}</td>
                              <td className="p-4">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[sub.status] || 'bg-slate-100'}`}>
                                  {sub.status}
                                </span>
                              </td>
                              <td className="p-4 text-slate-500 text-xs">
                                {sub.currentPeriodEnd ? format(new Date(sub.currentPeriodEnd), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── USUÁRIOS ────────────────────────────────────────────────── */}
            <TabsContent value="users" className="mt-0 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Buscar por nome, email ou role..." className="pl-9 bg-white" value={userSearchTerm} onChange={e => setUserSearchTerm(e.target.value)} />
              </div>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-slate-50">
                        <th className="p-4 text-left font-medium text-slate-500">Usuário</th>
                        <th className="p-4 text-left font-medium text-slate-500">Role</th>
                        <th className="p-4 text-left font-medium text-slate-500">Negócio</th>
                        <th className="p-4 text-right font-medium text-slate-500">Ações</th>
                      </tr></thead>
                      <tbody>
                        {filteredUsers.map(u => {
                          const salon = salons.find(s => s.id === u.salonId);
                          return (
                            <tr key={u.uid} className="border-b last:border-0 hover:bg-slate-50/50">
                              <td className="p-4">
                                <p className="font-medium">{u.displayName || '—'}</p>
                                <p className="text-xs text-slate-500">{u.email}</p>
                              </td>
                              <td className="p-4">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                  u.role === 'SUPER_ADMIN' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                  u.role === 'SALON_ADMIN' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                  u.role === 'PROFESSIONAL' ? 'bg-green-100 text-green-700 border-green-200' :
                                  'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>{u.role}</span>
                              </td>
                              <td className="p-4 text-xs text-slate-500">{salon?.name || (u.salonId ? u.salonId.slice(0, 8) + '…' : '—')}</td>
                              <td className="p-4 text-right">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                  disabled={deletingUserUid === u.uid}
                                  onClick={() => setDeleteUserDialog({ open: true, user: u })}>
                                  {deletingUserUid === u.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── SUPORTE WHATSAPP ─────────────────────────────────────────── */}
            <TabsContent value="suporte" className="mt-0 space-y-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-green-600" />
                    WhatsApp de Suporte — Bella & Chic
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    Conecte o número de suporte da plataforma. O bot responde dúvidas sobre o sistema automaticamente e passa para atendimento humano quando solicitado.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* Status */}
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border">
                    {supportWaStatus === 'connected' ? (
                      <><Wifi className="h-5 w-5 text-green-600" /><span className="font-medium text-green-700">Conectado</span></>
                    ) : supportWaStatus === 'connecting' ? (
                      <><Loader2 className="h-5 w-5 animate-spin text-amber-500" /><span className="font-medium text-amber-600">Conectando...</span></>
                    ) : (
                      <><WifiOff className="h-5 w-5 text-slate-400" /><span className="font-medium text-slate-500">Desconectado</span></>
                    )}
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" onClick={async () => {
                        setSupportWaStatus('connecting');
                        setSupportConnecting(true);
                        setSupportQr(null);
                        try {
                          const token = await auth.currentUser?.getIdToken();
                          const r = await fetch('/api/whatsapp/connect-support', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          });
                          const d = await r.json();
                          if (d.qrcode) setSupportQr(d.qrcode);
                          if (d.connected) setSupportWaStatus('connected');
                          else setSupportWaStatus('disconnected');
                        } catch { setSupportWaStatus('disconnected'); }
                        setSupportConnecting(false);
                      }} disabled={supportConnecting}>
                        <QrCode className="h-4 w-4 mr-1.5" />
                        {supportWaStatus === 'connected' ? 'Reconectar' : 'Conectar'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const r = await fetch('/api/whatsapp/status-support', {
                          headers: { 'Authorization': `Bearer ${await auth.currentUser?.getIdToken()}` }
                        });
                        const d = await r.json();
                        setSupportWaStatus(d.connected ? 'connected' : 'disconnected');
                      }}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* QR Code */}
                  {supportQr && (
                    <div className="flex flex-col items-center gap-3 p-6 bg-white border-2 border-dashed border-slate-200 rounded-xl">
                      <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <QrCode className="h-4 w-4" />
                        Escaneie com o WhatsApp do suporte
                      </p>
                      <p className="text-xs text-slate-500">WhatsApp → ⋮ → Dispositivos conectados → Conectar dispositivo</p>
                      <img src={supportQr} alt="QR Code" className="w-64 h-64 rounded-lg border" />
                      <p className="text-xs text-red-500 font-medium">⚠️ Expira em 60 segundos</p>
                    </div>
                  )}

                  {/* Modo Humano */}
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-amber-800 text-sm">Modo Atendimento Humano</p>
                        <p className="text-xs text-amber-600 mt-0.5">Quando ativo, o bot para de responder e você atende pessoalmente</p>
                      </div>
                      <button
                        onClick={() => setHumanModeActive(h => !h)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${humanModeActive ? 'bg-amber-500' : 'bg-slate-300'}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${humanModeActive ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Info do bot */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700">O bot de suporte sabe responder sobre:</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                      {[
                        '📅 Funcionalidades de agendamento','💳 Planos e preços',
                        '🤖 Como configurar o bot WhatsApp','🏪 Como personalizar a página',
                        '💰 Como cadastrar Asaas PIX','👥 Gestão de profissionais',
                        '📊 CRM e relatórios','🛍️ Loja virtual',
                        '📋 Anamnese e prontuários','🆘 Como pedir suporte humano',
                      ].map(item => (
                        <div key={item} className="flex items-center gap-1.5 p-2 bg-slate-50 rounded-lg">
                          <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                </CardContent>
              </Card>
            </TabsContent>

            {/* ── AFILIADOS ───────────────────────────────────────────────── */}
            <TabsContent value="affiliates" className="mt-0 space-y-6">
              {/* Criar afiliado */}
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-base">Criar Link de Afiliado</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome *</Label>
                    <Input value={newAffiliate.name} onChange={e => setNewAffiliate(p => ({ ...p, name: e.target.value }))} placeholder="João Marketing" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">E-mail</Label>
                    <Input type="email" value={newAffiliate.email} onChange={e => setNewAffiliate(p => ({ ...p, email: e.target.value }))} placeholder="joao@email.com" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Slug (URL) *</Label>
                    <Input value={newAffiliate.slug} onChange={e => setNewAffiliate(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} placeholder="joao-mkt" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Expiração (dias, 0 = infinito)</Label>
                    <Input type="number" value={newAffiliate.expiryDays} onChange={e => setNewAffiliate(p => ({ ...p, expiryDays: Number(e.target.value) }))} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Desconto para o cliente (%)</Label>
                    <Input type="number" min={0} max={50} value={newAffiliate.discountPercent} onChange={e => setNewAffiliate(p => ({ ...p, discountPercent: Number(e.target.value) }))} className="h-9 text-sm" placeholder="10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Trial extra (dias, 0 = padrão)</Label>
                    <Input type="number" min={0} max={60} value={newAffiliate.trialDays} onChange={e => setNewAffiliate(p => ({ ...p, trialDays: Number(e.target.value) }))} className="h-9 text-sm" placeholder="0" />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Button disabled={creatingAffiliate} onClick={handleCreateAffiliate}>
                      {creatingAffiliate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Criar Afiliado
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Relatório */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Relatório de Afiliados</CardTitle>
                  <Button size="sm" variant="outline" disabled={loadingAffiliates} onClick={loadAffiliates}>
                    {loadingAffiliates ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Atualizar</span>
                  </Button>
                </CardHeader>
                <CardContent>
                  {!affiliateReport ? (
                    <div className="py-8 text-center text-slate-400 text-sm">Clique em "Atualizar" para carregar.</div>
                  ) : (
                    <div className="space-y-3">
                      {(affiliateReport.affiliates || affiliateReport.marketers || []).map((af: any) => (
                        <div key={af.slug} className="rounded-xl border bg-slate-50/50 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{af.name}</p>
                              <p className="text-xs text-slate-400 font-mono truncate">/?ref={af.slug}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-xs text-slate-500">{af.conversions || 0} conversões</span>
                                {af.discountPercent > 0 && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">{af.discountPercent}% desconto</span>}
                                {af.trialDays > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">+{af.trialDays}d trial</span>}
                                {af.expiresAt && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${af.expiresAt < Date.now() ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{af.expiresAt < Date.now() ? 'Expirado' : `Expira ${new Date(af.expiresAt).toLocaleDateString('pt-BR')}`}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/cadastro-salao?ref=${af.slug}`); setCopiedSlug(af.slug); setTimeout(() => setCopiedSlug(''), 2000); }}
                                title="Copiar link">
                                {copiedSlug === af.slug ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Editar"
                                onClick={() => setEditingAffiliate({ ...af })}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" title="Excluir"
                                disabled={deletingAffiliate === af.slug}
                                onClick={() => { if (confirm(`Excluir afiliado "${af.name}"?`)) handleDeleteAffiliate(af.slug); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                              {(af.pendingPayment || 0) > 0 && (
                                <Button size="sm" className="h-7 text-xs" onClick={() => handlePayCommission(af.slug, af.pendingPayment)}>
                                  R$ {af.pendingPayment.toFixed(2)}
                                </Button>
                              )}
                            </div>
                          </div>
                          {/* Edit form inline */}
                          {editingAffiliate?.slug === af.slug && (
                            <div className="border-t bg-white px-4 py-3 space-y-3">
                              <p className="text-xs font-semibold text-slate-600">Editar Afiliado</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1"><Label className="text-xs">Nome</Label><Input className="h-8 text-xs" value={editingAffiliate.name} onChange={e => setEditingAffiliate((p: any) => ({ ...p, name: e.target.value }))} /></div>
                                <div className="space-y-1"><Label className="text-xs">Email</Label><Input className="h-8 text-xs" value={editingAffiliate.email || ''} onChange={e => setEditingAffiliate((p: any) => ({ ...p, email: e.target.value }))} /></div>
                                <div className="space-y-1"><Label className="text-xs">Desconto (%)</Label><Input type="number" min={0} max={50} className="h-8 text-xs" value={editingAffiliate.discountPercent || 0} onChange={e => setEditingAffiliate((p: any) => ({ ...p, discountPercent: Number(e.target.value) }))} /></div>
                                <div className="space-y-1"><Label className="text-xs">Trial extra (dias)</Label><Input type="number" min={0} max={60} className="h-8 text-xs" value={editingAffiliate.trialDays || 0} onChange={e => setEditingAffiliate((p: any) => ({ ...p, trialDays: Number(e.target.value) }))} /></div>
                                <div className="space-y-1"><Label className="text-xs">Expiração (dias, 0=infinito)</Label><Input type="number" min={0} className="h-8 text-xs" value={editingAffiliate.expiryDays || 0} onChange={e => setEditingAffiliate((p: any) => ({ ...p, expiryDays: Number(e.target.value), expiresAt: Number(e.target.value) > 0 ? Date.now() + Number(e.target.value) * 86400000 : null }))} /></div>
                                <div className="flex items-center gap-2 pt-5">
                                  <button onClick={() => setEditingAffiliate((p: any) => ({ ...p, active: !p.active }))} className={`relative w-10 h-5 rounded-full transition-colors ${editingAffiliate.active ? 'bg-green-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editingAffiliate.active ? 'left-5' : 'left-0.5'}`} /></button>
                                  <Label className="text-xs">{editingAffiliate.active ? 'Ativo' : 'Inativo'}</Label>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" className="flex-1" onClick={() => handleEditAffiliate(af, editingAffiliate)}>Salvar</Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingAffiliate(null)}>Cancelar</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {(affiliateReport.affiliates || affiliateReport.marketers || []).length === 0 && (
                        <p className="py-6 text-center text-sm text-slate-400">Nenhum afiliado ainda.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── PLATAFORMA ──────────────────────────────────────────────── */}
            <TabsContent value="platform" className="mt-0">
              <Card className="border-0 shadow-sm max-w-xl">
                <CardHeader>
                  <CardTitle>Configurações da Plataforma</CardTitle>
                  <CardDescription>Ajustes globais que afetam todos os negócios.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Nome da Plataforma</Label>
                    <Input value={platformSettings.platformName} onChange={e => setPlatformSettings(p => ({ ...p, platformName: e.target.value }))} placeholder="Bella & Chic" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mail de Suporte</Label>
                    <Input type="email" value={platformSettings.supportEmail} onChange={e => setPlatformSettings(p => ({ ...p, supportEmail: e.target.value }))} placeholder="suporte@bellachic.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duração do Trial (dias)</Label>
                    <Input type="number" min={1} max={90} value={platformSettings.trialDays} onChange={e => setPlatformSettings(p => ({ ...p, trialDays: Number(e.target.value) }))} />
                    <p className="text-xs text-slate-500">Padrão atual: {platformSettings.trialDays} dias. Mínimo: 1 · Máximo: 90.</p>
                  </div>
                  <Button disabled={savingPlatform} onClick={handleSavePlatformSettings}>
                    {savingPlatform && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar Configurações
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── DEV TOOLS ───────────────────────────────────────────────── */}
            <TabsContent value="devtools" className="mt-0 space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div><p className="font-semibold">Atenção — Ambiente de Desenvolvimento</p><p>Estas ações afetam dados reais do Firestore e não podem ser desfeitas.</p></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Popular Banco de Dados</CardTitle><CardDescription>Cria dados de exemplo para testes.</CardDescription></CardHeader>
                  <CardFooter>
                    <Button variant="outline" disabled={isSeeding} onClick={() => setConfirmDialog({ open: true, type: 'seed' })}>
                      {isSeeding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Populando...</> : <><Database className="mr-2 h-4 w-4" />Popular Dados</>}
                    </Button>
                  </CardFooter>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Teste de Isolamento</CardTitle><CardDescription>Cria 2 salões isolados para validar regras de segurança.</CardDescription></CardHeader>
                  <CardFooter>
                    <Button variant="outline" disabled={isTestingIsolation} onClick={() => setConfirmDialog({ open: true, type: 'isolation' })}>
                      {isTestingIsolation ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</> : <><Shield className="mr-2 h-4 w-4" />Testar Isolamento</>}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </main>
          {/* ── MOBILE BOTTOM NAV ─────────────────────────────────────── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-100 shadow-lg">
          <div className="flex">
            {[
              { value: 'overview',   label: 'Início',    Icon: Home },
              { value: 'salons',     label: 'Negócios',  Icon: Building },
              { value: 'plans',      label: 'Planos',    Icon: CreditCard },
              { value: 'users',      label: 'Usuários',  Icon: Users },
              { value: 'platform',   label: 'Config',    Icon: Settings },
            ].map(({ value, label, Icon }) => (
              <button key={value} onClick={() => setActiveTab(value)}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-[9px] font-medium ${activeTab === value ? 'text-rose-600' : 'text-slate-400'}`}>
                <Icon className="h-5 w-5" />
                <span className="leading-none">{label}</span>
              </button>
            ))}
            <button onClick={handleLogout} className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-[9px] font-medium text-red-400">
              <LogOut className="h-5 w-5" /><span className="leading-none">Sair</span>
            </button>
          </div>
        </nav>
    </div>

      {/* ── DIALOGS ─────────────────────────────────────────────────────── */}

      {/* Criar/editar salão */}
      <Dialog open={salonDialog.open} onOpenChange={o => !o && setSalonDialog({ open: false, mode: 'create' })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{salonDialog.mode === 'create' ? 'Novo Negócio' : `Editar — ${salonDialog.salon?.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={salonForm.name} onChange={e => setSalonForm(p => ({ ...p, name: e.target.value }))} placeholder="Salão Exemplo" />
              </div>
              <div className="space-y-1.5">
                <Label>Slug *</Label>
                <Input value={salonForm.slug} onChange={e => setSalonForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="salao-exemplo" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={salonForm.businessType} onValueChange={v => setSalonForm(p => ({ ...p, businessType: v as BusinessType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map(b => (
                      <SelectItem key={b.value} value={b.value}>
                        <span className={`flex items-center gap-1.5 ${b.color}`}>{b.icon} {b.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Plano</Label>
                <Select value={salonForm.planId} onValueChange={v => setSalonForm(p => ({ ...p, planId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map(pl => <SelectItem key={pl.id} value={pl.id}>{pl.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={salonForm.status} onValueChange={v => setSalonForm(p => ({ ...p, status: v as Salon['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {salonDialog.mode === 'create' && (
                <div className="space-y-1.5">
                  <Label>Dias de trial</Label>
                  <Input type="number" min={1} value={salonForm.trialDays} onChange={e => setSalonForm(p => ({ ...p, trialDays: Number(e.target.value) }))} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalonDialog({ open: false, mode: 'create' })}>Cancelar</Button>
            <Button disabled={savingSalon} onClick={saveSalon}>
              {savingSalon && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {salonDialog.mode === 'create' ? 'Criar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar plano */}
      <Dialog open={planDialog.open} onOpenChange={o => !o && setPlanDialog({ open: false, mode: 'create' })}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{planDialog.mode === 'create' ? 'Novo Plano' : `Editar — ${planDialog.plan?.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do Plano *</Label>
                <Input value={planForm.name} onChange={e => setPlanForm((p: any) => ({ ...p, name: e.target.value }))} placeholder="Ex: Agenda Pro" />
              </div>
              <div className="space-y-1.5">
                <Label>Preço (R$) *</Label>
                <Input type="number" value={planForm.price} onChange={e => setPlanForm((p: any) => ({ ...p, price: e.target.value }))} placeholder="89.99" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Máx. de Profissionais (9999 = ilimitado)</Label>
              <Input type="number" value={planForm.maxProfessionals} onChange={e => setPlanForm((p: any) => ({ ...p, maxProfessionals: e.target.value }))} />
            </div>
            <Separator />
            <div>
              <p className="text-sm font-semibold mb-3">Funcionalidades incluídas</p>
              <div className="grid grid-cols-2 gap-2">
                {PLAN_FEATURES_LABELS.map(f => (
                  <label key={f.key} className="flex items-center gap-2 cursor-pointer rounded-lg border p-2.5 hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={!!planFeatureForm[f.key]}
                      onChange={e => setPlanFeatureForm(p => ({ ...p, [f.key]: e.target.checked }))}
                      className="h-4 w-4 accent-rose-600"
                    />
                    <span className="text-xs font-medium text-slate-700">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog({ open: false, mode: 'create' })}>Cancelar</Button>
            <Button disabled={savingPlan} onClick={savePlan}>
              {savingPlan && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {planDialog.mode === 'create' ? 'Criar Plano' : 'Salvar Plano'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estender trial */}
      <Dialog open={extendTrialDialog.open} onOpenChange={o => !o && setExtendTrialDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Estender Trial</DialogTitle>
            <DialogDescription>{extendTrialDialog.salon?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Quantos dias a mais?</Label>
              <Input type="number" min={1} max={90} value={extendTrialDialog.days}
                onChange={e => setExtendTrialDialog(p => ({ ...p, days: Number(e.target.value) }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTrialDialog(p => ({ ...p, open: false }))}>Cancelar</Button>
            <Button onClick={handleExtendTrial}>Estender +{extendTrialDialog.days} dias</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir usuário */}
      <Dialog open={deleteUserDialog.open} onOpenChange={o => !o && setDeleteUserDialog({ open: false })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Usuário</DialogTitle>
            <DialogDescription>Excluir <strong>{deleteUserDialog.user?.displayName || deleteUserDialog.user?.email}</strong>? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserDialog({ open: false })}>Cancelar</Button>
            <Button variant="destructive" disabled={!!deletingUserUid} onClick={handleDeleteUser}>
              {deletingUserUid ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar ação dev */}
      <Dialog open={confirmDialog.open} onOpenChange={o => !o && setConfirmDialog({ open: false, type: '' })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Ação</DialogTitle>
            <DialogDescription>
              {confirmDialog.type === 'seed' ? 'Isso vai popular o banco com dados de teste. Continuar?' : 'Isso vai criar 2 salões de teste para validar isolamento. Continuar?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, type: '' })}>Cancelar</Button>
            <Button onClick={runConfirmedAction}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
