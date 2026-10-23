import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, Calendar, Settings, Users, Share2, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useSalon } from '../contexts/SalonContext';
import { SEO } from '../components/SEO';

const steps = [
  {
    icon: Settings,
    title: 'Configure seu salão',
    description: 'Adicione logo, cores, horários de funcionamento e informações de contato.',
    tab: 'settings',
    cta: 'Ir para Configurações',
  },
  {
    icon: Users,
    title: 'Cadastre seus profissionais',
    description: 'Adicione os profissionais do seu salão para que clientes possam escolher com quem se atender.',
    tab: 'team',
    cta: 'Adicionar Profissionais',
  },
  {
    icon: Calendar,
    title: 'Crie seus serviços',
    description: 'Cadastre os serviços que você oferece com preço e duração.',
    tab: 'services',
    cta: 'Criar Serviços',
  },
  {
    icon: Share2,
    title: 'Compartilhe com seus clientes',
    description: 'Seu link já está no ar! Copie e mande para seus clientes começarem a agendar.',
    tab: 'overview',
    cta: 'Ver meu link',
  },
];

export const RegistrationSuccess = () => {
  const navigate = useNavigate();
  const { salon } = useSalon();
  const slug = salon?.slug;
  const [completedStep, setCompletedStep] = useState<number | null>(null);

  const goToAdmin = (tab?: string) => {
    const base = `/s/${slug}/admin`;
    navigate(tab ? `${base}?tab=${tab}` : base);
  };

  return (
    <>
      <SEO title="Bem-vindo!" description="Seu perfil está pronto. Siga os primeiros passos." />
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto max-w-2xl px-4 py-16">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 text-center"
          >
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Seu perfil está no ar! 🎉
            </h1>
            <p className="mt-3 text-muted-foreground">
              {salon?.name || 'Seu espaço'} foi criado com sucesso. Siga os passos abaixo para começar a receber agendamentos.
            </p>
            {salon?.slug && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm">
                <span className="text-muted-foreground">Seu link:</span>
                <a
                  href={`/s/${salon.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {window.location.origin}/s/{salon.slug}
                </a>
              </div>
            )}
          </motion.div>

          {/* Steps */}
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const done = completedStep !== null && completedStep >= index;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className={`rounded-xl border bg-white p-5 shadow-sm transition-all ${done ? 'border-primary/30 bg-primary/5' : 'hover:border-primary/20 hover:shadow-md'}`}>
                    <div className="flex items-start gap-4">
                      {/* Número / check */}
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                        {done ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <h3 className="font-semibold">{step.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>

                      {/* Botão */}
                      <Button
                        size="sm"
                        variant={done ? 'outline' : 'default'}
                        className="shrink-0"
                        onClick={() => {
                          setCompletedStep(index);
                          goToAdmin(step.tab);
                        }}
                      >
                        {step.cta}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* CTA final */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-center"
          >
            <Button size="lg" onClick={() => goToAdmin()}>
              Ir para o Painel Administrativo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Você tem {salon?.trialEndsAt
                ? `${Math.max(0, Math.ceil((salon.trialEndsAt - Date.now()) / 86400000))} dias`
                : '30 dias'} de teste grátis. Sem precisar de cartão de crédito.
            </p>
          </motion.div>
        </div>
      </div>
    </>
  );
};
