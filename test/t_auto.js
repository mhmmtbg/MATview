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
assert.strictEqual(r2.plan.notch, 0); assert.ok(!r2.plan.dn); assert.ok(!r2.plan.click);
console.log('t_auto OK');
// düşük frekans uğultusu
const z = Float64Array.from({length: n}, (_, i) => 0.02 * gauss() + 0.5 * Math.sin(2 * Math.PI * 4 * i / fs)); const r3 = DSP.autoClean(z, fs); assert.strictEqual(r3.plan.hp, 20); console.log('hp OK, hum nh=', r.plan.nh);
