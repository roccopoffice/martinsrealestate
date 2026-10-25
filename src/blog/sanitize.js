import { BLOCK_TYPES, TEMPLATES, STATUSES, slugify } from "./util.js";

const ALLOWED_TAGS = {
  p: [],
  br: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  a: ["href"],
  ul: [],
  ol: [],
  li: [],
  h2: [],
  h3: [],
  h4: [],
  blockquote: [],
  span: []
};

const VOID_TAGS = new Set(["br"]);

export function sanitizeHtml(input) {
  const raw = stripUnsafeRegions(String(input || ""));
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const lt = raw.indexOf("<", i);
    if (lt === -1) {
      out += escapeText(raw.slice(i));
      break;
    }
    out += escapeText(raw.slice(i, lt));
    const parsed = readTag(raw, lt);
    if (!parsed) {
      out += "&lt;";
      i = lt + 1;
      continue;
    }
    i = parsed.next;
    const name = parsed.name;
    if (!ALLOWED_TAGS[name]) continue;
    if (parsed.closing) {
      out += `</${name}>`;
      continue;
    }
    if (VOID_TAGS.has(name)) {
      out += `<${name}>`;
      continue;
    }
    const allowed = ALLOWED_TAGS[name];
    const kept = [];
    if (allowed.includes("href")) {
      const safe = sanitizeHref(decodeEntities(parsed.attrs.href || ""));
      if (safe) kept.push(`href="${escapeAttr(safe)}"`);
    }
    out += kept.length ? `<${name} ${kept.join(" ")}>` : `<${name}>`;
  }
  return out;
}

function stripUnsafeRegions(value) {
  return value
    .replace(/\0/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!--[\s\S]*$/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "")
    .replace(/<!(?:doctype|entity|element|attlist)[^>]*>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "");
}

