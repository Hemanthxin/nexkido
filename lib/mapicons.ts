/** DOM elements for map markers (MapLibre markers are plain elements). Client-only. */

/** A top-down school bus, nose at the top. `.nk-rot` is turned to the direction of travel. */
export function busEl() {
  const d = document.createElement("div");
  d.style.cssText = "width:56px;height:56px;position:relative;pointer-events:none";
  d.innerHTML = `<div class="nk-halo"></div>
    <div class="nk-rot" style="position:absolute;left:11px;top:0;width:34px;height:56px;will-change:transform;filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))">
      <svg viewBox="0 0 34 56" width="34" height="56" aria-hidden="true">
        <rect x="3" y="2" width="28" height="52" rx="7" fill="#FFB81C" stroke="#0F1D2E" stroke-width="2.4"/>
        <rect x="7" y="5.5" width="20" height="9" rx="2.5" fill="#0F1D2E"/>
        <rect x="10" y="22" width="14" height="14" rx="2.5" fill="#F29A00" stroke="#0F1D2E" stroke-width="1.4"/>
        <rect x="8" y="45" width="18" height="5" rx="1.5" fill="#0F1D2E" opacity=".8"/>
        <rect x="0" y="11" width="3" height="6" rx="1.2" fill="#0F1D2E"/><rect x="31" y="11" width="3" height="6" rx="1.2" fill="#0F1D2E"/>
        <circle cx="8" cy="4.5" r="1.5" fill="#fff"/><circle cx="26" cy="4.5" r="1.5" fill="#fff"/>
      </svg>
    </div>`;
  return d;
}

/** A destination pin with an optional ETA bubble above it. */
export function pinEl(label?: string) {
  const d = document.createElement("div");
  d.style.cssText = "width:36px;height:46px;position:relative;pointer-events:none";
  d.innerHTML = `<div class="nk-bubble" style="display:none"></div>
    <svg viewBox="0 0 36 46" width="36" height="46" aria-hidden="true" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))">
      <path d="M18 44 C 8 31 4 25 4 17.5 A 14 14 0 0 1 32 17.5 C 32 25 28 31 18 44Z" fill="#FFB81C" stroke="#0F1D2E" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="18" cy="17.5" r="6" fill="#0F1D2E"/><circle cx="18" cy="17.5" r="2.2" fill="#FFB81C"/>
    </svg>`;
  if (label) d.title = label;
  return d;
}

/** A numbered stop. */
export function stopEl(n: number | string, done = false, label?: string) {
  const d = document.createElement("div");
  d.className = "nk-stop" + (done ? " done" : "");
  d.textContent = String(n);
  if (label) d.title = label;
  return d;
}

/** A small navy dot for stops on overview maps. */
export function dotEl(label?: string) {
  const d = document.createElement("div");
  d.style.cssText = "width:16px;height:16px;border-radius:50%;background:#0F1D2E;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)";
  if (label) d.title = label;
  return d;
}

/** Where the trip began: a white dot with a blue ring, the way Google marks a start point. */
export function originEl() {
  const d = document.createElement("div");
  d.style.cssText = "width:22px;height:22px;pointer-events:none";
  d.innerHTML = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))"><circle cx="11" cy="11" r="8.5" fill="#fff" stroke="#1A73E8" stroke-width="4"/></svg>`;
  d.title = "Start";
  return d;
}
