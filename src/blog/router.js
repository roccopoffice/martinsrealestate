import { serveMedia } from "./media.js";
import { handleEmployeeApi, handleEmployeePages } from "./employee.js";
import { handlePublicApi, handlePublicPages } from "./public.js";
import { publishDuePosts } from "./posts.js";
import { deniedAssetPath } from "./util.js";
import { applySchema } from "./schema.js";

let devSchemaReady = false;

async function maybeApplyDevSchema(env) {
  if (!env.DB || env.BLOG_APPLY_SCHEMA !== "1" || devSchemaReady) return;
  await applySchema(env.DB);
  devSchemaReady = true;
}

export { publishDuePosts, applySchema };

export async function handleBlogRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (deniedAssetPath(url.pathname)) {
    return new Response("Not found", { status: 404 });
  }
  await maybeApplyDevSchema(env);

  if (url.pathname.startsWith("/api/employee")) {
    const res = await handleEmployeeApi(request, env, url);
    return res || jsonNotFound();
  }

  if (url.pathname.startsWith("/api/blog")) {
    if (!env.DB) return jsonUnavailable();
    const res = await handlePublicApi(request, env, url);
    return res || jsonNotFound();
  }

  const mediaMatch = url.pathname.match(/^\/media\/([^/]+)$/);
  if (mediaMatch) {
    return serveMedia(request, env, mediaMatch[1]);
  }

  if (url.pathname === "/blog" || url.pathname === "/blog.html" || url.pathname.startsWith("/blog/")) {
    if (!env.DB) {
      return env.ASSETS.fetch(new Request(new URL("/fragments/listing.html", request.url).toString(), { method: "GET" }));
    }
    const page = await handlePublicPages(request, env, ctx, url);
    if (page) return page;
  }

  if (url.pathname === "/employee" || url.pathname.startsWith("/employee/")) {
    return handleEmployeePages(request, env, url);
  }

  return null;
}

function jsonNotFound() {
  return new Response(JSON.stringify({ error: "Not found." }), {
    status: 404,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function jsonUnavailable() {
  return new Response(JSON.stringify({ error: "Blog storage is not configured yet." }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
