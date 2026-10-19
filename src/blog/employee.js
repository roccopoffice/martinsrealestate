import { overviewStats, postAnalytics } from "./analytics.js";
import { bootstrapAdmin, createEditor, getSession, login, logout, requireEmployee } from "./auth.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { deleteMedia, listMedia, uploadMedia } from "./media.js";
import { createPost, getPostById, listPosts, setStatus, updatePost } from "./posts.js";
import { TEMPLATE_META } from "./templates.js";
import { error, json, nowIso } from "./util.js";

export async function handleEmployeeApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/employee/bootstrap" && method === "POST") return bootstrapAdmin(request, env);
  if (path === "/api/employee/login" && method === "POST") return login(request, env);
  if (path === "/api/employee/logout" && method === "POST") return logout(request, env);
  if (path === "/api/employee/templates" && method === "GET") {
    const gate = await requireEmployee(request, env);
    if (gate.error) return gate.error;
    return json({ templates: TEMPLATE_META });
  }

  if (path === "/api/employee/me" && method === "GET") {
    const gate = await requireEmployee(request, env);
    if (gate.error) return gate.error;
    return json({ employee: gate.session.employee, csrfToken: gate.session.csrfToken });
  }

  if (path === "/api/employee/me" && method === "PATCH") {
    const gate = await requireEmployee(request, env, { mutating: true });
    if (gate.error) return gate.error;
    return updateMe(request, env, gate.session.employee);
  }

  if (path === "/api/employee/overview" && method === "GET") {
    const gate = await requireEmployee(request, env);
    if (gate.error) return gate.error;
    return json(await overviewStats(env));
  }

  if (path === "/api/employee/analytics" && method === "GET") {
    const gate = await requireEmployee(request, env);
    if (gate.error) return gate.error;
    return json(await overviewStats(env));
  }

  const postAnalyticsMatch = path.match(/^\/api\/employee\/analytics\/posts\/([^/]+)$/);
  if (postAnalyticsMatch && method === "GET") {
    const gate = await requireEmployee(request, env);
    if (gate.error) return gate.error;
    const post = await getPostById(env, postAnalyticsMatch[1], { withBlocks: false });
    if (!post) return error("Post not found.", 404);
    return json({ post, analytics: await postAnalytics(env, post.id) });
  }

  if (path === "/api/employee/posts" && method === "GET") {
    const gate = await requireEmployee(request, env);
    if (gate.error) return gate.error;
    return json(await listPosts(env, { status: url.searchParams.get("status") || "all", page: url.searchParams.get("page") }));
  }

  if (path === "/api/employee/posts" && method === "POST") {
    const gate = await requireEmployee(request, env, { mutating: true });
    if (gate.error) return gate.error;
    const body = await readJson(request);
    if (body.error) return body.error;
    const post = await createPost(env, gate.session.employee, body);
    return json({ post }, 201);
  }

  const postMatch = path.match(/^\/api\/employee\/posts\/([^/]+)(?:\/(publish|schedule|unpublish|archive))?$/);
  if (postMatch) {
    const gate = await requireEmployee(request, env, { mutating: method !== "GET" });
    if (gate.error) return gate.error;
    const post = await getPostById(env, postMatch[1]);
    if (!post) return error("Post not found.", 404);
    const action = postMatch[2];
    if (method === "GET" && !action) return json({ post });
    if (method === "PUT" && !action) {
      const body = await readJson(request);
      if (body.error) return body.error;
      const updated = await updatePost(env, post.id, body);
      return json({ post: updated });
    }
    if (method === "POST" && action) {
      try {
        let payload = {};
        try {
          payload = await request.json();
        } catch {
          payload = {};
        }
        if (action === "publish") return json({ post: await setStatus(env, post.id, { status: "published" }) });
        if (action === "schedule") {
          return json({
            post: await setStatus(env, post.id, { status: "scheduled", publishedAt: payload.publishedAt })
          });
        }
        if (action === "unpublish") return json({ post: await setStatus(env, post.id, { status: "draft" }) });
        if (action === "archive") return json({ post: await setStatus(env, post.id, { status: "archived" }) });
      } catch (err) {
        return error(err.message || "Could not update post.", 400);
      }
    }
  }

  if (path === "/api/employee/media" && method === "GET") {
    const gate = await requireEmployee(request, env);
    if (gate.error) return gate.error;
    return json({ media: await listMedia(env) });
  }

  if (path === "/api/employee/media" && method === "POST") {
    const gate = await requireEmployee(request, env, { mutating: true });
    if (gate.error) return gate.error;
    const result = await uploadMedia(request, env, gate.session.employee);
    if (result.error) return error(result.error, result.status || 400);
    return json(result, 201);
  }

  const mediaMatch = path.match(/^\/api\/employee\/media\/([^/]+)$/);
  if (mediaMatch && method === "DELETE") {
    const gate = await requireEmployee(request, env, { mutating: true });
    if (gate.error) return gate.error;
    try {
      const ok = await deleteMedia(env, mediaMatch[1]);
      if (!ok) return error("Image not found.", 404);
      return json({ ok: true });
    } catch (err) {
      return error(err.message, 400);
    }
  }

  if (path === "/api/employee/users" && method === "GET") {
    const gate = await requireEmployee(request, env, { admin: true });
    if (gate.error) return gate.error;
    const { results } = await env.DB.prepare(
      "SELECT id, email, name, role, active, created_at FROM employees ORDER BY created_at ASC"
    ).all();
    return json({ users: results || [] });
  }

  if (path === "/api/employee/users" && method === "POST") {
    const gate = await requireEmployee(request, env, { mutating: true, admin: true });
    if (gate.error) return gate.error;
    const body = await readJson(request);
    if (body.error) return body.error;
    if (body.role && body.role !== "editor") {
      return error("Employees cannot create administrator accounts.", 403);
    }
    try {
      const user = await createEditor(env, body);
      return json({ user }, 201);
    } catch (err) {
      return error(err.message, 400);
    }
  }

  const userMatch = path.match(/^\/api\/employee\/users\/([^/]+)$/);
  if (userMatch && method === "PATCH") {
    const gate = await requireEmployee(request, env, { mutating: true, admin: true });
    if (gate.error) return gate.error;
    const body = await readJson(request);
    if (body.error) return body.error;
    if (body.role) return error("Role changes are not allowed from the dashboard.", 403);
    const user = await env.DB.prepare("SELECT id, role FROM employees WHERE id = ?").bind(userMatch[1]).first();
    if (!user) return error("Account not found.", 404);
    const name = body.name != null ? String(body.name).trim() : null;
    const active = body.active == null ? null : body.active ? 1 : 0;
    await env.DB.prepare(
      `UPDATE employees SET name = COALESCE(?, name), active = COALESCE(?, active), updated_at = ? WHERE id = ?`
    )
      .bind(name, active, nowIso(), user.id)
      .run();
    return json({ ok: true });
  }

  return null;
}

