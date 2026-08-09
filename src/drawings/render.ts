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
    case "trendangle": case "regression": case "flattop": case "crossline":
    case "pitchfork": case "schiff": case "gannfan": case "gannbox":
    case "ellipse": case "circle": case "triangle": case "polyline":
    case "brush": case "hlighter": case "arrow": case "elliott": {
      const tol2 = Math.max(8, ((s.width as number) ?? 2) + 6);
      for (const seg of pathSegments(d, bars, vp)) {
        if (distToSeg(px, py, seg.ax, seg.ay, seg.bx, seg.by) <= tol2) return { part: "body", idx: -1 };
      }
      return null;
    }
    case "note": case "callout": {
      const pts2 = anchorPoints(d, bars, vp);
      const [a] = pts2;
      const w = 160, h = 60;
      return px >= a.x - 6 && px <= a.x + w && py >= a.y - h - 10 && py <= a.y + 8 ? { part: "body", idx: -1 } : null;
    }
    default: return null;
  }
}

/** screen-space handles for the selected drawing (dense paths get capped) */
export function handlesOf(d: Drawing, bars: Bar[], vp: Viewport): { x: number; y: number }[] {
  const pts = anchorPoints(d, bars, vp);
  if ((d.type === "brush" || d.type === "hlighter") && pts.length > 60) return [pts[0], pts[pts.length - 1]];
  if (d.type === "polyline" && pts.length > 30) return [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]];
  return pts;
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
    case "trendangle": drawTrendAngle(ctx, bars, vp, d); break;
    case "regression": drawRegression(ctx, bars, vp, d); break;
    case "flattop": drawFlatTop(ctx, bars, vp, d); break;
    case "crossline": drawCrossline(ctx, bars, vp, d); break;
    case "pitchfork": drawPitchfork(ctx, bars, vp, d, false); break;
    case "schiff": drawPitchfork(ctx, bars, vp, d, true); break;
    case "gannfan": drawGannFan(ctx, bars, vp, d); break;
    case "gannbox": drawGannBox(ctx, bars, vp, d); break;
    case "ellipse": drawEllipseShape(ctx, bars, vp, d, false); break;
    case "circle": drawEllipseShape(ctx, bars, vp, d, true); break;
    case "triangle": drawTriangleShape(ctx, bars, vp, d); break;
    case "polyline": drawPolylineObj(ctx, bars, vp, d); break;
    case "brush": case "hlighter": drawSketch(ctx, bars, vp, d); break;
    case "arrow": drawArrow(ctx, bars, vp, d); break;
    case "note": drawNote(ctx, bars, vp, d); break;
    case "callout": drawCallout(ctx, bars, vp, d); break;
    case "elliott": drawElliott(ctx, bars, vp, d); break;
  }
}

export function labelOf(d: Drawing): string {
  const def = defOf(d);
  const n = d.settings.text ? ` "${d.settings.text}"` : "";
  return def.label + n;
}


// ================= P2 tools =================
type Pts = { x: number; y: number }[];
function smoothPath(ctx: CanvasRenderingContext2D, pts: Pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) { ctx.lineTo(pts[0].x + 0.01, pts[0].y); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
function dashed(ctx: CanvasRenderingContext2D, d: Drawing, on: boolean) {
  ctx.setLineDash(on ? [6, 5] : []);
}
function lineAlpha(color: string, alpha: number) {
  // rgba conversion from hex
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function drawTrendAngle(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a, b] = anchorPoints(d, bars, vp);
  const color = (d.settings.color as string) ?? C.blue;
  // baseline (horizontal reference)
  ctx.strokeStyle = lineAlpha(color, 0.35); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, a.y); ctx.stroke();
  ctx.setLineDash([]);
  // angle line
  setLine(ctx, d);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  if (d.settings.showAngle !== false) {
    const deg = Math.abs(Math.atan2(a.y - b.y, b.x - a.x) * 180 / Math.PI);
    const lx = a.x + (b.x - a.x) * 0.62, ly = a.y + (b.y - a.y) * 0.62 - 9;
    ctx.font = "600 10px 'IBM Plex Mono', monospace";
    const txt = deg.toFixed(1) + "°";
    const w = ctx.measureText(txt).width + 8;
    ctx.fillStyle = "#12171f";
    ctx.fillRect(lx, ly - 7, w, 15);
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.strokeRect(lx, ly - 7, w, 15);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(txt, lx + 4, ly + 4);
  }
}

