import React, { useState, useEffect } from 'react';
import {
  AlertCircle, Clock, Calendar, Users, ShoppingBag, Plus, Edit, Trash2,
  CheckCircle, XCircle, DollarSign, Package, Search, Truck, MapPin,
  Phone, Mail, User, CalendarIcon as CalendarIconLucide, Copy, UserPlus, LogOut,
  Home, Building, MessageSquare, BarChart2, Star, Tag, Scissors,
  Stethoscope, Dumbbell, Briefcase, Bot,
  UserCheck, CreditCard, Settings, Palette, Gift, ThumbsUp, Store, Camera, ClipboardList, FileText,
  Trophy, CalendarDays,
  ChevronLeft, ChevronRight, Menu, X as XIcon, TrendingUp, TrendingUp as TrendingUpIcon, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar as CalendarComponent } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { InteractiveSchedule } from '../components/admin/InteractiveSchedule';
import { InstallPWABanner } from '../components/InstallPWABanner';

import { salonService } from '../services/salonService';
import { storeService } from '../services/storeService';
import { billingService } from '../services/billingService';
import { SalonService, Professional, Appointment, Order, OrderStatus, Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSalon } from '../contexts/SalonContext';
import { useSettings } from '../contexts/SettingsContext';
import { usePlanAccess } from '../hooks/usePlanAccess';
import { SettingsPanel } from '../components/admin/SettingsPanel';
import { ServiceForm } from '../components/admin/ServiceForm';
import { ProfessionalForm } from '../components/admin/ProfessionalForm';
import { ProductForm } from '../components/admin/ProductForm';
import { CreateProfessionalUserForm } from '../components/admin/CreateProfessionalUserForm';
import { ReportsTab } from '../components/admin/ReportsTab';
import { DREReport } from '../components/admin/DREReport';
import { ProfessionalReportTab } from '../components/admin/ProfessionalReportTab';
import { ReviewsList } from '../components/admin/ReviewSystem';
import { LoyaltyAdmin } from '../components/admin/LoyaltySystem';
import { StoryGenerator } from '../components/admin/StoryGenerator';
import { ClientsTab } from '../components/admin/ClientsTab';
import { ImportClientsTab } from '../components/admin/ImportClientsTab';
import { CouponsManager } from '../components/admin/CouponsManager';
import { CRMTab } from '../components/admin/CRMTab';
import { BotConfigTab } from '../components/admin/BotConfigTab';
import { QuotesTab } from '../components/admin/QuotesTab';
import { ClientRecordTab } from '../components/admin/ClientRecordTab';
import { AnamneseTab } from '../components/admin/AnamneseTab';
import { OnboardingChecklist } from '../components/admin/OnboardingChecklist';
import CRMProDashboard from './CRMProDashboard';
import { BeforeAfterTab } from '../components/admin/BeforeAfterTab';
import { PackagesTab } from '../components/admin/PackagesTab';
import { DocumentsTab } from '../components/admin/DocumentsTab';
import { EventsTab } from '../components/admin/EventsTab';
import { SportsPackageTab } from '../components/admin/SportsPackageTab';

// ─── Helpers de tradução ────────────────────────────────────────────────────

const ORDER_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Aguardando Pagamento',
  AWAITING_PIX: 'Aguardando PIX',
  RESERVED: 'Reservado',
  PAID:             'Pago',
  PREPARING:        'Preparando',
  SHIPPED:          'Enviado',
  READY_FOR_PICKUP: 'Pronto para Retirada',
  COMPLETED:        'Concluído',
  CANCELLED:        'Cancelado',
};

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  PENDING:     'Pendente',
  CONFIRMED:   'Confirmado',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  RESCHEDULED: 'Reagendado',
  AWAITING_DEPOSIT: 'Aguardando Sinal',
};

const orderBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'RESERVED' || status === 'AWAITING_PIX') return 'secondary';
  if (status === 'COMPLETED' || status === 'PAID') return 'default';
  if (status === 'CANCELLED') return 'destructive';
  if (status === 'PREPARING' || status === 'SHIPPED' || status === 'READY_FOR_PICKUP') return 'secondary';
  return 'outline';
};

const appointmentBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'CONFIRMED' || status === 'COMPLETED') return 'default';
  if (status === 'CANCELLED') return 'destructive';
  if (status === 'RESCHEDULED') return 'secondary';
  return 'outline';
};

// ─── KPI Card com efeito 3D (precisa ser componente para usar hooks) ────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  ring: string;
}

