export const PAGE_SIZE = 9;
export const HOME_PREVIEW_COUNT = 3;
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES = 8;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
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

export function parseTs(value) {
  if (!value) return null;
  if (/T/.test(String(value))) return new Date(value);
  return new Date(String(value).replace(" ", "T") + "Z");
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
  const origin = request.headers.get("origin");
  if (origin) return origin === originOf(request);
  const referer = request.headers.get("referer");
  if (!referer) return true;
  try {
    return new URL(referer).origin === originOf(request);
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
    pathname === "/vitest.config.js" ||
    pathname === "/package.json" ||
    pathname === "/package-lock.json" ||
    pathname === "/wrangler.jsonc" ||
    pathname === "/.dev.vars" ||
    pathname === "/.gitignore"
  );
}
