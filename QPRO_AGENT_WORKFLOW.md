# QPRO agent workflow

This is the shared operating contract for Pi, other coding CLIs, and human requests. Read this file, `AGENTS.md`, and `QPRO_INDICATOR_CONTRACT.md` before indicator work.

## Canonical source

- Edit only `.qpro/pi-workspace/indicators/<name>.js` for an existing indicator.
- The saved file is authoritative. Code pasted into chat is informational and must not be imported.
- Read the whole indicator source file when editing; candle-data scope is separate from source scope.

## Candle-range language

Interpret requests explicitly:

- “last N candles” / “final N bars” = exactly the final N loaded candles.
- “last N with M warmup” = calculate with M preceding context candles, but evaluate and report only the final N.
- “full history” / “all available candles” = no bar limit.
- If “more” or a range is ambiguous, ask for an exact count or boundary. Do not guess.
- If fewer than N candles are available, use all available and report the actual count.

The bounded command is:

```bash
node qpro-indicator-check.js indicators/<name>.js --live --bars N --warmup M --json
```

`--warmup M` is optional. The browser keeps its chart data, but only the requested window (plus explicit warmup) is passed to the indicator calculation. The server never receives the full candle series.

## Required workflow

1. Inspect the current indicator and relevant platform behavior.
2. Edit the saved indicator file, preserving unrelated behavior and creating a backup when appropriate.
3. Run local preflight:
   ```bash
   node qpro-indicator-check.js indicators/<name>.js
   ```
4. When QPRO is open, run bounded or full live validation as requested.
5. Report the requested window, available candles, evaluated candles, warmup, errors, and changed file.
6. Stop before Apply. Only the user can explicitly Apply through the browser.

Live validation checks runtime execution and returned line/marker/band/level/bar-color structures. It does not replace visual review, and it never applies a file.

## Chart drawings

Drawing actions are supported through the `qpro_platform` tool. Use `get_drawings` (or `get_state`) to obtain every chart drawing, including id, type, group, visibility, lock state, style, text, and all time/price anchors. For a drawing request, first read the relevant chart state/data when anchors are not supplied, then create the drawing and verify the returned state. Use chart coordinates, never screen pixels:

```json
{"operation":"create_drawing","params":{"type":"trendline","points":[{"time":1700000000,"price":100},{"time":1700100000,"price":110}],"style":{"color":"#2962ff"}}}
```

Common types include `trendline`, `ray`, `extended`, `arrow`, `horizontal`, `vertical`, `rectangle`, `fib`, `text`, and `path`. Preserve existing drawings; do not clear or delete them unless explicitly requested. Ask when a symbol, timeframe, anchor candles, price levels, or drawing type is ambiguous. A direct user request authorizes the requested drawing action, but the agent must report what it created and its anchors.

A user can mark an analysis range with the dedicated `analysisrange` tool under Positions (older `daterange` drawings remain readable). It always snaps to actual candles. Use `qpro_platform` `get_analysis_range` for the active marked range, or read `get_state`/`get_drawings` to identify its `drawingId`, then request only its candles with `qpro_platform` `get_data` using `params: {drawingId, limit}`. Alternatively use `fromTime`/`toTime` or `bars`. This gives the agent actual OHLCV rows for technical analysis without reading unrelated history. `get_data` and `analyze_data` operate on the active chart context and return its timeframe plus expected candle interval; they fail rather than silently mixing timeframes. Report truncation if the range exceeds the limit.

A candle is one row in the active chart context: on `15m`, adjacent normal candles are 900 seconds apart; on `1h`, 3600 seconds; on daily/weekly charts, the corresponding timeframe interval. Never derive candle count by dividing elapsed seconds by 60.
