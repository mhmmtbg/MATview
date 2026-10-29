// Hampel: silinmiş/NaN örnekler medyanı bozmamalı; gerçek sıçrama bulunmalı
const D = require('../src/dsp.js'); let bad = 0; const ck = (c, m) => { if (!c) { console.log('HATA:', m); bad++; } };
const n = 400, x = new Float64Array(n), del = new Uint8Array(n); for (let i = 0; i < n; i++) x[i] = Math.sin(i / 20) + 0.01 * Math.sin(i * 7);
x[100] = 25; x[250] = -30; for (let i = 180; i < 190; i++) del[i] = 1; x[185] = NaN; x[300] = NaN; x[50] = 40;
const f = [...D.hampelFlags(x, 5, 6, del)]; ck(f.includes(100) && f.includes(250) && f.includes(50), 'sıçramalar bulunamadı ' + f);
ck(!f.includes(300) && !f.some(i => i >= 180 && i < 190) && f.length === 3, 'NaN / silinmiş örnek işaretlenmemeli ' + f);
const y = new Float64Array(n).fill(1); y[10] = 1; const f2 = [...D.hampelFlags(y, 5, 6, null)]; ck(f2.length === 0, 'sabit sinyalde işaret yok');
console.log(bad ? 'BAŞARISIZ ' + bad : 'OK t_hampel'); process.exit(bad ? 1 : 0);
