// ChartLab P2 extras smoke: trend angle, regression, flat top, crossline,
// pitchfork, schiff, gann box, ellipse, circle, triangle, callout, highlighter.
import { chromium } from "playwright-core";
import { createServer } from "vite";

const PORT = 4188;
const server = await createServer({ root: "/home/reksi/mar", server: { port: PORT }, logLevel: "error", appType: "mpa" });
await server.listen();

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : ""));
  if (!ok) failures++;
};

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
  await page.waitForTimeout(160);
}
let cnt = "", n = 0;
const expect = async (name) => {
  n++;
  cnt = await page.textContent("#objcnt");
  check(name, cnt === String(n), "cnt=" + cnt);
};

// en masse: trend extras
await pickTool(0, "Trend angle");
await clickN([[0.08, 0.3], [0.22, 0.22]]); await expect("trendangle added");
await pickTool(0, "Regression trend");
await clickN([[0.08, 0.14], [0.26, 0.3]]); await expect("regression added");
await pickTool(0, "Flat top / bottom");
await clickN([[0.3, 0.15], [0.46, 0.5]]); await expect("flattop added");
await pickTool(0, "Crossline");
await clickN([[0.5, 0.2], [0.66, 0.4]]); await expect("crossline added");
await pickTool(0, "Pitchfork");
await clickN([[0.24, 0.78], [0.36, 0.3], [0.48, 0.6]]); await expect("pitchfork added");
await pickTool(0, "Schiff pitchfork");
await clickN([[0.56, 0.8], [0.7, 0.34], [0.86, 0.68]]); await expect("schiff added");

// gann box (two corners)
await pickTool(1, "Gann box");
await clickN([[0.3, 0.42], [0.52, 0.5]]); await expect("gannbox added");

// shapes
await pickTool(2, "Ellipse");
await clickN([[0.6, 0.62], [0.8, 0.8]]); await expect("ellipse added");
await pickTool(2, "Circle");
await clickN([[0.88, 0.36], [0.93, 0.55]]); await expect("circle added");
await pickTool(2, "Triangle");
await clickN([[0.5, 0.86], [0.62, 0.95], [0.72, 0.82]]); await expect("triangle added");

// callout (annotations group): tail point + bubble point, then typed text
await pickTool(3, "Callout");
await page.mouse.click(cx(0.92), cy(0.78));
await page.mouse.click(cx(0.68), cy(0.38));
await page.waitForTimeout(150);
if (!(await page.isVisible("#textinput"))) check("callout opens text input", false, "");
await page.keyboard.type("buy zone");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
n++;
cnt = await page.textContent("#objcnt");
check("callout added", cnt === String(n), "cnt=" + cnt);

// highlighter drag
await pickTool(2, "Highlighter");
await page.mouse.move(cx(0.06), cy(0.62));
await page.mouse.down();
await page.mouse.move(cx(0.2), cy(0.5), { steps: 5 });
await page.mouse.move(cx(0.3), cy(0.66), { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(200);
n++;
cnt = await page.textContent("#objcnt");
check("hlighter added", cnt === String(n), "cnt=" + cnt);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("chartlab.layout.v1") || "{}"));
const hl = saved.drawings?.find(d => d.type === "hlighter");
check("hlighter translucent", hl?.settings?.alpha === 0.32, "alpha=" + hl?.settings?.alpha);
const fl = saved.drawings?.find(d => d.type === "flattop");
check("flattop mode stored", fl?.settings?.mode === "top", "mode=" + fl?.settings?.mode);
const gb = saved.drawings?.find(d => d.type === "gannbox");
check("gannbox captured scale", !!gb?.settings?.capture?.bars && !!gb?.settings?.capture?.span, JSON.stringify(gb?.settings?.capture));

// undo / redo still fine
await page.keyboard.press("Control+z");
await page.waitForTimeout(150);
cnt = await page.textContent("#objcnt");
check("undo removes hlighter", cnt === String(n - 1), "cnt=" + cnt);
await page.keyboard.press("Control+Shift+z");
await page.waitForTimeout(150);
cnt = await page.textContent("#objcnt");
check("redo restores", cnt === String(n), "cnt=" + cnt);

// reload persists
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
cnt = await page.textContent("#objcnt");
check("P2 drawings survive reload", cnt === String(n), "cnt=" + cnt);
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));

await browser.close();
await server.close();
console.log(failures === 0 ? "\nALL P2 CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
