// ChartLab beauty shot: draws the improved TV-style visuals, screenshots, prints pixel probes.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { writeFileSync } from "fs";

const PORT = 4191;
const server = await createServer({ root: "/home/reksi/mar", server: { port: PORT }, logLevel: "error", appType: "mpa" });
await server.listen();

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 });
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
const click = (fx, fy) => page.mouse.click(cx(fx), cy(fy));
const pick = async (g, label) => {
  await page.locator(".railgroup").nth(g).locator("button.railbtn.group").click();
  await page.locator(".flyrow").filter({ hasText: label }).first().click();
  await page.waitForTimeout(120);
};

const steps = [
  ["trendline", async () => { await page.keyboard.press("t"); await click(0.12, 0.72); await click(0.28, 0.45); }],
  ["gannfan", async () => { await page.keyboard.press("g"); await click(0.5, 0.55); await click(0.8, 0.28); }],
  ["gannbox", async () => { await pick(1, "Gann box"); await click(0.28, 0.38); await click(0.52, 0.6); }],
  ["regression", async () => { await pick(0, "Regression trend"); await click(0.58, 0.8); await click(0.88, 0.35); }],
  ["arrow", async () => { await page.keyboard.press("a"); await click(0.1, 0.3); await click(0.24, 0.2); }],
  ["note", async () => { await page.keyboard.press("n"); await click(0.45, 0.3); await page.waitForTimeout(120); await page.keyboard.type("resistance"); await page.keyboard.press("Enter"); }],
  ["callout", async () => { await pick(3, "Callout"); await click(0.82, 0.65); await click(0.62, 0.35); await page.waitForTimeout(120); await page.keyboard.type("buy zone"); await page.keyboard.press("Enter"); }],
  ["elliott", async () => { await pick(4, "Elliott"); for (const [fx, fy] of [[0.35, 0.85], [0.42, 0.6], [0.5, 0.78], [0.58, 0.5], [0.67, 0.72]]) await click(fx, fy); }],
  ["pitchfork", async () => { await pick(0, "Pitchfork"); await click(0.15, 0.85); await click(0.32, 0.4); await click(0.45, 0.7); }],
  ["flattop", async () => { await pick(0, "Flat top / bottom"); await click(0.7, 0.55); await click(0.86, 0.62); }],
  ["polyline-close", async () => { await pick(2, "Polyline"); await click(0.24, 0.82); await click(0.34, 0.68); await click(0.44, 0.78); await click(0.24, 0.82); }],
  ["brush", async () => { await page.keyboard.press("b"); await page.mouse.move(cx(0.66), cy(0.55)); await page.mouse.down(); await page.mouse.move(cx(0.78), cy(0.42), { steps: 8 }); await page.mouse.move(cx(0.86), cy(0.62), { steps: 8 }); await page.mouse.up(); }],
];
for (const [name, fn] of steps) { await fn(); await page.waitForTimeout(180); }

await page.evaluate(() => document.getElementById("objcnt") && undefined);
const cnt = await page.textContent("#objcnt");
console.log("drawings drawn:", cnt);
await page.waitForTimeout(400);
await page.screenshot({ path: "/home/reksi/mar/shots/beauty.png" });

// pixel probes on the 2x canvas
const probe = await page.evaluate(() => {
  const cv = document.getElementById("cv");
  const c = cv.getContext("2d");
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  const W = cv.width, H = cv.height;
  const buckets = {};
  const add = (k, r, g, b) => {
    const key = (r >> 5 << 6) | (g >> 5 << 3) | (b >> 5);
    buckets[k] = buckets[k] || {};
    buckets[k][key] = (buckets[k][key] || 0) + 1;
  };
  const near = (r, g, b, cr, cg, cb, tol) => Math.abs(r - cr) <= tol && Math.abs(g - cg) <= tol && Math.abs(b - cb) <= tol;
  let tvblue = 0, red = 0, purple = 0, teal = 0, green = 0, orange = 0, amber = 0, white = 0;
  for (let i = 0; i < d.length; i += 12) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (near(r, g, b, 41, 98, 255, 46)) tvblue++;
    else if (near(r, g, b, 242, 54, 69, 40)) red++;
    else if (near(r, g, b, 156, 39, 176, 44) || near(r, g, b, 151, 50, 168, 44)) purple++;
    else if (near(r, g, b, 0, 188, 212, 44) || near(r, g, b, 83, 181, 209, 44)) teal++;
    else if (near(r, g, b, 8, 153, 129, 40)) green++;
    else if (near(r, g, b, 255, 152, 0, 44) || near(r, g, b, 241, 157, 56, 44)) orange++;
    else if (near(r, g, b, 255, 207, 110, 42) || near(r, g, b, 247, 201, 72, 42)) amber++;
    else if (near(r, g, b, 255, 255, 255, 12)) white++;
  }
  return { tvblue, red, purple, teal, green, orange, amber, white, W, H };
});
console.log("PROBE", JSON.stringify(probe));
console.log("page errors:", errors.length, errors.slice(0, 3).join(" | "));
await browser.close();
await server.close();
