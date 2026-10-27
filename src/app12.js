/* ===== Telemetre çerçevesi (alt sistem sayfalı Excel) arayüzü: yükle, kalıcı işaretle, binary çöz, ana ekranda alt sistem → değişken ===== */
const FS = {src: null, def: null, name: '', perm: false, ms: 10, skip: 0, opt: {indexBase: 1, blockMode: 'block'}, bin: null, last: null};
const FKEY = 'mv.frame';
function frmReparse() { FS.def = FRM.parse(FS.src, FS.opt); }
(function frmInit() {
  try { const j = JSON.parse(localStorage.getItem(FKEY) || 'null'); if (j && j.src) { FS.src = j.src; FS.name = j.name || 'kalıcı çerçeve'; if (j.opt) FS.opt = Object.assign(FS.opt, j.opt); if (j.ms > 0) FS.ms = j.ms; if (j.skip >= 0) FS.skip = j.skip | 0; frmReparse(); FS.perm = true; } } catch (e) { FS.src = null; FS.def = null; /* depolama yok / eski biçim */ }
})();
function frmPersist(on) {
  try {
    if (on && FS.src) localStorage.setItem(FKEY, JSON.stringify({name: FS.name, src: FS.src, opt: FS.opt, ms: FS.ms, skip: FS.skip, ts: Date.now()}));
    else localStorage.removeItem(FKEY);
    FS.perm = !!on && !!FS.src; return true;
  } catch (e) { FS.perm = false; toast('Çerçeve kalıcı kaydedilemedi (tarayıcı depolaması dolu/engelli): ' + (e.message || e), 7000); return false; }
}
async function frmLoadExcel(file) {
  try {
    const sheets = await XLSX.read(file), src = sheets.map(x => ({name: x.name, rows: (x.rows || []).map(r => (r || []).slice(0, 12).map(v => v == null ? null : v))}));
    const def = FRM.parse(src, FS.opt); FS.src = src; FS.def = def; FS.name = file.name; FS.perm = false;
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
  const body = h('div'), defBox = h('div'), binBox = h('div');
  const xin = h('input', {type: 'file', accept: '.xlsx', hidden: true, onchange: async e => { if (e.target.files[0]) { await frmLoadExcel(e.target.files[0]); paint(); } }});
  const bin = h('input', {type: 'file', hidden: true, onchange: e => { if (e.target.files[0]) { FS.bin = e.target.files[0]; paint(); } }});
  const readPar = () => { if ($('#frmBase')) { FS.opt.indexBase = +sv('frmBase'); FS.opt.blockMode = sv('frmBlk'); } const ms = num('frmMs'), sk = num('frmSkip') | 0; if (!(ms > 0)) throw new Error('Kare periyodu > 0 olmalı'); if (!(sk >= 0)) throw new Error('Atlanacak bayt ≥ 0 olmalı'); FS.ms = ms; FS.skip = sk; };
  function paint() {
    defBox.replaceChildren(); binBox.replaceChildren();
    defBox.append(h('div', {class: 'btns'}, btn('Çerçeve Excel\'i seç…', () => xin.click()), FS.def ? btn('Rapor…', () => frmReportDialog(FS.def.warns, 'Çerçeve tanımı raporu', FS.name)) : null,
      FS.def && FS.perm ? btn('Kalıcı çerçeveyi kaldır', () => { frmPersist(false); toast('Kalıcı çerçeve kaldırıldı (bu oturumda yüklü kalır)'); paint(); }, 'danger') : null));
    if (!FS.def) { defBox.append(h('div', {class: 'note'}, 'Her alt sistem ayrı bir sayfadır. Sütunlar: Birim · Index · Değişken · Tip · Eleman Sayısı · Formül · Byte Endian · Bit Endian · Örnek Sayısı · Undersample Header · isUndersample. Index, 12.500 baytlık karede 1 tabanlı bayt sırasıdır; "auto" bir önceki değişkenden sonra devam eder.')); }
    else {
      const s = frmStats(FS.def), err = FS.def.warns.filter(w => w.lvl === 'err').length;
      defBox.append(h('div', {class: 'note'}, `${FS.name} · ${s.sheets} alt sistem · ${fmtCnt(s.vars)} değişken (${fmtCnt(s.chans)} kanal) · ${s.streams} akış başlığı · kare ${fmtCnt(FS.def.frameBytes)} bayt, tanımlı ${fmtCnt(s.covered)} bayt (%${s.pct.toFixed(1)}), tanımsız ${fmtCnt(s.undef)}`),
        err ? h('div', {class: 'note', style: 'color:var(--danger)'}, `${err} satır okunamadı — "Rapor…" ile bakın.`) : null,
        chkIn('frmPerm', 'Bu çerçeveyi kalıcı işaretle (sonraki açılışlarda otomatik yüklenir)', FS.perm));
      const cb = defBox.querySelector('#frmPerm'); cb.onchange = () => { if (cb.checked) { if (!frmPersist(true)) cb.checked = false; else toast('Çerçeve kalıcı işaretlendi'); } else { frmPersist(false); toast('Kalıcı işaret kaldırıldı'); } paint(); };
    }
    binBox.append(h('div', {class: 'btns'}, btn('Binary dosya seç…', () => bin.click())), h('div', {class: 'note', id: 'frmInfo'}, FS.bin ? '' : 'Henüz binary dosya seçilmedi.'));
    if (FS.def) {
      binBox.append(fr('Kare periyodu (ms)', numIn('frmMs', FS.ms, {min: 0})), fr('Atlanacak ilk bayt', numIn('frmSkip', FS.skip, {min: 0})),
        fr('Index tabanı', selIn('frmBase', [['1', '1 tabanlı (Index 1 = çerçevenin ilk baytı)'], ['0', '0 tabanlı (Index 0 = çerçevenin ilk baytı)']], FS.opt.indexBase)),
        fr('B örnekleme düzeni', selIn('frmBlk', [['block', 'Blok: önce tüm değişkenlerin 1. örneği, sonra 2. örneği (telemetryParser)'], ['var', 'Değişken ardışık: her değişkenin örnekleri yan yana']], FS.opt.blockMode)));
      for (const id of ['frmBase', 'frmBlk']) binBox.querySelector('#' + id).onchange = () => { try { readPar(); frmReparse(); if (FS.perm) frmPersist(true); } catch (e) { toast('Çerçeve yeniden çözümlenemedi: ' + (e.message || e), 6000); } paint(); };
      if (FS.bin) { const fi = FRM.frameInfo(FS.bin.size, FS.def.frameBytes, FS.skip); binBox.querySelector('#frmInfo').textContent = `${FS.bin.name} · ${fmtCnt(FS.bin.size)} bayt · ${fmtCnt(fi.frames)} kare` + (fi.rest ? ` · sonda ${fi.rest} bayt artık (atlanır)` : ''); }
    }
    if (FS.last) binBox.append(h('div', {class: 'btns'}, btn('Son çözme raporu…', () => frmReportDialog(FS.last.list, 'Çözme raporu', FS.last.head))));
  }
  body.append(card('1. Telemetre çerçevesi (Excel)', defBox), card('2. Binary dosya', binBox), xin, bin); paint();
  modal('Telemetre çerçevesi ile binary çöz (alt sistem sayfalı Excel)', body, [{t: 'Çöz ve ana ekrana ekle', primary: true, fn: () => {
    try { if (!FS.def) throw new Error('Önce çerçeve Excel\'ini seçin'); if (!FS.bin) throw new Error('Binary dosya seçin'); readPar(); if (FS.def.indexBase !== FS.opt.indexBase || FS.def.blockMode !== FS.opt.blockMode) frmReparse(); } catch (e) { toast(e.message, 5000); return false; }
    if (FS.perm) frmPersist(true); frmOpen(FS.bin);
  }}, {t: 'Kapat'}]);
}

async function frmOpen(file) {
  const def = FS.def, L = def.frameBytes, skip = FS.skip | 0, T = FS.ms / 1000;
  await busy('Telemetre çözülüyor: ' + file.name, async prog => {
    const info = FRM.frameInfo(file.size, L, skip); if (!info.frames) throw new Error(`Dosyada tam kare yok (${fmtCnt(file.size)} bayt < ${L} bayt/kare)`);
    const frames = info.frames, whole = file.size <= 700 * 1048576, rep = def.warns.map(w => Object.assign({}, w, {sheet: 'Tanım · ' + w.sheet}));
    const R = (lvl, sheet, row, msg) => rep.push({lvl, sheet, row, msg});
    const u8 = whole ? new Uint8Array(await file.arrayBuffer()) : null;
    if (info.rest) R('warn', 'Binary', 0, `Dosya sonunda ${info.rest} bayt tam kare oluşturmuyor; atlandı`);
    if (skip) R('warn', 'Binary', 0, `İlk ${skip} bayt atlandı`);
    // kare okuma: whole → tek blok; büyük dosya → 48 MB bloklar
    const pass = async cb => { if (whole) { await cb(u8, skip, frames, 0); return; } const BF = Math.max(1, Math.floor(48e6 / L)); for (let k0 = 0; k0 < frames; k0 += BF) { const nf = Math.min(BF, frames - k0); await cb(new Uint8Array(await file.slice(skip + k0 * L, skip + (k0 + nf) * L).arrayBuffer()), 0, nf, k0); prog(Math.min(0.9, k0 / frames)); } };
    // akışlar: yuva baytlarını kareler boyunca birleştir, header ara
    const streams = new Map();
    for (const S of def.sheets) for (const st of S.streams) {
      const slot = new Uint8Array(frames * st.win);
      await pass(async (b, o0, nf, k0) => { for (let k = 0; k < nf; k++) { const a = o0 + k * L + st.start, e = Math.min(b.length, a + st.win); if (a < b.length) slot.set(b.subarray(a, e), (k0 + k) * st.win); } });
      const pos = FRM.streamScan(slot, st), hx = st.hdr ? st.hdr.map(x => x.toString(16).padStart(2, '0')).join(' ').toUpperCase() : '';
      streams.set(S.name + '\u0000' + st.unit, {slot, pos, st});
      if (!st.hdr) continue;
      if (!pos.length) R('err', S.name, st.row, `Akış başlığı "${hx}" yuva baytları birleştirilince (bayt ${st.start + 1}–${st.start + st.win}, ${fmtCnt(frames)} kare) hiç bulunamadı; ${st.unit} değişkenleri boş kalır`);
      else R('info', S.name, st.row, `${st.unit}: ${fmtCnt(pos.length)} paket bulundu (paket ${st.P} bayt, header ${hx})`);
    }
    const plan = FRM.plan(def), byKey = new Map(), byName = new Map();
    for (const p of plan) { byKey.set(p.sheet + '/' + p.name, p); if (!byName.has(p.name)) byName.set(p.name, p); }
    const rtErr = new Set();
    const f = {id: 'f' + (importFile.seq++), name: file.name, table: true, frm: {def, T, frames}, mat: null, vars: [], channels: [], mcache: new Map(), Tpkt: T, baseFs: 1 / T, cnts: {}, baseN: frames, cols: []};
    const rawOf = async p => {   // formülsüz ham değerler {v, ok, g}
      if (p.v.stream) { const s = streams.get(p.sheet + '\u0000' + p.v.stream); return FRM.streamPackets(s.slot, s.pos, s.st.win, p); }
      if (whole) return FRM.extractFrames(u8, skip, frames, L, p);
      const spp = p.spp, out = new Float64Array(frames * spp); await pass(async (b, o0, nf, k0) => { out.set(FRM.extractFrames(b, o0, nf, L, p).v, k0 * spp); });
      return {v: out, ok: null, g: null};
    };
    let maxSpp = 1, maxN = 0;
    for (const p of plan) {
      const dt = T / p.spp, nm = p.sheet + '/' + p.name, v = p.v, ns = v.stream ? streams.get(p.sheet + '\u0000' + v.stream).pos.length : frames;
      const c = new Channel({name: nm, rest: p.name, base: p.name, comp: '', dev: p.sheet, kind: 'other', n: ns * p.spp, file: f, label: nm, varIdx: -1, bin: true, tbl: true, unit: ''});
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
    const head = `${file.name}: ${fmtCnt(frames)} kare × ${L} bayt · ${def.sheets.length} alt sistem · ${fmtCnt(plan.length)} kanal` + (whole ? '' : ' · büyük dosya: kanallar seçildikçe dosyadan okunur');
    FS.last = {list: rep, head};
    toast(head + (nerr ? ` · ${nerr} hata` : '') + (nw ? ` · ${nw} uyarı` : ''), 8000, rep.length ? {t: 'Rapor', fn: () => frmReportDialog(rep, 'Çözme raporu', head)} : null);
    if (rep.length) setTimeout(() => frmReportDialog(rep, 'Çözme raporu — çözülemeyen/tanımsız kısımlar', head), 400);
  });
}
function frmDropBin(files) { FS.bin = files[0]; frmDialog(); }
(function frmBind() { const b = document.getElementById('btnFrm'); if (b) b.onclick = () => frmDialog(); })();
