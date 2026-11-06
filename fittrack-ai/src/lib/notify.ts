"use client";

import { toast } from "sonner";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported" as const;
  if (Notification.permission === "default") return await Notification.requestPermission();
  return Notification.permission;
}

/** Mostra un avviso in-app e, se l'app non è in primo piano e il permesso c'è, una notifica di sistema. */
export function notify(title: string, body: string, action?: { label: string; href: string }) {
  toast(title, {
    description: body,
    duration: 8000,
    action: action ? { label: action.label, onClick: () => (window.location.href = action.href) } : undefined,
  });
  if (notificationsSupported() && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try {
      const n = new Notification(title, { body, icon: "/icon.svg", tag: title });
      n.onclick = () => {
        window.focus();
        if (action) window.location.href = action.href;
      };
    } catch {
      // Alcuni browser mobili richiedono un service worker per le notifiche: resta l'avviso in-app.
    }
  }
}
