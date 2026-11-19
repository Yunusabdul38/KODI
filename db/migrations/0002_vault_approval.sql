-- Rent Vault: one open vault per home, landlord approval for a vault that
-- wasn't opened from the tenant's own Kodi deposit, and a PIN on the
-- tenant's private vault page.

alter table vaults drop constraint vaults_status_check;
alter table vaults add constraint vaults_status_check
  check (status in ('pending', 'active', 'declined', 'paid', 'returned'));
alter table vaults add column deposit_id text references deposits(id);
alter table vaults add column pin_hash text;
alter table vaults add column approved_at timestamptz;

-- THE vault rule: a home has at most one open vault, so nobody else can open
-- a second one for it.
create unique index vaults_one_active_per_unit on vaults (unit_id) where status = 'active';

-- Terms fixed; status pending → active | declined, active → paid | returned, once.
create or replace function vaults_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.unit_id <> old.unit_id or new.target_ngn <> old.target_ngn
     or new.token_hash <> old.token_hash or new.landlord_token_hash <> old.landlord_token_hash
     or new.deposit_id is distinct from old.deposit_id or new.pin_hash is distinct from old.pin_hash then
    raise exception 'vault % terms are fixed once created', old.id;
  end if;
  if new.status <> old.status and not (
       (old.status = 'pending' and new.status in ('active', 'declined'))
    or (old.status = 'active' and new.status in ('paid', 'returned'))) then
    raise exception 'vault % cannot go from % to %', old.id, old.status, new.status;
  end if;
  return new;
end $$;

-- Money goes only into an open vault: never one still waiting for the landlord.
create function vault_payments_open() returns trigger language plpgsql as $$
begin
  perform 1 from vaults where id = new.vault_id and status = 'active';
  if not found then
    raise exception 'vault % is not open for payments', new.vault_id;
  end if;
  return new;
end $$;
create trigger vault_payments_open before insert on vault_payments for each row execute function vault_payments_open();
