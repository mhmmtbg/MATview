/* ===== Binary dosya çözme: Excel çerçeve tanımı, alanlar, formüller, .mat çıktısı ===== */
const BS = {def: null, defName: '', bin: null};   // bir sonraki çözme için son tanım
const SUBPAL = ['#e6b422', '#7fb069', '#5b9bd5', '#e07a5f', '#9c89b8', '#3fb8af', '#d4a373', '#8fb339', '#6c91c2', '#c9697d', '#a3a380', '#6b9080'];

async function binFilesIn(files) {
  let bin = null, xl = null;
  for (const f of files) { if (/\.xlsx$/i.test(f.name)) xl = f; else bin = f; }
  if (xl) await binLoadDef(xl);
  if (bin) BS.bin = bin;
  binDialog();
}
async function binLoadDef(file) {
  try { const sheets = await XLSX.read(file); BS.def = BIN.defFromSheets(sheets); BS.defName = file.name; }
  catch (e) { console.error(e); toast('Excel okunamadı: ' + (e.message || e), 7000); }
}
function binTemplate() {
  const names = ['BASLIK', 'BASLIK', 'DURUM', 'DURUM', 'SAYAC', 'SAYAC', 'VERI_A', 'VERI_A'], grid = [];
  for (let r = 0; r < 4; r++) grid.push(names.map((n, i) => r === 0 ? n : (r === 1 ? (i < 4 ? 'BASLIK' : 'SAYAC') : 'VERI_A')));
  return {grid, order: 'row', sync: 'EB 90', fps: 10, skip: 0, fields: [
    {name: 'SAYAC_DEGER', src: 'SAYAC_1', type: 'u16', endian: 'BE', bit: '', expr: '', unit: ''},
    {name: 'VERI_A_OLCEK', src: 'VERI_A_1', type: 'i16', endian: 'LE', bit: '', expr: 'x*0.01-5', unit: 'V'}]};
}
async function binSaveDef(d) { await saveBlob(XLSX.write(BIN.defToSheets(d)), 'cerceve_tanimi.xlsx'); }

