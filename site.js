/**
 * Martins & Associates — shared UI: mobile nav, lead form prefill (Book page).
 */
(function () {
  "use strict";

  /* Listings index: ensure anchor targets (#featured-listings) clear the sticky header */
  if (document.body.classList.contains("page-listings")) {
    document.documentElement.style.scrollPaddingTop = "5.5rem";
  }

  var toggle = document.getElementById("nav-toggle");
  var mobile = document.getElementById("nav-mobile");
  if (toggle && mobile) {
    function setNavOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      mobile.classList.toggle("open", open);
      document.body.classList.toggle("nav-open", open);
    }

    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      setNavOpen(!open);
    });

    mobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        setNavOpen(false);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (mobile.classList.contains("open")) {
        setNavOpen(false);
        toggle.focus();
      }
    });
  }

  var listingModal = document.getElementById("listing-contact-modal");
  function closeListingModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }
  function openListingModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("is-open");
    modalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var first = modalEl.querySelector("input:not([type=\"hidden\"]), textarea, button[type=\"submit\"]");
    if (first) first.focus();
  }
  if (listingModal) {
    document.querySelectorAll('[data-modal-open="listing-contact"]').forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (el.tagName === "A") e.preventDefault();
        openListingModal(listingModal);
      });
    });
    listingModal.querySelectorAll("[data-modal-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        closeListingModal(listingModal);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (listingModal.classList.contains("is-open")) {
        closeListingModal(listingModal);
      }
    });
  }

  document.querySelectorAll('form[action*="formsubmit.co"]').forEach(function (formEl) {
    if (!formEl.querySelector('input[name="_next"]')) {
      var next = document.createElement("input");
      next.type = "hidden";
      next.name = "_next";
      next.value = window.location.origin + window.location.pathname + "?sent=1";
      formEl.appendChild(next);
    }
    if (!formEl.querySelector('input[name="_captcha"]')) {
      var captcha = document.createElement("input");
      captcha.type = "hidden";
      captcha.name = "_captcha";
      captcha.value = "false";
      formEl.appendChild(captcha);
    }
  });

  var params = new URLSearchParams(window.location.search);
  if (params.get("sent") === "1") {
    var success = document.getElementById("form-success");
    if (success) {
      success.hidden = false;
      success.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (listingModal) {
      openListingModal(listingModal);
    }
  }

  var form = document.getElementById("lead-form");
  var select = document.getElementById("service");
  if (form && select) {
    var svcParam = params.get("service");
    if (svcParam) {
      var allowed = ["showings", "general"];
      if (allowed.indexOf(svcParam) !== -1) {
        select.value = svcParam;
      }
    }
    document.querySelectorAll("[data-prefill]").forEach(function (link) {
      link.addEventListener("click", function () {
        var v = link.getAttribute("data-prefill");
        if (v) {
          select.value = v;
        }
      });
    });
  }
})();
