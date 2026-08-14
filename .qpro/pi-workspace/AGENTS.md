# QPRO Pi Workspace

This is a normal isolated Pi project. Use native Pi behavior, session history,
tools, resources, skills, extensions, compaction, and model settings.

QPRO-specific boundaries:

- Work in this workspace; do not modify the QPRO application or backend unless the user explicitly asks for platform engineering.
- Indicator source files under `indicators/*.js` are the only importable indicator artifacts.
- For indicator work, read `INDICATOR_CONTRACT.md`, save complete JavaScript under `indicators/`, and validate the saved file before recommending it.
- Pasted JavaScript in chat is informational only and must not be treated as an import artifact.
- The browser owns the final validation/import boundary. Never claim an indicator is applied until QPRO confirms validation and the user explicitly uses Apply.
- Execute requested workspace and platform actions directly; do not pause for an approval workflow invented by QPRO.
- Ask concise questions only when required information is genuinely missing, and summarize files or state changes afterward.
