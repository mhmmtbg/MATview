/* ===== Telemetre çerçevesi (alt sistem sayfalı Excel) arayüzü: yükle, kalıcı işaretle, binary çöz, ana ekranda alt sistem → değişken ===== */
const FS = {src: null, def: null, name: '', perm: false, ms: 10, skip: 0, opt: {indexBase: 0, blockMode: 'block'}, lay: {cols: 125, rows: 100, transpose: false, header: '', headerPos: 'start', strict: false, dropTotal: 0, dropList: ''}, bin: null, last: null};
const FKEY = 'mv.frame';
function frmReparse() { FS.def = FRM.parse(FS.src, Object.assign({}, FS.opt, {frameBytes: (FS.lay.cols | 0) * (FS.lay.rows | 0)})); }
(function frmInit() {
  try { const j = JSON.parse(localStorage.getItem(FKEY) || 'null'); if (j && j.src) { FS.src = j.src; FS.name = j.name || 'kalıcı çerçeve'; if (j.opt) FS.opt = Object.assign(FS.opt, j.opt); if (j.ver !== 3) FS.opt.indexBase = 0; if (j.lay) FS.lay = Object.assign(FS.lay, j.lay); if (j.ms > 0) FS.ms = j.ms; if (j.skip >= 0) FS.skip = j.skip | 0; frmReparse(); FS.perm = true; } } catch (e) { FS.src = null; FS.def = null; /* depolama yok / eski biçim */ }
})();
function frmPersist(on) {
  try {
    if (on && FS.src) localStorage.setItem(FKEY, JSON.stringify({name: FS.name, src: FS.src, ver: 3, opt: FS.opt, lay: FS.lay, ms: FS.ms, skip: FS.skip, ts: Date.now()}));
    else localStorage.removeItem(FKEY);
    FS.perm = !!on && !!FS.src; return true;
  } catch (e) { FS.perm = false; toast('Çerçeve kalıcı kaydedilemedi (tarayıcı depolaması dolu/engelli): ' + (e.message || e), 7000); return false; }
}
async function frmLoadExcel(file) {
  try {
    const sheets = await XLSX.read(file), src = sheets.map(x => ({name: x.name, rows: (x.rows || []).map(r => (r || []).slice(0, 12).map(v => v == null ? null : v))}));
    const def = FRM.parse(src, Object.assign({}, FS.opt, {frameBytes: (FS.lay.cols | 0) * (FS.lay.rows | 0)})); FS.src = src; FS.def = def; FS.name = file.name; FS.perm = false;
    const err = def.warns.filter(w => w.lvl === 'err').length, wr = def.warns.filter(w => w.lvl === 'warn').length;
    toast(`${file.name}: ${def.sheets.length} alt sistem, ${fmtCnt(def.sheets.reduce((s, x) => s + x.vars.length, 0))} değişken` + (err ? ` · ${err} hata` : '') + (wr ? ` · ${wr} uyarı` : ''), 6000);
    return true;
  } catch (e) { console.error(e); toast('Çerçeve Excel\'i okunamadı: ' + (e.message || e), 9000); return false; }
}
function frmStats(def) {
  const vars = def.sheets.reduce((s, x) => s + x.vars.length, 0), st = def.sheets.reduce((s, x) => s + x.streams.length, 0), cov = def.coverage || {covered: 0, undef: 0};
  return {sheets: def.sheets.length, vars, streams: st, chans: FRM.plan(def).length, covered: cov.covered, undef: cov.undef, pct: (100 * cov.covered / def.frameBytes)};
}
function frmReportBody(list, head) {
  const wrap = h('div'); if (head) wrap.append(h('div', {class: 'note'}, head));
  if (!list.length) { wrap.append(h('div', {class: 'note'}, 'Uyarı veya hata yok.')); return wrap; }
  const ne = list.filter(w => w.lvl === 'err').length, ni = list.filter(w => w.lvl === 'info').length;
  wrap.append(h('div', {class: 'note'}, `${ne} hata · ${list.length - ne - ni} uyarı · ${ni} bilgi`));
  const tb = h('tbody'); for (const w of [...list].sort((a, b) => ({err: 0, warn: 1, info: 2}[a.lvl] - {err: 0, warn: 1, info: 2}[b.lvl])))
    tb.append(h('tr', null, h('td', {style: 'color:' + (w.lvl === 'err' ? 'var(--danger)' : (w.lvl === 'info' ? 'var(--muted)' : '#c98a10')) + ';white-space:nowrap;font-weight:600'}, w.lvl === 'err' ? 'HATA' : (w.lvl === 'info' ? 'BİLGİ' : 'UYARI')), h('td', {style: 'white-space:nowrap'}, w.sheet + (w.row ? ' · sat. ' + w.row : '')), h('td', null, w.msg)));
  wrap.append(h('div', {style: 'overflow:auto;max-height:55vh'}, h('table', {class: 'ftab'}, h('thead', null, h('tr', null, ['Düzey', 'Konum', 'Açıklama'].map(x => h('th', null, x)))), tb)));
  return wrap;
}
function frmReportDialog(list, title, head) {
  const csv = () => saveBlob(new Blob(['﻿Düzey;Sayfa;Satır;Açıklama\n' + list.map(w => [w.lvl === 'err' ? 'HATA' : (w.lvl === 'info' ? 'BİLGİ' : 'UYARI'), w.sheet, w.row || '', '"' + String(w.msg).replace(/"/g, '""') + '"'].join(';')).join('\n')], {type: 'text/csv'}), 'cerceve_rapor.csv');
  modal(title || 'Çerçeve raporu', frmReportBody(list, head), [{t: 'CSV kaydet', fn: () => { csv(); return false; }}, {t: 'Kapat'}]);
}

function frmDialog(pre) {
  const body = h('div'), defBox = h('div'), binBox = h('div'), layBox = h('div');
  const xin = h('input', {type: 'file', accept: '.xlsx', hidden: true, onchange: async e => { if (e.target.files[0]) { await frmLoadExcel(e.target.files[0]); paint(); } }});
  const bin = h('input', {type: 'file', hidden: true, onchange: e => { if (e.target.files[0]) { FS.bin = e.target.files[0]; paint(); } }});
  const txt = (id, v, ph) => h('input', {type: 'text', id, value: v || '', placeholder: ph || '', spellcheck: false, style: 'width:100%'});
  const readPar = () => {
    if ($('#frmBase')) { FS.opt.indexBase = +sv('frmBase'); FS.opt.blockMode = sv('frmBlk'); }
    const ms = num('frmMs'), sk = num('frmSkip') | 0; if (!(ms > 0)) throw new Error('Kare periyodu > 0 olmalı'); if (!(sk >= 0)) throw new Error('Kayma ≥ 0 olmalı'); FS.ms = ms; FS.skip = sk;
    if ($('#lyCols')) { const y = FS.lay; y.cols = num('lyCols') | 0; y.rows = num('lyRows') | 0; y.transpose = ck('lyTr'); y.header = sv('lyHdr').trim(); y.headerPos = sv('lyPos'); y.strict = ck('lyStrict'); y.dropTotal = num('lyDropT') | 0; y.dropList = sv('lyDrop').trim(); FRM.layout(Object.assign({}, y, {shift: sk})); }
  };
  function paint() {
    defBox.replaceChildren(); binBox.replaceChildren(); layBox.replaceChildren();
    defBox.append(h('div', {class: 'btns'}, btn('Çerçeve Excel\'i seç…', () => xin.click()), FS.def ? btn('Rapor…', () => frmReportDialog(FS.def.warns, 'Çerçeve tanımı raporu', FS.name)) : null,
      FS.def && FS.perm ? btn('Kalıcı çerçeveyi kaldır', () => { frmPersist(false); toast('Kalıcı çerçeve kaldırıldı (bu oturumda yüklü kalır)'); paint(); }, 'danger') : null));
    if (!FS.def) { defBox.append(h('div', {class: 'note'}, 'Her alt sistem ayrı bir sayfadır. Sütunlar: Birim · Index · Değişken · Tip · Eleman Sayısı · Formül · Byte Endian · Bit Endian · Örnek Sayısı · Undersample Header · isUndersample. Index, karedeki bayt sırasıdır (varsayılan 0 tabanlı, referans çözücü gibi); "auto" bir önceki değişkenden sonra devam eder.')); }
    else {
      const s = frmStats(FS.def), err = FS.def.warns.filter(w => w.lvl === 'err').length;
      defBox.append(...[h('div', {class: 'note'}, `${FS.name} · ${s.sheets} alt sistem · ${fmtCnt(s.vars)} değişken (${fmtCnt(s.chans)} kanal) · ${s.streams} akış başlığı · kare ${fmtCnt(FS.def.frameBytes)} bayt, tanımlı ${fmtCnt(s.covered)} bayt (%${s.pct.toFixed(1)}), tanımsız ${fmtCnt(s.undef)}`),
        err ? h('div', {class: 'note', style: 'color:var(--danger)'}, `${err} satır okunamadı — "Rapor…" ile bakın.`) : null,
        chkIn('frmPerm', 'Bu çerçeveyi kalıcı işaretle (sonraki açılışlarda otomatik yüklenir)', FS.perm)].filter(Boolean));
      const cb = defBox.querySelector('#frmPerm'); cb.onchange = () => { if (cb.checked) { if (!frmPersist(true)) cb.checked = false; else toast('Çerçeve kalıcı işaretlendi'); } else { frmPersist(false); toast('Kalıcı işaret kaldırıldı'); } paint(); };
    }
    binBox.append(h('div', {class: 'btns'}, btn('Binary dosya seç…', () => bin.click())), h('div', {class: 'note', id: 'frmInfo'}, FS.bin ? '' : 'Henüz binary dosya seçilmedi.'));
    if (FS.def) {
      binBox.append(fr('Kare periyodu (ms)', numIn('frmMs', FS.ms, {min: 0})),
        fr('Index tabanı', selIn('frmBase', [['1', '1 tabanlı (Index 1 = çerçevenin ilk baytı)'], ['0', '0 tabanlı (Index 0 = çerçevenin ilk baytı)']], FS.opt.indexBase)),
        fr('B örnekleme düzeni', selIn('frmBlk', [['block', 'Blok: önce tüm değişkenlerin 1. örneği, sonra 2. örneği (referans çözücü)'], ['var', 'Değişken ardışık: her değişkenin örnekleri yan yana']], FS.opt.blockMode)));
      for (const id of ['frmBase', 'frmBlk']) binBox.querySelector('#' + id).onchange = () => { try { readPar(); frmReparse(); if (FS.perm) frmPersist(true); } catch (e) { toast('Çerçeve yeniden çözümlenemedi: ' + (e.message || e), 6000); } paint(); };
      if (FS.bin) { const fi = FRM.frameInfo(FS.bin.size, FS.lay.rows * FS.lay.cols, FS.skip); binBox.querySelector('#frmInfo').textContent = `${FS.bin.name} · ${fmtCnt(FS.bin.size)} bayt · ${fmtCnt(fi.frames)} kare` + (fi.rest ? ` · sonda ${fi.rest} bayt artık (atlanır)` : ''); }
    }
    if (FS.def) {
      const y = FS.lay;
      layBox.append(h('div', {class: 'note'}, 'Fiziksel kare sütun × satır dizilir (satır satır gelir). "Sütun öncelikli" açıkken mantıksal sıra sütun sütundur (referans çözücüdeki "yeniden düzenleme"). Çerçeve başı: sabit boyut + kayma, ya da header (sync) aranarak.'),
        fr('Sütun sayısı', numIn('lyCols', y.cols, {min: 1, step: 1})), fr('Satır sayısı', numIn('lyRows', y.rows, {min: 1, step: 1})),
        chkIn('lyTr', 'Sütun öncelikli (transpoze)', y.transpose),
        fr('Header (hex, boşsa kullanılmaz)', txt('lyHdr', y.header, 'örn. EB 90')), fr('Header konumu', selIn('lyPos', [['start', 'Çerçevenin başında'], ['end', 'Çerçevenin sonunda']], y.headerPos)), chkIn('lyStrict', 'Sıkı sync (ardışık header doğrula)', y.strict),
        fr('Kayma (bayt, header yoksa)', numIn('frmSkip', FS.skip, {min: 0, step: 1})),
        fr('Kayıttaki toplam sütun', numIn('lyDropT', y.dropTotal || '', {min: 0, step: 1})), fr('Atılacak sütunlar (1\'den)', txt('lyDrop', y.dropList, 'örn. 122-125')),
        h('div', {class: 'btns'}, btn('Düzeni otomatik bul', async () => { try { readPar(); await frmAuto(); } catch (e) { toast(e.message || e, 6000); } paint(); })), h('div', {class: 'note', id: 'lyInfo'}, FS.autoMsg || ''));
      for (const id of ['lyCols', 'lyRows']) layBox.querySelector('#' + id).onchange = () => { try { readPar(); frmReparse(); if (FS.perm) frmPersist(true); } catch (e) { toast('Çerçeve yeniden çözümlenemedi: ' + (e.message || e), 6000); } paint(); };
    }
    if (FS.last) binBox.append(h('div', {class: 'btns'}, btn('Son çözme raporu…', () => frmReportDialog(FS.last.list, 'Çözme raporu', FS.last.head))));
  }
  body.append(card('1. Telemetre çerçevesi (Excel)', defBox), card('2. Binary dosya', binBox), card('3. Çerçeve düzeni', layBox), xin, bin); paint();
  modal('Telemetre çerçevesi ile binary çöz (alt sistem sayfalı Excel)', body, [{t: 'Çöz ve ana ekrana ekle', primary: true, fn: () => {
    try { if (!FS.def) throw new Error('Önce çerçeve Excel\'ini seçin'); if (!FS.bin) throw new Error('Binary dosya seçin'); readPar(); if (FS.def.indexBase !== FS.opt.indexBase || FS.def.blockMode !== FS.opt.blockMode || FS.def.frameBytes !== FS.lay.cols * FS.lay.rows) frmReparse(); } catch (e) { toast(e.message, 5000); return false; }
    if (FS.perm) frmPersist(true); frmOpen(FS.bin);
  }}, {t: 'Kapat'}]);
}

async function frmAuto() {
  if (!FS.def) throw new Error('Önce çerçeve Excel\'ini seçin'); if (!FS.bin) throw new Error('Önce binary dosya seçin');
  const n = Math.min(FS.bin.size, 8 << 20), u8 = new Uint8Array(await FS.bin.slice(0, n).arrayBuffer()), r = FRM.autoLayout(u8, FS.def, {cols: FS.lay.cols, rows: FS.lay.rows});
  if (!r.length || !r[0].hit) { FS.autoMsg = 'Akış başlıkları hiçbir düzende bulunamadı. Excel\'deki "Undersample Header" değerlerini, sütun/satır sayısını ve Index tabanını kontrol edin.'; return; }
  const b = r[0]; FS.lay.transpose = b.transpose; FS.lay.header = ''; FS.skip = b.shift;
  FS.autoMsg = `Önerilen düzen uygulandı: ${b.transpose ? 'sütun öncelikli' : 'satır öncelikli'}, kayma ${b.shift} bayt (satır ${b.row}, sütun ${b.col}); ${b.total} akıştan ${b.hit}'inde başlık bulundu (` + b.per.map(x => `${x.unit}: ${x.packets}`).join(', ') + ` paket, ilk ${fmtCnt(Math.min(400, Math.floor(u8.length / (FS.lay.cols * FS.lay.rows))))} kare).`;
  if (FS.perm) frmPersist(true);
}

async function frmOpen(file) {
  const def = FS.def, skip = FS.skip | 0, T = FS.ms / 1000, LY = FRM.layout(Object.assign({}, FS.lay, {shift: skip})), L = LY.L, PL = LY.PL;
  await busy('Telemetre çözülüyor: ' + file.name, async prog => {
    const whole = file.size <= 700 * 1048576, rep = def.warns.map(w => Object.assign({}, w, {sheet: 'Tanım · ' + w.sheet}));
    const R = (lvl, sheet, row, msg) => rep.push({lvl, sheet, row, msg});
    const u8 = whole ? new Uint8Array(await file.arrayBuffer()) : null;
    // çerçeve başlangıçları: header varsa tara, yoksa sabit boyut + kayma
    let starts, skipped = 0, ev = [];
    if (LY.hdr) {
      if (whole) { const lc = FRM.locate(u8, LY); starts = lc.starts; skipped = lc.skipped; ev = lc.ev; }
      else { const st = [], sc = FRM.createScanner(LY, a => st.push(a), (n, at, kind) => { skipped += n; if (ev.length < 20) ev.push({n, at, kind}); }); const CH = 8 << 20; for (let o = 0; o < file.size; o += CH) { const e = Math.min(file.size, o + CH); sc.push(new Uint8Array(await file.slice(o, e).arrayBuffer()), e >= file.size); prog(Math.min(0.5, o / file.size / 2)); } starts = Float64Array.from(st); }
    } else { const n = Math.max(0, Math.floor((file.size - skip) / PL)); starts = new Float64Array(n); for (let k = 0; k < n; k++) starts[k] = skip + k * PL; skipped = skip + Math.max(0, file.size - skip) % PL; }
    const frames = starts.length; if (!frames) throw new Error(`Dosyada tam kare bulunamadı (${fmtCnt(file.size)} bayt, kare ${fmtCnt(PL)} bayt${LY.hdr ? ', header ' + FS.lay.header : ''})`);
    LY.starts = starts;
    if (LY.hdr && skipped > file.size * 0.1) R('err', 'Binary', 0, `Header "${FS.lay.header}" ile dosyanın %${(100 * skipped / file.size).toFixed(0)}'i çerçeve dışı kaldı (yalnız ${fmtCnt(frames)} kare yakalandı). Bu header kayıttaki gerçek çerçeve başına denk gelmiyor: Header alanını boş bırakıp "Düzeni otomatik bul" ile kayma kullanın`);
    if (skipped) R('warn', 'Binary', 0, `${fmtCnt(skipped)} bayt çerçeve dışı/artık olarak atlandı` + (ev.length ? ' (ilk konumlar: ' + ev.slice(0, 3).map(x => x.at).join(', ') + ')' : ''));
    R('info', 'Binary', 0, `Çerçeve düzeni: ${LY.C}×${LY.R}${LY.T !== LY.C ? ' (kayıtta ' + LY.T + ' sütun, ' + LY.drop.length + ' atıldı)' : ''}, ${LY.tr ? 'sütun öncelikli' : 'satır öncelikli'}, ${LY.hdr ? 'header ' + FS.lay.header + ' (' + (LY.hdrEnd ? 'sonda' : 'başta') + ')' : 'kayma ' + skip + ' bayt'}, Index ${def.indexBase}-tabanlı; ${fmtCnt(frames)} kare`);
    // kare okuma: whole → tek blok; büyük dosya → 48 MB bloklar. cb(bayt, bloğun_dosya_ofseti, kare_sayısı, ilk_kare)
    const pass = async cb => { if (whole) { await cb(u8, 0, frames, 0); return; } const BF = Math.max(1, Math.floor(48e6 / PL)); for (let k0 = 0; k0 < frames; k0 += BF) { const nf = Math.min(BF, frames - k0), b0 = starts[k0], b1 = starts[k0 + nf - 1] + PL; await cb(new Uint8Array(await file.slice(b0, b1).arrayBuffer()), b0, nf, k0); prog(Math.min(0.9, 0.5 + k0 / frames * 0.4)); } };
    // akışlar: yuva baytlarını kareler boyunca birleştir, header ara
    const streams = new Map(), lyHint = ' — "Çerçeve düzeni" bölümünde sütun öncelikli/kayma ayarlarını kontrol edin ("Düzeni otomatik bul" yardımcı olur)';
    for (const S of def.sheets) for (const st of S.streams) {
      const slot = new Uint8Array(frames * st.win);
      await pass(async (b, o0, nf, k0) => { for (let k = 0; k < nf; k++) FRM.gather(b, starts[k0 + k] - o0, LY, st.start, st.win, slot, (k0 + k) * st.win); });
      const pos = FRM.streamScan(slot, st), hx = st.hdr ? st.hdr.map(x => x.toString(16).padStart(2, '0')).join(' ').toUpperCase() : '';
      streams.set(S.name + '\u0000' + st.unit, {slot, pos, st});
      if (!st.hdr) continue;
      if (!pos.length) R('err', S.name, st.row, `Akış başlığı "${hx}" yuva baytları birleştirilince (bayt ${st.start}–${st.start + st.win - 1}, ${fmtCnt(frames)} kare) hiç bulunamadı; ${st.unit} değişkenleri boş kalır` + lyHint);
      else R('info', S.name, st.row, `${st.unit}: ${fmtCnt(pos.length)} paket bulundu (paket ${st.P} bayt, header ${hx})`);
    }
    const plan = FRM.plan(def), byKey = new Map(), byName = new Map();
    for (const p of plan) { byKey.set(p.sheet + '/' + p.name, p); if (!byName.has(p.name)) byName.set(p.name, p); }
    const rtErr = new Set();
    const f = {id: 'f' + (importFile.seq++), name: file.name, table: true, frm: {def, T, frames}, mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: T, baseFs: 1 / T, cnts: {}, baseN: frames, cols: []};
    const rawOf = async p => {   // formülsüz ham değerler {v, ok, g}
      if (p.v.stream) { const s = streams.get(p.sheet + '\u0000' + p.v.stream); return FRM.streamPackets(s.slot, s.pos, s.st.win, p); }
      if (whole) return FRM.extractFrames(u8, 0, frames, L, p, LY, 0);
      const spp = p.spp, out = new Float64Array(frames * spp); await pass(async (b, o0, nf, k0) => { out.set(FRM.extractFrames(b, o0, nf, L, p, LY, k0).v, k0 * spp); });
      return {v: out, ok: null, g: null};
    };
    let maxSpp = 1, maxN = 0;
    for (const p of plan) {
      const dt = T / p.spp, nm = p.sheet + '/' + p.name, v = p.v, ns = v.stream ? streams.get(p.sheet + '\u0000' + v.stream).pos.length : frames;
      const c = new Channel({name: nm, rest: p.name, base: p.name, comp: '', dev: p.sheet, kind: kindOf(p.sheet, p.name), n: ns * p.spp, file: f, label: nm, varIdx: -1, bin: true, tbl: true, unit: ''});
      c.dtS = dt; c.Tpkt = dt; c.t0 = 0; c.spp = 1; maxSpp = Math.max(maxSpp, p.spp); maxN = Math.max(maxN, frames * p.spp);
      c.binLoad = async () => {
        let r = await rawOf(p);
        if (v.formula && !v.formulaErr) {
          try {
            const cc = FRM.compile(v.formula), sel = new Map();
            for (const id of cc.ids) { const q = byKey.get(p.sheet + '/' + id) || byName.get(id); if (!q) throw new Error(`formüldeki "${id}" değişkeni çerçevede yok`); const rr = await rawOf(q); sel.set(id, {v: rr.v, spp: q.spp}); }
            r = FRM.applyFormula(p, r, id => sel.get(id));
          } catch (e) { const k = nm + '|' + (e.message || e); if (!rtErr.has(k)) { rtErr.add(k); R('err', p.sheet, v.row, `"${p.name}" formülü uygulanamadı (${e.message || e}); ham değer gösteriliyor`); toast(`${nm}: formül uygulanamadı — ham değer`, 5000); } }
        }
        const cp = FRM.compact(r); c.g = cp.g; c.spp = 1;
        return cp.v;
      };
      f.channels.push(c);
    }
    f.Tpkt = T / maxSpp; f.baseFs = maxSpp / T; f.baseN = maxN;
    prog(1); S.files.push(f); S.fopen.add(f.id); renderChips(); renderTree();
    const nerr = rep.filter(w => w.lvl === 'err').length, nw = rep.filter(w => w.lvl === 'warn').length;
    const head = `${file.name}: ${fmtCnt(frames)} kare × ${PL} bayt · ${def.sheets.length} alt sistem · ${fmtCnt(plan.length)} kanal` + (whole ? '' : ' · büyük dosya: kanallar seçildikçe dosyadan okunur');
    FS.last = {list: rep, head};
    toast(head + (nerr ? ` · ${nerr} hata` : '') + (nw ? ` · ${nw} uyarı` : ''), 8000, rep.length ? {t: 'Rapor', fn: () => frmReportDialog(rep, 'Çözme raporu', head)} : null);
    if (rep.length) setTimeout(() => frmReportDialog(rep, 'Çözme raporu — çözülemeyen/tanımsız kısımlar', head), 400);
  });
}
function frmDropBin(files) { FS.bin = files[0]; frmDialog(); }
(function frmBind() { const b = document.getElementById('btnFrm'); if (b) b.onclick = () => frmDialog(); })();
