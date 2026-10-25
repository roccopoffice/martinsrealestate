import { overviewStats, postAnalytics } from "./analytics.js";
import { htmlPage, readAssetHtml } from "./assets.js";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  bootstrapAdmin,
  createEditor,
  getSession,
  invalidateEmployeeSessions,
  login,
  logout,
  requireEmployee
} from "./auth.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { deleteMedia, listMedia, uploadMedia } from "./media.js";
import { createPost, getPostById, listPosts, setStatus, updatePost } from "./posts.js";
import { TEMPLATE_META } from "./templates.js";
import { MAX_POSTS_PER_HOUR, clearCookie, error, hourAgoIso, json, nowIso } from "./util.js";

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
    return updateMe(request, env, gate.session);
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
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND created_at >= ?"
    )
      .bind(gate.session.employee.id, hourAgoIso())
      .first();
    if (Number(recent?.n || 0) >= MAX_POSTS_PER_HOUR) {
      return error("Article creation limit reached. Try again in an hour.", 429);
    }
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
      try {
        const updated = await updatePost(env, post.id, body);
        return json({ post: updated });
      } catch (err) {
        return error(err.message || "Could not update post.", err.status || 400);
      }
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
    const user = await env.DB.prepare("SELECT id, role, active FROM employees WHERE id = ?")
      .bind(userMatch[1])
      .first();
    if (!user) return error("Account not found.", 404);
    const name = body.name != null ? String(body.name).trim() : null;
    const active = body.active == null ? null : body.active ? 1 : 0;
    const result = await env.DB.prepare(
      `UPDATE employees
       SET name = COALESCE(?, name),
           active = COALESCE(?, active),
           updated_at = ?
       WHERE id = ?
         AND (
           ? IS NULL
           OR ? = 1
           OR role != 'admin'
           OR (SELECT COUNT(*) FROM employees WHERE role = 'admin' AND active = 1 AND id != ?) >= 1
         )`
    )
      .bind(name, active, nowIso(), user.id, active, active, user.id)
      .run();
    if (active === 0) {
      const still = await env.DB.prepare("SELECT active, role FROM employees WHERE id = ?").bind(user.id).first();
      if (still && Number(still.active) === 1 && still.role === "admin") {
        return error("The last active administrator cannot be deactivated.", 409);
      }
      await invalidateEmployeeSessions(env, user.id);
    }
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
    if (path.endsWith(".css") || path.endsWith(".js")) return env.ASSETS.fetch(request);
    return serveFragment(
      env,
      request,
      "/fragments/employee-login.html",
      LOGIN_FALLBACK
    );
  }

  if (!session) {
    if (path.endsWith(".css") || path.endsWith(".js")) return env.ASSETS.fetch(request);
    return Response.redirect(new URL("/employee/login", request.url).toString(), 302);
  }
  if (path.endsWith(".css") || path.endsWith(".js")) return env.ASSETS.fetch(request);
  if (
    path === "/employee" ||
    path === "/employee/" ||
    path === "/employee/index.html" ||
    path.startsWith("/employee/")
  ) {
    return serveFragment(env, request, "/fragments/employee-app.html", APP_FALLBACK);
  }
  return env.ASSETS.fetch(request);
}

async function serveFragment(env, request, pathname, fallback) {
  const html = (await readAssetHtml(env, request, pathname)) || fallback;
  return htmlPage(html);
}

const LOGIN_FALLBACK = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Employee login</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/employee/employee.css"></head><body class="emp-login-page"><main class="emp-login"><h1>Employee login</h1><form id="login-form" class="emp-login__form"><label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" required></label><p class="emp-login__error" id="login-error" hidden></p><button class="btn btn--gold" type="submit">Sign in</button></form></main><script>document.getElementById("login-form").addEventListener("submit",async function(e){e.preventDefault();var f=e.target;var res=await fetch("/api/employee/login",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({email:f.email.value,password:f.password.value})});if(res.ok)location.href="/employee/";});</script></body></html>`;

const APP_FALLBACK = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Employee dashboard</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/employee/employee.css"></head><body class="emp-app"><div id="emp-view"></div><script src="/employee/editor.js"></script><script src="/employee/app.js"></script></body></html>`;

async function updateMe(request, env, session) {
  const employee = session.employee;
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
  let sessionInvalidated = false;
  if (nextPassword) {
    if (nextPassword.length < 10) return error("New password must be at least 10 characters.");
    const row = await env.DB.prepare("SELECT password_hash FROM employees WHERE id = ?").bind(employee.id).first();
    if (!currentPassword || !(await verifyPassword(currentPassword, row.password_hash))) {
      return error("Current password is incorrect.", 403);
    }
    await env.DB.prepare("UPDATE employees SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(nextPassword), nowIso(), employee.id)
      .run();
    await invalidateEmployeeSessions(env, employee.id);
    sessionInvalidated = true;
  }
  const updated = await env.DB.prepare("SELECT id, email, name, role FROM employees WHERE id = ?")
    .bind(employee.id)
    .first();
  if (!sessionInvalidated) return json({ employee: updated, sessionInvalidated: false });
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  headers.append("Set-Cookie", clearCookie(SESSION_COOKIE, request));
  headers.append("Set-Cookie", clearCookie(CSRF_COOKIE, request));
  return new Response(
    JSON.stringify({
      employee: updated,
      sessionInvalidated: true,
      message: "Password updated. Sign in again with your new password."
    }),
    { status: 200, headers }
  );
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return { error: error("Invalid JSON.") };
  }
}
