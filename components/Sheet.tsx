"use client";
import { useEffect, useRef } from "react";

/** A modal panel: slides up from the bottom on a phone, in from the right on a desktop. Esc, the backdrop or a swipe down closes it. */
export default function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; back?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  const down = (e: React.PointerEvent) => { drag.current = { y: e.clientY, dy: 0 }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    if (panel.current && matchMedia("(max-width: 767px)").matches) panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (panel.current) panel.current.style.transform = "";
    if (d && d.dy > 110) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="sheet-fade absolute inset-0 bg-ink/55" onClick={onClose} />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="sheet-panel absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl bg-paper shadow-2xl outline-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[480px] md:rounded-none md:rounded-l-3xl">
        <div className="shrink-0 touch-none select-none md:touch-auto" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-ink/20 md:hidden" />
          <header className="flex items-center justify-between gap-4 border-b border-ink/10 px-5 py-3.5">
            <h2 className="display text-2xl font-extrabold">{title}</h2>
            <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-ink/8 text-xl leading-none hover:bg-ink/15">×</button>
          </header>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4" data-lenis-prevent>{children}</div>
        {footer && <div className="shrink-0 border-t border-ink/10 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
