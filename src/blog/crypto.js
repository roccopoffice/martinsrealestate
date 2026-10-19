import { base64ToBytes, bytesToBase64, sha256Hex, timingSafeEqual } from "./util.js";

const ITERATIONS = 100000;
const HASH_BITS = 256;

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(hash))}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 10000) return false;
  const salt = base64ToBytes(parts[3]);
  const expected = base64ToBytes(parts[4]);
  const actual = new Uint8Array(await pbkdf2(password, salt, iterations));
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS
  );
}

export async function hashToken(token) {
  return sha256Hex(token);
}
