/* ===== Formül sekmesi: hızlı hesaplar, iki kanal işlemleri, skaler istatistik, serbest formül ===== */
const QOPS = [
  ['Türev / integral', [
    ['int', 'İntegral  ∫x dt', 'integral(A)', [], 'int'], ['int2', 'İkinci integral  ∬x dt²', 'integral2(A)', [], 'int'],
    ['der', 'Türev  dx/dt', 'deriv(A)', [], 'der'], ['der2', 'İkinci türev  d²x/dt²', 'deriv2(A)', [], 'der'], ['cs', 'Kümülatif toplam', 'cumsum(A)', [], 'none']]],
  ['Kayan pencere', [
    ['mrms', 'Kayan RMS', 'movrms(A,{w1})', [{win: 1, label: 'Pencere (s)', def: 0.1}]], ['mmean', 'Kayan ortalama', 'movmean(A,{w1})', [{win: 1, label: 'Pencere (s)', def: 0.1}]],
    ['mstd', 'Kayan standart sapma', 'movstd(A,{w1})', [{win: 1, label: 'Pencere (s)', def: 0.1}]], ['mmax', 'Kayan maksimum (üst zarf)', 'movmax(A,{w1})', [{win: 1, label: 'Pencere (s)', def: 0.1}]],
    ['mmin', 'Kayan minimum (alt zarf)', 'movmin(A,{w1})', [{win: 1, label: 'Pencere (s)', def: 0.1}]], ['mmed', 'Kayan medyan', 'movmedian(A,{w1})', [{win: 1, label: 'Pencere (s)', def: 0.05}]]]],
  ['Ölçekleme / dönüşüm', [
    ['abs', 'Mutlak değer', 'abs(A)', []], ['sq', 'Kare', 'A^2', [], 'none'], ['sqrt', 'Karekök', 'sqrt(A)', [], 'none'], ['db', 'Desibel (20·log10|x|)', 'db(A)', [], 'none'],
    ['z', 'Standartlaştır (z-skoru)', 'zscore(A)', [], 'none'], ['nrm', '0–1 aralığına normalize', 'normalize(A)', [], 'none'], ['mul', 'Çarpan uygula (×k)', '(A)*{p1}', [{label: 'k', def: 1}]], ['off', 'Ofset ekle (+c)', '(A)+{p1}', [{label: 'c', def: 0}]],
    ['clip', 'Kırp (alt, üst)', 'clip(A,{p1},{p2})', [{label: 'Alt', def: -1}, {label: 'Üst', def: 1}]], ['neg', 'İşaret değiştir', '-A', []]]],
  ['Eğilim', [
    ['dc', 'DC (ortalama) çıkar', 'demean(A)', []], ['lin', 'Doğrusal eğilim çıkar', 'detrend(A)', []], ['poly', 'Polinom eğilim çıkar', 'detrend(A,{p1})', [{label: 'Derece', def: 2}]], ['trend', 'Polinom eğilim eğrisi', 'trend(A,{p1})', [{label: 'Derece', def: 2}]]]],
  ['Süzgeç', [
    ['lp', 'Alçak geçiren', 'lp(A,{p1})', [{label: 'Fc (Hz)', def: 100}]], ['hp', 'Yüksek geçiren', 'hp(A,{p1})', [{label: 'Fc (Hz)', def: 10}]],
    ['bp', 'Band geçiren', 'bp(A,{p1},{p2})', [{label: 'F1 (Hz)', def: 10}, {label: 'F2 (Hz)', def: 200}]], ['nt', 'Çentik (notch)', 'notch(A,{p1},{p2})', [{label: 'F0 (Hz)', def: 50}, {label: 'Q', def: 30}]]]],
  ['Diğer', [
    ['env', 'Zarf (Hilbert)', 'env(A)', []], ['dec', 'Seyrelt (blok ortalaması)', 'decimate(A,{p1})', [{label: 'N', def: 4}], 'fs'], ['sh', 'Örnek kaydır', 'shift(A,{p1})', [{label: 'Örnek', def: 10}]], ['unw', 'Faz aç (unwrap)', 'unwrap(A)', []]]]
];
const QSCAL = [['rms', 'RMS'], ['mean', 'Ortalama'], ['std', 'Standart sapma'], ['var', 'Varyans'], ['max', 'Maksimum'], ['min', 'Minimum'], ['p2p', 'Tepe-tepe'], ['median', 'Medyan'], ['crest', 'Tepe faktörü (tepe/RMS)'],
  ['kurt', 'Basıklık (kurtosis)'], ['skew', 'Çarpıklık'], ['meanabs', 'Mutlak ortalama'], ['energy', 'Enerji (Σx²)'], ['percentile', 'Yüzdelik (p)']];
