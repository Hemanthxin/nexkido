/** Navigate with the NexKido transition. Pass the click point so the new page can grow out of it. */
export const go = (href: string, at?: { x: number; y: number }) => {
  window.dispatchEvent(new CustomEvent("nk:go", { detail: { href, ...at } }));
};
