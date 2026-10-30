/* =========================================================================
   vendor-flyout.js — flyout (submenu) di samping baris vendor pada dropdown
   vendor, dipakai Input Report (combobox.js) dan Budget (budget.html).

   Setiap vendor yang punya harga di database menampilkan tanda "›". Arahkan
   kursor ke baris vendor (atau ketuk "›", atau tekan → dari papan ketik) →
   flyout berisi semua opsi harga vendor itu muncul; tinggal klik yang sesuai.
   Klik pada baris vendor itu sendiri tetap memilih harga termurah / yang
   sesuai seperti sebelumnya.

   API:
     VendorFlyout.bind(li, { choices: () => [...], onPick: (choice) => {} })
       choice = { label, sub?, right?, match?, header?, data? }
                header:true  -> judul kelompok (tidak bisa diklik)
                match:true   -> opsi yang cocok dengan isian saat ini (disorot)
     VendorFlyout.close()        tutup flyout
     VendorFlyout.contains(node) apakah node berada di dalam flyout
     VendorFlyout.handleKey(e)   navigasi papan ketik saat flyout dibuka
                                 dengan keyboard; true bila tombol dipakai
   ========================================================================= */
(function () {
  let fly = null, curLi = null, openT = 0, closeT = 0, kbIdx = -1, curPick = null;

  function ensure() {
    if (fly) return fly;
    fly = document.createElement("ul");
    fly.className = "vfly";
    fly.hidden = true;
    fly.setAttribute("role", "menu");
    fly.addEventListener("mouseenter", () => clearTimeout(closeT));
    fly.addEventListener("mouseleave", schedClose);
    fly.addEventListener("mousedown", (e) => e.preventDefault()); // fokus input jangan hilang
    document.body.appendChild(fly);
    // menggulir halaman / mengubah ukuran jendela menutup flyout (menggulir isi flyout tidak)
    window.addEventListener("scroll", (e) => { if (fly.hidden || (e.target !== document && fly.contains(e.target))) return; close(); }, true);
    window.addEventListener("resize", () => close());
    return fly;
  }

  function schedClose() { clearTimeout(closeT); closeT = setTimeout(close, 160); }

  function close() {
    clearTimeout(openT); clearTimeout(closeT);
    if (!fly || fly.hidden) { curLi = null; kbIdx = -1; return; }
    fly.hidden = true; fly.textContent = "";
    if (curLi) curLi.classList.remove("vfly-open");
    curLi = null; kbIdx = -1; curPick = null;
  }

  const rowEls = () => (fly ? [...fly.querySelectorAll("li.vfly-row")] : []);
  function markKb() {
    rowEls().forEach((el, i) => el.classList.toggle("kb", i === kbIdx));
    const el = rowEls()[kbIdx]; if (el) el.scrollIntoView({ block: "nearest" });
  }

  function render(items, onPick) {
    fly.textContent = "";
    items.forEach((c) => {
      const li = document.createElement("li");
      if (c.header) { li.className = "vfly-head"; li.textContent = c.label; fly.appendChild(li); return; }
      li.className = "vfly-row" + (c.match ? " match" : "");
      li.setAttribute("role", "menuitem");
      const main = document.createElement("span");
      main.className = "vfly-main";
      main.appendChild(document.createTextNode(c.label));
      if (c.match) { const em = document.createElement("em"); em.textContent = "sesuai"; main.appendChild(em); }
      if (c.sub) { const s = document.createElement("small"); s.textContent = c.sub; main.appendChild(s); }
      li.appendChild(main);
      if (c.right) { const b = document.createElement("b"); b.textContent = c.right; li.appendChild(b); }
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const cb = onPick; close(); if (cb) cb(c);
      });
      fly.appendChild(li);
    });
  }

  function place(li) {
    const host = li.parentElement || li;
    const hr = host.getBoundingClientRect(), r = li.getBoundingClientRect();
    fly.style.visibility = "hidden"; fly.hidden = false;
    const w = fly.offsetWidth, h = fly.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let left, top;
    if (hr.right + 4 + w <= vw - 8) { left = hr.right + 4; top = Math.min(r.top, vh - h - 8); }
    else if (hr.left - 4 - w >= 8) { left = hr.left - 4 - w; top = Math.min(r.top, vh - h - 8); }
    else {                                   // layar sempit: tampil tepat di bawah (atau di atas) baris
      left = Math.max(8, Math.min(r.left, vw - w - 8));
      top = r.bottom + 2 + h <= vh - 8 ? r.bottom + 2 : Math.max(8, r.top - h - 2);
    }
    fly.style.left = left + "px"; fly.style.top = Math.max(8, top) + "px";
    fly.style.visibility = "";
  }

  function open(li, items, onPick, fromKeyboard) {
    ensure(); clearTimeout(closeT); clearTimeout(openT);
    if (curLi && curLi !== li) curLi.classList.remove("vfly-open");
    curLi = li; curPick = onPick; li.classList.add("vfly-open");
    render(items, onPick); place(li);
    const rows = rowEls();
    kbIdx = fromKeyboard ? Math.max(0, rows.findIndex((el) => el.classList.contains("match"))) : -1;
    if (fromKeyboard) markKb();
    else { const m = fly.querySelector(".vfly-row.match"); if (m) m.scrollIntoView({ block: "nearest" }); }
  }

  function bind(li, { choices, onPick }) {
    const items = (typeof choices === "function" ? choices() : choices) || [];
    if (!items.some((c) => !c.header)) return false;           // vendor tanpa harga di database: tanpa flyout
    li.classList.add("has-fly");
    const chev = document.createElement("span");
    chev.className = "vfly-chev"; chev.textContent = "›";
    chev.setAttribute("aria-hidden", "true"); chev.title = "Lihat pilihan harga vendor ini";
    li.appendChild(chev);
    li.setAttribute("aria-haspopup", "menu");
    li.addEventListener("mouseenter", () => {
      clearTimeout(closeT); clearTimeout(openT);
      openT = setTimeout(() => open(li, items, onPick, false), 90);
    });
    li.addEventListener("mouseleave", () => { clearTimeout(openT); schedClose(); });
    // ketuk "›" (layar sentuh) membuka / menutup flyout tanpa memilih vendor
    chev.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (curLi === li && fly && !fly.hidden) close(); else open(li, items, onPick, false);
    });
    li._vfly = { open: () => open(li, items, onPick, true) };
    return true;
  }

  function handleKey(e) {
    if (!fly || fly.hidden || kbIdx < 0) return false;
    const rows = rowEls(); if (!rows.length) return false;
    if (e.key === "ArrowDown") { kbIdx = (kbIdx + 1) % rows.length; markKb(); return true; }
    if (e.key === "ArrowUp") { kbIdx = (kbIdx - 1 + rows.length) % rows.length; markKb(); return true; }
    if (e.key === "ArrowLeft" || e.key === "Escape") { close(); return true; }
    if (e.key === "Enter" || e.key === "Tab") {
      const el = rows[kbIdx]; if (!el) return false;
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      return true;
    }
    return false;
  }

  window.VendorFlyout = { bind, close, handleKey, contains: (n) => !!(fly && n && fly.contains(n)) };
})();
