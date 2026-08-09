// ---------- ChartLab: application shell, interactions, panels ----------
import { store } from "./store";
import { barsFor } from "./feed";
import { TFS, SYMBOLS, Bar, Anchor, Drawing, ChartType, SymbolDef, TF } from "./types";
import { Viewport } from "./viewport";
import { drawChart } from "./render";
import { renderDrawing, hitTest, handlesOf, labelOf } from "./drawings/render";
import { TOOLS, TOOLS_BY_TYPE, defOf, cloneSettings } from "./drawings/model";
import { tToIdx, nearestBar, clamp, uid, fmtPrice, fmtVol } from "./util";
import { C } from "./palette";

const $ = (id: string) => document.getElementById(id)!;
const chartEl = $("chart"), cv = $("cv") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
const vp = new Viewport();

let bars: Bar[] = [];
let hover: { px: number; py: number; idx: number } | null = null;
let priceManual = false;
let activeTool = "cross";
let keepDrawing = false;
let magnet: "off" | "weak" | "strong" = "weak";
let flow: { type: string; anchors: Anchor[]; ghost: Anchor | null } | null = null;
let textPending: { px: number; py: number; t: number; price: number } | null = null;
let drag: {
  kind: "pan"; sx: number; sy: number; barStart: number; priceLo: number; priceHi: number;
} | {
  kind: "draw"; id: string; part: "body" | "anchor"; idx: number;
  grabIdx: number; grabPrice: number; origAnchors: Anchor[];
} | null = null;

// ---------------- data / viewport ----------------
function loadBars() {
  bars = barsFor(store.state.symbol.name, store.state.tf);
}
function refitPrice() {
  const n = bars.length;
  if (!n) return;
  const a = clamp(Math.floor(vp.barStart), 0, n - 1);
  const b = clamp(Math.ceil(vp.barStart + vp.barCount), 0, n - 1);
  let lo = Infinity, hi = -Infinity;
  for (let i = a; i <= b; i++) {
    if (bars[i].l < lo) lo = bars[i].l;
    if (bars[i].h > hi) hi = bars[i].h;
  }
  vp.setPrice(lo, hi);
}
function fitChart() {
  const n = bars.length;
  if (!n) return;
  priceManual = false;
  vp.barCount = Math.min(160, n);
  vp.barStart = n - vp.barCount;
  refitPrice();
  render();
}
function setSize() {
  const dpr = window.devicePixelRatio || 1;
  const w = chartEl.clientWidth, h = chartEl.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vp.rect = { l: 0, t: 0, r: w - 64, b: h - 26, w: w - 64, h: h - 26 };
  render();
}

// ---------------- rendering ----------------
let rafPending = false;
function render() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!bars.length) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
    drawChart(ctx, vp, {
      bars, tf: store.state.tf, symbol: store.state.symbol,
      chartType: store.state.chartType, hover, priceManual,
    }, g => {
      for (const d of store.drawings) renderDrawing(g, bars, vp, d, store.state.tf.mins, store.state.symbol);
      // flow ghost preview
      if (flow) {
        const def = TOOLS_BY_TYPE.get(flow.type)!;
        const nClicks = def.clicks ?? 1;
        if (nClicks > 1 && flow.anchors.length < nClicks && flow.ghost) {
          const tmp: Drawing = { id: "ghost", type: flow.type, anchors: [...flow.anchors, flow.ghost], settings: cloneSettings(def.defaults), locked: false, hidden: false, createdAt: 0 };
          g.globalAlpha = 0.55;
          renderDrawing(g, bars, vp, tmp, store.state.tf.mins, store.state.symbol);
          g.globalAlpha = 1;
        } else if (flow.type === "text" || flow.type === "pricelabel") {
          const a = flow.anchors[0];
          g.fillStyle = C.amber;
          g.beginPath(); g.arc(vp.x(tToIdx(bars, a.t)), vp.y(a.price), 3, 0, 7); g.fill();
        }
      }
      // selection handles
      const sel = store.selection ? store.drawings.find(d => d.id === store.selection) : null;
      if (sel && !sel.hidden) {
        for (const h of handlesOf(sel, bars, vp)) {
          g.fillStyle = "#12171f"; g.strokeStyle = C.handle; g.lineWidth = 1.4;
          g.beginPath(); g.arc(h.x, h.y, 4, 0, 7); g.fill(); g.stroke();
        }
      }
    });
    updateStatus();
  });
}

