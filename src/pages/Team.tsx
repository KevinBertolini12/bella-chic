import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { salonService } from '../services/salonService';
import { Professional, SalonService } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Star, Users, Calendar } from 'lucide-react';
import { useSalon } from '../contexts/SalonContext';
import { motion } from 'motion/react';
import { SEO } from '../components/SEO';

const TeamSkeleton = () => (
  <div className="container mx-auto px-4 py-12">
    <div className="mb-12 space-y-3 text-center">
      <Skeleton className="mx-auto h-10 w-64" />
      <Skeleton className="mx-auto h-4 w-96" />
    </div>
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="h-80 w-full" />
          <CardHeader className="text-center">
            <Skeleton className="mx-auto h-6 w-40" />
            <Skeleton className="mx-auto mt-2 h-4 w-32" />
          </CardHeader>
          <CardContent><Skeleton className="h-4 w-full" /></CardContent>
        </Card>
      ))}
    </div>
  </div>
);

const avatarUrl = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=400&bold=true`;

export const Team = () => {
  const { salonId } = useSalon();
  const { slug } = useParams<{ slug: string }>();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<SalonService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!salonId) return;
    Promise.all([
      salonService.getProfessionals(salonId),
      salonService.getServices(salonId),
    ])
      .then(([profs, svcs]) => { setProfessionals(profs); setServices(svcs); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [salonId]);

  const serviceName = (id: string) =>
    services.find((s) => s.id === id)?.name || null;

  if (loading) return <TeamSkeleton />;

  return (
    <>
      <SEO title="Equipe" description="Nossos profissionais" />
      <div className="container mx-auto px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight">Conheça Nossa Equipe</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Profissionais apaixonados por beleza e dedicados a proporcionar a melhor experiência para você.
          </p>
        </div>

        {professionals.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <Users className="mx-auto mb-4 h-12 w-12 opacity-20" />
            <p>Nenhum profissional cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {professionals.map((pro, i) => (
              <motion.div
                key={pro.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <Card className="group overflow-hidden transition-all hover:shadow-xl">
                  <div className="relative h-80 overflow-hidden">
                    <img
                      src={pro.photoURL || avatarUrl(pro.displayName)}
                      alt={pro.displayName}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 to-transparent p-6 opacity-0 transition-opacity group-hover:opacity-100">
                      <Link to={`/s/${slug}/agendamento`} className="w-full">
                        <Button className="w-full" variant="secondary">
                          <Calendar className="mr-2 h-4 w-4" /> Agendar com {pro.displayName.split(' ')[0]}
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <CardHeader className="text-center">
                    <div className="mb-1 flex items-center justify-center gap-0.5">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className="h-4 w-4 fill-primary text-primary" />
                      ))}
                    </div>
                    <CardTitle className="text-xl">{pro.displayName}</CardTitle>

                    {pro.specialties.length > 0 && (
                      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                        {pro.specialties.map((id) => {
                          const name = serviceName(id);
                          return name ? (
                            <Badge key={id} variant="secondary" className="bg-primary/5 text-primary border-primary/10 text-xs">
                              {name}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="text-center">
                    {pro.bio && (
                      <p className="text-sm italic text-muted-foreground">
                        "{pro.bio}"
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};