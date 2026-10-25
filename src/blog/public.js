import { recordPublicView } from "./analytics.js";
import { getSession } from "./auth.js";
import { getPostBySlug, getPublicPostBySlug, isPubliclyVisible, listPublicPosts } from "./posts.js";
import { listingGrid, ogTags, renderBlocks, articleMeta } from "./render.js";
import { readAssetHtml } from "./assets.js";
import { HOME_PREVIEW_COUNT, PAGE_SIZE, escapeHtml, error, json, parseTs, securityHeaders, siteUrl } from "./util.js";
import { mediaUrl } from "./media.js";

export async function handlePublicApi(request, env, url) {
  if (url.pathname === "/api/blog/preview" && request.method === "GET") {
    const list = await listPublicPosts(env, { page: 1, limit: HOME_PREVIEW_COUNT });
    return json({ posts: list.posts });
  }
  if (url.pathname === "/api/blog/posts" && request.method === "GET") {
    const page = Number(url.searchParams.get("page") || 1);
    const list = await listPublicPosts(env, { page, limit: PAGE_SIZE });
    return json(list);
  }
  const slugMatch = url.pathname.match(/^\/api\/blog\/posts\/([^/]+)$/);
  if (slugMatch && request.method === "GET") {
    const post = await getPublicPostBySlug(env, decodeURIComponent(slugMatch[1]));
    if (!post) return error("Article not found.", 404);
    return json({ post });
  }
  return null;
}

export async function handlePublicPages(request, env, ctx, url) {
  if (url.pathname === "/blog" || url.pathname === "/blog/" || url.pathname === "/blog.html") {
    return renderListing(request, env, url);
  }
  const article = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (article) {
    const slug = decodeURIComponent(article[1]);
    if (slug.endsWith(".html")) return null;
    return renderArticle(request, env, ctx, url, slug);
  }
  return null;
}

function inject(html, marker, inner, fallbackHtml) {
  if (html && html.includes(marker)) return html.replace(marker, () => inner);
  return fallbackHtml;
}

function brandedDocument({ title, description, canonical, robots, image, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css">
  <meta name="robots" content="${escapeHtml(robots)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(image)}">
</head>
<body>
  <header class="site-header site-header--luxury"><div class="wrap"><a class="brand" href="/index.html">Martins &amp; Associates</a></div></header>
  <main id="main">${bodyHtml}</main>
</body>
</html>`;
}

async function renderListing(request, env, url) {
  const page = Number(url.searchParams.get("page") || 1);
  const list = await listPublicPosts(env, { page, limit: PAGE_SIZE });
  const grid = listingGrid(list.posts);
  const pager = list.hasMore
    ? `<p class="blog-pager"><a class="btn" href="/blog?page=${list.page + 1}">Load more</a></p>`
    : "";
  const inner = grid + pager;
  let html = await readAssetHtml(env, request, "/fragments/listing.html");
  if (!html) html = await readAssetHtml(env, request, "/blog.html");
  html = inject(
    html,
    "<!--BLOG_LISTING-->",
    inner,
    brandedDocument({
      title: "Blog | Martins & Associates Real Estate",
      description: "Insights, market notes, and guidance from Martins & Associates Real Estate.",
      canonical: `${siteUrl(env, request)}/blog`,
      robots: "index, follow",
      image: `${siteUrl(env, request)}/`,
      bodyHtml: `<section class="blog-listing"><div class="wrap">${inner}</div></section>`
    })
  );
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...securityHeaders()
    }
  });
}

async function renderArticle(request, env, ctx, url, slug) {
  const preview = url.searchParams.get("preview") === "1";
  let post = await getPublicPostBySlug(env, slug);
  if (!post && preview) {
    const session = await getSession(request, env);
    if (!session) return Response.redirect(new URL("/employee/login", request.url).toString(), 302);
    post = await getPostBySlug(env, slug);
  }
  if (!post || (!isPubliclyVisible(post) && !preview)) {
    return new Response("Article not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (isPubliclyVisible(post) && !preview && ctx?.waitUntil) {
    ctx.waitUntil(recordPublicView(request, env, post, { preview: false }));
  }

  const meta = articleMeta(post);
  const og = ogTags(env, request, post);
  const date = post.publishedAt
    ? parseTs(post.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC"
      })
    : "";
  const cover = post.featuredMediaId
    ? `<div class="article-cover"><img src="${escapeHtml(mediaUrl(post.featuredMediaId))}" alt="${escapeHtml(post.title)}"></div>`
    : "";
  const body = `
    <article class="article article--${escapeHtml(post.template)}" data-template="${escapeHtml(post.template)}">
      <p class="article-kicker"><a href="/blog">Blog</a></p>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="article-deck">${escapeHtml(post.excerpt)}</p>
      <p class="article-byline">${post.authorName ? `${escapeHtml(post.authorName)} · ` : ""}${escapeHtml(date)}</p>
      ${cover}
      <div class="article-body">${renderBlocks(post.blocks)}</div>
    </article>`;

  const image =
    post.ogImageId || post.featuredMediaId
      ? `${siteUrl(env, request)}${mediaUrl(post.ogImageId || post.featuredMediaId)}`
      : og.image;
  const robots = preview ? "noindex, nofollow" : "index, follow";

  let html = await readAssetHtml(env, request, "/fragments/article.html");
  if (!html) html = await readAssetHtml(env, request, "/blog-article.html");
  const fallback = brandedDocument({
    title: meta.title,
    description: meta.description,
    canonical: og.url,
    robots,
    image,
    bodyHtml: `<div class="wrap article-wrap">${body}</div>`
  });
  html = inject(html, "<!--BLOG_ARTICLE-->", body, fallback);
  if (html !== fallback) {
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
      .replace(
        /content="Article from Martins & Associates Real Estate."/,
        `content="${escapeHtml(meta.description)}"`
      )
      .replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${robots}">`)
      .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(og.url)}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(meta.title)}">`)
      .replace(
        /<meta property="og:description" content="[^"]*">/,
        `<meta property="og:description" content="${escapeHtml(meta.description)}">`
      )
      .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeHtml(og.url)}">`)
      .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escapeHtml(image)}">`);
  }
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": preview ? "no-store" : "public, max-age=60",
      ...securityHeaders()
    }
  });
}