// ---------------- status bar + chip ----------------
let lastStatus = "";
let lastChip = "";
function updateStatus() {
  const n = bars.length;
  if (!n) return;
  const idx = hover ? clamp(Math.round(hover.idx), 0, n - 1) : n - 1;
  const b = bars[idx];
  const chg = idx > 0 ? ((b.c - bars[idx - 1].c) / bars[idx - 1].c) * 100 : 0;
  const s = `${b.o}|${b.h}|${b.l}|${b.c}|${chg}|${b.v}`;
  if (s !== lastStatus) {
    lastStatus = s;
    $("stO").textContent = fmtPrice(b.o, store.state.symbol.decimals);
    $("stH").textContent = fmtPrice(b.h, store.state.symbol.decimals);
    $("stL").textContent = fmtPrice(b.l, store.state.symbol.decimals);
    $("stC").textContent = fmtPrice(b.c, store.state.symbol.decimals);
    const el = $("stChg");
    el.textContent = `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`;
    el.className = "val " + (chg >= 0 ? "up" : "down");
    $("stBars").textContent = String(n);
  }
  $("stDrawings").textContent = String(store.drawings.length);
  const chip = $("chip");
  if (hover && !flow) {
    const html = `<b>${store.state.symbol.name}</b>&nbsp;·&nbsp;${store.state.tf.id}&nbsp;&nbsp;` +
      `<span class="o">O <b>${fmtPrice(b.o, store.state.symbol.decimals)}</b></span>` +
      `<span class="h">H <b>${fmtPrice(b.h, store.state.symbol.decimals)}</b></span>` +
      `<span class="l">L <b>${fmtPrice(b.l, store.state.symbol.decimals)}</b></span>` +
      `<span class="c">C <b>${fmtPrice(b.c, store.state.symbol.decimals)}</b></span>` +
      `<span class="v">V <b>${fmtVol(b.v)}</b></span>`;
    if (html !== lastChip) { chip.innerHTML = html; lastChip = html; }
    chip.hidden = false;
  } else {
    chip.hidden = true; lastChip = "";
  }
}

// ---------------- magnet ----------------
function magnetize(px: number, py: number): Anchor {
  const idx = clamp(Math.round(vp.idxFromX(px)), 0, bars.length - 1);
  const b = bars[idx];
  let price = vp.priceFromY(py);
  if (magnet === "strong") {
    const best = [b.o, b.h, b.l, b.c].reduce((m, v) => Math.abs(v - price) < Math.abs(m - price) ? v : m, b.o);
    price = best;
  }
  return { t: b.t, price };
}

// ---------------- tool flow ----------------
function addDrawing(type: string, anchors: Anchor[], extra?: Partial<Drawing>) {
  const def = TOOLS_BY_TYPE.get(type)!;
  const d: Drawing = { id: uid(), type, anchors, settings: cloneSettings(def.defaults), locked: false, hidden: false, createdAt: Date.now(), ...extra };
  store.addDraw(d);
  if (!keepDrawing) setTool("cross");
}
function setTool(t: string) {
  activeTool = t;
  flow = null;
  closeFlyouts();
  renderRail();
  renderModeTip();
  chartEl.style.cursor = t === "cross" ? "" : "crosshair";
}
function renderModeTip() {
  const tip = $("modetip");
  if (activeTool === "cross" || activeTool === "eraser") { tip.hidden = true; return; }
  const def = TOOLS_BY_TYPE.get(activeTool)!;
  const nClicks = def.clicks ?? 1;
  const clicksLeft = nClicks > 1 ? nClicks - (flow?.anchors.length ?? 0) : 1;
  const how = nClicks > 1
    ? `click ${clicksLeft} more point${clicksLeft > 1 ? "s" : ""}`
    : "click to place";
  tip.innerHTML = `<b>${def.label}</b> — ${how} · <span>esc cancel</span>`;
  tip.hidden = false;
}

