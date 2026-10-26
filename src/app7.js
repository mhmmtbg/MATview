/* ===== CSV / Excel tablo içe aktarma + zaman serisi / özellik (regresyon) verisi ayrımı ===== */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const head = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 8); let delim = ',', bs = -1;
  for (const d of [';', '\t', '|', ',']) { const c = head.map(l => l.split(d).length - 1); const sc = c[0] > 0 && c.every(x => x === c[0]) ? c[0] : (c[0] > 0 ? 0.5 : -1); if (sc > bs) { bs = sc; delim = d; } }
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0].trim() !== '') rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return {rows, delim};
}
async function readTextSmart(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', {fatal: true}).decode(buf); } catch (e) { return new TextDecoder('windows-1254').decode(buf); }
}
const NUMRE = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/;
function toNum(v) {
  if (typeof v === 'number') return v; if (v == null) return NaN; const s = String(v).trim(); if (s === '') return NaN;
  if (NUMRE.test(s)) return parseFloat(s.replace(',', '.')); const l = s.toLowerCase(); if (l === 'nan' || l === 'na' || l === '-' || l === 'null') return NaN;
  return Number(s);
}
function toDateSec(v) { if (typeof v === 'number') return NaN; const s = String(v).trim(); if (!/\d/.test(s) || !/[-\/:.]/.test(s) || NUMRE.test(s)) return NaN; let t = Date.parse(s); if (isNaN(t)) { const m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/.exec(s); if (m) t = new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7] ? Math.round(+('0.' + m[7]) * 1000) : 0).getTime(); } return isNaN(t) ? NaN : t / 1000; }
const NMX = (name, re) => re.test(name);
function guessKind(name, unit) {
  const s = (name + ' ' + unit).toLowerCase();
  if (/sicak|temp|°c|\bdeg ?c/.test(s)) return 'temp'; if (/bas[ıi]n|press|\bbar\b|\bpsi\b|\bpa\b/.test(s)) return 'press'; if (/ivme|accel|titre|vib|\bg\b|\bgrms\b/.test(s)) return 'vib';
  if (/akustik|acoust|\bspl\b|ses\b/.test(s)) return 'ac'; if (/volt|gerilim|\bv\b/.test(s)) return 'volt'; if (/ak[ıi]m|amper|current|\ba\b/.test(s)) return 'curr'; if (/gerinim|strain/.test(s)) return 'strain';
  return 'other';
}
const cleanName = s => String(s).trim().replace(/[^A-Za-z0-9_À-ɏ]+/g, '_').replace(/^_+|_+$/g, '') || 'sutun';
function analyzeSheet(T) {
  const sh = T.sheets[T.si], rows = sh.rows.filter(r => r && r.some(v => v != null && String(v).trim() !== '')); T.nrows = rows.length;
  const ncol = Math.min(2000, rows.reduce((m, r) => Math.max(m, r.length), 0));
  const isNum = v => typeof v === 'number' || NUMRE.test(String(v == null ? '' : v).trim()) || (v != null && String(v).trim() !== '' && isFinite(Number(String(v).trim())));
  if (T.header === undefined) { const a = rows[0] || [], b = rows[1] || []; const aTxt = a.filter(v => v != null && String(v).trim() !== '' && !isNum(v)).length, bNum = b.filter(isNum).length; T.header = aTxt > 0 && (bNum >= Math.max(1, b.length / 2) || aTxt >= a.length / 2); }
  const start = T.header ? 1 : 0, cols = [], used = new Set();
  for (let c = 0; c < ncol; c++) {
    const raw = []; for (let r = start; r < rows.length; r++) raw.push(rows[r][c]);
    const smp = raw.filter(v => v != null && String(v).trim() !== '').slice(0, 2000); const nn = smp.filter(isNum).length, nd = smp.filter(v => !isNum(v) && !isNaN(toDateSec(v))).length;
    const kind = !smp.length ? 'text' : nn >= smp.length * 0.9 ? 'num' : nd >= smp.length * 0.9 ? 'date' : 'text';
    let nm = T.header && rows[0][c] != null && String(rows[0][c]).trim() !== '' ? String(rows[0][c]).trim() : 'Sütun' + (c + 1), unit = '';
    const m = /^(.*?)\s*[\(\[]([^\)\]]*)[\)\]]\s*$/.exec(nm); if (m && m[1]) { nm = m[1].trim(); unit = m[2].trim(); }
    let base = cleanName(nm), k = base, i = 2; while (used.has(k)) k = base + '_' + i++; used.add(k);
    cols.push({i: c, title: nm, name: k, unit, kind, raw, use: kind !== 'text'});
  }
  T.cols = cols;
  const tc = cols.findIndex(c => c.kind === 'date' || (c.kind === 'num' && /^(t|time|zaman|s[uü]re|timestamp|tarih|date|saat)(\b|_)|\(s\)|\[s\]|^t\(/i.test(c.title + (c.unit ? '(' + c.unit + ')' : ''))));
  const nums = cols.filter(c => c.kind === 'num').length, c0 = cols[0] && cols[0].kind === 'num' ? numsOf(cols[0]) : null;
  let uni = false; if (c0 && c0.length > 3) { const dt = c0[1] - c0[0]; uni = dt > 0 && c0.every((v, i) => i === 0 || Math.abs(v - c0[i - 1] - dt) <= 1e-6 * Math.abs(dt) + 1e-12); }
  T.tcol = tc >= 0 ? tc : (uni && nums > 1 && !/\b(id|no|sira|index)\b/i.test(cols[0].title) ? 0 : -1);
  T.dtype = tc >= 0 || nums <= 1 ? 'time' : (T.tcol === 0 ? 'time' : 'feature');
  T.tunit = T.tunit || (cols[T.tcol] && /\(ms\)|\[ms\]|msn|milisaniye/i.test(cols[T.tcol].title + cols[T.tcol].unit) ? 'ms' : 's'); T.fs = T.fs || 1; T.why = tc >= 0 ? 'Zaman sütunu bulundu: "' + cols[tc].title + '"' : T.dtype === 'feature' ? 'Zaman benzeri sütun yok, birden çok sayısal sütun var' : 'Tek sayısal sütun / düzgün artan ilk sütun';
}
function numsOf(col) { if (!col._n) { const o = new Float64Array(col.raw.length); for (let i = 0; i < o.length; i++) o[i] = col.kind === 'date' ? toDateSec(col.raw[i]) : toNum(col.raw[i]); col._n = o; } return col._n; }
async function tableOpen(file, sheets) {
  const T = {name: file.name, si: 0};
  try {
    if (sheets) T.sheets = sheets; else if (/\.xlsx$/i.test(file.name)) T.sheets = await XLSX.read(file);
    else { const p = parseCSV(await readTextSmart(file)); T.sheets = [{name: 'CSV', rows: p.rows}]; }
    if (!T.sheets.length || !T.sheets.some(s => s.rows && s.rows.length > 1)) throw new Error('Dosyada veri satırı bulunamadı');
    T.si = Math.max(0, T.sheets.findIndex(s => s.rows && s.rows.length > 1)); analyzeSheet(T);
  } catch (e) { console.error(e); toast('Tablo okunamadı: ' + (e.message || e) + ' — .csv, .tsv, .txt veya .xlsx kullanın.', 9000); return; }
  tableDialog(T);
}
function tableDialog(T) {
  const dyn = h('div'), body = h('div', null, dyn);
  const R = () => {
    dyn.replaceChildren();
    const num = T.cols.filter(c => c.kind !== 'text');
    dyn.append(h('div', {class: 'fr'}, h('label', null, 'Dosya'), h('b', null, T.name), h('span', {class: 'muted'}, ' · ' + fmtCnt(T.nrows - (T.header ? 1 : 0)) + ' satır · ' + T.cols.length + ' sütun')));
    if (T.sheets.length > 1) dyn.append(fr('Sayfa', h('select', {onchange: e => { T.si = +e.target.value; T.header = undefined; analyzeSheet(T); R(); }}, T.sheets.map((s, i) => h('option', {value: i, selected: i === T.si}, s.name + ' (' + (s.rows || []).length + ' satır)')))));
    dyn.append(h('div', {class: 'fr chk'}, h('label', null, 'İlk satır sütun başlığı'), h('input', {type: 'checkbox', checked: T.header, onchange: e => { T.header = e.target.checked; analyzeSheet(T); R(); }})));
    dyn.append(h('div', {class: 'note'}, 'Otomatik tür: ' + (T.dtype === 'time' ? 'ZAMAN SERİSİ' : 'ÖZELLİK / REGRESYON VERİSİ') + ' — ' + T.why + '. Gerekirse değiştirin.'));
    dyn.append(fr('Veri türü', h('select', {onchange: e => { T.dtype = e.target.value; R(); }}, h('option', {value: 'time', selected: T.dtype === 'time'}, 'Zaman serisi (zamana bağlı sinyal) → Zaman grafiği'), h('option', {value: 'feature', selected: T.dtype === 'feature'}, 'Özellik / regresyon (zamandan bağımsız) → Dağılım grafiği'))));
    if (T.dtype === 'time') {
      dyn.append(fr('Zaman sütunu', h('select', {onchange: e => { T.tcol = +e.target.value; R(); }}, h('option', {value: -1, selected: T.tcol < 0}, '— yok (örnek sırası, sabit fs) —'), num.map(c => h('option', {value: c.i, selected: c.i === T.tcol}, c.title + (c.kind === 'date' ? ' (tarih/saat)' : ''))))));
      if (T.tcol >= 0 && T.cols[T.tcol].kind === 'num') dyn.append(fr('Zaman birimi', selIn('tbTU', [['s', 'saniye'], ['ms', 'milisaniye'], ['us', 'mikrosaniye'], ['min', 'dakika'], ['h', 'saat']], T.tunit)));
      if (T.tcol < 0) dyn.append(fr('Örnekleme fs (Hz)', numIn('tbFs', T.fs, {min: 1e-9})));
      const tv = T.tcol >= 0 ? tmeta(T) : null; if (tv) dyn.append(h('div', {class: 'note'}, tv));
    }
    const tb = h('table', {class: 'ftab'}), hd = h('tr', null, ...['Al', 'Sütun', 'Ad (formülde)', 'Birim', 'Tür', 'Aralık', 'Örnek'].map(x => h('th', null, x)));
    tb.append(h('thead', null, hd));
    for (const c of T.cols) {
      const isT = T.dtype === 'time' && c.i === T.tcol, v = c.kind !== 'text' ? numsOf(c) : null; let lo = Infinity, hi = -Infinity, nan = 0; if (v) for (let i = 0; i < v.length; i++) { const x = v[i]; if (!isFinite(x)) { nan++; continue; } if (x < lo) lo = x; if (x > hi) hi = x; }
      tb.append(h('tr', null, h('td', null, h('input', {type: 'checkbox', checked: c.use && !isT, disabled: c.kind === 'text' || isT, onchange: e => { c.use = e.target.checked; }})), h('td', null, c.title), h('td', null, h('input', {type: 'text', value: c.name, style: 'width:110px', onchange: e => { c.name = cleanName(e.target.value); e.target.value = c.name; }})),
        h('td', null, h('input', {type: 'text', value: c.unit, style: 'width:50px', onchange: e => { c.unit = e.target.value.trim(); }})), h('td', null, isT ? 'zaman' : c.kind === 'num' ? 'sayısal' : c.kind === 'date' ? 'tarih' : 'metin (atlanır)'),
        h('td', {class: 'muted'}, v && isFinite(lo) ? fmtNum(lo, 5) + ' … ' + fmtNum(hi, 5) + (nan ? ' · ' + nan + ' boş' : '') : '—'), h('td', {class: 'muted'}, String(c.raw[0] ?? '').slice(0, 14))));
    }
    dyn.append(h('div', {style: 'overflow:auto;max-height:260px;margin-top:6px'}, tb));
  };
  const tmeta = T => {
    const c = T.cols[T.tcol], v = numsOf(c), k = c.kind === 'date' ? 1 : {s: 1, ms: 1e-3, us: 1e-6, min: 60, h: 3600}[T.tunit] || 1, d = []; for (let i = 1; i < v.length; i++) { const x = (v[i] - v[i - 1]) * k; if (x > 0) d.push(x); }
    if (!d.length) return 'Uyarı: zaman sütunu artan değil.'; d.sort((a, b) => a - b); const md = d[d.length >> 1], uni = d.length >= v.length * 0.9 && d.every(x => Math.abs(x - md) <= 0.02 * md);
    return 'Örnekleme aralığı ' + fmtNum(md, 6) + ' s (fs ≈ ' + fmtNum(1 / md, 6) + ' Hz) · ' + (uni ? 'düzenli' : 'DÜZENSİZ zaman damgaları (olduğu gibi korunur; spektrum için fs yaklaşıktır)');
  };
  R();
  modal('Tablo içe aktar — ' + T.name, body, [{t: 'İçe aktar', primary: true, fn: () => { try { if ($('#tbTU')) T.tunit = sv('tbTU'); if ($('#tbFs')) T.fs = num('tbFs'); tableImport(T); } catch (e) { toast('İçe aktarma hatası: ' + e.message, 8000); return false; } }}, {t: 'İptal'}]);
}
function tableImport(T) {
  const use = T.cols.filter(c => c.use && c.kind !== 'text' && !(T.dtype === 'time' && c.i === T.tcol)); if (!use.length) throw new Error('En az bir sayısal sütun seçin');
  const n = T.cols[0].raw.length, f = {id: 'f' + (importFile.seq++), name: T.name + (T.sheets.length > 1 ? ' [' + T.sheets[T.si].name + ']' : ''), table: true, feature: T.dtype === 'feature', mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: 1, baseFs: 1, cnts: {}, baseN: n, cols: []};
  let order = null, t = null, t0 = 0, dt = 1, uni = true;
  if (T.dtype === 'time' && T.tcol >= 0) {
    const c = T.cols[T.tcol], k = c.kind === 'date' ? 1 : {s: 1, ms: 1e-3, us: 1e-6, min: 60, h: 3600}[T.tunit] || 1, raw = numsOf(c); t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = raw[i] * k;
    let ok = true; for (let i = 1; i < n; i++) if (!(t[i] >= t[i - 1])) { ok = false; break; }
    if (!ok) { order = Array.from({length: n}, (_, i) => i).filter(i => isFinite(t[i])).sort((a, b) => t[a] - t[b]); t = Float64Array.from(order.map(i => t[i])); }
    const d = []; for (let i = 1; i < t.length; i++) if (t[i] > t[i - 1]) d.push(t[i] - t[i - 1]); if (!d.length) throw new Error('Zaman sütunu artan değil');
    d.sort((a, b) => a - b); dt = +d[d.length >> 1].toPrecision(9); uni = d.length >= t.length * 0.9 && d.every(x => Math.abs(x - dt) <= 0.02 * dt); t0 = t[0];
  } else if (T.dtype === 'time') { dt = 1 / (T.fs || 1); }
  for (const c of use) {
    let v = Float64Array.from(numsOf(c)); if (order) v = Float64Array.from(order.map(i => v[i]));
    const col = {name: c.name, unit: c.unit, data: v}; f.cols.push(col);
    const ch = new Channel({name: c.name, rest: c.name, base: c.name, comp: '', dev: 'Sütunlar', kind: f.feature ? 'feat' : guessKind(c.title, c.unit), n: v.length, file: f, label: c.name, varIdx: -1, unit: c.unit, tbl: true, binLoad: async () => col.data});
    if (f.feature) { ch.dtS = 1; ch.t0 = 0; } else if (t && !uni) { ch.g = Float64Array.from(t, x => (x - t0) / dt); ch.spp = 1; ch.Tpkt = dt; ch.t0 = t0; } else { ch.dtS = dt; ch.t0 = t0; ch.spp = 1; ch.Tpkt = dt; }
    ch.data = v; f.channels.push(ch);
  }
  S.files.push(f); S.fopen.add(f.id); S.open.add(f.id + '/Sütunlar'); renderChips(); renderTree();
  if (f.feature) { S.feat = {fid: f.id, x: '__idx', ys: new Set([f.cols[Math.min(1, f.cols.length - 1)].name]), type: 'scatter', fit: 'none', deg: 2, resid: false, color: '', bins: 0}; if (f.cols.length > 1) S.feat.x = f.cols[0].name; syncFeatUI(); setTab('feat'); featPlot(); }
  else { const first = f.channels.slice(0, 4); if (!S.plot.axes.length) addToNewAxes(first, false); toast(f.name + ': ' + f.channels.length + ' kanal · fs ' + fmtNum(f.channels[0].fs, 5) + ' Hz'); }
}

