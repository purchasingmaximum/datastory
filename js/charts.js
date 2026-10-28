/* =========================================================================
   charts.js
   D3-based rendering functions for each analytics section. Every function
   takes a DOM container and clears/redraws into it, so sections can be
   lazily initialized when they scroll into view (see analytics.js).
   ========================================================================= */

const ACCENT = {
  price: "#1F8A70",
  vendorFreq: "#6B4FA0",
  vendorSpend: "#E8552F",
  item: "#C9971F",
  itemVendor: "#233D63",
  time: "#B23A6B",
  lunas: "#1F8A70",
  dp: "#C9971F",
  belum: "#E8552F",
  ink: "#20202A",
  muted: "#8b8a85",
};

/* -------------------------------------------------------------------------
   Theme-aware tokens. The ACCENT colors above stay constant across themes,
   but text/line/stroke colors need to track the light/dark CSS variables
   from style.css (--ink, --muted, --line, --paper) or they render as
   dark-on-dark (or light-on-light) and disappear. Every render function
   below reads a fresh copy of this at the top of its draw, so re-running a
   renderer after a theme toggle picks up the new colors.
   ------------------------------------------------------------------------- */
function themeTokens() {
  const isDark = document.documentElement.dataset.theme === "dark";
  return isDark
    ? { ink: "#f5f5f5", muted: "#a3a3ad", line: "#2b2b31", paper: "#0b0b0d" }
    : { ink: "#1b1b1f", muted: "#6f6d66", line: "#ddd8ce", paper: "#ffffff" };
}

/* -------------------------------------------------------------------------
   Shared tooltip
   ------------------------------------------------------------------------- */
let sharedTooltip = null;
function tooltip() {
  if (sharedTooltip) return sharedTooltip;
  sharedTooltip = d3.select("body")
    .append("div")
    .attr("class", "chart-tooltip")
    .attr("role", "status")
    .attr("aria-live", "polite")
    .style("opacity", 0);
  return sharedTooltip;
}

