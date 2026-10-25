import { describe, expect, it } from "vitest";
import { detectImageType, hasExplicitTimezone, parseTs, sameOrigin, toUtcSql } from "../src/blog/util.js";
import { sanitizeHref, sanitizeHtml } from "../src/blog/sanitize.js";

describe("origin checks", () => {
  it("rejects missing Origin and Referer", () => {
    const request = new Request("https://martinsrealestate.co/api/employee/login", { method: "POST" });
    expect(sameOrigin(request)).toBe(false);
  });

  it("accepts a matching Origin", () => {
    const request = new Request("https://martinsrealestate.co/api/employee/login", {
      method: "POST",
      headers: { origin: "https://martinsrealestate.co" }
    });
    expect(sameOrigin(request)).toBe(true);
  });

  it("rejects a mismatched Origin", () => {
    const request = new Request("https://martinsrealestate.co/api/employee/login", {
      method: "POST",
      headers: { origin: "https://evil.example" }
    });
    expect(sameOrigin(request)).toBe(false);
  });

  it("accepts a matching Referer when Origin is absent", () => {
    const request = new Request("https://martinsrealestate.co/api/employee/login", {
      method: "POST",
      headers: { referer: "https://martinsrealestate.co/employee/login" }
    });
    expect(sameOrigin(request)).toBe(true);
  });
});

describe("schedule timezone conversion", () => {
  it("converts Eastern daylight and standard offsets to UTC", () => {
    expect(hasExplicitTimezone("2026-07-15T15:30:00-04:00")).toBe(true);
    expect(hasExplicitTimezone("2026-01-15T15:30:00-05:00")).toBe(true);
    expect(hasExplicitTimezone("2026-07-15T15:30")).toBe(false);
    expect(toUtcSql(parseTs("2026-07-15T15:30:00-04:00"))).toBe("2026-07-15 19:30:00");
    expect(toUtcSql(parseTs("2026-01-15T15:30:00-05:00"))).toBe("2026-01-15 20:30:00");
  });
});

describe("image signatures", () => {
  it("detects PNG and rejects arbitrary bytes", () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(new TextEncoder().encode("<html></html>"))).toBe("");
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });
});

describe("HTML sanitizer", () => {
  it("strips scripts, event handlers, and dangerous URLs", () => {
    const html = sanitizeHtml(
      `<p>Visible copy</p><script>alert(1)</script><p onclick="alert(1)">More</p><a href="javascript:alert(1)">x</a><a href="https://martinsrealestate.co">ok</a>`
    );
    expect(html).toContain("Visible copy");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onclick=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('href="https://martinsrealestate.co"');
  });

  it("rejects data and vbscript URLs after entity decoding", () => {
    expect(sanitizeHref("javascript:alert(1)")).toBe("");
    expect(sanitizeHref("DATA:text/html,hi")).toBe("");
    expect(sanitizeHref("vbscript:msg")).toBe("");
    expect(sanitizeHtml(`<a href="&#106;avascript:alert(1)">x</a>`)).not.toContain("javascript");
  });

  it("drops comments and mutation-XSS style markup", () => {
    const html = sanitizeHtml(
      `<!--><img src=x onerror=alert(1)>--><noscript><p title="</noscript><img src=x onerror=alert(1)>"></p><svg><desc><![CDATA[</desc><script>alert(1)</script>]]></svg>`
    );
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/onerror=/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<svg/i);
  });

  it("escapes stray less-than characters instead of treating them as tags", () => {
    expect(sanitizeHtml("3 < 5 and <notatag")).toContain("&lt;");
    expect(sanitizeHtml("3 < 5 and <notatag")).not.toContain("<notatag");
  });
});
