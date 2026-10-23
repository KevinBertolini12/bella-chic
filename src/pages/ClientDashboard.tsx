import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSalon } from '../contexts/SalonContext';
import { salonService } from '../services/salonService';
import { storeService } from '../services/storeService';
import { Appointment, Order, SalonService } from '../types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import { Calendar, Package, Clock, MapPin, Truck, XCircle, Home, Star, Gift, Share2, Copy, CheckCircle2, Users, MessageSquare, ChevronLeft, ChevronRight, Scissors, Sparkles } from 'lucide-react';
import { LeaveReview } from '../components/admin/ReviewSystem';
import { LoyaltyCard } from '../components/admin/LoyaltySystem';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { SEO } from '../components/SEO';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

const APT_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING:          { label: 'Pendente',        variant: 'outline' },
  CONFIRMED:        { label: 'Confirmado',       variant: 'default' },
  COMPLETED:        { label: 'Concluído',        variant: 'secondary' },
  CANCELLED:        { label: 'Cancelado',        variant: 'destructive' },
  RESCHEDULED:      { label: 'Reagendado',       variant: 'outline' },
  AWAITING_DEPOSIT: { label: 'Aguardando Sinal', variant: 'outline' },
};

const ORDER_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  AWAITING_PAYMENT: { label: 'Aguardando Pagamento', variant: 'outline' },
  PAID:             { label: 'Pago',                  variant: 'default' },
  PREPARING:        { label: 'Preparando',            variant: 'secondary' },
  SHIPPED:          { label: 'Enviado',               variant: 'secondary' },
  READY_FOR_PICKUP: { label: 'Pronto para Retirada',  variant: 'secondary' },
  COMPLETED:        { label: 'Concluído',              variant: 'default' },
  CANCELLED:        { label: 'Cancelado',              variant: 'destructive' },
};

const ClientSkeleton = () => (
  <div className="container mx-auto px-4 py-12 space-y-6">
    <Skeleton className="h-9 w-64" />
    <Skeleton className="h-4 w-48" />
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardHeader><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48 mt-1" /></CardHeader>
          <CardContent><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20 mt-2" /></CardContent>
        </Card>
      ))}
    </div>
  </div>
);

