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

  function buildWorkbook(ExcelJS, report, analysis) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "MAXIMUM THE ULTIMATE";
    wb.created = new Date();

    var thin = { style: "thin", color: { argb: "FF000000" } };
    var GRID = { left: thin, right: thin, top: thin, bottom: thin };
    var F = { name: "Calibri", size: 10 }, FB = { name: "Calibri", size: 10, bold: true };
    var solid = function (argb) { return { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; };
    var HEAD = "FF1F4E79", GREY = "FFE7E6E6";
    var ACC = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"??_);_(@_)';
    var items = report.items || [];

    /* ================= Sheet 1: Laporan Event ================= */
    var ws = wb.addWorksheet("Laporan Event", { views: [{ showGridLines: false }] });
    [["A", 5], ["B", 34], ["C", 18], ["D", 26], ["E", 12], ["F", 17], ["G", 17], ["H", 17], ["I", 34]].forEach(function (c) { ws.getColumn(c[0]).width = c[1]; });

    ws.mergeCells("A1:I1");
    var t = ws.getCell("A1");
    t.value = "Input Report: " + (report.event || "-");
    t.font = { name: "Calibri", size: 16, bold: true };
    t.alignment = { vertical: "middle" };
    ws.getRow(1).height = 26;

    var sameDay = report.eventDate && report.eventDate === report.eventDateEnd;
    var tgl = report.eventDate
      ? (sameDay || !report.eventDateEnd ? longDate(report.eventDate) : longDate(report.eventDate) + " sampai " + longDate(report.eventDateEnd)) + " (di luar GR)"
      : "";
    var days = num(report.eventDays);
    var info = [
      ["Pengisi Laporan", report.user],
      ["Kota", report.city],
      ["Tanggal Event", tgl],
      ["Jumlah Day", days || ""],
      ["Jumlah GR", num(report.gr)],
      ["Total Hari (Day + GR)", days ? days + num(report.gr) : ""],
      ["ID Event", report.eventId || ""]
    ];
    info.forEach(function (r, i) {
      var row = 3 + i;
      ws.mergeCells("C" + row + ":F" + row);
      var k = ws.getCell("A" + row); ws.mergeCells("A" + row + ":B" + row);
      k.value = r[0] + ":"; k.font = FB;
      var v = ws.getCell("C" + row); v.value = r[1] === undefined ? "" : r[1]; v.font = F; v.alignment = { horizontal: "left" };
    });

    var hr = 3 + info.length + 1;                       // baris judul tabel
    ws.getCell("A" + hr).value = "Rental Items (" + items.length + ")";
    ws.getCell("A" + hr).font = { name: "Calibri", size: 12, bold: true };

    var th = hr + 1;
    ["No", "Nama Barang", "Kategori", "Nama Vendor", "Status Pembayaran", "Harga Total (Rp)", "Nominal DP (Rp)", "Sisa DP (Rp)", "Keterangan"].forEach(function (h, i) {
      var c = ws.getCell(th, i + 1);
      c.value = h; c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = solid(HEAD); c.border = GRID;
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    ws.getRow(th).height = 30;

    var first = th + 1;
    items.forEach(function (it, i) {
      var r = first + i, total = num(it.totalPrice);
      var dp = it.paymentStatus === "Lunas" ? total : Math.min(total, num(it.nominalDP));
      var vals = [i + 1, it.itemName || "", it.category || "", it.vendor || "", it.paymentStatus || "", total, dp, null, it.description || ""];
      vals.forEach(function (v, ci) {
        var c = ws.getCell(r, ci + 1);
        if (ci === 7) c.value = { formula: "MAX(0,F" + r + "-G" + r + ")", result: Math.max(0, total - dp) };
        else c.value = v;
        c.font = F; c.border = GRID;
        if (ci >= 5 && ci <= 7) c.numFmt = ACC;
        if (ci === 0 || ci === 4) c.alignment = { horizontal: "center", vertical: "top" };
        else c.alignment = { vertical: "top", wrapText: true };
      });
    });

    var last = first + items.length - 1;
    var tr = items.length ? last + 1 : first;
    var sums = { total: 0, dp: 0 };
    items.forEach(function (it) { var t2 = num(it.totalPrice); sums.total += t2; sums.dp += it.paymentStatus === "Lunas" ? t2 : Math.min(t2, num(it.nominalDP)); });
    ws.mergeCells("A" + tr + ":E" + tr);
    var lab = ws.getCell("A" + tr); lab.value = "Total (" + items.length + " barang)"; lab.font = FB; lab.alignment = { horizontal: "right" };
    [["F", sums.total], ["G", sums.dp], ["H", Math.max(0, sums.total - sums.dp)]].forEach(function (p) {
      var c = ws.getCell(p[0] + tr);
      c.value = items.length ? { formula: "SUM(" + p[0] + first + ":" + p[0] + last + ")", result: p[1] } : 0;
      c.font = FB; c.numFmt = ACC;
    });
    "ABCDEFGHI".split("").forEach(function (col) { var c = ws.getCell(col + tr); c.border = GRID; c.fill = solid(GREY); if (!c.font) c.font = FB; });

    /* ringkasan pembayaran di bawah tabel */
    var sr = tr + 2;
    var pct = sums.total > 0 ? Math.min(1, sums.dp / sums.total) : 0;
    [["Total biaya event", { formula: "F" + tr, result: sums.total }, ACC], ["Terbayar (DP / Lunas)", { formula: "G" + tr, result: sums.dp }, ACC],
     ["Sisa pembayaran", { formula: "H" + tr, result: Math.max(0, sums.total - sums.dp) }, ACC],
     ["Persentase terbayar", { formula: "IF(F" + tr + "=0,0,G" + tr + "/F" + tr + ")", result: pct }, "0%"]].forEach(function (r, i) {
      ws.mergeCells("A" + (sr + i) + ":B" + (sr + i));
      var k = ws.getCell("A" + (sr + i)); k.value = r[0]; k.font = FB;
      var v = ws.getCell("C" + (sr + i)); v.value = r[1]; v.font = FB; v.numFmt = r[2]; v.alignment = { horizontal: "right" };
    });

    ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: "A1:I" + (sr + 3) };
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: th }];

    /* ================= Sheet 2: Analisis ================= */
    if (analysis) {
      var wa = wb.addWorksheet("Analisis", { views: [{ showGridLines: false }] });
      [["A", 34], ["B", 22], ["C", 18], ["D", 16], ["E", 16], ["F", 20]].forEach(function (c) { wa.getColumn(c[0]).width = c[1]; });
      var r = 1;
      var title = wa.getCell("A" + r); title.value = "Analisis: " + (report.event || "-"); title.font = { name: "Calibri", size: 14, bold: true }; r += 2;

      var header = function (row, labels) {
        labels.forEach(function (h, i) { var c = wa.getCell(row, i + 1); c.value = h; c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } }; c.fill = solid(HEAD); c.border = GRID; c.alignment = { horizontal: "center", wrapText: true }; });
      };
      var cell = function (row, col, v, fmt, bold) { var c = wa.getCell(row, col); c.value = v; c.font = bold ? FB : F; c.border = GRID; if (fmt) c.numFmt = fmt; return c; };

      wa.getCell("A" + r).value = "Catatan"; wa.getCell("A" + r).font = { name: "Calibri", size: 11, bold: true }; r++;
      (analysis.notes || []).forEach(function (n) {
        wa.mergeCells("A" + r + ":F" + r);
        var c = wa.getCell("A" + r); c.value = "• " + n; c.font = F; c.alignment = { wrapText: true, vertical: "top" };
        wa.getRow(r).height = n.length > 95 ? 28 : 15; r++;
      });
      r++;

      var block = function (label, rows) {
        wa.getCell("A" + r).value = label; wa.getCell("A" + r).font = { name: "Calibri", size: 11, bold: true }; r++;
        header(r, [label.indexOf("kategori") >= 0 ? "Kategori" : "Vendor", "Total (Rp)", "Jumlah barang", "% dari total"]); r++;
        var s = r;
        rows.forEach(function (g) {
          cell(r, 1, g.name); cell(r, 2, g.total, ACC); cell(r, 3, g.count).alignment = { horizontal: "center" };
          cell(r, 4, analysis.totals.total > 0 ? g.total / analysis.totals.total : 0, "0.0%"); r++;
        });
        if (rows.length) {
          cell(r, 1, "Total", null, true).fill = solid(GREY);
          cell(r, 2, { formula: "SUM(B" + s + ":B" + (r - 1) + ")", result: analysis.totals.total }, ACC, true).fill = solid(GREY);
          cell(r, 3, { formula: "SUM(C" + s + ":C" + (r - 1) + ")", result: analysis.totals.count }, null, true).fill = solid(GREY);
          cell(r, 4, { formula: "SUM(D" + s + ":D" + (r - 1) + ")", result: 1 }, "0.0%", true).fill = solid(GREY);
          r++;
        }
        r++;
      };
      block("Biaya per kategori", analysis.byCategory || []);
      block("Biaya per vendor", analysis.byVendor || []);

      wa.getCell("A" + r).value = "Pembanding harga per barang (harga per hari vs median event lain)"; wa.getCell("A" + r).font = { name: "Calibri", size: 11, bold: true }; r++;
      header(r, ["Nama Barang", "Vendor", "Harga per hari (Rp)", "Median per hari (Rp)", "Selisih", "Penilaian"]); r++;
      (analysis.itemChecks || []).forEach(function (c) {
        cell(r, 1, c.itemName || ""); cell(r, 2, c.vendor || "");
        cell(r, 3, Math.round(c.perDay), ACC);
        cell(r, 4, c.median == null ? "-" : Math.round(c.median), ACC).alignment = { horizontal: "right" };
        cell(r, 5, c.diffPct == null ? "-" : c.diffPct / 100, "+0%;-0%;0%").alignment = { horizontal: "right" };
        var v = cell(r, 6, c.verdict + (c.samples ? " (n=" + c.samples + ")" : ""));
        if (c.verdict === "Lebih mahal") v.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFC00000" } };
        else if (c.verdict === "Lebih murah") v.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF2E7D32" } };
        r++;
      });
      wa.pageSetup = { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    }
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
  function printPdf(report) {
    var old = document.title;
    document.title = safeName(report && report.event) + " - Laporan Event";
    window.addEventListener("afterprint", function () { document.title = old; }, { once: true });
    try { window.print(); } catch (e) { document.title = old; }
  }

  return { buildWorkbook: buildWorkbook, downloadExcel: downloadExcel, printPdf: printPdf, safeName: safeName };
});