const QPAIR = [['A+B', 'Toplam  A + B'], ['A-B', 'Fark  A − B'], ['A*B', 'Çarpım  A · B'], ['A/B', 'Oran  A / B'], ['sqrt(A^2+B^2)', 'Bileşke  √(A²+B²)'], ['atan2(A,B)', 'Açı  atan2(A,B)'], ['corr(A,B)', 'Korelasyon (skaler)'], ['cov(A,B)', 'Kovaryans (skaler)']];
const opMap = () => { const m = {}; for (const [, l] of QOPS) for (const o of l) m[o[0]] = o; return m; };
function buildExpr() {
  const r = h('div'), OM = opMap();
  const og = QOPS.map(([g, l]) => h('optgroup', {label: g}, l.map(o => h('option', {value: o[0]}, o[1]))));
  const p = i => h('span', {class: 'qp hidden', id: 'qpw' + i}, h('label', {id: 'qpl' + i}, ''), h('input', {type: 'number', id: 'qp' + i, step: 'any'}));
  r.append(card('Hızlı hesap (aktif iz)',
    h('div', {id: 'qSrc', class: 'note'}, 'Önce grafikten bir iz seçin.'),
    fr('Hesap', h('select', {id: 'qOp', onchange: syncQop}, og)),
    h('div', {class: 'fr'}, p(1), p(2)),
    fr('Sonuç', selIn('qDest', [['new', 'Yeni alt grafik'], ['act', 'Aktif alt grafik']], 'new')),
    h('div', {class: 'btns'}, btn('Hesapla ve ekle', runQuick, 'primary'), btn('Formüle yaz', () => { const f = quickFormula(); if (f) { $('#exprIn').value = f.src; $('#exprIn').dataset.pre = 'A'; toast('Formül alanına yazıldı (A = aktif iz)'); } })),
    h('div', {id: 'qMsg', class: 'note'})));
  r.append(card('İki kanal işlemi',
    h('div', {class: 'note'}, 'A = aktif iz. B = grafikteki başka bir iz.'),
    fr('B kanalı', h('select', {id: 'pB'})), fr('İşlem', selIn('pOp', QPAIR, 'A+B')),
    h('div', {class: 'btns'}, btn('Hesapla', runPair, 'primary')), h('div', {id: 'pMsg', class: 'note'})));
  r.append(card('Skaler hesap (tek sayı)',
    h('div', {class: 'note'}, 'Aktif alt grafikteki görünür izlerin tamamı için hesaplanır.'),
    fr('Ölçü', selIn('sOp', QSCAL, 'rms')), fr('p (yüzdelik)', numIn('sP', 95)), h('div', {class: 'btns'}, btn('Hesapla', runScal, 'primary')), h('pre', {id: 'sOut', class: 'note', style: 'white-space:pre-wrap;margin:6px 0 0'})));
  r.append(card('Formül',
    h('textarea', {id: 'exprIn', rows: 3, style: 'width:100%;font-family:ui-monospace,Consolas,monospace', placeholder: 'ör.  sqrt(ivme1_X^2 + ivme1_Y^2 + ivme1_Z^2)'}),
    fr('Sonuç adı', h('input', {type: 'text', id: 'exprName', value: 'formul1'})),
    fr('Kanal ekle', h('select', {id: 'exprPick'}), btn('Ekle', exprInsertPick)),
    h('div', {class: 'btns'}, btn('Hesapla ve grafiğe ekle', runExpr, 'primary'), btn('Seçili kanal adlarını ekle', () => { const t = $('#exprIn'); t.value += chsFromSel().map(c => exprRef(c, t)).join(' + '); })),
    h('div', {id: 'exprMsg', class: 'note'})));
  r.append(card('Söz dizimi',
    h('div', {class: 'note', style: 'white-space:pre-line'}, 'Kanallar: tam kanal adı, benzersiz son ek (ör. ivme1_X) ya da köşeli parantez içinde tam ad (ör. [PSU/voltage]) — / boşluk . - içeren adlar köşeli parantezle yazılır; "Kanal ekle" bunu kendisi yapar. İşleçler: + − * / ^ ve parantez.\nSkaler fonksiyon: abs sqrt sin cos tan exp log log10 db sign round floor ceil atan2(a,b) pow(a,b) max(a,b) min(a,b)\nİntegral/türev: integral(x) integral2(x) cumtrapz(x) deriv(x) deriv2(x) diff(x) cumsum(x)\nKayan: movmean movmedian movrms movstd movmax movmin movsum (x,w)\nÖlçekleme: zscore normalize rescale(x,a,b) clip(x,lo,hi) shift(x,n) unwrap demean detrend(x[,derece]) trend(x,derece) decimate(x,n)\nSüzgeç: lp(x,fc) hp(x,fc) bp(x,f1,f2) notch(x,f0,Q) · zarf: env(x)\nSkaler döner: mean std var rms max min median sum p2p crest kurt skew meanabs energy count percentile(x,p) corr(a,b) cov(a,b)\nFarklı uzunluktaki kanallar ilk operanda göre yeniden örneklenir.')));
  setTimeout(() => { syncQop(); refreshCalcUI(); }, 0);
  return r;
}
function syncQop() {
  const o = opMap()[sv('qOp')]; if (!o) return; const ps = o[3] || [];
  for (let i = 1; i <= 2; i++) { const w = $('#qpw' + i), p = ps[i - 1]; w.classList.toggle('hidden', !p); if (p) { $('#qpl' + i).textContent = p.label; if ($('#qp' + i).dataset.op !== o[0]) { $('#qp' + i).value = p.def; $('#qp' + i).dataset.op = o[0]; } } }
}
function refreshCalcUI() {
  const tr = typeof activeTrace === 'function' && S.plot ? activeTrace() : null, q = $('#qSrc'); if (q) q.textContent = tr && tr.ch ? 'Kaynak: ' + tr.ch.name + (tr.ch.unit ? ' [' + tr.ch.unit + ']' : '') + ' · fs ' + fmtNum(tr.ch.fs, 5) + ' Hz' : 'Önce grafikten bir zaman izi seçin.';
  const pick = $('#exprPick'); if (pick) { const keep = pick.value; pick.replaceChildren(h('option', {value: ''}, '— seç —')); const seen = new Set(), g1 = h('optgroup', {label: 'Grafikteki kanallar'}), g2 = h('optgroup', {label: 'Açık dosyalardaki kanallar'});
    const opt = c => h('option', {value: c.uid, title: c.name + (c.file && c.file.name ? ' · ' + c.file.name : '')}, c.name + (c.file && c.file.name && !c.file.derived ? '  ·  ' + c.file.name : ''));
    for (const ax of S.plot.axes) for (const t of ax.traces) if (t.ch && !seen.has(t.ch.uid)) { seen.add(t.ch.uid); g1.append(opt(t.ch)); }
    let n = 0; for (const f of allFiles()) for (const c of f.channels) { if (seen.has(c.uid) || n >= 800) continue; seen.add(c.uid); g2.append(opt(c)); n++; }
    if (g1.children.length) pick.append(g1); if (g2.children.length) pick.append(g2); pick.value = keep; }
  const pb = $('#pB'); if (pb) { const keep = pb.value; pb.replaceChildren(); const seen = new Set(); for (const ax of S.plot.axes) for (const t of ax.traces) if (t.ch && t.ch !== (tr && tr.ch) && !seen.has(t.ch.uid)) { seen.add(t.ch.uid); pb.append(h('option', {value: t.ch.uid}, t.ch.name)); } if ([...pb.options].some(o => o.value === keep)) pb.value = keep; }
}
// ---- çekirdek: formülü değerlendir (önceden bağlanmış değişkenlerle: A, B …) ----
// formüle kanal başvurusu: düz ad tanımlayıcı olabiliyorsa olduğu gibi, değilse [ad] (ör. [PSU/voltage]); seçilen kanal hatırlanır
function exprRef(c, ta) {
  const r = /^[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*$/.test(c.name) ? c.name : '[' + c.name + ']';
  if (ta) { let m = {}; try { m = JSON.parse(ta.dataset.picks || '{}'); } catch (_) {} m[c.name] = c.uid; ta.dataset.picks = JSON.stringify(m); }
  return r;
}
function exprInsertPick() {
  const uid = $('#exprPick').value; if (!uid) return; const c = allFiles().flatMap(f => f.channels).find(c => String(c.uid) === uid); if (!c) return;
  const t = $('#exprIn'), s = exprRef(c, t), p = t.selectionStart; t.value = t.value.slice(0, p) + s + t.value.slice(t.selectionEnd); t.focus(); t.selectionStart = t.selectionEnd = p + s.length;
}
async function evalFormula(src, pre) {
  pre = pre || {};
  const ids = [...new Set(EXPR.refs(src))].filter(i => !/^(pi|e)$/i.test(i));
  // "Kanal ekle" ile eklenen adlar seçilen kanala bağlıdır (aynı adlı kanal başka dosyada da olsa)
  let picks = {}; try { picks = JSON.parse(($('#exprIn') && $('#exprIn').dataset.picks) || '{}'); } catch (_) {}
  for (const id of ids) if (!pre[id] && picks[id]) { const c = allFiles().flatMap(f => f.channels).find(c => c.uid === picks[id]); if (c) pre[id] = c; }
  const map = {};
  for (const id of ids) { const c = pre[id] || resolveChannel(id); await ensureLoaded(c); map[id] = {v: c.del ? DSP.segment(c.data, c.del, 0, c.n) : c.data, fs: c.fs, ch: c}; }
  return EXPR.run(src, {DSP, resolve: n => { if (!map[n]) throw new Error('Yüklenmemiş: ' + n); return map[n]; }});
}
const UNIT_FX = {int: u => u ? u + '·s' : '', der: u => u ? u + '/s' : '', none: () => '', fs: u => u};
function addResult(res, name, opt) {
  opt = opt || {}; const src = res.ch, c = addDerived(cleanName(name), res.v, src, 0, true);
  if (res.fs && src && res.v.length !== src.n) { c.g = null; c.t0 = src.t(0); c.setFs(res.fs); }
  if (opt.unit != null) c.unit = opt.unit; else if (src && src.unit) c.unit = src.unit;
  if (opt.kind) c.kind = opt.kind;
  const ax = opt.dest === 'act' && activeAxes() ? activeAxes() : S.plot.addAxes(); const tr = makeTrace(c); ax.traces.push(tr); S.plot.active = ax;
  if (ax.traces.every(t => t.ch)) axisLabelFor(ax); if (c.unit) ax.ylabel = c.unit; switchView('time'); refreshAll(); S.plot.fitAll(true);
  return c;
}
function quickFormula() {
  const tr = activeTrace(); if (!tr || !tr.ch) { toast('Önce grafikten bir zaman izi seçin'); return null; }
  const o = opMap()[sv('qOp')], ch = tr.ch; let src = o[2];
  const ps = o[3] || [], vals = ps.map((p, i) => num('qp' + (i + 1)));
  src = src.replace(/\{w1\}/g, Math.max(1, Math.round((vals[0] || 0.1) * ch.fs))).replace(/\{p1\}/g, vals[0]).replace(/\{p2\}/g, vals[1]);
  if (vals.some(v => !isFinite(v))) { toast('Parametre değerini girin'); return null; }
  return {src, o, ch};
}
async function runQuick() {
  const f = quickFormula(); if (!f) return; const msg = $('#qMsg'); msg.textContent = '';
  await busy('Hesaplanıyor…', async () => {
    try {
      const res = await evalFormula(f.src, {A: f.ch}); if (typeof res === 'number') { msg.textContent = 'Sonuç: ' + res; return; }
      const fx = UNIT_FX[f.o[4]], tag = f.o[0], u = f.ch.unit || '';
      addResult(res, f.ch.name + '_' + tag, {dest: sv('qDest'), unit: fx ? fx(u) : u, kind: fx && f.o[4] !== 'fs' ? 'calc' : null});
      msg.textContent = f.o[1].replace(/\s{2}.*/, '') + ' → ' + fmtCnt(res.v.length) + ' örnek eklendi';
    } catch (e) { msg.textContent = 'Hata: ' + e.message; }
  });
}
async function runPair() {
  const a = activeTrace(), msg = $('#pMsg'); msg.textContent = ''; if (!a || !a.ch) return toast('Önce aktif iz seçin (A)');
  const bu = +sv('pB'), b = chByUid(bu); if (!b) return toast('B kanalı seçin'); const ex = sv('pOp');
  await busy('Hesaplanıyor…', async () => {
    try {
      const res = await evalFormula(ex, {A: a.ch, B: b}); if (typeof res === 'number') { msg.textContent = QPAIR.find(q => q[0] === ex)[1].replace(/\s{2}.*/, '') + ' = ' + (+res.toPrecision(6)); return; }
      const nm = a.ch.name + '_' + {'A+B': 'topl', 'A-B': 'fark', 'A*B': 'carp', 'A/B': 'oran', 'sqrt(A^2+B^2)': 'bileske', 'atan2(A,B)': 'aci'}[ex] + '_' + b.name;
      addResult(res, nm, {dest: 'new', unit: ex === 'A/B' || ex === 'A*B' || ex === 'atan2(A,B)' ? '' : a.ch.unit, kind: ex === 'A+B' || ex === 'A-B' || ex.startsWith('sqrt') ? null : 'calc'}); msg.textContent = 'Eklendi: ' + nm;
    } catch (e) { msg.textContent = 'Hata: ' + e.message; }
  });
}
async function runScal() {
  const ax = activeAxes(), out = $('#sOut'); out.textContent = ''; if (!ax) return toast('Önce grafikte iz olmalı');
  const fn = sv('sOp'), arg = fn === 'percentile' ? ',' + num('sP') : '', lines = [];
  await busy('Hesaplanıyor…', async () => {
    try { for (const t of ax.traces) { if (!t.visible || !t.ch) continue; const v = await evalFormula(fn + '(A' + arg + ')', {A: t.ch}); lines.push(t.label + ':  ' + (+v.toPrecision(7)) + (t.ch.unit && ['rms', 'mean', 'std', 'max', 'min', 'p2p', 'median', 'meanabs', 'percentile'].includes(fn) ? ' ' + t.ch.unit : '')); } }
    catch (e) { lines.push('Hata: ' + e.message); }
  });
  out.textContent = lines.join('\n');
}
async function runExpr() {
  const src = sv('exprIn').trim(); if (!src) return; const msg = $('#exprMsg'); msg.textContent = '';
  await busy('Hesaplanıyor…', async () => {
    try {
      const pre = {}; if ($('#exprIn').dataset.pre === 'A') { const tr = activeTrace(); if (tr && tr.ch) pre.A = tr.ch; }
      const res = await evalFormula(src, pre);
      if (typeof res === 'number') { msg.textContent = 'Sonuç (skaler): ' + res; return; }
      const name = sanitizeName(sv('exprName') || 'formul'); S.opDesc = 'Formül: ' + src; const c = addResult(res, name, {dest: 'new'}); c.formula = src; c.formulaPicks = $('#exprIn').dataset.picks || '{}'; msg.textContent = 'Eklendi: ' + name + ' (' + fmtCnt(res.v.length) + ' örnek)';
    } catch (e) { msg.textContent = 'Hata: ' + e.message; }
  });
}

/* ---- türetilmiş kanal: sil (geri alınabilir) / formülü düzenle ---- */
function derivedTraces(chs) { const set = new Set(chs), out = []; for (const P of [S.plot, S.specPlot, S.xyPlot]) if (P) for (const ax of P.axes) ax.traces.forEach((t, k) => { if (set.has(t.ch) || set.has(t.unvCh) || set.has(t.srcCh)) out.push({P, ax, t}); }); return out; }
function deleteDerived(chs) {
  chs = chs.filter(c => c && c.derived && S.derived && S.derived.channels.includes(c)); if (!chs.length) return;
  const used = derivedTraces(chs), pos = chs.map(c => S.derived.channels.indexOf(c));
  const doIt = () => {
    for (const u of used) { const i = u.ax.traces.indexOf(u.t); if (i >= 0) u.ax.traces.splice(i, 1); }
    S.derived.channels = S.derived.channels.filter(c => !chs.includes(c)); for (const c of chs) S.selCh.delete(c.uid);
    if (typeof tlvSyncSubs === 'function') try { tlvSyncSubs(); } catch (_) {}
    renderChips(); renderTree(); refreshAll(); for (const P of [S.plot, S.specPlot, S.xyPlot]) if (P) P.invalidate();
    logOp('derived-delete', {names: chs.map(c => c.name)});
  };
  const undo = () => {
    chs.forEach((c, j) => S.derived.channels.splice(Math.min(pos[j], S.derived.channels.length), 0, c));
    for (const u of used) if (!u.ax.traces.includes(u.t) && u.P.axes.includes(u.ax)) u.ax.traces.push(u.t);
    renderChips(); renderTree(); refreshAll(); for (const P of [S.plot, S.specPlot, S.xyPlot]) if (P) P.invalidate();
  };
  const go = () => { doIt(); toast(chs.length + ' türetilmiş kanal silindi', 8000, {t: 'Geri al', fn: undo}); };
  if (used.length) modal('Türetilmiş kanalı sil', h('div', null, `${chs.map(c => c.name).join(', ')} grafikte ${used.length} izde kullanılıyor. Silinirse izler de kaldırılır (geri alınabilir).`), [{t: 'Sil', primary: true, fn: go}, {t: 'Vazgeç'}]);
  else go();
}
function editDerivedFormula(c) {
  const ta = h('textarea', {rows: 4, style: 'width:100%;font-family:ui-monospace,Consolas,monospace'}), nm = h('input', {type: 'text', value: c.name, style: 'width:100%'}), msg = h('div', {class: 'note'});
  ta.value = c.formula || ''; ta.dataset.picks = c.formulaPicks || '{}';
  const body = h('div', null, h('div', {class: 'note'}, c.formula ? 'Formülü değiştirip Güncelle\'ye basın: kanal yeniden hesaplanır, grafikteki izleri de güncellenir.' : 'Bu kanal formülle oluşturulmadı (' + (c.desc || 'işlem') + '). Yeni bir formül yazarsanız kanal formül sonucuyla değiştirilir.'), h('label', null, 'Formül'), ta, h('label', null, 'Ad'), nm, msg);
  modal('Türetilmiş kanal: ' + c.name, body, [{t: 'Güncelle', primary: true, fn: () => {
    const src = ta.value.trim(); if (!src) { msg.textContent = 'Formül boş'; return false; }
    (async () => {
      try {
        msg.textContent = 'Hesaplanıyor…'; const res = await evalFormulaFor(src, ta); msg.textContent = '';
        if (typeof res === 'number') { msg.textContent = 'Sonuç skaler (' + res + '); kanal için dizi gerekir'; return; }
        const s0 = res.ch; c.data = res.v; c.n = res.v.length; c.pyr = null; c._mm = null; c.del = null; c.delCount = 0;
        if (s0 && s0.n === c.n) c.copyTiming(s0); else if (s0) { c.g = null; c.t0 = s0.t(0); if (res.fs) c.setFs(res.fs); }
        c.formula = src; c.formulaPicks = ta.dataset.picks || '{}'; c.desc = 'Formül: ' + src; const nn = cleanName(nm.value || c.name); if (nn !== c.name) { for (const u of derivedTraces([c])) if (u.t.label === c.name) u.t.label = nn; c.name = c.rest = c.base = c.label = nn; }
        logOp('derived-update', {name: c.name, formula: src});
        $('#modal').classList.add('hidden'); renderTree(); refreshAll(); for (const P of [S.plot, S.specPlot, S.xyPlot]) if (P) P.invalidate(); toast(c.name + ' güncellendi');
      } catch (e) { msg.textContent = 'Hata: ' + e.message; }
    })();
    return false;
  }}, {t: 'Vazgeç'}]);
}
async function evalFormulaFor(src, ta) { const t = $('#exprIn'), keep = t ? t.dataset.picks : null; try { if (t) t.dataset.picks = ta.dataset.picks || '{}'; return await evalFormula(src, {}); } finally { if (t) t.dataset.picks = keep || '{}'; } }
