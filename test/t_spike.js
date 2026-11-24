// v2.44 (sentetik veri): Temizle › Otomatik temizle (DSP.spikeAuto)
// - kümeler hâlinde dev bozuk değerler (≈ -1.3e155) + küçük sıçramalar + NaN: hepsi bulunur, fazladan nokta yok
// - sıfır tabanlı sabit sinyalde dev değerler; temiz sinyal ve seviye basamakları: yanlış alarm yok
// - kuantalı tabanda düşüş / sıçrama kümeleri (t_hampel verisi): çoğu bulunur, basamak kenarları silinmez
// - silinmiş noktalar hesaba katılmaz; dev değer silindikten sonra elle Hampel de çalışır
const D = require('../src/dsp.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } };
let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const MID = {gap: 3, nsig: 7, gminFrac: 0.2}, LOW = {gap: 4, local: false}, HIGH = {gap: 2, nsig: 5, gminFrac: 0.05};
// 1) ekran görüntüsündeki türden veri
{ const n = 200000, x = new Float64Array(n), bad = new Set();
  for (let i = 0; i < n; i++) x[i] = 0.02 * Math.sin(i / 300) + 0.002 * g() + (i > 120000 ? 0.05 : 0);
  for (const [s, L] of [[30000, 1], [31000, 40], [32000, 3], [50000, 200], [90000, 12], [150000, 1]]) for (let i = s; i < s + L; i++) { x[i] = -1.3e155 * (1 + 0.01 * rnd()); bad.add(i); }
  for (const i of [70000, 70001, 110000]) { x[i] = 0.5; bad.add(i); }
  x[80000] = NaN; bad.add(80000);
  for (const [nm, o, all] of [['orta', MID, true], ['yüksek', HIGH, true], ['düşük', LOW, false]]) {
    const r = D.spikeAuto(x, null, o), got = new Set(r.idx);
    const miss = [...bad].filter(i => !got.has(i) && (all || Math.abs(x[i]) > 1 || !isFinite(x[i]))), extra = [...got].filter(i => !bad.has(i));
    console.log(nm, 'bozuk', r.gross, 'sıçrama', r.local, 'kaçan', miss.length, 'fazla', extra.length);
    ok(!miss.length && extra.length <= (nm === 'yüksek' ? 5 : 0), nm + ': kaçan ' + miss.length + ' fazla ' + extra.length);
  }
  // dev değerler silindikten sonra elle Hampel (robust) küçük sıçramaları bulur
  const del = new Uint8Array(n); for (const i of bad) if (!(Math.abs(x[i]) < 1)) del[i] = 1;
  const f = new Set(D.hampelFlags(x, 10, 5, del, 0, true)); ok(f.has(70000) && f.has(110000), 'silinmiş dev değerler Hampel ölçeğini bozmamalı');
  // silinmiş noktalar yeniden bulunmaz
  ok(D.spikeAuto(x, del, MID).idx.every(i => !del[i]), 'silinmiş nokta tekrar seçildi');
}
// 2) sıfır tabanlı sabit sinyal + dev değerler
{ const z = new Float64Array(10000); for (const i of [100, 101, 5000]) z[i] = 3e150; ok(String(Array.from(D.spikeAuto(z, null, MID).idx)) === '100,101,5000', 'sabit sıfır taban'); }
// 3) temiz sinyal ve seviye basamakları: yanlış alarm yok
{ const n = 200000, c = new Float64Array(n); for (let i = 0; i < n; i++) c[i] = Math.sin(i / 50) + 0.01 * g() + (i % 20000 < 10000 ? 0 : 3);
  for (const [nm, o] of [['orta', MID], ['yüksek', HIGH]]) { const k = D.spikeAuto(c, null, o).idx.length; ok(k === 0, 'temiz sinyal ' + nm + ': ' + k); } }
// 4) kuantalı taban (t_hampel verisi)
{ seed = 7; const rn = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const n = 220000, q = 0.0017, x = new Float64Array(n), bad = new Uint8Array(n);
  const base = i => i < 100000 ? 2.046 : i < 160000 ? 2.097 : i < 190000 ? 2.250 : 2.250 + Math.floor((i - 190000) / 5000) * 0.08;
  for (let i = 0; i < n; i++) { let v = base(i); if (i < 70000 && rn() < 0.02) v += 0.1; x[i] = Math.round(v / q) * q; }
  for (let i = 1000; i < n; i += 1 + Math.floor(rn() * 4000)) { x[i] = 0.6 + rn() * 0.1; bad[i] = 1; }
  for (let i = 130000; i < 155000; i += 3 + Math.floor(rn() * 37)) { x[i] = 0.65; bad[i] = 1; }
  for (let c = 0; c < 40; c++) { const s = 70000 + Math.floor(rn() * 12000), L = 1 + Math.floor(rn() * 6); for (let j = 0; j < L; j++) { x[s + j] = 8 + rn() * 0.2; bad[s + j] = 1; } }
  const nb = bad.reduce((a, b) => a + b, 0), st = [100000, 160000, 190000]; for (let k = 195000; k < n; k += 5000) st.push(k);
  const r = D.spikeAuto(x, null, MID); let tp = 0, fp = 0, edge = 0;
  for (const i of r.idx) { if (bad[i]) tp++; else { fp++; if (st.some(s => Math.abs(i - s) <= 25)) edge++; } }
  console.log('kuantalı: bozuk', nb, 'bulunan', tp, 'fazla', fp, 'kenar', edge);
  ok(tp / nb > 0.97 && edge === 0, 'kuantalı veri: ' + tp + '/' + nb + ' kenar ' + edge);
}
console.log('t_spike:', fail ? fail + ' HATA' : 'OK'); process.exit(fail ? 1 : 0);
