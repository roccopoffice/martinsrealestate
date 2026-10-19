import { createExecutionContext, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../worker.js";
import { hashPassword } from "../src/blog/crypto.js";
import { publishDuePosts } from "../src/blog/posts.js";
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

async function bootstrap() {
  return SELF.fetch("https://martinsrealestate.co/api/employee/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json", "x-bootstrap-token": "test-bootstrap-token" },
    body: JSON.stringify({
      email: "admin@martinsrealestate.co",
      password: "SuperSecret1!",
      name: "Admin"
    })
  });
}

async function login(email, password) {
  const res = await SELF.fetch("https://martinsrealestate.co/api/employee/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  });

  it("keeps drafts private and publishes them to public pages", async () => {
    const session = await login("admin@martinsrealestate.co", "SuperSecret1!");
    expect(session.res.status).toBe(200);
    const token = csrfFrom(session.cookie);
    const created = await SELF.fetch("https://martinsrealestate.co/api/employee/posts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": token
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
        cookie: session.cookie,
        "x-csrf-token": token,
        "content-type": "application/json"
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
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": token
      },
      body: JSON.stringify({ template: "market", title: "Future market briefing" })
    });
    const post = (await jsonOf(created)).post;
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const scheduled = await SELF.fetch(`https://martinsrealestate.co/api/employee/posts/${post.id}/schedule`, {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "x-csrf-token": token,
        "content-type": "application/json"
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
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": token
      },
      body: JSON.stringify({ template: "editorial", title: "Safe content note" })
    });
    const post = (await jsonOf(created)).post;
    const saved = await SELF.fetch(`https://martinsrealestate.co/api/employee/posts/${post.id}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": token
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
      headers: { cookie: session.cookie, "x-csrf-token": token, "content-type": "application/json" },
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
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": csrfFrom(session.cookie)
      },
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
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": csrfFrom(session.cookie)
      },
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
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": token
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
        "content-type": "application/json",
        cookie: session.cookie,
        "x-csrf-token": token
      },
      body: JSON.stringify({ template: "guide", title: "View counting guide" })
    });
    const post = (await jsonOf(created)).post;
    await SELF.fetch(`https://martinsrealestate.co/api/employee/posts/${post.id}/publish`, {
      method: "POST",
      headers: { cookie: session.cookie, "x-csrf-token": token, "content-type": "application/json" },
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
      headers: { cookie: session.cookie, "x-csrf-token": token },
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
});
