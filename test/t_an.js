const DSP = require('../src/dsp.js'); const assert = require('assert');
const fs = 20000, N = 20 * fs;
// 1) 1/3 oktav: 1 kHz sinüs, genlik 1 -> RMS 0.7071 -> 1k bandı = 20log10(.7071/1) = -3.01 dB (ref=1); toplam da aynı
let x = new Float64Array(N); for (let i = 0; i < N; i++) x[i] = Math.sin(2 * Math.PI * 1000 * i / fs);
let o = DSP.octaveBands(x, fs, {frac: 3, fmin: 20, fmax: 8000, ref: 1});
let k = Array.from(o.fc).findIndex(c => Math.abs(c - 1000) < 1); assert(Math.abs(o.L[k] + 3.01) < 0.15, 'band ' + o.L[k]); assert(Math.abs(o.overall + 3.01) < 0.15, 'toplam ' + o.overall);
const oa = DSP.octaveBands(x, fs, {frac: 3, fmin: 20, fmax: 8000, ref: 1, weight: 'A'}); assert(Math.abs(oa.L[k] + 3.01) < 0.15, 'A@1k ≈0 dB düzeltme');
assert(Math.abs(DSP.wA(1000)) < 0.1 && Math.abs(DSP.wA(100) + 19.1) < 0.2 && Math.abs(DSP.wC(1000)) < 0.1, 'ağırlık'); 
// beyaz gürültü: sabit PSD -> bant gücü bant genişliğiyle orantılı (1/3 oktav: +1 dB/ 1/3 oktav yaklaşık +1 dB)
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }; for (let i = 0; i < N; i++) x[i] = rnd() * Math.sqrt(12);
o = DSP.octaveBands(x, fs, {frac: 3, fmin: 100, fmax: 8000, ref: 1}); const d = o.L[o.L.length - 1] - o.L[0], ex = 10 * Math.log10(o.fc[o.fc.length - 1] / o.fc[0]); assert(Math.abs(d - ex) < 0.6, 'beyaz gürültü eğimi ' + d + ' ' + ex);
let tot = 0; for (const p of o.power) tot += p; assert(tot > 0);
// 2) SRS: fn'de kalıcı sinüs -> Q katı
const fs2 = 20000; const n2 = 4 * fs2; const y = new Float64Array(n2); for (let i = 0; i < n2; i++) y[i] = Math.sin(2 * Math.PI * 100 * i / fs2);
let s = DSP.srs(y, fs2, [100, 10], 10); assert(Math.abs(s.maximax[0] - 10) < 0.35, 'SRS Q ' + s.maximax[0]); assert(s.maximax[1] < 1.2, 'düşük fn ≈ giriş (' + s.maximax[1] + ')');
// sabit giriş -> çıkış = giriş
s = DSP.srs(new Float64Array(2000).fill(2), fs2, [50], 10); assert(Math.abs(s.pos[0] - 2) < 1e-9);
// yarım-sinüs darbesi: çok yüksek fn'de SRS -> tepe girişe yakın
const hs = new Float64Array(4000); for (let i = 0; i < 200; i++) hs[i] = 100 * Math.sin(Math.PI * i / 200); s = DSP.srs(hs, fs2, [2000], 10); assert(s.maximax[0] > 95 && s.maximax[0] < 125, 'yarım sinüs ' + s.maximax[0]);
// 3) FRF: y = 2*x gecikmeli + bağımsız gürültü
const M = 100000, xin = new Float64Array(M), yout = new Float64Array(M); for (let i = 0; i < M; i++) xin[i] = rnd(); for (let i = 0; i < M; i++) yout[i] = 2 * xin[i] + 0.05 * rnd();
let r = DSP.frf(xin, yout, 1000, {nfft: 1024, overlap: 0.5}); const m = 100; assert(Math.abs(r.h1[m] - 2) < 0.05 && Math.abs(r.h2[m] - 2) < 0.06 && r.coh[m] > 0.99, 'FRF ' + r.h1[m] + ' ' + r.h2[m] + ' ' + r.coh[m]); assert(Math.abs(r.phase[m]) < 3);
// gürültülü çıkış: H1 < H2, koherans düşer
for (let i = 0; i < M; i++) yout[i] = 2 * xin[i] + 1.0 * rnd(); r = DSP.frf(xin, yout, 1000, {nfft: 1024}); assert(r.coh[m] < 0.95 && r.h1[m] <= r.h2[m] + 1e-9);
// faz: 90° gecikme için y[n]=x[n-?]; basit gecikme d örnek -> faz = -360*f*d/fs
const dl = 5; for (let i = 0; i < M; i++) yout[i] = i >= dl ? xin[i - dl] : 0; r = DSP.frf(xin, yout, 1000, {nfft: 1024}); const f0 = r.f[m]; assert(Math.abs(r.phase[m] - (-360 * f0 * dl / 1000)) < 2, 'faz ' + r.phase[m]);
// WAV: yazıcı -> okuyucu gidiş-dönüş (16 bit) ve 24 bit / float el yapımı
(async () => { const y = Float64Array.from({length: 1000}, (_, i) => 0.5 * Math.sin(i / 7)), bl = DSP.wavBlob(y, 8000), u = new Uint8Array(await bl.arrayBuffer()), w = DSP.parseWav(u);
  assert.strictEqual(w.rate, 8000); assert.strictEqual(w.channels.length, 1); let mx = 0; for (let i = 0; i < 1000; i++) mx = Math.max(mx, Math.abs(w.channels[0][i] - y[i])); assert(mx < 1e-4, 'wav ' + mx);
  // 2 kanallı float32
  const b = new ArrayBuffer(44 + 16), dv = new DataView(b), wr = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0))); wr(0, 'RIFF'); dv.setUint32(4, 52, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 3, true); dv.setUint16(22, 2, true); dv.setUint32(24, 1000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 8, true); dv.setUint16(34, 32, true); wr(36, 'data'); dv.setUint32(40, 16, true);
  [0.25, -0.5, 0.75, 1].forEach((v, i) => dv.setFloat32(44 + i * 4, v, true)); const f = DSP.parseWav(new Uint8Array(b)); assert.deepStrictEqual(Array.from(f.channels[1]), [-0.5, 1]); assert.strictEqual(f.float, true);
  console.log('t_an OK'); })();
