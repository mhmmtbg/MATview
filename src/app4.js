/* ===== UNV (dataset 58) içe aktarma, spektrum profilleri ve karşılaştırma ===== */
const PROFKEY = 'matview.profiles';
S.profiles = (() => { try { return JSON.parse(localStorage.getItem(PROFKEY) || '[]'); } catch (e) { return []; } })();
function saveProfiles() { try { localStorage.setItem(PROFKEY, JSON.stringify(S.profiles)); } catch (e) { /* depolama yok */ } }

/* ---------- UNV ---------- */
async function unvOpen(file) {
  await busy('UNV okunuyor: ' + file.name, async () => {
    const funcs = UNV.parse(await file.text(), file.name);
    if (!funcs.length) throw new Error(funcs.bin58 ? 'Dosya binary UNV (58b); yalnızca ASCII UNV desteklenir.' : 'Dosyada dataset 58 bulunamadı (ASCII UNV olmalı).');
    const f = {id: 'f' + (importFile.seq++), name: file.name, mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: 1, baseFs: 1, cnts: {}, gcache: {}, baseN: 0, unv: true, funcs};
    funcs.forEach((u, k) => {
      const idx = k + 1, nm = UNV.chanName(u, idx), dev = UNV.FUNC_TYPE[u.func_type] || ('Tip ' + u.func_type);
      const mk = (name, y, unit, sub) => {
        const psd = UNV.isPsd(u) && sub === 'real';
        const c = new Channel({name, rest: name, base: name, comp: '', dev, kind: 'spec', n: y.length, file: f, label: name, varIdx: -1, derived: false, data: y, unit, dtS: 1,
          spec: {x: u.x, xunit: u.x_unit, ftype: u.func_type, idx, sub, psd, dx: u.spacing === 1 ? u.dx : 0, rec: u}});
        f.channels.push(c);
      };
      if (!u.is_complex) mk(nm, u.y, u.y_unit, 'real');
      else {
        const mag = u.y.map((v, i) => Math.hypot(v, u.y_im[i])), ph = u.y.map((v, i) => Math.atan2(u.y_im[i], v) * 180 / Math.PI);
        mk(nm + ' (Genlik)', mag, u.y_unit, 'mag'); mk(nm + ' (Faz)', ph, 'derece', 'phase'); mk(nm + ' (Re)', u.y, u.y_unit, 're'); mk(nm + ' (Im)', u.y_im, u.y_unit, 'im');
      }
    });
    S.files.push(f); S.open.add(f.id + '/' + (f.channels[0] ? f.channels[0].dev : ''));
    if (S.plot.grms.mode === 'off') { S.plot.grms.mode = 'all'; const sel = $('#grmsMode'); if (sel) sel.value = 'all'; }
    renderChips(); renderTree(); setTab('unv');
    toast(`${file.name}: ${funcs.length} kanal (dataset 58)${funcs.bin58 ? ' · ' + funcs.bin58 + ' binary blok atlandı' : ''}`, 5000);
  });
}
function specAxes() {
  const P = S.specPlot; if (P.axes.length) return P.axes[0];
  const ax = P.addAxes({xlog: true, ylog: true}); ax.xlabel = 'Frekans (Hz)'; return ax;
}
function specFit() { const P = S.specPlot, ax = P.axes[0]; if (!ax) return; P.fitAll(); if (ax.xlog && ax.traces[0]) { const x = ax.traces.find(t => t.x && t.x.length > 1); if (x && ax.xlim[0] <= 0) ax.xlim[0] = x.x[1] || 1e-3; } switchView('spec'); }
async function addSpec(chs) {
  const ax = specAxes(); const units = new Set();
  for (const c of chs) {
    const s = c.spec; units.add(c.unit || '');
    ax.traces.push({kind: 'xy', x: s.x, y: c.data, label: c.name, color: nextColor(), width: 1, visible: true, raw: c.data, scale: s.psd ? 'psd' : 'other', df: s.dx, srcKind: s.psd ? 'vib' : '', unvCh: c});
  }
  for (const t of ax.traces) units.add(t.unvCh ? t.unvCh.unit || '' : '');
  units.delete(''); if (units.size === 1 && !ax.traces.some(t => t.profileId)) ax.ylabel = [...units][0];
  if (chs[0] && chs[0].spec.xunit) ax.xlabel = 'Frekans (' + chs[0].spec.xunit + ')';
  specFit();
}
function specClear() { const P = S.specPlot; P.axes.slice().forEach(a => P.removeAxes(a)); P.invalidate(); }
function unvChannels() { const out = []; for (const f of S.files) if (f.unv) out.push(...f.channels); return out; }

