// Telemetri modülü çekirdeği: dosya kipi (CSV/MAT + tek .mat) ile MATView'e aktarma (oturum) aynı değerleri vermeli;
// tek .mat MATView'in MAT okuyucusuyla açılabilmeli; zaman ekseni kayıp çerçeveleri boşluk olarak göstermeli; kamera MP4'e çözülmeli.
const fs = require('fs'), cp = require('child_process'), path = require('path');
const TP = require('./tlm_core.js')();
const src = ['mat.js'].map(f => fs.readFileSync(path.join(__dirname, '../src/', f), 'utf8').replace(/if \(typeof module.*\n/, '')).join('\n');
const MAT = new Function(src + ';return MAT;')();
const D = '/tmp/_mv_tlm/';
if (!fs.existsSync(D + 'kayit.bin')) cp.execFileSync('node', [path.join(__dirname, 'make_tlm.js'), D]);
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('  HATA:', m); } };
const memFile = b => ({ size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), slice: (a, e) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset + a, b.byteOffset + e) }) });
async function readMat(u8) { const m = await MAT.open(memFile(Buffer.from(u8))); const o = {}; for (const v of m.vars) if (v.numeric) o[v.name] = { dims: v.dims, d: await MAT.load(m, v) }; return o; }
(async () => {
  const S = (o => o.settings || o)(JSON.parse(fs.readFileSync(D + 'ayarlar.json', 'utf8'))); S.singleMat = true; S.matEnabled = true;
  const bin = new File([fs.readFileSync(D + 'kayit.bin')], 'kayit.bin');
  // 1) dosya kipi
  const sink = new TP.MemSink(), logs = [];
  const r = await TP.runJobs({ settings: S, files: [bin], sink, folderName: 'x', mode: 'concat' }, m => { if (m.t === 'log') logs.push(...m.lines); });
  console.log('dosyalar:', r.files.join(' '));
  ok(r.files.includes('kayit_tum.mat'), 'kayit_tum.mat yok');
  fs.mkdirSync(D + 'out', { recursive: true }); for (const [k, v] of Object.entries(sink.out)) fs.writeFileSync(D + 'out/' + k, v);
  ok(r.files.some(f => /KAMERA_A_goruntu\.mp4/.test(f)) || !fs.existsSync(D + 'kamera_1.h264'), 'kamera mp4 yok');
  const tum = await readMat(sink.out['kayit_tum.mat']);
  const units = r.files.filter(f => /\.mat$/.test(f) && f !== 'kayit_tum.mat').map(f => f.replace(/\.mat$/, ''));
  let nCmp = 0;
  for (const u of units) {
    const per = await readMat(sink.out[u + '.mat']);
    for (const [k, v] of Object.entries(per)) {
      const t = tum[u + '.' + k] || tum[u + '_' + k];
      if (!t) { ok(false, 'tek .mat içinde yok: ' + u + '.' + k + ' (anahtarlar: ' + Object.keys(tum).filter(x => x.startsWith(u)).slice(0, 4).join(',') + ')'); continue; }
      ok(t.d.length === v.d.length && t.d.every((x, i) => x === v.d[i] || (x !== x && v.d[i] !== v.d[i])), 'değer farkı ' + u + '.' + k); nCmp++;
    }
  }
  console.log('tek .mat ↔ birim .mat karşılaştırılan değişken:', nCmp);
  const obcT = tum['OBC.t'].d, gap = []; for (let i = 1; i < obcT.length; i++) { const d = Math.round((obcT[i] - obcT[i - 1]) * 1000); if (d !== 10) gap.push([i, d]); }
  console.log('OBC.t sıçramaları (ms):', JSON.stringify(gap));
  ok(gap.length === 1 && gap[0][1] === 40, 'kayıp çerçeve boşluğu beklenmiyor');
  // 2) MATView'e aktarma (oturum)
  let done = null; const rep = new Map();
  const host = TP.createHost(m => { if (m.t === 'done' || m.t === 'error') done = m; if (m.t === 'reply') rep.get(m.rq)(m); });
  await host({ cmd: 'start', settings: S, files: [bin], folderName: 'x', mode: 'concat', collect: true });
  ok(done && done.t === 'done', 'toplama kipi: ' + (done && done.message));
  const ss = done.sessions[0], req = (cmd, o) => new Promise(res => { const id = Math.random(); rep.set(id, res); host(Object.assign({ rq: id, cmd }, o)); });
  let nCol = 0;
  for (let ui = 0; ui < ss.units.length; ui++) {
    const u = ss.units[ui];
    for (const c of u.cols) {
      if (c.kind === 'bytes') continue;
      const x = (await req('col', { sid: ss.id, u: ui, c: c.i })).r;
      const m = /^(.*)\[(\d+)\]$/.exec(c.name), key = u.name + '.' + (c.counter ? 'frame_counter' : m ? m[1] : c.name), t = tum[key];
      if (!t) { ok(false, 'oturum sütunu tek .mat içinde yok: ' + key); continue; }
      const col = m ? +m[2] : 0, R = t.dims[0], ref = t.d.subarray(col * R, (col + 1) * R);
      ok(x.v.length === ref.length && x.v.every((a, i) => a === ref[i] || (a !== a && ref[i] !== ref[i])), 'oturum farkı ' + key + (m ? '[' + m[2] + ']' : ''));
      if (c.ownT) ok(x.t && x.t.length === x.v.length, 'kendi zamanı eksik ' + key);
      nCol++;
    }
  }
  console.log('oturum ↔ tek .mat karşılaştırılan sütun:', nCol, '· video:', (done.videos || []).map(v => v.name + ' ' + v.summary).join(' | '));
  if (fs.existsSync(D + 'kamera_1.h264')) ok((done.videos || []).length === 2 && done.videos.every(v => /\d+ kare/.test(v.summary) && +/(\d+) kare/.exec(v.summary)[1] > 250), 'kamera kareleri eksik');
  const m2 = (await req('mat', { sid: ss.id })).r, tum2 = await readMat(new Uint8Array(await m2.blob.arrayBuffer()));
  ok(Object.keys(tum2).length === Object.keys(tum).length && Object.keys(tum).every(k => tum2[k] && tum2[k].d.length === tum[k].d.length), 'oturumdan tek .mat farklı');
  await req('sclose', { sid: ss.id });
  const after = (await req('col', { sid: ss.id, u: 0, c: 0 }));
  ok(!!after.error, 'kapanan oturum hâlâ yanıt veriyor');
  if (bad) { console.log('BAŞARISIZ', bad); process.exit(1); }
  console.log('telemetri çekirdeği OK');
})().catch(e => { console.error(e); process.exit(1); });
