import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSalon } from '../contexts/SalonContext';

// Chave pública VAPID — gere no servidor com:
// npx web-push generate-vapid-keys
// e coloque no .env como VITE_VAPID_PUBLIC_KEY
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const { user, profile } = useAuth();
  const salonContext = useSalon();
  const salonId = salonContext?.salonId ?? null;
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { success: false, reason: 'Browser não suporta push notifications' };
    }
    if (!VAPID_PUBLIC_KEY) {
      return { success: false, reason: 'VAPID key não configurada' };
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return { success: false, reason: 'Permissão negada' };

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Salva subscription no servidor
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userId: user?.uid,
          salonId,
          role: profile?.role,
        }),
      });

      setSubscribed(true);
      return { success: true };
    } catch (error: any) {
      console.error('[Push]', error);
      return { success: false, reason: error.message };
    }
  };

  const unsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint, userId: user?.uid }),
        });
      }
      setSubscribed(false);
    } catch (e) {
      console.error('[Push unsubscribe]', e);
    }
  };

  return { permission, subscribed, subscribe, unsubscribe };
}