// ---------------- pointer handling ----------------
function pos(e: PointerEvent | MouseEvent) {
  const r = cv.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}
function inRect(px: number, py: number) {
  return px >= vp.rect.l && px <= vp.rect.r && py >= vp.rect.t && py <= vp.rect.b;
}
function topHit(px: number, py: number): { d: Drawing; hit: { part: string; idx: number } } | null {
  const list = [...store.drawings].reverse();
  for (const d of list) {
    if (d.hidden) continue;
    const h = hitTest(d, bars, vp, px, py);
    if (h && (h.part !== "anchor" || !store.selection || store.selection !== d.id)) {
      // anchors only count when the drawing is already selected
      if (h.part === "anchor" && store.selection !== d.id) continue;
      return { d, hit: h };
    }
    if (h) return { d, hit: h };
  }
  return null;
}

cv.addEventListener("pointerdown", (e: PointerEvent) => {
  e.preventDefault();
  const { px, py } = pos(e);
  if (!inRect(px, py)) return;
  flow = flow && flow.type ? flow : null;

  if (activeTool === "cross") {
    const hit = topHit(px, py);
    if (hit) {
      store.select(hit.d.id);
      if (hit.d.locked) return;
      const a0 = hit.d.anchors[0];
      drag = {
        kind: "draw", id: hit.d.id, part: hit.hit.part as "body" | "anchor",
        idx: hit.hit.idx, grabIdx: tToIdx(bars, a0.t), grabPrice: a0.price,
        origAnchors: JSON.parse(JSON.stringify(hit.d.anchors)),
      };
    } else {
      store.select(null);
      drag = { kind: "pan", sx: px, sy: py, barStart: vp.barStart, priceLo: vp.priceLo, priceHi: vp.priceHi };
    }
    return;
  }
  if (activeTool === "eraser") {
    const hit = topHit(px, py);
    if (hit) store.removeDraw(hit.d.id);
    return;
  }
  // ----- drawing tools -----
  const def = TOOLS_BY_TYPE.get(activeTool)!;
  const nClicks = def.clicks ?? 1;
  const a = magnetize(px, py);
  if (nClicks === 1) {
    if (def.type === "text" || def.type === "pricelabel") {
      textPending = { px, py, t: a.t, price: a.price };
      placeTextInput(px, py);
      return;
    }
    flow = null;
    addDrawing(def.type, [a]);
    return;
  }
  if (!flow || flow.type !== def.type) {
    flow = { type: def.type, anchors: [a], ghost: null };
  } else {
    flow.anchors.push(a);
    if (flow.anchors.length >= nClicks) {
      const f = flow;
      flow = null;
      addDrawing(f.type, f.anchors);
    }
  }
  renderModeTip();
});

cv.addEventListener("pointermove", (e: PointerEvent) => {
  const { px, py } = pos(e);
  hover = inRect(px, py) ? { px, py, idx: vp.idxFromX(px) } : null;
  if (!hover) { render(); return; }
  if (flow && flow.anchors.length < (TOOLS_BY_TYPE.get(flow.type)!.clicks ?? 99)) {
    flow.ghost = magnetize(px, py);
    render();
    return;
  }
  const dr = drag;
  if (dr) {
    if (dr.kind === "pan") {
      vp.barStart = dr.barStart - (px - dr.sx) / vp.rect.w * vp.barCount;
      const span = dr.priceHi - dr.priceLo;
      const dp = (dr.sy - py) / vp.rect.h * span;
      vp.priceLo = dr.priceLo + dp; vp.priceHi = dr.priceHi + dp;
      if (Math.abs(dp) > span * 0.0001) priceManual = true;
    } else {
      const d = store.drawings.find(x => x.id === dr.id);
      if (d) {
        if (dr.part === "anchor") {
          const na = magnetize(px, py);
          const next = d.anchors.map((a, i) => i === dr.idx ? na : a);
          d.anchors = next;
        } else {
          const dIdx = vp.idxFromX(px) - dr.grabIdx;
          d.anchors = dr.origAnchors.map(a => ({
            t: bars[clamp(Math.round(tToIdx(bars, a.t)) + Math.round(dIdx), 0, bars.length - 1)].t,
            price: a.price + (vp.priceFromY(py) - dr.grabPrice),
          }));
        }
      }
    }
    render();
    return;
  }
  render();
});

