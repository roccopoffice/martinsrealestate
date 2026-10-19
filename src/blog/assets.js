export async function readAssetHtml(env, request, pathname) {
  if (!env.ASSETS) return "";
  const origin = new URL(request.url).origin;
  const candidates = pathname.endsWith(".html")
    ? [pathname, pathname.replace(/\.html$/, "")]
    : [pathname, `${pathname}.html`];
  for (const path of candidates) {
    try {
      let res = await env.ASSETS.fetch(new Request(`${origin}${path}`, { method: "GET" }));
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("Location");
        if (!loc) continue;
        const next = new URL(loc, `${origin}${path}`);
        if (next.pathname.startsWith("/blog") || next.pathname.startsWith("/employee")) {
          continue;
        }
        res = await env.ASSETS.fetch(new Request(next.toString(), { method: "GET" }));
      }
      if (!res.ok) continue;
      const text = await res.text();
      if (text && /<html/i.test(text)) return text;
    } catch {
      /* try the next candidate */
    }
  }
  return "";
}

export function htmlPage(html, { status = 200, cache = "no-store" } = {}) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache }
  });
}
