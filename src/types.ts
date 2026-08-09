// ---------- core types ----------
export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }
export interface TF { id: string; mins: number; label: string }
export const TFS: TF[] = [
  { id: "1m", mins: 1, label: "1m" },
  { id: "5m", mins: 5, label: "5m" },
  { id: "15m", mins: 15, label: "15m" },
  { id: "30m", mins: 30, label: "30m" },
  { id: "1h", mins: 60, label: "1h" },
  { id: "4h", mins: 240, label: "4h" },
  { id: "1D", mins: 1440, label: "1D" },
  { id: "1W", mins: 10080, label: "1W" },
];
export type ChartType = "candles" | "bars" | "line" | "area";

export interface SymbolDef {
  name: string; tick: number; decimals: number; volBase: number; seed: number;
  drift: number; vol: number; market: string; startDrift?: boolean;
}
export const SYMBOLS: SymbolDef[] = [
  { name: "AAPL", tick: 0.01, decimals: 2, volBase: 2.4e6, seed: 11, drift: 0.0006, vol: 0.011, market: "NASDAQ" },
  { name: "TSLA", tick: 0.01, decimals: 2, volBase: 1.9e6, seed: 22, drift: 0.0004, vol: 0.026, market: "NASDAQ" },
  { name: "BTCUSD", tick: 0.1, decimals: 1, volBase: 900, seed: 33, drift: 0.0007, vol: 0.014, market: "CRYPTO" },
  { name: "ETHUSD", tick: 0.01, decimals: 2, volBase: 5200, seed: 44, drift: 0.0005, vol: 0.019, market: "CRYPTO" },
  { name: "EURUSD", tick: 0.00001, decimals: 5, volBase: 4.1e5, seed: 55, drift: 0.00001, vol: 0.00042, market: "FX" },
];

export interface Anchor { t: number; price: number }
export type LineStyle = "solid" | "dashed" | "dotted";

export interface Drawing {
  id: string; type: string;
  anchors: Anchor[];
  settings: Record<string, unknown>;
  locked: boolean; hidden: boolean;
  createdAt: number;
}

export interface ToolDef {
  type: string; label: string; icon: string; group: string;
  shortcut?: string; clicks?: number; phase?: string; blurb?: string;
  drag?: boolean; unbounded?: boolean;
  defaults: Record<string, unknown>;
}
