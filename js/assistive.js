/* assistive.js — tombol melayang (logo MAXIMUM) untuk pindah antar-fitur tanpa
   kembali ke Menu utama. Bisa digeser (menempel ke tepi kiri/kanan), posisinya
   diingat. Berdiri sendiri: menyuntik CSS & elemennya sendiri, tidak mengubah
   kode halaman lain. */
(function () {
  if (window.__mxAssistive) return; window.__mxAssistive = true;

  var POS_KEY = "maximum-assistive-pos";
  var MARGIN = 12, SIZE = 52;

  // matriks 3x3 per ikon (kecerahan tiap kotak, baris atas dulu) — sama dengan Menu utama
  var ITEMS = [
    { href: "index.html",       name: "Menu utama",  m: [1,1,1, 0,1,1, 1,0,1],            l: "#16161a", d: "#f2f2f4" },
    { href: "input.html",       name: "Input Report", m: [0,1,0, .8,1,.8, 0,.55,0],       l: "#1f8a70", d: "#9fd4ab" },
    { href: "analytics.html",   name: "Analytics",    m: [0,1,0, 0,1,.7, .45,1,.7],       l: "#6b4fa0", d: "#aa9ddb" },
    { href: "budget.html",      name: "Budget",       m: [0,0,1, 0,.75,1, .4,.75,1],      l: "#d4472a", d: "#f2a691" },
    { href: "feasibility.html", name: "Feasibility",  m: [.3,.65,.3, .65,1,.65, .3,.65,.3], l: "#b8860b", d: "#e8ca8d" },
    { href: "vendor.html",      name: "Database",     m: [1,1,1, .6,.6,.6, .3,.3,.3],     l: "#0e7c86", d: "#74bcc4" }
  ];

  function pix(m) {
    var r = "";
    for (var i = 0; i < 9; i++) if (m[i]) {
      r += '<rect x="' + (i % 3) * 9 + '" y="' + Math.floor(i / 3) * 9 + '" width="6" height="6" rx="1"' +
           (m[i] === 1 ? "" : ' opacity="' + m[i] + '"') + "/>";
    }
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + r + "</svg>";
  }

  var file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (file === "login.html") return;

  var css = [
    ".mxa{--a-bg:#fff;--a-ink:#16161a;--a-muted:#6a6a74;--a-line:#dcdce2;--a-hover:rgba(22,22,26,.06);--a-btn:#16161a;--a-btn-ink:#fff;--a-shadow:0 10px 30px rgba(15,23,42,.22);",
    "font-family:\"Instrument Sans\",system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif}",
    "html[data-theme=\"dark\"] .mxa{--a-bg:#131316;--a-ink:#f2f2f4;--a-muted:#9a9aa5;--a-line:#2f2f36;--a-hover:rgba(255,255,255,.07);--a-btn:#f2f2f4;--a-btn-ink:#0a0a0c;--a-shadow:0 12px 32px rgba(0,0,0,.55)}",
    ".mxa-btn{position:fixed;z-index:9000;width:" + SIZE + "px;height:" + SIZE + "px;border-radius:50%;padding:0;display:grid;place-items:center;",
    "background:var(--a-btn);color:var(--a-btn-ink);border:2px solid color-mix(in srgb,var(--a-btn-ink) 22%,var(--a-btn));box-shadow:var(--a-shadow);cursor:grab;",
    "touch-action:none;user-select:none;-webkit-user-select:none;opacity:.88;transition:opacity .2s ease,transform .15s ease}",
    ".mxa-btn:hover,.mxa-btn:focus-visible,.mxa-btn[aria-expanded=\"true\"]{opacity:1}",
    ".mxa-btn:active{cursor:grabbing}",
    ".mxa-btn.snap{transition:left .22s ease,top .22s ease,opacity .2s ease}",
    ".mxa-btn:focus-visible{outline:3px solid #4b8bff;outline-offset:3px}",
    ".mxa-btn svg{width:24px;height:24px;display:block;pointer-events:none}",
    ".mxa-panel{position:fixed;z-index:9001;width:236px;max-width:calc(100vw - 24px);padding:8px;background:var(--a-bg);color:var(--a-ink);",
    "border:1px solid var(--a-line);border-radius:16px;box-shadow:var(--a-shadow);transform-origin:var(--o,100% 100%);animation:mxa-in .16s ease-out}",
    ".mxa-panel[hidden]{display:none}",
    "@keyframes mxa-in{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}",
    ".mxa-head{padding:6px 10px 8px;font-size:.74rem;font-weight:600;color:var(--a-muted)}",
    ".mxa-item{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:10px;text-decoration:none;color:var(--a-ink);font-size:.92rem;font-weight:600;--tc:var(--tl)}",
    "html[data-theme=\"dark\"] .mxa-item{--tc:var(--td)}",
    ".mxa-item svg{width:22px;height:22px;flex:none;color:var(--tc)}",
    ".mxa-item:hover,.mxa-item:focus-visible{background:var(--a-hover);outline:none}",
    ".mxa-item:focus-visible{box-shadow:inset 0 0 0 2px var(--tc)}",
    ".mxa-item[aria-current=\"page\"]{background:color-mix(in srgb,var(--tc) 14%,transparent);cursor:default}",
    ".mxa-item .mxa-here{margin-left:auto;font-size:.7rem;font-weight:600;color:var(--a-muted)}",
    ".mxa-sep{height:1px;margin:6px 4px;background:var(--a-line)}",
    "@media (max-width:600px){.mxa-btn{width:48px;height:48px}.mxa-btn svg{width:22px;height:22px}}",
    "@media (prefers-reduced-motion:reduce){.mxa-panel{animation:none}.mxa-btn,.mxa-btn.snap{transition:none}}",
    "@media print{.mxa{display:none!important}}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var root = document.createElement("div"); root.className = "mxa";
  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "mxa-btn";
  btn.setAttribute("aria-haspopup", "menu"); btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", "Menu pindah fitur"); btn.title = "Pindah fitur";
  btn.innerHTML = pix(ITEMS[0].m);

  var panel = document.createElement("div");
  panel.className = "mxa-panel"; panel.hidden = true; panel.setAttribute("role", "menu");
  var html = '<div class="mxa-head">Pindah fitur</div>';
  ITEMS.forEach(function (it, i) {
    var cur = it.href === file;
    html += '<a class="mxa-item" role="menuitem" href="' + it.href + '" style="--tl:' + it.l + ';--td:' + it.d + '"' +
            (cur ? ' aria-current="page"' : "") + ">" + pix(it.m) + "<span>" + it.name + "</span>" +
            (cur ? '<span class="mxa-here">Di sini</span>' : "") + "</a>";
    if (i === 0) html += '<div class="mxa-sep" role="separator"></div>';
  });
  panel.innerHTML = html;
  root.appendChild(btn); root.appendChild(panel); document.body.appendChild(root);

  // ---- posisi ----
  var pos = { side: "r", y: 0.55 };           // y = rasio tinggi layar
  try { var s = JSON.parse(localStorage.getItem(POS_KEY) || "null"); if (s && (s.side === "l" || s.side === "r")) pos = { side: s.side, y: +s.y || 0.55 }; } catch (_) {}
  function vw() { return document.documentElement.clientWidth; }
  function vh() { return window.innerHeight; }
  function clampY(y) { return Math.max(MARGIN + 56, Math.min(vh() - SIZE - MARGIN - 8, y)); }
  function place(animate) {
    btn.classList.toggle("snap", !!animate);
    btn.style.left = (pos.side === "l" ? MARGIN : vw() - SIZE - MARGIN) + "px";
    btn.style.top = clampY(pos.y * vh()) + "px";
  }
  function save() { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch (_) {} }

  // ---- panel ----
  function openPanel() {
    panel.hidden = false; btn.setAttribute("aria-expanded", "true");
    var b = btn.getBoundingClientRect(), ph = panel.offsetHeight, pw = panel.offsetWidth;
    var left = pos.side === "l" ? b.left : b.right - pw;
    left = Math.max(12, Math.min(vw() - pw - 12, left));
    var below = b.top + b.height / 2 < vh() / 2;
    var top = below ? b.bottom + 10 : b.top - 10 - ph;
    top = Math.max(12, Math.min(vh() - ph - 12, top));
    panel.style.left = left + "px"; panel.style.top = top + "px";
    panel.style.setProperty("--o", (pos.side === "l" ? "0%" : "100%") + " " + (below ? "0%" : "100%"));
    var cur = panel.querySelector("[aria-current]") || panel.querySelector(".mxa-item");
    var first = panel.querySelector(".mxa-item:not([aria-current])");
    (first || cur).focus({ preventScroll: true });
  }
  function closePanel(refocus) {
    if (panel.hidden) return;
    panel.hidden = true; btn.setAttribute("aria-expanded", "false");
    if (refocus) btn.focus({ preventScroll: true });
  }

  // ---- geser vs klik ----
  var drag = null;
  btn.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    var r = btn.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
    btn.setPointerCapture(e.pointerId); btn.classList.remove("snap");
  });
  btn.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    if (!drag.moved) { drag.moved = true; closePanel(false); }
    btn.style.left = Math.max(4, Math.min(vw() - SIZE - 4, e.clientX - drag.dx)) + "px";
    btn.style.top = Math.max(4, Math.min(vh() - SIZE - 4, e.clientY - drag.dy)) + "px";
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var moved = drag.moved; drag = null;
    try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      var r = btn.getBoundingClientRect();
      pos.side = r.left + SIZE / 2 < vw() / 2 ? "l" : "r";
      pos.y = clampY(r.top) / vh();
      place(true); save();
      btn._justDragged = true; setTimeout(function () { btn._justDragged = false; }, 0);
    }
  }
  btn.addEventListener("pointerup", endDrag);
  btn.addEventListener("pointercancel", endDrag);
  btn.addEventListener("click", function () {
    if (btn._justDragged) return;
    panel.hidden ? openPanel() : closePanel(false);
  });

  document.addEventListener("pointerdown", function (e) { if (!panel.hidden && !root.contains(e.target)) closePanel(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { closePanel(true); return; }
    if (panel.hidden || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    var els = Array.prototype.slice.call(panel.querySelectorAll(".mxa-item"));
    var i = els.indexOf(document.activeElement);
    i = e.key === "ArrowDown" ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[i].focus(); e.preventDefault();
  });
  window.addEventListener("resize", function () { closePanel(false); place(false); });

  place(false);
})();
