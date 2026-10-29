/**
 * Code.gs — Google Apps Script backend for MAXIMUM THE ULTIMATE.
 *
 * IMPORTANT:
 * - Data (submit/edit) is written to the existing `EVENTS` and `ITEMS`
 *   sheets.
 * - VENDOR_DICTIONARY adalah sheet referensi READ-ONLY (backend hanya
 *   membaca).
 * - ITEM_DICTIONARY dibaca LIVE untuk dropdown/saran di form, dan HANYA
 *   ditulis satu hal: barang BARU yang diketik bebas di form (nama yang
 *   belum ada di dictionary) ditambahkan sebagai baris baru saat submit —
 *   lihat registerNewItems_(). Baris yang sudah ada tidak pernah diubah
 *   atau dihapus.
 *
 * REVISI (UPDATED AT — "Terakhir diperbarui" ikut berubah saat EDIT):
 * - Sheet EVENTS punya kolom baru ke-12: "UPDATED AT" (kolom L).
 *   Saat event dibuat, nilainya sama dengan SUBMITTED AT. Saat event
 *   diedit (updateEvent_), nilainya diisi ulang dengan waktu SERVER saat
 *   itu, sedangkan SUBMITTED AT asli tetap dipertahankan.
 * - Waktu diambil dari server (bukan dari jam HP/laptop pengguna) supaya
 *   konsisten. Kolom L dibuat otomatis (header + lebar sheet) oleh
 *   ensureUpdatedAtColumn_() saat submit/edit pertama, jadi tidak wajib
 *   ditambah manual. Baris lama yang kolom L-nya kosong otomatis memakai
 *   SUBMITTED AT sebagai UPDATED AT.
 * - readAllEvents_() sekarang mengembalikan field `updatedAt`, dan
 *   getEventsList ikut mengirimkannya. Sync.gs TIDAK perlu diubah: data
 *   event dibaca lewat readAllEvents_() sehingga `updatedAt` otomatis
 *   ikut tersalin ke Firestore.
 * - Perlu deploy versi baru (Deploy -> Manage deployments -> Edit -> New
 *   version) supaya URL /exec yang sama memakai kode ini.
 *
 * REVISI (skema final, sesuai spreadsheet "Data Input" yang sebenarnya):
 * - Kolom QUANTITY DIHAPUS TOTAL dari sheet ITEMS dan dari kode ini. Harga
 *   difokuskan ke tingkat produk+vendor (TOTAL PRICE), bukan per pcs.
 * - Kolom ITEMS A-J: EVENT ID, ITEM ID, ITEM NAME, CATEGORY, VENDOR,
 *   TOTAL PRICE, KETERANGAN, PAYMENT STATUS, NOMINAL DP, SISA DP.
 * - NOMINAL DP & SISA DP diturunkan otomatis di backend dari PAYMENT STATUS:
 *     Lunas       -> NOMINAL DP = TOTAL PRICE, SISA DP = 0
 *     Belum Bayar -> NOMINAL DP = 0,           SISA DP = TOTAL PRICE
 *     DP          -> NOMINAL DP = nilai manual (diklem 0..TOTAL PRICE),
 *                    SISA DP = TOTAL PRICE - NOMINAL DP
 *   Frontend TIDAK perlu (dan sebaiknya tidak) mengirim SISA DP — backend
 *   yang menghitung & menyimpannya supaya konsisten.
 * - REVISI (tanpa kolom Item ID di form): frontend hanya mengirim nama
 *   barang. itemCode terisi bila nama cocok dengan dictionary; bila kosong
 *   berarti barang baru -> backend membuat kode (mis. LGT-N001) dan
 *   menambahkannya ke ITEM_DICTIONARY, sehingga muncul sebagai saran
 *   ghost-text di input berikutnya.
 * - Dropdown "Nama Item" & "Nama Vendor" di form Input Report dibaca LIVE
 *   dari sheet ITEM_DICTIONARY / VENDOR_DICTIONARY lewat
 *   ?action=getDictionaries (lihat readDictionaries_() di bawah). Tidak
 *   ada caching untuk dictionary supaya edit di sheet langsung kelihatan.
 * - Caching supaya "Analytics" & "Daftar Event" tidak selalu membaca ulang
 *   seluruh spreadsheet dari nol setiap request. Cache di-invalidate
 *   otomatis setiap ada submit/update baru lewat doPost.
 */

