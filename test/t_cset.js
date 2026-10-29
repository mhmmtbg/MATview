// Çerçeve ayar sayfası (Cerceve_Ayarlari) + sonda senkron + sütun öncelikli düzen + big-endian / 12 bit alanlar (sentetik)
const FRM = require('../src/frm.js'); let bad = 0; const ck = (c, m) => { if (!c) { console.log('HATA:', m); bad++; } };
const C = 10, R = 8, L = C * R, NF = 40, SY = [0xC3, 0x5A];
// fiziksel kayıt: her satır C bayt; mantıksal çerçeve satır 1'in 1. baytından başlar, sonunda (bir sonraki satır 1'in başında değil) senkron yok:
// burada senkron, çerçevenin son iki baytıdır (satır R, sütun C-1..C) → "Senkron konumu = son"
const truth = {u16: [], s12: [], i16: []}, frames = [];
for (let k = 0; k < NF; k++) {
  const F = new Uint8Array(L).fill(0xAA);   // F[satır*C + sütun] (fiziksel, satır öncelikli)
  const put = (j, b) => { const col = Math.floor(j / R), row = j % R; F[row * C + col] = b; };   // mantıksal j = sütun*R + satır
  const u = 1000 + 37 * k; put(10, u >> 8); put(11, u & 255); truth.u16.push(u);
  const a = (2048 + k * 3) & 4095, b = (100 + k) & 4095; put(20, a >> 4); put(21, ((a & 15) << 4) | (b >> 8)); put(22, b & 255); truth.s12.push(a, b);
  const sv = k % 2 ? -5 - k : 30000 + k; const w = sv & 0xFFFF; put(30, w >> 8); put(31, w & 255); truth.i16.push(sv);
  F[(R - 1) * C + C - 2] = SY[0]; F[(R - 1) * C + C - 1] = SY[1];
  frames.push(F);
}
const junk = 7, bin = new Uint8Array(junk + NF * L); bin.fill(0x11, 0, junk); frames.forEach((F, k) => bin.set(F, junk + k * L));
const sheets = [
  {name: 'ALT', rows: [['Birim', 'Index', 'Değişken', 'Tip', 'Eleman Sayısı', 'Formül', 'Byte Endian', 'Bit Endian', 'Örnek Sayısı'],
    ['ALT', 10, 'U', 'uint16', 1, null, 'big'], ['ALT', 10, 'ULE', 'uint16', 1], ['ALT', 20, 'S', 'uint12', 1, null, null, null, 2], ['ALT', 30, 'I', 'int16', 1, 'X/2', 'big']]},
  {name: 'Cerceve_Ayarlari', rows: [['Ayar', 'Değer'], ['Sütun sayısı', C], ['Satır sayısı', R], ['Sütun öncelikli', 1], ['Senkron (hex)', 'C3 5A'], ['Senkron konumu', 'son'], ['Index tabanı', 0], ['Kare periyodu (ms)', 5], ['Bilinmeyen', 3]]},
];
const cs = FRM.settings(sheets); ck(cs && cs.set.cols === C && cs.set.rows === R && cs.set.transpose === true && cs.set.header === 'C3 5A' && cs.set.headerPos === 'end' && cs.set.indexBase === 0 && cs.set.ms === 5, 'ayarlar: ' + JSON.stringify(cs && cs.set));
ck(cs.unknown.length === 1 && cs.unknown[0] === 'Bilinmeyen', 'tanınmayan ayar');
ck(FRM.settings([sheets[0]]) === null, 'ayar sayfası yokken null');
const def = FRM.parse(sheets, {frameBytes: L, indexBase: 0});
ck(!def.warns.some(w => /Cerceve_Ayarlari/.test(w.sheet)), 'ayar sayfası çerçeve sayfası sanıldı');
ck(def.sheets.length === 1, 'sayfa sayısı');
const lay = FRM.layout({cols: C, rows: R, transpose: true, header: 'C3 5A', headerPos: 'end'}), lc = FRM.locate(bin, lay);
ck(lc.starts.length === NF, 'kare sayısı ' + lc.starts.length); lay.starts = lc.starts;
const plan = FRM.plan(def), by = {}; plan.forEach(p => by[p.name] = p);
const rd = n => { const p = by[n]; let r = FRM.extractFrames(bin, 0, lc.starts.length, L, p, lay, 0); if (p.v.formula) r = FRM.applyFormula(p, r, () => null); return Array.from(r.v); };
const eq = (a, b, m) => ck(a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9), m + ': ' + a.slice(0, 4) + ' / ' + b.slice(0, 4));
eq(rd('U'), truth.u16, 'big-endian uint16');
eq(rd('ULE'), truth.u16.map(u => ((u & 255) << 8) | (u >> 8)), 'boş Byte Endian = little');
eq(rd('S'), truth.s12, '12 bit (MSB) iki örnek');
eq(rd('I'), truth.i16.map(x => x / 2), 'int16 big-endian + formül');
console.log(bad ? `cset: ${bad} HATA` : 'cset: OK'); process.exit(bad ? 1 : 0);
