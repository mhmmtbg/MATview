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
  let o = 0; for (let k = 0; k < 300; k++) { o += 12800; if (!(b[o] === 0xC3 && b[o + 1] === 0x5A)) o = b.indexOf(Buffer.from([0xC3, 0x5A]), o - 20); }
  b[o + 159] ^= 0x5A; b[o + 160] ^= 0x3C;
  // v2.54: tek bit hataları (küçük sıçrayıp geri dönme: ±1, ±2, ±4, ±64 …) — önceden "kayıp çerçeve" sayılıp zamana sahte boşluk ekleniyordu
  const at = k0 => { let q = 0; for (let k = 0; k < k0; k++) { q += 12800; if (!(b[q] === 0xC3 && b[q + 1] === 0x5A)) q = b.indexOf(Buffer.from([0xC3, 0x5A]), q - 20); } return q; };
  [[420, 159, 0x04], [500, 160, 0x04], [610, 159, 0x40], [700, 160, 0x02], [820, 159, 0x01], [905, 160, 0x10]].forEach(([k, byte, x]) => { b[at(k) + byte] ^= x; });
  const ref = await rowT(b0), bad = await rowT(b);
  console.log('özgün sıçramalar', JSON.stringify(ref), '· bozuk sayaçla', JSON.stringify(bad));
  if (JSON.stringify(ref) !== JSON.stringify(bad)) { console.log('HATA: bozuk sayaç zaman eksenini değiştirdi'); process.exit(1); }
  // düzeltme kapalıyken eski davranış (bit hataları kayıp sayılır) — karşılaştırma için
  S.cntGlitchFix = false; const off = await rowT(b); S.cntGlitchFix = true;
  console.log('düzeltme kapalı:', JSON.stringify(off)); if (JSON.stringify(off) === JSON.stringify(ref)) { console.log('HATA: test bit hatası üretmedi'); process.exit(1); }
  // birim testi: gerçek kayıp, taşma, tekrar korunur; tek bit hataları kaldırılır
  const cv = [], M = 65536; let c = 65500; for (let k = 0; k < 400; k++) { cv.push(c % M); c += (k === 100 ? 6 : 1); }   // 100'de 5 kayıp, 36'da taşma
  const g = cv.slice(); g[150] ^= 4; g[200] ^= 512; g[250] ^= 0x8000; g[300] = g[299];   // bit hataları + bir tekrar
  const oldT = []; let tf = 0, prev = g[0]; for (let k = 0; k < g.length; k++) { if (k) { let d = (((g[k] - prev) % M) + M) % M; if (d > M / 2) d -= M; tf += d === 0 ? 0 : d > 1 && d - 1 <= 1000 ? d : 1; prev = g[k]; } oldT.push(tf); }
  const fx = TP.cntGlitchFix(g, oldT, M, 1000), nt = oldT.map(fx.map);
  console.log('birim testi:', fx.glitch, 'bozuk ·', fx.lost, 'kayıp · son', nt[nt.length - 1], nt[101] - nt[100], nt[300] - nt[299], nt[150] - nt[149], nt[151] - nt[150]);
  if (fx.glitch !== 4 || fx.lost !== 5 || nt[399] !== 399 + 5 || nt[101] - nt[100] !== 6 || nt[302] - nt[301] !== 1) { console.log('HATA: sayaç düzeltmesi'); process.exit(1); }   // tekrar çerçevesi eski zamanla eşlenir (değer tabanlı eşleme), sonrası doğru
  // v2.55: sonraki çerçevelerle doğrulanan uzun kesinti (> en büyük boşluk) gerçek kayıptır; mutlak zaman = sayaç × periyot
  { const cv2 = []; let c2 = 70000; for (let k = 0; k < 300; k++) { cv2.push(c2 % M); c2 += (k === 99 ? 5001 : 1); }   // 100'de 5000 çerçevelik kesinti
    cv2[200] ^= 1 << 13;   // bit hatası (+8192 sıçrayıp geri dönme)
    const o2 = cv2.map((_, k) => k); const f2 = TP.cntGlitchFix(cv2, o2, M, 1000, false), f3 = TP.cntGlitchFix(cv2, o2, M, 1000, true);
    const n2 = o2.map(f2.map), n3 = o2.map(f3.map);
    console.log('uzun kesinti:', n2[100] - n2[99], 'son', n2[299], '· mutlak ilk', n3[0], 'son', n3[299], '·', f2.longGaps, 'uzun,', f2.glitch, 'bozuk');
    if (n2[100] - n2[99] !== 5001 || n2[299] !== 299 + 5000 || f2.glitch !== 1 || f2.longGaps !== 1 || n3[0] !== 70000 % M || n3[299] - n3[0] !== n2[299]) { console.log('HATA: uzun kesinti / mutlak zaman'); process.exit(1); } }
  console.log('sayaç dayanıklılığı OK');
})().catch(e => { console.error(e); process.exit(1); });
