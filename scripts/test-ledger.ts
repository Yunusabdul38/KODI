/**
 * Escrow and ledger checks against a throwaway in-memory database and the
 * simulated wallet: npm run test:ledger
 *
 * Covers the rules that protect money: one active deposit per unit, payment
 * only through the wallet, the payout split, refunds after the objection
 * window, the arbiter, Rent Vault payouts, and the append-only ledger.
 */
process.env.SAMPLE_DATA = "true";
process.env.LOCAL_DB = "memory";
delete process.env.NWC_URL;
delete process.env.DATABASE_URL;

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : `  (${extra})`}`);
};
const rejects = async (p: Promise<unknown>, re?: RegExp) => {
  try {
    await p;
    return false;
  } catch (e) {
    return re ? re.test((e as Error).message) : true;
  }
};

async function main() {
  const data = await import("../src/lib/data");
  const deposits = await import("../src/lib/deposits");
  const vaults = await import("../src/lib/vaults");
  const { markDemoInvoicePaid } = await import("../src/lib/lightning/demo");
  const { sql } = await import("../src/lib/db");
  const db = await sql();

  const unit = (await data.getUnitByCode("KD-YABA2"))!;
  const tenant = (n: number) => ({
    unit,
    tenantName: `Tenant ${n}`,
    tenantEmail: `tenant${n}@test.ng`,
    tenantPhone: "+234 800 000 0000",
    months: 12,
    moveInDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    refundMethod: "test_wallet" as const,
    refundAddress: null,
  });
  const pay = async (d: { paymentHash: string; id: string }) => {
    markDemoInvoicePaid(d.paymentHash);
    return deposits.settleDeposit((await data.getDeposit(d.id))!);
  };
  const skipDays = async (days: number) => data.setClockOffsetSeconds((await data.clockOffsetSeconds()) + days * 86_400);

  // ---------------------------------------------------------------- the lock
  const q12 = await deposits.quote(unit, 12);
  check("a year's rent plus the agent fee", q12.rentNgn === 2_400_000 && q12.agentFeeNgn === 240_000);
  check("sats split exactly into rent and agent shares", q12.rentSats + q12.agentSats === q12.amountSats);
  check("more than 12 months is capped at 12 (Lagos Tenancy Law)", (await deposits.quote(unit, 24)).months === 12);

  const a = await deposits.startDeposit(tenant(1));
  check("first tenant gets an invoice", a.deposit.status === "awaiting_payment");
  check("a second tenant is blocked while the first is paying", await rejects(deposits.startDeposit(tenant(2)), /already has a deposit/));
  check(
    "the database itself refuses a second active deposit",
    await rejects(
      db.query(
        `insert into deposits (unit_id, tenant_name, tenant_email, tenant_phone, token_hash, months, rent_ngn, agent_fee_ngn, ngn_per_btc,
          amount_sats, rent_sats, agent_sats, move_in_date, payment_hash, payment_request, expires_at)
         values ($1,'x','x@x','1','tok',12,1,0,1,1,1,0,current_date,repeat('a',64),'lnbc',now())`,
        [unit.id],
      ),
      /deposits_one_active_per_unit/,
    ),
  );
  const blocked = await db.query<{ n: number }>("select count(*)::int as n from audit_log where action = 'second_deposit_blocked'");
  check("blocked attempts are logged", blocked[0].n >= 1);

  check("a browser can't mark a deposit paid: settling an unpaid invoice changes nothing", (await deposits.settleDeposit(a.deposit)).status === "awaiting_payment");
  const held = await pay(a.deposit);
  check("paying holds the deposit", held.status === "held" && Boolean(held.paidAt));
  check("still locked once held", await rejects(deposits.startDeposit(tenant(3)), /already has a deposit/));
  check("deposit terms can't be rewritten", await rejects(db.query("update deposits set amount_sats = 1 where id = $1", [held.id]), /terms are fixed/));
  check("deposits can't be deleted", await rejects(db.query("delete from deposits where id = $1", [held.id]), /append-only/));
  check("escrow holds exactly the deposit", (await data.ledgerTotalSats()) === held.amountSats);

  // ------------------------------------------------------------ move in: pay out
  check("refund can't be asked before the move-in date", await rejects(deposits.requestRefund(held), /once the move-in date/));
  const released = await deposits.releaseDeposit(held, { role: "tenant", actor: held.tenantEmail });
  const outs = await data.listPayoutsForDeposit(held.id);
  const landlordOut = outs.find((p) => p.recipient === "landlord");
  const agentOut = outs.find((p) => p.recipient === "agent");
  check("moving in releases the deposit", released.status === "released");
  check("landlord paid the rent share", landlordOut?.status === "sent" && landlordOut.amountSats === held.rentSats);
  check("agent paid the fee share", agentOut?.status === "sent" && agentOut.amountSats === held.agentSats);
  check("escrow is empty again", (await data.ledgerTotalSats()) === 0);
  check("a second release is refused", await rejects(deposits.releaseDeposit(released, { role: "tenant", actor: "x" })));
  check(
    "the database refuses paying out more than was held",
    await rejects(
      db.query(
        "insert into payouts (deposit_id, recipient, method, destination, amount_sats, ngn_per_btc, idempotency_key) values ($1,'landlord','test_wallet','x',1,1,'dup')",
        [held.id],
      ),
      /exceeds/,
    ),
  );
  check("released deposits can't go back", await rejects(db.query("update deposits set status = 'held' where id = $1", [held.id]), /cannot go from/));
  check("the unit shows as let", (await data.unitStatus(unit, (await import("../src/lib/clock")).lagosDate(new Date()) + "T12:00:00Z")) === "let");

  // ------------------------------------------------------- refund after 48 hours
  const unit2 = (await data.getUnitByCode("KD-SURU4"))!;
  const b = await deposits.startDeposit({ ...tenant(4), unit: unit2, months: 6 });
  const bHeld = await pay(b.deposit);
  check("six months' rent, no agent", bHeld.rentNgn === 325_000 && bHeld.agentSats === 0);
  await skipDays(4); // past the move-in date
  const asked = await deposits.requestRefund(bHeld);
  check("refund requested after the move-in date", asked.status === "refund_requested");
  check("unit stays locked during the refund window", await rejects(deposits.startDeposit({ ...tenant(5), unit: unit2 }), /already has a deposit/));
  check("no refund before 48 hours", (await deposits.processDueRefunds()).length === 0);
  await skipDays(2);
  check("refund paid once the window passes", (await deposits.processDueRefunds()).includes(bHeld.id));
  const refundOut = (await data.listPayoutsForDeposit(bHeld.id))[0];
  check("the whole deposit goes back to the tenant", refundOut.recipient === "tenant" && refundOut.amountSats === bHeld.amountSats);
  check("the unit is free again", Boolean(await deposits.startDeposit({ ...tenant(6), unit: unit2, moveInDate: (await import("../src/lib/clock")).lagosDate(new Date(Date.now() + 7 * 86_400_000)) }).catch(() => null)));

  // ------------------------------------------------------------ the arbiter
  const unit3 = (await data.getUnitByCode("KD-IKEJ2"))!;
  const c = await deposits.startDeposit({ ...tenant(7), unit: unit3, moveInDate: (await import("../src/lib/clock")).lagosDate(new Date(Date.now() + ((await data.clockOffsetSeconds()) + 86_400) * 1000)) });
  const cHeld = await pay(c.deposit);
  await skipDays(2);
  const cAsked = await deposits.requestRefund(cHeld);
  const objected = await deposits.openDispute(cAsked, { role: "landlord", actor: "chinedu@okafor.test" }, "I handed over the keys on the 3rd.");
  check("landlord can object within 48 hours", objected.status === "disputed");
  await skipDays(3);
  check("an open dispute stops the automatic refund", !(await deposits.processDueRefunds()).includes(cHeld.id));
  const dispute = (await data.openDisputeFor(cHeld.id))!;
  await deposits.decide(dispute, "release", "Landlord showed the signed handover note.");
  check("arbiter's decision releases to the landlord", (await data.getDeposit(cHeld.id))!.status === "released");
  check("a decided dispute can't be decided again", await rejects(deposits.decide(dispute, "refund", "")));

  // --------------------------------------------------------------- Rent Vault
  const today = (await import("../src/lib/clock")).today;
  const due = new Date(Date.parse(await today()) + 60 * 86_400_000).toISOString().slice(0, 10);
  const terms = { targetNgn: 2_400_000, dueDate: due, schedule: "monthly" as const, pin: "135790" };
  const ask = await vaults.startVault({ unit: unit3, tenantName: "Stranger", tenantEmail: "stranger@test.ng", ...terms });
  check("a vault asked for by home code waits for the landlord", ask.vault.status === "pending");
  check("a waiting vault can't take money", await rejects(vaults.topUp(ask.vault, 1000, null), /landlord confirms/));
  check("the database refuses money into a waiting vault", await rejects(db.query("insert into vault_payments (vault_id) values ($1)", [ask.vault.id]), /not open for payments/));
  check("only the home's landlord can answer a request", await rejects(vaults.decideVaultRequest(ask.vault, "ll_bello", true), /one of your homes/));
  const releasedC = (await data.getDeposit(cHeld.id))!;
  const v = await vaults.startVault({ unit: unit3, tenantName: releasedC.tenantName, tenantEmail: releasedC.tenantEmail, ...terms, deposit: releasedC });
  check("a vault opened from the tenant's own deposit opens at once", v.vault.status === "active");
  check("opening it declines other requests for the home", (await data.getVault(ask.vault.id))!.status === "declined");
  check("a home can't have a second Rent Vault", await rejects(vaults.startVault({ unit: unit3, tenantName: "Second", tenantEmail: "second@test.ng", ...terms }), /already has a Rent Vault/));
  check(
    "the database itself refuses a second open vault for a home",
    await rejects(
      db.query(
        "insert into vaults (code, unit_id, tenant_name, tenant_email, token_hash, landlord_token_hash, target_ngn, due_date, schedule, status) values ('RV-TTTTTT', $1, 'x', 'x@test.ng', 'th', 'lth', 1000000, $2, 'monthly', 'active')",
        [unit3.id, due],
      ),
      /vaults_one_active_per_unit/,
    ),
  );
  const lekki = (await data.getUnitByCode("KD-LEKK3"))!;
  const ask2 = await vaults.startVault({ unit: lekki, tenantName: "Sitting tenant", tenantEmail: "sitting@test.ng", ...terms });
  const approved = await vaults.decideVaultRequest(ask2.vault, lekki.landlordId, true);
  check("the landlord's confirmation opens a requested vault", approved.status === "active");
  check("a request can't be answered twice", await rejects(vaults.decideVaultRequest(approved, lekki.landlordId, false), /already answered/));
  const p1 = await vaults.topUp(v.vault, 400_000, null);
  const p2 = await vaults.topUp(v.vault, 200_000, "Auntie Bisi (London)");
  check("unpaid top-ups don't count", (await vaults.vaultView(v.vault)).savedNgn === 0);
  markDemoInvoicePaid(p1.paymentHash);
  markDemoInvoicePaid(p2.paymentHash);
  await vaults.settleVaultPayment(p1);
  await vaults.settleVaultPayment(p2);
  const view = await vaults.vaultView(v.vault);
  check("vault shows what was saved in naira", view.savedNgn === 600_000 && view.payments.length === 2);
  check("vault suggests what to save each month", view.perPeriodNgn > 0 && view.perPeriodNgn <= 1_800_000);
  check("nothing is paid before the due date", (await vaults.payDueVaults()).length === 0);
  await skipDays(61);
  check("on the due date the vault pays the landlord", (await vaults.payDueVaults()).includes(v.vault.id));
  const vOut = (await data.listPayoutsForVault(v.vault.id))[0];
  check("landlord receives everything saved", vOut.status === "sent" && vOut.amountSats === p1.amountSats + p2.amountSats);
  check("a paid vault can't take top-ups", await rejects(vaults.topUp((await data.getVault(v.vault.id))!, 1000, null), /closed/));

  // -------------------------------------------------------------- the ledger
  check("audit log can't be edited", await rejects(db.query("update audit_log set action = 'x'"), /append-only/));
  check("audit log can't be deleted", await rejects(db.query("delete from audit_log"), /append-only/));
  const open = await db.query<{ n: string }>("select ledger_total_sats() as n");
  const awaiting = await db.query<{ n: string }>("select coalesce(sum(amount_sats),0) as n from deposits where paid_at is not null and status in ('held','refund_requested','disputed')");
  check("ledger total equals what is still held", Number(open[0].n) === Number(awaiting[0].n));

  console.log(`\n${failed ? `${failed} FAILED` : "All checks passed"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