export function drawRegression(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const i0 = Math.max(0, Math.round(tToIdx(bars, d.anchors[0].t)));
  const i1 = Math.min(bars.length - 1, Math.round(tToIdx(bars, d.anchors[1].t)));
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  if (hi - lo < 1) return;
  let sx = 0, sy = 0;
  for (let i = lo; i <= hi; i++) { sx += i; sy += bars[i].c; }
  const n = hi - lo + 1, xm = sx / n, ym = sy / n;
  let num = 0, den = 0;
  for (let i = lo; i <= hi; i++) { num += (i - xm) * (bars[i].c - ym); den += (i - xm) * (i - xm); }
  const slope = den ? num / den : 0, intercept = ym - slope * xm;
  const yAt = (i: number) => vp.y(intercept + slope * i);
  const color = (d.settings.color as string) ?? C.blue;
  if (d.settings.extend) {
    ctx.strokeStyle = lineAlpha(color, 0.7); ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(vp.rect.l, yAt(vp.barStart));
    ctx.lineTo(vp.rect.r, yAt(vp.barStart + vp.barCount));
    ctx.stroke(); ctx.setLineDash([]);
  }
  setLine(ctx, d);
  ctx.beginPath();
  ctx.moveTo(vp.x(Math.max(lo, vp.barStart)), yAt(Math.max(lo, vp.barStart)));
  ctx.lineTo(vp.x(Math.min(hi, vp.barStart + vp.barCount)), yAt(Math.min(hi, vp.barStart + vp.barCount)));
  ctx.stroke();
  const [a, b] = anchorPoints(d, bars, vp);
  for (const p of [a, b]) {
    ctx.fillStyle = "#12171f"; ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill(); ctx.stroke();
  }
}

export function drawFlatTop(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const i0 = Math.max(0, Math.round(tToIdx(bars, d.anchors[0].t)));
  const i1 = Math.min(bars.length - 1, Math.round(tToIdx(bars, d.anchors[1].t)));
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  let level = -Infinity;
  if ((d.settings.mode as string) === "bottom") {
    level = Infinity;
    for (let i = lo; i <= hi; i++) level = Math.min(level, bars[i].l);
  } else {
    for (let i = lo; i <= hi; i++) level = Math.max(level, bars[i].h);
  }
  const y = vp.y(level);
  const endX = d.settings.extend ? vp.rect.r : vp.x(hi);
  setLine(ctx, d);
  ctx.beginPath(); ctx.moveTo(vp.x(lo), y); ctx.lineTo(endX, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = (d.settings.color as string) ?? C.cyan;
  ctx.font = "600 9.5px 'IBM Plex Mono', monospace";
  const txt = (d.settings.mode as string) === "bottom" ? "flat bottom" : "flat top";
  ctx.fillText(txt, vp.x(lo) + 4, y - 6);
}

export function drawCrossline(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a, b] = anchorPoints(d, bars, vp);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const span = vp.rect.w + vp.rect.h + 300;
  setLine(ctx, d);
  ctx.beginPath();
  ctx.moveTo(a.x - dx / len * span, a.y - dy / len * span);
  ctx.lineTo(b.x + dx / len * span, b.y + dy / len * span);
  ctx.stroke();
  ctx.setLineDash([]);
  // perpendicular through first anchor
  ctx.strokeStyle = lineAlpha((d.settings.color as string) ?? C.blue, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x + dy / len * span, a.y - dx / len * span);
  ctx.lineTo(a.x - dy / len * span, a.y + dx / len * span);
  ctx.stroke();
}

