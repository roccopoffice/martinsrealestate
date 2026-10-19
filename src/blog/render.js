import { escapeHtml, parseTs, siteUrl } from "./util.js";
import { mediaUrl } from "./media.js";

export function articleMeta(post) {
  return {
    title: post.seoTitle || `${post.title} | Martins & Associates`,
    description: post.seoDescription || post.excerpt || "",
    image: post.ogImageId || post.featuredMediaId || ""
  };
}

export function renderBlocks(blocks) {
  return (blocks || []).map(renderBlock).join("\n");
}

function renderBlock(block) {
  const data = block.data || {};
  switch (block.type) {
    case "heading":
      return `<h2 class="article-h">${escapeHtml(data.text)}</h2>`;
    case "subheading":
      return `<h3 class="article-sh">${escapeHtml(data.text)}</h3>`;
    case "paragraph":
      return `<div class="article-p">${data.html || ""}</div>`;
    case "image":
      if (!data.mediaId) return "";
      return `<figure class="article-figure">
        <img src="${escapeHtml(mediaUrl(data.mediaId))}" alt="${escapeHtml(data.alt || "")}" loading="lazy">
        ${data.caption ? `<figcaption>${escapeHtml(data.caption)}</figcaption>` : ""}
      </figure>`;
    case "quote":
      return `<blockquote class="article-quote"><p>${escapeHtml(data.text)}</p>${
        data.citation ? `<cite>${escapeHtml(data.citation)}</cite>` : ""
      }</blockquote>`;
    case "pullquote":
      return `<blockquote class="article-pullquote"><p>${escapeHtml(data.text)}</p>${
        data.citation ? `<cite>${escapeHtml(data.citation)}</cite>` : ""
      }</blockquote>`;
    case "list": {
      const tag = data.ordered ? "ol" : "ul";
      const items = (data.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      return `<${tag} class="article-list">${items}</${tag}>`;
    }
    case "divider":
      return `<hr class="article-hr">`;
    case "spacer":
      return `<div class="article-spacer article-spacer--${escapeHtml(data.size || "md")}" aria-hidden="true"></div>`;
    case "stats":
      return `<div class="article-stats">${(data.items || [])
        .map(
          (item) =>
            `<div class="article-stat"><span class="article-stat__value">${escapeHtml(item.value)}</span><span class="article-stat__label">${escapeHtml(item.label)}</span></div>`
        )
        .join("")}</div>`;
    case "tip":
      return `<aside class="article-tip"><strong>${escapeHtml(data.title || "Tip")}</strong><div>${data.html || ""}</div></aside>`;
    case "gallery":
      return `<div class="article-gallery">${(data.items || [])
        .filter((item) => item.mediaId)
        .map(
          (item) =>
            `<figure><img src="${escapeHtml(mediaUrl(item.mediaId))}" alt="${escapeHtml(item.alt || "")}" loading="lazy">${
              item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ""
            }</figure>`
        )
        .join("")}</div>`;
    case "propertyDetails":
      return `<dl class="article-property">
        <dt>${escapeHtml(data.name || "Property")}</dt>
        <dd class="article-property__addr">${escapeHtml(data.address)}</dd>
        <dd class="article-property__facts">
          <span>${escapeHtml(data.price)}</span>
          <span>${escapeHtml(data.beds)}</span>
          <span>${escapeHtml(data.baths)}</span>
          <span>${escapeHtml(data.sqft)}</span>
        </dd>
        ${data.details ? `<dd class="article-property__details">${escapeHtml(data.details)}</dd>` : ""}
      </dl>`;
    case "authorCard":
      return `<aside class="article-author">
        ${data.mediaId ? `<img src="${escapeHtml(mediaUrl(data.mediaId))}" alt="${escapeHtml(data.name || "")}">` : ""}
        <div>
          <p class="article-author__name">${escapeHtml(data.name)}</p>
          <p class="article-author__title">${escapeHtml(data.title)}</p>
          <p>${escapeHtml(data.bio)}</p>
        </div>
      </aside>`;
    case "chart": {
      const items = data.items || [];
      const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
      return `<figure class="article-chart"><figcaption>${escapeHtml(data.title || "")}</figcaption><div class="article-chart__bars">${items
        .map((item) => {
          const pct = Math.round(((Number(item.value) || 0) / max) * 100);
          return `<div class="article-chart__row"><span>${escapeHtml(item.label)}</span><div class="article-chart__track"><span style="width:${pct}%"></span></div><em>${escapeHtml(item.value)}</em></div>`;
        })
        .join("")}</div></figure>`;
    }
    default:
      return "";
  }
}

export function cardHtml(post) {
  const date = post.publishedAt
    ? parseTs(post.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC"
      })
    : "";
  const img = post.featuredMediaId
    ? `<img src="${escapeHtml(mediaUrl(post.featuredMediaId))}" alt="${escapeHtml(post.title)}" width="800" height="520" loading="lazy">`
    : `<div class="blog-card__placeholder" aria-hidden="true"></div>`;
  return `<li>
    <a class="blog-card" href="/blog/${escapeHtml(post.slug)}">
      <div class="blog-card__media">${img}</div>
      <div class="blog-card__body">
        <p class="blog-card__meta">${escapeHtml(date)}${post.authorName ? ` · ${escapeHtml(post.authorName)}` : ""}</p>
        <h2 class="blog-card__title">${escapeHtml(post.title)}</h2>
        <p class="blog-card__excerpt">${escapeHtml(post.excerpt)}</p>
        <span class="blog-card__more">Read more</span>
      </div>
    </a>
  </li>`;
}

export function listingGrid(posts) {
  if (!posts.length) {
    return `<p class="blog-empty" data-i18n="blog.empty">New articles are on the way. Check back soon.</p>`;
  }
  return `<ul class="blog-card-grid">${posts.map(cardHtml).join("")}</ul>`;
}

export function ogTags(env, request, post) {
  const meta = articleMeta(post);
  const url = `${siteUrl(env, request)}/blog/${post.slug}`;
  const image = meta.image
    ? `${siteUrl(env, request)}${mediaUrl(meta.image)}`
    : "https://static.wixstatic.com/media/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png/v1/fill/w_1200,h_630,al_c,q_85,enc_auto/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png";
  return { ...meta, url, image };
}