/* ---------- Özellik / regresyon görünümü ---------- */
function featFile() { return S.feat && S.files.find(x => x.id === S.feat.fid && x.feature); }
function syncFeatUI() {
  const has = S.files.some(f => f.feature), tabb = document.querySelector('#rtabs button[data-t=feat]'), vt = document.querySelector('#viewtabs button[data-v=xy]');
  const vis = has || S.xyKeep; if (tabb) tabb.classList.toggle('hidden', !has); if (vt) vt.classList.toggle('hidden', !vis);
  if (!vis && S.view === 'xy') switchView('time'); if (!has && S.tab === 'feat') setTab('traces');
  if (has && !featFile()) { const f = S.files.find(x => x.feature); S.feat = {fid: f.id, x: f.cols[0].name, ys: new Set([f.cols[Math.min(1, f.cols.length - 1)].name]), type: 'scatter', fit: 'none', deg: 2, resid: false, color: '', bins: 0}; }
  refreshFeatUI();
}
function buildFeat() { return h('div', null, h('div', {id: 'featBody'})); }
function refreshFeatUI() {
  const box = $('#featBody'); if (!box) return; box.replaceChildren(); const f = featFile(); if (!f) { box.append(h('div', {class: 'note'}, 'Zamandan bağımsız (özellik/regresyon) veri yok. “Aç ▸ Tablo (CSV / Excel)…” ile bir tablo içe aktarın.')); return; }
  const F = S.feat, fl = S.files.filter(x => x.feature), cols = f.cols;
  if (fl.length > 1) box.append(card('Veri kümesi', fr('Tablo', h('select', {onchange: e => { const g = fl.find(x => x.id === e.target.value); S.feat = {fid: g.id, x: g.cols[0].name, ys: new Set([g.cols[Math.min(1, g.cols.length - 1)].name]), type: 'scatter', fit: 'none', deg: 2, resid: false, color: '', bins: 0}; refreshFeatUI(); }}, fl.map(x => h('option', {value: x.id, selected: x.id === F.fid}, x.name))))));
  const ylist = h('div', {style: 'max-height:150px;overflow:auto;border:1px solid var(--border);border-radius:4px;padding:4px'});
  for (const c of cols) ylist.append(h('div', {class: 'fr chk', style: 'margin:1px 0'}, h('label', {for: 'fy_' + c.name}, c.name + (c.unit ? ' [' + c.unit + ']' : '')), h('input', {type: 'checkbox', id: 'fy_' + c.name, checked: F.ys.has(c.name), onchange: e => { e.target.checked ? F.ys.add(c.name) : F.ys.delete(c.name); }})));
  box.append(card('Veri: ' + f.name + ' (' + fmtCnt(f.cols[0].data.length) + ' satır)',
    fr('X (bağımsız)', h('select', {id: 'fX', onchange: e => { F.x = e.target.value; }}, h('option', {value: '__idx', selected: F.x === '__idx'}, 'Satır numarası'), cols.map(c => h('option', {value: c.name, selected: c.name === F.x}, c.name)))), h('div', {class: 'note'}, 'Y (bağımlı / hedef) sütunlar:'), ylist,
    fr('Renk sütunu', h('select', {onchange: e => { F.color = e.target.value; }}, h('option', {value: '', selected: !F.color}, '— yok —'), cols.map(c => h('option', {value: c.name, selected: c.name === F.color}, c.name))))));
  box.append(card('Grafik ve regresyon',
    fr('Grafik türü', h('select', {onchange: e => { F.type = e.target.value; refreshFeatUI(); }}, [['scatter', 'Dağılım (nokta)'], ['line', 'Çizgi (X’e göre sıralı)'], ['both', 'Çizgi + nokta'], ['hist', 'Histogram (Y sütunları)']].map(([v, t]) => h('option', {value: v, selected: F.type === v}, t)))),
    F.type === 'hist' ? fr('Kutu sayısı', h('input', {type: 'number', min: 0, step: 1, value: F.bins, title: '0 = otomatik (Sturges)', onchange: e => { F.bins = +e.target.value | 0; }})) : null,
    F.type !== 'hist' ? fr('Regresyon', h('select', {onchange: e => { F.fit = e.target.value; refreshFeatUI(); }}, [['none', 'Yok'], ['linear', 'Doğrusal  y = a + b·x'], ['poly', 'Polinom (derece)'], ['exp', 'Üstel  y = a·e^(b·x)'], ['power', 'Güç  y = a·x^b'], ['log', 'Logaritmik  y = a + b·ln x']].map(([v, t]) => h('option', {value: v, selected: F.fit === v}, t)))) : null,
    F.fit === 'poly' && F.type !== 'hist' ? fr('Derece', h('input', {type: 'number', min: 2, max: 8, step: 1, value: F.deg, onchange: e => { F.deg = Math.max(2, Math.min(8, +e.target.value | 0)); }})) : null,
    F.fit !== 'none' && F.type !== 'hist' ? h('div', {class: 'fr chk'}, h('label', {for: 'fRes'}, 'Artık (residual) grafiği ekle'), h('input', {type: 'checkbox', id: 'fRes', checked: F.resid, onchange: e => { F.resid = e.target.checked; }})) : null,
    h('div', {class: 'btns'}, btn('Çiz', featPlot, 'primary'), btn('Korelasyon matrisi', featCorr), btn('Sütun istatistikleri', featStats)),
    h('pre', {id: 'featInfo', class: 'note', style: 'white-space:pre-wrap;margin:6px 0 0'})));
}
function polySolve(x, y, deg) {
  const n = x.length; let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; }
  const mid = (lo + hi) / 2, sc = (hi - lo) / 2 || 1, m = deg, K = 2 * m + 1, S2 = new Float64Array(K), B = new Float64Array(m + 1);
  for (let i = 0; i < n; i++) { const t = (x[i] - mid) / sc; let p = 1; for (let k = 0; k < K; k++) { S2[k] += p; if (k <= m) B[k] += y[i] * p; p *= t; } }
  const A = []; for (let r = 0; r <= m; r++) { A.push([]); for (let c = 0; c <= m; c++) A[r].push(S2[r + c]); A[r].push(B[r]); }
  for (let c = 0; c <= m; c++) { let pv = c; for (let r = c + 1; r <= m; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r; [A[c], A[pv]] = [A[pv], A[c]]; const d = A[c][c] || 1e-300; for (let r = 0; r <= m; r++) if (r !== c) { const q = A[r][c] / d; for (let k = c; k <= m + 1; k++) A[r][k] -= q * A[c][k]; } }
  const co = A.map((r, i) => r[m + 1] / (r[i] || 1e-300));
  // t'ye göre katsayıları x'e çevir: sadece değerlendirme fonksiyonu veriyoruz; doğrusal için a,b ayrıca hesaplanır
  const ev = xv => { const t = (xv - mid) / sc; let s = 0; for (let k = m; k >= 0; k--) s = s * t + co[k]; return s; };
  let a = null, b = null; if (m === 1) { b = co[1] / sc; a = co[0] - co[1] * mid / sc; }
  return {ev, a, b};
}
function fitXY(x, y, type, deg) {
  const X = [], Y = []; for (let i = 0; i < x.length; i++) { let ok = isFinite(x[i]) && isFinite(y[i]); if (ok && (type === 'power' || type === 'log') && !(x[i] > 0)) ok = false; if (ok && (type === 'exp' || type === 'power') && !(y[i] > 0)) ok = false; if (ok) { X.push(x[i]); Y.push(y[i]); } }
  if (X.length < 3) throw new Error('Yeterli geçerli nokta yok' + (type !== 'linear' && type !== 'poly' ? ' (bu model için x/y > 0 olmalı)' : ''));
  const g = v => +v.toPrecision(4); let pred, eq;
  if (type === 'linear') { const p = polySolve(X, Y, 1); pred = p.ev; eq = `y = ${g(p.a)} + ${g(p.b)}·x`; }
  else if (type === 'poly') { const p = polySolve(X, Y, deg); pred = p.ev; eq = 'polinom derece ' + deg; }
  else if (type === 'exp') { const p = polySolve(X, Y.map(Math.log), 1); pred = v => Math.exp(p.ev(v)); eq = `y = ${g(Math.exp(p.a))}·e^(${g(p.b)}·x)`; }
  else if (type === 'power') { const p = polySolve(X.map(Math.log), Y.map(Math.log), 1); pred = v => Math.exp(p.ev(Math.log(v))); eq = `y = ${g(Math.exp(p.a))}·x^${g(p.b)}`; }
  else { const p = polySolve(X.map(Math.log), Y, 1); pred = v => p.ev(Math.log(v)); eq = `y = ${g(p.a)} + ${g(p.b)}·ln x`; }
  let m = 0; for (const v of Y) m += v; m /= Y.length; let ssr = 0, sst = 0; for (let i = 0; i < Y.length; i++) { const e = Y[i] - pred(X[i]); ssr += e * e; sst += (Y[i] - m) ** 2; }
  return {pred, eq, r2: sst > 0 ? 1 - ssr / sst : 1, rmse: Math.sqrt(ssr / Y.length), n: Y.length, x0: Math.min(...X), x1: Math.max(...X)};
}
function featPlot() {
  const f = featFile(); if (!f) return; const F = S.feat, P = S.xyPlot, info = [];
  const col = n => f.cols.find(c => c.name === n), N = f.cols[0].data.length, ys = f.cols.filter(c => F.ys.has(c.name)); if (!ys.length) return toast('En az bir Y sütunu seçin');
  const xc = F.x === '__idx' ? null : col(F.x), xdata = xc ? xc.data : Float64Array.from({length: N}, (_, i) => i + 1), xname = xc ? xc.name + (xc.unit ? ' (' + xc.unit + ')' : '') : 'Satır numarası';
  P.axes.slice().forEach(a => P.removeAxes(a)); P.linkX = true;
  const ax = P.addAxes({xlabel: xname, ylabel: ys.length === 1 ? ys[0].name + (ys[0].unit ? ' (' + ys[0].unit + ')' : '') : ys.map(c => c.unit).filter((v, i, a) => v && a.indexOf(v) === i).join(', ')}), cc = F.color ? col(F.color) : null;
  let rax = null;
  const palette = ['#0072BD', '#D95319', '#77AC30', '#7E2F8E', '#EDB120', '#4DBEEE', '#A2142F'];
  if (F.type === 'hist') {
    ax.xlabel = ys.length === 1 ? ys[0].name : 'Değer'; ax.ylabel = 'Adet';
    let lo = Infinity, hi = -Infinity; for (const c of ys) for (const v of c.data) if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    ys.forEach((c, k) => {
      const v = Array.from(c.data).filter(isFinite), nb = F.bins > 0 ? F.bins : Math.max(5, Math.ceil(Math.log2(v.length) + 1)), w = (hi - lo) / nb || 1, cnt = new Float64Array(nb), cx = new Float64Array(nb);
      for (let i = 0; i < nb; i++) cx[i] = lo + (i + 0.5) * w; for (const e of v) cnt[Math.min(nb - 1, Math.floor((e - lo) / w))]++;
      ax.traces.push({kind: 'xy', x: cx, y: cnt, bars: w, label: c.name, color: palette[k % palette.length], width: 1, visible: true}); info.push(`${c.name}: ${v.length} değer, ${nb} kutu, aralık ${fmtNum(lo, 5)} … ${fmtNum(hi, 5)}`);
    });
  } else {
    ys.forEach((c, k) => {
      const color = palette[k % palette.length], x = xdata, y = c.data;
      let sx = x, sy = y; if (F.type !== 'scatter') { const idx = Array.from({length: N}, (_, i) => i).filter(i => isFinite(x[i]) && isFinite(y[i])).sort((a, b) => x[a] - x[b]); sx = Float64Array.from(idx.map(i => x[i])); sy = Float64Array.from(idx.map(i => y[i])); }
      if (F.type !== 'line') { const t = {kind: 'xy', x, y, marker: true, msize: 4, label: c.name, color, width: 1, visible: true}; if (cc) { let lo = Infinity, hi = -Infinity; for (const v of cc.data) if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } t.cval = cc.data; t.cmin = lo; t.cmax = hi; } ax.traces.push(t); }
      if (F.type !== 'scatter') ax.traces.push({kind: 'xy', x: sx, y: sy, label: F.type === 'line' ? c.name : c.name + ' (çizgi)', color, width: 1.2, visible: true});
      if (F.fit !== 'none') {
        try {
          const r = fitXY(x, y, F.fit, F.deg), gx = []; for (let i = 0; i <= 300; i++) { const v = r.x0 + (r.x1 - r.x0) * i / 300; gx.push(v); }
          const gy = gx.map(r.pred); ax.traces.push({kind: 'xy', x: Float64Array.from(gx), y: Float64Array.from(gy), label: `Uyum ${c.name}: ${r.eq}  R²=${+r.r2.toFixed(4)}`, color: '#1b1f24', width: 2, visible: true, dash: k % 2 ? [3, 3] : null});
          info.push(`${c.name} ~ ${xc ? xc.name : 'satır no'}: ${r.eq}\n   R² = ${+r.r2.toFixed(5)} · RMSE = ${+r.rmse.toPrecision(4)} · n = ${r.n}`);
          if (F.resid) { if (!rax) rax = P.addAxes({xlabel: xname, ylabel: 'Artık', title: 'Artıklar (y − uyum)'}); const rx = [], ry = []; for (let i = 0; i < N; i++) if (isFinite(x[i]) && isFinite(y[i]) && !((F.fit === 'power' || F.fit === 'log') && !(x[i] > 0))) { const p = r.pred(x[i]); if (isFinite(p)) { rx.push(x[i]); ry.push(y[i] - p); } } rax.traces.push({kind: 'xy', x: Float64Array.from(rx), y: Float64Array.from(ry), marker: true, msize: 3, label: 'Artık ' + c.name, color, width: 1, visible: true}); }
        } catch (e) { info.push(c.name + ': uyum yapılamadı — ' + e.message); }
      } else if (xc) { const r = pearson(x, y); if (r != null) info.push(`${c.name} ↔ ${xc.name}: korelasyon r = ${+r.toFixed(4)}`); }
    });
  }
  if (cc) info.push('Nokta rengi: ' + cc.name + ' (' + fmtNum(Math.min(...cc.data.filter(isFinite)), 4) + ' → ' + fmtNum(Math.max(...cc.data.filter(isFinite)), 4) + ', koyu mordan sarıya)');
  S.xyPlot.active = ax; switchView('xy'); P.fitAll(); if ($('#featInfo')) $('#featInfo').textContent = info.join('\n');
}
function pearson(a, b) { let n = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) if (isFinite(a[i]) && isFinite(b[i])) { n++; sa += a[i]; sb += b[i]; } if (n < 3) return null; sa /= n; sb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) if (isFinite(a[i]) && isFinite(b[i])) { const x = a[i] - sa, y = b[i] - sb; sab += x * y; saa += x * x; sbb += y * y; } return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null; }
function featCorr() {
  const f = featFile(); if (!f) return; const cols = f.cols;
  const tb = h('table', {class: 'kv', style: 'width:auto'}), hd = h('tr', null, h('th', null, ''), cols.map(c => h('th', {style: 'writing-mode:vertical-rl;transform:rotate(180deg);height:80px'}, c.name)));
  tb.append(hd);
  const col = r => { if (r == null) return 'var(--panel)'; const a = Math.min(1, Math.abs(r)); return r >= 0 ? `color-mix(in srgb, #D95319 ${Math.round(a * 85)}%, var(--panel))` : `color-mix(in srgb, #0072BD ${Math.round(a * 85)}%, var(--panel))`; };
  cols.forEach((ci, i) => tb.append(h('tr', null, h('th', null, ci.name), cols.map((cj, j) => { const r = i === j ? 1 : pearson(ci.data, cj.data); return h('td', {style: 'text-align:center;cursor:pointer;background:' + col(r), title: ci.name + ' ↔ ' + cj.name + (r == null ? '' : '  r = ' + r.toFixed(4)) + '\nTıkla: X=' + cj.name + ', Y=' + ci.name, onclick: () => { if (i === j) return; S.feat.x = cj.name; S.feat.ys = new Set([ci.name]); S.feat.type = 'scatter'; refreshFeatUI(); featPlot(); $('#modal').classList.add('hidden'); }}, r == null ? '–' : r.toFixed(2)); }))));
  modal('Korelasyon matrisi (Pearson r)', h('div', null, h('div', {class: 'note'}, 'Kırmızı: pozitif, mavi: negatif ilişki. Hücreye tıklayınca o çift için dağılım grafiği çizilir.'), h('div', {style: 'overflow:auto'}, tb)), [{t: 'Kapat', primary: true}]);
}
function featStats() {
  const f = featFile(); if (!f) return; const tb = h('table', {class: 'kv'}); tb.append(h('tr', null, ['Sütun', 'n', 'Boş', 'Min', 'Maks', 'Ortalama', 'Std', 'Medyan'].map(x => h('th', null, x))));
  for (const c of f.cols) { const v = Array.from(c.data).filter(isFinite), n = v.length; if (!n) continue; const s = [...v].sort((a, b) => a - b), m = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1)); tb.append(h('tr', null, h('td', null, c.name + (c.unit ? ' [' + c.unit + ']' : '')), h('td', null, n), h('td', null, c.data.length - n), [s[0], s[n - 1], m, sd, s[n >> 1]].map(x => h('td', null, fmtNum(x, 6))))); }
  modal('Sütun istatistikleri — ' + f.name, h('div', {style: 'overflow:auto'}, tb), [{t: 'Kapat', primary: true}]);
}
function featAdd(list) {
  const f = list[0].file; if (!S.feat || S.feat.fid !== f.id) S.feat = {fid: f.id, x: '__idx', ys: new Set(), type: 'scatter', fit: 'none', deg: 2, resid: false, color: '', bins: 0};
  S.feat.ys = new Set(list.map(c => c.name)); if (S.feat.x === '__idx' && f.cols.length > 1) { const other = f.cols.find(c => !S.feat.ys.has(c.name)); if (other && list.length === 1) { S.feat.x = other.name; } }
  setTab('feat'); refreshFeatUI(); featPlot();
}

