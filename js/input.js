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
  const editEventId = urlParams.get("edit");
  let editOriginalEvent = null;

  const pageEyebrow = document.getElementById("page-eyebrow");
  const pageTitle = document.getElementById("page-title");
  const pageDesc = document.getElementById("page-desc");
  const backToList = document.getElementById("back-to-list");
  const editModeNote = document.getElementById("edit-mode-note");

  if (editEventId) {
    pageEyebrow.textContent = "EDIT LAPORAN EVENT";
    pageTitle.textContent = "Edit detail event";
    pageDesc.textContent = "Perbaiki data yang salah, atau ubah status pembayaran (mis. DP → Lunas), lalu simpan perubahan.";
    backToList.hidden = false;
    editModeNote.hidden = false;
    submitBtn.textContent = "Update Report";
  }

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

  MaximumLoader.show(editEventId ? "Memuat Data Event" : "Memuat Data Master");
  Promise.all([
    loadDictionaries(),
    editEventId ? loadEventById(editEventId, (attempt, attempts) => {
      MaximumLoader.setLabel(`Masih memuat data event, mencoba lagi… (${attempt}/${attempts})`);
    }) : Promise.resolve(null),
  ]).then(([dicts, ev]) => {
    itemDictionary = dicts.items.slice();
    vendorDictionary = dicts.vendors;
    // Barang baru yang pernah disubmit: cache lokal langsung, sheet
    // ITEM_DICTIONARY menyusul di latar belakang (tidak menahan tampilan form).
    mergeIntoDictionary(readLocalCustomItems());
    loadCustomItems().then(mergeIntoDictionary);

    if (editEventId) {
      if (!ev) throw new Error("Event tidak ditemukan.");
      editOriginalEvent = ev;
      populateFormForEdit(ev);
    } else {
      addItemBlock();
    }
  }).catch((err) => {
    console.error("Failed to load data master / event to edit", err);
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
  async function loadCustomItems() {
    let remote = [];
    if (typeof CONFIG !== "undefined" && CONFIG.API_URL) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`${CONFIG.API_URL}?action=getDictionaries`, { signal: ctrl.signal });
        clearTimeout(timer);
        const payload = await res.json();
        if (payload && Array.isArray(payload.items)) remote = payload.items; // baca ulang sheet (segar), termasuk barang baru dari orang lain
      } catch (err) {
        console.warn("getDictionaries (refresh) gagal, memakai cache lokal saja.", err);
      }
    }
    return remote.concat(readLocalCustomItems());
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

  function attachItemDictionaryCombo(block) {
    const nameInput = block.querySelector('[data-name="itemName"]');
    const categorySelect = block.querySelector('[data-name="category"]');
    populateCategorySelect(categorySelect);

    initGhostAutocomplete(nameInput, {
      getEntries: () => itemDictionary,
      getName: (entry) => entry.namaItemStandar,
      onResolve: (entry, { commit }) => {
        if (entry) applyItemSelection(entry, block, { commit });
        else nameInput.dataset.itemId = ""; // barang baru -> tidak punya kode
      },
    });
  }

  function attachVendorCombo(block) {
    const vendorInput = block.querySelector('[data-name="vendor"]');
    initCombobox(vendorInput, {
      getOptions: (query) => filterByQuery(vendorDictionary, query, "namaVendor", "vendorId"),
      renderLabel: (opt) => opt.namaVendor,
      getValue: (opt) => opt.namaVendor,
      onSelect: () => setError(vendorInput.closest(".field"), ""),
    });
  }

  /* ---------------------------------------------------------------------
     Rupiah-formatted number inputs: store the raw digits, display with
     thousands separators as the user types.
     --------------------------------------------------------------------- */
  function attachRupiahFormatting(input) {
    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "");
      input.value = digits ? Number(digits).toLocaleString("id-ID") : "";
    });
  }
  function rupiahValue(input) {
    const digits = input.value.replace(/\D/g, "");
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
    form.client.value = ev.client || "";
    form.city.value = ev.city || "";
    form.country.value = ev.country || "Indonesia";
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
  }

  function validateTopLevel() {
    let ok = true;
    const requiredText = ["user", "event", "client", "city", "country"];
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
      client: form.client.value.trim(),
      eventPrice: computeTotalEventPrice(),
      eventDate: dateStartInput.value,
      eventDateEnd: dateEndInput.value,
      eventDays: computedEventDays(),
      gr: Number(grInputEl.value),
      city: form.city.value.trim(),
      country: form.country.value.trim(),
      items,
      submittedAt: new Date().toISOString(),
      // Diisi ulang di setiap simpan (submit baru DAN edit) — dipakai label
      // "Terakhir diperbarui" & urutan di Daftar Event.
      updatedAt: new Date().toISOString(),
    };

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
  let headingBackup = null;
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

  function previewList(rows) {
    const dl = previewEl("dl", "preview-list");
    rows.forEach(([label, value]) => {
      const row = previewEl("div", "preview-row");
      row.appendChild(previewEl("dt", "", label));
      row.appendChild(previewEl("dd", "", value === "" || value == null ? "—" : String(value)));
      dl.appendChild(row);
    });
    return dl;
  }

  function previewSectionBlock(title, contentNode) {
    const section = previewEl("section", "preview-section");
    section.appendChild(previewEl("h2", "", title));
    section.appendChild(contentNode);
    return section;
  }

  function showPreview(report) {
    pendingReport = report;
    previewError.textContent = "";
    previewBody.innerHTML = "";

    const days = report.eventDays;
    previewBody.appendChild(previewSectionBlock("Event Information", previewList([
      ["Nama user / pengisi laporan", report.user],
      ["Nama event", report.event],
      ["Nama perusahaan / client", report.client],
      ["Tanggal mulai event (di luar GR)", formatDateId(report.eventDate)],
      ["Tanggal selesai event (di luar GR)", formatDateId(report.eventDateEnd)],
      ["Jumlah day event", days ? `${days} hari` : "—"],
      ["Jumlah GR (General Rehearsal)", report.gr],
      ["Total termasuk GR", days ? `${days + report.gr} hari (${days} event + ${report.gr} GR)` : "—"],
    ])));

    previewBody.appendChild(previewSectionBlock("Location", previewList([
      ["Kota", report.city],
      ["Negara", report.country],
    ])));

    const itemsWrap = previewEl("div", "preview-items");
    if (report.items.length === 0) {
      itemsWrap.appendChild(previewEl("p", "no-items-msg", "Tanpa barang — event ini disimpan tanpa item sewa."));
    } else {
      const wrap = previewEl("div", "items-table-wrap");
      const table = previewEl("table", "items-table preview-table");

      const headers = [
        ["No", "col-no"], ["Nama Barang", "col-name"], ["Kategori", "col-cat"],
        ["Nama vendor", "col-vendor"], ["Status Pembayaran", "col-status"], ["Harga total (Rp)", "col-price"],
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
      let sumTotal = 0;
      let sumDP = 0;
      let sumSisa = 0;
      report.items.forEach((item, i) => {
        const total = item.totalPrice || 0;
        const dp = item.nominalDP || 0;
        const sisa = Math.max(0, total - dp);
        sumTotal += total;
        sumDP += dp;
        sumSisa += sisa;
        const tr = previewEl("tr", "preview-item-row");
        tr.appendChild(cell(i + 1, "No", "col-no"));
        tr.appendChild(cell(item.itemName, "Nama Barang", "col-name"));
        tr.appendChild(cell(item.category, "Kategori", "col-cat"));
        tr.appendChild(cell(item.vendor, "Nama vendor", "col-vendor"));
        tr.appendChild(cell(item.paymentStatus, "Status Pembayaran", "col-status"));
        tr.appendChild(cell(formatRupiah(total), "Harga total", "col-price num"));
        tr.appendChild(cell(formatRupiah(dp), "Nominal DP", "col-dp num"));
        tr.appendChild(cell(formatRupiah(sisa), "Sisa DP", "col-sisa num"));
        tr.appendChild(cell(item.description, "Keterangan", "col-desc"));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      const tfoot = previewEl("tfoot");
      const footRow = previewEl("tr");
      const footLabel = previewEl("td", "foot-label", `Total (${report.items.length} barang)`);
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
      itemsWrap.appendChild(wrap);
    }
    previewBody.appendChild(previewSectionBlock(`Rental Items (${report.items.length})`, itemsWrap));

    if (!headingBackup) {
      headingBackup = {
        eyebrow: pageEyebrow.textContent,
        title: pageTitle.textContent,
        desc: pageDesc.textContent,
      };
    }
    pageEyebrow.textContent = editEventId ? "PRATINJAU PERUBAHAN" : "PRATINJAU LAPORAN";
    pageTitle.textContent = editEventId ? "Periksa sebelum menyimpan perubahan" : "Periksa sebelum submit";
    pageDesc.textContent = editEventId
      ? "Pastikan semua isian sudah benar. Pilih Edit untuk kembali ke form, atau Update Report untuk menyimpan perubahan."
      : "Pastikan semua isian sudah benar. Pilih Edit untuk kembali ke form, atau Submit Report untuk menyimpan laporan.";
    previewSubmitBtn.textContent = editEventId ? "Update Report" : "Submit Report";

    form.hidden = true;
    previewSection.hidden = false;
    window.scrollTo(0, 0);
  }

  function hidePreview() {
    if (headingBackup) {
      pageEyebrow.textContent = headingBackup.eyebrow;
      pageTitle.textContent = headingBackup.title;
      pageDesc.textContent = headingBackup.desc;
      headingBackup = null;
    }
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

  // Submit TANPA layar loading: laporan disimpan ke antrean lokal (instan) lalu
  // dikirim di latar belakang oleh js/outbox.js lewat submitEvent() yang sama.
  // Data boleh telat muncul di Analytics/spreadsheet; kalau pengiriman gagal,
  // data tetap aman di antrean dan dicoba lagi otomatis.
  function confirmSubmit(report) {
    rememberNewItems(report.items);
    const outbox = window.MaximumOutbox;
    const queued = outbox ? outbox.enqueue({ ...report, submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) : null;
    if (!queued) {
      // Penyimpanan lokal tidak tersedia -> pakai jalur lama (menunggu server).
      return confirmSubmitBlocking(report);
    }
    previewSubmitBtn.disabled = true;
    previewEditBtn.disabled = true;
    if (editEventId) {
      // Pengiriman dilanjutkan otomatis oleh halaman Daftar Event.
      window.location.href = "events.html";
      return;
    }
    showSuccess();
    resetForm();
    hidePreview();
    previewSubmitBtn.disabled = false;
    previewEditBtn.disabled = false;
    outbox.flush({ quiet: true });
  }

  // Jalur lama (menunggu server + layar loading). Dipakai hanya sebagai cadangan.
  async function confirmSubmitBlocking(report) {
    rememberNewItems(report.items);
    // Timestamp dicatat saat benar-benar dikirim (bukan saat pratinjau dibuka).
    report.submittedAt = new Date().toISOString();
    report.updatedAt = report.submittedAt;
    previewError.textContent = "";
    previewSubmitBtn.disabled = true;
    previewEditBtn.disabled = true;

    submitBtn.disabled = true;
    submitBtn.textContent = editEventId ? "Menyimpan Perubahan…" : "Menyimpan…";
    MaximumLoader.show("Menyimpan Laporan");
    try {
      await submitEvent(report);
      if (editEventId) {
        MaximumLoader.setLabel("Tersimpan — Kembali ke Daftar Event");
        setTimeout(() => { window.location.href = "events.html"; }, 700);
        return; // biarkan loader tampil sampai redirect
      }
      showSuccess();
      resetForm();
      hidePreview();
    } catch (err) {
      console.error(err);
      formLevelError.textContent = editEventId
        ? "Gagal menyimpan perubahan. Silakan coba lagi."
        : "Gagal menyimpan laporan. Silakan coba lagi.";
      previewError.textContent = formLevelError.textContent;
      // Pengguna tetap di halaman pratinjau dan bisa mencoba lagi / kembali edit.
      previewSubmitBtn.disabled = false;
      previewEditBtn.disabled = false;
      if (editEventId) {
        MaximumLoader.hide();
        submitBtn.disabled = false;
        submitBtn.textContent = "Update Report";
      }
    } finally {
      if (!editEventId) {
        MaximumLoader.hide();
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Report";
        previewSubmitBtn.disabled = false;
        previewEditBtn.disabled = false;
      }
    }
  }

  function showSuccess() {
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 4200);
  }

  function resetForm() {
    form.reset();
    document.getElementById("f-country").value = "Indonesia";
    itemsContainer.innerHTML = "";
    renumberItems();
    recomputeEventDays();
    form.querySelectorAll(".field").forEach((f) => setError(f, ""));
  }

  // Blok barang kosong pertama ditambahkan lewat Promise.all(...) di atas
  // (baik untuk mode create maupun setelah data event mode edit termuat) —
  // jangan tambahkan lagi di sini, supaya tidak dobel / muncul sebelum
  // data edit selesai dimuat.
})();