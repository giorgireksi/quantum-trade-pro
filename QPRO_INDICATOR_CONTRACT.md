# QPRO indicator contract

An indicator is a JavaScript source file under `.qpro/pi-workspace/indicators/`. QPRO loads top-level `SETTINGS` and `calculate(data, settings, MathTA)` declarations directly from the file. Do not use `import`, `export`, `require`, `module.exports`, DOM APIs, network calls, or external libraries.

Input data is OHLCV bars:

```text
{ time, open, high, low, close, volume }
```

Return a plot model with `lines`, `markers`, `bands`, `levels`, and `barColors` arrays. Lines contain `{name, data:[{time,value}], color?, width?, pane?, type?, style?}`. Marker positions are `aboveBar`, `belowBar`, or `inBar`; supported shapes are `arrowUp`, `arrowDown`, `circle`, and `square`. Bands represent `fill()`/`bgcolor()`, levels represent `hline()`, and barColors represent `barcolor()` with optional body, border, and wick colors.

Use deterministic JavaScript, finite numeric values, preserved source timestamps, and deliberate warmup gaps. `MathTA` provides the documented technical-analysis helpers; translate Pine series and prior-bar/state semantics explicitly. Convert Pine inputs into `SETTINGS` entries rather than hard-coding user-adjustable values.

Overlay plots omit `pane`; oscillators use `pane:true`. Preserve Pine colors, transparency, widths, line gaps, marker positions, bands, levels, and candle colors as closely as QPRO supports. Strategies, multi-timeframe requests, alerts, drawings, tables, imports, and unsupported glyphs cannot be reproduced fully; preserve supported visuals and document omissions in comments or the summary.

After editing, run local preflight and live browser validation when available. Validation does not apply the file. Only the user’s explicit browser Apply action can change the chart.
