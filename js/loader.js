/* =========================================================================
   loader.js — helper untuk loader "grid fill".

     MaximumLoader.markup("Harap Tunggu")  -> string HTML loader
     MaximumLoader.show("Harap Tunggu")    -> overlay layar penuh
     MaximumLoader.setLabel("Menyimpan…")  -> ganti teks overlay
     MaximumLoader.hide()                  -> tutup overlay (fade out)
     MaximumLoader.mount(el, "Memuat…")    -> pasang loader di dalam elemen

   Elemen dengan atribut [data-mx-loader] otomatis diisi loader saat load,
   dengan label dari isi atributnya.
   ========================================================================= */
(function () {
  var SQUARES = [
    [28, 28], [44, 28], [60, 28],
    [44, 44], [60, 44],
    [28, 60], [60, 60]
  ];

  function markup(label, small) {
    var rects = SQUARES.map(function (p) {
      return '<rect class="mx-sq" x="' + p[0] + '" y="' + p[1] + '" width="14" height="14" rx="1"/>';
    }).join("");
    return (
      '<div class="mx-loader' + (small ? " mx-sm" : "") + '" role="status" aria-live="polite">' +
        '<svg class="mx-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<circle class="mx-circle" cx="50" cy="50" r="48"/>' + rects +
        "</svg>" +
        '<div class="mx-label">' + (label || "Harap Tunggu") + "</div>" +
      "</div>"
    );
  }

  var overlayEl = null;

  function show(label) {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.className = "mx-overlay";
      document.body.appendChild(overlayEl);
    }
    overlayEl.innerHTML = markup(label);
    overlayEl.classList.remove("mx-hiding");
    return overlayEl;
  }

  function setLabel(label) {
    if (!overlayEl) return show(label);
    var el = overlayEl.querySelector(".mx-label");
    if (el) el.textContent = label;
    return overlayEl;
  }

  function hide() {
    if (!overlayEl) return;
    var el = overlayEl;
    overlayEl = null;
    el.classList.add("mx-hiding");
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 260);
  }

  function mount(target, label, small) {
    var el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) return null;
    el.innerHTML = markup(label, small);
    return el;
  }

  window.MaximumLoader = { markup: markup, show: show, setLabel: setLabel, hide: hide, mount: mount };

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-mx-loader]").forEach(function (el) {
      mount(el, el.getAttribute("data-mx-loader") || "Harap Tunggu", el.hasAttribute("data-mx-small"));
    });
  });
})();