const SPREADSHEET_ID = "19r-trzLpZchJeL-VpZAGf6Oj4FSm_Iv_byC_LJ-iiN0";
const EVENTS_SHEET_NAME = "EVENTS";
const ITEMS_SHEET_NAME = "ITEMS";
const ITEM_DICTIONARY_SHEET_NAME = "ITEM_DICTIONARY";
const VENDOR_DICTIONARY_SHEET_NAME = "VENDOR_DICTIONARY";

const EVENTS_HEADERS = [
  "EVENT ID", "USER", "EVENT NAME", "CLIENT", "EVENT PRICE", "EVENT DATE",
  "EVENT DAYS", "GR", "CITY", "COUNTRY", "SUBMITTED AT", "UPDATED AT",
];

// Skema ITEMS final (TANPA QUANTITY) — persis kolom A-J di spreadsheet.
const ITEMS_HEADERS = [
  "EVENT ID", "ITEM ID", "ITEM NAME", "CATEGORY", "VENDOR", "TOTAL PRICE",
  "KETERANGAN", "PAYMENT STATUS", "NOMINAL DP", "SISA DP",
];

// Kolom ITEM_DICTIONARY: ITEM ID, KATEGORI, NAMA ITEM STANDAR, SATUAN STANDAR.
const ITEM_DICTIONARY_HEADERS = [
  "ITEM ID", "KATEGORI", "NAMA ITEM STANDAR", "SATUAN STANDAR",
];

// Kolom VENDOR_DICTIONARY: VENDOR ID, NAMA VENDOR.
const VENDOR_DICTIONARY_HEADERS = ["VENDOR ID", "NAMA VENDOR"];

const VALID_PAYMENT_STATUSES = ["Lunas", "DP", "Belum Bayar"];

// Awalan kode untuk barang baru, mengikuti kode dictionary bawaan
// (LED-001, LGT-001, ...). Kode barang baru berbentuk "LGT-N001" supaya
// tidak pernah bentrok dengan kode bawaan/manual. Kategori di luar daftar ini
// memakai awalan "OTH".
const CATEGORY_PREFIX_ = {
  LED: "LED", Lighting: "LGT", Audio: "AUD", Rigging: "RIG", Multimedia: "MMD",
  Effect: "EFF", Documentation: "DOC", Genset: "GEN", Internet: "NET",
};

