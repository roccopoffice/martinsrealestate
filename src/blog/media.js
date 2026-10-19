import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, extensionForType, nowIso } from "./util.js";
import { getSession } from "./auth.js";

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
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return { error: "Choose an image to upload.", status: 400 };
  const type = file.type || "";
  if (!ALLOWED_IMAGE_TYPES.has(type)) return { error: "Use a JPEG, PNG, WebP, or GIF image.", status: 400 };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Images must be 8 MB or smaller.", status: 400 };
  const id = crypto.randomUUID();
  const key = `media/${id}.${extensionForType(type)}`;
  const bytes = await file.arrayBuffer();
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" }
  });
  const alt = String(form.get("alt") || "").slice(0, 200);
  const caption = String(form.get("caption") || "").slice(0, 300);
  const filename = String(file.name || `image.${extensionForType(type)}`).slice(0, 180);
  await env.DB.prepare(
    `INSERT INTO media (id, r2_key, filename, content_type, byte_size, alt, caption, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, key, filename, type, file.size, alt, caption, employee.id, nowIso())
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

export async function deleteMedia(env, id) {
  const row = await getMedia(env, id);
  if (!row) return false;
  const used = await env.DB.prepare(
    "SELECT id FROM posts WHERE featured_media_id = ? OR og_image_id = ? LIMIT 1"
  )
    .bind(id, id)
    .first();
  if (used) throw new Error("This image is used as a featured or social image. Remove it from the post first.");
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
    `SELECT p.status, p.published_at, b.data
     FROM post_blocks b
     JOIN posts p ON p.id = b.post_id
     WHERE b.data LIKE ?`
  )
    .bind(`%${mediaId}%`)
    .all();
  return (results || []).some((row) => rowIsPublic(row));
}

export async function serveMedia(request, env, id) {
  const row = await getMedia(env, id);
  if (!row || !env.MEDIA) return new Response("Not found", { status: 404 });
  const session = await getSession(request, env);
  if (!session && !(await mediaIsPublic(env, id))) {
    return new Response("Not found", { status: 404 });
  }
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.content_type);
  headers.set("Cache-Control", session ? "private, max-age=60" : "public, max-age=86400");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

export function mediaUrl(id) {
  return id ? `/media/${id}` : "";
}
