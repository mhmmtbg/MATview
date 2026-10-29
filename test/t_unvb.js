const U=require('../src/unv.js'), fs=require('fs'), assert=require('assert'); const exp=JSON.parse(fs.readFileSync('/tmp/unvb/exp.json','utf8'));
for (const nm of Object.keys(exp)) { const b=fs.readFileSync('/tmp/unvb/'+nm); const f=U.parseBytes(new Uint8Array(b),nm); console.log(nm, f.length,'küme; ikili:',f.bin58, f.warn);
  assert.strictEqual(f.length, exp[nm].length);
  f.forEach((u,i)=>{ const [sr,si,n,ft]=exp[nm][i]; const gr=u.y.reduce((a,v)=>a+v,0), gi=u.y_im.reduce((a,v)=>a+v,0); assert.strictEqual(u.y.length,n,'n '+nm+i); assert.strictEqual(u.func_type,ft);
    assert.ok(Math.abs(gr-sr)<1e-9*Math.max(1,Math.abs(sr)),'re '+nm+i+' '+gr+' '+sr); assert.ok(Math.abs(gi-si)<1e-9*Math.max(1,Math.abs(si)),'im '+nm+i); assert.strictEqual(u.id1,'Test '+ft); }); }
// ASCII yol aynı sonucu vermeli
const a=U.parseBytes(new Uint8Array(fs.readFileSync(__dirname+'/../ornek/ornek.unv')),'o'), b2=U.parse(fs.readFileSync(__dirname+'/../ornek/ornek.unv','utf8'),'o'); assert.strictEqual(a.length,b2.length); assert.ok(Math.abs(U.grms(a[0])-U.grms(b2[0]))<1e-12);
console.log('t_unvb OK');
