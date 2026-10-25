import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
  MAX_UPLOADS_PER_HOUR,
  detectImageType,
  extensionForType,
  hourAgoIso,
  nowIso
} from "./util.js";
import { getSession } from "./auth.js";
import { safeParse } from "./posts.js";

const MEDIA_BLOCK_TYPES = new Set(["image", "gallery", "authorCard"]);

function rowIsPublic(row) {
  if (!row || row.status !== "published" || !row.published_at) return false;
  const stamp = String(row.published_at).includes("T")
    ? new Date(row.published_at)
    : new Date(String(row.published_at).replace(" ", "T") + "Z");
  return stamp.getTime() <= Date.now();
}

export async function uploadMedia(request, env, employee) {
  if (!env.MEDIA) {
    return { error: "Image storage is not configured.", status: 503 };
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD_REQUEST_BYTES) {
    return { error: "Images must be 8 MB or smaller.", status: 413 };
  }
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM media WHERE uploaded_by = ? AND created_at >= ?"
  )
    .bind(employee.id, hourAgoIso())
    .first();
  if (Number(recent?.n || 0) >= MAX_UPLOADS_PER_HOUR) {
    return { error: "Upload limit reached. Try again in an hour.", status: 429 };
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return { error: "Choose an image to upload.", status: 400 };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Images must be 8 MB or smaller.", status: 413 };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected || !ALLOWED_IMAGE_TYPES.has(detected)) {
    return { error: "Use a JPEG, PNG, WebP, or GIF image.", status: 400 };
  }
  const claimed = file.type || "";
  if (claimed && ALLOWED_IMAGE_TYPES.has(claimed) && claimed !== detected) {
    return { error: "The file contents do not match the image type.", status: 400 };
  }

  const id = crypto.randomUUID();
  const key = `media/${id}.${extensionForType(detected)}`;
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: detected, cacheControl: "private, max-age=300" }
  });
  const alt = String(form.get("alt") || "").slice(0, 200);
  const caption = String(form.get("caption") || "").slice(0, 300);
  const filename = String(file.name || `image.${extensionForType(detected)}`).slice(0, 180);
  await env.DB.prepare(
    `INSERT INTO media (id, r2_key, filename, content_type, byte_size, alt, caption, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, key, filename, detected, bytes.byteLength, alt, caption, employee.id, nowIso())
    .run();
  return { media: await getMedia(env, id) };
}

export async function getMedia(env, id) {
  return env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(id).first();
}

export async function listMedia(env) {
  const { results } = await env.DB.prepare("SELECT * FROM media ORDER BY created_at DESC LIMIT 200").all();
  return results || [];
}

export async function mediaIsReferenced(env, mediaId) {
  const featured = await env.DB.prepare(
    "SELECT id FROM posts WHERE featured_media_id = ? OR og_image_id = ? LIMIT 1"
  )
    .bind(mediaId, mediaId)
    .first();
  if (featured) return true;
  const { results } = await env.DB.prepare(
    `SELECT b.type, b.data FROM post_blocks b WHERE b.data LIKE ?`
  )
    .bind(`%${mediaId}%`)
    .all();
  return (results || []).some((row) => blockReferencesMedia(row, mediaId));
}

function blockReferencesMedia(row, mediaId) {
  if (!MEDIA_BLOCK_TYPES.has(String(row.type))) return false;
  const data = safeParse(row.data);
  if (data.mediaId === mediaId) return true;
  return Array.isArray(data.items) && data.items.some((item) => item && item.mediaId === mediaId);
}

export async function deleteMedia(env, id) {
  const row = await getMedia(env, id);
  if (!row) return false;
  if (await mediaIsReferenced(env, id)) {
    throw new Error("This image is used in an article. Remove it from the post first.");
  }
  if (env.MEDIA) await env.MEDIA.delete(row.r2_key);
  await env.DB.prepare("DELETE FROM media WHERE id = ?").bind(id).run();
  return true;
}

export async function mediaIsPublic(env, mediaId) {
  const featured = await env.DB.prepare(
    `SELECT id, status, published_at FROM posts
     WHERE featured_media_id = ? OR og_image_id = ?`
  )
    .bind(mediaId, mediaId)
    .all();
  if ((featured.results || []).some((row) => rowIsPublic(row))) return true;

  const { results } = await env.DB.prepare(
    `SELECT p.status, p.published_at, b.type, b.data
     FROM post_blocks b
     JOIN posts p ON p.id = b.post_id
     WHERE b.data LIKE ?`
  )
    .bind(`%${mediaId}%`)
    .all();
  return (results || []).some((row) => blockReferencesMedia(row, mediaId) && rowIsPublic(row));
}

export async function serveMedia(request, env, id) {
  const row = await getMedia(env, id);
  if (!row || !env.MEDIA) return new Response("Not found", { status: 404 });
  const session = await getSession(request, env);
  const isPublic = await mediaIsPublic(env, id);
  if (!session && !isPublic) {
    return new Response("Not found", { status: 404 });
  }
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.content_type);
  headers.set(
    "Cache-Control",
    session || !isPublic ? "private, no-store" : "public, max-age=300, must-revalidate"
  );
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

export function mediaUrl(id) {
  return id ? `/media/${id}` : "";
}
