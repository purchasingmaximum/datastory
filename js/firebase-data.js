/* =========================================================================
   firebase-data.js — jalur BACA cepat lewat Firestore (REST, tanpa SDK/build).
   Dipasang SETELAH js/data.js. Menimpa 5 fungsi baca di data.js; kalau
   Firestore gagal / belum di-setup, otomatis jatuh ke fungsi asli
   (Apps Script) — jadi situs tidak pernah lebih buruk dari sekarang.
   Simpan/edit (submitEvent) TIDAK diubah: tetap ke Apps Script -> sheet.

   Cara kerja: 1 request kecil ke meta/state (cek "version"). Kalau sama
   dengan salinan di localStorage -> pakai salinan (0 data diunduh).
   Kalau beda -> unduh snapshot baru.
   ========================================================================= */
(function () {
  var FB = {
    projectId: "purchasing-maximum",   // Project ID Firebase
    apiKey: "AIzaSyAEhQvjI0YISOVElhh7yESMaI8520KI000",     // Web API key (aman publik; batasi ke domain github.io)
    timeoutMs: 6000,
    cacheKey: "mx_fs_snapshot_v1"
  };
  if (!FB.projectId || FB.projectId.indexOf("GANTI") === 0) return; // belum di-setup -> jalur lama

  var BASE = "https://firestore.googleapis.com/v1/projects/" + FB.projectId + "/databases/(default)/documents";
  var orig = {
    loadAllEvents: window.loadAllEvents,
    loadEventsList: window.loadEventsList,
    loadEventById: window.loadEventById,
    loadStats: window.loadStats,
    loadDictionaries: window.loadDictionaries
  };

  async function fsGet(path) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FB.timeoutMs);
    try {
      var res = await fetch(BASE + "/" + path + "?key=" + encodeURIComponent(FB.apiKey), { signal: ctrl.signal });
      if (!res.ok) throw new Error("Firestore " + res.status + " (" + path + ")");
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(FB.cacheKey) || "null"); } catch (_) { return null; }
  }
  function writeCache(snap) {
    try { localStorage.setItem(FB.cacheKey, JSON.stringify(snap)); } catch (_) {}
  }

  async function loadSnapshot() {
    var cached = readCache();
    var meta;
    try { meta = await fsGet("meta/state"); }
    catch (err) { if (cached) return cached; throw err; }   // offline/lambat: pakai salinan terakhir

    var f = meta.fields || {};
    var version = f.version && f.version.stringValue;
    var n = Number(f.chunkCount && f.chunkCount.integerValue) || 0;
    if (!version) throw new Error("meta/state tidak valid");
    if (cached && cached.version === version) return cached;

    var paths = [];
    for (var i = 0; i < n; i++) paths.push("snap/events_" + i);
    paths.push("snap/dictionaries");
    var docs = await Promise.all(paths.map(fsGet));

    var events = [];
    for (var j = 0; j < n; j++) events = events.concat(JSON.parse(docs[j].fields.json.stringValue));
    var dictionaries = JSON.parse(docs[n].fields.json.stringValue);

    var snap = { version: version, events: events, dictionaries: dictionaries };
    writeCache(snap);
    return snap;
  }

  var inflight = null;
  function getSnapshot() {
    if (!inflight) inflight = loadSnapshot().catch(function (e) { inflight = null; throw e; });
    return inflight;
  }

  function wrap(name, fromSnap) {
    var fallback = orig[name];
    return async function () {
      var args = arguments;
      try {
        var snap = await getSnapshot();
        return fromSnap.apply(null, [snap].concat([].slice.call(args)));
      } catch (err) {
        console.warn("[firebase-data] " + name + " -> fallback ke Apps Script:", err);
        return fallback.apply(this, args);
      }
    };
  }

  window.loadAllEvents = wrap("loadAllEvents", function (s) { return s.events; });

  window.loadEventsList = wrap("loadEventsList", function (s) {
    return s.events.map(function (ev) {
      return {
        eventId: ev.eventId, event: ev.event, client: ev.client, city: ev.city,
        country: ev.country, eventDate: ev.eventDate, eventDays: ev.eventDays,
        eventPrice: ev.eventPrice, submittedAt: ev.submittedAt, updatedAt: ev.updatedAt,
        itemCount: (ev.items || []).length
      };
    });
  });

  window.loadEventById = wrap("loadEventById", function (s, eventId) {
    var found = s.events.find(function (ev) { return String(ev.eventId) === String(eventId); });
    if (!found) throw new Error("Event tidak ada di snapshot");   // -> fallback ke Apps Script
    return found;
  });

  window.loadStats = wrap("loadStats", function (s) {
    var vendors = new Set(), items = new Set();
    s.events.forEach(function (ev) {
      (ev.items || []).forEach(function (it) {
        if (it.vendor) vendors.add(canonicalKey(it.vendor));
        if (it.itemName) items.add(canonicalKey(it.itemName));
      });
    });
    return { eventCount: s.events.length, vendorCount: vendors.size, itemCount: items.size };
  });

  var dictMemo = null;
  window.loadDictionaries = wrap("loadDictionaries", function (s) {
    var d = s.dictionaries || {};
    if (!(d.items && d.items.length && d.vendors && d.vendors.length)) throw new Error("dictionary kosong");
    dictMemo = dictMemo || { items: d.items, vendors: d.vendors };
    return dictMemo;
  });
})();