function showTooltip(event, html) {
  const t = tooltip();
  t.html(html)
    .style("left", event.pageX + 16 + "px")
    .style("top", event.pageY - 12 + "px")
    .transition().duration(120).style("opacity", 1);
}
function moveTooltip(event) {
  tooltip().style("left", event.pageX + 16 + "px").style("top", event.pageY - 12 + "px");
}
function hideTooltip() {
  tooltip().transition().duration(150).style("opacity", 0);
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DUR = prefersReducedMotion ? 0 : 700;

/* -------------------------------------------------------------------------
   Count-up number animation
   ------------------------------------------------------------------------- */
function countUp(el, endValue, { prefix = "", suffix = "", formatter = null, duration = 1400 } = {}) {
  if (prefersReducedMotion) {
    el.textContent = prefix + (formatter ? formatter(endValue) : Math.round(endValue).toLocaleString("id-ID")) + suffix;
    return;
  }
  const start = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const value = endValue * eased;
    el.textContent = prefix + (formatter ? formatter(value) : Math.round(value).toLocaleString("id-ID")) + suffix;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* -------------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------------- */
function clear(container) {
  d3.select(container).selectAll("*").remove();
}
function makeSvg(container, height) {
  const width = container.clientWidth || container.getBoundingClientRect().width;
  return d3.select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .attr("height", height)
    .attr("role", "img");
}

/* -------------------------------------------------------------------------
   Section — Status Pembayaran (donut: Lunas / DP / Belum Dibayar)
   "DP" di sini hanya nominal yang SUDAH dibayarkan sebagai DP; sisa yang
   belum dibayar dari item DP itu digabung ke slice "Belum Dibayar" bersama
   item yang memang sama sekali belum dibayar (summary.outstanding).
   ------------------------------------------------------------------------- */
function renderPaymentDonut(container, summary) {
  clear(container);
  const TH = themeTokens();

  const data = [
    { key: "Lunas", value: summary.lunasTotal, color: ACCENT.lunas },
    { key: "DP", value: summary.dpPaidTotal, color: ACCENT.dp },
    { key: "Belum Dibayar", value: summary.outstanding, color: ACCENT.belum },
  ].filter((d) => d.value > 0);

  if (!data.length) {
    // Pesan kosong ditampilkan sebagai teks biasa (bukan SVG 420px)
    // supaya kartunya tetap kompak dan sejajar dengan kartu "Outstanding
    // Terbesar" di sebelahnya saat kombinasi filter tidak punya data.
    d3.select(container).append("div")
      .attr("class", "chart-empty-msg")
      .text("Belum ada data pembayaran untuk pilihan ini.");
    return;
  }

  const height = 420;
  const svg = makeSvg(container, height);
  const width = container.clientWidth || container.getBoundingClientRect().width;
  const radius = Math.min(width, height) / 2;
  const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

  const total = summary.lunasTotal + summary.dpPaidTotal + summary.outstanding;
  const pie = d3.pie().value((d) => d.value).sort(null);
  const arc = d3.arc().innerRadius(radius * 0.62).outerRadius(radius - 6);
  const arcHover = d3.arc().innerRadius(radius * 0.62).outerRadius(radius + 4);

  g.selectAll("path").data(pie(data)).join("path")
    .attr("d", arc)
    .attr("fill", (d) => d.data.color)
    .attr("stroke", TH.paper)
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseenter", function (event, d) {
      d3.select(this).transition().duration(150).attr("d", arcHover);
      const pct = ((d.data.value / total) * 100).toFixed(1);
      showTooltip(event, `<strong>${d.data.key}</strong><br>${formatRupiah(d.data.value)} (${pct}%)`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", function () {
      d3.select(this).transition().duration(150).attr("d", arc);
      hideTooltip();
    });

  g.append("text").attr("text-anchor", "middle").attr("dy", "-0.15em")
    .attr("fill", TH.ink).style("font-family", "var(--font-display)").style("font-size", "1.5rem")
    .text(formatRupiahCompact(total));
  g.append("text").attr("text-anchor", "middle").attr("dy", "1.5em")
    .attr("fill", TH.muted).style("font-size", "0.75rem").style("letter-spacing", "0.04em")
    .text("TOTAL TERCATAT");
}

/* -------------------------------------------------------------------------
   Section 1 — Event price distribution (strip plot + box overlay)
   ------------------------------------------------------------------------- */
function renderPriceDistribution(container, events, stats) {
  clear(container);
  if (events.length === 0) return;
  const TH = themeTokens();
  const height = 260;
  const margin = { top: 24, right: 24, bottom: 40, left: 24 };
  const svg = makeSvg(container, height);
  const width = container.clientWidth;
  const innerW = width - margin.left - margin.right;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, stats.max * 1.05]).range([0, innerW]);
  const y = height / 2 - margin.top;

  g.append("line").attr("x1", 0).attr("x2", innerW).attr("y1", y).attr("y2", y)
    .attr("stroke", TH.line).attr("stroke-width", 1);

  // box (Q1-Q3) with median line
  g.append("rect")
    .attr("x", x(stats.q1)).attr("width", 0).attr("y", y - 22).attr("height", 44)
    .attr("fill", ACCENT.price).attr("fill-opacity", 0.12).attr("stroke", ACCENT.price)
    .transition().duration(DUR).attr("width", x(stats.q3) - x(stats.q1));

  g.append("line")
    .attr("x1", x(stats.median)).attr("x2", x(stats.median))
    .attr("y1", y - 22).attr("y2", y + 22)
    .attr("stroke", ACCENT.price).attr("stroke-width", 2);

  const axis = d3.axisBottom(x).ticks(5).tickFormat((d) => formatRupiahCompact(d));
  g.append("g").attr("transform", `translate(0,${height - margin.top - margin.bottom + 20})`)
    .call(axis).call((g2) => g2.select(".domain").attr("stroke", TH.line))
    .attr("font-family", "var(--font-sans)").attr("font-size", 12).attr("color", TH.muted);

  const dots = g.selectAll("circle.evt")
    .data(events)
    .join("circle")
    .attr("class", "evt")
    .attr("cx", (d) => x(d.eventPrice))
    .attr("cy", y)
    .attr("r", 0)
    .attr("fill", ACCENT.price)
    .attr("fill-opacity", 0.75)
    .attr("stroke", TH.paper)
    .attr("stroke-width", 1)
    .style("cursor", "pointer");

  dots.transition().duration(DUR).delay((_, i) => i * 12).attr("r", 6);

  dots
    .on("mouseenter", (event, d) => {
      d3.select(event.currentTarget).transition().duration(120).attr("r", 9);
      showTooltip(event, `<strong>${d.event}</strong><br>${formatDateID(d.eventDate)}<br>${formatRupiah(d.eventPrice)}`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", (event) => {
      d3.select(event.currentTarget).transition().duration(120).attr("r", 6);
      hideTooltip();
    });
}

