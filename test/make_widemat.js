// Tek .mat ↔ oturum kanal sayısı denetimi için sentetik kayıt: çok elemanlı değişkenler (8, 260 ve 300 elemanlı) içerir.
//   node test/make_widemat.js <klasör>   → <klasör>/out/kayit_tum.mat ve <klasör>/beklenen.json (oturumdaki kanal sayıları)
const fs = require('fs'), cp = require('child_process'), path = require('path');
const TP = require('./tlm_core.js')();
const D = (process.argv[2] || '/tmp/_mv_w') + '/';
(async () => {
  fs.mkdirSync(D, { recursive: true });
  const S0 = TP.buildSamples().settings;
  S0.frameTypes.forEach(ft => {
    ft.templateRows.push(['WIDE', '3000', 'spec', 'uint16', '300', '', '', '', '', '', '', '']);
    ft.templateRows.push(['WIDE', 'auto', 'spec2', 'float32', '260', '', '', '', '', '', '', '']);
    ft.templateRows.push(['WIDE', 'auto', 'small', 'uint16', '8', '', '', '', '', '', '', '']);
  });
  S0.framePeriodMs = 10; S0.live = { source: 'sim', sim: { periodMs: 10, loop: false } };
  fs.writeFileSync(D + 'ayarlar.json', JSON.stringify({ app: 'MATViewCerceve', format: 2, version: TP.VERSION, settings: S0, liveWork: [] }));
  cp.execFileSync('node', [path.join(__dirname, 'make_tlm.js'), D, D + 'ayarlar.json', '600'], { stdio: 'ignore' });
  const S = JSON.parse(fs.readFileSync(D + 'ayarlar.json', 'utf8')).settings; S.singleMat = true; S.matEnabled = true;
  const bin = new File([fs.readFileSync(D + 'kayit.bin')], 'kayit.bin');
  const sink = new TP.MemSink();
  await TP.runJobs({ settings: S, files: [bin], sink, folderName: 'x', mode: 'concat' }, () => {});
  fs.mkdirSync(D + 'out', { recursive: true });
  for (const [k, v] of Object.entries(sink.out)) fs.writeFileSync(D + 'out/' + k, v);
  let done = null; const rep = new Map();
  const host = TP.createHost(m => { if (m.t === 'done' || m.t === 'error') done = m; if (m.t === 'reply' && rep.has(m.rq)) rep.get(m.rq)(m.r); });
  await host({ cmd: 'start', settings: S, files: [bin], folderName: 'x', mode: 'concat', collect: true });
  const per = {}, total = { n: 0 };
  done.sessions[0].units.forEach(u => u.cols.forEach(c => { if (c.kind === 'bytes' || !c.n) return; per[u.name] = (per[u.name] || 0) + 1; total.n++; }));
  // 9 GB'lık kayıt benzetimi: MAT sınırları küçültülür → geniş alanlar bölünerek, birimler düz değişken olarak yazılır
  const sp = done.sessions[0], ui = sp.units.findIndex(u => u.name === 'WIDE'), ci = sp.units[ui].cols.find(c => c.name === 'spec[137]').i;
  const ref = await new Promise(res => { rep.set('r1', res); host({ rq: 'r1', cmd: 'col', sid: sp.id, u: ui, c: ci }); });
  TP.MAT_VAR_MAX = 300000; TP.MAT_STRUCT_MAX = 400000;
  const sink2 = new TP.MemSink(), logs = [];
  await TP.runJobs({ settings: S, files: [bin], sink: sink2, folderName: 'x', mode: 'concat' }, m => { if (m.t === 'log') logs.push(...m.lines); });
  fs.mkdirSync(D + 'bol', { recursive: true });
  for (const [k, v] of Object.entries(sink2.out)) fs.writeFileSync(D + 'bol/' + k, v);
  const nSplit = logs.filter(l => /bölündü/.test(JSON.stringify(l))).length, nLost = logs.filter(l => /yazılamadı|yazılmadı/.test(JSON.stringify(l))).length;
  fs.writeFileSync(D + 'beklenen.json', JSON.stringify({ per, total: total.n, ref137: Array.from(ref.v.slice(0, 20)), nSplit, nLost }));
  console.log('bölünen alan uyarısı:', nSplit, '· yazılamayan:', nLost); logs.filter(l => /bölündü|yazılamadı|yazılmadı/.test(JSON.stringify(l))).forEach(l => console.log('  ', JSON.stringify(l).slice(0, 220)));
  console.log('oturum kanalı:', total.n, JSON.stringify(per));
})();
