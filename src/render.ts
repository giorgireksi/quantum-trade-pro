// ---------- chart renderer: grid, axes, series, crosshair ----------
import { Bar, ChartType, TF, SymbolDef } from "./types";
import { Viewport } from "./viewport";
import { C } from "./palette";
import { fmtVol, clamp } from "./util";

const MONO = "IBM Plex Mono", SANS = "IBM Plex Sans";

export function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  const f = m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10;
  return f * pow;
}
export function niceBarStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  const f = m < 1.5 ? 1 : m < 3 ? 2 : m < 5 ? 5 : 10;
  return f * pow;
}
function fmtTime(t: number, tfMins: number): string {
  const d = new Date(t);
  if (tfMins < 1440) return d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (tfMins === 1440) return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "2-digit" });
}

export interface RenderState {
  bars: Bar[]; tf: TF; symbol: SymbolDef; chartType: ChartType;
  hover: { px: number; py: number; idx: number } | null;
  priceManual: boolean;
}

export function drawChart(ctx: CanvasRenderingContext2D, vp: Viewport, st: RenderState, drawOverlays: (ctx: CanvasRenderingContext2D) => void) {
  const { bars, tf, symbol } = st;
  const { rect } = vp;
  ctx.clearRect(0, 0, rect.r + 70, rect.b + 26);
  if (!bars.length) return;
  const priceLo = vp.priceLo, priceHi = vp.priceHi;

  // ---- horizontal grid + price labels ----
  ctx.font = `10px ${MONO}`;
  const step = niceStep((priceHi - priceLo) / (rect.h / 64));
  ctx.lineWidth = 1;
  for (let p = Math.ceil(priceLo / step) * step; p <= priceHi + step * 0.5; p += step) {
    const y = Math.round(vp.y(p)) + 0.5;
    if (y < rect.t - 2 || y > rect.b + 2) continue;
    ctx.strokeStyle = C.grid;
    ctx.beginPath(); ctx.moveTo(rect.l, y); ctx.lineTo(rect.r, y); ctx.stroke();
    ctx.fillStyle = C.axisText;
    ctx.textAlign = "left";
    ctx.fillText(p.toFixed(Math.max(0, -Math.floor(Math.log10(step)))), rect.r + 7, y + 3);
  }

  // ---- vertical grid + time labels ----
  const barStep = niceBarStep(rect.w / vp.barCount / 100 * 100); // ~100px spacing
  const n = bars.length;
  const first = Math.floor(vp.barStart), last = Math.ceil(vp.barStart + vp.barCount);
  let t0 = Math.max(0, Math.floor((first + barStep - 1) / barStep) * barStep);
  for (let i = t0; i <= last && i < n; i += barStep) {
    const x = Math.round(vp.x(i)) + 0.5;
    if (x < rect.l || x > rect.r) continue;
    ctx.strokeStyle = C.grid;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(x, rect.t); ctx.lineTo(x, rect.b); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.axisText;
    ctx.textAlign = "center";
    ctx.fillText(fmtTime(bars[i].t, tf.mins), x, rect.b + 15);
  }

  // ---- series ----
  drawSeries(ctx, vp, st);

  // ---- drawings + overlays ----
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.l, rect.t, rect.w, rect.h); ctx.clip();
  drawOverlays(ctx);
  ctx.restore();

  // ---- crosshair ----
  if (st.hover) {
    const { px, py, idx } = st.hover;
    const i = clamp(Math.round(idx), 0, n - 1);
    const b = bars[i];
    ctx.strokeStyle = C.crosshair;
    ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(px, rect.t); ctx.lineTo(px, rect.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rect.l, py); ctx.lineTo(rect.r, py); ctx.stroke();
    ctx.setLineDash([]);
    // price tag on the right axis
    const dec = symbol.decimals;
    const ptxt = b.c.toFixed(dec);
    ctx.font = `600 10px ${MONO}`;
    const pw = ctx.measureText(ptxt).width + 10;
    ctx.fillStyle = b.c >= b.o ? C.up : C.down;
    ctx.fillRect(rect.r, py - 8.5, pw, 17);
    ctx.fillStyle = "#0b0e14";
    ctx.textAlign = "left";
    ctx.fillText(ptxt, rect.r + 5, py + 3.5);
    // time tag
    const ttxt = fmtTime(b.t, tf.mins);
    ctx.fillStyle = C.axisTextBright;
    ctx.textAlign = "center";
    ctx.fillText(ttxt, px, rect.b + 24);
  }

  // axis frame
  ctx.strokeStyle = C.gridStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.r + 0.5, rect.t); ctx.lineTo(rect.r + 0.5, rect.b);
  ctx.stroke();
}

function drawSeries(ctx: CanvasRenderingContext2D, vp: Viewport, st: RenderState) {
  const { bars, chartType } = st;
  const { rect } = vp;
  const n = bars.length;
  const first = Math.max(0, Math.floor(vp.barStart) - 1), last = Math.min(n - 1, Math.ceil(vp.barStart + vp.barCount) + 1);
  const bw = Math.max(1.5, rect.w / vp.barCount);
  ctx.lineWidth = 1;
  for (let i = first; i <= last; i++) {
    const b = bars[i];
    const x = vp.x(i);
    const up = b.c >= b.o;
    ctx.strokeStyle = ctx.fillStyle = up ? C.up : C.down;
    if (chartType === "candles") {
      ctx.beginPath(); ctx.moveTo(x, vp.y(b.h)); ctx.lineTo(x, vp.y(b.l)); ctx.stroke();
      const y0 = vp.y(Math.max(b.o, b.c)), h = Math.max(1, Math.abs(vp.y(b.o) - vp.y(b.c)));
      ctx.fillRect(x - bw * 0.36, y0, Math.max(1.5, bw * 0.72), h);
    } else if (chartType === "bars") {
      ctx.beginPath();
      ctx.moveTo(x - bw * 0.3, vp.y(b.o)); ctx.lineTo(x, vp.y(b.o));
      ctx.moveTo(x, vp.y(b.h)); ctx.lineTo(x, vp.y(b.l));
      ctx.moveTo(x, vp.y(b.c)); ctx.lineTo(x + bw * 0.3, vp.y(b.c));
      ctx.stroke();
    }
  }
  if (chartType === "line" || chartType === "area") {
    ctx.beginPath();
    for (let i = first; i <= last; i++) {
      const x = vp.x(i), y = vp.y(bars[i].c);
      if (i === first) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (chartType === "area") {
      const grad = ctx.createLinearGradient(0, vp.y(vp.priceHi), 0, vp.y(vp.priceLo));
      grad.addColorStop(0, "rgba(76,141,255,0.26)");
      grad.addColorStop(1, "rgba(76,141,255,0.02)");
      ctx.lineTo(vp.x(last), rect.b); ctx.lineTo(vp.x(first), rect.b);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
    }
    ctx.strokeStyle = C.blue; ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}