function forkLine(ctx: CanvasRenderingContext2D, from: Pts[0], through: Pts[0], rect: Viewport["rect"], alpha: number) {
  const dx = through.x - from.x, dy = through.y - from.y;
  const endY = through.y + dy / (through.x - from.x || 1e-9) * (rect.r - through.x);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#8b9bb4";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(rect.r, endY); ctx.stroke();
  ctx.globalAlpha = 1;
}
export function drawPitchfork(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing, schiff: boolean) {
  const pts = anchorPoints(d, bars, vp);
  if (pts.length < 3) return;
  const [p0, p1, p2] = pts;
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const a = schiff ? p1 : p0;
  const t = schiff ? { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 } : mid;
  forkLine(ctx, a, t, vp.rect, 0.95);                       // median
  forkLine(ctx, p1, { x: t.x + (p1.x - a.x), y: t.y + (p1.y - a.y) }, vp.rect, 0.7);
  forkLine(ctx, p2, { x: t.x + (p2.x - a.x), y: t.y + (p2.y - a.y) }, vp.rect, 0.7);
}

export function drawGannFan(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a] = anchorPoints(d, bars, vp);
  const cap = d.settings.capture as { bars: number; span: number } | undefined;
  const slopePerBar = cap && cap.bars > 0 ? cap.span / cap.bars : (vp.priceHi - vp.priceLo) / vp.barCount;
  const dxBars = vp.idxFromX(vp.rect.r) - tToIdx(bars, d.anchors[0].t);
  const color = (d.settings.color as string) ?? C.blue;
  const fracs = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  for (const f of fracs) {
    const dyP = f * slopePerBar * dxBars;
    ctx.strokeStyle = lineAlpha(color, f === 0.5 ? 0.95 : 0.45);
    ctx.lineWidth = f === 0.5 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(vp.rect.r, vp.y(vp.priceFromY(a.y) + dyP));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, 7); ctx.fill();
}

export function drawGannBox(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a] = anchorPoints(d, bars, vp);
  const cap = d.settings.capture as { bars: number; span: number } | undefined;
  const sideBars = 8;
  const sidePrice = cap && cap.bars > 0 ? sideBars * cap.span / cap.bars : (vp.priceHi - vp.priceLo) * 0.25;
  const i0 = Math.round(tToIdx(bars, d.anchors[0].t));
  const x0 = vp.x(i0), x1 = vp.x(Math.min(bars.length - 1, i0 + sideBars));
  const y0 = vp.y(d.anchors[0].price + sidePrice), y1 = vp.y(d.anchors[0].price);
  const color = (d.settings.color as string) ?? C.blue;
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  // grid 8x8
  for (let k = 0; k <= 8; k++) {
    const gx = x0 + (x1 - x0) * k / 8, gy = y0 + (y1 - y0) * k / 8;
    ctx.globalAlpha = k === 0 || k === 8 ? 0.9 : 0.3;
    ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // diagonals
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y0); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, 7); ctx.fill();
}

