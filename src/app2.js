/* ===== Uygulama: paneller, analiz, akustik, çıktı, başlatma ===== */
const fr = (label, ...c) => h('div', {class: 'fr'}, h('label', null, label), ...c);
const numIn = (id, v, o = {}) => h('input', {type: 'number', id, value: v, step: o.step ?? 'any', min: o.min, max: o.max, placeholder: o.placeholder, title: o.title});
const selIn = (id, opts, v) => h('select', {id}, opts.map(([val, txt]) => h('option', {value: val, selected: String(val) === String(v)}, txt)));
const chkIn = (id, label, on) => h('div', {class: 'fr chk'}, h('label', {for: id}, label), h('input', {type: 'checkbox', id, checked: on}));
const num = id => parseFloat($('#' + id).value), sv = id => $('#' + id).value, ck = id => $('#' + id).checked;
const card = (title, ...c) => h('div', {class: 'card'}, h('h4', null, title), ...c);
const btn = (t, fn, cls, id) => h('button', {class: cls || '', onclick: fn, id}, t);

const TABS = [['traces', 'İzler'], ['clean', 'Temizle'], ['analyze', 'Analiz'], ['expr', 'Formül'], ['acoustic', 'Akustik'], ['unv', 'UNV'], ['feat', 'Veri'], ['qual', 'Kalite'], ['test', 'Test'], ['tools', 'Araçlar'], ['output', 'Çıktı']];
function buildRight() {
  const tabs = $('#rtabs'), body = $('#rbody'); tabs.replaceChildren(); body.replaceChildren(); S.panels = {};
  const builders = {traces: buildTraces, clean: buildClean, analyze: buildAnalyze, expr: buildExpr, acoustic: buildAcoustic, unv: buildUnv, feat: buildFeat, qual: buildQual, test: buildTest, tools: buildTools, output: buildOutput};
  for (const [k, t] of TABS) {
    tabs.append(h('button', {class: k === S.tab ? 'on' : '', 'data-t': k, 'data-ic': k, title: k === 'unv' ? 'UNV içe aktarma ve profil karşılaştırma' : t, onclick: () => setTab(k)}, h('span', {class: 'tl'}, t)));
    const p = builders[k](); p.id = 'p-' + k; if (k !== S.tab) p.classList.add('hidden'); body.append(p); S.panels[k] = p;
  }
}
function buildTools() { const r = h('div'); for (const c of toolsCards()) r.append(c); if (typeof extraToolCards === 'function') for (const c of extraToolCards()) r.append(c); return r; }
function setTab(k) { S.tab = k; for (const b of $('#rtabs').children) b.classList.toggle('on', b.dataset.t === k); for (const t in S.panels) S.panels[t].classList.toggle('hidden', t !== k); }

/* ---------- İzler ---------- */
function buildTraces() {
  const r = h('div');
  r.append(card('Grafik',
    chkIn('linkX', 'X eksenlerini bağla (linkaxes)', true), chkIn('gridOn', 'Izgara', true), chkIn('legendOn', 'Gösterge', true),
    fr('X aralığı (s)', numIn('xmin', 0), numIn('xmax', 1)),
    fr('Titreşim lejantı', selIn('grmsMode', [['off', 'Grms yok'], ['all', 'Grms (tüm kayıt)'], ['vis', 'Grms (görünen aralık)']], 'off')), chkIn('grmsDc', 'Grms için DC (ortalama) çıkar', true),
    h('div', {class: 'btns'}, btn('Uygula', applyXlim), btn('Tümünü sığdır', () => S.plot.fitAll()), btn('Yeni alt grafik', () => { const ax = S.plot.addAxes(); S.plot.active = ax; refreshAll(); }), btn('Grafiği temizle', clearPlot, 'danger'))));
  r.append(h('div', {id: 'axesList'}));
  r.append(card('Aktif iz', h('div', {id: 'trInfo', class: 'note'}, 'İz seçilmedi'), fr('Örnekleme (Hz)', numIn('fsIn', '', {min: 0}), btn('Uygula', applyFs)), h('div', {class: 'note'}, 'Kanal zaman ekseni cnt sayacından türetilir; fs buradan elle düzeltilebilir.')));
  setTimeout(() => {
    $('#linkX').onchange = e => { S.plot.linkX = e.target.checked; if (S.plot.linkX && S.plot.axes.length) { const x = S.plot.axes[0].xlim; for (const a of S.plot.axes) a.xlim = x.slice(); } S.plot.invalidate(); };
    $('#gridOn').onchange = e => { S.plot.grid = e.target.checked; S.plot.invalidate(); };
    $('#grmsMode').onchange = e => { S.plot.grms.mode = e.target.value; S.plot.invalidate(); S.specPlot.invalidate(); }; $('#grmsDc').onchange = e => { S.plot.grms.dc = e.target.checked; S.plot.invalidate(); S.specPlot.invalidate(); };
    $('#legendOn').onchange = e => { S.plot.legend = e.target.checked; S.plot.invalidate(); };
  });
  return r;
}
function applyXlim() { const ax = activeAxes(); if (!ax) return; S.plot.setXlim(ax, num('xmin'), num('xmax')); S.plot.invalidate(); syncLimits(); }
function clearPlot() {
  S.plot.axes.slice().forEach(a => S.plot.removeAxes(a)); S.plot.active = null; S.colorIdx = 0;
  if (S.specPlot) { S.specPlot.axes.slice().forEach(a => S.specPlot.removeAxes(a)); S.specPlot.active = null; S.specPlot.harm = null; S.specPlot.invalidate(); }   // spektrum görünümü de temizlenir
  if (S.specView && S.specView.spec) { S.specView.spec = null; S.specView.rebuild && S.specView.rebuild(); S.specView.dirty = true; }
  for (const id of ['spInfo', 'ocInfo', 'srInfo', 'frInfo']) { const e = $('#' + id); if (e && e.textContent) e.textContent = ''; }
  if (S.xyKeep) { S.xyKeep = false; S.xyPlot.axes.slice().forEach(a => S.xyPlot.removeAxes(a)); S.xyPlot.invalidate(); if (typeof syncFeatUI === 'function') syncFeatUI(); }
  if (S.view !== 'time') switchView('time'); refreshAll();
}
function applyFs() { const tr = activeTrace(); const v = num('fsIn'); if (!tr || !(v > 0)) return; tr.ch.setFs(v); S.plot.fitAll(true); refreshAll(); toast('Örnekleme frekansı güncellendi'); }
function refreshAll() { refreshAxesUI(); refreshTraceInfo(); updateStats(); S.plot.invalidate(); uiChanged(); }
// Bellek göstergesi ve seçim listeleri (hesap kaynağı, FRF/rezonans çiftleri, MAT kartı): değişiklik olunca bir sonraki karede tek sefer
let _uiPend = 0;
function uiChanged() {
  if (_uiPend) return;
  _uiPend = requestAnimationFrame(() => {
    _uiPend = 0;
    try {
      let b = 0; for (const f of allFiles()) for (const c of f.channels) if (c.data) b += c.data.length * 8;
      const t = 'Bellekteki veri: ' + (b / 1048576).toFixed(0) + ' MB', el = $('#st1'); if (el && el.textContent !== t) el.textContent = t;
      if (typeof refreshCalcUI === 'function') refreshCalcUI(); if (typeof refreshFrfPick === 'function') refreshFrfPick(); if (typeof refreshMatCard === 'function') refreshMatCard(); if (typeof refreshRezPick === 'function') refreshRezPick();
    } catch (e) { if (typeof logErr === 'function') logErr('arayüz', e.message, e.stack); }
  });
}
function refreshAxesUI() {
  const box = $('#axesList'); if (!box) return; box.replaceChildren();
  S.plot.axes.forEach((ax, i) => {
    const traces = ax.traces.map((tr, k) => h('div', {class: 'trace' + (k === (ax.active || 0) ? ' act' : '')},
      h('input', {type: 'color', value: tr.color, oninput: e => { tr.color = e.target.value; S.plot.invalidate(); }}),
      h('span', {class: 'nm', title: tr.label, onclick: () => { ax.active = k; S.plot.active = ax; refreshAxesUI(); refreshTraceInfo(); updateStats(); }}, tr.label),
      h('select', {title: 'Çizgi kalınlığı', onchange: e => { tr.width = parseFloat(e.target.value); S.plot.invalidate(); }}, [0.75, 1, 1.5, 2, 3].map(w => h('option', {value: w, selected: w === (tr.width || 1)}, w))),
      h('input', {type: 'checkbox', checked: tr.visible, title: 'Göster/gizle', onchange: e => { tr.visible = e.target.checked; S.plot.invalidate(); updateStats(); }}),
      h('button', {title: 'İzi kaldır', onclick: () => { ax.traces.splice(k, 1); ax.active = 0; if (!ax.traces.length && S.plot.axes.length > 0) S.plot.removeAxes(ax); S.plot.clearSelection(); refreshAll(); }}, '×')));
    box.append(h('div', {class: 'card'}, h('h4', null, 'Alt grafik ' + (i + 1), ' ', h('button', {style: 'float:right;padding:0 6px', onclick: () => { S.plot.removeAxes(ax); refreshAll(); }}, 'Sil')),
      fr('Başlık', h('input', {type: 'text', value: ax.title, oninput: e => { ax.title = e.target.value; S.plot.invalidate(); }})),
      fr('Y etiketi', h('input', {type: 'text', value: ax.ylabel, oninput: e => { ax.ylabel = e.target.value; S.plot.invalidate(); }})),
      fr('Y aralığı', h('input', {type: 'number', step: 'any', 'data-ax': i, 'data-k': 'y0', value: ax.ylim[0], onchange: e => { S.plot.setYlim(ax, parseFloat(e.target.value), ax.ylim[1]); S.plot.invalidate(); refreshAxesUI(); }}), h('input', {type: 'number', step: 'any', 'data-ax': i, 'data-k': 'y1', value: ax.ylim[1], onchange: e => { S.plot.setYlim(ax, ax.ylim[0], parseFloat(e.target.value)); S.plot.invalidate(); refreshAxesUI(); }})),
      h('div', {class: 'fr chk'}, h('label', null, 'Y eksenini otomatik ölçekle'), h('input', {type: 'checkbox', checked: ax.yAuto, onchange: e => { ax.yAuto = e.target.checked; S.plot.invalidate(); }})),
      h('div', {class: 'fr chk'}, h('label', null, 'Y log ölçek'), h('input', {type: 'checkbox', checked: ax.ylog, onchange: e => { ax.ylog = e.target.checked; ax.yAuto = true; S.plot.invalidate(); }})),
      ...traces, !ax.traces.length ? h('div', {class: 'note'}, 'Bu alt grafik boş. Soldan bir kanal sürükleyin.') : null));
  });
  syncLimits();
}
function syncLimits() {
  const ax = activeAxes(); if (ax && document.activeElement && !['xmin', 'xmax'].includes(document.activeElement.id)) { if ($('#xmin')) { $('#xmin').value = +ax.xlim[0].toPrecision(8); $('#xmax').value = +ax.xlim[1].toPrecision(8); } }
  document.querySelectorAll('#axesList input[data-k]').forEach(el => { if (document.activeElement === el) return; const ax2 = S.plot.axes[+el.dataset.ax]; if (ax2) el.value = +ax2.ylim[el.dataset.k === 'y0' ? 0 : 1].toPrecision(6); });
}
function refreshTraceInfo() {
  const tr = activeTrace(), el = $('#trInfo'); if (!el) return;
  if (!tr) { el.textContent = 'İz seçilmedi'; return; }
  const c = tr.ch, gc = c.file && c.file.gcache && c.devKey ? c.file.gcache[c.devKey] : null;
  el.replaceChildren(h('b', null, c.name), h('br'), `${fmtCnt(c.n)} örnek · ${fmtNum(c.fs, 7)} Hz · ${fmtDur(c.duration)}`, h('br'), `Tür: ${KIND[c.kind].name}` + (gc ? ` · kayıp paket: ${gc.lost}` : '') + ` · silinen: ${fmtCnt(c.delCount)}`);
  if (document.activeElement !== $('#fsIn')) $('#fsIn').value = +c.fs.toPrecision(8);
}
function updateStats() {
  clearTimeout(S._st); const _tr = typeof activeTrace === 'function' ? activeTrace() : null, _big = _tr && _tr.ch && _tr.ch.n > 2e6; S._st = setTimeout(() => {
    const el = $('#statsbar'); el.replaceChildren();
    const tr = activeTrace(), ax = activeAxes();
    if (S.view !== 'time' || !tr || !tr.ch.data) { el.append(h('span', {class: 'muted'}, S.view === 'time' ? 'İstatistik: bir iz seçin' : '')); return; }
    const [a, b] = visRange(tr, ax), f = v => fmtNum(v, 6), tok = S._stTok = (S._stTok || 0) + 1;
    if (b - a > 1.5e6) { el.append(h('span', {class: 'muted'}, 'Görünen aralık · ' + tr.label + ' · istatistik hesaplanıyor…')); statsChunked(tr.ch.data, tr.ch.del, a, b, tok).then(s => { if (s) paintStats(el, tr, s); }); return; }
    paintStats(el, tr, DSP.stats(tr.ch.data, tr.ch.del, a, b));
  }, _big ? 250 : 70);   // büyük kanalda istatistik, etkileşim durulunca hesaplanır
}
// büyük aralıkta istatistik parça parça hesaplanır (arayüz donmaz); görünüm değişirse yarıda bırakılır
async function statsChunked(x, del, i0, i1, tok) {
  let n = 0, s = 0, s2 = 0, mn = Infinity, mx = -Infinity, nd = 0; const CH = 1 << 20;
  for (let a = i0; a < i1; a += CH) {
    const e = Math.min(i1, a + CH);
    for (let i = a; i < e; i++) { if (del && del[i]) { nd++; continue; } const v = x[i]; if (!isFinite(v)) continue; n++; s += v; s2 += v * v; if (v < mn) mn = v; if (v > mx) mx = v; }
    await new Promise(r => setTimeout(r, 0)); if (S._stTok !== tok) return null;
  }
  const mean = n ? s / n : NaN, rms = n ? Math.sqrt(s2 / n) : NaN, std = n > 1 ? Math.sqrt(Math.max(0, (s2 - n * mean * mean) / (n - 1))) : NaN;
  return {n, mean, rms, std, min: mn, max: mx, p2p: mx - mn, deleted: nd};
}
function paintStats(el, tr, s) {
  const f = v => fmtNum(v, 6); el.replaceChildren();
    el.append(...[h('span', {class: 'muted'}, 'Görünen aralık · ' + tr.label), h('span', null, h('b', null, 'N '), fmtCnt(s.n)), h('span', null, h('b', null, 'Min '), f(s.min)), h('span', null, h('b', null, 'Maks '), f(s.max)), h('span', null, h('b', null, 'Ort '), f(s.mean)), h('span', null, h('b', null, 'RMS '), f(s.rms)), h('span', null, h('b', null, 'Std '), f(s.std)), h('span', null, h('b', null, 'Tepe-tepe '), f(s.p2p)), s.deleted ? h('span', null, h('b', null, 'Silinen '), fmtCnt(s.deleted)) : null].filter(Boolean));
}

