/* ===== Arayüz katmanı: ikonlar, grafik üstü kontroller, menüler, karşılama ===== */
const IC = {
  open: '<path d="M2 4.5h4l1.5 1.5H14v7.5H2z"/>', file: '<path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3"/>',
  bin: '<path d="M3 2h10v12H3zM6 5h1M9 5h1M6 8h1M9 8h1M6 11h1M9 11h1"/>', unv: '<path d="M2 14V9M5 14V4M8 14V7M11 14V2M14 14V8"/>',
  settings: '<path d="M2 4h8M12 4h2M2 8h2M6 8h8M2 12h6M10 12h4M10 2.5v3M4 6.5v3M8 10.5v3"/>', time: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
  mem: '<path d="M4 4h8v8H4zM6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"/>',
  swap: '<path d="M2 5h10M9 2l3 3-3 3M14 11H4M7 8l-3 3 3 3"/>', layers: '<path d="M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/>', stack: '<path d="M2 2h12v5H2zM2 9h12v5H2z"/>',
  kbd: '<path d="M1.5 4h13v8h-13zM4 7h1M7 7h1M10 7h1M4 9.5h8"/>', help: '<circle cx="8" cy="8" r="6.5"/><path d="M6.2 6.3a1.9 1.9 0 113 1.5c-.8.5-1.2 1-1.2 1.8M8 11.6v.1"/>',
  theme: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor"/>', check: '<path d="M3 8.5l3.5 3.5L13 4.5"/>',
  plus: '<path d="M8 3v10M3 8h10"/>', close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>', trash: '<path d="M3 4h10M6 4V2h4v2M5 4l.5 10h5L11 4"/>',
  up: '<path d="M4 10l4-4 4 4"/>', down: '<path d="M4 6l4 4 4-4"/>', expand: '<path d="M9 2h5v5M7 14H2V9M14 2L9 7M2 14l5-5"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>', merge: '<path d="M2 3h4l4 5h4M2 13h4l4-5"/>',
  play: '<path d="M5 3l8 5-8 5z"/>', stop: '<path d="M4 4h8v8H4z"/>', download: '<path d="M8 2v8M4.5 7L8 10.5 11.5 7M3 13.5h10"/>',
  wand: '<path d="M3 13L11 5M10 2v3M8.5 3.5h3M13 8v2M12 9h2"/>', search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>', chart: '<path d="M2 12l4-5 3 3 5-7"/>',
  table: '<path d="M2 3h12v10H2zM2 7h12M6 3v10"/>', copy: '<path d="M5 5h8v9H5zM3 11V2h8"/>', fx: '<path d="M10 2.5C7 2.5 8 6 7 8s-1 5.5-4 5.5M4 7h6"/>',
  acoustic: '<path d="M2 6h3l4-3v10l-4-3H2zM11 5.5a3.5 3.5 0 010 5M13 3.5a6 6 0 010 9"/>', traces: '<path d="M1.5 11l3-5 3 3 3-6 3 4"/>',
  clean: '<path d="M3 12l5-8 5 3-4 7H5zM7 14h7"/>', analyze: '<path d="M1 8h2l1.5-5 2 10 2-8 1.5 3H15"/>', clear: '<path d="M3 4l10 10M13 4L3 14"/>', palette: '<path d="M8 1.5a6.5 6.5 0 100 13c1 0 1.5-.7 1.2-1.5-.3-.9.2-1.7 1.2-1.7H12a2.5 2.5 0 002.5-2.5C14.5 4.3 11.6 1.5 8 1.5z"/><path d="M5 7h.1M8 5h.1M11 7h.1"/>',
  undo: '<path d="M5 3L2 6l3 3M2 6h7a4 4 0 010 8H6"/>',
  feat: '<path d="M2 3h12v10H2zM2 7h12M6 3v10"/>',
  expr: '<path d="M10 2.5C7 2.5 8 6 7 8s-1 5.5-4 5.5M4 7h6"/>', output: '<path d="M8 2v8M4.5 7L8 10.5 11.5 7M3 13.5h10"/>',
  qual: '<path d="M8 1.5l5.5 2v4.2c0 3.2-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.6-5.5-6.8V3.5zM5.5 8l2 2 3.5-4"/>', test: '<path d="M3 14V2M3 2.5h9l-2 3 2 3H3"/>', tools: '<path d="M10.5 2a3 3 0 00-2.7 4.2L2.5 11.5a1.5 1.5 0 002 2l5.3-5.3A3 3 0 1010.5 2z"/>',
  sgram: '<path d="M2 2h12v12H2zM2 6h12M2 10h12M6 2v12M10 2v12M8 8h2v2H8z"/>',
  vib: '<path d="M1 8l2-4 2 8 2-8 2 8 2-8 2 4"/>', temp: '<path d="M7 9.5V3a1 1 0 012 0v6.5a2.5 2.5 0 11-2 0z"/>', press: '<path d="M2 11a6 6 0 1112 0zM8 11l3-5"/>',
  strain: '<path d="M2 8h12M2 5v6M14 5v6M5 6.5l1 3 2-3 1 3 1-3"/>', volt: '<path d="M9 1.5L4 9h4l-1 5.5L12 7H8z"/>', curr: '<path d="M2 8h12M10 5l3 3-3 3"/>',
  pos: '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/>', state: '<path d="M2 11h3V5h3v6h3V5h3"/>', other: '<path d="M2 8h12"/>'
};
KIND.ac.ic = 'acoustic'; KIND.feat.ic = 'chart'; for (const k of Object.keys(KIND)) KIND[k].ic = KIND[k].ic || (IC[k] ? k : k === 'spec' ? 'unv' : k === 'calc' ? 'fx' : 'other');
const ic = (n, s = 16) => '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
function icEl(n, s) { const sp = document.createElement('span'); sp.className = 'ico'; sp.innerHTML = ic(n, s); return sp; }
const kic = (k, s = 14) => { const sp = icEl((KIND[k] || KIND.other).ic, s); sp.style.color = (KIND[k] || KIND.other).color; return sp; };
const ICMAP = [[/^(Uygula|Tamam|Onayla)/, 'check'], [/sığdır/i, 'expand'], [/^(Yeni alt|Ekle|Ekle )/, 'plus'], [/(temizle|Temizle)/, 'clear'], [/^(Sil|Kaldır)/, 'trash'], [/(hesapla|Hesapla|Çal|Dinle|Başlat)/, 'play'], [/Durdur/, 'stop'],
  [/(Kaydet|kaydet|Dışa|dışa|aktar|PNG|İndir)/, 'download'], [/(Yükle|yükle|Aç|aç…)/, 'open'], [/(Kapat|İptal)/, 'close'], [/(Otomatik)/, 'wand'], [/(Tespit|tespit|Bul|Ara)/, 'search'], [/(Karşılaştır)/, 'chart'],
  [/Excel/, 'table'], [/Kopyala/, 'copy'], [/(Spektrum|Spektrogram)/, 'unv'], [/(Filtre)/, 'analyze'], [/Geri al/, 'undo']];
