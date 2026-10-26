/* ===== Faz 2: Test sekmesi — faz tablosu (B1), şartname uygunluk + şablonlar (B2), hesap kaydı (A2) ===== */
const APP_VER = '2.0';
function logOp(op, detail) { (S.methodLog = S.methodLog || []).push(Object.assign({t: Date.now(), op}, detail || {})); }

/* ---------- Faz tablosu (düzenlenebilir) ---------- */
function phRecalc(s) { const L = S.levels, ch = L.ch; s.i0 = Math.max(0, Math.round(ch.timeIdx(s.t0)) - L.a); s.i1 = Math.max(s.i0 + 1, Math.round(ch.timeIdx(s.t1)) - L.a);
  const x = DSP.segment(ch.data, ch.del, L.a + s.i0, L.a + s.i1); let m = 0; for (const v of x) m += v; m /= x.length || 1; let q = 0; for (const v of x) q += (v - m) * (v - m); s.grms = Math.sqrt(q / (x.length || 1)); s.db = 20 * Math.log10(Math.max(s.grms, 1e-300) / L.ref); }
function phBands() { const L = S.levels; if (!L) return; const lv = [...new Set(L.segs.map(s => s.level))].sort((p, q) => p - q), col = v => SUBPAL[lv.indexOf(v) % SUBPAL.length]; S.plot.bands = L.segs.map(s => ({x0: s.t0, x1: s.t1, color: col(s.level)})); S.plot.invalidate(); }
function phaseTable() {
  const box = $('#phTbl'); if (!box) return; box.replaceChildren(); const L = S.levels; if (!L || !L.segs.length) return;
  const f = (v, d = 3) => Number.isFinite(v) ? fmtNum(v, d) : '-', rows = L.segs.map((s, i) => {
    const mk = (k, v) => h('input', {type: 'number', value: +v.toFixed(4), step: 'any', style: 'width:66px', onchange: e => { s[k] = +e.target.value; phRecalc(s); phBands(); phaseTable(); }});
    const lv = h('input', {type: 'number', value: s.level, step: 'any', style: 'width:52px', onchange: e => { s.level = +e.target.value; phBands(); phaseTable(); }});
    return [String(i + 1), lv, mk('t0', s.t0), mk('t1', s.t1), f(s.t1 - s.t0, 4), f(s.grms, 4), f(s.db, 3), h('button', {title: 'Fazı sil', onclick: () => { L.segs.splice(i, 1); phBands(); phaseTable(); }}, '×')];
  });
  box.append(h('div', {style: 'max-height:36vh;overflow:auto'}, tblEl(['#', 'Seviye (dB)', 'Başlangıç (s)', 'Bitiş (s)', 'Süre (s)', 'Grms', 'Ölçülen dB', ''], rows)),
    h('div', {class: 'btns'}, btn('Faz ekle (görünen aralık)', phAdd), btn('Rapora ekle', phToReport)), h('div', {class: 'note'}, 'Başlangıç/bitiş/seviye hücreleri düzenlenebilir; Grms ve renkli bantlar otomatik güncellenir. Seviye başına spektrum ve şartname uygunluk bu tabloyu kullanır.'));
}
function phAdd() { const L = S.levels, ax = activeAxes(); if (!L || !ax) return toast('Önce fazları tespit edin'); const s = {level: 0, t0: ax.xlim[0], t1: ax.xlim[1]}; phRecalc(s); L.segs.push(s); L.segs.sort((p, q) => p.t0 - q.t0); phBands(); phaseTable(); }
function phToReport() { const L = S.levels; if (!L) return; REP.items.push({type: 'table', title: 'Test fazları — ' + L.ch.name, head: ['#', 'Seviye (dB)', 'Başlangıç (s)', 'Bitiş (s)', 'Süre (s)', 'Grms', 'Ölçülen (dB)'], rows: L.segs.map((s, i) => [i + 1, s.level, s.t0.toFixed(3), s.t1.toFixed(3), (s.t1 - s.t0).toFixed(2), s.grms.toPrecision(4), s.db.toFixed(2)]), note: `Referans (0 dB): ${L.ref.toPrecision(4)} Grms${L.prof ? ' (profil: ' + L.prof.name + ')' : ' (en yüksek seviye)'}.`}); repRefreshList(); toast('Rapora eklendi'); }

