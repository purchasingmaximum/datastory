/* =========================================================================
   event-export.js — ekspor satu laporan event ke Excel (.xlsx) dan PDF.

   Excel : sheet "Laporan Event" memakai urutan & kolom yang sama dengan form
           Input Report (info event di atas, tabel Rental Items di bawah,
           baris Total berisi rumus SUM). Sheet "Analisis" memuat ringkasan
           kategori, vendor, dan pembanding harga.
   PDF   : memakai dialog cetak browser (Simpan sebagai PDF) pada area
           laporan; gaya cetak ada di css/input-feas.css (@media print).

     EventExport.buildWorkbook(ExcelJS, report, analysis) -> workbook
     EventExport.downloadExcel(report, analysis)         -> Promise (browser)
     EventExport.buildMultiWorkbook(ExcelJS, entries)    -> workbook (Ringkasan + 1 sheet per event)
     EventExport.downloadMultiExcel(entries, namaFile)   -> Promise (browser)
     EventExport.printPdf(report)                        -> void   (browser)
   ========================================================================= */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EventExport = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };

  function longDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    var bln = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return +m[3] + " " + bln[+m[2] - 1] + " " + m[1];
  }
  function safeName(s) { return (String(s || "").replace(/[\\/:*?"<>|]/g, "").trim() || "Laporan Event"); }

  /* ---------- gaya bersama ---------- */
  var thin = { style: "thin", color: { argb: "FFBFBFBF" } };
  var GRID = { left: thin, right: thin, top: thin, bottom: thin };
  var F = { name: "Calibri", size: 10 }, FB = { name: "Calibri", size: 10, bold: true };
  var FH = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  var HEAD = "FF1F4E79", GREY = "FFE7E6E6", LABEL = "FFF2F2F2", ZEBRA = "FFF7F9FC";
  var ACC = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"??_);_(@_)';
  var solid = function (argb) { return { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; };
  var CENTER = { horizontal: "center", vertical: "middle", wrapText: true };
  var LEFT = { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
  var RIGHT = { horizontal: "right", vertical: "middle", indent: 1 };

  /* perkiraan tinggi baris untuk teks yang dibungkus (lebar kolom dalam karakter) */
  function lines(text, width) {
    var w = Math.max(4, Math.floor(width * 1.05)), n = 0;
    String(text == null ? "" : text).split("\n").forEach(function (part) { n += Math.max(1, Math.ceil(part.length / w)); });
    return n;
  }
  function fit(row, texts) {   /* texts: [[teks, lebarKolom], ...] */
    var mx = 1; texts.forEach(function (t) { mx = Math.max(mx, lines(t[0], t[1])); });
    row.height = Math.max(18, mx * 13.5 + 5);
  }
  function sheetName(wb, raw) {   /* maks 31 karakter, tanpa karakter terlarang, unik */
    var base = (String(raw || "").replace(/[\\/?*\[\]:]/g, " ").replace(/\s+/g, " ").trim() || "Event").slice(0, 31).trim();
    var name = base, i = 2;
    var taken = function (n) { return wb.worksheets.some(function (w) { return w.name.toLowerCase() === n.toLowerCase(); }); };
    while (taken(name)) { var suf = " (" + i++ + ")"; name = base.slice(0, 31 - suf.length).trim() + suf; }
    return name;
  }
  function paidOf(it) {
    var total = num(it.totalPrice);
    return it.paymentStatus === "Lunas" ? total : Math.min(total, num(it.nominalDP));
  }
  function sumsOf(items) {
    var t = 0, d = 0;
    items.forEach(function (it) { t += num(it.totalPrice); d += paidOf(it); });
    return { total: t, dp: d, sisa: Math.max(0, t - d) };
  }
  function dateText(report) {
    var sameDay = report.eventDate && report.eventDate === report.eventDateEnd;
    return report.eventDate
      ? (sameDay || !report.eventDateEnd ? longDate(report.eventDate) : longDate(report.eventDate) + " sampai " + longDate(report.eventDateEnd)) + " (di luar GR)"
      : "";
  }

  /* ================= Sheet laporan satu event ================= */
  function addReportSheet(wb, report, name) {
    var items = report.items || [];
    var ws = wb.addWorksheet(name || "Laporan Event", { views: [{ showGridLines: false }] });
    var W = { A: 6, B: 38, C: 18, D: 28, E: 16, F: 19, G: 19, H: 19, I: 38 };
    Object.keys(W).forEach(function (k) { ws.getColumn(k).width = W[k]; });

    ws.mergeCells("A1:I1");
    var t = ws.getCell("A1");
    t.value = "INPUT REPORT  ·  " + (report.event || "-");
    t.font = { name: "Calibri", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
    t.fill = solid(HEAD); t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 32;

    var days = num(report.eventDays);
    var info = [
      ["Pengisi Laporan", report.user || ""],
      ["Kota", report.city || ""],
      ["Tanggal Event", dateText(report)],
      ["Jumlah Day", days || ""],
      ["Jumlah GR", num(report.gr)],
      ["Total Hari (Day + GR)", days ? days + num(report.gr) : ""],
      ["ID Event", report.eventId || ""]
    ];
    info.forEach(function (r, i) {
      var row = 3 + i;
      ws.mergeCells("A" + row + ":B" + row); ws.mergeCells("C" + row + ":F" + row);
      var k = ws.getCell("A" + row); k.value = r[0]; k.font = FB; k.fill = solid(LABEL); k.alignment = LEFT;
      var v = ws.getCell("C" + row); v.value = r[1]; v.font = F; v.alignment = LEFT; if (typeof r[1] === "number") v.numFmt = "0";
      "ABCDEF".split("").forEach(function (c) { ws.getCell(c + row).border = GRID; });
      ws.getRow(row).height = 18;
    });

    var hr = 3 + info.length + 1;
    ws.getCell("A" + hr).value = "Rental Items (" + items.length + ")";
    ws.getCell("A" + hr).font = { name: "Calibri", size: 12, bold: true };
    ws.getRow(hr).height = 22;

    var th = hr + 1;
    ["No", "Nama Barang", "Kategori", "Nama Vendor", "Status Pembayaran", "Harga Total (Rp)", "Nominal DP (Rp)", "Sisa DP (Rp)", "Keterangan"].forEach(function (h, i) {
      var c = ws.getCell(th, i + 1);
      c.value = h; c.font = FH; c.fill = solid(HEAD); c.border = GRID; c.alignment = CENTER;
    });
    ws.getRow(th).height = 32;

    var first = th + 1;
    items.forEach(function (it, i) {
      var r = first + i, total = num(it.totalPrice), dp = paidOf(it);
      var vals = [i + 1, it.itemName || "", it.category || "", it.vendor || "", it.paymentStatus || "", total, dp, null, it.description || ""];
      vals.forEach(function (v, ci) {
        var c = ws.getCell(r, ci + 1);
        if (ci === 7) c.value = { formula: "MAX(0,F" + r + "-G" + r + ")", result: Math.max(0, total - dp) };
        else c.value = v;
        c.font = F; c.border = GRID;
        if (i % 2) c.fill = solid(ZEBRA);
        if (ci >= 5 && ci <= 7) { c.numFmt = ACC; c.alignment = { vertical: "middle" }; }
        else if (ci === 0 || ci === 4) c.alignment = CENTER;
        else c.alignment = LEFT;
      });
      var st = ws.getCell(r, 5);
      if (it.paymentStatus === "Lunas") { st.fill = solid("FFE2F0D9"); st.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF2E7D32" } }; }
      else if (it.paymentStatus === "DP") { st.fill = solid("FFFFF2CC"); st.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF9C6500" } }; }
      fit(ws.getRow(r), [[it.itemName, W.B - 2], [it.category, W.C - 2], [it.vendor, W.D - 2], [it.description, W.I - 2]]);
    });

    var last = first + items.length - 1;
    var tr = items.length ? last + 1 : first;
    var sums = sumsOf(items);
    ws.mergeCells("A" + tr + ":E" + tr);
    var lab = ws.getCell("A" + tr); lab.value = "Total (" + items.length + " barang)"; lab.font = FB; lab.alignment = RIGHT;
    [["F", sums.total], ["G", sums.dp], ["H", sums.sisa]].forEach(function (p) {
      var c = ws.getCell(p[0] + tr);
      c.value = items.length ? { formula: "SUM(" + p[0] + first + ":" + p[0] + last + ")", result: p[1] } : 0;
      c.font = FB; c.numFmt = ACC; c.alignment = { vertical: "middle" };
    });
    "ABCDEFGHI".split("").forEach(function (col) { var c = ws.getCell(col + tr); c.border = GRID; c.fill = solid(GREY); });
    ws.getRow(tr).height = 22;

    /* ringkasan pembayaran: kotak kecil di bawah tabel */
    var sr = tr + 2, pct = sums.total > 0 ? Math.min(1, sums.dp / sums.total) : 0;
    [["Total biaya event", { formula: "F" + tr, result: sums.total }, ACC], ["Terbayar (DP / Lunas)", { formula: "G" + tr, result: sums.dp }, ACC],
     ["Sisa pembayaran", { formula: "H" + tr, result: sums.sisa }, ACC],
     ["Persentase terbayar", { formula: "IF(F" + tr + "=0,0,G" + tr + "/F" + tr + ")", result: pct }, "0%"]].forEach(function (r, i) {
      var row = sr + i;
      ws.mergeCells("A" + row + ":C" + row);
      var k = ws.getCell("A" + row); k.value = r[0]; k.font = FB; k.fill = solid(LABEL); k.alignment = LEFT;
      var v = ws.getCell("D" + row); v.value = r[1]; v.font = FB; v.numFmt = r[2]; v.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      "ABCD".split("").forEach(function (c) { ws.getCell(c + row).border = GRID; });
      ws.getRow(row).height = 18;
    });

    ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: "A1:I" + (sr + 3), printTitlesRow: th + ":" + th,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: th }];
    if (items.length) ws.autoFilter = { from: { row: th, column: 1 }, to: { row: last, column: 9 } };
    return ws;
  }

  /* ================= Sheet analisis satu event ================= */
  function addAnalysisSheet(wb, report, analysis, name) {
    var wa = wb.addWorksheet(name || "Analisis", { views: [{ showGridLines: false }] });
    var W = { A: 38, B: 26, C: 22, D: 22, E: 14, F: 26 };
    Object.keys(W).forEach(function (k) { wa.getColumn(k).width = W[k]; });
    var r = 1;
    wa.mergeCells("A1:F1");
    var title = wa.getCell("A1"); title.value = "ANALISIS  ·  " + (report.event || "-");
    title.font = { name: "Calibri", size: 15, bold: true, color: { argb: "FFFFFFFF" } }; title.fill = solid(HEAD); title.alignment = { vertical: "middle", indent: 1 };
    wa.getRow(1).height = 32; r = 3;

    var section = function (text) { var c = wa.getCell("A" + r); c.value = text; c.font = { name: "Calibri", size: 11, bold: true }; wa.getRow(r).height = 20; r++; };
    var header = function (row, labels) {
      labels.forEach(function (h, i) { var c = wa.getCell(row, i + 1); c.value = h; c.font = FH; c.fill = solid(HEAD); c.border = GRID; c.alignment = CENTER; });
      wa.getRow(row).height = 24;
    };
    var cell = function (row, col, v, fmt, bold, align) {
      var c = wa.getCell(row, col); c.value = v; c.font = bold ? FB : F; c.border = GRID;
      if (fmt) c.numFmt = fmt;
      c.alignment = align || (col === 1 ? LEFT : { vertical: "middle" });
      return c;
    };

    section("Catatan");
    (analysis.notes || []).forEach(function (n) {
      wa.mergeCells("A" + r + ":F" + r);
      var c = wa.getCell("A" + r); c.value = "•  " + n; c.font = F; c.alignment = { wrapText: true, vertical: "top", indent: 1 };
      wa.getRow(r).height = Math.max(18, lines(n, 140) * 13.5 + 5); r++;
    });
    r++;

    var block = function (label, first, rows) {
      section(label);
      header(r, [first, "Total (Rp)", "Jumlah barang", "% dari total"]); r++;
      var s = r;
      rows.forEach(function (g, i) {
        cell(r, 1, g.name); cell(r, 2, g.total, ACC); cell(r, 3, g.count, "0", false, CENTER);
        cell(r, 4, analysis.totals.total > 0 ? g.total / analysis.totals.total : 0, "0.0%", false, CENTER);
        if (i % 2) for (var c = 1; c <= 4; c++) wa.getCell(r, c).fill = solid(ZEBRA);
        fit(wa.getRow(r), [[g.name, W.A - 2]]); r++;
      });
      if (rows.length) {
        cell(r, 1, "Total", null, true).fill = solid(GREY);
        cell(r, 2, { formula: "SUM(B" + s + ":B" + (r - 1) + ")", result: analysis.totals.total }, ACC, true).fill = solid(GREY);
        cell(r, 3, { formula: "SUM(C" + s + ":C" + (r - 1) + ")", result: analysis.totals.count }, "0", true, CENTER).fill = solid(GREY);
        cell(r, 4, { formula: "SUM(D" + s + ":D" + (r - 1) + ")", result: 1 }, "0.0%", true, CENTER).fill = solid(GREY);
        wa.getRow(r).height = 20; r++;
      }
      r++;
    };
    block("Biaya per kategori", "Kategori", analysis.byCategory || []);
    block("Biaya per vendor", "Vendor", analysis.byVendor || []);

    section("Pembanding harga per barang (harga per hari vs median event lain)");
    header(r, ["Nama Barang", "Vendor", "Harga per hari (Rp)", "Median per hari (Rp)", "Selisih", "Penilaian"]); r++;
    (analysis.itemChecks || []).forEach(function (c, i) {
      cell(r, 1, c.itemName || ""); cell(r, 2, c.vendor || "", null, false, LEFT);
      cell(r, 3, Math.round(c.perDay), ACC);
      cell(r, 4, c.median == null ? "-" : Math.round(c.median), ACC, false, c.median == null ? CENTER : null);
      cell(r, 5, c.diffPct == null ? "-" : c.diffPct / 100, "+0%;-0%;0%", false, CENTER);
      var v = cell(r, 6, c.verdict + (c.samples ? " (n=" + c.samples + ")" : ""), null, false, CENTER);
      if (c.verdict === "Lebih mahal") v.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFC00000" } };
      else if (c.verdict === "Lebih murah") v.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF2E7D32" } };
      if (i % 2) for (var k = 1; k <= 6; k++) wa.getCell(r, k).fill = solid(ZEBRA);
      fit(wa.getRow(r), [[c.itemName, W.A - 2], [c.vendor, W.B - 2]]); r++;
    });
    wa.pageSetup = { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return wa;
  }

  function newWorkbook(ExcelJS) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "MAXIMUM THE ULTIMATE"; wb.created = new Date();
    return wb;
  }

  /* satu event: sheet "Laporan Event" + "Analisis" */
  function buildWorkbook(ExcelJS, report, analysis) {
    var wb = newWorkbook(ExcelJS);
    addReportSheet(wb, report, "Laporan Event");
    if (analysis) addAnalysisSheet(wb, report, analysis, "Analisis");
    return wb;
  }

  /* banyak event dalam satu file: sheet "Ringkasan" + satu sheet per event.
     entries: [{ report, analysis? }]  (analysis opsional -> sheet "Analisis" per event) */
  function buildMultiWorkbook(ExcelJS, entries) {
    var wb = newWorkbook(ExcelJS);
    var sum = wb.addWorksheet("Ringkasan", { views: [{ showGridLines: false }] });
    var W = { A: 6, B: 40, C: 18, D: 32, E: 12, F: 19, G: 19, H: 19, I: 12 };
    Object.keys(W).forEach(function (k) { sum.getColumn(k).width = W[k]; });
    sum.mergeCells("A1:I1");
    var t = sum.getCell("A1"); t.value = "RINGKASAN INPUT REPORT  ·  " + entries.length + " event";
    t.font = { name: "Calibri", size: 15, bold: true, color: { argb: "FFFFFFFF" } }; t.fill = solid(HEAD); t.alignment = { vertical: "middle", indent: 1 };
    sum.getRow(1).height = 32;
    var th = 3;
    ["No", "Nama Event", "Kota", "Tanggal Event", "Barang", "Total Biaya (Rp)", "Terbayar (Rp)", "Sisa (Rp)", "Status"].forEach(function (h, i) {
      var c = sum.getCell(th, i + 1); c.value = h; c.font = FH; c.fill = solid(HEAD); c.border = GRID; c.alignment = CENTER;
    });
    sum.getRow(th).height = 28;

    var used = [];
    var first = th + 1;
    entries.forEach(function (en, i) {
      var rep = en.report, items = rep.items || [], sm = sumsOf(items);
      var tab = sheetName(wb, ((i + 1) < 10 ? "0" : "") + (i + 1) + " " + (rep.event || "Event"));
      used.push(tab);
      var r = first + i;
      var tgl = rep.eventDate ? (rep.eventDateEnd && rep.eventDateEnd !== rep.eventDate ? longDate(rep.eventDate) + " – " + longDate(rep.eventDateEnd) : longDate(rep.eventDate)) : "";
      var vals = [i + 1, rep.event || "(Tanpa nama event)", rep.city || "", tgl, items.length, null, null, null, rep.draft ? "Draft" : "Final"];
      vals.forEach(function (v, ci) {
        var c = sum.getCell(r, ci + 1); c.font = F; c.border = GRID;
        if (ci >= 5 && ci <= 7) {
          var key = ["total", "dp", "sisa"][ci - 5];
          c.value = sm[key]; c.numFmt = ACC; c.alignment = { vertical: "middle" };
        } else { c.value = v; c.alignment = (ci === 0 || ci === 4 || ci === 8) ? CENTER : LEFT; }
        if (i % 2) c.fill = solid(ZEBRA);
      });
      var nm = sum.getCell(r, 2);   /* nama event menaut ke sheet-nya */
      nm.value = { text: rep.event || "(Tanpa nama event)", hyperlink: "#'" + tab + "'!A1" };
      nm.font = { name: "Calibri", size: 10, color: { argb: "FF0563C1" }, underline: true }; nm.alignment = LEFT;
      fit(sum.getRow(r), [[rep.event, W.B - 2], [rep.city, W.C - 2], [tgl, W.D - 2]]);

      addReportSheet(wb, rep, tab);
      if (en.analysis) addAnalysisSheet(wb, rep, en.analysis, sheetName(wb, "A" + ((i + 1) < 10 ? "0" : "") + (i + 1) + " Analisis"));
    });

    var last = first + entries.length - 1, tr = last + 1;
    sum.mergeCells("A" + tr + ":D" + tr);
    var lab = sum.getCell("A" + tr); lab.value = "Total (" + entries.length + " event)"; lab.font = FB; lab.alignment = RIGHT;
    var e = sumsOf([].concat.apply([], entries.map(function (x) { return x.report.items || []; })));
    var cnt = sum.getCell("E" + tr); cnt.value = entries.length ? { formula: "SUM(E" + first + ":E" + last + ")", result: entries.reduce(function (a, x) { return a + (x.report.items || []).length; }, 0) } : 0;
    cnt.alignment = { horizontal: "center", vertical: "middle" };
    [["F", e.total], ["G", e.dp], ["H", e.sisa]].forEach(function (p) {
      var c = sum.getCell(p[0] + tr); c.value = entries.length ? { formula: "SUM(" + p[0] + first + ":" + p[0] + last + ")", result: p[1] } : 0; c.numFmt = ACC; c.alignment = { vertical: "middle" };
    });
    "ABCDEFGHI".split("").forEach(function (col) { var c = sum.getCell(col + tr); c.border = GRID; c.fill = solid(GREY); c.font = FB; });
    sum.getRow(tr).height = 22;
    sum.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: th + ":" + th };
    sum.views = [{ showGridLines: false, state: "frozen", ySplit: th }];
    wb.views = [{ activeTab: 0 }];
    return wb;
  }

  /* ---------- bagian browser ---------- */
  function saveBlob(buf, name) {
    var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  async function downloadExcel(report, analysis) {
    if (typeof ExcelJS === "undefined") throw new Error("Pustaka Excel gagal dimuat. Periksa koneksi lalu coba lagi.");
    var buf = await buildWorkbook(ExcelJS, report, analysis).xlsx.writeBuffer();
    saveBlob(buf, safeName(report.event) + " - Laporan Event.xlsx");
  }
  async function downloadMultiExcel(entries, fileName) {
    if (typeof ExcelJS === "undefined") throw new Error("Pustaka Excel gagal dimuat. Periksa koneksi lalu coba lagi.");
    var buf = await buildMultiWorkbook(ExcelJS, entries).xlsx.writeBuffer();
    saveBlob(buf, safeName(fileName || ("Input Report - " + entries.length + " event")) + ".xlsx");
  }
  function printPdf(report) {
    var old = document.title;
    document.title = safeName(report && report.event) + " - Laporan Event";
    window.addEventListener("afterprint", function () { document.title = old; }, { once: true });
    try { window.print(); } catch (e) { document.title = old; }
  }

  return { buildWorkbook: buildWorkbook, buildMultiWorkbook: buildMultiWorkbook, downloadExcel: downloadExcel, downloadMultiExcel: downloadMultiExcel, printPdf: printPdf, safeName: safeName };
});
