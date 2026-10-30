/* =========================================================================
   input-sheet.js — pelengkap Input Report gaya Feasibility:
   rumus Excel (= + - x /), navigasi panah/Enter antar sel, total langsung,
   harga otomatis dari database (per kombinasi Day + GR, atau per hari bila
   kombinasinya tidak ada), dan dialog Daftar Event.
   Dimuat SEBELUM input.js; hanya memakai DOM + window.InputPrice / SheetCalc.
   ========================================================================= */
(function () {
  const $ = (id) => document.getElementById(id);
  const cont = $("items-container");
  const canon = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const r0 = (n) => Math.round(n);

  /* ---------- kalkulator rumus (tanpa eval) ---------- */
  function evalExpr(src) {
    // titik ribuan (5.000.000) dibuang dulu; koma = desimal
    const s = String(src).replace(/\s+/g, "").replace(/[x×]/gi, "*").replace(/\d{1,3}(?:\.\d{3})+(?!\d)/g, (m) => m.replace(/\./g, "")).replace(/,/g, ".");
    if (!s || !/^[0-9+\-*/().]+$/.test(s)) return null;
    let i = 0;
    function expr() { let v = term(); while (s[i] === "+" || s[i] === "-") { const o = s[i++]; const r = term(); v = o === "+" ? v + r : v - r; } return v; }
    function term() { let v = unary(); while (s[i] === "*" || s[i] === "/") { const o = s[i++]; const r = unary(); if (o === "/") { if (r === 0) throw 0; v /= r; } else v *= r; } return v; }
    function unary() { if (s[i] === "-") { i++; return -unary(); } if (s[i] === "+") { i++; return unary(); } return prim(); }
    function prim() {
      if (s[i] === "(") { i++; const v = expr(); if (s[i] !== ")") throw 0; i++; return v; }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) throw 0;
      i += m[0].length; return parseFloat(m[0]);
    }
    try { const v = expr(); return i === s.length && isFinite(v) ? v : null; } catch (e) { return null; }
  }
  window.SheetCalc = { evalExpr };
  function valueOf(inp) {   /* angka dari sel Rupiah: rumus bila diawali "=", selain itu digit saja */
    if (!inp) return 0;
    const v = inp.value.trim();
    if (/[=+*\/x×()\-]/i.test(v)) { const r = evalExpr(v.replace(/^=/, "")); return r === null || r < 0 ? 0 : r0(r); }
    const d = v.replace(/\D/g, ""); return d ? Number(d) : 0;
  }

  /* ---------- database harga (Google Sheets, sama dengan halaman Database) ---------- */
  const SS = { id: "1X03xTnUsCz-QOWNeIXfTKhdMO1eaVDNmqBuIClHnAWk", key: "AIzaSyAGQc7xZgCkRqsE_WtPwZSR2_2xGemYaGQ" };
  const COMBO = /^(\d+)\s*day\s*\+\s*(\d+)\s*gr$/;
  const DB = { ready: false, rows: [], combos: {}, items: new Map() };
  async function fetchDb() {
    const base = "https://sheets.googleapis.com/v4/spreadsheets/" + SS.id;
    const mr = await fetch(base + "?key=" + SS.key + "&fields=sheets.properties");
    if (!mr.ok) throw new Error("HTTP " + mr.status);
    const sheets = ((await mr.json()).sheets || []).map((s) => s.properties);
    const q = sheets.map((s) => "ranges=" + encodeURIComponent(s.title)).join("&");
    const vr = await fetch(base + "/values:batchGet?key=" + SS.key + "&" + q + "&valueRenderOption=UNFORMATTED_VALUE");
    if (!vr.ok) throw new Error("HTTP " + vr.status);
    const rows = [], combos = {};
    ((await vr.json()).valueRanges || []).forEach((rng, si) => {
      const vals = rng.values || []; if (vals.length < 2) return;
      let hi = -1, head = [];
      for (let i = 0; i < Math.min(6, vals.length) && hi < 0; i++) {
        const n = vals[i].map((c) => String(c || "").trim().toLowerCase());
        if (n.includes("item id") && n.includes("vendor") && n.some((c) => COMBO.test(c))) { hi = i; head = n; }
      }
      if (hi < 0) return;
      const col = { cb: {} };
      head.forEach((c, i) => {
        if (c === "nama item") col.item = i; else if (c === "vendor") col.vendor = i; else if (c === "quantity") col.qty = i;
        else { const m = c.match(COMBO); if (m) { col.cb[m[1] + "_" + m[2]] = i; combos[m[1] + "_" + m[2]] = { e: +m[1], g: +m[2] }; } }
      });
      if (col.item === undefined || col.vendor === undefined) return;
      for (let r = hi + 1; r < vals.length; r++) {
        const row = vals[r]; if (!row[col.item]) continue;
        const cp = {}; let any = false;
        Object.keys(col.cb).forEach((k) => { const v = row[col.cb[k]]; if (v !== "" && v != null && !isNaN(Number(v))) { cp[k] = Number(v); any = true; } });
        if (!any) continue;
        rows.push({ id: sheets[si].sheetId + ":" + r, item: String(row[col.item]).trim(), vendor: row[col.vendor] ? String(row[col.vendor]).trim() : "", combos: cp });
      }
    });
    return { rows, combos };
  }
  (window.MxDatabase ? window.MxDatabase.load() : fetchDb()).then((res) => {
    DB.rows = res.rows; DB.combos = res.combos;
    res.rows.forEach((o) => { const k = canon(o.item); if (!DB.items.has(k)) DB.items.set(k, []); DB.items.get(k).push(o); });
    DB.ready = true;
    repriceAll();
  }).catch((e) => { console.warn("[input-sheet] database harga gagal dimuat:", e); });

  /* ---------- hari event & GR ---------- */
  function dayInfo() {
    const s = $("f-date-start").value, en = $("f-date-end").value, g = $("f-gr").value;
    let e = null;
    if (s && en) { const d = Math.round((new Date(en) - new Date(s)) / 86400000) + 1; if (d >= 1) e = d; }
    const gr = g !== "" && Number(g) >= 0 ? Math.floor(Number(g)) : null;
    return { e, g: gr };
  }
  /* harga satu penawaran: kombinasi persis -> harga database; kalau tidak ada -> harga per hari x (day + GR) */
  function priceOf(o, e, g) {
    const keys = Object.keys(o.combos); if (!keys.length) return null;
    const k = e + "_" + g;
    if (o.combos[k] !== undefined) return { price: r0(o.combos[k]), src: "db", note: "Database: " + e + " Day + " + g + " GR" };
    let rate = null;
    if (o.combos["1_0"] !== undefined) rate = o.combos["1_0"];
    else {
      let best = null;
      keys.forEach((c) => { const m = DB.combos[c]; if (m && m.e + m.g > 0 && (!best || m.e + m.g < best.n)) best = { n: m.e + m.g, p: o.combos[c] }; });
      if (best) rate = best.p / best.n;
    }
    if (rate === null) return null;
    const n = e + g;
    return { price: r0(rate * n), src: "perday", note: "Kombinasi " + e + " Day + " + g + " GR tidak ada di database: Rp " + nf.format(r0(rate)) + " per hari x " + n + " hari" };
  }
  const blockParts = (b) => ({
    name: b.querySelector('[data-name="itemName"]'), vendor: b.querySelector('[data-name="vendor"]'),
    price: b.querySelector('[data-name="totalPrice"]'),
  });
  const offersFor = (b) => DB.items.get(canon(blockParts(b).name.value)) || [];
  function setSrc(b, src, note) {
    b.dataset.psrc = src || "";
    const tag = b.querySelector("[data-psrc]"); if (!tag) return;
    tag.textContent = src === "db" ? "DB" : src === "perday" ? "/hari" : src === "manual" ? "manual" : "";
    tag.dataset.src = src || "";
    const p = blockParts(b).price; if (p) p.title = note || (src === "manual" ? "Diisi manual. Kosongkan sel untuk kembali ke harga database." : "");
  }
  function applyPrice(b, force) {
    if (!DB.ready) return;
    if (b.dataset.psrc === "manual" && !force) return;
    const { vendor, price } = blockParts(b);
    const offers = offersFor(b).filter((o) => canon(o.vendor) === canon(vendor.value));
    const { e, g } = dayInfo();
    if (!offers.length || e === null || g === null) { if (b.dataset.psrc !== "manual") setSrc(b, ""); return; }
    let best = null;
    offers.forEach((o) => { const p = priceOf(o, e, g); if (p && (!best || p.price < best.price)) best = p; });
    if (!best) return;
    b._auto = true;
    price.value = nf.format(best.price);
    price.dispatchEvent(new Event("input", { bubbles: true }));
    b._auto = false;
    setSrc(b, best.src, best.note);
  }
  function repriceAll() { cont.querySelectorAll("[data-item-block]").forEach((b) => applyPrice(b, false)); }

  /* dipakai input.js untuk dropdown vendor: vendor yang menjual barang ini tampil dulu, lengkap dengan harganya */
  const { } = {};
  window.InputPrice = {
    vendorOptions(block, query, fallback) {
      const q = String(query || "").trim().toLowerCase();
      const { e, g } = dayInfo();
      const by = new Map();
      offersFor(block).forEach((o) => {
        const p = e !== null && g !== null ? priceOf(o, e, g) : null;
        const c = by.get(o.vendor);
        if (!c || (p && (!c.p || p.price < c.p.price))) by.set(o.vendor, { o, p });
      });
      const db = [...by.entries()].filter(([v]) => !q || v.toLowerCase().includes(q))
        .map(([v, x]) => ({ namaVendor: v, label: v + (x.p ? "  ·  Rp " + nf.format(x.p.price) + (x.p.src === "perday" ? " (/hari)" : "") : "") }));
      const seen = new Set(db.map((x) => canon(x.namaVendor)));
      return db.concat((fallback || []).filter((x) => !seen.has(canon(x.namaVendor)))).slice(0, 50);
    },
    vendorChosen(block) { applyPrice(block, true); },
  };

  /* ---------- sel baru: lencana sumber harga ---------- */
  function initBlock(b) {
    if (b._sheet) return; b._sheet = true;
    const priceField = blockParts(b).price && blockParts(b).price.closest(".field");
    if (priceField && !priceField.querySelector("[data-psrc]")) {
      const t = document.createElement("small"); t.className = "psrc"; t.setAttribute("data-psrc", ""); priceField.appendChild(t);
    }
    /* baris yang sudah berisi harga (mode edit / salin) dianggap manual: data lama tidak ditimpa */
    setTimeout(() => { if (blockParts(b).price.value.trim()) setSrc(b, "manual"); else applyPrice(b, false); }, 0);
    updateTotals();
  }
  new MutationObserver(() => { cont.querySelectorAll("[data-item-block]").forEach(initBlock); updateTotals(); }).observe(cont, { childList: true });

  cont.addEventListener("input", (e) => {
    const t = e.target, b = t.closest && t.closest("[data-item-block]"); if (!b) return;
    if (t.matches('[data-name="totalPrice"]') && !b._auto) {
      if (!t.value.trim()) { setSrc(b, ""); applyPrice(b, false); } else setSrc(b, "manual");
    }
    updateTotals();
  });
  cont.addEventListener("change", (e) => {
    const t = e.target, b = t.closest && t.closest("[data-item-block]"); if (!b) return;
    if (t.matches('[data-name="vendor"], [data-name="itemName"]')) applyPrice(b, false);
    updateTotals();
  });
  ["f-date-start", "f-date-end", "f-gr"].forEach((id) => { ["input", "change"].forEach((ev) => $(id).addEventListener(ev, repriceAll)); });

  /* ---------- total langsung ---------- */
  function updateTotals() {
    let tot = 0, dp = 0, n = 0;
    cont.querySelectorAll("[data-item-block]").forEach((b) => {
      n++; tot += valueOf(b.querySelector('[data-name="totalPrice"]'));
      const st = b.querySelector('[data-name="paymentStatus"]');
      dp += st && st.value === "Lunas" ? valueOf(b.querySelector('[data-name="totalPrice"]')) : valueOf(b.querySelector('[data-name="nominalDP"]'));
    });
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set("t-total", "Rp " + nf.format(tot)); set("t-dp", "Rp " + nf.format(dp)); set("t-sisa", "Rp " + nf.format(Math.max(0, tot - dp)));
    set("t-days", dayText());
  }
  function dayText() {
    const { e, g } = dayInfo();
    return e === null || g === null ? "Isi tanggal & GR untuk harga database" : e + " Day + " + g + " GR (" + (e + g) + " hari)";
  }
  ["f-date-start", "f-date-end", "f-gr"].forEach((id) => $(id).addEventListener("input", updateTotals));
  cont.addEventListener("click", () => setTimeout(updateTotals, 0));
  updateTotals();

  /* ---------- navigasi sel ala Excel ---------- */
  const COLS = ["itemName", "vendor", "totalPrice", "nominalDP", "description"];
  const cellOf = (tr, c) => { const a = tr.querySelector('[data-name="' + c + '"]'); return a && !a.disabled && !a.readOnly ? a : null; };
  function move(inp, dr, dc) {
    const rows = [...cont.querySelectorAll("[data-item-block]")];
    const ri = rows.indexOf(inp.closest("[data-item-block]")), ci = COLS.indexOf(inp.dataset.name);
    if (ri < 0 || ci < 0) return false;
    let tgt = null;
    if (dc) { for (let c = ci + dc; c >= 0 && c < COLS.length && !tgt; c += dc) tgt = cellOf(rows[ri], COLS[c]); }
    else { for (let r = ri + dr; r >= 0 && r < rows.length && !tgt; r += dr) tgt = cellOf(rows[r], COLS[ci]); }
    if (!tgt) return false;
    tgt.focus(); try { tgt.select(); } catch (e) {}
    return true;
  }
  cont.addEventListener("keydown", (e) => {
    const inp = e.target;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !inp.dataset || COLS.indexOf(inp.dataset.name) < 0) return;
    const k = e.key;
    if (k === "Enter") { e.preventDefault(); move(inp, e.shiftKey ? -1 : 1, 0); return; }
    if (e.shiftKey) return;
    const len = inp.value.length, s0 = inp.selectionStart, s1 = inp.selectionEnd;
    const full = len > 0 && s0 === 0 && s1 === len, atStart = s0 === s1 && s0 === 0, atEnd = s0 === s1 && s0 === len;
    let moved = false;
    if (k === "ArrowUp") moved = move(inp, -1, 0);
    else if (k === "ArrowDown") moved = move(inp, 1, 0);
    else if (k === "ArrowLeft" && (full || atStart)) moved = move(inp, 0, -1);
    else if (k === "ArrowRight" && (full || atEnd)) moved = move(inp, 0, 1);
    if (moved) e.preventDefault();
  });

  /* ---------- status sinkron (judul halaman + dialog) ---------- */
  function paintSync() {
    const st = window.EventStore && window.EventStore.status();
    const txt = st ? st.text : "";
    const cls = !st ? "" : st.mode === "local" ? "err" : (st.pending || /Menunggu|Menghubungkan/.test(txt)) ? "wait" : "ok";
    ["sync-note", "pj-sync"].forEach((id) => { const el = $(id); if (el) { el.textContent = txt; el.className = (id === "sync-note" ? "sync-note " : "pj-sync ") + cls; } });
  }
  if (window.EventStore) { window.EventStore.subscribe(paintSync); paintSync(); }

  /* ---------- Daftar Event (dialog): Buka · Edit · Duplikat · Hapus ---------- */
  const dlg = $("projects");
  if (dlg && window.EventStore) {
    const ES = window.EventStore;
    const list = $("pj-list"), msg = $("pj-msg"), search = $("pj-search"), sort = $("pj-sort");
    const params = new URLSearchParams(location.search);
    const curId = params.get("edit") || params.get("view");
    const rp = (n) => "Rp " + nf.format(n || 0);
    const ts = (ev) => (typeof getEventUpdatedAt === "function" ? getEventUpdatedAt(ev) : new Date(ev.submittedAt || 0).getTime()) || 0;
    const when = (ev) => { const t = ts(ev); return t ? new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"; };
    let note = "";
    const picked = new Set();   /* id event yang dicentang untuk unduh Excel gabungan */
    let shown = [];
    const xbtn = $("pj-xlsx"), allBox = $("pj-all");
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

    function render() {
      const all = ES.all().map(ES.summary);
      const q = search.value.trim().toLowerCase();
      const rows = all.filter((ev) => !q || [ev.event, ev.city].some((f) => String(f || "").toLowerCase().includes(q)));
      const m = sort.value;
      rows.sort((a, b) => m === "name" ? String(a.event || "~").localeCompare(String(b.event || "~"), "id", { numeric: true }) : m === "old" ? ts(a) - ts(b) : ts(b) - ts(a));
      list.textContent = "";
      shown = rows;
      const ids = new Set(all.map((e) => String(e.eventId)));
      [...picked].forEach((id) => { if (!ids.has(id)) picked.delete(id); });   /* event yang sudah dihapus */
      msg.textContent = note || (!all.length ? "Belum ada event." : rows.length === all.length ? all.length + " event" : rows.length + " dari " + all.length + " event");
      rows.forEach((ev) => {
        const li = mk("li", String(ev.eventId) === String(curId) ? "cur" : "");
        const pick = mk("input", "pj-pick"); pick.type = "checkbox"; pick.checked = picked.has(String(ev.eventId));
        pick.setAttribute("aria-label", "Pilih " + (ev.event || "event") + " untuk diunduh");
        pick.addEventListener("change", () => { pick.checked ? picked.add(String(ev.eventId)) : picked.delete(String(ev.eventId)); paintPick(); });
        const info = mk("div", "pj-info");
        info.append(mk("span", "nm", ev.event || "(Tanpa nama event)"),
          mk("div", "sub", [ev.city, (ev.itemCount || 0) + " barang", rp(ev.eventPrice), "diubah " + when(ev), ev.draft ? "DRAFT" : ""].filter(Boolean).join(" · ")));
        const btns = mk("div", "btns");
        const open = mk("a", "ghost", "Buka"); open.href = "input.html?view=" + encodeURIComponent(ev.eventId);
        const edit = mk("a", "ghost", "Edit"); edit.href = "input.html?edit=" + encodeURIComponent(ev.eventId);
        const dup = mk("button", "ghost", "Duplikat"); dup.type = "button";
        dup.addEventListener("click", () => {
          try { const r = ES.duplicate(ev.eventId); note = "Disalin sebagai “" + r.event.event + "”."; }
          catch (e) { note = "Gagal menyalin: " + (e && e.message || "error"); }
          render();
        });
        const del = mk("button", "ghost danger", "Hapus"); del.type = "button";
        let t = null;
        del.addEventListener("click", () => {
          if (!t) { del.textContent = "Yakin?"; t = setTimeout(() => { del.textContent = "Hapus"; t = null; }, 3000); return; }
          clearTimeout(t);
          ES.remove(ev.eventId).catch(() => {});
          note = "Event dihapus."; render();
        });
        btns.append(open, edit, dup, del); li.append(pick, info, btns); list.append(li);
      });
      paintPick();
    }
    function paintPick() {
      const n = picked.size, vis = shown.filter((ev) => picked.has(String(ev.eventId))).length;
      xbtn.textContent = "Unduh Excel (" + n + " dipilih)"; xbtn.disabled = n === 0;
      allBox.checked = shown.length > 0 && vis === shown.length;
      allBox.indeterminate = vis > 0 && vis < shown.length;
    }
    allBox.addEventListener("change", () => {
      shown.forEach((ev) => (allBox.checked ? picked.add(String(ev.eventId)) : picked.delete(String(ev.eventId))));
      render();
    });
    xbtn.addEventListener("click", async () => {
      const evs = ES.all().filter((ev) => picked.has(String(ev.eventId))).sort((a, b) => ts(a) - ts(b));
      if (!evs.length) return;
      xbtn.disabled = true; const old = xbtn.textContent; xbtn.textContent = "Menyiapkan Excel…";
      try {
        if (!window.EventExport || !window.EventExport.downloadMultiExcel) throw new Error("Modul ekspor belum dimuat.");
        const entries = evs.map((ev) => ({ report: ev }));
        await window.EventExport.downloadMultiExcel(entries, evs.length === 1 ? (evs[0].event || "Event") + " - Laporan Event" : "Input Report - " + evs.length + " event");
        note = evs.length + " event diunduh dalam satu file Excel.";
      } catch (e) { note = "Gagal mengunduh: " + (e && e.message || "error"); }
      xbtn.textContent = old; render();
    });
    async function openDlg() {
      note = ""; if (!dlg.open) dlg.showModal();
      msg.textContent = "Memuat daftar event…";
      try { await ES.ready; } catch (_) {}
      render();
    }
    ES.subscribe(() => { if (dlg.open) render(); });
    $("pj-open").addEventListener("click", openDlg);
    $("pj-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    search.addEventListener("input", render); sort.addEventListener("change", render);

    if (params.get("list") === "1") openDlg();
  }
})();
