/* ===== Ortak arayüz yardımcıları (ana sayfa ve telemetri modülü ortak; telemetri iframe'ine derlemede gömülür) =====
   - MVUI.noZoom(win): sayfa yakınlaştırmasını (Ctrl+tekerlek, Ctrl + / − / 0, sıkıştırma) kapatır; grafiklerin kendi
     yakınlaştırması etkilenmez.
   - MVUI.ovbar(bar, opt): araç satırı tek satırda kalır, seçenekler iki yana yaslanır; sığmayanlar sondan başlayarak
     "⋯" menüsüne taşınır, yer açılınca geri gelir. Hiçbir zaman alt satıra kaymaz.
   - MVUI.fx(el, width): uzunluğu değişen yazıya sabit genişlikte yer; sığmazsa yazı kayar (çevresindekiler kımıldamaz). */
(function (root) {
  'use strict';
  const CSS = `
.mvov{display:flex!important;flex-wrap:nowrap!important;align-items:center;min-width:0;overflow:hidden!important}
.mvov>*{flex-shrink:0}
.mvov>.mvov-flex{flex-shrink:1;min-width:0}
.mvov>[data-ovkeep]{flex-shrink:0!important}
.mvov.mvov-tight>[data-ovkeep]{flex-shrink:1!important;min-width:0}
.mvov>.mvov-more{margin-left:auto;flex:none}
.mvov-pop{position:fixed;z-index:1000;display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:6px;background:var(--panel,#fff);border:1px solid var(--border,var(--line,#ccd));border-radius:6px;max-height:70vh;overflow:auto;min-width:160px}
.mvov-pop.hidden{display:none!important}
.mvov-pop>*{margin:0!important}
.mvov-pop .seg,.mvov-pop .ctools,.mvov-pop .actions,.mvov-pop .sim-nav{flex-wrap:wrap}
.fx{display:inline-block;overflow:hidden;white-space:nowrap;vertical-align:middle;flex:none;text-overflow:clip}
.fx>.fxi{display:inline-block;white-space:nowrap}
.fx.mq>.fxi{animation:mvfxmq var(--mqd,8s) linear infinite}
@keyframes mvfxmq{0%,12%{transform:translateX(0)}50%,62%{transform:translateX(var(--mqx,0))}100%{transform:translateX(0)}}
@media (prefers-reduced-motion:reduce){.fx.mq>.fxi{animation:none}.fx.mq{text-overflow:ellipsis}}`;
  function css(doc) { if (doc.getElementById('mvui-css')) return; const s = doc.createElement('style'); s.id = 'mvui-css'; s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s); }

  function noZoom(win) {
    win = win || root; const doc = win.document;
    win.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (['+', '-', '=', '0', 'Add', 'Subtract'].includes(e.key) || ['NumpadAdd', 'NumpadSubtract', 'Numpad0', 'Equal', 'Minus', 'Digit0'].includes(e.code)) e.preventDefault();
    }, true);
    // tekerlek varsayılanı (sayfa yakınlaştırması) engellenir; olay yine hedefe ulaşır (grafik yakınlaştırması çalışır)
    win.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, {capture: true, passive: false});
    for (const ev of ['gesturestart', 'gesturechange']) doc.addEventListener(ev, e => e.preventDefault(), {passive: false});
  }

  // ---- tek satır araç çubuğu + "⋯" taşma menüsü ----
  function ovbar(bar, opt) {
    if (!bar || bar._ov) return bar && bar._ov; opt = opt || {};
    const doc = bar.ownerDocument, win = doc.defaultView; css(doc);
    bar.classList.add('mvov');
    const more = doc.createElement('button'); more.type = 'button'; more.className = 'mvov-more ' + (opt.btnClass || ''); more.textContent = '⋯'; more.title = 'Sığmayan seçenekler'; more.setAttribute('aria-haspopup', 'true'); more.style.display = 'none';
    const pop = doc.createElement('div'); pop.className = 'mvov-pop hidden'; pop.setAttribute('role', 'menu');
    bar.appendChild(more); bar.appendChild(pop);   // menü çubuğun içinde (stil kapsamı korunur), konum sabit
    const moved = [];   // {el, ph}
    const S = bar._ov = {fit, more, pop, moved};
    const close = () => pop.classList.add('hidden');
    const place = () => { const r = more.getBoundingClientRect(), w = pop.offsetWidth || 200; pop.style.top = Math.round(r.bottom + 4) + 'px'; pop.style.left = Math.round(Math.max(4, Math.min(win.innerWidth - w - 4, r.right - w))) + 'px'; };
    more.addEventListener('click', e => { e.stopPropagation(); const op = pop.classList.contains('hidden'); pop.classList.toggle('hidden', !op); if (op) place(); });
    doc.addEventListener('pointerdown', e => { if (!pop.contains(e.target) && e.target !== more) close(); }, true);
    pop.addEventListener('click', e => { const t = e.target.closest && e.target.closest('button'); if (t && !t.closest('.seg') && !t.hasAttribute('aria-haspopup')) setTimeout(close, 0); });
    doc.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const keep = el => el === more || el === pop || el.matches(opt.keep || '[data-ovkeep]') || el.classList.contains('spacer') || el.classList.contains('sp') || el.classList.contains('grow') || el.classList.contains('tabgrow');
    const over = () => bar.scrollWidth > bar.clientWidth + 1;
    let busy = false;
    function fit() {
      if (busy) return; busy = true;
      try {
        // önce hepsi yerine
        while (moved.length) { const m = moved.pop(); m.ph.replaceWith(m.el); }
        more.style.display = 'none';
        // önce sıkıştırılmış görünüm (ör. düğme yazıları gizli), yetmezse taşma menüsü
        if (opt.compact) { bar.classList.remove(opt.compact); if (bar.clientWidth > 0 && over()) bar.classList.add(opt.compact); }
        bar.classList.remove('mvov-tight');
        if (bar.clientWidth > 0 && over()) {
          more.style.display = '';
          // öncelik: data-ovp büyük olan önce menüye; eşitse sondaki önce
          const items = Array.from(bar.children).filter(el => !keep(el)).map((el, i) => ({el, i, p: +(el.getAttribute('data-ovp') || 0)})).sort((a, b) => a.p - b.p || a.i - b.i).map(o => o.el);
          for (let i = items.length - 1; i >= 0 && over(); i--) {
            const el = items[i], ph = doc.createComment('ov');
            el.replaceWith(ph); pop.insertBefore(el, pop.firstChild); moved.push({el, ph});
          }
          // son öğeden önceki ayraçlar gereksiz
        }
        if (over()) bar.classList.add('mvov-tight');   // her şey taşındı ve yine sığmıyor: sabit öğeler (ör. sekmeler) daralır
        if (!moved.length) { more.style.display = 'none'; close(); } else if (!pop.classList.contains('hidden')) place();
        if (opt.onFit) opt.onFit(moved.length);
      } finally { if (S.mo) S.mo.takeRecords(); busy = false; }
    }
    let raf = 0; const sched = () => { if (raf) return; raf = win.requestAnimationFrame(() => { raf = 0; fit(); }); };
    new win.ResizeObserver(sched).observe(bar);
    // çubuktaki öğeler görünür / gizli olunca (ör. düğme gizlendi) yeniden yerleşim
    // yalnız çubuğun doğrudan öğeleri eklenir / çıkarılır ya da görünürlüğü değişirse (içlerindeki yazı değişimi değil: titreme olmaz)
    const rel = m => m.type === 'childList' ? m.target === bar && [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && n !== more && n !== pop) : m.target.parentElement === bar && m.target !== more && m.target !== pop;
    const mo = new win.MutationObserver(ms => { if (!busy && ms.some(rel)) sched(); });
    mo.observe(bar, {attributes: true, attributeFilter: ['class', 'hidden'], subtree: true, childList: true});
    S.mo = mo;
    sched();
    return S;
  }

  // ---- sabit genişlikli, sığmazsa kayan yazı ----
  function fx(el, width) {
    if (!el) return; const doc = el.ownerDocument, win = doc.defaultView; css(doc);
    el.classList.add('fx'); if (width) { el.style.width = width; el.style.maxWidth = width; }
    if (el._fx) { el._fx(); return; }
    let busy = false;
    const upd = () => {
      if (busy) return; busy = true;
      try {
        let inner = el.firstElementChild;
        if (!el.classList.contains('fx')) el.classList.add('fx');   // className yeniden yazılırsa
        if (!inner || !inner.classList.contains('fxi') || el.childNodes.length !== 1) { inner = doc.createElement('span'); inner.className = 'fxi'; inner.append(...Array.from(el.childNodes)); el.replaceChildren(inner); }
        const d = inner.scrollWidth - el.clientWidth;
        if (d > 1 && el.clientWidth > 0) { if (!el.classList.contains('mq')) el.classList.add('mq'); el.style.setProperty('--mqx', -(d + 6) + 'px'); el.style.setProperty('--mqd', Math.max(4, (d + 6) / 25 + 3).toFixed(1) + 's'); if (!el.title || el._fxTitle === el.title) { el.title = inner.textContent; el._fxTitle = el.title; } }
        else if (el.classList.contains('mq')) { el.classList.remove('mq'); el.style.removeProperty('--mqx'); }
      } finally { busy = false; }
    };
    el._fx = upd;
    const mo = new win.MutationObserver(ms => { if (busy) return; if (ms.every(m => m.type === 'attributes' && el.classList.contains('fx'))) return; upd(); mo.takeRecords(); });
    mo.observe(el, {childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class']});
    new win.ResizeObserver(() => upd()).observe(el);
    upd();
  }
  root.MVUI = {noZoom, ovbar, fx, css};
})(typeof window !== 'undefined' ? window : this);

