/* =========================================================================
   combobox.js — a small, dependency-free searchable dropdown ("combobox").

   Turns a plain <input type="text"> into:
   - a dropdown you can click to browse the full option list, and
   - a search box that filters the list as you type.

   It does NOT force the user to pick from the list — whatever text is in
   the input when the form is submitted is still what gets saved. Picking
   an option just fills the input (and lets you react via onSelect, e.g. to
   auto-fill other fields).

   Usage:
     initCombobox(inputEl, {
       getOptions: (query) => [...],       // return matching options for the current query
       renderLabel: (option) => "string",  // text shown in the dropdown row
       getValue: (option) => "string",     // text written into the input on pick
       onSelect: (option, inputEl) => {},  // optional side-effect, e.g. autofill
     });
   ========================================================================= */

function initCombobox(inputEl, { getOptions, renderLabel, getValue, onSelect }) {
  const wrapper = document.createElement("div");
  wrapper.className = "combo-wrapper";
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  inputEl.classList.add("combo-input");
  inputEl.setAttribute("autocomplete", "off");
  inputEl.setAttribute("role", "combobox");
  inputEl.setAttribute("aria-expanded", "false");
  inputEl.setAttribute("aria-autocomplete", "list");

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "combo-toggle";
  toggleBtn.setAttribute("aria-label", "Tampilkan daftar");
  toggleBtn.tabIndex = -1;
  wrapper.appendChild(toggleBtn);

  const list = document.createElement("ul");
  list.className = "combo-list";
  list.hidden = true;
  wrapper.appendChild(list);

  let options = [];
  let activeIndex = -1;

  function open(showAll) {
    options = getOptions(showAll ? "" : inputEl.value);
    activeIndex = -1;
    renderList();
    list.hidden = options.length === 0;
    inputEl.setAttribute("aria-expanded", String(!list.hidden));
  }

  function close() {
    list.hidden = true;
    inputEl.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  }

  function renderList() {
    list.innerHTML = "";
    if (options.length === 0) {
      const li = document.createElement("li");
      li.className = "combo-option combo-empty";
      li.textContent = "Tidak ditemukan — data akan disimpan sebagai teks bebas.";
      list.appendChild(li);
      return;
    }
    options.forEach((opt, i) => {
      const li = document.createElement("li");
      li.className = "combo-option" + (i === activeIndex ? " active" : "");
      li.textContent = renderLabel(opt);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus on input, avoid blur-before-click
        pick(opt);
      });
      list.appendChild(li);
    });
  }

  function pick(opt) {
    inputEl.value = getValue(opt);
    if (typeof onSelect === "function") onSelect(opt, inputEl);
    close();
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  inputEl.addEventListener("input", () => open(false));
  inputEl.addEventListener("focus", () => open(inputEl.value === ""));
  inputEl.addEventListener("blur", () => setTimeout(close, 120));
  toggleBtn.addEventListener("click", () => {
    if (list.hidden) {
      inputEl.focus();
      open(true);
    } else {
      close();
    }
  });

  inputEl.addEventListener("keydown", (e) => {
    if (list.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      open(true);
      return;
    }
    if (list.hidden || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, options.length - 1);
      renderList();
      scrollActiveIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderList();
      scrollActiveIntoView();
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        pick(options[activeIndex]);
      }
    } else if (e.key === "Escape") {
      close();
    }
  });

  function scrollActiveIntoView() {
    const el = list.querySelector(".combo-option.active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  return {
    refresh: () => open(inputEl.value === ""),
    destroy: () => wrapper.replaceWith(inputEl),
  };
}


/* =========================================================================
   initGhostAutocomplete — input teks biasa dengan "ghost text": saat
   mengetik, sisa karakter dari entri dictionary yang cocok (awalan) muncul
   sebagai teks abu-abu tepat di belakang kursor. Tab / → (di ujung teks)
   atau ketuk teks abu-abu = terima saran. Enter TIDAK menerima saran (agar
   tidak mengganggu submit form).

   Tidak memaksa memilih dari dictionary: teks bebas tetap sah.

     initGhostAutocomplete(inputEl, {
       getEntries: () => [...],            // seluruh dictionary (dibaca setiap ketikan)
       getName: (entry) => "string",       // nama yang dicocokkan/disarankan
       onResolve: (entry|null, {commit}) => {}  // entry = cocok persis (tanpa
                                           // peduli huruf besar/kecil), null = barang baru.
                                           // commit=true saat saran diterima / blur.
     });
   ========================================================================= */
