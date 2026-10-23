import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SalonService } from '../types';
import { Clock, DollarSign, Search, ArrowRight, Star } from 'lucide-react';
import { SEO } from '../components/SEO';

interface SalonData { name: string; slug: string; description?: string; logo?: string; primaryColor?: string; businessType?: string; }

const BIZ_LABELS: Record<string, string> = {
  beauty: 'Serviços', health: 'Consultas e Tratamentos', fitness: 'Aulas e Treinos',
  services: 'Serviços', sports: 'Modalidades e Reservas',
};

export const ServicesPublic: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [salon, setSalon] = useState<SalonData | null>(null);
  const [services, setServices] = useState<SalonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [salonId, setSalonId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const q = query(collection(db, 'salons'), where('slug', '==', slug));
        const snap = await getDocs(q);
        if (snap.empty) { setLoading(false); return; }
        const sDoc = snap.docs[0];
        const sData = sDoc.data() as SalonData;
        setSalon(sData);
        setSalonId(sDoc.id);

        // Load services
        const bizDoc = await getDoc(doc(db, `salons/${sDoc.id}/settings/business`));
        const bizData = bizDoc.data() as any || {};
        setSalon({ ...sData, ...bizData, businessType: sData.businessType || 'beauty' });

        const svcSnap = await getDocs(query(
          collection(db, `salons/${sDoc.id}/services`),
          where('active', '==', true)
        ));
        const svcs = svcSnap.docs.map(d => ({ id: d.id, ...d.data() } as SalonService));
        setServices(svcs.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [slug]);

  const grouped = services
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description?.toLowerCase().includes(search.toLowerCase()))
    .reduce((acc, svc) => {
      const cat = (svc as any).category || 'Geral';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(svc);
      return acc;
    }, {} as Record<string, SalonService[]>);

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
    </div>
  );

  if (!salon) return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      <p>Estabelecimento não encontrado.</p>
    </div>
  );

  const svcLabel = BIZ_LABELS[salon.businessType || 'beauty'] || 'Serviços';
  const primary = (salon as any).primaryColor || '#e11d48';

  return (
    <>
      <SEO title={`${svcLabel} — ${salon.name}`} description={`Veja todos os serviços de ${salon.name} com preços e duração.`} />
      <div className="min-h-screen bg-slate-50">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3 mb-3">
              {(salon as any).logo ? (
                <img src={(salon as any).logo} alt={salon.name} className="h-10 w-10 rounded-xl object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: primary }}>
                  {salon.name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="font-bold text-slate-900">{salon.name}</h1>
                <p className="text-xs text-slate-500">{svcLabel}</p>
              </div>
              <a
                href={`/s/${slug}`}
                className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                style={{ background: primary }}
              >
                Agendar <ArrowRight className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Buscar em ${services.length} ${svcLabel.toLowerCase()}...`}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">
          {Object.keys(grouped).length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p>Nenhum serviço encontrado</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, svcs]) => (
              <div key={category}>
                {Object.keys(grouped).length > 1 && (
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">{category}</h2>
                )}
                <div className="space-y-2">
                  {svcs.map(svc => (
                    <div key={svc.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                      <div className="flex gap-3 p-4">
                        {/* Image */}
                        {(svc as any).images?.[0] ? (
                          <img src={(svc as any).images[0]} alt={svc.name} className="h-20 w-20 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="h-20 w-20 rounded-xl shrink-0 flex items-center justify-center text-2xl" style={{ background: `${primary}15` }}>
                            ✨
                          </div>
                        )}
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 text-sm">{svc.name}</h3>
                          {svc.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{svc.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <Clock className="h-3 w-3" /> {svc.duration}min
                            </span>
                            <span className="flex items-center gap-1 text-sm font-bold" style={{ color: primary }}>
                              <DollarSign className="h-3.5 w-3.5" />
                              R$ {Number((svc.price ?? 0)).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Book button */}
                      <a
                        href={`/s/${slug}`}
                        className="flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 border-t"
                        style={{ background: primary }}
                      >
                        Agendar este serviço <ArrowRight className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Footer CTA */}
          <div className="rounded-2xl p-5 text-center text-white" style={{ background: primary }}>
            <p className="font-bold text-lg mb-1">Gostou? Agende agora!</p>
            <p className="text-sm opacity-90 mb-3">Escolha o horário perfeito para você</p>
            <a href={`/s/${slug}`} className="inline-flex items-center gap-2 bg-white rounded-xl px-5 py-2.5 font-bold text-sm" style={{ color: primary }}>
              Ver agenda disponível <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
};