function decorate(root) {
  root = root || document;
  for (const el of root.querySelectorAll('[data-ic]:not([data-icd])')) { el.dataset.icd = 1; el.prepend(icEl(el.dataset.ic, el.closest('.rtabs') ? 18 : 16)); }
  for (const b of root.querySelectorAll('button:not([data-icd])')) {
    b.dataset.icd = 1; const t = b.textContent.trim();
    if (t === '×' || t === '✕') { b.innerHTML = ic('close', 12); if (!b.title) b.title = 'Kapat'; }
    else if (t && t.length <= 30 && !b.querySelector('svg') && !b.classList.contains('noic')) for (const [re, n] of ICMAP) if (re.test(t)) { b.prepend(icEl(n, 14)); break; }
    if (!b.getAttribute('aria-label') && b.title) b.setAttribute('aria-label', b.title.split('\n')[0]);
  }
  for (const h4 of root.querySelectorAll('.card>h4:not([data-cz])')) {
    h4.dataset.cz = 1; const card = h4.parentElement, key = h4.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), car = h('span', {class: 'cz'}, '▾');
    h4.prepend(car); h4.tabIndex = 0; h4.setAttribute('role', 'button');
    const rp = !!card.closest('#rbody'), isC = () => rp ? !S.opened.has(key) : S.collapsed.has(key);   // sağ panelde kartlar varsayılan katlı; açılanlar hatırlanır
    const apply = () => { const c = isC(); card.classList.toggle('collapsed', c); car.textContent = c ? '▸' : '▾'; h4.setAttribute('aria-expanded', !c); };
    const tog = e => { if (e.target.closest('button,input,select')) return; if (rp) { S.opened.has(key) ? S.opened.delete(key) : S.opened.add(key); try { localStorage.setItem('mv.opened', JSON.stringify([...S.opened])); } catch (_) {} } else { S.collapsed.has(key) ? S.collapsed.delete(key) : S.collapsed.add(key); try { localStorage.setItem('mv.collapsed', JSON.stringify([...S.collapsed])); } catch (_) {} } apply(); };
    h4.onclick = tog; h4.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(e); } }; apply();
  }
}