function readTag(raw, start) {
  if (raw[start] !== "<") return null;
  let i = start + 1;
  const closing = raw[i] === "/";
  if (closing) i += 1;
  const nameStart = i;
  while (i < raw.length && /[a-zA-Z0-9]/.test(raw[i])) i += 1;
  if (i === nameStart) return null;
  const name = raw.slice(nameStart, i).toLowerCase();
  const attrs = {};
  while (i < raw.length) {
    while (i < raw.length && /[\s/]/.test(raw[i])) i += 1;
    if (i >= raw.length) return null;
    if (raw[i] === ">") {
      return { name, closing, attrs, next: i + 1 };
    }
    const keyStart = i;
    while (i < raw.length && /[a-zA-Z0-9:_-]/.test(raw[i])) i += 1;
    if (i === keyStart) return null;
    const key = raw.slice(keyStart, i).toLowerCase();
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    let value = "";
    if (raw[i] === "=") {
      i += 1;
      while (i < raw.length && /\s/.test(raw[i])) i += 1;
      if (raw[i] === '"' || raw[i] === "'") {
        const quote = raw[i];
        i += 1;
        const valStart = i;
        while (i < raw.length && raw[i] !== quote) i += 1;
        if (i >= raw.length) return null;
        value = raw.slice(valStart, i);
        i += 1;
      } else {
        const valStart = i;
        while (i < raw.length && !/[\s>]/.test(raw[i])) i += 1;
        value = raw.slice(valStart, i);
      }
    }
    attrs[key] = value;
  }
  return null;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => fromCodePoint(Number(dec)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function fromCodePoint(code) {
  if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

export function sanitizeHref(href) {
  const value = String(href || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!value) return "";
  const lowered = value.toLowerCase();
  if (lowered.startsWith("javascript:") || lowered.startsWith("data:") || lowered.startsWith("vbscript:")) {
    return "";
  }
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^https:\/\//i.test(value) || /^http:\/\//i.test(value)) return value;
  if (/^mailto:[^\s]+$/i.test(value) || /^tel:[^\s]+$/i.test(value)) return value;
  return "";
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizePlain(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sanitizeMultiline(value, max = 4000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function sanitizeBlocks(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 80).map((block, index) => sanitizeBlock(block, index)).filter(Boolean);
}

function sanitizeBlock(block, index) {
  if (!block || typeof block !== "object") return null;
  const type = String(block.type || "");
  if (!BLOCK_TYPES.has(type)) return null;
  const id = String(block.id || crypto.randomUUID());
  const data = block.data && typeof block.data === "object" ? block.data : {};
  return { id, type, position: index, data: sanitizeBlockData(type, data) };
}

function sanitizeBlockData(type, data) {
  switch (type) {
    case "heading":
    case "subheading":
      return { text: sanitizePlain(data.text, 200) };
    case "paragraph":
      return { html: sanitizeHtml(data.html || data.text || "") };
    case "image":
      return {
        mediaId: sanitizeId(data.mediaId),
        alt: sanitizePlain(data.alt, 200),
        caption: sanitizePlain(data.caption, 300)
      };
    case "quote":
    case "pullquote":
      return {
        text: sanitizeMultiline(data.text, 800),
        citation: sanitizePlain(data.citation, 160)
      };
    case "list":
      return {
        ordered: !!data.ordered,
        items: Array.isArray(data.items)
          ? data.items.slice(0, 20).map((item) => sanitizePlain(item, 300)).filter(Boolean)
          : []
      };
    case "divider":
      return {};
    case "spacer":
      return { size: ["sm", "md", "lg"].includes(data.size) ? data.size : "md" };
    case "stats":
      return {
        items: Array.isArray(data.items)
          ? data.items.slice(0, 6).map((item) => ({
              label: sanitizePlain(item?.label, 80),
              value: sanitizePlain(item?.value, 40)
            }))
          : []
      };
    case "tip":
      return { title: sanitizePlain(data.title, 80), html: sanitizeHtml(data.html || data.text || "") };
    case "gallery":
      return {
        items: Array.isArray(data.items)
          ? data.items.slice(0, 12).map((item) => ({
              mediaId: sanitizeId(item?.mediaId),
              alt: sanitizePlain(item?.alt, 200),
              caption: sanitizePlain(item?.caption, 200)
            }))
          : []
      };
    case "propertyDetails":
      return {
        name: sanitizePlain(data.name, 160),
        address: sanitizePlain(data.address, 200),
        price: sanitizePlain(data.price, 80),
        beds: sanitizePlain(data.beds, 40),
        baths: sanitizePlain(data.baths, 40),
        sqft: sanitizePlain(data.sqft, 40),
        details: sanitizeMultiline(data.details, 1200)
      };
    case "authorCard":
      return {
        name: sanitizePlain(data.name, 120),
        title: sanitizePlain(data.title, 160),
        bio: sanitizeMultiline(data.bio, 600),
        mediaId: sanitizeId(data.mediaId)
      };
    case "chart":
      return {
        title: sanitizePlain(data.title, 120),
        items: Array.isArray(data.items)
          ? data.items.slice(0, 8).map((item) => ({
              label: sanitizePlain(item?.label, 40),
              value: Number(item?.value) || 0
            }))
          : []
      };
    default:
      return {};
  }
}

function sanitizeId(value) {
  const id = String(value || "");
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id) ? id : "";
}

export function sanitizePostFields(body) {
  const template = TEMPLATES.includes(body.template) ? body.template : "editorial";
  const status = STATUSES.includes(body.status) ? body.status : "draft";
  return {
    title: sanitizePlain(body.title, 180) || "Untitled article",
    excerpt: sanitizeMultiline(body.excerpt, 400),
    template,
    status,
    authorName: sanitizePlain(body.authorName || body.author_name, 120),
    authorTitle: sanitizePlain(body.authorTitle || body.author_title, 160),
    authorBio: sanitizeMultiline(body.authorBio || body.author_bio, 600),
    featuredMediaId: sanitizeId(body.featuredMediaId || body.featured_media_id),
    seoTitle: sanitizePlain(body.seoTitle || body.seo_title, 180),
    seoDescription: sanitizeMultiline(body.seoDescription || body.seo_description, 300),
    ogImageId: sanitizeId(body.ogImageId || body.og_image_id),
    slug: body.slug ? slugify(body.slug) : "",
    publishedAt: sanitizeDate(body.publishedAt || body.published_at),
    blocks: sanitizeBlocks(body.blocks)
  };
}

function sanitizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}
