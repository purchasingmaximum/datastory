/* =========================================================================
   input.js — dynamic rental-item blocks, validation, and submission for
   the report form.
   ========================================================================= */

(function () {
  const form = document.getElementById("report-form");
  const itemsContainer = document.getElementById("items-container");
  const itemTemplate = document.getElementById("item-block-template");
  const addItemBtn = document.getElementById("add-item");
  const itemsCountEl = document.getElementById("items-count");
  const noItemsMsg = document.getElementById("no-items-msg");
  const submitBtn = document.getElementById("submit-report");
  const formLevelError = document.getElementById("form-level-error");
  const toast = document.getElementById("success-toast");

  // ---- Mode Edit (?edit=<eventId>) ----------------------------------------
  // Dipakai saat pengguna klik "Edit" di events.html: form ini dimuat ulang
  // dengan data event yang sudah ada, lalu submit akan MENGUPDATE event itu
  // (bukan membuat baris baru) lewat report.isEdit = true di submitEvent().
  const urlParams = new URLSearchParams(window.location.search);
  let editEventId = urlParams.get("edit");
  const startedNew = !urlParams.get("edit");   // halaman dibuka sebagai event baru / salinan
  const copyEventId = urlParams.get("copy");   // "Duplikat" dari Daftar Event: isi form dari event lain, simpan sebagai event baru
  const viewEventId = urlParams.get("view");   // "Buka" dari Daftar Event: tampilan laporan (baca saja) + ekspor
  let editOriginalEvent = null;

  const titleLabel = document.getElementById("title-label");
  const backToList = document.getElementById("back-to-list");
  const editModeNote = document.getElementById("edit-mode-note");

  if (editEventId) titleLabel.textContent = "Edit Report:";
  if (!viewEventId) {
    backToList.hidden = false;
    backToList.textContent = "Kembali ke Daftar Event";
    editModeNote.hidden = false;
    editModeNote.textContent = "Tersimpan otomatis ke cloud saat Anda mengetik — pengguna lain yang membuka event ini melihat perubahan langsung. Laporan baru berstatus Draft (belum masuk Analytics) sampai Anda menekan Submit.";
  }
  submitBtn.textContent = "Next: Preview →";

  let itemSeq = 0;

  /* ---------------------------------------------------------------------
     Item & vendor dictionaries — power the Nama Barang ghost-autocomplete / Vendor dropdown-search
     fields. Loaded once on page load; every item block wires its own
     combobox against these same arrays (see attachItemDictionaryCombo /
     attachVendorCombo below). When editing, the existing event's data is
     loaded in parallel and the form is prefilled once both are ready.
     --------------------------------------------------------------------- */
  let itemDictionary = [];
  let vendorDictionary = [];

  MaximumLoader.show((editEventId || viewEventId) ? "Memuat Data Event" : "Memuat Data Master");
  Promise.all([
    loadDictionaries(),
    (editEventId || copyEventId || viewEventId) ? loadEventById(editEventId || copyEventId || viewEventId) : Promise.resolve(null),
  ]).then(([dicts, ev]) => {
    if (viewEventId) {
      if (!ev) throw new Error("Event tidak ditemukan.");
      showReadOnly(ev);
      return;
    }
    itemDictionary = dicts.items.slice();
    vendorDictionary = dicts.vendors;
    // Barang baru yang pernah disubmit: cache lokal langsung, sheet
    // ITEM_DICTIONARY menyusul di latar belakang (tidak menahan tampilan form).
    mergeIntoDictionary(readLocalCustomItems());
    loadCustomItems().then(mergeIntoDictionary);

    if (editEventId || copyEventId) {
      if (!ev) throw new Error("Event tidak ditemukan.");
      if (editEventId) editOriginalEvent = ev;
      populateFormForEdit(ev);
      if (editEventId) { lastSavedAt = ev.updatedAt || ""; lastSig = currentSig(); }
      if (copyEventId) form.event.value = (form.event.value || "") + " (salinan)";
    } else {
      addItemBlock();
    }
  }).catch((err) => {
    console.error("Failed to load data master / event to edit", err);
    if (viewEventId) {
      formLevelError.textContent = (err && err.message) || "Event tidak ditemukan.";
      backToList.hidden = false;
    }
    if (editEventId) {
      formLevelError.textContent = (err && err.message) || "Gagal memuat data event untuk diedit.";
      submitBtn.disabled = true;
    }
  }).finally(() => {
    MaximumLoader.hide();
  });

  /* ---------------------------------------------------------------------
     Barang baru -> dictionary. Tidak ada kolom "Item ID" di form: nama yang
     tidak ada di dictionary tetap sah, dan setelah submit ia ditambahkan ke
     dictionary (backend menulis ke sheet ITEM_DICTIONARY + membuat kodenya;
     salinan lokal disimpan di localStorage agar langsung muncul sebagai
     saran walau backend belum sempat dibaca ulang).
     --------------------------------------------------------------------- */
  const CUSTOM_ITEMS_KEY = "mx_custom_items_v1";
  const normName = (n) => String(n || "").trim().replace(/\s+/g, " ").toLowerCase();

  function readLocalCustomItems() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) || "[]"); } catch (_) { return []; }
  }
  function writeLocalCustomItems(list) {
    try { localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(list)); } catch (_) {}
  }
  // Barang yang pernah dipakai di event mana pun (dari penyimpanan bersama) ikut jadi saran,
  // jadi nama barang baru dari orang lain langsung muncul tanpa spreadsheet dictionary.
  async function loadCustomItems() {
    let fromEvents = [];
    try {
      await window.EventStore.ready;
      const seen = new Set();
      window.EventStore.all().forEach((ev) => (ev.items || []).forEach((it) => {
        const k = normName(it.itemName);
        if (!k || seen.has(k)) return;
        seen.add(k);
        fromEvents.push({ itemId: it.itemCode || "", kategori: it.category || "", namaItemStandar: it.itemName, satuanStandar: "item" });
      }));
    } catch (err) { console.warn("Gagal membaca barang dari event tersimpan.", err); }
    return fromEvents.concat(readLocalCustomItems());
  }
  function mergeIntoDictionary(list) {
    const known = new Set(itemDictionary.map((e) => normName(e.namaItemStandar)));
    (list || []).forEach((e) => {
      const key = normName(e && e.namaItemStandar);
      if (!key || known.has(key)) return;
      known.add(key);
      itemDictionary.push({
        itemId: e.itemId || "",
        kategori: e.kategori || "",
        namaItemStandar: String(e.namaItemStandar).trim(),
        satuanStandar: e.satuanStandar || "item",
      });
    });
  }
  // Dipanggil saat laporan disubmit: nama yang belum ada masuk dictionary.
  function rememberNewItems(items) {
    const fresh = [];
    items.forEach((it) => {
      if (!it.itemName) return;
      const known = itemDictionary.some((e) => normName(e.namaItemStandar) === normName(it.itemName));
      if (!known) fresh.push({ itemId: "", kategori: it.category, namaItemStandar: it.itemName, satuanStandar: "item" });
    });
    if (!fresh.length) return;
    mergeIntoDictionary(fresh);
    writeLocalCustomItems(readLocalCustomItems().concat(fresh));
  }

  function filterByQuery(list, query, ...fields) {
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 50); // cap the "browse all" list so it stays snappy
    return list.filter((entry) => fields.some((f) => String(entry[f] || "").toLowerCase().includes(q))).slice(0, 50);
  }

  // Daftar Kategori unik dari itemDictionary (yang sendiri berasal dari
  // sheet ITEM_DICTIONARY lewat loadDictionaries() — lihat js/data.js).
  // Diurutkan alfabetis (locale id) supaya dropdown rapi walau urutan baris
  // di sheet berantakan.
  function categoryList() {
    const seen = new Set();
    const list = [];
    itemDictionary.forEach((opt) => {
      const kategori = String(opt.kategori || "").trim();
      if (kategori && !seen.has(kategori)) {
        seen.add(kategori);
        list.push(kategori);
      }
    });
    return list.sort((a, b) => a.localeCompare(b, "id"));
  }

  // Mengisi ulang <option> pada select Kategori dari categoryList(),
  // mempertahankan pilihan sekarang kalau masih valid. Dipanggil saat blok
  // barang dibuat (dictionary sudah dimuat lebih dulu, lihat Promise.all
  // di atas) supaya Kategori selalu mengikuti sheet ITEM_DICTIONARY tanpa
  // perlu mengubah kode.
  function populateCategorySelect(select) {
    const current = select.value;
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Pilih kategori";
    select.appendChild(placeholder);
    categoryList().forEach((kategori) => {
      const opt = document.createElement("option");
      opt.value = kategori;
      opt.textContent = kategori;
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  }

  // Kode item TIDAK lagi diisi manual. Untuk barang yang cocok dengan
  // dictionary, kodenya disimpan diam-diam di data-item-id pada input nama;
  // untuk barang baru dikosongkan dan backend yang membuatkan kode +
  // menambahkan barang itu ke dictionary saat submit.
  function applyItemSelection(opt, block, { commit } = { commit: true }) {
    const nameInput = block.querySelector('[data-name="itemName"]');
    const categorySelect = block.querySelector('[data-name="category"]');
    nameInput.dataset.itemId = opt.itemId || "";
    if (!commit) return;
    nameInput.value = opt.namaItemStandar;
    if ([...categorySelect.options].some((o) => o.value === opt.kategori)) categorySelect.value = opt.kategori;
    setError(nameInput.closest(".field"), "");
    setError(categorySelect.closest(".field"), "");
  }

  // Pencarian barang: tidak harus dari awal kata. Tanda baca & spasi diabaikan,
  // jadi "P.3" / "p3" / "led p3" semuanya menemukan "LED P3.9".
  const squash = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  function searchItems(query) {
    const raw = String(query || "").trim();
    if (!raw) return [];
    const q = squash(raw);
    const toks = raw.toLowerCase().split(/\s+/).map(squash).filter(Boolean);
    if (!q) return [];
    const scored = [];
    itemDictionary.forEach((e) => {
      const name = String(e.namaItemStandar || "");
      if (!name || name.indexOf("\n") !== -1) return;
      const n = squash(name);
      let score = -1;
      if (n === q) score = 0;
      else if (n.startsWith(q)) score = 1;
      else if (name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w && w.startsWith(q))) score = 2;
      else if (n.includes(q)) score = 3;
      else if (toks.length > 1 && toks.every((t) => n.includes(t))) score = 4;
      else if (squash(e.kategori).includes(q)) score = 6;
      if (score >= 0) scored.push({ e, score, len: name.length, at: n.indexOf(q) < 0 ? 999 : n.indexOf(q) });
    });
    scored.sort((a, b) => a.score - b.score || a.at - b.at || a.len - b.len);
    return scored.slice(0, 50).map((x) => x.e);
  }
  const exactItem = (v) => {
    const q = normName(v);
    return q ? itemDictionary.find((e) => normName(e.namaItemStandar) === q) || null : null;
  };
  function renderItemRow(li, opt, query) {
    const name = String(opt.namaItemStandar || "");
    const q = String(query || "").trim();
    const i = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
    const main = document.createElement("span");
    main.className = "combo-main";
    if (i >= 0) {
      main.append(name.slice(0, i));
      const b = document.createElement("mark");
      b.textContent = name.slice(i, i + q.length);
      main.append(b, name.slice(i + q.length));
    } else main.textContent = name;
    li.textContent = "";
    li.appendChild(main);
    if (opt.kategori) {
      const c = document.createElement("small");
      c.className = "combo-sub";
      c.textContent = opt.kategori;
      li.appendChild(c);
    }
  }

  function attachItemDictionaryCombo(block) {
    const nameInput = block.querySelector('[data-name="itemName"]');
    const categorySelect = block.querySelector('[data-name="category"]');
    populateCategorySelect(categorySelect);

    initCombobox(nameInput, {
      getOptions: (query) => searchItems(query),
      renderLabel: (opt) => opt.namaItemStandar,
      renderRow: renderItemRow,
      getValue: (opt) => opt.namaItemStandar,
      onSelect: (opt) => applyItemSelection(opt, block, { commit: true }),
      toggle: false,
      openOnFocus: false,
    });
    // Teks bebas tetap sah: cocok persis dengan dictionary -> kode barang terisi,
    // selain itu dianggap barang baru (tanpa kode).
    nameInput.addEventListener("input", () => {
      const hit = exactItem(nameInput.value);
      if (hit) applyItemSelection(hit, block, { commit: false });
      else nameInput.dataset.itemId = "";
    });
    nameInput.addEventListener("blur", () => {
      const hit = exactItem(nameInput.value);
      if (hit) applyItemSelection(hit, block, { commit: true });
    });
  }

  function attachVendorCombo(block) {
    const vendorInput = block.querySelector('[data-name="vendor"]');
    initCombobox(vendorInput, {
      // vendor yang menjual barang ini (menurut database harga) tampil dulu beserta harganya
      getOptions: (query) => {
        const base = filterByQuery(vendorDictionary, query, "namaVendor", "vendorId");
        const list = window.InputPrice ? window.InputPrice.vendorOptions(block, query, base) : base;
        // Selalu ada pilihan "Lainnya": vendor yang belum ada di daftar bisa diisi sendiri.
        const typed = String(query || "").trim();
        const exists = typed && list.some((o) => canonName(o.namaVendor) === canonName(typed));
        if (exists) return list;
        return list.concat([typed
          ? { namaVendor: typed, label: "Lainnya: pakai “" + typed + "” (isi sendiri)", custom: true }
          : { namaVendor: "", label: "Lainnya (isi sendiri)…", custom: true }]);
      },
      renderLabel: (opt) => opt.label || opt.namaVendor,
      getValue: (opt) => opt.namaVendor,
      onSelect: (opt) => {
        setError(vendorInput.closest(".field"), "");
        if (opt && opt.custom) {
          if (!opt.namaVendor) { vendorInput.value = ""; vendorInput.placeholder = "Ketik nama vendor…"; vendorInput.focus(); }
          return;
        }
        if (window.InputPrice) window.InputPrice.vendorChosen(block);
      },
    });
  }
  const canonName = (x) => String(x || "").trim().replace(/\s+/g, " ").toLowerCase();

  /* ---------------------------------------------------------------------
     Rupiah-formatted number inputs: store the raw digits, display with
     thousands separators as the user types.
     --------------------------------------------------------------------- */
  // Rumus ala Excel (seperti Budget & Feasibility): + - x (atau *) / ( ).
  // Boleh diawali "=" atau langsung diketik, mis. 2x3.500.000 atau =(5000000+250000)/2.
  // Dihitung saat Enter / pindah sel; klik sel itu lagi untuk melihat rumusnya.
  const evalFx = (src) => (window.SheetCalc ? window.SheetCalc.evalExpr(src) : null);
  const isFx = (v) => /[=+*\/x×()\-]/i.test(String(v || ""));
  const fxBody = (v) => String(v).trim().replace(/^=/, "");
  function attachRupiahFormatting(input) {
    const fmtN = (n) => (n ? Math.round(n).toLocaleString("id-ID") : "");
    const plain = () => Number(input.value.replace(/\D/g, "")) || 0;
    input.addEventListener("focus", () => {
      if (input._fx && !isFx(input.value) && input._fx.v === plain()) { input.value = input._fx.f; input.select(); }
    });
    input.addEventListener("input", () => {
      if (isFx(input.value)) return;   // mode rumus: ketik bebas
      input._fx = null; input.title = "";
      const digits = input.value.replace(/\D/g, "");
      input.value = digits ? Number(digits).toLocaleString("id-ID") : "";
    });
    const commit = () => {
      const v = input.value.trim();
      if (!isFx(v)) return;
      const r = evalFx(fxBody(v));
      if (r === null || r < 0 || r > 9999999999999) {
        input.value = input._fx ? fmtN(input._fx.v) : "";
        input.classList.add("fx-invalid"); setTimeout(() => input.classList.remove("fx-invalid"), 1800);
        return;
      }
      const n = Math.round(r);
      input._fx = { f: v, v: n }; input.title = v;
      input.value = fmtN(n);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    input.addEventListener("blur", commit);
  }
  function rupiahValue(input) {
    const v = input.value.trim();
    if (isFx(v)) { const r = evalFx(fxBody(v)); return r === null || r < 0 ? NaN : Math.round(r); }
    const digits = v.replace(/\D/g, "");
    return digits ? Number(digits) : NaN;
  }

  /* ---------------------------------------------------------------------
     Payment status ↔ Nominal DP: only "DP" leaves nominalDP editable.
     "Lunas" derives it automatically (mirrors the normalizePayment_ logic
     in Code.gs, so the preview matches what the backend will actually
     store).
     --------------------------------------------------------------------- */
  function attachPaymentFields(block, priceInput) {
    const statusSelect = block.querySelector('[data-name="paymentStatus"]');
    const dpInput = block.querySelector('[data-name="nominalDP"]');
    const sisaDisplay = block.querySelector('[data-sisa-dp-display]');
    attachRupiahFormatting(dpInput);

    function syncDP() {
      const total = rupiahValue(priceInput) || 0;
      if (statusSelect.value === "Lunas") {
        dpInput.value = total.toLocaleString("id-ID");
        dpInput.disabled = true;
      } else if (statusSelect.value === "DP") {
        dpInput.disabled = false;
      } else {
        dpInput.value = "";
        dpInput.disabled = true;
      }
      const dp = rupiahValue(dpInput) || 0;
      const sisa = Math.max(0, total - dp);
      sisaDisplay.textContent = statusSelect.value
        ? `Sisa DP: Rp ${sisa.toLocaleString("id-ID")}`
        : "";
    }

    statusSelect.addEventListener("change", syncDP);
    dpInput.addEventListener("input", syncDP);
    priceInput.addEventListener("input", syncDP);
    syncDP();
  }

  /* ---------------------------------------------------------------------
     Tampilan tabel (mirip spreadsheet) untuk daftar barang.
     - Dropdown combobox dipasang "fixed" supaya tidak terpotong oleh
       kontainer tabel yang bisa di-scroll; posisinya dihitung dari sel.
     - Kolom Keterangan otomatis melebar mengikuti isi.
     --------------------------------------------------------------------- */
  function positionComboList(list) {
    if (!list || list.hidden) return;
    const wrap = list.closest(".combo-wrapper");
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const width = Math.max(r.width, 340);
    list.style.width = width + "px";
    list.style.right = "auto";
    list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + "px";
    const h = list.offsetHeight;
    const spaceBelow = window.innerHeight - r.bottom;
    list.style.top = (spaceBelow < h + 8 && r.top > h + 8)
      ? (r.top - h - 4) + "px"
      : (r.bottom + 4) + "px";
  }
  function repositionOpenComboLists() {
    itemsContainer.querySelectorAll(".combo-list:not([hidden])").forEach(positionComboList);
  }
  ["focusin", "input", "click", "keydown"].forEach((type) => {
    itemsContainer.addEventListener(type, (e) => {
      const wrap = e.target.closest && e.target.closest(".combo-wrapper");
      if (wrap) positionComboList(wrap.querySelector(".combo-list"));
    });
  });
  document.addEventListener("scroll", repositionOpenComboLists, true);
  window.addEventListener("resize", repositionOpenComboLists);

  function autoGrowDescription(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight + 2, 220) + "px";
  }
  itemsContainer.addEventListener("input", (e) => {
    if (e.target.matches && e.target.matches('textarea[data-name="description"]')) {
      autoGrowDescription(e.target);
    }
  });

  /* ---------------------------------------------------------------------
     Dynamic item blocks
     --------------------------------------------------------------------- */
  function renumberItems() {
    const blocks = itemsContainer.querySelectorAll("[data-item-block]");
    blocks.forEach((block, i) => {
      block.querySelector("[data-item-number]").textContent = i + 1;
    });
    itemsCountEl.textContent = blocks.length;
    noItemsMsg.hidden = blocks.length > 0;
  }

  function addItemBlock(prefill) {
    itemSeq += 1;
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.seq = itemSeq;

    node.querySelector("[data-remove-item]").addEventListener("click", () => {
      node.remove();
      renumberItems();
    });

    const priceInput = node.querySelector('[data-name="totalPrice"]');
    attachRupiahFormatting(priceInput);

    attachPaymentFields(node, priceInput);
    attachItemDictionaryCombo(node);
    attachVendorCombo(node);

    itemsContainer.appendChild(node);
    if (prefill) fillItemBlock(node, prefill);
    renumberItems();
    return node;
  }

  // Mengisi satu blok barang dengan data yang sudah ada (mode edit), lalu
  // memicu event input/change yang relevan supaya formatting Rupiah,
  // status pembayaran, dan tampilan "Sisa DP" ikut ter-sinkron seolah-olah
  // pengguna sendiri yang mengetiknya.
  function fillItemBlock(node, item) {
    const nameField = node.querySelector('[data-name="itemName"]');
    nameField.value = item.itemName || "";
    nameField.dataset.itemId = item.itemCode || "";

    const categorySelect = node.querySelector('[data-name="category"]');
    if ([...categorySelect.options].some((o) => o.value === item.category)) {
      categorySelect.value = item.category;
    }

    node.querySelector('[data-name="vendor"]').value = item.vendor || "";
    node.querySelector('[data-name="description"]').value = item.description || "";

    const priceInput = node.querySelector('[data-name="totalPrice"]');
    priceInput.value = item.totalPrice ? Number(item.totalPrice).toLocaleString("id-ID") : "";

    const statusSelect = node.querySelector('[data-name="paymentStatus"]');
    // Data lama (sebelum revisi ini) mungkin belum punya paymentStatus sama
    // sekali — dibiarkan kosong ("Pilih status") supaya pengguna mengisinya
    // secara sadar, bukan ditebak.
    if (item.paymentStatus === "Lunas" || item.paymentStatus === "DP") {
      statusSelect.value = item.paymentStatus;
    }
    statusSelect.dispatchEvent(new Event("change"));

    if (item.paymentStatus === "DP") {
      const dpInput = node.querySelector('[data-name="nominalDP"]');
      dpInput.value = Number(item.nominalDP || 0).toLocaleString("id-ID");
      dpInput.dispatchEvent(new Event("input"));
    }

    autoGrowDescription(node.querySelector('[data-name="description"]'));
  }

  // Mengisi seluruh form (bagian atas + semua blok barang) dari satu event
  // yang sudah ada, dipanggil sekali saat halaman dibuka dengan ?edit=...
  function populateFormForEdit(ev) {
    form.user.value = ev.user || "";
    form.event.value = ev.event || "";
    form.city.value = ev.city || "";
    grInputEl.value = Number.isFinite(ev.gr) ? ev.gr : 0;

    dateStartInput.value = ev.eventDate || "";
    if (ev.eventDateEnd) {
      dateEndInput.value = ev.eventDateEnd;
    } else if (ev.eventDate && ev.eventDays) {
      // Sheet EVENTS hanya menyimpan tanggal mulai + jumlah hari, bukan
      // tanggal selesai — turunkan kembali dengan rumus yang sama seperti
      // saat pertama kali dihitung (lihat computedEventDays()).
      const end = new Date(ev.eventDate + "T00:00:00");
      end.setDate(end.getDate() + (Number(ev.eventDays) - 1));
      dateEndInput.value = end.toISOString().slice(0, 10);
    }
    recomputeEventDays();

    itemsContainer.innerHTML = "";
    (ev.items || []).forEach((item) => addItemBlock(item));
    if ((ev.items || []).length === 0) addItemBlock();
  }

  addItemBtn.addEventListener("click", () => addItemBlock());

  /* ---------------------------------------------------------------------
     Event duration: derived from start/end date (GR is counted separately
     via its own field) instead of a manual "jumlah day" or "durasi jam"
     input. Recomputes whenever either date, or the GR count, changes.
     --------------------------------------------------------------------- */
  const dateStartInput = document.getElementById("f-date-start");
  const dateEndInput = document.getElementById("f-date-end");
  const daysDisplay = document.getElementById("f-days");
  const grInputEl = document.getElementById("f-gr");
  const totalDaysHint = document.getElementById("total-days-hint");

  function computedEventDays() {
    if (!dateStartInput.value || !dateEndInput.value) return null;
    const start = new Date(dateStartInput.value);
    const end = new Date(dateEndInput.value);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffDays = Math.round((end - start) / 86400000) + 1; // inclusive of both ends
    return diffDays >= 1 ? diffDays : null;
  }

  function recomputeEventDays() {
    const days = computedEventDays();
    daysDisplay.value = days === null ? "—" : `${days} hari`;

    const gr = Number(grInputEl.value);
    if (days !== null && grInputEl.value !== "" && Number.isInteger(gr) && gr >= 0) {
      totalDaysHint.textContent = `Total termasuk GR: ${days + gr} hari (${days} event + ${gr} GR).`;
    } else {
      totalDaysHint.textContent = "";
    }
  }

  dateStartInput.addEventListener("change", recomputeEventDays);
  dateEndInput.addEventListener("change", recomputeEventDays);
  grInputEl.addEventListener("input", recomputeEventDays);

  // Total harga event is no longer a separate editable field — it's always
  // the sum of each item's own "Harga total", computed once at submit time
  // (see form submit handler below).
  function computeTotalEventPrice() {
    return [...itemsContainer.querySelectorAll('[data-name="totalPrice"]')]
      .reduce((sum, el) => sum + (rupiahValue(el) || 0), 0);
  }

  /* ---------------------------------------------------------------------
     Validation
     --------------------------------------------------------------------- */
  function setError(fieldEl, message) {
    fieldEl.classList.toggle("has-error", !!message);
    const msgEl = fieldEl.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message || "";
    // di tabel barang pesan error disembunyikan (gaya sheet): tampil sebagai tooltip pada sel
    if (fieldEl.closest(".items-table")) { const c = fieldEl.querySelector("input,select,textarea"); if (c && (message || c.dataset.errTip)) { c.title = message || ""; c.dataset.errTip = message ? "1" : ""; } }
  }

  function validateTopLevel() {
    let ok = true;
    const requiredText = ["user", "event", "city"];
    for (const name of requiredText) {
      const input = form.querySelector(`[name="${name}"]`);
      const fieldEl = input.closest(".field");
      if (!input.value.trim()) { setError(fieldEl, "Wajib diisi."); ok = false; }
      else setError(fieldEl, "");
    }

    const dateStartFieldEl = dateStartInput.closest(".field");
    const dateEndFieldEl = dateEndInput.closest(".field");
    const startValid = dateStartInput.value && !isNaN(new Date(dateStartInput.value).getTime());
    const endValid = dateEndInput.value && !isNaN(new Date(dateEndInput.value).getTime());

    if (!startValid) { setError(dateStartFieldEl, "Tanggal mulai tidak valid."); ok = false; }
    else setError(dateStartFieldEl, "");

    if (!endValid) { setError(dateEndFieldEl, "Tanggal selesai tidak valid."); ok = false; }
    else if (startValid && new Date(dateEndInput.value) < new Date(dateStartInput.value)) {
      setError(dateEndFieldEl, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
      ok = false;
    } else setError(dateEndFieldEl, "");

    const grFieldEl = grInputEl.closest(".field");
    const gr = Number(grInputEl.value);
    if (grInputEl.value === "" || !Number.isInteger(gr) || gr < 0) { setError(grFieldEl, "GR tidak boleh negatif."); ok = false; }
    else setError(grFieldEl, "");

    recomputeEventDays();

    return ok;
  }

  function validateItems() {
    const blocks = [...itemsContainer.querySelectorAll("[data-item-block]")];
    if (blocks.length === 0) {
      formLevelError.textContent = "Tambahkan minimal satu barang, atau lanjutkan tanpa barang jika event ini memang tidak menyewa apa pun.";
      return true; // spec allows "event tanpa item" as a data-quality case to handle, not a hard block
    }
    let ok = true;
    for (const block of blocks) {
      const nameEl = block.querySelector('[data-name="itemName"]').closest(".field");
      const catEl = block.querySelector('[data-name="category"]').closest(".field");
      const vendorEl = block.querySelector('[data-name="vendor"]').closest(".field");
      const descInput = block.querySelector('[data-name="description"]');
      const priceInput = block.querySelector('[data-name="totalPrice"]');
      const priceEl = priceInput.closest(".field");
      const statusSelect = block.querySelector('[data-name="paymentStatus"]');
      const statusEl = statusSelect.closest(".field");
      const dpInput = block.querySelector('[data-name="nominalDP"]');
      const dpEl = dpInput.closest(".field");

      setError(nameEl, nameEl.querySelector("input").value.trim() ? "" : "Wajib diisi.");
      setError(catEl, catEl.querySelector("select").value ? "" : "Pilih kategori.");
      setError(vendorEl, vendorEl.querySelector("input").value.trim() ? "" : "Wajib diisi.");

      const price = rupiahValue(priceInput);
      setError(priceEl, (Number.isFinite(price) && price >= 0) ? "" : "Harga harus berupa angka.");

      setError(statusEl, statusSelect.value ? "" : "Pilih status pembayaran.");

      const dp = rupiahValue(dpInput);
      const dpOk = statusSelect.value !== "DP" || (Number.isFinite(dp) && dp >= 0 && dp <= (Number.isFinite(price) ? price : Infinity));
      setError(dpEl, dpOk ? "" : "Nominal DP harus antara 0 dan harga total.");

      if (![nameEl, catEl, vendorEl, priceEl, statusEl, dpEl].every((el) => !el.classList.contains("has-error"))) {
        ok = false;
      }
    }
    return ok;
  }

  /* ---------------------------------------------------------------------
     Submission
     --------------------------------------------------------------------- */
  function collectReport() {
    const items = [...itemsContainer.querySelectorAll("[data-item-block]")].map((block) => ({
      // Kode dari dictionary bila cocok; kosong = barang baru (backend membuat kode + mendaftarkannya ke dictionary).
      itemCode: block.querySelector('[data-name="itemName"]').dataset.itemId || "",
      itemName: block.querySelector('[data-name="itemName"]').value.trim(),
      category: block.querySelector('[data-name="category"]').value,
      description: block.querySelector('[data-name="description"]').value.trim(),
      vendor: block.querySelector('[data-name="vendor"]').value.trim(),
      totalPrice: rupiahValue(block.querySelector('[data-name="totalPrice"]')),
      paymentStatus: block.querySelector('[data-name="paymentStatus"]').value,
      nominalDP: rupiahValue(block.querySelector('[data-name="nominalDP"]')) || 0,
      // REVISI: form ini tidak punya field kuantitas per barang (satu blok
      // = satu baris item dengan harga totalnya sendiri), tapi backend
      // (Code.gs validateReport_) mewajibkan quantity berupa angka > 0 —
      // tanpa ini SETIAP submit selalu ditolak. Default 1 per baris.
      quantity: 1,
    }));

    const report = {
      // Mode edit: pakai eventId yang sudah ada supaya backend meng-update
      // baris yang sama, bukan membuat event baru. Mode create: dibuat
      // otomatis oleh backend dengan format bulan-ke-event-ke-tahun.
      eventId: editEventId || "",
      isEdit: !!editEventId,
      user: form.user.value.trim(),
      event: form.event.value.trim(),
      eventPrice: computeTotalEventPrice(),
      eventDate: dateStartInput.value,
      eventDateEnd: dateEndInput.value,
      eventDays: computedEventDays(),
      gr: Number(grInputEl.value),
      city: form.city.value.trim(),
      items,
      submittedAt: new Date().toISOString(),
      // Diisi ulang di setiap simpan (submit baru DAN edit) — dipakai label
      // "Terakhir diperbarui" & urutan di Daftar Event.
      updatedAt: new Date().toISOString(),
    };
    return report;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formLevelError.textContent = "";

    const topOk = validateTopLevel();
    const itemsOk = validateItems();
    if (!topOk || !itemsOk) {
      formLevelError.textContent = "Periksa kembali field yang ditandai merah.";
      form.querySelector(".has-error")?.querySelector("input,select")?.focus();
      return;
    }

    const report = collectReport();

    // Jangan langsung kirim: tampilkan pratinjau dulu. Pengiriman sebenarnya
    // terjadi di confirmSubmit() setelah pengguna menekan Submit/Update.
    showPreview(report);
  });

  /* ---------------------------------------------------------------------
     Pratinjau sebelum submit (berlaku untuk input baru DAN edit event).
     Menampilkan ringkasan semua isian; pengguna memilih Edit (kembali ke
     form, isian tetap utuh) atau Submit/Update (kirim seperti biasa).
     --------------------------------------------------------------------- */
  const previewSection = document.getElementById("report-preview");
  const previewBody = document.getElementById("preview-body");
  const previewSubmitBtn = document.getElementById("preview-submit");
  const previewEditBtn = document.getElementById("preview-edit");
  const previewError = document.getElementById("preview-error");
  let pendingReport = null;

  function previewEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatRupiah(n) {
    return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
  }

  function formatDateId(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "—";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }

  const previewSubmitBtn2 = document.getElementById("preview-submit-2");

  function previewInfo(label, value) {
    const row = previewEl("div", "pv-info");
    row.appendChild(previewEl("span", "pv-info-k", label));
    row.appendChild(previewEl("span", "", value === "" || value == null ? "—" : String(value)));
    return row;
  }

  function previewRow(label, value, strong) {
    const row = previewEl("div", strong ? "pv-row strong" : "pv-row");
    row.appendChild(previewEl("span", "k", label));
    row.appendChild(previewEl("span", "v", String(value)));
    return row;
  }

  /* ---------------------------------------------------------------------
     Analisis terintegrasi: dihitung langsung dari seluruh event yang
     tersimpan (js/event-analysis.js) — tampil di pratinjau, di halaman
     "Buka", dan ikut masuk ke sheet "Analisis" saat diekspor ke Excel.
     --------------------------------------------------------------------- */
  let lastAnalysis = null;

  function barList(title, rows) {
    const card = previewEl("div", "pv-card pv-bars");
    card.appendChild(previewEl("div", "pv-bars-t", title));
    if (!rows.length) card.appendChild(previewEl("div", "pv-bar-empty", "—"));
    rows.slice(0, 6).forEach((r) => {
      const row = previewEl("div", "pv-bar");
      const lab = previewEl("div", "pv-bar-l");
      lab.appendChild(previewEl("span", "", r.name));
      lab.appendChild(previewEl("strong", "", `${r.pct.toFixed(0)}% · ${formatRupiah(r.total)}`));
      const track = previewEl("div", "pv-bar-t");
      const fill = document.createElement("i");
      fill.style.width = Math.max(2, Math.min(100, r.pct)) + "%";
      track.appendChild(fill);
      row.append(lab, track);
      card.appendChild(row);
    });
    if (rows.length > 6) card.appendChild(previewEl("div", "pv-bar-more", `+ ${rows.length - 6} lainnya (lihat file Excel)`));
    return card;
  }

  function renderAnalysis(report) {
    const an = window.EventAnalysis.analyze(report, window.EventStore.published());
    lastAnalysis = an;
    const box = previewEl("section", "pv-analysis");
    box.appendChild(previewEl("h3", "pv-h", "Analisis"));
    if (an.notes.length) {
      const ul = previewEl("ul", "pv-notes");
      an.notes.forEach((n) => ul.appendChild(previewEl("li", "", n)));
      box.appendChild(ul);
    }
    const grid = previewEl("div", "pv-an-grid");
    grid.appendChild(barList("Biaya per kategori", an.byCategory));
    grid.appendChild(barList("Biaya per vendor", an.byVendor));
    box.appendChild(grid);

    if (an.itemChecks.length) {
      box.appendChild(previewEl("h4", "pv-h2", "Harga per barang vs event lain (per hari)"));
      const wrap = previewEl("div", "items-table-wrap");
      const table = previewEl("table", "items-table preview-table pv-an-table");
      const head = previewEl("tr");
      ["Nama Barang", "Harga / hari", "Median / hari", "Selisih", "Penilaian"].forEach((h) => head.appendChild(previewEl("th", "", h)));
      table.appendChild(previewEl("thead")).appendChild(head);
      const tb = previewEl("tbody");
      an.itemChecks.forEach((c) => {
        const tr = previewEl("tr", "preview-item-row");
        const td = (t, cls, label) => { const e = previewEl("td", cls || "", t); e.dataset.label = label || ""; return e; };
        tr.appendChild(td(c.itemName || "—", "col-name", "Nama Barang"));
        tr.appendChild(td(formatRupiah(Math.round(c.perDay)), "num", "Harga / hari"));
        tr.appendChild(td(c.median == null ? "—" : formatRupiah(Math.round(c.median)), "num", "Median / hari"));
        tr.appendChild(td(c.diffPct == null ? "—" : (c.diffPct > 0 ? "+" : "") + c.diffPct.toFixed(0) + "%", "num", "Selisih"));
        const v = c.verdict === "Lebih mahal" ? "v-mahal" : c.verdict === "Lebih murah" ? "v-murah" : "";
        tr.appendChild(td(c.verdict + (c.samples ? ` (n=${c.samples})` : ""), "pv-verdict-cell " + v, "Penilaian"));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      wrap.appendChild(table);
      box.appendChild(wrap);
      box.appendChild(previewEl("p", "pv-an-foot", "Pembanding memakai harga per hari (Day + GR) dari barang yang sama di event lain; ≥ 2 data diperlukan. Selisih di atas ±25% ditandai."));
    }
    return box;
  }

  // Tampilan baca-saja untuk "Buka" dari Daftar Event.
  function showReadOnly(ev) {
    shownAt = ev.updatedAt || "";
    titleLabel.textContent = "Laporan:";
    showPreview(ev, { readOnly: true });
  }

  // Tombol ekspor & aksi pada pratinjau / tampilan "Buka".
  (function bindPreviewActions() {
    const msgEl = () => document.getElementById("pv-msg");
    document.getElementById("pv-xlsx").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (!pendingReport) return;
      btn.disabled = true; msgEl().textContent = "Menyiapkan Excel…";
      try {
        await window.EventExport.downloadExcel(pendingReport, lastAnalysis);
        msgEl().textContent = "Excel diunduh.";
      } catch (err) { msgEl().textContent = (err && err.message) || "Gagal membuat Excel."; }
      btn.disabled = false;
      setTimeout(() => { msgEl().textContent = ""; }, 5000);
    });
    document.getElementById("pv-pdf").addEventListener("click", () => {
      if (pendingReport) window.EventExport.printPdf(pendingReport);
    });
    document.getElementById("vw-dup").addEventListener("click", () => {
      try {
        const r = window.EventStore.duplicate(pendingReport.eventId);
        window.location.href = "input.html?edit=" + encodeURIComponent(r.eventId);
      } catch (err) { msgEl().textContent = (err && err.message) || "Gagal menyalin."; }
    });
    const delBtn = document.getElementById("vw-del");
    let t = null;
    delBtn.addEventListener("click", () => {
      if (!t) { delBtn.textContent = "Yakin hapus?"; t = setTimeout(() => { delBtn.textContent = "Hapus"; t = null; }, 3000); return; }
      clearTimeout(t);
      window.EventStore.remove(pendingReport.eventId).catch(() => {});
      window.location.href = "input.html?list=1";
    });
  })();

  function showPreview(report, opts) {
    const readOnly = !!(opts && opts.readOnly);
    pendingReport = report;
    previewError.textContent = "";
    previewBody.innerHTML = "";

    const days = report.eventDays;
    const items = report.items;

    // Total per barang + hitungan status pembayaran.
    let sumTotal = 0, sumDP = 0, sumSisa = 0, nLunas = 0, nDP = 0;
    items.forEach((item) => {
      const total = item.totalPrice || 0;
      const dp = item.nominalDP || 0;
      sumTotal += total;
      sumDP += dp;
      sumSisa += Math.max(0, total - dp);
      if (item.paymentStatus === "Lunas") nLunas++;
      else if (item.paymentStatus === "DP") nDP++;
    });
    const paidPct = sumTotal > 0 ? Math.min(100, Math.round((sumDP / sumTotal) * 100)) : 0;

    // Judul + info singkat (gaya Feasibility).
    previewBody.appendChild(previewEl("h2", "pv-title", `${editEventId && !readOnly ? "Edit Report" : "Input Report"}: ${report.event || "—"}`));
    const meta = previewEl("div", "pv-meta");
    const sameDay = report.eventDate === report.eventDateEnd;
    meta.appendChild(previewInfo("Tanggal Event:", (sameDay
      ? formatDateId(report.eventDate)
      : `${formatDateId(report.eventDate)} sampai ${formatDateId(report.eventDateEnd)}`) + " (di luar GR)"));
    meta.appendChild(previewInfo("Kota:", report.city));
    meta.appendChild(previewInfo("Pengisi Laporan:", report.user));
    if (readOnly && report.eventId) meta.appendChild(previewInfo("ID Event:", report.eventId));
    previewBody.appendChild(meta);

    // Tiga kotak ringkasan: total biaya (biru), barang, durasi.
    const boxes = previewEl("div", "pv-boxes");

    const verdict = previewEl("div", "pv-verdict");
    verdict.appendChild(previewEl("div", "pv-label", "Total biaya event"));
    verdict.appendChild(previewEl("div", "pv-word", formatRupiah(sumTotal)));
    const gauge = previewEl("div", "pv-gauge");
    const bar = document.createElement("i");
    bar.style.width = paidPct + "%";
    gauge.appendChild(bar);
    verdict.appendChild(gauge);
    [["Terbayar", `${formatRupiah(sumDP)} (${paidPct}%)`], ["Sisa pembayaran", formatRupiah(sumSisa)]].forEach(([k, v]) => {
      const gap = previewEl("div", "pv-gap");
      gap.appendChild(previewEl("span", "", k));
      gap.appendChild(previewEl("strong", "", v));
      verdict.appendChild(gap);
    });
    boxes.appendChild(verdict);

    const cardItems = previewEl("div", "pv-card");
    cardItems.appendChild(previewRow("Jumlah barang", items.length));
    cardItems.appendChild(previewRow("Barang Lunas", nLunas));
    cardItems.appendChild(previewRow("Barang DP", nDP));
    boxes.appendChild(cardItems);

    const cardDays = previewEl("div", "pv-card");
    cardDays.appendChild(previewRow("Jumlah Day event", days ? `${days} hari` : "—"));
    cardDays.appendChild(previewRow("Jumlah GR", report.gr));
    cardDays.appendChild(previewRow("Total termasuk GR", days ? `${days + report.gr} hari` : "—", true));
    boxes.appendChild(cardDays);
    previewBody.appendChild(boxes);

    // Tabel barang.
    previewBody.appendChild(previewEl("h3", "pv-h", `Rental Items (${items.length})`));
    if (items.length === 0) {
      previewBody.appendChild(previewEl("p", "no-items-msg", "Tanpa barang — event ini disimpan tanpa item sewa."));
    } else {
      const wrap = previewEl("div", "items-table-wrap");
      const table = previewEl("table", "items-table preview-table");

      const headers = [
        ["No", "col-no"], ["Nama Barang", "col-name"], ["Kategori", "col-cat"],
        ["Nama Vendor", "col-vendor"], ["Status Pembayaran", "col-status"], ["Harga Total (Rp)", "col-price"],
        ["Nominal DP (Rp)", "col-dp"], ["Sisa DP (Rp)", "col-sisa"], ["Keterangan", "col-desc"],
      ];
      const thead = previewEl("thead");
      const headRow = previewEl("tr");
      headers.forEach(([text, cls]) => headRow.appendChild(previewEl("th", cls, text)));
      thead.appendChild(headRow);
      table.appendChild(thead);

      const cell = (text, label, cls) => {
        const td = previewEl("td", cls || "", text === "" || text == null ? "—" : String(text));
        td.dataset.label = label;
        return td;
      };

      const tbody = previewEl("tbody");
      items.forEach((item, i) => {
        const total = item.totalPrice || 0;
        const dp = item.nominalDP || 0;
        const sisa = Math.max(0, total - dp);
        const tr = previewEl("tr", "preview-item-row");
        tr.appendChild(cell(i + 1, "No", "col-no"));
        tr.appendChild(cell(item.itemName, "Nama Barang", "col-name"));
        tr.appendChild(cell(item.category, "Kategori", "col-cat"));
        tr.appendChild(cell(item.vendor, "Nama vendor", "col-vendor"));
        tr.appendChild(cell(item.paymentStatus, "Status Pembayaran", "col-status st-" + String(item.paymentStatus || "").toLowerCase()));
        tr.appendChild(cell(formatRupiah(total), "Harga total", "col-price num"));
        tr.appendChild(cell(formatRupiah(dp), "Nominal DP", "col-dp num"));
        tr.appendChild(cell(formatRupiah(sisa), "Sisa DP", "col-sisa num"));
        tr.appendChild(cell(item.description, "Keterangan", "col-desc"));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      const tfoot = previewEl("tfoot");
      const footRow = previewEl("tr");
      const footLabel = previewEl("td", "foot-label", `Total (${items.length} barang)`);
      footLabel.colSpan = 5;
      footLabel.dataset.label = "";
      footRow.appendChild(footLabel);
      footRow.appendChild(cell(formatRupiah(sumTotal), "Harga total", "col-price num"));
      footRow.appendChild(cell(formatRupiah(sumDP), "Nominal DP", "col-dp num"));
      footRow.appendChild(cell(formatRupiah(sumSisa), "Sisa DP", "col-sisa num"));
      const footBlank = previewEl("td", "col-desc");
      footBlank.dataset.label = "";
      footRow.appendChild(footBlank);
      tfoot.appendChild(footRow);
      table.appendChild(tfoot);

      wrap.appendChild(table);
      previewBody.appendChild(wrap);
    }

    previewBody.appendChild(renderAnalysis(report));

    const submitLabel = (editEventId && !startedNew) ? "Update Report" : "Submit Report";
    previewSubmitBtn.textContent = submitLabel;
    previewSubmitBtn2.textContent = submitLabel;

    // Mode "Buka" (baca saja): tombol simpan diganti Edit / Duplikat / Hapus.
    previewEditBtn.hidden = readOnly;
    previewSubmitBtn.hidden = readOnly;
    previewSubmitBtn2.hidden = readOnly;
    backToList.hidden = readOnly;
    ["vw-list", "vw-edit", "vw-dup", "vw-del"].forEach((id) => { document.getElementById(id).hidden = !readOnly; });
    if (readOnly && report.eventId) document.getElementById("vw-edit").href = "input.html?edit=" + encodeURIComponent(report.eventId);
    document.getElementById("pv-msg").textContent = "";

    form.hidden = true;
    previewSection.hidden = false;
    window.scrollTo(0, 0);
  }

  function hidePreview() {
    previewSection.hidden = true;
    form.hidden = false;
    window.scrollTo(0, 0);
  }

  previewEditBtn.addEventListener("click", () => {
    previewError.textContent = "";
    hidePreview();
  });

  previewSubmitBtn.addEventListener("click", () => {
    if (pendingReport) confirmSubmit(pendingReport);
  });
  previewSubmitBtn2.addEventListener("click", () => previewSubmitBtn.click());

  // Simpan langsung ke penyimpanan bersama (Firestore; lihat js/event-store.js).
  // Data masuk ke daftar & Analytics seketika; bila sedang offline, perubahan
  // disimpan di perangkat dan dikirim otomatis begitu tersambung.
  async function confirmSubmit(report) {
    previewError.textContent = "";
    previewSubmitBtn.disabled = true;
    previewEditBtn.disabled = true;
    try {
      rememberNewItems(report.items);
      await window.EventStore.ready;           // supaya ID event tidak bentrok dengan data yang belum termuat
      clearTimeout(saveTimer); saveTimer = null;
      report.eventId = editEventId || report.eventId || "";
      report.draft = false;                    // Submit = laporan final, masuk Analytics
      selfSaving = true;
      let r; try { r = window.EventStore.save(report); } finally { selfSaving = false; }
      lastSavedAt = r.event.updatedAt; lastSig = "";
      r.done.catch(() => {});
      if (!startedNew) { window.location.href = "input.html?view=" + encodeURIComponent(r.eventId); return; }
      showSuccess();
      resetForm();
      hidePreview();
      editEventId = null; lastSavedAt = "";
      history.replaceState(null, "", "input.html");
      titleLabel.textContent = "Input Report:";
    } catch (err) {
      console.error(err);
      previewError.textContent = "Gagal menyimpan laporan. Silakan coba lagi.";
    }
    previewSubmitBtn.disabled = false;
    previewEditBtn.disabled = false;
  }

  function showSuccess() {
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 4200);
  }

  function resetForm() {
    form.reset();
    itemsContainer.innerHTML = "";
    renumberItems();
    recomputeEventDays();
    form.querySelectorAll(".field").forEach((f) => setError(f, ""));
  }

  // Blok barang kosong pertama ditambahkan lewat Promise.all(...) di atas
  // (baik untuk mode create maupun setelah data event mode edit termuat) —
  // jangan tambahkan lagi di sini, supaya tidak dobel / muncul sebelum
  // data edit selesai dimuat.

  /* ---------------------------------------------------------------------
     Autosave + live edit (seperti Budget & Feasibility)
     - Setiap ketikan disimpan otomatis ke cloud (jeda 0,7 detik).
     - Event baru langsung dapat ID & tampil di Daftar Event sebagai Draft.
     - Perubahan dari pengguna lain di event yang sama langsung masuk ke
       form begitu Anda tidak sedang mengetik (versi terbaru menang, sama
       seperti Budget). Tampilan "Buka" ikut ter-update otomatis.
     --------------------------------------------------------------------- */
  var shownAt = "", saveTimer = null, lastSavedAt = "", lastSig = "", selfSaving = false, applying = false, pendingRemote = null, goneShown = false;
  const ES = window.EventStore;
  const liveNote = document.createElement("span");
  liveNote.className = "sync-note"; liveNote.setAttribute("role", "status");
  document.getElementById("sync-note").after(liveNote);
  let liveTimer = null;
  function notice(text) {
    liveNote.textContent = text; clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { liveNote.textContent = ""; }, 8000);
  }
  function sigOf(r) {
    const c = Object.assign({}, r); delete c.submittedAt; delete c.updatedAt; delete c.isEdit; delete c.draft;
    return JSON.stringify(c);
  }
  function currentSig() { const r = collectReport(); r.items = r.items.filter((it) => !isBlankItem(it)); return sigOf(r); }
  function isBlankItem(it) { return !it.itemName && !it.vendor && !it.totalPrice && !it.category && !it.description; }

  function autosaveNow() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!ES || applying || viewEventId) return;
    if (!form.event.value.trim()) return;          // belum ada nama event: belum disimpan
    const report = collectReport();
    report.items = report.items.filter((it) => !isBlankItem(it));
    const sig = sigOf(report);
    if (sig === lastSig) return;                   // tidak ada perubahan nyata
    ES.ready.then(() => {
      const prev = editEventId ? ES.get(editEventId) : null;
      report.eventId = editEventId || "";
      report.draft = prev ? !!prev.draft : true;   // event baru = Draft sampai Submit
      goneShown = false;
      selfSaving = true;
      let r; try { r = ES.save(report); } finally { selfSaving = false; }
      lastSig = sig; lastSavedAt = r.event.updatedAt;
      r.done.catch(() => {});
      if (!editEventId) {
        editEventId = r.eventId;
        history.replaceState(null, "", "input.html?edit=" + encodeURIComponent(r.eventId));
        titleLabel.textContent = "Edit Report:";
      }
    });
  }
  function scheduleSave() {
    if (applying || viewEventId) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(autosaveNow, 700);
  }
  form.addEventListener("input", scheduleSave);
  form.addEventListener("change", scheduleSave);
  form.addEventListener("focusout", () => { setTimeout(() => { scheduleSave(); applyRemoteIfIdle(); }, 0); });
  new MutationObserver(scheduleSave).observe(itemsContainer, { childList: true });
  const flush = () => { if (saveTimer) autosaveNow(); };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

  function applyRemoteIfIdle() {
    if (!pendingRemote || saveTimer || applying) return;
    const a = document.activeElement;
    if (a && form.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;   // sedang mengetik: tunggu
    const ev = pendingRemote; pendingRemote = null;
    applying = true;
    try {
      populateFormForEdit(ev);
      editOriginalEvent = ev; lastSavedAt = ev.updatedAt || ""; lastSig = currentSig();
      if (!previewSection.hidden) hidePreview();
      notice("Diperbarui dari pengguna lain · " + new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
    } finally { setTimeout(() => { applying = false; lastSig = currentSig(); }, 300); }
  }

  function remoteCheck() {
    if (selfSaving || !ES) return;
    if (viewEventId) {                              // tampilan "Buka": ikuti perubahan terbaru
      const ev = ES.get(viewEventId);
      if (!ev) { if (shownAt && !goneShown) { goneShown = true; previewError.textContent = "Event ini sudah dihapus oleh pengguna lain."; } return; }
      if ((ev.updatedAt || "") === shownAt) return;
      const y = window.scrollY;
      showReadOnly(JSON.parse(JSON.stringify(ev)));
      window.scrollTo(0, y);
      return;
    }
    if (!editEventId) return;
    const cur = ES.get(editEventId);
    if (!cur) {
      if (lastSavedAt && !goneShown) { goneShown = true; notice("Event ini dihapus oleh pengguna lain. Mengetik lagi akan menyimpannya kembali."); }
      return;
    }
    if (!lastSavedAt || (cur.updatedAt || "") <= lastSavedAt) return;   // gema tulisan sendiri / data lebih lama
    pendingRemote = JSON.parse(JSON.stringify(cur));
    applyRemoteIfIdle();
  }
  if (ES) ES.subscribe(remoteCheck);

})();