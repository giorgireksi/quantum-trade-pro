// ---------- small helpers ----------
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const fmtPrice = (v: number, d: number) => v.toFixed(d);
export function fmtVol(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return v.toFixed(0);
}
export function uid(): string { return Math.random().toString(36).slice(2, 10) }

export type TUnsub = () => void;
export class Emitter<T> {
  private subs = new Set<(v: T) => void>();
  emit(v: T) { for (const s of [...this.subs]) s(v) }
  on(fn: (v: T) => void): TUnsub { this.subs.add(fn); return () => this.subs.delete(fn) }
}

/** nearest bar index (linearly interpolated float index) for time t */
export function tToIdx(bars: { t: number }[], t: number): number {
  let lo = 0, hi = bars.length - 1;
  if (t <= bars[0].t) return 0;
  if (t >= bars[hi].t) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t <= t) lo = mid; else hi = mid;
  }
  return lo + (t - bars[lo].t) / Math.max(1e-9, bars[hi].t - bars[lo].t);
}
export function idxToT(bars: { t: number }[], idx: number): number {
  const i = clamp(Math.round(idx), 0, bars.length - 1);
  return bars[i].t;
}
export function nearestBar(bars: { t: number }[], t: number): number {
  return clamp(Math.round(tToIdx(bars, t)), 0, bars.length - 1);
}
