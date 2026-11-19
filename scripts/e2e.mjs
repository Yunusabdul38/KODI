// End-to-end and security checks, in a real browser against a production build.
//
//   npm run test:e2e                  build, start, run every check, stop
//   E2E_SKIP_BUILD=1 npm run test:e2e reuse the last e2e build
//   E2E_HEADED=1 npm run test:e2e     watch it run
//
// Safe to run next to `npm run dev`: it builds into .next/e2e, serves on its own
// port with an in-memory database and the demo wallet, and overrides every
// wallet and database setting from .env.local. It refuses to continue unless
// the server it started is in demo mode, so no real wallet is ever touched.
//
// Needs Google Chrome installed, or run `npx playwright install chromium` once.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const ADMIN_PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const port = await new Promise((resolve) => {
  const s = createServer().listen(0, () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const BASE = `http://localhost:${port}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_DIST_DIR: ".next/e2e",
  PORT: String(port),
  APP_URL: BASE,
  // Demo everything; the empty values beat anything in .env.local.
  NWC_URL: "",
  TEST_LANDLORD_NWC_URL: "",
  TEST_AGENT_NWC_URL: "",
  TEST_TENANT_NWC_URL: "",
  DATABASE_URL: "",
  RESEND_API_KEY: "",
  LIGHTNING_NETWORK: "demo",
  LOCAL_DB: "memory",
  SAMPLE_DATA: "true",
  ALLOW_LOCAL_DB: "true",
  ALLOW_DEMO_WALLET: "true",
  ADMIN_PASSWORD,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(16).toString("hex"),
};
const next = path.join("node_modules", ".bin", "next");
const run = (args, opts = {}) => spawn(next, args, { env, stdio: opts.stdio ?? "inherit" });

if (!process.env.E2E_SKIP_BUILD) {
  console.log("Building the app in demo mode (about a minute)…");
  // `next build` adds the e2e build folder to tsconfig.json; put it back as it was.
  const tsconfig = readFileSync("tsconfig.json", "utf8");
  const code = await new Promise((r) => run(["build"], { stdio: ["ignore", "ignore", "inherit"] }).on("exit", r));
  writeFileSync("tsconfig.json", tsconfig);
  if (code !== 0) {
    console.error("Build failed.");
    process.exit(1);
  }
}

const server = run(["start", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
const serverLog = [];
for (const s of [server.stdout, server.stderr]) s.on("data", (d) => serverLog.push(String(d)));
const tmp = mkdtempSync(path.join(tmpdir(), "kodi-e2e-"));
let browser;
const stop = () => {
  server.kill();
  browser?.close().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
};
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

for (let i = 0; ; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {}
  if (i > 60) {
    console.error(`Server didn't start:\n${serverLog.join("")}`);
    stop();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!(await (await fetch(BASE)).text()).includes("No real money moves")) {
  console.error("Refusing to run: the test server is not in demo mode.");
  stop();
  process.exit(1);
}

browser = await chromium
  .launch({ channel: "chrome", headless: !process.env.E2E_HEADED })
  .catch(() => chromium.launch({ headless: !process.env.E2E_HEADED }));

const results = [];
const errors = [];
let step = "";
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
async function session() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${step}] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`[${step}] ${m.text()}`));
  return { ctx, page };
}
const go = (p, url) => p.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
async function adminSignIn(page) {
  await go(page, "/admin");
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Landlords to verify", { timeout: 10000 });
}

let dialogs = 0;
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
async function fillDeposit(page, who, moveIn) {
  await page.fill("#tenantName", who.name);
  await page.fill("#tenantPhone", "+234 802 555 0199");
  await page.fill("#tenantEmail", who.email);
  await page.fill("#moveInDate", moveIn ?? addDays(await page.getAttribute("#moveInDate", "min"), 3));
  const agree = page.locator("button[role=checkbox]").last();
  if ((await agree.getAttribute("data-state")) !== "checked") await agree.click();
}
async function landlordSignIn(page, email, code = "kodi-demo") {
  await go(page, "/landlord");
  await page.fill("#email", email);
  await page.fill("#password", code);
  await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Landlord dashboard", { timeout: 15000 });
}
async function simulate(page) {
  await page.click("button:has-text('Simulate payment')");
}