export const ClientDashboard = () => {
  const { user, profile } = useAuth();
  const { salon, salonId } = useSalon();
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<any>(null);
  const [services, setServices] = useState<SalonService[]>([]);

  useEffect(() => {
    if (!user || !salonId) return;
    (async () => {
      try {
        const [apts, ords, svcs] = await Promise.all([
          salonService.getAppointmentsByClient(salonId, user.uid, profile?.phone || ''),
          storeService.getOrdersByClient(salonId, user.uid),
          salonService.getServices(salonId),
        ]);
        setAppointments(apts);
        setOrders(ords);
        setServices(svcs.filter(s => s.active).slice(0, 6));
        // Busca dados do salão
        try {
          const bizSnap = await getDoc(doc(db, `salons/${salonId}/settings`, 'business'));
          if (bizSnap.exists()) setBusiness(bizSnap.data());
        } catch {}
      } catch (error) {
        console.error(error);
        toast.error('Erro ao carregar seus dados.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, salonId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast.success('Pagamento confirmado! Seu pedido já está sendo processado.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!salonId) return;
    try {
      await salonService.updateAppointmentStatus(salonId, appointmentId, 'CANCELLED');
      setAppointments(prev =>
        prev.map(apt =>
          apt.id === appointmentId ? { ...apt, status: 'CANCELLED' } : apt
        )
      );
      toast.success('Agendamento cancelado com sucesso.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao cancelar agendamento.');
    }
  };

  const goToBooking = () => salon?.slug ? navigate(`/s/${salon.slug}/agendamento`) : navigate(-1);
  const goToShop    = () => salon?.slug ? navigate(`/s/${salon.slug}/loja`) : navigate(-1);

  if (loading) return <ClientSkeleton />;

  return (
    <>
      <SEO title="Minha Conta" description="Acompanhe seus agendamentos e pedidos" />
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Olá, {profile?.displayName || user?.displayName || 'Cliente'} 👋
          </h1>
          <p className="text-muted-foreground">Acompanhe seus agendamentos e pedidos.</p>
        </div>

        <Tabs defaultValue="appointments" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1 rounded-lg w-full lg:w-auto">
            <TabsTrigger value="appointments" className="text-xs sm:text-sm">
              Agendamentos
              {appointments.length > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                  {appointments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders" className="text-xs sm:text-sm">
              Pedidos
              {orders.length > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                  {orders.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="loyalty" className="text-xs sm:text-sm">
              <Gift className="mr-1.5 h-4 w-4" />
              Fidelidade
            </TabsTrigger>
            <TabsTrigger value="referral" className="text-xs sm:text-sm">
              <Share2 className="mr-1.5 h-4 w-4" />
              Indicar Amigos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appointments" className="space-y-4">
            {appointments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Calendar className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                  <h3 className="text-lg font-medium">Nenhum agendamento ainda</h3>
                  <p className="text-muted-foreground">Agende um horário com nossos profissionais.</p>
                  <Button className="mt-6" onClick={goToBooking}>Agendar Agora</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {appointments.map((apt) => {
                  const statusInfo = APT_STATUS[apt.status] || { label: apt.status, variant: 'outline' as const };
                  const canCancel = apt.status === 'PENDING' || apt.status === 'CONFIRMED';
                  return (
                    <Card key={apt.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            #{apt.id?.slice(-6).toUpperCase()}
                          </Badge>
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </div>
                        <CardTitle className="text-lg">{apt.serviceName}</CardTitle>
                        <CardDescription>Com {apt.professionalName}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-1.5 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(apt.date + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {apt.startTime} — {apt.endTime}
                        </div>
                        {apt.locationType === 'HOME' && apt.homeAddress && (
                          <div className="flex items-start gap-2 text-muted-foreground">
                            <Home className="h-4 w-4 mt-0.5" />
                            <div className="text-xs">
                              {apt.homeAddress.street}, {apt.homeAddress.number}
                              {apt.homeAddress.complement && `, ${apt.homeAddress.complement}`}<br />
                              {apt.homeAddress.neighborhood} — {apt.homeAddress.city}/{apt.homeAddress.state}<br />
                              CEP: {apt.homeAddress.zipCode}
                            </div>
                          </div>
                        )}
                        <div className="pt-2 font-bold text-primary">
                          R$ {apt.totalAmount.toFixed(2)}
                        </div>
                        {apt.status === 'AWAITING_DEPOSIT' && (
                          <div className={`rounded-lg border p-2.5 text-xs ${(apt as any).depositStatus === 'PAID_PIX' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                            {(apt as any).depositStatus === 'PAID_PIX'
                              ? '✅ Comprovante enviado — aguardando confirmação'
                              : `⏳ Sinal de R$ ${((apt as any).depositAmount || 0).toFixed(2)} pendente — volte ao agendamento para pagar`}
                          </div>
                        )}
                      </CardContent>
                      {canCancel && (
                        <CardFooter className="flex justify-end pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleCancelAppointment(apt.id)}
                          >
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Cancelar
                          </Button>
                        </CardFooter>
                      )}
                      {apt.status === 'COMPLETED' && salonId && (
                        <CardFooter className="pt-0">
                          <LeaveReview
                            salonId={salonId}
                            appointmentId={apt.id}
                            professionalId={apt.professionalId}
                            professionalName={apt.professionalName}
                            serviceId={apt.serviceId}
                            serviceName={apt.serviceName}
                          />
                        </CardFooter>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            {orders.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Package className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                  <h3 className="text-lg font-medium">Nenhum pedido ainda</h3>
                  <p className="text-muted-foreground">Confira as novidades da nossa boutique.</p>
                  <Button className="mt-6" onClick={goToShop}>Ir para a Loja</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
                  const statusInfo = ORDER_STATUS[order.status] || { label: order.status, variant: 'outline' as const };
                  return (
                    <Card key={order.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">
                              Pedido #{order.id?.slice(-6).toUpperCase()}
                            </CardTitle>
                          </div>
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </div>
                        <CardDescription>
                          {format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1.5">
                          {(order.items ?? []).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{item.quantity}× {item.name}</span>
                              <span>R$ {((item.price ?? 0) * (item.quantity ?? 1)).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>

                        {order.shippingMethod === 'FIXED' && order.address && (
                          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                            <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              {order.address.street}, {order.address.number} — {order.address.city}/{order.address.state}
                            </span>
                          </div>
                        )}
                        {order.shippingMethod === 'PICKUP' && (
                          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" /> Retirada no local
                          </div>
                        )}

                        <div className="flex justify-between border-t pt-2 font-bold">
                          <span>Total</span>
                          <span className="text-primary">R$ {order.totalAmount.toFixed(2)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
          <TabsContent value="loyalty" className="space-y-4">
            {salonId && user && (
              <LoyaltyCard salonId={salonId} clientId={user.uid} />
            )}
          </TabsContent>

          <TabsContent value="referral" className="space-y-4">
            {salonId && user && (
              <ClientReferralPanel salonId={salonId} clientId={user.uid} clientName={profile?.displayName || ''} />
            )}
          </TabsContent>
        </Tabs>

        {/* Serviços */}
        {services.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-4">Serviços Disponíveis</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map(service => (
                <Card key={service.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  {service.images && (service.images ?? []).length > 0 && (
                    <ServiceMiniCarousel images={service.images} name={service.name} />
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{service.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" /> {service.duration} min
                        </p>
                      </div>
                      <p className="text-primary font-bold shrink-0">R$ {(service.price ?? 0).toFixed(2)}</p>
                    </div>
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={goToBooking}
                    >
                      Agendar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Localização do Salão */}
        {business && (business.address || business.whatsapp || business.phone) && (
          <div className="mt-8 rounded-2xl border bg-muted/30 p-5">
            <h2 className="text-lg font-bold mb-4">Onde Estamos</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              {business.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [business.address, business.number, business.neighborhood, business.city, business.state].filter(Boolean).join(', ')
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-start gap-3 rounded-xl border bg-background p-3 hover:shadow-md transition-shadow group"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Endereço</p>
                    <p className="text-xs text-muted-foreground">
                      {[business.address, business.number].filter(Boolean).join(', ')}
                      {business.neighborhood ? ` — ${business.neighborhood}` : ''}
                    </p>
                    <span className="text-xs text-primary font-medium group-hover:underline">Ver no Maps →</span>
                  </div>
                </a>
              )}
              {(business.whatsapp || business.phone) && (
                <a
                  href={business.whatsapp
                    ? `https://wa.me/55${business.whatsapp.replace(/\D/g, '')}`
                    : `tel:${business.phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-start gap-3 rounded-xl border bg-background p-3 hover:shadow-md transition-shadow group"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 text-green-600 shrink-0 group-hover:bg-green-500 group-hover:text-white transition-colors">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{business.whatsapp ? 'WhatsApp' : 'Telefone'}</p>
                    <p className="text-xs text-muted-foreground">{business.whatsapp || business.phone}</p>
                    <span className="text-xs text-green-600 font-medium group-hover:underline">
                      {business.whatsapp ? 'Chamar →' : 'Ligar →'}
                    </span>
                  </div>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// ─── Carrossel mini para serviços no ClientDashboard ─────────────────────────
const ServiceMiniCarousel = ({ images, name }: { images: string[]; name: string }) => {
  const [current, setCurrent] = useState(0);
  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setCurrent(c => c === 0 ? images.length - 1 : c - 1); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setCurrent(c => c === images.length - 1 ? 0 : c + 1); };

  return (
    <div className="group relative h-36 w-full overflow-hidden">
      {images.map((img, i) => (
        <img key={i} src={img} alt={`${name} ${i+1}`}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${i === current ? 'opacity-100' : 'opacity-0'}`}
          referrerPolicy="no-referrer"
        />
      ))}
      {images.length > 1 && (
        <>
          <button onClick={prev} className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button onClick={next} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight className="h-3 w-3" />
          </button>
          <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, i) => (
              <button key={i} onClick={e => { e.stopPropagation(); setCurrent(i); }}
                className={`h-1 rounded-full transition-all ${i === current ? 'w-3 bg-white' : 'w-1 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Painel de Indicação de Clientes ─────────────────────────────────────────

interface ClientReferralPanelProps {
  salonId: string;
  clientId: string;
  clientName: string;
}

const ClientReferralPanel = ({ salonId, clientId, clientName }: ClientReferralPanelProps) => {
  const [referralData, setReferralData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const referralCode = `${clientId.slice(0, 8).toUpperCase()}`;
  const referralLink = `${window.location.origin}${window.location.pathname.split('/meu-perfil')[0]}/agendar?ref=${referralCode}`;

  useEffect(() => {
    loadReferralData();
  }, [salonId, clientId]);

  async function loadReferralData() {
    setLoading(true);
    try {
      const docRef = doc(db, `salons/${salonId}/client_referrals`, clientId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setReferralData(snap.data());
      } else {
        // Cria o documento de referral se não existir
        const initial = { clientId, clientName, referralCode, totalReferrals: 0, pendingPoints: 0, earnedPoints: 0, referrals: [], createdAt: Date.now() };
        await setDoc(docRef, initial);
        setReferralData(initial);
      }
    } catch (e) {
      console.error('[Referral]', e);
    } finally {
      setLoading(false);
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    const msg = encodeURIComponent(
      `Ei! Eu uso e recomendo o nosso salão. Agenda pelo link abaixo e você pode ganhar um desconto especial! 🎉\n\n${referralLink}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>;

  const total = referralData?.totalReferrals || 0;
  const earned = referralData?.earnedPoints || 0;

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-purple-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-5 w-5 text-primary" /> Indique Amigos e Ganhe!
          </CardTitle>
          <CardDescription>
            Para cada amigo que agendar pelo seu link, você ganha <strong>pontos de fidelidade</strong> que podem ser trocados por descontos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Estatísticas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Indicações', value: total, icon: <Users className="h-4 w-4" />, color: 'text-blue-600' },
              { label: 'Pts Ganhos', value: earned, icon: <Star className="h-4 w-4" />, color: 'text-amber-600' },
              { label: 'Pts/Indicação', value: '50', icon: <Gift className="h-4 w-4" />, color: 'text-green-600' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="rounded-xl bg-white border p-3 text-center">
                <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {/* Link de indicação */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Seu link de indicação</p>
            <div className="flex gap-2">
              <Input value={referralLink} readOnly className="text-xs bg-white" />
              <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Botões de compartilhar */}
          <div className="flex gap-2">
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={shareWhatsApp}>
              <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar no WhatsApp
            </Button>
          </div>

          {/* Como funciona */}
          <div className="rounded-lg bg-white border p-3 space-y-2 text-sm">
            <p className="font-medium">Como funciona?</p>
            <ol className="space-y-1 text-muted-foreground text-xs list-decimal list-inside">
              <li>Copie seu link e mande para amigos</li>
              <li>Quando o amigo agendar pelo seu link, você ganha <strong>50 pontos</strong></li>
              <li>Use os pontos para trocar por descontos no programa de fidelidade</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de indicações */}
      {(referralData?.referrals || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Histórico de Indicações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(referralData.referrals as any[]).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{r.name || 'Amigo'}</p>
                  <p className="text-xs text-muted-foreground">{r.date ? format(new Date(r.date), "dd/MM/yyyy", { locale: ptBR }) : '—'}</p>
                </div>
                <span className="text-green-600 font-bold text-xs">+50 pts</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
