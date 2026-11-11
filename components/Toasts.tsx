"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "info" | "alert" | "ok" | "error";
type T = { id: number; title?: string; body: string; tone: Tone };
const Ctx = createContext<(t: { title?: string; body: string; tone?: Tone }) => void>(() => {});
export const useToast = () => useContext(Ctx);

const DOT: Record<Tone, string> = { info: "bg-sky", alert: "bg-sun", ok: "bg-[#35e0a1]", error: "bg-[#ff7a70]" };

/** Short messages that slide in at the top and go by themselves. Alerts use the sun-yellow dot. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const n = useRef(0);
  const drop = (id: number) => setList((l) => l.filter((x) => x.id !== id));
  const push = useCallback((t: { title?: string; body: string; tone?: Tone }) => {
    const id = ++n.current, tone = t.tone ?? "info";
    setList((l) => [...l.slice(-3), { id, title: t.title, body: t.body, tone }]);
    setTimeout(() => drop(id), tone === "error" ? 8000 : 6500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-[68px] z-[80] flex flex-col gap-2 md:left-auto md:right-6 md:w-[380px]" aria-live="polite">
        {list.map((t) => (
          <button key={t.id} onClick={() => drop(t.id)} role={t.tone === "error" ? "alert" : "status"} className="toast-in pointer-events-auto flex items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-left text-paper shadow-[0_18px_40px_-10px_rgba(0,0,0,.5)]">
            <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[t.tone]}`} />
            <span className="min-w-0">{t.title && <span className="block text-sm font-bold">{t.title}</span>}<span className="block text-sm text-paper/85">{t.body}</span></span>
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}
