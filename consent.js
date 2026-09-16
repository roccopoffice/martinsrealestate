/**
 * Martins & Associates — cookie / advertising consent.
 *
 * Tracking IDs stay empty until you add Google Analytics or the Meta Pixel.
 * Scripts never load unless the visitor accepts that category (and, for
 * advertising, their browser is not sending Global Privacy Control).
 *
 * Fill these in when you are ready:
 *   window.MARTINS_TRACKING.ga4MeasurementId = "G-XXXXXXXX";
 *   window.MARTINS_TRACKING.metaPixelId = "1234567890";
 */
(function () {
  "use strict";

  window.MARTINS_TRACKING = window.MARTINS_TRACKING || {
    ga4MeasurementId: "",
    metaPixelId: ""
  };

  var STORAGE_KEY = "martins_consent";
  var gaLoaded = false;
  var metaLoaded = false;

  function t(key, fallback) {
    if (window.MartinsI18n && typeof window.MartinsI18n.t === "function") {
      var value = window.MartinsI18n.t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  function hasGpc() {
    try {
      return navigator.globalPrivacyControl === true;
    } catch (e) {
      return false;
    }
  }

  function defaultConsent() {
    return {
      necessary: true,
      analytics: false,
      advertising: false,
      ts: Date.now()
    };
  }

  function readConsent() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        necessary: true,
        analytics: !!parsed.analytics,
        advertising: !!parsed.advertising,
        ts: parsed.ts || Date.now()
      };
    } catch (e) {
      return null;
    }
  }

  function writeConsent(consent) {
    var next = {
      necessary: true,
      analytics: !!consent.analytics,
      advertising: hasGpc() ? false : !!consent.advertising,
      ts: Date.now()
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      /* ignore */
    }
    return next;
  }

  function applyGtagConsent(consent) {
    if (typeof window.gtag !== "function") return;
    window.gtag("consent", "update", {
      analytics_storage: consent.analytics ? "granted" : "denied",
      ad_storage: consent.advertising ? "granted" : "denied",
      ad_user_data: consent.advertising ? "granted" : "denied",
      ad_personalization: consent.advertising ? "granted" : "denied"
    });
  }

  function ensureConsentModeDefaults() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
    }
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      wait_for_update: 500
    });
  }

  function loadGoogleAnalytics(id) {
    if (!id || gaLoaded) return;
    gaLoaded = true;
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(script);
    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true });
  }

  function loadMetaPixel(id) {
    if (!id || metaLoaded) return;
    metaLoaded = true;
    if (!window.fbq) {
      var n = (window.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      var script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }
    window.fbq("consent", "grant");
    window.fbq("init", id);
    window.fbq("track", "PageView");
  }

  function revokeMeta() {
    if (typeof window.fbq === "function") {
      window.fbq("consent", "revoke");
    }
  }

  function applyTracking(consent) {
    var ids = window.MARTINS_TRACKING || {};
    ensureConsentModeDefaults();
    applyGtagConsent(consent);
    if (consent.analytics) {
      loadGoogleAnalytics(String(ids.ga4MeasurementId || "").trim());
    }
    if (consent.advertising) {
      loadMetaPixel(String(ids.metaPixelId || "").trim());
    } else {
      revokeMeta();
    }
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function applyI18n(root) {
    if (window.MartinsI18n && typeof window.MartinsI18n.apply === "function") {
      window.MartinsI18n.apply(root);
    }
  }

  function syncToggles(consent) {
    var analytics = document.getElementById("consent-analytics");
    var advertising = document.getElementById("consent-advertising");
    if (analytics) analytics.checked = !!consent.analytics;
    if (advertising) {
      advertising.checked = !!consent.advertising;
      advertising.disabled = hasGpc();
    }
    var gpcNote = document.getElementById("consent-gpc-note");
    if (gpcNote) gpcNote.hidden = !hasGpc();
  }

  function setBannerOpen(open) {
    var banner = document.getElementById("cookie-banner");
    if (!banner) return;
    banner.hidden = !open;
    banner.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("cookie-banner-open", open);
  }

  function setPanelOpen(open) {
    var panel = document.getElementById("cookie-settings");
    if (!panel) return;
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("cookie-settings-open", open);
    if (open) {
      var first = panel.querySelector("button, input, a");
      if (first) first.focus();
    }
  }

  function injectUi() {
    if (document.getElementById("cookie-banner")) return;

    var banner = document.createElement("div");
    banner.id = "cookie-banner";
    banner.className = "cookie-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-labelledby", "cookie-banner-title");
    banner.setAttribute("aria-describedby", "cookie-banner-body");
    banner.hidden = true;
    banner.innerHTML =
      '<div class="cookie-banner__inner">' +
      '<p class="cookie-banner__title" id="cookie-banner-title" data-i18n="consent.title">Cookies, ads &amp; analytics</p>' +
      '<p class="cookie-banner__body" id="cookie-banner-body" data-i18n-html="consent.body">We use essential cookies to run this site, including your language choice. With your permission we also use Google Analytics and Meta (Facebook/Instagram) advertising tools to measure traffic and ad performance. Third parties, including Meta, may use cookies, pixels, and similar technologies to collect or receive information from this website and elsewhere on the internet and use that information to provide measurement services and deliver ads. You can accept, reject, or choose categories. See our <a href="privacy.html">Privacy Policy</a>.</p>' +
      '<p class="cookie-banner__gpc" id="consent-gpc-note" hidden data-i18n="consent.gpcNote">Your browser sent a Global Privacy Control signal, so advertising cookies stay off.</p>' +
      '<div class="cookie-banner__actions">' +
      '<button type="button" class="btn btn--gold" data-consent="accept" data-i18n="consent.accept">Accept all</button>' +
      '<button type="button" class="btn btn-ghost" data-consent="reject" data-i18n="consent.reject">Reject non-essential</button>' +
      '<button type="button" class="cookie-banner__link" data-open-cookie-settings data-i18n="consent.settings">Cookie settings</button>' +
      "</div></div>";

    var panel = document.createElement("div");
    panel.id = "cookie-settings";
    panel.className = "cookie-settings";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "cookie-settings-title");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML =
      '<div class="cookie-settings__backdrop" data-close-cookie-settings></div>' +
      '<div class="cookie-settings__panel">' +
      '<button type="button" class="cookie-settings__close" data-close-cookie-settings aria-label="Close" data-i18n-aria="a11y.close">&times;</button>' +
      '<h2 id="cookie-settings-title" data-i18n="consent.settingsTitle">Cookie settings</h2>' +
      '<p data-i18n-html="consent.settingsIntro">Choose which optional cookies to allow. Essential cookies are always on. Details are in our <a href="privacy.html">Privacy Policy</a>.</p>' +
      '<p class="cookie-banner__gpc" id="consent-gpc-note-panel" hidden data-i18n="consent.gpcNote">Your browser sent a Global Privacy Control signal, so advertising cookies stay off.</p>' +
      '<label class="cookie-choice"><span><strong data-i18n="consent.necessary">Essential</strong><small data-i18n="consent.necessaryHelp">Needed for the site to work, including your language preference. Always on.</small></span><input type="checkbox" checked disabled></label>' +
      '<label class="cookie-choice"><span><strong data-i18n="consent.analytics">Analytics</strong><small data-i18n="consent.analyticsHelp">Helps us understand how visitors use the site (Google Analytics, when enabled).</small></span><input id="consent-analytics" type="checkbox"></label>' +
      '<label class="cookie-choice"><span><strong data-i18n="consent.advertising">Advertising</strong><small data-i18n="consent.advertisingHelp">Helps measure Meta and other ads. Includes the Meta Pixel when enabled.</small></span><input id="consent-advertising" type="checkbox"></label>' +
      '<div class="cookie-settings__actions">' +
      '<button type="button" class="btn" data-consent="save" data-i18n="consent.save">Save choices</button>' +
      '<button type="button" class="btn btn-ghost" data-close-cookie-settings data-i18n="consent.close">Close</button>' +
      "</div></div>";

    document.body.appendChild(banner);
    document.body.appendChild(panel);
    applyI18n(banner);
    applyI18n(panel);
  }

  function addFormNotices() {
    var noteHtml = t(
      "form.privacyNote",
      'By sending this form you agree to our <a href="privacy.html">Privacy Policy</a>.'
    );
    document.querySelectorAll("form.contact-form").forEach(function (form) {
      if (form.querySelector(".form-privacy-note")) return;
      var p = document.createElement("p");
      p.className = "form-privacy-note";
      p.setAttribute("data-i18n-html", "form.privacyNote");
      p.innerHTML = noteHtml;
      var submit = form.querySelector('button[type="submit"]');
      if (submit && submit.parentNode === form) {
        form.insertBefore(p, submit);
      } else if (submit) {
        submit.parentNode.insertBefore(p, submit);
      } else {
        form.appendChild(p);
      }
    });
  }

  function bind() {
    document.addEventListener("click", function (e) {
      var openBtn = e.target.closest("[data-open-cookie-settings]");
      if (openBtn) {
        e.preventDefault();
        var current = readConsent() || defaultConsent();
        if (hasGpc()) current.advertising = false;
        syncToggles(current);
        var panelNote = document.getElementById("consent-gpc-note-panel");
        if (panelNote) panelNote.hidden = !hasGpc();
        setPanelOpen(true);
        return;
      }
      if (e.target.closest("[data-close-cookie-settings]")) {
        e.preventDefault();
        setPanelOpen(false);
        return;
      }
      var actionBtn = e.target.closest("[data-consent]");
      if (!actionBtn) return;
      e.preventDefault();
      var action = actionBtn.getAttribute("data-consent");
      var next = readConsent() || defaultConsent();
      if (action === "accept") {
        next.analytics = true;
        next.advertising = !hasGpc();
      } else if (action === "reject") {
        next.analytics = false;
        next.advertising = false;
      } else if (action === "save") {
        var analytics = document.getElementById("consent-analytics");
        var advertising = document.getElementById("consent-advertising");
        next.analytics = !!(analytics && analytics.checked);
        next.advertising = !!(advertising && advertising.checked);
      }
      next = writeConsent(next);
      applyTracking(next);
      setBannerOpen(false);
      setPanelOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      setPanelOpen(false);
    });

    document.addEventListener("martins:langchange", function () {
      var banner = document.getElementById("cookie-banner");
      var panel = document.getElementById("cookie-settings");
      if (banner) applyI18n(banner);
      if (panel) applyI18n(panel);
      document.querySelectorAll(".form-privacy-note").forEach(function (el) {
        applyI18n(el.parentNode || el);
      });
    });
  }

  function init() {
    injectUi();
    addFormNotices();
    bind();
    ensureConsentModeDefaults();
    var stored = readConsent();
    if (stored) {
      if (hasGpc()) stored.advertising = false;
      applyTracking(stored);
      setBannerOpen(false);
    } else {
      applyTracking(defaultConsent());
      setBannerOpen(true);
      syncToggles(defaultConsent());
    }
    var gpcNote = document.getElementById("consent-gpc-note");
    if (gpcNote) gpcNote.hidden = !hasGpc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