const KpiCard = ({ label, value, sub, Icon, color, bg, ring }: KpiCardProps) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [rot, setRot] = React.useState({ x: 0, y: 0 });
  return (
    <div
      ref={ref}
      onMouseMove={e => {
        if (!ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setRot({
          x: ((e.clientY - r.top - r.height / 2) / r.height) * 10,
          y: -((e.clientX - r.left - r.width / 2) / r.width) * 10,
        });
      }}
      onMouseLeave={() => setRot({ x: 0, y: 0 })}
      style={{
        transform: `perspective(800px) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
        transition: 'transform 0.15s ease',
      }}
      className={`bg-white rounded-2xl border border-slate-100 shadow-sm ring-1 ${ring} p-3 sm:p-5 cursor-default hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <div className={`h-9 w-9 rounded-xl ${bg} ${color} flex items-center justify-center`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-3xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
};

// ─── Skeleton de carregamento ───────────────────────────────────────────────

const DashboardSkeleton = () => (
  <div className="container mx-auto space-y-8 px-4 py-12">
    <div className="space-y-2">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-40" />
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2"><Skeleton className="h-4 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-8 w-20" /><Skeleton className="mt-1 h-3 w-40" /></CardContent>
        </Card>
      ))}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
          <CardContent className="space-y-4">
            {[...Array(3)].map((_, j) => <Skeleton key={j} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

// ─── Modal de detalhes do pedido ────────────────────────────────────────────

interface OrderDetailModalProps {
  order: Order;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>;
}

const OrderDetailModal = ({ order, onUpdateStatus }: OrderDetailModalProps) => {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [trackingCode, setTrackingCode] = useState((order as any).trackingCode || '');
  const [savingTracking, setSavingTracking] = useState(false);

  const handleSaveTracking = async () => {
    if (!trackingCode.trim()) return;
    setSavingTracking(true);
    try {
      const { auth } = await import('../firebase');
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/order/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, trackingCode: trackingCode.trim(), carrier: 'Correios' }),
      });
      toast.success('Código de rastreio enviado para o cliente via WhatsApp!');
      setOpen(false);
    } catch {
      toast.error('Erro ao salvar código de rastreio');
    } finally { setSavingTracking(false); }
  };

  const handleStatus = async (status: OrderStatus) => {
    setUpdating(true);
    await onUpdateStatus(order.id, status);
    setUpdating(false);
    setOpen(false);
  };

  const nextActions: { label: string; status: OrderStatus }[] = [];
  // Reserva / PIX pendente — dono confirma pagamento manualmente
  if (order.status === 'RESERVED' || order.status === 'AWAITING_PIX') {
    nextActions.push({ label: '✓ Confirmar Pagamento Recebido', status: 'PAID' });
  }
  if (order.status === 'PAID') {
    nextActions.push({ label: 'Marcar como Preparando', status: 'PREPARING' });
  }
  if (order.status === 'PREPARING') {
    if (order.shippingMethod === 'PICKUP') {
      nextActions.push({ label: 'Pronto para Retirada', status: 'READY_FOR_PICKUP' });
    } else {
      nextActions.push({ label: 'Marcar como Enviado', status: 'SHIPPED' });
    }
  }
  if (order.status === 'SHIPPED' || order.status === 'READY_FOR_PICKUP') {
    nextActions.push({ label: 'Marcar como Concluído', status: 'COMPLETED' });
  }
  if (!['COMPLETED', 'CANCELLED'].includes(order.status)) {
    nextActions.push({ label: 'Cancelar Pedido', status: 'CANCELLED' });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Detalhes</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pedido #{order.id.slice(-6).toUpperCase()}</DialogTitle>
          <DialogDescription>
            {format(new Date(order.createdAt), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status atual */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Status atual</span>
            <Badge variant={orderBadgeVariant(order.status)}>
              {ORDER_STATUS_LABEL[order.status] || order.status}
            </Badge>
          </div>

          {/* Dados do cliente */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Cliente</p>
            <div className="rounded-lg border p-3 space-y-1.5 text-sm">
              {(order as any).customerName && (
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{(order as any).customerName}</span>
                </div>
              )}
              {(order as any).customerEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{(order as any).customerEmail}</span>
                </div>
              )}
              {(order as any).customerPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{(order as any).customerPhone}</span>
                </div>
              )}
              {!(order as any).customerName && !(order as any).customerEmail && (
                <span className="text-muted-foreground">ID: {order.clientId}</span>
              )}
            </div>
          </div>

          {/* Observação do pedido */}
          {(order as any).orderNote && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Observação do Cliente</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                📝 {(order as any).orderNote}
              </div>
            </div>
          )}

          {/* Endereço (apenas para entrega) */}
          {order.shippingMethod === 'FIXED' && order.address && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Endereço de Entrega</p>
              <div className="rounded-lg border p-3 text-sm space-y-0.5">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    {order.address.street}, {order.address.number}
                    {order.address.complement ? `, ${order.address.complement}` : ''}<br />
                    {order.address.neighborhood} — {order.address.city}/{order.address.state}<br />
                    CEP: {order.address.zipCode}
                  </span>
                </div>
              </div>
            </div>
          )}

          {order.shippingMethod === 'PICKUP' && (
            <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span>Retirada no local</span>
            </div>
          )}

          {/* Código de rastreio */}
          {order.shippingMethod === 'FIXED' && (
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                📦 Código de Rastreio
                {(order as any).trackingCode && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Enviado ao cliente</span>
                )}
              </p>
              {(order as any).trackingCode ? (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                  <p className="font-mono font-bold">{(order as any).trackingCode}</p>
                  <a
                    href={`https://rastreamento.correios.com.br/app/index.php?objeto=${(order as any).trackingCode}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs text-primary underline mt-1 block"
                  >
                    Ver rastreamento →
                  </a>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trackingCode}
                    onChange={e => setTrackingCode(e.target.value.toUpperCase())}
                    placeholder="Ex: BR123456789BR"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                  <Button size="sm" onClick={handleSaveTracking} disabled={savingTracking || !trackingCode.trim()}>
                    {savingTracking ? '...' : 'Enviar'}
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Ao salvar, o cliente recebe o código automaticamente no WhatsApp.
              </p>
            </div>
          )}

          {/* Itens */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Itens</p>
            <div className="rounded-lg border divide-y text-sm">
              {(order.items ?? []).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2">
                  <span>{item.quantity}× {item.name}</span>
                  <span className="font-medium">R$ {((item.price ?? 0) * (item.quantity ?? 1)).toFixed(2)}</span>
                </div>
              ))}
              {order.shippingFee > 0 && (
                <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Frete</span>
                  <span>R$ {order.shippingFee.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="text-primary">R$ {(order.totalAmount ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {nextActions.length > 0 && (
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            {nextActions.map((action) => (
              <Button
                key={action.status}
                className="w-full"
                variant={action.status === 'CANCELLED' ? 'destructive' : 'default'}
                disabled={updating}
                onClick={() => handleStatus(action.status)}
              >
                {action.label}
              </Button>
            ))}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ─── Componente principal ───────────────────────────────────────────────────

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { salon } = useSalon();
  const businessType = (salon as any)?.businessType || 'beauty';

  // Labels dinâmicos por tipo de negócio
  const bizLabel = {
    beauty:   { place: 'no estabelecimento', team: 'Equipe', teamDesc: 'Gerencie os profissionais que atendem.', client: 'cliente', clients: 'Clientes', appointment: 'Agendamento', pickup: 'Retirada no local', service: 'Serviço' },
    health:   { place: 'na clínica',         team: 'Equipe Clínica', teamDesc: 'Gerencie os profissionais de saúde.', client: 'paciente', clients: 'Pacientes', appointment: 'Consulta', pickup: 'Retirada na clínica', service: 'Consulta' },
    fitness:  { place: 'no estúdio',         team: 'Equipe de Instrutores', teamDesc: 'Gerencie os instrutores e treinadores.', client: 'aluno', clients: 'Alunos', appointment: 'Aula', pickup: 'Retirada no estúdio', service: 'Aula' },
    services: { place: 'no escritório',      team: 'Equipe',  teamDesc: 'Gerencie os profissionais da equipe.', client: 'cliente', clients: 'Clientes', appointment: 'Reunião', pickup: 'Retirada no local', service: 'Serviço' },

    sports:   { place: 'na quadra',          team: 'Recursos',  teamDesc: 'Gerencie os recursos e espaços.', client: 'cliente', clients: 'Clientes', appointment: 'Reserva', pickup: 'Retirada no local', service: 'Espaço' },
  }[businessType] || {
    place: 'no local', team: 'Equipe', teamDesc: 'Gerencie os profissionais que atendem.', client: 'cliente', clients: 'Clientes', appointment: 'Agendamento', pickup: 'Retirada no local', service: 'Serviço'
  };
  const { settings } = useSettings();
  const { plan, checkLimit } = usePlanAccess();
  // CRM Pro is handled via inline render below

  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(true);

  useEffect(() => {
    if (!profile?.salonId) return;
    import('firebase/firestore').then(({ doc, getDoc }) => {
      import('../firebase').then(({ db: fdb }) => {
        getDoc(doc(fdb, `salons/${profile.salonId}/settings`, 'onboarding'))
          .then(snap => { setOnboardingDone(snap.data()?.completed === true); })
          .catch(() => setOnboardingDone(true));
      });
    });
  }, [profile?.salonId]);
  const [services, setServices] = useState<SalonService[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [appointmentFilter, setAppointmentFilter] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    professionalId: 'all',
    status: 'all',
  });
  const [scheduleView, setScheduleView] = useState<'table' | 'visual'>('visual');
  const [reschedulingApt, setReschedulingApt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const [orderFilter, setOrderFilter] = useState({ status: 'all', search: '' });

  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<SalonService | undefined>(undefined);

  const [isProfessionalDialogOpen, setIsProfessionalDialogOpen] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | undefined>(undefined);

  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(undefined);

  const [createProfDialog, setCreateProfDialog] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: string; id: string; name: string }>({
    open: false, type: '', id: '', name: '',
  });

  // ── Lembrete manual via WhatsApp ────────────────────────────────────────
  const [reminderTemplate, setReminderTemplate] = useState<string>('');

  useEffect(() => {
    if (!profile?.salonId) return;
    import('firebase/firestore').then(({ doc, getDoc }) => {
      import('../firebase').then(({ db }) => {
        getDoc(doc(db, `salons/${profile.salonId}/settings`, 'notifications')).then(snap => {
          if (snap.exists()) {
            setReminderTemplate((snap.data() as any).whatsappReminderMessage || '');
          }
        }).catch(() => {});
      });
    });
  }, [profile?.salonId]);

  const sendManualReminder = (apt: Appointment) => {
    if (!apt.customerPhone) {
      toast.error('Este agendamento não tem telefone cadastrado.');
      return;
    }
    const [y, m, d] = apt.date.split('-');
    const dataBR = `${d}/${m}/${y}`;
    const template = reminderTemplate ||
      `Olá {{nome}}! 👋\n\nLembrando do seu agendamento:\n\n✂️ Serviço: {{servico}}\n👤 Profissional: {{profissional}}\n📅 Data: {{data}}\n🕐 Horário: {{horario}}\n\nEstamos te esperando! 😊`;
    const msg = template
      .replace(/\{\{nome\}\}/gi, apt.clientName || 'Cliente')
      .replace(/\{\{servico\}\}/gi, apt.serviceName)
      .replace(/\{\{profissional\}\}/gi, apt.professionalName)
      .replace(/\{\{data\}\}/gi, dataBR)
      .replace(/\{\{horario\}\}/gi, apt.startTime);
    const cleaned = apt.customerPhone.replace(/\D/g, '');
    const number  = cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
    const url = `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      sessionStorage.clear();
      navigate('/login');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao sair');
    }
  };

  // ── Checklist de onboarding ──────────────────────────────────────────────

  const fetchData = async () => {
    if (!profile?.salonId) return;
    setLoading(true);
    try {
      const id = profile.salonId;
      const [s, p, o, pr] = await Promise.all([
        salonService.getServices(id),
        salonService.getProfessionals(id, false),
        storeService.getOrdersAdmin(id),
        storeService.getAllProductsAdmin(id),
      ]);
      setServices(s);
      setProfessionals(p);
      setOrders(o);
      setProducts(pr);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar dados do painel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [profile?.salonId]);

  // Realtime listener para agendamentos — atualiza instantaneamente sem refresh
  useEffect(() => {
    if (!profile?.salonId) return;
    const q = query(
      collection(db, `salons/${profile.salonId}/appointments`),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const apts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setAppointments(apts);
    }, (err) => {
      console.error('[Realtime appointments]', err);
    });
    return () => unsub();
  }, [profile?.salonId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session_id')) {
      toast.success('Assinatura ativada com sucesso! Seu plano já está ativo.');
      window.history.replaceState({}, '', window.location.pathname);
      fetchData();
    }
    if (params.get('payment') === 'success') {
      toast.success('Pagamento confirmado!');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const confirmDelete = async () => {
    if (!profile?.salonId) return;
    const { type, id } = deleteDialog;
    try {
      if (type === 'service') await salonService.deleteService(profile.salonId, id);
      if (type === 'professional') await salonService.deleteProfessional(profile.salonId, id);
      if (type === 'product') await storeService.deleteProduct(profile.salonId, id);
      toast.success('Excluído com sucesso!');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao excluir.');
    } finally {
      setDeleteDialog({ open: false, type: '', id: '', name: '' });
    }
  };

  const updateOrderStatus = async (id: string, status: Order['status']) => {
    if (!profile?.salonId) return;
    try {
      await storeService.updateOrderStatus(profile.salonId, id, status);
      toast.success('Status atualizado!');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleReschedule = async () => {
    if (!reschedulingApt || !newDate || !newTime || !profile?.salonId) return;
    setRescheduling(true);
    try {
      await salonService.updateAppointment(profile.salonId, reschedulingApt.id, {
        date: newDate,
        startTime: newTime,
        status: 'CONFIRMED',
        updatedAt: Date.now(),
      });
      toast.success('Agendamento reagendado!');
      setReschedulingApt(null);
      setNewDate('');
      setNewTime('');
      fetchData();
    } catch {
      toast.error('Erro ao reagendar.');
    } finally {
      setRescheduling(false);
    }
  };

  const updateAppointmentStatus = async (id: string, status: Appointment['status']) => {
    if (!profile?.salonId) return;
    try {
      await salonService.updateAppointmentStatus(profile.salonId, id, status);
      toast.success('Status atualizado!');
      fetchData();

      // Notificação automática WhatsApp para o cliente (best-effort, não bloqueia)
      const aptToNotify = appointments.find(a => a.id === id);
      if (aptToNotify) {
        fetch('/api/appointments/notify-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salonId: profile.salonId, appointmentId: id, newStatus: status, appointment: aptToNotify }),
        }).catch(() => {});
      }

      // Se cancelou, notifica lista de espera
      if (status === 'CANCELLED' && aptToNotify) {
        const token = await import('../firebase').then(({ auth }) => auth.currentUser?.getIdToken());
        fetch('/api/waitlist/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ salonId: profile.salonId, date: aptToNotify.date, serviceId: aptToNotify.serviceId }),
        }).catch(() => {});
      }

      // Pontos de fidelidade ao concluir atendimento
      if (status === 'COMPLETED') {
        const apt = appointments.find(a => a.id === id);
        if (apt?.clientId && !apt.clientId.startsWith('guest_')) {
          import('firebase/firestore').then(({ doc, getDoc, setDoc, updateDoc, increment }) => {
            import('../firebase').then(({ db }) => {
              const loyaltyRef = doc(db, `salons/${profile.salonId}/settings/loyalty`);
              getDoc(loyaltyRef).then(snap => {
                const cfg = snap.data() as any;
                if (!cfg?.enabled) return;
                const pts = (cfg.pointsPerVisit || 10) +
                  Math.floor((apt.totalAmount || 0) * (cfg.pointsPerReal || 0));
                const accRef = doc(db, `salons/${profile.salonId}/loyalty/${apt.clientId}`);
                getDoc(accRef).then(accSnap => {
                  if (accSnap.exists()) {
                    updateDoc(accRef, { points: increment(pts), totalVisits: increment(1), totalSpent: increment(apt.totalAmount || 0), lastVisit: Date.now(), updatedAt: Date.now() });
                  } else {
                    setDoc(accRef, { clientId: apt.clientId, clientName: apt.clientName, salonId: profile.salonId, points: pts, totalVisits: 1, totalSpent: apt.totalAmount || 0, redeemedRewards: 0, lastVisit: Date.now(), updatedAt: Date.now() });
                  }
                });
              });
            });
          });
        }
      }

      // Lembrete pós-atendimento — manda WhatsApp pedindo avaliação
      if (status === 'COMPLETED') {
        const apt = appointments.find(a => a.id === id);
        if (apt?.customerPhone) {
          const phone = apt.customerPhone.replace(/\D/g, '');
          const number = phone.startsWith('55') ? phone : `55${phone}`;
          const salonSlug = salon?.slug || '';
          const link = `${window.location.origin}/s/${salonSlug}/avaliacoes`;
          const msg = encodeURIComponent(
            `Olá, ${apt.clientName}! 😊

Obrigado pela visita! Esperamos ter superado suas expectativas.

Que tal deixar uma avaliação sobre seu atendimento? Leva menos de 1 minuto e nos ajuda muito! ⭐

${link}`
          );
          // Abre WhatsApp em nova aba com mensagem pré-pronta (não bloqueia o fluxo)
          setTimeout(() => {
            window.open(`https://wa.me/${number}?text=${msg}`, '_blank');
          }, 500);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleAppointmentUpdate = (id: string, changes: any) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...changes } : a));
  };

  // ── Filtros ────────────────────────────────────────────────────────────
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = orderFilter.status === 'all' || order.status === orderFilter.status;
    const q = orderFilter.search.toLowerCase();
    const matchesSearch =
      q === '' ||
      order.id.toLowerCase().includes(q) ||
      ((order as any).customerName || '').toLowerCase().includes(q) ||
      ((order as any).customerEmail || '').toLowerCase().includes(q) ||
      ((order as any).customerPhone || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const filteredAppointments = appointments.filter((apt) => {
    const matchesDate = appointmentFilter.date === 'all' || apt.date === appointmentFilter.date;
    const matchesPro = appointmentFilter.professionalId === 'all' || apt.professionalId === appointmentFilter.professionalId;
    const matchesStatus = appointmentFilter.status === 'all' || apt.status === appointmentFilter.status;
    return matchesDate && matchesPro && matchesStatus;
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const upcomingAppointments = appointments
    .filter((a) => a.date >= today && !['CANCELLED', 'COMPLETED'].includes(a.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, 5);

  // ── KPIs avançados ──────────────────────────────────────────────────────────
  const thisMonthStr = today.slice(0, 7); // YYYY-MM
  const thisMonthApts = appointments.filter(a => a.date.startsWith(thisMonthStr));
  const completedThisMonth = thisMonthApts.filter(a => a.status === 'COMPLETED');
  const cancelledThisMonth = thisMonthApts.filter(a => a.status === 'CANCELLED');
  const noShowRate = thisMonthApts.length > 0
    ? Math.round((cancelledThisMonth.length / thisMonthApts.length) * 100)
    : 0;
  // Receita dos atendimentos do mês
  const aptRevenueMonth = completedThisMonth.reduce((acc, a) => acc + (a.totalAmount || 0), 0);

  // Gasto por cliente este mês (a partir dos agendamentos concluídos)
  const clientSpendingThisMonth = React.useMemo(() => {
    const map: Record<string, { name: string; phone: string; total: number; visits: number }> = {};
    completedThisMonth.forEach((a: any) => {
      const key = a.customerPhone || a.clientName || 'desconhecido';
      if (!map[key]) map[key] = { name: a.clientName || 'Cliente', phone: a.customerPhone || '', total: 0, visits: 0 };
      map[key].total += a.totalAmount || 0;
      map[key].visits += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [completedThisMonth]);
  // Novos vs retorno — clientes únicos
  const prevMonthStr = (() => {
    const d = new Date(today); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7);
  })();
  const prevPhones = new Set(
    appointments.filter(a => a.date.startsWith(prevMonthStr)).map(a => a.customerPhone || '')
  );
  const thisMonthPhones = new Set(
    thisMonthApts.map(a => a.customerPhone || '').filter(Boolean)
  );
  const newClientsCount = [...thisMonthPhones].filter(p => !prevPhones.has(p)).length;
  const returningCount = thisMonthPhones.size - newClientsCount;
  // Retenção 60 dias
  const sixtyDaysAgo = new Date(today); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyAgoStr = sixtyDaysAgo.toISOString().split('T')[0];
  const recent60 = appointments.filter(a => a.date >= sixtyAgoStr && a.status !== 'CANCELLED');
  const phoneCounts60: Record<string, number> = {};
  recent60.forEach(a => { if (a.customerPhone) phoneCounts60[a.customerPhone] = (phoneCounts60[a.customerPhone] || 0) + 1; });
  const returningIn60 = Object.values(phoneCounts60).filter(c => c >= 2).length;
  const uniqueIn60 = Object.keys(phoneCounts60).length;
  const retentionPct = uniqueIn60 >= 3 ? Math.round(returningIn60 / uniqueIn60 * 100) : null;
  // Agendamentos hoje
  const todayApts = appointments.filter(a => a.date === today && !['CANCELLED'].includes(a.status));

  const recentOrders = [...orders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  const totalRevenue = orders
    .filter((o) => ['COMPLETED', 'PAID', 'PREPARING', 'SHIPPED', 'READY_FOR_PICKUP'].includes(o.status))
    .reduce((acc, o) => acc + o.totalAmount, 0);

  const pendingOrdersCount = orders.filter((o) => o.status === 'PAID').length;

  const handleCheckout = async (priceId: string) => {
    if (!profile?.salonId || !salon) return;
    try {
      const adminUrl = `${window.location.origin}/s/${salon.slug}/admin`;
      const url = await billingService.createCheckoutSession({
        priceId,
        salonId: profile.salonId,
        salonSlug: salon.slug,
        successUrl: `${adminUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: adminUrl,
      });
      window.location.href = url;
    } catch (error) {
      console.error(error);
      toast.error('Erro ao iniciar checkout.');
    }
  };

  if (loading) return <DashboardSkeleton />;


  // ── Build sidebar nav list ─────────────────────────────────────────────
  const buildNavGroups = () => {
    const byType: Record<string, {value:string;label:string;Icon:any;feature?:string}[][]> = {
      beauty: [
        [
          { value: 'appointments', label: 'Agenda',      Icon: Calendar,      feature: 'hasBooking' },
          { value: 'services',     label: 'Serviços',    Icon: Scissors,      feature: 'hasBooking' },
          { value: 'team',         label: 'Equipe',      Icon: UserCheck,     feature: 'hasBooking' },
          { value: 'bot',          label: 'Bot',         Icon: Bot,           feature: 'hasBooking' },
        ],
        [
          ...(!plan?.features.hasCRM ? [{ value: 'clientes', label: 'Clientes', Icon: Users, feature: 'hasBooking' }] : []),
          { value: 'crm',          label: 'CRM',         Icon: Users,         feature: 'hasCRM' },
          { value: 'records',      label: 'Fichas',      Icon: ClipboardList, feature: 'hasClientRecords' },
          { value: 'anamnese',     label: 'Anamnese',    Icon: FileText,      feature: 'hasAnamnese' },
          { value: 'fotos',        label: 'Antes/Depois',Icon: Camera,        feature: 'hasBeforeAfter' },
        ],
        [
          { value: 'quotes',       label: 'Orçamentos',  Icon: FileText,      feature: 'hasCRM' },
          { value: 'packages',     label: 'Pacotes',     Icon: Package,       feature: 'hasBooking' },
          { value: 'reports',      label: 'Relatórios',  Icon: BarChart2,     feature: 'hasReports' },
          { value: 'profReport',   label: 'Profissionais',Icon: UserCheck,    feature: 'hasReports' },
          { value: 'dre',          label: 'Financeiro',  Icon: DollarSign,    feature: 'hasReports' },
          { value: 'coupons',      label: 'Cupons',      Icon: Tag,           feature: 'hasStore' },
        ],
        [
          { value: 'loyalty',      label: 'Fidelidade',  Icon: Star,          feature: 'hasBooking' },
          { value: 'reviews',      label: 'Avaliações',  Icon: ThumbsUp,      feature: 'hasBooking' },
          { value: 'story',        label: 'Story',       Icon: Palette,       feature: 'hasBooking' },
        ],
        [
          { value: 'settings',     label: 'Config.',     Icon: Settings },
          { value: 'subscription', label: 'Assinatura',  Icon: CreditCard },
        ],
      ],
      health: [
        [
          { value: 'appointments', label: 'Agenda',       Icon: Calendar,      feature: 'hasBooking' },
          { value: 'services',     label: 'Procedimentos',Icon: Stethoscope,   feature: 'hasBooking' },
          { value: 'team',         label: 'Equipe Clínica',Icon: UserCheck,    feature: 'hasBooking' },
          { value: 'bot',          label: 'Bot',          Icon: Bot,           feature: 'hasBooking' },
        ],
        [
          ...(!plan?.features.hasCRM ? [{ value: 'clientes', label: 'Pacientes', Icon: Users, feature: 'hasBooking' }] : []),
          { value: 'crm',          label: 'CRM',          Icon: Users,         feature: 'hasCRM' },
          { value: 'records',      label: 'Prontuários',  Icon: ClipboardList, feature: 'hasBooking' },
          { value: 'anamnese',     label: 'Anamnese',     Icon: FileText,      feature: 'hasAnamnese' },
          { value: 'quotes',       label: 'Orçamentos',   Icon: FileText,      feature: 'hasBooking' },
          { value: 'packages',     label: 'Planos Trat.', Icon: Package,       feature: 'hasBooking' },
          { value: 'documents',    label: 'Documentos',   Icon: FileText,      feature: 'hasBooking' },
          { value: 'fotos',        label: 'Antes/Depois', Icon: Camera,        feature: 'hasBeforeAfter' },
        ],
        [
          { value: 'reports',      label: 'Relatórios',   Icon: BarChart2,     feature: 'hasReports' },
          { value: 'profReport',   label: 'Profissionais',Icon: UserCheck,     feature: 'hasReports' },
          { value: 'dre',          label: 'Financeiro',   Icon: DollarSign,    feature: 'hasReports' },
        ],
        [
          { value: 'reviews',      label: 'Avaliações',   Icon: ThumbsUp,      feature: 'hasBooking' },
        ],
        [
          { value: 'settings',     label: 'Config.',      Icon: Settings },
          { value: 'subscription', label: 'Assinatura',   Icon: CreditCard },
        ],
      ],
      fitness: [
        [
          { value: 'appointments', label: 'Agenda',       Icon: Calendar,      feature: 'hasBooking' },
          { value: 'services',     label: 'Aulas',        Icon: Dumbbell,      feature: 'hasBooking' },
          { value: 'team',         label: 'Equipe',       Icon: UserCheck,     feature: 'hasBooking' },
        ],
        [
          ...(!plan?.features.hasCRM ? [{ value: 'clientes', label: 'Alunos', Icon: Users, feature: 'hasBooking' }] : []),
          { value: 'crm',          label: 'CRM',          Icon: Users,         feature: 'hasCRM' },
          { value: 'records',      label: 'Fichas',       Icon: ClipboardList, feature: 'hasClientRecords' },
          { value: 'packages',     label: 'Pacotes',      Icon: Package,       feature: 'hasBooking' },
          { value: 'quotes',       label: 'Orçamentos',   Icon: FileText,      feature: 'hasBooking' },
        ],
        [
          { value: 'reports',      label: 'Relatórios',   Icon: BarChart2,     feature: 'hasReports' },
          { value: 'profReport',   label: 'Profissionais',Icon: UserCheck,     feature: 'hasReports' },
          { value: 'dre',          label: 'Financeiro',   Icon: DollarSign,    feature: 'hasReports' },
        ],
        [
          { value: 'loyalty',      label: 'Fidelidade',   Icon: Star,          feature: 'hasBooking' },
          { value: 'reviews',      label: 'Avaliações',   Icon: ThumbsUp,      feature: 'hasBooking' },
        ],
        [
          { value: 'settings',     label: 'Config.',      Icon: Settings },
          { value: 'subscription', label: 'Assinatura',   Icon: CreditCard },
        ],
      ],
      services: [
        [
          { value: 'appointments', label: 'Agenda',       Icon: Calendar,      feature: 'hasBooking' },
          { value: 'services',     label: 'Serviços',     Icon: Briefcase,     feature: 'hasBooking' },
          { value: 'team',         label: 'Equipe',       Icon: UserCheck,     feature: 'hasBooking' },
        ],
        [
          ...(!plan?.features.hasCRM ? [{ value: 'clientes', label: 'Clientes', Icon: Users, feature: 'hasBooking' }] : []),
          { value: 'crm',          label: 'CRM',          Icon: Users,         feature: 'hasCRM' },
          { value: 'records',      label: 'Briefings',    Icon: ClipboardList, feature: 'hasBooking' },
          { value: 'quotes',       label: 'Orçamentos',   Icon: FileText,      feature: 'hasBooking' },
          { value: 'packages',     label: 'Programas',    Icon: Package,       feature: 'hasBooking' },
          { value: 'documents',    label: 'Documentos',   Icon: FileText,      feature: 'hasBooking' },
        ],
        [
          { value: 'reports',      label: 'Relatórios',   Icon: BarChart2,     feature: 'hasReports' },
          { value: 'profReport',   label: 'Profissionais',Icon: UserCheck,     feature: 'hasReports' },
          { value: 'dre',          label: 'Financeiro',   Icon: DollarSign,    feature: 'hasReports' },
          { value: 'coupons',      label: 'Cupons',       Icon: Tag,           feature: 'hasStore' },
        ],
        [
          { value: 'reviews',      label: 'Avaliações',   Icon: ThumbsUp,      feature: 'hasBooking' },
        ],
        [
          { value: 'settings',     label: 'Config.',      Icon: Settings },
          { value: 'subscription', label: 'Assinatura',   Icon: CreditCard },
        ],
      ],
      sports: [
        [
          { value: 'appointments', label: 'Agenda',         Icon: Calendar,     feature: 'hasBooking' },
          { value: 'services',     label: 'Espaços/Quadras', Icon: Trophy,       feature: 'hasBooking' },
          { value: 'team',         label: 'Recursos',        Icon: UserCheck,    feature: 'hasBooking' },
        ],
        [
          ...(!plan?.features.hasCRM ? [{ value: 'clientes', label: 'Clientes', Icon: Users, feature: 'hasBooking' }] : []),
          { value: 'crm',          label: 'CRM',             Icon: Users,        feature: 'hasCRM' },
          { value: 'sport-packages', label: 'Pacotes Mensais', Icon: Package,    feature: 'hasBooking' },
          { value: 'events',       label: 'Eventos',         Icon: CalendarDays, feature: 'hasBooking' },
        ],
        [
          { value: 'reports',      label: 'Relatórios',      Icon: BarChart2,    feature: 'hasReports' },
          { value: 'dre',          label: 'Financeiro',      Icon: DollarSign,   feature: 'hasReports' },
        ],
        [
          { value: 'reviews',      label: 'Avaliações',      Icon: ThumbsUp,     feature: 'hasBooking' },
        ],
        [
          { value: 'settings',     label: 'Config.',         Icon: Settings },
          { value: 'subscription', label: 'Assinatura',      Icon: CreditCard },
        ],
      ],
    };

    const groups = byType[businessType] || byType.beauty;
    return groups.map(group =>
      group.filter(item => {
        if (!item.feature) return true;
        if (!plan) return false;
        return !!(plan.features as any)[item.feature];
      })
    ).filter(g => g.length > 0);
  };

  const navGroups = buildNavGroups();
  const groupLabels = ['AGENDA', 'CLIENTES', 'FINANCEIRO', 'MARKETING', 'CONFIGURAÇÕES'];

  // Flat list for mobile bottom bar (top 5 most used)
  const mobileBottomItems = [
    { value: 'overview',     label: 'Início',   Icon: Home },
    { value: 'appointments', label: 'Agenda',   Icon: Calendar },
    { value: 'crm',          label: 'CRM',      Icon: Users },
    { value: 'reports',      label: 'Relatórios',Icon: BarChart2 },
    { value: 'settings',     label: 'Config.',  Icon: Settings },
  ].filter(item => {
    if (item.value === 'crm') return plan?.features.hasCRM;
    if (item.value === 'reports') return plan?.features.hasReports;
    return true;
  });

  if (loading) return <DashboardSkeleton />;

  // ── CRM Pro plan — render dedicated dashboard inline ────────────────────
  if ((plan as any)?.id === 'crm-pro' || (plan as any)?.features?.hasCRMPro) {
    return <CRMProDashboard />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">

      {/* ══════════════════════════════════════════════
          SIDEBAR — Desktop fixo
      ══════════════════════════════════════════════ */}
      <aside className={`hidden md:flex flex-col bg-white border-r border-slate-100 shadow-sm transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-60'} fixed top-0 left-0 h-full z-30`}>

        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-slate-100 shrink-0">
          {!sidebarCollapsed && (
            <span className="font-black text-lg text-slate-800">
              Bella <span className="text-rose-600">&</span> Chic
            </span>
          )}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Overview link */}
        <div className="px-2 pt-3">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'overview'
                ? 'bg-rose-50 text-rose-600 border-l-2 border-rose-600'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Home className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>Visão Geral</span>}
          </button>
          {(plan?.features.hasStore || (plan?.features as any)?.hasProductsInternal) && (
            <button
              onClick={() => setActiveTab('store')}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                activeTab === 'store'
                  ? 'bg-rose-50 text-rose-600 border-l-2 border-rose-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Store className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>Loja</span>}
            </button>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {!sidebarCollapsed && (
                <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {groupLabels[gi] || ''}
                </p>
              )}
              <div className="space-y-0.5">
                {group.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => setActiveTab(value)}
                    title={sidebarCollapsed ? label : undefined}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      activeTab === value
                        ? 'bg-rose-50 text-rose-600 border-l-2 border-rose-600'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{label}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-100 p-3 shrink-0">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 font-bold text-sm">
                {(profile?.displayName || 'A')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{profile?.displayName || 'Admin'}</p>
                <p className="text-[10px] text-slate-500 truncate">{salon?.name || ''}</p>
              </div>
              <button onClick={handleLogout} title="Sair" className="text-slate-400 hover:text-rose-600 transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} title="Sair" className="w-full flex justify-center text-slate-400 hover:text-rose-600 transition-colors py-1">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* ══════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════ */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-60'}`}>

        {/* ── Top bar mobile ── */}
        <header className="md:hidden sticky top-0 z-20 bg-white border-b border-slate-100 px-4 h-14 flex items-center justify-between">
          <span className="font-black text-base text-slate-800">
            Bella <span className="text-rose-600">&</span> Chic
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ── Mobile drawer menu ── */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div className="fixed inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
            <aside className="relative w-64 bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <span className="font-black text-lg">Bella <span className="text-rose-600">&</span> Chic</span>
                <button onClick={() => setMobileMenuOpen(false)}><XIcon className="h-5 w-5 text-slate-500" /></button>
              </div>
              <nav className="flex-1 px-2 py-3 space-y-4">
                <div>
                  <button onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${activeTab === 'overview' ? 'bg-rose-50 text-rose-600' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <Home className="h-4 w-4" /> Visão Geral
                  </button>
                  {(plan?.features.hasStore || (plan?.features as any)?.hasProductsInternal) && (
                    <button onClick={() => { setActiveTab('store'); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${activeTab === 'store' ? 'bg-rose-50 text-rose-600' : 'text-slate-600 hover:bg-slate-50'}`}>
                      <Store className="h-4 w-4" /> Loja
                    </button>
                  )}
                </div>
                {navGroups.map((group, gi) => (
                  <div key={gi}>
                    <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{groupLabels[gi] || ''}</p>
                    {group.map(({ value, label, Icon }) => (
                      <button key={value} onClick={() => { setActiveTab(value); setMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${activeTab === value ? 'bg-rose-50 text-rose-600' : 'text-slate-600 hover:bg-slate-50'}`}>
                        <Icon className="h-4 w-4" /> {label}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
              <div className="border-t p-3">
                <button onClick={handleLogout} className="w-full flex items-center gap-2 text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-rose-50 hover:text-rose-600">
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* ── Page content ── */}
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 pb-24 md:pb-8">

          {/* Alertas de assinatura */}
          {profile?.role === 'SALON_ADMIN' && salon?.status !== 'ACTIVE' && salon?.status !== 'TRIAL' && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 mb-6">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Assinatura {salon?.status === 'EXPIRED' ? 'expirada' : 'bloqueada'}.</p>
                <p className="text-sm">Regularize para continuar usando todos os recursos.</p>
              </div>
              <Button variant="outline" className="border-rose-200 text-rose-800 hover:bg-rose-100 shrink-0" onClick={() => setActiveTab('subscription')}>
                Ver Planos
              </Button>
            </div>
          )}
          {profile?.role === 'SALON_ADMIN' && salon?.status === 'TRIAL' && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 mb-6">
              <Clock className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Período de teste.</p>
                <p className="text-sm">Expira em {salon?.trialEndsAt ? new Date(salon.trialEndsAt).toLocaleDateString('pt-BR') : 'breve'}.</p>
              </div>
              <Button variant="outline" className="border-amber-200 text-amber-800 hover:bg-amber-100 shrink-0" onClick={() => setActiveTab('subscription')}>
                Assinar Agora
              </Button>
            </div>
          )}

          {/* Link de divulgação */}
          <Card className="bg-gradient-to-r from-rose-50 to-pink-50 border-rose-100 mb-6">
            <CardContent className="flex flex-col items-center justify-between gap-3 p-4 md:flex-row">
              <div className="min-w-0">
                <h3 className="font-semibold text-rose-700 text-sm">🔗 Link público do seu negócio</h3>
                <p className="text-xs text-rose-500">Compartilhe para seus clientes agendarem e comprarem</p>
              </div>
              <div className="flex w-full max-w-sm items-center gap-2">
                <Input value={`${window.location.origin}/s/${salon?.slug}`} readOnly className="bg-white text-xs" />
                <Button variant="outline" size="icon" className="shrink-0"
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/s/${salon?.slug}`); toast.success('Link copiado!'); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <InstallPWABanner />

          {/* Page title */}
          <div className="mb-6 mt-2">
            <h1 className="text-2xl font-black text-slate-900">
              {activeTab === 'overview' && 'Visão Geral'}
              {activeTab === 'appointments' && 'Agenda'}
              {activeTab === 'services' && 'Serviços'}
              {activeTab === 'team' && 'Equipe'}
              {activeTab === 'crm' && 'CRM — Relacionamento'}
              {activeTab === 'clientes' && 'Clientes'}
              {activeTab === 'records' && (businessType === 'health' ? 'Prontuários' : businessType === 'fitness' ? 'Fichas de Alunos' : businessType === 'services' ? 'Briefings' : 'Fichas de Clientes')}
              {activeTab === 'anamnese' && 'Anamnese Digital'}
              {activeTab === 'fotos' && 'Antes & Depois'}
              {activeTab === 'quotes' && 'Orçamentos'}
              {activeTab === 'packages' && (businessType === 'fitness' ? 'Pacotes de Treino' : businessType === 'services' ? 'Programas' : 'Pacotes')}
              {activeTab === 'documents' && 'Documentos'}
              {activeTab === 'reports' && 'Relatórios'}
              {activeTab === 'profReport' && 'Desempenho Profissionais'}
              {activeTab === 'dre' && 'Financeiro / DRE'}
              {activeTab === 'coupons' && 'Cupons de Desconto'}
              {activeTab === 'loyalty' && 'Programa de Fidelidade'}
              {activeTab === 'reviews' && 'Avaliações'}
              {activeTab === 'story' && 'Gerador de Story'}
              {activeTab === 'store' && 'Loja & Pedidos'}
              {activeTab === 'bot' && '🤖 Configuração do Bot'}
              {activeTab === 'events' && 'Eventos & Bloqueios'}
              {activeTab === 'sport-packages' && 'Pacotes Mensais'}
              {activeTab === 'settings' && 'Configurações'}
              {activeTab === 'subscription' && 'Assinatura'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Bem-vindo, {profile?.displayName || 'Admin'} · {salon?.name}</p>
          </div>

          {/* ══ TABS CONTENT ══ */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>

            {/* Visão Geral */}
            <TabsContent value="overview" className="space-y-6 mt-0">
              {/* KPI Cards com efeito 3D */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  {
                    label: `Receita ${businessType === 'health' ? 'Consultas' : businessType === 'fitness' ? 'Aulas' : 'Atendimentos'}`,
                    value: `R$ ${((aptRevenueMonth ?? 0) + (totalRevenue ?? 0)).toFixed(0)}`,
                    sub: `Mês atual · ${completedThisMonth.length} concluídos`,
                    Icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-100',
                  },
                  {
                    label: 'Hoje',
                    value: todayApts.length,
                    sub: `${upcomingAppointments.length} próximos agendados`,
                    Icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-100',
                  },
                  {
                    label: 'Clientes novos',
                    value: newClientsCount,
                    sub: `${returningCount} retornaram este mês`,
                    Icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', ring: 'ring-violet-100',
                  },
                  {
                    label: 'Cancelamentos',
                    value: `${noShowRate}%`,
                    sub: `${cancelledThisMonth.length} cancel. este mês`,
                    Icon: TrendingUp, color: noShowRate > 20 ? 'text-red-600' : 'text-amber-600',
                    bg: noShowRate > 20 ? 'bg-red-50' : 'bg-amber-50',
                    ring: noShowRate > 20 ? 'ring-red-100' : 'ring-amber-100',
                  },
                  ...(retentionPct !== null ? [{
                    label: 'Retorno 60d',
                    value: `${retentionPct}%`,
                    sub: `${returningIn60}/${uniqueIn60} clientes voltaram`,
                    Icon: TrendingUp, color: retentionPct >= 40 ? 'text-emerald-600' : 'text-amber-600',
                    bg: retentionPct >= 40 ? 'bg-emerald-50' : 'bg-amber-50',
                    ring: retentionPct >= 40 ? 'ring-emerald-100' : 'ring-amber-100',
                  }] : []),
                ].map(({ label, value, sub, Icon, color, bg, ring }) => (
                  <KpiCard key={label} label={label} value={value} sub={sub} Icon={Icon} color={color} bg={bg} ring={ring} />
                ))}
              </div>

              {/* ── Gasto por cliente este mês ─────────────────────── */}
              {clientSpendingThisMonth.length > 0 && (
                <Card className="border-0 shadow-sm mt-4">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          💰 Receita por Cliente — {new Date().toLocaleDateString('pt-BR', { month: 'long' })}
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {clientSpendingThisMonth.length} clientes · Total: <strong>R$ {(aptRevenueMonth + totalRevenue).toFixed(2)}</strong>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-50">
                      {clientSpendingThisMonth.slice(0, 15).map((c, i) => (
                        <div key={c.phone || c.name} className="flex items-center gap-3 px-4 py-3">
                          <div className="h-7 w-7 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 font-black text-xs flex-shrink-0">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                            <p className="text-xs text-slate-500">{c.visits} visita{c.visits !== 1 ? 's' : ''}</p>
                          </div>
                          <p className="text-sm font-black text-emerald-600 flex-shrink-0">R$ {(c.total ?? 0).toFixed(2)}</p>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t-2 border-slate-200">
                        <p className="text-sm font-bold text-slate-700">Total do mês</p>
                        <p className="text-base font-black text-emerald-700">R$ {(aptRevenueMonth + totalRevenue).toFixed(2)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Últimos pedidos */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-bold">Últimos Pedidos</CardTitle>
                    <CardDescription className="text-xs">Vendas recentes da boutique.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recentOrders.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>}
                      {recentOrders.map(order => (
                        <div key={order.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                          <div>
                            <p className="text-sm font-medium">#{order.id.slice(-6).toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">
                              {(order as any).customerName || order.clientId.slice(-6)} · {format(new Date(order.createdAt), 'dd/MM HH:mm')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">R$ {(order.totalAmount ?? 0).toFixed(2)}</p>
                            <Badge variant={orderBadgeVariant(order.status)} className="text-[10px]">
                              {ORDER_STATUS_LABEL[order.status] || order.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter>
                    {(plan?.features.hasStore || (plan?.features as any)?.hasProductsInternal)
                      ? <Button variant="ghost" className="w-full text-sm" onClick={() => setActiveTab('store')}>Ver produtos e vendas</Button>
                      : <Button variant="ghost" className="w-full text-sm" onClick={() => setActiveTab('subscription')}>Ativar loja</Button>}
                  </CardFooter>
                </Card>

                {/* Próximos agendamentos */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-bold">Próximos Agendamentos</CardTitle>
                    <CardDescription className="text-xs">Serviços marcados a partir de hoje.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {upcomingAppointments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>}
                      {upcomingAppointments.map(apt => (
                        <div key={apt.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                          <div>
                            <p className="text-sm font-medium">{apt.clientName}</p>
                            <p className="text-xs text-muted-foreground">
                              {apt.serviceName} · {format(new Date(apt.date + 'T00:00:00'), 'dd/MM')} às {apt.startTime}
                            </p>
                          </div>
                          <Badge variant={appointmentBadgeVariant(apt.status)} className="text-[10px]">
                            {APPOINTMENT_STATUS_LABEL[apt.status] || apt.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="ghost" className="w-full text-sm" onClick={() => setActiveTab('appointments')}>Ver agenda completa</Button>
                  </CardFooter>
                </Card>
              </div>
            </TabsContent>

            {/* Relatórios */}
            <TabsContent value="reports" className="mt-0"><ReportsTab /></TabsContent>
            <TabsContent value="profReport" className="mt-0"><ProfessionalReportTab /></TabsContent>
            <TabsContent value="dre" className="mt-0 space-y-4">
              <DREReport salonId={profile?.salonId || ''} />
            </TabsContent>
            <TabsContent value="reviews" className="mt-0">
              <ReviewsList salonId={profile?.salonId || ''} isAdmin={true} />
            </TabsContent>
            <TabsContent value="loyalty" className="mt-0">
              <LoyaltyAdmin salonId={profile?.salonId || ''} />
            </TabsContent>
            <TabsContent value="clientes" className="mt-0 space-y-6">
              {/* Tip sobre recorrência */}
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 flex items-start gap-3">
                <span className="text-lg mt-0.5">🔄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-violet-800">Horários fixos (recorrência)</p>
                  <p className="text-xs text-violet-600 mt-0.5">
                    Para travar o horário semanal de um cliente, abra o perfil do cliente, clique em <strong>Recorrência</strong> e configure o dia e horário fixo. O slot ficará bloqueado toda semana automaticamente.
                  </p>
                </div>
              </div>
              <ClientsTab salonId={profile?.salonId || ''} />
              <div className="border-t pt-6">
                <h3 className="font-semibold text-base mb-1">📥 Importar clientes</h3>
                <p className="text-sm text-muted-foreground mb-4">Importe de SalonSoft, iSalon, Trinks ou qualquer planilha CSV.</p>
                <ImportClientsTab salonId={profile?.salonId || ''} professionalId={profile?.uid || ''} />
              </div>
            </TabsContent>
            <TabsContent value="story" className="mt-0"><StoryGenerator salonId={profile?.salonId || ''} /></TabsContent>
            <TabsContent value="coupons" className="mt-0"><CouponsManager /></TabsContent>

            {/* Agendamentos */}
            <TabsContent value="appointments" className="mt-0">
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                  <div>
                    <CardTitle>Agenda de Serviços</CardTitle>
                    <CardDescription>Gerencie todos os horários marcados.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border overflow-hidden">
                      <button onClick={() => setScheduleView('visual')} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', scheduleView === 'visual' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>📅 Visual</button>
                      <button onClick={() => setScheduleView('table')} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', scheduleView === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>📋 Lista</button>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full sm:w-[200px] justify-start text-left font-normal text-sm', !appointmentFilter.date && 'text-muted-foreground')}>
                          <CalendarIconLucide className="mr-2 h-4 w-4" />
                          {appointmentFilter.date !== 'all' ? format(new Date(appointmentFilter.date + 'T00:00:00'), "dd 'de' MMM", { locale: ptBR }) : 'Todas as datas'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <CalendarComponent mode="single" selected={appointmentFilter.date !== 'all' ? new Date(appointmentFilter.date + 'T00:00:00') : undefined}
                          onSelect={date => setAppointmentFilter(p => ({ ...p, date: date ? format(date, 'yyyy-MM-dd') : 'all' }))} initialFocus locale={ptBR} />
                        <div className="border-t p-2">
                          <Button variant="ghost" className="w-full text-xs" onClick={() => setAppointmentFilter(p => ({ ...p, date: 'all' }))}>Ver todas as datas</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Select value={appointmentFilter.professionalId} onValueChange={v => setAppointmentFilter(p => ({ ...p, professionalId: v }))}>
                      <SelectTrigger className="w-full sm:w-[160px] text-sm"><SelectValue placeholder="Profissional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {professionals.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.displayName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={appointmentFilter.status} onValueChange={v => setAppointmentFilter(p => ({ ...p, status: v }))}>
                      <SelectTrigger className="w-full sm:w-[140px] text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {Object.entries(APPOINTMENT_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {scheduleView === 'visual' && (
                    <InteractiveSchedule
                      date={appointmentFilter.date !== 'all' ? appointmentFilter.date : format(new Date(), 'yyyy-MM-dd')}
                      appointments={appointments} professionals={professionals} settings={settings}
                      salonId={profile?.salonId || ''} onAppointmentUpdate={handleAppointmentUpdate} onSendReminder={sendManualReminder}
                    />
                  )}
                  {scheduleView === 'table' && (
                    <>
                      <div className="hidden md:block rounded-md border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-muted/50">
                            <th className="p-4 text-left font-medium">Cliente</th>
                            <th className="p-4 text-left font-medium">Serviço</th>
                            <th className="p-4 text-left font-medium">Profissional</th>
                            <th className="p-4 text-left font-medium">Data/Hora</th>
                            <th className="p-4 text-left font-medium">Local</th>
                            <th className="p-4 text-left font-medium">Status</th>
                            <th className="p-4 text-right font-medium">Ações</th>
                          </tr></thead>
                          <tbody>
                            {filteredAppointments.length > 0 ? filteredAppointments.map(apt => (
                              <tr key={apt.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-4 font-medium">{apt.clientName}</td>
                                <td className="p-4">{apt.serviceName}</td>
                                <td className="p-4">{apt.professionalName}</td>
                                <td className="p-4 whitespace-nowrap">{format(new Date(apt.date + 'T00:00:00'), 'dd/MM/yyyy')} às {apt.startTime}</td>
                                <td className="p-4">{apt.locationType === 'HOME' ? <span className="flex items-center gap-1 text-xs"><Home className="h-3 w-3" /> Domicílio</span> : <span className="flex items-center gap-1 text-xs"><Building className="h-3 w-3" /> {bizLabel.place}</span>}</td>
                                <td className="p-4"><Badge variant={appointmentBadgeVariant(apt.status)}>{APPOINTMENT_STATUS_LABEL[apt.status] || apt.status}</Badge></td>
                                <td className="p-4 text-right">
                                  <div className="flex justify-end gap-2">
                                    {apt.customerPhone && !['CANCELLED','COMPLETED'].includes(apt.status) && (
                                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-green-600 border-green-200 hover:bg-green-50" title="WhatsApp" onClick={() => sendManualReminder(apt)}><MessageSquare className="h-4 w-4" /></Button>
                                    )}
                                    {apt.status === 'PENDING' && <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Confirmar" onClick={() => updateAppointmentStatus(apt.id, 'CONFIRMED')}><CheckCircle className="h-4 w-4 text-green-600" /></Button>}
                                    {apt.status === 'CONFIRMED' && <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Concluir" onClick={() => updateAppointmentStatus(apt.id, 'COMPLETED')}><CheckCircle className="h-4 w-4 text-blue-600" /></Button>}
                                    {!['CANCELLED','COMPLETED'].includes(apt.status) && <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Cancelar" onClick={() => updateAppointmentStatus(apt.id, 'CANCELLED')}><XCircle className="h-4 w-4 text-red-600" /></Button>}
                                  </div>
                                </td>
                              </tr>
                            )) : <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum agendamento encontrado.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <div className="md:hidden space-y-3">
                        {filteredAppointments.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum agendamento encontrado.</p>}
                        {filteredAppointments.map(apt => (
                          <div key={apt.id} className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">{apt.clientName}</p>
                                <p className="text-sm text-muted-foreground">{apt.serviceName}</p>
                              </div>
                              <Badge variant={appointmentBadgeVariant(apt.status)} className="shrink-0">{APPOINTMENT_STATUS_LABEL[apt.status] || apt.status}</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{apt.professionalName}</span></div>
                              <div className="flex items-center gap-1.5"><CalendarIconLucide className="h-3.5 w-3.5 shrink-0" /><span>{format(new Date(apt.date+'T00:00:00'),'dd/MM')} às {apt.startTime}</span></div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                              {apt.customerPhone && !['CANCELLED','COMPLETED'].includes(apt.status) && (
                                <Button size="sm" variant="outline" className="flex-1 text-green-600 border-green-200 hover:bg-green-50" onClick={() => sendManualReminder(apt)}><MessageSquare className="mr-1.5 h-3.5 w-3.5" /> WhatsApp</Button>
                              )}
                              {!['CANCELLED','COMPLETED'].includes(apt.status) && (
                                <Button size="sm" variant="outline" className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setReschedulingApt(apt)}><CalendarIconLucide className="mr-1.5 h-3.5 w-3.5" /> Reagendar</Button>
                              )}
                              {apt.status === 'PENDING' && <Button size="sm" variant="outline" className="flex-1" onClick={() => updateAppointmentStatus(apt.id,'CONFIRMED')}><CheckCircle className="mr-1.5 h-3.5 w-3.5 text-green-600" /> Confirmar</Button>}
                              {apt.status === 'CONFIRMED' && <Button size="sm" variant="outline" className="flex-1" onClick={() => updateAppointmentStatus(apt.id,'COMPLETED')}><CheckCircle className="mr-1.5 h-3.5 w-3.5 text-blue-600" /> Concluir</Button>}
                              {!['CANCELLED','COMPLETED'].includes(apt.status) && <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => updateAppointmentStatus(apt.id,'CANCELLED')}><XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancelar</Button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Serviços */}
            <TabsContent value="services" className="mt-0">
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div><CardTitle>Serviços Oferecidos</CardTitle><CardDescription>Adicione ou edite os serviços disponíveis.</CardDescription></div>
                  <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
                    <DialogTrigger asChild><Button onClick={() => setSelectedService(undefined)}><Plus className="mr-2 h-4 w-4" />Novo Serviço</Button></DialogTrigger>
                    <DialogContent><DialogHeader><DialogTitle>{selectedService ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle><DialogDescription>Preencha os dados do serviço.</DialogDescription></DialogHeader>
                      <ServiceForm service={selectedService} onSuccess={() => { setIsServiceDialogOpen(false); fetchData(); }} onCancel={() => setIsServiceDialogOpen(false)} />
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {services.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum serviço cadastrado ainda.</p>}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {services.map(service => (
                      <Card key={service.id} className="border shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base">{service.name}</CardTitle>
                            <div className="flex space-x-1">
                              <Button size="icon" variant="ghost" onClick={() => { setSelectedService(service); setIsServiceDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'service', id: service.id, name: service.name })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </div>
                          </div>
                          <CardDescription>{service.category}</CardDescription>
                        </CardHeader>
                        <CardContent className="pb-2">
                          <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{service.description}</p>
                          <div className="flex justify-between text-sm"><span>{service.duration} min</span><span className="font-bold">R$ {(service.price ?? 0).toFixed(2)}</span></div>
                        </CardContent>
                        <CardFooter><Badge variant={service.active ? 'default' : 'outline'}>{service.active ? 'Ativo' : 'Inativo'}</Badge></CardFooter>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Equipe */}
            <TabsContent value="team" className="mt-0">
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div><CardTitle>{bizLabel.team}</CardTitle><CardDescription>{bizLabel.teamDesc}</CardDescription></div>
                  <div className="flex flex-col items-end gap-2">
                    <Dialog open={isProfessionalDialogOpen} onOpenChange={setIsProfessionalDialogOpen}>
                      <DialogTrigger asChild>
                        <Button onClick={() => setSelectedProfessional(undefined)} disabled={!checkLimit('maxProfessionals', professionals.length)}>
                          <Plus className="mr-2 h-4 w-4" />Adicionar
                        </Button>
                      </DialogTrigger>
                      <DialogContent><DialogHeader><DialogTitle>{selectedProfessional ? 'Editar Profissional' : 'Novo Profissional'}</DialogTitle><DialogDescription>Preencha os dados.</DialogDescription></DialogHeader>
                        <ProfessionalForm professional={selectedProfessional} onSuccess={() => { setIsProfessionalDialogOpen(false); fetchData(); }} onCancel={() => setIsProfessionalDialogOpen(false)} />
                      </DialogContent>
                    </Dialog>
                    <Button variant="outline" onClick={() => setCreateProfDialog(true)}><UserPlus className="mr-2 h-4 w-4" /> Criar com Login</Button>
                    {!checkLimit('maxProfessionals', professionals.length) && <p className="text-[10px] font-medium text-rose-500">Limite do plano atingido</p>}
                  </div>
                </CardHeader>
                <CardContent>
                  {professionals.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum profissional cadastrado.</p>}
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {professionals.map(pro => (
                      <Card key={pro.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <div className="aspect-video w-full bg-muted">
                          {pro.photoURL ? <img src={pro.photoURL} alt={pro.displayName} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Users className="h-12 w-12 text-muted-foreground" /></div>}
                        </div>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base">{pro.displayName}</CardTitle>
                            <div className="flex space-x-1">
                              <Button size="icon" variant="ghost" onClick={() => { setSelectedProfessional(pro); setIsProfessionalDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'professional', id: pro.id, name: pro.displayName })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </div>
                          </div>
                          <CardDescription>{pro.bio}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-1">
                            {pro.specialties.map(sId => { const svc = services.find(s => s.id === sId); return svc ? <Badge key={sId} variant="secondary" className="text-[10px]">{svc.name}</Badge> : null; })}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Loja & Pedidos */}
            <TabsContent value="store" className="mt-0 space-y-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                  <div><CardTitle>Pedidos da Boutique</CardTitle><CardDescription>Gerencie as vendas de produtos.</CardDescription></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-auto">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar por nome, email..." className="w-full sm:w-[240px] pl-8 text-sm" value={orderFilter.search} onChange={e => setOrderFilter(p => ({ ...p, search: e.target.value }))} />
                    </div>
                    <Select value={orderFilter.status} onValueChange={v => setOrderFilter(p => ({ ...p, status: v }))}>
                      <SelectTrigger className="w-full sm:w-[160px] text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="hidden md:block rounded-md border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="p-4 text-left font-medium">Pedido</th>
                        <th className="p-4 text-left font-medium">Cliente</th>
                        <th className="p-4 text-left font-medium">Data</th>
                        <th className="p-4 text-left font-medium">Total</th>
                        <th className="p-4 text-left font-medium">Entrega</th>
                        <th className="p-4 text-left font-medium">Status</th>
                        <th className="p-4 text-right font-medium">Ações</th>
                      </tr></thead>
                      <tbody>
                        {filteredOrders.length > 0 ? filteredOrders.map(order => (
                          <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-4 font-mono text-xs font-medium">#{order.id.slice(-6).toUpperCase()}</td>
                            <td className="p-4"><div className="font-medium">{(order as any).customerName || '—'}</div><div className="text-xs text-muted-foreground">{(order as any).customerEmail || ''}</div></td>
                            <td className="p-4 text-muted-foreground whitespace-nowrap">{format(new Date(order.createdAt), 'dd/MM/yyyy')}</td>
                            <td className="p-4 font-medium whitespace-nowrap">R$ {(order.totalAmount ?? 0).toFixed(2)}</td>
                            <td className="p-4">{order.shippingMethod === 'PICKUP' ? <span className="flex items-center gap-1 text-xs"><Package className="h-3 w-3" /> Retirada</span> : <span className="flex items-center gap-1 text-xs"><Truck className="h-3 w-3" /> Entrega</span>}</td>
                            <td className="p-4"><Badge variant={orderBadgeVariant(order.status)}>{ORDER_STATUS_LABEL[order.status] || order.status}</Badge></td>
                            <td className="p-4 text-right"><OrderDetailModal order={order} onUpdateStatus={updateOrderStatus} /></td>
                          </tr>
                        )) : <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum pedido encontrado.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {filteredOrders.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum pedido.</p>}
                    {filteredOrders.map(order => (
                      <div key={order.id} className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div><p className="font-mono text-xs font-semibold text-muted-foreground">#{order.id.slice(-6).toUpperCase()}</p><p className="font-semibold">{(order as any).customerName || '—'}</p></div>
                          <Badge variant={orderBadgeVariant(order.status)} className="shrink-0 text-[10px]">{ORDER_STATUS_LABEL[order.status] || order.status}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">{order.shippingMethod === 'PICKUP' ? <><Package className="h-3.5 w-3.5" /><span>Retirada</span></> : <><Truck className="h-3.5 w-3.5" /><span>Entrega</span></>}</div>
                          <span className="font-bold text-primary">R$ {(order.totalAmount ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                          <span>{format(new Date(order.createdAt), 'dd/MM/yyyy HH:mm')}</span>
                          <OrderDetailModal order={order} onUpdateStatus={updateOrderStatus} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Produtos */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                  <CardTitle>Produtos & Vendas</CardTitle>
                  <CardDescription>
                    {plan?.features.hasStore
                      ? 'Loja virtual completa com checkout online.'
                      : 'Cadastro de produtos e registro de vendas presenciais.'}
                  </CardDescription>
                </div>
                  <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                    <DialogTrigger asChild><Button onClick={() => setSelectedProduct(undefined)}><Plus className="mr-2 h-4 w-4" />Novo Produto</Button></DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{selectedProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle><DialogDescription>Preencha os dados do produto.</DialogDescription></DialogHeader>
                      <ProductForm product={selectedProduct} onSuccess={() => { setIsProductDialogOpen(false); fetchData(); }} onCancel={() => setIsProductDialogOpen(false)} />
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {products.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum produto cadastrado.</p>}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {products.map(product => (
                      <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <div className="aspect-square w-full bg-muted">
                          {product.images?.[0] ? <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><ShoppingBag className="h-8 w-8 text-muted-foreground" /></div>}
                        </div>
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-sm">{product.name}</CardTitle>
                            <div className="flex space-x-1">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setSelectedProduct(product); setIsProductDialogOpen(true); }}><Edit className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setDeleteDialog({ open: true, type: 'product', id: product.id, name: product.name })}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="mb-2 flex items-center justify-between text-xs"><Badge variant={product.active ? 'default' : 'outline'}>{product.active ? 'Ativo' : 'Inativo'}</Badge><span className="text-muted-foreground">{product.category}</span></div>
                          <div className="flex justify-between text-sm"><span className="font-bold">R$ {(product.price ?? 0).toFixed(2)}</span><span className={product.stock < 5 ? 'font-medium text-red-500' : 'text-muted-foreground'}>Est: {product.stock}</span></div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Config / CRM / Fichas / Anamnese / etc. — passthrough */}
            <TabsContent value="settings" className="mt-0"><SettingsPanel /></TabsContent>
            <TabsContent value="bot" className="mt-0">{salon && <BotConfigTab salonId={salon.id} />}</TabsContent>
            <TabsContent value="crm" className="mt-0">{salon && <CRMTab salonId={salon.id} />}</TabsContent>
            <TabsContent value="quotes" className="mt-0">{salon && <QuotesTab salonId={salon.id} />}</TabsContent>
            <TabsContent value="records" className="mt-0">{salon && <ClientRecordTab salonId={salon.id} businessType={businessType} />}</TabsContent>
            <TabsContent value="anamnese" className="mt-0">{salon && <AnamneseTab salonId={salon.id} />}</TabsContent>
            <TabsContent value="fotos" className="mt-0">{salon && <BeforeAfterTab salonId={salon.id} />}</TabsContent>
            <TabsContent value="packages" className="mt-0">{salon && <PackagesTab salonId={salon.id} businessType={businessType} />}</TabsContent>
            {(businessType === 'health' || businessType === 'services') && (
              <TabsContent value="documents" className="mt-0">{salon && <DocumentsTab salonId={salon.id} businessType={businessType} />}</TabsContent>
            )}

            {/* Eventos & Bloqueios — disponível para todos os tipos */}
            <TabsContent value="events" className="mt-0">
              {salon && <EventsTab salonId={salon.id} />}
            </TabsContent>

            {/* Pacotes Esportivos Mensais */}
            <TabsContent value="sport-packages" className="mt-0">
              {salon && <SportsPackageTab salonId={salon.id} />}
            </TabsContent>

            {/* Assinatura */}
            <TabsContent value="subscription" className="mt-0 space-y-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Sua Assinatura</CardTitle>
                  <CardDescription>Gerencie seu plano e cobranças.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col items-start justify-between rounded-xl border bg-muted/30 p-4 md:flex-row md:items-center gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{plan?.name || '—'}</h3>
                      <p className="text-sm text-muted-foreground">Status: <Badge variant={salon?.status === 'ACTIVE' ? 'default' : salon?.status === 'TRIAL' ? 'secondary' : 'destructive'}>{salon?.status === 'ACTIVE' ? 'Ativo' : salon?.status === 'TRIAL' ? 'Teste' : salon?.status === 'EXPIRED' ? 'Expirado' : 'Bloqueado'}</Badge></p>
                      {salon?.status === 'TRIAL' && salon.trialEndsAt && <p className="mt-1 text-sm text-amber-600">Trial expira em {new Date(salon.trialEndsAt).toLocaleDateString('pt-BR')}</p>}
                    </div>
                    {salon?.status === 'ACTIVE' && (
                      <Button variant="outline" onClick={async () => { try { const returnUrl = `${window.location.origin}/s/${salon?.slug}/admin?tab=subscription`; const url = await billingService.createPortalSession(returnUrl); window.location.href = url; } catch (error: any) { toast.error(error.message || 'Erro ao abrir portal.'); } }}>Gerenciar Assinatura</Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { name: 'Agenda', label: 'Só Agenda', price: 'R$ 64,99', priceId: 'price_1THG2tPJdJwQwazDo4sddar3', color: 'border-rose-200', badge: 'text-rose-500', features: ['✓ Até 3 profissionais','✓ Agendamento 24h','✓ Ficha de clientes','✓ Anamnese digital','✓ Fidelidade + Avaliações','✓ Bot WhatsApp simples','✓ Relatório básico','✗ Sinal antecipado','✗ Loja virtual'] },
                      { name: 'Agenda Pro', label: 'Agenda Pro', price: 'R$ 89,99', priceId: 'price_1THG2HPJdJwQwazDHFJtJHbp', color: 'border-rose-500', badge: 'text-rose-600', highlight: true, features: ['✓ Profissionais ilimitados','✓ Agendamento 24h','✓ CRM completo','✓ Sinal antecipado','✓ Orçamentos + cobranças','✓ Pacotes e programas','✓ Bot WhatsApp IA','✓ Relatório completo (DRE)','✓ Suporte prioritário','✗ Loja virtual'] },
                      { name: 'Loja', label: 'Só Loja', price: 'R$ 64,99', priceId: 'price_1TK2NtPJdJwQwazDUy2TITxP', color: 'border-purple-200', badge: 'text-purple-500', features: ['✓ Loja virtual completa','✓ PIX automático (Asaas)','✓ Controle de estoque','✓ Cupons de desconto','✓ Avaliações','✓ Gerador de story','✓ Relatório básico','✗ Agendamento'] },
                      { name: 'Completo', label: 'Agenda + Loja', price: 'R$ 159,90', priceId: 'price_1TK2NUPJdJwQwazDFgZ5fzUQ', color: 'border-slate-700 bg-slate-900', badge: 'text-amber-400', dark: true, features: ['✓ Profissionais ilimitados','✓ Agendamento + Loja','✓ Sinal antecipado','✓ CRM completo','✓ PIX automático','✓ Cupons de desconto','✓ Bot WhatsApp IA','✓ Relatório DRE completo','✓ Suporte VIP'] },
                    ].map(p => {
                      const isCurrent = plan?.name === p.name;
                      return (
                        <Card key={p.name} className={`flex flex-col border-2 ${p.color} ${(p as any).dark ? 'text-white' : ''} ${isCurrent ? 'ring-2 ring-primary' : ''}`}>
                          <CardHeader className="pb-3">
                            {p.highlight && <span className="text-xs font-bold text-amber-500 mb-1">⭐ MAIS POPULAR</span>}
                            <p className={`text-xs font-bold uppercase tracking-wider ${p.badge}`}>{p.label}</p>
                            <CardTitle className={(p as any).dark ? 'text-white' : ''}>{p.name}</CardTitle>
                            <CardDescription className={(p as any).dark ? 'text-slate-300' : ''}>{p.price} / mês</CardDescription>
                          </CardHeader>
                          <CardContent className="flex-1">
                            <ul className="space-y-1.5 text-sm">
                              {p.features.map(f => (
                                <li key={f} className={`flex items-center gap-1.5 ${f.startsWith('✗') ? 'opacity-40' : ''} ${(p as any).dark ? 'text-slate-200' : 'text-muted-foreground'}`}>
                                  <span className={f.startsWith('✓') ? 'text-emerald-500 font-bold' : 'font-bold'}>{f[0]}</span>{f.slice(2)}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                          <CardFooter>
                            <Button className="w-full" variant={isCurrent ? 'outline' : 'default'} disabled={isCurrent} onClick={() => handleCheckout(p.priceId)}>
                              {isCurrent ? '✓ Plano Atual' : `Assinar ${p.name}`}
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Card de Afiliados */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">🤝 Programa de Indicação</CardTitle>
                  <CardDescription>Indique outros salões e ganhe desconto na mensalidade.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Seu link de indicação</p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={`${window.location.origin}/cadastro-salao?ref=${salon?.slug}`} className="bg-muted font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/cadastro-salao?ref=${salon?.slug}`); toast.success('Link copiado!'); }}><Copy className="h-4 w-4" /></Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Cada indicação que assinar = 15% de desconto. Acumula até 50% com 4 indicações ativas.</p>
                  </div>
                  {(() => {
                    const credits = (salon as any)?.referralCredits || 0;
                    const discountPct = Math.min(credits * 15, 50);
                    return (
                      <div className={`rounded-xl border p-5 text-center ${discountPct > 0 ? 'bg-green-50 border-green-200' : 'bg-muted/30'}`}>
                        <p className={`text-4xl font-bold ${discountPct > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{discountPct}%</p>
                        <p className={`text-sm font-medium mt-1 ${discountPct > 0 ? 'text-green-700' : 'text-muted-foreground'}`}>de desconto na mensalidade</p>
                        <p className="text-xs text-muted-foreground mt-1">{credits} indicações ativas × 15%</p>
                        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-green-500" style={{ width: `${(discountPct / 50) * 100}%` }} /></div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* ══════════════════════════════════════════════
          BOTTOM NAV — Mobile
      ══════════════════════════════════════════════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-100 shadow-lg">
        <div className="flex overflow-x-auto scrollbar-hide">
          {/* Início sempre primeiro e fixo */}
          {mobileBottomItems.slice(0, 4).map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`flex-1 min-w-0 flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                activeTab === value ? 'text-rose-600' : 'text-slate-500'
              }`}
            >
              <Icon className={`h-5 w-5 ${activeTab === value ? 'text-rose-600' : 'text-slate-400'}`} />
              <span className="truncate max-w-[52px] text-center">{label}</span>
            </button>
          ))}
          {/* Botão "Mais" que abre menu de abas extras */}
          {mobileBottomItems.length > 4 && (
            <button
              onClick={() => setActiveTab(
                mobileBottomItems.length > 4 &&
                mobileBottomItems.slice(4).find(i => i.value === activeTab)
                  ? activeTab
                  : mobileBottomItems[4]?.value || 'settings'
              )}
              className={`flex-1 min-w-0 flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                mobileBottomItems.slice(4).some(i => i.value === activeTab)
                  ? 'text-rose-600' : 'text-slate-500'
              }`}
            >
              {(() => {
                const activeExtra = mobileBottomItems.slice(4).find(i => i.value === activeTab);
                const Icon = activeExtra?.Icon || MoreHorizontal;
                return (
                  <>
                    <Icon className={`h-5 w-5 ${mobileBottomItems.slice(4).some(i => i.value === activeTab) ? 'text-rose-600' : 'text-slate-400'}`} />
                    <span className="truncate max-w-[52px] text-center">
                      {activeExtra?.label || 'Mais'}
                    </span>
                  </>
                );
              })()}
            </button>
          )}
        </div>
      </nav>

      {/* Modal Reagendamento */}
      {reschedulingApt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50" onClick={() => setReschedulingApt(null)}>
          <div className="bg-background rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div><h3 className="font-semibold text-lg">Reagendar</h3><p className="text-sm text-muted-foreground">{reschedulingApt.clientName} — {reschedulingApt.serviceName}</p></div>
            <div className="space-y-3">
              <div className="space-y-1"><label className="text-sm font-medium">Nova data</label><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full rounded-lg border px-3 py-2 text-sm bg-background" /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Novo horário</label><input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm bg-background" /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setReschedulingApt(null)}>Cancelar</Button>
              <Button className="flex-1" disabled={!newDate || !newTime || rescheduling} onClick={handleReschedule}>{rescheduling ? 'Salvando...' : 'Confirmar'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal exclusão */}
      <Dialog open={deleteDialog.open} onOpenChange={open => !open && setDeleteDialog(p => ({ ...p, open: false }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmar exclusão</DialogTitle><DialogDescription>Excluir <strong>{deleteDialog.name}</strong>? Ação irreversível.</DialogDescription></DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteDialog(p => ({ ...p, open: false }))}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={confirmDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal criar profissional com login */}
      <CreateProfessionalUserForm open={createProfDialog} onOpenChange={setCreateProfDialog} onSuccess={fetchData} services={services} />
    </div>
  );
};