/* ---------- WAV içe aktarma ---------- */
async function wavOpen(file) {
  await busy('WAV okunuyor: ' + file.name, async () => {
    const w = DSP.parseWav(new Uint8Array(await file.arrayBuffer())), n = w.channels[0].length;
    const f = {id: 'f' + (importFile.seq++), name: file.name, table: true, mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: 1 / w.rate, baseFs: w.rate, cnts: {}, baseN: n, cols: []};
    w.channels.forEach((v, i) => { const nm = w.channels.length === 1 ? 'ses' : 'kanal_' + (i + 1), ch = new Channel({name: nm, rest: nm, base: nm, comp: '', dev: 'Sütunlar', kind: 'other', n, file: f, label: nm, varIdx: -1, unit: '', tbl: true, binLoad: async () => v});
      ch.dtS = 1 / w.rate; ch.t0 = 0; ch.spp = 1; ch.Tpkt = 1 / w.rate; ch.data = v; f.channels.push(ch); f.cols.push({name: nm, unit: '', data: v}); });
    S.files.push(f); S.fopen.add(f.id); S.open.add(f.id + '/Sütunlar'); renderChips(); renderTree(); if (!S.plot.axes.length) addToNewAxes(f.channels.slice(0, 4), false);
    toast(`${file.name}: ${w.channels.length} kanal · ${w.rate} Hz · ${w.bits} bit${w.float ? ' (float)' : ''} · ${fmtNum(n / w.rate, 5)} s`);
  });
}

