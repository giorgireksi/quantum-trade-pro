// ---------- app state + undo/redo + persistence ----------
import { Bar, ChartType, Drawing, SymbolDef, TF, SYMBOLS, TFS } from "./types";
import { cloneSettings, defOf } from "./drawings/model";
import { Emitter, uid } from "./util";

export interface AppState {
  symbol: SymbolDef;
  tf: TF;
  chartType: ChartType;
  drawings: Drawing[];
}
const LS_KEY = "chartlab.layout.v1";
const MAX_UNDO = 120;

type Cmd =
  | { k: "add"; d: Drawing }
  | { k: "remove"; d: Drawing; i: number }
  | { k: "update"; id: string; before: Drawing; after: Drawing }
  | { k: "clear"; snap: Drawing[] }
  | { k: "bulk"; before: Drawing[]; after: Drawing[] };

class AppStore {
  state: AppState;
  on = new Emitter<AppState>();
  selection: string | null = null;
  showHidden = true;
  filter = "";
  private undoStack: Cmd[] = [];
  private redoStack: Cmd[] = [];
  onDraw = new Emitter<{ type: string; label: string }>();
  onToast = new Emitter<string>();
  onSel = new Emitter<string | null>();

  constructor() {
    let saved: AppState | null = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const sym = SYMBOLS.find(s => s.name === p.symbolName) ?? SYMBOLS[0];
        saved = {
          symbol: sym,
          tf: TFS.find(t => t.id === p.tfId) ?? TFS[6],
          chartType: p.chartType ?? "candles",
          drawings: (p.drawings ?? []).map((d: any) => ({
            ...d, settings: d.settings ?? {}, locked: !!d.locked, hidden: !!d.hidden,
          })),
        };
      }
    } catch { /* corrupted -> defaults */ }
    this.state = saved ?? { symbol: SYMBOLS[0], tf: TFS[6], chartType: "candles", drawings: [] };
  }
  get drawings() { return this.state.drawings }
  private commit(save = true) {
    this.on.emit(this.state);
    if (save) this.save();
  }
  save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        symbolName: this.state.symbol.name, tfId: this.state.tf.id,
        chartType: this.state.chartType, drawings: this.state.drawings,
      }));
    } catch { /* storage full */ }
  }
  private push(c: Cmd, inverseApplied = false) {
    this.undoStack.push(c);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    if (!inverseApplied) this.redoStack = [];
  }
  toast(msg: string) { this.onToast.emit(msg) }

  setSymbol(s: SymbolDef) { this.state.symbol = s; this.commit() }
  setTf(tf: TF) { this.state.tf = tf; this.commit() }
  setChartType(t: ChartType) { this.state.chartType = t; this.commit() }
  select(id: string | null) { this.selection = id; this.onSel.emit(id); this.commit(false) }

  addDraw(d: Drawing, announce = true) {
    this.state.drawings.push(d);
    this.selection = d.id;
    this.push({ k: "add", d });
    this.commit();
    if (announce) this.onDraw.emit({ type: d.type, label: defOf(d).label });
  }
  removeDraw(id: string) {
    const i = this.state.drawings.findIndex(d => d.id === id);
    if (i < 0) return;
    const d = this.state.drawings.splice(i, 1)[0];
    this.push({ k: "remove", d, i });
    if (this.selection === id) this.select(null);
    this.commit();
  }
  /** idempotent update: records undo only when something changed */
  updateDraw(id: string, patch: Partial<Drawing>) {
    const d = this.state.drawings.find(x => x.id === id);
    if (!d) return;
    const before = JSON.parse(JSON.stringify(d)) as Drawing;
    Object.assign(d, patch);
    if (JSON.stringify(before) !== JSON.stringify(d)) {
      this.push({ k: "update", id, before, after: JSON.parse(JSON.stringify(d)) as Drawing });
    }
    this.commit();
  }
  moveDrawing(id: string, anchors: Drawing["anchors"]) {
    this.updateDraw(id, { anchors });
  }
  /** one undo entry for a full drag/move gesture */
  commitMove(id: string, origAnchors: Drawing["anchors"]) {
    const d = this.state.drawings.find(x => x.id === id);
    if (!d) return;
    if (JSON.stringify(origAnchors) !== JSON.stringify(d.anchors)) {
      this.push({ k: "update", id, before: { ...d, anchors: origAnchors }, after: JSON.parse(JSON.stringify(d)) as Drawing });
    }
    this.commit();
  }
  setAllLocked(val: boolean) {
    if (!this.state.drawings.length || this.state.drawings.every(d => d.locked === val)) return;
    const before = JSON.parse(JSON.stringify(this.state.drawings)) as Drawing[];
    for (const d of this.state.drawings) d.locked = val;
    this.push({ k: "bulk", before, after: JSON.parse(JSON.stringify(this.state.drawings)) as Drawing[] });
    this.commit();
  }
  setAllHidden(val: boolean) {
    if (!this.state.drawings.length || this.state.drawings.every(d => d.hidden === val)) return;
    const before = JSON.parse(JSON.stringify(this.state.drawings)) as Drawing[];
    for (const d of this.state.drawings) d.hidden = val;
    this.push({ k: "bulk", before, after: JSON.parse(JSON.stringify(this.state.drawings)) as Drawing[] });
    this.commit();
  }
  clearAll() {
    if (!this.state.drawings.length) return;
    const snap = this.state.drawings;
    this.state.drawings = [];
    this.select(null);
    this.push({ k: "clear", snap });
    this.commit();
  }
  private setFromCmd(c: Cmd, forward: boolean) {
    if (c.k === "add") {
      if (forward) this.state.drawings.push(c.d);
      else this.state.drawings = this.state.drawings.filter(x => x.id !== c.d.id);
    } else if (c.k === "remove") {
      if (forward) this.state.drawings.splice(Math.min(c.i, this.state.drawings.length), 0, c.d);
      else this.state.drawings = this.state.drawings.filter(x => x.id !== c.d.id);
    } else if (c.k === "update") {
      const i = this.state.drawings.findIndex(x => x.id === c.id);
      if (i >= 0) this.state.drawings[i] = forward ? c.after : c.before;
    } else if (c.k === "bulk") {
      if (forward) this.state.drawings = c.after;
      else this.state.drawings = c.before;
    } else {
      if (forward) this.state.drawings = [];
      else this.state.drawings = c.snap;
    }
  }
  undo() {
    const c = this.undoStack.pop();
    if (!c) return;
    this.setFromCmd(c, false);
    this.redoStack.push(c);
    const sel = this.state.drawings[this.state.drawings.length - 1];
    this.select(sel ? sel.id : null);
    this.commit();
  }
  redo() {
    const c = this.redoStack.pop();
    if (!c) return;
    this.setFromCmd(c, true);
    this.undoStack.push(c);
    const sel = this.state.drawings[this.state.drawings.length - 1];
    this.select(sel ? sel.id : null);
    this.commit();
  }
  duplicate(id: string) {
    const d = this.state.drawings.find(x => x.id === id);
    if (!d) return;
    const copy: Drawing = {
      ...d, id: uid(),
      anchors: JSON.parse(JSON.stringify(d.anchors)),
      settings: cloneSettings(d.settings), createdAt: Date.now(),
    };
    this.state.drawings.push(copy);
    this.select(copy.id);
    this.push({ k: "add", d: copy });
    this.commit();
  }
  applyToAllSameType(id: string) {
    const src = this.state.drawings.find(x => x.id === id);
    if (!src) return;
    for (const d of this.state.drawings) {
      if (d.type === src.type && d.id !== src.id) d.settings = cloneSettings(src.settings);
    }
    this.commit();
    this.toast(`Applied settings to all ${defOf(src).label}s`);
  }
  get visible() {
    const f = this.filter.trim().toLowerCase();
    return this.state.drawings.filter(d => {
      if (this.selection === d.id) return true;
      if (f && !defOf(d).label.toLowerCase().includes(f)) return false;
      if (!this.showHidden && d.hidden) return false;
      return true;
    });
  }
}

export const store = new AppStore();
export type { Bar };
