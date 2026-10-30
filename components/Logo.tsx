"use client";

/**
 * The NexKido mark: an N and a K that share one stem. N's right stroke is K's spine, and K's upper arm
 * ends in a location dot, so the letters read as "next" and as a stop on the way.
 */
export function Mark({ size = 28, animate = false, className = "" }: { size?: number; animate?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`${animate ? "nk-draw " : ""}${className}`} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path className="nk-s" pathLength={1} d="M12 52 V14 L30 52 V14" />
      <path className="nk-s" pathLength={1} d="M30 34 L46 18" />
      <path className="nk-s" pathLength={1} d="M30 34 L50 52" />
      <circle className="nk-dot" cx="50" cy="13" r="8.5" fill="#FFB81C" stroke="currentColor" strokeWidth="4.5" />
    </svg>
  );
}

/** Mark plus wordmark. Colour follows the surrounding text colour. */
export function Logo({ size = 26, animate = false, className = "" }: { size?: number; animate?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display leading-none tracking-tight ${className}`} style={{ fontSize: size * 0.92 }}>
      <Mark size={size} animate={animate} />
      <span className="font-extrabold">Nex<span className="font-medium">Kido</span></span>
    </span>
  );
}
