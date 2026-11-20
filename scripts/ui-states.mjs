// S2 / S2b / S2c UI checks with DB-seeded states (no AI calls). Usage: node scripts/ui-states.mjs <baseUrl> <outDir>
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import pg from "pg";
import { chromium } from "playwright-core";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let failures = 0;
const check = (n, ok, x = "") => (console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`), ok || failures++);
const input = { name: "Ravi Kumar", expertise: "fitness", audience: "people", outcome: "get fit", audienceSize: "under_5k", language: "en" };
const ids = [];
async function seed(status, follow_up, extra = "") {
  const token = randomBytes(24).toString("base64url");
  const { rows } = await c.query(
    `insert into stores (slug, client_request_id, edit_token_hash, status, input, follow_up${extra ? ", gen_started_at" : ""})
     values ($1,$2,$3,$4,$5,$6${extra ? ", now()" : ""}) returning id`,
    [`ui-state-${randomBytes(3).toString("hex")}`, randomUUID(), createHash("sha256").update(token).digest("hex"), status, input, follow_up],
  );
  ids.push(rows[0].id);
  return token;
}

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

// S2b — chip selects, "Use this" submits the selected direction.
{
  const directions = ["Home workouts for new moms", "Fat-loss plans for desk workers", "Strength training for beginners"];
  const token = await seed("needs_input", { kind: "needs_more", question: "Fitness for whom?", directions, round: 1 });
  let sent = null;
  await page.route(`**/api/stores/${token}/answer`, async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 202, contentType: "application/json", body: '{"started":true}' });
  });
  await page.goto(`${BASE}/edit/${token}`);
  await page.getByText("Fitness for whom?").waitFor({ timeout: 20_000 });
  const use = page.getByRole("button", { name: "Use this" });
  check("S2b: Use this disabled before a choice", await use.isDisabled());
  await page.getByRole("radio", { name: directions[1] }).click();
  check("S2b: tapping a chip selects it (no submit yet)", sent === null && (await page.getByRole("radio", { name: directions[1] }).getAttribute("aria-checked")) === "true");
  await page.screenshot({ path: `${OUT}/S2b-360-selected.png` });
  await use.click();
  await page.waitForTimeout(500);
  check("S2b: Use this submits the selected direction", sent?.direction === directions[1], JSON.stringify(sent));
  await page.unroute(`**/api/stores/${token}/answer`);
  await c.query("update stores set status='generating', gen_started_at=now() where edit_token_hash=$1", [createHash("sha256").update(token).digest("hex")]);
}

// S2 — generating skeleton.
{
  const token = await seed("generating", null, "gen");
  await page.goto(`${BASE}/edit/${token}`);
  await page.getByText(/Reading what you do|Finding products|Pricing for Indian|Writing your page/).waitFor({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/S2-360.png` });
  check("S2: skeleton + progress line shown", (await page.locator("[aria-busy]").count()) > 0);
}

// S2c — AI busy / retry with the saved answers.
{
  const token = await seed("failed", null);
  await page.goto(`${BASE}/edit/${token}`);
  await page.getByText("Our AI is busy right now.").waitFor({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/S2c-360-retry.png` });
  check("S2c: answers summary + Try again", (await page.getByText("Ravi Kumar · fitness").count()) === 1 && (await page.getByRole("button", { name: "Try again" }).count()) === 1);
}

// S2c — unclear.
{
  const token = await seed("needs_input", { kind: "unclear", reason: "gibberish" });
  await page.goto(`${BASE}/edit/${token}`);
  await page.getByText("We couldn't understand that.").waitFor({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/S2c-360-unclear.png` });
  check("S2c unclear: Edit my answers link", (await page.getByRole("link", { name: "Edit my answers" }).count()) === 1);
}

await browser.close();
await c.query("delete from stores where id = any($1)", [ids]);
await c.end();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
