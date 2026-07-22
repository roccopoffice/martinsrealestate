const CONTACT_TO = "martinsrealestate@msn.com";
const CONTACT_FROM = "website@martinsrealestate.co";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method === "POST") {
        return handleContact(request, env);
      }
      if (request.method === "GET") {
        return new Response("Method not allowed", { status: 405 });
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  const form = await request.formData();
  const data = Object.fromEntries(form.entries());

  if (String(data._honey || "").trim()) {
    return redirectAfterSubmit(request, data);
  }

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const phone = String(data.phone || "").trim();
  const message = String(data.message || "").trim();
  const service = String(data.service || "").trim();
  const property = String(data["Property address"] || data.property || "").trim();
  const subject =
    String(data._subject || "").trim() || "New inquiry — Martins & Associates website";

  if (!name || !email || !email.includes("@")) {
    return new Response("Name and a valid email are required.", { status: 400 });
  }

  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    service ? `Service: ${service}` : null,
    property ? `Property: ${property}` : null,
    "",
    message || "(No message provided)",
  ].filter(Boolean);

  const text = lines.join("\n");
  const html = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  if (!env.EMAIL?.send) {
    return new Response("Email service is not configured.", { status: 503 });
  }

  await env.EMAIL.send({
    to: CONTACT_TO,
    from: { email: CONTACT_FROM, name: "Martins Real Estate Website" },
    replyTo: email,
    subject,
    text,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">${html}</div>`,
  });

  return redirectAfterSubmit(request, data);
}

function redirectAfterSubmit(request, data) {
  const explicitNext = String(data._next || "").trim();
  if (explicitNext) {
    try {
      const nextUrl = new URL(explicitNext, request.url);
      if (nextUrl.origin === new URL(request.url).origin) {
        return Response.redirect(nextUrl.toString(), 303);
      }
    } catch {
      /* fall through */
    }
  }

  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      const back = new URL(referer);
      back.searchParams.set("sent", "1");
      if (back.origin === new URL(request.url).origin) {
        return Response.redirect(back.toString(), 303);
      }
    } catch {
      /* fall through */
    }
  }

  return Response.redirect(new URL("/book.html?sent=1", request.url).toString(), 303);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
