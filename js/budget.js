/* =========================================================================
   budget.js — halaman Budget. Item, vendor, dan harga diambil dari database
   yang sama dengan halaman Database (Google Sheets, lihat vendor.js).
   Harga di database sudah per kombinasi "N Day + M GR", jadi harga satuan
   mengikuti isian Hari Event & Hari GR.
   ========================================================================= */
(function () {
  const SS = { id: '1X03xTnUsCz-QOWNeIXfTKhdMO1eaVDNmqBuIClHnAWk', key: 'AIzaSyAGQc7xZgCkRqsE_WtPwZSR2_2xGemYaGQ' };
  const CATS = ['Venue', 'Equipment', 'Creative Content', 'Support Event', 'Production Cost', 'Talent'];
  const COMBO = /^(\d+)\s*day\s*\+\s*(\d+)\s*gr$/;
  const KEY = 'mx_budget_v1';
  const $ = id => document.getElementById(id);
  const canon = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = n => nf.format(r2(n));
  const letter = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let uid = 0; const nid = () => 'b' + (++uid);
  function h(tag, a, ...kids) {
    const el = document.createElement(tag);
    for (const k in (a || {})) {
      if (k === 'class') el.className = a[k]; else if (k === 'text') el.textContent = a[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), a[k]); else el.setAttribute(k, a[k]);
    }
    kids.forEach(x => x != null && el.append(x)); return el;
  }

  /* ---------- database (Google Sheets) ---------- */
  let DB = { rows: [], combos: {}, items: new Map(), vendors: [] };
  async function fetchDb() {
    const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + SS.id;
    const mr = await fetch(base + '?key=' + SS.key + '&fields=sheets.properties');
    if (!mr.ok) throw new Error('HTTP ' + mr.status);
    const sheets = ((await mr.json()).sheets || []).map(s => s.properties);
    const q = sheets.map(s => 'ranges=' + encodeURIComponent(s.title)).join('&');
    const vr = await fetch(base + '/values:batchGet?key=' + SS.key + '&' + q + '&valueRenderOption=UNFORMATTED_VALUE');
    if (!vr.ok) throw new Error('HTTP ' + vr.status);
    const rows = [], combos = {};
    ((await vr.json()).valueRanges || []).forEach((rng, si) => {
      const vals = rng.values || []; if (vals.length < 2) return;
      let hi = -1, head = [];
      for (let i = 0; i < Math.min(6, vals.length) && hi < 0; i++) {
        const n = vals[i].map(c => String(c || '').trim().toLowerCase());
        if (n.includes('item id') && n.includes('vendor') && n.some(c => COMBO.test(c))) { hi = i; head = n; }
      }
      if (hi < 0) return;
      const col = { cb: {} };
      head.forEach((c, i) => {
        if (c === 'item id') col.id = i; else if (c === 'kategori') col.kat = i; else if (c === 'nama item') col.item = i;
        else if (c === 'spesifikasi') col.spec = i; else if (c === 'quantity') col.qty = i; else if (c === 'satuan') col.unit = i;
        else if (c === 'vendor') col.vendor = i;
        else { const m = c.match(COMBO); if (m) { col.cb[m[1] + '_' + m[2]] = i; combos[m[1] + '_' + m[2]] = { e: +m[1], g: +m[2] }; } }
      });
      if (col.item === undefined || col.vendor === undefined) return;
      for (let r = hi + 1; r < vals.length; r++) {
        const row = vals[r]; if (!row[col.item]) continue;
        const cp = {}; let any = false;
        Object.keys(col.cb).forEach(k => { const v = row[col.cb[k]]; if (v !== '' && v != null && !isNaN(Number(v))) { cp[k] = Number(v); any = true; } });
        if (!any) continue;
        rows.push({
          id: sheets[si].sheetId + ':' + r, itemId: col.id !== undefined ? String(row[col.id] || '').trim() : '',
          kat: col.kat !== undefined ? String(row[col.kat] || '').trim() : '', item: String(row[col.item]).trim(),
          spec: col.spec !== undefined ? String(row[col.spec] || '').trim() : '',
          qty: col.qty !== undefined && row[col.qty] !== '' && Number(row[col.qty]) > 0 ? Number(row[col.qty]) : 1,
          unit: col.unit !== undefined ? String(row[col.unit] || '').trim() : '',
          vendor: row[col.vendor] ? String(row[col.vendor]).trim() : '(vendor tidak diketahui)', combos: cp
        });
      }
    });
    return { rows, combos };
  }
  function indexDb(res) {
    DB.rows = res.rows; DB.combos = res.combos; DB.items = new Map();
    const vs = new Set();
    DB.rows.forEach(o => {
      const k = canon(o.item); vs.add(o.vendor);
      if (!DB.items.has(k)) DB.items.set(k, { name: o.item, kat: o.kat, ids: new Set(), offers: [] });
      const e = DB.items.get(k); e.offers.push(o); if (o.itemId) e.ids.add(canon(o.itemId));
    });
    DB.vendors = [...vs].sort((a, b) => a.localeCompare(b));
  }
  /* harga satuan untuk kombinasi hari saat ini (persis, atau terdekat bila tidak ada) */
  function priceOf(o) {
    const e = state.ev || 0, g = state.gr || 0, keys = Object.keys(o.combos);
    if (!keys.length) return null;
    let k = e + '_' + g, exact = true;
    if (o.combos[k] === undefined) {
      exact = false; let best = null, bd = Infinity;
      keys.forEach(c => { const m = DB.combos[c]; if (!m) return; const d = Math.abs(m.e - e) * 1000 + Math.abs(m.g - g); if (d < bd || (d === bd && o.combos[c] < o.combos[best])) { bd = d; best = c; } });
      k = best;
    }
    const m = DB.combos[k];
    return { unit: r2(o.combos[k] / o.qty), exact, label: m ? m.e + ' Hari Event' + (m.g ? ' + ' + m.g + ' Hari GR' : ' (Tanpa GR)') : '' };
  }
  const cheapest = list => list.reduce((b, o) => { const p = priceOf(o); return p && (!b || p.unit < b.p.unit) ? { o, p } : b; }, null);

  /* ---------- state ---------- */
  const fresh = keep => ({
    nama: keep ? keep.nama : '', venue: keep ? keep.venue : '', gr: keep ? keep.gr : 0, ev: keep ? keep.ev : 0,
    cats: CATS.map(n => ({ id: nid(), name: n, custom: false, items: [newItem()] }))
  });
  const newItem = () => ({ id: nid(), name: '', vendor: '', offerId: null, pcs: 0, price: 0 });
  let state = fresh(), saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }, 300); };
  (function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && Array.isArray(s.cats)) { state = s; let m = 0; JSON.stringify(s).replace(/"id":"b(\d+)"/g, (_, n) => { m = Math.max(m, +n); return ''; }); uid = m; }
    } catch (e) {}
  })();
  const days = () => Math.max((state.gr || 0) + (state.ev || 0), 1);

  /* ---------- angka ---------- */
  function bindNum(inp, get, set) {
    const show = () => { inp.value = get() ? fmt(get()) : ''; }; show();
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('input', () => {
      const raw = inp.value.replace(/[^\d,]/g, ''), ci = raw.indexOf(',');
      const ip = (ci < 0 ? raw : raw.slice(0, ci)).replace(/^0+(?=\d)/, '').slice(0, 13);
      const dp = ci < 0 ? null : raw.slice(ci + 1).replace(/,/g, '').slice(0, 2);
      inp.value = (ip ? nf.format(parseInt(ip, 10)) : (dp !== null ? '0' : '')) + (dp !== null ? ',' + dp : '');
      set(parseFloat((ip || '0') + (dp ? '.' + dp : ''))); update(); save();
    });
    inp.addEventListener('keydown', e => { if (e.key === '.' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); inp.setRangeText(',', inp.selectionStart, inp.selectionEnd, 'end'); inp.dispatchEvent(new Event('input')); } });
    inp.addEventListener('blur', show);
    return show;
  }

  /* ---------- autocomplete nama barang (ghost + daftar) ---------- */
  const list = $('b-list'); let acInp = null, acRow = null, acItems = [], acIdx = -1, acGhost = null;
  function suggest(q) {
    q = canon(q); if (!q) return [];
    const pre = [], inc = [];
    DB.items.forEach((e, k) => { if (k.startsWith(q)) pre.push(e); else if (k.includes(q) || [...e.ids].some(i => i.includes(q))) inc.push(e); });
    pre.sort((a, b) => a.name.length - b.name.length);
    return pre.concat(inc).slice(0, 8);
  }
  function closeAc() { list.hidden = true; acItems = []; acIdx = -1; if (acGhost) acGhost.textContent = ''; }
  function showAc(inp, row, ghost) {
    acInp = inp; acRow = row; acGhost = ghost;
    acItems = suggest(inp.value); acIdx = acItems.length ? 0 : -1;
    const q = canon(inp.value), top = acItems[0];
    ghost.textContent = '';
    if (top && canon(top.name).startsWith(q) && top.name.length > inp.value.trim().length) {
      ghost.append(h('i', { text: inp.value }), document.createTextNode(top.name.slice(inp.value.length)));
    }
    if (!acItems.length) { list.hidden = true; return; }
    list.textContent = '';
    acItems.forEach((e, i) => {
      const n = new Set(e.offers.map(o => o.vendor)).size;
      const li = h('li', { class: i === acIdx ? 'on' : '', role: 'option' }, h('span', { text: e.name }), h('small', { text: (e.kat ? e.kat + ' · ' : '') + n + ' vendor' }));
      li.addEventListener('mousedown', ev => { ev.preventDefault(); pick(e.name); });
      list.append(li);
    });
    const r = inp.getBoundingClientRect();
    list.style.left = r.left + 'px'; list.style.top = (r.bottom + 2) + 'px'; list.style.minWidth = Math.max(r.width, 320) + 'px';
    list.hidden = false;
  }
  function pick(name) {
    acInp.value = name; acRow.name = name;
    const e = DB.items.get(canon(name));
    if (acRow.offerId && !(e && e.offers.some(o => o.id === acRow.offerId))) { acRow.offerId = null; acRow.vendor = ''; }
    acRow.rebuild(); closeAc(); update(); save();
  }
  function markAc() { [...list.children].forEach((li, i) => li.classList.toggle('on', i === acIdx)); }

  /* ---------- tabel ---------- */
  const refs = {};
  function vendorOptions(it) {
    const e = DB.items.get(canon(it.name));
    const sel = it._sel; sel.textContent = '';
    sel.append(h('option', { value: '', text: e ? 'Pilih vendor (' + new Set(e.offers.map(o => o.vendor)).size + ')' : 'Pilih vendor' }));
    sel.append(h('option', { value: '-', text: '-' }));   /* tanpa vendor: tidak disimpan/ditampilkan */
    if (e) {
      const by = new Map();
      e.offers.forEach(o => { const p = priceOf(o); if (!p) return; const c = by.get(o.vendor); if (!c || p.unit < c.p.unit) by.set(o.vendor, { o, p }); });
      [...by.entries()].sort((a, b) => a[1].p.unit - b[1].p.unit).forEach(([v, x]) => sel.append(h('option', { value: v, text: v + ' · Rp ' + fmt(x.p.unit) })));
    } else DB.vendors.forEach(v => sel.append(h('option', { value: v, text: v })));
    if (it.vendor && ![...sel.options].some(o => o.value === it.vendor)) sel.append(h('option', { value: it.vendor, text: it.vendor }));
    sel.value = it.vendor || '';
  }
  function applyVendor(it, silent) {
    const e = DB.items.get(canon(it.name));
    const offers = e ? e.offers.filter(o => o.vendor === it.vendor) : [];
    const best = offers.length ? cheapest(offers) : null;
    if (best) {
      it.offerId = best.o.id; it.price = best.p.unit; if (!it.pcs && !silent) it.pcs = 1;
      const r = refs[it.id]; r.price.title = 'Database: ' + best.p.label + (best.p.exact ? '' : ' (kombinasi terdekat)');
      r.show(); r.pcsShow();
    } else { it.offerId = null; if (refs[it.id]) refs[it.id].price.title = ''; }
  }
  function render() {
    const table = $('b-sheet'); table.querySelectorAll('tbody').forEach(t => t.remove());
    state.cats.forEach((cat, ci) => {
      const tb = h('tbody'), sub = h('td', { class: 'n' });
      let name;
      if (cat.custom) { const inp = h('input', { class: 'cat-in', value: cat.name, placeholder: 'Nama kategori', 'aria-label': 'Nama kategori' }); inp.addEventListener('input', () => { cat.name = inp.value; save(); }); name = h('span', {}, letter(ci) + '.  ', inp); }
      else name = h('span', { text: letter(ci) + '.  ' + cat.name });
      const delc = h('td', { class: 'noprint' });
      if (cat.custom) delc.append(h('button', { class: 'x', type: 'button', title: 'Hapus kategori', 'aria-label': 'Hapus kategori', text: '×', onclick: () => { state.cats = state.cats.filter(c => c.id !== cat.id); render(); update(); save(); } }));
      tb.append(h('tr', { class: 'cat' }, h('td', { colspan: '5' }, name), sub, delc));
      refs[cat.id] = sub;
      cat.items.forEach((it, i) => tb.append(row(cat, it, i)));
      tb.append(h('tr', { class: 'addrow' }, h('td', { colspan: '7' }, h('button', { class: 'add', type: 'button', text: '+ Tambah barang', onclick: () => { const n = newItem(); cat.items.push(n); render(); update(); save(); refs[n.id].nm.focus(); } }))));
      table.append(tb);
    });
  }
  function row(cat, it, i) {
    const nm = h('input', { class: 'cell name', value: it.name, placeholder: 'Ketik nama barang…', 'aria-label': 'Nama barang', autocomplete: 'off' });
    const ghost = h('span', { class: 'ghost', 'aria-hidden': 'true' });
    it._sel = h('select', { 'aria-label': 'Vendor' });
    it.rebuild = () => { vendorOptions(it); };
    const pcs = h('input', { class: 'cell', inputmode: 'decimal', placeholder: '0', 'aria-label': 'Pcs' });
    const price = h('input', { class: 'cell', inputmode: 'decimal', placeholder: '0', 'aria-label': 'Harga satuan' });
    const pcsShow = bindNum(pcs, () => it.pcs, v => { it.pcs = v; });
    const show = bindNum(price, () => it.price, v => { it.price = v; it.offerId = null; price.title = ''; });
    const tot = h('td', { class: 'tot' });
    refs[it.id] = { nm, price, show, pcsShow, tot };
    nm.addEventListener('input', () => {
      it.name = nm.value;
      const e = DB.items.get(canon(it.name));
      if (it.offerId && !(e && e.offers.some(o => o.id === it.offerId))) { it.offerId = null; it.vendor = ''; }
      vendorOptions(it); showAc(nm, it, ghost); update(); save();
    });
    nm.addEventListener('keydown', e => {
      if (list.hidden || acInp !== nm) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); acIdx = (acIdx + 1) % acItems.length; markAc(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); acIdx = (acIdx - 1 + acItems.length) % acItems.length; markAc(); }
      else if (e.key === 'Enter' || (e.key === 'Tab' && ghost.textContent) || (e.key === 'ArrowRight' && ghost.textContent && nm.selectionStart === nm.value.length)) { if (acItems[acIdx]) { e.preventDefault(); pick(acItems[acIdx].name); } }
      else if (e.key === 'Escape') closeAc();
    });
    nm.addEventListener('focus', () => { if (nm.value) showAc(nm, it, ghost); });
    nm.addEventListener('blur', () => setTimeout(() => { if (acInp === nm) closeAc(); }, 120));
    vendorOptions(it);
    it._sel.addEventListener('change', () => { it.vendor = it._sel.value; applyVendor(it); update(); save(); });
    const del = h('td', { class: 'noprint' }, h('button', { class: 'x', type: 'button', title: 'Hapus baris', 'aria-label': 'Hapus baris', text: '×', onclick: () => { cat.items = cat.items.filter(x => x.id !== it.id); if (!cat.items.length) cat.items.push(newItem()); render(); update(); save(); } }));
    return h('tr', {}, h('td', { class: 'no', text: String(i + 1) }), h('td', {}, h('div', { class: 'ac' }, ghost, nm)), h('td', {}, it._sel), h('td', {}, pcs), h('td', {}, price), tot, del);
  }
  /* Total baris: harga dari database sudah mencakup kombinasi hari, jadi tidak dikali hari lagi. Harga manual dikali (hari GR + hari Event). */
  const lineTotal = it => r2((it.pcs || 0) * (it.price || 0) * (it.offerId ? 1 : days()));
  function update() {
    let G = 0;
    state.cats.forEach(cat => {
      let c = 0;
      cat.items.forEach(it => { const t = lineTotal(it); c += t; if (refs[it.id]) refs[it.id].tot.textContent = t ? fmt(t) : '–'; });
      G += c; if (refs[cat.id]) refs[cat.id].textContent = fmt(c);
    });
    $('b-grand').textContent = 'Rp ' + fmt(G);
    $('b-foot').textContent = 'Harga dari database sudah sesuai kombinasi ' + (state.ev || 0) + ' Hari Event + ' + (state.gr || 0) + ' Hari GR. Harga yang diketik manual dikali ' + days() + ' hari.';
  }
  function refreshPrices() {   /* hari berubah: hitung ulang harga yang berasal dari database */
    state.cats.forEach(c => c.items.forEach(it => {
      if (!it.offerId) return;
      const o = DB.rows.find(x => x.id === it.offerId); const p = o && priceOf(o);
      if (p) { it.price = p.unit; refs[it.id].show(); refs[it.id].price.title = 'Database: ' + p.label + (p.exact ? '' : ' (kombinasi terdekat)'); }
    }));
    state.cats.forEach(c => c.items.forEach(it => { if (DB.rows.length) vendorOptions(it); }));
  }

  /* ---------- kontrol atas ---------- */
  function sync() { $('b-nama').value = state.nama || ''; $('b-venue').value = state.venue || ''; $('b-gr').value = state.gr || ''; $('b-ev').value = state.ev || ''; }
  [['b-nama', 'nama'], ['b-venue', 'venue']].forEach(([id, k]) => $(id).addEventListener('input', e => { state[k] = e.target.value; save(); }));
  [['b-gr', 'gr'], ['b-ev', 'ev']].forEach(([id, k]) => $(id).addEventListener('input', e => {
    const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0; state[k] = v; e.target.value = v || '';
    refreshPrices(); update(); save();
  }));
  $('b-addcat').addEventListener('click', () => { state.cats.push({ id: nid(), name: '', custom: true, items: [newItem()] }); render(); update(); save(); });
  let rt = null;
  $('b-reset').addEventListener('click', () => {
    const b = $('b-reset');
    if (!rt) { b.textContent = 'Yakin? Klik lagi untuk reset'; rt = setTimeout(() => { b.textContent = 'Kosongkan semua isian'; rt = null; }, 3000); return; }
    clearTimeout(rt); rt = null; b.textContent = 'Kosongkan semua isian';
    state = fresh(state); sync(); render(); update(); save();
  });
  $('b-print').addEventListener('click', () => { const old = document.title; document.title = 'Budget - ' + (state.nama || 'Event'); window.addEventListener('afterprint', () => { document.title = old; }, { once: true }); try { window.print(); } catch (e) { document.title = old; } });
  window.addEventListener('scroll', closeAc, true);

  sync(); render(); update();
  fetchDb().then(res => {
    indexDb(res); state.cats.forEach(c => c.items.forEach(it => { vendorOptions(it); if (it.offerId) applyVendor(it, true); }));
    refreshPrices(); update();
    $('b-status').textContent = 'Database terhubung: ' + DB.items.size + ' item dari ' + DB.vendors.length + ' vendor.';
  }).catch(err => {
    const s = $('b-status'); s.className = 'b-status err';
    s.textContent = 'Database gagal dimuat (' + (err && err.message || 'error') + '). Anda tetap bisa mengisi manual.';
  });
})();