/* ---------- Temizle ---------- */
function buildClean() {
  const r = h('div');
  r.append(card('Seçim ve silme',
    h('div', {class: 'btns', style: 'margin-top:0'}, btn('Kutu seç', () => setMode('box')), btn('Kement seç', () => setMode('lasso'))),
    h('div', {class: 'note'}, 'Grafikte nokta seçin (kırmızı görünür), sonra "Seçilenleri sil" (Delete). Silme orijinal dosyayı değiştirmez, geri alınabilir.'),
    chkIn('applyAll', 'Seçimi grafikteki tüm izlere uygula', false),
    h('div', {id: 'selInfo', class: 'note'}, 'Seçim yok'),
    h('div', {class: 'btns'}, btn('Seçilenleri sil', deleteSelection, 'danger', 'btnDel'), btn('Seçimi kaldır', () => S.plot.clearSelection()), btn('Geri al', undo), btn('Yinele', redo))));
  r.append(card('Eşik ile bul',
    fr('Koşul', selIn('thMode', [['abs', '|y| > a'], ['gt', 'y > a'], ['lt', 'y < a'], ['out', 'y, [a, b] dışında']], 'abs')),
    fr('a / b', numIn('thA', 1), numIn('thB', 1)),
    fr('Kapsam', selIn('thScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'all')),
    h('div', {class: 'btns'}, btn('Bul ve seç', () => findOutliers('th')))));
  r.append(card('Sıçrama (spike) bul – Hampel',
    fr('Yarı pencere (örnek)', numIn('hmK', 5, {min: 1, step: 1})), fr('Eşik (σ)', numIn('hmS', 6, {min: 1})),
    fr('Kapsam', selIn('hmScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
    h('div', {class: 'btns'}, btn('Bul ve seç', () => findOutliers('hampel'))),
    h('div', {class: 'note'}, 'Yerel medyandan σ·MAD kadar uzak noktalar seçilir. Uygulamadan önce sonucu kırmızı olarak görürsünüz.')));
  r.append(card('Diğer', h('div', {class: 'btns', style: 'margin-top:0'}, btn('NaN/Inf noktaları bul', () => findOutliers('nan')), btn('Aktif izdeki tüm silmeleri geri al', () => { const t = activeTrace(); if (t) restoreChannel(t.ch); }))));
  r.append(card('Silinen noktalar', h('div', {id: 'delInfo', class: 'note'}, '—')));
  return r;
}
function refreshCleanInfo() {
  const el = $('#delInfo'); if (!el) return; const list = [];
  for (const f of allFiles()) for (const c of f.channels) if (c.delCount) list.push(`${c.name}: ${fmtCnt(c.delCount)}`);
  el.textContent = list.length ? list.join('\n') : 'Silinen nokta yok'; el.style.whiteSpace = 'pre-line';
  $('#tb-undo').disabled = !S.undo.length; $('#tb-redo').disabled = !S.redo.length;
}
function onSelect(sel) {
  const n = selCount(), el = $('#selInfo');
  if (el) el.textContent = sel ? `Seçili: ${fmtCnt(n)} nokta (${selectionHits().length} iz)` : 'Seçim yok';
  $('#st3').textContent = sel ? `Seçili: ${fmtCnt(n)} nokta` : ''; $('#tb-del').disabled = !n;
}
async function findOutliers(kind) {
  const ax = activeAxes(), tr = activeTrace(); if (!tr) return toast('Önce bir iz seçin');
  await busy('Aranıyor…', async () => {
    const ch = tr.ch; await ensureLoaded(ch);
    const scope = kind === 'th' ? sv('thScope') : kind === 'hampel' ? sv('hmScope') : 'all';
    let [a, b] = scope === 'vis' ? visRange(tr, ax) : [0, ch.n]; const d = ch.data, del = ch.del; let idx = [];
    if (kind === 'nan') { for (let i = a; i < b; i++) if (!(del && del[i]) && !isFinite(d[i])) idx.push(i); }
    else if (kind === 'th') {
      const m = sv('thMode'), A = num('thA'), B = num('thB'); const lo = Math.min(A, B), hi = Math.max(A, B);
      for (let i = a; i < b; i++) { if (del && del[i]) continue; const v = d[i]; if (!isFinite(v)) continue; if (m === 'abs' ? Math.abs(v) > A : m === 'gt' ? v > A : m === 'lt' ? v < A : (v < lo || v > hi)) idx.push(i); }
    } else {
      const f = await DSPW.run('hampelFlags', [d.subarray(a, b), Math.max(1, num('hmK') | 0), num('hmS'), del ? del.subarray(a, b) : null]);
      for (const k of f) idx.push(k + a);
    }
    S.plot.sel = {axes: ax, type: 'idx', hits: idx.length ? [{tr, idx: Uint32Array.from(idx)}] : []}; S.plot.onSelect(S.plot.sel); S.plot.invalidate();
    toast(idx.length ? `${fmtCnt(idx.length)} nokta bulundu — silmek için "Seçilenleri sil"` : 'Eşleşen nokta bulunamadı');
  });
}

/* ---------- Analiz ---------- */
function buildAnalyze() {
  const r = h('div');
  r.append(card('Spektrum (FFT / PSD)',
    fr('Hesap', selIn('spScale', [['psd', 'PSD (Welch)'], ['amp', 'Genlik spektrumu (tepe)'], ['rms', 'Genlik spektrumu (RMS)']], 'psd')),
    fr('NFFT', selIn('spN', [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536].map(v => [v, v]), 4096)),
    fr('Tam Δf (Hz)', numIn('spDf', '', {min: 0, step: 'any', placeholder: 'boş: NFFT', title: 'Verilirse pencere uzunluğu fs/Δf olur (ikinin kuvveti olması gerekmez): ör. fs=1000 Hz, Δf=1 Hz → 1000 nokta. NFFT seçimini geçersiz kılar.'})),
    fr('Pencere', selIn('spWin', [['hann', 'Hann'], ['hamming', 'Hamming'], ['blackman', 'Blackman'], ['flattop', 'Flat-top'], ['rect', 'Dikdörtgen']], 'hann')),
    fr('Örtüşme', selIn('spOv', [['0', '%0'], ['0.5', '%50'], ['0.75', '%75']], '0.5')),
    fr('Kapsam', selIn('spScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
    fr('Y ekseni', selIn('spY', [['log', 'Logaritmik (g²/Hz)'], ['lin', 'Lineer'], ['db', 'dB']], 'log')),
    fr('X ekseni', selIn('spX', [['log', 'Logaritmik'], ['lin', 'Lineer']], 'log')),
    chkIn('spPeak', 'En yüksek 3 tepeyi işaretle', true), chkIn('spCI', '%95 güven aralığını (kesikli) çiz', false),
    h('div', {class: 'btns'}, btn('Spektrumu hesapla', computeSpectrum, 'primary')),
    h('div', {id: 'spInfo', class: 'note'}, 'Aktif alt grafikteki görünür tüm izler için hesaplanır.')));
  r.append(card('Spektrogram (STFT)',
    fr('NFFT', selIn('sgN', [256, 512, 1024, 2048, 4096, 8192].map(v => [v, v]), 1024)),
    fr('Pencere', selIn('sgWin', [['hann', 'Hann'], ['hamming', 'Hamming'], ['blackman', 'Blackman']], 'hann')),
    fr('Örtüşme', selIn('sgOv', [['0.5', '%50'], ['0.75', '%75'], ['0.9', '%90']], '0.75')),
    fr('Kapsam', selIn('sgScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
    fr('Renk haritası', selIn('sgMap', [['viridis', 'Viridis'], ['turbo', 'Turbo'], ['inferno', 'Inferno'], ['magma', 'Magma'], ['jet', 'Jet'], ['gri', 'Gri']], 'viridis')),
    fr('dB aralığı', numIn('sgLo', ''), numIn('sgHi', '')),
    chkIn('sgLog', 'Logaritmik frekans ekseni', false), chkIn('sgSl', 'İmleç kesitleri (spektrum + zaman)', true),
    h('div', {class: 'btns'}, btn('Spektrogramı hesapla', computeSpectrogram, 'primary'), btn('Renk aralığını uygula', applyClim)),
    h('div', {id: 'sgCur', class: 'note'}, 'Spektrogram üzerine tıklayın: imleç (t, f, dB) ve kesitler.'),
    h('div', {class: 'note'}, 'Çok uzun aralıklarda kare sayısı 1500 ile sınırlıdır; daha ayrıntı için önce yakınlaştırın.')));
  for (const c of extraAnalysisCards()) r.append(c);
  setTimeout(refreshFrfPick);
  if (typeof faz4Cards === 'function') for (const c of faz4Cards()) r.append(c);
  r.append(filterCard());
  return r;
}
function specRange(tr, ax, scope) { const ch = tr.ch; return scope === 'vis' ? visRange(tr, ax) : [0, ch.n]; }
async function computeSpectrum(only) {
  const ax = activeAxes(); if (!ax || !ax.traces.length) return toast('Önce Zaman grafiğine bir iz ekleyin');
  const list = only && only.ch ? [only] : ax.traces.filter(t => t.ch);
  await busy('Spektrum hesaplanıyor…', async prog => {
    const o = {nfft: +sv('spN'), win: sv('spWin'), overlap: +sv('spOv'), scale: sv('spScale'), maxSeg: 4000}; { const df = num('spDf'); if (df > 0) o.df = df; }
    const ys = sv('spY'), P = S.specPlot; P.axes.slice().forEach(a => P.removeAxes(a));
    const sa = P.addAxes({xlog: sv('spX') === 'log', ylog: ys === 'log', title: ax.title || ''});
    const k0 = list.find(t => t.visible && t.ch), ku = k0 ? (k0.ch.unit || (k0.ch.kind === 'vib' ? 'g' : 'birim')) : 'birim', u2 = ku.length > 1 ? '(' + ku + ')' : ku;
    sa.isDb = ys === 'db';
    sa.ylabel = o.scale === 'psd' ? (ys === 'db' ? `PSD (dB re 1 ${u2}²/Hz)` : `PSD (${u2}²/Hz)`) : (ys === 'db' ? `Genlik (dB re 1 ${u2})` : (o.scale === 'amp' ? `Tepe genlik (${ku})` : `RMS genlik (${ku})`)); sa.xlabel = 'Frekans (Hz)';
    let k = 0, info = [];
    for (const tr of list) {
      if (!tr.visible) continue; await ensureLoaded(tr.ch); const ch = tr.ch; const [a, b] = specRange(tr, ax, sv('spScope'));
      if (b - a < 64) { toast('Aralık çok kısa: ' + tr.label); continue; }
      const seg = DSP.segment(ch.data, ch.del, a, b); const res = await DSPW.run('welch', [seg, ch.fs, o]);
      let y = res.y; if (ys === 'db') { const kf = o.scale === 'psd' ? 10 : 20; y = res.y.map(v => kf * Math.log10(v + 1e-300)); let pk = -Infinity; for (const v of y) if (v > pk) pk = v; y = y.map(v => Math.max(v, pk - 180)); }
      const sd = DSP.stats(seg, null, 0, seg.length); if (!(sd.std > 1e-9 * (Math.abs(sd.mean) + 1e-12))) toast('Uyarı: ' + tr.label + ' seçili aralıkta sabit (değişmiyor), spektrum anlamsız.', 6000);
      const t = {kind: 'xy', x: res.f, y, label: tr.label, color: tr.color, width: 1, visible: true, raw: res.y, scale: o.scale, df: res.df, srcKind: ch.kind};
      if (ck('spPeak')) t.peaks = findPeaks(res.f, y, 3);
      sa.traces.push(t); const ci = DSP.psdCI(res.dof, 0.95), pw = o.scale === 'psd' ? 1 : 0.5, cl = Math.pow(ci[0], pw), ch_ = Math.pow(ci[1], pw);
      t.ci = {dof: res.dof, lo: cl, hi: ch_}; if (ck('spCI')) for (const [nm, fct] of [['−%95', cl], ['+%95', ch_]]) sa.traces.push({kind: 'xy', x: res.f, y: ys === 'db' ? y.map(v => v + (o.scale === 'psd' ? 10 : 20) * Math.log10(fct)) : y.map(v => v * fct), label: tr.label + ' ' + nm, color: tr.color, width: 1, dash: [4, 4], visible: true, raw: res.y, scale: o.scale, df: res.df, srcKind: ch.kind, noLegend: true});
      info.push(`${tr.label}: Δf=${fmtNum(res.df, 4)} Hz · ENBW=${fmtNum(res.enbw, 4)} Hz · ${res.nseg} bölüt (etkin ${fmtNum(res.keff, 3)}) · sd=${fmtNum(res.dof, 3)} · %95 aralık ${(10 * Math.log10(ci[0])).toFixed(2)}/+${(10 * Math.log10(ci[1])).toFixed(2)} dB`); (S.methodLog = S.methodLog || []).push({t: Date.now(), op: 'spectrum', label: tr.label, nfft: res.nfft, win: o.win, overlap: o.overlap, scale: o.scale, nseg: res.nseg, dof: res.dof, df: res.df, enbw: res.enbw, del: ch.delCount || 0}); prog(++k / list.length);
    }
    $('#spInfo').textContent = info.join('\n'); $('#spInfo').style.whiteSpace = 'pre-line';
    if (!sa.traces.length) { P.removeAxes(sa); return; }
    P.fitAll(); if (sa.xlog) sa.xlim[0] = Math.max(sa.xlim[0], sa.traces[0].x[1] || 1e-3); harmRefresh(); switchView('spec');
  });
}
function findPeaks(f, y, n) {
  const c = []; for (let i = 2; i < y.length - 1; i++) if (isFinite(y[i]) && y[i] > y[i - 1] && y[i] >= y[i + 1]) c.push(i);
  c.sort((a, b) => y[b] - y[a]); const out = [];
  for (const i of c) { if (out.every(p => Math.abs(p.i - i) > 8)) out.push({i, x: f[i], y: y[i]}); if (out.length >= n) break; } return out;
}
async function computeSpectrogram() {
  const ax = activeAxes(), tr = activeTrace(); if (!tr) return toast('Önce bir iz seçin');
  await busy('Spektrogram hesaplanıyor…', async () => {
    const ch = tr.ch; await ensureLoaded(ch); const [a, b] = specRange(tr, ax, sv('sgScope'));
    if (b - a < +sv('sgN') * 2) throw new Error('Aralık NFFT için çok kısa');
    const seg = DSP.segment(ch.data, ch.del, a, b);
    const sp = await DSPW.run('spectrogram', [seg, ch.fs, {nfft: +sv('sgN'), win: sv('sgWin'), overlap: +sv('sgOv'), maxFrames: 1500}], [seg]);
    S.specView.cmap = sv('sgMap'); S.specView.slices = ck('sgSl'); S.specView.logF = ck('sgLog'); S.specView.setSpec(sp, ch.fs, ch.t(a)); sgCursorInfo(null);
    $('#sgLo').value = Math.round(S.specView.clim[0]); $('#sgHi').value = Math.round(S.specView.clim[1]);
    switchView('sgram'); toast(`${sp.nf} kare · Δf=${fmtNum(sp.df, 4)} Hz · Δt=${fmtNum(sp.dt * 1000, 4)} ms`);
  });
}
function applyClim() { const v = S.specView; v.cmap = sv('sgMap'); v.slices = ck('sgSl'); v.logF = ck('sgLog'); const lo = num('sgLo'), hi = num('sgHi'); if (isFinite(lo) && isFinite(hi) && hi > lo) v.clim = [lo, hi]; if (v.spec && v.logF && v.ylim[0] < v.fMin()) v.ylim[0] = v.fMin(); v.rebuild(); v.invalidate(); }
function sgCursorInfo(c) { const e = $('#sgCur'); if (!e) return; e.textContent = c ? `İmleç: t = ${fmtNum(c.t, 6)} s · f = ${fmtNum(c.f, 6)} Hz · ${c.v.toFixed(2)} dB` : 'Spektrogram üzerine tıklayın: imleç (t, f, dB) ve kesitler.'; }
document.addEventListener('change', e => { if (e.target && ['sgMap', 'sgLog', 'sgSl'].includes(e.target.id) && S.specView) applyClim(); });
function addDerived(name, data, src, i0, full) {
  if (!S.derived) S.derived = {id: 'derived', name: 'Türetilmiş kanallar', derived: true, channels: [], mcache: new Map()};
  const c = new Channel({name, rest: name, base: name, comp: '', dev: 'türetilmiş', kind: src ? src.kind : 'calc', n: data.length, file: S.derived, label: name, derived: true, data, varIdx: -1});
  if (src && full && src.n === data.length) c.copyTiming(src); else if (src) { c.g = null; c.dtS = 1 / src.fs; c.t0 = src.t(i0 || 0); } else c.dtS = 1;
  c.desc = S.opDesc || ''; c.srcName = src ? src.name : ''; S.derived.channels.push(c); logOp('derived', {name, src: src ? src.name : '', desc: S.opDesc || ''}); S.opDesc = ''; renderChips(); renderTree(); return c;
}
async function addDerivedToPlot(c, ax) { const tr = makeTrace(c); (ax || activeAxes() || S.plot.addAxes()).traces.push(tr); const a = ax || activeAxes(); if (!S.plot.active) S.plot.active = a; switchView('time'); refreshAll(); }
// Süzgeç: Butterworth / Chebyshev I / Bessel (IIR, bilineer) ve pencereli sinc FIR; canlı Bode (genlik / faz) önizlemesi
function filterCard() {
  const fam = selIn('flFam', [['butter', 'Butterworth'], ['cheby1', 'Chebyshev Tip I'], ['bessel', 'Bessel'], ['fir', 'FIR (pencereli sinc)']], 'butter');
  const c = card('Süzgeç (IIR / FIR, canlı Bode)',
    fr('Tasarım', fam),
    fr('Tür', selIn('flType', [['lp', 'Alçak geçiren'], ['hp', 'Yüksek geçiren'], ['bp', 'Band geçiren'], ['bs', 'Band söndüren'], ['notch', 'Notch (çentik, Butterworth)']], 'lp')),
    fr('f1 / f2 (Hz)', numIn('flF1', 100), numIn('flF2', 500)),
    h('div', {class: 'fr', id: 'flOrdRow'}, h('label', null, 'Derece'), numIn('flOrd', 4, {min: 1, max: 20, step: 1})),
    h('div', {class: 'fr', id: 'flRpRow'}, h('label', null, 'Dalgalanma (dB)'), numIn('flRp', 1, {min: 0.01, max: 10, step: 0.1})),
    h('div', {class: 'fr', id: 'flQRow'}, h('label', null, 'Q (notch)'), numIn('flQ', 30)),
    h('div', {class: 'fr', id: 'flTapRow'}, h('label', null, 'FIR katsayı / pencere'), numIn('flTaps', 101, {min: 3, max: 8191, step: 2}), selIn('flWin', [['hamming', 'Hamming'], ['hann', 'Hann'], ['blackman', 'Blackman'], ['kaiser', 'Kaiser'], ['rect', 'Dikdörtgen']], 'hamming')),
    h('div', {class: 'fr', id: 'flBetaRow'}, h('label', null, 'Kaiser β'), numIn('flBeta', 8.6, {min: 0, step: 0.1})),
    chkIn('flZero', 'Sıfır faz (IIR: ileri-geri · FIR: gecikme düzeltmeli)', true),
    fr('Kapsam', selIn('flScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'all')),
    h('div', {class: 'bode'}, h('canvas', {id: 'flBode', width: 320, height: 190, 'aria-label': 'Bode diyagramı'})), h('div', {id: 'flInfo', class: 'note'}, ''),
    h('div', {class: 'btns'}, btn('Süz ve yeni kanal olarak ekle', applyFilterUI, 'primary')));
  c.addEventListener('input', () => bodeSoon()); c.addEventListener('change', () => bodeSoon());
  setTimeout(bodeSoon, 0); return c;
}
let _bodeT = 0; function bodeSoon() { clearTimeout(_bodeT); _bodeT = setTimeout(drawBode, 60); }
function filterSpec() {
  return {family: sv('flFam'), type: sv('flType'), order: num('flOrd') | 0, f1: num('flF1'), f2: num('flF2'), Q: num('flQ'), rp: num('flRp'), taps: num('flTaps') | 0, win: sv('flWin'), beta: num('flBeta')};
}
function filterFs() { const tr = typeof activeTrace === 'function' && activeTrace(); return tr && tr.ch && tr.ch.fs > 0 ? tr.ch.fs : null; }
function drawBode() {
  const cv = $('#flBode'); if (!cv) return; const sp = filterSpec(), fir = sp.family === 'fir', zero = ck('flZero');
  const vis = (id, on) => { const e = $('#' + id); if (e) e.style.display = on ? '' : 'none'; };
  vis('flOrdRow', !fir && sp.type !== 'notch'); vis('flRpRow', sp.family === 'cheby1'); vis('flQRow', sp.type === 'notch'); vis('flTapRow', fir); vis('flBetaRow', fir && sp.win === 'kaiser');
  const fs = filterFs() || 2 * Math.max(1000, (sp.f2 || sp.f1) * 4), info = $('#flInfo');
  const W = cv.clientWidth || 320, H = 190, dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const T = curTheme(); g.fillStyle = T.bg; g.fillRect(0, 0, W, H); g.font = '10px system-ui'; g.textBaseline = 'middle';
  let F, R; try { if (sp.type === 'notch' && fir) throw new Error('Notch yalnız IIR (Butterworth) ile'); if (sp.type === 'notch' && sp.family !== 'butter') sp.family = 'butter'; F = DSP.filterDesign(sp, fs); R = DSP.freqResp(F, fs, 400, zero && !fir); }
  catch (e) { g.fillStyle = T.muted; g.textAlign = 'center'; g.fillText(e.message, W / 2, H / 2); if (info) info.textContent = ''; return; }
  const L = 40, Rr = W - 40, top = 8, h1 = (H - 34) * 0.62, h2 = (H - 34) * 0.38 - 8, y2 = top + h1 + 10, lx = f => L + Math.log10(Math.max(f, fs / 2000)) / 1 * 0, xf = f => L + (Math.log10(Math.max(f, fs / 1e4)) - Math.log10(fs / 1e4)) / (Math.log10(fs / 2) - Math.log10(fs / 1e4)) * (Rr - L);
  void lx; const mLo = -100, mHi = 5, ym = v => top + (mHi - Math.max(mLo, Math.min(mHi, v))) / (mHi - mLo) * h1;
  let pmin = Infinity, pmax = -Infinity; for (const v of R.ph) { pmin = Math.min(pmin, v); pmax = Math.max(pmax, v); } if (pmax - pmin < 1) { pmin -= 90; pmax += 90; }
  const yp = v => y2 + (pmax - v) / (pmax - pmin) * h2;
  g.strokeStyle = T.grid; g.lineWidth = 1; g.beginPath();
  for (const v of [0, -20, -40, -60, -80]) { g.moveTo(L, ym(v) + .5); g.lineTo(Rr, ym(v) + .5); }
  for (let e = Math.ceil(Math.log10(fs / 1e4)); Math.pow(10, e) <= fs / 2; e++) { const x = Math.round(xf(Math.pow(10, e))) + .5; g.moveTo(x, top); g.lineTo(x, y2 + h2); }
  g.stroke(); g.strokeStyle = T.axis; g.strokeRect(L + .5, top + .5, Rr - L, h1); g.strokeRect(L + .5, y2 + .5, Rr - L, h2);
  g.fillStyle = T.muted; g.textAlign = 'right'; for (const v of [0, -40, -80]) g.fillText(v + ' dB', L - 3, ym(v)); g.fillText(Math.round(pmax) + '°', L - 3, y2 + 4); g.fillText(Math.round(pmin) + '°', L - 3, y2 + h2 - 4);
  g.textAlign = 'center'; for (let e = Math.ceil(Math.log10(fs / 1e4)); Math.pow(10, e) <= fs / 2; e++) g.fillText(fmtNum(Math.pow(10, e), 3), xf(Math.pow(10, e)), y2 + h2 + 9);
  g.textAlign = 'left'; g.fillText('Hz (fs = ' + fmtNum(fs, 5) + (filterFs() ? '' : ', örnek') + ')', Rr - 70, y2 + h2 + 20);
  const line = (ys, col) => { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); let st = false; for (let i = 1; i < R.f.length; i++) { const x = xf(R.f[i]), y = ys[i]; if (!isFinite(y)) { st = false; continue; } st ? g.lineTo(x, y) : g.moveTo(x, y); st = true; } g.stroke(); };
  line(Array.from(R.mag, ym), '#0072BD'); line(Array.from(R.ph, yp), '#D95319');
  g.strokeStyle = '#e15759'; g.setLineDash([3, 3]); g.beginPath(); for (const f of [sp.f1, ['bp', 'bs'].includes(sp.type) ? sp.f2 : null]) if (f > 0) { const x = Math.round(xf(f)) + .5; g.moveTo(x, top); g.lineTo(x, y2 + h2); } g.stroke(); g.setLineDash([]);
  const at = f => { let i = 1; while (i < R.f.length - 1 && R.f[i] < f) i++; const t = (f - R.f[i - 1]) / (R.f[i] - R.f[i - 1]); return R.mag[i - 1] + (R.mag[i] - R.mag[i - 1]) * Math.max(0, Math.min(1, t)); };
  if (info) info.textContent = (fir ? `FIR ${F.b.length} katsayı · gecikme ${fmtNum((F.b.length - 1) / 2 / fs * 1000, 4)} ms` : `IIR ${F.sos.length} ikinci derece bölüm`) + ` · |H(f1)| = ${at(sp.f1).toFixed(2)} dB` + (zero ? (fir ? ' · sıfır faz (gecikme düzeltildi)' : ' · ileri-geri: genlik², faz 0') : ' · tek geçiş (nedensel) faz');
}
async function applyFilterUI() {
  const tr = activeTrace(), ax = activeAxes(); if (!tr) return toast('Önce bir iz seçin');
  await busy('Süzülüyor…', async () => {
    const ch = tr.ch; await ensureLoaded(ch); const [a, b] = specRange(tr, ax, sv('flScope'));
    const sp = filterSpec(), zero = ck('flZero'); if (sp.type === 'notch') sp.family = sp.family === 'fir' ? 'butter' : 'butter';
    if ((sp.type === 'bp' || sp.type === 'bs') && !(sp.f2 > sp.f1)) throw new Error('f2, f1\'den büyük olmalı');
    const F = DSP.filterDesign(sp, ch.fs), seg = DSP.segment(ch.data, ch.del, a, b); const y = await DSPW.run('filterApply', [F, seg, zero], [seg]);
    const nm = {butter: 'Butterworth', cheby1: 'Chebyshev I (' + sp.rp + ' dB)', bessel: 'Bessel', fir: 'FIR ' + (F.b ? F.b.length : '') + ' katsayı ' + sp.win}[sp.family];
    const tag = {lp: 'LP' + sp.f1, hp: 'HP' + sp.f1, bp: 'BP' + sp.f1 + '-' + sp.f2, bs: 'BS' + sp.f1 + '-' + sp.f2, notch: 'N' + sp.f1}[sp.type] + (sp.family === 'butter' ? '' : '_' + {cheby1: 'C1', bessel: 'BE', fir: 'FIR'}[sp.family]);
    S.opDesc = `${nm} ${sp.type.toUpperCase()} ${zero ? 'sıfır faz' : 'tek geçiş'}${sp.family !== 'fir' && sp.type !== 'notch' ? ', derece ' + sp.order : ''}, f1=${sp.f1}${sp.type === 'bp' || sp.type === 'bs' ? ', f2=' + sp.f2 : ''}${sp.type === 'notch' ? ', Q=' + sp.Q : ''} Hz`;
    const c = addDerived(ch.name + '_' + tag, y, ch, a, a === 0 && b === ch.n); await addDerivedToPlot(c, ax);
    toast('Süzülmüş kanal eklendi: ' + c.name);
  });
}

/* ---------- İfade ---------- */
function resolveChannel(name) {
  let m = []; for (const f of allFiles()) for (const c of f.channels) if (c.name === name) m.push(c);
  if (!m.length) for (const f of allFiles()) for (const c of f.channels) if (c.name.endsWith('_' + name) || c.rest === name) m.push(c);
  if (!m.length) throw new Error('Kanal bulunamadı: ' + name);
  if (m.length > 1) { const onPlot = m.filter(c => S.plot.axes.some(a => a.traces.some(t => t.ch === c))); if (onPlot.length === 1) return onPlot[0]; throw new Error('Belirsiz ad "' + name + '": ' + m.slice(0, 3).map(c => c.name).join(', ') + '…'); }
  return m[0];
}
/* ---------- Akustik ---------- */
function buildAcoustic() {
  const r = h('div');
  r.append(card('Kaynak',
    h('div', {id: 'acSrc', class: 'note'}, 'Aktif iz kullanılır (Akustik kanal: as…).'),
    fr('Aralık', selIn('acScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
    fr('Hız çarpanı', numIn('acSpeed', 1, {min: 0.05, step: 'any'})), fr('Ses düzeyi', h('input', {type: 'range', id: 'acVol', min: 0, max: 1, step: 0.01, value: 0.5, oninput: e => { if (S.audio && S.audio.gain) S.audio.gain.gain.value = +e.target.value; }})),
    chkIn('acLoop', 'Döngü', false),
    h('div', {class: 'note'}, 'Örnekleme 8 kHz altına inerse hız otomatik artırılır. Dinlemeden önce ses düzeyini düşük tutun.')));
  r.append(card('Otomatik temizleme',
    h('div', {class: 'note'}, 'Kaynak izi inceler: DC/eğilim, 50/60 Hz uğultusu ve harmonikleri, düşük frekans gürültüsü, tık/pop ve sessiz bölümden gürültü profilini kendisi bulup aşağıdaki ayarları doldurur. Sonra dinleyip ayarları değiştirebilirsiniz.'),
    h('div', {class: 'btns'}, btn('Otomatik temizle (tespit + uygula)', acAutoRun, 'primary'), btn('Yalnız ayarla', () => acAuto(false)))));
  r.append(card('Parazit temizleme',
    fr('DC / eğilim', selIn('acDc', [['none', 'Yok'], ['mean', 'Ortalamayı çıkar'], ['lin', 'Doğrusal eğilimi çıkar']], 'mean')),
    h('div', {class: 'fr chk'}, h('label', {for: 'acHpOn'}, 'Yüksek geçiren (Hz)'), numIn('acHp', 20), h('input', {type: 'checkbox', id: 'acHpOn'})),
    h('div', {class: 'fr chk'}, h('label', {for: 'acLpOn'}, 'Alçak geçiren (Hz)'), numIn('acLp', 10000), h('input', {type: 'checkbox', id: 'acLpOn'})),
    h('div', {class: 'fr chk'}, h('label', {for: 'acNOn'}, 'Notch f0 (Hz)'), numIn('acNf', 50), h('input', {type: 'checkbox', id: 'acNOn'})),
    fr('  Q / harmonik', numIn('acNq', 30), numIn('acNh', 3, {min: 1, step: 1})),
    h('div', {class: 'fr chk'}, h('label', {for: 'acClOn'}, 'Tık / pop temizle'), h('input', {type: 'checkbox', id: 'acClOn'})),
    fr('  Pencere / σ', numIn('acClK', 5, {min: 1, step: 1}), numIn('acClS', 8)),
    h('div', {class: 'fr chk'}, h('label', {for: 'acDnOn'}, 'Spektral gürültü azaltma'), h('input', {type: 'checkbox', id: 'acDnOn'})),
    fr('  Azaltma (dB)', numIn('acDnDb', 15), numIn('acDnA', 2)),
    fr('  Gürültü aralığı (s)', numIn('acN0', ''), numIn('acN1', '')),
    h('div', {class: 'btns'}, btn('Görünen aralığı gürültü yap', setNoiseFromView), btn('Aralığı kaldır', () => { S.plot.bands = []; $('#acN0').value = ''; $('#acN1').value = ''; S.plot.invalidate(); })),
    h('div', {class: 'note'}, 'Gürültü aralığı: yalnızca arka plan gürültüsünün olduğu sessiz bir bölüm seçin. Spektral azaltma bu bölümün ortalama spektrumunu çıkarır.')));
  r.append(card('Dinle ve kaydet',
    h('div', {class: 'btns', style: 'margin-top:0'}, btn('▶ Orijinal', () => acPlay(false), 'primary'), btn('▶ Temizlenmiş', () => acPlay(true), 'primary'), btn('■ Durdur', acStop)),
    h('div', {class: 'btns'}, btn('Temizlenmiş kanalı ekle', acAddClean), btn('Önce/sonra spektrum', acCompare)),
    h('div', {class: 'btns'}, btn('WAV kaydet (orijinal)', () => acWav(false)), btn('WAV kaydet (temiz)', () => acWav(true))),
    h('div', {id: 'acLog', class: 'note', style: 'white-space:pre-line'})));
  return r;
}
async function acAuto(add) {
  await busy('Parazitler analiz ediliyor…', async () => {
    const {tr, ax} = acGetSeg(), ch = tr.ch; await ensureLoaded(ch); const [a, b] = specRange(tr, ax, sv('acScope'));
    if (b - a < 1024) throw new Error('Aralık çok kısa');
    const x = DSP.segment(ch.data, ch.del, a, b), r = DSP.autoClean(x, ch.fs), p = r.plan;
    $('#acDc').value = p.dc; $('#acHpOn').checked = !!p.hp; if (p.hp) $('#acHp').value = p.hp; $('#acLpOn').checked = !!p.lp; if (p.lp) $('#acLp').value = p.lp;
    $('#acNOn').checked = !!p.notch; if (p.notch) { $('#acNf').value = p.notch; $('#acNq').value = p.nq; $('#acNh').value = p.nh; }
    if (p.dnMode === 'min') { $('#acN0').value = ''; $('#acN1').value = ''; S.plot.bands = []; S.plot.invalidate(); }
    $('#acClOn').checked = p.click; $('#acClK').value = p.ck; $('#acClS').value = p.cs; $('#acDnOn').checked = p.dn; $('#acDnDb').value = p.dnDb; $('#acDnA').value = p.dnA;
    if (r.noise) { const t0 = ch.t(a + r.noise[0]), t1 = ch.t(a + r.noise[1]); $('#acN0').value = +t0.toPrecision(8); $('#acN1').value = +t1.toPrecision(8); S.plot.bands = [{x0: t0, x1: t1, color: '#2aa198'}]; S.plot.invalidate(); }
    $('#acLog').textContent = 'OTOMATİK ANALİZ\n' + r.log.join('\n');
    if (add) await acAddClean();
  });
}
function setNoiseFromView() { const ax = activeAxes(); if (!ax) return; $('#acN0').value = +ax.xlim[0].toPrecision(8); $('#acN1').value = +ax.xlim[1].toPrecision(8); S.plot.bands = [{x0: ax.xlim[0], x1: ax.xlim[1], color: '#2aa198'}]; S.plot.invalidate(); toast('Gürültü aralığı atandı'); }
function acGetSeg() {
  const tr = activeTrace(), ax = activeAxes(); if (!tr) throw new Error('Önce bir iz seçin (tercihen akustik, as…)');
  return {tr, ax};
}
function opts() { return {dc: sv('acDc'), hp: ck('acHpOn') ? num('acHp') : 0, lp: ck('acLpOn') ? num('acLp') : 0, notch: ck('acNOn') ? num('acNf') : 0, nq: num('acNq'), nh: num('acNh') | 0, click: ck('acClOn'), ck: num('acClK') | 0, cs: num('acClS'), dn: ck('acDnOn'), dnDb: num('acDnDb'), dnA: num('acDnA')}; }
async function preChain(x, fs, o, log) {
  let y = x;
  if (o.dc === 'mean') { let m = 0; for (const v of y) m += v; m /= y.length; y = y.map(v => v - m); } else if (o.dc === 'lin') y = DSP.detrendLinear(y);
  const own = () => y === x ? [] : [y];   // girişi (çağıranın dizisi) aktarma
  if (o.hp) y = await DSPW.run('filtfilt', [DSP.design('hp', {order: 4, f1: o.hp}, fs), y], own());
  if (o.lp && o.lp < fs / 2) y = await DSPW.run('filtfilt', [DSP.design('lp', {order: 4, f1: o.lp}, fs), y], own());
  if (o.notch) y = await DSPW.run('filtfilt', [DSP.design('notch', {f1: o.notch, Q: o.nq, harmonics: o.nh}, fs), y], own());
  return y;
}
async function acPrepare(clean) {
  const {tr, ax} = acGetSeg(), ch = tr.ch; await ensureLoaded(ch); const fs = ch.fs; const [a, b] = specRange(tr, ax, sv('acScope'));
  if (b - a < 256) throw new Error('Aralık çok kısa');
  let x = DSP.segment(ch.data, ch.del, a, b), log = [];
  if (!clean) { let m = 0; for (const v of x) m += v; m /= x.length; return {y: x.map(v => v - m), fs, a, b, ch, log, raw: x}; }
  const o = opts(); let y = await preChain(x, fs, o);
  if (o.click) { const r = DSP.declick(y, o.ck, o.cs, 2); y = r.y; log.push(`Tık temizleme: ${r.events} olay, ${fmtCnt(r.count)} örnek düzeltildi`); }
  if (o.dn) {
    const n0 = num('acN0'), n1 = num('acN1');
    if (n1 > n0) {
      const na = Math.max(0, Math.floor(ch.timeIdx(n0))), nb = Math.min(ch.n, Math.ceil(ch.timeIdx(n1)));
      const nz = await preChain(DSP.segment(ch.data, ch.del, na, nb), fs, o); y = await DSPW.run('spectralDenoise', [y, nz, {nfft: 2048, reduceDb: o.dnDb, alpha: o.dnA}], y === x ? [nz] : [y, nz]); log.push(`Gürültü profili: ${fmtCnt(nb - na)} örnek (seçilen sessiz bölüm)`);
    } else {   // sessiz bölüm verilmedi: durağan gürültü tabanı sinyalden tahmin edilir
      const Pn = await DSPW.run('noiseFloorMinStat', [y, 2048, 0.1]); y = await DSPW.run('spectralDenoise', [y, null, {nfft: 2048, reduceDb: o.dnDb, alpha: o.dnA, noisePower: Pn}], y === x ? [] : [y]); log.push('Gürültü profili: sinyalden otomatik tahmin (frekans başına en düşük %10 çerçeve)');
    }
  }
  return {y, fs, a, b, ch, log, raw: x};
}
function acStop() { const A = S.audio; if (A) { try { A.src.stop(); } catch (e) {} A.stopped = true; } S.plot.playhead = null; S.plot.invalidate(); }
async function acPlay(clean) {
  acStop();
  await busy(clean ? 'Temizleniyor…' : 'Hazırlanıyor…', async () => {
    const p = await acPrepare(clean); $('#acLog').textContent = p.log.join('\n');
    let y = p.y, fs = p.fs, dec = 1; while (fs / dec > 96000) dec++; if (dec > 1) { const o = new Float64Array(Math.floor(y.length / dec)); for (let i = 0; i < o.length; i++) o[i] = y[i * dec]; y = o; fs /= dec; }
    let speed = Math.max(0.05, num('acSpeed') || 1); if (fs * speed < 8000) { speed = Math.ceil(8000 / fs); $('#acSpeed').value = speed; toast('Hız çarpanı ×' + speed + ' olarak ayarlandı (örnekleme çok düşük)'); }
    const rate = Math.round(fs * speed);
    const ctx = (S.audio && S.audio.ctx) || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') await ctx.resume();
    const buf = ctx.createBuffer(1, y.length, rate), d = buf.getChannelData(0);
    const sm = []; const st = Math.max(1, Math.floor(y.length / 20000)); for (let i = 0; i < y.length; i += st) sm.push(Math.abs(y[i])); sm.sort((u, v) => u - v); const pk = sm[Math.floor(sm.length * 0.999)] || 1;
    const nrm = 0.9 / pk, fade = Math.min(Math.floor(rate * 0.01), y.length >> 2);
    for (let i = 0; i < y.length; i++) { let v = y[i] * nrm; v = v > 1 ? 1 : v < -1 ? -1 : v; if (i < fade) v *= i / fade; else if (i > y.length - fade) v *= (y.length - i) / fade; d[i] = v; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = ck('acLoop'); const gain = ctx.createGain(); gain.gain.value = +sv('acVol'); src.connect(gain).connect(ctx.destination);
    const t0 = p.ch.t(p.a), dur = (p.b - p.a) / p.fs; src.start();
    S.audio = {ctx, src, gain, start: ctx.currentTime, t0, speed, dur, loop: src.loop, stopped: false};
    src.onended = () => { if (S.audio && S.audio.src === src && !src.loop) { S.plot.playhead = null; S.plot.invalidate(); } };
    const tick = () => { const A = S.audio; if (!A || A.src !== src || A.stopped) return; let el = (A.ctx.currentTime - A.start) * A.speed; if (A.loop) el %= A.dur; if (el > A.dur + 0.05) { S.plot.playhead = null; S.plot.invalidate(); return; } S.plot.playhead = A.t0 + el; S.plot.invalidate(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
async function acAddClean() {
  await busy('Temizleniyor…', async () => {
    const p = await acPrepare(true); $('#acLog').textContent = p.log.join('\n');
    S.opDesc = 'akustik otomatik/elle temizleme'; const c = addDerived(p.ch.name + '_temiz', p.y, p.ch, p.a, p.a === 0 && p.b === p.ch.n); await addDerivedToPlot(c, activeAxes());
  });
}
async function acCompare() {
  await busy('Spektrum karşılaştırılıyor…', async () => {
    const o = await acPrepare(false), c = await acPrepare(true); acDrawCompare(o, c); $('#acLog').textContent = c.log.join('\n');
  });
}
// Önce/sonra spektrumunu çizer; ölçüm özetini döndürür
function acDrawCompare(o, c) {
  { const P = S.specPlot; P.axes.slice().forEach(a => P.removeAxes(a));
    const sa = P.addAxes({title: 'Önce / sonra (PSD)', ylabel: 'PSD (dB re birim²/Hz)', xlabel: 'Frekans (Hz)'});
    for (const [p, nm, col] of [[o, 'Orijinal', '#8b929b'], [c, 'Temizlenmiş', '#0072BD']]) { const r = DSP.welch(p.y, p.fs, {nfft: 4096, overlap: .5, scale: 'psd', maxSeg: 3000}); sa.traces.push({kind: 'xy', x: r.f, y: r.y.map(v => 10 * Math.log10(v + 1e-300)), label: nm, color: col, width: 1, visible: true, raw: r.y}); }
    P.fitAll(); switchView('spec');
  }
  const W = o2 => DSP.welch(o2.y, o2.fs, {nfft: 4096, overlap: .5, scale: 'psd', maxSeg: 3000}), wo = W(o), wc = W(c), fs = o.fs, med = a => { const v = Array.from(a).sort((p, q) => p - q); return v[v.length >> 1]; };
  const lo = Math.max(wo.f.findIndex(f => f > fs * 0.02), 1), hi = wo.f.findIndex(f => f > fs * 0.45), idx = []; for (let i = lo; i < (hi < 0 ? wo.f.length : hi); i++) idx.push(i);
  const rms = a => { let s = 0, s2 = 0; for (const v of a) { s += v; s2 += v * v; } const m = s / a.length; return Math.sqrt(Math.max(0, s2 / a.length - m * m)); };
  const floorDb = 10 * Math.log10(med(idx.map(i => wc.y[i])) / med(idx.map(i => wo.y[i])));
  return {rmsO: rms(o.y), rmsC: rms(c.y), floorDb, wo, wc};
}
// Tek tık: tespit et + uygula + temiz kanalı ekle + önce/sonra spektrum + ölçülen etki
async function acAutoRun() {
  await acAuto(false);
  await busy('Temizleniyor…', async () => {
    const o = await acPrepare(false), c = await acPrepare(true), m = acDrawCompare(o, c), p = opts();
    const ch = c.ch, d = addDerived(ch.name + '_temiz', c.y, ch, c.a, c.a === 0 && c.b === ch.n); await addDerivedToPlot(d, activeAxes()); switchView('spec');
    const lines = [$('#acLog').textContent, '', 'UYGULANAN: ' + [p.dc !== 'none' ? 'DC' : '', p.hp ? 'HP ' + p.hp + ' Hz' : '', p.lp ? 'LP ' + p.lp + ' Hz' : '', p.notch ? 'Notch ' + p.notch + ' Hz×' + p.nh : '', p.click ? 'tık temizleme' : '', p.dn ? 'spektral azaltma ' + p.dnDb + ' dB' : ''].filter(Boolean).join(', '),
      ...c.log, 'ETKİ (ölçülen):', `  Toplam RMS: ${m.rmsO.toPrecision(4)} → ${m.rmsC.toPrecision(4)} (${(100 * (m.rmsC / m.rmsO - 1)).toFixed(1)} %)`, `  Gürültü tabanı (medyan PSD): ${m.floorDb.toFixed(1)} dB`];
    if (p.notch) { let mx = -Infinity; for (let i = 0; i < m.wo.f.length; i++) if (Math.abs(m.wo.f[i] - p.notch) < 1.5) mx = Math.max(mx, 10 * Math.log10(m.wc.y[i] / m.wo.y[i])); if (isFinite(mx)) lines.push(`  ${p.notch} Hz tepesi: ${mx.toFixed(1)} dB`); }
    if (Math.abs(m.floorDb) < 0.5 && !p.notch && !p.click) lines.push('  Belirgin bir etki yok: kayıtta giderilebilecek parazit bulunamadı (kırpılma varsa filtreyle düzeltilemez).');
    $('#acLog').textContent = lines.join('\n');
  });
}
async function acWav(clean) {
  await busy('WAV hazırlanıyor…', async () => {
    const p = await acPrepare(clean); let y = p.y, fs = p.fs; let dec = 1; while (fs / dec > 96000) dec++; if (dec > 1) { const o = new Float64Array(Math.floor(y.length / dec)); for (let i = 0; i < o.length; i++) o[i] = y[i * dec]; y = o; fs /= dec; }
    let pk = 0; for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > pk) pk = a; } const g = 0.95 / (pk || 1);
    const rate = Math.max(8000, Math.round(fs * Math.max(1, num('acSpeed') || 1))); await saveBlob(DSP.wavBlob(y.map(v => v * g), rate), sanitizeName(p.ch.name) + (clean ? '_temiz' : '') + '.wav');
  });
}

/* ---------- Çıktı ---------- */
function buildOutput() {
  const r = h('div');
  r.append(card('Görüntü (açık olan görünüm)', h('div', {class: 'note'}, 'Zaman, Spektrum ve Spektrogram görünümlerinin hepsi PNG veya SVG (vektör) olarak kaydedilir.'), fr('PNG ölçeği', selIn('pngScale', [[1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], 2)), chkIn('pngLight', 'Açık tema ile (baskı için)', true), h('div', {class: 'btns'}, btn('PNG kaydet', savePng, 'primary'), btn('SVG kaydet', saveSvg), btn('Panoya kopyala', copyPng))));
  r.append(buildMatCard()); r.append(buildReportCard()); r.append(methodCard()); r.append(historyCard()); setTimeout(repRefreshList);
  r.append(card('Veri (CSV / MAT)',
    h('div', {class: 'note'}, 'Grafikteki izlerin verisi aktarılır.'),
    fr('Aralık', selIn('exScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'all')),
    fr('Silinenler', selIn('exDel', [['remove', 'Noktayı çıkar'], ['nan', 'NaN yap (uzunluk korunur)']], 'remove')),
    fr('Seyreltme (her N)', numIn('exDec', 1, {min: 1, step: 1})),
    h('div', {class: 'btns'}, btn('CSV kaydet', () => exportData('csv')), btn('MAT (v5) kaydet', () => exportData('mat'), 'primary'))));
  r.append(card('Oturum', h('div', {class: 'note'}, 'Grafik düzeni (çift Y dahil), silinen noktalar, türetilmiş kanallar (veri + formül), test fazları, şartname profilleri, kontrol/cevap rolleri ve rapor öğeleri oturum.json dosyasına kaydedilir; aynı dosyalar açıkken geri yüklenir.'), h('div', {class: 'btns'}, btn('Oturumu kaydet', saveSession), btn('Oturumu yükle…', () => $('#sessIn').click()), h('input', {type: 'file', id: 'sessIn', accept: '.json', hidden: true, onchange: e => { if (e.target.files[0]) loadSession(e.target.files[0]); e.target.value = ''; }}))));
  return r;
}
// Çıktı alırken: grafikte titreşim izi varsa ve Grms lejantı kapalıysa sorar
function pngAsk(scale, light, then, svg) {
  const render = grms => { const old = S.plot.grms; if (grms) S.plot.grms = grms; try { return svg ? S.plot.toSVG(light) : S.plot.toPNG(scale, light); } finally { S.plot.grms = old; S.plot.invalidate(); } };
  const hasVib = S.plot.axes.some(ax => ax.traces.some(t => t.kind === 'ts' && t.ch.kind === 'vib'));
  if (!hasVib || S.plot.grms.mode !== 'off') return then(render(null));
  const body = h('div', null, h('div', {class: 'note'}, 'Grafikte titreşim verisi var. Lejanta Grms değeri eklensin mi?'),
    fr('Lejant', selIn('gqMode', [['all', 'Grms ekle (tüm kayıt)'], ['vis', 'Grms ekle (görünen aralık)'], ['off', 'Ekleme']], 'all')), chkIn('gqDc', 'DC (ortalama) çıkar', true));
  modal('Lejant', body, [{t: 'Devam', primary: true, fn: () => { then(render({mode: sv('gqMode'), dc: ck('gqDc')})); }}, {t: 'Vazgeç'}]);
}
const VIEWNAME = {time: 'zaman', spec: 'spektrum', sgram: 'spektrogram', xy: 'dagilim'};
function exportTarget() { return S.view === 'sgram' ? S.specView : S.view === 'spec' ? S.specPlot : S.view === 'xy' ? S.xyPlot : S.plot; }
function exportReady() { const T = exportTarget(); if (T === S.specView ? !T.spec : !T.axes.length) { toast('Bu görünümde kaydedilecek grafik yok'); return null; } return T; }
const expOpt = () => ({scale: $('#pngScale') ? +sv('pngScale') : 2, light: $('#pngLight') ? ck('pngLight') : true});
async function savePng() {
  const T = exportReady(); if (!T) return; const o = expOpt(), nm = 'MATView_' + VIEWNAME[S.view];
  if (T === S.plot) pngAsk(o.scale, o.light, c => c.toBlob(b => saveBlob(b, nm + '.png'))); else T.toPNG(o.scale, o.light).toBlob(b => saveBlob(b, nm + '.png'));
}
async function saveSvg() {
  const T = exportReady(); if (!T) return; const o = expOpt(), nm = 'MATView_' + VIEWNAME[S.view], out = x => saveBlob(new Blob([x], {type: 'image/svg+xml'}), nm + '.svg');
  if (T === S.plot) pngAsk(1, o.light, out, true); else out(T.toSVG(o.light));
}
async function copyPng() {
  const T = exportReady(); if (!T) return; const o = expOpt();
  const go = async c => { try { const b = await new Promise(r => c.toBlob(r)); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); toast('Panoya kopyalandı'); } catch (e) { toast('Panoya kopyalanamadı: ' + e.message); } };
  if (T === S.plot) pngAsk(2, o.light, go); else go(T.toPNG(2, o.light));
}
async function graphSpectrum(ax, tr) { S.plot.active = ax; if (tr) ax.active = ax.traces.indexOf(tr); setTab('analyze'); await computeSpectrum(tr); }
async function graphSpectrogram(ax, tr) { S.plot.active = ax; tr = tr || ax.traces.find(t => t.visible && t.ch) || ax.traces.find(t => t.ch); if (!tr) return toast('Bu grafikte zaman izi yok'); ax.active = ax.traces.indexOf(tr); setTab('analyze'); await computeSpectrogram(); }
function plotChannels() { const seen = new Set(), out = []; for (const ax of S.plot.axes) for (const t of ax.traces) if (t.visible && !seen.has(t.ch.uid)) { seen.add(t.ch.uid); out.push({ch: t.ch, ax}); } return out; }
async function exportData(kind) {
  const list = plotChannels(); if (!list.length) return toast('Grafikte iz yok');
  await busy('Dışa aktarılıyor…', async prog => {
    const dec = Math.max(1, num('exDec') | 0), nan = sv('exDel') === 'nan', cols = []; let k = 0;
    for (const {ch, ax} of list) {
      await ensureLoaded(ch); const [a, b] = sv('exScope') === 'vis' ? [Math.max(0, Math.floor(ch.timeIdx(ax.xlim[0]))), Math.min(ch.n, Math.ceil(ch.timeIdx(ax.xlim[1])) + 1)] : [0, ch.n];
      const idx = []; for (let i = a; i < b; i += dec) { if (ch.del && ch.del[i] && !nan) continue; idx.push(i); }
      const t = new Float64Array(idx.length), v = new Float64Array(idx.length);
      for (let j = 0; j < idx.length; j++) { t[j] = ch.t(idx[j]); v[j] = (ch.del && ch.del[idx[j]]) ? NaN : ch.data[idx[j]]; }
      cols.push({name: ch.name, t, v}); prog(++k / list.length);
    }
    if (kind === 'csv') {
      const rows = Math.max(...cols.map(c => c.v.length)); if (rows > 1048576) toast('Uyarı: ' + fmtCnt(rows) + ' satır, Excel sınırını (1.048.576) aşıyor.', 6000);
      const parts = [cols.map(c => `t[${c.name}],${c.name}`).join(',') + '\n']; const CH = 50000;
      for (let s = 0; s < rows; s += CH) { const lines = []; for (let i = s; i < Math.min(rows, s + CH); i++) lines.push(cols.map(c => i < c.v.length ? c.t[i] + ',' + c.v[i] : ',').join(',')); parts.push(lines.join('\n') + '\n'); }
      await saveBlob(new Blob(parts, {type: 'text/csv'}), 'veri.csv');
    } else {
      const vars = []; for (const c of cols) { const nm = sanitizeName(c.name); vars.push({name: nm, data: c.v}, {name: sanitizeName(nm + '_t').slice(0, 63), data: c.t}); }
      await saveBlob(matWrite(vars), 'veri.mat');
    }
  });
}
function matWrite(vars) {
  if (typeof methodText === 'function' && !vars.noLog && S.methodLog && S.methodLog.length && (!$('#mxLog') || ck('mxLog'))) vars = [...vars, {name: 'MATView_islem_gunlugu', chr: methodText().join('\n').replace(/[çÇğĞıİöÖşŞüÜ]/g, m => ({'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U'})[m]).replace(/[^\x20-\x7E\n]/g, '?')}];
  vars = vars.map(v => v.chr != null ? Object.assign({}, v, {data: Uint16Array.from(Array.from(v.chr, ch => ch.charCodeAt(0) & 0xFFFF)), rows: 1, cols: v.chr.length, cls: 4, dt: 4, bps: 2}) : v);
  const hdr = new Uint8Array(128); const txt = 'MATLAB 5.0 MAT-file, MATView ile olusturuldu'; for (let i = 0; i < 116; i++) hdr[i] = i < txt.length ? txt.charCodeAt(i) : 32; hdr[124] = 0x00; hdr[125] = 0x01; hdr[126] = 0x49; hdr[127] = 0x4D;
  const parts = [hdr];
  for (const v of vars) {
    const nm = v.name, nmPad = (nm.length + 7) & ~7, small = nm.length <= 4, nameBytes = small ? 8 : 8 + nmPad, dataBytes = v.data.length * (v.bps || (v.u8 ? 1 : 8)), pad = (8 - dataBytes % 8) % 8;
    const total = 16 + 16 + nameBytes + 8 + dataBytes + pad, head = new ArrayBuffer(8 + 16 + 16 + nameBytes + 8), dv = new DataView(head); let o = 0;
    dv.setUint32(o, 14, true); dv.setUint32(o + 4, total, true); o += 8;
    dv.setUint32(o, 6, true); dv.setUint32(o + 4, 8, true); dv.setUint32(o + 8, v.cls || (v.u8 ? 9 : 6), true); dv.setUint32(o + 12, 0, true); o += 16;
    dv.setUint32(o, 5, true); dv.setUint32(o + 4, 8, true); dv.setInt32(o + 8, v.rows || v.data.length, true); dv.setInt32(o + 12, v.cols || 1, true); o += 16;
    if (small) { dv.setUint32(o, (nm.length << 16) | 1, true); for (let i = 0; i < nm.length; i++) dv.setUint8(o + 4 + i, nm.charCodeAt(i)); o += 8; }
    else { dv.setUint32(o, 1, true); dv.setUint32(o + 4, nm.length, true); for (let i = 0; i < nm.length; i++) dv.setUint8(o + 8 + i, nm.charCodeAt(i)); o += 8 + nmPad; }
    dv.setUint32(o, v.dt || (v.u8 ? 2 : 9), true); dv.setUint32(o + 4, dataBytes, true);
    parts.push(new Uint8Array(head), new Uint8Array(v.data.buffer, v.data.byteOffset, dataBytes)); if (pad) parts.push(new Uint8Array(pad));
  }
  return new Blob(parts, {type: 'application/octet-stream'});
}
function rle(del) { const out = []; let s = -1; for (let i = 0; i < del.length; i++) { if (del[i]) { if (s < 0) s = i; } else if (s >= 0) { out.push([s, i]); s = -1; } } if (s >= 0) out.push([s, del.length]); return out; }
// Oturum (oturum.json, v2): grafik düzeni (çift Y dahil), silmeler, zaman ayarları, notlar + türetilmiş kanallar (veri ve formül/işlem
// açıklamasıyla), test fazları, şartname profilleri, kontrol/cevap rolleri, rapor öğeleri ve rapor bilgileri.
const b64enc = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64dec = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
function chByName(nm) { for (const f of allFiles()) for (const c of f.channels) if (c.name === nm) return c; return null; }
async function saveSession() {
  const o = {app: 'MATView', v: 2, notes: S.notes, linkX: S.plot.linkX, files: S.files.map(f => f.name),
    axes: S.plot.axes.map(ax => ({title: ax.title, ylabel: ax.ylabel, ylabel2: ax.ylabel2 || '', xlim: ax.xlim, ylim: ax.ylim, yAuto: ax.yAuto, ylim2: ax.ylim2, yAuto2: ax.yAuto2 !== false, ylog: ax.ylog, hw: ax.hw,
      traces: ax.traces.filter(t => t.ch).map(t => ({name: t.ch.name, color: t.color, width: t.width, visible: t.visible, yr: !!t.yr}))})),
    deletions: {}, timing: S.files.map(f => ({name: f.name, Tpkt: f.Tpkt, baseFs: f.baseFs}))};
  for (const f of allFiles()) for (const c of f.channels) if (c.delCount) o.deletions[c.name] = rle(c.del);
  // türetilmiş kanallar
  o.derived = [];
  for (const c of (S.derived ? S.derived.channels : [])) {
    if (!c.data) continue; const d = c.data instanceof Float64Array ? c.data : Float64Array.from(c.data), big = d.length > 4e6 && c.formula;
    const e = {name: c.name, kind: c.kind, unit: c.unit || '', desc: c.desc || '', formula: c.formula || '', src: c.srcName || '', n: d.length};
    if (c.g && c.srcName && chByName(c.srcName) && chByName(c.srcName).n === d.length) e.timing = 'src'; else e.timing = {t0: c.t(0), dt: d.length > 1 ? (c.t(d.length - 1) - c.t(0)) / (d.length - 1) : (c.dtS || 1)};
    if (!big) e.data = b64enc(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
    o.derived.push(e);
  }
  if (S.levels && S.levels.ch) { const L = S.levels; o.phases = {ch: L.ch.name, a: L.a, ref: L.ref, prof: L.prof ? L.prof.id || L.prof.name : null, segs: L.segs.map(s => ({level: s.level, t0: s.t0, t1: s.t1, i0: s.i0, i1: s.i1, grms: s.grms, db: s.db}))}; }
  o.profiles = S.profiles || [];
  o.roles = {ctl: (S.roles.ctl || []).map(chByUid).filter(Boolean).map(c => c.name), resp: (S.roles.resp || []).map(chByUid).filter(Boolean).map(c => c.name)};
  if (typeof REP !== 'undefined') { o.report = {items: REP.items, meta: REP.meta}; }
  await saveBlob(new Blob([JSON.stringify(o)], {type: 'application/json'}), 'oturum.json');
}
async function loadSession(file) {
  const o = JSON.parse(await file.text()); let miss = 0, nd = 0;
  await busy('Oturum yükleniyor…', async () => {
    for (const t of o.timing || []) { const f = S.files.find(x => x.name === t.name); if (f) { f.Tpkt = t.Tpkt; f.baseFs = t.baseFs; applyTiming(f); } }
    // türetilmiş kanallar (önce: grafik izleri bunlara başvurabilir)
    for (const e of o.derived || []) {
      if (chByName(e.name)) continue; let data = null; const src = e.src ? chByName(e.src) : null;
      if (e.data) { const u = b64dec(e.data); data = new Float64Array(u.buffer, 0, u.length / 8); }
      else if (e.formula && typeof evalFormula === 'function') { try { const r = await evalFormula(e.formula, {}); data = r && r.v ? Float64Array.from(r.v) : null; } catch (_) { data = null; } }
      if (!data) { miss++; continue; }
      if (src) await ensureLoaded(src);
      S.opDesc = e.desc || ''; const c = addDerived(e.name, data, e.timing === 'src' ? src : null, 0, e.timing === 'src' && !!src);
      if (e.timing !== 'src' || !src) { c.g = null; c.dtS = e.timing && e.timing.dt || 1; c.t0 = e.timing && e.timing.t0 || 0; }
      c.kind = e.kind || c.kind; c.unit = e.unit || ''; c.formula = e.formula || ''; c.srcName = e.src || ''; c.desc = e.desc || ''; nd++;
    }
    clearPlot(); S.plot.linkX = o.linkX !== false; if (o.notes) { S.notes = o.notes; if (typeof noteSave === 'function') noteSave(); S.plot.notes = S.notes; }
    for (const a of o.axes || []) {
      const ax = S.plot.addAxes({title: a.title, ylabel: a.ylabel, ylabel2: a.ylabel2 || '', ylim: a.ylim, yAuto: a.yAuto, ylim2: a.ylim2 || [0, 1], yAuto2: a.yAuto2 !== false, ylog: a.ylog, xlim: a.xlim}); if (a.hw) ax.hw = a.hw;
      for (const t of a.traces) { const c = chByName(t.name); if (!c) { miss++; continue; } await ensureLoaded(c); ax.traces.push({kind: 'ts', ch: c, label: c.name, color: t.color, width: t.width, visible: t.visible, yr: !!t.yr}); }
    }
    for (const nm in o.deletions || {}) { const c = chByName(nm); if (!c) { miss++; continue; } await ensureLoaded(c); const idx = []; for (const [s, e] of o.deletions[nm]) for (let i = s; i < e; i++) idx.push(i); c.applyDelete(Uint32Array.from(idx)); }
    if (Array.isArray(o.profiles) && o.profiles.length) { const have = new Set((S.profiles || []).map(p => p.id || p.name)); for (const p of o.profiles) if (!have.has(p.id || p.name)) S.profiles.push(p); if (typeof saveProfiles === 'function') saveProfiles(); if (typeof refreshUnvPanel === 'function') try { refreshUnvPanel(); } catch (_) {} }
    if (o.roles) { S.roles = {ctl: o.roles.ctl.map(chByName).filter(Boolean).map(c => c.uid), resp: o.roles.resp.map(chByName).filter(Boolean).map(c => c.uid)}; if (typeof roleRender === 'function') roleRender(); }
    if (o.phases) { const ch = chByName(o.phases.ch); if (ch) { await ensureLoaded(ch); const prof = o.phases.prof != null ? (S.profiles || []).find(p => (p.id || p.name) === o.phases.prof) || null : null; S.levels = {ch, a: o.phases.a, ref: o.phases.ref, prof, segs: o.phases.segs.map(s => Object.assign({}, s))}; if (typeof phBands === 'function') phBands(); if (typeof phaseTable === 'function') try { phaseTable(); } catch (_) {} } else miss++; }
    if (o.report && typeof REP !== 'undefined') { REP.items = o.report.items || []; if (o.report.meta) REP.meta = o.report.meta; if (typeof repRefreshList === 'function') repRefreshList(); }
    S.plot.active = S.plot.axes[0] || null; renderTree(); refreshAll(); refreshCleanInfo();
  });
  toast((miss ? `Oturum yüklendi, ${miss} öğe bulunamadı (ilgili dosyaları açın)` : 'Oturum yüklendi') + (nd ? ` · ${nd} türetilmiş kanal` : ''));
}

/* ---------- Ayarlar / yardım ---------- */
function timeDialog() {
  const body = h('div'); if (!S.files.length) body.append(h('div', {class: 'note'}, 'Önce bir dosya açın.'));
  const rows = [];
  for (const f of S.files.filter(x => !x.binary && !x.unv && !x.table)) {
    const ndev = Object.keys(f.gcache || {}).length, lost = Object.values(f.gcache || {}).reduce((a, g) => a + g.lost, 0), nocnt = f.channels.some(c => !(c.devKey && f.gcache[c.devKey]));
    const t = h('input', {type: 'number', step: 'any', value: f.Tpkt * 1000}), b = h('input', {type: 'number', step: 'any', value: f.baseFs}); rows.push({f, t, b});
    body.append(h('div', {class: 'card'}, h('h4', null, f.name), h('div', {class: 'note'}, `${ndev} cihazda cnt sayacı bulundu · toplam kayıp paket: ${lost}`),
      ndev ? fr('Paket süresi (ms)', t) : null, nocnt ? fr('Temel fs (Hz)', b) : null,
      nocnt ? h('div', {class: 'note'}, 'cnt sayacı olmayan kanallar için en uzun kanalın örnekleme frekansı; diğerleri uzunluk oranıyla ölçeklenir.') : null));
  }
  body.append(h('div', {class: 'note'}, 'Zaman = paket sırası × paket süresi. Kayıp paketler zaman eksenindeki boşluk olarak yansıtılır. Varsayılan paket süresi 10 ms.'));
  modal('Zaman ayarları', body, [{t: 'Uygula', primary: true, fn: () => { for (const {f, t, b} of rows) { f.Tpkt = Math.max(1e-6, parseFloat(t.value) / 1000 || f.Tpkt); f.baseFs = parseFloat(b.value) || f.baseFs; applyTiming(f); } S.plot.fitAll(true); refreshAll(); }}, {t: 'İptal'}]);
}
function helpBody() {
  const body = h('div', {style: 'line-height:1.7'}, h('b', null, 'Fare'), h('br'), 'Tekerlek: X yakınlaştır · Shift+tekerlek: Y · Ctrl+tekerlek: ikisi', h('br'), 'Eksen kenarında sürükle/tekerlek: yalnız o eksen · Çift tık: tümünü sığdır', h('br'), 'Soldan kanal sürükleyip grafiğe bırakın (alt grafiğin üstüne = üst üste, boşluğa = yeni alt grafik)', h('br'), h('br'),
    h('b', null, 'Klavye'), h('br'), h('kbd', null, 'P'), ' gez  ', h('kbd', null, 'Z'), ' yakınlaştır  ', h('kbd', null, 'C'), ' veri imleci  ', h('kbd', null, 'B'), ' kutu seç  ', h('kbd', null, 'L'), ' kement', h('br'), h('kbd', null, 'Delete'), ' seçileni sil  ', h('kbd', null, 'Ctrl+Z'), '/', h('kbd', null, 'Ctrl+Y'), ' geri al/yinele  ', h('kbd', null, 'Home'), ' sığdır  ', h('kbd', null, 'Esc'), ' seçimi kaldır', h('br'), h('br'),
    h('b', null, 'Binary'), h('br'), '"Binary aç…": çerçeve matrisini Excel (.xlsx) ile tanımlayın; her hücre 1 bayt, hücredeki ad kanal adıdır (aynı ad tekrar ederse AD_1, AD_2…). Senaryo sayfası: okuma sırası, senkron kelimesi, kare hızı, sayaç alanı. Alanlar sayfası: birleşik değer (u8/i8/u16/i16/u32/i32/f32/f64, BE/LE), bit aralığı ve x ile dönüşüm formülü. Çözülmüş alanlar sol listede dosya başlığındaki .mat düğmesiyle dışa aktarılır.', h('br'), h('br'),
    h('b', null, 'UNV ve profil'), h('br'), 'UNV (dataset 58, ASCII) dosyaları "Dosya aç…" ile açılır; kanal sayısı dosyadan okunur, kompleks kanallar Genlik/Faz/Re/Im gelir. Kanallar Spektrum görünümüne çizilir. "UNV / Profil" sekmesinde profil girilir (frekans–seviye çiftleri, ± tolerans), profille karşılaştırma tablosu alınır.', h('br'), h('br'),
    h('b', null, 'Veri'), h('br'), 'as = akustik · ts = titreşim · ss/hs = sıcaklık · bs = basınç · gs = gerinim. Zaman ekseni cnt paket sayacından üretilir (varsayılan 10 ms/paket; "Zaman ayarları"ndan değiştirilebilir).', h('br'), 'Silinen noktalar orijinal dosyayı değiştirmez; dışa aktarırken çıkarılır veya NaN yapılır.');
  return body;
}

/* ---------- başlatma ---------- */
function onHover1(p) { const P = S.plot, hx = p ? p.x : null; if ((P.crosshair || (P.axes.length > 1 && P.linkX)) && P.hoverX !== hx) { P.hoverX = hx; P.invalidate(); } else P.hoverX = hx; $('#hoverinfo').textContent = p ? `t = ${fmtNum(p.x, 7)} s    y = ${fmtNum(p.y, 6)}` : ''; }
function onPlotChange(kind) {
  if (kind === 'view') { syncLimits(); updateStats(); }
  else if (kind === 'active') { refreshAxesUI(); refreshTraceInfo(); updateStats(); }
  else if (kind === 'cursor') {
    renderCursorPanel(S.plot);
    const c = S.plot.cursors; if (c.length === 2) { const dx = c[1].x - c[0].x, dy = c[1].y - c[0].y; $('#st2').textContent = `ΔX = ${fmtNum(dx, 6)} s   ΔY = ${fmtNum(dy, 6)}   1/ΔX = ${fmtNum(1 / Math.abs(dx), 6)} Hz`; } else $('#st2').textContent = c.length ? `İmleç: t = ${fmtNum(c[0].x, 7)} s, y = ${fmtNum(c[0].y, 6)}` : '';
  }
}
function applyTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('matview-theme', t); } catch (e) {} S.plot && S.plot.invalidate(); S.specPlot && S.specPlot.invalidate(); S.specView && S.specView.invalidate(); }
function init() {
  let th = 'light'; try { th = localStorage.getItem('matview-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
  document.documentElement.dataset.theme = th;
  S.plot = new Plot($('#cv-time'), {onDraw: syncLimits, onChange: onPlotChange, onSelect, onHover: onHover1, xName: 't'}); S.plot.notes = S.notes;
  S.plot.selectionTargets = ax => ck('applyAll') ? ax.traces.filter(t => t.visible) : ax.traces.length ? [ax.traces[Math.min(ax.active || 0, ax.traces.length - 1)]] : [];
  S.specPlot = new Plot($('#cv-spec'), {xlabel: 'Frekans (Hz)', xName: 'f', emptyText: 'Spektrum için sağdaki "Analiz" sekmesinden "Spektrumu hesapla"ya basın',
    onHover: p => { $('#hoverinfo').textContent = p ? `f = ${fmtNum(p.x, 7)} Hz    y = ${fmtNum(p.y, 6)}` : ''; }});
  S.xyPlot = new Plot($('#cv-xy'), {xlabel: 'x', xName: 'x', emptyText: 'Sağdaki “Veri” sekmesinden X ve Y sütunlarını seçip “Çiz”e basın', onHover: p => { $('#hoverinfo').textContent = p ? `x = ${fmtNum(p.x, 7)}    y = ${fmtNum(p.y, 6)}` : ''; }}); S.xyPlot.grms = {mode: 'off', dc: true};
  S.specView = new SpecView($('#cv-sgram')); S.specView.onCursor = c => sgCursorInfo(c); S.specView.onHover = p => { $('#hoverinfo').textContent = `t = ${fmtNum(p.t, 6)} s   f = ${fmtNum(p.f, 6)} Hz` + (p.v != null ? `   ${p.v.toFixed(1)} dB` : ''); };
  buildToolbar(); buildRight(); renderChips(); renderTree(); refreshAll(); refreshCleanInfo(); setMode('pan');
  for (const b of $('#viewtabs').children) b.onclick = () => { switchView(b.dataset.v); };
  $('#btnBin').onclick = () => binDialog();
  $('#btnOpen').onclick = async () => {
    if (window.showOpenFilePicker) { try { const hs = await showOpenFilePicker({multiple: true, types: [{description: 'MATLAB dosyaları', accept: {'application/octet-stream': ['.mat', '.unv', '.uff', '.csv', '.tsv', '.txt', '.xlsx', '.wav', '.tdms', '.mf4', '.mdf']}}]}); const fl = []; for (const x of hs) fl.push(await x.getFile()); return openFiles(fl); } catch (e) { if (e.name === 'AbortError') return; } }
    $('#fileIn').click();
  };
  $('#fileIn').onchange = e => { openFiles(e.target.files); e.target.value = ''; };
  $('#btnTime').onclick = timeDialog; $('#btnHelp').onclick = helpDialog; $('#btnFree').onclick = freeMemory;
  $('#btnTheme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#q').oninput = e => { S.q = e.target.value.trim().toLowerCase(); clearTimeout(S._qT); S._qT = setTimeout(renderTree, S.rowOrder && S.rowOrder.length > 3000 ? 120 : 0); };
  try { S.fav = new Set(JSON.parse(localStorage.getItem('mv.fav') || '[]')); } catch (_) { S.fav = new Set(); }
  { const fb = h('button', {id: 'btnFavOnly', class: 'noic', title: 'Yalnız sık kullanılan (★) kanalları göster', 'aria-pressed': 'false', onclick: () => { S.favOnly = !S.favOnly; fb.classList.toggle('on', S.favOnly); fb.setAttribute('aria-pressed', S.favOnly); renderTree(); }}, '★');
    const hb = h('button', {class: 'noic qhelp', title: 'Arama sözdizimi:\n  metin — ad içinde geçen\n  /^acc_.*x$/i — düzenli ifade\n  [g]  [°C]  [m/s²] — birim süzgeci\n  fs>1000  fs<=500  fs=2k — örnekleme frekansı\n  ★ veya fav — yalnız sık kullanılanlar\nHepsi birleştirilebilir: /^T/ [°C] fs>=10\nKanal satırında ☆ ya da * tuşu: sık kullanılan', 'aria-label': 'Arama sözdizimi'}, '?');
    $('#q').parentElement.append(fb, hb); $('#q').placeholder = 'Ara: ad, /regex/, [g], fs>1000, ★'; }
  $('#btnStack').onclick = () => { const l = chsFromSel(); if (l.length) addToNewAxes(l); else toast('Önce soldan kanal seçin'); };
  $('#btnOverlay').onclick = () => { const l = chsFromSel(); if (l.length) addToAxes(activeAxes(), l); else toast('Önce soldan kanal seçin'); };
  // sürükle-bırak
  const stage = $('#stage'); let dragDepth = 0;
  window.addEventListener('dragenter', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { dragDepth++; $('#dropmsg').classList.remove('hidden'); } });
  window.addEventListener('dragleave', e => { if ([...(e.dataTransfer.types || [])].includes('Files') && --dragDepth <= 0) { dragDepth = 0; $('#dropmsg').classList.add('hidden'); } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; $('#dropmsg').classList.add('hidden');
    const ids = e.dataTransfer.getData('text/matview');
    if (ids) { const chs = JSON.parse(ids).map(chByUid).filter(Boolean); const r = $('#cv-time').getBoundingClientRect(); const inside = S.view === 'time' && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; if (!inside) return; const hh = S.plot.hit(e); if (hh) addToAxes(hh.ax, chs); else addToNewAxes(chs); return; }
    const wn = e.dataTransfer.getData('text/matview-wsp'); if (wn) { if (!(e.target.closest && e.target.closest('#lp-folder'))) wspDropName(wn, e); return; }
    if (typeof wspDropItems === 'function' && wspDropItems(e.dataTransfer)) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
  });
  // F11: tam ekran (MATView.exe yerel penceresinde pencere stili değişir, tarayıcıda Fullscreen API)
  window.addEventListener('keydown', e => {
    if (e.key !== 'F11') return; e.preventDefault();
    if (typeof window.mvFullscreen === 'function') { S.fullscreen = !S.fullscreen; window.mvFullscreen(S.fullscreen).then(v => { S.fullscreen = !!v; }).catch(() => {}); }
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {});
  }, true);
  window.addEventListener('keydown', e => {
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !(t.type === 'range')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); redo(); }
    else if (k === 'delete' || k === 'backspace') { if (selCount()) { e.preventDefault(); deleteSelection(); } }
    else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); viewHist(e.key === 'ArrowLeft' ? -1 : 1); }
    else if (k === 'x' && !e.ctrlKey && !e.metaKey && !e.altKey) toggleCrosshair();
    else if (k === 'escape') { S.plot.clearSelection(); if (S.plot.cursors.length) { S.plot.cursors = []; S.plot.invalidate(); onPlotChange('cursor'); } } else if (k === 'home') curPlot().fitAll(); else if (k === '-' || k === '_') curPlot().zoomOut(); else if (k === '+' || k === '=') curPlot().zoomIn(); else if (k === 'p') setMode('pan'); else if (k === 'z') setMode('zoom'); else if (k === 'c') setMode('cursor'); else if (k === 'b') { setMode('box'); setTab('clean'); } else if (k === 'l') { setMode('lasso'); setTab('clean'); }
  });
  S.specPlot.grms = S.plot.grms; S.plot.onChangeOrig = S.plot.onChange;
  // olay güdümlü arayüz yenileme (eskiden 1,5 sn'de bir): veri/grafik değişince ve kullanıcı etkileşiminden sonra bir kez
  ['pointerup', 'keyup', 'change'].forEach(ev => window.addEventListener(ev, uiChanged, true)); uiChanged();
  initUX(); syncFeatUI(); startupFiles();
}
async function startupFiles() {
  try {
    const r = await fetch('/api/args'); if (!r.ok) return; const list = await r.json(); S.server = true;
    setInterval(() => fetch('/api/ping').catch(() => {}), 3000);
    window.addEventListener('pagehide', () => { try { navigator.sendBeacon('/api/bye'); } catch (e) {} });
    const files = []; for (let i = 0; i < list.length; i++) { const b = await (await fetch('/api/file/' + i)).blob(); files.push(new File([b], list[i])); }
    if (files.length) openFiles(files);
  } catch (e) { /* sunucu yok: tek dosyalık HTML */ }
}
window.addEventListener('DOMContentLoaded', init);
