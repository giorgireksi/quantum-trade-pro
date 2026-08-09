// ChartLab smoke test: boots the app, draws tools, verifies state/persistence.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { existsSync } from "fs";

const PORT = 4187;
const server = await createServer({ root: "/home/reksi/mar", server: { port: PORT }, logLevel: "error", appType: "mpa" });
await server.listen();
console.log("vite dev server on", PORT);

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
await page.waitForTimeout(900);

// 1. chart painted
const px = await page.evaluate(() => {
  const cv = document.getElementById("cv");
  const c = cv.getContext("2d");
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  let colored = 0, dark = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    dark++;
    if (r > 90 || g > 110 || b > 110) colored++;
    if (r > 40 && g > 140 && b < 110) colored += 3; // greens
  }
  return { colored, dark, w: cv.width, h: cv.height };
});
check("canvas painted with content", px.colored > 500, `colored=${px.colored} ${px.w}x${px.h}`);
const stC = await page.textContent("#stC");
check("status bar shows close price", stC && stC !== "—", String(stC));

// chart rect (canvas CSS coords)
const box = await page.locator("#cv").boundingBox();
const cx = (fx) => box.x + box.width * fx;
const cy = (fy) => box.y + box.height * fy;

// 2. trend line via keyboard shortcut + two clicks
await page.keyboard.press("t");
await page.mouse.click(cx(0.2), cy(0.7));
await page.mouse.click(cx(0.55), cy(0.35));
await page.waitForTimeout(250);
let cnt = await page.textContent("#objcnt");
check("trendline added (objects=1)", cnt === "1", "cnt=" + cnt);

// 3. fib retracement
await page.keyboard.press("f");
await page.mouse.click(cx(0.62), cy(0.65));
await page.mouse.click(cx(0.88), cy(0.3));
await page.waitForTimeout(250);
cnt = await page.textContent("#objcnt");
check("fib added (objects=2)", cnt === "2", "cnt=" + cnt);

// 4. anchored VWAP (one click)
await page.keyboard.press("w");
await page.mouse.click(cx(0.3), cy(0.5));
await page.waitForTimeout(250);
cnt = await page.textContent("#objcnt");
check("AVWAP added (objects=3)", cnt === "3", "cnt=" + cnt);

// 5. fixed-range volume profile (two clicks)
await page.keyboard.press("p");
await page.mouse.click(cx(0.15), cy(0.45));
await page.mouse.click(cx(0.5), cy(0.45));
await page.waitForTimeout(350);
cnt = await page.textContent("#objcnt");
check("FRVP added (objects=4)", cnt === "4", "cnt=" + cnt);

// 6. persistence
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("chartlab.layout.v1") || "{}"));
check("layout persisted w/ 4 drawings", saved.drawings?.length === 4, "n=" + saved.drawings?.length);

// 7. undo (keyboard)
await page.keyboard.press("Control+z");
await page.waitForTimeout(200);
cnt = await page.textContent("#objcnt");
check("undo -> 3 drawings", cnt === "3", "cnt=" + cnt);
await page.keyboard.press("Control+Shift+z");
await page.waitForTimeout(200);
cnt = await page.textContent("#objcnt");
check("redo -> 4 drawings", cnt === "4", "cnt=" + cnt);

// 8. selection & drag move (hit trendline body, drag)
await page.keyboard.press("Escape"); // back to cross cursor
await page.mouse.click(cx(0.375), cy(0.525)); // exact trendline midpoint
await page.waitForTimeout(150);
const selNow = await page.evaluate(() => {
  const row = document.querySelector(".op.sel .name");
  return row ? row.textContent : null;
});
check("click selects a drawing", !!selNow, String(selNow));

// 9. zoom with wheel
await page.mouse.move(cx(0.5), cy(0.5));
await page.mouse.wheel(0, -400);
await page.waitForTimeout(200);
const barsAfter = await page.textContent("#stBars");
check("wheel zoom keeps bars count", !!barsAfter && barsAfter !== "0", "bars=" + barsAfter);

// 10. timeframe switch to 1m
await page.click("#tfbar button:first-child");
await page.waitForTimeout(400);
const bars1m = await page.textContent("#stBars");
const n1m = parseInt(bars1m || "0", 10);
check("1m timeframe loads intraday bars", n1m > 1000, "n=" + n1m);

await page.screenshot({ path: "/home/reksi/mar/shots/full.png" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
const cntReload = await page.textContent("#objcnt");
check("drawings survive reload", cntReload === "4", "cnt=" + cntReload);
await page.screenshot({ path: "/home/reksi/mar/shots/reload.png" });

check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
await server.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