/* -------------------------------------------------------------------------
   Horizontal animated bar list — reused for vendor frequency, vendor
   spending, and item frequency (sections 2, 3, 4).
   ------------------------------------------------------------------------- */
function renderHorizontalBars(container, data, { valueKey, labelKey, color, valueFormatter, tooltipFn, maxBars = 10 }) {
  clear(container);
  const rows = data.slice(0, maxBars);
  if (rows.length === 0) return;
  const TH = themeTokens();
  const barHeight = 34;
  // The row label sits above its bar at y=-6 (see below). At 13px bold the
  // glyph ascenders reach roughly 10px above that baseline, i.e. up to -16
  // relative to the row's top. A 14px gap put the previous row's bar bottom
  // at only -14, so the label text and the bar above it were touching
  // ("mepet") — bump the gap so there's real breathing room between them.
  const gap = 26;
  // top needs room for the label text sitting above the first bar (it was
  // getting clipped by the SVG's top edge when this was too small)
  const margin = { top: 24, right: 96, bottom: 8, left: 4 };
  const height = rows.length * (barHeight + gap) + margin.top + margin.bottom;
  const svg = makeSvg(container, height);
  const width = container.clientWidth;
  const innerW = width - margin.left - margin.right;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const maxVal = d3.max(rows, (d) => d[valueKey]) || 1;
  const x = d3.scaleLinear().domain([0, maxVal]).range([0, innerW]);

  const row = g.selectAll("g.row")
    .data(rows)
    .join("g")
    .attr("class", "row")
    .attr("transform", (_, i) => `translate(0,${i * (barHeight + gap)})`);

  row.append("text")
    .attr("x", 0).attr("y", -6)
    .attr("font-family", "var(--font-sans)").attr("font-size", 13).attr("font-weight", 600)
    .attr("fill", TH.ink)
    .text((d) => d[labelKey]);

  row.append("rect")
    .attr("y", 0).attr("height", barHeight)
    .attr("width", 0).attr("rx", 6)
    .attr("fill", color).attr("fill-opacity", 0.85)
    .style("cursor", "pointer")
    .transition().duration(DUR).delay((_, i) => i * 70)
    .attr("width", (d) => Math.max(2, x(d[valueKey])));

  row.append("text")
    .attr("x", (d) => Math.max(2, x(d[valueKey])) + 10)
    .attr("y", barHeight / 2 + 5)
    .attr("font-family", "var(--font-sans)").attr("font-size", 13)
    .attr("fill", TH.muted)
    .attr("opacity", 0)
    .text((d) => valueFormatter(d[valueKey]))
    .transition().delay((_, i) => i * 70 + DUR * 0.6).duration(300)
    .attr("opacity", 1);

  row.select("rect")
    .on("mouseenter", function (event) { d3.select(this).attr("fill-opacity", 1); })
    .on("mousemove", (event, d) => { moveTooltip(event); })
    .on("mouseenter.tip", (event, d) => showTooltip(event, tooltipFn(d)))
    .on("mouseleave", function (event) { d3.select(this).attr("fill-opacity", 0.85); hideTooltip(); });
}

/* -------------------------------------------------------------------------
   Section 5 — Item x Vendor bubble matrix
   ------------------------------------------------------------------------- */
