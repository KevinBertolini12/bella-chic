import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { usePushNotifications } from '../hooks/usePushNotifications';

const VAPID_CONFIGURED = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;

export const PushNotificationButton = () => {
  const { permission, subscribed, subscribe, unsubscribe } = usePushNotifications();
  const [loading, setLoading] = useState(false);

  // Não mostra se VAPID key não foi configurada no .env
  if (!VAPID_CONFIGURED) return null;
  // Não mostra o botão se o browser não suporta
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
  // Não mostra se o usuário já bloqueou
  if (permission === 'denied') return null;

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribe();
        toast.success('Notificações desativadas.');
      } else {
        const result = await subscribe();
        if (result.success) {
          toast.success('Notificações ativadas! Você receberá avisos de agendamentos e pedidos.');
        } else {
          toast.error(result.reason || 'Não foi possível ativar as notificações.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      className="gap-2"
      title={subscribed ? 'Desativar notificações' : 'Ativar notificações'}
    >
      {subscribed
        ? <BellRing className="h-4 w-4 text-primary" />
        : <Bell className="h-4 w-4" />}
      <span className="hidden sm:inline">
        {subscribed ? 'Notificações ativas' : 'Ativar notificações'}
      </span>
    </Button>
  );
};
