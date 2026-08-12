import { Type } from "typebox";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const stateFile = (cwd: string, name: string) => join(cwd, `.qpro-${name}.json`);
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

export default function qproTools(pi: ExtensionAPI) {
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
    name: "qpro_update_plan",
    label: "Update QPRO Plan",
    description: "Create or update the visible QPRO indicator implementation plan. Use before multi-step indicator work.",
    parameters: Type.Object({
      steps: Type.Array(Type.Object({ text: Type.String(), done: Type.Optional(Type.Boolean()) })),
      current: Type.Optional(Type.String()),
    }),
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
}
