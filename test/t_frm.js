// Telemetre çerçevesi ayrıştırma + çözme (sentetik veri: python3 test/make_frame.py)
const FRM = require('../src/frm.js'), fs = require('fs'), D = '/tmp/frm/';
const rows = JSON.parse(fs.readFileSync(D + 'rows.json')), T = JSON.parse(fs.readFileSync(D + 'truth.json')), bin = new Uint8Array(fs.readFileSync(D + 'data.bin'));
const def = FRM.parse(rows, {indexBase: 1}), L = def.frameBytes, NF = bin.length / L; let bad = 0; const ck = (c, m) => { if (!c) { console.log('HATA:', m); bad++; } };
const msg = def.warns.map(w => w.lvl + ' ' + w.sheet + ' ' + w.msg);
ck(msg.some(m => /^err Z/.test(m) && /çerçeve dışına/.test(m)), 'Z taşma hatası yok'); ck(msg.some(m => /^err L .*BADT.*geçersiz veri tipi/.test(m)), 'bilinmeyen tip hatası yok');
ck(msg.some(m => /^err L .*LB.*Formül/.test(m)), 'bozuk formül hatası yok'); ck(msg.some(m => /^info/.test(m) && /aynı baytları/.test(m)), 'çakışma bilgisi yok'); ck(msg.some(m => /Tanımsız bayt/.test(m)), 'tanımsız bayt uyarısı yok');
ck(def.sheets.map(s => s.name).join() === 'A,L,S,O', 'sayfalar: ' + def.sheets.map(s => s.name));
const plan = FRM.plan(def), by = {}; plan.forEach(p => by[p.sheet + '/' + p.name] = p);
const slotCache = {};
function slotOf(sheet, unit) {
  const k = sheet + unit; if (slotCache[k]) return slotCache[k]; const st = def.sheets.find(s => s.name === sheet).streams.find(s => s.unit === unit), slot = new Uint8Array(NF * st.win);
  for (let f = 0; f < NF; f++) slot.set(bin.subarray(f * L + st.start, f * L + st.start + st.win), f * st.win);
  const pos = FRM.streamScan(slot, st); return slotCache[k] = {slot, pos, st};
}
function raw(p) { if (p.v.stream) { const s = slotOf(p.sheet, p.v.stream); return FRM.streamPackets(s.slot, s.pos, s.st.win, p); } return FRM.extractFrames(bin, 0, NF, L, p); }
function load(key) {
  const p = by[key]; let r = raw(p);
  if (p.v.formula && !p.v.formulaErr) { const c = FRM.compile(p.v.formula), sel = {}; for (const id of c.ids) { const q = by[p.sheet + '/' + id], rr = raw(q); sel[id] = {v: rr.v, spp: q.spp}; } r = FRM.applyFormula(p, r, id => sel[id]); }
  return FRM.compact(r);
}
const eq = (a, b, m) => { ck(a.length === b.length, m + ' uzunluk ' + a.length + '/' + b.length); for (let i = 0; i < Math.min(a.length, b.length); i++) if (Math.abs(a[i] - b[i]) > 1e-9 * (1 + Math.abs(b[i]))) { ck(false, m + ' [' + i + '] ' + a[i] + ' ≠ ' + b[i]); break; } };
for (const k of ['A/H1_1', 'A/H1_2', 'A/H1_3', 'A/H1_4', 'A/CNT', 'A/T1', 'A/F1', 'A/M12', 'A/D24', 'A/W', 'A/FLG', 'L/SEL']) eq(load(k).v, T[k], k);
ck(by['A/T1'].spp === 2 && by['A/M12'].spp === 4 && by['A/W'].spp === 12 && by['A/H1_3'].spp === 1, 'örnek/kare sayıları');
const lv = load('L/LV'); eq(lv.v, T['L/LV'], 'L/LV'); eq(lv.g, T['L/LV_g'], 'L/LV g');
ck(!by['L/BADT'] && by['L/LB'], 'LB ham okunmalı, BADT yok');
ck(T['S/S1'].length > 20, 'akış paket sayısı ' + T['S/S1'].length);
for (const k of ['S/S1', 'S/S2', 'S/S3_1', 'S/S3_2', 'S/S3_3']) { const r = load(k); eq(r.v, T[k], k); eq(r.g, T['S/_fr'], k + ' kare'); }
// Index tabanı 0 ve B2 değişken-ardışık seçenekleri
const d0 = FRM.parse(rows, {indexBase: 0}); ck(d0.sheets[0].vars[0].byte === 11 && def.sheets[0].vars[0].byte === 10 && FRM.parse(rows).indexBase === 0, 'indexBase');
const dv = FRM.parse(rows, {indexBase: 1, blockMode: 'var'}); ck(dv.sheets[0].vars.find(v => v.name === 'T1').sMode === 'var' && dv.sheets[0].vars.find(v => v.name === 'F1').byte === 20 && dv.sheets[0].vars.find(v => v.name === 'T1').sizeBytes === 4, 'blockMode var');
ck(FRM.frameInfo(bin.length + 3, L, 0).rest === 3 && FRM.frameInfo(bin.length, L, 0).frames === NF, 'frameInfo');
ck(FRM.isFrameBook(rows) && !FRM.isFrameBook([{name: 'x', rows: [['a', 'b'], [1, 2]]}]), 'isFrameBook');
ck(FRM.parseType('UInt12').bits === 12 && FRM.parseType('bit3').kind === 'bit' && FRM.parseType('Single').bits === 32 && !FRM.parseType('Foo'), 'parseType');
ck(FRM.parseIndex('i=0:2:6, 10+i').rep.at.length === 4 && FRM.parseIndex('11.3').bit === 3 && FRM.parseIndex('i=[1 4 9], i*2').rep.at[2].byte === 18, 'parseIndex');
for (const [f, exp] of [['if(L3%8 == 2) X*5/2^16', true], ['x&0x00FF', true], ['(-3.9e-3 + sqrt(3.9e-3^2 - 4*(-5.7e-7)*(1 - X/200))) / (2*-5.7e-7)', true], ['X; process.exit()', false], ['foo(X)', true], ['X*(', false]]) {
  let ok = true; try { const c = FRM.compile(f); if (f === 'foo(X)') ok = c.ids.length === 1; } catch (e) { ok = false; } ck(ok === exp, 'compile: ' + f);
}
// ---- çerçeve düzeni: sütun öncelikli (transpoze) + kayma → aynı değerler; otomatik bulma; header taraması ----
{
  const C = 125, R = 100, SH = 777, P = new Uint8Array(SH + bin.length); for (let i = 0; i < SH; i++) P[i] = (i * 31) & 255;
  for (let k = 0; k < NF; k++) for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) P[SH + k * L + r * C + c] = bin[k * L + c * R + r];
  const lay = FRM.layout({cols: C, rows: R, transpose: true, shift: SH}), loc = FRM.locate(P, lay); ck(loc.starts.length === NF && loc.starts[1] - loc.starts[0] === L, 'locate kare sayısı ' + loc.starts.length);
  lay.starts = loc.starts; let same = true;
  for (const p of plan) { if (p.v.stream) continue; const a = FRM.extractFrames(bin, 0, NF, L, p).v, b = FRM.extractFrames(P, 0, NF, L, p, lay, 0).v; for (let i = 0; i < a.length; i++) if (!(a[i] === b[i] || (Number.isNaN(a[i]) && Number.isNaN(b[i])))) { same = false; break; } if (!same) { ck(false, 'düzen: ' + p.sheet + '/' + p.name + ' farklı'); break; } }
  const ar = FRM.autoLayout(P, def, {cols: C, rows: R}); ck(ar.length && ar[0].transpose === true && ar[0].shift === SH && ar[0].hit === ar[0].total && ar[0].total > 0, 'autoLayout: ' + JSON.stringify(ar[0] && [ar[0].transpose, ar[0].shift, ar[0].hit, ar[0].total]));
  for (const st of def.sheets.flatMap(x => x.streams)) { const sl = FRM.slotOf(P, lay, loc.starts, 0, st, NF); ck(FRM.streamScan(sl, st).length > 0 || !st.hdr, 'akış ' + st.unit + ' transpoze'); }
  // sütun atma: 129 sütunlu kayıt, 126-129 atılır
  const lay2 = FRM.layout({cols: C, rows: R, transpose: false, dropTotal: 129, dropList: '126-129'}); ck(lay2.T === 129 && lay2.PL === 12900 && lay2.perm[125] === 129 && lay2.perm[124] === 124, 'sütun atma perm');
  let ee = false; try { FRM.layout({cols: 125, rows: 100, dropTotal: 129, dropList: '1-3'}); } catch (e) { ee = true; } ck(ee, 'sütun sayısı uyuşmazlığı hatası');
  // header taraması: 37 bayt çöp + [EB 90 gövde] × 5, gövdede EB 90 yok
  const h = FRM.layout({cols: 10, rows: 4, header: 'EB 90'}), buf = new Uint8Array(37 + 5 * 40 + 11); buf.fill(7); for (let k = 0; k < 5; k++) { buf[37 + k * 40] = 0xEB; buf[38 + k * 40] = 0x90; }
  const hl = FRM.locate(buf, h); ck(hl.starts.length === 5 && hl.starts[0] === 37 && hl.starts[4] === 37 + 160 && hl.skipped === 37 + 11, 'header taraması ' + [...hl.starts] + ' atlanan ' + hl.skipped);
  const chunks = []; const sc = FRM.createScanner(h, a => chunks.push(a), () => {}); for (let o = 0; o < buf.length; o += 13) sc.push(buf.subarray(o, Math.min(buf.length, o + 13)), o + 13 >= buf.length); ck(chunks.join() === [...hl.starts].join(), 'parçalı tarama ' + chunks);
}
console.log(bad ? 'BAŞARISIZ ' + bad : 'OK t_frm', plan.length, 'kanal'); process.exit(bad ? 1 : 0);
