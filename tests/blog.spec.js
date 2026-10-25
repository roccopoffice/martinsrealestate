import { createExecutionContext, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../worker.js";
import { recordPublicView } from "../src/blog/analytics.js";
import { hashPassword } from "../src/blog/crypto.js";
import { uploadMedia } from "../src/blog/media.js";
import { createPost, publishDuePosts } from "../src/blog/posts.js";
import { applySchema } from "../src/blog/schema.js";

async function jsonOf(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function cookieJar(res, previous = "") {
  const jar = new Map();
  previous.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > 0) jar.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const raw of set) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function csrfFrom(cookie) {
  const match = cookie.match(/(?:^|; )martins_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function bootstrap(email = "admin@martinsrealestate.co", password = "SuperSecret1!", name = "Admin") {
  return SELF.fetch("https://martinsrealestate.co/api/employee/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json", "x-bootstrap-token": "test-bootstrap-token" },
    body: JSON.stringify({ email, password, name })
  });
}

const SITE_ORIGIN = "https://martinsrealestate.co";

function originHeaders(extra = {}) {
  return { origin: SITE_ORIGIN, ...extra };
}

function authHeaders(cookie, extra = {}) {
  return originHeaders({
    cookie,
    "x-csrf-token": csrfFrom(cookie),
    "content-type": "application/json",
    ...extra
  });
}

async function login(email, password) {
  const res = await SELF.fetch(`${SITE_ORIGIN}/api/employee/login`, {
    method: "POST",
    headers: originHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ email, password })
  });
  return { res, cookie: cookieJar(res), body: await jsonOf(res.clone()) };
}

