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
