// ---------- tool registry, defaults, settings schemas ----------
import { ToolDef, Drawing } from "../types";

export type FieldKind = "color" | "number" | "select" | "toggle" | "text" | "multiline";
export interface FieldDef {
  key: string; label: string; kind: FieldKind;
  options?: string[]; min?: number; max?: number; step?: number;
}
export interface ToolDefX extends ToolDef { schema: FieldDef[] }

const lineFields: FieldDef[] = [
  { key: "color", label: "Color", kind: "color" },
  { key: "width", label: "Line width", kind: "number", min: 1, max: 8, step: 1 },
  { key: "style", label: "Style", kind: "select", options: ["solid", "dashed", "dotted"] },
  { key: "showPrice", label: "Price tag", kind: "toggle" },
];

export const TOOLS: ToolDefX[] = [
  // --- cursors ---
  { type: "cross", label: "Cross cursor", icon: "✛", group: "cursors", defaults: {}, schema: [], blurb: "Select · drag to pan the chart" },
  { type: "eraser", label: "Eraser", icon: "🧽", group: "cursors", shortcut: "E", defaults: {}, schema: [], blurb: "Click a drawing to remove it" },
  // --- trend tools (implemented) ---
  { type: "trendline", label: "Trend line", icon: "╱", group: "trend", shortcut: "T", clicks: 2, defaults: { color: "#4c8dff", width: 2, style: "solid", showPrice: false }, schema: lineFields, blurb: "Two anchors. Hold Shift to extend the right ray." },
  { type: "ray", label: "Ray", icon: "➚", group: "trend", clicks: 2, defaults: { color: "#4c8dff", width: 2, style: "solid", showPrice: true }, schema: lineFields, blurb: "Extends to the right forever." },
  { type: "extended", label: "Extended line", icon: "⇆", group: "trend", clicks: 2, defaults: { color: "#4c8dff", width: 2, style: "solid", showPrice: true }, schema: lineFields, blurb: "Extends both ways." },
  { type: "hline", label: "Horizontal line", icon: "─", group: "trend", shortcut: "H", clicks: 1, defaults: { color: "#e4574f", width: 1.5, style: "dashed", showPrice: true }, schema: lineFields },
  { type: "hray", label: "Horizontal ray", icon: "▸", group: "trend", clicks: 2, defaults: { color: "#e4574f", width: 1.5, style: "dashed", showPrice: true }, schema: lineFields },
  { type: "vline", label: "Vertical line", icon: "▌", group: "trend", shortcut: "V", clicks: 1, defaults: { color: "#5b6778", width: 1, style: "dashed", showPrice: false }, schema: lineFields },
  { type: "channel", label: "Parallel channel", icon: "∥", group: "trend", shortcut: "C", clicks: 3, defaults: { color: "#35c4e8", width: 1.5, style: "solid", fill: 0.06 }, schema: [...lineFields, { key: "fill", label: "Fill opacity", kind: "number", min: 0, max: 0.5, step: 0.02 }] },
  // --- fib ---
  { type: "fib", label: "Fib retracement", icon: "Φ", group: "gann", shortcut: "F", clicks: 2, defaults: { color: "#8b9bb4", width: 1, style: "solid", levels: "0,0.236,0.382,0.5,0.618,0.786,1", showLabels: true, extend: true }, schema: [
      { key: "color", label: "Color", kind: "color" },
      { key: "width", label: "Line width", kind: "number", min: 1, max: 4, step: 1 },
      { key: "levels", label: "Levels (comma)", kind: "text" },
      { key: "showLabels", label: "Level tags", kind: "toggle" },
      { key: "extend", label: "Extend right", kind: "toggle" },
    ] },
  // --- shapes ---
  { type: "rect", label: "Rectangle", icon: "▭", group: "shapes", shortcut: "R", clicks: 2, defaults: { color: "#6999b8", width: 1.5, style: "solid", fill: 0.1 }, schema: [...lineFields, { key: "fill", label: "Fill opacity", kind: "number", min: 0, max: 0.5, step: 0.02 }] },
  // --- annotations ---
  { type: "text", label: "Text", icon: "T", group: "annotations", shortcut: "X", clicks: 1, defaults: { color: "#dbe4f0", text: "note", size: 13, bg: "#12171f" }, schema: [
      { key: "text", label: "Text", kind: "multiline" },
      { key: "color", label: "Color", kind: "color" },
      { key: "size", label: "Font px", kind: "number", min: 9, max: 28, step: 1 },
      { key: "bg", label: "Background", kind: "color" },
    ] },
  { type: "pricelabel", label: "Price label", icon: "L", group: "annotations", shortcut: "L", clicks: 1, defaults: { color: "#4c8dff", size: 11 }, schema: [
      { key: "color", label: "Color", kind: "color" },
      { key: "size", label: "Font px", kind: "number", min: 9, max: 20, step: 1 },
    ] },
  // --- measure / volume (computed) ---
  { type: "measure", label: "Measure", icon: "⇕", group: "measure", shortcut: "M", clicks: 2, defaults: { color: "#ffb020", width: 1.5, style: "solid" }, schema: lineFields },
  { type: "avwap", label: "Anchored VWAP", icon: "⌁", group: "measure", shortcut: "W", clicks: 1, defaults: { color: "#ffb020", width: 2, style: "solid", band1: true, band2: true }, schema: [
      { key: "color", label: "Color", kind: "color" },
      { key: "width", label: "Line width", kind: "number", min: 1, max: 5, step: 1 },
      { key: "style", label: "Style", kind: "select", options: ["solid", "dashed", "dotted"] },
      { key: "band1", label: "±1σ band", kind: "toggle" },
      { key: "band2", label: "±2σ band", kind: "toggle" },
    ] },
  { type: "frvp", label: "Fixed-range volume profile", icon: "▤", group: "measure", shortcut: "P", clicks: 2, defaults: { rowMode: "number", rowValue: 24, volumeMode: "total", valueArea: 0.7, extendRight: false }, schema: [
      { key: "rowMode", label: "Rows layout", kind: "select", options: ["number", "ticks"] },
      { key: "rowValue", label: "Rows / ticks per row", kind: "number", min: 1, max: 400, step: 1 },
      { key: "volumeMode", label: "Volume", kind: "select", options: ["total", "updown", "delta"] },
      { key: "valueArea", label: "Value area %", kind: "number", min: 0.3, max: 0.95, step: 0.05 },
      { key: "extendRight", label: "Extend right", kind: "toggle" },
    ] },
  { type: "avp", label: "Anchored volume profile", icon: "⊞", group: "measure", clicks: 1, defaults: { rowMode: "number", rowValue: 24, volumeMode: "total", valueArea: 0.7 }, schema: [
      { key: "rowMode", label: "Rows layout", kind: "select", options: ["number", "ticks"] },
      { key: "rowValue", label: "Rows / ticks per row", kind: "number", min: 1, max: 400, step: 1 },
      { key: "volumeMode", label: "Volume", kind: "select", options: ["total", "updown", "delta"] },
      { key: "valueArea", label: "Value area %", kind: "number", min: 0.3, max: 0.95, step: 0.05 },
    ] },
  // --- soon ---
  { type: "trendangle", label: "Trend angle", icon: "∠", group: "trend", phase: "P2", defaults: {}, schema: [] },
  { type: "regression", label: "Regression trend", icon: "≋", group: "trend", phase: "P2", defaults: {}, schema: [] },
  { type: "flattop", label: "Flat top / bottom", icon: "▱", group: "trend", phase: "P2", defaults: {}, schema: [] },
  { type: "disjoint", label: "Disjoint channel", icon: "⫽", group: "trend", phase: "P2", defaults: {}, schema: [] },
  { type: "crossline", label: "Crossline", icon: "✕", group: "trend", phase: "P2", defaults: {}, schema: [] },
  { type: "pitchfork", label: "Pitchfork", icon: "⸛", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "schiff", label: "Schiff pitchfork", icon: "⸛", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "insidpf", label: "Inside pitchfork", icon: "⸛", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "tbfext", label: "Trend-based fib extension", icon: "⇗", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "fibchan", label: "Fib channel", icon: "▦", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "fibtz", label: "Fib time zone", icon: "◷", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "fibfan", label: "Fib speed fan", icon: "⌛", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "gannfan", label: "Gann fan", icon: "✳", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "gannbox", label: "Gann box", icon: "▣", group: "gann", phase: "P2", defaults: {}, schema: [] },
  { type: "ellipse", label: "Ellipse", icon: "⬭", group: "shapes", phase: "P2", defaults: {}, schema: [] },
  { type: "circle", label: "Circle", icon: "○", group: "shapes", phase: "P2", defaults: {}, schema: [] },
  { type: "triangle", label: "Triangle", icon: "△", group: "shapes", phase: "P2", defaults: {}, schema: [] },
  { type: "polyline", label: "Polyline", icon: "⎓", group: "shapes", phase: "P2", defaults: {}, schema: [] },
  { type: "brush", label: "Brush", icon: "🖌", group: "shapes", phase: "P2", defaults: {}, schema: [] },
  { type: "hlighter", label: "Highlighter", icon: "🖍", group: "shapes", phase: "P2", defaults: {}, schema: [] },
  { type: "arc", label: "Arc", icon: "⌒", group: "shapes", phase: "P2", defaults: {}, schema: [] },
  { type: "note", label: "Note", icon: "🗒", group: "annotations", phase: "P2", defaults: {}, schema: [] },
  { type: "callout", label: "Callout", icon: "💬", group: "annotations", phase: "P2", defaults: {}, schema: [] },
  { type: "pin", label: "Pin", icon: "📌", group: "annotations", phase: "P2", defaults: {}, schema: [] },
  { type: "arrow", label: "Arrow", icon: "➤", group: "annotations", phase: "P2", defaults: {}, schema: [] },
  { type: "flag", label: "Flag mark", icon: "🚩", group: "annotations", phase: "P2", defaults: {}, schema: [] },
  { type: "table", label: "Table", icon: "⊞", group: "annotations", phase: "P2", defaults: {}, schema: [] },
  { type: "xabcd", label: "XABCD pattern", icon: "𝍌", group: "patterns", phase: "P2", defaults: {}, schema: [] },
  { type: "abcd", label: "ABCD pattern", icon: "▰", group: "patterns", phase: "P2", defaults: {}, schema: [] },
  { type: "trianglepat", label: "Triangle pattern", icon: "△", group: "patterns", phase: "P2", defaults: {}, schema: [] },
  { type: "threedrives", label: "Three drives", icon: "〽", group: "patterns", phase: "P2", defaults: {}, schema: [] },
  { type: "hns", label: "Head & shoulders", icon: "⛰", group: "patterns", phase: "P2", defaults: {}, schema: [] },
  { type: "elliott", label: "Elliott waves", icon: "〰", group: "patterns", phase: "P2", defaults: {}, schema: [] },
  { type: "poslong", label: "Long position", icon: "⇧", group: "measure", phase: "P2", defaults: {}, schema: [] },
  { type: "posshort", label: "Short position", icon: "⇩", group: "measure", phase: "P2", defaults: {}, schema: [] },
  { type: "pricerange", label: "Price range", icon: "⫼", group: "measure", phase: "P2", defaults: {}, schema: [] },
  { type: "daterange", label: "Date range", icon: "◫", group: "measure", phase: "P2", defaults: {}, schema: [] },
  { type: "ghostfeed", label: "Ghost feed", icon: "♒", group: "measure", phase: "P2", defaults: {}, schema: [] },
];

export const TOOLS_BY_TYPE = new Map(TOOLS.map(t => [t.type, t]));
export function defOf(d: Drawing): ToolDefX { return TOOLS_BY_TYPE.get(d.type)! }
export function cloneSettings(s: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(s));
}
