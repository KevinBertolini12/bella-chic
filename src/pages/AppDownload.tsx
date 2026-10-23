import React, { useState, useEffect } from 'react';
import { SEO } from '../components/SEO';
import { Smartphone, Download, Chrome, Apple, Monitor, Wifi, Bell, Zap, CheckCircle } from 'lucide-react';

export const AppDownload: React.FC = () => {
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop' | 'unknown'>('unknown');
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent.toLowerCase();
    if (/android/.test(ua)) setPlatform('android');
    else if (/iphone|ipad|ipod/.test(ua)) setPlatform('ios');
    else setPlatform('desktop');

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Capture install prompt (Android/Desktop)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const features = [
    { icon: <Wifi className="h-5 w-5 text-green-600" />, label: 'Funciona offline', desc: 'Agenda e dados disponíveis sem internet' },
    { icon: <Bell className="h-5 w-5 text-blue-600" />, label: 'Notificações', desc: 'Alertas de novos agendamentos em tempo real' },
    { icon: <Zap className="h-5 w-5 text-amber-600" />, label: 'Rápido como app nativo', desc: 'Carregamento instantâneo, sem loja necessária' },
    { icon: <Smartphone className="h-5 w-5 text-violet-600" />, label: 'Ícone na tela inicial', desc: 'Acesse direto como qualquer app instalado' },
  ];

  return (
    <>
      <SEO title="Baixar App — Bella & Chic" description="Instale o app da Bella & Chic no seu celular ou computador, sem precisar de loja de apps." />
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50">
        <div className="container mx-auto px-4 py-12 max-w-2xl">

          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-600 shadow-xl mb-5">
              <Smartphone className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">Bella & Chic App</h1>
            <p className="text-slate-600">Instale no seu dispositivo — gratuito, sem App Store ou Google Play</p>
          </div>

          {/* Already installed */}
          {isInstalled ? (
            <div className="rounded-2xl bg-green-50 border-2 border-green-200 p-6 text-center mb-8">
              <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <p className="font-bold text-green-800 text-lg">App já instalado!</p>
              <p className="text-sm text-green-700 mt-1">Você está usando a versão instalada. Aproveite!</p>
            </div>
          ) : installed ? (
            <div className="rounded-2xl bg-green-50 border-2 border-green-200 p-6 text-center mb-8">
              <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <p className="font-bold text-green-800 text-lg">Instalado com sucesso! 🎉</p>
              <p className="text-sm text-green-700 mt-1">Procure o ícone na sua tela inicial.</p>
            </div>
          ) : null}

          {/* Install instructions by platform */}
          {!isInstalled && !installed && (
            <div className="space-y-4 mb-8">

              {/* Android */}
              {(platform === 'android' || platform === 'unknown') && (
                <div className={`rounded-2xl border-2 p-5 ${platform === 'android' ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600">
                      <span className="text-white text-lg">🤖</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Android</p>
                      {platform === 'android' && <span className="text-xs bg-green-600 text-white rounded-full px-2 py-0.5">Seu dispositivo</span>}
                    </div>
                  </div>
                  {deferredPrompt ? (
                    <button
                      onClick={handleInstall}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 text-white font-bold py-3 px-4 hover:bg-green-700 transition-colors shadow-lg"
                    >
                      <Download className="h-5 w-5" /> Instalar App Agora
                    </button>
                  ) : (
                    <ol className="space-y-2 text-sm text-slate-700">
                      <li className="flex gap-2"><span className="font-bold text-green-600 shrink-0">1.</span> Abra esta página no Chrome</li>
                      <li className="flex gap-2"><span className="font-bold text-green-600 shrink-0">2.</span> Toque nos <strong>3 pontinhos</strong> (⋮) no canto superior direito</li>
                      <li className="flex gap-2"><span className="font-bold text-green-600 shrink-0">3.</span> Toque em <strong>"Adicionar à tela inicial"</strong></li>
                      <li className="flex gap-2"><span className="font-bold text-green-600 shrink-0">4.</span> Confirme e pronto! 🎉</li>
                    </ol>
                  )}
                </div>
              )}

              {/* iOS */}
              {(platform === 'ios' || platform === 'unknown') && (
                <div className={`rounded-2xl border-2 p-5 ${platform === 'ios' ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900">
                      <Apple className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">iPhone / iPad (iOS)</p>
                      {platform === 'ios' && <span className="text-xs bg-blue-600 text-white rounded-full px-2 py-0.5">Seu dispositivo</span>}
                    </div>
                  </div>
                  <ol className="space-y-2 text-sm text-slate-700">
                    <li className="flex gap-2"><span className="font-bold text-blue-600 shrink-0">1.</span> Abra esta página no <strong>Safari</strong> (obrigatório)</li>
                    <li className="flex gap-2"><span className="font-bold text-blue-600 shrink-0">2.</span> Toque no ícone de <strong>compartilhar</strong> <span className="font-mono">⎙</span> (na barra inferior)</li>
                    <li className="flex gap-2"><span className="font-bold text-blue-600 shrink-0">3.</span> Role e toque em <strong>"Adicionar à Tela de Início"</strong></li>
                    <li className="flex gap-2"><span className="font-bold text-blue-600 shrink-0">4.</span> Toque em <strong>Adicionar</strong> e pronto! 🎉</li>
                  </ol>
                </div>
              )}

              {/* Desktop */}
              {(platform === 'desktop' || platform === 'unknown') && (
                <div className={`rounded-2xl border-2 p-5 ${platform === 'desktop' ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600">
                      <Monitor className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Computador (Windows / Mac)</p>
                      {platform === 'desktop' && <span className="text-xs bg-violet-600 text-white rounded-full px-2 py-0.5">Seu dispositivo</span>}
                    </div>
                  </div>
                  {deferredPrompt ? (
                    <button
                      onClick={handleInstall}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white font-bold py-3 px-4 hover:bg-violet-700 transition-colors shadow-lg"
                    >
                      <Download className="h-5 w-5" /> Instalar no Computador
                    </button>
                  ) : (
                    <div className="space-y-3 text-sm text-slate-700">
                      <div>
                        <p className="font-semibold mb-1 flex items-center gap-1.5"><Chrome className="h-4 w-4 text-blue-600" /> Google Chrome</p>
                        <ol className="space-y-1 pl-5 list-decimal">
                          <li>Clique no ícone de <strong>instalação</strong> (⊕) na barra de endereços</li>
                          <li>Clique em <strong>"Instalar"</strong></li>
                        </ol>
                      </div>
                      <div>
                        <p className="font-semibold mb-1">Microsoft Edge</p>
                        <ol className="space-y-1 pl-5 list-decimal">
                          <li>Clique nos <strong>três pontinhos</strong> (···) no canto superior direito</li>
                          <li>Clique em <strong>"Aplicativos → Instalar este site como aplicativo"</strong></li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Features */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-6">
            <p className="font-bold text-slate-900 mb-4 text-center">Por que instalar o app?</p>
            <div className="grid grid-cols-2 gap-3">
              {features.map(f => (
                <div key={f.label} className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                  <div className="shrink-0 mt-0.5">{f.icon}</div>
                  <div>
                    <p className="font-semibold text-xs text-slate-900">{f.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800 text-center">
            <p className="font-semibold mb-1">💡 O que é um PWA?</p>
            <p>É um app que funciona no navegador mas se comporta como um app nativo — tem ícone, abre em tela cheia, funciona offline e recebe notificações. Sem precisar de App Store, Google Play ou atualização manual.</p>
          </div>

        </div>
      </div>
    </>
  );
};
