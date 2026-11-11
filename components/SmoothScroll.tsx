"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/** Smooth, eased scrolling for the landing page only. The app screens are maps and sheets with their own scrolling. */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useEffect(() => {
    if (path !== "/") return;
    const lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, [path]);
  return <>{children}</>;
}
