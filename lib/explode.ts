const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far the road photograph is pulled apart (0 = whole, 1 = fully exploded) at scroll progress p. */
export const explodeAt = (p: number) => smooth(0.16, 0.4, p) * (1 - smooth(0.6, 0.82, p));
