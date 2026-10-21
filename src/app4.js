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
function profCompare(p) {
  const P = S.specPlot, rows = []; const lo = p.pts[0][0], hi = p.pts[p.pts.length - 1][0], tol = p.tol;
  for (const ax of P.axes) for (const t of ax.traces) {
    if (t.profileId || !t.visible) continue; if (t.scale !== 'psd') { rows.push({name: t.label, skip: 'PSD değil (atlandı)'}); continue; }
    const x = t.x, y = t.raw || t.y; let mx = -Infinity, mn = Infinity, fmx = 0, fmn = 0, out = 0, n = 0, s = 0, px = -1, py = 0;
    for (let i = 0; i < x.length; i++) {
      if (x[i] < lo || x[i] > hi || !(y[i] > 0)) continue; const db = 10 * Math.log10(y[i] / profAt(p.pts, x[i])); n++;
      if (db > mx) { mx = db; fmx = x[i]; } if (db < mn) { mn = db; fmn = x[i]; } if (Math.abs(db) > tol) out++;
      if (px >= 0) s += (y[i] + py) / 2 * (x[i] - px); px = x[i]; py = y[i];
    }
    if (!n) { rows.push({name: t.label, skip: 'profil aralığında nokta yok'}); continue; }
    rows.push({name: t.label, n, grms: Math.sqrt(s), pg: profGrms(p.pts, x.find(v => v >= lo) ?? lo, Math.min(hi, x[x.length - 1])), mx, fmx, mn, fmn, out: 100 * out / n});
  }
  if (!rows.length) return toast('Spektrum grafiğinde karşılaştırılacak iz yok');
  const f = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '-';
  const tb = h('tbody', null, rows.map(r => r.skip ? h('tr', null, h('td', null, r.name), h('td', {colspan: 7, class: 'muted'}, r.skip)) :
    h('tr', null, h('td', null, r.name), h('td', null, f(r.grms, 3)), h('td', null, f(r.pg, 3)), h('td', null, f(20 * Math.log10(r.grms / r.pg), 2)), h('td', null, f(r.mx) + ' @ ' + fmtNum(r.fmx, 5)), h('td', null, f(r.mn) + ' @ ' + fmtNum(r.fmn, 5)), h('td', null, f(r.out, 1)),
      h('td', null, r.mx <= tol && r.mn >= -tol ? 'Tolerans içinde' : r.mx > tol ? 'ÜST AŞIM' : 'Alt sapma'))));
  const body = h('div', null, h('div', {class: 'note'}, `${p.name}: ±${tol} dB tolerans, ${fmtNum(lo, 5)}–${fmtNum(hi, 5)} Hz. Fark = 10·log10(ölçüm/profil) her frekans noktasında.`),
    h('div', {style: 'overflow:auto'}, h('table', {class: 'ftab'}, h('thead', null, h('tr', null, ['İz', 'Grms (ölçüm)', 'Grms (profil)', 'Fark (dB)', 'En büyük fark (dB)', 'En küçük fark (dB)', 'Tolerans dışı %', 'Sonuç'].map(x => h('th', null, x)))), tb)));
  modal('Profil karşılaştırması', body, [{t: 'Kapat'}]);
}
function profList() {
  if (!S.profiles.length) return h('div', {class: 'note'}, 'Kayıtlı profil yok.');
  return h('div', null, S.profiles.map(p => h('div', {class: 'trace'}, h('i', {class: 'dot', style: 'background:' + p.color}), h('span', {class: 'nm', title: p.name}, p.name), h('span', {class: 'meta'}, profGrms(p.pts).toFixed(2) + ' Grms'),
    h('button', {title: 'Grafiğe ekle', onclick: () => profShow(p)}, '+'), h('button', {title: 'Karşılaştır', onclick: () => profCompare(p)}, '≈'), h('button', {title: 'Düzenle', onclick: () => profDialog(p)}, '✎'),
    h('button', {title: 'Sil', onclick: () => { S.profiles = S.profiles.filter(x => x !== p); saveProfiles(); for (const ax of S.specPlot.axes) ax.traces = ax.traces.filter(t => t.profileId !== p.id); S.specPlot.invalidate(); refreshUnvPanel(); }}, '×'))));
}
function refreshUnvPanel() { const b = $('#profBox'); if (b) b.replaceChildren(profList()); }
function buildUnv() {
  const r = h('div');
  r.append(card('UNV dosyaları', h('div', {class: 'note'}, 'UNV (dataset 58) dosyasını "Dosya aç…" ile veya pencereye sürükleyerek açın. Kanal sayısı dosyadan okunur; kompleks kanallar Genlik/Faz/Re/Im olarak gelir. Kanalları soldan çift tıklayarak spektrum grafiğine ekleyin.'),
    h('div', {class: 'btns'}, btn('Kanal tablosu…', unvTableDialog, 'primary'), btn('Spektrum grafiğini temizle', specClear), btn('Excel\'e aktar', unvExcel))));
  r.append(card('Profiller', h('div', {class: 'btns', style: 'margin-top:0'}, btn('+ Profil ekle…', () => profDialog(null), 'primary')), h('div', {id: 'profBox'}, profList()),
    h('div', {class: 'note'}, 'Profil log-log eksende çizilir (± tolerans kesikli). "≈" ile spektrum grafiğindeki ölçümler profille karşılaştırılır. Profiller bu bilgisayardaki tarayıcı deposunda saklanır. Welch spektrumuyla karşılaştırmak için Analiz sekmesinde "PSD" ve Y ekseni "Logaritmik" seçin.')));
  return r;
}