function ss_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "PASTE_YOUR_SPREADSHEET_ID_HERE") {
    throw new Error("SPREADSHEET_ID belum diisi di Code.gs.");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheets_() {
  const ss = ss_();
  const eventsSheet = ss.getSheetByName(EVENTS_SHEET_NAME);
  const itemsSheet = ss.getSheetByName(ITEMS_SHEET_NAME);

  if (!eventsSheet) throw new Error("Sheet EVENTS tidak ditemukan.");
  if (!itemsSheet) throw new Error("Sheet ITEMS tidak ditemukan.");

  return { eventsSheet, itemsSheet };
}

/**
 * Pastikan sheet EVENTS punya kolom UPDATED AT (kolom ke-12): melebarkan
 * sheet bila kolomnya belum ada, dan mengisi header bila selnya kosong.
 * Aman dipanggil berulang. Dipanggil sebelum menulis (submit/edit) —
 * tanpa ini, menulis 12 kolom ke sheet yang baru punya 11 kolom akan error.
 */
function ensureUpdatedAtColumn_(eventsSheet) {
  const col = EVENTS_HEADERS.indexOf("UPDATED AT") + 1;
  const maxCols = eventsSheet.getMaxColumns();
  if (maxCols < col) {
    eventsSheet.insertColumnsAfter(maxCols, col - maxCols);
  }
  const headerCell = eventsSheet.getRange(1, col);
  if (!String(headerCell.getValue() || "").trim()) {
    headerCell.setValue("UPDATED AT");
  }
}

function setup() {
  const { eventsSheet, itemsSheet } = ensureSheets_();
  ensureUpdatedAtColumn_(eventsSheet);
  return {
    ok: true,
    eventsSheet: eventsSheet.getName(),
    itemsSheet: itemsSheet.getName(),
    message: "Backend terhubung ke EVENTS dan ITEMS (kolom UPDATED AT siap). ITEM_DICTIONARY hanya ditambah baris untuk barang baru dari form.",
  };
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------- */
/* Dictionaries — dibaca LIVE dari sheet ITEM_DICTIONARY & VENDOR_DICTIONARY */
/* setiap kali diminta (tanpa cache), supaya edit manual di sheet langsung  */
/* muncul di dropdown form Input Report tanpa perlu redeploy Apps Script.  */
/* Satu-satunya penulisan: registerNewItems_() menambah barang baru.       */
/* ---------------------------------------------------------------------- */
function readDictionaries_() {
  const ss = ss_();

  const items = [];
  const itemSheet = ss.getSheetByName(ITEM_DICTIONARY_SHEET_NAME);
  if (itemSheet) {
    const rows = itemSheet.getDataRange().getValues();
    // Kolom: 0 ITEM ID, 1 KATEGORI, 2 NAMA ITEM STANDAR, 3 SATUAN STANDAR.
    rows.slice(1)
      .filter((row) => row[0] || row[2])
      .forEach((row) => {
        items.push({
          itemId: String(row[0] || ""),
          kategori: String(row[1] || ""),
          namaItemStandar: String(row[2] || ""),
          satuanStandar: String(row[3] || ""),
        });
      });
  }

  const vendors = [];
  const vendorSheet = ss.getSheetByName(VENDOR_DICTIONARY_SHEET_NAME);
  if (vendorSheet) {
    const rows = vendorSheet.getDataRange().getValues();
    // Kolom: 0 VENDOR ID, 1 NAMA VENDOR.
    rows.slice(1)
      .filter((row) => row[0] || row[1])
      .forEach((row) => {
        vendors.push({
          vendorId: String(row[0] || ""),
          namaVendor: String(row[1] || ""),
          kategoriLayanan: "",
        });
      });
  }

  return { items, vendors };
}

/* ---------------------------------------------------------------------- */
/* Barang baru -> ITEM_DICTIONARY                                          */
/* ---------------------------------------------------------------------- */
function normalizeName_(n) {
  return String(n || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Dipanggil SEBELUM item ditulis ke sheet ITEMS. Hanya menyentuh item yang
 * itemCode-nya kosong (barang yang diketik bebas, tidak cocok dictionary):
 *  - namanya sudah ada di ITEM_DICTIONARY (mis. dibuat orang lain barusan)
 *    -> pakai kodenya, tidak menambah baris;
 *  - belum ada -> buat kode baru (PREFIX-N001, ...) dan tambahkan baris ke
 *    ITEM_DICTIONARY (satuan default "item").
 * itemCode di objek item diisi in-place, jadi buildItemRow_() otomatis
 * menulis kode yang benar ke kolom ITEM ID di sheet ITEMS.
 * Item yang sudah punya itemCode tidak diubah sama sekali.
 */
function registerNewItems_(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.some((it) => !String(it.itemCode || "").trim())) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ss_();
    let sh = ss.getSheetByName(ITEM_DICTIONARY_SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(ITEM_DICTIONARY_SHEET_NAME);
      sh.getRange(1, 1, 1, ITEM_DICTIONARY_HEADERS.length).setValues([ITEM_DICTIONARY_HEADERS]);
      sh.setFrozenRows(1);
    }

    const rows = sh.getLastRow() > 1
      ? sh.getRange(2, 1, sh.getLastRow() - 1, ITEM_DICTIONARY_HEADERS.length).getValues()
      : [];

    const idByName = new Map();
    const counters = {};
    rows.forEach((r) => {
      const name = normalizeName_(r[2]);
      if (name && r[0] && !idByName.has(name)) idByName.set(name, String(r[0]));
      const m = /^([A-Z]+)-N(\d+)$/.exec(String(r[0]));
      if (m) counters[m[1]] = Math.max(counters[m[1]] || 0, Number(m[2]));
    });

    const toAppend = [];
    list.forEach((it) => {
      if (String(it.itemCode || "").trim()) return;
      const key = normalizeName_(it.itemName);
      if (!key) return;

      if (idByName.has(key)) {
        it.itemCode = idByName.get(key);
        return;
      }

      const prefix = CATEGORY_PREFIX_[it.category] || "OTH";
      counters[prefix] = (counters[prefix] || 0) + 1;
      const id = prefix + "-N" + String(counters[prefix]).padStart(3, "0");
      idByName.set(key, id);
      it.itemCode = id;
      toAppend.push([id, it.category || "", String(it.itemName).trim(), "item"]);
    });

    if (toAppend.length) {
      sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, ITEM_DICTIONARY_HEADERS.length)
        .setValues(toAppend);
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------------- */
/* Turunan PAYMENT STATUS -> NOMINAL DP & SISA DP                          */
/* ---------------------------------------------------------------------- */
function derivePaymentFields_(paymentStatus, totalPrice, rawNominalDP) {
  const price = Number(totalPrice) || 0;
  const status = VALID_PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : "Belum Bayar";

  let nominalDP;
  if (status === "Lunas") {
    nominalDP = price;
  } else if (status === "Belum Bayar") {
    nominalDP = 0;
  } else {
    // DP: pakai nilai manual dari form, diklem ke rentang 0..price.
    nominalDP = Number(rawNominalDP) || 0;
    if (nominalDP < 0) nominalDP = 0;
    if (nominalDP > price) nominalDP = price;
  }

  const sisaDP = Math.max(0, price - nominalDP);
  return { paymentStatus: status, nominalDP, sisaDP };
}

/* ---------------------------------------------------------------------- */
/* CACHING — supaya "Analytics" & "Daftar Event" tidak membaca ulang       */
/* seluruh sheet dari nol setiap kali dibuka (ini salah satu penyebab      */
/* utama "memuat data lama"). Cache di-invalidate otomatis setiap ada      */
/* submit/update baru lewat doPost. Dictionary sengaja TIDAK dicache di    */
/* sini supaya edit manual di sheet dictionary langsung muncul.            */
/* ---------------------------------------------------------------------- */
// Versi cache dinaikkan (v3 -> v4) karena bentuk data event bertambah field
// `updatedAt`; cache lama (tanpa field itu) otomatis diabaikan.
const EVENTS_CACHE_KEY = "mx_events_cache_v4";
const EVENTS_CACHE_TTL_SECONDS = 120; // 2 menit

function getEventsCached_() {
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get(EVENTS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // Cache tidak terbaca — lanjut baca langsung dari sheet.
  }

  const events = readAllEvents_();

  try {
    cache.put(EVENTS_CACHE_KEY, JSON.stringify(events), EVENTS_CACHE_TTL_SECONDS);
  } catch (e) {
    // Dataset terlalu besar untuk cache (limit ~100KB/key) — abaikan saja,
    // request tetap berhasil, hanya tidak dipercepat oleh cache.
  }

  return events;
}

function invalidateEventsCache_() {
  try {
    CacheService.getScriptCache().remove(EVENTS_CACHE_KEY);
  } catch (e) {
    // no-op
  }
}

/* ---------------------------------------------------------------------- */
/* GET                                                                      */
/* ---------------------------------------------------------------------- */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;

    // Dipanggil browser SETELAH submit berhasil (fire-and-forget), supaya
    // doPost tetap cepat dan sync ke Firestore jalan di eksekusi terpisah.
    // Aman dipanggil berulang: kalau data tidak berubah, sync di-skip (hash).
    if (action === "sync") {
      return jsonResponse_(syncSafe_());
    }

    if (action === "getAnalytics") {
      return jsonResponse_({ ok: true, events: getEventsCached_() });
    }

    // Daftar event ringkas (TANPA daftar item) untuk halaman "Daftar Event"
    // — jauh lebih ringan/cepat daripada getAnalytics karena tidak perlu
    // mengirim seluruh baris ITEMS ke browser.
    if (action === "getEventsList") {
      const events = getEventsCached_();
      const list = events.map((ev) => ({
        eventId: ev.eventId,
        event: ev.event,
        client: ev.client,
        city: ev.city,
        country: ev.country,
        eventDate: ev.eventDate,
        eventDays: ev.eventDays,
        eventPrice: ev.eventPrice,
        submittedAt: ev.submittedAt,
        updatedAt: ev.updatedAt,
        itemCount: ev.items.length,
      }));
      return jsonResponse_({ ok: true, events: list });
    }

    // Satu event lengkap (dengan item) berdasarkan eventId — dipakai untuk
    // mengisi ulang form Input Report saat tombol "Edit" diklik.
    if (action === "getEventById") {
      const id = String((e.parameter && e.parameter.eventId) || "");
      if (!id) return jsonResponse_({ ok: false, error: "Parameter eventId wajib diisi." });
      const events = getEventsCached_();
      const found = events.find((ev) => String(ev.eventId) === id);
      if (!found) return jsonResponse_({ ok: false, error: "Event tidak ditemukan." });
      return jsonResponse_({ ok: true, event: found });
    }

    // Ringkasan angka saja (jumlah event, vendor unik, jenis barang unik)
    // untuk strip "sekilas" di index.html. TIDAK mengirim daftar event/item
    // sama sekali ke browser (beda dengan getAnalytics) — jauh lebih kecil
    // & lebih cepat di-parse, memakai cache yang sama dengan getAnalytics.
    if (action === "getStats") {
      const events = getEventsCached_();
      const vendors = new Set();
      const items = new Set();
      events.forEach((ev) => {
        ev.items.forEach((it) => {
          const vendorKey = String(it.vendor || "").trim().replace(/\s+/g, " ").toLowerCase();
          const itemKey = String(it.itemName || "").trim().replace(/\s+/g, " ").toLowerCase();
          if (vendorKey) vendors.add(vendorKey);
          if (itemKey) items.add(itemKey);
        });
      });
      return jsonResponse_({
        ok: true,
        eventCount: events.length,
        vendorCount: vendors.size,
        itemCount: items.size,
      });
    }

    // Dictionary item & vendor, dibaca LIVE (tanpa cache) dari sheet
    // ITEM_DICTIONARY & VENDOR_DICTIONARY — dipakai oleh saran ghost-text
    // "Nama Barang" & dropdown searchable "Nama Vendor" di form Input Report.
    // Barang baru dari form otomatis ikut karena sudah ditulis ke sheet.
    if (action === "getDictionaries") {
      const dict = readDictionaries_();
      return jsonResponse_({ ok: true, items: dict.items, vendors: dict.vendors });
    }

    return jsonResponse_({
      ok: true,
      message: "MAXIMUM THE ULTIMATE API aktif. Gunakan ?action=getAnalytics, ?action=getEventsList, ?action=getEventById&eventId=..., ?action=getStats, atau ?action=getDictionaries.",
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/* ---------------------------------------------------------------------- */
/* Read analytics                                                          */
/* ---------------------------------------------------------------------- */
function readAllEvents_() {
  const { eventsSheet, itemsSheet } = ensureSheets_();

  const eventRows = eventsSheet.getDataRange().getValues();
  const events = eventRows.slice(1)
    .filter((row) => row[0])
    .map((row) => {
      const submittedAt = row[10] instanceof Date
        ? row[10].toISOString()
        : String(row[10] || "");
      // UPDATED AT (kolom L). Kosong (baris lama / kolom belum ada) ->
      // pakai SUBMITTED AT, artinya "belum pernah diedit".
      const updatedRaw = row[11];
      const updatedAt = updatedRaw instanceof Date
        ? updatedRaw.toISOString()
        : (String(updatedRaw || "") || submittedAt);

      return {
        eventId: String(row[0]),
        user: row[1],
        event: String(row[2] || ""),
        client: row[3],
        eventPrice: Number(row[4]) || 0,
        eventDate: formatDateOnly_(row[5]),
        eventDays: Number(row[6]) || 0,
        gr: Number(row[7]) || 0,
        city: row[8],
        country: row[9],
        submittedAt: submittedAt,
        updatedAt: updatedAt,
        items: [],
      };
    });

  const byId = new Map(events.map((ev) => [ev.eventId, ev]));
  const itemRows = itemsSheet.getDataRange().getValues();

  // Kolom ITEMS (tanpa QUANTITY):
  // 0 EVENT ID, 1 ITEM ID, 2 ITEM NAME, 3 CATEGORY, 4 VENDOR, 5 TOTAL PRICE,
  // 6 KETERANGAN, 7 PAYMENT STATUS, 8 NOMINAL DP, 9 SISA DP.
  itemRows.slice(1)
    .filter((row) => row[0])
    .forEach((row) => {
      const eventId = String(row[0]);
      const ev = byId.get(eventId);
      if (!ev) return;

      const totalPrice = Number(row[5]) || 0;
      const paymentStatus = row[7] ? String(row[7]) : "";
      // Baris lama tanpa PAYMENT STATUS dibiarkan kosong — ditandai
      // "Tidak Diketahui" oleh frontend, bukan ditebak jadi Lunas/DP.
      const nominalDP = paymentStatus ? (Number(row[8]) || 0) : 0;
      const sisaDP = paymentStatus
        ? (row[9] !== "" && row[9] != null ? Number(row[9]) || 0 : Math.max(0, totalPrice - nominalDP))
        : 0;

      const item = {
        itemCode: row[1],
        itemName: row[2],
        category: row[3],
        vendor: String(row[4] || ""),
        totalPrice: totalPrice,
        description: row[6] || "",
      };
      if (paymentStatus) {
        item.paymentStatus = paymentStatus;
        item.nominalDP = nominalDP;
        item.sisaDP = sisaDP;
      }
      ev.items.push(item);
    });

  return events;
}

function formatDateOnly_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "");
}

/* ---------------------------------------------------------------------- */
/* Susun satu baris ITEMS siap tulis dari sebuah item payload              */
/* ---------------------------------------------------------------------- */
function buildItemRow_(eventId, item) {
  const totalPrice = Number(item.totalPrice) || 0;
  const derived = derivePaymentFields_(item.paymentStatus, totalPrice, item.nominalDP);

  return [
    eventId,
    item.itemCode,
    item.itemName,
    item.category,
    item.vendor,
    totalPrice,
    item.description || "",
    derived.paymentStatus,
    derived.nominalDP,
    derived.sisaDP,
  ];
}

/* ---------------------------------------------------------------------- */
/* Submit report (create) / Update report (edit)                          */
/* ---------------------------------------------------------------------- */
function doPost(e) {
  let payload;

  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonResponse_({ ok: false, error: "Invalid JSON body." });
  }

  try {
    const validationError = validateReport_(payload);
    if (validationError) {
      return jsonResponse_({ ok: false, error: validationError });
    }

    const { eventsSheet, itemsSheet } = ensureSheets_();
    ensureUpdatedAtColumn_(eventsSheet);

    // ---- EDIT: eventId sudah ada dan payload.isEdit=true -> update di
    // tempat (bukan menambah baris baru). Dipakai oleh tombol "Edit" di
    // halaman Daftar Event.
    if (payload.eventId && payload.isEdit) {
      registerNewItems_(payload.items);
      const result = updateEvent_(payload, eventsSheet, itemsSheet);
      if (result.ok) { invalidateEventsCache_(); scheduleSyncSoon_(); }
      return jsonResponse_(result);
    }

    // ---- CREATE (perilaku lama, tidak diubah) ----
    if (!payload.eventId) {
      payload.eventId = makeEventId_(eventsSheet, payload.eventDate);
    }

    // Prevent the exact same event_id from being stored twice.
    const existingIds = eventsSheet.getLastRow() > 1
      ? eventsSheet.getRange(2, 1, eventsSheet.getLastRow() - 1, 1).getValues().flat()
      : [];

    if (existingIds.includes(payload.eventId)) {
      return jsonResponse_({
        ok: true,
        eventId: payload.eventId,
        note: "Duplicate submission ignored.",
      });
    }

    // Barang baru didaftarkan ke ITEM_DICTIONARY + itemCode-nya terisi,
    // SEBELUM baris ITEMS ditulis.
    registerNewItems_(payload.items);

    // Event baru: UPDATED AT = SUBMITTED AT (belum pernah diedit).
    const submittedAt = payload.submittedAt || new Date().toISOString();

    eventsSheet.appendRow([
      payload.eventId,
      payload.user,
      payload.event,
      payload.client,
      payload.eventPrice,
      payload.eventDate,
      payload.eventDays,
      payload.gr,
      payload.city,
      payload.country,
      submittedAt,
      submittedAt,
    ]);

    (Array.isArray(payload.items) ? payload.items : []).forEach((item) => {
      itemsSheet.appendRow(buildItemRow_(payload.eventId, item));
    });

    invalidateEventsCache_();
    scheduleSyncSoon_();
    return jsonResponse_({ ok: true, eventId: payload.eventId });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * Update satu event yang sudah ada: timpa barisnya di EVENTS (SUBMITTED AT
 * asli dipertahankan, tidak ditimpa; UPDATED AT diisi waktu server saat
 * ini), lalu ganti seluruh baris ITEMS milik eventId tsb dengan daftar
 * item yang baru dikirim dari form.
 */
function updateEvent_(payload, eventsSheet, itemsSheet) {
  const data = eventsSheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.eventId)) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex === -1) {
    return { ok: false, error: "Event dengan ID " + payload.eventId + " tidak ditemukan untuk diedit." };
  }

  const originalSubmittedAt = data[rowIndex][10];

  eventsSheet.getRange(rowIndex + 1, 1, 1, EVENTS_HEADERS.length).setValues([[
    payload.eventId,
    payload.user,
    payload.event,
    payload.client,
    payload.eventPrice,
    payload.eventDate,
    payload.eventDays,
    payload.gr,
    payload.city,
    payload.country,
    originalSubmittedAt,
    new Date().toISOString(),   // UPDATED AT — waktu server saat edit disimpan
  ]]);

  // Ganti semua baris ITEMS milik eventId ini: simpan baris milik event
  // LAIN apa adanya, buang baris lama milik eventId ini, lalu tulis ulang
  // item yang baru dikirim dari form edit.
  const itemsData = itemsSheet.getDataRange().getValues();
  const header = itemsData.length ? itemsData[0] : ITEMS_HEADERS;
  const keptRows = itemsData.slice(1).filter((row) => String(row[0]) !== String(payload.eventId));

  itemsSheet.clearContents();
  itemsSheet.getRange(1, 1, 1, header.length).setValues([header]);
  if (keptRows.length) {
    itemsSheet.getRange(2, 1, keptRows.length, header.length).setValues(keptRows);
  }

  (Array.isArray(payload.items) ? payload.items : []).forEach((item) => {
    itemsSheet.appendRow(buildItemRow_(payload.eventId, item));
  });

  return { ok: true, eventId: payload.eventId, updated: true };
}

function makeEventId_(eventsSheet, eventDate) {
  const d = new Date(eventDate);
  if (isNaN(d.getTime())) throw new Error("eventDate tidak valid.");

  const tz = Session.getScriptTimeZone();
  const month = Utilities.formatDate(d, tz, "MM");
  const year = Utilities.formatDate(d, tz, "yyyy");

  let count = 0;
  if (eventsSheet.getLastRow() > 1) {
    const dates = eventsSheet
      .getRange(2, 6, eventsSheet.getLastRow() - 1, 1)
      .getValues()
      .flat();

    dates.forEach((v) => {
      if (!v) return;
      const rowDate = v instanceof Date ? v : new Date(v);
      if (!isNaN(rowDate.getTime()) &&
          Utilities.formatDate(rowDate, tz, "MM-yyyy") === `${month}-${year}`) {
        count += 1;
      }
    });
  }

  return `${String(count + 1).padStart(3, "0")}-${month}-${year}`;
}

function validateReport_(p) {
  if (!p) return "Empty payload.";

  const requiredStrings = [
    "user", "event", "client", "eventDate", "eventDateEnd", "city", "country",
  ];

  for (const key of requiredStrings) {
    if (!p[key] || typeof p[key] !== "string" || !p[key].trim()) {
      return "Missing or invalid field: " + key;
    }
  }

  const start = new Date(p.eventDate);
  const end = new Date(p.eventDateEnd);
  if (isNaN(start.getTime())) return "Invalid eventDate.";
  if (isNaN(end.getTime())) return "Invalid eventDateEnd.";
  if (end < start) return "eventDateEnd must not be before eventDate.";

  if (typeof p.eventPrice !== "number" || p.eventPrice < 0) {
    return "Invalid eventPrice.";
  }
  if (!Number.isInteger(p.eventDays) || p.eventDays < 1) {
    return "eventDays must be an integer >= 1.";
  }
  if (!Number.isInteger(p.gr) || p.gr < 0) {
    return "gr must be an integer >= 0.";
  }
  if (p.items && !Array.isArray(p.items)) {
    return "items must be an array.";
  }

  for (const item of p.items || []) {
    // itemCode BOLEH kosong: barang baru dibuatkan kodenya oleh registerNewItems_().
    if (!item.itemName || !item.category || !item.vendor) {
      return "Every item needs itemName, category, and vendor.";
    }
    if (typeof item.totalPrice !== "number" || item.totalPrice < 0) {
      return "Every item's totalPrice must be a non-negative number.";
    }
    if (item.paymentStatus && !VALID_PAYMENT_STATUSES.includes(item.paymentStatus)) {
      return "Every item's paymentStatus must be one of: Lunas, DP, Belum Bayar.";
    }
  }

  return null;
}
