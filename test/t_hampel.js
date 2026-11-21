// v2.38 (sentetik veri): Temizle › Hampel — basamaklı / kuantalı veride düşüş ve sıçrama temizleme
// Sinyal: 0.0017 adımlı kuantalı taban (2.046), seviye basamakları, seyrek ve yoğun (her 3–40 örnekte) düşüşler (≈0.65),
// 1–6 örneklik sıçrama kümeleri (≈8). Beklenen: bozuk noktaların çoğu bulunur, basamak kenarları silinmez.
const D = require('../src/dsp.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } };
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const n = 220000, q = 0.0017, x = new Float64Array(n), bad = new Uint8Array(n);
const base = i => i < 100000 ? 2.046 : i < 160000 ? 2.097 : i < 190000 ? 2.250 : 2.250 + Math.floor((i - 190000) / 5000) * 0.08;
for (let i = 0; i < n; i++) { let v = base(i); if (i < 70000 && rnd() < 0.02) v += 0.1; x[i] = Math.round(v / q) * q; }
for (let i = 1000; i < n; i += 1 + Math.floor(rnd() * 4000)) { x[i] = 0.6 + rnd() * 0.1; bad[i] = 1; }                       // seyrek düşüş
for (let i = 130000; i < 155000; i += 3 + Math.floor(rnd() * 37)) { x[i] = 0.65; bad[i] = 1; }                               // yoğun düşüş
for (let c = 0; c < 40; c++) { const s = 70000 + Math.floor(rnd() * 12000), L = 1 + Math.floor(rnd() * 6); for (let j = 0; j < L; j++) { x[s + j] = 8 + rnd() * 0.2; bad[s + j] = 1; } }   // sıçrama kümeleri
const nb = bad.reduce((a, b) => a + b, 0);
function score(fl) { let tp = 0, fp = 0, edge = 0; const st = new Set([100000, 160000, 190000]); for (let k = 195000; k < n; k += 5000) st.add(k);
  for (const i of fl) { if (bad[i]) tp++; else { fp++; for (const s of st) if (Math.abs(i - s) <= 25) edge++; } } return {tp, fp, edge, recall: tp / nb}; }
const old = score(D.hampelFlags(x, 20, 5, null));
const neu = score(D.hampelFlags(x, 20, 5, null, 0, true));
const neuG = score(D.hampelFlags(x, 20, 5, null, 0.3, true));
console.log('bozuk', nb, '· eski', old, '· yeni', neu, '· yeni + en az sapma 0.3', neuG);
ok(old.recall < 0.5, 'eski davranış zaten iyiyse test anlamsız');
ok(neu.recall > 0.97, 'yeni: bozuk noktaların çoğu bulunmalı ' + neu.recall);
ok(neu.edge === 0, 'basamak kenarı seçilmemeli ' + neu.edge);
ok(neuG.recall > 0.97 && neuG.fp === 0, 'en az sapma ile küçük dalgalanmalar korunmalı ' + JSON.stringify(neuG));
// eski çağrı biçimi (akustik tık temizleme) değişmedi
const z = new Float64Array(5000); for (let i = 0; i < z.length; i++) z[i] = Math.sin(i / 7) + (rnd() - .5) * 0.01; z[2000] = 9;
ok(JSON.stringify(Array.from(D.hampelFlags(z, 5, 6, null))) === '[2000]', 'eski kip');
console.log('t_hampel:', fail ? fail + ' HATA' : 'OK'); process.exit(fail ? 1 : 0);
