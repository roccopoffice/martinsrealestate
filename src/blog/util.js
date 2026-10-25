export const PAGE_SIZE = 9;
export const HOME_PREVIEW_COUNT = 3;
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES = 8;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;
export const MAX_POSTS_PER_HOUR = 30;
export const MAX_UPLOADS_PER_HOUR = 40;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://static.wixstatic.com",
  "connect-src 'self'"
].join("; ");
export const TEMPLATES = ["editorial", "market", "guide", "spotlight", "advice"];
export const STATUSES = ["draft", "scheduled", "published", "archived"];
export const BLOCK_TYPES = new Set([
  "heading",
  "subheading",
  "paragraph",
  "image",
  "quote",
  "pullquote",
  "list",
  "divider",
  "spacer",
  "stats",
  "tip",
  "gallery",
  "propertyDetails",
  "authorCard",
  "chart"
]);

export function nowIso() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function nowIsoMs() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

export function parseTs(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (hasExplicitTimezone(raw) || /T/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

export function hasExplicitTimezone(value) {
  const raw = String(value || "").trim();
  return /[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw) || /[+-]\d{4}$/.test(raw);
}

export function toUtcSql(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function hourAgoIso() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

export function securityHeaders(extra = {}) {
  return {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...extra
  };
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function siteUrl(env, request) {
  const configured = String(env.SITE_URL || "").replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function isHttps(request) {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  const proto = request.headers.get("x-forwarded-proto");
  return proto === "https";
}

export function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

export function serializeCookie(name, value, request, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || "/"}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure ?? isHttps(request)) parts.push("Secure");
  if (options.expires) parts.push(`Expires=${options.expires}`);
  return parts.join("; ");
}

export function clearCookie(name, request) {
  return serializeCookie(name, "", request, {
    httpOnly: true,
    maxAge: 0,
    secure: isHttps(request)
  });
}

export function slugify(input) {
  const base = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "article";
}

export function originOf(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

export function sameOrigin(request) {
  const expected = originOf(request);
  if (!expected) return false;
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

export function isBot(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  if (!ua) return true;
  return /(bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|whatsapp|telegram|preview)/i.test(
    ua
  );
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function timingSafeEqual(a, b) {
  const left = typeof a === "string" ? new TextEncoder().encode(a) : a;
  const right = typeof b === "string" ? new TextEncoder().encode(b) : b;
  if (left.length !== right.length) return false;
  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(left, right)
    : fallbackEqual(left, right);
}

function fallbackEqual(left, right) {
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export async function sha256Hex(value) {
  const data = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function extensionForType(type) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

export function deniedAssetPath(pathname) {
  return (
    pathname.startsWith("/src/") ||
    pathname.startsWith("/migrations/") ||
    pathname.startsWith("/tests/") ||
    pathname.startsWith("/scripts/") ||
    pathname.startsWith("/fragments/employee") ||
    pathname === "/vitest.config.js" ||
    pathname === "/package.json" ||
    pathname === "/package-lock.json" ||
    pathname === "/wrangler.jsonc" ||
    pathname === "/.dev.vars" ||
    pathname === "/.gitignore"
  );
}

export function detectImageType(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return "image/jpeg";
  if (u.length >= 8 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return "image/png";
  if (
    u.length >= 6 &&
    u[0] === 0x47 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x38 &&
    (u[4] === 0x37 || u[4] === 0x39) &&
    u[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    u.length >= 12 &&
    u[0] === 0x52 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x46 &&
    u[8] === 0x57 &&
    u[9] === 0x45 &&
    u[10] === 0x42 &&
    u[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}

export function isUniqueConstraintError(err) {
  const message = String(err?.message || err || "");
  return /UNIQUE constraint failed/i.test(message) || /constraint failed/i.test(message);
}