function endDrag(e: PointerEvent) {
  if (drag && drag.kind === "draw") {
    store.commitMove(drag.id, drag.origAnchors);
  }
  drag = null;
}
cv.addEventListener("pointerup", endDrag);
cv.addEventListener("pointerleave", () => { hover = null; render(); });

cv.addEventListener("wheel", (e: WheelEvent) => {
  e.preventDefault();
  const { px, py } = pos(e);
  if (!inRect(px, py)) return;
  const factor = Math.exp(-e.deltaY * 0.0014);
  const idx = vp.idxFromX(px);
  if (priceManual) {
    vp.zoom(factor, px, py);
  } else {
    vp.barCount = clamp(vp.barCount / factor, 8, bars.length * 20);
    vp.barStart = idx - (px - vp.rect.l) / vp.rect.w * vp.barCount;
    refitPrice();
  }
  render();
}, { passive: false });

cv.addEventListener("dblclick", (e: MouseEvent) => {
  const { px, py } = pos(e);
  const hit = inRect(px, py) ? topHit(px, py) : null;
  if (hit) openSettings(hit.d);
});

cv.addEventListener("contextmenu", (e: MouseEvent) => {
  e.preventDefault();
  const { px, py } = pos(e);
  const hit = inRect(px, py) ? topHit(px, py) : null;
  if (hit) {
    store.select(hit.d.id);
    openCtxMenu(px + 8, py + 4, hit.d);
  } else closeCtxMenu();
});

// ---------------- text input overlay ----------------
function placeTextInput(px: number, py: number) {
  const pill = $("textinput"), field = $("textinputfield") as HTMLInputElement;
  pill.hidden = false;
  pill.style.left = Math.min(px, chartEl.clientWidth - 220) + "px";
  pill.style.top = Math.min(py + 12, chartEl.clientHeight - 40) + "px";
  field.value = "note";
  field.focus(); field.select();
}
function commitText() {
  if (!textPending) return;
  const val = ($("textinputfield") as HTMLInputElement).value.trim() || "note";
  const def = TOOLS_BY_TYPE.get(activeTool)!;
  closeTextInput();
  addDrawing(activeTool, [{ t: textPending.t, price: textPending.price }], { settings: { ...cloneSettings(def.defaults), text: val } });
  textPending = null;
}
function closeTextInput() {
  $("textinput").hidden = true;
  textPending = null;
}
$("textinputok").addEventListener("click", commitText);
$("textinputfield").addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter") { e.preventDefault(); commitText(); }
  if (e.key === "Escape") { closeTextInput(); setTool("cross"); }
});

