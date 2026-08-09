// lower-timeframe resolution for volume profiles (TV algorithm)
import { barsFor } from "./feed";
import { TFS, Bar } from "./types";
import { tToIdx } from "./util";

/** chain: 1,5,15,30,60,240,1D — first TF whose bars in range < maxBars wins.
 *  Seconds/S cases omitted (we have no second data); chart TF is the fallback. */
export const findLowerTf = {
  findBars(req: { symbolName: string; t0: number; t1: number; maxBars: number }): Bar[] {
    const { symbolName, t0, t1, maxBars } = req;
    for (const tf of TFS) {
      const bars = barsFor(symbolName, tf);
      const a = Math.floor(tToIdx(bars, t0)), b = Math.ceil(tToIdx(bars, t1));
      if (b - a + 1 < maxBars) return bars.slice(Math.max(0, a - 1), b + 2);
    }
    // fallback: 1m (finest we have)
    const bars = barsFor(symbolName, TFS[0]);
    const a = Math.floor(tToIdx(bars, t0)), b = Math.ceil(tToIdx(bars, t1));
    return bars.slice(Math.max(0, a - 1), b + 2);
  }
};
