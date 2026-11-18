import "server-only";
import { sql } from "./db";
import type {
  AuditEntry,
  Deposit,
  Dispute,
  Landlord,
  Payout,
  ReserveSnapshot,
  Unit,
  UnitStatus,
  Vault,
  VaultPayment,
} from "./types";

/**
 * All database access. Money rules are also enforced by triggers and
 * constraints in db/migrations, so a bug here can't rewrite history or let a
 * unit twice.
 */

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

// bigint and numeric columns arrive as strings; the app uses numbers.
const NUMERIC = new Set([
  "annual_rent_ngn", "agent_fee_ngn", "rent_ngn", "ngn_per_btc", "amount_sats", "rent_sats", "agent_sats",
  "target_ngn", "amount_ngn", "wallet_balance_sats", "ledger_total_sats", "difference_sats", "offset_seconds",
]);

function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[toCamel(k)] =
      v instanceof Date
        ? k.endsWith("_date")
          ? v.toISOString().slice(0, 10)
          : v.toISOString()
        : v != null && NUMERIC.has(k)
          ? Number(v)
          : v;
  }
  return out as T;
}

export async function q<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await (await sql()).query(text, params)).map((r) => fromRow<T>(r));
}
async function first<T>(text: string, params: unknown[]): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

/** Table and column names only ever come from code, never from input. */
async function insert<T>(table: string, obj: object): Promise<T> {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  const cols = entries.map(([k]) => toSnake(k)).join(", ");
  const vals = entries.map((_, i) => `$${i + 1}`).join(", ");
  return (await q<T>(`insert into ${table} (${cols}) values (${vals}) returning *`, entries.map(([, v]) => v)))[0];
}
/** Updates a row; `where` adds conditions (e.g. the status it must still have). Null when nothing matched. */
async function update<T>(table: string, id: string, patch: object, where = ""): Promise<T | null> {
  const entries = Object.entries(patch).filter(([k, v]) => v !== undefined && k !== "id");
  const set = entries.map(([k], i) => `${toSnake(k)} = $${i + 2}`).join(", ");
  return first<T>(`update ${table} set ${set} where id = $1 ${where} returning *`, [id, ...entries.map(([, v]) => v)]);
}

// ---------------------------------------------------------------- landlords

export const listLandlords = () => q<Landlord>("select * from landlords order by created_at desc");
export const getLandlord = (id: string) => first<Landlord>("select * from landlords where id = $1", [id]);
export const getLandlordByEmail = (email: string) =>
  first<Landlord>("select * from landlords where email = $1", [email.trim().toLowerCase()]);
export const createLandlord = (l: Omit<Landlord, "id" | "verified" | "declinedReason" | "reviewedAt" | "createdAt">) =>
  insert<Landlord>("landlords", l);
export const updateLandlord = (id: string, patch: Partial<Landlord>) => update<Landlord>("landlords", id, patch);

// -------------------------------------------------------------------- units

export const getUnit = (id: string) => first<Unit>("select * from units where id = $1", [id]);
export const getUnitByCode = (code: string) =>
  first<Unit>("select * from units where code = $1", [code.trim().toUpperCase()]);
export const listUnitsByLandlord = (landlordId: string) =>
  q<Unit>("select * from units where landlord_id = $1 order by created_at desc", [landlordId]);
/** Units anyone can browse: listed, not frozen, from a verified landlord. */
export const listPublicUnits = () =>
  q<Unit>(
    `select u.* from units u join landlords l on l.id = u.landlord_id
     where u.listed and not u.frozen and l.verified order by u.created_at desc`,
  );
export const listAllUnits = () => q<Unit>("select * from units order by created_at desc");
export const createUnit = (u: Omit<Unit, "id" | "createdAt" | "listed" | "frozen" | "city"> & { city?: string }) =>
  insert<Unit>("units", u);
export const updateUnit = (id: string, patch: Partial<Unit>) => update<Unit>("units", id, patch);

/**
 * What the public sees: derived from deposits, never stored, so it can't
 * drift from the money. "Let" lasts from move-in for the months paid.
 */
export async function unitStatus(u: Unit, nowIso: string): Promise<UnitStatus> {
  if (!u.listed || u.frozen) return "unlisted";
  const [row] = await q<{ active: string | null; letUntil: string | null }>(
    `select
       (select status::text from deposits where unit_id = $1
          and status in ('awaiting_payment','held','refund_requested','disputed') limit 1) as active,
       (select max(move_in_date + make_interval(months => months)) from deposits
          where unit_id = $1 and status = 'released') as let_until`,
    [u.id],
  );
  if (row.active === "awaiting_payment") return "reserved";
  if (row.active) return "deposit_held";
  if (row.letUntil && Date.parse(row.letUntil) > Date.parse(nowIso)) return "let";
  return "available";
}

// ----------------------------------------------------------------- deposits

export const getDeposit = (id: string) => first<Deposit>("select * from deposits where id = $1", [id]);
export const getDepositByToken = (tokenHash: string) =>
  first<Deposit>("select * from deposits where token_hash = $1", [tokenHash]);
