import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Shield } from 'lucide-react';

// Banner de consentimento LGPD — aparece na primeira visita
export const LGPDConsent: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('lgpd_consent');
    if (!consent) {
      setTimeout(() => setVisible(true), 1500);
    }
  }, []);

  const accept = () => {
    localStorage.setItem('lgpd_consent', JSON.stringify({ accepted: true, date: new Date().toISOString() }));
    setVisible(false);
  };

  const decline = () => {
    // Apenas cookies essenciais — informamos e fechamos
    localStorage.setItem('lgpd_consent', JSON.stringify({ accepted: false, date: new Date().toISOString() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] p-3 md:p-4"
      role="dialog"
      aria-label="Aviso de cookies e privacidade"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50">
            <Shield className="h-4 w-4 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-slate-900 mb-1">Privacidade e Cookies</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Utilizamos apenas <strong>cookies essenciais</strong> para manter sua sessão e preferências. 
              Não usamos rastreamento de publicidade. Em conformidade com a <strong>LGPD (Lei 13.709/18)</strong>.{' '}
              <Link to="/privacidade" className="text-rose-600 hover:underline font-medium">
                Política de Privacidade
              </Link>{' '}·{' '}
              <Link to="/termos" className="text-rose-600 hover:underline font-medium">
                Termos de Uso
              </Link>
            </p>
          </div>
          <button onClick={decline} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3 justify-end">
          <button
            onClick={decline}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Só essenciais
          </button>
          <button
            onClick={accept}
            className="rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
          >
            Aceitar e continuar
          </button>
        </div>
      </div>
    </div>
  );
};
