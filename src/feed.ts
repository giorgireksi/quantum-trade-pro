// ---------- mock OHLCV feed (deterministic) ----------
import { Bar, SymbolDef, TF } from "./types";
import { mulberry32 } from "./util";

const DAY = 86400000, DAYS = 170;
export const cache = new Map<string, Map<string, Bar[]>>(); // symbol -> tfId -> bars

function makeBase1m(sym: SymbolDef): Bar[] {
  const rnd = mulberry32(sym.seed);
  const n = DAYS * 1440;
  const out: Bar[] = new Array(n);
  let p = 100 * (sym.seed % 7 + 0.5);
  const start = Date.now() - DAY * DAYS;
  // per-day drift/vol -> per-bar (1m) values so prices stay realistic over 170 days
  const v1m = sym.vol / Math.sqrt(1440), d1m = sym.drift / 1440;
  for (let i = 0; i < n; i++) {
    const t = start + i * 60000;
    const hourBias = sym.market === "CRYPTO" ? 0 : Math.sin((t % DAY) / DAY * Math.PI * 2 - 2) * 0.0012;
    const o = p;
    const c = o * (1 + d1m + hourBias + (rnd() - 0.5) * 2 * v1m);
    const h = Math.max(o, c) * (1 + rnd() * v1m * 0.45);
    const l = Math.min(o, c) * (1 - rnd() * v1m * 0.45);
    const v = sym.volBase * (0.35 + 0.75 * rnd()) * (0.55 + Math.abs(c - o) / (o * v1m) * 0.9);
    out[i] = { t, o, h, l, c, v };
    p = c;
  }
  return out;
}

export function aggregate(base: Bar[], mins: number): Bar[] {
  const out: Bar[] = [];
  const win = mins * 60000;
  let cur: Bar | null = null;
  for (const b of base) {
    const bucket = Math.floor(b.t / win) * win;
    if (!cur || cur.t !== bucket) {
      if (cur) out.push(cur);
      cur = { t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
    } else {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l);
      cur.c = b.c; cur.v += b.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function barsFor(name: string, tf: TF): Bar[] {
  let bySym = cache.get(name);
  if (!bySym) { bySym = new Map(); cache.set(name, bySym); }
  let arr = bySym.get(tf.id);
  if (!arr) {
    const sym = SYMBOLS_BY_NAME[name];
    if (!sym) throw new Error("unknown symbol " + name);
    const base = tf.mins === 1 ? makeBase1m(sym) : aggregate(makeBase1m(sym), tf.mins);
    arr = base; bySym.set(tf.id, arr);
  }
  return arr;
}
import { SYMBOLS } from "./types";
export const SYMBOLS_BY_NAME: Record<string, SymbolDef> = Object.fromEntries(SYMBOLS.map(s => [s.name, s]));