function renderItemVendorBubbles(container, pairs) {
  clear(container);
  if (pairs.length === 0) return;
  const TH = themeTokens();
  const items = [...new Set(pairs.map((p) => p.itemName))];
  const vendors = [...new Set(pairs.map((p) => p.vendor))];
  const cell = 76;
  const labelRotationDeg = 35;
  const labelAnchorOffset = 70; // distance from the grid's top row up to the label anchor point
  // The vendor labels are rotated, so longer names swing further upward —
  // without enough headroom here they get clipped by the SVG's top edge.
  const maxVendorLabelLen = d3.max(vendors, (d) => d.length) || 0;
  const estCharWidth = 6.4; // approx px/char at 12px sans-serif
  const rotatedLabelSpan = Math.ceil(maxVendorLabelLen * estCharWidth * Math.sin((labelRotationDeg * Math.PI) / 180));
  // Bubbles can grow up to cell/2-6 in radius, and the first vendor column
  // sits at x=0. The item labels are right-aligned toward that column, so
  // they need to end far enough to the left of x=0 that a max-radius
  // bubble in the first column never overlaps the text — previously they
  // ended at a fixed -14, which the biggest bubbles ran straight into.
  const maxRadius = cell / 2 - 6;
  const labelToGridGap = maxRadius + 34;
  const maxItemLabelLen = d3.max(items, (d) => d.length) || 0;
  const estCharWidthItem = 6.6; // approx px/char at 12px sans-serif
  const itemLabelWidth = Math.ceil(maxItemLabelLen * estCharWidthItem);
  const margin = {
    top: Math.max(90, rotatedLabelSpan + 30 + labelAnchorOffset),
    right: 20,
    bottom: 20,
    left: Math.max(170, itemLabelWidth + labelToGridGap + 20),
  };
  const height = items.length * cell + margin.top + margin.bottom;
  const width = Math.max(container.clientWidth, vendors.length * cell + margin.left + margin.right);
  const svg = makeSvg(container, height);
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scalePoint().domain(vendors).range([0, (vendors.length - 1) * cell]).padding(0);
  const y = d3.scalePoint().domain(items).range([0, (items.length - 1) * cell]).padding(0);
  const maxFreq = d3.max(pairs, (d) => d.frequency) || 1;
  const r = d3.scaleSqrt().domain([0, maxFreq]).range([4, maxRadius]);

  g.selectAll("text.vendor-label")
    .data(vendors).join("text").attr("class", "vendor-label")
    .attr("x", (d) => x(d)).attr("y", -labelAnchorOffset)
    .attr("text-anchor", "start")
    .attr("transform", (d) => `rotate(-${labelRotationDeg}, ${x(d)}, -${labelAnchorOffset})`)
    .attr("font-family", "var(--font-sans)").attr("font-size", 12).attr("fill", TH.muted)
    .text((d) => d);

  g.selectAll("text.item-label")
    .data(items).join("text").attr("class", "item-label")
    .attr("x", -labelToGridGap).attr("y", (d) => y(d) + 4)
    .attr("text-anchor", "end")
    .attr("font-family", "var(--font-sans)").attr("font-size", 12).attr("fill", TH.ink)
    .text((d) => d);

  const circ = g.selectAll("circle.pair")
    .data(pairs).join("circle").attr("class", "pair")
    .attr("cx", (d) => x(d.vendor)).attr("cy", (d) => y(d.itemName))
    .attr("r", 0)
    .attr("fill", ACCENT.itemVendor).attr("fill-opacity", 0.75)
    .attr("stroke", TH.paper)
    .style("cursor", "pointer");

  circ.transition().duration(DUR).delay((_, i) => i * 18).attr("r", (d) => r(d.frequency));

  circ
    .on("mouseenter", (event, d) => {
      d3.select(event.currentTarget).attr("fill-opacity", 1);
      showTooltip(event, `<strong>${d.itemName}</strong> — ${d.vendor}<br>Frekuensi: ${d.frequency}×<br>Total pengeluaran: ${formatRupiah(d.totalSpending)}`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", (event) => { d3.select(event.currentTarget).attr("fill-opacity", 0.75); hideTooltip(); });
}

/* -------------------------------------------------------------------------
   Section 6 — Bar minggu/bulan terpadat (vertical)
   ------------------------------------------------------------------------- */
function renderVerticalBars(container, data, { labelKey, valueKey, color }) {
  clear(container);
  if (data.length === 0) return;
  const TH = themeTokens();
  const margin = { top: 20, right: 12, bottom: 34, left: 30 };
  const height = 220;
  const svg = makeSvg(container, height);
  const width = container.clientWidth;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(data.map((d) => d[labelKey])).range([0, innerW]).padding(0.3);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d[valueKey]) || 1]).range([innerH, 0]);
  const maxVal = d3.max(data, (d) => d[valueKey]);

  g.append("g").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSize(0))
    .call((g2) => g2.select(".domain").attr("stroke", TH.line))
    .selectAll("text").attr("font-family", "var(--font-sans)").attr("font-size", 12).attr("fill", TH.muted);

  g.selectAll("rect")
    .data(data).join("rect")
    .attr("x", (d) => x(d[labelKey]))
    .attr("width", x.bandwidth())
    .attr("y", innerH).attr("height", 0)
    .attr("rx", 4)
    .attr("fill", (d) => (d[valueKey] === maxVal ? color : color))
    .attr("fill-opacity", (d) => (d[valueKey] === maxVal ? 1 : 0.45))
    .style("cursor", "pointer")
    .transition().duration(DUR).delay((_, i) => i * 40)
    .attr("y", (d) => y(d[valueKey]))
    .attr("height", (d) => innerH - y(d[valueKey]));

  g.selectAll("rect")
    .on("mouseenter", (event, d) => showTooltip(event, `<strong>${d[labelKey]}</strong><br>${d[valueKey]} event`))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip);
}

