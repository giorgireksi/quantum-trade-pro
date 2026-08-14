import { Type } from "typebox";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync, copyFileSync, chmodSync } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function filesUnder(root: string, dir = root): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    if (entry.isDirectory()) out.push(...filesUnder(root, full));
    else out.push(relative(root, full));
  }
  return out;
}
function backupIndicatorBeforeWrite(cwd: string, target: string) {
  const absolute = resolvePath(cwd, target);
  const root = resolvePath(cwd, "indicators");
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith("..") || rel.includes("/..") || resolvePath(rel) === rel || !existsSync(absolute)) return;
  const backupRoot = join(cwd, ".qpro-backups", "indicators");
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  const safe = rel.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const backup = join(backupRoot, `${Date.now()}-${safe}.bak`);
  copyFileSync(absolute, backup);
  try { chmodSync(backup, 0o600); } catch {}
  return relative(cwd, backup);
}
function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Request cancelled")); }, { once: true });
  });
}
function chartRequestFile(cwd: string, id: string) {
  return join(cwd, `.qpro-chart-request-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}
async function requestChartAction(cwd: string, toolCallId: string, action: string, params: any, signal?: AbortSignal) {
  const file = chartRequestFile(cwd, toolCallId);
  // The browser may answer immediately after tool_start, before this
  // extension callback creates its request file. Preserve a completed early
  // response instead of overwriting it with a fresh pending request.
  let completed: any = null;
  if (existsSync(file)) {
    try {
      const existing = JSON.parse(readFileSync(file, "utf8"));
      if (existing?.result !== undefined || existing?.error) completed = existing;
    } catch { /* tolerate an in-progress write */ }
  }
  if (!completed) writeFileSync(file, JSON.stringify({ type: "chart_request", requestId: toolCallId, action, params, decision: "pending", createdAt: Date.now() }, null, 2));
  const deadline = Date.now() + 30000;
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Request cancelled");
      if (Date.now() >= deadline) throw new Error("QPRO chart request timed out; the browser may be disconnected");
      if (existsSync(file)) {
        let value: any;
        try { value = JSON.parse(readFileSync(file, "utf8")); }
        catch { continue; } // Browser may be midway through an atomic write.
        if (value?.error) throw new Error(String(value.error));
        if (value?.result !== undefined) return value.result;
      }
      await sleep(250, signal);
    }
  } finally { try { unlinkSync(file); } catch {} }
}
export default function qproTools(pi: ExtensionAPI) {
  // Keep indicator writes auditable by backing up the previous source file.
  // Normal isolated workspace actions execute directly; the browser owns the
  // separate validation and explicit Apply boundary.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const target = String(event.input?.path || event.input?.file || "");
      if (/^indicators(?:[\\/]|$)/i.test(target) || target.startsWith(ctx.cwd + "/indicators/")) {
        backupIndicatorBeforeWrite(ctx.cwd, target);
      }
    }
    // QPRO runs in its isolated workspace and does not pause tool execution
    // for interactive approvals. Every action is reported in the Pi trace;
    // indicator edits are backed up before writing.
  });
  pi.registerCommand("qpro-status", {
    description: "Show QPRO indicator workspace status",
    handler: async (_args, ctx) => {
      const indicators = filesUnder(join(ctx.cwd, "indicators")).filter(path => path.endsWith(".js"));
      ctx.ui.notify(`QPRO workspace: ${indicators.length} indicator file(s)`, "info");
    },
  });
  pi.registerTool({
    name: "qpro_platform",
    label: "QPRO Platform",
    promptSnippet: "Use for explicit chart, market-data, watchlist, alert, workspace, layout, replay, or platform actions; choose the smallest operation and verify writes.",
    description: "Lazy gateway to QPRO platform capabilities. Use only when the user request needs live platform state or an action; do not inspect everything by default. Choose one operation per need. Read operations: get_state, get_data_summary, get_data (bounded candle rows by bars, time range, or drawingId), analyze_data, get_watchlist, get_alerts, get_settings, get_workspace_summary, get_indicator_settings, get_action_history. Action operations: switch_symbol, set_timeframe, set_type, set_indicator, set_indicator_settings, create_drawing, delete_drawing, clear_drawings, create_alert, delete_alert, set_setting, set_layout, replay_control, create_drawing_group, update_drawing_group, delete_drawing_group, switch_tab, undo, redo, apply_template. Ask for clarification when parameters are missing; verify results after consequential actions.",
    parameters: Type.Object({ operation: Type.String(), params: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
    async execute(id, params, signal, _onUpdate, ctx) {
      const operation=String(params.operation || "").trim();
      const operationParams=params.params || {};
      if (!operation) throw new Error("platform operation is required");
      const result=await requestChartAction(ctx.cwd,id,"platform",{operation,params:operationParams},signal);
      return {content:[{type:"text",text:JSON.stringify(result)}],details:{operation}};
    },
  });
  pi.registerTool({
    name: "qpro_indicator_validate",
    label: "Validate Indicator File",
    description: "Validate an indicator file already saved under indicators/ against the live QPRO contract and dry-run it on current chart data without applying it.",
    parameters: Type.Object({ path: Type.String() }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "validate_indicator", params, signal)) }], details: { path: params.path } }; },
  });
}