// ---------------- settings dialog ----------------
function openSettings(d: Drawing) {
  const def = defOf(d);
  const overlay = $("dlg");
  overlay.hidden = false;
  const body = $("dlgform");
  body.innerHTML = "";
  const h = document.createElement("div");
  h.className = "dlghead";
  h.innerHTML = `<span>${def.icon} ${def.label}</span><button class="x" id="dlgclose">✕</button>`;
  body.appendChild(h);
  const form = document.createElement("div");
  form.className = "dlgfields";
  const vals: Record<string, unknown> = { ...cloneSettings(def.defaults), ...d.settings };
  for (const f of def.schema) {
    const row = document.createElement("label");
    row.className = "dlgrow";
    const lab = document.createElement("span");
    lab.textContent = f.label;
    row.appendChild(lab);
    let ctl: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (f.kind === "color") {
      ctl = document.createElement("input"); ctl.type = "color";
    } else if (f.kind === "number") {
      ctl = document.createElement("input"); ctl.type = "number";
      ctl.step = String(f.step ?? 1); ctl.min = String(f.min ?? 0); ctl.max = String(f.max ?? 999);
    } else if (f.kind === "select") {
      ctl = document.createElement("select");
      for (const o of f.options ?? []) {
        const op = document.createElement("option"); op.value = o; op.textContent = o;
        ctl.appendChild(op);
      }
    } else if (f.kind === "toggle") {
      ctl = document.createElement("input"); ctl.type = "checkbox";
    } else if (f.kind === "multiline") {
      ctl = document.createElement("textarea"); ctl.rows = 2;
    } else {
      ctl = document.createElement("input"); ctl.type = "text";
    }
    const cur = vals[f.key];
    if (f.kind === "toggle") (ctl as HTMLInputElement).checked = !!cur;
    else ctl.value = String(cur ?? "");
    ctl.dataset.key = f.key;
    row.appendChild(ctl);
    form.appendChild(row);
  }
  body.appendChild(form);
  const foot = document.createElement("div");
  foot.className = "dlgfoot";
  foot.innerHTML = `<button class="btn danger" id="dlgdelete">Delete</button><span class="sp"></span><button class="btn ghost" id="dlgall">Apply to all</button><button class="btn primary" id="dlgapply">Apply</button>`;
  body.appendChild(foot);
  const collect = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    body.querySelectorAll("[data-key]").forEach(el => {
      const k = (el as HTMLElement).dataset.key!;
      const f = def.schema.find(x => x.key === k)!;
      if (f.kind === "toggle") out[k] = (el as HTMLInputElement).checked;
      else if (f.kind === "number") out[k] = parseFloat((el as HTMLInputElement).value);
      else out[k] = (el as HTMLInputElement).value;
    });
    return out;
  };
  $("dlgapply").onclick = () => { store.updateDraw(d.id, { settings: collect() }); overlay.hidden = true; };
  $("dlgall").onclick = () => { store.updateDraw(d.id, { settings: collect() }); store.applyToAllSameType(d.id); overlay.hidden = true; };
  $("dlgdelete").onclick = () => { store.removeDraw(d.id); overlay.hidden = true; };
  $("dlgclose").onclick = () => { overlay.hidden = true; };
  overlay.onclick = (e: MouseEvent) => { if (e.target === overlay) overlay.hidden = true; };
}

// ---------------- context menu ----------------
let ctxTarget: Drawing | null = null;
function openCtxMenu(x: number, y: number, d: Drawing) {
  ctxTarget = d;
  const m = $("ctxmenu");
  m.hidden = false;
  const items: [string, () => void][] = [
    ["⚙ Settings…", () => openSettings(d)],
    ["⧉ Duplicate", () => store.duplicate(d.id)],
    [d.locked ? "🔓 Unlock" : "🔒 Lock", () => store.updateDraw(d.id, { locked: !d.locked })],
    [d.hidden ? "👁 Show" : "🙈 Hide", () => store.updateDraw(d.id, { hidden: !d.hidden })],
    ["▤ Apply to same type", () => store.applyToAllSameType(d.id)],
    ["✕ Delete", () => store.removeDraw(d.id)],
  ];
  m.innerHTML = "";
  for (const [txt, fn] of items) {
    const b = document.createElement("button");
    b.textContent = txt;
    b.onclick = () => { fn(); closeCtxMenu(); };
    m.appendChild(b);
  }
  const w = m.offsetWidth || 190, h = m.offsetHeight || 220;
  m.style.left = Math.min(x, chartEl.clientWidth - w - 8) + "px";
  m.style.top = Math.min(y, chartEl.clientHeight - h - 8) + "px";
}
function closeCtxMenu() { $("ctxmenu").hidden = true; ctxTarget = null; }
document.addEventListener("pointerdown", (e) => {
  const m = $("ctxmenu");
  if (!m.hidden && !m.contains(e.target as Node)) closeCtxMenu();
  const dlg = $("dlg");
  if (!dlg.hidden && !dlg.contains(e.target as Node) && e.target !== dlg) { /* modal: keep */ }
});

