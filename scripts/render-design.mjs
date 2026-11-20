// Render each board of the Claude Design export to Design/png/<screen>.png and dump token sources.
// Each board is an iframe; we wait for its content + fonts before capturing.
// Uses the system Chrome via playwright-core. Run: node scripts/render-design.mjs
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("Design");
const file = readdirSync(dir).find((f) => f.endsWith(".html"));
mkdirSync(`${dir}/png/_frames`, { recursive: true });

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
await page.goto("file://" + `${dir}/${file}`, { waitUntil: "load" });
await page.waitForSelector("section.board", { timeout: 30_000 });
await page.waitForTimeout(1500);

const slug = (s) =>
  s.toLowerCase().replace(/₹/g, "rs").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const boards = await page.locator("section.board").all();
const names = [];
const allVars = {};
const fonts = new Set();

for (const [i, b] of boards.entries()) {
  const title = ((await b.locator("h2").first().innerText().catch(() => "")) || `board-${i}`).trim();
  const name = `${String(i + 1).padStart(2, "0")}-${slug(title)}`;
  await b.scrollIntoViewIfNeeded();
  const handle = await b.locator("iframe").first().elementHandle().catch(() => null);
  const frame = handle ? await handle.contentFrame() : null;
  if (frame) {
    await frame.waitForLoadState("load").catch(() => {});
    await frame
      .waitForFunction(() => document.body && document.body.innerText.trim().length > 0, null, { timeout: 15_000 })
      .catch(() => {});
    await frame.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(700);
    const info = await frame.evaluate(() => {
      const vars = {};
      for (const sheet of [...document.styleSheets]) {
        let rules = [];
        try {
          rules = [...sheet.cssRules];
        } catch {
          continue;
        }
        for (const r of rules) if (r.style) for (const p of r.style) if (p.startsWith("--")) vars[p] = r.style.getPropertyValue(p).trim();
      }
      const fonts = new Set();
      document.querySelectorAll("*").forEach((el) => fonts.add(getComputedStyle(el).fontFamily));
      return { vars, fonts: [...fonts], html: document.documentElement.outerHTML, text: document.body.innerText };
    });
    Object.assign(allVars, info.vars);
    info.fonts.forEach((f) => fonts.add(f));
    writeFileSync(`${dir}/png/_frames/${name}.html`, info.html);
    writeFileSync(`${dir}/png/_frames/${name}.txt`, info.text);
  }
  await b.screenshot({ path: `${dir}/png/${name}.png` });
  names.push({ name, title });
}

writeFileSync(`${dir}/png/_tokens-raw.json`, JSON.stringify({ vars: allVars, fonts: [...fonts] }, null, 2));
console.log(names.map((n) => `${n.name}.png  <-  ${n.title}`).join("\n"));
await browser.close();
