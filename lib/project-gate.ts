import "server-only";

import {
  createHmac,
  timingSafeEqual,
  scryptSync,
  randomBytes,
} from "node:crypto";

// Server-validated per-project passphrase gate. Two concerns, no new deps:
//
//   1. Passphrase hashing — the plaintext is never stored; `projects.passphrase_hash`
//      holds a self-describing scrypt string. `verifyPassphrase` is the only path
//      used at request time (in the unlock route); `hashPassphrase` runs when an
//      admin sets/rotates the password.
//   2. Unlock cookie — after a correct passphrase, we set an httpOnly cookie whose
//      value is an HMAC over `<projectId>.<exp>`. The layout re-verifies it on every
//      request. Because the project id is inside the signed payload, a cookie minted
//      for one project can't be replayed for another, and it can't be forged without
//      the secret.
//
// This is a soft gate (keeps the uninvited out), but unlike the old client-side
// SiteGate the check and the secret live entirely on the server.

// Prefer a dedicated secret; fall back to the service-role key so local/preview
// works with no extra config. Trade-off: rotating the service-role key logs
// everyone out of every project gate — fine for a soft gate; documented in .env.example.
const SECRET =
  process.env.PROJECT_GATE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// --- Passphrase hashing (scrypt) -------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

/** Hash a plaintext passphrase into a storable `scrypt$N$r$p$salt$hash` string. */
export function hashPassphrase(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString(
    "base64"
  )}$${hash.toString("base64")}`;
}

/** Constant-time verify a plaintext against a stored scrypt hash. */
export function verifyPassphrase(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, ns, rs, ps, saltB64, hashB64] = parts;
  const N = Number(ns);
  const r = Number(rs);
  const p = Number(ps);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const expected = Buffer.from(hashB64, "base64");
  let actual: Buffer;
  try {
    actual = scryptSync(plain, Buffer.from(saltB64, "base64"), expected.length, {
      N,
      r,
      p,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- Unlock cookie (HMAC-signed) -------------------------------------------

/** Per-project cookie name — scoped by project id so unlocks never cross tenants. */
export function cookieNameFor(projectId: string): string {
  return `pg_${projectId}`;
}

export const UNLOCK_MAX_AGE = MAX_AGE_SECONDS;

function sign(projectId: string, exp: number): string {
  return createHmac("sha256", SECRET)
    .update(`${projectId}.${exp}`)
    .digest("base64url");
}

/** Mint a signed unlock token (value for the cookie) valid ~30 days. */
export function signUnlock(projectId: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return `${exp}.${sign(projectId, exp)}`;
}

/** Verify a cookie value for this project: signature valid AND not expired. */
export function verifyUnlock(projectId: string, value: string | undefined): boolean {
  if (!value || !SECRET) return false;
  const dot = value.indexOf(".");
  if (dot < 0) return false;
  const exp = Number(value.slice(0, dot));
  const mac = value.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(projectId, exp);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
