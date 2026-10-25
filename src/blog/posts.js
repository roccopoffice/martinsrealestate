import { sanitizePostFields } from "./sanitize.js";
import { starterFor } from "./templates.js";
import {
  PAGE_SIZE,
  hasExplicitTimezone,
  isUniqueConstraintError,
  nowIso,
  nowIsoMs,
  parseTs,
  slugify,
  toUtcSql
} from "./util.js";

export class ConflictError extends Error {
  constructor(message = "This article was updated elsewhere. Reload and try again.") {
    super(message);
    this.name = "ConflictError";
    this.status = 409;
  }
}

const PUBLIC_FILTER = `status = 'published' AND published_at IS NOT NULL AND published_at <= datetime('now')`;

export async function uniqueSlug(env, desired, ignoreId = null) {
  let slug = slugify(desired);
  let n = 2;
  while (true) {
    const row = ignoreId
      ? await env.DB.prepare("SELECT id FROM posts WHERE slug = ? AND id != ?").bind(slug, ignoreId).first()
      : await env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
    if (!row) return slug;
    slug = `${slugify(desired)}-${n}`;
    n += 1;
  }
}

export async function loadBlocks(env, postId) {
  const { results } = await env.DB.prepare(
    "SELECT id, type, data, position FROM post_blocks WHERE post_id = ? ORDER BY position ASC"
  )
    .bind(postId)
    .all();
  return (results || []).map((row) => ({
    id: row.id,
    type: row.type,
    data: safeParse(row.data)
  }));
}

export function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export async function saveBlocks(env, postId, blocks) {
  await env.DB.prepare("DELETE FROM post_blocks WHERE post_id = ?").bind(postId).run();
  if (!blocks.length) return;
  const stmts = blocks.map((block, index) =>
    env.DB.prepare(
      "INSERT INTO post_blocks (id, post_id, position, type, data) VALUES (?, ?, ?, ?, ?)"
    ).bind(block.id || crypto.randomUUID(), postId, index, block.type, JSON.stringify(block.data || {}))
  );
  await env.DB.batch(stmts);
}

export function mapPost(row, blocks = null) {
  if (!row) return null;
  const post = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    template: row.template,
    status: row.status,
    authorId: row.author_id,
    authorName: row.author_name,
    authorTitle: row.author_title,
    authorBio: row.author_bio,
    featuredMediaId: row.featured_media_id,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    ogImageId: row.og_image_id,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (blocks) post.blocks = blocks;
  return post;
}

export async function getPostById(env, id, { withBlocks = true } = {}) {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!row) return null;
  const blocks = withBlocks ? await loadBlocks(env, id) : null;
  return mapPost(row, blocks);
}

export async function getPublicPostBySlug(env, slug) {
  const row = await env.DB.prepare(`SELECT * FROM posts WHERE slug = ? AND ${PUBLIC_FILTER}`).bind(slug).first();
  if (!row) return null;
  return mapPost(row, await loadBlocks(env, row.id));
}

export async function getPostBySlug(env, slug) {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first();
  if (!row) return null;
  return mapPost(row, await loadBlocks(env, row.id));
}

export function isPubliclyVisible(post) {
  if (!post || post.status !== "published" || !post.publishedAt) return false;
  const when = parseTs(post.publishedAt);
  return when && when.getTime() <= Date.now();
}

