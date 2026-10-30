/* =========================================================================
   analytics.js — orchestrates the "visual essay": loads data, lets the
   person filter by date range (global control at the top of the page),
   recomputes every aggregate from the filtered dataset, then lazily
   renders each section's chart as it scrolls into view (Intersection
   Observer), and drives the progress rail.

   Everything that depends on the dataset (hero numbers, every chart, the
   payment-status donut, the outstanding list, the "needs attention" list)
   is rebuilt from scratch by applyFilter() whenever the date range changes
   — there is exactly one place (computeView) that turns a list of events
   into every number this page shows, so a new filter never needs a second
   copy of the formulas.
   ========================================================================= */

(async function () {
  const loadingState = document.getElementById("loading-state");
  const storyContent = document.getElementById("story-content");
  const progressRail = document.getElementById("progress-rail");
  const filterBar = document.getElementById("filter-bar");

  let rawEvents;
  try {
    rawEvents = ensurePaymentFields(await loadAllEvents((attempt, attempts) => {
      const labelEl = loadingState.querySelector(".mx-label");
      if (labelEl) labelEl.textContent = `Masih memuat, mencoba lagi… (${attempt}/${attempts})`;
    }));
  } catch (err) {
    console.error(err);
    loadingState.innerHTML = "<p>Gagal memuat data. Periksa koneksi internet lalu muat ulang halaman.</p>";
    return;
  }

  loadingState.hidden = true;
  storyContent.hidden = false;
  progressRail.hidden = false;
  filterBar.hidden = false;

  const lastUpdated = getLastUpdated(rawEvents);
  if (lastUpdated) {
    const { date, time } = formatDateTimeID(lastUpdated);
    document.getElementById("last-updated-value").textContent = `${date}, ${time}`;
  }

  /* -----------------------------------------------------------------------
     Filter bar — presets and custom range.
     ----------------------------------------------------------------------- */
  const fromInput = document.getElementById("filter-from");
  const toInput = document.getElementById("filter-to");
  const applyBtn = document.getElementById("btn-apply-filter");
  const presetButtons = [...document.querySelectorAll("#filter-presets button")];
  const rangeLabelEl = document.getElementById("filter-range-label");
  const filterBarSentinel = document.getElementById("filter-bar-sentinel");

  let activeFrom = null;
  let activeTo = null;

  function setPresetActive(key) {
    presetButtons.forEach((b) => b.classList.toggle("active", b.dataset.preset === key));
  }

  // Re-filtering re-renders every section already seen (see applyFilter),
  // which changes their height (a shorter "Outstanding Terbesar" list,
  // etc). Left alone, that shifts all the content below it and the page
  // visibly jumps even though the person didn't scroll. Snapping back to
  // the exact scroll offset right after the re-render keeps whatever
  // section they were looking at in the same spot on screen.
  function withScrollPreserved(fn) {
    const y = window.scrollY;
    fn();
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      withScrollPreserved(() => {
        setPresetActive(btn.dataset.preset);
        if (btn.dataset.preset === "all") {
          activeFrom = null;
          activeTo = null;
          fromInput.value = "";
          toInput.value = "";
        } else {
          const r = presetRange(btn.dataset.preset);
          activeFrom = r.from;
          activeTo = r.to;
          fromInput.value = r.from || "";
          toInput.value = r.to || "";
        }
        applyFilter();
      });
    });
  });

  applyBtn.addEventListener("click", () => {
    withScrollPreserved(() => {
      setPresetActive(null);
      activeFrom = fromInput.value || null;
      activeTo = toInput.value || null;
      applyFilter();
    });
  });

  /* -----------------------------------------------------------------------
     Filter Event — lihat satu event, beberapa event pilihan, atau semua.
     Dipadukan (irisan) dengan filter tanggal di atas. selectedIds = null
     berarti semua event; selain itu Set berisi eventId yang dipilih.
     ----------------------------------------------------------------------- */
  let selectedIds = null;
  const evBtn = document.getElementById("event-filter-btn");
  const evPop = document.getElementById("event-pop");
  const evSearch = document.getElementById("event-pop-search");
  const evList = document.getElementById("event-pop-list");
  const evKey = (ev) => String(ev.eventId);

  function eventFilterLabel() {
    if (!selectedIds) return "Event: Semua";
    const picked = rawEvents.filter((ev) => selectedIds.has(evKey(ev)));
    if (picked.length === 1) {
      const n = picked[0].event || "(Tanpa nama)";
      return "Event: " + (n.length > 26 ? n.slice(0, 25) + "…" : n);
    }
    return "Event: " + picked.length + " dipilih";
  }
  function paintEventBtn() {
    evBtn.textContent = eventFilterLabel() + " ▾";
    evBtn.classList.toggle("active", !!selectedIds);
  }
  function eventsForPop() {
    const q = evSearch.value.trim().toLowerCase();
    return rawEvents
      .filter((ev) => !q || [ev.event, ev.city].some((f) => String(f || "").toLowerCase().includes(q)))
      .sort((a, b) => String(b.eventDate || "").localeCompare(String(a.eventDate || "")) || String(a.event || "").localeCompare(String(b.event || ""), "id"));
  }
  function renderEventPop() {
    evList.textContent = "";
    const rows = eventsForPop();
    if (!rows.length) {
      const li = document.createElement("li"); li.className = "event-pop-empty"; li.textContent = "Tidak ada event yang cocok."; evList.append(li);
    }
    rows.forEach((ev) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const cb = document.createElement("input"); cb.type = "checkbox";
      cb.checked = !selectedIds || selectedIds.has(evKey(ev));
      cb.addEventListener("change", () => toggleEvent(ev, cb.checked));
      const txt = document.createElement("span"); txt.className = "event-pop-name"; txt.textContent = ev.event || "(Tanpa nama event)";
      const sub = document.createElement("small");
      sub.textContent = [ev.city, ev.eventDate ? formatDateID(ev.eventDate) : ""].filter(Boolean).join(" · ");
      label.append(cb, txt, sub);
      const only = document.createElement("button"); only.type = "button"; only.className = "event-pop-only"; only.textContent = "hanya ini";
      only.addEventListener("click", () => setSelection(new Set([evKey(ev)])));
      li.append(label, only); evList.append(li);
    });
  }
  function setSelection(next) {
    // kosong atau mencakup semua event -> kembali ke mode "Semua"
    selectedIds = next && next.size && next.size < rawEvents.length ? next : null;
    paintEventBtn(); renderEventPop();
    withScrollPreserved(applyFilter);
  }
  function toggleEvent(ev, on) {
    const cur = selectedIds ? new Set(selectedIds) : new Set(rawEvents.map(evKey));
    on ? cur.add(evKey(ev)) : cur.delete(evKey(ev));
    setSelection(cur);
  }
  function openEventPop(open) {
    evPop.hidden = !open;
    evBtn.setAttribute("aria-expanded", String(open));
    if (open) { evSearch.value = ""; renderEventPop(); evSearch.focus(); }
  }
  evBtn.addEventListener("click", () => openEventPop(evPop.hidden));
  evSearch.addEventListener("input", renderEventPop);
  document.getElementById("event-pop-all").addEventListener("click", () => setSelection(null));
  document.getElementById("event-pop-visible").addEventListener("click", () => setSelection(new Set(eventsForPop().map(evKey))));
  document.addEventListener("mousedown", (e) => { if (!evPop.hidden && !document.getElementById("event-filter").contains(e.target)) openEventPop(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !evPop.hidden) { openEventPop(false); evBtn.focus(); } });
  paintEventBtn();

  // The filter bar sticks right under the topnav (top: var(--topnav-h)).
  // That offset used to be a hard-coded "61px" guess, which only matched
  // the topnav's *actual* rendered height by luck — any mismatch (a font
  // swap once the webfont finishes loading, a resize, the brand text
  // wrapping) left a gap that was a few pixels different before vs. after
  // scrolling, which read as the buttons "moving". Measuring the real
  // height and re-measuring on the events that can change it keeps the
  // gap between the buttons and the topnav identical in every state.
  const topnavEl = document.querySelector(".topnav");
  function syncTopnavHeight() {
    if (!topnavEl) return 61;
    const h = Math.round(topnavEl.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--topnav-h", h + "px");
    return h;
  }
  let topnavH = syncTopnavHeight();
  let stickyObserver = null;
  function rebuildStickyObserver() {
    if (!filterBarSentinel) return;
    if (stickyObserver) stickyObserver.disconnect();
    stickyObserver = new IntersectionObserver(
      ([entry]) => filterBar.classList.toggle("is-stuck", !entry.isIntersecting),
      { threshold: 0, rootMargin: `-${topnavH}px 0px 0px 0px` }
    );
    stickyObserver.observe(filterBarSentinel);
  }
  rebuildStickyObserver();
  window.addEventListener("resize", () => {
    const h = syncTopnavHeight();
    if (h !== topnavH) { topnavH = h; rebuildStickyObserver(); }
  });
  // Web fonts (Fraunces/Space Grotesk) can swap in after first paint and
  // change the topnav's height slightly — re-measure once they're ready
  // so the very first render already matches the post-scroll state.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      const h = syncTopnavHeight();
      if (h !== topnavH) { topnavH = h; rebuildStickyObserver(); }
    });
  }



  /* -----------------------------------------------------------------------
     computeView — the single place that turns a list of events into every
     aggregate this page shows.
     ----------------------------------------------------------------------- */
  function computeView(events) {
    const priceStats = computePriceStats(events);
    const vendorAgg = aggregateVendors(events).sort((a, b) => b.eventCount - a.eventCount);
    const vendorBySpending = [...vendorAgg].sort((a, b) => b.totalSpending - a.totalSpending);
    const itemAgg = aggregateItems(events).sort((a, b) => b.occurrences - a.occurrences);
    const itemVendorPairs = aggregateItemVendor(events).sort((a, b) => b.frequency - a.frequency).slice(0, 24);
    const peakWeekData = aggregatePeakWeek(events);
    const peakMonthData = aggregatePeakMonth(events);
    const timeline = aggregateMonthlyTimeline(events);
    const paymentSummary = computePaymentSummary(events);
    const outstandingRows = aggregateOutstandingList(events, 8);
    return {
      events, priceStats, vendorAgg, vendorBySpending, itemAgg, itemVendorPairs,
      peakWeekData, peakMonthData, timeline, paymentSummary, outstandingRows,
      totalSpending: paymentSummary.committed,
      vendorCount: vendorAgg.length,
    };
  }

  const compactRupiah = (v) => "Rp " + Math.round(v / 1e6).toLocaleString("id-ID") + " Jt";

  /* -----------------------------------------------------------------------
     Hero — 5 angka ringkasan + kalimat otomatis.
     ----------------------------------------------------------------------- */
  function renderHero(view) {
    countUp(document.getElementById("hero-count-events"), view.events.length);
    countUp(document.getElementById("hero-count-vendors"), view.vendorCount);
    countUp(document.getElementById("hero-count-spending"), view.totalSpending, { prefix: "Rp ", formatter: (v) => Math.round(v / 1e6).toLocaleString("id-ID"), suffix: " Jt" });
    countUp(document.getElementById("hero-count-paid"), view.paymentSummary.paid, { prefix: "Rp ", formatter: (v) => Math.round(v / 1e6).toLocaleString("id-ID"), suffix: " Jt" });
    countUp(document.getElementById("hero-count-outstanding"), view.paymentSummary.outstanding, { prefix: "Rp ", formatter: (v) => Math.round(v / 1e6).toLocaleString("id-ID"), suffix: " Jt" });

    const topVendor = view.vendorBySpending[0];
    const topItem = view.itemAgg[0];
    const sentenceEl = document.getElementById("hero-summary-sentence");
    if (view.events.length === 0) {
      sentenceEl.textContent = "Tidak ada data pada periode yang dipilih.";
    } else {
      sentenceEl.textContent =
        `Procurement mencapai ${formatRupiah(view.totalSpending)}, dengan ${formatRupiah(view.paymentSummary.paid)} sudah dibayar (Lunas/DP) dan ${formatRupiah(view.paymentSummary.outstanding)} masih outstanding.` +
        (topVendor ? ` Vendor terbesar: ${topVendor.vendor}.` : "") +
        (topItem ? ` Item terbesar: ${topItem.itemName}.` : "");
    }
  }

  /* -----------------------------------------------------------------------
     Payment legend + outstanding list + "perlu diperhatikan" — DOM lists,
     tidak lewat D3 karena bukan grafik.
     ----------------------------------------------------------------------- */
  // Shows both the concrete Rupiah amount AND the % share for each payment
  // status (Lunas / DP), plus how many items make up that amount — not
  // just a color-coded dot, so the split is readable without needing to
  // hover the donut.
  function renderPaymentLegend(summary) {
    const box = document.getElementById("payment-legend");
    const total = summary.lunasTotal + summary.dpPaidTotal + summary.outstanding;
    const rows = [
      ["Lunas", summary.lunasTotal, summary.lunasCount, ACCENT.lunas],
      ["DP", summary.dpPaidTotal, summary.dpCount, ACCENT.dp],
      // "Belum Dibayar" = sisa dari item DP yang belum dibayarkan + item
      // yang sama sekali belum dibayar, jadi jumlah itemnya adalah
      // gabungan keduanya (satu item DP bisa ikut dihitung di sini untuk
      // porsi sisanya, sekaligus di baris "DP" di atas untuk porsi yang
      // sudah dibayar).
      ["Belum Dibayar", summary.outstanding, summary.dpCount + summary.belumCount, ACCENT.belum],
    ];
    box.className = "payment-breakdown";
    if (total === 0) {
      box.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0">Belum ada data pembayaran pada periode ini.</p>';
    } else {
      box.innerHTML = rows.map(([label, val, count, color]) => {
        const pct = (val / total) * 100;
        return `
          <div class="pb-row">
            <div class="pb-row-top">
              <span class="pb-dot" style="background:${color}"></span>
              <span class="pb-label">${label}</span>
              <span class="pb-pct">${pct.toFixed(1)}%</span>
            </div>
            <div class="pb-bar"><span style="width:${pct}%;background:${color}"></span></div>
            <div class="pb-row-bottom">
              <span>${formatRupiah(val)}</span>
              <span>${count} item</span>
            </div>
          </div>`;
      }).join("");
    }

    const noteEl = document.getElementById("payment-unknown-note");
    if (summary.unknownTotal > 0) {
      noteEl.hidden = false;
      noteEl.textContent = `${formatRupiahCompact(summary.unknownTotal)} dari ${summary.unknownCount} item belum mencantumkan status pembayaran (menunggu pembaruan backend ke skema sheet baru) — tidak dihitung sebagai Lunas maupun DP di atas.`;
    } else {
      noteEl.hidden = true;
    }
  }

  function renderOutstandingList(rows) {
    const list = document.getElementById("list-outstanding");
    if (!rows.length) {
      list.innerHTML = '<li class="empty">Tidak ada outstanding pada periode ini.</li>';
      return;
    }
    list.innerHTML = rows.map((r, i) =>
      `<li>
        <span class="ob-main">
          <span class="rank">${i + 1}</span>
          <span class="ob-text">
            <span class="ob-title">${r.itemName} — ${r.event}</span>
            <span class="meta">${r.vendor} · ${formatDateID(r.eventDate)}</span>
          </span>
        </span>
        <span class="amount">${formatRupiah(r.outstanding)}</span>
      </li>`
    ).join("");
  }

  /* -----------------------------------------------------------------------
     Status Pembayaran — drill-down per vendor / per event. Independen dari
     filter tanggal global di atas: hanya memengaruhi donat, legend, dan
     daftar outstanding di section 06, tidak menyentuh section lain. Opsi
     dropdown diambil dari seluruh data yang sudah masuk (rawEvents), bukan
     dari hasil filter tanggal, supaya daftarnya tidak berubah-ubah saat
     rentang tanggal diganti.
     ----------------------------------------------------------------------- */
  const paymentVendorSelect = document.getElementById("payment-filter-vendor");
  const paymentEventSelect = document.getElementById("payment-filter-event");
  let currentView = null;

  function populatePaymentFilterOptions(events) {
    const vendors = [...new Set(events.flatMap((ev) => ev.items.map((it) => it.vendor)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "id"));
    const eventNames = [...new Set(events.map((ev) => ev.event).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "id"));
    // Dibangun lewat DOM API (bukan string HTML digabung manual) supaya
    // nama vendor/event yang mengandung karakter seperti " atau & tidak
    // merusak markup <option> berikutnya — sebelumnya itu bisa membuat
    // hampir seluruh daftar pilihan gagal ke-parse dengan benar.
    const fillSelect = (select, defaultLabel, values) => {
      select.innerHTML = "";
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = defaultLabel;
      select.appendChild(defaultOpt);
      for (const v of values) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      }
    };
    fillSelect(paymentVendorSelect, "Semua Vendor", vendors);
    fillSelect(paymentEventSelect, "Semua Event", eventNames);
  }
  populatePaymentFilterOptions(rawEvents);

  function filterEventsForPayment(events) {
    const vendorFilter = paymentVendorSelect.value;
    const eventFilter = paymentEventSelect.value;
    return events
      .filter((ev) => !eventFilter || ev.event === eventFilter)
      .map((ev) => (vendorFilter ? { ...ev, items: ev.items.filter((it) => it.vendor === vendorFilter) } : ev))
      .filter((ev) => ev.items.length > 0);
  }

  function renderPaymentSection() {
    if (!currentView) return;
    const events = filterEventsForPayment(currentView.events);
    const summary = computePaymentSummary(events);
    renderPaymentDonut(document.getElementById("chart-payment"), summary);
    renderPaymentLegend(summary);
    renderOutstandingList(aggregateOutstandingList(events, 8));
  }

  paymentVendorSelect.addEventListener("change", renderPaymentSection);
  paymentEventSelect.addEventListener("change", renderPaymentSection);

  /* -----------------------------------------------------------------------
     Section renderers — dibangun ulang setiap applyFilter() dari `view`
     yang baru, supaya setiap chart selalu membaca data hasil filter
     terbaru.
     ----------------------------------------------------------------------- */
  function buildSectionRenderers(view) {
    return {
      "section-price": () => {
        countUp(document.querySelector("#price-headline [data-count]"), view.events.length, { duration: 1000 });
        const statBox = document.getElementById("price-stats");
        statBox.innerHTML = "";
        const rows = [
          ["Mean", view.priceStats.mean], ["Median", view.priceStats.median],
          ["Q1", view.priceStats.q1], ["Q3", view.priceStats.q3],
          ["Min", view.priceStats.min], ["Max", view.priceStats.max],
        ];
        for (const [label, val] of rows) {
          const div = document.createElement("div");
          div.className = "stat";
          div.innerHTML = `<div class="val">${formatRupiahCompact(val)}</div><div class="lbl">${label}</div>`;
          statBox.appendChild(div);
        }
        renderPriceDistribution(document.getElementById("chart-price"), view.events, view.priceStats);
      },
      "section-vendor-freq": () => {
        renderHorizontalBars(document.getElementById("chart-vendor-freq"), view.vendorAgg, {
          valueKey: "eventCount", labelKey: "vendor", color: ACCENT.vendorFreq,
          valueFormatter: (v) => `${v} event`,
          tooltipFn: (d) => `<strong>${d.vendor}</strong><br>Jumlah event: ${d.eventCount}<br>Jumlah item: ${d.itemOccurrences}<br>Total pengeluaran: ${formatRupiah(d.totalSpending)}`,
        });
      },
      "section-vendor-spend": () => {
        const spendLeaderByFreq = view.vendorAgg[0];
        const spendLeaderBySpend = view.vendorBySpending[0];
        const insightEl = document.getElementById("spend-insight");
        if (spendLeaderByFreq && spendLeaderBySpend) {
          insightEl.textContent = spendLeaderByFreq.vendor === spendLeaderBySpend.vendor
            ? `${spendLeaderBySpend.vendor} unggul baik dari sisi frekuensi maupun total pengeluaran.`
            : `${spendLeaderByFreq.vendor} paling sering dipakai, tapi ${spendLeaderBySpend.vendor} yang menyerap pengeluaran terbesar.`;
        } else {
          insightEl.textContent = "Tidak ada data pada periode ini.";
        }
        renderHorizontalBars(document.getElementById("chart-vendor-spend"), view.vendorBySpending, {
          valueKey: "totalSpending", labelKey: "vendor", color: ACCENT.vendorSpend,
          valueFormatter: (v) => formatRupiahCompact(v),
          tooltipFn: (d) => `<strong>${d.vendor}</strong><br>Total pengeluaran: ${formatRupiah(d.totalSpending)}<br>Jumlah event: ${d.eventCount}<br>Rata-rata/event: ${formatRupiah(d.avgSpendingPerEvent)}`,
        });
      },
      "section-items": () => {
        renderHorizontalBars(document.getElementById("chart-items"), view.itemAgg, {
          valueKey: "occurrences", labelKey: "itemName", color: ACCENT.item,
          valueFormatter: (v) => `${v}×`,
          tooltipFn: (d) => `<strong>${d.itemName}</strong><br>Jumlah event: ${d.eventCount}<br>Total pengeluaran: ${formatRupiah(d.totalSpending)}`,
        });
      },
      "section-item-vendor": () => {
        renderItemVendorBubbles(document.getElementById("chart-item-vendor"), view.itemVendorPairs);
      },
      "section-payment": () => {
        renderPaymentSection();
      },
      "section-time": () => {
        const busiestMonth = [...view.peakMonthData].sort((a, b) => b.count - a.count)[0];
        const busiestWeek = [...view.peakWeekData].sort((a, b) => b.count - a.count)[0];
        document.getElementById("peak-insight").textContent =
          busiestMonth && busiestMonth.count > 0
            ? `${busiestMonth.label} menjadi bulan paling sibuk, dengan puncak aktivitas di minggu ke-${busiestWeek.week}.`
            : "Tidak ada data pada periode ini.";
        renderVerticalBars(document.getElementById("chart-week"), view.peakWeekData.map((d) => ({ label: "W" + d.week, count: d.count })), { labelKey: "label", valueKey: "count", color: ACCENT.vendorFreq });
        renderVerticalBars(document.getElementById("chart-month"), view.peakMonthData, { labelKey: "label", valueKey: "count", color: ACCENT.item });
      },
      "section-trend": () => {
        renderTimeline(document.getElementById("chart-timeline"), view.timeline);
      },
    };
  }

  /* -----------------------------------------------------------------------
     applyFilter — dipanggil setiap kali preset dipilih, tombol "Terapkan"
     ditekan, atau checkbox "Bandingkan" diubah. Ini satu-satunya tempat
     yang menyaring rawEvents dan memicu render ulang semua bagian.
     ----------------------------------------------------------------------- */
  let currentRenderers = {};
  const everRendered = new Set();

  function runSectionRenderer(id) {
    if (!currentRenderers[id]) return;
    everRendered.add(id);
    currentRenderers[id]();
  }

  function applyFilter() {
    let events = filterEventsByDateRange(rawEvents, activeFrom, activeTo);
    if (selectedIds) events = events.filter((ev) => selectedIds.has(evKey(ev)));
    const view = computeView(events);
    currentView = view;

    renderHero(view);
    currentRenderers = buildSectionRenderers(view);
    everRendered.forEach((id) => currentRenderers[id] && currentRenderers[id]());

    const dateText = (activeFrom || activeTo)
      ? `${activeFrom ? formatDateID(activeFrom) : "awal data"} – ${activeTo ? formatDateID(activeTo) : "sekarang"}`
      : "";
    const picked = selectedIds ? rawEvents.filter((ev) => selectedIds.has(evKey(ev))).length : 0;
    let rangeText;
    if (selectedIds) {
      rangeText = `Menampilkan ${view.events.length} dari ${picked} event pilihan` + (dateText ? `, rentang ${dateText}.` : ".");
      if (picked && !view.events.length && dateText) rangeText += " Event pilihan berada di luar rentang tanggal.";
    } else {
      rangeText = dateText
        ? `Menampilkan ${dateText} (${view.events.length} event).`
        : `Menampilkan seluruh data (${view.events.length} event).`;
    }
    rangeLabelEl.textContent = rangeText;
  }

  applyFilter(); // render awal: "Semua Data"

  /* -----------------------------------------------------------------------
     Reveal + lazy render on scroll, and progress rail sync. Re-plays the
     reveal transition and re-draws the chart every time a section enters
     the viewport — scrolling down into it or scrolling back up into it —
     rather than only the first time it is ever seen.
     ----------------------------------------------------------------------- */
  const sections = [...document.querySelectorAll(".story-section")];
  const railButtons = [...progressRail.querySelectorAll("button")];
  const prefersReducedMotionForReveal = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const REVEAL_ANIM_DELAY = prefersReducedMotionForReveal ? 0 : 150;
  let revealTimers = {};

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.id;
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        clearTimeout(revealTimers[id]);
        revealTimers[id] = setTimeout(() => runSectionRenderer(id), REVEAL_ANIM_DELAY);
      } else {
        entry.target.classList.remove("revealed");
        clearTimeout(revealTimers[id]);
      }
    });
  }, { threshold: 0.15 });
  sections.forEach((s) => revealObserver.observe(s));

  const railObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        railButtons.forEach((b) => b.classList.toggle("active", b.dataset.target === entry.target.id));
      }
    });
  }, { threshold: 0.5 });
  sections.forEach((s) => railObserver.observe(s));

  railButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.target)?.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Re-render visible charts on resize so they stay crisp at new widths
  // (debounced, and only for sections already rendered).
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      everRendered.forEach((id) => runSectionRenderer(id));
    }, 250);
  });

  // Charts read their text/line colors from CSS variables at draw time
  // (see themeTokens() in charts.js) so that dark mode stays legible.
  // Re-render every chart that's already been drawn as soon as the theme
  // toggle fires, instead of leaving them on the old palette until the
  // section happens to scroll back into view.
  document.addEventListener("maximum-theme-change", () => {
    everRendered.forEach((id) => runSectionRenderer(id));
  });

  /* -----------------------------------------------------------------------
     Sinkron langsung dengan Input Report: event yang baru disimpan, diedit,
     atau dihapus (di tab/perangkat mana pun) langsung masuk ke seluruh
     angka & grafik di sini tanpa muat ulang halaman dan tanpa spreadsheet.
     ----------------------------------------------------------------------- */
  if (window.EventStore) {
    const signature = (list) => list.map((e) => e.eventId + "|" + (e.updatedAt || e.submittedAt || "")).sort().join(";");
    let lastSig = signature(rawEvents);
    let liveTimer = null;
    window.EventStore.subscribe(() => {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => {
        const next = ensurePaymentFields(window.EventStore.published());
        const sig = signature(next);
        if (sig === lastSig) return;
        lastSig = sig;
        rawEvents = next;
        const lu = getLastUpdated(rawEvents);
        if (lu) {
          const { date, time } = formatDateTimeID(lu);
          document.getElementById("last-updated-value").textContent = `${date}, ${time}`;
        }
        const keepVendor = paymentVendorSelect.value, keepEvent = paymentEventSelect.value;
        populatePaymentFilterOptions(rawEvents);
        if (selectedIds) {   // event yang sudah dihapus dibuang dari pilihan
          const live = new Set(rawEvents.map(evKey));
          const kept = new Set([...selectedIds].filter((id) => live.has(id)));
          selectedIds = kept.size && kept.size < rawEvents.length ? kept : null;
        }
        paintEventBtn(); if (!evPop.hidden) renderEventPop();
        if ([...paymentVendorSelect.options].some((o) => o.value === keepVendor)) paymentVendorSelect.value = keepVendor;
        if ([...paymentEventSelect.options].some((o) => o.value === keepEvent)) paymentEventSelect.value = keepEvent;
        withScrollPreserved(applyFilter);
      }, 400);
    });
  }
})();
