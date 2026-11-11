"use client";
import { useEffect, useRef, useState } from "react";

type Handlers = Partial<Record<"bus" | "trip" | "alert" | "notice" | "roster" | "reached", (data: any) => void>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const EVENTS = ["hello", "ping", "bus", "trip", "alert", "notice", "roster", "reached"] as const;

/**
 * Subscribes to /api/stream. Reconnects on its own, and also if the server goes quiet (a ping arrives every 10 s) or
 * the phone wakes from sleep. `onOpen` runs on every (re)connect: use it to reload a snapshot so nothing is missed.
 */
export function useStream(handlers: Handlers, onOpen?: () => void) {
  const h = useRef(handlers); h.current = handlers;
  const open = useRef(onOpen); open.current = onOpen;
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null, dead = false, last = Date.now();
    const connect = () => {
      if (dead) return;
      es?.close();
      es = new EventSource("/api/stream");
      es.onopen = () => { last = Date.now(); setOnline(true); open.current?.(); };
      es.onerror = () => setOnline(false); // EventSource retries by itself
      for (const ev of EVENTS) es.addEventListener(ev, (e) => {
        last = Date.now(); setOnline(true);
        if (ev === "ping" || ev === "hello") return;
        try { h.current[ev]?.(JSON.parse((e as MessageEvent).data)); } catch { /* ignore a malformed event */ }
      });
    };
    connect();
    const watchdog = setInterval(() => { if (Date.now() - last > 25_000) connect(); }, 5000);
    const wake = () => { if (document.visibilityState === "visible" && Date.now() - last > 12_000) connect(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", connect);
    return () => { dead = true; clearInterval(watchdog); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", connect); es?.close(); };
  }, []);

  return { online };
}