/* ---------- Şartname şablonları (tolerans kümeleri) ---------- */
// Kaynak: Vibration Research “Aerospace Standards Consistent Testing” karşılaştırma tablosu. Şartnamenin güncel sürümünü doğrulayın.
const TOL_TPL = {
  mil810avg: {name: 'MIL-STD-810H Yöntem 514 — ortalama kontrol', split: 500, b: [3, 3], a: [6, 6], pctOut: 0, gLo: 10, gHi: 10, dof: 120, dfL: 2.5, dfH: 5, note: 'ASD ±3 dB (500 Hz altı), ±6 dB (üstü); toplam Grms ±%10; ≥120 serbestlik derecesi; çözünürlük 25 Hz altı 2,5 Hz, üstü 5 Hz.'},
  mil810ext: {name: 'MIL-STD-810H Yöntem 514 — ekstremal / bireysel kanal', split: 500, b: [6, 3], a: [9, 6], pctOut: 0, gLo: 25, gHi: 25, dof: 120, dfL: 2.5, dfH: 5, note: 'Ekstremal kontrol: ASD −6/+3 dB (500 Hz altı), −9/+6 dB (üstü); Grms ±%25 (bireysel kanal).'},
  aectp400: {name: 'AECTP 400 / STANAG 4370', split: 500, b: [3, 3], a: [6, 6], pctOut: 5, gLo: 10, gHi: 10, dof: 100, dfL: 2.5, dfH: 5, note: 'ASD ±3 dB (500 Hz altı), ±6 dB (üstü); bant genişliğinin en çok %5’i tolerans dışı olabilir; kontrol noktası Grms ±%10 (tekil bağlantı noktası ±%25); ≥100 serbestlik derecesi.'},
  defstan: {name: 'DEF STAN 00-35 (Sayı 5)', split: 500, b: [3, 3], a: [6, 6], pctOut: 5, gLo: 10, gHi: 10, dof: 120, dfL: 5, dfH: 5, note: '±3 dB; 500 Hz üstünde frekansların en çok %5’inde ±6 dB; referans noktası Grms ±%10; ≥120 serbestlik derecesi; çözünürlük ≤5 Hz.'},
  do160: {name: 'RTCA DO-160G', split: 500, b: [1.5, 3], a: [3, 3], pctOut: 0, gLo: 5, gHi: 20, dof: 100, dfL: 5, dfH: 5, note: 'ASD +3/−1,5 dB (500 Hz altı), ±3 dB (üstü); Grms +%20/−%5; ≥100 serbestlik derecesi; çözünürlük <5 Hz.'},
  iso: {name: 'ISO 60068-2-64', split: 1e9, b: [3, 3], a: [3, 3], pctOut: 0, gLo: 10, gHi: 10, dof: 120, dfL: 2.5, dfH: 5, note: 'ASD ±3 dB; referans noktası Grms ±%10; ≥120 serbestlik derecesi.'},
  generic: {name: 'Genel (±3 dB, Grms ±%10)', split: 1e9, b: [3, 3], a: [3, 3], pctOut: 0, gLo: 10, gHi: 10, dof: 100, dfL: 2.5, dfH: 5, note: 'Genel başlangıç değerleri.'},
  custom: {name: 'Özel (aşağıdaki değerler)', split: 500, b: [3, 3], a: [3, 3], pctOut: 0, gLo: 10, gHi: 10, dof: 100, dfL: 2.5, dfH: 5, note: 'Kullanıcı tanımlı.'}
};
const TKEY = 'mv.tolCustom';
function tolFromUI() { const k = sv('cpTpl'); if (k !== 'custom') { /* şablon + kullanıcı üzerine yazmaları */ } return {name: TOL_TPL[k].name, key: k, split: num('cpSplit') || 1e9, b: [num('cpBlo'), num('cpBhi')], a: [num('cpAlo'), num('cpAhi')], pctOut: num('cpOut') || 0, gLo: num('cpGlo'), gHi: num('cpGhi'), dof: num('cpDof') || 0, dfL: num('cpDfL') || 2.5, dfH: num('cpDfH') || 5}; }
function tolToUI(t) { const set = (id, v) => { $('#' + id).value = v; }; set('cpSplit', t.split > 1e8 ? '' : t.split); set('cpBlo', t.b[0]); set('cpBhi', t.b[1]); set('cpAlo', t.a[0]); set('cpAhi', t.a[1]); set('cpOut', t.pctOut); set('cpGlo', t.gLo); set('cpGhi', t.gHi); set('cpDof', t.dof); set('cpDfL', t.dfL); set('cpDfH', t.dfH); $('#cpNote').textContent = t.note || ''; }
function cpFillProf() { const sel = $('#cpProf'); if (!sel) return; const v = sel.value; sel.replaceChildren(...S.profiles.map(p => h('option', {value: p.id}, p.name + ' (' + profGrms(p.pts).toFixed(2) + ' g)')), ...(S.profiles.length ? [] : [h('option', {value: ''}, 'Profil yok — UNV sekmesinden ekleyin')])); if ([...sel.options].some(o => o.value === v)) sel.value = v; }

