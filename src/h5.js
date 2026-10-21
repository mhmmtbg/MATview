/* Minimal HDF5 okuyucu — MATLAB v7.3 .mat dosyaları için
   Destek: superblock v0-v3, nesne başlığı v1/v2, eski tarz gruplar (B-tree + yerel yığın) ve v2 sıkıştırılmış bağlantılar,
   düzen v3 (compact/contiguous/chunked), filtreler: deflate, shuffle, fletcher32 */
const H5 = (() => {
  const SIG = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
  const MI = {i8: 1, u8: 2, i16: 3, u16: 4, i32: 5, u32: 6, f32: 7, f64: 9, i64: 12, u64: 13};
  const SZ = {i8: 1, u8: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, f64: 8, i64: 8, u64: 8};

  class R { // rastgele erişimli okuyucu
    constructor(file, u8) { this.file = file; this.u8 = u8; this.base = 0; }
    async get(off, len) {
      off += this.base;
      if (this.u8) return this.u8.subarray(off, off + len);
      return new Uint8Array(await this.file.slice(off, off + len).arrayBuffer());
    }
  }
  const dvOf = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const rdN = (dv, o, n) => n === 8 ? Number(dv.getBigUint64(o, true)) : n === 4 ? dv.getUint32(o, true) : n === 2 ? dv.getUint16(o, true) : dv.getUint8(o);
  const UNDEF = (dv, o, n) => { for (let i = 0; i < n; i++) if (dv.getUint8(o + i) !== 0xff) return false; return true; };
  const cstr = (u8, o) => { let s = ''; while (u8[o] !== 0 && o < u8.length) s += String.fromCharCode(u8[o++]); return s; };
  const pad8 = n => (n + 7) & ~7;

  async function open(file, u8) {
    const r = new R(file, u8);
    // imza ara: 0, 512, 1024, ...
    let sig = -1;
    for (let p = 0; p < 1 << 20; p = p ? p * 2 : 512) {
      const b = await r.get(p, 8); if (b.length < 8) break; if (SIG.every((v, i) => b[i] === v)) { sig = p; break; }
    }
    if (sig < 0) throw new Error('HDF5 imzası bulunamadı');
    r.base = sig;
    const sb = await r.get(0, 128), dv = dvOf(sb), ver = sb[8];
    let so, sl, root;
    if (ver === 0 || ver === 1) {
      so = sb[13]; sl = sb[14]; let o = 24 + (ver === 1 ? 4 : 0); o += so * 4; // base, freespace, eof, driver
      // kök grup sembol tablosu girişi
      o += so; root = {ohdr: rdN(dv, o, so)}; const cacheType = dv.getUint32(o + so, true);
      if (cacheType === 1) { root.btree = rdN(dv, o + 8 + so, so); root.heap = rdN(dv, o + 8 + so + so, so); }
    } else if (ver === 2 || ver === 3) {
      so = sb[9]; sl = sb[10]; root = {ohdr: rdN(dv, 12 + so * 3, so)};
    } else throw new Error('Desteklenmeyen HDF5 superblock sürümü: ' + ver);
    const ctx = {r, so, sl};
    const rootObj = await readObject(ctx, root.ohdr);
    const vars = [];
    const links = await listGroup(ctx, rootObj, root);
    for (const [name, addr] of links) {
      if (name === '#refs#' || name === '#subsystem#') continue;
      let o; try { o = await readObject(ctx, addr); } catch (e) { continue; }
      const info = describe(o, name);
      if (info) { info.h5 = {ctx, obj: o}; vars.push(info); }
    }
    return {kind: 'h5', ctx, vars, header: 'MATLAB v7.3 (HDF5)'};
  }

  // ---- nesne başlığı ----
  async function readObject(ctx, addr) {
    const {r, so, sl} = ctx; const first = await r.get(addr, 16); const msgs = [];
    const addMsgs = async (buf, v2, hflags) => {
      let o = 0; const dv = dvOf(buf);
      while (o + (v2 ? 4 : 8) <= buf.length) {
        let type, size, flags;
        if (!v2) { type = dv.getUint16(o, true); size = dv.getUint16(o + 2, true); flags = buf[o + 4]; o += 8; }
        else { type = buf[o]; size = dv.getUint16(o + 1, true); flags = buf[o + 3]; o += 4; if (hflags & 4) o += 2; }
        if (o + size > buf.length) break;
        const data = buf.subarray(o, o + size); o += size;
        if (type === 0x10) { const cdv = dvOf(data); const caddr = rdN(cdv, 0, so), clen = rdN(cdv, so, sl); let blk = await r.get(caddr, clen); if (v2) { blk = blk.subarray(4, blk.length - 4); } await addMsgs(blk, v2, hflags); }
        else if (type !== 0) msgs.push({type, data});
        if (!v2 && o % 8) { /* mesajlar 8'e hizalı */ }
      }
    };
    if (first[0] === 0x4F && first[1] === 0x48 && first[2] === 0x44 && first[3] === 0x52) { // v2
      const dv = dvOf(first); const flags = first[5]; let o = 6; if (flags & 0x20) o += 16; if (flags & 0x10) o += 4;
      const szl = 1 << (flags & 3); const big = await r.get(addr, o + szl + 8); const bdv = dvOf(big); const csize = rdN(bdv, o, szl); o += szl;
      const blk = await r.get(addr + o, csize); await addMsgs(blk, true, flags);
    } else { // v1
      const dv = dvOf(first); if (first[0] !== 1) throw new Error('Bilinmeyen nesne başlığı');
      const hsize = dv.getUint32(8, true); const blk = await r.get(addr + 16, hsize); await addMsgs(blk, false, 0);
    }
    return {addr, msgs};
  }
  const msg = (o, t) => o.msgs.find(m => m.type === t);

  // ---- grup içeriği ----
  async function listGroup(ctx, obj, rootHint) {
    const {r, so, sl} = ctx; const out = [];
    const st = msg(obj, 0x11);
    if (st) {
      const dv = dvOf(st.data); const btree = rdN(dv, 0, so), heap = rdN(dv, so, so);
      const hb = await r.get(heap, 8 + sl * 2 + so), hdv = dvOf(hb); const dataAddr = rdN(hdv, 8 + sl * 2, so);
      const walk = async (addr) => {
        const nb = await r.get(addr, 8), ndv = dvOf(nb);
        if (nb[0] !== 0x54) throw new Error('Grup B-tree imzası hatalı');
        const level = nb[5], used = ndv.getUint16(6, true);
        const raw = await r.get(addr + 8 + 2 * so, sl + used * (sl + so)), rdv = dvOf(raw);
        let q = sl; // ilk anahtar atlanır
        for (let i = 0; i < used; i++) {
          const child = rdN(rdv, q, so); q += so + sl;
          if (level > 0) await walk(child); else await snod(child);
        }
      };
      const snod = async (addr) => {
        const hd = await r.get(addr, 8), dv2 = dvOf(hd); const n = dv2.getUint16(6, true); const esz = 2 * so + 8 + 16;
        const body = await r.get(addr + 8, n * esz), bdv = dvOf(body);
        for (let i = 0; i < n; i++) { const o = i * esz; const noff = rdN(bdv, o, so), oh = rdN(bdv, o + so, so); const nm = await r.get(dataAddr + noff, 256); out.push([cstr(nm, 0), oh]); }
      };
      await walk(btree);
      return out;
    }
    // v2 tarzı bağlantı mesajları
    for (const m of obj.msgs) if (m.type === 0x06) {
      const d = m.data, dv = dvOf(d); const flags = d[1]; let o = 2; let ltype = 0;
      if (flags & 8) { ltype = d[o]; o++; } if (flags & 4) o += 8; if (flags & 16) o++;
      const lsz = 1 << (flags & 3); const nl = rdN(dv, o, lsz); o += lsz; const name = new TextDecoder().decode(d.subarray(o, o + nl)); o += nl;
      if (ltype === 0) out.push([name, rdN(dv, o, so)]);
    }
    return out;
  }

  // ---- veri kümesi bilgisi ----
  function parseDatatype(d) {
    const cls = d[0] & 0x0f, dv = dvOf(d), size = dv.getUint32(4, true); const bf0 = d[1];
    if (cls === 0) { const signed = !!(bf0 & 8); const k = (signed ? 'i' : 'u') + size * 8; if (!SZ[k]) return null; return {kind: 'num', k, size, be: !!(bf0 & 1)}; }
    if (cls === 1) { const k = size === 8 ? 'f64' : size === 4 ? 'f32' : null; if (!k) return null; return {kind: 'num', k, size, be: !!(bf0 & 1)}; }
    if (cls === 3) return {kind: 'str', size};
    return {kind: 'other', cls, size};
  }
  function parseDataspace(d) {
    const v = d[0], nd = d[1], flags = d[2]; let o = v === 1 ? 8 : 4; const dv = dvOf(d); const dims = [];
    for (let i = 0; i < nd; i++) { dims.push(Number(dv.getBigUint64(o, true))); o += 8; }
    return {dims, null: v === 2 && d[3] === 2};
  }
  function parseAttr(a, so) {
    const dv = dvOf(a), v = a[0]; let o, ns, ts, ss;
    if (v === 1) { ns = dv.getUint16(2, true); ts = dv.getUint16(4, true); ss = dv.getUint16(6, true); o = 8; const name = cstr(a, o); o += pad8(ns); const dt = a.subarray(o, o + ts); o += pad8(ts); const ds = a.subarray(o, o + ss); o += pad8(ss); return {name, dt, ds, data: a.subarray(o)}; }
    ns = dv.getUint16(2, true); ts = dv.getUint16(4, true); ss = dv.getUint16(6, true); o = 8 + (v === 3 ? 1 : 0);
    const name = cstr(a, o); o += ns; const dt = a.subarray(o, o + ts); o += ts; const ds = a.subarray(o, o + ss); o += ss; return {name, dt, ds, data: a.subarray(o)};
  }
  const CLASSES = {double: 6, single: 7, int8: 8, uint8: 9, int16: 10, uint16: 11, int32: 12, uint32: 13, int64: 14, uint64: 15, logical: 9, char: 4, cell: 1, struct: 2};
  function describe(o, name) {
    const dsm = msg(o, 0x01), dtm = msg(o, 0x03), lay = msg(o, 0x08);
    if (!dsm || !dtm || !lay) return {name, cls: 2, clsName: 'struct', dims: [0, 0], numeric: false, count: 0};
    let mclass = ''; let empty = false;
    for (const m of o.msgs) if (m.type === 0x0c) { try { const at = parseAttr(m.data); if (at.name === 'MATLAB_class') { const sz = dvOf(at.dt).getUint32(4, true); mclass = String.fromCharCode(...at.data.subarray(0, Math.min(sz, 32))).replace(/\0.*$/, '').trim(); } if (at.name === 'MATLAB_empty') empty = true; } catch (e) {} }
    const ds = parseDataspace(dsm.data), dt = parseDatatype(dtm.data);
    const dims = ds.dims.slice().reverse(); const count = dims.reduce((a, b) => a * b, 1);
    const numeric = !!dt && dt.kind === 'num' && !empty && (mclass === '' || (CLASSES[mclass] >= 6 && mclass !== 'char'));
    return {name, cls: CLASSES[mclass] || 6, clsName: mclass || 'double', dims: empty ? [0, 0] : dims, numeric, count: empty ? 0 : count, dt};
  }

  // ---- veri yükleme ----
  async function inflate(u8) { return MATinflate(u8); }
  async function load(h5, v) {
    const {ctx, obj} = v.h5, {r, so, sl} = ctx; const dt = v.dt; const lay = msg(obj, 0x08).data, ldv = dvOf(lay);
    const nbytes = v.count * dt.size, out = new Uint8Array(nbytes); const ver = lay[0];
    if (ver !== 3) throw new Error('Desteklenmeyen veri düzeni sürümü: ' + ver + ' (v7.3 dosyayı -v7 ile yeniden kaydedin)');
    const cls = lay[1];
    if (cls === 0) { const sz = ldv.getUint16(2, true); out.set(lay.subarray(4, 4 + Math.min(sz, nbytes))); }
    else if (cls === 1) { const addr = rdN(ldv, 2, so), size = rdN(ldv, 2 + so, sl); if (!UNDEF(ldv, 2, so)) { const CH = 1 << 26; for (let o = 0; o < Math.min(size, nbytes); o += CH) out.set(await r.get(addr + o, Math.min(CH, nbytes - o)), o); } }
    else if (cls === 2) {
      const nd = lay[2], baddr = rdN(ldv, 3, so); const cdims = []; for (let i = 0; i < nd; i++) cdims.push(ldv.getUint32(3 + so + 4 * i, true));
      const esz = cdims.pop(); const ddims = msgDims(obj); const rank = ddims.length;
      // filtreler
      const fm = msg(obj, 0x0b); const filters = fm ? parseFilters(fm.data) : [];
      const chunks = []; if (!UNDEF(ldv, 3, so)) await walkChunks(ctx, baddr, nd, chunks);
      const cstrides = new Array(rank), dstrides = new Array(rank); let a = 1, b = 1;
      for (let i = rank - 1; i >= 0; i--) { cstrides[i] = a; a *= cdims[i]; dstrides[i] = b; b *= ddims[i]; }
      const csize = a * esz;
      for (const ch of chunks) {
        let buf = await r.get(ch.addr, ch.size);
        for (let fi = filters.length - 1; fi >= 0; fi--) { if (ch.mask & (1 << fi)) continue; const f = filters[fi]; if (f.id === 1) buf = await inflate(buf); else if (f.id === 2) buf = unshuffle(buf, esz); else if (f.id === 3) buf = buf.subarray(0, buf.length - 4); else throw new Error('Desteklenmeyen HDF5 filtresi: ' + f.id); }
        if (buf.length < csize) { const t = new Uint8Array(csize); t.set(buf); buf = t; }
        copyChunk(out, buf, ddims, cdims, ch.off, esz, dstrides, cstrides);
      }
    } else throw new Error('Desteklenmeyen düzen sınıfı: ' + cls);
    if (dt.be) throw new Error('Big-endian HDF5 verisi desteklenmiyor');
    return bytesToF64(out, dt, v.count);
  }
  function msgDims(o) { return parseDataspace(msg(o, 0x01).data).dims; }
  function parseFilters(d) {
    const v = d[0], n = d[1], dv = dvOf(d); let o = v === 1 ? 8 : 2; const out = [];
    for (let i = 0; i < n; i++) {
      const id = dv.getUint16(o, true); o += 2; let nl = 0; if (v === 1 || id >= 256) { nl = dv.getUint16(o, true); o += 2; }
      const flags = dv.getUint16(o, true); const ncd = dv.getUint16(o + 2, true); o += 4; if (nl) o += v === 1 ? pad8(nl) : nl; o += ncd * 4; if (v === 1 && ncd % 2) o += 4;
      out.push({id, flags});
    }
    return out;
  }
  async function walkChunks(ctx, addr, nd, out) {
    const {r, so, sl} = ctx; const h = await r.get(addr, 8 + 2 * so), dv = dvOf(h);
    if (h[0] !== 0x54) throw new Error('B-tree imzası hatalı'); const level = h[5], used = dv.getUint16(6, true);
    const ksz = 8 + 8 * nd; const body = await r.get(addr + 8 + 2 * so, used * (ksz + so) + ksz), bdv = dvOf(body); let p = 0;
    for (let i = 0; i < used; i++) {
      const size = bdv.getUint32(p, true), mask = bdv.getUint32(p + 4, true); const off = []; for (let k = 0; k < nd - 1; k++) off.push(Number(bdv.getBigUint64(p + 8 + 8 * k, true)));
      p += ksz; const child = rdN(bdv, p, so); p += so;
      if (level > 0) await walkChunks(ctx, child, nd, out); else out.push({addr: child, size, mask, off});
    }
  }
  function unshuffle(b, esz) { const n = Math.floor(b.length / esz), o = new Uint8Array(b.length); for (let i = 0; i < n; i++) for (let k = 0; k < esz; k++) o[i * esz + k] = b[k * n + i]; for (let i = n * esz; i < b.length; i++) o[i] = b[i]; return o; }
  function copyChunk(out, buf, ddims, cdims, off, esz, dstr, cstr) {
    const rank = ddims.length; const idx = new Array(rank).fill(0); const last = rank - 1;
    const run = Math.min(cdims[last], ddims[last] - off[last]); if (run <= 0) return;
    const outer = []; for (let i = 0; i < last; i++) outer.push(Math.min(cdims[i], ddims[i] - off[i]));
    const total = outer.reduce((a, b) => a * b, 1);
    for (let t = 0; t < total; t++) {
      let rem = t, so2 = 0, co = 0;
      for (let i = last - 1; i >= 0; i--) { const c = rem % outer[i]; rem = (rem / outer[i]) | 0; so2 += (off[i] + c) * dstr[i]; co += c * cstr[i]; }
      so2 += off[last]; const sb = co * esz, db = so2 * esz;
      out.set(buf.subarray(sb, sb + run * esz), db);
    }
  }
  function bytesToF64(u8, dt, count) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    return MATreadNumeric(dv, 0, MI[dt.k], count, true);
  }
  return {open, load, SIG};
})();