/* ---------- yapısal işlemler + geri al ---------- */
function snapAxes(P) { return {axes: P.axes.slice(), active: P.active, st: P.axes.map(a => ({a, traces: a.traces.slice(), hw: a.hw, ylabel: a.ylabel, act: a.active}))}; }
function restoreAxes(P, sn) {
  P.axes.length = 0; for (const e of sn.st) { e.a.traces = e.traces.slice(); e.a.hw = e.hw; e.a.ylabel = e.ylabel; e.a.active = e.act; P.axes.push(e.a); }
  P.active = sn.active; P.cursors = []; P.sel = null; afterStruct(P);
}
function afterStruct(P) { if (P === S.plot) refreshAll(); else P.invalidate(); }
function structOp(P, msg, fn) {
  const sn = snapAxes(P); fn(); P.cursors = []; P.sel = null; if (P.active && !P.axes.includes(P.active)) P.active = P.axes[P.axes.length - 1] || null;
  afterStruct(P); toast(msg, 7000, {t: 'Geri al', fn: () => restoreAxes(P, sn)});
}
function relabel(P, ax) { if (P === S.plot && ax.traces.length && ax.traces.every(t => t.ch)) axisLabelFor(ax); }
function dropAxes(P, ax) { const i = P.axes.indexOf(ax); if (i >= 0) P.axes.splice(i, 1); if (P.active === ax) P.active = P.axes[Math.min(i, P.axes.length - 1)] || null; }
const removeAxesUndo = (P, ax) => structOp(P, 'Alt grafik kaldırıldı', () => dropAxes(P, ax));
const clearAxesUndo = (P, ax) => structOp(P, 'Grafikteki izler temizlendi', () => { ax.traces = []; ax.active = 0; });
const removeTraceUndo = (P, ax, k) => structOp(P, '“' + ax.traces[k].label + '” izi kaldırıldı', () => { ax.traces.splice(k, 1); ax.active = 0; if (!ax.traces.length && P.axes.length > 1) dropAxes(P, ax); else relabel(P, ax); });
function moveAxes(P, ax, d) { const i = P.axes.indexOf(ax), j = i + d; if (j < 0 || j >= P.axes.length) return; structOp(P, 'Alt grafik taşındı', () => { P.axes[i] = P.axes[j]; P.axes[j] = ax; }); }
function mergeUp(P, ax) { const i = P.axes.indexOf(ax); if (i < 1) return; const t = P.axes[i - 1]; structOp(P, 'Alt grafikler birleştirildi', () => { t.traces.push(...ax.traces); dropAxes(P, ax); relabel(P, t); P.active = t; }); }
function moveTrace(P, ax, k, to) {
  structOp(P, 'İz taşındı', () => {
    const tr = ax.traces.splice(k, 1)[0]; ax.active = 0; let dst = to; if (!dst) dst = P.addAxes();
    dst.traces.push(tr); P.active = dst; if (!ax.traces.length && ax !== dst) dropAxes(P, ax); else relabel(P, ax); relabel(P, dst);
  });
}
function ctxMenu(x, y, items) {
  const m = $('#ctxm'); m.replaceChildren();
  for (const it of items) {
    if (it === '-') { m.append(h('hr')); continue; } if (it.hd) { m.append(h('div', {class: 'hd'}, it.hd)); continue; }
    const b = h('button', {onclick: () => { m.classList.add('hidden'); it.fn(); }}); if (it.ic) b.append(icEl(it.ic, 14)); b.append(it.t); m.append(b);
  }
  m.classList.remove('hidden'); const w = m.offsetWidth, hh = m.offsetHeight; m.style.left = Math.min(x, innerWidth - w - 6) + 'px'; m.style.top = Math.min(y, innerHeight - hh - 6) + 'px';
  const f = m.querySelector('button'); if (f) f.focus();
}
function traceMenu(P, ax, k, x, y) {
  const tr = ax.traces[k], items = [{t: tr.visible ? 'Gizle' : 'Göster', ic: 'eye', fn: () => { tr.visible = !tr.visible; P.invalidate(); afterStruct(P); }},
    {t: 'Rengi değiştir…', ic: 'palette', fn: () => { const c = h('input', {type: 'color', value: tr.color, style: 'position:fixed;left:-99px'}); document.body.append(c); c.oninput = () => { tr.color = c.value; P.invalidate(); }; c.onchange = () => { c.remove(); afterStruct(P); }; c.click(); }},
    ...(P === S.plot && tr.ch ? [{t: 'Spektrum (yalnız bu iz)', ic: 'unv', fn: () => graphSpectrum(ax, tr)}, {t: 'Spektrogram (bu iz)', ic: 'sgram', fn: () => graphSpectrogram(ax, tr)}, '-'] : []),
    {t: 'Çizgi: ince', fn: () => { tr.width = .75; P.invalidate(); }}, {t: 'Çizgi: orta', fn: () => { tr.width = 1.5; P.invalidate(); }}, {t: 'Çizgi: kalın', fn: () => { tr.width = 3; P.invalidate(); }}, '-',
    {t: 'İzi kaldır', ic: 'trash', fn: () => removeTraceUndo(P, ax, k)}];
  if (P === S.plot) {
    items.push('-', {hd: 'Başka alt grafiğe taşı'});
    P.axes.forEach((a, i) => { if (a !== ax) items.push({t: 'Alt grafik ' + (i + 1) + (a.traces[0] ? ' (' + a.traces[0].label + ')' : ''), ic: 'layers', fn: () => moveTrace(P, ax, k, a)}); });
    if (ax.traces.length > 1) items.push({t: 'Yeni alt grafik olarak ayır', ic: 'plus', fn: () => moveTrace(P, ax, k, null)});
  }
  ctxMenu(x, y, items);
}