/* ---------- Uygunluk hesabı ---------- */
function cpTolAt(t, f) { return f <= t.split ? t.b : t.a; }   // [alt, üst] dB
// aralıkları birleştir: dev(i) tolerans dışı ise
function cpRanges(f, dev, tol, t) { const out = []; let cur = null; for (let i = 0; i < f.length; i++) { const [lo, hi] = cpTolAt(t, f[i]), bad = dev[i] > hi ? 1 : dev[i] < -lo ? -1 : 0; if (bad) { if (cur && cur.dir === bad) { cur.f1 = f[i]; cur.max = Math.max(cur.max, Math.abs(dev[i])); } else { if (cur) out.push(cur); cur = {f0: f[i], f1: f[i], dir: bad, max: Math.abs(dev[i])}; } } else if (cur) { out.push(cur); cur = null; } } if (cur) out.push(cur); return out; }
async function complianceRun() {
  const prof = S.profiles.find(p => p.id === sv('cpProf')); if (!prof) return toast('Önce bir profil seçin (UNV sekmesinden profil girin)'); const t = tolFromUI(), mode = sv('cpMode');
  const ax = activeAxes(); if (!ax) return toast('Önce Zaman grafiğine kontrol/ölçüm kanalını ekleyin'); let trs = ax.traces.filter(x => x.ch && x.visible); if (mode === 'one') trs = [activeTrace()].filter(Boolean); if (!trs.length) return toast('Görünür iz yok');
  await busy('Şartname uygunluk hesaplanıyor…', async prog => {
    const f1 = prof.pts[0][0], f2 = prof.pts[prof.pts.length - 1][0], dfReq = f1 <= 25 ? t.dfL : t.dfH, phases = (S.levels && trs.some(x => x.ch === S.levels.ch)) ? S.levels.segs.map(s => ({level: s.level, a: S.levels.a + s.i0, b: S.levels.a + s.i1, name: lvTxt(s.level) + ' (' + s.t0.toFixed(0) + '–' + s.t1.toFixed(0) + ' s)'})) : null;
    const lvl0 = num('cpLevel') || 0, results = [], P = specAxesReset(), sa = P.addAxes({xlog: true, ylog: true, title: 'Şartname uygunluk — ' + prof.name}); sa.ylabel = 'PSD (' + (trs[0].ch.unit || 'g') + '²/Hz)'; sa.xlabel = 'Frekans (Hz)'; sa.xlim = [1, 1000]; sa.ylim = [1e-6, 1];
    const list = phases || [{level: lvl0, a: null, b: null, name: lvl0 ? lvTxt(lvl0) : 'seviye 0 dB'}], groups = mode === 'avg' ? [trs] : trs.map(x => [x]); let step = 0; const tot = list.length * groups.length;
    for (const ph of list) for (const gr of groups) {
      const spec = []; let fs = 0; for (const tr of gr) { const ch = tr.ch; await ensureLoaded(ch); fs = ch.fs; let a, b; if (ph.a != null && ch === S.levels.ch) { a = ph.a; b = ph.b; } else [a, b] = specRange(tr, ax, sv('cpScope'));
        const seg = DSP.segment(ch.data, ch.del, a, b); if (seg.length < 512) { toast('Aralık çok kısa: ' + tr.label); continue; } const nfft = Math.min(DSP.nextPow2(Math.ceil(fs / dfReq)), DSP.nextPow2(seg.length)); spec.push(await DSPW.run('welch', [seg, fs, {nfft, win: 'hann', overlap: 0.5, scale: 'psd', maxSeg: 8000}])); }
      if (!spec.length) continue; const r0 = spec[0]; let y = r0.y; if (spec.length > 1) { y = new Float64Array(r0.y.length); for (const s of spec) for (let i = 0; i < y.length; i++) y[i] += s.y[i] / spec.length; }
      const sc = Math.pow(10, ph.level / 10), fa = [], dev = [], me = [], ta = []; let sm = 0, st = 0, n = 0;
      for (let i = 0; i < r0.f.length; i++) { const f = r0.f[i]; if (f < f1 || f > f2 || !(y[i] > 0)) continue; const tg = profAt(prof.pts, f) * sc; fa.push(f); me.push(y[i]); ta.push(tg); dev.push(10 * Math.log10(y[i] / tg)); sm += y[i] * r0.df; st += tg * r0.df; n++; }
      if (!n) continue; let outN = 0, maxDev = 0, fMax = 0; for (let i = 0; i < n; i++) { const [lo, hi] = cpTolAt(t, fa[i]); if (dev[i] > hi || dev[i] < -lo) outN++; if (Math.abs(dev[i]) > Math.abs(maxDev)) { maxDev = dev[i]; fMax = fa[i]; } }
      const gm = Math.sqrt(sm), gt = Math.sqrt(st), gpct = 100 * (gm / gt - 1), outPct = 100 * outN / n, gOk = gpct <= t.gHi && gpct >= -t.gLo, sOk = outPct <= t.pctOut, dofOk = !t.dof || r0.dof >= t.dof, rng = cpRanges(fa, dev, null, t).sort((p, q) => q.max - p.max).slice(0, 6);
      const name = gr.length > 1 ? 'ortalama(' + gr.length + ' kanal)' : gr[0].label; results.push({name, ph: ph.name, level: ph.level, gm, gt, gpct, outPct, maxDev, fMax, gOk, sOk, dofOk, dof: r0.dof, df: r0.df, ok: gOk && sOk, rng});
      const col = gr[0].color; sa.traces.push({kind: 'xy', x: Float64Array.from(fa), y: Float64Array.from(me), label: name + ' · ' + ph.name, color: col, width: 1.2, visible: true, raw: Float64Array.from(me), scale: 'psd', df: r0.df, srcKind: gr[0].ch.kind});
      if (gr === groups[0]) { const tg = {kind: 'xy', x: Float64Array.from(fa), y: Float64Array.from(ta), label: 'Hedef ' + ph.name, color: '#222', width: 2, visible: true, profileId: prof.id}; const up = fa.map((f, i) => ta[i] * Math.pow(10, cpTolAt(t, f)[1] / 10)), lo = fa.map((f, i) => ta[i] / Math.pow(10, cpTolAt(t, f)[0] / 10));
        sa.traces.push(tg, {kind: 'xy', x: Float64Array.from(fa), y: Float64Array.from(up), label: 'Üst tolerans', color: '#c0392b', width: 1, dash: [5, 4], visible: true, noLegend: true, profileId: prof.id}, {kind: 'xy', x: Float64Array.from(fa), y: Float64Array.from(lo), label: 'Alt tolerans', color: '#c0392b', width: 1, dash: [5, 4], visible: true, noLegend: true, profileId: prof.id}); }
      prog(++step / tot); await sleep(0);
    }
    if (!results.length) { P.removeAxes(sa); return toast('Hesaplanacak veri bulunamadı'); }
    S.compliance = {t, prof, results, when: Date.now()}; logOp('compliance', {tpl: t.name, prof: prof.name, n: results.length, pass: results.filter(r => r.ok).length, df: results[0].df, dof: results[0].dof}); P.fitAll(); switchView('spec'); cpShow();
  });
}
function cpShow() {
  const C = S.compliance, box = $('#cpBox'); if (!box || !C) return; box.replaceChildren(); const f = (v, d = 3) => Number.isFinite(v) ? fmtNum(v, d) : '-';
  const rows = C.results.map(r => ({cls: r.ok ? '' : 'q2', cells: [r.name, r.ph, f(r.gm, 4), f(r.gt, 4), (r.gpct > 0 ? '+' : '') + r.gpct.toFixed(1) + ' %', r.outPct.toFixed(1) + ' %', (r.maxDev > 0 ? '+' : '') + r.maxDev.toFixed(1) + ' dB @ ' + fmtNum(r.fMax, 5) + ' Hz', r.dof.toFixed(0) + (r.dofOk ? '' : ' (yetersiz)'), r.ok ? (r.dofOk ? 'GEÇTİ' : 'GEÇTİ (SD uyarısı)') : 'KALDI']}));
  const ok = C.results.filter(r => r.ok).length; box.append(h('div', {class: 'note'}, `${C.t.name} · ${C.prof.name}: ${ok}/${C.results.length} sonuç geçti`), h('div', {style: 'max-height:36vh;overflow:auto'}, tblEl(['İz', 'Faz', 'Grms (ölçüm)', 'Grms (hedef)', 'Fark', 'Tol. dışı', 'En büyük sapma', 'SD', 'Karar'], rows)));
  const bad = C.results.filter(r => r.rng.length); if (bad.length) box.append(h('div', {class: 'note', style: 'white-space:pre-line'}, 'İhlal bölgeleri:\n' + bad.map(r => r.name + ' · ' + r.ph + ': ' + r.rng.map(g => `${fmtNum(g.f0, 5)}–${fmtNum(g.f1, 5)} Hz (${g.dir > 0 ? 'üst' : 'alt'} ${g.max.toFixed(1)} dB)`).join(', ')).join('\n')));
}
function cpToReport() { const C = S.compliance; if (!C) return toast('Önce uygunluk hesaplayın'); const f = (v, d = 3) => Number.isFinite(v) ? fmtNum(v, d) : '-';
  REP.items.push({type: 'table', title: `Şartname uygunluk — ${C.prof.name}`, head: ['İz', 'Faz', 'Grms ölçüm', 'Grms hedef', 'Fark %', 'Tol. dışı %', 'En büyük sapma (dB)', 'Karar'], rows: C.results.map(r => [r.name, r.ph, f(r.gm, 4), f(r.gt, 4), r.gpct.toFixed(1), r.outPct.toFixed(1), r.maxDev.toFixed(1) + ' @ ' + fmtNum(r.fMax, 5) + ' Hz', r.ok ? 'GEÇTİ' : 'KALDI']),
    note: `Tolerans kümesi: ${C.t.name}. ASD: ${C.t.split < 1e8 ? `f ≤ ${C.t.split} Hz: −${C.t.b[0]}/+${C.t.b[1]} dB; f > ${C.t.split} Hz: −${C.t.a[0]}/+${C.t.a[1]} dB` : `−${C.t.b[0]}/+${C.t.b[1]} dB`}; Grms −%${C.t.gLo}/+%${C.t.gHi}; bant genişliğinin en çok %${C.t.pctOut}’i tolerans dışı olabilir. Welch (Hann, %50 örtüşme), Δf ≈ ${f(C.results[0].df, 3)} Hz.`}); repRefreshList(); toast('Rapora eklendi'); }

