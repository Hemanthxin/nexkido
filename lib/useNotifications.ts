"use client";
import { useCallback, useEffect, useState } from "react";
import { unlockAudio } from "./sound";

export type NState = "unsupported" | "needs-install" | "default" | "granted" | "denied";

const toKey = (b64: string) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Make sure this browser is registered for lock-screen pushes (needs the page to be on https or localhost). */
async function sync() {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { key } = await (await fetch("/api/push/key")).json();
  if (!key || !("PushManager" in window)) return false;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) as BufferSource }));
  await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  return true;
}

/** Show a system notification through the service worker (works when the tab is in the background). */
export async function systemNotify(title: string, body: string, tag?: string, url = "/") {
  try {
    if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", data: { url }, vibrate: [120, 60, 120] } as NotificationOptions);
  } catch { /* the in-app toast still shows */ }
}

export function useNotifications() {
  const [state, setState] = useState<NState>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setState(ios ? "needs-install" : "unsupported");
      return;
    }
    setState(Notification.permission as NState);
    if (Notification.permission === "granted") sync().catch(() => {});
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      unlockAudio();
      const p = await Notification.requestPermission();
      setState(p as NState);
      if (p === "granted") await sync();
    } catch { /* leave the state as the browser reports it */ } finally { setBusy(false); }
  }, []);

  return { state, enable, busy };
}
