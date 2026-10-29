/* ---------- Faz 2: görünüm geçmişi, senkron izleme, çoklu imleç ölçüm paneli ---------- */
function viewHist(dir) {
  const P = S.view === 'sgram' ? null : curPlot(); if (!P) return;
  const ok = dir < 0 ? P.viewBack() : P.viewFwd();
  if (!ok) toast(dir < 0 ? 'Geri gidilecek görünüm yok' : 'İleri gidilecek görünüm yok', 1500);
  updHistBtns();
}
function updHistBtns() { const P = curPlot(); const b = $('#tb-back'), f = $('#tb-fwd'); if (b) b.disabled = !P || !P.hist.back.length; if (f) f.disabled = !P || !P.hist.fwd.length; }
function toggleCrosshair(on) {
  const v = on == null ? !S.plot.crosshair : !!on;
  for (const P of [S.plot, S.specPlot, S.xyPlot]) if (P) { P.crosshair = v; if (!v) P.hoverX = null; P.invalidate(); }
  try { localStorage.setItem('mv.xhair', v ? '1' : '0'); } catch (_) {}
  const b = $('#tb-xhair'); if (b) b.classList.toggle('on', v);
  if (on == null) toast('Senkron dikey izleme ' + (v ? 'açık' : 'kapalı') + ' (X)', 1500);
}
const SNAP_MODES = [['off', 'Yakalama yok'], ['peak', 'Tepe'], ['valley', 'Çukur'], ['auto', 'Tepe/çukur (otomatik)']];
function setSnap(m) { for (const P of [S.plot, S.specPlot, S.xyPlot]) if (P) P.cursorOpt.snap = m; try { localStorage.setItem('mv.snap', m); } catch (_) {} }
function renderCursorPanel(P) {
  P = P || S.plot; const host = P.cv.parentElement; let pn = P._cpanel;
  const show = P.cursors.length > 0 || (P.mode === 'cursor' && P.axes.length);
  if (!show) { if (pn) pn.classList.add('hidden'); return; }
  if (!pn) {
    pn = P._cpanel = h('div', {class: 'curpanel', role: 'region', 'aria-label': 'İmleç ölçümleri'}); host.append(pn);
    pn.addEventListener('pointerdown', e => e.stopPropagation());
  }
  pn.classList.remove('hidden');
  const st = P.cursorStats(), xn = P.opts.xName || 't', xu = xn === 't' ? ' s' : xn === 'f' ? ' Hz' : '';
  const sel = h('select', {title: 'İmleç yakalama: tıklanan noktanın ±14 px çevresindeki tepe / çukur', onchange: e => setSnap(e.target.value)}, ...SNAP_MODES.map(([v, t]) => h('option', {value: v, selected: P.cursorOpt.snap === v ? '' : null}, t)));
  const head = h('div', {class: 'cph'}, h('b', {}, 'İmleçler' + (P.cursors.length ? ' (' + P.cursors.length + ')' : '')), sel,
    h('button', {class: 'ib', title: 'Tüm imleçleri temizle (Esc)', onclick: () => { P.cursors = []; P.invalidate(); P.onChange('cursor'); renderCursorPanel(P); }}, '✕'));
  const body = h('div', {class: 'cpb'});
  if (!st.rows.length) body.append(h('div', {class: 'note'}, 'Tıkla: imleç · Shift+tıkla: imleç ekle · imlece yakın tık: taşı'));
  else {
    const t = h('table', {class: 'cpt'}), tr = (...c) => h('tr', {}, ...c.map(x => h('td', {}, x)));
    t.append(h('tr', {}, ...['#', xn, 'y', st.rows.length > 1 ? xn + '/' + xn + '₁' : ''].map(x => h('th', {}, x))));
    for (const r of st.rows) t.append(tr('C' + (r.k + 1) + (r.snap ? (r.snap === 'peak' ? '▲' : '▼') : ''), fmtNum(r.x, 7), fmtNum(r.y, 6), r.ratio != null ? fmtNum(r.ratio, 4) : ''));
    body.append(t);
    for (const p of st.pairs) {
      const L = [['ΔX', fmtNum(p.dx, 6) + xu], ['ΔY', fmtNum(p.dy, 6)], ['1/ΔX', p.inv != null ? fmtNum(p.inv, 6) + (xn === 't' ? ' Hz' : '') : '—'], ['Eğim ΔY/ΔX', p.slope != null ? fmtNum(p.slope, 6) : '—']];
      if (p.n) L.push(['Alan ∫y dx', fmtNum(p.area, 6)], ['Ortalama', fmtNum(p.mean, 6)], ['RMS', fmtNum(p.rms, 6)], ['Tepe-tepe', fmtNum(p.pp, 6)], ['Örnek', fmtCnt(p.n)]);
      else if (st.rows.length > 1) L.push(['Not', 'farklı izler: alan/RMS yok']);
      body.append(h('div', {class: 'cpp'}, h('div', {class: 'cpk'}, `C${p.a + 1} → C${p.b + 1}`), ...L.map(([k, v]) => h('div', {class: 'cpr'}, h('span', {}, k), h('span', {}, v)))));
    }
  }
  pn.replaceChildren(head, body);
}
// başlangıç: tercihler ve kancalar
(function () {
  const prevSet = typeof setMode === 'function' ? setMode : null;
  if (prevSet) setMode = function (m) { prevSet(m); try { renderCursorPanel(S.plot); } catch (_) {} };
  window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
    try { const sn = localStorage.getItem('mv.snap'); if (sn) setSnap(sn); if (localStorage.getItem('mv.xhair') === '1') toggleCrosshair(true); } catch (_) {}
    for (const P of [S.plot, S.specPlot, S.xyPlot]) if (P) { const oc = P.onChange; P.onChange = k => { oc(k); if (k === 'view') updHistBtns(); if (k === 'cursor' && P !== S.plot) renderCursorPanel(P); }; }
    updHistBtns();
  }, 0));
})();