// ---------------- keyboard ----------------
const SHORTCUTS: Record<string, string> = {
  t: "trendline", h: "hline", v: "vline", c: "channel", r: "rect",
  f: "fib", x: "text", l: "pricelabel", m: "measure", w: "avwap", p: "frvp", e: "eraser",
};
window.addEventListener("keydown", (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) store.redo(); else store.undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); store.redo(); return; }
  if (e.key === "Escape") {
    if (!$("ctxmenu").hidden) { closeCtxMenu(); return; }
    if (!$("dlg").hidden) { $("dlg").hidden = true; return; }
    if (flow) { flow = null; renderModeTip(); render(); return; }
    store.select(null);
    setTool("cross");
    return;
  }
  if (e.key === "Home") { fitChart(); return; }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (store.selection) { store.removeDraw(store.selection); return; }
    if (ctxTarget) { store.removeDraw(ctxTarget.id); closeCtxMenu(); return; }
  }
  const k = e.key.toLowerCase();
  const t = SHORTCUTS[k];
  if (t && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool(t); }
});

// ---------------- top bar ----------------
function buildTfBar() {
  const bar = $("tfbar");
  bar.innerHTML = "";
  for (const tf of TFS) {
    const b = document.createElement("button");
    b.textContent = tf.label;
    b.className = store.state.tf.id === tf.id ? "on" : "";
    b.onclick = () => { store.setTf(tf); loadBars(); fitChart(); };
    bar.appendChild(b);
  }
}
function buildChartType() {
  const bar = $("ctype");
  bar.innerHTML = "";
  const types: [ChartType, string, string][] = [
    ["candles", "▮", "Candles"], ["bars", "│", "Bars"], ["line", "─", "Line"], ["area", "◠", "Area"],
  ];
  for (const [t, icon, title] of types) {
    const b = document.createElement("button");
    b.textContent = icon;
    b.title = title;
    b.className = store.state.chartType === t ? "on" : "";
    b.onclick = () => { store.setChartType(t); renderRail(); buildChartType(); };
    bar.appendChild(b);
  }
}
$("btnUndo").onclick = () => store.undo();
$("btnRedo").onclick = () => store.redo();
$("btnFit").onclick = () => fitChart();
$("btnInd").onclick = () => toast("Indicators — Phase 2 (Pine runtime)");
$("btnCmp").onclick = () => toast("Compare — Phase 2");
$("btnAlert").onclick = () => toast("Alerts — Phase 2");
$("btnLock").onclick = () => {
  const anyUnlocked = store.drawings.some(d => !d.locked);
  store.setAllLocked(anyUnlocked);
  toast(anyUnlocked ? "Locked all drawings" : "Unlocked all drawings");
};
$("btnHide").onclick = () => {
  const anyVisible = store.drawings.some(d => !d.hidden);
  store.setAllHidden(anyVisible);
  toast(anyVisible ? "Hidden all drawings" : "Shown all drawings");
};
$("btnRemove").onclick = () => { store.clearAll(); toast("Removed all drawings"); };
$("btnKeep").onclick = () => {
  keepDrawing = !keepDrawing;
  $("btnKeep").classList.toggle("active", keepDrawing);
  toast(keepDrawing ? "Keep drawing: ON — tool stays active after placing" : "Keep drawing: OFF");
};
$("magsel").addEventListener("change", (e) => {
  magnet = (e.target as HTMLSelectElement).value as "off" | "weak" | "strong";
  toast(`Magnet: ${magnet === "off" ? "off" : magnet === "weak" ? "weak (bars)" : "strong (bar OHLC)"}`);
});
$("btnClearAll").onclick = () => { store.clearAll(); };

