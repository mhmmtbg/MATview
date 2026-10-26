/* ===== Faz 3: Kontrol/cevap + transmisibilite (B3), akustik bant tablosu (B5), silme geçmişi / ham görünüm (A4) ===== */
S.roles = {ctl: [], resp: []};
const roleChs = r => S.roles[r].map(chByUid).filter(Boolean);
function roleAssign(role, chs) { if (!chs.length) return toast('Önce kanal seçin (soldaki listeden ya da grafikteki izlerden)'); for (const c of chs) { for (const k of ['ctl', 'resp']) S.roles[k] = S.roles[k].filter(u => u !== c.uid); S.roles[role].push(c.uid); } roleRender(); }
function roleRender() { for (const [k, id] of [['ctl', 'ctCtl'], ['resp', 'ctResp']]) { const box = $('#' + id); if (!box) continue; const cs = roleChs(k); box.replaceChildren(...(cs.length ? cs.map(c => h('span', {class: 'chip', title: c.file ? c.file.name : ''}, c.name, ' ', h('a', {href: '#', onclick: e => { e.preventDefault(); S.roles[k] = S.roles[k].filter(u => u !== c.uid); roleRender(); }}, '×'))) : [h('span', {class: 'note'}, 'yok')])); } }
const traceChs = () => { const ax = activeAxes(); return ax ? ax.traces.filter(t => t.ch).map(t => t.ch) : []; };
function ctRange(ch, ax, sc) { if (sc !== 'vis' || !ax) return [0, ch.n]; return [Math.max(0, Math.floor(ch.timeIdx(ax.xlim[0]))), Math.min(ch.n, Math.ceil(ch.timeIdx(ax.xlim[1])) + 1)]; }
function bandGrms(f, y, f1, f2) { let s = 0; for (let i = 1; i < f.length; i++) if (f[i] >= f1 && f[i] <= f2) s += (y[i] + y[i - 1]) / 2 * (f[i] - f[i - 1]); return Math.sqrt(s); }
let _ct = null;
async function controlRun() {
  const ctl = roleChs('ctl'), resp = roleChs('resp'); if (!ctl.length) return toast('Önce kontrol kanallarını atayın');
  await busy('Kontrol / cevap analizi…', async prog => {
    const all = [...ctl, ...resp], ax = activeAxes(), sc = sv('ctScope'); for (const c of all) await ensureLoaded(c);
    const fs = ctl[0].fs; for (const c of all) if (Math.abs(c.fs - fs) > 1e-4 * fs) throw new Error(`Örnekleme hızları aynı olmalı: ${ctl[0].name} ${fmtNum(fs, 6)} Hz, ${c.name} ${fmtNum(c.fs, 6)} Hz (Araçlar ▸ yeniden örnekleme ile eşitleyin)`);
    const segs = all.map(c => { const [a, b] = ctRange(c, ax, sc); return DSP.segment(c.data, c.del, a, b); }); const m = Math.min(...segs.map(s => s.length)); if (m < 512) throw new Error('Aralık çok kısa'); if (segs.some(s => s.length !== segs[0].length)) toast('Uyarı: silinen noktalar nedeniyle kanal uzunlukları farklı; en kısaya göre kırpıldı', 6000);
    const nfft = Math.min(+sv('ctN'), DSP.nextPow2(m)), f1 = num('ctF1'), f2 = num('ctF2'), o = {nfft, win: 'hann', overlap: 0.5, scale: 'psd', maxSeg: 8000};
    const cp = ctl.map((c, i) => DSP.welch(segs[i].subarray(0, m), fs, o)), nb = cp[0].f.length, avg = new Float64Array(nb), mn = new Float64Array(nb).fill(Infinity), mx = new Float64Array(nb);
    for (const r of cp) for (let k = 0; k < nb; k++) { avg[k] += r.y[k] / cp.length; if (r.y[k] < mn[k]) mn[k] = r.y[k]; if (r.y[k] > mx[k]) mx[k] = r.y[k]; }
    const P = specAxesReset(), ku = ctl[0].unit || 'g', aC = P.addAxes({xlog: true, ylog: true, title: 'Kontrol PSD'}); aC.xlim = [1, 1000]; aC.ylim = [1e-8, 1]; aC.ylabel = `PSD (${ku}²/Hz)`; aC.xlabel = 'Frekans (Hz)';
    const mkp = (y, label, color, w, dash) => ({kind: 'xy', x: cp[0].f, y, label, color, width: w, dash, visible: true, raw: y, scale: 'psd', df: cp[0].df, srcKind: ctl[0].kind});
    ctl.forEach((c, i) => aC.traces.push(mkp(cp[i].y, c.name, SUBPAL[i % SUBPAL.length], 0.9)));
    if (ctl.length > 1) { aC.traces.push(mkp(avg, 'Ortalama (kontrol)', '#111', 2.2), mkp(mn, 'Alt zarf', '#777', 1, [5, 4]), mkp(mx, 'Üst zarf', '#777', 1, [5, 4])); }
    const prof = S.profiles.find(p => p.id === sv('ctProf')); if (prof) aC.traces.push(profTrace(prof, Math.pow(10, (num('ctLvl') || 0) / 10), 'Profil ' + prof.name, '#c0392b', [6, 4]));
    const rowsC = ctl.map((c, i) => { let dmax = 0; for (let k = 0; k < nb; k++) if (cp[0].f[k] >= f1 && cp[0].f[k] <= f2 && avg[k] > 0 && cp[i].y[k] > 0) dmax = Math.max(dmax, Math.abs(10 * Math.log10(cp[i].y[k] / avg[k]))); return [c.name, fmtNum(bandGrms(cp[0].f, cp[i].y, f1, f2), 4), ctl.length > 1 ? (20 * Math.log10(bandGrms(cp[0].f, cp[i].y, f1, f2) / bandGrms(cp[0].f, avg, f1, f2))).toFixed(2) + ' dB' : '-', ctl.length > 1 ? dmax.toFixed(1) + ' dB' : '-']; });
    if (ctl.length > 1) rowsC.push(['ORTALAMA', fmtNum(bandGrms(cp[0].f, avg, f1, f2), 4), '-', '-']);
    const gAvg = bandGrms(cp[0].f, avg, f1, f2); let rowsT = [], head2 = [];
    if (resp.length) {
      const xavg = new Float64Array(m); for (let i = 0; i < ctl.length; i++) for (let k = 0; k < m; k++) xavg[k] += segs[i][k] / ctl.length; const aT = P.addAxes({xlog: true, ylog: true, title: 'Transmisibilite |cevap / kontrol|'}); aT.xlim = [1, 1000]; aT.ylim = [0.01, 100]; aT.ylabel = 'Transmisibilite'; aT.hw = 2;
      const useH1 = sv('ctMeth') === 'h1', aCo = useH1 ? P.addAxes({xlog: true, ylog: false, title: 'Koherans'}) : null; if (aCo) { aCo.ylabel = 'γ²'; aCo.xlabel = 'Frekans (Hz)'; } else aT.xlabel = 'Frekans (Hz)';
      let k2 = 0; for (let j = 0; j < resp.length; j++) {
        const y = segs[ctl.length + j].subarray(0, m), col = SUBPAL[(j + 3) % SUBPAL.length]; let f, T, coh = null;
        if (useH1) { const r = DSP.frf(xavg, y, fs, {nfft, win: 'hann', overlap: 0.5}); f = r.f; T = r.h1; coh = r.coh; } else { const r = DSP.welch(y, fs, o); f = r.f; T = new Float64Array(nb); for (let k = 0; k < nb; k++) T[k] = Math.sqrt(r.y[k] / (avg[k] || 1e-300)); }
        const rp = DSP.welch(y, fs, o), gR = bandGrms(rp.f, rp.y, f1, f2); aT.traces.push({kind: 'xy', x: f, y: T, label: resp[j].name, color: col, width: 1.2, visible: true, raw: T, scale: 'frf', srcKind: 'frf'}); if (aCo) aCo.traces.push({kind: 'xy', x: f, y: coh, label: resp[j].name, color: col, width: 1, visible: true, raw: coh, scale: 'frf', srcKind: 'frf'});
        const Tb = new Float64Array(f.length); for (let k = 0; k < f.length; k++) Tb[k] = f[k] >= f1 && f[k] <= f2 ? T[k] : 0; const pk = findPeaks(f, Tb, 3).filter(p => p.y > 0), cm = coh ? (() => { let s = 0, n = 0; for (let k = 0; k < f.length; k++) if (f[k] >= f1 && f[k] <= f2) { s += coh[k]; n++; } return s / (n || 1); })() : null;
        rowsT.push([resp[j].name, fmtNum(gR, 4), (gR / gAvg).toFixed(2), pk.map(p => fmtNum(p.x, 5) + ' Hz → ' + p.y.toFixed(2)).join('; ') || '-', cm == null ? '-' : cm.toFixed(2)]); prog(++k2 / resp.length);
      }
      head2 = ['Cevap kanalı', 'Grms', 'Grms oranı (cevap/kontrol)', 'En büyük 3 tepe (frekans → T)', 'Ort. koherans'];
      for (const q of P.axes) if (q.xlim[0] <= 0) q.xlim[0] = cp[0].f[1];
    }
    P.fitAll(); for (const q of P.axes) if (q.xlog && q.xlim[0] <= 0) q.xlim[0] = cp[0].f[1]; switchView('spec');
    _ct = {f1, f2, nfft, df: cp[0].df, dof: cp[0].dof, rowsC, rowsT, head2, ctl: ctl.map(c => c.name), resp: resp.map(c => c.name), meth: sv('ctMeth')};
    logOp('control', {ctl: _ct.ctl.join('+'), resp: _ct.resp.join('+'), nfft, df: cp[0].df, dof: cp[0].dof, method: resp.length ? (sv('ctMeth') === 'h1' ? 'H1 (kontrol ortalaması→cevap)' : 'PSD oranı karekökü') : '-', band: f1 + '-' + f2});
    const box = $('#ctBox'); box.replaceChildren(h('div', {class: 'note'}, `Δf = ${fmtNum(cp[0].df, 4)} Hz · serbestlik derecesi ≈ ${fmtNum(cp[0].dof, 3)} · Grms bandı ${f1}–${f2} Hz`), tblEl(['Kontrol kanalı', 'Grms', 'Ortalamaya göre', 'En büyük PSD sapması'], rowsC), ...(rowsT.length ? [h('div', {style: 'height:8px'}), tblEl(head2, rowsT)] : []));
  });
}
function ctToReport() { if (!_ct) return toast('Önce analizi çalıştırın'); REP.items.push({type: 'table', title: 'Kontrol kanalları', head: ['Kontrol kanalı', 'Grms', 'Ortalamaya göre', 'En büyük PSD sapması'], rows: _ct.rowsC, note: `Welch PSD, Hann, %50 örtüşme, Δf = ${fmtNum(_ct.df, 4)} Hz, serbestlik derecesi ≈ ${fmtNum(_ct.dof, 3)}; Grms ${_ct.f1}–${_ct.f2} Hz.`});
  if (_ct.rowsT.length) REP.items.push({type: 'table', title: 'Transmisibilite (cevap / kontrol ortalaması)', head: _ct.head2, rows: _ct.rowsT, note: `Yöntem: ${_ct.meth === 'h1' ? 'H1 (kontrol kanallarının zaman ortalaması girişe karşı)' : 'PSD oranının karekökü'}.`}); repRefreshList(); toast('Rapora eklendi'); }
