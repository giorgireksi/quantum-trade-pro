// ---------- computed series: AVWAP / FRVP / AVP ----------
import { Bar } from "../types";
import { clamp } from "../util";
import { findLowerTf } from "../feed_x";

export interface VwapPoint { t: number; m: number; sd: number }

export function avwapSeries(bars: Bar[], anchorIdx: number): VwapPoint[] {
  const out: VwapPoint[] = [];
  let sv = 0, spv = 0, sq = 0;
  for (let i = Math.max(0, anchorIdx); i < bars.length; i++) {
    const b = bars[i], tp = (b.h + b.l + b.c) / 3;
    sv += b.v; spv += tp * b.v;
    const m = spv / sv;
    sq += b.v * (tp - m) * (tp - m);
    out.push({ t: b.t, m, sd: Math.sqrt(Math.max(0, sq) / sv) });
  }
  return out;
}

export interface VpRow { lo: number; hi: number; vol: number; up: number; down: number; poc: boolean; va: boolean }
export interface VpResult { rows: VpRow[]; top: number; bottom: number; pocIdx: number; total: number }

/** bins lower-TF bars into fixed tick rows following TV's documented algorithm */
export function volumeProfile(lbBars: Bar[], top: number, bottom: number, tick: number, rows: number, valueArea: number): VpResult {
  const span = top - bottom;
  const ticksInSpan = Math.max(1, Math.round(span / tick));
  const tpr = Math.max(1, Math.round(ticksInSpan / rows));   // ticks per row
  const nRows = Math.max(1, Math.ceil(ticksInSpan / tpr));
  const rowsArr: VpRow[] = new Array(nRows);
  for (let i = 0; i < nRows; i++) {
    rowsArr[i] = { lo: bottom + i * tpr * tick, hi: bottom + (i + 1) * tpr * tick, vol: 0, up: 0, down: 0, poc: false, va: false };
  }
  const put = (price: number, vol: number, up: boolean) => {
    const ri = clamp(Math.floor((price - bottom) / (tpr * tick)), 0, nRows - 1);
    const r = rowsArr[ri];
    r.vol += vol; if (up) r.up += vol; else r.down += vol;
  };
  for (const b of lbBars) {
    const up = b.c > b.o;
    if (b.h <= bottom || b.l >= top) continue;
    const lo = Math.max(b.l, bottom), hi = Math.min(b.h, top);
    if (hi - lo <= 0) { put(lo, b.v, up); continue; }
    const n = Math.max(1, Math.min(300, Math.ceil((hi - lo) / (tpr * tick))));
    for (let k = 0; k < n; k++) put(lo + (hi - lo) * (k + 0.5) / n, b.v / n, up);
  }
  let pocIdx = 0;
  for (let i = 1; i < nRows; i++) if (rowsArr[i].vol > rowsArr[pocIdx].vol) pocIdx = i;
  const order = rowsArr.map((_, i) => i).sort((a, b) => rowsArr[b].vol - rowsArr[a].vol);
  const total = rowsArr.reduce((s, r) => s + r.vol, 0);
  let acc = 0, vaTarget = total * valueArea;
  const vaSet = new Set<number>();
  for (const i of order) { vaSet.add(i); acc += rowsArr[i].vol; if (acc >= vaTarget) break; }
  for (let i = 0; i < nRows; i++) {
    rowsArr[i].poc = i === pocIdx;
    rowsArr[i].va = vaSet.has(i);
  }
  return { rows: rowsArr, top, bottom, pocIdx, total };
}

export interface ProfileReq {
  chartBars: Bar[]; lbStart: number; lbEnd: number;
  chartTfMins: number; tick: number; symbolName: string;
  rows: number; valueArea: number;
}
export function resolveProfile(req: ProfileReq): VpResult {
  const { chartBars, lbStart, lbEnd, chartTfMins, symbolName, rows, valueArea, tick } = req;
  const s = Math.max(0, Math.min(chartBars.length - 1, lbStart));
  const e = Math.max(0, Math.min(chartBars.length - 1, lbEnd));
  const t0 = chartBars[s].t, t1 = chartBars[e].t;
  let top = -Infinity, bottom = Infinity;
  for (let i = s; i <= e; i++) {
    const b = chartBars[i];
    if (b.h > top) top = b.h;
    if (b.l < bottom) bottom = b.l;
  }
  if (top === -Infinity) top = 1;
  if (bottom === Infinity) bottom = 0;
  const lb = findLowerTf.findBars({ symbolName, t0, t1, maxBars: 5000 });
  return volumeProfile(lb, top, bottom, tick, rows, valueArea);
}
