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

/* ---------- Faz 3: yeniden boyutlanabilir yan paneller, gizle/göster kısayolları ---------- */
const PANES = {
  lw: null, rw: null, hideL: false, hideR: false,
  load() { try { const o = JSON.parse(localStorage.getItem('mv.panes') || '{}'); Object.assign(this, {lw: o.lw || null, rw: o.rw || null, hideL: !!o.hideL, hideR: !!o.hideR}); } catch (_) {} },
  save() { try { localStorage.setItem('mv.panes', JSON.stringify({lw: this.lw, rw: this.rw, hideL: this.hideL, hideR: this.hideR})); } catch (_) {} },
  apply() {
    const app = $('#app'); if (!app) return;
    app.classList.toggle('hideL', this.hideL); app.classList.toggle('hideR', this.hideR);
    const set = (k, v, hid) => { if (hid) app.style.setProperty(k, '0px'); else if (v) app.style.setProperty(k, v + 'px'); else app.style.removeProperty(k); };
    set('--lw', this.lw, this.hideL); set('--rw', this.rw, this.hideR);
    if (S.plot) requestAnimationFrame(() => { for (const P of [S.plot, S.specPlot, S.xyPlot, S.specView]) if (P && P.resize) P.resize(); });
  }
};
function togglePane(which, on) {
  const k = which === 'l' ? 'hideL' : 'hideR'; PANES[k] = on == null ? !PANES[k] : !on; PANES.apply(); PANES.save();
}
(function () {
  window.addEventListener('DOMContentLoaded', () => {
    PANES.load(); PANES.apply();
    const app = $('#app'), center = $('#center');
    for (const [id, side] of [['left', 'l'], ['right', 'r']]) {
      const pane = $('#' + id); if (!pane) continue;
      const sp = h('div', {class: 'split', role: 'separator', 'aria-orientation': 'vertical', title: 'Sürükle: genişlik · çift tık: varsayılan genişlik · ' + (side === 'l' ? 'Ctrl+B' : 'Ctrl+Shift+B') + ': gizle/göster'});
      sp.addEventListener('pointerdown', e => {
        e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('drag'); document.body.classList.add('dragging');
        const ar = app.getBoundingClientRect();
        sp.onpointermove = ev => {
          if (side === 'l') PANES.lw = Math.round(Math.max(170, Math.min(Math.min(720, ar.width * .5), ev.clientX - ar.left)));
          else PANES.rw = Math.round(Math.max(240, Math.min(Math.min(820, ar.width * .55), ar.right - ev.clientX)));
          PANES.apply();
        };
        sp.onpointerup = () => { sp.onpointermove = sp.onpointerup = null; sp.classList.remove('drag'); document.body.classList.remove('dragging'); PANES.save(); };
      });
      sp.addEventListener('dblclick', () => { PANES[side === 'l' ? 'lw' : 'rw'] = null; PANES.apply(); PANES.save(); });
      pane.append(sp);
      center.append(h('button', {class: 'reveal ' + side + ' noic', title: (side === 'l' ? 'Sol paneli göster (Ctrl+B)' : 'Sağ paneli göster (Ctrl+Shift+B)'), onclick: () => togglePane(side, true)}, side === 'l' ? '▶' : '◀'));
    }
    window.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'b') return;
      const t = e.target; if (t && t.closest && t.closest('.cm, .codeed')) return;
      e.preventDefault(); togglePane(e.shiftKey ? 'r' : 'l');
    }, true);
  });
})();

