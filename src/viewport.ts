// ---------- chart viewport: data <-> pixels ----------
import { clamp } from "./util";

export interface ViewRect { l: number; t: number; r: number; b: number; w: number; h: number }

export class Viewport {
  barStart = 0;            // float index of first visible bar
  barCount = 120;          // number of visible bars
  priceLo = 0; priceHi = 1;
  nBars = 0;
  rect: ViewRect = { l: 0, t: 0, r: 0, b: 0, w: 0, h: 0 };

  fit(nBars: number, lo: number, hi: number) {
    this.nBars = nBars;
    this.barCount = Math.min(nBars, this.barCount);
    this.barStart = nBars - this.barCount;
    this.setPrice(lo, hi);
  }
  setPrice(lo: number, hi: number) {
    const pad = (hi - lo) * 0.06 || 1;
    this.priceLo = lo - pad; this.priceHi = hi + pad;
  }
  x(idx: number): number { return this.rect.l + (idx - this.barStart) / this.barCount * this.rect.w }
  y(price: number): number {
    return this.rect.t + (this.priceHi - price) / (this.priceHi - this.priceLo) * this.rect.h
  }
  idxFromX(px: number): number {
    return this.barStart + (px - this.rect.l) / this.rect.w * this.barCount
  }
  priceFromY(py: number): number {
    return this.priceHi - (py - this.rect.t) / this.rect.h * (this.priceHi - this.priceLo)
  }
  /** zoom by factor around pixel (fx, fy); factor > 1 zooms in */
  zoom(factor: number, fx: number, fy: number) {
    const idx = this.idxFromX(fx);
    const p = this.priceFromY(fy);
    this.barCount = clamp(this.barCount / factor, 8, this.nBars * 2);
    this.barStart = clamp(idx - (fx - this.rect.l) / this.rect.w * this.barCount, -this.barCount * 0.8, this.nBars - 2);
    const span = (this.priceHi - this.priceLo) / factor;
    this.priceLo = p - (p - this.priceLo) / factor;
    this.priceHi = this.priceLo + span;
  }
  pan(dx: number, dy: number) {
    this.barStart = clamp(this.barStart - dx / this.rect.w * this.barCount, -this.barCount * 0.8, this.nBars - 2);
    const dp = dy / this.rect.h * (this.priceHi - this.priceLo);
    this.priceLo += dp; this.priceHi += dp;
  }
}