// ---------------- symbol search ----------------
const symInput = $("sym") as HTMLInputElement;
const symMenu = $("symmenu");
function renderSymMenu() {
  const q = symInput.value.trim().toUpperCase();
  const list = SYMBOLS.filter(s => s.name.includes(q) || s.market.includes(q)).slice(0, 6);
  symMenu.innerHTML = "";
  for (const s of list) {
    const row = document.createElement("div");
    row.className = "symrow";
    row.innerHTML = `<b>${s.name}</b><span>${s.market} · tick ${s.tick}</span>`;
    row.onclick = () => selectSymbol(s.name);
    symMenu.appendChild(row);
  }
  symMenu.hidden = !symInput.value.length || !list.length;
}
function selectSymbol(name: string) {
  const s = SYMBOLS.find(x => x.name === name)!;
  store.setSymbol(s);
  symInput.value = s.name;
  symMenu.hidden = true;
  loadBars(); fitChart();
}
symInput.addEventListener("input", renderSymMenu);
symInput.addEventListener("focus", () => { if (symInput.value) renderSymMenu(); });
symInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = symInput.value.trim().toUpperCase();
    const hit = SYMBOLS.find(s => s.name.startsWith(q)) ?? SYMBOLS.find(s => s.name.includes(q));
    if (hit) selectSymbol(hit.name);
  }
  if (e.key === "Escape") symMenu.hidden = true;
});
document.addEventListener("pointerdown", (e) => {
  if (!symMenu.hidden && !symMenu.contains(e.target as Node) && e.target !== symInput) symMenu.hidden = true;
});

// ---------------- tool rail + flyouts ----------------
const GROUPS: { id: string; icon: string; title: string; tools: string[] }[] = [
  { id: "trend", icon: "╱", title: "Trend tools", tools: TOOLS.filter(t => t.group === "trend" && !t.phase).map(t => t.type) },
  { id: "gann", icon: "Φ", title: "Gann & Fibonacci", tools: TOOLS.filter(t => t.group === "gann").map(t => t.type) },
  { id: "shapes", icon: "◇", title: "Geometric shapes", tools: TOOLS.filter(t => t.group === "shapes").map(t => t.type) },
  { id: "annotations", icon: "T", title: "Annotations", tools: TOOLS.filter(t => t.group === "annotations").map(t => t.type) },
  { id: "patterns", icon: "𝍌", title: "Patterns", tools: TOOLS.filter(t => t.group === "patterns").map(t => t.type) },
  { id: "measure", icon: "⤳", title: "Forecast & volume", tools: TOOLS.filter(t => t.group === "measure").map(t => t.type) },
];
function renderRail() {
  const rail = $("rail");
  rail.innerHTML = "";
  // cursors (always visible)
  for (const id of ["cross", "eraser"]) {
    const def = TOOLS_BY_TYPE.get(id)!;
    const b = document.createElement("button");
    b.className = "railbtn " + (activeTool === id ? "on" : "");
    b.title = def.label + (def.shortcut ? ` (${def.shortcut})` : "") + " — " + (def.blurb ?? "");
    b.textContent = def.icon;
    b.onclick = () => setTool(id);
    rail.appendChild(b);
  }
  const sep = document.createElement("div"); sep.className = "sep"; rail.appendChild(sep);
  for (const g of GROUPS) {
    const wrap = document.createElement("div");
    wrap.className = "railgroup";
    const btn = document.createElement("button");
    const activeHere = g.tools.includes(activeTool);
    btn.className = "railbtn group " + (activeHere ? "active" : "");
    btn.textContent = g.icon;
    btn.title = g.title;
    const fly = document.createElement("div");
    fly.className = "flyout";
    fly.hidden = true;
    const cap = document.createElement("div");
    cap.className = "flycap"; cap.textContent = g.title;
    fly.appendChild(cap);
    for (const t of g.tools) {
      const def = TOOLS_BY_TYPE.get(t)!;
      const row = document.createElement("button");
      row.className = "flyrow" + (activeTool === t ? " on" : "") + (def.phase ? " soon" : "");
      row.innerHTML = `<span class="fi">${def.icon}</span><span class="fn">${def.label}</span>${def.shortcut ? `<span class="fk">${def.shortcut}</span>` : ""}${def.phase ? `<span class="ph">${def.phase}</span>` : ""}`;
      row.title = def.blurb ?? "";
      row.onclick = () => {
        if (!def.phase) setTool(t);
        else toast(`${def.label} — ${def.phase} (on the roadmap)`);
      };
      fly.appendChild(row);
    }
    btn.onclick = () => {
      const was = !fly.hidden;
      closeFlyouts();
      if (!was) fly.hidden = false;
    };
    wrap.appendChild(btn); wrap.appendChild(fly);
    rail.appendChild(wrap);
    if (g.id === "measure") { const s2 = document.createElement("div"); s2.className = "sep"; rail.appendChild(s2); }
  }
  // bottom spacer
  const pad = document.createElement("div"); pad.className = "railpad"; rail.appendChild(pad);
}
function closeFlyouts() {
  document.querySelectorAll(".flyout").forEach(f => { (f as HTMLElement).hidden = true; });
}
document.addEventListener("pointerdown", (e) => {
  if (!(e.target as HTMLElement).closest?.(".railgroup")) closeFlyouts();
});

