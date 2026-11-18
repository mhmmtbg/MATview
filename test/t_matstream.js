// v2.29 (sentetik veri): geçici depo ve tek .mat akışı
// - toplu okuma (getMany / Prefetch) tek tek okumayla aynı sonucu verir (OPFS benzeri dosya ve Blob kipleri)
// - OPFS'e yazılamayan (kota) kesim Blob'a taşar, sıfır okunmaz
// - writeMatAll: StreamSink (null) ile Blob yolu aynı bayt sayısı; bayt dizisi alanı sütun öncelikli
const TP = require('./tlm_core.js')();
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } };
// OPFS SyncAccessHandle taklidi: belli bir boyuttan sonra kısa yazar (kota)
function FakeSync(limit) { this.buf = new Uint8Array(64 << 20); this.size = 0; this.limit = limit; }
FakeSync.prototype.write = function (d, o) { const n = Math.max(0, Math.min(d.length, this.limit - o.at)); this.buf.set(d.subarray(0, n), o.at); this.size = Math.max(this.size, o.at + n); return n; };
FakeSync.prototype.read = function (d, o) { d.set(this.buf.subarray(o.at, o.at + d.length)); return d.length; };
async function run(mode, limit) {
  const st = new TP.SpillStore(); st.cap = 1 << 16; st.stage = new Uint8Array(st.cap);
  if (mode === 'opfs') { st.mode = 'opfs'; st.sync = new FakeSync(limit); }
  const cols = []; for (let c = 0; c < 40; c++) cols.push(new TP.Col(st, 'c' + c, 'f64'));
  const N = 10000;
  for (let i = 0; i < N; i++) for (let c = 0; c < cols.length; c++) cols[c].push(c * 1e6 + i);
  cols.forEach(c => c.finish());
  // tek tek
  let good = true;
  for (const c of cols) { let i = 0; for (let k = 0; k < c.chunks.length; k++) { const v = await c.chunk(k); for (let j = 0; j < v.length; j++, i++) if (v[j] !== +c.name.slice(1) * 1e6 + i) good = false; } c.release(); }
  ok(good, mode + ' tek tek okuma');
  // toplu
  const pf = new TP.Prefetch(cols, 200000); good = true;
  for (const c of cols) { await pf.ensure(c); ok(!!c.pre, 'önden okuma'); let i = 0; for (let k = 0; k < c.chunks.length; k++) { const v = await c.chunk(k); for (let j = 0; j < v.length; j++, i++) if (v[j] !== +c.name.slice(1) * 1e6 + i) good = false; } c.release(); }
  ok(good, mode + (limit ? ' (kota ' + limit + ')' : '') + ' toplu okuma');
  return st;
}
(async () => {
  await run('blob');
  const a = await run('opfs', 1e9); ok(!a.over, 'gereksiz taşma');
  const b = await run('opfs', 1 << 20); ok(b.over && b.over.length > 0 && b.full, 'kota dolunca Blob kesimi');
  // getMany: hizasız (bayt dizisi ardından gelen) parça Float64 görünümü
  const st = new TP.SpillStore(); const bc = new TP.Col(st, 'b', 'bytes', 3), fc = new TP.Col(st, 'f', 'f64');
  for (let i = 0; i < 5000; i++) { bc.pushBytes(new Uint8Array([i & 255, 1, 2]), 0, 3); fc.push(i / 3); } bc.finish(); fc.finish(); st._flushStage();
  const pf = new TP.Prefetch([bc, fc]); await pf.ensure(bc); await pf.ensure(fc);
  let s = 0; for (let k = 0; k < fc.chunks.length; k++) { const v = await fc.chunk(k); for (let j = 0; j < v.length; j++) s += v[j]; }
  ok(Math.abs(s - 4999 * 5000 / 6) < 1e-6, 'hizasız parça');
  // writeMatAll: bayt dizisi sütun öncelikli
  const unit = { name: 'U', members: new Set(['U']), cols: [bc], groups: [{ name: 'raw', cols: [bc] }], tCol: null, counterCol: null };
  const ms = new TP.MemSink(); await TP.writeMatAll([unit], ms, 'u.mat', { T: 0.01 }); const m = ms.out['u.mat'];
  const tail = m.subarray(m.length - 15000 - (8 - 15000 % 8) % 8, m.length - (8 - 15000 % 8) % 8);   // 5000×3 uint8
  ok(tail[0] === 0 && tail[1] === 1 && tail[255] === 255 && tail[5000] === 1 && tail[10000] === 2 && tail[14999] === 2, 'bayt dizisi sütun öncelikli');
  const ns = new TP.StreamSink({}); await TP.writeMatAll([unit], ns, 'u.mat', { T: 0.01 }); ok(ns.bytes === m.length, 'akış boyutu ' + ns.bytes + ' / ' + m.length);
  console.log('t_matstream:', fail ? fail + ' HATA' : 'OK'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HATA', e); process.exit(1); });