/* -------------------------------------------------------------------------
   Section 7 — Pengeluaran + jumlah event dari waktu ke waktu (dual line)
   ------------------------------------------------------------------------- */
function renderTimeline(container, timeline) {
  clear(container);
  if (timeline.length === 0) return;
  const TH = themeTokens();
  const margin = { top: 24, right: 54, bottom: 40, left: 66 };
  const height = 340;
  const svg = makeSvg(container, height);
  const width = container.clientWidth;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scalePoint().domain(timeline.map((d) => d.label)).range([0, innerW]).padding(0.5);
  const ySpend = d3.scaleLinear().domain([0, d3.max(timeline, (d) => d.spending) * 1.15]).range([innerH, 0]);
  const yCount = d3.scaleLinear().domain([0, d3.max(timeline, (d) => d.eventCount) * 1.3]).range([innerH, 0]);

  g.append("g").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSize(0))
    .call((s) => s.select(".domain").attr("stroke", TH.line))
    .selectAll("text").attr("font-family", "var(--font-sans)").attr("font-size", 11).attr("fill", TH.muted);

  g.append("g")
    .call(d3.axisLeft(ySpend).ticks(5).tickFormat(formatRupiahCompact))
    .call((s) => s.select(".domain").remove())
    .selectAll("text").attr("font-family", "var(--font-sans)").attr("font-size", 11).attr("fill", ACCENT.time);

  g.append("g").attr("transform", `translate(${innerW},0)`)
    .call(d3.axisRight(yCount).ticks(5))
    .call((s) => s.select(".domain").remove())
    .selectAll("text").attr("font-family", "var(--font-sans)").attr("font-size", 11).attr("fill", ACCENT.vendorFreq);

  const lineSpend = d3.line().x((d) => x(d.label)).y((d) => ySpend(d.spending)).curve(d3.curveMonotoneX);
  const lineCount = d3.line().x((d) => x(d.label)).y((d) => yCount(d.eventCount)).curve(d3.curveMonotoneX);

  const pathSpend = g.append("path").datum(timeline).attr("fill", "none")
    .attr("stroke", ACCENT.time).attr("stroke-width", 2.5).attr("d", lineSpend);
  const pathCount = g.append("path").datum(timeline).attr("fill", "none")
    .attr("stroke", ACCENT.vendorFreq).attr("stroke-width", 2).attr("stroke-dasharray", "5,4").attr("d", lineCount);

  if (!prefersReducedMotion) {
    for (const path of [pathSpend, pathCount]) {
      const len = path.node().getTotalLength();
      path.attr("stroke-dasharray", path === pathCount ? null : `${len} ${len}`)
        .attr("stroke-dashoffset", path === pathCount ? 0 : len)
        .transition().duration(1100).attr("stroke-dashoffset", 0);
      if (path === pathCount) path.attr("stroke-dasharray", "5,4"); // restore dash style after transition setup
    }
  }

  const focusLine = g.append("line").attr("y1", 0).attr("y2", innerH).attr("stroke", TH.line).attr("opacity", 0);

  const dots = g.selectAll("circle.spend-dot")
    .data(timeline).join("circle").attr("class", "spend-dot")
    .attr("cx", (d) => x(d.label)).attr("cy", (d) => ySpend(d.spending)).attr("r", 4)
    .attr("fill", ACCENT.time);

  const hitArea = g.append("rect").attr("width", innerW).attr("height", innerH).attr("fill", "transparent")
    .style("cursor", "crosshair")
    .on("mousemove", (event) => {
      const [mx] = d3.pointer(event);
      const labels = timeline.map((d) => d.label);
      const step = innerW / (labels.length - 1 || 1);
      const idx = Math.max(0, Math.min(labels.length - 1, Math.round(mx / step)));
      const d = timeline[idx];
      focusLine.attr("x1", x(d.label)).attr("x2", x(d.label)).attr("opacity", 1);
      showTooltip(event, `<strong>${d.label}</strong><br>Total event: ${d.eventCount}<br>Total spending: ${formatRupiah(d.spending)}<br>Rata-rata/event: ${formatRupiah(d.avgPerEvent)}`);
    })
    .on("mouseleave", () => { focusLine.attr("opacity", 0); hideTooltip(); });
}
