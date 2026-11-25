// v2.47 (sentetik veri): Telemetri · Çöz ve dosyalara yaz
// - CSV varsayılan kapalı: yalnız .mat yazılır; CSV açılırsa yazılır; birim .mat de tek .mat de kapalıysa birim .mat'leri yazılır
// - Parametreler: yalnız seçilen parametreler çözülür (etiket kısmen seçili); seçilmeyen etiketler dosyaya da MATView oturumuna da girmez
const fs = require('fs'), cp = require('child_process'), path = require('path');
const TP = require('./tlm_core.js')();
const src = fs.readFileSync(path.join(__dirname, '../src/mat.js'), 'utf8').replace(/if \(typeof module.*\n/, '');
const MAT = new Function(src + ';return MAT;')();
const D = '/tmp/_mv_tlm/';
if (!fs.existsSync(D + 'kayit.bin')) cp.execFileSync('node', [path.join(__dirname, 'make_tlm.js'), D]);
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('  HATA:', m); } };
const memFile = b => ({ size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), slice: (a, e) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset + a, b.byteOffset + (e == null ? b.length : e)) }) });
async function names(u8) { const m = await MAT.open(memFile(Buffer.from(u8))); return m.vars.filter(v => v.numeric).map(v => v.name); }
(async () => {
  const S0 = (o => o.settings || o)(JSON.parse(fs.readFileSync(D + 'ayarlar.json', 'utf8'))); delete S0.csvEnabled;
  const bin = new File([fs.readFileSync(D + 'kayit.bin')], 'kayit.bin');
  const run = async o => { const S = Object.assign(JSON.parse(JSON.stringify(S0)), o), sink = new TP.MemSink(), logs = [];
    const r = await TP.runJobs({ settings: S, files: [bin], sink, folderName: 'x', mode: 'concat' }, m => { if (m.t === 'log') logs.push(...m.lines); }); return { r, sink, logs }; };
  // 1) varsayılan: CSV yok
  let a = await run({ matEnabled: false, singleMat: false });
  const csv0 = a.r.files.filter(f => /\.csv$/.test(f)), mats = a.r.files.filter(f => /\.mat$/.test(f));
  console.log('varsayılan:', a.r.files.length, 'dosya,', csv0.length, 'csv,', mats.length, 'mat');
  ok(!csv0.length && mats.length >= 5, 'varsayılan yalnız .mat olmalı');
  const b = await run({ csvEnabled: true, matEnabled: true }); ok(b.r.files.some(f => /\.csv$/.test(f)), 'CSV açıkken csv yazılmalı');
  const c = await run({ singleMat: true, matEnabled: false }); ok(c.r.files.length && c.r.files.every(f => !/\.csv$/.test(f)) && c.r.files.includes('kayit_tum.mat') && !c.r.files.some(f => /\.mat$/.test(f) && f !== 'kayit_tum.mat'), 'yalnız tek .mat: ' + c.r.files.join(' '));
  // 2) parametre seçimi: alan adları tam çözümden
  const per = {}; for (const f of mats) per[f.replace(/\.mat$/, '')] = (await names(a.sink.out[f])).filter(n => n !== 't' && n !== 'frame_counter' && !/_t$/.test(n));
  const U = Object.keys(per).find(u => per[u].length >= 3 && per[u].every(n => /^[A-Za-z]\w*$/.test(n))); ok(!!U, 'üç alanlı birim yok');
  const pick = per[U].slice(0, 2); console.log('seçim:', U, pick, '/', per[U].length);
  const s = await run({ labelFilter: { enabled: true, labels: [U], params: { [U]: pick } } });
  console.log('seçimle:', s.r.files.join(' '));
  ok(s.r.files.filter(f => /\.mat$/.test(f)).length === 1 && s.r.files.includes(U + '.mat'), 'yalnız seçilen etiketin .mat dosyası');
  const got = (await names(s.sink.out[U + '.mat'])); console.log('alanlar:', got.join(' '));
  ok(pick.every(p => got.includes(p)) && got.filter(n => n !== 't' && n !== 'frame_counter' && !/_t$/.test(n)).length === 2, 'yalnız seçilen parametreler yazılmalı');
  ok(got.includes('t'), 'zaman yazılmalı');
  ok(s.logs.some(l => /Yalnız seçilenler çözülüyor/.test(l) && l.includes('2 parametre')), 'günlük satırı');
  // seçilen değerler tam çözümdekiyle aynı
  const full = await MAT.open(memFile(Buffer.from(a.sink.out[U + '.mat']))), part = await MAT.open(memFile(Buffer.from(s.sink.out[U + '.mat'])));
  for (const p of pick.concat(['t'])) { const x = await MAT.load(full, full.vars.find(v => v.name === p)), y = await MAT.load(part, part.vars.find(v => v.name === p)); ok(x.length === y.length && x.every((v, i) => v === y[i] || (v !== v && y[i] !== y[i])), 'değer farkı ' + p); }
  // 3) MATView oturumu (collect) da yalnız seçilenleri içerir
  const S = Object.assign(JSON.parse(JSON.stringify(S0)), { labelFilter: { enabled: true, labels: [U], params: { [U]: pick } } }); let sess = null;
  const host = TP.createHost(m => { if (m.t === 'done' && m.sessions) sess = m.sessions; });
  await host({ cmd: 'start', settings: S, files: [bin], folderName: 'x', mode: 'concat', collect: true });
  const us = sess && sess[0].units; console.log('oturum:', us && us.map(u => u.name + ':' + u.cols.filter(c => !c.counter).map(c => c.name).join(',')).join(' · '));
  ok(us && us.length === 1 && us[0].name === U, 'oturumda yalnız seçilen etiket');
  console.log(bad ? 't_tlmsel: ' + bad + ' HATA' : 't_tlmsel: OK'); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('HATA', e.stack); process.exit(1); });