/* ---------- TDMS içe aktarma ---------- */
function tdmsKind(u) { u = String(u || '').toLowerCase(); if (/^(g|m\/s2|m\/s²)$/.test(u)) return 'vib'; if (u === 'pa') return 'ac'; if (/^(°?c|k|degc)$/.test(u)) return 'temp'; if (/^(bar|psi|kpa|mpa)$/.test(u)) return 'press'; if (/strain|µe|ue|µm\/m/.test(u)) return 'strain'; if (u === 'v' || u === 'mv') return 'volt'; if (u === 'a' || u === 'ma') return 'curr'; return 'other'; }
async function tdmsOpen(file) {
  await busy('TDMS okunuyor: ' + file.name, async () => {
    let r; try { r = TDMS.parse(new Uint8Array(await file.arrayBuffer())); } catch (e) { toast('TDMS okunamadı: ' + (e.message || e), 8000); return; }
    const f = {id: 'f' + (importFile.seq++), name: file.name, table: true, tdms: r, mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: 1, baseFs: 1, cnts: {}, baseN: 0, cols: []};
    let nch = 0, minDt = Infinity, maxN = 0;
    for (const g of r.groups) for (const c of g.channels) {
      if (c.dtype === 'string' || c.dtype === 'time' || !c.n) continue;
      const nm = g.name + '/' + c.name, unit = String(c.props.unit_string || ''), data = c.data;
      let dt = Number(c.props.wf_increment); const t0 = Number(c.props.wf_start_offset) || 0;
      if (!(dt > 0)) { // aynı gruptaki zaman kanalından türet
        const tc = g.channels.find(x => x !== c && /^(time|zaman|t|x)$/i.test(x.name) && x.n === c.n && x.data && x.data.length > 1);
        dt = tc ? (tc.data[tc.n - 1] - tc.data[0]) / (tc.n - 1) : 1;
      }
      const ch = new Channel({name: nm, rest: c.name, base: c.name, comp: '', dev: g.name, kind: tdmsKind(unit), n: c.n, file: f, label: nm, varIdx: -1, unit, tbl: true, binLoad: async () => data});
      ch.dtS = dt; ch.t0 = t0; ch.spp = 1; ch.Tpkt = dt; ch.data = data; f.channels.push(ch); nch++; minDt = Math.min(minDt, dt); maxN = Math.max(maxN, c.n);
    }
    const strs = r.groups.filter(g => g.channels.some(c => c.dtype === 'string' && c.n));
    if (!nch) { if (strs.length) { toast(file.name + ': sayısal kanal yok, metin/olay tabloları gösteriliyor', 5000); tdmsTextDialog(file.name, r); } else toast('TDMS içinde okunabilir kanal bulunamadı', 6000); return; }
    f.Tpkt = minDt; f.baseFs = 1 / minDt; f.baseN = maxN;
    S.files.push(f); S.fopen.add(f.id); for (const g of r.groups) S.open.add(f.id + '/' + g.name); renderChips(); renderTree(); if (!S.plot.axes.length) addToNewAxes(f.channels.slice(0, 4), false);
    if (strs.length) setTimeout(() => tdmsTextDialog(file.name, r), 300);
    toast(`${file.name}: ${r.groups.length} grup · ${nch} kanal${r.warn.length ? ' · ' + r.warn.join('; ') : ''}`, 6000);
  });
}

