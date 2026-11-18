// v2.30 (sentetik veri): büyük .mat'in parça parça okunması (tembel kip) tam okumayla aynı sonucu verir
// - sıkıştırılmış / sıkıştırılmamış, iç içe yapı, yapı dizisi, hücre, karmaşık, boş
// - telemetri tek .mat yazıcısının (writeMatAll) çıktısı
const fs = require('fs'), path = require('path');
globalThis.H5 = {};
const MAT = require('../src/mat.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } };
async function cmp(label, buf) {
  const file = new Blob([buf]);
  MAT.lazyMin = 1.5e9; const a = await MAT.open(file);
  MAT.lazyMin = 0; const b = await MAT.open(file);
  ok(b.lazy && !a.lazy, label + ' kip');
  const key = v => [v.name, v.clsName, v.dims.join('x'), v.numeric, v.top || ''].join('|');
  const ka = a.vars.map(key), kb = b.vars.map(key);
  ok(JSON.stringify(ka) === JSON.stringify(kb), label + ' değişken listesi\n  ' + ka.join(' ; ') + '\n  ' + kb.join(' ; '));
  let n = 0;
  for (let i = 0; i < Math.min(a.vars.length, b.vars.length); i++) {
    const va = a.vars[i], vb = b.vars[i]; if (!va.numeric || !va.count) continue;
    const da = await MAT.load(a, va), db = await MAT.load(b, vb); n++;
    ok(da.length === db.length && da.every((x, j) => Object.is(x, db[j])), label + ' veri ' + va.name);
  }
  const ta = await MAT.readAll(a), tb = await MAT.readAll(b);
  ok(JSON.stringify(ta, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v) === JSON.stringify(tb, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v), label + ' readAll');
  return [a.vars.length, n];
}
(async () => {
  const D = '/tmp/_mv_matlazy';
  if (!fs.existsSync(path.join(D, 'z.mat'))) {   // scipy ile sentetik örnek dosyalar
    fs.mkdirSync(D, { recursive: true });
    require('child_process').execFileSync('python3', ['-c', `
import numpy as np, scipy.io as sio
r=np.random.default_rng(3)
d={'a':r.standard_normal((100,1)),'b':np.arange(12,dtype=np.uint16).reshape(3,4),'s':{'x':r.standard_normal(50),'y':np.int32([1,2,3]),'n':{'z':np.float32([1.5,2.5])},'txt':'merhaba'},
   'c':np.array([np.arange(4.0),'ab',np.int8([5,6])],dtype=object),'e':np.zeros((0,0)),'cx':np.array([1+2j,3-1j])}
d['st']=np.zeros((2,),dtype=[('p','O'),('q','O')]); d['st'][0]=(1.0,np.arange(3.0)); d['st'][1]=(2.0,np.arange(5.0))
sio.savemat('${D}/u.mat',d,do_compression=False); sio.savemat('${D}/z.mat',d,do_compression=True)`]);
  }
  for (const f of ['u.mat', 'z.mat']) if (fs.existsSync(path.join(D, f))) console.log(f, await cmp(f, fs.readFileSync(path.join(D, f))));
  // telemetri tek .mat yazıcısı
  const TP = require('./tlm_core.js')();
  const st = new TP.SpillStore(), cols = []; for (let c = 0; c < 30; c++) cols.push(new TP.Col(st, 'p' + c, 'f64'));
  for (let i = 0; i < 9000; i++) cols.forEach((c, k) => c.push(k * 1000 + i * 0.5)); cols.forEach(c => c.finish());
  const unit = { name: 'BIRIM', members: new Set(['BIRIM']), cols, groups: cols.map(c => ({ name: c.name, cols: [c] })), tCol: null, counterCol: null };
  const ms = new TP.MemSink(); await TP.writeMatAll([unit, Object.assign({}, unit, { name: 'IKI' })], ms, 'a.mat', { T: 0.01 });
  console.log('writeMatAll', await cmp('writeMatAll', ms.out['a.mat']));
  console.log('t_matlazy:', fail ? fail + ' HATA' : 'OK'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HATA', e); process.exit(1); });