export const getDepositByPaymentHash = (hash: string) =>
  first<Deposit>("select * from deposits where payment_hash = $1", [hash]);
export const activeDepositForUnit = (unitId: string) =>
  first<Deposit>(
    "select * from deposits where unit_id = $1 and status in ('awaiting_payment','held','refund_requested','disputed')",
    [unitId],
  );
export const listDepositsForUnits = (unitIds: string[]) =>
  q<Deposit>(
    "select * from deposits where unit_id = any($1) and status <> 'expired' order by created_at desc",
    [unitIds],
  );
export const listDeposits = (statuses?: string[]) =>
  statuses
    ? q<Deposit>("select * from deposits where status::text = any($1) order by created_at desc", [statuses])
    : q<Deposit>("select * from deposits where status <> 'expired' order by created_at desc");
export const listAwaitingDeposits = () =>
  q<Deposit>("select * from deposits where status = 'awaiting_payment' order by created_at");
export const createDeposit = (d: Omit<Deposit, "id" | "status" | "preimage" | "paidAt" | "landlordConfirmedAt" | "movedInAt" | "refundRequestedAt" | "closedAt" | "createdAt">) =>
  insert<Deposit>("deposits", d);
/**
 * Moves a deposit on only if it is still in one of `from`, so two clicks (or
 * a click and the daily job) can't both act. Null when it had already moved.
 */
export async function moveDeposit(id: string, from: string[], patch: Partial<Deposit>): Promise<Deposit | null> {
  const entries = Object.entries(patch).filter(([k, v]) => v !== undefined && k !== "id");
  const set = entries.map(([k], i) => `${toSnake(k)} = $${i + 3}`).join(", ");
  return first<Deposit>(
    `update deposits set ${set} where id = $1 and status::text = any($2) returning *`,
    [id, from, ...entries.map(([, v]) => v)],
  );
}

// ------------------------------------------------------------------- vaults

export const getVault = (id: string) => first<Vault>("select * from vaults where id = $1", [id]);
export const getVaultByToken = (tokenHash: string) => first<Vault>("select * from vaults where token_hash = $1", [tokenHash]);
export const getVaultByLandlordToken = (tokenHash: string) =>
  first<Vault>("select * from vaults where landlord_token_hash = $1", [tokenHash]);
export const getVaultByCode = (code: string) => first<Vault>("select * from vaults where code = $1", [code.trim().toUpperCase()]);
export const listVaultsForUnits = (unitIds: string[]) =>
  q<Vault>("select * from vaults where unit_id = any($1) order by created_at desc", [unitIds]);
export const listVaults = () => q<Vault>("select * from vaults order by created_at desc");
export const listDueVaults = (today: string) =>
  q<Vault>("select * from vaults where status = 'active' and due_date <= $1::date order by due_date", [today]);
export const createVault = (v: Omit<Vault, "id" | "status" | "closedAt" | "createdAt">) => insert<Vault>("vaults", v);
export const closeVault = (id: string, status: "paid" | "returned", closedAt: string) =>
  update<Vault>("vaults", id, { status, closedAt }, "and status = 'active'");

export const listVaultPayments = (vaultId: string) =>
  q<VaultPayment>("select * from vault_payments where vault_id = $1 and status <> 'expired' order by created_at desc", [vaultId]);
export const getVaultPayment = (id: string) => first<VaultPayment>("select * from vault_payments where id = $1", [id]);
export const getVaultPaymentByHash = (hash: string) =>
  first<VaultPayment>("select * from vault_payments where payment_hash = $1", [hash]);
export const listPendingVaultPayments = () =>
  q<VaultPayment>("select * from vault_payments where status = 'pending' order by created_at");
export const createVaultPayment = (p: Omit<VaultPayment, "id" | "status" | "preimage" | "paidAt" | "createdAt">) =>
  insert<VaultPayment>("vault_payments", p);
export const settleVaultPayment = (id: string, patch: Partial<VaultPayment>) =>
  update<VaultPayment>("vault_payments", id, patch, "and status = 'pending'");

export async function vaultSavedSats(vaultId: string) {
  const [r] = await q<{ paidIn: string; paidOut: string }>(
    `select coalesce((select sum(amount_sats) from vault_payments where vault_id = $1 and status = 'paid'), 0) as paid_in,
            coalesce((select sum(amount_sats) from payouts where vault_id = $1 and status <> 'failed'), 0) as paid_out`,
    [vaultId],
  );
  return { paidIn: Number(r.paidIn), paidOut: Number(r.paidOut) };
}
export async function vaultSavedNgn(vaultId: string) {
  const [r] = await q<{ n: string }>(
    "select coalesce(sum(amount_ngn), 0) as n from vault_payments where vault_id = $1 and status = 'paid'",
    [vaultId],
  );
  return Number(r.n);
}

// ------------------------------------------------------------------ payouts

export const createPayout = (p: Omit<Payout, "id" | "status" | "paymentHash" | "preimage" | "error" | "createdAt" | "sentAt">) =>
  insert<Payout>("payouts", p);
