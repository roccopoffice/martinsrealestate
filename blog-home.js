(function () {
  "use strict";

  var root = document.getElementById("home-blog-grid");
  if (!root) return;

  fetch("/api/blog/preview")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var posts = (data && data.posts) || [];
      if (!posts.length) {
        root.innerHTML = '<p class="blog-empty" data-i18n="blog.empty">New articles are on the way. Check back soon.</p>';
        if (window.MartinsI18n) window.MartinsI18n.apply(root);
        return;
      }
      root.innerHTML =
        '<ul class="home-blog__grid">' +
        posts
          .map(function (post) {
            var date = post.publishedAt
              ? new Date(String(post.publishedAt).replace(" ", "T") + "Z").toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric"
                })
              : "";
            var img = post.featuredMediaId
              ? '<img src="/media/' +
                post.featuredMediaId +
                '" alt="' +
                escapeHtml(post.title) +
                '" width="640" height="400" loading="lazy">'
              : '<div class="blog-card__placeholder" aria-hidden="true"></div>';
            return (
              '<li><a class="blog-card" href="/blog/' +
              encodeURIComponent(post.slug) +
              '"><div class="blog-card__media">' +
              img +
              '</div><div class="blog-card__body"><p class="blog-card__meta">' +
              escapeHtml(date) +
              (post.authorName ? " · " + escapeHtml(post.authorName) : "") +
              '</p><h3 class="blog-card__title">' +
              escapeHtml(post.title) +
              '</h3><p class="blog-card__excerpt">' +
              escapeHtml(post.excerpt) +
              '</p><span class="blog-card__more" data-i18n="blog.readMore">Read more</span></div></a></li>'
            );
          })
          .join("") +
        "</ul>";
      if (window.MartinsI18n) window.MartinsI18n.apply(root);
    })
    .catch(function () {
      root.innerHTML = '<p class="blog-empty" data-i18n="blog.empty">New articles are on the way. Check back soon.</p>';
    });

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
