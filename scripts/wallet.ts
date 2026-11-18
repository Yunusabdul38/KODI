/**
 * Kodi's test wallet, managed from one command: npm run wallet [command]
 *
 *   (none)    show the checklist, then set up whatever is missing (asks first)
 *   status    the checklist and balances; changes nothing
 *   channel   ask the faucet for another channel (--sats <amount>)
 *   stop      stop the node; wallets and coins stay
 *   remove    delete the node and its coins (asks first)
 *
 * Everything is on Mutinynet, so no coin has value. It never opens a browser
 * or signs in for you, never stops your running app and never deletes the
 * local database: each escrow wallet gets its own ledger (see src/lib/db.ts).
 * --yes answers yes to the confirmation.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const HUB = "http://127.0.0.1:8082";
const COMPOSE = "infra/testnet/compose.yml";
const ENV_FILE = ".env.local";
const FAUCET = "https://faucet.mutinynet.com";
const FAUCET_NODE = { pubkey: "02465ed5be53d04fde66c9418ff14a5f2267723810176c9212b722e542dc1afb1b", address: "45.79.52.207", port: 9735 };
/** Default channel: small, a tenth of the faucet's daily allowance. Half of it lands on Kodi's side. */
const DEFAULT_SATS = 100_000;
const FAUCET_DAILY = 1_000_000;

const WALLETS = [
  { key: "NWC_URL", name: "Kodi escrow", role: "escrow", scopes: ["make_invoice", "lookup_invoice", "pay_invoice", "get_balance", "get_info"] },
  { key: "TEST_LANDLORD_NWC_URL", name: "Test landlord", role: "landlord" },
  { key: "TEST_AGENT_NWC_URL", name: "Test agent", role: "agent" },
  { key: "TEST_TENANT_NWC_URL", name: "Test tenant", role: "tenant" },
] as const;
const TEST_SCOPES = ["make_invoice", "lookup_invoice", "get_balance", "pay_invoice", "list_transactions", "get_info"];

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("-")) ?? "up";
const yes = args.includes("--yes") || !process.stdin.isTTY;
const satsArg = Number(args[args.indexOf("--sats") + 1]);

// ── terminal output ────────────────────────────────────────────────────────
const tty = process.stdout.isTTY;
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = paint("32"), dim = paint("2"), bold = paint("1"), orange = paint("33");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sats = (n: number) => `${Math.floor(n).toLocaleString("en-US")} sats`;

function header(title: string) {
  console.log(`\n${bold("kodi")} ${dim("·")} ${title}`);
  console.log(dim("Mutinynet test network: these coins have no value.\n"));
}

/** Runs one task with a live "→ label…" line that turns into ✓ or ✗. */
async function task<T>(label: string, run: () => Promise<T>): Promise<T> {
  process.stdout.write(`  ${orange("→")} ${label}…`);
  try {
    const out = await run();
    process.stdout.write(tty ? `\r  ${green("✓")} ${label}   \n` : " done\n");
    return out;
  } catch (e) {
    process.stdout.write(tty ? `\r  ✗ ${label}   \n` : " failed\n");
    throw e;
  }
}

async function confirm(question: string) {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return !(await rl.question(`${question} ${dim("[Y/n]")} `)).trim().toLowerCase().startsWith("n");
  } catch {
    return false; // Ctrl+C / Ctrl+D
  } finally {
    rl.close();
  }
}

// ── .env.local ─────────────────────────────────────────────────────────────
function readEnv() {
  const env = new Map<string, string>();
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env.set(m[1], m[2]);
    }
  }
  return env;
}

function writeEnv(env: Map<string, string>) {
  const out = ["# Kodi test wallet (Mutinynet). Managed by `npm run wallet`; test coins only."];
  for (const [k, v] of env) out.push(`${k}=${v}`);
  writeFileSync(ENV_FILE, out.join("\n") + "\n", { mode: 0o600 });
}

// ── Docker and Alby Hub ────────────────────────────────────────────────────
function compose(...cmd: string[]) {
  const password = readEnv().get("KODI_HUB_PASSWORD") ?? "";
  try {
    execFileSync("docker", ["compose", "-f", COMPOSE, ...cmd], { stdio: "pipe", env: { ...process.env, KODI_HUB_PASSWORD: password } });
  } catch (e) {
    // Docker's progress lines are noise when it works; show them only when it doesn't.
    const out = (e as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(`docker compose ${cmd[0]} failed${out ? `:\n${out}` : ""}`);
  }
}

const dockerRunning = () => {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

interface Info { setupCompleted: boolean; running: boolean; network: string }
interface App { name: string; appPubkey: string; walletPubkey: string; isolated: boolean; balance: number }
interface Channel { active: boolean; localBalance: number; remoteBalance: number }

async function hub<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${HUB}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    // Alby Hub rate-limits its API: back off when it asks.
    if (res.status === 429 && attempt < 6) {
      await sleep(1500 * 2 ** Math.min(attempt, 3));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} answered ${res.status}: ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }
}