function ctCard() {
  const profSel = h('select', {id: 'ctProf'}); setTimeout(() => { const v = profSel.value; profSel.replaceChildren(h('option', {value: ''}, 'Profil yok'), ...S.profiles.map(p => h('option', {value: p.id}, p.name))); profSel.value = v; roleRender(); });
  return card('Kontrol / cevap analizi (transmisibilite)',
    h('div', {class: 'note'}, 'Kanal adları farklı olabilir: soldan veya grafikten kanalları seçip rol atayın.'),
    fr('Kontrol kanalları', h('div', {id: 'ctCtl'})), fr('Cevap kanalları', h('div', {id: 'ctResp'})),
    h('div', {class: 'btns'}, btn('Seçili → Kontrol', () => roleAssign('ctl', chsFromSel())), btn('Seçili → Cevap', () => roleAssign('resp', chsFromSel())), btn('Grafikteki izler → Cevap', () => roleAssign('resp', traceChs().filter(c => !S.roles.ctl.includes(c.uid)))), btn('Grafikteki izler → Kontrol', () => roleAssign('ctl', traceChs())), btn('Rolleri temizle', () => { S.roles = {ctl: [], resp: []}; roleRender(); })),
    fr('Yöntem', selIn('ctMeth', [['h1', 'H1 (kontrol ort. → cevap) + koherans'], ['psd', 'PSD oranı karekökü']], 'h1')), fr('NFFT', selIn('ctN', [1024, 2048, 4096, 8192, 16384].map(v => [v, v]), 4096)),
    fr('Grms bandı f1 / f2 (Hz)', numIn('ctF1', 20), numIn('ctF2', 2000)), fr('Kapsam', selIn('ctScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
    fr('Profil (isteğe bağlı)', profSel), fr('Profil seviyesi (dB)', numIn('ctLvl', 0, {step: 0.5})),
    h('div', {class: 'btns'}, btn('Analiz et', controlRun, 'primary'), btn('Rapora ekle', ctToReport)), h('div', {id: 'ctBox'}),
    h('div', {class: 'note'}, 'Çoklu kontrol: ortalama PSD ve alt/üst zarf (ekstremal kontrol için) çizilir. Transmisibilite = cevap / kontrol ortalaması; tepe değerleri rezonans adayıdır. Tüm kanalların örnekleme hızı aynı olmalıdır.'));
}

/* ---------- B5: Akustik 1/3 oktav bant tablosu + şartname karşılaştırması ---------- */
let _at = null;
function specInterp(lines, fc) { const pts = lines.map(l => l.trim().split(/[\s;,]+/).map(Number)).filter(p => p.length >= 2 && p.every(isFinite)).sort((a, b) => a[0] - b[0]); if (pts.length < 2) return null; return fc.map(f => { if (f < pts[0][0] * 0.999 || f > pts[pts.length - 1][0] * 1.001) return NaN; let i = 0; while (i + 2 < pts.length && f > pts[i + 1][0]) i++; const [f1, d1] = pts[i], [f2, d2] = pts[i + 1]; return d1 + (d2 - d1) * Math.log(f / f1) / Math.log(f2 / f1); }); }
async function acTableRun() {
  const ax = activeAxes(); if (!ax) return toast('Önce Zaman grafiğine mikrofon kanallarını ekleyin'); const trs = ax.traces.filter(t => t.ch && t.visible); if (!trs.length) return toast('Görünür iz yok');
  await busy('Akustik bant tablosu…', async prog => {
    const frac = +sv('atFrac'), W = sv('atW'), ref = +sv('atRef'), f1 = num('atF1'), f2 = num('atF2'), res = []; let k = 0;
    for (const tr of trs) { await ensureLoaded(tr.ch); const [a, b] = specRange(tr, ax, sv('atScope')); if (b - a < 256) { toast('Aralık çok kısa: ' + tr.label); continue; } const seg = DSP.segment(tr.ch.data, tr.ch.del, a, b); res.push({tr, r: DSP.octaveBands(seg, tr.ch.fs, {frac, fmin: f1, fmax: f2, ref, weight: W})}); prog(++k / trs.length); await sleep(0); }
    if (!res.length) return; const fc = res[0].r.fc, nb = fc.length; for (const x of res) if (x.r.fc.length !== nb) throw new Error('Kanalların bant sayısı farklı (örnekleme hızları farklı olabilir)');
    const avg = new Float64Array(nb); for (let i = 0; i < nb; i++) { let s = 0; for (const x of res) s += Math.pow(10, x.r.L[i] / 10); avg[i] = 10 * Math.log10(s / res.length); } let oa = 0; for (const x of res) oa += Math.pow(10, x.r.overall / 10); oa = 10 * Math.log10(oa / res.length);
    const spec = specInterp(sv('atSpec').split('\n'), Array.from(fc)), tol = num('atTol'), oaSpec = num('atOA'), oaTol = num('atOATol');
    const head = ['fc (Hz)', ...res.map(x => x.tr.label), ...(res.length > 1 ? ['Ortalama'] : []), ...(spec ? ['Şartname', 'Fark', 'Karar'] : [])], rows = [], uw = W === 'Z' ? '' : W;
    for (let i = 0; i < nb; i++) { const cells = [fmtNum(fc[i], 5), ...res.map(x => x.r.L[i].toFixed(1))]; if (res.length > 1) cells.push(avg[i].toFixed(1)); let bad = false; if (spec) { const s = spec[i], d = (res.length > 1 ? avg[i] : res[0].r.L[i]) - s; if (isFinite(s)) { bad = Math.abs(d) > tol; cells.push(s.toFixed(1), (d > 0 ? '+' : '') + d.toFixed(1), bad ? 'KALDI' : 'GEÇTİ'); } else cells.push('-', '-', '-'); } rows.push({cls: bad ? 'q2' : '', cells}); }
    const oaRow = ['OASPL' + (uw ? ' (dB' + uw + ')' : ' (dB)'), ...res.map(x => x.r.overall.toFixed(1)), ...(res.length > 1 ? [oa.toFixed(1)] : [])]; if (spec) { if (isFinite(oaSpec)) { const d = (res.length > 1 ? oa : res[0].r.overall) - oaSpec, bad = Math.abs(d) > oaTol; oaRow.push(oaSpec.toFixed(1), (d > 0 ? '+' : '') + d.toFixed(1), bad ? 'KALDI' : 'GEÇTİ'); } else oaRow.push('-', '-', '-'); } rows.push({cls: 'q1', cells: oaRow});
    _at = {head, rows: rows.map(r => r.cells), note: `${frac === 3 ? '1/3 oktav' : 'Oktav'} bant seviyeleri (dB${uw} re ${ref === 2e-5 ? '20 µPa' : ref}), Welch değil; bant içi PSD integrali. ${res.length > 1 ? 'Ortalama: enerji ortalaması (' + res.length + ' kanal). ' : ''}${spec ? `Bant toleransı ±${tol} dB${isFinite(oaSpec) ? ', OASPL toleransı ±' + oaTol + ' dB' : ''}.` : ''}`};
    $('#atBox').replaceChildren(h('div', {style: 'max-height:44vh;overflow:auto'}, tblEl(head, rows)));
    const P = specAxesReset(), sa = P.addAxes({xlog: true, ylog: false, title: 'Akustik bant seviyeleri'}); sa.xlim = [10, 10000]; sa.ylim = [60, 160]; sa.ylabel = `Seviye (dB${uw} re ${ref === 2e-5 ? '20 µPa' : ref})`; sa.xlabel = 'Merkez frekans (Hz)';
    res.forEach((x, i) => sa.traces.push({kind: 'xy', x: fc, y: x.r.L, label: x.tr.label, color: x.tr.color, width: 1, visible: true, raw: x.r.L, scale: 'db', srcKind: 'ac'})); if (res.length > 1) sa.traces.push({kind: 'xy', x: fc, y: avg, label: 'Ortalama', color: '#111', width: 2.4, visible: true, raw: avg, scale: 'db', srcKind: 'ac'});
    if (spec) { const ok = [...fc].map((f, i) => i).filter(i => isFinite(spec[i])), xs = Float64Array.from(ok.map(i => fc[i])); sa.traces.push({kind: 'xy', x: xs, y: Float64Array.from(ok.map(i => spec[i])), label: 'Şartname', color: '#c0392b', width: 2, visible: true, srcKind: 'ac'}, {kind: 'xy', x: xs, y: Float64Array.from(ok.map(i => spec[i] + tol)), label: 'Üst tol.', color: '#c0392b', width: 1, dash: [5, 4], visible: true, noLegend: true}, {kind: 'xy', x: xs, y: Float64Array.from(ok.map(i => spec[i] - tol)), label: 'Alt tol.', color: '#c0392b', width: 1, dash: [5, 4], visible: true, noLegend: true}); }
    P.fitAll(); switchView('spec'); logOp('acoustic-bands', {n: res.length, frac, weight: W, ref, band: f1 + '-' + f2, spec: !!spec, tol});
  });
}
function atToReport() { if (!_at) return toast('Önce tabloyu hesaplayın'); REP.items.push({type: 'table', title: 'Akustik bant seviyeleri', head: _at.head, rows: _at.rows, note: _at.note}); repRefreshList(); toast('Rapora eklendi'); }
async function atCopy() { if (!_at) return toast('Önce tabloyu hesaplayın'); try { await navigator.clipboard.writeText([_at.head, ..._at.rows].map(r => r.join('\t')).join('\n')); toast('Tablo panoya kopyalandı'); } catch (e) { toast('Kopyalanamadı: ' + e.message); } }
function atCard() {
  return card('Akustik bant tablosu (OASPL + şartname)',
    fr('Bant', selIn('atFrac', [[3, '1/3 oktav'], [1, '1/1 oktav']], 3)), fr('Ağırlık', selIn('atW', [['Z', 'Doğrusal (Z)'], ['A', 'A'], ['C', 'C']], 'Z')), fr('Referans', selIn('atRef', [['2e-5', '20 µPa (Pa)'], ['1', '1 birim']], '2e-5')),
    fr('f min / f max (Hz)', numIn('atF1', 20), numIn('atF2', 10000)), fr('Kapsam', selIn('atScope', [['vis', 'Görünen aralık'], ['all', 'Tüm kanal']], 'vis')),
    fr('Şartname (her satır: fc dB)', h('textarea', {id: 'atSpec', rows: 5, placeholder: '31.5 120\n63 126\n125 130\n…', style: 'width:100%'})), fr('Bant toleransı ± (dB)', numIn('atTol', 3, {min: 0, step: 0.5})), fr('OASPL şartnamesi (dB) ± tol.', numIn('atOA', '', {step: 0.5}), numIn('atOATol', 1, {min: 0, step: 0.5})),
    h('div', {class: 'btns'}, btn('Tabloyu hesapla', acTableRun, 'primary'), btn('Rapora ekle', atToReport), btn('Tabloyu kopyala', atCopy)), h('div', {id: 'atBox'}),
    h('div', {class: 'note'}, 'Grafikteki görünür mikrofon izleri için bant seviyeleri ve (birden çok kanal varsa) enerji ortalaması. Şartname girilirse bant bant geçti/kaldı verilir. Tolerans varsayılanları (±3 dB / ±1 dB) başlangıç değeridir; test planınıza göre değiştirin.'));
}

/* ---------- A4: silme geçmişi, ham veri görünümü ---------- */
function delRuns(ch) { const out = [], d = ch.del; if (!d) return out; let i = 0; const n = ch.n; while (i < n) { if (d[i]) { let j = i; while (j < n && d[j]) j++; out.push([i, j]); i = j; } else i++; } return out; }
function delHistoryDialog() {
  const body = h('div', {style: 'max-height:60vh;overflow:auto;min-width:520px'}); let any = false;
  for (const f of allFiles()) for (const c of f.channels) { if (!c.delCount) continue; any = true; const rs = delRuns(c);
    body.append(h('h4', null, `${c.name} — ${c.delCount} nokta, ${rs.length} bölge`), tblEl(['#', 'Başlangıç (s)', 'Bitiş (s)', 'Nokta'], rs.slice(0, 200).map((r, i) => [i + 1, fmtNum(c.t(r[0]), 7), fmtNum(c.t(r[1] - 1), 7), r[1] - r[0]])), rs.length > 200 ? h('div', {class: 'note'}, '… ilk 200 bölge gösterildi') : '',
      h('div', {class: 'btns'}, btn('Bu kanaldaki tüm silmeleri geri al', () => { const idx = []; for (const r of rs) for (let i = r[0]; i < r[1]; i++) idx.push(i); c.restore(idx); S.undo.push([{ch: c, idx: Uint32Array.from(idx), inverse: true}]); logOp('restore-all', {ch: c.name, n: idx.length}); afterEdit(); toast(c.name + ': silmeler geri alındı'); document.getElementById('modal').classList.add('hidden'); }))); }
  if (!any) body.append(h('div', {class: 'note'}, 'Silinmiş nokta yok.')); modal('Silme geçmişi (maskelenen noktalar)', body, [{t: 'Kapat', primary: true}]);
}
function rawView(on) {
  if (on === S.rawOn) return; S.rawOn = on; for (const f of allFiles()) for (const c of f.channels) { if (on) { if (c.del && c.delCount) { c._delStash = c.del; c.del = null; c.pyr = null; } } else if (c._delStash) { c.del = c._delStash; c._delStash = null; c.pyr = null; } }
  refreshAll(); toast(on ? 'HAM VERİ görünümü: silinen noktalar da gösteriliyor (düzenleme kapalı)' : 'İşlenmiş görünüm: silinen noktalar gizli', 5000); const b = $('#rawBtn'); if (b) b.textContent = on ? 'İşlenmiş görünüme dön' : 'Ham veri görünümü';
}
function historyCard() { return card('Silme geçmişi ve ham veri', h('div', {class: 'note'}, 'Silme işlemleri özgün veriyi değiştirmez; maske olarak uygulanır. Geçmişi inceleyebilir, kanal başına geri alabilir veya ham veriyi geçici olarak görebilirsiniz. MAT dışa aktarımına işlem günlüğü eklenir.'),
  chkIn('mxLog', 'MAT dışa aktarımına işlem günlüğünü ekle (MATView_islem_gunlugu)', true), h('div', {class: 'btns'}, btn('Silme geçmişi…', delHistoryDialog), btn('Ham veri görünümü', () => rawView(!S.rawOn), '', 'rawBtn'))); }
function extraTestCards() { return [ctCard(), atCard()]; }
