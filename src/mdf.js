/* ASAM MDF4 (.mf4 / .mdf) okuyucu — kurulumsuz. Desteklenen: DT / DZ (deflate, transpoze dahil) / DL / HL veri blokları,
   sıralı ve sırasız (kayıt kimlikli) veri grupları, tam sayı / kayan nokta kanalları (bit düzeyi dahil), ana (zaman) kanal ve sanal ana kanal,
   dönüşümler: özdeş, doğrusal, rasyonel, tablo (ara değerli / en yakın). Desteklenmeyen: MDF3, VLSD / metin kanalları, bileşik (dizi / yapı) kanallar,
   cebirsel / metin dönüşümleri (ham değer okunur ve uyarı verilir), geçersizlik bitleri. */
const MDF = (() => {
  const TD = new TextDecoder('utf-8');
  const u64 = (dv, o) => Number(dv.getBigUint64(o, true));
  class Rd {
    constructor(buf) { this.u8 = new Uint8Array(buf); this.dv = new DataView(buf); this.cache = new Map(); this.dgData = new Map(); }
    block(off) {
      if (!off) return null; let b = this.cache.get(off); if (b) return b;
      if (off + 24 > this.u8.length) throw new Error('MDF: blok konumu dosya dışında');
      const id = String.fromCharCode(this.u8[off], this.u8[off + 1], this.u8[off + 2], this.u8[off + 3]), len = u64(this.dv, off + 8), nl = u64(this.dv, off + 16), links = [];
      if (nl > 4096) throw new Error('MDF: geçersiz blok (' + id + ')');
      for (let i = 0; i < nl; i++) links.push(u64(this.dv, off + 24 + 8 * i));
      b = {id, off, len, links, data: off + 24 + 8 * nl}; this.cache.set(off, b); return b;
    }
    text(off) {
      const b = off ? this.block(off) : null; if (!b || (b.id !== '##TX' && b.id !== '##MD')) return '';
      let s = this.u8.subarray(b.data, b.off + b.len); const z = s.indexOf(0); if (z >= 0) s = s.subarray(0, z); const t = TD.decode(s);
      return (b.id === '##MD' ? t.replace(/<[^>]*>/g, ' ') : t).replace(/\s+/g, ' ').trim();
    }
  }
  function readConv(rd, off) {
    const b = off ? rd.block(off) : null; if (!b || b.id !== '##CC') return null;
    const dv = rd.dv, d = b.data, type = dv.getUint8(d), nref = dv.getUint16(d + 4, true), nval = dv.getUint16(d + 6, true), vals = [];
    for (let i = 0; i < nval; i++) vals.push(dv.getFloat64(d + 24 + 8 * i, true));
    return {type, vals, unit: rd.text(b.links[1]), nref};
  }
  function applyConv(cc, x, warn, nm) {
    if (!cc || cc.type === 0) return x; const v = cc.vals, n = x.length, y = new Float64Array(n);
    if (cc.type === 1) { const a = v[0], b = v[1]; for (let i = 0; i < n; i++) y[i] = a + b * x[i]; return y; }
    if (cc.type === 2) { for (let i = 0; i < n; i++) { const t = x[i]; y[i] = (v[0] * t * t + v[1] * t + v[2]) / (v[3] * t * t + v[4] * t + v[5]); } return y; }
    if (cc.type === 4 || cc.type === 5) {
      const m = Math.floor(v.length / 2); if (m < 1) return x; const xs = [], ys = []; for (let i = 0; i < m; i++) { xs.push(v[2 * i]); ys.push(v[2 * i + 1]); }
      for (let i = 0; i < n; i++) { const t = x[i]; if (t <= xs[0]) { y[i] = ys[0]; continue; } if (t >= xs[m - 1]) { y[i] = ys[m - 1]; continue; } let lo = 0, hi = m - 1; while (hi - lo > 1) { const k = (lo + hi) >> 1; if (xs[k] <= t) lo = k; else hi = k; }
        y[i] = cc.type === 4 ? ys[lo] + (ys[hi] - ys[lo]) * (t - xs[lo]) / (xs[hi] - xs[lo]) : (t - xs[lo] < xs[hi] - t ? ys[lo] : ys[hi]); }
      return y;
    }
    const m = 'Dönüşüm türü desteklenmiyor (' + cc.type + '): ' + nm + ' ham değerle bırakıldı'; if (!warn.includes(m)) warn.push(m); return x;
  }
  async function inflate(u8) { return MATinflate(u8); }
  // DT / DZ / DL / HL bloklarından ham kayıt baytlarını toplar
  async function pieces(rd, off, out) {
    const b = rd.block(off); if (!b) return;
    if (b.id === '##DT' || b.id === '##SD') out.push(rd.u8.subarray(b.data, b.off + b.len));
    else if (b.id === '##DZ') {
      const d = b.data, zt = rd.dv.getUint8(d + 2), par = rd.dv.getUint32(d + 4, true), orgLen = u64(rd.dv, d + 8), zLen = u64(rd.dv, d + 16);
      let raw = await inflate(rd.u8.subarray(d + 24, d + 24 + zLen)); if (raw.length > orgLen) raw = raw.subarray(0, orgLen);
      if (zt === 1 && par > 1) { const cols = par, rows = Math.floor(orgLen / cols), o = new Uint8Array(orgLen); for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) o[r * cols + c] = raw[c * rows + r]; o.set(raw.subarray(cols * rows), cols * rows); raw = o; }
      out.push(raw);
    } else if (b.id === '##DL') { for (let k = b.off; k;) { const bl = rd.block(k); for (let i = 1; i < bl.links.length; i++) await pieces(rd, bl.links[i], out); k = bl.links[0]; } }
    else if (b.id === '##HL') await pieces(rd, b.links[0], out);
  }
  async function dgBytes(rd, dg) {
    let c = rd.dgData.get(dg.off); if (c) return c;
    const ps = []; await pieces(rd, dg.links[2], ps); let tot = 0; for (const p of ps) tot += p.length;
    if (ps.length === 1) c = ps[0]; else { c = new Uint8Array(tot); let o = 0; for (const p of ps) { c.set(p, o); o += p.length; } }
    rd.dgData.set(dg.off, c); return c;
  }
  // bir kanal grubunun kayıt konumları: {start(i), n}
  function recordIndex(rd, dg, cg, bytes) {
    const idSize = rd.dv.getUint8(dg.data), recSize = cg.dataBytes + cg.invBytes;
    if (!dg.multi) { const stride = idSize + recSize, n = Math.min(cg.cycles || Infinity, Math.floor(bytes.length / stride)); return {n, start: i => i * stride + idSize}; }
    if (!dg.scan) { // tek taramada tüm grupların kayıtlarını çıkar
      dg.scan = new Map(); for (const g of dg.cgs) dg.scan.set(g.recId, []); const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let p = 0;
      while (p + idSize <= bytes.length) {
        const id = idSize === 1 ? bytes[p] : idSize === 2 ? dv.getUint16(p, true) : idSize === 4 ? dv.getUint32(p, true) : Number(dv.getBigUint64(p, true)), g = dg.cgs.find(x => x.recId === id); if (!g) break;
        if (g.vlsd) { if (p + idSize + 4 > bytes.length) break; const L = dv.getUint32(p + idSize, true); p += idSize + 4 + L; continue; }
        const sz = g.dataBytes + g.invBytes; if (p + idSize + sz > bytes.length) break; dg.scan.get(id).push(p + idSize); p += idSize + sz;
      }
    }
    const arr = dg.scan.get(cg.recId) || []; return {n: arr.length, start: i => arr[i]};
  }
  function extract(rd, bytes, idx, cn) {
    const n = idx.n, dtp = cn.dt, bc = cn.bits, bo = cn.bitOff, byteOff = cn.byteOff, dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Float64Array(n), be = dtp === 1 || dtp === 3 || dtp === 5;
    const flt = dtp === 4 || dtp === 5, sgn = dtp === 2 || dtp === 3;
    if (flt) { if (bo || (bc !== 32 && bc !== 64)) throw new Error('Kayan nokta kanalı 32/64 bit olmalı'); const le = !be; if (bc === 64) for (let i = 0; i < n; i++) out[i] = dv.getFloat64(idx.start(i) + byteOff, le); else for (let i = 0; i < n; i++) out[i] = dv.getFloat32(idx.start(i) + byteOff, le); return out; }
    if (!(dtp >= 0 && dtp <= 3)) throw new Error('Desteklenmeyen veri tipi ' + dtp);
    if (bo === 0 && (bc === 8 || bc === 16 || bc === 32 || bc === 64)) {
      const le = !be;
      for (let i = 0; i < n; i++) { const o = idx.start(i) + byteOff;
        out[i] = bc === 8 ? (sgn ? dv.getInt8(o) : dv.getUint8(o)) : bc === 16 ? (sgn ? dv.getInt16(o, le) : dv.getUint16(o, le)) : bc === 32 ? (sgn ? dv.getInt32(o, le) : dv.getUint32(o, le)) : Number(sgn ? dv.getBigInt64(o, le) : dv.getBigUint64(o, le)); }
      return out;
    }
    if (be) throw new Error('Bit düzeyinde big-endian tamsayı desteklenmiyor'); if (bc > 48) throw new Error('Bit sayısı çok büyük (' + bc + ')');
    const nbytes = Math.ceil((bo + bc) / 8), div = Math.pow(2, bo), mod = Math.pow(2, bc);
    for (let i = 0; i < n; i++) { const o = idx.start(i) + byteOff; let v = 0; for (let k = nbytes - 1; k >= 0; k--) v = v * 256 + bytes[o + k]; v = Math.floor(v / div) % mod; if (sgn && v >= mod / 2) v -= mod; out[i] = v; }
    return out;
  }
  async function open(buf) {
    const rd = new Rd(buf), u8 = rd.u8; if (u8.length < 168) throw new Error('MDF: dosya çok kısa');
    const ident = String.fromCharCode(...u8.subarray(0, 8)); if (!/^MDF/.test(ident)) throw new Error('MDF imzası bulunamadı');
    const ver = String.fromCharCode(...u8.subarray(8, 16)).trim(), vnum = rd.dv.getUint16(28, true);
    if (vnum < 400) throw new Error('MDF ' + (ver || vnum) + ' (sürüm 3.x) desteklenmiyor; yalnızca MDF 4.x okunur');
    const warn = [], unfin = rd.dv.getUint16(60, true); if (unfin) warn.push('Dosya kapatılmamış (unfinalized); son kayıtlar eksik olabilir');
    const hd = rd.block(64); if (!hd || hd.id !== '##HD') throw new Error('MDF: HD bloğu bulunamadı');
    const startNs = u64(rd.dv, hd.data), groups = [];
    let dgi = 0;
    for (let dgo = hd.links[0]; dgo; dgo = rd.block(dgo).links[0]) {
      const dg = rd.block(dgo); dg.cgs = []; dgi++;
      for (let cgo = dg.links[1]; cgo; cgo = rd.block(cgo).links[0]) {
        const cb = rd.block(cgo), d = cb.data; const cg = {blk: cb, recId: u64(rd.dv, d), cycles: u64(rd.dv, d + 8), vlsd: !!(rd.dv.getUint16(d + 16, true) & 1), dataBytes: rd.dv.getUint32(d + 24, true), invBytes: rd.dv.getUint32(d + 28, true), cns: []};
        for (let cno = cb.links[1]; cno; cno = rd.block(cno).links[0]) {
          const nb = rd.block(cno), e = nb.data; if (nb.id !== '##CN') break;
          const cn = {type: rd.dv.getUint8(e), sync: rd.dv.getUint8(e + 1), dt: rd.dv.getUint8(e + 2), bitOff: rd.dv.getUint8(e + 3), byteOff: rd.dv.getUint32(e + 4, true), bits: rd.dv.getUint32(e + 8, true), flags: rd.dv.getUint32(e + 12, true), name: rd.text(nb.links[2]),
            comp: nb.links[1], cc: readConv(rd, nb.links[4]), unit: rd.text(nb.links[6])}; if (!cn.unit && cn.cc) cn.unit = cn.cc.unit || ''; cg.cns.push(cn);
        }
        cg.name = rd.text(cb.links[2]) || ''; dg.cgs.push(cg);
      }
      dg.multi = dg.cgs.length > 1; if (dg.multi && rd.dv.getUint8(dg.data) === 0) { warn.push('Çoklu kanal grubu ama kayıt kimliği yok; veri grubu atlandı'); continue; }
      for (const cg of dg.cgs) {
        if (cg.vlsd) continue;
        const master = cg.cns.find(c => (c.type === 2 || c.type === 3) && c.sync === 1) || cg.cns.find(c => c.type === 2 || c.type === 3), g = {name: cg.name || ('Grup ' + dgi + (dg.cgs.length > 1 ? '.' + (dg.cgs.indexOf(cg) + 1) : '')), dg, cg, master, channels: [], n: 0};
        for (const cn of cg.cns) {
          if (cn === master || cn.type !== 0) continue; if (cn.dt > 5) continue; if (cn.comp) { warn.push('Bileşik (dizi / yapı) kanal atlandı: ' + cn.name); continue; }
          g.channels.push({name: cn.name || ('Kanal ' + (g.channels.length + 1)), unit: cn.unit, cn, g});
        }
        groups.push(g);
      }
    }
    const names = new Map(); for (const g of groups) { const k = names.get(g.name) || 0; names.set(g.name, k + 1); if (k) g.name += ' (' + (k + 1) + ')'; }
    async function loadCn(g, cn) {
      const bytes = await dgBytes(rd, g.dg), idx = recordIndex(rd, g.dg, g.cg, bytes); g.n = idx.n; let x;
      if (cn.type === 3) { x = new Float64Array(idx.n); for (let i = 0; i < idx.n; i++) x[i] = i; } else x = extract(rd, bytes, idx, cn);
      return applyConv(cn.cc, x, warn, cn.name);
    }
    return {version: ver, startNs, groups, warn, rd, load: (ch) => loadCn(ch.g, ch.cn), time: async g => g.master ? loadCn(g, g.master) : null, count: async g => { const bytes = await dgBytes(rd, g.dg); return recordIndex(rd, g.dg, g.cg, bytes).n; }};
  }
  return {open};
})();
if (typeof module !== 'undefined') module.exports = MDF;
