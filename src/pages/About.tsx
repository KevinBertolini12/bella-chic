import React from 'react';
import { motion } from 'motion/react';
import { Card, CardContent } from '../components/ui/card';
import { Heart, Star, Shield, Users, LucideIcon } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useSalon } from '../contexts/SalonContext';
import ReactMarkdown from 'react-markdown';
import { SEO } from '../components/SEO';

const iconMap: Record<string, LucideIcon> = { Heart, Star, Shield, Users };
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&q=80&w=800';

export const About = () => {
  const { settings } = useSettings();
  const { salon } = useSalon();

  if (!settings) return null;

  const { home, cms, branding } = settings;
  const heroImage = home.about.imageURL || FALLBACK_IMAGE;
  const sinceYear = salon?.createdAt ? new Date(salon.createdAt).getFullYear() : null;
  const yearsActive = sinceYear ? new Date().getFullYear() - sinceYear : null;

  return (
    <>
      <SEO title="Sobre" description={branding.fullDescription || "Conheça nossa história"} />
      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative h-[400px] overflow-hidden">
          <img
            src={heroImage}
            alt={home.about.title}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 px-4 text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
              <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">{home.about.title}</h1>
              <p className="text-xl text-white/80">{branding.slogan}</p>
            </motion.div>
          </div>
        </section>

        {/* Conteúdo principal */}
        <section className="bg-background py-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="space-y-6">
                <h2 className="text-3xl font-bold tracking-tight text-primary">{home.about.title}</h2>
                <div className="prose prose-lg max-w-none text-muted-foreground dark:prose-invert">
                  <ReactMarkdown>{cms.aboutPage || branding.fullDescription}</ReactMarkdown>
                </div>
                {home.benefits.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    {home.benefits.map((benefit, i) => {
                      const Icon = iconMap[benefit.icon] || Star;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className="font-medium text-sm">{benefit.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="relative">
                <img
                  src={heroImage}
                  alt={home.about.title}
                  className="rounded-2xl shadow-2xl"
                  referrerPolicy="no-referrer"
                />
                {yearsActive !== null && yearsActive > 0 && (
                  <div className="absolute -bottom-6 -left-6 hidden rounded-xl bg-white p-6 shadow-xl md:block">
                    <p className="text-4xl font-bold text-primary">{yearsActive}+</p>
                    <p className="text-sm text-muted-foreground">Anos de Experiência</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Valores */}
        {home.benefits.length > 0 && (
          <section className="bg-muted/30 py-20">
            <div className="container mx-auto px-4 text-center">
              <h2 className="mb-12 text-3xl font-bold">Nossos Valores</h2>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                {home.benefits.slice(0, 3).map((benefit, i) => {
                  const Icon = iconMap[benefit.icon] || Star;
                  return (
                    <Card key={i} className="border-none bg-transparent shadow-none">
                      <CardContent className="pt-6">
                        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon className="h-8 w-8" />
                        </div>
                        <h3 className="mb-2 text-xl font-bold">{benefit.title}</h3>
                        <p className="text-muted-foreground">{benefit.description}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
};