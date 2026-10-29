const DSP = require('../src/dsp.js'); const assert = require('assert');
const fs = 16000, n = fs * 12, x = new Float64Array(n); let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
for (let i = 0; i < n; i++) {
  const t = i / fs; let v = 0.02 * gauss() + 0.3 + 0.05 * Math.sin(2 * Math.PI * 50 * t) + 0.03 * Math.sin(2 * Math.PI * 100 * t) + 0.02 * Math.sin(2 * Math.PI * 150 * t);
  if (t > 4 && t < 9) v += 0.5 * Math.sin(2 * Math.PI * 440 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t));   // "konuşma" bölümü
  x[i] = v;
}
for (const k of [20000, 60000, 130000]) x[k] += 3;   // tıklar
const r = DSP.autoClean(x, fs); console.log(r.log.join('\n'));
assert.strictEqual(r.plan.notch, 50); assert.ok(r.plan.nh >= 3); assert.ok(r.plan.click); assert.ok(r.plan.dn);
assert.ok(r.noise && (r.noise[0] / fs < 4 - 0.4 || r.noise[0] / fs > 9)); assert.strictEqual(r.plan.dc, 'mean');
// sessiz/temiz sinyal: yanlış alarm yok
const y = Float64Array.from({length: n}, () => 0.02 * gauss()); const r2 = DSP.autoClean(y, fs); console.log('--- beyaz gürültü\n' + r2.log.join('\n'));
assert.strictEqual(r2.plan.notch, 0); assert.ok(!r2.plan.dn, 'beyaz gürültüde azaltma yok'); assert.ok(!r2.plan.click);
console.log('t_auto OK');
// düşük frekans uğultusu
const z = Float64Array.from({length: n}, (_, i) => 0.02 * gauss() + 0.5 * Math.sin(2 * Math.PI * 4 * i / fs)); const r3 = DSP.autoClean(z, fs); assert.strictEqual(r3.plan.hp, 20); console.log('hp OK, hum nh=', r.plan.nh);
// sessiz bölümsüz kayıt: sürekli ton + gürültü -> minimum istatistik profili
const cont = Float64Array.from({length: n}, (_, i) => 0.05 * gauss() + 0.4 * Math.sin(2 * Math.PI * 440 * i / fs) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.7 * i / fs)));
const r4 = DSP.autoClean(cont, fs); assert.ok(r4.plan.dn && r4.plan.dnMode === 'min', 'minstat'); console.log(r4.log.slice(-1)[0]);
const Pn = DSP.noiseFloorMinStat(cont, 2048, 0.1); const yy = DSP.spectralDenoise(cont, null, {nfft: 2048, reduceDb: 10, alpha: 2, noisePower: Pn});
const hf = a => { const P = DSP.welch(a, fs, {nfft: 4096, win: 'hann', overlap: 0.5, scale: 'psd', maxSeg: 500}); let s = 0, c = 0; for (let i = 0; i < P.f.length; i++) if (P.f[i] > 3000 && P.f[i] < 7000) { s += P.y[i]; c++; } return s / c; };
const red = 10 * Math.log10(hf(yy) / hf(cont)); console.log('gürültü tabanı değişimi dB', red.toFixed(1)); assert.ok(red < -6);
let tone = 0, tone2 = 0; for (let i = 0; i < n; i++) { tone += cont[i] * cont[i]; tone2 += yy[i] * yy[i]; } assert.ok(Math.abs(Math.sqrt(tone2 / tone) - 1) < 0.05);
// seviye platoları: boşta, -9, -6, -3, 0 dB (güç oranı)
const fs2 = 2000, lv = [[0, 2, null], [2, 6, -9], [6, 10, -6], [10, 14, -3], [14, 18, 0]], n2 = fs2 * 18, xx = new Float64Array(n2);
for (let i = 0; i < n2; i++) { const t = i / fs2; const L = lv.find(l => t >= l[0] && t < l[1]); xx[i] = (L && L[2] !== null ? Math.pow(10, L[2] / 20) : 0.01) * gauss(); }
const ls = DSP.levelSegments(xx, fs2, {step: 3, minDur: 1}); console.log(ls.segs.map(s => `${s.level}dB ${(s.i0 / fs2).toFixed(1)}-${(s.i1 / fs2).toFixed(1)}s`).join(' | '));
assert.deepStrictEqual(ls.segs.map(s => s.level), [-9, -6, -3, 0]);
console.log('seviye OK');
