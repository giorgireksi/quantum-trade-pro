import { Type } from "typebox";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const stateFile = (cwd: string, name: string) => join(cwd, `.qpro-${name}.json`);
const approvalFile = (cwd: string, id: string) => join(cwd, `.qpro-approval-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
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
  writeFileSync(file, JSON.stringify({ type: "chart_request", requestId: toolCallId, action, params, decision: "pending", createdAt: Date.now() }, null, 2));
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Request cancelled");
      if (existsSync(file)) {
        try {
          const value = JSON.parse(readFileSync(file, "utf8"));
          if (value.result !== undefined || value.error) {
            if (value.error) throw new Error(String(value.error));
            return value.result;
          }
        } catch (error) {
          if (error instanceof Error && /Request cancelled|Chart action failed|^Error:/.test(error.message)) throw error;
        }
      }
      await sleep(250, signal);
    }
  } finally { try { unlinkSync(file); } catch {} }
}
function needsApproval(event: any, cwd: string) {
  const name = String(event.toolName || "");
  const input = event.input || {};
  if (name === "bash") {
    const command = String(input.command || "");
    return /(^|[;&|\n])\s*(sudo|rm\b|mkfs\b|dd\b|shutdown\b|reboot\b)|rm\s+[^\n]*(?:-r|-f)|git\s+reset\s+--hard|git\s+clean\s+-f|(?:npm|pnpm|yarn|pip)\s+install|curl\s+[^\n]*\|\s*(?:sh|bash)|chmod\s+777|>\s*\/|\bkill\s+-9/i.test(command);
  }
  if (name === "write" || name === "edit") {
    const target = String(input.path || input.file || "");
    if (!target) return false;
    const absolute = target.startsWith("/") ? target : join(cwd, target);
    return !(absolute === cwd || absolute.startsWith(cwd + "/"));
  }
  return false;
}
async function waitForDecision(file: string, signal?: AbortSignal) {
  while (true) {
    if (existsSync(file)) {
      try {
        const value = JSON.parse(readFileSync(file, "utf8"));
        if (value.decision === "approve" || value.decision === "reject" || value.answer !== undefined) return value;
      } catch { /* wait for a complete JSON write */ }
    }
    await sleep(250, signal);
  }
}

export default function qproTools(pi: ExtensionAPI) {
  // Enforce approval for genuinely consequential built-in operations. Normal
  // indicator reads/edits stay frictionless; risky shell commands and paths
  // outside the isolated workspace pause until the browser decides.
  pi.on("tool_call", async (event, ctx) => {
    if (!needsApproval(event, ctx.cwd)) return;
    const file = approvalFile(ctx.cwd, event.toolCallId);
    const input = event.input || {};
    const detail = event.toolName === "bash" ? String(input.command || "") : String(input.path || input.file || "");
    writeFileSync(file, JSON.stringify({ type: "approval", action: `${event.toolName}: ${detail}`, reason: "This operation can modify data outside the normal QPRO indicator workflow.", risk: "high", decision: "pending", createdAt: Date.now() }, null, 2));
    try {
      const decision = await waitForDecision(file, ctx.signal);
      if (decision.decision !== "approve") return { block: true, reason: "Blocked by QPRO user approval" };
    } catch (error) {
      return { block: true, reason: String(error instanceof Error ? error.message : error) };
    } finally { try { unlinkSync(file); } catch {} }
  });
  pi.registerCommand("qpro-status", {
    description: "Show QPRO indicator workspace status",
    handler: async (_args, ctx) => {
      const indicators = filesUnder(join(ctx.cwd, "indicators")).filter(path => path.endsWith(".js"));
      ctx.ui.notify(`QPRO workspace: ${indicators.length} indicator file(s)`, "info");
    },
  });
  pi.registerCommand("qpro-plan", {
    description: "Show the current QPRO indicator plan",
    handler: async (_args, ctx) => {
      const file = stateFile(ctx.cwd, "plan");
      if (!existsSync(file)) return ctx.ui.notify("No QPRO plan exists yet.", "info");
      const plan = JSON.parse(readFileSync(file, "utf8"));
      ctx.ui.notify(plan.steps?.map((step: any) => `${step.done ? "✓" : "○"} ${step.text}`).join("\n") || "Empty plan", "info");
    },
  });
  pi.registerTool({
    name: "qpro_get_workspace_context",
    label: "QPRO Workspace Context",
    description: "Remind the agent to read the QPRO indicator contract, architecture, and workspace files before indicator work.",
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: "text", text: "Read AGENTS.md, INDICATOR_CONTRACT.md, and QPRO_ARCHITECTURE.md with the read tool. Work in indicators/*.js and let the browser validate code before import." }], details: {} };
    },
  });
  pi.registerTool({
    name: "qpro_get_chart_context",
    label: "QPRO Chart Context",
    description: "Read the latest symbol, timeframe, selected indicators, notes, and chart context supplied by Quantum Trade Pro.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const file=join(ctx.cwd,"QPRO_CHART_CONTEXT.md");
      return {content:[{type:"text",text:existsSync(file)?readFileSync(file,"utf8"):"No live chart context has been supplied yet."}],details:{path:file}};
    },
  });
  pi.registerTool({
    name: "qpro_indicator_list",
    label: "QPRO Built-in Indicators",
    description: "List all built-in QPRO indicators and whether each is currently active on the chart.",
    parameters: Type.Object({}),
    async execute(id, _params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "list_indicators", {}, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_indicator_set",
    label: "Set Built-in Indicator",
    description: "Enable or disable a built-in QPRO indicator by its id. This changes the chart immediately after the semantic request is confirmed by the platform.",
    parameters: Type.Object({ id: Type.String(), enabled: Type.Boolean() }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "set_indicator", params, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_chart_get_state",
    label: "QPRO Chart State",
    description: "Read the live QPRO chart symbol, timeframe, chart type, indicators, drawings, and bar count.",
    parameters: Type.Object({}),
    async execute(id, _params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "get_state", {}, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_chart_switch_symbol",
    label: "Switch Chart Symbol",
    description: "Switch the active QPRO chart symbol using the platform's semantic chart API.",
    parameters: Type.Object({ symbol: Type.String() }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "switch_symbol", params, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_chart_set_timeframe",
    label: "Set Chart Timeframe",
    description: "Change the active QPRO chart timeframe, preserving the platform's imported-data rules.",
    parameters: Type.Object({ timeframe: Type.String() }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "set_timeframe", params, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_chart_set_type",
    label: "Set Chart Type",
    description: "Change the QPRO chart type, such as candles, bars, line, area, or heikinashi.",
    parameters: Type.Object({ type: Type.String() }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "set_type", params, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_chart_drawings",
    label: "List Chart Drawings",
    description: "List semantic chart drawing objects with their logical time/price points.",
    parameters: Type.Object({}),
    async execute(id, _params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "list_drawings", {}, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_chart_create_drawing",
    label: "Create Chart Drawing",
    description: "Create a drawing using logical time/price points. Use only when the user requested a chart annotation.",
    parameters: Type.Object({ type: Type.String(), points: Type.Array(Type.Object({ time: Type.Number(), price: Type.Number() })), style: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "create_drawing", params, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_chart_delete_drawing",
    label: "Delete Chart Drawing",
    description: "Delete a chart drawing after the user has clearly requested that deletion.",
    parameters: Type.Object({ id: Type.String() }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "delete_drawing", params, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_chart_clear_drawings",
    label: "Clear Chart Drawings",
    description: "Remove all chart drawings after the user has clearly requested it.",
    parameters: Type.Object({}),
    async execute(id, _params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "clear_drawings", {}, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_indicator_validate",
    label: "Validate Indicator",
    description: "Validate indicator JavaScript against the live QPRO contract and dry-run it on current chart data without importing it.",
    parameters: Type.Object({ code: Type.String() }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "validate_indicator", params, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_indicator_import",
    label: "Review and Import Indicator",
    description: "Stage a validated indicator for browser review. QPRO shows the code, validation result, and Apply/Reject controls; never claim it is applied until the user clicks Apply.",
    parameters: Type.Object({ name: Type.String(), code: Type.String(), notes: Type.Optional(Type.String()), settings: Type.Optional(Type.Record(Type.String(), Type.Any())) }),
    async execute(id, params, signal, _onUpdate, ctx) { return { content: [{ type: "text", text: JSON.stringify(await requestChartAction(ctx.cwd, id, "import_indicator", params, signal)) }], details: {} }; },
  });
  pi.registerTool({
    name: "qpro_update_plan",
    label: "Update QPRO Plan",
    description: "Create or update the visible QPRO indicator implementation plan. Use before multi-step indicator work.",
    parameters: Type.Object({ steps: Type.Array(Type.Object({ text: Type.String(), done: Type.Optional(Type.Boolean()) })), current: Type.Optional(Type.String()) }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const plan = { steps: params.steps.map(step => ({ text: step.text, done: step.done === true })), current: params.current || "", updatedAt: Date.now() };
      writeFileSync(stateFile(ctx.cwd, "plan"), JSON.stringify(plan, null, 2));
      return { content: [{ type: "text", text: `QPRO plan updated: ${plan.steps.length} step(s).` }], details: plan };
    },
  });
  pi.registerTool({
    name: "qpro_checkpoint",
    label: "QPRO Checkpoint",
    description: "Save a named checkpoint note for the current indicator task.",
    parameters: Type.Object({ name: Type.String(), summary: Type.String() }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const file = stateFile(ctx.cwd, "checkpoints");
      const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
      all.push({ name: params.name, summary: params.summary, createdAt: Date.now() });
      writeFileSync(file, JSON.stringify(all, null, 2));
      return { content: [{ type: "text", text: `Checkpoint saved: ${params.name}` }], details: { name: params.name } };
    },
  });
  pi.registerTool({
    name: "qpro_request_approval",
    label: "QPRO Approval",
    description: "Pause and ask the QPRO user for approval before applying indicator changes, deleting files, or performing a consequential action. Never claim approval without receiving it.",
    parameters: Type.Object({ action: Type.String(), reason: Type.String(), risk: Type.Optional(Type.String()) }),
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const file = approvalFile(ctx.cwd, toolCallId);
      writeFileSync(file, JSON.stringify({ type: "approval", action: params.action, reason: params.reason, risk: params.risk || "normal", decision: "pending", createdAt: Date.now() }, null, 2));
      try {
        const decision = await waitForDecision(file, signal);
        return { content: [{ type: "text", text: decision.decision === "approve" ? `Approved: ${params.action}` : `Rejected by user: ${params.action}` }], details: { approved: decision.decision === "approve", action: params.action } };
      } finally { try { unlinkSync(file); } catch {} }
    },
  });
  pi.registerTool({
    name: "qpro_ask_user",
    label: "QPRO Question",
    description: "Ask the user a blocking question when an indicator decision is genuinely ambiguous. Prefer choices when possible.",
    parameters: Type.Object({ question: Type.String(), choices: Type.Optional(Type.Array(Type.String())) }),
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const file = approvalFile(ctx.cwd, toolCallId);
      writeFileSync(file, JSON.stringify({ type: "question", question: params.question, choices: params.choices || [], answer: undefined, createdAt: Date.now() }, null, 2));
      try {
        const answer = await waitForDecision(file, signal);
        return { content: [{ type: "text", text: `User answer: ${String(answer.answer)}` }], details: { answer: answer.answer } };
      } finally { try { unlinkSync(file); } catch {} }
    },
  });
}