async function until(what: string, check: () => Promise<boolean>, seconds: number) {
  for (let t = 0; t < seconds; t += 2) {
    if (await check().catch(() => false)) return;
    await sleep(2000);
  }
  throw new Error(`gave up waiting for ${what}. Logs: docker compose -f ${COMPOSE} logs`);
}

const keyOf = (url?: string) => url?.match(/^nostr\+walletconnect:\/\/([0-9a-f]{64})/)?.[1];

// ── what's there already ───────────────────────────────────────────────────
interface State {
  docker: boolean;
  node: "absent" | "locked" | "ready";
  token?: string;
  apps: App[];
  channels: Channel[];
  missingWallets: (typeof WALLETS)[number][];
}

async function look(): Promise<State> {
  const env = readEnv();
  const s: State = { docker: dockerRunning(), node: "absent", apps: [], channels: [], missingWallets: [...WALLETS] };
  const info = await fetch(`${HUB}/api/info`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json() as Promise<Info>).catch(() => null);
  if (!info?.running) return s;
  s.node = "locked";
  const password = env.get("KODI_HUB_PASSWORD");
  if (!password) return s;
  try {
    s.token = (await hub<{ token: string }>("/api/unlock", { body: { unlockPassword: password, permission: "full" } })).token;
  } catch {
    return s;
  }
  s.node = "ready";
  const listed = await hub<App[] | { apps: App[] }>("/api/apps", { token: s.token });
  s.apps = Array.isArray(listed) ? listed : listed.apps;
  s.channels = await hub<Channel[]>("/api/channels", { token: s.token });
  s.missingWallets = WALLETS.filter((w) => !s.apps.some((a) => a.isolated && a.walletPubkey === keyOf(env.get(w.key))));
  return s;
}

const channelReady = (cs: Channel[]) => cs.some((c) => c.active && c.remoteBalance > 0);

function checklist(s: State) {
  const row = (ok: boolean, label: string, detail: string) => console.log(`  ${ok ? green("●") : dim("○")} ${label.padEnd(16)}${ok ? detail : dim(detail)}`);
  row(s.docker, "Docker", s.docker ? "running" : "not running: start Docker Desktop");
  row(s.node === "ready", "Lightning node", s.node === "ready" ? HUB : s.node === "locked" ? "running, but its password isn't in .env.local" : "not started");
  const made = WALLETS.length - s.missingWallets.length;
  row(made === WALLETS.length, "Wallets", made === WALLETS.length ? "escrow, landlord, agent, tenant" : `${made} of ${WALLETS.length} created`);
  const local = s.channels.reduce((n, c) => n + c.localBalance, 0) / 1000;
  const remote = s.channels.reduce((n, c) => n + c.remoteBalance, 0) / 1000;
  row(
    channelReady(s.channels),
    "Channel",
    channelReady(s.channels) ? `${sats(local)} to spend, room for ${sats(remote)} more` : s.channels.length ? "opened, waiting for a block" : "none yet",
  );
}

