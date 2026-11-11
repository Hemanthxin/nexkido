import * as webpush from "web-push";
import { pushSubsFor, removePushSub } from "./db";

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

let configured: boolean | null = null;
function configure() {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(subject || "mailto:support@nexkido.app", pub, priv);
  return (configured = true);
}

export const vapidPublicKey = () => (configure() ? process.env.VAPID_PUBLIC_KEY! : null);

/** Deliver a browser push to every device this user has enabled alerts on. Failures never throw. */
export async function sendPush(userId: string, p: PushPayload) {
  if (!configure()) return;
  let subs;
  try { subs = await pushSubsFor(userId); } catch (e) { console.error("[push] lookup failed", (e as Error).message); return; }
  await Promise.allSettled(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s, JSON.stringify(p), { TTL: 120, urgency: "high" });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await removePushSub(s.endpoint).catch(() => {}); // the device unsubscribed
      else console.error("[push] send failed", code ?? (e as Error).message);
    }
  }));
}
