// Bozuk sayaç: tek çerçevede bozulan sayaç değeri zaman eksenini kaydırmamalı (sentetik kayıt: test/make_tlm.js)
const fs = require('fs'), cp = require('child_process'), path = require('path');
const TP = require('./tlm_core.js')(); const D = '/tmp/_mv_tlm/';
if (!fs.existsSync(D + 'kayit.bin')) cp.execFileSync('node', [path.join(__dirname, 'make_tlm.js'), D]);
const S = JSON.parse(fs.readFileSync(D + 'ayarlar.json', 'utf8')).settings;
async function rowT(b) {
  let done = null; const rep = new Map();
  const host = TP.createHost(m => { if (m.t === 'done' || m.t === 'error') done = m; if (m.t === 'reply') rep.get(m.rq)(m); });
  await host({ cmd: 'start', settings: S, files: [new File([b], 'k.bin')], folderName: 'x', mode: 'concat', collect: true });
  const ss = done.sessions[0], req = (cmd, o) => new Promise(res => { const id = Math.random(); rep.set(id, res); host(Object.assign({ rq: id, cmd }, o)); });
  const t = (await req('rowt', { sid: ss.id, u: ss.units.findIndex(u => u.name === 'OBC') })).r.v, j = [];
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] !== 1) j.push([i, t[i] - t[i - 1]]);
  return j;
}
(async () => {
  const b0 = fs.readFileSync(D + 'kayit.bin'), b = Buffer.from(b0);
  let o = 0; for (let k = 0; k < 300; k++) { o += 12500; if (!(b[o] === 0xEB && b[o + 1] === 0x90)) o = b.indexOf(Buffer.from([0xEB, 0x90]), o - 20); }
  b[o + 124] ^= 0x5A; b[o + 125] ^= 0x3C;
  const ref = await rowT(b0), bad = await rowT(b);
  console.log('özgün sıçramalar', JSON.stringify(ref), '· bozuk sayaçla', JSON.stringify(bad));
  if (JSON.stringify(ref) !== JSON.stringify(bad)) { console.log('HATA: bozuk sayaç zaman eksenini değiştirdi'); process.exit(1); }
  console.log('sayaç dayanıklılığı OK');
})().catch(e => { console.error(e); process.exit(1); });
