#!/usr/bin/env node
/**
 * Provision the first administrator against the local D1 database.
 * Usage: node scripts/create-employee.mjs admin@example.com 'a-long-password'
 *
 * For production, set BOOTSTRAP_TOKEN with `wrangler secret put BOOTSTRAP_TOKEN`
 * and POST /api/employee/bootstrap once. Do not expose that token in frontend code.
 *
 * wrangler d1 execute --command does not accept bound parameters, so values are
 * written only after strict validation. Quote characters are rejected, not escaped.
 */
import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";

const [email, password, name = "Administrator"] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node scripts/create-employee.mjs email password [name]");
  process.exit(1);
}

const safeEmail = String(email).trim().toLowerCase();
const safeName = String(name).trim();
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(safeEmail)) {
  console.error("Email must be a simple address without quotes or spaces.");
  process.exit(1);
}
if (!/^[\w .,-]{1,80}$/.test(safeName)) {
  console.error("Name may contain letters, numbers, spaces, periods, commas, or hyphens only.");
  process.exit(1);
}
if (String(password).length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await webcrypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 },
  key,
  256
);
const hash = `pbkdf2$sha256$100000$${Buffer.from(salt).toString("base64")}$${Buffer.from(bits).toString("base64")}`;
if (/['";]/.test(hash)) {
  console.error("Generated hash contained unexpected characters. Try again.");
  process.exit(1);
}
const id = webcrypto.randomUUID();
const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
const sql = [
  "INSERT INTO employees (id, email, name, password_hash, role, active, created_at, updated_at)",
  "VALUES (",
  `'${id}',`,
  `'${safeEmail}',`,
  `'${safeName}',`,
  `'${hash}',`,
  "'admin', 1,",
  `'${ts}',`,
  `'${ts}'`,
  ");"
].join(" ");

const result = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "martins-blog", "--local", "--command", sql],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
