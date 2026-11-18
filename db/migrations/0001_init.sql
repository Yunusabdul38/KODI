-- Kodi schema. Applied automatically on first connection (src/lib/db.ts),
-- to Postgres via DATABASE_URL or to the embedded local database.
--
-- Two rules matter most and live here, not only in app code:
-- 1. A unit can have only one active deposit (deposits_one_active_per_unit).
--    That single index is what makes letting one flat to several tenants
--    impossible on Kodi.
-- 2. Money records are append-only. Payments, payouts, the audit log and
--    reserve snapshots can't be deleted, and only one-way status changes are
--    allowed (triggers below).

-- ---------------------------------------------------------------------------
-- People and places
-- ---------------------------------------------------------------------------

create table landlords (
  id text primary key default 'll_' || gen_random_uuid(),
  name text not null,                       -- person or company, shown to tenants
  contact_name text not null,
  email text not null unique check (email = lower(email)),
  phone text not null,
  access_code_hash text not null,
  id_type text not null,                    -- e.g. NIN, CAC registration
  id_number text not null,
  payout_method text not null default 'lightning' check (payout_method in ('lightning', 'test_wallet')),
  lightning_address text,
  verified boolean not null default false,
  declined_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table units (
  id text primary key default 'unit_' || gen_random_uuid(),
  code text not null unique check (code ~ '^KD-[2-9A-Z]{5}$'), -- public: what a tenant types to check a unit
  landlord_id text not null references landlords(id),
  title text not null,                      -- e.g. "2-bedroom flat"
  bedrooms integer not null check (bedrooms between 0 and 10),
  bathrooms integer not null check (bathrooms between 1 and 10),
  area text not null,                       -- e.g. Yaba
  city text not null default 'Lagos',
  address text not null,                    -- private: shown to the tenant only after paying
  description text not null,
  photo text not null,                      -- one of the app's stock photos (see src/lib/photos.ts)
  annual_rent_ngn bigint not null check (annual_rent_ngn > 0),
  agent_name text,
  agent_fee_ngn bigint not null default 0 check (agent_fee_ngn >= 0),
  agent_payout_method text check (agent_payout_method in ('lightning', 'test_wallet')),
  agent_lightning_address text,
  listed boolean not null default true,
  frozen boolean not null default false,    -- admin: stops new deposits while a report is checked
  created_at timestamptz not null default now(),
  check (agent_fee_ngn = 0 or agent_payout_method is not null)
);
create index on units (landlord_id);

-- ---------------------------------------------------------------------------
-- Safe Deposit: one Lightning payment into escrow per deposit
-- ---------------------------------------------------------------------------

create type deposit_status as enum (
  'awaiting_payment', -- invoice issued; the unit is reserved for 15 minutes
  'held',             -- paid; the unit is locked
  'refund_requested', -- tenant says the keys never came; landlord has 48 hours to object
  'disputed',         -- the arbiter decides
  'released',         -- tenant moved in (or arbiter decided): landlord and agent paid
  'refunded',         -- tenant paid back
  'expired'           -- invoice never paid
);

create table deposits (
  id text primary key default 'dep_' || gen_random_uuid(),
  unit_id text not null references units(id),
  tenant_name text not null,
  tenant_email text not null,
  tenant_phone text not null,
  token_hash text not null unique,          -- sha256 of the tenant's private link
  months integer not null check (months between 1 and 12), -- Lagos Tenancy Law: at most a year from a new tenant
  rent_ngn bigint not null check (rent_ngn > 0),
  agent_fee_ngn bigint not null check (agent_fee_ngn >= 0),
  ngn_per_btc numeric not null check (ngn_per_btc > 0),
  amount_sats bigint not null check (amount_sats > 0),
  rent_sats bigint not null check (rent_sats > 0),
  agent_sats bigint not null check (agent_sats >= 0),
  move_in_date date not null,
  status deposit_status not null default 'awaiting_payment',
  payment_hash text not null unique check (payment_hash ~ '^[0-9a-f]{64}$'),
  payment_request text not null,
  preimage text check (preimage is null or preimage ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  paid_at timestamptz,
  landlord_confirmed_at timestamptz,        -- landlord says keys were handed over (informational)
  moved_in_at timestamptz,                  -- tenant confirmed keys: this is what releases money
  refund_requested_at timestamptz,
  refund_method text check (refund_method in ('lightning', 'test_wallet')),
  refund_address text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (rent_sats + agent_sats = amount_sats)
);
create index on deposits (unit_id, created_at desc);
create index on deposits (status);

-- THE anti-fraud rule: while a deposit is awaiting payment, held, waiting on
-- a refund or disputed, no other deposit can exist for that unit.
create unique index deposits_one_active_per_unit on deposits (unit_id)
  where status in ('awaiting_payment', 'held', 'refund_requested', 'disputed');

-- ---------------------------------------------------------------------------
-- Rent Vault: a tenant saves toward next year's rent; paid to the landlord on the due date
-- ---------------------------------------------------------------------------

create table vaults (
  id text primary key default 'vault_' || gen_random_uuid(),
  code text not null unique check (code ~ '^RV-[2-9A-Z]{6}$'), -- public: family top-up link
  unit_id text not null references units(id),
  tenant_name text not null,
  tenant_email text not null,
  token_hash text not null unique,          -- tenant's private link
  landlord_token_hash text not null unique, -- landlord's read-only progress link
  target_ngn bigint not null check (target_ngn > 0),
  due_date date not null,
  schedule text not null check (schedule in ('weekly', 'monthly')),
  status text not null default 'active' check (status in ('active', 'paid', 'returned')),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on vaults (unit_id);

create table vault_payments (
  id text primary key default 'vp_' || gen_random_uuid(),
  vault_id text not null references vaults(id),
  payer_name text,                          -- e.g. a relative abroad; the tenant when empty
  amount_sats bigint not null check (amount_sats > 0),
  amount_ngn bigint not null check (amount_ngn > 0),
  ngn_per_btc numeric not null check (ngn_per_btc > 0),
  payment_hash text not null unique check (payment_hash ~ '^[0-9a-f]{64}$'),
  payment_request text not null,
  preimage text check (preimage is null or preimage ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on vault_payments (vault_id, status);

-- ---------------------------------------------------------------------------
-- Money out: every payout belongs to exactly one deposit or vault
-- ---------------------------------------------------------------------------

create table payouts (
  id text primary key default 'po_' || gen_random_uuid(),
  deposit_id text references deposits(id),
  vault_id text references vaults(id),
  recipient text not null check (recipient in ('landlord', 'agent', 'tenant')),
  method text not null check (method in ('lightning', 'test_wallet')),
  destination text not null,
  amount_sats bigint not null check (amount_sats > 0),
  ngn_per_btc numeric not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  payment_hash text,
  preimage text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((deposit_id is null) <> (vault_id is null))
);
create index on payouts (deposit_id);
create index on payouts (vault_id);
create index on payouts (status);

create table disputes (
  id text primary key default 'dsp_' || gen_random_uuid(),
  deposit_id text not null references deposits(id),
  raised_by text not null check (raised_by in ('tenant', 'landlord')),
  reason text not null,
  decision text check (decision in ('release', 'refund')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index disputes_one_open_per_deposit on disputes (deposit_id) where decision is null;

create table audit_log (
  id text primary key default 'au_' || gen_random_uuid(),
  role text not null check (role in ('tenant', 'landlord', 'admin', 'system')),
  actor text,
  action text not null,
  unit_id text references units(id),
  deposit_id text references deposits(id),
  vault_id text references vaults(id),
  details text,
  created_at timestamptz not null default now()
);
create index on audit_log (deposit_id, created_at);
create index on audit_log (vault_id, created_at);
create index on audit_log (created_at desc);

create table reserve_snapshots (
  id text primary key default 'snap_' || gen_random_uuid(),
  wallet_balance_sats bigint not null,
  ledger_total_sats bigint not null,
  difference_sats bigint not null,
  taken_at timestamptz not null default now()
);

-- Test network only: lets a reviewer skip ahead in time (move-in dates, the
-- 48-hour refund window, vault due dates) instead of waiting days.
create table demo_clock (
  id boolean primary key default true check (id),
  offset_seconds bigint not null default 0
);
insert into demo_clock (id, offset_seconds) values (true, 0);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------

create function refuse_delete() returns trigger language plpgsql as $$
begin
  raise exception '% rows are append-only and cannot be deleted', tg_table_name;
end $$;

create function refuse_update() returns trigger language plpgsql as $$
begin
  raise exception '% rows are append-only and cannot be changed', tg_table_name;
end $$;

create trigger audit_log_no_delete before delete on audit_log for each row execute function refuse_delete();
create trigger audit_log_no_update before update on audit_log for each row execute function refuse_update();
create trigger snapshots_no_delete before delete on reserve_snapshots for each row execute function refuse_delete();
create trigger snapshots_no_update before update on reserve_snapshots for each row execute function refuse_update();
create trigger deposits_no_delete before delete on deposits for each row execute function refuse_delete();
create trigger vaults_no_delete before delete on vaults for each row execute function refuse_delete();
create trigger vault_payments_no_delete before delete on vault_payments for each row execute function refuse_delete();
create trigger payouts_no_delete before delete on payouts for each row execute function refuse_delete();
create trigger disputes_no_delete before delete on disputes for each row execute function refuse_delete();

-- Deposits: the money fields never change, and the status only moves forward.
create function deposits_guard() returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  if new.id <> old.id or new.unit_id <> old.unit_id or new.token_hash <> old.token_hash
     or new.months <> old.months or new.rent_ngn <> old.rent_ngn or new.agent_fee_ngn <> old.agent_fee_ngn
     or new.ngn_per_btc <> old.ngn_per_btc or new.amount_sats <> old.amount_sats
     or new.rent_sats <> old.rent_sats or new.agent_sats <> old.agent_sats
     or new.move_in_date <> old.move_in_date or new.payment_hash <> old.payment_hash
     or new.payment_request <> old.payment_request or new.created_at <> old.created_at
     or new.tenant_name <> old.tenant_name or new.tenant_email <> old.tenant_email then
    raise exception 'deposit % terms are fixed once created', old.id;
  end if;
  if old.paid_at is not null and (new.paid_at is distinct from old.paid_at or new.preimage is distinct from old.preimage) then
    raise exception 'deposit % payment proof is immutable', old.id;
  end if;
  if new.status <> old.status then
    allowed := case old.status
      when 'awaiting_payment' then array['held', 'expired']
      when 'held' then array['released', 'refund_requested', 'disputed']
      when 'refund_requested' then array['refunded', 'disputed', 'released']
      when 'disputed' then array['released', 'refunded']
      else array[]::text[]
    end;
    if not (new.status::text = any (allowed)) then
      raise exception 'deposit % cannot go from % to %', old.id, old.status, new.status;
    end if;
  end if;
  if new.status = 'held' and old.status = 'awaiting_payment' and new.preimage is not null
     and encode(sha256(decode(new.preimage, 'hex')), 'hex') <> new.payment_hash then
    raise exception 'preimage does not match payment hash for deposit %', old.id;
  end if;
  return new;
end $$;
create trigger deposits_guard before update on deposits for each row execute function deposits_guard();

-- Vault payments: pending → paid | expired, once.
create function vault_payments_guard() returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then
    raise exception 'vault payment % is settled and cannot be changed', old.id;
  end if;
  if new.status not in ('paid', 'expired') or new.id <> old.id or new.vault_id <> old.vault_id
     or new.amount_sats <> old.amount_sats or new.payment_hash <> old.payment_hash
     or new.payment_request <> old.payment_request then
    raise exception 'only the settlement fields of vault payment % may be written', old.id;
  end if;
  if new.status = 'paid' and new.preimage is not null
     and encode(sha256(decode(new.preimage, 'hex')), 'hex') <> new.payment_hash then
    raise exception 'preimage does not match payment hash for vault payment %', old.id;
  end if;
  return new;
end $$;
create trigger vault_payments_guard before update on vault_payments for each row execute function vault_payments_guard();

-- Vaults: terms fixed; status active → paid | returned, once.
create function vaults_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.unit_id <> old.unit_id or new.target_ngn <> old.target_ngn
     or new.token_hash <> old.token_hash or new.landlord_token_hash <> old.landlord_token_hash then
    raise exception 'vault % terms are fixed once created', old.id;
  end if;
  if new.status <> old.status and old.status <> 'active' then
    raise exception 'vault % is already %', old.id, old.status;
  end if;
  return new;
end $$;
create trigger vaults_guard before update on vaults for each row execute function vaults_guard();

-- Payouts: core fields frozen; pending → sent | failed once; proof written once.
create function payouts_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.deposit_id is distinct from old.deposit_id or new.vault_id is distinct from old.vault_id
     or new.recipient <> old.recipient or new.method <> old.method or new.destination <> old.destination
     or new.amount_sats <> old.amount_sats or new.idempotency_key <> old.idempotency_key
     or new.created_at <> old.created_at then
    raise exception 'payout % core fields are immutable', old.id;
  end if;
  if new.status <> old.status and old.status <> 'pending' then
    raise exception 'payout % is already %', old.id, old.status;
  end if;
  if old.status <> 'pending' and (new.payment_hash is distinct from old.payment_hash
       or new.preimage is distinct from old.preimage or new.sent_at is distinct from old.sent_at) then
    raise exception 'payout % proof is immutable', old.id;
  end if;
  return new;
end $$;
create trigger payouts_guard before update on payouts for each row execute function payouts_guard();

-- A payout can never take more out of a deposit or vault than was paid into it.
create function payouts_within_balance() returns trigger language plpgsql as $$
declare
  paid_in bigint;
  paid_out bigint;
begin
  if new.deposit_id is not null then
    perform 1 from deposits where id = new.deposit_id for update;
    select amount_sats into paid_in from deposits where id = new.deposit_id and paid_at is not null;
    select coalesce(sum(amount_sats), 0) into paid_out from payouts where deposit_id = new.deposit_id and status <> 'failed';
  else
    perform 1 from vaults where id = new.vault_id for update;
    select coalesce(sum(amount_sats), 0) into paid_in from vault_payments where vault_id = new.vault_id and status = 'paid';
    select coalesce(sum(amount_sats), 0) into paid_out from payouts where vault_id = new.vault_id and status <> 'failed';
  end if;
  if paid_in is null or paid_out + new.amount_sats > paid_in then
    raise exception 'payout of % sats exceeds the % sats held', new.amount_sats, coalesce(paid_in, 0) - paid_out;
  end if;
  return new;
end $$;
create trigger payouts_within_balance before insert on payouts for each row execute function payouts_within_balance();

-- ---------------------------------------------------------------------------
-- Views and functions the app calls
-- ---------------------------------------------------------------------------

-- Everything Kodi holds for others: paid deposits and vault savings, less what has gone out.
create function ledger_total_sats() returns bigint language sql stable as $$
  select coalesce((select sum(amount_sats) from deposits where paid_at is not null), 0)
       + coalesce((select sum(amount_sats) from vault_payments where status = 'paid'), 0)
       - coalesce((select sum(amount_sats) from payouts where status <> 'failed'), 0);
$$;
