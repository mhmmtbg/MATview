// İki düzeyli piramit: minmax, kaba kuvvetle aynı sonucu vermeli (silme ve NaN dahil)
const fs = require('fs'), src = fs.readFileSync(__dirname + '/../src/store.js', 'utf8');
const body = src.slice(src.indexOf('const PYR_B'), src.indexOf('Channel.seq = 1;') + 'Channel.seq = 1;'.length);
const Channel = new Function(body + '; return Channel;')();
let bad = 0; const ck = (c, m) => { if (!c) { console.log('HATA:', m); bad++; } };
const n = 300001, d = new Float64Array(n); let s = 7; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 2147483647 - .5) * 10; } d[777] = NaN; d[5000] = Infinity; d[123456] = 99; d[200000] = -88;
const c = new Channel({n, data: d});
const brute = (a, b) => { let lo = Infinity, hi = -Infinity; for (let i = a; i < b; i++) { if ((c.del && c.del[i]) || !isFinite(d[i])) continue; if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; } return [lo, hi]; };
const rng = []; for (let k = 0; k < 400; k++) { const a = (s = (s * 1103515245 + 12345) & 0x7fffffff) % n, len = [10, 200, 3000, 40000, 250000][k % 5]; rng.push([a, Math.min(n, a + len)]); }
const chk = tag => { for (const [a, b] of rng) { const e = brute(a, b), ok = c.minmax(a, b); if (!(e[0] === Infinity ? !ok : (c._mn === e[0] && c._mx === e[1]))) { ck(false, tag + ' ' + a + '-' + b + ' beklenen ' + e + ' bulunan ' + [c._mn, c._mx]); return; } } };
chk('ilk'); c.applyDelete(Uint32Array.from([123456, 200000, 100, 101, 102])); chk('silme sonrası'); c.restore(Uint32Array.from([123456, 100])); chk('geri alma sonrası');
const t0 = Date.now(); for (let k = 0; k < 2000; k++) c.minmax(0, n); ck(Date.now() - t0 < 500, 'tam aralık minmax yavaş ' + (Date.now() - t0));
console.log(bad ? 'BAŞARISIZ ' + bad : 'OK t_pyr'); process.exit(bad ? 1 : 0);
