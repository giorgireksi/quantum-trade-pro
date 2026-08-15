# Quantum Trade Pro workspace

Use native coding-agent behavior. The browser is the chart authority; this repository is the QPRO application and its isolated indicator workspace. For shared request/range semantics, read `QPRO_AGENT_WORKFLOW.md`.

## Live chart actions

QPRO must be open in a browser. Drawings and other chart actions apply immediately.

```bash
node qpro-platform.js list_operations
node qpro-platform.js get_state
node qpro-platform.js get_data '{"bars":200}'
node qpro-platform.js create_drawing '{"type":"trendline","points":[{"time":1700000000,"price":100},{"time":1700100000,"price":110}]}'
```

Use chart time/price anchors, never screen pixels. Read `get_state` / `get_data` / `get_drawings` before drawing when anchors are not supplied. Do not PUT `/api/qpro/workspace` to mutate the chart.

## Indicator work

- Indicator source files live at `.qpro/pi-workspace/indicators/*.js` and are the only import source.
- Read `QPRO_INDICATOR_CONTRACT.md` before creating or changing an indicator.
- Run `node qpro-indicator-check.js indicators/<name>.js` for local preflight. Add `--live` when QPRO is open to validate against current chart data; use `--bars N` and optional `--warmup M` to limit the validation window.
- Never claim an indicator is applied. The browser-owned Validate/Apply boundary is required.
- Preserve unrelated behavior, keep backups, and summarize the exact file changed.

For ordinary application work, edit only what the request requires. Do not change chart state or indicator files unless requested.
