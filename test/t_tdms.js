// TDMS ayrıştırıcı testi: ornek.tdms (test/make_tdms.py) ve nptdms referansı
const fs = require('fs'), path = require('path');
const TDMS = new Function(fs.readFileSync(path.join(__dirname, '../src/tdms.js'), 'utf8') + '; return TDMS;')();
const f = process.argv[2] || path.join(__dirname, '../ornek/ornek.tdms');
const r = TDMS.parse(new Uint8Array(fs.readFileSync(f)));
const ref = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
let bad = 0;
for (const g of r.groups) for (const c of g.channels) {
  const k = g.name + '/' + c.name; console.log(k, c.dtype, c.n, JSON.stringify(c.props));
  if (ref) { const rr = ref[k]; if (!rr || rr.length !== c.n) { bad++; console.log('  UZUNLUK FARKI', rr && rr.length); continue; } let m = 0; for (let i = 0; i < c.n; i++) m = Math.max(m, Math.abs(rr[i] - c.data[i])); if (m > 1e-6) { bad++; console.log('  FARK', m); } }
}
console.log(r.warn, bad ? 'HATA' : 'tdms OK'); process.exit(bad ? 1 : 0);
