import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, ShoppingBag, Star, Clock, ShieldCheck, Heart, LucideIcon, ChevronLeft, ChevronRight, MapPin, Phone, MessageSquare } from 'lucide-react';
import { Button } from '../components/ui/button';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { useSalon } from '../contexts/SalonContext';
import { usePlanAccess } from '../hooks/usePlanAccess';
import { salonService } from '../services/salonService';
import { SalonService } from '../types';
import { SEO } from '../components/SEO';

const iconMap: Record<string, LucideIcon> = {
  Star,
  Clock,
  ShieldCheck,
  Heart,
  Calendar,
  ShoppingBag,
};

// ─── Carrossel de imagens do serviço ─────────────────────────────────────────
const ServiceImageCarousel = ({ service, baseUrl, slug }: { service: SalonService; baseUrl: string; slug: string | undefined }) => {
  const [current, setCurrent] = useState(0);
  const images = service.images && (service.images ?? []).length > 0
    ? service.images
    : [`https://picsum.photos/seed/${service.id}/800/600`];

  const prev = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrent((c) => (c === 0 ? images.length - 1 : c - 1));
  };
  const next = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrent((c) => (c === images.length - 1 ? 0 : c + 1));
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="group relative h-64 overflow-hidden rounded-xl shadow-lg"
    >
      {/* Imagens */}
      {images.map((img, i) => (
        <img
          key={i}
          src={img}
          alt={`${service.name} ${i + 1}`}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${i === current ? 'opacity-100' : 'opacity-0'}`}
          referrerPolicy="no-referrer"
        />
      ))}

      {/* Gradiente */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Conteúdo */}
      <div className="absolute inset-0 flex flex-col justify-end p-6">
        <h3 className="text-xl font-bold text-white">{service.name}</h3>
        <Link to={`${baseUrl}/agendamento`} className="mt-2 text-sm font-medium text-primary hover:underline">
          Ver horários →
        </Link>
      </div>

      {/* Controles do carrossel — só aparece se tiver mais de 1 imagem */}
      {images.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Indicadores */}
          <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.preventDefault(); setCurrent(i); }}
                className={`h-1.5 rounded-full transition-all ${i === current ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};

export const Home = () => {
  const { settings } = useSettings();
  const { salon } = useSalon();
  const { slug } = useParams<{ slug: string }>();
  const { hasFeature } = usePlanAccess();
  const [featuredServices, setFeaturedServices] = useState<SalonService[]>([]);
  const [business, setBusiness] = useState<any>(null);

  const hasStore = hasFeature('hasStore');

  useEffect(() => {
    const fetchFeatured = async () => {
      if (!salon) return;
      if (settings?.home.featuredServices.length) {
        const allServices = await salonService.getServices(salon.id);
        const featured = allServices.filter(s => settings.home.featuredServices.includes(s.id));
        setFeaturedServices(featured);
      } else {
        const allServices = await salonService.getServices(salon.id);
        setFeaturedServices(allServices.slice(0, 4));
      }
      // Busca dados de contato/endereço
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const bizDoc = await getDoc(doc(db, `salons/${salon.id}/settings`, 'business'));
        if (bizDoc.exists()) setBusiness(bizDoc.data());
      } catch {}
    };
    fetchFeatured();
  }, [settings, salon]);

  if (!settings || !salon) return null;

  const { home } = settings;
  const baseUrl = `/s/${slug}`;

  return (
    <>
      <SEO title="Início" description={settings.branding.shortDescription} />
      <div className="flex flex-col">
        {/* Hero Section */}
        {(home.hero.heroLayout || 'background') === 'split' ? (
          /* ── Layout Split: texto à esquerda, imagem à direita ── */
          <section className="w-full bg-background">
            <div className="container mx-auto flex min-h-[560px] flex-col-reverse items-center gap-0 px-0 md:flex-row md:px-4 md:gap-12 md:py-16">
              {/* Texto */}
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center md:items-start md:text-left md:py-0">
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl md:text-6xl"
                >
                  {home.hero.title}
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-4 max-w-[500px] text-lg text-muted-foreground"
                >
                  {home.hero.subtitle}
                  {home.hero.description && (<><br /><span className="text-base">{home.hero.description}</span></>)}
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-8 flex flex-col gap-3 sm:flex-row"
                >
                  <Link to={`${baseUrl}${home.hero.button1Link}`}>
                    <Button size="lg" className="h-12 w-full px-8 text-lg sm:w-auto">
                      <Calendar className="mr-2 h-5 w-5" />
                      {home.hero.button1Text}
                    </Button>
                  </Link>
                  {hasStore && (
                    <Link to={`${baseUrl}${home.hero.button2Link}`}>
                      <Button size="lg" variant="outline" className="h-12 w-full px-8 text-lg sm:w-auto">
                        <ShoppingBag className="mr-2 h-5 w-5" />
                        {home.hero.button2Text}
                      </Button>
                    </Link>
                  )}
                </motion.div>
              </div>
              {/* Imagem */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full md:flex-1 md:max-w-[480px]"
              >
                <img
                  src={home.hero.imageURL || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=800'}
                  alt={home.hero.title}
                  className="h-[340px] w-full object-cover object-top md:h-[560px] md:rounded-2xl md:shadow-2xl"
                />
              </motion.div>
            </div>
          </section>
        ) : (
          /* ── Layout Background: imagem de fundo (padrão) ── */
          <section className="relative h-[600px] w-full overflow-hidden bg-muted">
            {home.hero.imageURL ? (
              <img
                src={home.hero.imageURL}
                alt={home.hero.title}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ filter: `brightness(${1 - (settings.appearance.heroOverlayOpacity || 0.5)})` }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
            )}
            <div className="container relative mx-auto flex h-full flex-col items-center justify-center px-4 text-center text-white">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold tracking-tighter sm:text-6xl md:text-7xl"
              >
                {home.hero.title}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-6 max-w-[600px] text-lg text-gray-200 sm:text-xl"
              >
                {home.hero.subtitle}
                <br />
                <span className="text-base opacity-80">{home.hero.description}</span>
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-10 flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"
              >
                <Link to={`${baseUrl}${home.hero.button1Link}`}>
                  <Button size="lg" className="h-12 px-8 text-lg">
                    <Calendar className="mr-2 h-5 w-5" />
                    {home.hero.button1Text}
                  </Button>
                </Link>
                {hasStore && (
                  <Link to={`${baseUrl}${home.hero.button2Link}`}>
                    <Button size="lg" variant="outline" className="h-12 border-2 border-white bg-white/15 px-8 text-lg text-white backdrop-blur-sm hover:bg-white hover:text-black">
                      <ShoppingBag className="mr-2 h-5 w-5" />
                      {home.hero.button2Text}
                    </Button>
                  </Link>
                )}
              </motion.div>
            </div>
          </section>
        )}

        {/* Features — cards 3D com cor do tema */}
        <section className="bg-background py-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {home.benefits.map((benefit, index) => {
                const Icon = iconMap[benefit.icon] || Star;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -6, scale: 1.03 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1, type: 'spring', stiffness: 260, damping: 20 }}
                    className="group relative flex flex-col items-center rounded-2xl border border-primary/10 bg-background p-6 text-center shadow-md"
                    style={{
                      boxShadow: '0 4px 24px 0 rgba(0,0,0,0.08), 0 1.5px 6px 0 rgba(0,0,0,0.04)',
                      transform: 'perspective(800px)',
                    }}
                  >
                    {/* Faixa colorida no topo */}
                    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-primary opacity-80" />
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 shadow-inner group-hover:bg-primary transition-colors duration-300">
                      <Icon className="h-7 w-7 text-primary group-hover:text-white transition-colors duration-300" />
                    </div>
                    <h3 className="text-base font-bold sm:text-lg">{benefit.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-snug">{benefit.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Services Grid com carrossel de imagens */}
        <section className="bg-muted/30 py-20">
          <div className="container mx-auto px-4">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">Nossos Serviços</h2>
              <p className="mt-4 text-muted-foreground">Especialistas em realçar o que há de melhor em você.</p>
            </div>
            {featuredServices.length === 0 ? (
              <p className="text-center text-muted-foreground">Nenhum serviço disponível no momento.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {featuredServices.map((service, index) => (
                  <motion.div
                    key={service.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <ServiceImageCarousel service={service} baseUrl={baseUrl} slug={slug} />
                  </motion.div>
                ))}
              </div>
            )}

            <div className="mt-10 text-center">
              <Link to={`${baseUrl}/servicos`}>
                <Button variant="outline" size="lg">Ver todos os serviços</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Shop CTA */}
        {hasStore && (
          <section className="py-20">
            <div className="container mx-auto px-4">
              <div className="flex flex-col items-center overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground md:flex-row md:text-left">
                <div className="flex-1 space-y-6">
                  <h2 className="text-4xl font-bold tracking-tighter sm:text-5xl">{home.shopCTA.title}</h2>
                  <p className="text-lg opacity-90">{home.shopCTA.description}</p>
                  <Link to={`${baseUrl}/loja`} className="inline-block">
                    <Button variant="secondary" size="lg" className="h-12 px-8 text-lg">
                      {home.shopCTA.buttonText}
                    </Button>
                  </Link>
                </div>
                <div className="mt-12 flex-1 md:mt-0 md:pl-12">
                  <img
                    src={home.shopCTA.imageURL}
                    alt={home.shopCTA.title}
                    className="rounded-2xl shadow-2xl"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </div>
          </section>
        )}
        {/* Localização e Contato */}
        {business && (business.address || business.whatsapp || business.phone) && (() => {
          const DAY_PT: Record<string, string> = {
            monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta',
            thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo',
          };
          const DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
          const openDays = business.workingHours
            ? DAY_ORDER.filter(d => business.workingHours[d] && !business.workingHours[d].closed)
            : [];

          const cardClass = "relative flex flex-col gap-3 rounded-2xl border border-primary/10 bg-background p-5 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl";
          const cardStyle = { boxShadow: '0 4px 24px 0 rgba(0,0,0,0.09), 0 1.5px 6px 0 rgba(0,0,0,0.05)' };

          return (
            <section className="py-16 bg-muted/20">
              <div className="container mx-auto px-4">
                <div className="mb-10 text-center">
                  <h2 className="text-2xl font-bold tracking-tight">Como Chegar</h2>
                  <p className="mt-2 text-muted-foreground">Estamos esperando por você</p>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">

                  {/* Endereço */}
                  {business.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [business.address, business.number, business.neighborhood, business.city, business.state].filter(Boolean).join(', ')
                      )}`}
                      target="_blank" rel="noreferrer"
                      className={cardClass} style={cardStyle}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-primary" />
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Endereço</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {[business.address, business.number].filter(Boolean).join(', ')}
                          {business.neighborhood ? ` — ${business.neighborhood}` : ''}
                        </p>
                        <p className="text-sm text-muted-foreground">{[business.city, business.state].filter(Boolean).join(', ')}</p>
                        <span className="mt-2 inline-block text-xs text-primary font-medium">Abrir no Maps →</span>
                      </div>
                    </a>
                  )}

                  {/* WhatsApp / Telefone */}
                  {(business.whatsapp || business.phone) && (
                    <a
                      href={business.whatsapp ? `https://wa.me/55${business.whatsapp.replace(/\D/g,'')}` : `tel:${business.phone}`}
                      target="_blank" rel="noreferrer"
                      className={cardClass} style={cardStyle}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-green-500" />
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100">
                        <MessageSquare className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">WhatsApp / Telefone</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{business.whatsapp || business.phone}</p>
                        <span className="mt-2 inline-block text-xs text-green-600 font-medium">
                          {business.whatsapp ? 'Chamar no WhatsApp →' : 'Ligar →'}
                        </span>
                      </div>
                    </a>
                  )}

                  {/* Horários — todos os dias abertos em português */}
                  {business.workingHours && openDays.length > 0 && (
                    <div className={cardClass} style={cardStyle}>
                      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-primary/60" />
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                        <Clock className="h-5 w-5 text-primary" />
                      </div>
                      <div className="w-full">
                        <p className="font-semibold text-sm mb-2">Horários</p>
                        <div className="space-y-1">
                          {openDays.map(day => {
                            const h = business.workingHours[day];
                            return (
                              <div key={day} className="flex items-center justify-between text-xs">
                                <span className="text-foreground font-medium w-16">{DAY_PT[day]}</span>
                                <span className="text-muted-foreground">
                                  {h.open}–{h.close}
                                  {h.lunchStart && h.lunchEnd ? ` (almoço ${h.lunchStart}–${h.lunchEnd})` : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </section>
          );
        })()}
      </div>
    </>
  );
};