function binDialog() {
  const body = h('div'), dyn = h('div');
  const defBox = h('div'), binBox = h('div');
  const readDef = () => {   // arayüzden senaryoyu oku
    const d = BS.def; if (!d) throw new Error('Önce bir çerçeve tanımı (.xlsx) seçin');
    d.order = sv('bnOrder'); d.sync = sv('bnSync'); d.fps = num('bnFps'); d.skip = num('bnSkip') | 0; d.counter = sv('bnCnt').trim();
    if (!(d.fps > 0)) throw new Error('Kare hızı > 0 olmalı'); BIN.parseSync(d.sync); return d;
  };
  const xin = h('input', {type: 'file', accept: '.xlsx', hidden: true, onchange: async e => { if (e.target.files[0]) { await binLoadDef(e.target.files[0]); paint(); } }});
  const bin = h('input', {type: 'file', hidden: true, onchange: e => { if (e.target.files[0]) { BS.bin = e.target.files[0]; paint(); } }});
  function paint() {
    defBox.replaceChildren(); binBox.replaceChildren(); dyn.replaceChildren();
    defBox.append(h('div', {class: 'btns'}, btn('Excel seç…', () => xin.click()), btn('Şablon Excel indir', () => binSaveDef(binTemplate())), BS.def ? btn('Tanımı kaydet', () => { try { binSaveDef(readDef()); } catch (e) { toast(e.message); } }) : null),
      h('div', {class: 'note'}, BS.def ? BS.defName + ' okundu.' : 'Çerçeve matrisi: her hücre bir bayt, hücreye alt sistem adı yazılır (ör. 125 satır × 100 sütun = 12500 bayt). Alanlar sayfası ve Senaryo sayfası isteğe bağlıdır.'));
    binBox.append(h('div', {class: 'btns'}, btn('Binary dosya seç…', () => bin.click())), h('div', {class: 'note'}, BS.bin ? BS.bin.name + ' · ' + fmtCnt(BS.bin.size) + ' bayt' : 'Henüz binary dosya seçilmedi.'));
    if (!BS.def) return;
    const d = BS.def, lay = BIN.layout(d.grid, d.order);
    dyn.append(card('Senaryo',
      fr('Okuma sırası', selIn('bnOrder', [['row', 'Satır satır (soldan sağa, yukarıdan aşağı)'], ['col', 'Sütun sütun (yukarıdan aşağı, soldan sağa)']], d.order)),
      fr('Senkron kelimesi (hex)', h('input', {type: 'text', id: 'bnSync', value: d.sync || '', placeholder: 'ör. EB 90 A5 C3 (boş = senkronsuz)'})),
      fr('Atlanacak ilk bayt', numIn('bnSkip', d.skip || 0, {min: 0})), fr('Kare hızı (Hz)', numIn('bnFps', d.fps || 1, {min: 0})),
      fr('Sayaç alanı (isteğe bağlı)', h('input', {type: 'text', id: 'bnCnt', value: d.counter || '', placeholder: 'Alanlar tablosundaki ad, ör. SAYAC (kayıp kareleri bulur)'})),
      h('div', {class: 'note', id: 'bnInfo'}, '')));
    const info = dyn.querySelector('#bnInfo');
    const upd = () => { const l = BIN.layout(d.grid, dyn.querySelector('#bnOrder').value); info.textContent = `Matris ${l.R} × ${l.C} = ${fmtCnt(l.L)} bayt/kare · ${l.subs.length} ad · adsız bayt: ${fmtCnt(l.raw.filter(x => !x).length)}` + (BS.bin ? ` · ≈ ${fmtCnt(Math.floor(BS.bin.size / l.L))} kare` : ''); };
    dyn.querySelector('#bnOrder').onchange = e => { d.order = e.target.value; paint(); }; upd();
    // matris önizlemesi
    const cs = Math.max(1, Math.min(6, Math.floor(560 / Math.max(1, lay.C)))), cv = h('canvas', {width: lay.C * cs, height: lay.R * cs, style: 'max-width:100%;border:1px solid var(--border)'}), g = cv.getContext('2d');
    const col = new Map(lay.subs.map((s, i) => [s.name, SUBPAL[i % SUBPAL.length]]));
    for (let r = 0; r < lay.R; r++) for (let c = 0; c < lay.C; c++) { const n = lay.raw[d.order === 'col' ? c * lay.R + r : r * lay.C + c]; if (!n) continue; g.fillStyle = col.get(n); g.fillRect(c * cs, r * cs, cs, cs); }
    dyn.append(card('Çerçeve matrisi', cv, h('div', {class: 'legend'}, lay.subs.map(s => h('span', {class: 'lg'}, h('i', {class: 'dot', style: 'background:' + col.get(s.name)}), s.name + ' (' + fmtCnt(s.count) + ')')))));
    // alanlar
    const tb = h('tbody'), mk = f => {
      const tr = h('tr'), inp = (k, w, v) => h('input', {type: 'text', value: v ?? f[k], style: 'width:' + w + 'px', oninput: e => f[k] = e.target.value});
      const sel = (k, opts) => h('select', {onchange: e => f[k] = e.target.value}, opts.map(o => h('option', {value: o, selected: f[k] === o}, o)));
      tr.append(h('td', null, inp('name', 110)), h('td', null, inp('src', 90)), h('td', null, sel('type', Object.keys(BIN.TYPES))), h('td', null, sel('endian', ['BE', 'LE'])), h('td', null, inp('bit', 44)), h('td', null, inp('expr', 150)), h('td', null, inp('unit', 44)), h('td', null, inp('period', 36)), h('td', null, inp('phase', 30)),
        h('td', null, h('button', {onclick: () => { d.fields.splice(d.fields.indexOf(f), 1); tr.remove(); }}, '×'))); return tr;
    };
    for (const f of d.fields) tb.append(mk(f));
    dyn.append(card('Alanlar (birleşik değer, tür, bit, formül)', h('div', {class: 'note'}, 'Başlangıç: hücre adı (ör. GUC_1) · Bit: "3" veya "4-7" · İfade: ham değer x ile (ör. x*0.01-40); başka alanların adlarını da kullanabilirsiniz · Periyot: alan her kaçıncı karede güncelleniyorsa (5 ms çerçevede 10 ms’lik alan → 2), Faz: hangi karede (0 veya 1…).'),
      h('div', {style: 'overflow:auto;max-height:230px'}, h('table', {class: 'ftab'}, h('thead', null, h('tr', null, ['Ad', 'Başlangıç', 'Tür', 'Sıra', 'Bit', 'İfade', 'Birim', 'Periyot', 'Faz', ''].map(x => h('th', null, x)))), tb)),
      h('div', {class: 'btns'}, btn('+ Alan ekle', () => { const f = {name: 'ALAN_' + (d.fields.length + 1), src: lay.keys.find(k => k) || '', type: 'u8', endian: 'BE', bit: '', expr: '', unit: '', period: 1, phase: 0}; d.fields.push(f); tb.append(mk(f)); })),
      fr('Ham bayt kanalları', h('input', {type: 'checkbox', id: 'bnRaw', checked: BS.raw !== false, onchange: e => BS.raw = e.target.checked}))));
  }
  body.append(card('1. Çerçeve tanımı (Excel)', defBox), card('2. Binary dosya', binBox), dyn, xin, bin); paint();
  modal('Binary dosya çözümle', body, [{t: 'Çöz ve aç', primary: true, fn: () => {
    let d; try { d = readDef(); if (!BS.bin) throw new Error('Binary dosya seçin'); } catch (e) { toast(e.message, 5000); return false; }
    const raw = $('#bnRaw') ? $('#bnRaw').checked : true; binOpen(BS.bin, d, raw);
  }}, {t: 'Kapat'}]);
}

