// 2 GB'ı aşan MAT v5 yapısı (test/make_bigstruct.py): parça parça okumada yapının tüm alanları ve ondan sonraki değişkenler listelenmeli,
// alan değerleri doğru okunmalı. Regresyon: dolgu hesabı (size + 7) & ~7 2 GB üstünde negatif çıkıyor, yapı ve sonrası kayboluyordu.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const src = fs.readFileSync(path.join(__dirname, '../src/mat.js'), 'utf8').replace(/if \(typeof module.*\n/, '');
const MAT = new Function(src + ';return MAT;')();
const F = process.argv[2] || '/tmp/_mv_big/big.mat';
if (!fs.existsSync(F)) { fs.mkdirSync(path.dirname(F), { recursive: true }); cp.execFileSync('python3', [path.join(__dirname, 'make_bigstruct.py'), F]); }
const fd = fs.openSync(F, 'r'), size = fs.fstatSync(fd).size;
const rdr = (a, e) => { e = Math.min(e, size); const b = Buffer.alloc(Math.max(0, e - a)); if (b.length) fs.readSync(fd, b, 0, b.length, a); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const file = { size, slice: (a, e) => ({ arrayBuffer: async () => rdr(a, e == null ? size : e), slice: undefined }), arrayBuffer: async () => { throw new Error('tamamı okunmamalı'); } };
let bad = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) bad++; };
(async () => {
  const m = await MAT.open(file);
  const names = m.vars.filter(v => v.numeric).map(v => v.name);
  console.log('değişkenler:', names.join(' '));
  ok(m.lazy, 'parça parça okuma kipi');
  for (const n of ['BIG.t', 'BIG.a', 'BIG.big1', 'BIG.big2', 'BIG.c', 'ARKA.t', 'ARKA.x']) ok(names.includes(n), n + ' listelendi');
  const get = async n => MAT.load(m, m.vars.find(v => v.name === n));
  const c = await get('BIG.c'), x = await get('ARKA.x'), a = await get('BIG.a');
  ok(c.length === 1000 && c[999] === -999, 'BIG.c değerleri (2 GB sonrası)');
  ok(x.length === 1000 && x[5] === 7, 'ARKA.x değerleri (yapıdan sonra)');
  ok(a[10] === 20, 'BIG.a değerleri');
  const b1 = m.vars.find(v => v.name === 'BIG.big1'); ok(b1 && b1.dims[0] === 1000 && b1.dims[1] === 140000, 'BIG.big1 boyutu');
  fs.closeSync(fd);
  if (bad) { console.log('HATALI', bad); process.exit(1); }
  console.log('OK');
})();
