import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { salonService } from '../services/salonService';
import { useSalon } from '../contexts/SalonContext';
import { SalonService } from '../types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Clock, Scissors, Sparkles, Heart, Flower2, ChevronLeft, ChevronRight, MapPin, MessageSquare, Phone } from 'lucide-react';
import { motion } from 'motion/react';
import { SEO } from '../components/SEO';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Cabelo':       <Scissors className="h-6 w-6" />,
  'Unhas':        <Sparkles className="h-6 w-6" />,
  'Sobrancelhas': <Heart className="h-6 w-6" />,
  'Pele':         <Flower2 className="h-6 w-6" />,
};

const getIcon = (category: string) =>
  CATEGORY_ICONS[category] || <Sparkles className="h-6 w-6" />;

// ─── Carrossel de imagens ─────────────────────────────────────────────────────
const ImageCarousel = ({ images, name }: { images: string[]; name: string }) => {
  const [current, setCurrent] = useState(0);

  if (images.length === 0) return null;

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrent((c) => (c === 0 ? images.length - 1 : c - 1));
  };
  const next = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrent((c) => (c === images.length - 1 ? 0 : c + 1));
  };

  return (
    <div className="group relative h-48 w-full overflow-hidden rounded-t-lg">
      {images.map((img, i) => (
        <img
          key={i}
          src={img}
          alt={`${name} ${i + 1}`}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${i === current ? 'opacity-100' : 'opacity-0'}`}
          referrerPolicy="no-referrer"
        />
      ))}

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

          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                className={`h-1.5 rounded-full transition-all ${i === current ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const ServicesSkeleton = () => (
  <div className="container mx-auto px-4 py-12">
    <div className="mb-12 space-y-3 text-center">
      <Skeleton className="mx-auto h-10 w-56" />
      <Skeleton className="mx-auto h-4 w-96" />
    </div>
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <Card key={i}>
          <Skeleton className="h-48 w-full rounded-t-lg rounded-b-none" />
          <CardHeader>
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-5 w-32 mt-2" />
            <Skeleton className="h-4 w-48 mt-1" />
          </CardHeader>
          <CardContent><Skeleton className="h-4 w-36" /></CardContent>
          <CardFooter><Skeleton className="h-10 w-full" /></CardFooter>
        </Card>
      ))}
    </div>
  </div>
);

export const Services = () => {
  const { salonId } = useSalon();
  const { slug } = useParams<{ slug: string }>();
  const [services, setServices] = useState<SalonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<any>(null);

  useEffect(() => {
    if (!salonId) return;
    salonService.getServices(salonId)
      .then(setServices)
      .catch(console.error)
      .finally(() => setLoading(false));

    // Busca dados de contato/endereço
    getDoc(doc(db, `salons/${salonId}/settings`, 'business'))
      .then(snap => { if (snap.exists()) setBusiness(snap.data()); })
      .catch(console.error);
  }, [salonId]);

  if (loading) return <ServicesSkeleton />;

  return (
    <>
      <SEO title="Serviços" description="Conheça nossos serviços" />
      <div className="container mx-auto px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight">Nossos Serviços</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Tratamentos de beleza realizados por profissionais qualificados, pensados para realçar o melhor em você.
          </p>
        </div>

        {services.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <Sparkles className="mx-auto mb-4 h-12 w-12 opacity-20" />
            <p>Nenhum serviço disponível no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service, i) => {
              const hasImages = service.images && (service.images ?? []).length > 0;
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="flex h-full flex-col transition-shadow hover:shadow-lg overflow-hidden">
                    {/* Carrossel de imagens — só aparece se o serviço tiver imagens cadastradas */}
                    {hasImages && (
                      <ImageCarousel images={service.images!} name={service.name} />
                    )}

                    <CardHeader className={hasImages ? 'pt-4' : ''}>
                      {!hasImages && (
                        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                          {getIcon(service.category)}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{service.category}</Badge>
                        <span className="text-lg font-bold text-primary">R$ {(service.price ?? 0).toFixed(2)}</span>
                      </div>
                      <CardTitle className="mt-3">{service.name}</CardTitle>
                      <CardDescription className="min-h-[48px]">{service.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Clock className="mr-2 h-4 w-4" />
                        {service.duration} minutos
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Link to={`/s/${slug}/agendamento`} className="w-full">
                        <Button className="w-full" variant="outline">Agendar Agora</Button>
                      </Link>
                    </CardFooter>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Localização e Contato */}
        {business && (business.address || business.whatsapp || business.phone) && (
          <div className="mt-16 rounded-2xl border bg-muted/30 p-6">
            <h2 className="mb-6 text-xl font-bold text-center">Como Chegar</h2>
            <div className="flex flex-col md:flex-row gap-4 justify-center">
              {business.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [business.address, business.number, business.neighborhood, business.city, business.state].filter(Boolean).join(', ')
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-start gap-3 rounded-xl border bg-background p-4 shadow-sm hover:shadow-md transition-shadow group"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Endereço</p>
                    <p className="text-sm text-muted-foreground">
                      {[business.address, business.number].filter(Boolean).join(', ')}
                      {business.neighborhood ? ` — ${business.neighborhood}` : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">{[business.city, business.state].filter(Boolean).join(', ')}</p>
                    <span className="mt-1 inline-block text-xs text-primary font-medium group-hover:underline">Abrir no Maps →</span>
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
                  className="flex flex-1 items-start gap-3 rounded-xl border bg-background p-4 shadow-sm hover:shadow-md transition-shadow group"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600 shrink-0 group-hover:bg-green-500 group-hover:text-white transition-colors">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{business.whatsapp ? 'WhatsApp' : 'Telefone'}</p>
                    <p className="text-sm text-muted-foreground">{business.whatsapp || business.phone}</p>
                    <span className="mt-1 inline-block text-xs text-green-600 font-medium group-hover:underline">
                      {business.whatsapp ? 'Chamar no WhatsApp →' : 'Ligar →'}
                    </span>
                  </div>
                </a>
              )}
              {business.workingHours && (
                <div className="flex flex-1 items-start gap-3 rounded-xl border bg-background p-4 shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Horários</p>
                    {Object.entries(business.workingHours)
                      .filter(([, v]: any) => !v.closed)
                      .slice(0, 4)
                      .map(([day, v]: any) => (
                        <p key={day} className="text-sm text-muted-foreground">{day}: {v.open}–{v.close}</p>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