// ── commands ───────────────────────────────────────────────────────────────
async function up() {
  header("test wallet");
  let s = await look();
  checklist(s);
  if (s.node === "ready" && !s.missingWallets.length && channelReady(s.channels)) {
    balances(s);
    return next(false);
  }
  if (!s.docker) {
    console.log(`\nStart Docker Desktop, then run ${bold("npm run wallet")} again.`);
    console.log(dim("No Docker? `npm run dev` runs Kodi with a simulated wallet instead."));
    process.exit(1);
  }
  if (s.node === "locked") {
    console.log(`\nA node is running on ${HUB}, but .env.local has no password for it.`);
    console.log(`To start fresh, run ${bold("npm run wallet remove")}, then ${bold("npm run wallet")}.`);
    process.exit(1);
  }

  console.log(`\n${bold("Missing items will be set up:")}`);
  if (s.node !== "ready") console.log(`  • start Alby Hub in Docker (project kodi-testnet, dashboard on ${HUB})`);
  if (s.missingWallets.length) console.log(`  • create ${s.missingWallets.map((w) => w.role).join(", ")} ${s.missingWallets.length > 1 ? "wallets" : "wallet"}, saved to ${ENV_FILE}`);
  if (!s.channels.length) console.log(`  • a ${sats(DEFAULT_SATS)} channel from the Mutinynet faucet (you sign in to GitHub yourself)`);
  console.log(dim("  Your running app and its data aren't touched."));
  if (!(await confirm("\nGo ahead?"))) return console.log("Nothing changed.");
  console.log();

  const env = readEnv();
  const fresh = !env.get("KODI_HUB_PASSWORD");
  if (fresh) {
    env.set("KODI_HUB_PASSWORD", randomBytes(18).toString("base64url"));
    writeEnv(env);
  }
  const password = env.get("KODI_HUB_PASSWORD")!;

  if (s.node !== "ready") {
    await task("Starting Alby Hub", async () => {
      compose("up", "-d");
      await until("Alby Hub", async () => (await fetch(`${HUB}/api/info`)).ok, 120);
    });
    const info = await hub<Info>("/api/info");
    if (!info.setupCompleted) {
      await task("Creating the Lightning node", async () => {
        await hub("/api/setup", { body: { unlockPassword: password, backendType: "LDK" } });
        await hub("/api/start", { body: { unlockPassword: password } });
      });
    }
    await task("Waiting for the node to come online", () => until("the node", async () => (await hub<Info>("/api/info")).running, 180));
    if ((await hub<Info>("/api/info")).network !== "signet") throw new Error("the node isn't on Mutinynet (signet)");
    s = await look();
    if (s.node !== "ready") throw new Error("the node didn't accept the password in .env.local; try `npm run wallet remove`, then `npm run wallet`");
  }

  // Isolated sub-wallets: each sees only its own coins, so the escrow balance
  // is exactly what Kodi holds and the reserve check balances to the sat.
  for (const w of s.missingWallets) {
    await task(`Creating the ${w.role} wallet`, async () => {
      const scopes = "scopes" in w ? [...w.scopes] : TEST_SCOPES;
      const app = await hub<{ pairingUri: string }>("/api/apps", {
        token: s.token,
        body: { name: `${w.name} ${randomBytes(2).toString("hex")}`, budgetRenewal: "never", maxAmount: 0, scopes, isolated: true },
      });
      env.set(w.key, app.pairingUri);
    });
  }
  env.set("LIGHTNING_NETWORK", "mutinynet");
  if (!env.get("APP_URL")) env.set("APP_URL", "http://localhost:3100");
  if (!env.get("SESSION_SECRET")) env.set("SESSION_SECRET", randomBytes(36).toString("base64"));
  writeEnv(env);

  s = await look();
  if (!s.channels.length) await openChannel(s, DEFAULT_SATS);
  if (!channelReady(s.channels)) {
    await task("Waiting for the channel to confirm (a Mutinynet block every ~30 s)", () =>
      until("the channel", async () => channelReady((s = await look()).channels), 15 * 60),
    );
  }
  console.log();
  checklist(s);
  balances(s);
  next(s.missingWallets.length > 0 || fresh);
}

async function openChannel(s: State, amount: number) {
  if (!s.token) throw new Error("the node isn't running: run `npm run wallet` first");
  await hub("/api/peers", { token: s.token, body: FAUCET_NODE }).catch(() => {}); // fine if already connected
  const { pubkey } = await hub<{ pubkey: string }>("/api/node/connection-info", { token: s.token });
  console.log(`
  ${bold("Test coins come from the Mutinynet faucet.")} It opens a ${sats(amount)} channel to this
  node after a GitHub sign-in (any account; it only reads your email), and half of it is yours to spend.
  Up to ${sats(FAUCET_DAILY)} a day: add more later with ${bold("npm run wallet channel -- --sats 250000")}.`);
  if (!(await confirm("\n  Sign in from here with a one-time code? (n shows how to do it on the website)"))) {
    manualSteps(pubkey, amount);
    process.exit(0);
  }
  try {
    await faucetChannel(pubkey, amount);
  } catch (e) {
    console.log(`\n  The faucet didn't open it (${(e as Error).message}).`);
    manualSteps(pubkey, amount);
    process.exit(1);
  }
}

