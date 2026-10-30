// v7.3 tam ağaç (hücre / yapı / karakter / mantıksal / seyrek) ve v5 seyrek okuma — sentetik dosyalar: python3 test/make_tree.py
const fs = require('fs');
const src = ['mat.js', 'h5.js'].map(f => fs.readFileSync(__dirname + '/../src/' + f, 'utf8').replace(/if \(typeof module.*\n/, '')).join('\n');
const {MAT, H5} = new Function(src + ';return {MAT,H5};')(); global.H5 = H5;
const fileOf = p => { const b = fs.readFileSync(p); return {name: p, size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), slice: (a, e) => ({arrayBuffer: async () => b.buffer.slice(b.byteOffset + a, b.byteOffset + e)})}; };
const str = t => String.fromCharCode(...t.re); let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } };
(async () => {
  const m = await MAT.open(fileOf('/tmp/h5t/tree73.mat')), T = await MAT.readAll(m), g = n => T.find(t => t.name === n);
  const c = g('c'); ok(c && c.k === 'cell' && c.v.length === 3, 'hücre ' + JSON.stringify(c && c.k)); ok(c && Array.from(c.v[0].re).join() === '1,2,3', 'hücre[0]'); ok(c && c.v[1].cls === 'c' && str(c.v[1]) === 'merhaba', 'hücre[1] char');
  const s = g('s'); ok(s && s.k === 'struct' && s.f.includes('ad'), 'yapı'); const q = s && s.v[0]; ok(q && q.a.re[0] === 1.5 && str(q.ad) === 'deneme' && q.ic.k === 'struct' && q.ic.v[0].z.re[0] === 9, 'yapı alanları');
  ok(str(g('txt')) === 'Kanal_A', 'char'); ok(g('flag').cls === 'l' && Array.from(g('flag').re).join() === '1,0,1', 'logical');
  const S = g('sp'); ok(S && S.sparse && Array.from(S.re).join() === '0,1,0,2,0,0,0,0,3.5' && S.dims.join() === '3,3', 'seyrek v7.3 ' + (S && Array.from(S.re)));
  ok(g('num').dims.join() === '2,3' && Array.from(g('num').re).join() === '0,3,1,4,2,5', 'sayısal');
  const m5 = await MAT.open(fileOf('/tmp/h5t/sp5.mat')), T5 = await MAT.readAll(m5), s5 = T5.find(t => t.name === 'sp'), l5 = T5.find(t => t.name === 'spl');
  ok(s5 && Array.from(s5.re).join() === '0,1,0,2,0,0,0,0,3.5', 'seyrek v5'); ok(l5 && l5.cls === 'l' && Array.from(l5.re).join() === '1,0,0,1', 'seyrek mantıksal v5');
  console.log('tree:', fail ? fail + ' HATA' : 'OK'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ÇÖKTÜ', e.stack); process.exit(1); });