function initGhostAutocomplete(inputEl, { getEntries, getName, onResolve }) {
  const wrapper = document.createElement("div");
  wrapper.className = "ghost-wrapper";
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);
  inputEl.classList.add("ghost-input");
  inputEl.setAttribute("autocomplete", "off");
  inputEl.setAttribute("spellcheck", "false");

  const overlay = document.createElement("div");
  overlay.className = "ghost-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const inner = document.createElement("span");
  inner.className = "ghost-inner";
  const typedEl = document.createElement("span");
  typedEl.className = "ghost-typed";
  const restEl = document.createElement("span");
  restEl.className = "ghost-rest";
  inner.appendChild(typedEl);
  inner.appendChild(restEl);
  overlay.appendChild(inner);
  wrapper.appendChild(overlay);

  let suggestion = null; // entri dictionary yang sedang disarankan

  function syncStyle() {
    const cs = getComputedStyle(inputEl);
    overlay.style.font = cs.font;
    overlay.style.letterSpacing = cs.letterSpacing;
    overlay.style.paddingTop = cs.paddingTop;
    overlay.style.paddingBottom = cs.paddingBottom;
    overlay.style.paddingLeft = cs.paddingLeft;
    overlay.style.paddingRight = cs.paddingRight;
    overlay.style.borderStyle = "solid";
    overlay.style.borderColor = "transparent";
    overlay.style.borderWidth = cs.borderWidth;
    overlay.style.lineHeight = cs.lineHeight;
    overlay.style.boxSizing = cs.boxSizing;
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
  }

  const isSingleLine = (n) => n && n.indexOf("\n") === -1;

  function exactMatch(value) {
    const q = value.trim().toLowerCase();
    if (!q) return null;
    return getEntries().find((e) => String(getName(e) || "").trim().toLowerCase() === q) || null;
  }

  // Saran: entri berawalan sama dengan teks yang diketik; pilih yang terpendek
  // (paling mendekati apa yang sedang diketik).
  function findSuggestion(value) {
    if (!value || !value.trim()) return null;
    const q = value.toLowerCase();
    let best = null;
    for (const e of getEntries()) {
      const n = String(getName(e) || "");
      if (!isSingleLine(n) || n.length <= value.length) continue;
      if (n.toLowerCase().startsWith(q) && (!best || n.length < getName(best).length)) best = e;
    }
    return best;
  }

  function render() {
    const v = inputEl.value;
    const atEnd = inputEl.selectionStart === v.length && inputEl.selectionEnd === v.length;
    suggestion = (document.activeElement === inputEl && atEnd) ? findSuggestion(v) : null;
    if (suggestion) {
      typedEl.textContent = v;
      restEl.textContent = String(getName(suggestion)).slice(v.length);
    } else {
      typedEl.textContent = "";
      restEl.textContent = "";
    }
    inner.style.transform = `translateX(${-inputEl.scrollLeft}px)`;
  }

  function accept() {
    if (!suggestion) return false;
    inputEl.value = getName(suggestion);
    const entry = suggestion;
    suggestion = null;
    render();
    onResolve(entry, { commit: true });
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  inputEl.addEventListener("input", () => {
    onResolve(exactMatch(inputEl.value), { commit: false });
    render();
  });
  ["keyup", "click", "scroll", "select"].forEach((t) => inputEl.addEventListener(t, render));
  inputEl.addEventListener("focus", () => { syncStyle(); render(); });
  inputEl.addEventListener("keydown", (e) => {
    if (!suggestion) return;
    const atEnd = inputEl.selectionStart === inputEl.value.length;
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      accept();
    } else if ((e.key === "ArrowRight" || e.key === "End") && atEnd) {
      e.preventDefault();
      accept();
    } else if (e.key === "Escape") {
      suggestion = null;
      typedEl.textContent = "";
      restEl.textContent = "";
    }
  });
  // mousedown (bukan click) supaya input tidak kehilangan fokus dulu.
  restEl.addEventListener("mousedown", (e) => { e.preventDefault(); accept(); });
  restEl.addEventListener("touchstart", (e) => { e.preventDefault(); accept(); }, { passive: false });

  inputEl.addEventListener("blur", () => {
    const entry = exactMatch(inputEl.value);
    suggestion = null;
    typedEl.textContent = "";
    restEl.textContent = "";
    onResolve(entry, { commit: true });
  });

  syncStyle();
  return { render, syncStyle };
}
