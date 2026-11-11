"use client";
import type { NState } from "@/lib/useNotifications";

/** Asks once for permission to send alerts, and explains plainly when that isn't possible. */
export default function NotifyPrompt({ state, enable, busy, what = "alerts" }: { state: NState; enable: () => void; busy: boolean; what?: string }) {
  if (state === "granted" || state === "unsupported") return null;
  if (state === "denied")
    return <p className="rounded-xl bg-bad/10 px-3 py-2.5 text-sm text-bad">Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings to get {what} on your lock screen.</p>;
  if (state === "needs-install")
    return <p className="rounded-xl bg-sun/30 px-3 py-2.5 text-sm">On iPhone, tap Share, then <b>Add to Home Screen</b>, and open NexKido from there to turn on {what}.</p>;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-sun/30 px-3 py-2.5">
      <p className="text-sm font-medium">Get {what} even when this screen is closed.</p>
      <button onClick={enable} disabled={busy} className="btn btn-solid shrink-0 !px-4 !py-2 text-sm">{busy ? "Asking…" : "Turn on"}</button>
    </div>
  );
}
