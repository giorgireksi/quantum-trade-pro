# Quantum Trade Pro workspace

Use native coding-agent behavior. The browser is the chart authority; this repository is the QPRO application and its isolated indicator workspace.

## Indicator work

- Indicator source files live at `.qpro/pi-workspace/indicators/*.js` and are the only import source.
- Read `QPRO_INDICATOR_CONTRACT.md` before creating or changing an indicator.
- Use normal tools and inspect the relevant source/history; do not invent a pasted-code import workflow.
- Run `node qpro-indicator-check.js indicators/<name>.js` for local preflight. Add `--live` when QPRO is open to validate against current chart data; use `--bars N` and optional `--warmup M` to limit the validation window.
- Never claim an indicator is applied. The browser-owned Validate/Apply boundary is required.
- Preserve unrelated behavior, keep backups, and summarize the exact file changed.

For ordinary application work, edit only what the request requires. Do not change chart state or indicator files unless requested.
