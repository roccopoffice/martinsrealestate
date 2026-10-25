import { getSession } from "./auth.js";
import { isBot, nowIso, sha256Hex, todayUtc } from "./util.js";
import { clientIp } from "./util.js";

const BOT_SKIP = true;

export async function recordPublicView(request, env, post, { preview = false } = {}) {
  if (!env.DB || !post) return { recorded: false, reason: "unavailable" };
  if (preview) return { recorded: false, reason: "preview" };
  if (post.status !== "published") return { recorded: false, reason: "unpublished" };
  if (BOT_SKIP && isBot(request)) return { recorded: false, reason: "automated" };
  const session = await getSession(request, env);
  if (session) return { recorded: false, reason: "employee" };
  const salt = String(env.SESSION_SECRET || "");
  if (!salt) return { recorded: false, reason: "unconfigured" };
  const ua = request.headers.get("user-agent") || "";
  const ip = clientIp(request);
  const visitorHash = await sha256Hex(`${salt}|${ip}|${ua}|${post.id}|${todayUtc()}`);
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO article_views (post_id, viewed_on, visitor_hash, created_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind(post.id, todayUtc(), visitorHash, nowIso())
      .run();
    return { recorded: true };
  } catch {
    return { recorded: false, reason: "error" };
  }
}

export async function overviewStats(env) {
  const posts = await env.DB.prepare(
    `SELECT
      SUM(CASE WHEN status = 'published' AND published_at <= datetime('now') THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS drafts,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
      COUNT(*) AS total
     FROM posts`
  ).first();
  const views = await env.DB.prepare("SELECT COUNT(*) AS n FROM article_views").first();
  const overTime = await env.DB.prepare(
    `SELECT viewed_on AS day, COUNT(*) AS views
     FROM article_views
     WHERE viewed_on >= date('now', '-30 day')
     GROUP BY viewed_on
     ORDER BY viewed_on ASC`
  ).all();
  const top = await env.DB.prepare(
    `SELECT p.id, p.title, p.slug, COUNT(v.id) AS views
     FROM posts p
     LEFT JOIN article_views v ON v.post_id = p.id
     WHERE p.status = 'published'
     GROUP BY p.id
     ORDER BY views DESC, p.published_at DESC
     LIMIT 8`
  ).all();
  const recent = await env.DB.prepare(
    `SELECT id, title, slug, status, published_at, updated_at
     FROM posts
     ORDER BY updated_at DESC
     LIMIT 8`
  ).all();
  return {
    posts: {
      published: Number(posts?.published || 0),
      drafts: Number(posts?.drafts || 0),
      scheduled: Number(posts?.scheduled || 0),
      archived: Number(posts?.archived || 0),
      total: Number(posts?.total || 0)
    },
    totalViews: Number(views?.n || 0),
    viewsOverTime: overTime.results || [],
    topArticles: top.results || [],
    recentActivity: recent.results || []
  };
}

export async function postAnalytics(env, postId) {
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM article_views WHERE post_id = ?")
    .bind(postId)
    .first();
  const overTime = await env.DB.prepare(
    `SELECT viewed_on AS day, COUNT(*) AS views
     FROM article_views
     WHERE post_id = ? AND viewed_on >= date('now', '-90 day')
     GROUP BY viewed_on
     ORDER BY viewed_on ASC`
  )
    .bind(postId)
    .all();
  return {
    totalViews: Number(total?.n || 0),
    viewsOverTime: overTime.results || []
  };
}
