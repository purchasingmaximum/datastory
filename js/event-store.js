/* =========================================================================
   event-store.js — penyimpanan event langsung di Firestore (tanpa
   spreadsheet), memakai pola yang sama dengan halaman Budget & Feasibility:
   Anonymous Auth otomatis + satu "ruang bersama" + cadangan localStorage.

   Dipasang SETELAH js/data.js. Menimpa fungsi-fungsi data.js sehingga
   Input Report, Daftar Event, dan Analytics otomatis membaca/menulis ke
   sumber yang sama dan selalu sinkron:

     loadAllEvents / loadEventsList / loadEventById / loadStats /
     loadDictionaries / submitEvent

   API tambahan (window.EventStore):
     ready            Promise — resolve setelah data pertama tersedia
     all()            semua event (array, lengkap dengan item)
     get(id)          satu event atau null
     save(report)     simpan (baru / edit) -> { eventId, done: Promise }
     duplicate(id)    salin event -> event baru "(salinan)"
     remove(id)       hapus event
     subscribe(fn)    dipanggil tiap data berubah; mengembalikan fungsi berhenti
     status()         { mode: "cloud"|"local"|"connecting", note, text }
     published()      hanya event final (draft tidak ikut) — dipakai Analytics
   ========================================================================= */
(function () {
  "use strict";

  /* ---------- konfigurasi ---------- */
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyDkT8cS__aQXw5PToC9Jf8F7C2zwWbBxCw",
    authDomain: "feasibilitymxm.firebaseapp.com",
    projectId: "feasibilitymxm",
    storageBucket: "feasibilitymxm.firebasestorage.app",
    messagingSenderId: "737498733330",
    appId: "1:737498733330:web:ac7c30d15483900fb771cb"
  };
  var FB_VER = "10.14.1";
  /* Ruang bersama khusus laporan event (terpisah dari ruang Budget & Feasibility).
     Disimpan di collection "projects" yang sama dengan halaman lain, sehingga
     aturan Firestore yang sudah dipakai Budget/Feasibility tetap berlaku. */
  var WORKSPACE = "eTnJNyzUEMfL4q4xDMM5JusiO7_laporan";
  var LOCAL_KEY = "mx_event_store_v1";
  var BOOT_TIMEOUT = 9000;

  /* ---------- state ---------- */
  var events = new Map();           // eventId -> report lengkap
  var listeners = [];
  var fb = null;                    // { fsM, authM, db, user }
  var mode = "connecting", note = "";
  var unsub = null;
  var pendingWrites = 0;
  var cloudUp = false;              // true setelah login + snapshot pertama berhasil
  var fromCache = false;            // snapshot terakhir masih dari cache (belum tersambung server)
  var dirty = new Set();            // id yang disimpan saat cloud belum tersedia -> dikirim begitu tersambung
  var tomb = new Set();             // id yang dihapus saat cloud belum tersedia

  function emit() { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /* ---------- normalisasi satu laporan ---------- */
  function normalize(r) {
    var ev = Object.assign({}, r);
    delete ev.isEdit;
    ev.items = (r.items || []).map(function (it) {
      var total = Math.max(0, num(it.totalPrice));
      var st = it.paymentStatus || "";
      var dp = st === "Lunas" ? total : Math.max(0, Math.min(total, num(it.nominalDP)));
      var out = Object.assign({}, it, { totalPrice: total, quantity: num(it.quantity) > 0 ? num(it.quantity) : 1 });
      if (st) { out.paymentStatus = st; out.nominalDP = dp; out.sisaDP = Math.max(0, total - dp); }
      return out;
    });
    var sum = ev.items.reduce(function (s, i) { return s + i.totalPrice; }, 0);
    ev.eventPrice = sum;
    ev.eventDays = num(ev.eventDays);
    ev.gr = num(ev.gr);
    return ev;
  }

  /* ---------- cache lokal ---------- */
  function readLocal() {
    try {
      var v = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      if (!v || !Array.isArray(v.events)) return [];
      (v.dirty || []).forEach(function (i) { dirty.add(i); });
      (v.tomb || []).forEach(function (i) { tomb.add(i); });
      return v.events;
    } catch (_) { return []; }
  }
  // Sinkron (tanpa jeda) agar tidak hilang bila halaman langsung berpindah setelah simpan/hapus.
  function writeLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ events: Array.from(events.values()), dirty: Array.from(dirty), tomb: Array.from(tomb) })); } catch (_) {}
  }

  /* ---------- ID event: MM-ke-NN-ke-YYYY ---------- */
  function makeEventId(dateStr) {
    var m = /^(\d{4})-(\d{2})/.exec(dateStr || "");
    var d = new Date();
    var yyyy = m ? m[1] : String(d.getFullYear());
    var mm = m ? m[2] : String(d.getMonth() + 1).padStart(2, "0");
    var re = new RegExp("^" + mm + "-ke-(\\d+)-ke-" + yyyy + "$");
    var max = 0;
    events.forEach(function (_, id) { var x = re.exec(id); if (x) max = Math.max(max, parseInt(x[1], 10)); });
    var id;
    do { max++; id = mm + "-ke-" + String(max).padStart(2, "0") + "-ke-" + yyyy; } while (events.has(id));
    return id;
  }

  /* ---------- Firestore ---------- */
  function col() { return fb.fsM.collection(fb.db, "ruang", WORKSPACE, "projects"); }
  function toDoc(ev) {
    return {
      kind: "event", eventId: ev.eventId, event: ev.event || "", client: ev.client || "",
      eventDate: ev.eventDate || "", eventPrice: num(ev.eventPrice),
      updated: Date.parse(ev.updatedAt || ev.submittedAt || "") || Date.now(),
      owner: fb.user ? fb.user.uid : "", data: JSON.stringify(ev)
    };
  }
  function fromDoc(d) {
    try { var ev = JSON.parse(d.data); return ev && ev.eventId ? ev : null; } catch (_) { return null; }
  }

  async function initCloud() {
    var base = "https://www.gstatic.com/firebasejs/" + FB_VER + "/";
    var mods = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    var app = mods[0].initializeApp(FIREBASE_CONFIG);
    var auth = mods[1].getAuth(app);
    var db;
    try { db = mods[2].initializeFirestore(app, { localCache: mods[2].persistentLocalCache() }); }
    catch (_) { db = mods[2].getFirestore(app); }
    fb = { appM: mods[0], authM: mods[1], fsM: mods[2], auth: auth, db: db, user: null };
    var user = await new Promise(function (res) {
      var off = mods[1].onAuthStateChanged(auth, function (u) { off(); res(u); });
    });
    if (!user) user = (await mods[1].signInAnonymously(auth)).user;
    fb.user = user;
  }

  function startListening() {
    return new Promise(function (resolve) {
      var first = true;
      unsub = fb.fsM.onSnapshot(col(), function (snap) {
        var changed = false;
        snap.docChanges().forEach(function (ch) {
          var d = ch.doc.data(), id = ch.doc.id;
          if (!d) { if (ch.type === "removed" && events.delete(id)) changed = true; return; }
          if (d.kind && d.kind !== "event") return;
          if (dirty.has(id) || tomb.has(id)) return;   // perubahan lokal yang belum terkirim didahulukan
          if (ch.type === "removed") { if (events.delete(id)) changed = true; return; }
          var ev = fromDoc(d); if (!ev) return;
          var cur = events.get(id);
          if (cur && (Date.parse(cur.updatedAt || "") || 0) > (Date.parse(ev.updatedAt || "") || 0)) return;  // salinan lokal lebih baru
          events.set(id, ev); changed = true;
        });
        mode = "cloud"; note = ""; cloudUp = true;
        fromCache = !!(snap.metadata && snap.metadata.fromCache);
        // Snapshot yang sudah dikonfirmasi server = sumber kebenaran: buang salinan lokal yang
        // sudah tidak ada di server (mis. dihapus dari perangkat lain), kecuali yang belum terkirim.
        if (!fromCache && snap.docs) {
          var live = new Set();
          snap.docs.forEach(function (dd) { live.add(dd.id); });
          Array.from(events.keys()).forEach(function (id) {
            if (!live.has(id) && !dirty.has(id)) { events.delete(id); changed = true; }
          });
        }
        if (changed) writeLocal();
        if (first) { first = false; flushPending(); resolve(); }
        emit();
      }, function (err) {
        mode = "local"; note = "Gagal membaca cloud (" + ((err && err.code) || "error") + ")"; cloudUp = false;
        if (first) { first = false; resolve(); }
        emit();
      });
    });
  }

  /* ---------- boot ---------- */
  readLocal().forEach(function (ev) { if (ev && ev.eventId) events.set(String(ev.eventId), ev); });
  var hadCache = events.size > 0;

  var ready = new Promise(function (resolve) {
    var done = false, timer;
    var fin = function () { if (!done) { done = true; clearTimeout(timer); resolve(); } };
    timer = setTimeout(function () {
      if (mode === "connecting") { mode = "local"; note = "cloud tidak menjawab — memakai salinan di browser ini"; emit(); }
      fin();
    }, BOOT_TIMEOUT);
    if (hadCache) fin();            // tampil cepat dari salinan; cloud menyusul lewat subscribe()
    initCloud().then(startListening).then(fin).catch(function (e) {
      console.warn("[event-store] cloud tidak tersedia:", e);
      var c = (e && e.code) || "";
      mode = "local";
      note = c === "auth/operation-not-allowed" ? "aktifkan Anonymous di Firebase Authentication"
        : "cloud bermasalah (" + (c || (e && e.message) || "error") + ")";
      emit(); fin();
    });
  });

  /* ---------- operasi tulis ---------- */
  function writeCloud(ev) {
    if (!cloudUp) { dirty.add(ev.eventId); tomb.delete(ev.eventId); writeLocal(); return Promise.resolve(false); }
    pendingWrites++; emit();
    return fb.fsM.setDoc(fb.fsM.doc(col(), ev.eventId), toDoc(ev))
      .then(function () { if (dirty.delete(ev.eventId)) writeLocal(); return true; })
      .catch(function (e) { dirty.add(ev.eventId); writeLocal(); note = "Gagal menyimpan ke cloud (" + ((e && e.code) || "error") + ")"; throw e; })
      .finally(function () { pendingWrites--; emit(); });
  }

  /* kirim perubahan yang tertahan (disimpan/dihapus saat cloud belum tersambung) */
  function flushPending() {
    dirty.forEach(function (id) {
      var ev = events.get(id);
      if (!ev) { dirty.delete(id); return; }
      writeCloud(ev).catch(function () {});
    });
    tomb.forEach(function (id) {
      fb.fsM.deleteDoc(fb.fsM.doc(col(), id)).then(function () { tomb.delete(id); writeLocal(); }).catch(function () {});
    });
  }

  function save(report) {
    var ev = normalize(report);
    var now = new Date().toISOString();
    var prev = ev.eventId ? events.get(String(ev.eventId)) : null;
    if (!ev.eventId) ev.eventId = makeEventId(ev.eventDate);
    ev.eventId = String(ev.eventId);
    ev.submittedAt = (prev && prev.submittedAt) || ev.submittedAt || now;
    ev.updatedAt = now;
    events.set(ev.eventId, ev);
    writeLocal(); emit();
    return { eventId: ev.eventId, event: ev, done: writeCloud(ev) };
  }

  function duplicate(id) {
    var src = events.get(String(id));
    if (!src) throw new Error("Event tidak ditemukan.");
    var copy = JSON.parse(JSON.stringify(src));
    copy.eventId = "";
    copy.event = (src.event || "Event") + " (salinan)";
    delete copy.submittedAt; delete copy.updatedAt; copy.draft = false;
    return save(copy);
  }

  function remove(id) {
    id = String(id);
    var had = events.delete(id);
    dirty.delete(id);
    if (!cloudUp) { tomb.add(id); writeLocal(); emit(); return Promise.resolve(had); }
    writeLocal(); emit();
    pendingWrites++;
    return fb.fsM.deleteDoc(fb.fsM.doc(col(), id))
      .then(function () { return had; })
      .catch(function (e) { tomb.add(id); writeLocal(); note = "Gagal menghapus di cloud (" + ((e && e.code) || "error") + ")"; throw e; })
      .finally(function () { pendingWrites--; emit(); });
  }

  /* ---------- status & API ---------- */
  function status() {
    var text;
    if (mode === "connecting") text = "Menghubungkan ke cloud…";
    else if (mode === "cloud") text = pendingWrites ? "Menyimpan…" : (fromCache || dirty.size || tomb.size) ? "Menunggu sambungan — perubahan aman di perangkat ini" : "Tersimpan di cloud (ruang bersama)";
    else text = "Tersimpan di browser · " + (note || "cloud tidak tersedia");
    return { mode: mode, note: note, pending: pendingWrites, text: text };
  }
  var all = function () { return Array.from(events.values()); };
  var published = function () { return all().filter(function (e) { return !e.draft; }); };
  function summary(ev) {
    return {
      eventId: ev.eventId, event: ev.event, client: ev.client, city: ev.city, country: ev.country,
      eventDate: ev.eventDate, eventDays: ev.eventDays, eventPrice: ev.eventPrice, draft: !!ev.draft,
      submittedAt: ev.submittedAt, updatedAt: ev.updatedAt, itemCount: (ev.items || []).length
    };
  }

  window.EventStore = {
    ready: ready, all: all, published: published, summary: summary,
    get: function (id) { return events.get(String(id)) || null; },
    save: save, duplicate: duplicate, remove: remove, status: status,
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; }
  };

  /* ---------- timpa fungsi data.js ---------- */
  window.loadAllEvents = async function () { await ready; return published(); };
  window.loadEventsList = async function () { await ready; return all().map(summary); };
  window.loadEventById = async function (id) {
    await ready;
    var ev = events.get(String(id));
    if (!ev) throw new Error("Event tidak ditemukan.");
    return JSON.parse(JSON.stringify(ev));
  };
  window.loadStats = async function () {
    await ready;
    var vendors = new Set(), items = new Set(), list = published();
    list.forEach(function (ev) {
      (ev.items || []).forEach(function (it) {
        if (it.vendor) vendors.add(canonicalKey(it.vendor));
        if (it.itemName) items.add(canonicalKey(it.itemName));
      });
    });
    return { eventCount: list.length, vendorCount: vendors.size, itemCount: items.size };
  };
  window.loadDictionaries = async function () {
    return { items: ITEM_DICTIONARY_BUNDLED, vendors: VENDOR_DICTIONARY_BUNDLED };
  };
  window.submitEvent = async function (report) {
    var r = save(report);
    return { ok: true, eventId: r.eventId, updated: !!report.isEdit };
  };
})();
