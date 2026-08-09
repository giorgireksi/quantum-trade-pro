// ---------- draw each tool type; screen-space hit testing ----------
import { Bar, Drawing, SymbolDef } from "../types";
import { Viewport } from "../viewport";
import { defOf } from "./model";
import { avwapSeries, resolveProfile, VpResult } from "./computed";
import { tToIdx, clamp, fmtPrice } from "../util";
import { C } from "../palette";

export type LineShape = "segment" | "ray" | "extended" | "hline" | "hray" | "vline";

export function anchorPoints(d: Drawing, bars: Bar[], vp: Viewport): { x: number; y: number }[] {
  return d.anchors.map(a => {
    const idx = tToIdx(bars, a.t);
    return { x: vp.x(idx), y: vp.y(a.price) };
  });
}
function setLine(ctx: CanvasRenderingContext2D, d: Drawing) {
  const s = d.settings;
  ctx.lineWidth = (s.width as number) ?? 1.5;
  ctx.strokeStyle = (s.color as string) ?? C.blue;
  const st = (s.style as string) ?? "solid";
  ctx.setLineDash(st === "dashed" ? [6, 5] : st === "dotted" ? [2, 4] : []);
}
function priceTag(ctx: CanvasRenderingContext2D, x: number, y: number, txt: string, color: string, align: CanvasTextAlign = "left") {
  ctx.font = "600 10px 'IBM Plex Mono', monospace";
  const w = ctx.measureText(txt).width + 10;
  ctx.fillStyle = color;
  ctx.fillRect(align === "left" ? x : x - w, y - 9.5, w, 16);
  ctx.fillStyle = "#0b0e14";
  ctx.textAlign = align;
  ctx.fillText(txt, align === "left" ? x + 5 : x - 5, y + 3.5);
}

