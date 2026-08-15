# QPRO agent workflow

This is the shared operating contract for Cursor, Claude Code, Codex, and other coding CLIs. Read this file, `AGENTS.md`, and `QPRO_INDICATOR_CONTRACT.md` before indicator or chart work.

Live chart actions require an open QPRO tab. Coding CLIs call:

```bash
node qpro-platform.js <operation> [json-params]
```

Do not use PUT `/api/qpro/workspace` as an action API.

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

The bounded indicator command is:

```bash
node qpro-indicator-check.js indicators/<name>.js --live --bars N --warmup M --json
```

`--warmup M` is optional. The browser keeps its chart data, but only the requested window (plus explicit warmup) is passed to the indicator calculation. The server never receives the full candle series.

Bounded candle reads for analysis:

```bash
node qpro-platform.js get_data '{"bars":200}'
node qpro-platform.js get_data '{"fromTime":1700000000,"toTime":1700100000}'
node qpro-platform.js get_analysis_range
```

## Required indicator workflow

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

Drawing actions apply immediately on the open chart. Use `get_drawings` or `get_state` first when anchors are not supplied. Use chart coordinates, never screen pixels:

```bash
node qpro-platform.js create_drawing '{"type":"trendline","points":[{"time":1700000000,"price":100},{"time":1700100000,"price":110}],"style":{"color":"#2962ff"}}'
```

Common types include `trendline`, `ray`, `extended`, `arrow`, `horizontal`, `support`, `resistance`, `rectangle`, `fib`, `vprofile`, `anchoredvwap`, `text`, and `path`. Fixed-range volume profiles use two candle anchors and `settings.rows` / `settings.valueArea`; anchored VWAP uses one candle anchor and optional `settings.source` / `settings.bands`. Use `move_drawing`, `move_drawing_anchor`, or `update_drawing` for existing objects. Preserve existing drawings; do not clear or delete them unless explicitly requested. Ask when a symbol, timeframe, anchor candles, price levels, or drawing type is ambiguous. A direct user request authorizes the requested drawing action. Report what was created and its anchors.

A user can mark one or more analysis ranges with the dedicated `analysisrange` tool under Positions (older `daterange` drawings remain readable). It always snaps to actual candles. Use `get_analysis_range` for the selected range; the response includes `activeRangeId` and all available ranges. If no range is selected, it uses the most recently created one. Pass an explicit range `id` to analyze another range, or read `get_state`/`get_drawings` to identify it, then request only its candles with `get_data` using `{"drawingId":"...","limit":2000}`. Alternatively use `fromTime`/`toTime` or `bars`. `get_data` and `analyze_data` operate on the active chart context and return its timeframe plus expected candle interval; they fail rather than silently mixing timeframes. Report truncation if the range exceeds the limit.

A candle is one row in the active chart context: on `15m`, adjacent normal candles are 900 seconds apart; on `1h`, 3600 seconds; on daily/weekly charts, the corresponding timeframe interval. Never derive candle count by dividing elapsed seconds by 60.
