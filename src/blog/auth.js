import { hashPassword, hashToken, verifyPassword } from "./crypto.js";
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MINUTES,
  SESSION_TTL_SECONDS,
  clearCookie,
  clientIp,
  error,
  json,
  nowIso,
  parseCookies,
  randomToken,
  sameOrigin,
  serializeCookie,
  sha256Hex
} from "./util.js";

export const SESSION_COOKIE = "martins_emp";
export const CSRF_COOKIE = "martins_csrf";

export async function getSession(request, env) {
  const cookies = parseCookies(request);
  const raw = cookies[SESSION_COOKIE];
  if (!raw || !env.DB) return null;
  const tokenHash = await hashToken(raw);
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.csrf_token, s.expires_at, e.id, e.email, e.name, e.role, e.active
     FROM sessions s
     JOIN employees e ON e.id = s.employee_id
     WHERE s.token_hash = ?`
  )
    .bind(tokenHash)
    .first();
  if (!row) return null;
  const expiresAt = String(row.expires_at).includes("T")
    ? new Date(row.expires_at)
    : new Date(String(row.expires_at).replace(" ", "T") + "Z");
  if (expiresAt.getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  if (!row.active) return null;
  return {
    tokenHash,
    csrfToken: row.csrf_token,
    employee: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role
    }
  };
}

export async function requireEmployee(request, env, options = {}) {
  if (!sameOrigin(request) && request.method !== "GET" && request.method !== "HEAD") {
    return { error: error("Invalid request origin.", 403) };
  }
  const session = await getSession(request, env);
  if (!session) return { error: error("Sign in required.", 401) };
  if (options.mutating && request.method !== "GET" && request.method !== "HEAD") {
    const header = request.headers.get("x-csrf-token") || "";
    if (!header || header !== session.csrfToken) {
      return { error: error("Invalid CSRF token.", 403) };
    }
  }
  if (options.admin && session.employee.role !== "admin") {
    return { error: error("Administrator access required.", 403) };
  }
  return { session };
}

export async function login(request, env) {
  if (!env.DB) return error("Employee accounts are not configured yet.", 503);
  if (!sameOrigin(request)) return error("Invalid request origin.", 403);
  const ip = clientIp(request);
  if (await tooManyFailures(env, ip)) {
    return error("Too many sign-in attempts. Please wait 15 minutes and try again.", 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON.");
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return error("Email and password are required.");

  const employee = await env.DB.prepare(
    "SELECT id, email, name, role, active, password_hash FROM employees WHERE email = ?"
  )
    .bind(email)
    .first();

  const ok = employee && employee.active && (await verifyPassword(password, employee.password_hash));
  await env.DB.prepare(
    "INSERT INTO login_attempts (ip, email, success, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(ip, email, ok ? 1 : 0, nowIso())
    .run();

  if (!ok) return error("Email or password is incorrect.", 401);

  const rawToken = randomToken(32);
  const tokenHash = await hashToken(rawToken);
  const csrfToken = randomToken(24);
  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, employee_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(tokenHash, employee.id, csrfToken, expires, nowIso())
    .run();

  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  headers.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, rawToken, request, {
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      sameSite: "Lax"
    })
  );
  headers.append(
    "Set-Cookie",
    serializeCookie(CSRF_COOKIE, csrfToken, request, {
      httpOnly: false,
      maxAge: SESSION_TTL_SECONDS,
      sameSite: "Lax"
    })
  );
  return new Response(
    JSON.stringify({
      employee: { id: employee.id, email: employee.email, name: employee.name, role: employee.role },
      csrfToken
    }),
    { status: 200, headers }
  );
}

export async function logout(request, env) {
  const session = await getSession(request, env);
  if (session) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  }
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.append("Set-Cookie", clearCookie(SESSION_COOKIE, request));
  headers.append("Set-Cookie", clearCookie(CSRF_COOKIE, request));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export async function bootstrapAdmin(request, env) {
  if (!env.DB) return error("Database is not configured.", 503);
  const expected = String(env.BOOTSTRAP_TOKEN || "");
  if (!expected) return error("Bootstrap is disabled.", 403);
  const provided = request.headers.get("x-bootstrap-token") || "";
  if (provided.length !== expected.length || !(await tokensMatch(provided, expected))) {
    return error("Invalid bootstrap token.", 403);
  }
  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM employees").first();
  if (existing && Number(existing.n) > 0) {
    return error("An administrator already exists. Use the dashboard to add editors.", 409);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON.");
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim() || "Administrator";
  if (!email.includes("@") || password.length < 10) {
    return error("A valid email and a password of at least 10 characters are required.");
  }
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO employees (id, email, name, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`
  )
    .bind(id, email, name, passwordHash, ts, ts)
    .run();
  return json({ ok: true, employee: { id, email, name, role: "admin" } }, 201);
}

async function tokensMatch(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(left, right);
  const ha = await sha256Hex(a);
  const hb = await sha256Hex(b);
  return ha === hb;
}

async function tooManyFailures(env, ip) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND success = 0 AND created_at >= ?"
  )
    .bind(ip, since)
    .first();
  return Number(row?.n || 0) >= LOGIN_MAX_FAILURES;
}

export async function createEditor(env, { email, password, name }) {
  const normalized = String(email || "").trim().toLowerCase();
  const pass = String(password || "");
  const display = String(name || "").trim();
  if (!normalized.includes("@") || pass.length < 10 || !display) {
    throw new Error("Name, valid email, and a password of at least 10 characters are required.");
  }
  const exists = await env.DB.prepare("SELECT id FROM employees WHERE email = ?").bind(normalized).first();
  if (exists) throw new Error("That email already has an account.");
  const id = crypto.randomUUID();
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO employees (id, email, name, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'editor', 1, ?, ?)`
  )
    .bind(id, normalized, display, await hashPassword(pass), ts, ts)
    .run();
  return { id, email: normalized, name: display, role: "editor", active: 1 };
}
