/* MAT-file Level 5 okuyucu (sıkıştırılmış öğeler dahil) — tembel yükleme */
const MAT = (() => {
  const TYPE = {1:['i8',1],2:['u8',1],3:['i16',2],4:['u16',2],5:['i32',4],6:['u32',4],7:['f32',4],9:['f64',8],12:['i64',8],13:['u64',8]};
  const CLS = {1:'cell',2:'struct',3:'object',4:'char',5:'sparse',6:'double',7:'single',8:'int8',9:'uint8',10:'int16',11:'uint16',12:'int32',13:'uint32',14:'int64',15:'uint64'};
  const NUMERIC = new Set([6,7,8,9,10,11,12,13,14,15]);

  async function inflate(u8, maxBytes) {
    const stream = (u8 instanceof Blob ? u8 : new Blob([u8])).stream().pipeThrough(new DecompressionStream('deflate'));
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
    const pad = (w === 15) ? size : Math.ceil(size / 8) * 8; // miCOMPRESSED doldurulmaz. Bitsel (& ~7) değil: 2 GB üstü boyutlarda 32 bit taşar, negatif çıkar
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

  // struct / cell içindeki sayısal öğeleri düz bir listeye açar (tamamı bellekte çözülmüş bayt dizisi üzerinden)
  function walkContainer(bytes, le, prefix, top, out, depth) {
    if (depth > 6 || out.length > MAXV) return;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), t = readTag(dv, 0, le); if (t.type !== 14) return;
    let o = t.data; const fl = readTag(dv, o, le), cls = dv.getUint32(fl.data, le) & 0xFF, complex = !!(dv.getUint32(fl.data, le) & 0x800); o = fl.next;
    const dt = readTag(dv, o, le), dims = []; for (let i = 0; i < dt.size / 4; i++) dims.push(dv.getInt32(dt.data + 4 * i, le)); o = dt.next;
    const nt = readTag(dv, o, le); o = nt.next; const count = dims.reduce((a, b) => a * b, 1);
    if (NUMERIC.has(cls)) { if (count >= 1) out.push({name: prefix, cls, clsName: CLS[cls], dims, complex, numeric: true, count, inline: bytes, top, compressed: false}); return; }
    const children = [];
    if (cls === 1) { for (let k = 0; k < count; k++) { const c = readTag(dv, o, le); children.push([prefix + '{' + (k + 1) + '}', bytes.subarray(o, c.next)]); o = c.next; } }
    else if (cls === 2) {
      const ln = readTag(dv, o, le), L = dv.getInt32(ln.data, le); o = ln.next; const fn = readTag(dv, o, le), nf = L > 0 ? Math.floor(fn.size / L) : 0, names = [];
      for (let i = 0; i < nf; i++) { let nm = ''; for (let j = 0; j < L; j++) { const ch = dv.getUint8(fn.data + i * L + j); if (!ch) break; nm += String.fromCharCode(ch); } names.push(nm); } o = fn.next;
      for (let k = 0; k < count; k++) for (let i = 0; i < nf; i++) { const c = readTag(dv, o, le); children.push([prefix + (count > 1 ? '(' + (k + 1) + ')' : '') + '.' + names[i], bytes.subarray(o, c.next)]); o = c.next; }
    } else return;
    for (const [nm, b] of children) walkContainer(b, le, nm, top, out, depth + 1);
  }

  const MAXV = 200000;
  /* Büyük dosyalar (≥ lazyMin, varsayılan 1,5 GB): tamamı belleğe alınmaz (tarayıcı tek parça okumada ~2 GB sınırına
     takılır). Yalnız etiketler ve değişken başlıkları parça parça okunur; veri, kanal çizilince kendi aralığından okunur. */
  const rd = async (file, off, len) => new Uint8Array(await file.slice(off, Math.min(file.size, off + len)).arrayBuffer());
  function hdrOf(b, le) {   // miMATRIX başlığı: sınıf, boyutlar, ad; yapı ise alan adlarının bittiği yer
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), t = readTag(dv, 0, le); if (t.type !== 14) return null;
    if (t.size === 0) return {t, empty: true};
    let o = t.data; const fl = readTag(dv, o, le), flags = dv.getUint32(fl.data, le); o = fl.next;
    const dt = readTag(dv, o, le), dims = []; for (let i = 0; i < dt.size / 4; i++) dims.push(dv.getInt32(dt.data + 4 * i, le)); o = dt.next;
    const nt = readTag(dv, o, le); let name = ''; for (let i = 0; i < nt.size; i++) name += String.fromCharCode(dv.getUint8(nt.data + i)); o = nt.next;
    return {t, dv, cls: flags & 0xFF, complex: !!(flags & 0x800), dims, name, o};
  }
  async function walkLazy(file, off, le, prefix, top, out, depth) {
    let b = await rd(file, off, 512); let hd = hdrOf(b, le); if (!hd) return -1;
    const end = off + hd.t.next; if (hd.empty) return end;
    const name = prefix || hd.name, cls = hd.cls, dims = hd.dims, count = dims.reduce((a, c) => a * c, 1);
    const info = {name, cls, clsName: CLS[cls] || ('cls' + cls), dims, complex: hd.complex, numeric: NUMERIC.has(cls), count, off, endOff: end, compressed: false};
    if (top) info.top = top;
    if (info.numeric) { if (top == null || count >= 1) out.push(info); return end; }
    if (top == null) out.push(info);
    if (depth > 6 || out.length > MAXV || (cls !== 1 && cls !== 2)) return end;
    const tp = top || name, kids = [];
    let o = hd.o;
    if (cls === 2) {
      if (o + 16 > b.length) { b = await rd(file, off, o + 16); hd = hdrOf(b, le); }
      let dv = hd.dv; const ln = readTag(dv, o, le), L = dv.getInt32(ln.data, le); o = ln.next;
      let fn = readTag(dv, o, le);
      if (fn.next > b.length) { b = await rd(file, off, fn.next + 8); hd = hdrOf(b, le); dv = hd.dv; fn = readTag(dv, o, le); }
      const nf = L > 0 ? Math.floor(fn.size / L) : 0, names = [];
      for (let i = 0; i < nf; i++) { let nm = ''; for (let j = 0; j < L; j++) { const ch = dv.getUint8(fn.data + i * L + j); if (!ch) break; nm += String.fromCharCode(ch); } names.push(nm); }
      o = fn.next;
      for (let k = 0; k < count; k++) for (let i = 0; i < nf; i++) kids.push(name + (count > 1 ? '(' + (k + 1) + ')' : '') + '.' + names[i]);
    } else for (let k = 0; k < count; k++) kids.push(name + '{' + (k + 1) + '}');
    let p = off + o;
    for (const nm of kids) {
      if (p + 8 > end || out.length > MAXV) break;
      const e = await walkLazy(file, p, le, nm, tp, out, depth + 1); if (e <= p) break; p = e;
    }
    return end;
  }
  async function openLazy(file, pre) {
    const le = !(pre[126] === 0x4D && pre[127] === 0x49), head = new TextDecoder('latin1').decode(pre.subarray(0, 116)), vars = [];
    let o = 128;
    while (o + 8 <= file.size) {
      const tb = await rd(file, o, 8), t = readTag(new DataView(tb.buffer), 0, le), next = o + t.next;
      if (t.type === 15) {
        const d0 = o + t.data, info = parseMatrix(await inflate(file.slice(d0, d0 + t.size), 600), le, false);
        if (info) { info.compOff = d0; info.compSize = t.size; info.compressed = true; vars.push(info);
          if ((info.cls === 1 || info.cls === 2) && t.size < 1.2e9) { try { walkContainer(await inflate(file.slice(d0, d0 + t.size)), le, info.name, info.name, vars, 0); } catch (e) { info.walkErr = String(e.message || e); } } }
      } else if (t.type === 14) await walkLazy(file, o, le, null, null, vars, 0);
      if (next <= o) break;
      o = next;
    }
    return {file, lazy: true, le, vars, header: head.trim()};
  }
  async function lazyBytes(m, v) {
    if (v.compressed) return inflate(m.file.slice(v.compOff, v.compOff + v.compSize));
    if (v.endOff - v.off > 2.1e9) throw new Error(v.name + ' tek parçada okunamayacak kadar büyük (' + ((v.endOff - v.off) / 1e9).toFixed(1) + ' GB)');
    return rd(m.file, v.off, v.endOff - v.off);
  }

  async function open(file) {
    const pre = new Uint8Array(await file.slice(0, 2048).arrayBuffer()); const hasSig = p => pre.length >= p + 4 && pre[p] === 0x89 && pre[p + 1] === 0x48 && pre[p + 2] === 0x44 && pre[p + 3] === 0x46;
    const head0 = new TextDecoder('latin1').decode(pre.subarray(0, 116));
    if (/7\.3/.test(head0.slice(0, 40)) || hasSig(0) || hasSig(512) || hasSig(1024)) {
      const big = file.size > 1.5e9; // çok büyük dosyalar parça parça okunur
      const m = await H5.open(file, big ? null : new Uint8Array(await file.arrayBuffer())); m.h5 = true; return m;
    }
    if (file.size >= api.lazyMin) return openLazy(file, pre);
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
        if (info) { info.compOff = t.data; info.compSize = t.size; info.compressed = true; vars.push(info);
          if ((info.cls === 1 || info.cls === 2) && t.size < 1.2e9) { try { const full = await inflate(comp); walkContainer(full, le, info.name, info.name, vars, 0); } catch (e) { info.walkErr = String(e.message || e); } } }
      } else if (t.type === 14) {
        const info = parseMatrix(u8.subarray(o, t.next), le, false);
        if (info) { info.off = o; info.endOff = t.next; info.compressed = false; vars.push(info);
          if (info.cls === 1 || info.cls === 2) { try { walkContainer(u8.subarray(o, t.next), le, info.name, info.name, vars, 0); } catch (e) { info.walkErr = String(e.message || e); } } }
      }
      if (t.next <= o) break;
      o = t.next;
    }
    return {buf, u8, le, vars, header: head.trim()};
  }

  async function load(m, v) {
    if (m.h5) return H5.load(m, v);
    if (v.inline) return parseMatrix(v.inline, m.le, true).data;
    if (m.lazy) return parseMatrix(await lazyBytes(m, v), m.le, true).data;
    let bytes;
    if (v.compressed) bytes = await inflate(m.u8.subarray(v.compOff, v.compOff + v.compSize));
    else bytes = m.u8.subarray(v.off, v.endOff);
    const info = parseMatrix(bytes, m.le, true);
    return info.data;
  }

  // Tam ağaç çözümü (hücre, yapı, karakter, mantıksal, N boyut) — Kod sekmesi load() ve .fig önizlemesi için
  const CLSK = {6: 'd', 7: 's', 8: 'i8', 9: 'u8', 10: 'i16', 11: 'u16', 12: 'i32', 13: 'u32', 14: 'i64', 15: 'u64', 4: 'c'};
  function readAny(dv, tag, le) {
    let ty = tag.type; if (ty === 16) ty = 2; else if (ty === 17) ty = 4; else if (ty === 18) ty = 6;
    const sz = (TYPE[ty] || [0, 1])[1]; return readNumeric(dv, tag.data, ty, Math.floor(tag.size / sz), le);
  }
  function treeAt(dv, o, le, depth) {
    const t = readTag(dv, o, le); if (t.type !== 14) return {k: 'skip'};
    if (t.size === 0) return {k: 'num', cls: 'd', dims: [0, 0], re: new Float64Array(0)};
    if (depth > 40) return {k: 'skip'};
    let p = t.data; const fl = readTag(dv, p, le), flags = dv.getUint32(fl.data, le), cls = flags & 0xFF, complex = !!(flags & 0x800), logical = !!(flags & 0x200); p = fl.next;
    const dt = readTag(dv, p, le), dims = []; for (let i = 0; i < dt.size / 4; i++) dims.push(dv.getInt32(dt.data + 4 * i, le)); p = dt.next;
    const nt = readTag(dv, p, le); let name = ''; for (let i = 0; i < nt.size; i++) name += String.fromCharCode(dv.getUint8(nt.data + i)); p = nt.next;
    const count = dims.reduce((a, b) => a * b, 1);
    if (CLSK[cls]) {
      const rt = readTag(dv, p, le); let re = readAny(dv, rt, le); if (re.length < count) { const r2 = new Float64Array(count); r2.set(re); re = r2; } else if (re.length > count) re = re.slice(0, count); let im = null;
      if (complex) { const it2 = readTag(dv, rt.next, le); im = readAny(dv, it2, le); }
      return {k: 'num', name, cls: logical ? 'l' : CLSK[cls], dims, re, im};
    }
    if (cls === 5) {   // seyrek: ir (satır), jc (sütun başı), pr (pi) → tam matris
      const irT = readTag(dv, p, le), jcT = readTag(dv, irT.next, le), prT = readTag(dv, jcT.next, le), ir = readAny(dv, irT, le), jc = readAny(dv, jcT, le), pr = readAny(dv, prT, le), nr = dims[0], nc = dims[1] || 1;
      if (nr * nc > 2e7) return {k: 'skip', name, cls};
      let piA = null; if (complex) piA = readAny(dv, readTag(dv, prT.next, le), le);
      const re = new Float64Array(nr * nc), im = piA ? new Float64Array(nr * nc) : null;
      for (let j = 0; j < nc; j++) for (let q = jc[j]; q < jc[j + 1]; q++) { re[ir[q] + j * nr] = logical && !pr.length ? 1 : pr[q]; if (im) im[ir[q] + j * nr] = piA[q]; }
      return {k: 'num', name, cls: logical ? 'l' : 'd', dims: [nr, nc], re, im, sparse: true};
    }
    if (cls === 1) { const v = []; for (let i = 0; i < count; i++) { const c = readTag(dv, p, le); v.push(treeAt(dv, p, le, depth + 1)); p = c.next; } return {k: 'cell', name, dims, v}; }
    if (cls === 2 || cls === 3) {
      let className = ''; if (cls === 3) { const cn = readTag(dv, p, le); for (let i = 0; i < cn.size; i++) className += String.fromCharCode(dv.getUint8(cn.data + i)); p = cn.next; }
      const ln = readTag(dv, p, le), L = dv.getInt32(ln.data, le); p = ln.next; const fn = readTag(dv, p, le), nf = L > 0 ? Math.floor(fn.size / L) : 0, f = [];
      for (let i = 0; i < nf; i++) { let nm = ''; for (let j = 0; j < L; j++) { const ch = dv.getUint8(fn.data + i * L + j); if (!ch) break; nm += String.fromCharCode(ch); } f.push(nm); } p = fn.next;
      const v = []; for (let k = 0; k < count; k++) { const o2 = {}; for (let i = 0; i < nf; i++) { const c = readTag(dv, p, le); o2[f[i]] = treeAt(dv, p, le, depth + 1); p = c.next; } v.push(o2); }
      return {k: 'struct', name, dims, f, v, className};
    }
    return {k: 'skip', name, cls};
  }
  async function readAll(m, only) {
    if (m.h5) { const t = await H5.readTrees(m); return only ? t.filter(x => only.includes(x.name)) : t; }
    if (m.lazy) {
      const out = [];
      for (const v of m.vars) {
        if (v.top != null || (only && !only.includes(v.name))) continue;
        const b = await lazyBytes(m, v); out.push(treeAt(new DataView(b.buffer, b.byteOffset, b.byteLength), 0, m.le, 0));
      }
      return out;
    }
    const u8 = m.u8, dv0 = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = []; let o = 128;
    while (o + 8 <= u8.length) {
      const t = readTag(dv0, o, m.le);
      if (t.type === 15) { const b = await inflate(u8.subarray(t.data, t.data + t.size)); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); const tr = treeAt(dv, 0, m.le, 0); if (!only || only.includes(tr.name)) out.push(tr); }
      else if (t.type === 14) { const tr = treeAt(dv0, o, m.le, 0); if (!only || only.includes(tr.name)) out.push(tr); }
      if (t.next <= o) break; o = t.next;
    }
    return out;
  }
  globalThis.MATinflate = inflate; globalThis.MATreadNumeric = readNumeric;
  const api = {open, load, inflate, readAll, lazyMin: 1.5e9};
  return api;
})();
if (typeof module !== 'undefined') module.exports = MAT;
