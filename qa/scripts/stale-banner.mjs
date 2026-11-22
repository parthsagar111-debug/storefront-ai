// Stale "Continue your store": deleted tokens in localStorage must not produce a banner. No AI calls.
// Usage: node stale-banner.mjs [base]
import { PROD, context, check, db, dbEnd, closeBrowser, sleep, tok, sha } from "./lib.mjs";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const BASE = process.argv[2] || PROD;
const R = "Stale banner";
const fx = JSON.parse(readFileSync(new URL("../results/fixture-store.json", import.meta.url), "utf8"));
const ghost = tok(); // never existed / deleted
const real = tok();
const slug = `qa-stale-${randomBytes(3).toString("hex")}`;
const KEY = "sf.stores.v1";
const entry = (token, name, createdAt) => ({ token, clientRequestId: randomUUID(), name, createdAt, confirmed: true });
try {
  // 1) only a stale token → no banner, token forgotten
  {
    const { ctx } = await context(BASE);
    const p = await ctx.newPage();
    await p.goto(BASE + "/");
    await p.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify([entry(ghost, "Parth Sagar", Date.now())])]);
    await p.reload();
    await p.locator("#f-name").waitFor();
    await sleep(3000);
    const banner = await p.getByRole("link", { name: /Continue your store/ }).count();
    const left = await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]").length, KEY);
    check(R, "stale token → no banner, removed from the device list", banner === 0 && left === 0, `banner=${banner}, remembered=${left}`);
    await ctx.close();
  }
  // 2) stale (newest) + real store → banner for the real one only
  {
    await db("insert into stores (slug, client_request_id, edit_token_hash, status, input, draft) values ($1,$2,$3,'ready',$4,$5)", [slug, randomUUID(), sha(real), { ...fx.input, name: "QA Real Store" }, { ...fx.draft, creator: { ...fx.draft.creator, displayName: "QA Real Store" } }]);
    const { ctx } = await context(BASE);
    const p = await ctx.newPage();
    await p.goto(BASE + "/");
    await p.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify([entry(ghost, "Parth Sagar", Date.now()), entry(real, "QA Real Store", Date.now() - 1000)])]);
    await p.reload();
    const shown = await p.getByRole("link", { name: /Continue your store · QA Real Store/ }).waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    const ghostBanner = await p.getByRole("link", { name: /Continue your store · Parth Sagar/ }).count();
    check(R, "stale + real → banner only for the store that exists", shown && ghostBanner === 0, `real shown=${shown}, stale shown=${ghostBanner}`);
    // 3) opening a dead edit link: new copy + token forgotten
    await p.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify([entry(ghost, "Parth Sagar", Date.now())])]);
    await p.goto(`${BASE}/edit/${ghost}`);
    const copy = await p.getByRole("heading", { name: "This store doesn't exist anymore. It may have been deleted." }).waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    const cta = await p.getByRole("link", { name: "Create a new store" }).count();
    const left = await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]").length, KEY);
    const pub = await (await fetch(`${BASE}/s/qa-no-such-store`)).text();
    check(R, "dead edit link → 'doesn't exist anymore' + Create a new store; token forgotten; /s/ copy unchanged", copy && cta === 1 && left === 0 && /doesn(&#x27;|')t exist \(yet\)/.test(pub), `copy=${copy}, cta=${cta}, remembered=${left}`);
    await ctx.close();
  }
} finally {
  await db("delete from stores where slug=$1", [slug]);
  await closeBrowser();
  await dbEnd();
}