function tdmsTextDialog(name, r) {
  const body = h('div', {style: 'max-height:62vh;overflow:auto;min-width:560px'}); const csvs = [];
  for (const g of r.groups) { const cs = g.channels.filter(c => (c.dtype === 'string' || c.dtype === 'time') && c.n); if (!cs.length) continue;
    const n = Math.max(...cs.map(c => c.n)), fm = (c, i) => { const v = c.data[i]; return v == null ? '' : c.dtype === 'time' ? new Date(v).toLocaleString('tr-TR') : String(v).replace(/[ýþðÝÞÐ]/g, m => ({'ý': 'ı', 'þ': 'ş', 'ð': 'ğ', 'Ý': 'İ', 'Þ': 'Ş', 'Ð': 'Ğ'})[m]); }; /* LabVIEW ANSI(cp1254) yazılan Türkçe karakterleri latin-1 okunmuş gelir; düzeltilir */
    const tb = h('tbody'); for (let i = 0; i < n; i++) tb.append(h('tr', null, h('td', null, String(i + 1)), ...cs.map(c => h('td', null, fm(c, i)))));
    body.append(h('h4', null, g.name + ' (' + n + ' satır)'), h('table', {class: 'tbl'}, h('thead', null, h('tr', null, h('th', null, '#'), ...cs.map(c => h('th', null, c.name.trim())))), tb));
    const q = s => '"' + String(s).replace(/"/g, '""') + '"'; let t = cs.map(c => q(c.name.trim())).join(';') + '\n'; for (let i = 0; i < n; i++) t += cs.map(c => q(fm(c, i))).join(';') + '\n'; csvs.push([g.name, t]); }
  modal('TDMS metin / olay tablosu — ' + name, body, [{t: 'CSV kaydet', fn: () => { csvs.forEach(([g, t]) => saveBlob(new Blob(['\ufeff' + t], {type: 'text/csv'}), sanitizeName(name.replace(/\.tdms$/i, '') + '_' + g) + '.csv')); return false; }}, {t: 'Kapat', primary: true}]);
}