export async function handleEmployeePages(request, env, url) {
  const path = url.pathname;
  const isLogin = path === "/employee/login" || path === "/employee/login.html";
  const isApp =
    path === "/employee" ||
    path === "/employee/" ||
    path === "/employee/index.html" ||
    path.startsWith("/employee/");
  if (!isApp && !isLogin) return null;

  const session = await getSession(request, env);
  if (isLogin) {
    if (session && !path.endsWith(".css") && !path.endsWith(".js")) {
      return Response.redirect(new URL("/employee/", request.url).toString(), 302);
    }
    if (path === "/employee/login") {
      return env.ASSETS.fetch(new Request(new URL("/employee/login.html", request.url), request));
    }
    return env.ASSETS.fetch(request);
  }

  if (!session) {
    if (path.endsWith(".css") || path.endsWith(".js")) return env.ASSETS.fetch(request);
    return Response.redirect(new URL("/employee/login", request.url).toString(), 302);
  }
  if (path === "/employee" || path === "/employee/") {
    return env.ASSETS.fetch(new Request(new URL("/employee/index.html", request.url), request));
  }
  return env.ASSETS.fetch(request);
}

async function updateMe(request, env, employee) {
  const body = await readJson(request);
  if (body.error) return body.error;
  const name = String(body.name || "").trim();
  const currentPassword = String(body.currentPassword || "");
  const nextPassword = String(body.password || "");
  if (name) {
    await env.DB.prepare("UPDATE employees SET name = ?, updated_at = ? WHERE id = ?")
      .bind(name, nowIso(), employee.id)
      .run();
  }
  if (nextPassword) {
    if (nextPassword.length < 10) return error("New password must be at least 10 characters.");
    const row = await env.DB.prepare("SELECT password_hash FROM employees WHERE id = ?").bind(employee.id).first();
    if (!currentPassword || !(await verifyPassword(currentPassword, row.password_hash))) {
      return error("Current password is incorrect.", 403);
    }
    await env.DB.prepare("UPDATE employees SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(nextPassword), nowIso(), employee.id)
      .run();
  }
  const updated = await env.DB.prepare("SELECT id, email, name, role FROM employees WHERE id = ?")
    .bind(employee.id)
    .first();
  return json({ employee: updated });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return { error: error("Invalid JSON.") };
  }
}
