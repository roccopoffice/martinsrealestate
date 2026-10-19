(function (global) {
  "use strict";

  var BLOCK_LABELS = {
    heading: "Heading",
    subheading: "Subheading",
    paragraph: "Paragraph",
    image: "Image",
    quote: "Quote",
    pullquote: "Pull quote",
    list: "List",
    divider: "Divider",
    spacer: "Spacing",
    stats: "Stats",
    tip: "Tip",
    gallery: "Gallery",
    propertyDetails: "Property details",
    authorCard: "Author card",
    chart: "Chart"
  };

  function uid() {
    return crypto.randomUUID();
  }

  function emptyData(type) {
    switch (type) {
      case "heading":
      case "subheading":
        return { text: "" };
      case "paragraph":
        return { html: "<p></p>" };
      case "image":
        return { mediaId: "", alt: "", caption: "" };
      case "quote":
      case "pullquote":
        return { text: "", citation: "" };
      case "list":
        return { ordered: false, items: [""] };
      case "spacer":
        return { size: "md" };
      case "stats":
        return { items: [{ label: "", value: "" }] };
      case "tip":
        return { title: "Tip", html: "<p></p>" };
      case "gallery":
        return { items: [{ mediaId: "", alt: "", caption: "" }] };
      case "propertyDetails":
        return { name: "", address: "", price: "", beds: "", baths: "", sqft: "", details: "" };
      case "authorCard":
        return { name: "", title: "", bio: "", mediaId: "" };
      case "chart":
        return { title: "", items: [{ label: "", value: 0 }] };
      default:
        return {};
    }
  }

  global.MartinsEditor = {
    mount: function (root, post, api) {
      var state = {
        post: post,
        blocks: (post.blocks || []).map(function (b) {
          return { id: b.id || uid(), type: b.type, data: Object.assign({}, emptyData(b.type), b.data || {}) };
        }),
        undo: [],
        dirty: false,
        preview: "desktop"
      };

      function snapshot() {
        state.undo.push(JSON.stringify(state.blocks));
        if (state.undo.length > 40) state.undo.shift();
      }

      function toast(msg) {
        var el = document.createElement("div");
        el.className = "emp-toast";
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 1800);
      }

      function collectSettings() {
        var f = root.querySelector(".emp-settings");
        return {
          title: f.querySelector("[name=title]").value,
          excerpt: f.querySelector("[name=excerpt]").value,
          slug: f.querySelector("[name=slug]").value,
          authorName: f.querySelector("[name=authorName]").value,
          authorTitle: f.querySelector("[name=authorTitle]").value,
          authorBio: f.querySelector("[name=authorBio]").value,
          seoTitle: f.querySelector("[name=seoTitle]").value,
          seoDescription: f.querySelector("[name=seoDescription]").value,
          featuredMediaId: f.querySelector("[name=featuredMediaId]").value,
          template: post.template
        };
      }

      function collectBlocks() {
        return state.blocks;
      }

      async function saveDraft() {
        var payload = Object.assign(collectSettings(), { blocks: collectBlocks() });
        var updated = await api.save(post.id, payload);
        state.post = updated.post;
        state.dirty = false;
        toast("Draft saved");
        return updated.post;
      }

      function render() {
        root.innerHTML =
          '<div class="emp-actions">' +
          '<button type="button" class="btn" data-act="save">Save draft</button>' +
          '<button type="button" class="btn btn-ghost" data-act="undo">Undo</button>' +
          '<button type="button" class="btn btn-ghost" data-act="preview-desktop">Desktop preview</button>' +
          '<button type="button" class="btn btn-ghost" data-act="preview-mobile">Mobile preview</button>' +
          '<button type="button" class="btn btn--gold" data-act="publish">Publish</button>' +
          '<button type="button" class="btn btn-ghost" data-act="schedule">Schedule</button>' +
          '<button type="button" class="btn btn-ghost" data-act="unpublish">Unpublish</button>' +
          '<button type="button" class="btn btn-ghost" data-act="archive">Archive</button>' +
          '<input type="datetime-local" name="when" aria-label="Schedule time">' +
          "</div>" +
          '<p class="emp-note">Status: <span class="emp-status">' +
          (state.post.status || "draft") +
          "</span> · Autosave keeps a draft. Previews do not count as public views.</p>" +
          '<div class="emp-editor">' +
          '<aside class="emp-palette"><h3>Add</h3>' +
          Object.keys(BLOCK_LABELS)
            .map(function (type) {
              return '<button type="button" data-add="' + type + '">' + BLOCK_LABELS[type] + "</button>";
            })
            .join("") +
          '<label class="emp-drop">Upload images<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-upload-files></label>' +
          '<div class="emp-drop" data-drop-files>Or drop images here</div></aside>' +
          '<section class="emp-canvas" id="emp-canvas"></section>' +
          '<aside class="emp-settings"><h3>Article details</h3>' +
          field("Title", "title", state.post.title) +
          field("Excerpt", "excerpt", state.post.excerpt, true) +
          field("URL slug", "slug", state.post.slug) +
          field("Author", "authorName", state.post.authorName) +
          field("Author title", "authorTitle", state.post.authorTitle) +
          field("Author bio", "authorBio", state.post.authorBio, true) +
          field("Featured image ID", "featuredMediaId", state.post.featuredMediaId || "") +
          field("SEO title", "seoTitle", state.post.seoTitle) +
          field("SEO description", "seoDescription", state.post.seoDescription, true) +
          '<p class="emp-note">Template: ' +
          (state.post.template || "") +
          "</p></aside></div>" +
          '<div id="emp-preview-wrap" hidden><iframe class="emp-preview-frame" title="Preview"></iframe></div>';
        drawCanvas();
      }

      function field(label, name, value, area) {
        return (
          "<label>" +
          label +
          (area
            ? '<textarea name="' + name + '" rows="3">' + esc(value) + "</textarea>"
            : '<input name="' + name + '" value="' + esc(value) + '">') +
          "</label>"
        );
      }

      function esc(v) {
        return String(v || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/"/g, "&quot;");
      }

      function drawCanvas() {
        var canvas = root.querySelector("#emp-canvas");
        canvas.innerHTML = state.blocks.map(blockHtml).join("") || "<p class='emp-note'>Add blocks from the left.</p>";
        canvas.querySelectorAll(".emp-block").forEach(bindBlock);
      }

      function blockHtml(block, index) {
        return (
          '<div class="emp-block" draggable="true" data-id="' +
          block.id +
          '"><div class="emp-block__tools">' +
          "<strong>" +
          BLOCK_LABELS[block.type] +
          "</strong>" +
          '<button type="button" data-up="' + index + '">Up</button>' +
          '<button type="button" data-down="' + index + '">Down</button>' +
          '<button type="button" data-del="' + index + '">Delete</button></div>' +
          innerFields(block) +
          "</div>"
        );
      }

      function innerFields(block) {
        var d = block.data;
        if (block.type === "heading" || block.type === "subheading") {
          return '<div contenteditable="true" data-k="text">' + esc(d.text) + "</div>";
        }
        if (block.type === "paragraph" || block.type === "tip") {
          return (
            (block.type === "tip" ? '<input data-k="title" value="' + esc(d.title) + '">' : "") +
            '<div contenteditable="true" data-k="html">' +
            (d.html || "") +
            "</div>"
          );
        }
        if (block.type === "image" || block.type === "authorCard") {
          return (
            '<input data-k="mediaId" placeholder="Image ID" value="' +
            esc(d.mediaId) +
            '">' +
            (block.type === "authorCard"
              ? '<input data-k="name" placeholder="Name" value="' +
                esc(d.name) +
                '"><input data-k="title" placeholder="Title" value="' +
                esc(d.title) +
                '"><textarea data-k="bio">' +
                esc(d.bio) +
                "</textarea>"
              : '<input data-k="alt" placeholder="Alt text" value="' +
                esc(d.alt) +
                '"><input data-k="caption" placeholder="Caption" value="' +
                esc(d.caption) +
                '">') +
            (d.mediaId ? '<img src="/media/' + esc(d.mediaId) + '" alt="" style="max-width:100%;margin-top:.5rem">' : "")
          );
        }
        if (block.type === "quote" || block.type === "pullquote") {
          return '<textarea data-k="text">' + esc(d.text) + '</textarea><input data-k="citation" value="' + esc(d.citation) + '">';
        }
        if (block.type === "list") {
          return '<textarea data-k="items">' + esc((d.items || []).join("\n")) + "</textarea>";
        }
        if (block.type === "stats" || block.type === "chart") {
          return (
            (block.type === "chart" ? '<input data-k="title" value="' + esc(d.title) + '">' : "") +
            '<textarea data-k="pairs">' +
            esc((d.items || []).map(function (i) { return i.label + "|" + i.value; }).join("\n")) +
            "</textarea>"
          );
        }
        if (block.type === "gallery") {
          return '<p class="emp-note">One image ID per line: id|alt|caption</p><textarea data-k="gallery">' +
            esc((d.items || []).map(function (i) { return [i.mediaId, i.alt, i.caption].join("|"); }).join("\n")) +
            "</textarea>";
        }
        if (block.type === "propertyDetails") {
          return ["name", "address", "price", "beds", "baths", "sqft"]
            .map(function (k) {
              return '<input data-k="' + k + '" placeholder="' + k + '" value="' + esc(d[k]) + '">';
            })
            .join("") + '<textarea data-k="details">' + esc(d.details) + "</textarea>";
        }
        if (block.type === "spacer") {
          return '<select data-k="size"><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select>';
        }
        return "";
      }

      function readBlockEl(el) {
        var id = el.getAttribute("data-id");
        var block = state.blocks.find(function (b) { return b.id === id; });
        if (!block) return;
        el.querySelectorAll("[data-k]").forEach(function (field) {
          var k = field.getAttribute("data-k");
          var val = field.value != null && field.tagName !== "DIV" ? field.value : field.innerHTML;
          if (k === "items") block.data.items = String(val).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
          else if (k === "pairs") {
            block.data.items = String(val).split("\n").map(function (line) {
              var p = line.split("|");
              return { label: (p[0] || "").trim(), value: (p[1] || "").trim() };
            }).filter(function (i) { return i.label || i.value; });
          } else if (k === "gallery") {
            block.data.items = String(val).split("\n").map(function (line) {
              var p = line.split("|");
              return { mediaId: (p[0] || "").trim(), alt: (p[1] || "").trim(), caption: (p[2] || "").trim() };
            }).filter(function (i) { return i.mediaId; });
          } else if (k === "html" || (field.getAttribute("contenteditable") && k === "text")) {
            block.data[k] = field.getAttribute("contenteditable") && k === "text" ? field.textContent : field.innerHTML;
          } else {
            block.data[k] = val;
          }
        });
      }

      function syncAll() {
        root.querySelectorAll(".emp-block").forEach(readBlockEl);
      }

      function bindBlock(el) {
        el.addEventListener("dragstart", function () {
          el.classList.add("is-dragging");
          state.dragId = el.getAttribute("data-id");
        });
        el.addEventListener("dragend", function () { el.classList.remove("is-dragging"); });
        el.addEventListener("dragover", function (ev) { ev.preventDefault(); });
        el.addEventListener("drop", function (ev) {
          ev.preventDefault();
          if (!state.dragId) return;
          snapshot();
          var from = state.blocks.findIndex(function (b) { return b.id === state.dragId; });
          var to = state.blocks.findIndex(function (b) { return b.id === el.getAttribute("data-id"); });
          if (from < 0 || to < 0) return;
          var moved = state.blocks.splice(from, 1)[0];
          state.blocks.splice(to, 0, moved);
          state.dirty = true;
          drawCanvas();
        });
      }

      root.addEventListener("click", async function (e) {
        var add = e.target.getAttribute("data-add");
        if (add) {
          snapshot();
          state.blocks.push({ id: uid(), type: add, data: emptyData(add) });
          state.dirty = true;
          drawCanvas();
          return;
        }
        if (e.target.hasAttribute("data-del")) {
          snapshot();
          state.blocks.splice(Number(e.target.getAttribute("data-del")), 1);
          state.dirty = true;
          drawCanvas();
          return;
        }
        if (e.target.hasAttribute("data-up") || e.target.hasAttribute("data-down")) {
          snapshot();
          var i = Number(e.target.getAttribute("data-up") || e.target.getAttribute("data-down"));
          var j = e.target.hasAttribute("data-up") ? i - 1 : i + 1;
          if (j < 0 || j >= state.blocks.length) return;
          var tmp = state.blocks[i];
          state.blocks[i] = state.blocks[j];
          state.blocks[j] = tmp;
          state.dirty = true;
          drawCanvas();
          return;
        }
        var act = e.target.getAttribute("data-act");
        if (!act) return;
        syncAll();
        if (act === "save") await saveDraft();
        if (act === "undo") {
          var prev = state.undo.pop();
          if (prev) {
            state.blocks = JSON.parse(prev);
            drawCanvas();
          }
        }
        if (act === "publish") {
          await saveDraft();
          await api.publish(post.id);
          toast("Published");
          location.hash = "#/published";
        }
        if (act === "schedule") {
          var when = root.querySelector("[name=when]").value;
          if (!when) return toast("Choose a future date and time");
          await saveDraft();
          await api.schedule(post.id, new Date(when).toISOString());
          toast("Scheduled");
          location.hash = "#/scheduled";
        }
        if (act === "unpublish") {
          await saveDraft();
          await api.unpublish(post.id);
          toast("Unpublished");
          location.hash = "#/drafts";
        }
        if (act === "archive") {
          await saveDraft();
          await api.archive(post.id);
          toast("Archived");
          location.hash = "#/posts";
        }
        if (act === "preview-desktop" || act === "preview-mobile") {
          await saveDraft();
          var wrap = root.querySelector("#emp-preview-wrap");
          var frame = wrap.querySelector("iframe");
          wrap.hidden = false;
          frame.classList.toggle("is-mobile", act === "preview-mobile");
          frame.src = "/blog/" + encodeURIComponent(state.post.slug) + "?preview=1";
        }
      });

      root.addEventListener("input", function () {
        state.dirty = true;
        syncAll();
      });

      root.addEventListener("dragover", function (e) {
        if ([].some.call(e.dataTransfer.types, function (t) { return t === "Files"; })) e.preventDefault();
      });
      async function addImageFiles(fileList) {
        if (!fileList || !fileList.length) return;
        snapshot();
        for (var i = 0; i < fileList.length; i++) {
          if (!fileList[i].type || fileList[i].type.indexOf("image/") !== 0) continue;
          var media = await api.upload(fileList[i]);
          state.blocks.push({
            id: uid(),
            type: "image",
            data: { mediaId: media.id, alt: "", caption: "" }
          });
        }
        state.dirty = true;
        drawCanvas();
      }

      root.addEventListener("change", function (e) {
        if (e.target && e.target.getAttribute("data-upload-files") != null) {
          addImageFiles(e.target.files).catch(function () {});
          e.target.value = "";
        }
      });
      root.addEventListener("drop", async function (e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        e.preventDefault();
        await addImageFiles(files);
      });

      setInterval(function () {
        if (state.dirty) saveDraft().catch(function () {});
      }, 12000);

      render();
    }
  };
})(window);
