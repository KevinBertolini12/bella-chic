import React, { useState, useEffect } from 'react';
import { X, Smartphone, Monitor, Apple } from 'lucide-react';

// Detecta se já está instalado como PWA
function isRunningAsPWA() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

// Detecta o sistema do usuário
function detectOS(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export const InstallPWABanner = () => {
  const [visible, setVisible] = useState(false);
  const [os, setOs] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Não mostra se já está instalado ou se já foi dispensado
    if (isRunningAsPWA()) return;
    if (localStorage.getItem('pwa_banner_dismissed')) return;
    setOs(detectOS());
    setVisible(true);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('pwa_banner_dismissed', '1');
    setVisible(false);
  };

  const [expanded, setExpanded] = React.useState(false);

  if (!visible) return null;

  const content = {
    ios: {
      icon: <Apple className="h-5 w-5 shrink-0 text-gray-700" />,
      title: 'Instale no seu iPhone ou iPad',
      steps: [
        'Abra este site no Safari',
        'Toque no botão de compartilhar (□ com seta pra cima) na barra inferior',
        'Role a lista e toque em "Adicionar à Tela de Início"',
        'Confirme tocando em "Adicionar" — pronto!',
      ],
      note: 'Após instalar, as notificações push também ficam disponíveis.',
      color: 'bg-gray-50 border-gray-200',
      badge: 'bg-gray-100 text-gray-700',
    },
    android: {
      icon: <Smartphone className="h-5 w-5 shrink-0 text-green-700" />,
      title: 'Instale como app no Android',
      steps: [
        'Abra este site no Chrome',
        'Toque nos três pontos (⋮) no canto superior direito',
        'Toque em "Adicionar à tela inicial" ou "Instalar aplicativo"',
        'Confirme — o ícone aparece na sua tela!',
      ],
      note: 'Funciona sem precisar de Play Store. Notificações já ficam ativas.',
      color: 'bg-green-50 border-green-200',
      badge: 'bg-green-100 text-green-700',
    },
    desktop: {
      icon: <Monitor className="h-5 w-5 shrink-0 text-blue-700" />,
      title: 'Instale no computador',
      steps: [
        'No Chrome ou Edge, clique no ícone de instalação (⊕) na barra de endereço',
        'Ou clique nos três pontos → "Instalar Bella & Chic"',
        'Confirme clicando em "Instalar"',
        'O app abre em janela própria, sem barra do navegador',
      ],
      note: 'No Firefox não há suporte a instalação — use Chrome ou Edge.',
      color: 'bg-blue-50 border-blue-200',
      badge: 'bg-blue-100 text-blue-700',
    },
  };

  const c = content[os];

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${c.color} relative`}>
      {/* Linha principal compacta */}
      <div className="flex items-center gap-2">
        {c.icon}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-xs truncate">{c.title}</p>
          <p className="text-[10px] text-muted-foreground">Acesse mais rápido — igual a um app</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="rounded-full px-2 py-0.5 text-[10px] font-medium border hover:bg-white/60 transition-colors"
          >
            {expanded ? 'Fechar' : 'Ver como'}
          </button>
          <button onClick={handleDismiss} className="rounded-full p-1 hover:bg-black/10">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Instruções expandidas */}
      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-black/5">
          <ol className="space-y-1 mb-2">
            {(c.steps ?? []).map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold mt-0.5 ${c.badge}`}>
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-muted-foreground italic mb-2">{c.note}</p>
          <div className="flex flex-wrap gap-1.5">
            {(['android', 'ios', 'desktop'] as const).filter(p => p !== os).map(platform => (
              <button key={platform} onClick={() => setOs(platform)}
                className="rounded-full border px-2.5 py-0.5 text-[10px] hover:bg-white/60 transition-colors">
                {platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : 'PC'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