/* ---------- grafik üstü katman: alt grafik düğmeleri, lejant, ayırıcılar ---------- */
function ensureOv(P) {
  if (P._ov) return P._ov; const ov = h('div', {class: 'pov'}); P.cv.parentElement.append(ov); P._ov = ov; P.domLegend = true;
  P.cv.parentElement.addEventListener('pointermove', e => { const r = P.cv.getBoundingClientRect(), y = e.clientY - r.top; let hv = null; for (const a of P.axes) if (a.rect && y >= a.rect.y - 4 && y <= a.rect.y + a.rect.h + 4) hv = a; if (hv !== ov._hov) { ov._hov = hv; for (const p of ov._parts || []) p.bar.classList.toggle('show', p.ax === hv); } });
  P.cv.parentElement.addEventListener('pointerleave', () => { ov._hov = null; for (const p of ov._parts || []) p.bar.classList.remove('show'); });
  return ov;
}
function syncOverlay(P) {
  const ov = ensureOv(P);
  if (!P.axes.length || !P.axes[0].rect || !P.W) { if (ov.firstChild) { ov.replaceChildren(); ov._parts = []; ov._sig = ''; } return; }
  const sig = P.axes.length + '|' + (P.legend ? 1 : 0) + '|' + P.axes.map(a => (a === P.active ? 'A' : '') + a.traces.map(t => t.label + t.color + (t.visible ? 1 : 0)).join('|') + ':' + (a.active || 0)).join(';');
  if (sig !== ov._sig) { ov._sig = sig; buildOv(P, ov); }
  for (const p of ov._parts) p.upd();
}
function buildOv(P, ov) {
  ov.replaceChildren(); ov._parts = []; const n = P.axes.length, main = P === S.plot;
  const mk = (ico, title, fn) => { const b = h('button', {class: 'ib', title, 'aria-label': title, onclick: e => { e.stopPropagation(); fn(); }}); b.innerHTML = ic(ico, 14); return b; };
  P.axes.forEach((ax, i) => {
    const bar = h('div', {class: 'axbar' + (P.active === ax ? ' act' : '') + (ov._hov === ax ? ' show' : '')});
    bar.append(mk('close', 'Bu alt grafiği kaldır', () => removeAxesUndo(P, ax)));
    if (ax.traces.length) bar.append(mk('clean', 'Alt grafiği boşalt: tüm izleri temizle (grafik kalır)', () => clearAxesUndo(P, ax)));
    if (main && ax.traces.some(t => t.ch)) bar.append(mk('unv', 'Bu alt grafiğin spektrumunu hesapla (PSD/FFT)', () => graphSpectrum(ax)), mk('sgram', 'Bu alt grafiğin spektrogramını hesapla', () => graphSpectrogram(ax)));
    if (n > 1) bar.append(mk('up', 'Yukarı taşı', () => moveAxes(P, ax, -1)), mk('down', 'Aşağı taşı', () => moveAxes(P, ax, 1)), mk('expand', 'Yüksekliği büyüt / normale döndür', () => { ax.hw = (ax.hw || 1) > 1.5 ? 1 : 2.5; P.invalidate(); }));
    if (i > 0 && main) bar.append(mk('merge', 'Bir üstteki alt grafikle birleştir (aynı eksen)', () => mergeUp(P, ax)));
    ov.append(bar); const part = {ax, bar, upd() { const r = ax.rect; bar.style.left = r.x + 6 + 'px'; bar.style.top = r.y + 6 + 'px'; }}; ov._parts.push(part);
    if (P.legend && ax.traces.length) {
      const lg = h('div', {class: 'lgd', 'aria-label': 'Lejant'}), rows = [], grip = h('div', {class: 'lgrip', title: 'Tutup sürükleyerek taşı · çift tık: varsayılan yer'}, '⋯');
      lg.append(grip);
      grip.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId); const lp = ax.lgPos || {dx: 0, dy: 0}, x0 = e.clientX - lp.dx, y0 = e.clientY - lp.dy; grip.onpointermove = ev => { ax.lgPos = {dx: ev.clientX - x0, dy: ev.clientY - y0}; part.upd(); P.invalidate(); }; grip.onpointerup = () => { grip.onpointermove = grip.onpointerup = null; }; };
      grip.ondblclick = () => { ax.lgPos = null; part.upd(); P.invalidate(); };
      ax.traces.forEach((tr, k) => {
        if (tr.noLegend) return;
        const ex = h('span', {class: 'ex'}), x = h('button', {class: 'ib x', title: 'İzi kaldır', 'aria-label': 'İzi kaldır'}); x.innerHTML = ic('close', 10);
        const row = h('div', {class: 'lrow' + (tr.visible ? '' : ' off') + (P.active === ax && k === (ax.active || 0) ? ' cur' : ''), draggable: main ? 'true' : null, tabindex: 0, title: 'Tıkla: göster/gizle · Sağ tık: seçenekler' + (main ? ' · Sürükle: başka alt grafiğe taşı' : '')}, h('span', {class: 'sw', style: 'background:' + tr.color}), h('span', {class: 'nm'}, tr.label), ex, x);
        row.onclick = e => { if (e.target.closest('.x')) return; tr.visible = !tr.visible; ax.active = k; P.active = ax; P.invalidate(); afterStruct(P); };
        row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); } else if (e.key === 'Delete') removeTraceUndo(P, ax, k); };
        x.onclick = e => { e.stopPropagation(); removeTraceUndo(P, ax, k); };
        row.oncontextmenu = e => { e.preventDefault(); traceMenu(P, ax, k, e.clientX, e.clientY); };
        if (main) { row.ondragstart = e => { e.dataTransfer.setData('text/matview-trace', ax.traces.indexOf(tr) + ''); e.dataTransfer.effectAllowed = 'move'; S.dragTrace = {P, ax, tr}; setTimeout(() => showDZ(), 0); }; row.ondragend = () => hideDZ(); }
        lg.append(row); rows.push({tr, ex});
      });
      ov.append(lg); part.lg = lg; part.rows = rows;
      part.upd = () => { const r = ax.rect; bar.style.left = r.x + 6 + 'px'; bar.style.top = r.y + 6 + 'px'; const lp = ax.lgPos || {dx: 0, dy: 0}, lw = lg.offsetWidth || 120, lh = lg.offsetHeight || 40, right = Math.max(P.W - r.x - r.w - 0, Math.min(P.W - r.x - lw, P.W - r.x - r.w + 8 - lp.dx)), top = Math.max(r.y, Math.min(r.y + r.h - lh, r.y + 6 + lp.dy)); lg.style.right = right + 'px'; lg.style.top = top + 'px'; lg.style.maxWidth = Math.max(120, r.w * 0.55) + 'px';
        for (const q of rows) { const t = q.tr.visible ? P.legendExtra(q.tr, ax) : ''; if (q.ex._t !== t) { q.ex._t = t; q.ex.textContent = t; } } };
    }
    if (i < n - 1) {
      const sep = h('div', {class: 'hsep', title: 'Sürükleyerek alt grafik yüksekliklerini ayarla'}); ov.append(sep);
      sep.onpointerdown = e => {
        e.preventDefault(); sep.setPointerCapture(e.pointerId); const a = ax, b = P.axes[i + 1], unit = a.rect.h / (a.hw || 1), ha = a.rect.h, hb = b.rect.h, y0 = e.clientY;
        sep.onpointermove = ev => { const na = Math.min(ha + hb - 50, Math.max(50, ha + ev.clientY - y0)); a.hw = na / unit; b.hw = (ha + hb - na) / unit; P.invalidate(); };
        sep.onpointerup = () => { sep.onpointermove = sep.onpointerup = null; };
      };
      sep.ondblclick = () => { for (const a of P.axes) a.hw = 1; P.invalidate(); };
      ov._parts.push({ax, bar: h('i'), upd() { const r = ax.rect; sep.style.left = r.x + 'px'; sep.style.width = r.w + 'px'; sep.style.top = r.y + r.h + 18 + 'px'; }});
    }
  });
}

