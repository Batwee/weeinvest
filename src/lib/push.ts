import { supabase } from "@/lib/supabase";

// Clé publique VAPID : publique par nature (elle est envoyée au navigateur).
// Surchargeable via VITE_VAPID_PUBLIC_KEY (voir .env.local).
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "BJHyA_wBOUbVmJKojOFfb-tJ_fr5g3PEm7lCoo-SUMBgXMdLZ3VlKTn4biFxEQlnqz3BENvyD3bgIjFjdix1168";

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

// Le service worker est aussi enregistré au démarrage (App.tsx) : register est idempotent.
export const ensureServiceWorker = async () => {
  const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  await navigator.serviceWorker.ready;
  return registration;
};

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "default") {
    return await Notification.requestPermission();
  }
  return Notification.permission;
};

// Enregistre l'abonnement de l'appareil courant en base (une ligne par endpoint).
export const subscribeToPush = async (userId: string) => {
  const registration = await ensureServiceWorker();

  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = subscription.toJSON();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      id_user: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
    { onConflict: "endpoint" }
  );

  if (error) throw error;

  return subscription;
};

export const unsubscribeFromPush = async () => {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
};