export async function listPublicPosts(env, { page = 1, limit = PAGE_SIZE } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || PAGE_SIZE, 1), 24);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${PUBLIC_FILTER}`).first();
  const { results } = await env.DB.prepare(
    `SELECT * FROM posts WHERE ${PUBLIC_FILTER} ORDER BY published_at DESC LIMIT ? OFFSET ?`
  )
    .bind(safeLimit, offset)
    .all();
  const total = Number(totalRow?.n || 0);
  return {
    posts: (results || []).map((row) => mapPost(row)),
    page: safePage,
    limit: safeLimit,
    total,
    hasMore: offset + safeLimit < total
  };
}

export async function listPosts(env, { status, page = 1, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  let where = "1=1";
  const binds = [];
  if (status && status !== "all") {
    where += " AND status = ?";
    binds.push(status);
  }
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${where}`)
    .bind(...binds)
    .first();
  const { results } = await env.DB.prepare(
    `SELECT * FROM posts WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...binds, safeLimit, offset)
    .all();
  return {
    posts: (results || []).map((row) => mapPost(row)),
    page: safePage,
    total: Number(totalRow?.n || 0)
  };
}

export async function createPost(env, employee, body) {
  const template = body.template || "editorial";
  const starter = starterFor(template, { name: employee.name, title: "Martins & Associates" });
  const fields = sanitizePostFields({ ...starter, ...body, template, status: body.status || "draft" });
  const id = crypto.randomUUID();
  const ts = nowIsoMs();
  const status = "draft";
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = await uniqueSlug(env, fields.slug || fields.title);
    try {
      await env.DB.prepare(
        `INSERT INTO posts (
          id, slug, title, excerpt, template, status, author_id, author_name, author_title, author_bio,
          featured_media_id, seo_title, seo_description, og_image_id, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      )
        .bind(
          id,
          slug,
          fields.title,
          fields.excerpt,
          fields.template,
          status,
          employee.id,
          fields.authorName || employee.name,
          fields.authorTitle,
          fields.authorBio,
          fields.featuredMediaId || null,
          fields.seoTitle,
          fields.seoDescription,
          fields.ogImageId || null,
          ts,
          ts
        )
        .run();
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (!isUniqueConstraintError(err) || attempt === 5) throw err;
    }
  }
  if (lastError) throw lastError;
  await saveBlocks(env, id, fields.blocks);
  return getPostById(env, id);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

export async function updatePost(env, id, body) {
  const current = await getPostById(env, id, { withBlocks: false });
  if (!current) return null;
  if (body.updatedAt != null && String(body.updatedAt) !== String(current.updatedAt)) {
    throw new ConflictError();
  }
  const fields = sanitizePostFields({ ...current, ...body, template: body.template || current.template });
  const slug = await uniqueSlug(env, fields.slug || current.slug || fields.title, id);
  const ts = nowIsoMs();
  const result = await env.DB.prepare(
    `UPDATE posts SET
      slug = ?, title = ?, excerpt = ?, template = ?, author_name = ?, author_title = ?, author_bio = ?,
      featured_media_id = ?, seo_title = ?, seo_description = ?, og_image_id = ?, updated_at = ?
     WHERE id = ? AND updated_at = ?`
  )
    .bind(
      slug,
      fields.title,
      fields.excerpt,
      fields.template,
      fields.authorName || current.authorName,
      fields.authorTitle,
      fields.authorBio,
      fields.featuredMediaId || null,
      fields.seoTitle,
      fields.seoDescription,
      fields.ogImageId || null,
      ts,
      id,
      current.updatedAt
    )
    .run();
  if (result.meta?.changes === 0) throw new ConflictError();
  if (hasOwn(body, "blocks") && Array.isArray(body.blocks)) {
    await saveBlocks(env, id, fields.blocks);
  }
  return getPostById(env, id);
}

export async function setStatus(env, id, { status, publishedAt }) {
  const current = await getPostById(env, id);
  if (!current) return null;
  const ts = nowIsoMs();
  let nextPublished = current.publishedAt;
  if (status === "published") {
    const requested = publishedAt && hasExplicitTimezone(publishedAt) ? parseTs(publishedAt) : null;
    nextPublished = requested && requested.getTime() <= Date.now() ? toUtcSql(requested) : nowIso();
  } else if (status === "scheduled") {
    if (!publishedAt || !hasExplicitTimezone(publishedAt)) {
      throw new Error("Schedule a future date and time with a timezone offset.");
    }
    const when = parseTs(publishedAt);
    if (!when || when.getTime() <= Date.now()) {
      throw new Error("Schedule a future date and time.");
    }
    nextPublished = toUtcSql(when);
  } else if (status === "draft" || status === "archived") {
    if (status === "draft") nextPublished = current.publishedAt;
  }
  await env.DB.prepare("UPDATE posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ?")
    .bind(status, nextPublished, ts, id)
    .run();
  return getPostById(env, id);
}

export async function publishDuePosts(env) {
  if (!env.DB) return { published: 0 };
  const ts = nowIsoMs();
  const { results } = await env.DB.prepare(
    `SELECT id FROM posts WHERE status = 'scheduled' AND published_at IS NOT NULL AND published_at <= datetime('now')`
  ).all();
  const ids = (results || []).map((row) => row.id);
  if (!ids.length) return { published: 0 };
  const stmts = ids.map((id) =>
    env.DB.prepare("UPDATE posts SET status = 'published', updated_at = ? WHERE id = ?").bind(ts, id)
  );
  await env.DB.batch(stmts);
  return { published: ids.length, ids };
}