/* ---------- bırakma bölgeleri ---------- */
function showDZ() {
  hideDZ(); if (S.view !== 'time') return; const st = $('#stage'), P = S.plot, box = h('div', {id: 'dz'});
  const zone = (css, text, fn) => { const z = h('div', {class: 'dz', style: css}, text); z.ondragover = e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; z.classList.add('over'); }; z.ondragleave = () => z.classList.remove('over');
    z.ondrop = e => { e.preventDefault(); e.stopPropagation(); hideDZ(); fn(e); }; box.append(z); };
  const hdl = (ax, e) => {
    const tr = S.dragTrace; if (e.dataTransfer.types.includes('text/matview-trace') && tr) { S.dragTrace = null; if (tr.ax === ax) return; moveTrace(P, tr.ax, tr.ax.traces.indexOf(tr.tr), ax); return; }
    const ids = e.dataTransfer.getData('text/matview'); if (!ids) return; const chs = JSON.parse(ids).map(chByUid).filter(Boolean);
    ax ? addToAxes(ax, chs) : addToNewAxes(chs);
  };
  const trk = S.dragTrace;
  if (!P.axes.length) zone('inset:8px', 'Bırak: yeni alt grafik oluştur', e => hdl(null, e));
  else {
    P.axes.forEach(ax => { if (ax.rect) zone(`left:${ax.rect.x}px;top:${ax.rect.y}px;width:${ax.rect.w}px;height:${Math.max(20, ax.rect.h - (ax === P.axes[P.axes.length - 1] ? 44 : 0))}px`, trk && trk.ax === ax ? 'Bu grafikte' : (trk ? 'Buraya taşı' : 'Bu grafiğe ekle (aynı eksen)'), e => hdl(ax, e)); });
    const last = P.axes[P.axes.length - 1]; if (last.rect) zone(`left:${last.rect.x}px;width:${last.rect.w}px;top:${last.rect.y + last.rect.h - 40}px;height:40px`, 'Yeni alt grafik', e => hdl(null, e));
  }
  st.append(box);
}
function hideDZ() { const d = $('#dz'); if (d) d.remove(); }