async function binOpen(file, d, withRaw) {
  await busy('Binary çözümleniyor: ' + file.name, async prog => {
    const lay = BIN.layout(d.grid, d.order), sync = BIN.parseSync(d.sync); if (!lay.L) throw new Error('Çerçeve matrisi boş');
    const stream = file.size > (BS.streamMin ?? 200 * 1048576); let u8 = null, sc, pre = new Map();
    if (stream) {   // büyük dosya: tek geçişte blok blok oku; yalnız tanımlı alanları çıkar (ham bayt kanalları yok)
      withRaw = false; const specs = [];
      for (const fd of d.fields) { const nm = BIN.clean(fd.name || ''); if (!nm) continue; try { specs.push({nm, sp: BIN.spec(lay, fd), parts: []}); } catch (e) { /* hata sonra bildirilir */ } }
      const cf = d.counter && d.fields.find(x => BIN.clean(x.name) === BIN.clean(d.counter)); let cs = null;
      if (d.counter) { if (!cf) throw new Error('Sayaç alanı "' + d.counter + '" Alanlar tablosunda yok'); cs = {sp: BIN.spec(lay, Object.assign({}, cf, {bit: ''})), parts: []}; }
      sc = await BIN.scanStream(file.size, async (a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer()), lay.L, sync, d.skip, async (b8, loc) => {
        for (const e of specs) e.parts.push(BIN.extract(b8, loc, e.sp)); if (cs) cs.parts.push(BIN.extract(b8, loc, cs.sp));
      }, prog, BS.streamBlock);
      if (!sc.frames) throw new Error('Hiç çerçeve bulunamadı (senkron kelimesi/çerçeve boyutu uyuşmuyor)');
      const cat = parts => { const o = new Float64Array(sc.frames); let k = 0; for (const x of parts) { o.set(x, k); k += x.length; } return o; };
      for (const e of specs) pre.set(e.nm, cat(e.parts));
      if (cs) { const cg = BIN.counterG(cat(cs.parts), cs.sp.size); if (cg.lost) { sc.g = cg.g; sc.lost += cg.lost; } }
    } else {
      u8 = new Uint8Array(await file.arrayBuffer());
      sc = BIN.scan(u8, lay.L, sync, d.skip); if (!sc.frames) throw new Error('Hiç çerçeve bulunamadı (senkron kelimesi/çerçeve boyutu uyuşmuyor)');
      if (d.counter) {
        const fd = d.fields.find(x => BIN.clean(x.name) === BIN.clean(d.counter)); if (!fd) throw new Error('Sayaç alanı "' + d.counter + '" Alanlar tablosunda yok');
        const sp = BIN.spec(lay, Object.assign({}, fd, {bit: ''})), cg = BIN.counterG(BIN.extract(u8, sc.pos, sp), sp.size);
        if (cg.lost) { sc.g = cg.g; sc.lost += cg.lost; }
      }
    }
    const Tp = 1 / d.fps, f = {id: 'f' + (importFile.seq++), name: file.name, mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: Tp, baseFs: d.fps, cnts: {}, gcache: {}, baseN: sc.frames, binary: true, bin: {lay, sc, def: JSON.parse(JSON.stringify(d)), u8, stream}};
    const byName = new Map(), active = new Set();
    const mk = (name, dev, kind, sp, expr, unit, per, ph) => {
      per = Math.max(1, per | 0 || 1); const idx = per > 1 ? BIN.subIdx(sc.frames, sc.g, per, ph | 0) : null, pos = idx ? Float64Array.from(idx, i => sc.pos[i]) : sc.pos, gg = sc.g ? (idx ? Float64Array.from(idx, i => sc.g[i] / per) : sc.g) : null, nn = idx ? idx.length : sc.frames;
      const c = new Channel({name, rest: name, base: name, comp: '', dev, kind, n: nn, file: f, label: name, varIdx: -1, bin: true, unit: unit || ''});
      c.g = gg; c.spp = 1; c.Tpkt = Tp * per; c.dtS = Tp * per;
      c.binLoad = async () => {
        let rawv = pre.has(name) && sp.pre ? (idx ? Float64Array.from(idx, i => pre.get(name)[i]) : pre.get(name)) : BIN.extract(u8, pos, sp); if (!expr) return rawv;
        if (active.has(c)) throw new Error('Döngüsel formül: ' + name); active.add(c);
        try {
          for (const id of new Set(EXPR.identifiers(expr))) { const o = byName.get(id); if (o && o !== c) { await ensureLoaded(o); if (o.data.length !== rawv.length) throw new Error('"' + id + '" farklı periyotta (kare sayıları uyuşmuyor)'); } else if (o === c) throw new Error(name + ': formül kendine başvuruyor'); }
          const r = EXPR.run(expr, {DSP, resolve: n => { if (n === 'x' || n === 'X') return {v: rawv, fs: c.fs, ch: c}; const o = byName.get(n); if (!o) throw new Error(name + ': bilinmeyen ad "' + n + '"'); return {v: o.data, fs: c.fs, ch: o}; }});
          return typeof r === 'number' ? new Float64Array(nn).fill(r) : r.v;
        } catch (e) { throw new Error(name + ': ' + (e.message || e)); } finally { active.delete(c); }
      };
      f.channels.push(c); byName.set(name, c); return c;
    };
    const errs = [];
    if (withRaw) {
      const sp0 = {size: 1, getter: 'getUint8', le: false, bits: null};
      for (let i = 0; i < lay.L; i++) if (lay.keys[i]) mk(lay.keys[i], lay.raw[i], 'other', Object.assign({off: i}, sp0), null, '');
    }
    for (const fd of d.fields) {
      try {
        const nm = BIN.clean(fd.name || ''); if (!nm) continue; if (byName.has(nm)) throw new Error('"' + nm + '" adı zaten var');
        const sp = BIN.spec(lay, fd); mk(nm, 'Alanlar', sp.bits ? 'state' : 'other', Object.assign(sp, {pre: true}), (fd.expr || '').trim(), fd.unit, fd.period, fd.phase);
      } catch (e) { errs.push(e.message || String(e)); }
    }
    prog(1); f.sc = sc; S.files.push(f); BS.lastFile = f; S.open.add(f.id + '/Alanlar');
    renderChips(); renderTree();
    toast(`${file.name}: ${fmtCnt(sc.frames)} kare${stream ? ' (büyük dosya: yalnız tanımlı alanlar)' : ''}, ${fmtCnt(f.channels.length)} kanal` + (sc.lost ? ` · kayıp kare: ${sc.lost}` : '') + (sc.junk ? ` · atlanan bayt: ${fmtCnt(sc.junk)}` : '') + (errs.length ? ' · UYARI: ' + errs.join('; ') : ''), errs.length || sc.lost ? 9000 : 4000);
  });
}