// ---------------- objects panel ----------------
function renderObjects() {
  const list = $("oplist");
  const items = store.visible;
  $("objcnt").textContent = String(store.state.drawings.length);
  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "opempty";
    empty.textContent = "No drawings yet — pick a tool from the left rail.";
    list.appendChild(empty);
    return;
  }
  // group by tool type
  const byType = new Map<string, Drawing[]>();
  for (const d of items) {
    if (!byType.has(d.type)) byType.set(d.type, []);
    byType.get(d.type)!.push(d);
  }
  for (const [type, ds] of byType) {
    const def = TOOLS_BY_TYPE.get(type)!;
    const sec = document.createElement("div");
    sec.className = "opsect";
    sec.textContent = `${def.icon} ${def.label}`;
    list.appendChild(sec);
    for (const d of ds) {
      const row = document.createElement("div");
      row.className = "op" + (store.selection === d.id ? " sel" : "") + (d.hidden ? " hid" : "");
      const color = String(d.settings.color ?? "");
      row.innerHTML = `<span class="dot" style="background:${color || C.blue}"></span>` +
        `<span class="name">${labelOf(d)}</span>` +
        `<button class="opb" data-act="eye" title="${d.hidden ? "Show" : "Hide"}">${d.hidden ? "◌" : "👁"}</button>` +
        `<button class="opb" data-act="lock" title="${d.locked ? "Unlock" : "Lock"}">${d.locked ? "🔒" : "🔓"}</button>` +
        `<button class="opb" data-act="del" title="Delete">✕</button>`;
      row.onclick = () => { store.select(d.id); };
      row.ondblclick = () => openSettings(d);
      (row.querySelector('[data-act="eye"]') as HTMLElement).onclick = (e) => { e.stopPropagation(); store.updateDraw(d.id, { hidden: !d.hidden }); };
      (row.querySelector('[data-act="lock"]') as HTMLElement).onclick = (e) => { e.stopPropagation(); store.updateDraw(d.id, { locked: !d.locked }); };
      (row.querySelector('[data-act="del"]') as HTMLElement).onclick = (e) => { e.stopPropagation(); store.removeDraw(d.id); };
      list.appendChild(row);
    }
  }
}
$("objsearch").addEventListener("input", (e) => { store.filter = (e.target as HTMLInputElement).value; renderObjects(); });

// ---------------- toast ----------------
let toastTimer: number | null = null;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 1800);
}

// ---------------- wiring store -> ui ----------------
store.on.on(() => {
  renderObjects();
  buildTfBar();
  buildChartType();
  render();
});
store.onSel.on(() => { renderObjects(); render(); });
store.onDraw.on(({ label }) => toast(`${label} added`));
store.onToast.on(toast);

// ---------------- boot ----------------
loadBars();
fitChart();
setSize();
buildTfBar();
buildChartType();
renderRail();
renderObjects();
symInput.value = store.state.symbol.name;
new ResizeObserver(() => setSize()).observe(chartEl);