function unvTableDialog() {
  const chs = unvChannels(); if (!chs.length) return toast('Önce bir UNV dosyası açın');
  const q = h('input', {type: 'search', placeholder: 'Filtre (ad, tip, nokta)…', style: 'width:100%'}), tb = h('tbody'), sel = new Set();
  const rows = chs.map(c => { const u = c.spec.rec, g = c.spec.sub === 'real' ? UNV.grms(u) : null;
    const tr = h('tr', null, h('td', null, h('input', {type: 'checkbox', onchange: e => e.target.checked ? sel.add(c) : sel.delete(c)})), h('td', null, c.name), h('td', null, UNV.FUNC_TYPE[u.func_type] || u.func_type), h('td', null, u.resp_name + ' ' + u.resp_node), h('td', null, UNV.DIRECTION[u.resp_dir] ?? u.resp_dir),
      h('td', null, u.npts), h('td', null, fmtNum(u.x[0], 6) + '–' + fmtNum(u.x[u.x.length - 1], 6)), h('td', null, u.spacing === 1 ? fmtNum(u.dx, 5) : 'değişken'), h('td', null, c.unit), h('td', null, g != null ? g.toFixed(3) : '-'));
    tr._txt = (c.name + ' ' + u.resp_name + ' ' + (UNV.FUNC_TYPE[u.func_type] || '')).toLowerCase(); return tr; });
  rows.forEach(r => tb.append(r)); q.oninput = () => rows.forEach(r => r.style.display = r._txt.includes(q.value.toLowerCase()) ? '' : 'none');
  const body = h('div', null, h('div', {class: 'note'}, chs.length + ' kanal. Satırları işaretleyip "Seçilenleri ekle" ile spektrum grafiğine ekleyin. GRMS = √(ΣPSD·df) (yalnızca reel, eşit aralıklı PSD/ESD/Auto-Spectrum).'), q,
    h('div', {style: 'overflow:auto;max-height:52vh;margin-top:6px'}, h('table', {class: 'ftab'}, h('thead', null, h('tr', null, ['', 'Kanal', 'Tip', 'Nokta', 'Yön', 'N', 'X aralığı', 'dX', 'Y birim', 'GRMS'].map(x => h('th', null, x)))), tb)));
  modal('UNV kanal tablosu', body, [{t: 'Seçilenleri ekle', primary: true, fn: () => { if (sel.size) addSpec([...sel]); }}, {t: 'Hepsini ekle', fn: () => { addSpec(chs.filter(c => c.spec.sub !== 'im' && c.spec.sub !== 're' && c.spec.sub !== 'phase')); }}, {t: 'Kapat'}]);
}
async function unvExcel() {
  const fl = S.files.filter(f => f.unv); if (!fl.length) return toast('Önce bir UNV dosyası açın');
  const funcs = fl.flatMap(f => f.funcs), info = [['#', 'Kanal Adı (ID Line 1)', 'Kaynak Dosya', 'Fonksiyon Tipi', 'Ordinat Tipi', 'Ölçüm Noktası', 'Nokta No', 'Yön', 'Veri Sayısı', 'X Min', 'X Max', 'dX', 'X Birim', 'Y Birim', 'GRMS']], groups = new Map();
  funcs.forEach((u, k) => { const g = UNV.grms(u); info.push([k + 1, u.id1, u.source, UNV.FUNC_TYPE[u.func_type] || u.func_type, UNV.ORD_TYPE[u.ord_type] || u.ord_type, u.resp_name, u.resp_node, UNV.DIRECTION[u.resp_dir] ?? u.resp_dir, u.npts, u.x[0], u.x[u.x.length - 1], u.spacing === 1 ? u.dx : 'değişken', u.x_unit, u.y_unit, g != null ? +g.toFixed(4) : '-']);
    const key = [u.x[0], u.x[u.x.length - 1], u.x.length, u.x_unit].join('|'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push([k + 1, u]); });
  const sheets = [{name: 'Kanal Bilgileri', rows: info}]; let gi = 0;
  for (const items of groups.values()) {
    gi++; const x = items[0][1].x, hdr = ['Frekans (' + (items[0][1].x_unit || '-') + ')'], cols = [Array.from(x)];
    for (const [idx, u] of items) { const nm = UNV.chanName(u, idx); if (u.is_complex) { hdr.push(nm + ' (Re)', nm + ' (Im)'); cols.push(Array.from(u.y), Array.from(u.y_im)); } else { hdr.push(nm); cols.push(Array.from(u.y)); } }
    const rows = [hdr]; for (let r = 0; r < x.length; r++) rows.push(cols.map(c => c[r]));
    sheets.push({name: groups.size === 1 ? 'Veri' : 'Veri_' + gi, rows});
  }
  await saveBlob(XLSX.write(sheets), fl[0].name.replace(/\.[^.]*$/, '') + '.xlsx');
}

/* ---------- profil ---------- */
function profParse(text) {
  const pts = [];
  for (const raw of text.split(/\r?\n/)) {
    const ln = raw.trim(); if (!ln) continue; let tok;
    if (/[;\t]/.test(ln)) tok = ln.split(/[;\t]+/).map(s => s.trim().replace(',', '.')); else if (/\s/.test(ln)) tok = ln.split(/\s+/).map(s => s.replace(',', '.')); else tok = ln.split(',');
    const v = tok.map(s => (s !== '' && isFinite(+s)) ? +s : null).filter(s => s != null);
    if (v.length >= 2) pts.push([v[0], v[1]]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) throw new Error('En az 2 nokta gerekli (her satırda: frekans seviye)');
  if (pts.some(p => !(p[0] > 0) || !(p[1] > 0))) throw new Error('Frekans ve seviye pozitif olmalı (log-log profil)');
  return pts;
}
// log-log doğrusal profilin [lo,hi] aralığındaki Grms'i (g²/Hz -> g)
function profGrms(pts, lo = -Infinity, hi = Infinity) {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    let [f1, p1] = pts[i], [f2, p2] = pts[i + 1]; if (f2 <= lo || f1 >= hi || f2 === f1) continue;
    const m = Math.log(p2 / p1) / Math.log(f2 / f1), at = f => p1 * Math.pow(f / f1, m); const a = Math.max(f1, lo), b = Math.min(f2, hi), pa = at(a);
    s += Math.abs(m + 1) < 1e-9 ? pa * a * Math.log(b / a) : pa * a / (m + 1) * (Math.pow(b / a, m + 1) - 1);
  }
  return Math.sqrt(s);
}
function profAt(pts, f) {
  if (f < pts[0][0] || f > pts[pts.length - 1][0]) return NaN;
  let i = 0; while (i + 2 < pts.length && f > pts[i + 1][0]) i++;
  const [f1, p1] = pts[i], [f2, p2] = pts[i + 1]; return p1 * Math.pow(p2 / p1, Math.log(f / f1) / Math.log(f2 / f1));
}
function profTrace(p, scale, label, color, dash) {
  const x = [], y = [];
  for (let i = 0; i + 1 < p.pts.length; i++) { const [f1] = p.pts[i], [f2] = p.pts[i + 1], n = 40; for (let k = 0; k < n; k++) { const f = f1 * Math.pow(f2 / f1, k / n); x.push(f); y.push(profAt(p.pts, f) * scale); } }
  const L = p.pts[p.pts.length - 1]; x.push(L[0]); y.push(L[1] * scale);
  return {kind: 'xy', x: Float64Array.from(x), y: Float64Array.from(y), label, color, width: dash ? 1 : 2.5, dash, visible: true, profileId: p.id};
}
function profShow(p) {
  const ax = specAxes(); ax.traces = ax.traces.filter(t => t.profileId !== p.id);
  const tol = Math.pow(10, p.tol / 10), g = profGrms(p.pts);
  const main = profTrace(p, 1, p.name + ' (profil)', p.color); main.fixedExtra = ' — ' + g.toPrecision(4) + ' Grms';
  ax.traces.push(main); if (p.tol > 0) { ax.traces.push(profTrace(p, tol, p.name + ' +' + p.tol + ' dB', p.color, [6, 4]), profTrace(p, 1 / tol, p.name + ' −' + p.tol + ' dB', p.color, [6, 4])); }
  if (ax.isDb) for (const t of ax.traces) if (t.profileId === p.id) t.y = t.y.map(v => 10 * Math.log10(v));
  if (!ax.ylabel) ax.ylabel = 'PSD (g²/Hz)'; specFit();
}
function profDialog(p) {
  const isNew = !p; p = p || {id: 'p' + Date.now(), name: '', pts: [], tol: 3, color: '#d62728'};
  const nm = h('input', {type: 'text', value: p.name, placeholder: 'Profil adı (ör. Rastgele titreşim profili)', style: 'width:100%'}),
    ta = h('textarea', {rows: 10, style: 'width:100%;font-family:monospace', placeholder: 'Her satıra: frekans(Hz)  seviye(g²/Hz)\n20 0.01\n80 0.04\n350 0.04\n2000 0.007'}, p.pts.map(x => x.join('  ')).join('\n')),
    tol = h('input', {type: 'number', value: p.tol, step: 'any', min: 0, style: 'width:70px'}), col = h('input', {type: 'color', value: p.color}), fi = h('input', {type: 'file', accept: '.txt,.csv,.tsv,.dat', hidden: true, onchange: async e => { if (e.target.files[0]) { ta.value = await e.target.files[0].text(); if (!nm.value) nm.value = e.target.files[0].name.replace(/\.[^.]*$/, ''); } }}),
    info = h('div', {class: 'note'});
  const upd = () => { try { const pts = profParse(ta.value); info.textContent = `${pts.length} nokta · profil Grms = ${profGrms(pts).toPrecision(4)} g (log-log doğrusal integral)`; } catch (e) { info.textContent = e.message; } }; ta.oninput = upd; upd();
  const body = h('div', null, fr('Ad', nm), ta, h('div', {class: 'btns'}, btn('Dosyadan yükle…', () => fi.click()), fi), fr('Tolerans (± dB)', tol, col), info,
    h('div', {class: 'note'}, 'Noktalar log-log doğrusal birleştirilir (standart PSD profili: seviye değişimi dB/oktav). Nokta ayırıcı: boşluk, sekme, noktalı virgül veya virgül.'));
  modal(isNew ? 'Profil ekle' : 'Profili düzenle', body, [{t: 'Kaydet ve göster', primary: true, fn: () => {
    try { p.pts = profParse(ta.value); } catch (e) { toast(e.message, 5000); return false; }
    p.name = nm.value.trim() || 'Profil ' + (S.profiles.length + 1); p.tol = Math.max(0, +tol.value || 0); p.color = col.value;
    if (isNew) S.profiles.push(p); saveProfiles(); refreshUnvPanel(); profShow(p);
  }}, {t: 'Vazgeç'}]);
}
function cmpRows(p, mode, step) {
  const rows = [], lo = p.pts[0][0], hi = p.pts[p.pts.length - 1][0], tol = p.tol;
  for (const ax of S.specPlot.axes) for (const t of ax.traces) {
    if (t.profileId || !t.visible) continue; if (t.scale !== 'psd') { rows.push({name: t.label, skip: 'PSD değil (atlandı)'}); continue; }
    const x = t.x, y = t.raw || t.y, d0 = [], xs = [], ys = [];
    for (let i = 0; i < x.length; i++) { if (x[i] < lo || x[i] > hi || !(y[i] > 0)) continue; d0.push(10 * Math.log10(y[i] / profAt(p.pts, x[i]))); xs.push(x[i]); ys.push(y[i]); }
    if (!d0.length) { rows.push({name: t.label, skip: 'profil aralığında nokta yok'}); continue; }
    const sd = d0.slice().sort((a, b) => a - b), m0 = sd[sd.length >> 1]; let shift = 0, how = '';
    if (t.level != null) { shift = t.level; how = 'tespit'; }
    else if (mode === 'auto') { const lv = Math.round(m0 / step) * step; if (Math.abs(m0 - lv) <= 1.5) { shift = lv; how = 'oto'; } else { shift = m0; how = '≈'; } }
    let mx = -Infinity, mn = Infinity, fmx = 0, fmn = 0, out = 0, s = 0;
    for (let i = 0; i < d0.length; i++) { const d = d0[i] - shift; if (d > mx) { mx = d; fmx = xs[i]; } if (d < mn) { mn = d; fmn = xs[i]; } if (Math.abs(d) > tol) out++; if (i) s += (ys[i] + ys[i - 1]) / 2 * (xs[i] - xs[i - 1]); }
    const pg = profGrms(p.pts, xs[0], xs[xs.length - 1]) * Math.pow(10, shift / 20), g = Math.sqrt(s);
    rows.push({name: t.label, shift, how, grms: g, pg, diff: 20 * Math.log10(g / pg), mx, fmx, mn, fmn, out: 100 * out / d0.length});
  }
  return rows;
}
function profCompare(p, mode) {
  mode = mode || 'auto'; const tol = p.tol, box = h('div'), step = h('input', {type: 'number', value: 3, min: 0.5, step: 0.5, style: 'width:60px'}),
    ms = h('select', null, [['auto', 'Seviyeyi otomatik tespit et (−9/−6/−3/0 dB…)'], ['zero', 'Seviye 0 dB (profil olduğu gibi)']].map(([v, t]) => h('option', {value: v, selected: v === mode}, t)));
  const f = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '-';
  const draw = () => {
    const rows = cmpRows(p, ms.value, +step.value || 3); if (!rows.length) { box.replaceChildren(h('div', {class: 'note'}, 'Spektrum grafiğinde karşılaştırılacak iz yok')); return; }
    box.replaceChildren(h('div', {style: 'overflow:auto'}, h('table', {class: 'ftab'}, h('thead', null, h('tr', null, ['İz', 'Seviye (dB)', 'Grms (ölçüm)', 'Grms (profil, seviyede)', 'Fark (dB)', 'En büyük fark (dB)', 'En küçük fark (dB)', 'Tolerans dışı %', 'Sonuç'].map(x => h('th', null, x)))),
      h('tbody', null, rows.map(r => r.skip ? h('tr', null, h('td', null, r.name), h('td', {colspan: 8, class: 'muted'}, r.skip)) :
        h('tr', null, h('td', null, r.name), h('td', null, (r.shift > 0 ? '+' : '') + f(r.shift, r.how === '≈' ? 1 : 0) + ' ' + r.how), h('td', null, f(r.grms, 3)), h('td', null, f(r.pg, 3)), h('td', null, f(r.diff)), h('td', null, f(r.mx) + ' @ ' + fmtNum(r.fmx, 5)), h('td', null, f(r.mn) + ' @ ' + fmtNum(r.fmn, 5)), h('td', null, f(r.out, 1)),
          h('td', null, r.mx <= tol && r.mn >= -tol ? 'Tolerans içinde' : r.mx > tol ? 'ÜST AŞIM' : 'Alt sapma')))))));
  };
  ms.onchange = draw; step.oninput = draw;
  const body = h('div', null, h('div', {class: 'note'}, `${p.name}: ±${tol} dB tolerans, ${fmtNum(p.pts[0][0], 5)}–${fmtNum(p.pts[p.pts.length - 1][0], 5)} Hz. Seviye = ölçümün profile göre medyan farkı (dB), seçilen adıma yuvarlanır; fark seviye düşüldükten sonra hesaplanır.`), fr('Seviye', ms), fr('Seviye adımı (dB)', step), box);
  draw(); modal('Profil karşılaştırması', body, [{t: 'Kapat'}]);
}
/* ---------- test seviyesi (−9/−6/−3/0 dB) ---------- */
const lvTxt = L => (L > 0 ? '+' : L < 0 ? '−' : '') + Math.abs(L) + ' dB';
function lvCard() {
  const refSel = h('select', {id: 'lvRef'}); fillLvRef(refSel);
  return card('Test seviyesi (otomatik)', h('div', {class: 'note'}, 'Aktif izdeki seviye platolarını (ör. −9, −6, −3, 0 dB) bulur, zaman grafiğinde boyar; "Seviye başına spektrum" her plato için ayrı PSD çizer.'),
    fr('Aralık', selIn('lvScope', [['all', 'Tüm kanal'], ['vis', 'Görünen aralık']], 'all')), fr('Seviye adımı (dB)', numIn('lvStep', 3, {min: 0.5, step: 0.5})), fr('Plato en az (s)', numIn('lvDur', 1, {min: 0.1, step: 'any'})), fr('Pencere (s)', numIn('lvWin', 0.5, {min: 0.05, step: 'any'})), fr('Referans (0 dB)', refSel),
    h('div', {class: 'btns'}, btn('Seviyeleri tespit et', lvDetect, 'primary'), btn('Seviye başına spektrum', lvSpectra), btn('Boyamayı kaldır', () => { S.plot.bands = []; S.plot.invalidate(); })), h('div', {id: 'lvInfo', class: 'note', style: 'white-space:pre-line'}));
}
function fillLvRef(sel) { const cur = sel.value; sel.replaceChildren(h('option', {value: 'max'}, 'En yüksek seviye = 0 dB'), ...S.profiles.map(p => h('option', {value: p.id}, 'Profil Grms: ' + p.name + ' (' + profGrms(p.pts).toFixed(2) + ' g)'))); if ([...sel.options].some(o => o.value === cur)) sel.value = cur; }
async function lvDetect() {
  const tr = activeTrace(), ax = activeAxes(); if (!tr) return toast('Önce bir iz seçin (titreşim kanalı)');
  await busy('Seviyeler aranıyor…', async () => {
    const ch = tr.ch; await ensureLoaded(ch); const [a, b] = specRange(tr, ax, sv('lvScope')); if (b - a < 1024) throw new Error('Aralık çok kısa');
    const rp = S.profiles.find(p => p.id === sv('lvRef')), x = DSP.segment(ch.data, ch.del, a, b);
    const res = DSP.levelSegments(x, ch.fs, {step: num('lvStep') || 3, minDur: num('lvDur') || 1, win: num('lvWin') || 0.5, ref: rp ? profGrms(rp.pts) : 0});
    S.levels = {ch, a, segs: res.segs.map(s => Object.assign(s, {t0: ch.t(a + s.i0), t1: ch.t(a + s.i1)})), ref: res.ref, prof: rp};
    const lv = [...new Set(res.segs.map(s => s.level))].sort((p, q) => p - q), col = L => SUBPAL[lv.indexOf(L) % SUBPAL.length];
    S.plot.bands = res.segs.map(s => ({x0: s.t0, x1: s.t1, color: col(s.level)})); S.plot.invalidate();
    $('#lvInfo').textContent = !res.segs.length ? 'Plato bulunamadı (kısa plato süresini veya pencereyi küçültün, adımı kontrol edin).' :
      `Referans (0 dB): ${res.ref.toPrecision(4)} Grms${rp ? ' (profil)' : ' (en yüksek seviye)'}\n` + res.segs.map(s => `${lvTxt(s.level).padStart(7)}  ${s.t0.toFixed(2)}–${s.t1.toFixed(2)} s  (${(s.t1 - s.t0).toFixed(1)} s)  ${s.grms.toPrecision(4)} Grms  [ölçülen ${s.db.toFixed(1)} dB]`).join('\n');
  });
}
async function lvSpectra() {
  if (!S.levels || !S.levels.segs.length) { await lvDetect(); if (!S.levels || !S.levels.segs.length) return; }
  await busy('Seviye başına spektrum…', async () => {
    const {ch, a, segs, prof} = S.levels, o = {nfft: +sv('spN'), win: sv('spWin'), overlap: +sv('spOv'), scale: 'psd', maxSeg: 4000}, ys = sv('spY'), P = S.specPlot; P.axes.slice().forEach(x => P.removeAxes(x));
    const sa = P.addAxes({xlog: sv('spX') === 'log', ylog: ys === 'log', title: ch.name + ' — seviye başına PSD'}); sa.isDb = ys === 'db'; const ku = ch.unit || (ch.kind === 'vib' ? 'g' : 'birim');
    sa.ylabel = ys === 'db' ? `PSD (dB re 1 ${ku}²/Hz)` : `PSD (${ku}²/Hz)`; sa.xlabel = 'Frekans (Hz)';
    const lv = [...new Set(segs.map(s => s.level))].sort((p, q) => p - q), col = L => SUBPAL[lv.indexOf(L) % SUBPAL.length];
    for (const s of segs) {
      const seg = DSP.segment(ch.data, ch.del, a + s.i0, a + s.i1); if (seg.length < 256) continue; const r = DSP.welch(seg, ch.fs, o);
      const y = ys === 'db' ? r.y.map(v => 10 * Math.log10(v + 1e-300)) : r.y;
      sa.traces.push({kind: 'xy', x: r.f, y, label: `${lvTxt(s.level)}  (${s.t0.toFixed(1)}–${s.t1.toFixed(1)} s)`, color: col(s.level), width: 1, visible: true, raw: r.y, scale: 'psd', df: r.df, srcKind: ch.kind, level: s.level});
    }
    if (prof) for (const L of lv) { const t = profTrace(prof, Math.pow(10, L / 10), `${prof.name} @ ${lvTxt(L)}`, col(L), [6, 4]); t.fixedExtra = ' — ' + (profGrms(prof.pts) * Math.pow(10, L / 20)).toPrecision(4) + ' Grms'; if (sa.isDb) t.y = t.y.map(v => 10 * Math.log10(v)); sa.traces.push(t); }
    specFit(); if (prof) profCompare(prof, 'auto');
  });
}
function profList() {
  if (!S.profiles.length) return h('div', {class: 'note'}, 'Kayıtlı profil yok.');
  return h('div', null, S.profiles.map(p => h('div', {class: 'trace'}, h('i', {class: 'dot', style: 'background:' + p.color}), h('span', {class: 'nm', title: p.name}, p.name), h('span', {class: 'meta'}, profGrms(p.pts).toFixed(2) + ' Grms'),
    h('button', {title: 'Grafiğe ekle', onclick: () => profShow(p)}, '+'), h('button', {title: 'Karşılaştır', onclick: () => profCompare(p)}, '≈'), h('button', {title: 'Düzenle', onclick: () => profDialog(p)}, '✎'),
    h('button', {title: 'Sil', onclick: () => { S.profiles = S.profiles.filter(x => x !== p); saveProfiles(); for (const ax of S.specPlot.axes) ax.traces = ax.traces.filter(t => t.profileId !== p.id); S.specPlot.invalidate(); refreshUnvPanel(); }}, '×'))));
}
function refreshUnvPanel() { const b = $('#profBox'); if (b) b.replaceChildren(profList()); const r = $('#lvRef'); if (r) fillLvRef(r); }
function buildUnv() {
  const r = h('div');
  r.append(card('UNV dosyaları', h('div', {class: 'note'}, 'UNV (dataset 58) dosyasını "Dosya aç…" ile veya pencereye sürükleyerek açın. Kanal sayısı dosyadan okunur; kompleks kanallar Genlik/Faz/Re/Im olarak gelir. Kanalları soldan çift tıklayarak spektrum grafiğine ekleyin.'),
    h('div', {class: 'btns'}, btn('Kanal tablosu…', unvTableDialog, 'primary'), btn('Spektrum grafiğini temizle', specClear), btn('Excel\'e aktar', unvExcel))));
  r.append(resonanceCard());
  r.append(card('Profiller', h('div', {class: 'btns', style: 'margin-top:0'}, btn('+ Profil ekle…', () => profDialog(null), 'primary')), h('div', {id: 'profBox'}, profList()),
    h('div', {class: 'note'}, 'Profil log-log eksende çizilir (± tolerans kesikli). "≈" ile spektrum grafiğindeki ölçümler profille karşılaştırılır. Profiller bu bilgisayardaki tarayıcı deposunda saklanır. Welch spektrumuyla karşılaştırmak için Analiz sekmesinde "PSD" ve Y ekseni "Logaritmik" seçin.')));
  return r;
}