/* ---------- karşılama, menüler, kısayollar ---------- */
function syncWelcome() { const w = $('#welcome'); if (w) w.classList.toggle('hidden', !(!S.files.length && !S.plot.axes.length && !(S.specPlot && S.specPlot.axes.length))); }
function closeMenus() { for (const m of document.querySelectorAll('.ddm')) m.classList.add('hidden'); $('#ctxm').classList.add('hidden'); }
function shortcutsDialog() {
  const rows = [['Delete', 'Seçili noktaları sil'], ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele (nokta silme)'], ['P · Z · C · B · L', 'Gez · Yakınlaştır · İmleç · Kutu · Kement'], ['+ / −', 'Yakınlaş / uzaklaş'], ['Home', 'Tümünü sığdır'],
    ['Esc', 'Seçimi kaldır / menüyü kapat'], ['Çift tık (ağaç)', 'Kanalı yeni alt grafiğe ekle (Ayarlar’dan değişir)'], ['Shift + çift tık', 'Tercihin tersi: aktif grafiğe ekle'], ['Shift + tık (ağaç)', 'Aralık seç'], ['Ctrl + tık (ağaç)', 'Çoklu seç'],
    ['Lejanta tık', 'İzi göster / gizle'], ['Lejanta sağ tık', 'Renk, kalınlık, taşı, kaldır'], ['Lejantı sürükle', 'İzi başka alt grafiğe taşı'], ['Alt grafik ayırıcısı', 'Sürükle: yükseklik · çift tık: eşitle'], ['↑ ↓ Enter (ağaç)', 'Klavyeyle gezin / ekle'], ['?', 'Bu pencere']];
  modal('Klavye kısayolları ve fare', h('table', {class: 'kv'}, rows.map(r => h('tr', null, h('td', null, h('kbd', null, r[0])), h('td', null, r[1])))), [{t: 'Kapat', primary: true}]);
}
function updDblBtn() { const b = $('#btnDbl'); if (!b) return; const s = b.querySelector('.lbltxt') || (() => { const t = h('span', {class: 'lbltxt'}); b.append(t); b.childNodes.forEach(c => { if (c.nodeType === 3) c.remove(); }); return t; })(); s.textContent = 'Çift tık: ' + (S.pref.dbl === 'same' ? 'aktif grafiğe ekle' : 'yeni alt grafik'); }
function initUX() {
  try { S.collapsed = new Set(JSON.parse(localStorage.getItem('mv.collapsed') || '[]')); } catch (_) { S.collapsed = new Set(); }
  try { S.opened = new Set(JSON.parse(localStorage.getItem('mv.opened') || '[]')); } catch (_) { S.opened = new Set(); }
  try { S.pref.dbl = localStorage.getItem('mv.dbl') || 'new'; } catch (_) {}
  const od = S.plot.onDraw; S.plot.onDraw = () => { od(); syncOverlay(S.plot); syncWelcome(); };
  S.specPlot.onDraw = () => syncOverlay(S.specPlot); S.xyPlot.onDraw = () => syncOverlay(S.xyPlot);
  for (const [dd, menu] of [['btnOpenM', 'mOpen'], ['btnSet', 'mSet']]) $('#' + dd).onclick = e => { e.stopPropagation(); const m = $('#' + menu), was = m.classList.contains('hidden'); closeMenus(); m.classList.toggle('hidden', !was); };
  document.addEventListener('click', e => { if (!e.target.closest('.dd') ) closeMenus(); else if (e.target.closest('.ddm button')) closeMenus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
  $('#btnKeys').onclick = shortcutsDialog; $('#btnPng').onclick = savePng; $('#btnRep').onclick = repAddView; $('#btnSvg').onclick = saveSvg;
  $('#btnDbl').onclick = () => { S.pref.dbl = S.pref.dbl === 'same' ? 'new' : 'same'; try { localStorage.setItem('mv.dbl', S.pref.dbl); } catch (_) {} updDblBtn(); toast('Çift tık artık: ' + (S.pref.dbl === 'same' ? 'aktif grafiğe ekle' : 'yeni alt grafik')); };
  $('#btnTab').onclick = () => { $('#fileIn').click(); }; $('#wTab').onclick = () => $('#fileIn').click(); $('#wMat').onclick = () => $('#btnOpen').click(); $('#wUnv').onclick = () => $('#btnOpen').click(); $('#wBin').onclick = () => $('#btnBin').click();
  $('#btnSelAll').onclick = () => { const all = S.rowOrder || []; if (all.length && all.every(c => S.selCh.has(c.uid))) S.selCh.clear(); else for (const c of all) S.selCh.add(c.uid); renderTree(); };
  window.addEventListener('keydown', e => { const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; if (e.key === '?') { e.preventDefault(); shortcutsDialog(); } });
  window.addEventListener('dragstart', e => { if (e.dataTransfer && [...e.dataTransfer.types].length === 0) return; }, true);
  window.addEventListener('dragend', hideDZ); window.addEventListener('drop', () => setTimeout(hideDZ, 0));
  $('#busyCancelBtn').onclick = () => { S.cancel = true; $('#busyCancelBtn').disabled = true; };
  updDblBtn(); decorate(document);
  let pend = 0; new MutationObserver(() => { if (!pend) pend = requestAnimationFrame(() => { pend = 0; decorate(document); }); }).observe(document.body, {childList: true, subtree: true});
  syncWelcome();
}
