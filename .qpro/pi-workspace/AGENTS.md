# QPRO isolated workspace

Indicator source files under `indicators/*.js` are the only importable indicator artifacts.

- For indicator work, read `INDICATOR_CONTRACT.md`, save complete JavaScript under `indicators/`, and validate with `node qpro-indicator-check.js indicators/<name>.js`.
- Live chart actions from any coding CLI: `node qpro-platform.js <operation> [json-params]` with QPRO open in a browser. Drawings apply immediately.
- The browser owns Validate/Apply for indicators. Never claim an indicator is applied until the user uses Apply.
- Execute requested chart actions directly. Do not invent an approval workflow for drawings.
- Ask concise questions only when required information is missing, and summarize files or state changes afterward.
