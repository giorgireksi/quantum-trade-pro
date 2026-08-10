// ChartLab visual pass suite — run AFTER the visual pass lands.
// Target spec (parent's visual pass):
//   - palette sweep: no #4c8dff anywhere in src; line tools default #2962ff (TV blue)
//   - Gann fan / Gann box: 2-click geometry (pivot + scale) with per-line colors/labels
//   - regression trend: TV-style (2 anchors, blue)
//   - arrow: heads/stats option, blue default
//   - elliott: labels beside legs, TV blue default
//   - callout: 2-anchor (tail tip + bubble), note: tail connector
//   - polyline close option, brush fill option (soft checks — print-only)
// Run: node test/visual.mjs   (or npm run visual)
// NOTE: some checks are marked SOFT — they print INFO instead of failing, because
// the exact field names/flow of the visual pass are design decisions.
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const ROOT = "/home/reksi/mar";
const PORT = 4189;
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : ""));
  if (!ok) failures++;
};
const info = (name, extra) => console.log("INFO  " + name + (extra ? "  [" + extra + "]" : ""));
const norm = h => String(h ?? "").toLowerCase();
const TV_BLUE = "#2962ff";

// ============ PART A: static source checks ============
console.log("--- PART A: static source ---");
const srcFiles = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts")) srcFiles.push(p);
  }
})(join(ROOT, "src"));
const allSrc = srcFiles.map(p => readFileSync(p, "utf8")).join("\n");

