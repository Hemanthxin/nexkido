let ctx: AudioContext | null = null;

/** Browsers only allow sound after a tap, so this is called from the first tap on the page. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* sound is a nicety */ }
}

/** A short two-note chime and a buzz, for an alert arriving. */
export function chime() {
  try {
    unlockAudio();
    if (ctx && ctx.state === "running") {
      const t = ctx.currentTime;
      ([[660, 0], [880, 0.14]] as const).forEach(([f, d]) => {
        const o = ctx!.createOscillator(), g = ctx!.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.2, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.4);
        o.connect(g).connect(ctx!.destination);
        o.start(t + d); o.stop(t + d + 0.45);
      });
    }
    navigator.vibrate?.([120, 60, 120]);
  } catch { /* sound is a nicety */ }
}

if (typeof window !== "undefined") window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
