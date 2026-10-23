import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Salon, SalonSettings, Plan } from '../types';
import { salonService } from '../services/salonService';
import { settingsService } from '../services/settingsService';

interface SalonContextType {
  salon: Salon | null;
  salonId: string | null;
  settings: SalonSettings | null;
  plan: Plan | null;
  loading: boolean;
  error: string | null;
}

const SalonContext = createContext<SalonContextType>({
  salon: null,
  salonId: null,
  settings: null,
  plan: null,
  loading: true,
  error: null,
});

export const SalonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [salonId, setSalonId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SalonSettings | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSalonContext = async () => {
      try {
        setLoading(true);
        setError(null);

        // Extrai slug da rota /s/:slug/*
        const pathParts = location.pathname.split('/');
        const salonSlug = pathParts[1] === 's' && pathParts[2] ? pathParts[2] : '';

        if (salonSlug) {
          const salonData = await salonService.getSalonBySlug(salonSlug);
          if (salonData) {
            setSalon(salonData);
            setSalonId(salonData.id);
            const [salonSettings, planData] = await Promise.all([
              settingsService.getSettings(salonData.id),
              salonService.getPlanById(salonData.planId),
            ]);
            setSettings(salonSettings);
            setPlan(planData);
          } else {
            // Salão recém criado — retry uma vez após 1.5s (propagação do Firestore)
            const isNewSalon = location.pathname.includes('/bem-vindo');
            if (isNewSalon) {
              await new Promise(r => setTimeout(r, 1500));
              const retryData = await salonService.getSalonBySlug(salonSlug).catch(() => null);
              if (retryData) {
                setSalon(retryData);
                setSalonId(retryData.id);
                const [rs, rp] = await Promise.all([
                  settingsService.getSettings(retryData.id),
                  salonService.getPlanById(retryData.planId),
                ]);
                setSettings(rs);
                setPlan(rp);
              } else {
                setSalon(null); setSalonId(null); setSettings(null); setPlan(null);
                setError('Salão não encontrado');
              }
            } else {
              setSalon(null);
              setSalonId(null);
              setSettings(null);
              setPlan(null);
              setError('Salão não encontrado');
            }
          }
        } else {
          // Fora de /s/:slug — não é um salão
          setSalon(null);
          setSalonId(null);
          setSettings(null);
          setPlan(null);
        }
      } catch (err) {
        console.error('Erro ao carregar contexto do salão:', err);
        setError('Erro ao carregar dados do salão');
      } finally {
        setLoading(false);
      }
    };

    fetchSalonContext();
  }, [location.pathname]);

  return (
    <SalonContext.Provider value={{ salon, salonId, settings, plan, loading, error }}>
      {children}
    </SalonContext.Provider>
  );
};

export const useSalon = () => useContext(SalonContext);