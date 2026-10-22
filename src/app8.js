/* ===== Ek analizler: oktav bant (dBA/dBC), SRS, FRF (H1/H2 + koherans) ===== */
function extraAnalysisCards() {
  return [
    card('Oktav / 1/3 oktav bant analizi',
      fr('Bant', selIn('ocFrac', [[3, '1/3 oktav'], [1, '1/1 oktav']], 3)),
      fr('Ağırlık', selIn('ocW', [['Z', 'Doğrusal (Z)'], ['A', 'A ağırlıklı (dBA)'], ['C', 'C ağırlıklı (dBC)']], 'Z')),
      fr('Referans', selIn('ocRef', [['2e-5', '20 µPa (ses basıncı, Pa)'], ['1', '1 birim']], '2e-5')),
      fr('f min / f max (Hz)', numIn('ocF1', 20), numIn('ocF2', 10000)),
      fr('Kapsam', selIn('ocScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
      h('div', {class: 'btns'}, btn('Bant seviyelerini hesapla', computeOctave, 'primary')),
      h('div', {id: 'ocInfo', class: 'note'}, 'Kanal birimi Pa ise 20 µPa seçin; sonuç dB (re referans) olarak çizilir. Genel seviye (OASPL) bilgi satırında verilir.')),
    card('SRS (şok yanıt spektrumu)',
      fr('f min / f max (Hz)', numIn('srF1', 10), numIn('srF2', 2000)),
      fr('Nokta / oktav', numIn('srPpo', 12, {min: 1, max: 48, step: 1})), fr('Q', numIn('srQ', 10, {min: 0.6})),
      fr('Gösterim', selIn('srShow', [['mm', 'Maksimaks'], ['pn', 'Pozitif ve negatif']], 'mm')),
      fr('Kapsam', selIn('srScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
      h('div', {class: 'btns'}, btn('SRS hesapla', computeSRS, 'primary')),
      h('div', {id: 'srInfo', class: 'note'}, 'Smallwood rampa-değişmez süzgeci, mutlak ivme yanıtı (SDOF). f max örnekleme hızının 1/6’sını aşarsa kırpılır; artık (kalıcı) yanıt dahildir.')),
    card('Harmonik / yan-band imleçleri',
      fr('Temel f0 (Hz)', numIn('hmF0', 100)), fr('Harmonik sayısı', numIn('hmN', 10, {min: 1, max: 100, step: 1})),
      fr('Yan-band aralığı (Hz)', numIn('hmFm', 0, {min: 0})), fr('Yan-band sayısı', numIn('hmNs', 2, {min: 1, max: 10, step: 1})),
      h('div', {class: 'btns'}, btn('Çiz', applyHarm, 'primary'), btn('En yüksek tepeden f0 al', pickHarm), btn('Kaldır', () => { S.specPlot.harm = null; S.specPlot.invalidate(); })),
      h('div', {class: 'note'}, 'Spektrum görünümüne k×f0 çizgileri (ve ± m×aralık yan-bantları) çizer; PNG/SVG çıktısına da girer. Yan-band aralığı için ör. devir/dişli frekansı girilir.')),
    card('FRF (iki kanallı, H1/H2 + koherans)',
      fr('Giriş (referans)', h('select', {id: 'frIn'})), fr('Çıkış (yanıt)', h('select', {id: 'frOut'})),
      fr('NFFT', selIn('frN', [256, 512, 1024, 2048, 4096, 8192, 16384].map(v => [v, v]), 2048)),
      fr('Pencere', selIn('frWin', [['hann', 'Hann'], ['hamming', 'Hamming'], ['blackman', 'Blackman'], ['flattop', 'Flat-top']], 'hann')),
      fr('Örtüşme', selIn('frOv', [['0.5', '%50'], ['0.75', '%75']], '0.5')),
      fr('Tahminci', selIn('frH', [['h1', 'H1 (çıkış gürültüsüne karşı)'], ['h2', 'H2 (giriş gürültüsüne karşı)'], ['both', 'H1 ve H2']], 'h1')),
      fr('Kapsam', selIn('frScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
      h('div', {class: 'btns'}, btn('FRF hesapla', computeFRF, 'primary')),
      h('div', {id: 'frInfo', class: 'note'}, 'Aktif alt grafikteki izlerden giriş ve çıkış seçilir; iki kanalın örnekleme hızı aynı olmalıdır. Genlik, faz ve koherans üç ayrı grafikte gelir.'))];
}
let _frfKey = '';
function refreshFrfPick() {
  const a = $('#frIn'), b = $('#frOut'); if (!a || !b) return; const ax = activeAxes(); const tr = ax ? ax.traces.filter(t => t.ch) : [];
  const key = tr.map(t => t.label).join('|'); if (key === _frfKey) return; _frfKey = key; const va = a.value, vb = b.value;
  for (const [el, v, d] of [[a, va, 0], [b, vb, 1]]) { el.replaceChildren(...tr.map((t, i) => h('option', {value: i}, t.label))); el.value = v !== '' && +v < tr.length ? v : String(Math.min(d, tr.length - 1)); }
}
function specAxesReset(o) { const P = S.specPlot; P.axes.slice().forEach(a => P.removeAxes(a)); return P; }
async function computeOctave() {
  const ax = activeAxes(); if (!ax || !ax.traces.length) return toast('Önce Zaman grafiğine bir iz ekleyin');
  await busy('Bant seviyeleri hesaplanıyor…', async prog => {
    const frac = +sv('ocFrac'), W = sv('ocW'), ref = +sv('ocRef'), P = specAxesReset(), sa = P.addAxes({xlog: true, ylog: false, title: ax.title || ''}); let k = 0; const info = [];
    sa.ylabel = `Seviye (dB${W !== 'Z' ? W : ''} re ${ref === 2e-5 ? '20 µPa' : ref})`; sa.xlabel = (frac === 3 ? '1/3 oktav' : 'Oktav') + ' merkez frekansı (Hz)';
    const list = ax.traces.filter(t => t.ch && t.visible);
    for (const tr of list) {
      await ensureLoaded(tr.ch); const [a, b] = specRange(tr, ax, sv('ocScope')); if (b - a < 256) { toast('Aralık çok kısa: ' + tr.label); continue; }
      const seg = DSP.segment(tr.ch.data, tr.ch.del, a, b), r = DSP.octaveBands(seg, tr.ch.fs, {frac, fmin: num('ocF1'), fmax: num('ocF2'), ref, weight: W});
      sa.traces.push({kind: 'xy', x: r.fc, y: r.L, label: tr.label, color: tr.color, width: 1.6, visible: true, raw: r.L, scale: 'db', df: r.df, srcKind: tr.ch.kind});
      info.push(`${tr.label}: genel ${fmtNum(r.overall, 4)} dB${W !== 'Z' ? W : ''} · ${r.fc.length} bant · Δf=${fmtNum(r.df, 3)} Hz`); prog(++k / list.length);
    }
    $('#ocInfo').textContent = info.join('\n'); $('#ocInfo').style.whiteSpace = 'pre-line';
    if (!sa.traces.length) { P.removeAxes(sa); return; } P.fitAll(); switchView('spec');
  });
}
async function computeSRS() {
  const ax = activeAxes(); if (!ax || !ax.traces.length) return toast('Önce Zaman grafiğine bir iz ekleyin');
  await busy('SRS hesaplanıyor…', async prog => {
    const Q = num('srQ'), P = specAxesReset(), sa = P.addAxes({xlog: true, ylog: true, title: ax.title || ''}); let k = 0; const info = [];
    const list = ax.traces.filter(t => t.ch && t.visible);
    for (const tr of list) {
      await ensureLoaded(tr.ch); const ch = tr.ch, [a, b] = specRange(tr, ax, sv('srScope')); if (b - a < 16) continue;
      const fmax = Math.min(num('srF2'), ch.fs / 6), freqs = DSP.srsFreqs(Math.max(0.1, num('srF1')), fmax, Math.max(1, num('srPpo')));
      if (freqs.length < 2) { toast('Frekans aralığı geçersiz (f max ≤ fs/6 = ' + fmtNum(ch.fs / 6, 4) + ' Hz)'); continue; }
      const seg = DSP.segment(ch.data, ch.del, a, b), r = DSP.srs(seg, ch.fs, freqs, Q), u = ch.unit || (ch.kind === 'vib' ? 'g' : 'birim');
      const mk = (y, lab, col) => ({kind: 'xy', x: r.f, y, label: lab, color: col, width: 1.5, visible: true, raw: y, scale: 'srs', srcKind: ch.kind});
      if (sv('srShow') === 'mm') sa.traces.push(mk(r.maximax, tr.label, tr.color)); else { sa.traces.push(mk(r.pos, tr.label + ' (+)', tr.color)); const t2 = mk(r.neg, tr.label + ' (−)', tr.color); t2.dash = [5, 3]; sa.traces.push(t2); }
      let pk = 0, pf = 0; for (let i = 0; i < r.f.length; i++) if (r.maximax[i] > pk) { pk = r.maximax[i]; pf = r.f[i]; }
      sa.ylabel = `Yanıt ivmesi (${u}), Q=${Q}`; info.push(`${tr.label}: tepe ${fmtNum(pk, 4)} ${u} @ ${fmtNum(pf, 4)} Hz`); prog(++k / list.length);
    }
    sa.xlabel = 'Doğal frekans (Hz)'; $('#srInfo').textContent = info.join('\n'); $('#srInfo').style.whiteSpace = 'pre-line';
    if (!sa.traces.length) { P.removeAxes(sa); return; } P.fitAll(); switchView('spec');
  });
}
async function computeFRF() {
  const ax = activeAxes(); if (!ax) return toast('Önce Zaman grafiğine iki iz ekleyin'); refreshFrfPick();
  const tr = ax.traces.filter(t => t.ch), ti = tr[+sv('frIn')], to = tr[+sv('frOut')]; if (!ti || !to || ti === to) return toast('Farklı bir giriş ve çıkış izi seçin');
  await busy('FRF hesaplanıyor…', async () => {
    await ensureLoaded(ti.ch); await ensureLoaded(to.ch); if (Math.abs(ti.ch.fs - to.ch.fs) > 1e-6 * ti.ch.fs) throw new Error('Örnekleme hızları farklı: ' + fmtNum(ti.ch.fs, 6) + ' ve ' + fmtNum(to.ch.fs, 6) + ' Hz');
    const [a, b] = specRange(ti, ax, sv('frScope')), [a2, b2] = specRange(to, ax, sv('frScope')), n = Math.min(b - a, b2 - a2); if (n < 256) throw new Error('Aralık çok kısa');
    // silinen noktalar her iki kanalda da çıkarılır (aynı indisler)
    const xs = DSP.segment(ti.ch.data, ti.ch.del, a, a + n), ys = DSP.segment(to.ch.data, to.ch.del, a2, a2 + n), m = Math.min(xs.length, ys.length);
    const r = DSP.frf(xs.subarray(0, m), ys.subarray(0, m), ti.ch.fs, {nfft: +sv('frN'), win: sv('frWin'), overlap: +sv('frOv')});
    const P = specAxesReset(), mode = sv('frH'), lab = `${to.label} / ${ti.label}`;
    const aM = P.addAxes({xlog: true, ylog: true, title: 'FRF genliği'}), aP = P.addAxes({xlog: true, ylog: false, title: 'Faz'}), aC = P.addAxes({xlog: true, ylog: false, title: 'Koherans'});
    aM.hw = 2; aM.ylabel = 'Genlik |H|'; aP.ylabel = 'Faz (°)'; aC.ylabel = 'γ²'; aC.xlabel = 'Frekans (Hz)';
    const mk = (y, label, color) => ({kind: 'xy', x: r.f, y, label, color, width: 1.2, visible: true, raw: y, scale: 'frf', srcKind: 'frf'});
    if (mode !== 'h2') aM.traces.push(mk(r.h1, 'H1 ' + lab, '#2b6cb0')); if (mode !== 'h1') aM.traces.push(mk(r.h2, 'H2 ' + lab, '#c05621'));
    aP.traces.push(mk(r.phase, 'Faz ' + lab, '#2b6cb0')); aC.traces.push(mk(r.coh, 'Koherans', '#2f855a'));
    P.fitAll(); aC.yAuto = false; aC.ylim = [0, 1.05]; for (const q of [aM, aP, aC]) if (q.xlim[0] <= 0) q.xlim[0] = r.f[1]; P.invalidate();
    $('#frInfo').textContent = `Δf=${fmtNum(r.df, 4)} Hz · ${r.nseg} bölüt` + (r.nseg < 8 ? ' · UYARI: bölüt sayısı az, koherans güvenilmez (düşük NFFT veya daha uzun kayıt deneyin)' : ''); switchView('spec');
  });
}

function applyHarm() { const P = S.specPlot, f0 = num('hmF0'); if (!(f0 > 0)) return toast('f0 > 0 olmalı'); P.harm = {f0, n: Math.max(1, num('hmN') | 0), fm: Math.max(0, num('hmFm') || 0), nsb: Math.max(1, num('hmNs') | 0)}; P.invalidate(); switchView('spec'); }
function pickHarm() {
  const P = S.specPlot, ax = P.axes[0], t = ax && ax.traces.find(x => x.visible && x.x); if (!t) return toast('Önce bir spektrum hesaplayın');
  let m = -1, v = -Infinity; for (let i = 1; i < t.x.length; i++) { if (t.x[i] < ax.xlim[0] || t.x[i] > ax.xlim[1]) continue; if (t.y[i] > v) { v = t.y[i]; m = i; } }
  if (m < 0) return; $('#hmF0').value = (+t.x[m].toPrecision(6)); applyHarm();
}