/* ---- çözülmüş veriyi .mat olarak dışa aktar ---- */
function binExportDialog(f) {
  const fields = f.channels.filter(c => c.dev === 'Alanlar'), subs = f.bin.lay.subs;
  const body = h('div', null, card('Dışa aktarılacaklar',
    fr('Alan kanalları (' + fields.length + ')', h('input', {type: 'checkbox', id: 'beF', checked: true})),
    f.bin.u8 ? fr('Ham bayt matrisleri (alt sistem başına kare × bayt, ' + subs.length + ' değişken)', h('input', {type: 'checkbox', id: 'beR'})) : h('div', {class: 'note'}, 'Büyük dosya modunda ham bayt matrisleri yazılmaz.'),
    fr('Silinen noktalar', selIn('beD', [['nan', 'NaN olarak yaz'], ['keep', 'Olduğu gibi yaz']], 'nan')),
    h('div', {class: 'note'}, 'Zaman vektörü (zaman_s) ve kare numarası (kare_no) her zaman eklenir; farklı periyotlu alanlar için ayrıca <ad>_zaman_s yazılır. Ham bayt matrisleri büyük olabilir (kare sayısı × 12500 × 8 bayt).')));
  modal('Çözülmüş veriyi .mat olarak kaydet', body, [{t: 'Kaydet', primary: true, fn: () => { binExport(f, ck('beF'), $('#beR') ? ck('beR') : false, sv('beD') === 'nan'); }}, {t: 'Vazgeç'}]);
}
async function binExport(f, wf, wr, nan) {
  await busy('Dışa aktarılıyor…', async prog => {
    const vars = [], sc = f.bin.sc, lay = f.bin.lay, n = sc.frames, used = new Set();
    const uniq = nm => { let s = sanitizeName(nm).slice(0, 63), k = 2; while (used.has(s)) s = sanitizeName(nm).slice(0, 58) + '_' + k++; used.add(s); return s; };
    const t = new Float64Array(n), kn = new Float64Array(n); for (let i = 0; i < n; i++) { kn[i] = sc.g ? sc.g[i] : i; t[i] = kn[i] * f.Tpkt; }
    vars.push({name: uniq('zaman_s'), data: t}, {name: uniq('kare_no'), data: kn});
    if (wf) { const fl = f.channels.filter(c => c.dev === 'Alanlar'); let k = 0; for (const c of fl) { await ensureLoaded(c); let d = c.data; if (nan && c.del) { d = Float64Array.from(d); for (let i = 0; i < d.length; i++) if (c.del[i]) d[i] = NaN; } vars.push({name: uniq(c.name), data: d}); if (d.length !== n) { const tt = new Float64Array(d.length); for (let i = 0; i < tt.length; i++) tt[i] = c.t(i); vars.push({name: uniq(c.name + '_zaman_s'), data: tt}); } prog(++k / (fl.length + 1)); } }
    if (wr) for (const s of lay.subs) {
      const idx = []; for (let i = 0; i < lay.L; i++) if (lay.raw[i] === s.name) idx.push(i);
      const m = new Float64Array(n * idx.length); idx.forEach((off, j) => m.set(BIN.extract(f.bin.u8, sc.pos, {off, size: 1, getter: 'getUint8', le: false, bits: null}), j * n));
      vars.push({name: uniq(s.name), data: m, rows: n, cols: idx.length});
    }
    await saveBlob(matWrite(vars), f.name.replace(/\.[^.]*$/, '') + '_cozulmus.mat');
  });
}
