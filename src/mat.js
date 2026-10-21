/* MAT-file Level 5 okuyucu (sıkıştırılmış öğeler dahil) — tembel yükleme */
const MAT = (() => {
  const TYPE = {1:['i8',1],2:['u8',1],3:['i16',2],4:['u16',2],5:['i32',4],6:['u32',4],7:['f32',4],9:['f64',8],12:['i64',8],13:['u64',8]};
  const CLS = {1:'cell',2:'struct',3:'object',4:'char',5:'sparse',6:'double',7:'single',8:'int8',9:'uint8',10:'int16',11:'uint16',12:'int32',13:'uint32',14:'int64',15:'uint64'};
  const NUMERIC = new Set([6,7,8,9,10,11,12,13,14,15]);

  async function inflate(u8, maxBytes) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'));
    const reader = stream.getReader();
    const chunks = []; let total = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value); total += value.length;
      if (maxBytes && total >= maxBytes) { try { await reader.cancel(); } catch (e) {} break; }
    }
    if (chunks.length === 1) return chunks[0];
    const out = new Uint8Array(total); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  function readTag(dv, o, le) {
    const w = dv.getUint32(o, le);
    if ((w >>> 16) !== 0) return {type: w & 0xFFFF, size: w >>> 16, data: o + 4, next: o + 8};
    const size = dv.getUint32(o + 4, le);
    const pad = (w === 15) ? size : ((size + 7) & ~7); // miCOMPRESSED doldurulmaz
    return {type: w, size, data: o + 8, next: o + 8 + pad};
  }

  function readNumeric(dv, off, type, count, le) {
    const t = TYPE[type]; if (!t) throw new Error('Desteklenmeyen veri türü: ' + type);
    const out = new Float64Array(count);
    const [k, sz] = t;
    if (le && off % sz === 0 && k !== 'i64' && k !== 'u64') {
      const buf = dv.buffer, bo = dv.byteOffset + off;
      let src;
      switch (k) {
        case 'f64': src = new Float64Array(buf, bo, count); break;
        case 'f32': src = new Float32Array(buf, bo, count); break;
        case 'i32': src = new Int32Array(buf, bo, count); break;
        case 'u32': src = new Uint32Array(buf, bo, count); break;
        case 'i16': src = new Int16Array(buf, bo, count); break;
        case 'u16': src = new Uint16Array(buf, bo, count); break;
        case 'i8': src = new Int8Array(buf, bo, count); break;
        case 'u8': src = new Uint8Array(buf, bo, count); break;
      }
      out.set(src); return out;
    }
    for (let i = 0; i < count; i++) {
      const p = off + i * sz;
      switch (k) {
        case 'f64': out[i] = dv.getFloat64(p, le); break;
        case 'f32': out[i] = dv.getFloat32(p, le); break;
        case 'i32': out[i] = dv.getInt32(p, le); break;
        case 'u32': out[i] = dv.getUint32(p, le); break;
        case 'i16': out[i] = dv.getInt16(p, le); break;
        case 'u16': out[i] = dv.getUint16(p, le); break;
        case 'i8': out[i] = dv.getInt8(p); break;
        case 'u8': out[i] = dv.getUint8(p); break;
        case 'i64': out[i] = Number(dv.getBigInt64(p, le)); break;
        case 'u64': out[i] = Number(dv.getBigUint64(p, le)); break;
      }
    }
    return out;
  }

  // miMATRIX içeriğini (etiket sonrası) çözümler. full=false ise yalnız başlık bilgisi.
  function parseMatrix(u8, le, full) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let t = readTag(dv, 0, le);
    if (t.type !== 14) return null;
    let o = t.data; const end = t.data + t.size;
    const fl = readTag(dv, o, le); const flags = dv.getUint32(fl.data, le);
    const cls = flags & 0xFF, complex = !!(flags & 0x800);
    o = fl.next;
    const dt = readTag(dv, o, le); const nd = dt.size / 4; const dims = [];
    for (let i = 0; i < nd; i++) dims.push(dv.getInt32(dt.data + 4 * i, le));
    o = dt.next;
    const nt = readTag(dv, o, le); let name = '';
    for (let i = 0; i < nt.size; i++) name += String.fromCharCode(dv.getUint8(nt.data + i));
    o = nt.next;
    const info = {name, cls, clsName: CLS[cls] || ('cls' + cls), dims, complex, numeric: NUMERIC.has(cls)};
    info.count = dims.reduce((a, b) => a * b, 1);
    if (!full) return info;
    if (!info.numeric) return info;
    const rt = readTag(dv, o, le);
    const sz = (TYPE[rt.type] || [0, 1])[1];
    const n = Math.min(info.count, Math.floor(rt.size / sz));
    info.data = readNumeric(dv, rt.data, rt.type, n, le);
    return info;
  }

  async function open(file) {
    const pre = new Uint8Array(await file.slice(0, 128).arrayBuffer());
    const head0 = new TextDecoder('latin1').decode(pre.subarray(0, 116));
    if (/7\.3/.test(head0.slice(0, 40)) || (pre[0] === 0x89 && pre[1] === 0x48)) {
      const big = file.size > 1.5e9; // çok büyük dosyalar parça parça okunur
      const m = await H5.open(file, big ? null : new Uint8Array(await file.arrayBuffer())); m.h5 = true; return m;
    }
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const head = new TextDecoder('latin1').decode(u8.subarray(0, 116));
    const dv = new DataView(buf);
    const le = !(u8[126] === 0x4D && u8[127] === 0x49); // 'IM' = little endian
    const vars = [];
    let o = 128;
    while (o + 8 <= u8.length) {
      const t = readTag(dv, o, le);
      if (t.type === 15) {
        const comp = u8.subarray(t.data, t.data + t.size);
        const head = await inflate(comp, 600);
        const info = parseMatrix(head, le, false);
        if (info) { info.compOff = t.data; info.compSize = t.size; info.compressed = true; vars.push(info); }
      } else if (t.type === 14) {
        const info = parseMatrix(u8.subarray(o, t.next), le, false);
        if (info) { info.off = o; info.endOff = t.next; info.compressed = false; vars.push(info); }
      }
      if (t.next <= o) break;
      o = t.next;
    }
    return {buf, u8, le, vars, header: head.trim()};
  }

  async function load(m, v) {
    if (m.h5) return H5.load(m, v);
    let bytes;
    if (v.compressed) bytes = await inflate(m.u8.subarray(v.compOff, v.compOff + v.compSize));
    else bytes = m.u8.subarray(v.off, v.endOff);
    const info = parseMatrix(bytes, m.le, true);
    return info.data;
  }

  globalThis.MATinflate = inflate; globalThis.MATreadNumeric = readNumeric;
  return {open, load, inflate};
})();
if (typeof module !== 'undefined') module.exports = MAT;
