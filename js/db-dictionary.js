/* =========================================================================
   db-dictionary.js — sumber tunggal Nama Barang, Kategori, dan Vendor untuk
   Input Report: database harga (Google Sheets yang sama dengan halaman
   Database). Menggantikan Item_Dictionary.xlsx / Vendor_Dictionary.xlsx.
   - MxDatabase.load()  -> { rows, combos } (satu kali fetch, dipakai bersama
     oleh input-sheet.js untuk harga otomatis)
   - window.loadDictionaries() -> { items, vendors } dari database;
     bila database gagal dimuat, jatuh ke data bundled lama.
   Dimuat SETELAH data.js & event-store.js, SEBELUM input-sheet.js & input.js.
   ========================================================================= */
(function () {
  const SS = { id: "1X03xTnUsCz-QOWNeIXfTKhdMO1eaVDNmqBuIClHnAWk", key: "AIzaSyAGQc7xZgCkRqsE_WtPwZSR2_2xGemYaGQ" };
  const COMBO = /^(\d+)\s*day\s*\+\s*(\d+)\s*gr$/;
  const CACHE_KEY = "mx_db_dict_v2";   /* v2: baris database kini menyertakan spesifikasi, qty, satuan */
  const CACHE_TTL = 10 * 60 * 1000; // 10 menit: cukup segar, form tetap cepat dibuka
  const canon = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const cleanSheetName = (n) => (String(n).replace(/^[^\p{L}\p{N}]+/u, "").trim() || String(n));

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
        if (c === "item id") col.id = i; else if (c === "kategori") col.kat = i;
        else if (c === "nama item") col.item = i; else if (c === "vendor") col.vendor = i;
        else if (c === "spesifikasi") col.spec = i; else if (c === "quantity") col.qty = i; else if (c === "satuan") col.unit = i;
        else { const m = c.match(COMBO); if (m) { col.cb[m[1] + "_" + m[2]] = i; combos[m[1] + "_" + m[2]] = { e: +m[1], g: +m[2] }; } }
      });
      if (col.item === undefined || col.vendor === undefined) return;
      const katFallback = cleanSheetName(sheets[si].title);
      for (let r = hi + 1; r < vals.length; r++) {
        const row = vals[r]; if (!row[col.item]) continue;
        const cp = {}; let any = false;
        Object.keys(col.cb).forEach((k) => { const v = row[col.cb[k]]; if (v !== "" && v != null && !isNaN(Number(v))) { cp[k] = Number(v); any = true; } });
        if (!any) continue;
        rows.push({
          id: sheets[si].sheetId + ":" + r,
          itemId: col.id !== undefined && row[col.id] ? String(row[col.id]).trim() : "",
          kategori: col.kat !== undefined && row[col.kat] ? String(row[col.kat]).trim() : katFallback,
          item: String(row[col.item]).trim(),
          vendor: row[col.vendor] ? String(row[col.vendor]).trim() : "",
          spec: col.spec !== undefined && row[col.spec] ? String(row[col.spec]).trim() : "",
          qty: col.qty !== undefined && Number(row[col.qty]) > 0 ? Number(row[col.qty]) : 1,
          unit: col.unit !== undefined && row[col.unit] ? String(row[col.unit]).trim() : "",
          combos: cp,
        });
      }
    });
    return { rows, combos };
  }

  function readCache() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      return c && Date.now() - c.t < CACHE_TTL ? c.d : null;
    } catch (_) { return null; }
  }
  function writeCache(d) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch (_) {} }

  let _p = null;
  function load() {
    if (_p) return _p;
    const cached = readCache();
    _p = cached ? Promise.resolve(cached) : fetchDb().then((d) => { writeCache(d); return d; });
    _p.catch(() => { _p = null; }); // gagal -> boleh dicoba lagi
    return _p;
  }
  window.MxDatabase = { load, canon };

  // Susun dictionary dari baris database: satu entri per nama barang unik
  // (kategori + kode dari baris pertama), satu entri per vendor unik.
  function buildDictionaries(rows) {
    const items = new Map(), vendors = new Map();
    rows.forEach((r) => {
      const ik = canon(r.item);
      if (ik && !items.has(ik)) items.set(ik, { itemId: r.itemId, kategori: r.kategori, namaItemStandar: r.item, satuanStandar: "item" });
      const vk = canon(r.vendor);
      if (vk && vk.indexOf("(vendor tidak diketahui)") !== 0 && !vendors.has(vk)) vendors.set(vk, { vendorId: "", namaVendor: r.vendor, kategoriLayanan: "" });
    });
    const byName = (k) => (a, b) => a[k].localeCompare(b[k], "id");
    return { items: [...items.values()].sort(byName("namaItemStandar")), vendors: [...vendors.values()].sort(byName("namaVendor")) };
  }

  window.loadDictionaries = async function () {
    try {
      const { rows } = await load();
      const d = buildDictionaries(rows);
      if (d.items.length && d.vendors.length) return d;
      console.warn("loadDictionaries: database kosong, memakai data bundled.");
    } catch (err) {
      console.warn("loadDictionaries: database gagal dimuat, memakai data bundled.", err);
    }
    return { items: ITEM_DICTIONARY_BUNDLED, vendors: VENDOR_DICTIONARY_BUNDLED };
  };
})();
