/* =========================================================================
   vendor.js — logika halaman Pusat Data Vendor & Harga.
   Semua state dibungkus IIFE supaya nama seperti `data`, `render`, atau
   `CONFIG` tidak bentrok dengan js/data.js milik halaman input/analytics.
   ========================================================================= */
(function () {
  /* =====================================================
     KONFIGURASI SUMBER DATA
  ===================================================== */
  const CONFIG = {
    SPREADSHEET_ID: '1X03xTnUsCz-QOWNeIXfTKhdMO1eaVDNmqBuIClHnAWk',
    API_KEY: 'AIzaSyAGQc7xZgCkRqsE_WtPwZSR2_2xGemYaGQ'
  };

  const HEADER_SEARCH_ROWS = 6;
  const IGNORED_SHEETS = [];
  const COMBO_HEADER_REGEX = /^(\d+)\s*day\s*\+\s*(\d+)\s*gr$/;

  function deriveKategoriFromSheetName(sheetName){
    const cleaned = sheetName.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    return cleaned || sheetName;
  }

  async function fetchDatabase(spreadsheetId, apiKey){
    if(!spreadsheetId || spreadsheetId.indexOf('PASTE_') === 0){
      throw new Error('SPREADSHEET_ID belum diisi di CONFIG (lihat bagian atas script).');
    }
    if(!apiKey || apiKey.indexOf('PASTE_') === 0){
      throw new Error('API_KEY belum diisi di CONFIG (lihat bagian atas script).');
    }

    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties`;
    const metaRes = await fetch(metaUrl);
    if(!metaRes.ok){
      const t = await metaRes.text();
      throw new Error(`Gagal mengambil daftar sheet (HTTP ${metaRes.status}). Pastikan spreadsheet sudah "Anyone with the link - Viewer" dan API key valid.\n${t}`);
    }
    const meta = await metaRes.json();
    const sheetsMeta = (meta.sheets || []).map(s => s.properties);

    const rangesParam = sheetsMeta.map(s => 'ranges=' + encodeURIComponent(s.title)).join('&');
    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?key=${apiKey}&${rangesParam}&valueRenderOption=UNFORMATTED_VALUE`;
    const valuesRes = await fetch(valuesUrl);
    if(!valuesRes.ok){
      const t = await valuesRes.text();
      throw new Error(`Gagal mengambil isi sheet (HTTP ${valuesRes.status}).\n${t}`);
    }
    const valuesData = await valuesRes.json();

    const rows = [];
    let idCounter = 0;
    const combosMasterMap = {};

    (valuesData.valueRanges || []).forEach(function(vr, idx){
      const sheetMetaItem = sheetsMeta[idx];
      const sheetName = sheetMetaItem.title;
      const sheetGid = sheetMetaItem.sheetId;
      if(IGNORED_SHEETS.indexOf(sheetName) !== -1) return;

      const rawValues = vr.values || [];
      if(rawValues.length < 2) return;

      let maxCols = 0;
      rawValues.forEach(r => { if(r.length > maxCols) maxCols = r.length; });
      const values = rawValues.map(function(r){
        const padded = r.slice();
        while(padded.length < maxCols) padded.push('');
        return padded;
      });
      const lastCol = maxCols;
      if(lastCol < 2) return;

      let headerRowIdx = -1;
      let header = [];
      const scanLimit = Math.min(HEADER_SEARCH_ROWS, values.length);
      for(let hr = 0; hr < scanLimit; hr++){
        const candidate = values[hr];
        let hasItemId = false, hasVendor = false, hasCombo = false;
        for(let hc = 0; hc < candidate.length; hc++){
          const norm = String(candidate[hc] || '').trim().toLowerCase();
          if(norm === 'item id') hasItemId = true;
          if(norm === 'vendor') hasVendor = true;
          if(COMBO_HEADER_REGEX.test(norm)) hasCombo = true;
        }
        if(hasItemId && hasVendor && hasCombo){
          headerRowIdx = hr;
          header = candidate;
          break;
        }
      }
      if(headerRowIdx === -1) return;

      const col = { combos: {} };
      for(let c = 0; c < lastCol; c++){
        const raw = String(header[c] || '').trim();
        const h = raw.toLowerCase();
        if(h === 'item id') col.itemId = c;
        else if(h === 'kategori') col.kategori = c;
        else if(h === 'sub-kategori') col.jenis = c;
        else if(h === 'nama item') col.item = c;
        else if(h === 'spesifikasi') col.spesifikasi = c;
        else if(h === 'quantity') col.qtyNumber = c;
        else if(h === 'satuan') col.qtySatuan = c;
        else if(h.indexOf('rate') !== -1 && h.indexOf('satuan') !== -1) col.rateSatuan = c;
        else if(h === 'vendor') col.vendor = c;
        else if(h.indexOf('update') !== -1) col.updateTerakhir = c;
        else{
          const m = h.match(COMBO_HEADER_REGEX);
          if(m){
            const eventDay = parseInt(m[1], 10);
            const grDay = parseInt(m[2], 10);
            const comboKey = eventDay + '_' + grDay;
            col.combos[comboKey] = c;
            if(!combosMasterMap[comboKey]) combosMasterMap[comboKey] = { eventDay, grDay };
          }
        }
      }

      if(col.item === undefined || col.vendor === undefined) return;

      const kategoriFallback = deriveKategoriFromSheetName(sheetName);
      const isTBC = /tbc/i.test(sheetName);

      for(let r = headerRowIdx + 1; r < values.length; r++){
        const row = values[r];
        const itemVal = row[col.item];
        if(!itemVal) continue;

        const comboPrices = {};
        let hasAnyCombo = false;
        Object.keys(col.combos).forEach(function(comboKey){
          const v = row[col.combos[comboKey]];
          if(v !== '' && v !== null && v !== undefined && !isNaN(Number(v))){
            comboPrices[comboKey] = Number(v);
            hasAnyCombo = true;
          }
        });
        if(!hasAnyCombo) continue;

        idCounter++;
        rows.push({
          id: 'R' + idCounter,
          itemId: (col.itemId !== undefined && row[col.itemId]) ? String(row[col.itemId]).trim() : ('NOID-' + idCounter),
          kategori: (col.kategori !== undefined && row[col.kategori]) ? String(row[col.kategori]).trim() : kategoriFallback,
          jenis: (col.jenis !== undefined && row[col.jenis]) ? String(row[col.jenis]).trim() : '',
          item: String(itemVal).trim(),
          spesifikasi: col.spesifikasi !== undefined ? String(row[col.spesifikasi] || '').trim() : '',
          qtyNumber: (col.qtyNumber !== undefined && row[col.qtyNumber] !== '') ? Number(row[col.qtyNumber]) : null,
          qtySatuan: col.qtySatuan !== undefined ? String(row[col.qtySatuan] || '').trim() : '',
          combos: comboPrices,
          rateSatuan: (col.rateSatuan !== undefined && row[col.rateSatuan] !== '' && !isNaN(Number(row[col.rateSatuan]))) ? Number(row[col.rateSatuan]) : null,
          vendor: (col.vendor !== undefined && row[col.vendor]) ? String(row[col.vendor]).trim() : '(vendor tidak diketahui)',
          updateTerakhir: col.updateTerakhir !== undefined ? String(row[col.updateTerakhir] || '').trim() : '',
          sheetName: sheetName,
          sheetGid: sheetGid,
          rowNumber: r + 1,
          tbc: isTBC
        });
      }
    });

    const combos = Object.keys(combosMasterMap).map(function(key){
      const c = combosMasterMap[key];
      return {
        key: key,
        eventDay: c.eventDay,
        grDay: c.grDay,
        label: c.eventDay + ' Hari Event' + (c.grDay > 0 ? ' + ' + c.grDay + ' Hari GR' : ' (Tanpa GR)')
      };
    }).sort(function(a, b){
      if(a.eventDay !== b.eventDay) return a.eventDay - b.eventDay;
      return a.grDay - b.grDay;
    });

    return { ssId: spreadsheetId, rows: rows, combos: combos };
  }

  /* =====================================================
     STATE
  ===================================================== */
  let data = [];
  let ssId = '';
  let combosMaster = [];
  let cmpGroups = {};
  let specToggleCounter = 0;

  /* =====================================================
     THEME — ditangani js/theme.js (shared, key "maximum-theme").
     Halaman ini hanya ikut membaca data-theme di <html>.
  ===================================================== */

  /* =====================================================
     LOAD DATABASE DARI GOOGLE SHEETS API v4
  ===================================================== */
  fetchDatabase(CONFIG.SPREADSHEET_ID, CONFIG.API_KEY)
    .then(function(result){
      result = result || { ssId:'', rows:[], combos:[] };
      ssId = result.ssId || '';
      data = result.rows || [];
      combosMaster = result.combos || [];
      prepareDatabase();
      document.getElementById('loading').style.display = 'none';
    })
    .catch(function(error){
      document.getElementById('loading').innerHTML =
        'Gagal mengambil database.<br><br>' + escapeHtml(error.message).replace(/\n/g,'<br>');
    });

  /* =====================================================
     PREPARE
  ===================================================== */
  function prepareDatabase(){
    populateKombinasiSelect();
    populateFilters();
    recomputeAll();
    createOptimizerRows();
    buildComparisonGroups();
    populateCmpFilters();
  }

  function populateKombinasiSelect(){
    const sel = document.getElementById('selKombinasi');
    sel.innerHTML = '';
    combosMaster.forEach(function(c){
      const o = document.createElement('option');
      o.value = c.key; o.textContent = c.label;
      sel.appendChild(o);
    });
    if(combosMaster.length) sel.value = combosMaster[0].key;
    sel.addEventListener('change', recomputeAll);
  }

  function comboByKey(key){
    return combosMaster.find(c => c.key === key) || null;
  }

  /* =====================================================
     FORMAT HELPERS
  ===================================================== */
  function fmtRp(n){ return 'Rp ' + Math.round(n||0).toLocaleString('id-ID'); }

  function fmtQty(r){
    if(r.qtyNumber===null || r.qtyNumber===undefined) return '';
    return r.qtyNumber + (r.qtySatuan? ' '+r.qtySatuan : '');
  }

  function sheetLink(r){
    if(!ssId) return '#';
    return 'https://docs.google.com/spreadsheets/d/'+ssId+'/edit#gid='+r.sheetGid+'&range=A'+r.rowNumber;
  }

  function escapeHtml(value){
    return String(value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function highlight(text,q){
    text = String(text || '');
    if(!q) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if(idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0,idx)) + '<mark>' + escapeHtml(text.slice(idx,idx+q.length)) + '</mark>' + escapeHtml(text.slice(idx+q.length));
  }

  function renderSpec(text, q){
    text = String(text || '').trim();
    if(!text) return '<span class="spec-empty">— tidak ada spesifikasi —</span>';

    const threshold = 150;
    if(text.length <= threshold){
      return '<div class="spec-full open">' + highlight(text, q) + '</div>';
    }

    let cut = text.slice(0, threshold);
    const lastSpace = cut.lastIndexOf(' ');
    if(lastSpace > 80) cut = cut.slice(0, lastSpace);
    const uid = 'spec' + (specToggleCounter++);

    return `
      <div class="spec-preview" id="${uid}-prev">${highlight(cut, q)}…</div>
      <div class="spec-full" id="${uid}-full">${highlight(text, q)}</div>
      <button type="button" class="spec-toggle" data-target="${uid}">Lihat spesifikasi lengkap ▾</button>
    `;
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('.spec-toggle');
    if(!btn) return;
    const uid = btn.getAttribute('data-target');
    const prev = document.getElementById(uid+'-prev');
    const full = document.getElementById(uid+'-full');
    const isOpen = full.classList.toggle('open');
    if(prev) prev.style.display = isOpen ? 'none' : 'block';
    btn.textContent = isOpen ? 'Sembunyikan spesifikasi ▴' : 'Lihat spesifikasi lengkap ▾';
  });

  /* =====================================================
     RESOLUSI HARGA KOMBINASI
  ===================================================== */
  function resolveCombinationPrice(row, reqKey){
    const keys = Object.keys(row.combos || {});
    if(!keys.length) return null;

    if(row.combos[reqKey] !== undefined){
      const c = comboByKey(reqKey);
      return { price: row.combos[reqKey], key: reqKey, eventDay: c?c.eventDay:null, grDay: c?c.grDay:null, exact: true };
    }

    const reqCombo = comboByKey(reqKey);
    const reqEvent = reqCombo ? reqCombo.eventDay : 0;
    const reqGr = reqCombo ? reqCombo.grDay : 0;

    let best = null, bestDist = Infinity;
    keys.forEach(function(k){
      const c = comboByKey(k);
      if(!c) return;
      const dist = Math.abs(c.eventDay - reqEvent) * 1000 + Math.abs(c.grDay - reqGr);
      if(dist < bestDist || (dist===bestDist && best!==null && row.combos[k] < row.combos[best])){
        bestDist = dist; best = k;
      }
    });
    if(best === null) return null;
    const bc = comboByKey(best);
    return { price: row.combos[best], key: best, eventDay: bc?bc.eventDay:null, grDay: bc?bc.grDay:null, exact: false };
  }

  /* =====================================================
     RECOMPUTE
  ===================================================== */
  function recomputeAll(){
    const reqKey = document.getElementById('selKombinasi').value;
    data.forEach(function(r){ r._pricing = resolveCombinationPrice(r, reqKey); });
    updateDurationNote(reqKey);
    render();
  }

  function updateDurationNote(reqKey){
    const c = comboByKey(reqKey);
    const noData = data.filter(r => !r._pricing).length;
    let msg = c ? `Menampilkan harga untuk <b>${escapeHtml(c.label)}</b>.` : 'Pilih kombinasi hari.';
    if(noData>0) msg += ` ${noData} listing tidak punya data harga sama sekali untuk kombinasi manapun dan disembunyikan dari tabel.`;
    document.getElementById('durationNote').innerHTML = msg;
  }

  /* =====================================================
     FILTERS
  ===================================================== */
  function populateFilters(){
    const kategoriSet = new Set(), vendorSet = new Set(), jenisSet = new Set();
    data.forEach(function(r){
      if(r.kategori) kategoriSet.add(r.kategori);
      if(r.vendor) vendorSet.add(r.vendor);
      if(r.jenis) jenisSet.add(r.jenis);
    });

    const selKategori = document.getElementById('selKategori');
    const selVendor = document.getElementById('selVendor');
    const selJenis = document.getElementById('selJenis');

    Array.from(kategoriSet).sort().forEach(function(k){
      const o = document.createElement('option'); o.value=k; o.textContent=k; selKategori.appendChild(o);
    });
    Array.from(vendorSet).sort().forEach(function(v){
      const o = document.createElement('option'); o.value=v; o.textContent=v; selVendor.appendChild(o);
    });
    Array.from(jenisSet).sort().forEach(function(j){
      const o = document.createElement('option'); o.value=j; o.textContent=j; selJenis.appendChild(o);
    });
  }

  /* =====================================================
     RENDER TABLE
  ===================================================== */
  function render(){
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const kat = document.getElementById('selKategori').value;
    const ven = document.getElementById('selVendor').value;
    const jen = document.getElementById('selJenis').value;
    const sort = document.getElementById('selSort').value;

    let rows = data.filter(function(r){
      if(!r._pricing) return false;
      if(kat && r.kategori !== kat) return false;
      if(ven && r.vendor !== ven) return false;
      if(jen && r.jenis !== jen) return false;
      if(!q) return true;

      const hay = [r.itemId, r.item, r.vendor, r.kategori, r.spesifikasi, r.sheetName, fmtRp(r._pricing.price)]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });

    rows.sort(function(a,b){
      if(sort === 'harga_desc') return b._pricing.price - a._pricing.price;
      if(sort === 'harga_asc') return a._pricing.price - b._pricing.price;
      if(sort === 'vendor_asc') return a.vendor.localeCompare(b.vendor);
      if(sort === 'kategori_asc') return a.kategori.localeCompare(b.kategori);
      return a.item.localeCompare(b.item);
    });

    document.getElementById('resultCount').textContent = rows.length;

    const tbody = document.getElementById('tbody');
    tbody.innerHTML = '';
    document.getElementById('emptyState').style.display = rows.length ? 'none' : 'block';

    rows.forEach(function(r){
      const p = r._pricing;
      let priceNotes = '';
      if(!p.exact){
        const used = comboByKey(p.key);
        priceNotes += `<div class="price-note approx">≈ tidak ada data kombinasi ini, dipakai kombinasi terdekat: ${used ? escapeHtml(used.label) : ''}</div>`;
      } else {
        const used = comboByKey(p.key);
        priceNotes += `<div class="price-note">${used ? escapeHtml(used.label) : ''}</div>`;
      }
      if(r.rateSatuan){
        priceNotes += `<div class="price-note">≈ ${fmtRp(r.rateSatuan)} / ${r.qtySatuan || 'satuan'}</div>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="item-name">${highlight(r.item,q)}</div>
          <div class="itemid-tag">${escapeHtml(r.itemId)}</div>
          ${r.jenis ? `<span class="tag-jenis">${escapeHtml(r.jenis)}</span>` : ''}
          ${fmtQty(r) ? `<div class="itemid-tag">Qty: ${escapeHtml(fmtQty(r))}</div>` : ''}
        </td>
        <td class="vendor-tag">${highlight(r.vendor,q)}</td>
        <td class="vendor-tag">${highlight(r.kategori,q)}</td>
        <td class="spec-cell">${renderSpec(r.spesifikasi, q)}</td>
        <td class="price">
          ${fmtRp(p.price)}
          ${r.tbc ? '<span class="tbcbadge">TBC</span>' : ''}
          ${priceNotes}
        </td>
        <td class="sheet-tag">${highlight(r.sheetName,q)}</td>
        <td><a class="viewlink" href="${sheetLink(r)}" target="_blank" rel="noopener">🔗 Lihat</a></td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* =====================================================
     EVENTS — filter/search bar
  ===================================================== */
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('selKategori').addEventListener('change', render);
  document.getElementById('selVendor').addEventListener('change', render);
  document.getElementById('selJenis').addEventListener('change', render);
  document.getElementById('selSort').addEventListener('change', render);

  /* =====================================================
     OPTIMIZER
  ===================================================== */
  function buildCatalog(){
    const catalog = {};
    data.forEach(function(r){
      if(!catalog[r.itemId]) catalog[r.itemId] = [];
      catalog[r.itemId].push(r);
    });
    return catalog;
  }

  function getAllItemOptions(){
    const seen = new Map();
    data.forEach(function(r){
      if(!seen.has(r.itemId)) seen.set(r.itemId, { item: r.item, kategori: r.kategori });
    });
    return Array.from(seen.entries())
      .map(([itemId, v]) => ({ itemId, item: v.item, kategori: v.kategori }))
      .sort((a,b) => a.item.localeCompare(b.item));
  }

  function optKategoriOptionsHtml(){
    const kategoriSet = new Set(data.map(r=>r.kategori).filter(Boolean));
    return '<option value="">Semua Kategori</option>' +
      Array.from(kategoriSet).sort().map(function(k){
        return `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`;
      }).join('');
  }

  function createOptimizerRows(){
    addOptRow();
  }

  function comboOptionsHtml(){
    return combosMaster.map(function(c){
      return `<option value="${escapeHtml(c.key)}">${escapeHtml(c.label)}</option>`;
    }).join('');
  }

  function refreshOptItemSuggestions(rowEl){
    const items = getAllItemOptions();
    const box = rowEl.querySelector('.opt-item-suggestions');
    const q = rowEl.querySelector('.opt-item-search').value.trim().toLowerCase();
    const kat = rowEl.querySelector('.opt-kategori').value;

    let candidates = items.filter(function(it){
      if(kat && it.kategori !== kat) return false;
      if(!q) return true;
      const hay = (it.itemId + ' ' + it.item + ' ' + it.kategori).toLowerCase();
      return hay.includes(q);
    });

    const isDefault = !q;
    candidates = candidates.slice(0, 8);

    if(!candidates.length){
      box.innerHTML = '<div class="cmp-suggestion" style="cursor:default;color:var(--v-muted)">Tidak ada item yang cocok.</div>';
      box.classList.add('open');
      return;
    }

    box.innerHTML =
      (isDefault ? '<div class="cmp-suggest-label">Contoh item</div>' : '') +
      candidates.map(function(it){
        return `
          <div class="cmp-suggestion" data-item="${escapeHtml(it.itemId)}" data-label="${escapeHtml(it.item)}">
            <div class="s-nm">${highlight(it.item, q)}</div>
            <div class="s-meta">${escapeHtml(it.kategori)} · ${escapeHtml(it.itemId)}</div>
          </div>
        `;
      }).join('');
    box.classList.add('open');
  }

  function hideOptItemSuggestions(rowEl){
    rowEl.querySelector('.opt-item-suggestions').classList.remove('open');
  }

  function addOptRow(presetItem){
    const wrap = document.getElementById('optRows');
    const row = document.createElement('div');
    row.className = 'opt-row';

    const label = presetItem ? presetItem.item : '';
    const itemId = presetItem ? presetItem.itemId : '';

    row.innerHTML = `
      <div class="opt-item-cell">
        <div class="opt-item-controls">
          <select class="opt-kategori">${optKategoriOptionsHtml()}</select>
          <input type="text" class="opt-item-search" placeholder="Cari item..." autocomplete="off" value="${escapeHtml(label)}">
        </div>
        <input type="hidden" class="opt-item-id" value="${escapeHtml(itemId)}">
        <div class="opt-item-suggestions"></div>
      </div>
      <input type="number" class="opt-qty" min="1" value="1">
      <select class="opt-combo">${comboOptionsHtml()}</select>
      <button class="opt-remove" title="Hapus">×</button>
    `;

    const searchInput = row.querySelector('.opt-item-search');
    const katSelect = row.querySelector('.opt-kategori');
    const idInput = row.querySelector('.opt-item-id');
    const box = row.querySelector('.opt-item-suggestions');

    searchInput.addEventListener('focus', function(){ refreshOptItemSuggestions(row); });
    searchInput.addEventListener('input', function(){
      idInput.value = '';
      refreshOptItemSuggestions(row);
    });
    searchInput.addEventListener('blur', function(){ setTimeout(function(){ hideOptItemSuggestions(row); }, 150); });
    katSelect.addEventListener('change', function(){
      idInput.value = '';
      searchInput.value = '';
      refreshOptItemSuggestions(row);
      searchInput.focus();
    });
    box.addEventListener('mousedown', function(e){
      const item = e.target.closest('.cmp-suggestion[data-item]');
      if(!item) return;
      idInput.value = item.getAttribute('data-item');
      searchInput.value = item.getAttribute('data-label');
      hideOptItemSuggestions(row);
    });

    row.querySelector('.opt-remove').addEventListener('click', function(){ row.remove(); });
    wrap.appendChild(row);
  }

  document.getElementById('btnAddRow').addEventListener('click', function(){ addOptRow(); });

  function pickBestOfferForVendor(vendorOffers, reqKey, reqQty){
    let best = null;
    vendorOffers.forEach(function(o){
      const p = resolveCombinationPrice(o, reqKey);
      if(!p) return;
      const baseQty = o.qtyNumber || 1;
      const scaledTotal = (p.price / baseQty) * reqQty;
      if(!best || scaledTotal < best.scaledTotal){
        best = { offer: o, pricing: p, scaledTotal: scaledTotal, baseQty: baseQty };
      }
    });
    return best;
  }

  function runOptimizer(){
    const catalog = buildCatalog();

    const rowEls = Array.from(document.querySelectorAll('#optRows .opt-row'));
    const reqRows = rowEls.map(function(row){
      return {
        itemId: row.querySelector('.opt-item-id').value,
        itemLabel: row.querySelector('.opt-item-search').value,
        qty: Math.max(1, parseInt(row.querySelector('.opt-qty').value) || 1),
        comboKey: row.querySelector('.opt-combo').value
      };
    });

    if(!reqRows.length){
      showOptimizerMessage('Tambahkan minimal satu item.');
      return;
    }

    if(reqRows.some(r => !r.itemId)){
      showOptimizerMessage('Ada baris yang belum memilih item dari daftar saran — ketik nama item lalu pilih salah satu saran yang muncul.');
      return;
    }

    let itemTotal = 0;
    const assignment = [];
    const missing = [];

    reqRows.forEach(function(r){
      const allOffers = catalog[r.itemId] || [];
      const vendors = Array.from(new Set(allOffers.map(o=>o.vendor)));
      let rowBest = null;
      vendors.forEach(function(v){
        const vOffers = allOffers.filter(o=>o.vendor===v);
        const picked = pickBestOfferForVendor(vOffers, r.comboKey, r.qty);
        if(picked && (!rowBest || picked.scaledTotal < rowBest.scaledTotal)) rowBest = picked;
      });

      if(!rowBest){ missing.push(r.itemLabel); return; }

      const usedCombo = comboByKey(rowBest.pricing.key);
      itemTotal += rowBest.scaledTotal;
      assignment.push({
        item: r.itemLabel, qty: r.qty, reqComboKey: r.comboKey,
        vendor: rowBest.offer.vendor, total: rowBest.scaledTotal,
        exact: rowBest.pricing.exact, comboUsedLabel: usedCombo ? usedCombo.label : '',
        tbc: rowBest.offer.tbc, sheetLink: sheetLink(rowBest.offer),
        spesifikasi: rowBest.offer.spesifikasi
      });
    });

    if(!assignment.length){
      showOptimizerMessage('Tidak ada kombinasi yang bisa dihitung dari kebutuhan ini.');
      return;
    }

    renderOptResult({ assignment: assignment, itemTotal: itemTotal, missing: missing });
  }

  function renderOptResult(best){
    const el = document.getElementById('optResult');

    const byVendor = {};
    best.assignment.forEach(function(a){
      if(!byVendor[a.vendor]) byVendor[a.vendor] = [];
      byVendor[a.vendor].push(a);
    });

    let rowsHtml = '';
    Object.entries(byVendor).forEach(function([vendor, items]){
      rowsHtml += `
        <tr>
          <td colspan="4"><span class="vname">${escapeHtml(vendor)}</span></td>
        </tr>
      `;
      items.forEach(function(a){
        let note = '';
        if(!a.exact){
          note += `<span class="approx-note">≈ tidak ada kombinasi persis, dipakai kombinasi terdekat: ${escapeHtml(a.comboUsedLabel)}</span>`;
        } else {
          note += `<span class="gr-note">✓ ${escapeHtml(a.comboUsedLabel)}</span>`;
        }
        rowsHtml += `
          <tr>
            <td>
              ${escapeHtml(a.item)}
              ${a.tbc ? '<span class="tbcbadge">TBC</span>' : ''}
              ${note}
              <a href="${a.sheetLink}" target="_blank" rel="noopener" class="viewlink" style="margin-top:4px">🔗 Lihat cell</a>
            </td>
            <td>${a.qty}</td>
            <td>${fmtRp(a.total / a.qty)}</td>
            <td>${fmtRp(a.total)}</td>
          </tr>
        `;
      });
    });

    const missingHtml = best.missing && best.missing.length
      ? `<div class="miss-note">⚠ Tidak ditemukan penawaran untuk: ${best.missing.map(escapeHtml).join(', ')}</div>`
      : '';

    el.innerHTML = `
      <div class="opt-summary">
        <div class="box"><div class="l">Jumlah Item</div><div class="v">${best.assignment.length}</div></div>
        <div class="box hero"><div class="l">Total Termurah</div><div class="v">${fmtRp(best.itemTotal)}</div></div>
      </div>

      <table class="opt-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Harga Satuan</th><th>Subtotal</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      ${missingHtml}
    `;
  }

  function showOptimizerMessage(message){
    document.getElementById('optResult').innerHTML =
      '<div class="opt-result-empty">' + escapeHtml(message) + '</div>';
  }

  document.getElementById('btnOptimize').addEventListener('click', runOptimizer);

  /* =====================================================
     BANDINGKAN HARGA SEMUA VENDOR
  ===================================================== */
  let cmpSelectedItemId = null;
  let cmpActiveComboKey = null;

  function buildComparisonGroups(){
    const groups = {};
    data.forEach(function(r){
      if(!r.combos || !Object.keys(r.combos).length) return;
      if(!groups[r.itemId]){
        groups[r.itemId] = { itemId: r.itemId, item: r.item, kategori: r.kategori, jenis: r.jenis, rows: [] };
      }
      groups[r.itemId].rows.push(r);
    });
    cmpGroups = groups;
  }

  function comboKeysAvailableForGroup(g){
    const set = new Set();
    g.rows.forEach(function(r){
      Object.keys(r.combos).forEach(k => set.add(k));
    });
    return combosMaster.filter(c => set.has(c.key));
  }

  function cheapestPriceForGroup(g, comboKey){
    let min = Infinity;
    g.rows.forEach(function(r){
      const p = resolveCombinationPrice(r, comboKey);
      if(p && p.price < min) min = p.price;
    });
    return min === Infinity ? null : min;
  }

  function populateCmpFilters(){
    const sel = document.getElementById('cmpKategori');
    const kategoriSet = new Set(Object.values(cmpGroups).map(g=>g.kategori));
    Array.from(kategoriSet).sort().forEach(function(k){
      const o = document.createElement('option'); o.value=k; o.textContent=k; sel.appendChild(o);
    });
    sel.addEventListener('change', function(){
      cmpSelectedItemId = null;
      refreshCmpSuggestions();
    });
  }

  function refreshCmpSuggestions(){
    const box = document.getElementById('cmpSuggestions');
    const q = document.getElementById('cmpSearchInput').value.trim().toLowerCase();
    const kat = document.getElementById('cmpKategori').value;
    const previewComboKey = document.getElementById('selKombinasi').value;

    let candidates = Object.values(cmpGroups).filter(function(g){
      if(kat && g.kategori !== kat) return false;
      if(!q) return true;
      const hay = (g.itemId + ' ' + g.item + ' ' + g.kategori).toLowerCase();
      return hay.includes(q);
    }).sort((a,b)=>a.item.localeCompare(b.item));

    const isDefaultList = !q;
    candidates = candidates.slice(0, 8);

    if(!candidates.length){
      box.innerHTML = '<div class="cmp-suggestion" style="cursor:default;color:var(--v-muted)">Tidak ada item yang cocok.</div>';
      box.classList.add('open');
      return;
    }

    box.innerHTML =
      (isDefaultList ? '<div class="cmp-suggest-label">Contoh item</div>' : '') +
      candidates.map(function(g){
        const min = cheapestPriceForGroup(g, previewComboKey);
        return `
          <div class="cmp-suggestion" data-item="${escapeHtml(g.itemId)}">
            <div class="s-nm">${highlight(g.item, q)}</div>
            <div class="s-meta">${escapeHtml(g.kategori)} · ${g.rows.length} vendor · mulai ${min!==null ? fmtRp(min) : '-'}</div>
          </div>
        `;
      }).join('');
    box.classList.add('open');
  }

  function hideCmpSuggestions(){
    document.getElementById('cmpSuggestions').classList.remove('open');
  }

  document.getElementById('cmpSearchInput').addEventListener('focus', refreshCmpSuggestions);
  document.getElementById('cmpSearchInput').addEventListener('input', function(){
    cmpSelectedItemId = null;
    refreshCmpSuggestions();
  });
  document.getElementById('cmpSearchInput').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); triggerCompare(); }
    if(e.key === 'Escape'){ hideCmpSuggestions(); }
  });
  document.getElementById('cmpSuggestions').addEventListener('mousedown', function(e){
    const item = e.target.closest('.cmp-suggestion[data-item]');
    if(!item) return;
    const itemId = item.getAttribute('data-item');
    const g = cmpGroups[itemId];
    if(!g) return;
    cmpSelectedItemId = itemId;
    document.getElementById('cmpSearchInput').value = g.item;
    hideCmpSuggestions();
    renderComparisonResult(g);
  });
  document.getElementById('cmpSearchInput').addEventListener('blur', function(){
    setTimeout(hideCmpSuggestions, 150);
  });
  document.getElementById('btnCompare').addEventListener('click', triggerCompare);

  function triggerCompare(){
    hideCmpSuggestions();
    const q = document.getElementById('cmpSearchInput').value.trim().toLowerCase();
    const kat = document.getElementById('cmpKategori').value;

    if(cmpSelectedItemId){
      const g = cmpGroups[cmpSelectedItemId];
      if(g){ renderComparisonResult(g); return; }
    }

    if(!q){
      showCmpMessage('Ketik dulu nama item yang mau dibandingkan, lalu pilih dari daftar saran.');
      return;
    }

    const matches = Object.values(cmpGroups).filter(function(g){
      if(kat && g.kategori !== kat) return false;
      const hay = (g.itemId + ' ' + g.item + ' ' + g.kategori).toLowerCase();
      return hay.includes(q);
    });

    if(matches.length === 1){
      renderComparisonResult(matches[0]);
    } else if(matches.length === 0){
      showCmpMessage(`Tidak ditemukan item yang cocok dengan "${document.getElementById('cmpSearchInput').value.trim()}".`);
    } else {
      showCmpMessage(`Ada ${matches.length} item yang cocok — silakan pilih salah satu dari daftar saran di atas kolom pencarian.`);
      refreshCmpSuggestions();
    }
  }

  function showCmpMessage(message){
    cmpSelectedItemId = null;
    document.getElementById('cmpResult').innerHTML =
      '<div class="cmp-result-empty">' + escapeHtml(message) + '</div>';
  }

  function renderComparisonResult(g, comboKey){
    cmpSelectedItemId = g.itemId;

    if(!comboKey){
      const avail = comboKeysAvailableForGroup(g);
      const preferredKey = cmpActiveComboKey || document.getElementById('selKombinasi').value;
      comboKey = avail.some(c=>c.key===preferredKey) ? preferredKey : (avail[0] ? avail[0].key : preferredKey);
    }
    cmpActiveComboKey = comboKey;

    const resolved = g.rows.map(function(r){
      return { row: r, pricing: resolveCombinationPrice(r, comboKey) };
    }).filter(x => x.pricing !== null);

    if(!resolved.length){
      document.getElementById('cmpResult').innerHTML =
        '<div class="cmp-result-empty">Tidak ada data harga untuk item ini pada kombinasi manapun.</div>';
      return;
    }

    resolved.sort((a,b) => a.pricing.price - b.pricing.price);
    const min = resolved[0].pricing.price;
    const max = resolved[resolved.length-1].pricing.price;

    const availCombos = comboKeysAvailableForGroup(g);
    const comboSelectHtml = combosMaster.map(function(c){
      const has = availCombos.some(a=>a.key===c.key);
      return `<option value="${escapeHtml(c.key)}" ${c.key===comboKey?'selected':''}>${escapeHtml(c.label)}${has?'':' (approx utk semua vendor)'}</option>`;
    }).join('');

    let vendorRowsHtml = '';
    resolved.forEach(function(x){
      const o = x.row, p = x.pricing;
      const isCheapest = p.price === min && resolved.length > 1;
      const usedCombo = comboByKey(p.key);
      vendorRowsHtml += `
        <div class="cmp-vendor-row">
          <div class="vn">${escapeHtml(o.vendor)}
            ${isCheapest ? '<span class="cheapest-badge">✓ Termurah</span>' : ''}
            ${o.tbc ? '<span class="tbcbadge">TBC</span>' : ''}
          </div>
          <div class="spec">${o.spesifikasi ? escapeHtml(o.spesifikasi) : '<span class="spec-empty">— tidak ada spesifikasi —</span>'}</div>
          <div class="qty">${o.qtyNumber ? escapeHtml(o.qtyNumber + (o.qtySatuan?(' '+o.qtySatuan):'')) : '-'}</div>
          <div class="price">
            <span class="mono">${fmtRp(p.price)}</span>
            ${!p.exact ? `<span class="persat" style="color:var(--v-amber)">≈ ${usedCombo?escapeHtml(usedCombo.label):''}</span>` : `<span class="persat">${usedCombo?escapeHtml(usedCombo.label):''}</span>`}
            ${o.rateSatuan ? `<span class="persat">≈ ${fmtRp(o.rateSatuan)} / ${o.qtySatuan || 'satuan'}</span>` : ''}
            <br><a href="${sheetLink(o)}" target="_blank" rel="noopener" class="viewlink" style="margin-top:6px">🔗 Lihat</a>
          </div>
        </div>
      `;
    });

    document.getElementById('cmpResult').innerHTML = `
      <div class="cmp-item">
        <div class="cmp-item-head">
          <div class="left">
            <div class="nm">${escapeHtml(g.item)}</div>
            <div class="meta">${escapeHtml(g.kategori)} · ${escapeHtml(g.itemId)} · ${g.rows.length} vendor tersedia</div>
          </div>
          <div class="right">
            <div class="range">
              <span class="lo">${fmtRp(min)}</span>${max>min ? ' – <span class="hi">'+fmtRp(max)+'</span>' : ''}
            </div>
          </div>
        </div>
        <div class="cmp-combo-bar">
          <label>Kombinasi Hari + GR</label>
          <select id="cmpComboSelect">${comboSelectHtml}</select>
          <span class="cmp-combo-hint">Ganti kombinasi untuk melihat apakah vendor termurah berubah.</span>
        </div>
        <div class="cmp-item-body">${vendorRowsHtml}</div>
      </div>
    `;

    document.getElementById('cmpComboSelect').addEventListener('change', function(){
      renderComparisonResult(g, this.value);
    });
  }
})();
