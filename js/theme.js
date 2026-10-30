/* Shared light/dark theme + MAXIMUM THE ULTIMATE branding. */
(function () {
  const KEY = "maximum-theme";
  const root = document.documentElement;
  function apply(theme) {
    const t = theme === "dark" ? "dark" : "light";
    root.dataset.theme = t;
    try { localStorage.setItem(KEY, t); } catch (_) {}
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.textContent = t === "dark" ? "☀️ Terang" : "🌙 Gelap";
      btn.setAttribute("aria-label", t === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap");
      btn.setAttribute("title", t === "dark" ? "Mode terang" : "Mode gelap");
    });
    // Let other scripts (e.g. the D3 charts in analytics.js, which read
    // --ink/--muted/--line/--paper at render time) know the palette
    // changed, so they can redraw instead of staying on stale colors
    // until the next scroll-triggered re-render.
    document.dispatchEvent(new CustomEvent("maximum-theme-change", { detail: { theme: t } }));
  }
  let saved = "light";
  try { saved = localStorage.getItem(KEY) || "light"; } catch (_) {}
  apply(saved);
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    apply(root.dataset.theme === "dark" ? "light" : "dark");
  });
  window.MaximumTheme = { apply };

  // Menu melayang pindah-fitur: dimuat otomatis di halaman fitur (bukan login/menu utama).
  (function () {
    var f = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (f === "login.html" || f === "index.html" || window.__mxAssistive) return;
    if (document.querySelector('script[src*="assistive.js"]')) return;
    var cur = document.currentScript, v = "";
    if (cur && cur.src.indexOf("?") > -1) v = cur.src.slice(cur.src.indexOf("?"));
    var sc = document.createElement("script");
    sc.src = (cur ? cur.src.replace(/theme\.js.*$/, "") : "js/") + "assistive.js" + v;
    document.body.appendChild(sc);
  })();
})();