export function drawLineShape(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing, shape: LineShape, symbol: SymbolDef) {
  const pts = anchorPoints(d, bars, vp);
  const a = pts[0], b = pts[1] ?? pts[0];
  const color = (d.settings.color as string) ?? C.blue;
  setLine(ctx, d);
  ctx.beginPath();
  if (shape === "hline" || shape === "hray") {
    ctx.moveTo(vp.rect.l, a.y);
    ctx.lineTo(shape === "hline" ? vp.rect.r : Math.max(vp.rect.l, b.x), a.y);
  } else if (shape === "vline") {
    ctx.moveTo(a.x, vp.rect.t);
    ctx.lineTo(a.x, vp.rect.b);
  } else {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    if (shape === "ray" || shape === "extended") {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const span = vp.rect.r - b.x + 200 + (shape === "extended" ? vp.rect.l - a.x : 0);
      ctx.lineTo(b.x + dx / len * span, b.y + dy / len * span);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  const dec = Math.max(0, -Math.floor(Math.log10(symbol.tick)));
  if (d.settings.showPrice) {
    if (shape === "hline" || shape === "hray") {
      priceTag(ctx, vp.rect.r, a.y, fmtPrice(d.anchors[0].price, dec), color, "right");
    } else {
      priceTag(ctx, b.x, b.y - 9, fmtPrice(d.anchors[1]?.price ?? d.anchors[0].price, dec), color, "left");
    }
  }
}

const fmtP = (v: number, tick: number) => {
  const dec = Math.max(0, -Math.floor(Math.log10(tick)));
  return v.toFixed(dec);
};

export function drawChannel(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a, b, c] = anchorPoints(d, bars, vp);
  setLine(ctx, d);
  const ox = c.x - a.x, oy = c.y - a.y;
  const alpha = (d.settings.fill as number) ?? 0;
  if (alpha > 0) {
    ctx.fillStyle = (d.settings.color as string) ?? C.cyan;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + ox, b.y + oy); ctx.lineTo(c.x, c.y);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(b.x + ox, b.y + oy); ctx.stroke();
  ctx.setLineDash([]);
}

export function drawRect(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a, b] = anchorPoints(d, bars, vp);
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  const alpha = (d.settings.fill as number) ?? 0;
  if (alpha > 0) {
    ctx.fillStyle = (d.settings.color as string) ?? "#6999b8";
    ctx.globalAlpha = alpha;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
  setLine(ctx, d);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

export function drawFib(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing, symbol: SymbolDef) {
  const [a, b] = anchorPoints(d, bars, vp);
  const levels = String(d.settings.levels ?? "0,0.236,0.382,0.5,0.618,0.786,1").split(",").map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
  const p0 = d.anchors[0].price, p1 = d.anchors[1].price;
  const x0 = a.x, x1 = d.settings.extend ? vp.rect.r : b.x;
  const color = (d.settings.color as string) ?? C.blue;
  levels.forEach((lv, i) => {
    const v = p1 - (p1 - p0) * lv;
    const y = vp.y(v);
    ctx.strokeStyle = color;
    ctx.globalAlpha = i === 0 || i === levels.length - 1 ? 0.95 : 0.45;
    ctx.lineWidth = (d.settings.width as number) ?? 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (d.settings.showLabels) {
      ctx.font = "600 9.5px 'IBM Plex Mono', monospace";
      const txt = fmtP(v, symbol.tick) + "  " + lv;
      const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = "rgba(139,155,180,0.14)";
      ctx.fillRect(x1 - 2, y - 8, w, 15);
      ctx.fillStyle = C.axisTextBright;
      ctx.textAlign = "left";
      ctx.fillText(txt, x1 + 1, y + 3.5);
    }
  });
  ctx.globalAlpha = 1;
  // origin endpoint markers
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(a.x, a.y, 2.6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(b.x, b.y, 2.6, 0, 7); ctx.fill();
}

export function drawTextObj(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a] = anchorPoints(d, bars, vp);
  const s = d.settings;
  const txt = String(s.text ?? "text");
  const size = (s.size as number) ?? 13;
  ctx.font = `${size}px 'IBM Plex Sans', sans-serif`;
  const lines = txt.split("\n");
  const w = Math.max(...lines.map(l => ctx.measureText(l).width));
  const h = lines.length * (size + 4) + 8;
  ctx.fillStyle = (s.bg as string) ?? "#12171f";
  ctx.strokeStyle = "rgba(42,53,71,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(a.x, a.y - h, w + 14, h, 4);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = (s.color as string) ?? C.ink;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, a.x + 7, a.y - h + 6 + i * (size + 4)));
  ctx.textBaseline = "alphabetic";
}

export function drawPriceLabel(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing, symbol: SymbolDef) {
  const [a] = anchorPoints(d, bars, vp);
  const color = (d.settings.color as string) ?? C.blue;
  const txt = fmtP(d.anchors[0].price, symbol.tick);
  ctx.font = `600 ${(d.settings.size as number) ?? 11}px 'IBM Plex Mono', monospace`;
  const w = ctx.measureText(txt).width + 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(a.x, a.y - 10, w, 19, 3);
  ctx.fill();
  ctx.fillStyle = "#0b0e14";
  ctx.textAlign = "left";
  ctx.fillText(txt, a.x + 6, a.y + 3.5);
}

export function drawMeasure(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing, symbol: SymbolDef) {
  const [a, b] = anchorPoints(d, bars, vp);
  const color = (d.settings.color as string) ?? C.amber;
  const x0 = vp.rect.l;
  ctx.strokeStyle = color; ctx.lineWidth = (d.settings.width as number) ?? 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, a.y); ctx.lineTo(x0 + 8, a.y);
  ctx.moveTo(x0, b.y); ctx.lineTo(x0 + 8, b.y);
  ctx.moveTo(x0, a.y); ctx.lineTo(x0, b.y);
  ctx.stroke();
  const p0 = d.anchors[0].price, p1 = d.anchors[1].price;
  const diff = p1 - p0, pct = p0 ? (diff / p0) * 100 : 0;
  const dec = Math.max(0, -Math.floor(Math.log10(symbol.tick)));
  const bars0 = Math.round(tToIdx(bars, d.anchors[0].t)), bars1 = Math.round(tToIdx(bars, d.anchors[1].t));
  const txt = `▲ ${fmtP(Math.abs(diff), symbol.tick)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) · ${Math.abs(bars1 - bars0)} bars`;
  if (Math.abs(b.y - a.y) > 40) {
    ctx.save();
    ctx.translate(x0 + 12, (a.y + b.y) / 2 + 4);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = color; ctx.textAlign = "left";
    ctx.font = "600 10px 'IBM Plex Mono', monospace";
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
}

// ---------- computed tools ----------
const vwapCache = new WeakMap<Drawing, { key: string; pts: { t: number; m: number; sd: number }[] }>();
export function avwapPts(d: Drawing, bars: Bar[]): { t: number; m: number; sd: number }[] {
  const key = bars.length + "|" + bars[0]?.t + "|" + d.anchors[0].t;
  const hit = vwapCache.get(d);
  if (hit && hit.key === key) return hit.pts;
  const idx = clamp(Math.round(tToIdx(bars, d.anchors[0].t)), 0, bars.length - 1);
  const pts = avwapSeries(bars, idx);
  vwapCache.set(d, { key, pts });
  return pts;
}
export function drawAVWAP(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const pts = avwapPts(d, bars);
  const color = (d.settings.color as string) ?? C.amber;
  setLine(ctx, d);
  const path = (offset: (p: { m: number; sd: number }) => number) => {
    ctx.beginPath();
    let started = false;
    for (const p of pts) {
      if (p.t < bars[0].t || p.t > bars[bars.length - 1].t) continue;
      const x = vp.x(tToIdx(bars, p.t)), y = vp.y(offset(p));
      if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  if (d.settings.band2) {
    ctx.strokeStyle = color; ctx.globalAlpha = 0.22; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
    path(p => p.m - p.sd * 2); path(p => p.m + p.sd * 2);
  }
  if (d.settings.band1) {
    ctx.strokeStyle = color; ctx.globalAlpha = 0.34; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    path(p => p.m - p.sd); path(p => p.m + p.sd);
  }
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  setLine(ctx, d);
  path(p => p.m);
  // anchor marker
  const a = anchorPoints(d, bars, vp)[0];
  ctx.fillStyle = "#12171f"; ctx.strokeStyle = color; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(a.x, a.y, 3.6, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "600 9.5px 'IBM Plex Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillText("AVWAP ▲", a.x + 6, a.y - 6);
}

const vpCache = new WeakMap<Drawing, { key: string; res: VpResult }>();
export function profileResult(d: Drawing, bars: Bar[], tfMins: number, symbol: SymbolDef): VpResult {
  const key = symbol.name + "|" + tfMins + "|" + bars.length + "|" + bars[0]?.t + "|" + JSON.stringify({
    t: d.anchors.map(a => a.t), s: d.settings,
  });
  const hit = vpCache.get(d);
  if (hit && hit.key === key) return hit.res;
  const s = clamp(Math.round(tToIdx(bars, d.anchors[0].t)), 0, bars.length - 1);
  const eRaw = d.type === "avp" || d.settings.extendRight
    ? bars.length - 1
    : clamp(Math.round(tToIdx(bars, d.anchors[1].t)), 0, bars.length - 1);
  const rowMode = d.settings.rowMode as string;
  const rowValue = (d.settings.rowValue as number) ?? 24;
  const res = resolveProfile({
    chartBars: bars, lbStart: s, lbEnd: eRaw,
    chartTfMins: tfMins, tick: symbol.tick, symbolName: symbol.name,
    rows: rowMode === "ticks" ? Math.max(8, Math.round((bars[eRaw].h - bars[s].l) / (symbol.tick * rowValue))) : rowValue,
    valueArea: (d.settings.valueArea as number) ?? 0.7,
  });
  vpCache.set(d, { key, res });
  return res;
}
export function drawProfile(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing, tfMins: number, symbol: SymbolDef) {
  const res = profileResult(d, bars, tfMins, symbol);
  const s = clamp(Math.round(tToIdx(bars, d.anchors[0].t)), 0, bars.length - 1);
  const e = d.type === "avp" || d.settings.extendRight
    ? bars.length - 1
    : clamp(Math.round(tToIdx(bars, d.anchors[1].t)), 0, bars.length - 1);
  const x0 = vp.x(s), x1 = d.type === "avp" ? vp.rect.r : vp.x(e);
  const w = Math.max(40, x1 - x0);
  const mode = (d.settings.volumeMode as string) ?? "total";
  // box
  ctx.strokeStyle = "rgba(53,196,232,0.4)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.strokeRect(x0, vp.y(res.top), w, Math.max(1, vp.y(res.bottom) - vp.y(res.top)));
  ctx.setLineDash([]);
  // value area shading
  const yVA = (r: { va: boolean; lo: number; hi: number }) => r.va;
  let vaTop = -Infinity, vaBot = Infinity;
  for (const r of res.rows) if (r.va) { vaTop = Math.max(vaTop, r.hi); vaBot = Math.min(vaBot, r.lo) }
  if (vaTop !== -Infinity) {
    ctx.fillStyle = C.vaFill;
    ctx.fillRect(x0, vp.y(vaTop), w, Math.max(1, vp.y(vaBot) - vp.y(vaTop)));
  }
  // histogram bars, anchored at right edge, growing left
  const maxLen = Math.min(150, w * 0.55);
  for (const r of res.rows) {
    const yHi = vp.y(r.hi), yLo = vp.y(r.lo);
    const hgt = Math.max(1, yLo - yHi - 0.6);
    let len = 0;
    if (mode === "total") len = r.vol;
    else if (mode === "updown") len = r.up + r.down;
    else len = r.up - r.down;
    const frac = Math.abs(len) / (res.rows.length ? Math.max.apply(null, res.rows.map(x => mode === "total" ? x.vol : mode === "updown" ? x.up + x.down : Math.abs(x.up - x.down))) : 1);
    const px = Math.max(1.5, frac * maxLen);
    const xr = x1;
    if (mode === "delta") {
      ctx.fillStyle = len >= 0 ? C.up : C.down;
    } else if (mode === "updown") {
      ctx.fillStyle = C.up; ctx.globalAlpha = 1;
      const upFrac = r.up / Math.max(1e-9, r.up + r.down);
      ctx.fillRect(xr - px * upFrac, yHi, px * upFrac, hgt);
      ctx.fillStyle = C.down;
      ctx.fillRect(xr - px, yHi, px * (1 - upFrac), hgt);
      continue;
    } else {
      ctx.fillStyle = r.poc ? C.amber : "rgba(77,141,255,0.5)";
    }
    ctx.fillRect(xr - px, yHi, px, hgt);
    if (r.poc) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = C.amber;
      ctx.fillRect(xr - 2, yHi, 2, hgt);
      ctx.globalAlpha = 1;
    }
  }
  // POC price tag on right axis
  const poc = res.rows[res.pocIdx];
  if (poc) {
    ctx.fillStyle = C.amber;
    ctx.font = "600 9.5px 'IBM Plex Mono', monospace";
    const txt = fmtP((poc.lo + poc.hi) / 2, symbol.tick);
    const tw = ctx.measureText(txt).width + 10;
    ctx.fillRect(vp.rect.r + 4, vp.y((poc.lo + poc.hi) / 2) - 8, tw, 16);
    ctx.fillStyle = "#0b0e14"; ctx.textAlign = "left";
    ctx.fillText(txt, vp.rect.r + 9, vp.y((poc.lo + poc.hi) / 2) + 3.5);
    ctx.textAlign = "start";
  }
  // range tags
  ctx.fillStyle = "rgba(53,196,232,0.75)";
  ctx.font = "600 9.5px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  if (d.type === "frvp") {
    ctx.fillText("#1", x0, vp.rect.t + 10);
    ctx.fillText("#2", x1, vp.rect.t + 10);
  } else {
    ctx.fillText("AVP ▲", x0 + 4, vp.rect.t + 10);
  }
  ctx.textAlign = "start";
}

// ---------- hit testing ----------
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function hitTest(d: Drawing, bars: Bar[], vp: Viewport, px: number, py: number): { part: string; idx: number } | null {
  const pts = anchorPoints(d, bars, vp);
  // handles first (generous radius when selected elsewhere handled by caller)
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(px - pts[i].x, py - pts[i].y) <= 7) return { part: "anchor", idx: i };
  }
  const s = d.settings;
  const tol = Math.max(7, ((s.width as number) ?? 2) + 6);
  switch (d.type) {
    case "trendline": case "ray": case "extended":
      return distToSeg(px, py, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= tol ? { part: "body", idx: -1 } : null;
    case "hline": case "hray":
      return Math.abs(py - pts[0].y) <= tol && px >= vp.rect.l && px <= vp.rect.r ? { part: "body", idx: -1 } : null;
    case "vline":
      return Math.abs(px - pts[0].x) <= tol && py >= vp.rect.t && py <= vp.rect.b ? { part: "body", idx: -1 } : null;
    case "channel": {
      const [a, b, c] = pts;
      const o = { x: c.x - a.x, y: c.y - a.y };
      if (distToSeg(px, py, a.x, a.y, b.x, b.y) <= tol) return { part: "body", idx: -1 };
      if (distToSeg(px, py, c.x, c.y, b.x + o.x, b.y + o.y) <= tol) return { part: "body", idx: -1 };
      return null;
    }
    case "rect": case "frvp": case "avp": {
      const x0 = Math.min(pts[0].x, pts[1]?.x ?? pts[0].x), x1 = Math.max(pts[0].x, pts[1]?.x ?? pts[0].x);
      const y0 = Math.min(pts[0].y, pts[1]?.y ?? pts[0].y), y1 = Math.max(pts[0].y, pts[1]?.y ?? pts[0].y);
      if (px >= x0 - 3 && px <= x1 + 3 && py >= y0 - 3 && py <= y1 + 3) return { part: "body", idx: -1 };
      return null;
    }
    case "measure": {
      if (distToSeg(px, py, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= tol) return { part: "body", idx: -1 };
      const x0 = vp.rect.l;
      if (Math.abs(px - x0) <= 8 && py >= Math.min(pts[0].y, pts[1].y) && py <= Math.max(pts[0].y, pts[1].y)) return { part: "body", idx: -1 };
      return null;
    }
    case "fib": {
      const [a, b] = pts;
      if (distToSeg(px, py, a.x, a.y, b.x, b.y) <= tol) return { part: "body", idx: -1 };
      const p0 = d.anchors[0].price, p1 = d.anchors[1].price;
      const levels = String(s.levels ?? "0,0.236,0.382,0.5,0.618,0.786,1").split(",").map(parseFloat).filter(v => !isNaN(v));
      for (const lv of levels) {
        const yy = vp.y(p1 - (p1 - p0) * lv);
        if (Math.abs(py - yy) <= tol && px >= a.x && px <= b.x) return { part: "body", idx: -1 };
      }
      return null;
    }
    case "text": case "pricelabel": {
      const w = 90, h = 24;
      return px >= pts[0].x - 4 && px <= pts[0].x + w && py >= pts[0].y - h - 4 && py <= pts[0].y + 6 ? { part: "body", idx: -1 } : null;
    }
    case "avwap": {
      const pts2 = avwapPts(d, bars).filter(p => p.t >= bars[0].t && p.t <= bars[bars.length - 1].t);
      for (let i = 1; i < pts2.length; i++) {
        const prev = pts2[i - 1], cur = pts2[i];
        const d0 = distToSeg(px, py, vp.x(tToIdx(bars, prev.t)), vp.y(prev.m), vp.x(tToIdx(bars, cur.t)), vp.y(cur.m));
        if (d0 <= tol + 2) return { part: "body", idx: -1 };
      }
      return null;
    }
    default: return null;
  }
}

/** screen-space handles for the selected drawing */
export function handlesOf(d: Drawing, bars: Bar[], vp: Viewport): { x: number; y: number }[] {
  return anchorPoints(d, bars, vp);
}

export function renderDrawing(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing, tfMins: number, symbol: SymbolDef) {
  if (d.hidden) return;
  switch (d.type) {
    case "trendline": drawLineShape(ctx, bars, vp, d, "segment", symbol); break;
    case "ray": drawLineShape(ctx, bars, vp, d, "ray", symbol); break;
    case "extended": drawLineShape(ctx, bars, vp, d, "extended", symbol); break;
    case "hline": drawLineShape(ctx, bars, vp, d, "hline", symbol); break;
    case "hray": drawLineShape(ctx, bars, vp, d, "hray", symbol); break;
    case "vline": drawLineShape(ctx, bars, vp, d, "vline", symbol); break;
    case "channel": drawChannel(ctx, bars, vp, d); break;
    case "rect": drawRect(ctx, bars, vp, d); break;
    case "fib": drawFib(ctx, bars, vp, d, symbol); break;
    case "text": drawTextObj(ctx, bars, vp, d); break;
    case "pricelabel": drawPriceLabel(ctx, bars, vp, d, symbol); break;
    case "measure": drawMeasure(ctx, bars, vp, d, symbol); break;
    case "avwap": drawAVWAP(ctx, bars, vp, d); break;
    case "frvp": case "avp": drawProfile(ctx, bars, vp, d, tfMins, symbol); break;
  }
}

export function labelOf(d: Drawing): string {
  const def = defOf(d);
  const n = d.settings.text ? ` "${d.settings.text}"` : "";
  return def.label + n;
}
