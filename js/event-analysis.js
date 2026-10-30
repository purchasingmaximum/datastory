/* =========================================================================
   event-analysis.js — analisis satu event dibandingkan dengan seluruh data
   event lain yang tersimpan. Fungsi murni (tanpa DOM) sehingga dipakai oleh
   pratinjau di Input Report, halaman "Buka" event, dan sheet "Analisis" di
   file Excel.

     EventAnalysis.analyze(report, allEvents) -> {
       totals, byCategory[], byVendor[], eventBenchmark, itemChecks[], notes[]
     }
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EventAnalysis = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var canon = function (s) { return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    var rank = p * (sorted.length - 1), lo = Math.floor(rank), hi = Math.ceil(rank);
    return lo === hi ? sorted[lo] : sorted[lo] * (1 - (rank - lo)) + sorted[hi] * (rank - lo);
  }
  var median = function (arr) { return percentile(arr.slice().sort(function (a, b) { return a - b; }), 0.5); };
  var rp = function (n) { return "Rp " + Math.round(num(n)).toLocaleString("id-ID"); };

  /* hari total = hari event + GR; dipakai untuk membandingkan harga lintas event secara adil */
  function dayCount(ev) {
    var d = num(ev && ev.eventDays) + num(ev && ev.gr);
    return d > 0 ? d : 1;
  }

  function itemTotals(items) {
    var total = 0, paid = 0, nLunas = 0, nDP = 0;
    (items || []).forEach(function (it) {
      var t = num(it.totalPrice);
      var p = it.paymentStatus === "Lunas" ? t : Math.min(t, num(it.nominalDP));
      total += t; paid += p;
      if (it.paymentStatus === "Lunas") nLunas++; else if (it.paymentStatus === "DP") nDP++;
    });
    return { total: total, paid: paid, sisa: Math.max(0, total - paid), nLunas: nLunas, nDP: nDP, count: (items || []).length };
  }

  function groupBy(items, keyFn, labelFn, total) {
    var map = {};
    (items || []).forEach(function (it) {
      var k = canon(keyFn(it)) || "(tanpa nama)";
      if (!map[k]) map[k] = { name: labelFn(it) || "(tanpa nama)", total: 0, count: 0 };
      map[k].total += num(it.totalPrice); map[k].count++;
    });
    return Object.keys(map).map(function (k) {
      var g = map[k]; g.pct = total > 0 ? g.total / total * 100 : 0; return g;
    }).sort(function (a, b) { return b.total - a.total; });
  }

  function analyze(report, allEvents) {
    report = report || {};
    var items = report.items || [];
    var others = (allEvents || []).filter(function (e) { return String(e.eventId) !== String(report.eventId || "\u0000"); });
    var totals = itemTotals(items);
    var days = dayCount(report);

    var byCategory = groupBy(items, function (i) { return i.category; }, function (i) { return i.category; }, totals.total);
    var byVendor = groupBy(items, function (i) { return i.vendor; }, function (i) { return i.vendor; }, totals.total);

    /* --- benchmark total biaya event terhadap event lain --- */
    var prices = others.map(function (e) { return num(e.eventPrice) || itemTotals(e.items).total; }).filter(function (v) { return v > 0; });
    var sortedPrices = prices.slice().sort(function (a, b) { return a - b; });
    var eventBenchmark = null;
    if (sortedPrices.length >= 2 && totals.total > 0) {
      var below = sortedPrices.filter(function (v) { return v < totals.total; }).length;
      var q1 = percentile(sortedPrices, 0.25), q3 = percentile(sortedPrices, 0.75), med = percentile(sortedPrices, 0.5);
      eventBenchmark = {
        n: sortedPrices.length, median: med, q1: q1, q3: q3,
        percentileRank: Math.round(below / sortedPrices.length * 100),
        level: totals.total > q3 ? "tinggi" : totals.total < q1 ? "rendah" : "wajar",
        diffPct: med > 0 ? (totals.total - med) / med * 100 : 0
      };
    }

    /* --- pembanding harga per barang (harga per hari, dari event lain, barang yang sama) --- */
    var byItem = {};
    others.forEach(function (e) {
      var d = dayCount(e);
      (e.items || []).forEach(function (it) {
        var k = canon(it.itemName), t = num(it.totalPrice);
        if (!k || t <= 0) return;
        (byItem[k] = byItem[k] || []).push({ perDay: t / d, vendor: canon(it.vendor) });
      });
    });
    var itemChecks = items.map(function (it) {
      var k = canon(it.itemName), t = num(it.totalPrice), perDay = t / days;
      var pool = byItem[k] || [];
      var sameVendor = pool.filter(function (x) { return x.vendor && x.vendor === canon(it.vendor); });
      var useVendor = sameVendor.length >= 2;
      var ref = useVendor ? sameVendor : pool;
      var out = { itemName: it.itemName, vendor: it.vendor, totalPrice: t, perDay: perDay, samples: ref.length, basis: useVendor ? "vendor" : "semua vendor", median: null, diffPct: null, verdict: "Belum ada pembanding" };
      if (ref.length >= 2 && t > 0) {
        var med = median(ref.map(function (x) { return x.perDay; }));
        out.median = med;
        out.diffPct = med > 0 ? (perDay - med) / med * 100 : 0;
        out.verdict = out.diffPct > 25 ? "Lebih mahal" : out.diffPct < -25 ? "Lebih murah" : "Wajar";
      }
      return out;
    });

    /* --- catatan ringkas dalam kalimat --- */
    var notes = [];
    if (totals.count === 0) notes.push("Event ini belum punya barang sewa.");
    if (byCategory[0] && totals.total > 0) notes.push("Kategori terbesar: " + byCategory[0].name + " (" + byCategory[0].pct.toFixed(0) + "% dari total biaya).");
    if (byVendor[0] && totals.total > 0) {
      var top = byVendor[0];
      notes.push("Vendor terbesar: " + top.name + " (" + top.pct.toFixed(0) + "% dari total)." + (top.pct >= 50 && byVendor.length > 1 ? " Ketergantungan pada satu vendor cukup tinggi." : ""));
    }
    if (eventBenchmark) {
      var lv = eventBenchmark.level === "tinggi" ? "di atas rentang umum (Q3)" : eventBenchmark.level === "rendah" ? "di bawah rentang umum (Q1)" : "dalam rentang umum (Q1–Q3)";
      notes.push("Total biaya " + rp(totals.total) + " " + lv + " dari " + eventBenchmark.n + " event lain; median " + rp(eventBenchmark.median) + ".");
    }
    var mahal = itemChecks.filter(function (c) { return c.verdict === "Lebih mahal"; });
    var murah = itemChecks.filter(function (c) { return c.verdict === "Lebih murah"; });
    if (mahal.length) notes.push(mahal.length + " barang lebih dari 25% di atas median harga per hari: " + mahal.slice(0, 3).map(function (c) { return c.itemName; }).join(", ") + (mahal.length > 3 ? ", dll." : "."));
    if (murah.length) notes.push(murah.length + " barang lebih dari 25% di bawah median harga per hari.");
    if (totals.sisa > 0) notes.push("Masih ada sisa pembayaran " + rp(totals.sisa) + " (" + (totals.total ? (totals.sisa / totals.total * 100).toFixed(0) : 0) + "% dari total).");
    else if (totals.count) notes.push("Seluruh barang sudah lunas.");

    return { totals: totals, days: days, byCategory: byCategory, byVendor: byVendor, eventBenchmark: eventBenchmark, itemChecks: itemChecks, notes: notes };
  }

  return { analyze: analyze, itemTotals: itemTotals, canon: canon, rp: rp };
});
