import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ChevronRight, X, Sparkles } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

interface OnboardingStep {
  id: string;
  title: string;
  desc: string;
  icon: string;
  check: (salonId: string) => Promise<boolean>;
  action: string;
  tab: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'service',
    title: 'Adicione seu primeiro serviço',
    desc: 'Cadastre o nome, preço e duração do serviço que você oferece',
    icon: '✂️',
    check: async (sid) => {
      const { collection, getDocs, limit, query } = await import('firebase/firestore');
      const { db: fdb } = await import('../../firebase');
      const snap = await getDocs(query(collection(fdb, `salons/${sid}/services`), limit(1)));
      return !snap.empty;
    },
    action: 'Adicionar serviço',
    tab: 'services',
  },
  {
    id: 'hours',
    title: 'Configure seus horários',
    desc: 'Defina os dias e horários em que você atende',
    icon: '🕐',
    check: async (sid) => {
      const { doc: fsDoc, getDoc: fsGet } = await import('firebase/firestore');
      const { db: fdb } = await import('../../firebase');
      const snap = await fsGet(fsDoc(fdb, `salons/${sid}/settings`, 'business'));
      return !!(snap.data()?.workingHours);
    },
    action: 'Configurar horários',
    tab: 'settings',
  },
  {
    id: 'whatsapp',
    title: 'Conecte o WhatsApp',
    desc: 'Receba notificações e ative o bot de atendimento automático',
    icon: '📱',
    check: async (sid) => {
      const { doc: fsDoc, getDoc: fsGet } = await import('firebase/firestore');
      const { db: fdb } = await import('../../firebase');
      const snap = await fsGet(fsDoc(fdb, `salons/${sid}/settings`, 'business'));
      return !!(snap.data()?.whatsapp);
    },
    action: 'Conectar WhatsApp',
    tab: 'settings',
  },
  {
    id: 'branding',
    title: 'Personalize sua página',
    desc: 'Adicione sua logo, cor e nome para deixar a página com a sua cara',
    icon: '🎨',
    check: async (sid) => {
      const { doc: fsDoc, getDoc: fsGet } = await import('firebase/firestore');
      const { db: fdb } = await import('../../firebase');
      const snap = await fsGet(fsDoc(fdb, `salons/${sid}/settings`, 'branding'));
      return !!(snap.data()?.primaryColor);
    },
    action: 'Personalizar',
    tab: 'settings',
  },
  {
    id: 'share',
    title: 'Compartilhe seu link',
    desc: 'Envie seu link de agendamento pro WhatsApp, Instagram e grupos',
    icon: '🔗',
    check: async (sid) => {
      const { doc: fsDoc, getDoc: fsGet } = await import('firebase/firestore');
      const { db: fdb } = await import('../../firebase');
      const snap = await fsGet(fsDoc(fdb, `salons/${sid}/settings`, 'onboarding'));
      return snap.data()?.sharedLink === true;
    },
    action: 'Marcar como feito',
    tab: 'share',
  },
];

interface OnboardingChecklistProps {
  salonId: string;
  onTabChange: (tab: string) => void;
  onDismiss: () => void;
}

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ salonId, onTabChange, onDismiss }) => {
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!salonId) return;
    Promise.all(STEPS.map(step => step.check(salonId).catch(() => false)))
      .then(results => {
        const map: Record<string, boolean> = {};
        STEPS.forEach((step, i) => { map[step.id] = results[i]; });
        setSteps(map);
        setLoading(false);
      });
  }, [salonId]);

  const completedCount = Object.values(steps).filter(Boolean).length;
  const allDone = completedCount === STEPS.length;
  const progress = (completedCount / STEPS.length) * 100;

  const handleMarkShared = async () => {
    await setDoc(doc(db, `salons/${salonId}/settings`, 'onboarding'), { sharedLink: true }, { merge: true });
    setSteps(p => ({ ...p, share: true }));
  };

  const handleDismiss = async () => {
    await setDoc(doc(db, `salons/${salonId}/settings`, 'onboarding'), { completed: true }, { merge: true });
    setDismissed(true);
    onDismiss();
  };

  if (dismissed || loading) return null;

  return (
    <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white shadow-sm mb-6 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-rose-500 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">
              {allDone ? '🎉 Configuração completa!' : 'Configure seu negócio'}
            </p>
            <p className="text-xs text-slate-500">{completedCount} de {STEPS.length} etapas concluídas</p>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-rose-100">
        <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Steps */}
      <div className="divide-y divide-slate-100">
        {STEPS.map(step => {
          const done = steps[step.id];
          return (
            <div key={step.id} className={`flex items-center gap-3 px-5 py-3.5 ${done ? 'opacity-60' : ''}`}>
              <span className="text-xl flex-shrink-0">{step.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {step.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
              </div>
              {done
                ? <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                : (
                  <button
                    onClick={() => step.id === 'share' ? handleMarkShared() : onTabChange(step.tab)}
                    className="flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {step.action} <ChevronRight className="h-3 w-3" />
                  </button>
                )
              }
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between">
          <p className="text-sm text-emerald-700 font-semibold">🚀 Tudo pronto! Seu negócio está no ar.</p>
          <button onClick={handleDismiss} className="text-xs text-emerald-600 underline">Fechar</button>
        </div>
      )}
    </div>
  );
};