/* ===== Tablolarda başlığa göre süzme / sıralama =====
   Belgeye eklenen veri tablolarının (ftab, tbl, wst, cpt ya da data-filter) başlık hücrelerine ▾ düğmesi konur:
   metin araması, sayı aralığı, değer listesi (onay kutuları), artan / azalan sıralama, temizle. Tablo yeniden çizilirse
   (aynı başlıklar) süzgeç korunur. */
(function (root) {
  'use strict';
  const CSS = `
th.tf-th{position:relative;padding-right:18px!important}
th.tf-th .tf-b{position:absolute;right:2px;top:50%;transform:translateY(-50%);border:0;background:none;padding:0 3px;margin:0;font-size:10px;line-height:1;color:var(--muted,#888);cursor:pointer;min-width:0;height:auto;opacity:.55}
th.tf-th:hover .tf-b,th.tf-th .tf-b:focus{opacity:1}
th.tf-on .tf-b{opacity:1;color:var(--accent,#0072BD);font-weight:700}
th.tf-th.tf-srt{cursor:pointer;user-select:none}
th.tf-th .tf-s{font-size:9px;margin-left:3px;color:var(--accent,#0072BD)}
.tf-pop{position:fixed;z-index:1001;width:250px;max-height:70vh;display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--panel,#fff);color:var(--fg,var(--text,#222));border:1px solid var(--border,var(--line,#ccd));border-radius:6px;font-size:12px}
.tf-pop.hidden{display:none}
.tf-pop input[type=search],.tf-pop input[type=number]{width:100%;box-sizing:border-box;height:26px;font-size:12px}
.tf-pop .tf-row{display:flex;gap:4px;align-items:center}
.tf-pop .tf-row>*{flex:1;min-width:0}
.tf-pop .tf-vals{overflow:auto;max-height:200px;border:1px solid var(--border,var(--line,#ccd));border-radius:4px;padding:3px}
.tf-pop .tf-vals label{display:flex;gap:6px;align-items:center;padding:1px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.tf-pop button{height:24px;font-size:12px;padding:0 6px;cursor:pointer}
.tf-pop .tf-h{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
  const SEL = 'table.ftab, table.tbl, table.wst, table.cpt, table[data-filter]';
  const store = new Map();   // başlık imzası → {flt, sort}
  const num = s => { const t = String(s).trim().replace(/\s/g, '').replace(',', '.'); if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(t)) return NaN; return parseFloat(t); };
  function headRow(tb) { const th = tb.tHead && tb.tHead.rows.length ? tb.tHead.rows[tb.tHead.rows.length - 1] : Array.from(tb.rows).find(r => r.querySelector('th')); return th || null; }
  function dataRows(tb, hr) { return Array.from(tb.rows).filter(r => r !== hr && !(tb.tHead && tb.tHead.contains(r)) && !r.querySelector('th:only-child')); }
  const cellText = (r, i) => { const c = r.cells[i]; return c ? (c.dataset.v != null ? c.dataset.v : c.textContent.trim()) : ''; };
  function sig(tb, hr) { return (tb.closest('[id]') ? tb.closest('[id]').id : '') + '|' + Array.from(hr.cells).map(c => c.textContent.replace(/[▾▲▼]/g, '').trim()).join('|'); }
  function apply(tb) {
    const st = tb._tf, hr = st.hr, rows = dataRows(tb, hr);
    if (!st.orig) st.orig = rows.slice();
    if (!(st.sort && st.sort.dir)) { const par = rows.length ? rows[0].parentNode : null; if (par && st.resort) for (const r of st.orig) if (r.parentNode === par) par.appendChild(r); st.resort = false; }
    if (st.sort && st.sort.dir) { st.resort = true;
      const i = st.sort.i, d = st.sort.dir, par = rows.length ? rows[0].parentNode : null;
      const arr = rows.map((r, k) => ({r, k, t: cellText(r, i), n: num(cellText(r, i))}));
      arr.sort((a, b) => { const an = !isNaN(a.n), bn = !isNaN(b.n); const c = an && bn ? a.n - b.n : an ? -1 : bn ? 1 : a.t.localeCompare(b.t, 'tr', {numeric: true}); return (c || a.k - b.k) * d; });
      if (par) for (const o of arr) if (o.r.parentNode === par) par.appendChild(o.r);
    }
    for (const r of rows) {
      let vis = true;
      for (const [i, f] of Object.entries(st.flt)) {
        const t = cellText(r, +i), lo = t.toLocaleLowerCase('tr');
        if (f.q && !lo.includes(f.q.toLocaleLowerCase('tr'))) { vis = false; break; }
        if (f.set && !f.set.has(t)) { vis = false; break; }
        if (f.min != null || f.max != null) { const v = num(t); if (isNaN(v) || (f.min != null && v < f.min) || (f.max != null && v > f.max)) { vis = false; break; } }
      }
      r.style.display = vis ? '' : 'none';
    }
    Array.from(hr.cells).forEach((c, i) => { const sd = st.sort && st.sort.i === i ? st.sort.dir : 0; c.classList.toggle('tf-on', !!st.flt[i] || !!sd); let ind = c.querySelector('.tf-s'); if (sd) { if (!ind) { ind = tb.ownerDocument.createElement('span'); ind.className = 'tf-s'; const b = c.querySelector('.tf-b'); c.insertBefore(ind, b); } ind.textContent = sd > 0 ? '▲' : '▼'; } else if (ind) ind.remove(); });
    store.set(st.sig, {flt: st.flt, sort: st.sort});
  }
  function pop(doc) {
    let p = doc.querySelector('.tf-pop'); if (p) return p;
    p = doc.createElement('div'); p.className = 'tf-pop hidden'; p.setAttribute('role', 'dialog'); doc.body.appendChild(p);
    doc.addEventListener('pointerdown', e => { if (!p.contains(e.target) && !(e.target.classList && e.target.classList.contains('tf-b'))) p.classList.add('hidden'); }, true);
    doc.addEventListener('keydown', e => { if (e.key === 'Escape') p.classList.add('hidden'); });
    return p;
  }
  function openFor(tb, i, btn) {
    const doc = tb.ownerDocument, win = doc.defaultView, p = pop(doc), st = tb._tf, rows = dataRows(tb, st.hr), f = st.flt[i] || {};
    const vals = new Map(); let nNum = 0; for (const r of rows) { const t = cellText(r, i); vals.set(t, (vals.get(t) || 0) + 1); if (!isNaN(num(t))) nNum++; }
    const numeric = rows.length && nNum >= rows.length * 0.8, E = (tag, a, ...c) => { const e = doc.createElement(tag); if (a) for (const k in a) { if (k.startsWith('on')) e.addEventListener(k.slice(2), a[k]); else if (k === 'text') e.textContent = a[k]; else e.setAttribute(k, a[k]); } e.append(...c); return e; };
    const upd = () => { const nf = {}; const q = qi.value.trim(); if (q) nf.q = q; if (numeric) { const a = mi.value === '' ? null : +mi.value, b = ma.value === '' ? null : +ma.value; if (a != null) nf.min = a; if (b != null) nf.max = b; }
      const cbs = Array.from(vl.querySelectorAll('input[data-v]')); if (cbs.length && cbs.some(c => !c.checked)) nf.set = new Set(cbs.filter(c => c.checked).map(c => c.dataset.v));
      if (Object.keys(nf).length) st.flt[i] = nf; else delete st.flt[i]; apply(tb); cnt.textContent = dataRows(tb, st.hr).filter(r => r.style.display !== 'none').length + ' / ' + rows.length + ' satır'; };
    const qi = E('input', {type: 'search', placeholder: 'İçeren metin…', oninput: upd}); qi.value = f.q || '';
    const mi = E('input', {type: 'number', placeholder: 'en az', step: 'any', oninput: upd}), ma = E('input', {type: 'number', placeholder: 'en çok', step: 'any', oninput: upd}); if (f.min != null) mi.value = f.min; if (f.max != null) ma.value = f.max;
    const vl = E('div', {class: 'tf-vals'}), keys = Array.from(vals.keys()).sort((a, b) => { const x = num(a), y = num(b); return !isNaN(x) && !isNaN(y) ? x - y : a.localeCompare(b, 'tr', {numeric: true}); });
    if (keys.length <= 400) {
      const all = E('input', {type: 'checkbox', onchange: () => { vl.querySelectorAll('input[data-v]').forEach(c => { c.checked = all.checked; }); upd(); }}); all.checked = !f.set;
      vl.append(E('label', null, all, E('b', {text: 'Tümü (' + keys.length + ')'})));
      for (const k of keys) { const c = E('input', {type: 'checkbox', 'data-v': k, onchange: upd}); c.checked = !f.set || f.set.has(k); vl.append(E('label', {title: k}, c, E('span', {text: (k === '' ? '(boş)' : k) + '  · ' + vals.get(k)}))); }
    } else vl.append(E('span', {text: keys.length + ' farklı değer — metin araması kullanın'}));
    const srt = d => { st.sort = st.sort && st.sort.i === i && st.sort.dir === d ? null : {i, dir: d}; apply(tb); };
    const cnt = E('div', {class: 'tf-cnt'});
    p.replaceChildren(E('div', {class: 'tf-h', text: btn.parentElement.textContent.replace(/[▾▲▼]/g, '').trim()}),
      E('div', {class: 'tf-row'}, E('button', {type: 'button', onclick: () => srt(1), text: '↑ Artan'}), E('button', {type: 'button', onclick: () => srt(-1), text: '↓ Azalan'})),
      qi, ...(numeric ? [E('div', {class: 'tf-row'}, mi, ma)] : []), vl,
      E('div', {class: 'tf-row'}, cnt, E('button', {type: 'button', onclick: () => { delete st.flt[i]; if (st.sort && st.sort.i === i) st.sort = null; apply(tb); p.classList.add('hidden'); }, text: 'Temizle'})));
    p.classList.remove('hidden'); const r = btn.getBoundingClientRect(); p.style.top = Math.round(Math.min(r.bottom + 2, win.innerHeight - p.offsetHeight - 4)) + 'px'; p.style.left = Math.round(Math.max(4, Math.min(r.left - 200, win.innerWidth - 254))) + 'px';
    cnt.textContent = rows.filter(r => r.style.display !== 'none').length + ' / ' + rows.length + ' satır'; qi.focus();
  }
  function enhance(tb) {
    if (tb._tf || tb.classList.contains('kv') || tb.classList.contains('nofilter')) return;
    const hr = headRow(tb); if (!hr) return; const doc = tb.ownerDocument;
    const st = tb._tf = {hr, flt: {}, sort: null, sig: ''};
    Array.from(hr.cells).forEach((c, i) => { if (!c.textContent.trim() || c.querySelector('.tf-b')) return; c.classList.add('tf-th'); if (!c.querySelector('input,select,button,a') && !c.onclick) { c.classList.add('tf-srt'); c.title = c.title || 'Tıklayarak sırala (artan → azalan → ilk sıra)'; c.addEventListener('click', e => { if (e.target.closest('.tf-b')) return; const cur = st.sort && st.sort.i === i ? st.sort.dir : 0; st.sort = cur === 0 ? {i, dir: 1} : cur > 0 ? {i, dir: -1} : null; apply(tb); }); } const b = doc.createElement('button'); b.type = 'button'; b.className = 'tf-b'; b.textContent = '▾'; b.title = 'Bu sütuna göre süz / sırala'; b.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openFor(tb, i, b); }); c.appendChild(b); });
    st.sig = sig(tb, hr); const old = store.get(st.sig); if (old) { st.flt = old.flt; st.sort = old.sort; apply(tb); }
  }
  function tableFilters(doc) {
    doc = doc || root.document; if (doc._tfOn) return; doc._tfOn = true;
    const s = doc.createElement('style'); s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s);
    let raf = 0; const scan = () => { raf = 0; doc.querySelectorAll(SEL).forEach(enhance); };
    new (doc.defaultView.MutationObserver)(() => { if (!raf) raf = doc.defaultView.requestAnimationFrame(scan); }).observe(doc.body, {childList: true, subtree: true});
    scan();
  }
  root.MVUI = Object.assign(root.MVUI || {}, {tableFilters});
})(typeof window !== 'undefined' ? window : this);
