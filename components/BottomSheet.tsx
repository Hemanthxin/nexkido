"use client";
import { useEffect, useRef } from "react";

/**
 * The card that floats over a full-screen map. On a phone it sits at the bottom: `peek` is always visible and
 * the rest opens when you tap or swipe the handle. On a desktop it is a fixed card at the left, always fully open.
 * `onHeight` reports its height so the map can keep the bus clear of it.
 */
export default function BottomSheet({ peek, children, open, onOpenChange, onHeight }: { peek: React.ReactNode; children?: React.ReactNode; open: boolean; onOpenChange: (o: boolean) => void; onHeight?: (px: number) => void }) {
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; moved: number } | null>(null);
  const cb = useRef(onHeight); cb.current = onHeight;

  useEffect(() => {
    if (!card.current) return;
    const ro = new ResizeObserver(() => cb.current?.(card.current!.getBoundingClientRect().height));
    ro.observe(card.current);
    return () => ro.disconnect();
  }, []);

  const down = (e: React.PointerEvent) => { drag.current = { y: e.clientY, moved: 0 }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (drag.current) drag.current.moved = e.clientY - drag.current.y; };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (Math.abs(d.moved) < 8) onOpenChange(!open);
    else onOpenChange(d.moved < 0);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 md:inset-x-auto md:bottom-6 md:left-6 md:w-[400px]">
      <div ref={card} className="pointer-events-auto rounded-t-3xl bg-paper shadow-[0_-12px_40px_-8px_rgba(10,16,24,.35)] md:rounded-3xl md:shadow-[0_20px_60px_-10px_rgba(10,16,24,.5)]">
        <button type="button" aria-label={open ? "Collapse details" : "Show details"} aria-expanded={open} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => (drag.current = null)} className="block h-7 w-full touch-none md:hidden">
          <span aria-hidden className="mx-auto mt-2.5 block h-1.5 w-10 rounded-full bg-ink/20" />
        </button>
        <div className="px-4 pb-1 pt-0 md:p-5 md:pb-2">{peek}</div>
        {children && (
          <div className={`grid transition-[grid-template-rows] duration-300 ease-out md:grid-rows-[1fr] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="min-h-0 overflow-hidden">
              <div className="max-h-[48dvh] overflow-y-auto overscroll-contain px-4 pb-1 md:max-h-[42dvh] md:px-5" data-lenis-prevent>{children}</div>
            </div>
          </div>
        )}
        <div className="h-[max(0.75rem,env(safe-area-inset-bottom))] md:h-3" />
      </div>
    </div>
  );
}
