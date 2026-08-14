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