function buildTest() {
  const r = h('div'); r.append(lvCard(), h('div', {id: 'phTbl'}));
  const tplSel = selIn('cpTpl', Object.entries(TOL_TPL).map(([k, v]) => [k, v.name]), 'mil810avg'); tplSel.onchange = () => tolToUI(TOL_TPL[tplSel.value]);
  r.append(card('Şartname uygunluk kontrolü',
    fr('Tolerans şablonu', tplSel), fr('Profil', h('select', {id: 'cpProf'})), fr('Kontrol modu', selIn('cpMode', [['one', 'Aktif iz'], ['all', 'Görünür izler (her biri ayrı)'], ['avg', 'Görünür izlerin ortalaması']], 'one')),
    fr('Faz / seviye', h('span', {class: 'note'}, 'Fazlar tespit edilmişse her faz kendi seviyesiyle; yoksa:')), fr('Seviye (dB, 0 = profil)', numIn('cpLevel', 0, {step: 0.5})), fr('Kapsam (fazsız)', selIn('cpScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
    fr('Bölünme frekansı (Hz)', numIn('cpSplit', 500, {min: 0})), fr('ASD alt/üst ≤ f (dB)', numIn('cpBlo', 3, {min: 0, step: 0.5}), numIn('cpBhi', 3, {min: 0, step: 0.5})), fr('ASD alt/üst > f (dB)', numIn('cpAlo', 6, {min: 0, step: 0.5}), numIn('cpAhi', 6, {min: 0, step: 0.5})),
    fr('Tolerans dışı bant payı (%)', numIn('cpOut', 0, {min: 0, step: 1})), fr('Grms alt/üst (%)', numIn('cpGlo', 10, {min: 0}), numIn('cpGhi', 10, {min: 0})),
    fr('En az serbestlik derecesi', numIn('cpDof', 120, {min: 0})), fr('Çözünürlük ≤25 Hz / üstü (Hz)', numIn('cpDfL', 2.5, {min: 0.1, step: 0.5}), numIn('cpDfH', 5, {min: 0.1, step: 0.5})),
    h('div', {id: 'cpNote', class: 'note'}),
    h('div', {class: 'btns'}, btn('Uygunluğu hesapla', complianceRun, 'primary'), btn('Rapora ekle', cpToReport)),
    h('div', {id: 'cpBox'}), h('div', {class: 'note'}, 'Şablon değerleri yayınlanmış karşılaştırma tablosundan alınmıştır; kullandığınız şartnamenin/test planının güncel değerlerini doğrulayıp gerekirse “Özel”e yazın. Ölçülen PSD örnek tahmindir (rastgele hata içerir); karar tablosunda serbestlik derecesi uyarısı verilir.')));
  if (typeof extraTestCards === 'function') for (const c of extraTestCards()) r.append(c);
  setTimeout(() => { cpFillProf(); tolToUI(TOL_TPL.mil810avg); }); return r;
}

/* ---------- A2: Hesap kaydı ve rapora “Yöntem” bölümü ---------- */
function methodText() {
  const L = S.methodLog || [], d = t => new Date(t).toLocaleString('tr-TR'), out = [];
  out.push(`Yazılım: MATView ${APP_VER}. Rapor tarihi: ${d(Date.now())}.`);
  const files = allFiles().filter(f => !f.derived); if (files.length) out.push('Kaynak dosyalar: ' + files.map(f => f.name).join(', ') + '.');
  const dels = []; for (const f of allFiles()) for (const c of f.channels) if (c.delCount) dels.push(`${c.name}: ${c.delCount} nokta`); if (dels.length) out.push('Elle/otomatik silinen (maskelenen) noktalar — özgün veri değiştirilmedi, maske olarak uygulandı: ' + dels.join('; ') + '.');
  const der = L.filter(x => x.op === 'derived'); if (der.length) out.push('Türetilmiş kanallar: ' + der.map(x => `${x.name}${x.src ? ' (kaynak: ' + x.src + ')' : ''}${x.desc ? ' — ' + x.desc : ''}`).join('; ') + '.');
  const sp = [], seen = new Set(); for (const x of L.filter(y => y.op === 'spectrum')) { const k = [x.nfft, x.win, x.overlap, x.scale].join('|'); if (seen.has(k)) continue; seen.add(k); sp.push(`Welch ortalamalı spektrum: NFFT ${x.nfft}, ${x.win === 'hann' ? 'Hann' : x.win} penceresi, %${Math.round(x.overlap * 100)} örtüşme, ölçek ${x.scale === 'psd' ? 'PSD (birim²/Hz)' : x.scale}, Δf = ${fmtNum(x.df, 4)} Hz, ENBW = ${fmtNum(x.enbw, 4)} Hz, serbestlik derecesi ≈ ${fmtNum(x.dof, 3)}; her bölüt ortalaması çıkarılır (detrend), pencere periyodik (scipy/MATLAB pwelch ile uyumlu).`); } out.push(...sp);
  for (const x of L.filter(y => y.op === 'levels').slice(-1)) out.push(`Test fazları otomatik tespit edildi (${x.ch}): adım ${x.step} dB, en az ${x.minDur} s plato, ${x.win} s pencere; ${x.n} faz.`);
  const q = L.filter(y => y.op === 'quality').slice(-1)[0]; if (q) out.push(`Veri kalitesi denetimi yapıldı (${q.n} kanal): kırpılma sınırı %${q.cfg.clip}, sıçrama eşiği ${q.cfg.jump}×σΔ, kayıp paket sınırı ${q.cfg.lost}.`);
  const cp = L.filter(y => y.op === 'compliance').slice(-1)[0]; if (cp) out.push(`Şartname uygunluk: ${cp.tpl}; profil “${cp.prof}”; ${cp.pass}/${cp.n} sonuç geçti. PSD: Welch, Hann, %50 örtüşme, Δf = ${fmtNum(cp.df, 3)} Hz, serbestlik derecesi ≈ ${fmtNum(cp.dof, 3)}.`);
  for (const x of L.filter(y => !['spectrum', 'levels', 'quality', 'compliance', 'derived', 'delete'].includes(y.op))) out.push(`${x.op}: ${Object.entries(x).filter(([k]) => k !== 'op' && k !== 't').map(([k, v]) => k + '=' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ')}.`);
  return out;
}
function methodToReport() { const t = methodText(); REP.items.push({type: 'text', title: 'Yöntem ve veri işleme', body: t.join('\n')}); repRefreshList(); toast('Yöntem bölümü rapora eklendi'); }
function methodShow() { const body = h('div', {style: 'max-height:60vh;overflow:auto;white-space:pre-wrap;font-size:12px;min-width:520px'}, methodText().join('\n\n') + '\n\n— Ham kayıt —\n' + (S.methodLog || []).map(x => new Date(x.t).toLocaleTimeString('tr-TR') + '  ' + x.op + '  ' + JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'op' && k !== 't')))).join('\n')); modal('Hesap kaydı (yöntem)', body, [{t: 'Kapat', primary: true}]); }
function methodCard() { return card('Hesap kaydı (yöntem)', h('div', {class: 'note'}, 'Yapılan silme, süzme, türetme ve analizler parametreleriyle kaydedilir. Rapora “Yöntem ve veri işleme” bölümü olarak eklenebilir: rapordaki sayıların nasıl üretildiği izlenebilir olur.'), h('div', {class: 'btns'}, btn('Rapora yöntem bölümü ekle', methodToReport, 'primary'), btn('Kaydı göster', methodShow), btn('Kaydı temizle', () => { S.methodLog = []; toast('Hesap kaydı temizlendi'); }))); }