try {
  // ------------------------------------------------------------------ headers
  step = "headers";
  const home = await fetch(BASE);
  const csp = home.headers.get("content-security-policy") ?? "";
  check("CSP blocks framing, plugins and third-party scripts", csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'") && csp.includes("script-src 'self'"));
  check("HSTS is set", Boolean(home.headers.get("strict-transport-security")));
  check("X-Frame-Options is DENY", home.headers.get("x-frame-options") === "DENY");

  // --------------------------------------------------------------- public API
  step = "api";
  check("daily jobs refuse without the cron secret", (await fetch(`${BASE}/api/cron/daily`)).status === 401);
  check("daily jobs refuse a wrong secret", (await fetch(`${BASE}/api/cron/daily`, { headers: { authorization: "Bearer guess" } })).status === 401);
  check("payment status rejects a malformed hash", (await fetch(`${BASE}/api/pay/not-a-hash`)).status === 404);
  check("simulating an unknown invoice is refused", (await fetch(`${BASE}/api/pay/${"a".repeat(64)}/simulate`, { method: "POST" })).status === 404);
  const pub = await (await fetch(`${BASE}/api/units/KD-YABA2`)).json();
  check("public unit check says available, verified", pub.status === "available" && pub.verifiedLandlord === true);
  check("public unit check leaks no address or names", !JSON.stringify(pub).includes("Hughes") && !("address" in pub));

  // ------------------------------------------------------------ browse, check
  step = "browse";
  const a = await session();
  a.page.on("dialog", (d) => { dialogs++; d.dismiss(); });
  await go(a.page, "/");
  check("home page lists verified homes", (await a.page.locator("a[href^='/homes/KD-']").count()) >= 3);
  await go(a.page, "/homes?area=Yaba");
  check("search by area filters the listings", (await a.page.locator("a[href^='/homes/KD-']").count()) === 1);
  await go(a.page, "/check?code=KD-ZZZZZ");
  check("a fake unit code is flagged", (await a.page.locator("text=isn't a home on Kodi").count()) === 1);
  await go(a.page, "/check?code=kd-yaba2");
  check("a real code shows it's free to rent", (await a.page.locator("text=Real, verified, and free to rent.").count()) === 1);

  // ----------------------------------------------- Safe Deposit: the lock
  step = "deposit";
  const b = await session();
  await go(b.page, "/homes/KD-YABA2"); // B opens the same home before A pays
  await go(a.page, "/homes/KD-YABA2");
  check("the deposit total is a year's rent plus the agent fee", (await a.page.locator("text=₦2,640,000").count()) >= 1);
  await a.page.fill("#tenantEmail", "ada@tenant.test");
  await a.page.click("button[type=submit]");
  await a.page.waitForSelector("#tenantName-error", { timeout: 10000 });
  check("a refused form keeps what was typed", (await a.page.inputValue("#tenantEmail")) === "ada@tenant.test");
  await fillDeposit(a.page, { name: "Ada Obi", email: "ada@tenant.test" });
  await a.page.click("button[type=submit]");
  await a.page.waitForSelector("text=Pay to hold this home", { timeout: 15000 });
  const depositA = a.page.url();
  check("tenant A gets a private deposit link", /\/d\/[A-Za-z0-9_-]{20,}$/.test(depositA));

  await fillDeposit(b.page, { name: "Bayo Ade", email: "bayo@tenant.test" });
  await b.page.click("button[type=submit]");
  await b.page.waitForSelector("text=already has a deposit held on Kodi", { timeout: 15000 });
  check("tenant B is refused while A is paying: the home is locked", true);
  check("B is not sent to a payment page", !/\/d\//.test(b.page.url()));

  await simulate(a.page);
  await a.page.waitForSelector("text=Your money is held. The home is locked.", { timeout: 15000 });
  check("paying holds the deposit", true);
  check("the address is shown only after paying", (await a.page.locator("text=14 Hughes Avenue").count()) === 1);
  await b.page.waitForSelector("text=A deposit is already held", { timeout: 15000 });
  check("B's open page updates by itself to 'deposit held'", true);
  await go(b.page, "/check?code=KD-YABA2");
  check("the code check now warns it's taken", (await b.page.locator("text=Already taken: a deposit is held.").count()) === 1);
  check("refund isn't offered before the move-in date", await a.page.locator("button:has-text('The keys never came')").isDisabled());

  // ------------------------------------------- landlord hands over, tenant confirms
  step = "release";
  const tolu = await session();
  await landlordSignIn(tolu.page, "tolu@adeyemi.test");
  check("the landlord sees the deposit in escrow", (await tolu.page.locator("text=Ada Obi").count()) >= 1);
  await tolu.page.click("button:has-text(\"I've handed over the keys\")");
  await tolu.page.waitForSelector("text=You marked the keys handed over", { timeout: 10000 });
  await a.page.waitForSelector("text=says the keys were handed over", { timeout: 15000 });
  check("the tenant sees the landlord's handover note", true);
  await a.page.click("button:has-text(\"I've moved in\")");
  await a.page.waitForSelector("text=Tick the box", { timeout: 10000 });
  check("moving in needs an explicit confirmation", true);
  await a.page.locator("form:has(button:has-text(\"I've moved in\")) button[role=checkbox]").click();
  await a.page.click("button:has-text(\"I've moved in\")");
  await a.page.waitForSelector("text=Paid to the landlord. Welcome home.", { timeout: 15000 });
  check("confirming the keys pays out", true);
  const proofs = await a.page.locator("a:text-is('Proof')").count();
  check("landlord and agent each get a payout with proof", proofs === 2, `found ${proofs}`);
  await a.page.click("a:has-text('Receipt')");
  await a.page.waitForSelector("text=Payment record");
  await a.page.click("button:has-text('Check this payment')");
  await a.page.waitForSelector("text=Checked on your device", { timeout: 5000 });
  check("the receipt's payment proof verifies in the browser", true);
  await go(b.page, "/homes/KD-YABA2");
  check("the home now shows as let", (await b.page.locator("text=This home is let").count()) === 1);

  // ---------------------------------------- refund requested, landlord objects, arbiter decides
  step = "dispute";
  const c = await session();
  await go(c.page, "/homes/KD-SURU4");
  await fillDeposit(c.page, { name: "Chioma Eze", email: "chioma@tenant.test" }, await c.page.getAttribute("#moveInDate", "min"));
  await c.page.click("button[type=submit]");
  await c.page.waitForSelector("text=Pay to hold this home", { timeout: 15000 });
  await simulate(c.page);
  await c.page.waitForSelector("text=Your money is held.", { timeout: 15000 });
  const admin = await session();
  await adminSignIn(admin.page);
  await admin.page.click("button:has-text('+2 days')");
  await admin.page.waitForSelector("text=Skipped ahead 2 days", { timeout: 10000 });
  check("the arbiter can move the demo clock on the test network", true);
  await c.page.reload({ waitUntil: "networkidle" });
  await c.page.click("button:has-text('The keys never came')");
  await c.page.click("button:has-text('Yes, ask for a refund')");
  await c.page.waitForSelector("text=Refund requested", { timeout: 15000 });
  check("after the move-in date the tenant can ask for a refund", true);
  const chinedu = await session();
  await landlordSignIn(chinedu.page, "chinedu@okafor.test");
  await chinedu.page.click("button:has-text('Object: I handed over the keys')");
  await chinedu.page.fill("textarea[name=reason]", "I gave her the keys on Monday; my caretaker was there.");
  await chinedu.page.click("button:has-text('Send to the arbiter')");
  await chinedu.page.waitForSelector("text=With Kodi's arbiter. The money stays in escrow", { timeout: 15000 });
  await c.page.waitForSelector("text=With Kodi's arbiter", { timeout: 15000 });
  check("the landlord's objection sends it to the arbiter", true);
  await admin.page.reload({ waitUntil: "networkidle" });
  await admin.page.fill("textarea[name=note]", "Caretaker could not confirm a handover; tenant has no keys.");
  await admin.page.click("button:has-text('Refund the tenant')");
  await admin.page.waitForSelector("text=No open disputes.", { timeout: 15000 });
  await c.page.waitForSelector("text=Refunded to you", { timeout: 15000 });
  check("the arbiter's refund reaches the tenant", true);
  await go(c.page, "/homes/KD-SURU4");
  check("after a refund the home is available again", (await c.page.locator("text=Pay a Safe Deposit").count()) === 1);

  // -------------------------------------------------------------- Rent Vault
  step = "vault";
  await a.page.goto(depositA, { waitUntil: "networkidle" });
  await a.page.click("a:has-text('Start a Rent Vault')");
  await a.page.waitForSelector("#pinConfirm", { timeout: 15000 });
  check("a vault opened from the deposit knows the tenant", (await a.page.inputValue("#tenantName")) === "Ada Obi");
  const minDue = await a.page.getAttribute("#dueDate", "min");
  const fillVault = async (page, pin, days = 60) => {
    await page.fill("#targetNgn", "2400000");
    await page.fill("#dueDate", addDays(minDue, days));
    await page.fill("#pin", pin);
    await page.fill("#pinConfirm", pin);
  };
  await fillVault(a.page, "482916");
  await a.page.click("button:has-text('Open my Rent Vault')");
  await a.page.waitForURL(/\/v\/[A-Za-z0-9_-]{20,}$/, { timeout: 15000 });
  await a.page.waitForSelector("h2:text-is('Add money')");
  check("the tenant's own vault opens at once", true);
  const vaultUrl = a.page.url();
  await a.page.fill("#amount", "50000");
  await a.page.click("button:has-text('Add ₦50,000')");
  await simulate(a.page);
  await a.page.waitForSelector("text=₦50,000 of ₦2,400,000", { timeout: 15000 });
  check("a top-up shows in the vault in naira", true);
  const links = await a.page.locator(".font-mono.truncate").allTextContents();
  const family = links.find((l) => l.includes("/vault/top-up/"));
  const landlordView = links.find((l) => l.includes("/v/landlord/"));
  await b.page.goto(family, { waitUntil: "networkidle" });
  await b.page.fill("#amount", "25000");
  await b.page.fill("#payerName", "Auntie Bisi (London)");
  await b.page.click("button:has-text('Add ₦25,000')");
  await simulate(b.page);
  await b.page.waitForSelector("text=Payment received.", { timeout: 15000 });
  await a.page.waitForSelector("text=Auntie Bisi (London)", { timeout: 15000 });
  check("family can top up from a shared link", true);
  await b.page.goto(landlordView, { waitUntil: "networkidle" });
  check("the landlord's link shows progress", (await b.page.locator("text=₦75,000").count()) >= 1);
  check("the landlord's link hides who paid", (await b.page.locator("text=Auntie Bisi").count()) === 0);

  const fwd = await session();
  await fwd.page.goto(vaultUrl, { waitUntil: "networkidle" });
  check(
    "a forwarded private vault link shows only the PIN screen",
    (await fwd.page.locator("text=Enter your PIN").count()) === 1 && (await fwd.page.locator("text=/vault/top-up/").count()) === 0,
  );
  await fwd.page.fill("#pin", "111111");
  await fwd.page.click("button:has-text('Open my vault')");
  await fwd.page.waitForSelector("text=That PIN isn't right.", { timeout: 10000 });
  check("a wrong vault PIN is refused", true);
  check("a wrong PIN clears the field for another try", (await fwd.page.inputValue("#pin")) === "");
  await fwd.page.fill("#pin", "482916");
  await fwd.page.click("button:has-text('Open my vault')");
  await fwd.page.waitForSelector("h2:text-is('Add money')", { timeout: 15000 });
  check("the right PIN opens the vault", true);

  await go(b.page, "/vault?unit=KD-YABA2");
  await b.page.fill("#tenantName", "Bayo Ade");
  await b.page.fill("#tenantEmail", "bayo@tenant.test");
  await fillVault(b.page, "246802");
  await b.page.click("button:has-text('Ask to open my Rent Vault')");
  await b.page.waitForSelector("text=This home already has a Rent Vault", { timeout: 15000 });
  check("nobody else can open a second vault for the same home", true);

  await go(b.page, "/vault?unit=KD-LEKK3");
  await b.page.fill("#tenantName", "Kemi Lawal");
  await b.page.fill("#tenantEmail", "kemi@tenant.test");
  await fillVault(b.page, "246802", 200);
  await b.page.click("button:has-text('Ask to open my Rent Vault')");
  await b.page.waitForSelector("text=to confirm you live here", { timeout: 15000 });
  check("a vault asked for by home code waits for the landlord", (await b.page.locator("h2:text-is('Add money')").count()) === 0);
  await go(tolu.page, "/landlord");
  await tolu.page.waitForSelector("h2:text-is('Rent Vault requests')", { timeout: 15000 });
  await tolu.page.click("button:has-text('Yes, they live here')");
  await tolu.page.waitForSelector("section:has(h2:text-is('Tenants saving with Rent Vault')) >> text=Kemi Lawal", { timeout: 15000 });
  await b.page.reload({ waitUntil: "networkidle" });
  check("the landlord's confirmation opens it", (await b.page.locator("h2:text-is('Add money')").count()) === 1);
  for (let i = 0; i < 3; i++) {
    await admin.page.click("button:has-text('+30 days')");
    await admin.page.waitForSelector("text=Skipped ahead 30 days", { timeout: 10000 });
  }
  await admin.page.click("button:has-text('Run daily jobs now')");
  await admin.page.waitForSelector("text=1 vault paid", { timeout: 15000 });
  await a.page.goto(vaultUrl, { waitUntil: "networkidle" });
  check("on the due date the vault pays the landlord", (await a.page.locator("text=Paid to the landlord").count()) >= 1);

  // -------------------------------------------------- landlord onboarding
  step = "landlord";
  const n = await session();
  n.page.on("dialog", (d) => { dialogs++; d.dismiss(); });
  await go(n.page, "/landlord/register");
  for (const [id, v] of Object.entries({ name: "Ngozi Homes", contactName: "Ngozi Okeke", phone: "+234 805 555 0123", email: "ngozi@homes.test", idNumber: "98765432109", password: "ngozi-code-2026", passwordConfirm: "ngozi-code-2026" })) {
    await n.page.fill(`#${id}`, v);
  }
  await n.page.click("button[role=checkbox]");
  await n.page.click("button:has-text('Register for review')");
  await n.page.waitForSelector("text=Kodi is checking your details", { timeout: 15000 });
  check("registering shows a confirmation and does not sign in", (await n.ctx.cookies()).every((x) => x.name !== "kodi_landlord"));
  await go(n.page, "/landlord");
  check("the eye button shows the password", await (async () => {
    await n.page.fill("#password", "ngozi-code-2026");
    await n.page.click("button[aria-label='Show password']");
    return (await n.page.getAttribute("#password", "type")) === "text";
  })());
  await n.page.fill("#email", "ngozi@homes.test");
  await n.page.click("button:has-text('Sign in')");
  await n.page.waitForSelector("text=We're checking your details", { timeout: 15000 });
  check("an unverified landlord can only follow the review", (await n.page.locator("text=List a home").count()) === 0);
  await admin.page.reload({ waitUntil: "networkidle" });
  await admin.page.locator("div:has(> p:text-is('Ngozi Homes'))").locator("button:has-text('Verify')").click();
  await admin.page.waitForSelector("p:text-is('Ngozi Homes')", { state: "detached", timeout: 10000 });
  await n.page.reload({ waitUntil: "networkidle" });
  await n.page.click("a:has-text('List a home')");
  await n.page.waitForSelector("#title");
  await n.page.fill("#title", "Mini flat");
  await n.page.selectOption("#area", "Surulere");
  await n.page.fill("#address", "9 Adelabu Street");
  await n.page.fill("#description", `Quiet mini flat. <img src=x onerror=alert(1)> <script>alert(2)</script> Good water.`);
  await n.page.fill("#annualRentNgn", "900000");
  await n.page.click("button:has-text('List this home')");
  await n.page.waitForSelector("text=Listed as", { timeout: 15000 });
  const newCode = (await n.page.locator(".code-chip").first().textContent()).trim();
  check("a verified landlord lists a home and gets a code", /^KD-[2-9A-Z]{5}$/.test(newCode));
  await go(n.page, `/homes/${newCode}`);
  check("a script in a listing shows as text and doesn't run", (await n.page.locator("text=<script>alert(2)</script>").count()) === 1 && dialogs === 0);

  // ----------------------------------------------------------------- security
  step = "security";
  const sess = (await n.ctx.cookies()).find((x) => x.name === "kodi_landlord");
  const [body, mac] = sess.value.split(".");
  const forged = { ...JSON.parse(Buffer.from(body, "base64url").toString()), email: "tolu@adeyemi.test" };
  const f = await session();
  await f.ctx.addCookies([{ ...sess, value: `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${mac}` }]);
  await go(f.page, "/landlord");
  check("a forged landlord cookie is rejected", (await f.page.locator("#password").count()) === 1);
  await f.page.fill("#email", "tolu@adeyemi.test");
  await f.page.fill("#password", "wrong-code-123");
  await f.page.click("button:has-text('Sign in')");
  await f.page.waitForSelector("text=don't match", { timeout: 10000 });
  check("a wrong password is refused", (await f.page.inputValue("#email")) === "tolu@adeyemi.test");
  await go(f.page, "/d/not-a-real-token-at-all-xxxxxxxx");
  check("a made-up deposit link shows nothing", (await f.page.locator("text=This page isn't here.").count()) === 1);
  await go(f.page, "/admin");
  await f.page.fill("#password", "wrong");
  await f.page.click("button:has-text('Sign in')");
  await f.page.waitForSelector("text=Wrong password", { timeout: 10000 });
  check("a wrong arbiter password is refused", true);
  await go(f.page, "/ledger");
  check("the escrow ledger shows the refused second payment", (await f.page.locator("text=second payments refused").count()) === 1);
  check("the escrow ledger shows the reserves covered", (await f.page.locator("text=Fully covered").count()) === 1);
} catch (e) {
  check(`step "${step}" crashed`, false, e.message.split("\n").slice(0, 3).join(" "));
  if (process.env.E2E_SHOTS) {
    for (const [i, ctx] of browser.contexts().entries()) for (const [j, pg] of ctx.pages().entries()) await pg.screenshot({ path: `${process.env.E2E_SHOTS}/crash-${i}-${j}.png`, fullPage: true }).catch(() => {});
  }
}

const serverErrors = serverLog.join("").split("\n").filter((l) => /^\s*(Error|⨯)/.test(l));
check("no server errors", serverErrors.length === 0, serverErrors.slice(0, 3).join(" | "));
check("no browser errors", errors.length === 0, errors.slice(0, 3).join(" | "));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
stop();
process.exit(passed === results.length ? 0 : 1);
