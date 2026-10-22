/* ===== MAT dışa aktarma: alt sistem / tüm binary / seçili bileşenler (sağ tık menüleri + Çıktı sekmesi) ===== */
const matBase = f => sanitizeName(f.name.replace(/\.[^.]*$/, ''));
function binFieldSub(f, fd) { const lay = f.bin.lay, s = String(fd.src ?? '').trim(); const i = lay.pos.has(s) ? lay.pos.get(s) : (/^#?\d+$/.test(s) ? +s.replace('#', '') : -1); return i >= 0 ? lay.raw[i] : ''; }
function binSubOffsets(f, name) { const lay = f.bin.lay, o = []; for (let i = 0; i < lay.L; i++) if (lay.raw[i] === name) o.push(i); return o; }
function parseRanges(txt, max) {   // "1-100, 250, 300-310" -> artan 1 tabanlı indisler; boş/tümü -> hepsi
  txt = String(txt || '').trim(); if (!txt || /^(t[üu]m[üu]?|hepsi|all)$/i.test(txt)) return null; const s = new Set();
  for (const part of txt.split(/[,;\s]+/).filter(Boolean)) { const m = /^(\d+)(?:\s*[-:]\s*(\d+))?$/.exec(part); if (!m) throw new Error('Bayt seçimi hatalı: "' + part + '" (örnek: 1-100, 250, 300-310)'); let a = +m[1], b = m[2] ? +m[2] : a; if (b < a) [a, b] = [b, a]; for (let i = a; i <= Math.min(b, max); i++) s.add(i); }
  if (!s.size) throw new Error('Bayt seçimi boş'); return s;
}
// Seçilen bayt konumlarının tüm karelerdeki değerleri: uint8, sütun-ana düzen (kare × bayt)
async function binRawU8(f, offs, prog) {
  const {sc, lay, file} = f.bin, n = sc.frames, L = lay.L, out = new Uint8Array(n * offs.length), g = Math.max(1, Math.floor(48e6 / L));
  if (!file) throw new Error('Binary kaynak dosya artık erişilebilir değil; dosyayı yeniden açın');
  for (let a = 0; a < n; a += g) {
    const b = Math.min(n, a + g), p0 = sc.pos[a], u8 = new Uint8Array(await file.slice(p0, sc.pos[b - 1] + L).arrayBuffer());
    for (let j = 0; j < offs.length; j++) { const o = offs[j], base = j * n; for (let k = a; k < b; k++) out[base + k] = u8[sc.pos[k] - p0 + o]; }
    if (prog) prog(b / n);
  }
  return out;
}
const MAT_CAP = 1.3e9;
// o: {subs: [ad]|null (tümü), raw, fields, time, nan, ranges: {ad: Set}|null, zip}
async function binMatBuild(f, o, prog, subs) {
  const vars = [], sc = f.bin.sc, lay = f.bin.lay, n = sc.frames, used = new Set();
  const uniq = nm => { let s = sanitizeName(nm).slice(0, 63), k = 2; while (used.has(s)) s = sanitizeName(nm).slice(0, 58) + '_' + k++; used.add(s); return s; };
  if (o.time !== false) { const t = new Float64Array(n), kn = new Float64Array(n); for (let i = 0; i < n; i++) { kn[i] = sc.g ? sc.g[i] : i; t[i] = kn[i] * f.Tpkt; } vars.push({name: uniq('zaman_s'), data: t}, {name: uniq('kare_no'), data: kn}); }
  if (o.fields) {
    const fl = f.channels.filter(c => c.dev === 'Alanlar' && (!o.subs || subs.includes(binFieldSub(f, (f.bin.def.fields.find(x => BIN.clean(x.name) === c.name)) || {}))));
    let k = 0; for (const c of fl) {
      await ensureLoaded(c); let d = c.data; if (o.nan && c.del) { d = Float64Array.from(d); for (let i = 0; i < d.length; i++) if (c.del[i]) d[i] = NaN; }
      vars.push({name: uniq(c.name), data: d}); if (d.length !== n && o.time !== false) { const tt = new Float64Array(d.length); for (let i = 0; i < tt.length; i++) tt[i] = c.t(i); vars.push({name: uniq(c.name + '_zaman_s'), data: tt}); } if (prog) prog(++k / (fl.length + 1) * 0.3);
    }
  }
  if (o.raw) for (const s of subs) {
    let offs = binSubOffsets(f, s), idx = offs.map((_, i) => i + 1); const rg = o.ranges && o.ranges[s];
    if (rg) { offs = offs.filter((_, i) => rg.has(i + 1)); idx = idx.filter(i => rg.has(i)); } if (!offs.length) continue;
    const m = await binRawU8(f, offs, p => prog && prog(0.3 + 0.7 * p)); vars.push({name: uniq(s), data: m, u8: true, rows: n, cols: offs.length}, {name: uniq(s + '_bayt_no'), data: Float64Array.from(idx)});
  }
  return vars;
}
async function binMatExport(f, o) {
  await busy('MAT hazırlanıyor…', async prog => {
    const lay = f.bin.lay, subs = o.subs || lay.subs.map(s => s.name), n = f.bin.sc.frames;
    if (o.raw) { let tot = 0; for (const s of subs) { const k = binSubOffsets(f, s).length, rg = o.ranges && o.ranges[s]; tot += rg ? [...rg].filter(i => i <= k).length : k; } if (tot * n > MAT_CAP) throw new Error('Ham bayt verisi ' + fmtCnt(Math.round(tot * n / 1e6)) + ' MB: tek dosya için çok büyük (sınır ≈ ' + Math.round(MAT_CAP / 1e6) + ' MB). Alt sistemleri ayrı ayrı veya bayt aralığı seçerek kaydedin.'); }
    if (o.zip && subs.length > 1) {   // her alt sistem ayrı .mat, hepsi tek zip içinde
      const files = []; let i = 0;
      for (const s of subs) { const v = await binMatBuild(f, Object.assign({}, o, {subs: [s]}), p => prog((i + p) / subs.length), [s]); files.push([sanitizeName(s) + '.mat', new Uint8Array(await matWrite(v).arrayBuffer())]); i++; }
      await saveBlob(XLSX.zip(files, 'application/zip'), matBase(f) + '_alt_sistemler.zip'); return;
    }
    const vars = await binMatBuild(f, o, prog, subs);
    await saveBlob(matWrite(vars), matBase(f) + '_' + (o.subs && subs.length === 1 ? sanitizeName(subs[0]) : o.subs ? 'secim' : 'tum') + '.mat');
  });
}
// Kanal seçiminden MAT: ham bayt kanalları uint8, diğerleri çift duyarlıklı; zaman vektörleri isteğe bağlı
async function matSelExport(chs, o = {}) {
  if (!chs.length) return toast('Önce kanal seçin (tıklama / Ctrl / Shift)');
  await busy('MAT hazırlanıyor…', async prog => {
    const vars = [], used = new Set(); const uniq = nm => { let s = sanitizeName(nm).slice(0, 63), k = 2; while (used.has(s)) s = sanitizeName(nm).slice(0, 58) + '_' + k++; used.add(s); return s; };
    const byF = new Map(); for (const c of chs) if (c.bin && c.dev !== 'Alanlar' && c.file.bin) { if (!byF.has(c.file)) byF.set(c.file, []); byF.get(c.file).push(c); }
    let tref = null, k = 0;
    const addT = (c, nm) => { if (o.time === false) return; const key = c.n + '|' + c.t(0) + '|' + c.t(c.n - 1); if (!tref) { tref = key; const t = new Float64Array(c.n); for (let i = 0; i < c.n; i++) t[i] = c.t(i); vars.push({name: uniq('zaman_s'), data: t}); } else if (key !== tref) { const t = new Float64Array(c.n); for (let i = 0; i < c.n; i++) t[i] = c.t(i); vars.push({name: uniq(nm + '_zaman_s'), data: t}); } };
    for (const [f, list] of byF) {
      const offs = list.map(c => f.bin.lay.pos.get(c.name)), n = f.bin.sc.frames; if (offs.length * n > MAT_CAP) throw new Error('Seçim çok büyük (' + fmtCnt(Math.round(offs.length * n / 1e6)) + ' MB)');
      const m = await binRawU8(f, offs, p => prog(p * 0.5)); list.forEach((c, j) => { addT(c, c.name); vars.push({name: uniq(c.name), data: m.subarray(j * n, (j + 1) * n), u8: true}); });
    }
    for (const c of chs) { if (byF.has(c.file) && byF.get(c.file).includes(c)) continue; await ensureLoaded(c); let d = c.data; if (o.nan !== false && c.del) { d = Float64Array.from(d); for (let i = 0; i < d.length; i++) if (c.del[i]) d[i] = NaN; } addT(c, c.name); vars.push({name: uniq(c.name), data: d}); prog(0.5 + 0.5 * (++k / chs.length)); }
    await saveBlob(matWrite(vars), 'MATView_secim_' + chs.length + '_kanal.mat');
  });
}
/* ---- iletişim kutusu ---- */
function matDlg(f, scope) {
  const sub = scope.t === 'sub', all = scope.t === 'all', fl = f.channels.filter(c => c.dev === 'Alanlar'), n = f.bin.sc.frames, lay = f.bin.lay, subs = lay.subs.map(s => s.name);
  const rawMB = nm => (nm ? binSubOffsets(f, nm).length : lay.raw.filter(Boolean).length) * n / 1048576;
  const fieldsIn = sub ? fl.filter(c => binFieldSub(f, f.bin.def.fields.find(x => BIN.clean(x.name) === c.name) || {}) === scope.name).length : fl.length;
  const body = h('div', null, card(sub ? 'Alt sistem: ' + scope.name : all ? 'Tüm binary dosya: ' + f.name : 'Seçili alt sistemler (' + scope.names.length + ')',
    h('div', {class: 'note'}, `${fmtCnt(n)} kare · ${sub ? binSubOffsets(f, scope.name).length : all ? lay.raw.filter(Boolean).length : '…'} bayt/kare`),
    f.bin.file ? chkIn('mxRaw', 'Ham bayt matrisi (uint8, kare × bayt) ≈ ' + (sub ? rawMB(scope.name) : all ? rawMB() : scope.names.reduce((a, s) => a + rawMB(s), 0)).toFixed(0) + ' MB', sub) : null,
    sub ? fr('Bayt seçimi', h('input', {type: 'text', id: 'mxR', placeholder: 'tümü  veya  1-100, 250, 300-310', style: 'width:100%'})) : null,
    chkIn('mxF', 'Çözülmüş alanlar' + (sub || !all ? ' (bu alt sisteme ait: ' + fieldsIn + ')' : ' (' + fl.length + ')'), true),
    chkIn('mxT', 'Zaman vektörü (zaman_s) ve kare numarası (kare_no)', true), chkIn('mxN', 'Silinen noktalar NaN olsun', true),
    all || !sub ? chkIn('mxZ', 'Her alt sistem ayrı .mat dosyası olsun (tek .zip içinde)', false) : null,
    h('div', {class: 'note'}, 'Ham bayt matrisi satırları kare, sütunları alt sistemdeki bayt sırasıdır; `<ad>_bayt_no` bayt numaralarını verir. Farklı periyotlu alanlar için `<alan>_zaman_s` yazılır.')));
  modal('Binary → .mat dışa aktar', body, [{t: 'Kaydet', primary: true, fn: () => {
    try {
      const o = {subs: sub ? [scope.name] : all ? null : scope.names, raw: $('#mxRaw') ? ck('mxRaw') : false, fields: ck('mxF'), time: ck('mxT'), nan: ck('mxN'), zip: $('#mxZ') ? ck('mxZ') : false};
      if (sub && o.raw) { const r = parseRanges(sv('mxR'), 1e6); if (r) o.ranges = {[scope.name]: r}; }
      if (!o.raw && !o.fields) throw new Error('En az bir içerik seçin');
      binMatExport(f, o);
    } catch (e) { toast(e.message, 6000); return false; }
  }}, {t: 'Vazgeç'}]);
}
/* ---- sağ tık menüleri ---- */
function selOf(f) { return chsFromSel().filter(c => !f || c.file === f); }
function fileMenu(f, x, y) {
  const items = []; if (f.binary) items.push({t: 'Tüm binary dosyayı .mat olarak kaydet…', ic: 'download', fn: () => matDlg(f, {t: 'all'})}, {t: 'Alt sistemleri ayrı .mat olarak kaydet (zip)…', ic: 'download', fn: () => matDlg(f, {t: 'all'})});
  const k = chsFromSel().length; items.push({t: 'Seçili kanalları .mat olarak kaydet' + (k ? ' (' + k + ')' : '') + '…', ic: 'download', fn: () => matSelExport(chsFromSel())});
  if (!f.derived) items.push('-', {t: 'Dosyayı kapat', ic: 'close', fn: () => closeFile(f)}); ctxMenu(x, y, items);
}
function devMenu(f, dev, x, y) {
  const chs = f.channels.filter(c => c.dev === dev), items = [{t: 'Bu gruptaki tüm kanalları seç (' + chs.length + ')', ic: 'layers', fn: () => { S.selCh = new Set(chs.map(c => c.uid)); renderTree(); }}];
  if (f.binary && dev !== 'Alanlar') items.unshift({t: 'Bu alt sistemi .mat olarak kaydet…', ic: 'download', fn: () => matDlg(f, {t: 'sub', name: dev})});
  else if (f.binary) items.unshift({t: 'Çözülmüş alanları .mat olarak kaydet…', ic: 'download', fn: () => matDlg(f, {t: 'all'})});
  const k = chsFromSel().length; if (k) items.push({t: 'Seçili kanalları .mat olarak kaydet (' + k + ')…', ic: 'download', fn: () => matSelExport(chsFromSel())});
  ctxMenu(x, y, items);
}
function chMenu(c, x, y) {
  const sel = chsFromSel(); ctxMenu(x, y, [{t: 'Seçili ' + sel.length + ' kanalı .mat olarak kaydet…', ic: 'download', fn: () => matSelExport(sel)}, '-', {t: 'Yeni alt grafiğe ekle', ic: 'plus', fn: () => addToNewAxes(sel.length > 1 ? sel : [c], false)}, {t: 'Aktif grafiğe aynı eksende ekle', ic: 'layers', fn: () => addToAxes(activeAxes(), sel.length > 1 ? sel : [c])}]);
}
/* ---- Çıktı sekmesi kartı ---- */
function buildMatCard() {
  const box = h('div', {id: 'matBox'}); setTimeout(refreshMatCard); return card('MAT dışa aktarma (binary / seçim)', box);
}
function refreshMatCard() {
  const box = $('#matBox'); if (!box) return; const fs = S.files.filter(f => f.binary), key = fs.map(f => f.id).join(','); if (box._k === key) { const s = $('#mcSub'); if (s) {} return; } box._k = key; box.replaceChildren();
  const sel = h('div', {class: 'btns'}, btn('Seçili kanalları kaydet', () => matSelExport(chsFromSel())));
  if (!fs.length) { box.append(h('div', {class: 'note'}, 'Binary dosya açılınca alt sistem/tüm dosya aktarımı burada görünür. Soldaki ağaçta kanalları seçip (Ctrl/Shift) aşağıdan .mat olarak kaydedebilirsiniz.'), sel); return; }
  const fsel = h('select', {id: 'mcF', onchange: () => { box._k = null; fillSubs(); }}, fs.map(f => h('option', {value: f.id}, f.name))), subs = h('select', {id: 'mcSub', multiple: true, size: 6, style: 'width:100%'});
  const cur = () => fs.find(f => f.id === fsel.value) || fs[0];
  const fillSubs = () => { subs.replaceChildren(...cur().bin.lay.subs.map(s => h('option', {value: s.name}, s.name + ' (' + s.count + ' bayt)'))); };
  fillSubs();
  box.append(fr('Binary dosya', fsel), h('div', {class: 'note'}, 'Alt sistem(ler) (Ctrl/Shift ile çoklu seçim):'), subs,
    h('div', {class: 'btns'}, btn('Seçili alt sistem(ler)i kaydet', () => { const names = [...subs.selectedOptions].map(o => o.value); if (!names.length) return toast('Alt sistem seçin'); matDlg(cur(), names.length === 1 ? {t: 'sub', name: names[0]} : {t: 'subs', names}); }, 'primary'),
      btn('Tüm binary dosyayı kaydet', () => matDlg(cur(), {t: 'all'}))), sel);
}