// A1: old blue completely gone (palette sweep)
const oldBlueCount = (allSrc.match(/#4c8dff/gi) || []).length;
check("no #4c8dff remains in src", oldBlueCount === 0, "matches=" + oldBlueCount);

// A2: core line tools default to TV blue (case-insensitive; regex per tool block is fiddly, so
//     scan each tool's `defaults: {...}` segment right after `type: "<tool>"`)
function defaultColorOf(src, type) {
  const i = src.indexOf(`type: "${type}"`);
  if (i < 0) return null;
  const j = src.indexOf("defaults:", i);
  const segment = src.slice(j, j + 220);
  const m = segment.match(/color:\s*"([^"]+)"/);
  return m ? m[1] : null;
}
for (const tool of ["trendline", "ray", "extended", "arrow", "gannfan", "gannbox", "regression", "trendangle", "crossline"]) {
  const c = defaultColorOf(allSrc, tool);
  check(`default color of ${tool} is TV blue`, norm(c) === TV_BLUE, String(c));
}

// A3: Gann fan/box are 2-click now
function clicksOf(src, type) {
  const i = src.indexOf(`type: "${type}"`);
  const m = src.slice(i, i + 260).match(/clicks:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
check("gannfan clicks = 2", clicksOf(allSrc, "gannfan") === 2, "clicks=" + clicksOf(allSrc, "gannfan"));
check("gannbox clicks = 2", clicksOf(allSrc, "gannbox") === 2, "clicks=" + clicksOf(allSrc, "gannbox"));

// A4: callout is 2-click (tail tip + bubble)
check("callout clicks = 2", clicksOf(allSrc, "callout") === 2, "clicks=" + clicksOf(allSrc, "callout"));

// A5: elliott stays 5-click, TV blue, labels on
const ellSeg = allSrc.slice(allSrc.indexOf('type: "elliott"'), allSrc.indexOf('type: "elliott"') + 320);
check("elliott clicks = 5", /clicks:\s*5/.test(ellSeg), "");
check("elliott default TV blue", norm(defaultColorOf(allSrc, "elliott")) === TV_BLUE, String(defaultColorOf(allSrc, "elliott")));
check("elliott showLabels default true", /showLabels:\s*true/.test(ellSeg), "");

// A6: SOFT — arrow heads/stats, polyline close, brush fill, regression channel (field existence)
const arrowSeg = allSrc.slice(allSrc.indexOf('type: "arrow"'), allSrc.indexOf('type: "arrow"') + 420);
info("arrow schema has heads/stats field", /"(heads|stats|showStats|head)"/.test(arrowSeg) ? "found" : "not found (soft)");
const polySeg = allSrc.slice(allSrc.indexOf('type: "polyline"'), allSrc.indexOf('type: "polyline"') + 420);
info("polyline schema has close field", /"close"/.test(polySeg) ? "found" : "not found (soft)");
const brushSeg = allSrc.slice(allSrc.indexOf('type: "brush"'), allSrc.indexOf('type: "brush"') + 420);
info("brush has fill/alpha field", /"(fill|alpha)"/.test(brushSeg) ? "found" : "not found (soft)");
const regSeg = allSrc.slice(allSrc.indexOf('type: "regression"'), allSrc.indexOf('type: "regression"') + 420);
info("regression has channel field", /"(channel|showChannel)"/.test(regSeg) ? "found" : "not found (soft)");

// ============ PART B: app-level checks ============
console.log("--- PART B: app-level ---");
const server = await createServer({ root: ROOT, server: { port: PORT }, logLevel: "error", appType: "mpa" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);

const box = await page.locator("#cv").boundingBox();
const cx = fx => box.x + box.width * fx;
const cy = fy => box.y + box.height * fy;

async function pickTool(groupIdx, label) {
  await page.locator(".railgroup").nth(groupIdx).locator("button.railbtn.group").click();
  await page.locator(".flyrow", { has: page.locator("span.fn", { hasText: new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }) }).click();
  await page.waitForTimeout(130);
}
async function clickN(pts) {
  for (const [fx, fy] of pts) await page.mouse.click(cx(fx), cy(fy));
  await page.waitForTimeout(180);
}
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("chartlab.layout.v1") || "{}"));
let n = 0;
const expectObj = async (name) => { n++; const c = await page.textContent("#objcnt"); check(name, c === String(n), "cnt=" + c); };
const dlgColor = async () => {
  const v = await page.locator('#dlg input[data-key="color"]').first().inputValue();
  await page.click("#dlgclose");
  return norm(v);
};

// B1: trendline — stored default + rendered pixels + settings dialog value
await page.keyboard.press("t");
await clickN([[0.2, 0.7], [0.5, 0.35]]);
await expectObj("trendline created");
const tl = (await saved()).drawings?.find(d => d.type === "trendline");
check("trendline stored color is TV blue", norm(tl?.settings?.color) === TV_BLUE, String(tl?.settings?.color));
const px = await page.evaluate(() => {
  const cv = document.getElementById("cv");
  const c = cv.getContext("2d");
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  let blue = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.abs(r - 0x29) < 45 && Math.abs(g - 0x62) < 45 && Math.abs(b - 0xff) < 45) blue++;
  }
  return blue;
});
check("canvas renders TV-blue pixels", px > 30, "samples=" + px);
await page.mouse.dblclick(cx(0.35), cy(0.525)); // trendline midpoint
await page.waitForTimeout(200);
const dlgVisible = await page.locator("#dlg").evaluate(el => !el.hidden);
check("double-click opens settings dialog", dlgVisible);
const dlgCol = await dlgColor();
check("dialog color input matches TV blue", dlgCol === TV_BLUE, "color=" + dlgCol);

// B2: Gann fan — 2 clicks, 2 anchors, capture scale kept
await page.keyboard.press("g");
await clickN([[0.3, 0.3], [0.5, 0.45]]);
await expectObj("gannfan created (2 clicks)");
const gf = (await saved()).drawings?.find(d => d.type === "gannfan");
check("gannfan has 2 anchors", gf?.anchors?.length === 2, "n=" + gf?.anchors?.length);
check("gannfan keeps capture scale", !!gf?.settings?.capture?.bars && !!gf?.settings?.capture?.span, JSON.stringify(gf?.settings?.capture));
check("gannfan default color TV blue", norm(gf?.settings?.color) === TV_BLUE, String(gf?.settings?.color));

// B3: Gann box — 2 clicks, 2 anchors
await pickTool(1, "Gann box");
await clickN([[0.62, 0.3], [0.82, 0.62]]);
await expectObj("gannbox created (2 clicks)");
const gb = (await saved()).drawings?.find(d => d.type === "gannbox");
check("gannbox has 2 anchors", gb?.anchors?.length === 2, "n=" + gb?.anchors?.length);

