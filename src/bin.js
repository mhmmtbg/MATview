/* Binary dosya çözücü (DOM'suz çekirdek): matris çerçeve tanımı -> kanallar */
const BIN = (() => {
  const TYPES = {u8: [1, 'getUint8', false], i8: [1, 'getInt8', true], u16: [2, 'getUint16'], i16: [2, 'getInt16'], u32: [4, 'getUint32'], i32: [4, 'getInt32'], f32: [4, 'getFloat32'], f64: [8, 'getFloat64']};
  const clean = s => String(s).trim().replace(/[^A-Za-z0-9_À-ɏ]/g, '_');
  function parseSync(s) {
    s = String(s || '').replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, ''); if (s.length % 2) throw new Error('Senkron kelimesi çift sayıda hex hane olmalı');
    const o = []; for (let i = 0; i < s.length; i += 2) o.push(parseInt(s.slice(i, i + 2), 16)); return o;
  }
  // grid: dizi dizi metin; order: 'row' | 'col'. Çıktı: cells[okumaSırası] = ad ('' = adsız bayt)
  function layout(grid, order) {
    const R = grid.length, C = Math.max(0, ...grid.map(r => r ? r.length : 0)), L = R * C, raw = new Array(L).fill('');
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const v = grid[r] && grid[r][c]; if (v != null && String(v).trim() !== '') raw[order === 'col' ? c * R + r : r * C + c] = clean(v); }
    const cnt = new Map(); for (const n of raw) if (n) cnt.set(n, (cnt.get(n) || 0) + 1);
    const seen = new Map(), keys = new Array(L).fill(''), pos = new Map(), subs = [];
    for (let i = 0; i < L; i++) {
      const n = raw[i]; if (!n) continue; const k = (seen.get(n) || 0) + 1; seen.set(n, k);
      const key = cnt.get(n) > 1 ? n + '_' + k : n; keys[i] = key; pos.set(key, i);
    }
    for (const [n, c] of cnt) subs.push({name: n, count: c});
    return {R, C, L, order, raw, keys, pos, subs, cnt};
  }
  // Çerçeveleri bul. Senkron varsa kayma/bozulma durumunda yeniden senkronlanır; kayıp kare sayısı g'ye yansır.
  function scan(u8, L, sync, skip) {
    const n = u8.length, pos = []; let p = skip | 0, lost = 0, junk = 0, extra = 0; const gl = [];
    const match = q => { for (let i = 0; i < sync.length; i++) if (u8[q + i] !== sync[i]) return false; return true; };
    while (p + L <= n) {
      if (sync.length && !match(p)) {
        let q = p + 1; for (;;) { q = u8.indexOf(sync[0], q); if (q < 0 || q + L > n) { q = -1; break; } if (match(q)) break; q++; }
        if (q < 0) { junk += n - p; break; }
        const d = q - p; junk += d; const miss = Math.round(d / L); if (miss > 0) { extra += miss; lost += miss; } p = q;
      }
      gl.push(pos.length + extra); pos.push(p); p += L;
    }
    return {pos: Float64Array.from(pos), g: lost ? Float64Array.from(gl) : null, lost, junk, frames: pos.length};
  }
  // Çok hızlı çerçevede yavaş alan: her p. karede (faz ph) güncellenen alanın kare indisleri
  function subIdx(n, g, p, ph) { const o = []; for (let k = 0; k < n; k++) { const f = g ? Math.round(g[k]) : k; if ((f + ph) % p === 0) o.push(k); } return Int32Array.from(o); }
  // Büyük dosya: blok blok tarama. read(a,b) -> Uint8Array; onBlock(u8, yerelKonumlar, ilkKareNo) alanları çıkarmak için çağrılır.
  async function scanStream(size, read, L, sync, skip, onBlock, prog, B) {
    B = Math.max(B || 64 * 1048576, 4 * L); const pos = [], gl = []; let p = skip | 0, lost = 0, junk = 0, extra = 0;
    while (p + L <= size) {
      const end = Math.min(size, p + B), atEnd = end >= size, u8 = await read(p, end), n = u8.length, loc = []; let q0 = 0;
      const match = q => { for (let i = 0; i < sync.length; i++) if (u8[q + i] !== sync[i]) return false; return true; };
      let stop = false;
      while (q0 + L <= n) {
        if (sync.length && !match(q0)) {
          let q = q0 + 1; for (;;) { q = u8.indexOf(sync[0], q); if (q < 0 || q + L > n) { q = -1; break; } if (match(q)) break; q++; }
          if (q < 0) { if (atEnd) { junk += n - q0; q0 = n; } else { const nx = Math.max(q0 + 1, n - L + 1); junk += nx - q0; q0 = nx; } stop = true; break; }
          const d = q - q0; junk += d; const miss = Math.round(d / L); if (miss > 0) { extra += miss; lost += miss; } q0 = q;
        }
        gl.push(pos.length + extra); pos.push(p + q0); loc.push(q0); q0 += L;
      }
      if (loc.length) await onBlock(u8, Float64Array.from(loc), pos.length - loc.length);
      if (atEnd && !stop) break;
      if (atEnd && stop) break;
      p += q0; if (prog) prog(Math.min(1, p / size));
    }
    return {pos: Float64Array.from(pos), g: lost ? Float64Array.from(gl) : null, lost, junk, frames: pos.length};
  }
  function parseBits(s) {
    s = String(s ?? '').trim(); if (!s) return null; const m = /^(\d+)\s*(?:[-:]\s*(\d+))?$/.exec(s); if (!m) throw new Error('Bit biçimi hatalı: ' + s);
    const lo = +m[1], hi = m[2] != null ? +m[2] : lo; if (hi < lo || hi > 31) throw new Error('Bit aralığı hatalı: ' + s); return [lo, hi];
  }
  function spec(lay, f) {
    const t = TYPES[(f.type || 'u8').toLowerCase()]; if (!t) throw new Error('Bilinmeyen tür: ' + f.type);
    let off; const s = String(f.src ?? '').trim();
    if (lay.pos.has(s)) off = lay.pos.get(s); else if (/^#?\d+$/.test(s)) off = +s.replace('#', ''); else throw new Error('Başlangıç hücresi bulunamadı: "' + s + '"');
    if (off + t[0] > lay.L) throw new Error(f.name + ': alan çerçeve sınırını aşıyor');
    return {off, size: t[0], getter: t[1], le: /^(le|k)/i.test(f.endian || '') , float: /^f/.test(f.type), bits: parseBits(f.bit)};
  }
  function extract(u8, pos, sp) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = pos.length, out = new Float64Array(n), g = sp.getter, le = sp.le, sz = sp.size, off = sp.off;
    for (let k = 0; k < n; k++) out[k] = sz === 1 ? dv[g](pos[k] + off) : dv[g](pos[k] + off, le);
    if (sp.bits && !sp.float) { const [lo, hi] = sp.bits, w = hi - lo + 1, mask = w >= 32 ? 0xFFFFFFFF : (2 ** w - 1); for (let k = 0; k < n; k++) out[k] = ((out[k] >>> 0) >>> lo) & mask; }
    return out;
  }
  // Sayaç alanından kare konumları: eksik sayaç değerleri kayıp kare sayılır, zaman ekseninde boşluk bırakır
  function counterG(raw, size) {
    const W = 2 ** (size * 8), n = raw.length, g = new Float64Array(n); let acc = 0, lost = 0;
    for (let k = 1; k < n; k++) { let d = ((raw[k] - raw[k - 1]) % W + W) % W; if (d === 0 || d > 5000) d = 1; acc += d; lost += d - 1; g[k] = acc; }
    return {g, lost};
  }
  const FIELD_HDR = ['Ad', 'Başlangıç', 'Tür', 'Bayt sırası', 'Bit', 'İfade', 'Birim', 'Periyot (kare)', 'Faz'];
  function fieldsFromRows(rows) {
    const out = []; for (let r = 1; r < rows.length; r++) { const x = rows[r] || []; if (!x[0] && !x[1]) continue; out.push({name: x[0] || '', src: x[1] || '', type: (x[2] || 'u8').toLowerCase(), endian: /^(le|k)/i.test(x[3] || '') ? 'LE' : 'BE', bit: x[4] || '', expr: x[5] || '', unit: x[6] || '', period: Math.max(1, parseInt(x[7]) || 1), phase: Math.max(0, parseInt(x[8]) || 0)}); }
    return out;
  }
  function scenarioFromRows(rows) {
    const o = {}; for (const r of rows || []) { if (!r) continue; const k = String(r[0] || '').toLowerCase(); const v = r[1]; if (v == null) continue;
      if (k.startsWith('okuma')) o.order = /^(s[uü]tun|col)/i.test(v) ? 'col' : 'row'; else if (k.startsWith('senkron')) o.sync = v; else if (k.startsWith('kare')) o.fps = parseFloat(v); else if (k.startsWith('atlan')) o.skip = parseInt(v) || 0; else if (k.startsWith('say')) o.counter = String(v); }
    return o;
  }
  function pick(sheets, names) { for (const s of sheets) for (const n of names) if (s.name.toLowerCase().replace(/[çÇ]/g, 'c').startsWith(n)) return s; return null; }
  function defFromSheets(sheets) {
    const fr = pick(sheets, ['cerceve', 'frame']) || sheets[0]; if (!fr) throw new Error('Excel dosyasında sayfa yok');
    const sc = pick(sheets, ['senaryo']), al = pick(sheets, ['alanlar', 'fields']);
    const d = Object.assign({order: 'row', sync: '', fps: 1, skip: 0}, sc ? scenarioFromRows(sc.rows) : {});
    d.grid = fr.rows.map(r => (r || []).map(v => v == null ? '' : String(v))); d.fields = al ? fieldsFromRows(al.rows) : []; return d;
  }
  function defToSheets(d) {
    const C = Math.max(0, ...d.grid.map(r => r.length));
    return [{name: 'Çerçeve', rows: d.grid.map(r => Array.from({length: C}, (_, i) => r[i] ?? ''))},
      {name: 'Senaryo', rows: [['Anahtar', 'Değer'], ['Okuma sırası', d.order === 'col' ? 'sütun' : 'satır'], ['Senkron (hex)', d.sync || ''], ['Kare hızı (Hz)', d.fps], ['Atlanacak bayt', d.skip | 0], ['Sayaç alanı', d.counter || '']]},
      {name: 'Alanlar', rows: [FIELD_HDR, ...d.fields.map(f => [f.name, f.src, f.type, f.endian, f.bit, f.expr, f.unit, f.period || 1, f.phase || 0])]}];
  }
  return {counterG, TYPES, clean, parseSync, layout, scan, spec, extract, scanStream, subIdx, defFromSheets, defToSheets, FIELD_HDR, parseBits};
})();
if (typeof module !== 'undefined') module.exports = BIN;
