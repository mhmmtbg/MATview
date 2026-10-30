// MDF 3.x okuyucu: asammdf ile yazılmış sentetik dosyalar (python3 test/make_mdf3.py)
const fs = require('fs'), MDF = require('../src/mdf.js'); global.MATinflate = async u => u;
const D = '/tmp/mdft3', exp = JSON.parse(fs.readFileSync(D + '/exp.json')); let bad = 0;
(async () => {
  for (const nm of Object.keys(exp).filter(k => !k.startsWith('_'))) {
    const b = fs.readFileSync(D + '/' + nm), r = await MDF.open(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); const E = exp[nm];
    for (const g of r.groups) for (const c of g.channels) {
      if (!E[c.name]) continue; const y = await r.load(c), e = E[c.name]; let m = 0; for (let i = 0; i < e.length; i++) m = Math.max(m, Math.abs(y[i] - e[i]));
      const ok = y.length === e.length && m < 1e-5; if (!ok) bad++; console.log(nm, r.version, c.name, c.unit, y.length, ok ? 'OK' : 'HATA ' + m);
    }
    const g0 = r.groups.find(g => g.channels.some(c => c.name === 'acc_x')), t = await r.time(g0); if (Math.abs(t[1] - exp._t[1]) > 1e-9) { bad++; console.log('zaman HATA', t[1]); }
    if (r.warn.length) console.log('  uyarı:', r.warn.join('; '));
  }
  console.log('mdf3:', bad ? bad + ' HATA' : 'OK'); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ÇÖKTÜ', e.stack); process.exit(1); });
