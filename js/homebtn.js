/* Tombol "Home" kecil untuk halaman mandiri (feasibility.html). */
(function () {
  var wrap = document.querySelector(".wrap"); if (!wrap) return;
  var a = document.createElement("a"); a.href = "index.html"; a.className = "fz-home";
  a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg><span>Home</span>';
  var st = document.createElement("style");
  st.textContent = '.fz-home{display:inline-flex;align-items:center;gap:7px;margin:0 0 14px;padding:7px 12px;border:1px solid #dbe1e7;border-radius:6px;color:#647282;background:transparent;text-decoration:none;font:600 13.5px "Instrument Sans",system-ui,sans-serif}.fz-home:hover{color:#131d27;border-color:#647282}.fz-home svg{width:16px;height:16px}@media print{.fz-home{display:none!important}}';
  document.head.appendChild(st); wrap.insertBefore(a, wrap.firstChild);
})();