// B4: regression — 2 anchors, TV blue
await pickTool(0, "Regression trend");
await clickN([[0.1, 0.2], [0.3, 0.44]]);
await expectObj("regression created");
const rg = (await saved()).drawings?.find(d => d.type === "regression");
check("regression has 2 anchors", rg?.anchors?.length === 2, "n=" + rg?.anchors?.length);
check("regression default color TV blue", norm(rg?.settings?.color) === TV_BLUE, String(rg?.settings?.color));

// B5: arrow — TV blue; heads/stats soft
await page.keyboard.press("a");
await clickN([[0.06, 0.8], [0.16, 0.9]]);
await expectObj("arrow created");
const ar = (await saved()).drawings?.find(d => d.type === "arrow");
check("arrow default color TV blue", norm(ar?.settings?.color) === TV_BLUE, String(ar?.settings?.color));
info("arrow heads/stats stored", ar?.settings && ("heads" in ar.settings || "stats" in ar.settings) ? JSON.stringify(ar.settings.heads ?? ar.settings.stats) : "not present (soft)");

// B6: callout — 2-click flow (tail + bubble); text input if the flow asks for it
await pickTool(3, "Callout");
await page.mouse.click(cx(0.9), cy(0.75));
await page.mouse.click(cx(0.97), cy(0.6));
await page.waitForTimeout(200);
if (await page.isVisible("#textinput")) { await page.keyboard.type("ok"); await page.keyboard.press("Enter"); await page.waitForTimeout(300); }
n++;
const cnt = await page.textContent("#objcnt");
if (cnt === String(n)) {
  check("callout created (2-click flow)", true);
  const co = (await saved()).drawings?.find(d => d.type === "callout");
  check("callout has 2 anchors", co?.anchors?.length === 2, "n=" + co?.anchors?.length);
} else {
  info("callout flow differs (not created by 2 clicks + optional text)", "cnt=" + cnt + " (soft — confirm flow shape)");
  n--;
}

// B7: elliott — 5 anchors, labels on, TV blue (flyout label is "Elliott waves")
await pickTool(4, "Elliott waves");
await clickN([[0.5, 0.7], [0.565, 0.55], [0.63, 0.68], [0.695, 0.48], [0.76, 0.62]]);
await expectObj("elliott created");
const el = (await saved()).drawings?.find(d => d.type === "elliott");
check("elliott has 5 anchors", el?.anchors?.length === 5, "n=" + el?.anchors?.length);
check("elliott showLabels true", el?.settings?.showLabels === true, String(el?.settings?.showLabels));
check("elliott default color TV blue", norm(el?.settings?.color) === TV_BLUE, String(el?.settings?.color));

// B8: polyline — close option soft
await pickTool(2, "Polyline");
await clickN([[0.24, 0.85], [0.36, 0.8], [0.46, 0.86]]);
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await expectObj("polyline created");
const pl = (await saved()).drawings?.find(d => d.type === "polyline");
info("polyline close flag", pl?.settings && "close" in pl.settings ? String(pl.settings.close) : "not present (soft)");

// B9: brush — fill/alpha soft
await page.keyboard.press("b");
await page.mouse.move(cx(0.55), cy(0.12));
await page.mouse.down();
await page.mouse.move(cx(0.7), cy(0.08), { steps: 5 });
await page.mouse.move(cx(0.75), cy(0.22), { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(200);
await expectObj("brush created");
const br = (await saved()).drawings?.find(d => d.type === "brush");
info("brush fill/alpha stored", br?.settings && ("fill" in br.settings || "alpha" in br.settings) ? JSON.stringify(br.settings.fill ?? br.settings.alpha) : "not present (soft)");

// B10: reload persistence + page errors
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
const cntR = await page.textContent("#objcnt");
check("visual-suite drawings survive reload", cntR === String(n), "cnt=" + cntR);
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));

await browser.close();
await server.close();
console.log(failures === 0 ? "\nALL VISUAL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