/* ---------- Faz 4: rainflow çevrim sayımı ve kayan basıklık / tepe faktörü ---------- */
function faz4Cards() {
  return [
    card('Rainflow (yorulma çevrim sayımı)',
      fr('Wöhler eğimi m', numIn('rfM', 5, {min: 1, max: 20, step: 0.5})), fr('Eşdeğer çevrim N_eq', numIn('rfNeq', 1e6, {min: 1})),
      fr('S_ref / N_ref (isteğe bağlı)', numIn('rfSref', '', {min: 0}), numIn('rfNref', '', {min: 0})),
      fr('Kutu sayısı', numIn('rfBins', 32, {min: 4, max: 200, step: 1})), fr('Kapsam', selIn('rfScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'all')),
      h('div', {class: 'btns'}, btn('Rainflow sayımı', computeRainflow, 'primary')),
      h('div', {id: 'rfInfo', class: 'note'}, 'ASTM E1049 (3 nokta) yöntemi; yarım çevrimler 0,5 sayılır. Eşdeğer aralık S_eq = (Σ nᵢ·Sᵢᵐ / N_eq)^(1/m). S_ref/N_ref verilirse Miner hasarı D = Σ nᵢ / Nᵢ, Nᵢ = N_ref·(S_ref/Sᵢ)ᵐ.')),
    card('Kayan basıklık / tepe faktörü',
      fr('Pencere / adım (s)', numIn('ksWin', 1, {min: 0}), numIn('ksHop', 0.5, {min: 0})),
      chkIn('ksK', 'Basıklık (kurtosis, Gauss = 3)', true), chkIn('ksC', 'Tepe faktörü (|x−ort|maks / std)', true), chkIn('ksR', 'Kayan RMS', false),
      fr('Kapsam', selIn('ksScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'all')),
      h('div', {class: 'btns'}, btn('Hesapla ve çiz', computeSliding, 'primary')),
      h('div', {class: 'note'}, 'Darbeli / aşınma kaynaklı bileşenler basıklığı 3\'ün üzerine çıkarır. Sonuçlar türetilmiş kanal olarak yeni alt grafiğe eklenir.'))
  ];
}
async function computeRainflow() {
  const tr = activeTrace(), ax = activeAxes(); if (!tr || !tr.ch) return toast('Önce bir zaman izi seçin');
  await busy('Rainflow sayımı…', async () => {
    const ch = tr.ch; await ensureLoaded(ch); const [a, b] = specRange(tr, ax, sv('rfScope'));
    const seg = ch.data.subarray ? ch.data.subarray(a, b) : ch.data.slice(a, b), del = ch.del ? ch.del.subarray(a, b) : null;
    const rf = await DSPW.run('rainflow', [Float64Array.from(seg), del ? Uint8Array.from(del) : null]);
    const o = {m: num('rfM') || 5, neq: num('rfNeq') || 1e6, bins: num('rfBins') | 0 || 32, sref: num('rfSref'), nref: num('rfNref')}, sm = DSP.rainflowSummary(rf, o);
    S.lastRainflow = {ch: ch.name, rf, sm};
    const P = S.xyPlot; P.axes.slice().forEach(q => P.removeAxes(q)); P.linkX = true; S.xyKeep = true; syncFeatUI();
    const u = unitOf(ch), w = sm.maxRange / sm.edges.length * (sm.edges.length / (sm.edges.length - 1)) || 1, cx = new Float64Array(sm.hist.length); for (let i = 0; i < cx.length; i++) cx[i] = (sm.edges[i] + sm.edges[i + 1]) / 2;
    const a1 = P.addAxes({xlabel: 'Çevrim aralığı' + (u ? ' (' + u + ')' : ''), ylabel: 'Çevrim sayısı', title: 'Rainflow — ' + ch.name, ylog: true});
    a1.traces.push({kind: 'xy', x: cx, y: Float64Array.from(sm.hist, v => v > 0 ? v : NaN), bars: w, label: 'Çevrim (yarımlar 0,5)', color: '#0072BD', width: 1, visible: true});
    const tot = sm.pseudo || 1, a2 = P.addAxes({xlabel: 'Çevrim aralığı' + (u ? ' (' + u + ')' : ''), ylabel: 'Hasar payı (%)', title: `Göreli hasar katkısı (m = ${sm.m})`});
    a2.traces.push({kind: 'xy', x: cx, y: Float64Array.from(sm.dmg, v => 100 * v / tot), bars: w, label: 'Σ n·Sᵐ payı', color: '#D95319', width: 1, visible: true});
    P.active = a1; switchView('xy'); P.fitAll();
    const full = rf.count.reduce((s, v) => s + (v === 1 ? 1 : 0), 0), half = rf.count.length - full;
    $('#rfInfo').textContent = `${ch.name}: ${fmtCnt(rf.nTurning)} dönüm noktası · ${fmtNum(sm.cycles, 6)} çevrim (${fmtCnt(full)} tam + ${fmtCnt(half)} yarım)\n` +
      `En büyük aralık ${fmtNum(sm.maxRange, 5)}${u ? ' ' + u : ''} · Σ n·Sᵐ = ${fmtNum(sm.pseudo, 5)}\n` +
      `Eşdeğer aralık S_eq @ N_eq=${fmtNum(sm.neq, 4)}: ${fmtNum(sm.seq, 5)} · çevrim başına eşdeğer: ${fmtNum(sm.seqAvg, 5)}` + (sm.damage != null ? `\nMiner hasarı D = ${fmtNum(sm.damage, 5)} (ömür ≈ ${sm.damage > 0 ? fmtNum(1 / sm.damage, 4) : '∞'} × bu kayıt)` : '');
    $('#rfInfo').style.whiteSpace = 'pre-line';
    (S.methodLog = S.methodLog || []).push({t: Date.now(), op: 'rainflow', label: ch.name, m: sm.m, neq: sm.neq, cycles: sm.cycles});
  });
}
async function computeSliding() {
  const tr = activeTrace(), ax = activeAxes(); if (!tr || !tr.ch) return toast('Önce bir zaman izi seçin');
  await busy('Kayan istatistikler…', async () => {
    const ch = tr.ch; await ensureLoaded(ch); const [a, b] = specRange(tr, ax, sv('ksScope'));
    const win = num('ksWin'), hop = num('ksHop') || win / 2; if (!(win > 0)) throw new Error('Pencere süresi > 0 olmalı');
    const seg = DSP.segment(ch.data, ch.del, a, b); if (seg.length < Math.round(win * ch.fs)) throw new Error('Aralık pencereden kısa');
    const r = await DSPW.run('slidingStats', [seg, ch.fs, win, hop], [seg]);
    const out = []; const mk = (nm, d, unit) => { S.opDesc = `Kayan ${nm}: pencere ${win} s, adım ${hop} s`; const c = addDerived(ch.name + '_' + nm, d, ch, a, false); c.g = null; c.dtS = r.dt; c.t0 = ch.t(a) + r.t0; c.unit = unit; c.kind = 'calc'; out.push(c); };
    if (ck('ksK')) mk('kurt', r.kurt, ''); if (ck('ksC')) mk('crest', r.crest, ''); if (ck('ksR')) mk('rms', r.rms, unitOf(ch));
    if (!out.length) throw new Error('En az bir çıktı seçin');
    for (const c of out) c._mm = null;
    await addToNewAxes(out, true); toast(out.length + ' kanal eklendi (' + r.kurt.length + ' pencere)');
  });
}