export const getPayout = (id: string) => first<Payout>("select * from payouts where id = $1", [id]);
export const getPayoutByKey = (key: string) => first<Payout>("select * from payouts where idempotency_key = $1", [key]);
export const listPayoutsForDeposit = (depositId: string) =>
  q<Payout>("select * from payouts where deposit_id = $1 order by created_at", [depositId]);
export const listPayoutsForVault = (vaultId: string) =>
  q<Payout>("select * from payouts where vault_id = $1 order by created_at", [vaultId]);
export const listPayouts = (status?: Payout["status"]) =>
  status
    ? q<Payout>("select * from payouts where status = $1 order by created_at desc", [status])
    : q<Payout>("select * from payouts order by created_at desc limit 200");
export const markPayout = (id: string, patch: Partial<Payout>) =>
  update<Payout>("payouts", id, patch, "and status = 'pending'");

// ----------------------------------------------------------------- disputes

export const openDisputeFor = (depositId: string) =>
  first<Dispute>("select * from disputes where deposit_id = $1 and decision is null", [depositId]);
export const listDisputesFor = (depositId: string) =>
  q<Dispute>("select * from disputes where deposit_id = $1 order by created_at", [depositId]);
export const listOpenDisputes = () => q<Dispute>("select * from disputes where decision is null order by created_at");
export const createDispute = (d: Pick<Dispute, "depositId" | "raisedBy" | "reason">) => insert<Dispute>("disputes", d);
export const decideDispute = (id: string, patch: Pick<Dispute, "decision" | "decisionNote" | "decidedAt">) =>
  update<Dispute>("disputes", id, patch, "and decision is null");

// -------------------------------------------------------------------- audit

export const addAudit = (a: Omit<AuditEntry, "id" | "createdAt" | "unitId" | "depositId" | "vaultId" | "actor" | "details"> & Partial<Pick<AuditEntry, "unitId" | "depositId" | "vaultId" | "actor" | "details">>) =>
  insert<AuditEntry>("audit_log", a);
export const auditForDeposit = (depositId: string) =>
  q<AuditEntry>("select * from audit_log where deposit_id = $1 order by created_at", [depositId]);
export const auditForVault = (vaultId: string) =>
  q<AuditEntry>("select * from audit_log where vault_id = $1 order by created_at", [vaultId]);

// ---------------------------------------------------- reserves and changes

export async function ledgerTotalSats() {
  const [r] = await q<{ n: string }>("select ledger_total_sats() as n");
  return Number(r.n);
}
export const addSnapshot = (s: Omit<ReserveSnapshot, "id" | "takenAt">) => insert<ReserveSnapshot>("reserve_snapshots", s);
export const latestSnapshots = (n = 24) =>
  q<ReserveSnapshot>("select * from reserve_snapshots order by taken_at desc limit $1", [n]);

export async function totals() {
  const [r] = await q<Record<string, string>>(
    `select
       coalesce((select sum(amount_sats) from deposits where status in ('held','refund_requested','disputed')), 0) as held_deposits,
       (select count(*) from deposits where status in ('held','refund_requested','disputed')) as held_count,
       coalesce((select sum(p.amount_sats) from vault_payments p join vaults v on v.id = p.vault_id
                  where p.status = 'paid' and v.status = 'active'), 0) as vault_savings,
       (select count(*) from vaults where status = 'active') as vault_count,
       coalesce((select sum(amount_sats) from payouts where status = 'sent' and recipient in ('landlord','agent')), 0) as paid_to_landlords,
       coalesce((select sum(amount_sats) from payouts where status = 'sent' and recipient = 'tenant'), 0) as refunded,
       (select count(*) from deposits where status = 'released') as released_count,
       (select count(*) from audit_log where action = 'second_deposit_blocked') as blocked_count`,
  );
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [toCamel(k), Number(v)])) as {
    heldDeposits: number; heldCount: number; vaultSavings: number; vaultCount: number;
    paidToLandlords: number; refunded: number; releasedCount: number; blockedCount: number;
  };
}

/** Changes whenever anything a page shows changes; polled by every open page. */
export async function changeMarker() {
  const [r] = await q<{ m: string }>(
    `select concat_ws('|',
       (select max(created_at) from audit_log),
       (select count(*) from deposits where status <> 'awaiting_payment'),
       (select count(*) from vault_payments where status = 'paid'),
       (select count(*) from payouts where status <> 'pending'),
       (select count(*) from landlords), (select max(reviewed_at) from landlords),
       (select count(*) from units), (select max(taken_at) from reserve_snapshots),
       (select offset_seconds from demo_clock)) as m`,
  );
  return r.m;
}

// ---------------------------------------------------------------- demo clock

export async function clockOffsetSeconds() {
  const [r] = await q<{ offsetSeconds: number }>("select offset_seconds from demo_clock");
  return r?.offsetSeconds ?? 0;
}
export const setClockOffsetSeconds = (s: number) => q("update demo_clock set offset_seconds = $1", [s]);

export const getPayoutByHash = (hash: string) => first<Payout>("select * from payouts where payment_hash = $1", [hash]);
