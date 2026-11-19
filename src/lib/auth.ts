import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getLandlordByEmail } from "./data";
import { safeEqual, sign, unsign, verifySecret } from "./secrets";
import type { Landlord, Vault } from "./types";

const LANDLORD_COOKIE = "kodi_landlord";
const ADMIN_COOKIE = "kodi_admin";
const MAX_AGE = 60 * 60 * 8;

interface Session {
  sub: string;
  email?: string;
  /** Fingerprint of the password: changing it signs out every other session. */
  v?: string;
  exp: number;
}

const codeVersion = (accessCodeHash: string) =>
  createHash("sha256").update(accessCodeHash).digest("base64url").slice(0, 16);

// Compared against when the email is unknown, so a wrong email takes as long
// as a wrong code and response times don't reveal which emails have accounts.
const DUMMY_HASH = "00000000000000000000000000000000:" + "0".repeat(64);

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

export async function signInLandlord(email: string, code: string) {
  const landlord = await getLandlordByEmail(email);
  const ok = verifySecret(code, landlord?.accessCodeHash ?? DUMMY_HASH);
  if (!landlord || !ok) return false;
  await startLandlordSession(landlord);
  return true;
}

export async function startLandlordSession(l: Landlord) {
  const session: Session = { sub: l.id, email: l.email, v: codeVersion(l.accessCodeHash), exp: Date.now() + MAX_AGE * 1000 };
  (await cookies()).set(LANDLORD_COOKIE, sign(session), cookieOpts);
}

/**
 * The signed-in landlord, verified or not: a landlord waiting for review can
 * follow its status. Anything that lists units or touches money must also
 * check `verified`.
 */
export async function currentLandlord(): Promise<Landlord | null> {
  const s = unsign<Session>((await cookies()).get(LANDLORD_COOKIE)?.value);
  if (!s?.email || s.exp < Date.now()) return null;
  const l = await getLandlordByEmail(s.email);
  if (!l || l.id !== s.sub || s.v !== codeVersion(l.accessCodeHash)) return null;
  return l;
}

export async function signOutLandlord() {
  (await cookies()).delete(LANDLORD_COOKIE);
}

function adminPassword() {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  if (process.env.NODE_ENV === "production") return null;
  return "kodi-admin";
}

export async function signInAdmin(password: string) {
  const expected = adminPassword();
  // Compare digests: equal length, so the comparison leaks nothing about the password's length.
  const digest = (x: string) => createHash("sha256").update(x).digest("hex");
  if (!expected || !safeEqual(digest(password), digest(expected))) return false;
  (await cookies()).set(ADMIN_COOKIE, sign({ sub: "admin", exp: Date.now() + MAX_AGE * 1000 }), cookieOpts);
  return true;
}

export async function isAdmin() {
  const s = unsign<Session>((await cookies()).get(ADMIN_COOKIE)?.value);
  return Boolean(s && s.sub === "admin" && s.exp > Date.now());
}

export async function signOutAdmin() {
  (await cookies()).delete(ADMIN_COOKIE);
}

// A vault's private link alone doesn't open it: the tenant's PIN unlocks it on
// one device for 30 days, so a forwarded link shows nothing but the PIN screen.
const VAULT_MAX_AGE = 60 * 60 * 24 * 30;
const vaultCookie = (v: Vault) => `kodi_vault_${v.id.replace(/[^A-Za-z0-9_-]/g, "")}`;

export async function unlockVault(v: Vault) {
  if (!v.pinHash) return;
  const session: Session = { sub: v.id, v: codeVersion(v.pinHash), exp: Date.now() + VAULT_MAX_AGE * 1000 };
  (await cookies()).set(vaultCookie(v), sign(session), { ...cookieOpts, maxAge: VAULT_MAX_AGE });
}

export async function vaultUnlocked(v: Vault) {
  if (!v.pinHash) return true;
  const s = unsign<Session>((await cookies()).get(vaultCookie(v))?.value);
  return Boolean(s && s.sub === v.id && s.exp > Date.now() && s.v === codeVersion(v.pinHash));
}
