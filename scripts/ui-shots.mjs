// UI checks + screenshots for slice 6 (Playwright + system Chrome).
// Usage: node scripts/ui-shots.mjs <baseUrl> <outDir> <editToken> <publicSlug>
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [BASE, OUT, TOKEN, SLUG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let failures = 0;
const check = (n, ok, x = "") => (console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`), ok || failures++);
const mobile = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

async function noHScroll(page, label) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${label}: no horizontal scroll`, w <= (page.viewportSize().width), `scrollWidth ${w}`);
}
async function smallTargets(page, label) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a, input, select, textarea, [role=radio]")]
      .filter((e) => e.offsetParent && !e.closest("[aria-hidden]"))
      .map((e) => ({ t: (e.innerText || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44),
  );
  check(`${label}: tap targets ≥ 44px`, small.length === 0, JSON.stringify(small.slice(0, 5)));
}

// ---------- S1 at 360 ----------
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  // Viewport capture: a full-page capture paints the sticky Create button mid-page (screenshot artifact).
  await page.screenshot({ path: `${OUT}/S1-360.png` });
  await noHScroll(page, "S1");
  await smallTargets(page, "S1");
  // Keyboard open ≈ the layout viewport shrinks (interactive-widget=resizes-content). Simulate 360×420 with a field focused.
  await page.setViewportSize({ width: 360, height: 420 });
  const field = page.locator("#f-outcome");
  await field.focus();
  await field.evaluate((el) => el.scrollIntoView({ block: "nearest" })); // what the browser does on focus (honours scroll-margin)
  await page.waitForTimeout(200);
  const btn = page.getByRole("button", { name: "Create my store" });
  const box = await btn.boundingBox();
  const fbox = await field.boundingBox();
  check("S1: Create button visible with keyboard open (360×420)", box && box.y >= 0 && box.y + box.height <= 420, JSON.stringify(box));
  check("S1: focused field not hidden behind the Create button", fbox && box && fbox.y + fbox.height <= box.y, `field bottom ${fbox && Math.round(fbox.y + fbox.height)}, button top ${box && Math.round(box.y)}`);
  await page.getByRole("button", { name: "Cook in 20 minutes" }).click();
  await page.locator("#f-name").fill("Asha");
  await page.locator("#f-expertise").fill("Home cooking");
  await page.locator("#f-audience").fill("Working professionals");
  await page.getByRole("button", { name: "5K–20K" }).click();
  await field.focus();
  check("S1: Create button enabled + tappable while typing", await btn.isEnabled());
  await page.screenshot({ path: `${OUT}/S1-360-keyboard.png` });
  const placeholders = await page.evaluate(() => [...document.querySelectorAll("input,textarea")].map((e) => e.getAttribute("placeholder")).filter(Boolean));
  check("S1: no placeholder text", placeholders.length === 0, JSON.stringify(placeholders));
  await ctx.close();
}

// ---------- S3 editor at 360 + regenerate overlay ----------
if (TOKEN) {
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/edit/${TOKEN}`);
  await page.getByRole("button", { name: /^Publish|Published$/ }).first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/S3-360.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/S3-360-full.png`, fullPage: true });
  await noHScroll(page, "S3");
  await smallTargets(page, "S3");
  const articlesBefore = await page.locator("article").count();
  // Delay the regenerate response so the in-flight state can be inspected.
  await page.route("**/regenerate", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"ai_failed"}' });
  });
  await page.getByRole("button", { name: /^Regenerate / }).nth(1).click();
  await page.waitForTimeout(400);
  const articlesDuring = await page.locator("article").count();
  const pill = await page.getByText("Regenerating…").count();
  check("S3: regenerate dims the existing card (no extra card)", articlesDuring === articlesBefore && pill === 1, `cards ${articlesBefore}→${articlesDuring}, pills ${pill}`);
  const busyCard = page.locator("[aria-busy=true]").first();
  await busyCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/S3-360-regenerating.png` });
  await page.waitForTimeout(2600);
  check("S3: failed regenerate → toast, card kept", (await page.getByText("Couldn't regenerate, kept your previous version.").count()) === 1 && (await page.locator("article").count()) === articlesBefore);
  // Product sheet
  await page.unroute("**/regenerate");
  await page.getByRole("button", { name: /^Edit / }).nth(1).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/S3-360-product-sheet.png` });
  await ctx.close();

  const dctx = await browser.newContext(desktop);
  const dpage = await dctx.newPage();
  await dpage.goto(`${BASE}/edit/${TOKEN}`);
  await dpage.getByRole("button", { name: /^Publish|Published$/ }).first().waitFor({ timeout: 20_000 });
  await dpage.getByRole("button", { name: /^Edit / }).nth(1).click();
  await dpage.waitForTimeout(400);
  await dpage.screenshot({ path: `${OUT}/S3-1440-side-panel.png` });
  await noHScroll(dpage, "S3 1440");
  await dctx.close();
}

// ---------- S5 at 360 and 1440 ----------
if (SLUG) {
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/s/${SLUG}`);
  await page.locator("article").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/S5-360.png`, fullPage: true });
  await noHScroll(page, "S5");
  await smallTargets(page, "S5");
  const cards = await page.locator("article").evaluateAll((as) =>
    as.map((a) => {
      const t = a.innerText;
      return {
        coming: /Coming soon/.test(t),
        available: /Available now/.test(t),
        interested: /I'm interested|Thanks!/.test(t),
        enquire: /Enquire on WhatsApp/.test(t),
      };
    }),
  );
  const ok = cards.every((c) => (c.coming !== c.available) && (c.coming ? c.interested && !c.enquire : c.enquire && !c.interested));
  check("S5: each card has exactly one badge and the matching button", ok, JSON.stringify(cards));
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  check("S5: readable in < 3 scrolls (3 products)", h < 780 * 3 + 780, `${h}px`);
  const placeholders = await page.evaluate(() => [...document.querySelectorAll("input,textarea")].map((e) => e.getAttribute("placeholder")).filter(Boolean));
  check("S5: no placeholder text", placeholders.length === 0);
  await ctx.close();

  const dctx = await browser.newContext(desktop);
  const dpage = await dctx.newPage();
  await dpage.goto(`${BASE}/s/${SLUG}`);
  await dpage.locator("article").first().waitFor({ timeout: 20_000 });
  await dpage.waitForTimeout(500);
  await dpage.screenshot({ path: `${OUT}/S5-1440.png` });
  await noHScroll(dpage, "S5 1440");
  const frameW = await dpage.locator("article").first().evaluate((a) => a.closest("div.max-w-\\[480px\\]")?.getBoundingClientRect().width);
  check("S5 1440: store framed at 480px", frameW === 480, String(frameW));
  await dctx.close();
}

// ---------- S6 ----------
{
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/s/no-such-store-zz`);
  await page.getByText("This store doesn't exist (yet).").waitFor({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/S6-360.png` });
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
