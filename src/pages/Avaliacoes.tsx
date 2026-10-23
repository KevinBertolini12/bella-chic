import React from 'react';
import { Star } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useSalon } from '../contexts/SalonContext';
import { useSettings } from '../contexts/SettingsContext';
import { ReviewsList, RatingSummary } from '../components/admin/ReviewSystem';
import { SEO } from '../components/SEO';

export const Avaliacoes = () => {
  const { salonId, salon } = useSalon();
  const { settings } = useSettings();

  if (!salonId) return null;

  return (
    <>
      <SEO
        title="Avaliações"
        description={`Veja o que os clientes falam sobre ${settings?.branding?.name || 'nós'}.`}
      />
      <div className="container mx-auto max-w-2xl px-4 py-12">
        {/* Cabeçalho */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 mb-3">
            <Star className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Avaliações</h1>
          <p className="mt-1 text-muted-foreground">
            O que nossos clientes falam sobre{' '}
            <span className="font-medium">{settings?.branding?.name}</span>
          </p>
        </div>

        <ReviewsList salonId={salonId} isAdmin={false} />
      </div>
    </>
  );
};