describe("blog publishing system", () => {
  beforeAll(async () => {
    await applySchema(env.DB);
    await bootstrap();
  });

  it("creates the first admin through bootstrap and rejects a second bootstrap", async () => {
    const second = await bootstrap();
    expect(second.status).toBe(409);
  });

  it("requires a session for employee APIs", async () => {
    const res = await SELF.fetch("https://martinsrealestate.co/api/employee/posts");
    expect(res.status).toBe(401);
    const dash = await SELF.fetch("https://martinsrealestate.co/employee/", { redirect: "manual" });
    expect([302, 301]).toContain(dash.status);
    expect(dash.headers.get("location") || "").toContain("/employee/login");
    const loginPage = await SELF.fetch("https://martinsrealestate.co/employee/login", { redirect: "manual" });
    expect(loginPage.status).toBe(200);
    expect(await loginPage.text()).toContain("Employee login");
  });

  it("keeps drafts private and publishes them to public pages", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    expect(session.res.status).toBe(200);
    const token = csrfFrom(session.cookie);
    const created = await SELF.fetch("https://martinsrealestate.co/api/employee/posts", {
      method: "POST",
      headers: {
        ...authHeaders(session.cookie)
      },
      body: JSON.stringify({ template: "editorial", title: "Private draft note" })
    });
    expect(created.status).toBe(201);
    const post = (await jsonOf(created)).post;
    expect(post.status).toBe("draft");

    const leak = await SELF.fetch(`https://martinsrealestate.co/api/blog/posts/${post.slug}`);
    expect(leak.status).toBe(404);
    const htmlLeak = await SELF.fetch(`https://martinsrealestate.co/blog/${post.slug}`);
    expect(htmlLeak.status).toBe(404);

    const published = await SELF.fetch(`https://martinsrealestate.co/api/employee/posts/${post.id}/publish`, {
      method: "POST",
      headers: {
        ...authHeaders(session.cookie)
      },
      body: "{}"
    });
    expect(published.status).toBe(200);

    const publicJson = await SELF.fetch(`https://martinsrealestate.co/api/blog/posts/${post.slug}`);
    expect(publicJson.status).toBe(200);
    const listing = await SELF.fetch("https://martinsrealestate.co/api/blog/posts");
    const list = await jsonOf(listing);
    expect(list.posts.some((p) => p.slug === post.slug)).toBe(true);
    const preview = await jsonOf(await SELF.fetch("https://martinsrealestate.co/api/blog/preview"));
    expect(preview.posts.some((p) => p.slug === post.slug)).toBe(true);
    const page = await SELF.fetch(`https://martinsrealestate.co/blog/${post.slug}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Private draft note");
    expect(html).toContain("<article");
    const listingPage = await SELF.fetch("https://martinsrealestate.co/blog");
    expect(listingPage.status).toBe(200);
    expect(await listingPage.text()).toContain("Private draft note");
  });

  it("rejects mutating employee requests without a CSRF token", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const res = await SELF.fetch("https://martinsrealestate.co/api/employee/posts", {
      method: "POST",
      headers: {
        origin: SITE_ORIGIN,
        "content-type": "application/json",
        cookie: session.cookie
      },
      body: JSON.stringify({ template: "editorial", title: "CSRF should fail" })
    });
    expect(res.status).toBe(403);
  });

  it("keeps scheduled posts out of public APIs until they are due", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const token = csrfFrom(session.cookie);
    const created = await SELF.fetch("https://martinsrealestate.co/api/employee/posts", {
      method: "POST",
      headers: {
        ...authHeaders(session.cookie)
      },
      body: JSON.stringify({ template: "market", title: "Future market briefing" })
    });
    const post = (await jsonOf(created)).post;
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const scheduled = await SELF.fetch(`https://martinsrealestate.co/api/employee/posts/${post.id}/schedule`, {
      method: "POST",
      headers: {
        ...authHeaders(session.cookie)
      },
      body: JSON.stringify({ publishedAt: future })
    });
    expect(scheduled.status).toBe(200);
    expect((await jsonOf(scheduled.clone())).post.status).toBe("scheduled");
    const leak = await SELF.fetch(`https://martinsrealestate.co/api/blog/posts/${post.slug}`);
    expect(leak.status).toBe(404);
    const htmlLeak = await SELF.fetch(`https://martinsrealestate.co/blog/${post.slug}`);
    expect(htmlLeak.status).toBe(404);
  });

  it("sanitizes script tags out of published article HTML", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const token = csrfFrom(session.cookie);
    const created = await SELF.fetch("https://martinsrealestate.co/api/employee/posts", {
      method: "POST",
      headers: {
        ...authHeaders(session.cookie)
      },
      body: JSON.stringify({ template: "editorial", title: "Safe content note" })
    });
    const post = (await jsonOf(created)).post;
    const saved = await SELF.fetch(`https://martinsrealestate.co/api/employee/posts/${post.id}`, {
      method: "PUT",
      headers: {
        ...authHeaders(session.cookie)
      },
      body: JSON.stringify({
        title: "Safe content note",
        blocks: [
          {
            type: "paragraph",
            data: { html: "<p>Visible copy</p><script>alert(1)</script><p onclick=\"alert(1)\">More</p>" }
          }
        ]
      })
    });
    expect(saved.status).toBe(200);
    await SELF.fetch(`https://martinsrealestate.co/api/employee/posts/${post.id}/publish`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: "{}"
    });
    const page = await SELF.fetch(`https://martinsrealestate.co/blog/${post.slug}`);
    const html = await page.text();
    const body = html.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<\/article>/)?.[1] || "";
    expect(body).toContain("Visible copy");
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/onclick=/i);
  });

  it("does not let employees create administrator accounts", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const denied = await SELF.fetch("https://martinsrealestate.co/api/employee/users", {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({
        name: "Hacker",
        email: "hacker@martinsrealestate.co",
        password: "AnotherSecret1!",
        role: "admin"
      })
    });
    expect(denied.status).toBe(403);

    const editor = await SELF.fetch("https://martinsrealestate.co/api/employee/users", {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({
        name: "Editor",
        email: "editor@martinsrealestate.co",
        password: "EditorSecret1!",
        role: "editor"
      })
    });
    expect(editor.status).toBe(201);
    expect((await jsonOf(editor)).user.role).toBe("editor");
  });

  it("publishes scheduled posts through the worker job", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const token = csrfFrom(session.cookie);
    const created = await SELF.fetch("https://martinsrealestate.co/api/employee/posts", {
      method: "POST",
      headers: {
        ...authHeaders(session.cookie)
      },
      body: JSON.stringify({ template: "market", title: "Scheduled market note" })
    });
    const post = (await jsonOf(created)).post;
    const past = "2020-01-01 00:00:00";
    await env.DB.prepare("UPDATE posts SET status = 'scheduled', published_at = ? WHERE id = ?")
      .bind(past, post.id)
      .run();
    const result = await publishDuePosts(env);
    expect(result.published).toBeGreaterThanOrEqual(1);
    const publicJson = await SELF.fetch(`https://martinsrealestate.co/api/blog/posts/${post.slug}`);
    expect(publicJson.status).toBe(200);
  });

  it("records public article views but not employee previews", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const token = csrfFrom(session.cookie);
    const created = await SELF.fetch("https://martinsrealestate.co/api/employee/posts", {
      method: "POST",
      headers: {
        ...authHeaders(session.cookie)
      },
      body: JSON.stringify({ template: "guide", title: "View counting guide" })
    });
    const post = (await jsonOf(created)).post;
    await SELF.fetch(`https://martinsrealestate.co/api/employee/posts/${post.id}/publish`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: "{}"
    });

    await SELF.fetch(`https://martinsrealestate.co/blog/${post.slug}?preview=1`, {
      headers: { cookie: session.cookie }
    });
    await SELF.fetch(`https://martinsrealestate.co/blog/${post.slug}`, {
      headers: { cookie: session.cookie, "user-agent": "Mozilla/5.0 employee" }
    });
    const ctx = createExecutionContext();
    const publicView = await worker.fetch(
      new Request(`https://martinsrealestate.co/blog/${post.slug}`, {
        headers: { "user-agent": "Mozilla/5.0 public-reader" }
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(publicView.status).toBe(200);

    const stats = await jsonOf(
      await SELF.fetch(`https://martinsrealestate.co/api/employee/analytics/posts/${post.id}`, {
        headers: { cookie: session.cookie }
      })
    );
    expect(stats.analytics.totalViews).toBe(1);
  });

  it("stores uploaded images in R2 and serves them to employees", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const token = csrfFrom(session.cookie);
    const png = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119,
      83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0, 0, 0, 0,
      73, 69, 78, 68, 174, 66, 96, 130
    ]);
    const form = new FormData();
    form.append("file", new File([png], "dot.png", { type: "image/png" }));
    form.append("alt", "Dot");
    const upload = await SELF.fetch("https://martinsrealestate.co/api/employee/media", {
      method: "POST",
      headers: originHeaders({ cookie: session.cookie, "x-csrf-token": token }),
      body: form
    });
    expect(upload.status).toBe(201);
    const media = (await jsonOf(upload)).media;
    const stored = await env.MEDIA.get(media.r2_key);
    expect(stored).not.toBeNull();
    const served = await SELF.fetch(`https://martinsrealestate.co/media/${media.id}`, {
      headers: { cookie: session.cookie }
    });
    expect(served.status).toBe(200);
    const publicMedia = await SELF.fetch(`https://martinsrealestate.co/media/${media.id}`);
    expect(publicMedia.status).toBe(404);
  });

  it("hashes passwords instead of storing them in plaintext", async () => {
    const hash = await hashPassword("SuperSecret1!");
    expect(hash.startsWith("pbkdf2$sha256$")).toBe(true);
    const row = await env.DB.prepare("SELECT password_hash FROM employees WHERE email = ?")
      .bind("admin@martinsrealestate.co")
      .first();
    expect(row.password_hash).not.toContain("SuperSecret1!");
    expect(row.password_hash.startsWith("pbkdf2$")).toBe(true);
  });

  it("rejects bootstrap without a token and after the lock is taken", async () => {
    const missing = await SELF.fetch("https://martinsrealestate.co/api/employee/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@y.com", password: "SuperSecret1!", name: "X" })
    });
    expect(missing.status).toBe(403);
    const second = await bootstrap("another-admin@martinsrealestate.co");
    expect(second.status).toBe(409);
  });

  it("requires a matching Origin or Referer for sign-in", async () => {
    const missing = await SELF.fetch(`${SITE_ORIGIN}/api/employee/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@martinsrealestate.co", password: "SuperSecret1!" })
    });
    expect(missing.status).toBe(403);
    const evil = await SELF.fetch(`${SITE_ORIGIN}/api/employee/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ email: "admin@martinsrealestate.co", password: "SuperSecret1!" })
    });
    expect(evil.status).toBe(403);
    const viaReferer = await SELF.fetch(`${SITE_ORIGIN}/api/employee/login`, {
      method: "POST",
      headers: { "content-type": "application/json", referer: `${SITE_ORIGIN}/employee/login` },
      body: JSON.stringify({ email: "admin@martinsrealestate.co", password: "SuperSecret1!" })
    });
    expect(viaReferer.status).toBe(200);
  });

  it("rate-limits failed sign-ins for one IP without blocking other addresses", async () => {
    const attacker = { "content-type": "application/json", origin: SITE_ORIGIN, "cf-connecting-ip": "203.0.113.50" };
    let last;
    for (let i = 0; i < 8; i += 1) {
      last = await SELF.fetch(`${SITE_ORIGIN}/api/employee/login`, {
        method: "POST",
        headers: attacker,
        body: JSON.stringify({ email: "nobody@martinsrealestate.co", password: "wrong-password" })
      });
    }
    expect(last.status).toBe(401);
    const blocked = await SELF.fetch(`${SITE_ORIGIN}/api/employee/login`, {
      method: "POST",
      headers: attacker,
      body: JSON.stringify({ email: "nobody@martinsrealestate.co", password: "wrong-password" })
    });
    expect(blocked.status).toBe(429);
    const admin = await login("admin@martinsrealestate.co", "SuperSecret1!");
    expect(admin.res.status).toBe(200);
  });

  it("invalidates every session after a password change", async () => {
    const first = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const second = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const changed = await SELF.fetch(`${SITE_ORIGIN}/api/employee/me`, {
      method: "PATCH",
      headers: authHeaders(first.cookie),
      body: JSON.stringify({
        name: "Admin",
        currentPassword: "SuperSecret1!",
        password: "ChangedSecret1!"
      })
    });
    expect(changed.status).toBe(200);
    expect((await jsonOf(changed)).sessionInvalidated).toBe(true);
    const withOldA = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, { headers: { cookie: first.cookie } });
    const withOldB = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, { headers: { cookie: second.cookie } });
    expect(withOldA.status).toBe(401);
    expect(withOldB.status).toBe(401);
    const restored = await login("admin@martinsrealestate.co", "ChangedSecret1!");
    expect(restored.res.status).toBe(200);
    const back = await SELF.fetch(`${SITE_ORIGIN}/api/employee/me`, {
      method: "PATCH",
      headers: authHeaders(restored.cookie),
      body: JSON.stringify({
        name: "Admin",
        currentPassword: "ChangedSecret1!",
        password: "SuperSecret1!"
      })
    });
    expect(back.status).toBe(200);
  });

  it("invalidates sessions when an employee is deactivated", async () => {
    const admin = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const created = await SELF.fetch(`${SITE_ORIGIN}/api/employee/users`, {
      method: "POST",
      headers: authHeaders(admin.cookie),
      body: JSON.stringify({
        name: "Temp Editor",
        email: "temp-editor@martinsrealestate.co",
        password: "EditorSecret1!",
        role: "editor"
      })
    });
    expect(created.status).toBe(201);
    const user = (await jsonOf(created)).user;
    const editor = await login("temp-editor@martinsrealestate.co", "EditorSecret1!");
    expect(editor.res.status).toBe(200);
    const deactivated = await SELF.fetch(`${SITE_ORIGIN}/api/employee/users/${user.id}`, {
      method: "PATCH",
      headers: authHeaders(admin.cookie),
      body: JSON.stringify({ active: false })
    });
    expect(deactivated.status).toBe(200);
    const later = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, { headers: { cookie: editor.cookie } });
    expect(later.status).toBe(401);
  });

  it("refuses to deactivate the last active administrator", async () => {
    const admin = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const original = await env.DB.prepare("SELECT id FROM employees WHERE email = ?")
      .bind("admin@martinsrealestate.co")
      .first();
    const extraIds = [crypto.randomUUID(), crypto.randomUUID()];
    const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
    try {
      const denied = await SELF.fetch(`${SITE_ORIGIN}/api/employee/users/${original.id}`, {
        method: "PATCH",
        headers: authHeaders(admin.cookie),
        body: JSON.stringify({ active: false })
      });
      expect(denied.status).toBe(409);

      for (const [index, extraId] of extraIds.entries()) {
        await env.DB.prepare(
          `INSERT INTO employees (id, email, name, password_hash, role, active, created_at, updated_at)
           VALUES (?, ?, 'Extra Admin', 'pbkdf2$sha256$100000$dGVzdA==$dGVzdA==', 'admin', 1, ?, ?)`
        )
          .bind(extraId, `extra-admin-${index}@martinsrealestate.co`, ts, ts)
          .run();
      }
      const extraOk = await SELF.fetch(`${SITE_ORIGIN}/api/employee/users/${extraIds[0]}`, {
        method: "PATCH",
        headers: authHeaders(admin.cookie),
        body: JSON.stringify({ active: false })
      });
      expect(extraOk.status).toBe(200);

      const [one, two] = await Promise.all([
        env.DB.prepare(
          `UPDATE employees SET active = 0, updated_at = ?
           WHERE id = ? AND (
             role != 'admin'
             OR (SELECT COUNT(*) FROM employees WHERE role = 'admin' AND active = 1 AND id != ?) >= 1
           )`
        )
          .bind(ts, extraIds[1], extraIds[1])
          .run(),
        env.DB.prepare(
          `UPDATE employees SET active = 0, updated_at = ?
           WHERE id = ? AND (
             role != 'admin'
             OR (SELECT COUNT(*) FROM employees WHERE role = 'admin' AND active = 1 AND id != ?) >= 1
           )`
        )
          .bind(ts, original.id, original.id)
          .run()
      ]);
      const remaining = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM employees WHERE role = 'admin' AND active = 1"
      ).first();
      expect(Number(remaining.n)).toBeGreaterThanOrEqual(1);
      expect([one.meta?.changes || 0, two.meta?.changes || 0].some((n) => n === 0)).toBe(true);
    } finally {
      await env.DB.prepare("UPDATE employees SET active = 1 WHERE id = ?").bind(original.id).run();
      for (const extraId of extraIds) {
        await env.DB.prepare("DELETE FROM sessions WHERE employee_id = ?").bind(extraId).run();
        await env.DB.prepare("DELETE FROM employees WHERE id = ?").bind(extraId).run();
      }
    }
  });

  it("stores scheduled times from explicit Eastern offsets as UTC", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const created = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ template: "market", title: "Eastern schedule note" })
    });
    const post = (await jsonOf(created)).post;
    const edt = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${post.id}/schedule`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ publishedAt: "2099-07-15T15:30:00-04:00" })
    });
    expect(edt.status).toBe(200);
    expect((await jsonOf(edt)).post.publishedAt).toBe("2099-07-15 19:30:00");
    const createdEst = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ template: "market", title: "Eastern standard schedule" })
    });
    const estPost = (await jsonOf(createdEst)).post;
    const est = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${estPost.id}/schedule`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ publishedAt: "2099-01-15T15:30:00-05:00" })
    });
    expect(est.status).toBe(200);
    expect((await jsonOf(est)).post.publishedAt).toBe("2099-01-15 20:30:00");
    const ambiguous = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${post.id}/schedule`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ publishedAt: "2099-07-15T15:30" })
    });
    expect(ambiguous.status).toBe(400);
  });

  it("runs scheduled publishing from the worker alarm without an earlier page view", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const created = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ template: "guide", title: "Cron without HTTP warmup" })
    });
    const post = (await jsonOf(created)).post;
    await env.DB.prepare("UPDATE posts SET status = 'scheduled', published_at = ? WHERE id = ?")
      .bind("2020-02-02 00:00:00", post.id)
      .run();
    const ctx = createExecutionContext();
    await worker.scheduled({ cron: "*/5 * * * *" }, env, ctx);
    await waitOnExecutionContext(ctx);
    const publicJson = await SELF.fetch(`${SITE_ORIGIN}/api/blog/posts/${post.slug}`);
    expect(publicJson.status).toBe(200);
  });

  it("does not delete images referenced by featured, OG, or article blocks", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const png = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119,
      83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0, 0, 0, 0,
      73, 69, 78, 68, 174, 66, 96, 130
    ]);
    const form = new FormData();
    form.append("file", new File([png], "block.png", { type: "image/png" }));
    const upload = await SELF.fetch(`${SITE_ORIGIN}/api/employee/media`, {
      method: "POST",
      headers: originHeaders({ cookie: session.cookie, "x-csrf-token": csrfFrom(session.cookie) }),
      body: form
    });
    expect(upload.status).toBe(201);
    const media = (await jsonOf(upload)).media;
    const created = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ template: "spotlight", title: "Uses a gallery image" })
    });
    const post = (await jsonOf(created)).post;
    const saved = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${post.id}`, {
      method: "PUT",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({
        updatedAt: post.updatedAt,
        blocks: [{ type: "gallery", data: { items: [{ mediaId: media.id, alt: "Room", caption: "" }] } }]
      })
    });
    expect(saved.status).toBe(200);
    const blockedDraft = await SELF.fetch(`${SITE_ORIGIN}/api/employee/media/${media.id}`, {
      method: "DELETE",
      headers: originHeaders({ cookie: session.cookie, "x-csrf-token": csrfFrom(session.cookie) })
    });
    expect(blockedDraft.status).toBe(400);
    await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${post.id}/publish`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: "{}"
    });
    const blockedPublished = await SELF.fetch(`${SITE_ORIGIN}/api/employee/media/${media.id}`, {
      method: "DELETE",
      headers: originHeaders({ cookie: session.cookie, "x-csrf-token": csrfFrom(session.cookie) })
    });
    expect(blockedPublished.status).toBe(400);
  });

  it("rejects invalid image bytes, MIME mismatches, and oversized upload declarations", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const html = new FormData();
    html.append("file", new File([new TextEncoder().encode("<html></html>")], "x.png", { type: "image/png" }));
    const invalid = await SELF.fetch(`${SITE_ORIGIN}/api/employee/media`, {
      method: "POST",
      headers: originHeaders({ cookie: session.cookie, "x-csrf-token": csrfFrom(session.cookie) }),
      body: html
    });
    expect(invalid.status).toBe(400);
    const png = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119,
      83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0, 0, 0, 0,
      73, 69, 78, 68, 174, 66, 96, 130
    ]);
    const mismatch = new FormData();
    mismatch.append("file", new File([png], "dot.jpg", { type: "image/jpeg" }));
    const typed = await SELF.fetch(`${SITE_ORIGIN}/api/employee/media`, {
      method: "POST",
      headers: originHeaders({ cookie: session.cookie, "x-csrf-token": csrfFrom(session.cookie) }),
      body: mismatch
    });
    expect(typed.status).toBe(400);
    const oversized = await uploadMedia(
      new Request(`${SITE_ORIGIN}/api/employee/media`, {
        method: "POST",
        headers: { "content-length": String(20 * 1024 * 1024) }
      }),
      env,
      { id: "admin-id" }
    );
    expect(oversized.status).toBe(413);
  });

  it("does not record views when SESSION_SECRET is missing", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const created = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ template: "guide", title: "No salt views" })
    });
    const post = (await jsonOf(created)).post;
    const published = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${post.id}/publish`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: "{}"
    });
    const live = (await jsonOf(published)).post;
    const result = await recordPublicView(
      new Request(`${SITE_ORIGIN}/blog/${post.slug}`, { headers: { "user-agent": "Mozilla/5.0 public-reader" } }),
      { DB: env.DB, SESSION_SECRET: "" },
      live
    );
    expect(result.recorded).toBe(false);
    expect(result.reason).toBe("unconfigured");
  });

  it("keeps omitted blocks and rejects stale overlapping saves", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const created = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts`, {
      method: "POST",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ template: "editorial", title: "Concurrency article" })
    });
    const post = (await jsonOf(created)).post;
    expect(post.blocks.length).toBeGreaterThan(0);
    const titleOnly = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${post.id}`, {
      method: "PUT",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ title: "Concurrency article renamed", updatedAt: post.updatedAt })
    });
    expect(titleOnly.status).toBe(200);
    const afterTitle = (await jsonOf(titleOnly)).post;
    expect(afterTitle.blocks.length).toBe(post.blocks.length);
    const stale = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${post.id}`, {
      method: "PUT",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ title: "Stale write", updatedAt: post.updatedAt })
    });
    expect(stale.status).toBe(409);
    const cleared = await SELF.fetch(`${SITE_ORIGIN}/api/employee/posts/${post.id}`, {
      method: "PUT",
      headers: authHeaders(session.cookie),
      body: JSON.stringify({ title: "Cleared", updatedAt: afterTitle.updatedAt, blocks: [] })
    });
    expect(cleared.status).toBe(200);
    expect((await jsonOf(cleared)).post.blocks).toEqual([]);
  });

  it("allocates distinct slugs when two articles start with the same title", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    const employee = session.body.employee;
    const [one, two] = await Promise.all([
      createPost(env, employee, { template: "editorial", title: "Shared slug title" }),
      createPost(env, employee, { template: "editorial", title: "Shared slug title" })
    ]);
    expect(one.slug).not.toBe(two.slug);
    const { results } = await env.DB.prepare("SELECT slug FROM posts WHERE title = ?").bind("Shared slug title").all();
    expect(new Set((results || []).map((row) => row.slug)).size).toBe((results || []).length);
  });

  it("does not let the blog router swallow the contact form", async () => {
    const form = new FormData();
    form.append("name", "Jordan");
    form.append("email", "jordan@example.com");
    const res = await SELF.fetch(`${SITE_ORIGIN}/api/contact`, { method: "POST", body: form });
    expect(res.status).not.toBe(404);
    expect([200, 303, 400, 500, 503]).toContain(res.status);
  });

  it("hides employee dashboard fragments from anonymous fetches", async () => {
    const res = await SELF.fetch(`${SITE_ORIGIN}/fragments/employee-app.html`);
    expect(res.status).toBe(404);
  });

  it("creates only one administrator when bootstrap requests race", async () => {
    await env.DB.prepare("DELETE FROM article_views").run();
    await env.DB.prepare("DELETE FROM post_blocks").run();
    await env.DB.prepare("DELETE FROM posts").run();
    await env.DB.prepare("DELETE FROM media").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM login_attempts").run();
    await env.DB.prepare("DELETE FROM employees").run();
    await env.DB.prepare("DELETE FROM bootstrap_lock").run();
    const [first, second] = await Promise.all([
      bootstrap("race-one@martinsrealestate.co", "SuperSecret1!", "Race One"),
      bootstrap("race-two@martinsrealestate.co", "SuperSecret1!", "Race Two")
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM employees").first();
    expect(Number(count.n)).toBe(1);
  });
});
