// Telemetre çerçevesi ayrıştırma + çözme (sentetik veri: python3 test/make_frame.py)
const FRM = require('../src/frm.js'), fs = require('fs'), D = '/tmp/frm/';
const rows = JSON.parse(fs.readFileSync(D + 'rows.json')), T = JSON.parse(fs.readFileSync(D + 'truth.json')), bin = new Uint8Array(fs.readFileSync(D + 'data.bin'));
const def = FRM.parse(rows), L = def.frameBytes, NF = bin.length / L; let bad = 0; const ck = (c, m) => { if (!c) { console.log('HATA:', m); bad++; } };
const msg = def.warns.map(w => w.lvl + ' ' + w.sheet + ' ' + w.msg);
ck(msg.some(m => /^err Z/.test(m) && /çerçeve dışına/.test(m)), 'Z taşma hatası yok'); ck(msg.some(m => /^err L .*BADT.*bilinmeyen tip/.test(m)), 'bilinmeyen tip hatası yok');
ck(msg.some(m => /^err L .*LB.*Formül/.test(m)), 'bozuk formül hatası yok'); ck(msg.some(m => /^info/.test(m) && /aynı baytları/.test(m)), "çakışma bilgisi yok"); ck(msg.some(m => /Tanımsız bayt/.test(m)), 'tanımsız bayt uyarısı yok');
ck(def.sheets.map(s => s.name).join() === 'A,L,S,O', 'sayfalar: ' + def.sheets.map(s => s.name));
const plan = FRM.plan(def), by = {}; plan.forEach(p => by[p.sheet + '/' + p.name] = p);
function load(key) {
  const p = by[key], r0 = FRM.extractBlock(bin, 0, NF, L, def, p, new Map()); let r = r0, v = p.v;
  if (v.formula && !v.formulaErr) { const c = FRM.compile(v.formula), sel = {}; for (const id of c.ids) { const q = by[p.sheet + '/' + id]; sel[id] = {v: FRM.extractBlock(bin, 0, NF, L, def, q, new Map()).v, spp: q.spp}; } r = FRM.applyFormula(p, r0.v, r0.ok, NF, id => sel[id]); }
  return FRM.compact(r);
}
const eq = (a, b, m) => { ck(a.length === b.length, m + ' uzunluk ' + a.length + '/' + b.length); for (let i = 0; i < Math.min(a.length, b.length); i++) if (Math.abs(a[i] - b[i]) > 1e-9 * (1 + Math.abs(b[i]))) { ck(false, m + ' [' + i + '] ' + a[i] + ' ≠ ' + b[i]); break; } };
for (const k of ['A/H1_1', 'A/H1_2', 'A/H1_3', 'A/H1_4', 'A/CNT', 'A/T1', 'A/F1', 'A/M12', 'A/D24', 'A/W', 'L/SEL', 'S/S1', 'S/S2', 'S/S3']) eq(load(k).v, T[k], k);
ck(by['A/T1'].spp === 2 && by['A/M12'].spp === 4 && by['A/W'].spp === 12 && by['A/H1_3'].spp === 1, 'örnek/kare sayıları');
const lv = load('L/LV'); eq(lv.v, T['L/LV'], 'L/LV'); eq(lv.g, T['L/LV_g'], 'L/LV g');
ck(!by['L/BADT'] && by['L/LB'], 'LB ham okunmalı, BADT yok'); eq(load('L/LB').v.length ? [load('L/LB').v.length] : [], [NF], 'LB ham uzunluk');
const s1 = load('S/S1'); ck(s1.g && s1.g.length === T['S/S_k'].length && T['S/S_k'].every((k, i) => s1.g[i] === k), 'S1 g (başlık olmayan kareler atlanmalı)');
ck(FRM.frameInfo(bin.length + 3, L, 0).rest === 3 && FRM.frameInfo(bin.length, L, 0).frames === NF, 'frameInfo');
ck(FRM.isFrameBook(rows) && !FRM.isFrameBook([{name: 'x', rows: [['a', 'b'], [1, 2]]}]), 'isFrameBook');
for (const [f, exp] of [['if(L3%8 == 2) X*5/2^16', true], ['x&0x00FF', true], ['(-3.9e-3 + sqrt(3.9e-3^2 - 4*(-5.7e-7)*(1 - X/200))) / (2*-5.7e-7)', true], ['X; process.exit()', false], ['foo(X)', true], ['X*(', false]]) {
  let ok = true; try { const c = FRM.compile(f); if (f === 'foo(X)') ok = c.ids.length === 1; } catch (e) { ok = false; } ck(ok === exp, 'compile: ' + f);
}
console.log(bad ? 'BAŞARISIZ ' + bad : 'OK t_frm', plan.length, 'kanal'); process.exit(bad ? 1 : 0);
