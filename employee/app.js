(function () {
  "use strict";

  function csrf() {
    var match = document.cookie.match(/(?:^|; )martins_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    if (!(options.body instanceof FormData)) headers["Content-Type"] = headers["Content-Type"] || "application/json";
    if (options.method && options.method !== "GET") headers["X-CSRF-Token"] = csrf();
    var res = await fetch(path, {
      credentials: "same-origin",
      method: options.method || "GET",
      headers: headers,
      body: options.body
    });
    if (res.status === 401) {
      window.location.href = "/employee/login";
      throw new Error("Sign in required");
    }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  var me = null;
  var view = document.getElementById("emp-view");

  function navActive() {
    var hash = location.hash || "#/overview";
    document.querySelectorAll(".emp-nav nav a").forEach(function (a) {
      a.classList.toggle("is-active", hash.indexOf(a.getAttribute("href")) === 0);
    });
  }

  function fmt(date) {
    if (!date) return "—";
    var raw = String(date);
    var parsed = new Date(/T/.test(raw) ? raw : raw.replace(" ", "T") + "Z");
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString();
  }

  function statusPill(status) {
    return '<span class="emp-status">' + status + "</span>";
  }

  function postsTable(posts) {
    if (!posts.length) return "<p class='emp-note'>No posts in this list yet.</p>";
    return (
      '<table class="emp-table"><thead><tr><th>Title</th><th>Status</th><th>Updated</th></tr></thead><tbody>' +
      posts
        .map(function (p) {
          return (
            "<tr><td><a href='#/posts/" +
            p.id +
            "'>" +
            esc(p.title) +
            "</a></td><td>" +
            statusPill(p.status) +
            "</td><td>" +
            fmt(p.updatedAt) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>"
    );
  }

  function esc(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function chart(rows) {
    if (!rows.length) return "<p class='emp-note'>No recorded views yet.</p>";
    var max = Math.max.apply(null, rows.map(function (r) { return Number(r.views) || 0; }).concat([1]));
    return (
      '<div class="emp-chart-mini">' +
      rows
        .map(function (r) {
          var pct = Math.round((Number(r.views) / max) * 100);
          return "<div><span>" + esc(r.day) + '</span><span class="bar" style="width:' + pct + '%"></span><span>' + r.views + "</span></div>";
        })
        .join("") +
      "</div>"
    );
  }

  async function showOverview() {
    var data = await api("/api/employee/overview");
    view.innerHTML =
      "<h1>Overview</h1><div class='emp-cards'>" +
      card("Published", data.posts.published) +
      card("Drafts", data.posts.drafts) +
      card("Scheduled", data.posts.scheduled) +
      card("Total views", data.totalViews) +
      "</div><h2>Views over time</h2>" +
      chart(data.viewsOverTime) +
      "<h2>Most-viewed articles</h2>" +
      (data.topArticles.length
        ? "<ol>" +
          data.topArticles
            .map(function (a) {
              return "<li>" + esc(a.title) + " — " + a.views + " views</li>";
            })
            .join("") +
          "</ol>"
        : "<p class='emp-note'>Views appear after readers open published articles.</p>") +
      "<h2>Recent publishing activity</h2>" +
      postsTable(data.recentActivity.map(mapActivity));
  }

  function mapActivity(row) {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at || row.updatedAt
    };
  }

  function card(label, n) {
    return "<div class='emp-card'><strong>" + n + "</strong>" + label + "</div>";
  }

  async function showPosts(status, title) {
    var data = await api("/api/employee/posts?status=" + encodeURIComponent(status || "all"));
    view.innerHTML = "<h1>" + title + "</h1>" + postsTable(data.posts);
  }

  async function showNew() {
    var data = await api("/api/employee/templates");
    view.innerHTML =
      "<h1>Create New Post</h1><p class='emp-note'>Choose a working layout. You can rearrange every block after you start.</p><div class='emp-templates'>" +
      data.templates
        .map(function (t) {
          return (
            '<button type="button" class="emp-template" data-template="' +
            t.id +
            '"><strong>' +
            esc(t.name) +
            "</strong><span>" +
            esc(t.description) +
            "</span></button>"
          );
        })
        .join("") +
      "</div>";
    view.querySelectorAll("[data-template]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var created = await api("/api/employee/posts", {
          method: "POST",
          body: JSON.stringify({ template: btn.getAttribute("data-template") })
        });
        location.hash = "#/posts/" + created.post.id;
      });
    });
  }

  async function showEditor(id) {
    var data = await api("/api/employee/posts/" + id);
    view.innerHTML = "<h1>Edit post</h1><div id='editor-root'></div>";
    window.MartinsEditor.mount(document.getElementById("editor-root"), data.post, {
      save: function (postId, payload) {
        return api("/api/employee/posts/" + postId, { method: "PUT", body: JSON.stringify(payload) });
      },
      publish: function (postId) {
        return api("/api/employee/posts/" + postId + "/publish", { method: "POST", body: "{}" });
      },
      schedule: function (postId, publishedAt) {
        return api("/api/employee/posts/" + postId + "/schedule", {
          method: "POST",
          body: JSON.stringify({ publishedAt: publishedAt })
        });
      },
      unpublish: function (postId) {
        return api("/api/employee/posts/" + postId + "/unpublish", { method: "POST", body: "{}" });
      },
      archive: function (postId) {
        return api("/api/employee/posts/" + postId + "/archive", { method: "POST", body: "{}" });
      },
      upload: async function (file) {
        var form = new FormData();
        form.append("file", file);
        var res = await api("/api/employee/media", { method: "POST", body: form, headers: {} });
        return res.media;
      }
    });
  }

  async function showMedia() {
    var data = await api("/api/employee/media");
    view.innerHTML =
      "<h1>Media Library</h1><form id='media-form' class='emp-actions'><input type='file' name='file' accept='image/jpeg,image/png,image/webp,image/gif' required><input name='alt' placeholder='Alt text'><button class='btn' type='submit'>Upload</button></form><div class='emp-media-grid'>" +
      (data.media || [])
        .map(function (m) {
          return (
            "<figure><img src='/media/" +
            m.id +
            "' alt='" +
            esc(m.alt) +
            "'><figcaption><code>" +
            m.id +
            "</code><br>" +
            esc(m.filename) +
            "</figcaption></figure>"
          );
        })
        .join("") +
      "</div>";
    document.getElementById("media-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var form = new FormData(e.target);
      await api("/api/employee/media", { method: "POST", body: form, headers: {} });
      showMedia();
    });
  }

  async function showAnalytics() {
    var data = await api("/api/employee/analytics");
    view.innerHTML =
      "<h1>Analytics</h1><p class='emp-note'>Counts unique public article opens per visitor per day. Editor previews, signed-in employees, and common automated traffic are excluded. Repeat clicks from the same browser on the same day are not recounted. These are first-party measurements, not advertising pixels.</p>" +
      card("Total article views", data.totalViews) +
      "<h2>Views over time</h2>" +
      chart(data.viewsOverTime) +
      "<h2>Most-viewed articles</h2>" +
      (data.topArticles.length
        ? "<ul>" +
          data.topArticles
            .map(function (a) {
              return "<li><a href='#/posts/" + a.id + "'>" + esc(a.title) + "</a> — " + a.views + "</li>";
            })
            .join("") +
          "</ul>"
        : "<p class='emp-note'>No public views recorded yet.</p>");
  }

  async function showSettings() {
    var html =
      "<h1>Account Settings</h1><form id='me-form' class='emp-login__form' style='max-width:28rem;background:#fff;padding:1rem;border-radius:12px'>" +
      "<label>Name<input name='name' value='" +
      esc(me.name) +
      "'></label>" +
      "<label>Current password<input name='currentPassword' type='password'></label>" +
      "<label>New password<input name='password' type='password' minlength='10'></label>" +
      "<button class='btn' type='submit'>Save</button></form>";
    if (me.role === "admin") {
      var users = await api("/api/employee/users");
      html +=
        "<h2>Team</h2><p class='emp-note'>Administrators can add editors. Editors cannot create admin accounts or change roles.</p>" +
        "<form id='user-form' class='emp-login__form' style='max-width:28rem;background:#fff;padding:1rem;border-radius:12px;margin-bottom:1rem'>" +
        "<label>Name<input name='name' required></label>" +
        "<label>Email<input name='email' type='email' required></label>" +
        "<label>Temporary password<input name='password' type='password' minlength='10' required></label>" +
        "<button class='btn' type='submit'>Create editor</button></form>" +
        "<ul>" +
        users.users
          .map(function (u) {
            return "<li>" + esc(u.name) + " — " + esc(u.email) + " (" + u.role + (u.active ? "" : ", inactive") + ")</li>";
          })
          .join("") +
        "</ul>";
    }
    view.innerHTML = html;
    document.getElementById("me-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = e.target;
      var saved = await api("/api/employee/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: f.name.value,
          currentPassword: f.currentPassword.value,
          password: f.password.value
        })
      });
      if (saved.sessionInvalidated) {
        window.location.href = "/employee/login";
        return;
      }
      location.reload();
    });
    var userForm = document.getElementById("user-form");
    if (userForm) {
      userForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var f = e.target;
        await api("/api/employee/users", {
          method: "POST",
          body: JSON.stringify({ name: f.name.value, email: f.email.value, password: f.password.value, role: "editor" })
        });
        showSettings();
      });
    }
  }

  async function route() {
    navActive();
    var hash = (location.hash || "#/overview").replace(/^#/, "");
    try {
      if (hash === "/overview") return showOverview();
      if (hash === "/posts") return showPosts("all", "All Posts");
      if (hash === "/new") return showNew();
      if (hash === "/drafts") return showPosts("draft", "Drafts");
      if (hash === "/scheduled") return showPosts("scheduled", "Scheduled Posts");
      if (hash === "/published") return showPosts("published", "Published Posts");
      if (hash === "/media") return showMedia();
      if (hash === "/analytics") return showAnalytics();
      if (hash === "/settings") return showSettings();
      var edit = hash.match(/^\/posts\/([^/]+)$/);
      if (edit) return showEditor(edit[1]);
      return showOverview();
    } catch (err) {
      view.innerHTML = "<p class='emp-note'>" + esc(err.message) + "</p>";
    }
  }

  document.getElementById("logout-btn").addEventListener("click", async function () {
    await api("/api/employee/logout", { method: "POST", body: "{}" });
    location.href = "/employee/login";
  });
  window.addEventListener("hashchange", route);

  api("/api/employee/me").then(function (data) {
    me = data.employee;
    document.getElementById("emp-who").textContent = me.name + " · " + me.role;
    if (!location.hash) location.hash = "#/overview";
    else route();
  });
})();
