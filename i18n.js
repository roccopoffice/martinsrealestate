/**
 * Martins & Associates — i18n engine.
 *
 * Reads window.MARTINS_TRANSLATIONS (defined in i18n/translations.js, which
 * must be loaded before this file) and applies translations to any element
 * carrying a data-i18n* attribute. Persists the chosen language in
 * localStorage under "martins_lang" and keeps document.documentElement.lang
 * in sync.
 *
 * Supported data attributes:
 *   data-i18n              textContent
 *   data-i18n-html         innerHTML (for strings containing <em>/<strong>/<a>)
 *   data-i18n-placeholder  placeholder attribute
 *   data-i18n-aria         aria-label attribute
 *   data-i18n-alt          alt attribute
 *   data-i18n-title        page <title> text + document.title
 *
 * Public API: window.MartinsI18n = { t, apply, setLang, getLang, supportedLangs }
 */
(function () {
  "use strict";

  var STORAGE_KEY = "martins_lang";
  var DEFAULT_LANG = "en";
  var SUPPORTED = ["en", "es", "pt", "ht", "kea", "fr", "zh"];

  function getDict() {
    return window.MARTINS_TRANSLATIONS || {};
  }

  function isSupported(lang) {
    return SUPPORTED.indexOf(lang) !== -1;
  }

  function getStoredLang() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && isSupported(stored)) return stored;
    } catch (e) {
      /* localStorage unavailable (privacy mode, etc.) — ignore */
    }
    return null;
  }

  function storeLang(lang) {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* ignore */
    }
  }

  var currentLang = getStoredLang() || DEFAULT_LANG;

  function lookup(lang, key) {
    var dict = getDict()[lang];
    if (!dict) return undefined;
    var parts = key.split(".");
    var node = dict;
    for (var i = 0; i < parts.length; i++) {
      if (node == null || typeof node !== "object") return undefined;
      node = node[parts[i]];
    }
    return typeof node === "string" ? node : undefined;
  }

  function t(key, lang) {
    if (!key) return "";
    lang = lang || currentLang;
    var value = lookup(lang, key);
    if (value === undefined && lang !== DEFAULT_LANG) {
      value = lookup(DEFAULT_LANG, key);
    }
    if (value === undefined) {
      value = key;
    }
    return value;
  }

  function forEach(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }

  function applyTo(root) {
    root = root || document;
    if (!root.querySelectorAll) return;

    forEach(root.querySelectorAll("[data-i18n]"), function (el) {
      var key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });

    forEach(root.querySelectorAll("[data-i18n-html]"), function (el) {
      var key = el.getAttribute("data-i18n-html");
      if (key) el.innerHTML = t(key);
    });

    forEach(root.querySelectorAll("[data-i18n-placeholder]"), function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (key) el.setAttribute("placeholder", t(key));
    });

    forEach(root.querySelectorAll("[data-i18n-aria]"), function (el) {
      var key = el.getAttribute("data-i18n-aria");
      if (key) el.setAttribute("aria-label", t(key));
    });

    forEach(root.querySelectorAll("[data-i18n-alt]"), function (el) {
      var key = el.getAttribute("data-i18n-alt");
      if (key) el.setAttribute("alt", t(key));
    });

    forEach(root.querySelectorAll("[data-i18n-title]"), function (el) {
      var key = el.getAttribute("data-i18n-title");
      if (!key) return;
      var value = t(key);
      el.textContent = value;
      if (el.tagName === "TITLE") {
        document.title = value;
      }
    });
  }

  function syncLangSelects() {
    forEach(document.querySelectorAll(".lang-select"), function (sel) {
      sel.value = currentLang;
    });
  }

  function dispatchLangChange() {
    var evt;
    try {
      evt = new CustomEvent("martins:langchange", { detail: { lang: currentLang } });
    } catch (e) {
      evt = document.createEvent("Event");
      evt.initEvent("martins:langchange", true, true);
    }
    document.dispatchEvent(evt);
  }

  function setLang(lang) {
    if (!isSupported(lang)) lang = DEFAULT_LANG;
    currentLang = lang;
    storeLang(lang);
    document.documentElement.lang = lang;
    applyTo(document);
    syncLangSelects();
    dispatchLangChange();
  }

  function bindLangSelects() {
    forEach(document.querySelectorAll(".lang-select"), function (sel) {
      if (sel.getAttribute("data-i18n-bound") === "1") return;
      sel.setAttribute("data-i18n-bound", "1");
      sel.addEventListener("change", function () {
        setLang(sel.value);
      });
    });
  }

  function init() {
    document.documentElement.lang = currentLang;
    bindLangSelects();
    applyTo(document);
    syncLangSelects();
    dispatchLangChange();
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(init);

  window.MartinsI18n = {
    t: t,
    apply: applyTo,
    setLang: setLang,
    getLang: function () {
      return currentLang;
    },
    supportedLangs: SUPPORTED.slice()
  };
})();