function dataBBox(d: Drawing, bars: Bar[], vp: Viewport): { x: number; y: number; w: number; h: number } {
  const pts = anchorPoints(d, bars, vp);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
export function drawEllipseShape(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing, center: boolean) {
  const pts = anchorPoints(d, bars, vp);
  const [p0, p1] = pts;
  const cx = center ? p0.x : (p0.x + p1.x) / 2, cy = center ? p0.y : (p0.y + p1.y) / 2;
  const rx = center ? Math.abs(p1.x - p0.x) : Math.abs(p1.x - p0.x) / 2;
  const ry = center ? Math.abs(p1.y - p0.y) : Math.abs(p1.y - p0.y) / 2;
  const alpha = (d.settings.fill as number) ?? 0;
  if (alpha > 0) {
    ctx.fillStyle = (d.settings.color as string) ?? "#6999b8";
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  setLine(ctx, d);
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
}
export function drawTriangleShape(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const pts = anchorPoints(d, bars, vp);
  if (pts.length < 3) return;
  const alpha = (d.settings.fill as number) ?? 0;
  if (alpha > 0) {
    ctx.fillStyle = (d.settings.color as string) ?? "#6999b8";
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  setLine(ctx, d);
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath(); ctx.stroke();
  ctx.setLineDash([]);
}
export function drawPolylineObj(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const pts = anchorPoints(d, bars, vp);
  if (pts.length < 2) return;
  setLine(ctx, d);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
}
export function drawSketch(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const pts = anchorPoints(d, bars, vp);
  if (pts.length < 2) return;
  const s = d.settings;
  ctx.strokeStyle = (s.color as string) ?? C.blue;
  ctx.globalAlpha = (s.alpha as number) ?? 1;
  ctx.lineWidth = (s.width as number) ?? 3;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  smoothPath(ctx, pts);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
export function drawArrow(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a, b] = anchorPoints(d, bars, vp);
  setLine(ctx, d);
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const hl = 10 + ((d.settings.width as number) ?? 2) * 2;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - hl * Math.cos(ang - 0.42), b.y - hl * Math.sin(ang - 0.42));
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - hl * Math.cos(ang + 0.42), b.y - hl * Math.sin(ang + 0.42));
  ctx.stroke();
  ctx.setLineDash([]);
}
function textBlock(ctx: CanvasRenderingContext2D, d: Drawing): { lines: string[]; w: number; h: number } {
  const size = (d.settings.size as number) ?? 12;
  ctx.font = `${size}px 'IBM Plex Sans', sans-serif`;
  const lines = String(d.settings.text ?? "text").split("\n");
  const w = Math.max(...lines.map(l => ctx.measureText(l).width));
  return { lines, w, h: lines.length * (size + 4) + 10 };
}
export function drawNote(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a] = anchorPoints(d, bars, vp);
  const size = (d.settings.size as number) ?? 12;
  const { lines, w, h } = textBlock(ctx, d);
  const bg = (d.settings.bg as string) ?? "#ffcf6e";
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(a.x, a.y - h, w + 14, h, 4); ctx.fill();
  // folded corner
  ctx.fillStyle = lineAlpha(bg, 0.72);
  ctx.beginPath(); ctx.moveTo(a.x + w - 2, a.y - h); ctx.lineTo(a.x + w + 14, a.y - h); ctx.lineTo(a.x + w + 14, a.y - h + 12);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(26,18,4,0.35)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(a.x + w - 2, a.y - h); ctx.lineTo(a.x + w + 14, a.y - h + 12); ctx.stroke();
  ctx.fillStyle = (d.settings.color as string) ?? "#1a1204";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, a.x + 7, a.y - h + 5 + i * (size + 4)));
  ctx.textBaseline = "alphabetic";
}
export function drawCallout(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const [a] = anchorPoints(d, bars, vp);
  const size = (d.settings.size as number) ?? 12;
  const { lines, w, h } = textBlock(ctx, d);
  const bw = w + 18, bh = h + 8;
  let y = a.y - bh - 14;
  let tailUp = true;
  if (y < vp.rect.t + 4) { y = a.y + 14; tailUp = false; }
  const bx = a.x - 8;
  const bg = (d.settings.bg as string) ?? "#1c2431";
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(bx, y, bw, bh, 6); ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (tailUp) {
    ctx.moveTo(bx + 8, y + bh); ctx.lineTo(bx + 26, y + bh); ctx.lineTo(a.x, a.y);
  } else {
    ctx.moveTo(bx + 8, y); ctx.lineTo(bx + 26, y); ctx.lineTo(a.x, a.y);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(42,53,71,0.9)"; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, y + 0.5, bw - 1, bh - 1);
  ctx.fillStyle = (d.settings.color as string) ?? C.ink;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, bx + 9, y + 7 + i * (size + 4)));
  ctx.textBaseline = "alphabetic";
}
export function drawElliott(ctx: CanvasRenderingContext2D, bars: Bar[], vp: Viewport, d: Drawing) {
  const pts = anchorPoints(d, bars, vp);
  if (pts.length < 2) return;
  setLine(ctx, d);
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke(); ctx.setLineDash([]);
  if (d.settings.showLabels !== false) {
    ctx.font = "600 10px 'IBM Plex Mono', monospace";
    pts.forEach((p, i) => {
      const lbl = String(i + 1);
      ctx.fillStyle = C.amber;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill();
      ctx.fillStyle = "#0b0e14";
      ctx.textAlign = "center";
      ctx.fillText(lbl, p.x, p.y + 3.5);
    });
  }
}

