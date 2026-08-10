# ChartLab — personal TradingView-style charting workspace

A browser-based charting app for personal use: drawing tools, volume analysis, and
(future) a PineScript-compatible indicator runtime. Built with TypeScript + Vite +
plain Canvas 2D. No dependencies beyond the dev toolchain.

## Run

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # production bundle -> dist/
    npm run check      # type check
    npm run smoke      # headless interaction test (needs chromium)
    npm run p2         # P2 tool extras test
    ./go.sh            # one-click platform: start server + open browser
    ./go.sh stop       # stop the server (or just run ./go.sh again = toggle)

Open in any modern browser. Layout autosaves to localStorage.

## Visual pass (TV parity)

- Full TV palette sweep: line tools default **#2962FF**, down red **#F23645**, note sticky
  **#ffcf6e**; selection handles are white discs with a colored ring; hover shows the exact
  grab area; first touch grabs the whole object (TV-style).
- Gann fan & Gann box are now 2-click TV-style tools (per-line colors 1/8..8/8, labels,
  background opacity, corner rays, reverse, use-one-color).  Gann box grid 8×8.
- Regression trend: std-dev channel (0–3σ) + Pearson R chip.  Arrow: arrowhead option
  (end/both/none), price tag, stats chip.  Callout: 2 click (tail + bubble) + typed text.
- Note: tail + pin to price anchor.  Pitchfork/Schiff: TV blue + optional channel fill.
- Polyline can close into a polygon (click first point); brush has optional fill.
- Elliott: TV-style labels beside legs.  Flat top/bottom: chip + start tick.
- Interaction: click-vs-drag threshold (mouse 8px / touch 16px), free body-drag with magnet
  off, magnet weak = bar snap, strong = OHLC snap (TV semantics).

Research: `research/tv-visual-spec.md` (full spec + approximations).

 (v0.1)

Working today:
- **Chart core**: candles / bars / line / area, 9 timeframes (1m→1W), zoom (wheel),
  pan (drag), crosshair with OHLC chip, auto-fit (Home / ⛶), right price scale,
  bottom time scale, live status bar.
- **Mock feed**: deterministic OHLCV (AAPL, TSLA, BTCUSD, ETHUSD, EURUSD), realistic
  per-symbol tick size + volatility; multi-timeframe aggregation with caching.
- **34 working tools** — basics: trend line, ray, extended line, horizontal line/ray,
  vertical line, parallel channel, rectangle, text, price label, measure, fib
  retracement, eraser.
  **Volume**: anchored VWAP (±1σ/±2σ bands), fixed-range volume profile, anchored
  volume profile (TV row-binning algorithm, total/up-down/delta modes, value area,
  POC).
  **P2 wave**: trend angle, regression trend, flat top/bottom, crossline, pitchfork,
  Schiff pitchfork, Gann fan, Gann box, ellipse, circle, triangle, polyline, freehand
  brush, highlighter, arrow, note, callout, Elliott waves (1–5).
  Remaining TV taxonomy rows stay greyed out in the flyouts (arc, pin, flag, table,
  XABCD/ABCD, head & shoulders, three drives, position tools, fib extras…).
- **Object workflow**: selection + drag (body or anchors), settings dialog
  (double-click / right-click), right-click context menu, duplicate, lock/hide per
  object, lock-all / hide-all / remove-all, filters in the Objects panel,
  undo/redo (Ctrl+Z / Ctrl+Y), keyboard shortcuts, layout persistence.
- **Hunger for parity**: tool flyouts show the full TradingView tool taxonomy with
  P2 roadmapped items greyed out.

## Controls

| Key | Action |
|-----|--------|
| T/H/V/C/R | trendline / horizontal / vertical / parallel channel / rectangle |
| F / M / W / P | fib retracement / measure / anchored VWAP / fixed-range volume profile |
| X / L / E | text / price label / eraser |
| G / B / A / N / F2 | Gann fan / brush / arrow / note / pitchfork |
| P (shapes) | polyline: click points, Enter or double-click to finish |
| Esc | cancel gesture → deselect → back to cursor |
| Del | remove selected drawing |
| Ctrl+Z / Ctrl+Shift+Z | undo / redo |
| Home | fit chart |
| wheel | zoom · drag | pan |

## Architecture

    src/
      types.ts            core types, symbol definitions, timeframes
      feed.ts             mock OHLCV generator + aggregation (cached per TF)
      viewport.ts         data<->pixel transforms, zoom/pan
      render.ts           chart renderer (grid, axes, series, crosshair)
      store.ts            app state, undo/redo command stack, localStorage
      main.ts             interactions (gesture state machine), panels, dialogs
      drawings/
        model.ts          tool registry: defaults, settings schemas, flyout data
        render.ts         per-tool canvas renderers + hit testing
        computed.ts       AVWAP series, volume-profile binning (TV algorithm)
      feed_x.ts           lower-timeframe resolution (TV's <5000-bar chain)

Drawings are stored in data-space (`{time, price}` anchors) so they survive zoom,
pan, timeframe and symbol changes. Volume profiles recompute from a lower timeframe
following TradingView's documented chain (1,5,15,30,60,240,1D — first TF with
<5000 bars in range; chart TF fallback).

## Roadmap

- P2: remaining tools (Gann fan/square/box, patterns, pitchforks, brush, arrows,
  ghost feed…), chart-type extras (Heikin-Ashi), context-menu polish.
- P3: real data feeds (the mock feed is a drop-in `barsFor` adapter), alerts on
  drawings (trendline/hline/VWAP crossings).
- P4: indicator runtime — a TypeScript "pine-kit" API (`plot`, `plotshape`,
  label/box/line, series math) mirroring PineScript v5 semantics 1:1, so converted
  PineScript indicators render pixel-identically; later a full PineScript VM.

## Notes

- Personal use: no accounts, no cloud, layout stored in your browser.
- The 1m base series is generated once per symbol (170 days) and aggregated for
  other timeframes; heavy charts stay smooth via cached profiles + RAF batching.