/** GitHub's device flow: the person types a short code on github.com; we never see a password. */
async function faucetChannel(pubkey: string, amount: number) {
  const { client_id } = (await (await fetch(`${FAUCET}/auth/github/client_id`)).json()) as { client_id: string };
  const form = async <T>(url: string, body: Record<string, string>) =>
    (await (await fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) })).json()) as T;
  const device = await form<{ device_code: string; user_code: string; verification_uri: string; interval: number }>("https://github.com/login/device/code", { client_id, scope: "user:email" });
  if (!device.user_code) throw new Error("GitHub didn't start the sign-in");
  console.log(`\n    Open ${bold(device.verification_uri)} and enter ${bold(device.user_code)}`);
  console.log(dim(`    then approve "Mutinynet Faucet". The code lasts about 15 minutes; Ctrl+C cancels.\n`));

  let wait = device.interval || 5;
  let githubToken = "";
  await task("Waiting for your approval on GitHub", async () => {
    for (;;) {
      await sleep(wait * 1000);
      const r = await form<{ access_token?: string; error?: string }>("https://github.com/login/oauth/access_token", {
        client_id,
        device_code: device.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
      if (r.access_token) return void (githubToken = r.access_token);
      if (r.error === "slow_down") wait += 5;
      else if (r.error !== "authorization_pending") throw new Error(`GitHub sign-in ${r.error ?? "failed"}`);
    }
  });
  await task(`Asking the faucet for ${sats(amount)}`, async () => {
    const login = await fetch(`${FAUCET}/auth/github/device`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: githubToken }) });
    if (!login.ok) throw new Error(`faucet sign-in failed (${login.status})`);
    const { token } = (await login.json()) as { token: string };
    const res = await fetch(`${FAUCET}/api/channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ capacity: amount, push_amount: Math.floor(amount / 2), pubkey }),
    });
    if (!res.ok) throw new Error((await res.text()) || `faucet answered ${res.status}`);
  });
}

function manualSteps(pubkey: string, amount: number) {
  console.log(`
  On the faucet's website instead:
    1. Open ${FAUCET} and sign in with GitHub.
    2. Under "Lightning channel", paste this node's key:
         ${pubkey}
       Capacity ${amount.toLocaleString("en-US")}, push amount ${Math.floor(amount / 2).toLocaleString("en-US")}, host left empty.
    3. Run ${bold("npm run wallet")} again: it waits for the channel and finishes.`);
}

function balances(s: State) {
  const env = readEnv();
  const of = (key: string) => (s.apps.find((a) => a.walletPubkey === keyOf(env.get(key)))?.balance ?? 0) / 1000;
  console.log(`\n  ${dim("Balances")}  ` + WALLETS.map((w) => `${w.role} ${sats(of(w.key))}`).join(dim("  ·  ")));
  console.log(`  ${dim("Dashboard")} ${HUB}  ${dim("password")} ${env.get("KODI_HUB_PASSWORD")}`);
}

function next(restart: boolean) {
  console.log(`
${bold("Next")}
  ${restart ? "Restart the app if it's running (Ctrl+C), then: " : ""}npm run dev  →  http://localhost:3100
  Pay a deposit from the dashboard: copy the payment request, then Send in Alby Hub.
  ${dim("The demo data you had before stays in its own ledger and returns if you remove the wallet settings.")}
`);
}

async function status() {
  header("test wallet status");
  const s = await look();
  checklist(s);
  if (s.node === "ready") balances(s);
  console.log();
}

async function channel() {
  const amount = Number.isFinite(satsArg) && satsArg > 0 ? Math.round(satsArg) : DEFAULT_SATS;
  if (amount < 20_000 || amount > FAUCET_DAILY) throw new Error(`--sats must be between 20,000 and ${FAUCET_DAILY.toLocaleString("en-US")}`);
  header("another test channel");
  const s = await look();
  await openChannel(s, amount);
  await task("Waiting for it to confirm", () => until("the channel", async () => (await look()).channels.filter((c) => c.active).length > s.channels.filter((c) => c.active).length, 15 * 60));
  await status();
}

async function stop() {
  header("stopping the test node");
  await task("Stopping Alby Hub", async () => compose("stop"));
  console.log(dim("\n  Wallets and coins are kept. `npm run wallet` starts it again.\n"));
}

async function remove() {
  header("removing the test node");
  console.log("  This deletes the node, its wallets and its test coins. The app falls back to the simulated wallet.");
  if (!(await confirm("\n  Delete it?"))) return console.log("Nothing changed.");
  await task("Deleting Alby Hub and its data", async () => compose("down", "-v"));
  const env = readEnv();
  for (const k of ["KODI_HUB_PASSWORD", "LIGHTNING_NETWORK", ...WALLETS.map((w) => w.key)]) env.delete(k);
  writeEnv(env);
  console.log(dim(`\n  Removed the wallet settings from ${ENV_FILE}. Restart \`npm run dev\` to use the simulated wallet.\n`));
}

const commands: Record<string, () => Promise<unknown>> = { up, status, channel, stop, remove };
if (!commands[command]) {
  console.log("Usage: npm run wallet [status | channel -- --sats 250000 | stop | remove]");
  process.exit(1);
}
commands[command]().catch((e) => {
  console.error(`\n  Stopped: ${(e as Error).message}\n`);
  process.exit(1);
});