// ---------- unified hit-testing segments for P2 tools ----------
export interface Seg { ax: number; ay: number; bx: number; by: number }
function segDist(px: number, py: number, s: Seg): number {
  return distToSeg(px, py, s.ax, s.ay, s.bx, s.by);
}
export function pathSegments(d: Drawing, bars: Bar[], vp: Viewport): Seg[] {
  const pts = anchorPoints(d, bars, vp);
  const R = vp.rect;
  const segs: Seg[] = [];
  const p2s = (list: Pts) => { for (let i = 1; i < list.length; i++) segs.push({ ax: list[i - 1].x, ay: list[i - 1].y, bx: list[i].x, by: list[i].y }) };
  switch (d.type) {
    case "trendangle": {
      const [a, b] = pts;
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: a.y }, { ax: a.x, ay: a.y, bx: b.x, by: b.y });
      break;
    }
    case "regression": {
      const i0 = Math.max(0, Math.round(tToIdx(bars, d.anchors[0].t)));
      const i1 = Math.min(bars.length - 1, Math.round(tToIdx(bars, d.anchors[1].t)));
      const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
      let sx = 0, sy = 0;
      for (let i = lo; i <= hi; i++) { sx += i; sy += bars[i].c }
      const n = hi - lo + 1, xm = sx / n, ym = sy / n;
      let num = 0, den = 0;
      for (let i = lo; i <= hi; i++) { num += (i - xm) * (bars[i].c - ym); den += (i - xm) * (i - xm) }
      const slope = den ? num / den : 0, intercept = ym - slope * xm;
      const yAt = (i: number) => vp.y(intercept + slope * i);
      if (d.settings.extend) segs.push({ ax: R.l, ay: yAt(vp.barStart), bx: R.r, by: yAt(vp.barStart + vp.barCount) });
      else segs.push({ ax: vp.x(lo), ay: yAt(lo), bx: vp.x(hi), by: yAt(hi) });
      break;
    }
    case "flattop": {
      const i0 = Math.max(0, Math.round(tToIdx(bars, d.anchors[0].t)));
      const i1 = Math.min(bars.length - 1, Math.round(tToIdx(bars, d.anchors[1].t)));
      const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
      let level = (d.settings.mode as string) === "bottom" ? Math.min(...bars.slice(lo, hi + 1).map(b => b.l)) : Math.max(...bars.slice(lo, hi + 1).map(b => b.h));
      segs.push({ ax: vp.x(lo), ay: vp.y(level), bx: d.settings.extend ? R.r : vp.x(hi), by: vp.y(level) });
      break;
    }
    case "crossline": {
      const [a, b] = pts;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const span = R.w + R.h;
      segs.push({ ax: a.x - dx / len * span, ay: a.y - dy / len * span, bx: b.x + dx / len * span, by: b.y + dy / len * span });
      segs.push({ ax: a.x + dy / len * span, ay: a.y - dx / len * span, bx: a.x - dy / len * span, by: a.y + dx / len * span });
      break;
    }
    case "pitchfork": case "schiff": {
      const [p0, p1, p2] = pts;
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const schiff = d.type === "schiff";
      const a = schiff ? p1 : p0;
      const t = schiff ? { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 } : mid;
      const far = (fr: Pts[0], th: Pts[0]) => ({ x: R.r, y: fr.y + (th.y - fr.y) / (th.x - fr.x || 1e-9) * (R.r - fr.x) });
      segs.push({ ax: a.x, ay: a.y, bx: far(a, t).x, by: far(a, t).y });
      segs.push({ ax: p1.x, ay: p1.y, bx: far(p1, { x: t.x + (p1.x - a.x), y: t.y + (p1.y - a.y) }).x, by: far(p1, { x: t.x + (p1.x - a.x), y: t.y + (p1.y - a.y) }).y });
      segs.push({ ax: p2.x, ay: p2.y, bx: far(p2, { x: t.x + (p2.x - a.x), y: t.y + (p2.y - a.y) }).x, by: far(p2, { x: t.x + (p2.x - a.x), y: t.y + (p2.y - a.y) }).y });
      break;
    }
    case "gannfan": {
      const [a] = pts;
      const cap = d.settings.capture as { bars: number; span: number } | undefined;
      const slopePerBar = cap && cap.bars > 0 ? cap.span / cap.bars : (vp.priceHi - vp.priceLo) / vp.barCount;
      const dxBars = vp.idxFromX(R.r) - tToIdx(bars, d.anchors[0].t);
      for (const f of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
        segs.push({ ax: a.x, ay: a.y, bx: R.r, by: vp.y(vp.priceFromY(a.y) + f * slopePerBar * dxBars) });
      }
      break;
    }
    case "gannbox": {
      const [a] = pts;
      const cap = d.settings.capture as { bars: number; span: number } | undefined;
      const sideBars = 8;
      const sidePrice = cap && cap.bars > 0 ? sideBars * cap.span / cap.bars : (vp.priceHi - vp.priceLo) * 0.25;
      const i0 = Math.round(tToIdx(bars, d.anchors[0].t));
      const x0 = vp.x(i0), x1 = vp.x(Math.min(bars.length - 1, i0 + sideBars));
      const y0 = vp.y(d.anchors[0].price + sidePrice), y1 = vp.y(d.anchors[0].price);
      segs.push({ ax: x0, ay: y0, bx: x1, by: y0 }, { ax: x1, ay: y0, bx: x1, by: y1 }, { ax: x1, ay: y1, bx: x0, by: y1 }, { ax: x0, ay: y1, bx: x0, by: y0 });
      segs.push({ ax: x0, ay: y0, bx: x1, by: y1 }, { ax: x0, ay: y1, bx: x1, by: y0 });
      break;
    }
    case "ellipse": case "circle": {
      const [p0, p1] = pts;
      const cx = d.type === "circle" ? p0.x : (p0.x + p1.x) / 2, cy = d.type === "circle" ? p0.y : (p0.y + p1.y) / 2;
      const rx = d.type === "circle" ? Math.abs(p1.x - p0.x) : Math.abs(p1.x - p0.x) / 2;
      const ry = d.type === "circle" ? Math.abs(p1.y - p0.y) : Math.abs(p1.y - p0.y) / 2;
      const N = 48;
      for (let i = 0; i < N; i++) {
        const t0 = i / N * Math.PI * 2, t1 = (i + 1) / N * Math.PI * 2;
        segs.push({ ax: cx + Math.max(1, rx) * Math.cos(t0), ay: cy + Math.max(1, ry) * Math.sin(t0), bx: cx + Math.max(1, rx) * Math.cos(t1), by: cy + Math.max(1, ry) * Math.sin(t1) });
      }
      break;
    }
    case "triangle": p2s(pts); break;
    case "polyline": case "brush": case "hlighter": p2s(pts); break;
    case "arrow": if (pts.length > 1) segs.push({ ax: pts[0].x, ay: pts[0].y, bx: pts[1].x, by: pts[1].y }); break;
    case "elliott": p2s(pts); break;
  }
  return segs;
}
