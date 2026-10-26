/* NI TDMS okuyucu (kurulumsuz). Desteklenen: çok segmentli dosyalar, interleaved / ardışık ham veri,
   big-endian, sayısal tipler, string, zaman damgası, özellikler. DAQmx ham verisi desteklenmez. */
const TDMS = (() => {
  const SZ = {1: 1, 2: 2, 3: 4, 4: 8, 5: 1, 6: 2, 7: 4, 8: 8, 9: 4, 10: 8, 0x19: 4, 0x1A: 8, 0x21: 1, 0x44: 16};
  const TNAME = {1: 'i8', 2: 'i16', 3: 'i32', 4: 'i64', 5: 'u8', 6: 'u16', 7: 'u32', 8: 'u64', 9: 'f32', 10: 'f64', 0x19: 'f32', 0x1A: 'f64', 0x20: 'string', 0x21: 'bool', 0x44: 'time'};
  const EPOCH = Date.UTC(1904, 0, 1);
  function rd(dv, o, t, le) {
    switch (t) {
      case 1: return dv.getInt8(o); case 2: return dv.getInt16(o, le); case 3: return dv.getInt32(o, le);
      case 4: return Number(dv.getBigInt64(o, le)); case 5: return dv.getUint8(o); case 6: return dv.getUint16(o, le);
      case 7: return dv.getUint32(o, le); case 8: return Number(dv.getBigUint64(o, le));
      case 9: case 0x19: return dv.getFloat32(o, le); case 10: case 0x1A: return dv.getFloat64(o, le);
      case 0x21: return dv.getUint8(o) ? 1 : 0;
      case 0x44: { const fr = Number(dv.getBigUint64(o + (le ? 0 : 8), le)) / 18446744073709551616, s = Number(dv.getBigInt64(o + (le ? 8 : 0), le)); return EPOCH + (s + fr) * 1000; }
    }
    throw new Error('Desteklenmeyen TDMS veri tipi: 0x' + t.toString(16));
  }
  function parse(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), N = u8.length, dec = new TextDecoder();
    const objs = new Map(), order = []; let active = [], segs = [], pos = 0, warn = [];
    const getObj = p => { let o = objs.get(p); if (!o) { o = {path: p, props: {}, idx: null, parts: [], total: 0}; objs.set(p, o); order.push(o); } return o; };
    while (pos + 28 <= N) {
      if (u8[pos] !== 0x54 || u8[pos + 1] !== 0x44 || u8[pos + 2] !== 0x53 || u8[pos + 3] !== 0x6D) { if (!segs.length) throw new Error('TDMS imzası bulunamadı'); warn.push('Beklenmeyen veri, okuma durduruldu'); break; }
      const toc = dv.getUint32(pos + 4, true), ver = dv.getUint32(pos + 8, true);
      let next = Number(dv.getBigUint64(pos + 12, true)), rawOff = Number(dv.getBigUint64(pos + 20, true));
      const big = !!(toc & 64), nl = !!(toc & 4);
      const LE = !big, interleaved = !!(toc & 32), meta = !!(toc & 2), raw = !!(toc & 8);
      const start = pos + 28, unk = next >= 1.8e19; let segEnd = (unk || pos + 28 + next > N) ? N : pos + 28 + next;
      if (!unk && pos + 28 + next > N) warn.push('Dosya sonu kesik (son segment kısmi)');
      let p = start;
      if (toc & 2) {
        const M = rawOff; // meta uzunluğu = rawOff
        const mEnd = start + M; let no = dv.getUint32(p, LE); p += 4; const lst = [];
        if (nl) active = [];
        for (let i = 0; i < no; i++) {
          const L = dv.getUint32(p, LE); p += 4; const path = dec.decode(u8.subarray(p, p + L)); p += L; const o = getObj(path);
          const ri = dv.getUint32(p, LE); p += 4;
          if (ri === 0xFFFFFFFF) { active = active.filter(a => a !== o); }
          else if (ri === 0) { if (!o.idx) throw new Error('TDMS: önceki indeks yok ' + path); if (!active.includes(o)) active.push(o); }
          else if (ri === 0x69120000 || ri === 0x69130000) throw new Error('DAQmx ham verisi içeren TDMS dosyaları desteklenmiyor');
          else {
            const dt = dv.getUint32(p, LE); p += 4; p += 4; const nv = Number(dv.getBigUint64(p, LE)); p += 8; let tb = 0;
            if (dt === 0x20) { tb = Number(dv.getBigUint64(p, LE)); p += 8; }
            if (!(dt in SZ) && dt !== 0x20) throw new Error('Desteklenmeyen TDMS veri tipi 0x' + dt.toString(16) + ' (' + path + ')');
            o.idx = {dt, nv, tb}; if (!active.includes(o)) active.push(o);
          }
          const np = dv.getUint32(p, LE); p += 4;
          for (let k = 0; k < np; k++) {
            const nL = dv.getUint32(p, LE); p += 4; const nm = dec.decode(u8.subarray(p, p + nL)); p += nL; const dt = dv.getUint32(p, LE); p += 4; let v;
            if (dt === 0x20) { const sL = dv.getUint32(p, LE); p += 4; v = dec.decode(u8.subarray(p, p + sL)); p += sL; }
            else if (dt === 0) v = null; else { v = rd(dv, p, dt, LE); p += SZ[dt]; }
            o.props[nm] = dt === 0x44 ? new Date(v) : v;
          }
        }
        p = mEnd;
      } else p = start + rawOff;
      if (raw && active.length && p < segEnd) segs.push({at: p, end: segEnd, LE, inter: interleaved, act: active.map(o => ({o, idx: o.idx}))});
      pos = segEnd;
      if (segEnd >= N) break;
    }
    // Segment verisini kanallara aktar (iki geçiş: toplam say, doldur)
    const info = new Map();
    for (const s of segs) {
      let chunk = 0; for (const a of s.act) chunk += a.idx.dt === 0x20 ? a.idx.tb + 4 * a.idx.nv : a.idx.nv * SZ[a.idx.dt];
      if (!chunk) continue; s.chunk = chunk; s.nch = Math.floor((s.end - s.at) / chunk);
      if (s.nch < (s.end - s.at) / chunk && s.end - s.at > 0 && s.nch === 0) warn.push('Kısmi veri bloğu atlandı');
      for (const a of s.act) a.o.total += a.idx.nv * s.nch;
    }
    const out = new Map();
    for (const o of order) if (o.idx || o.total) {
      const dt = o.idx && o.idx.dt; let arr;
      if (dt === 0x20) arr = new Array(o.total); else arr = (dt === 1 || dt === 2 || dt === 5 || dt === 6 || dt === 9 || dt === 0x19 || dt === 0x21) ? new Float32Array(o.total) : new Float64Array(o.total);
      out.set(o, {arr, fill: 0});
    }
    for (const s of segs) {
      if (!s.chunk) continue;
      for (let c = 0; c < s.nch; c++) {
        let base = s.at + c * s.chunk;
        if (s.inter && s.act.every(a => a.idx.dt !== 0x20)) {
          const nv = s.act[0].idx.nv, stride = s.act.reduce((q, a) => q + SZ[a.idx.dt], 0);
          for (let i = 0; i < nv; i++) { let q = base + i * stride; for (const a of s.act) { const w = out.get(a.o); w.arr[w.fill++] = rd(dv, q, a.idx.dt, s.LE); q += SZ[a.idx.dt]; } }
        } else {
          for (const a of s.act) {
            const w = out.get(a.o), n = a.idx.nv, dt = a.idx.dt;
            if (dt === 0x20) {
              const offs = []; for (let i = 0; i < n; i++) offs.push(dv.getUint32(base + 4 * i, s.LE)); const sb = base + 4 * n;
              for (let i = 0; i < n; i++) w.arr[w.fill++] = dec.decode(u8.subarray(sb + (i ? offs[i - 1] : 0), sb + offs[i])); base = sb + a.idx.tb;
            } else {
              const sz = SZ[dt], aligned = ((s.LE === true) && (base + u8.byteOffset) % sz === 0);
              if (aligned && (dt === 9 || dt === 0x19)) { w.arr.set(new Float32Array(u8.buffer, u8.byteOffset + base, n), w.fill); w.fill += n; }
              else if (aligned && (dt === 10 || dt === 0x1A)) { w.arr.set(new Float64Array(u8.buffer, u8.byteOffset + base, n), w.fill); w.fill += n; }
              else { for (let i = 0; i < n; i++) w.arr[w.fill++] = rd(dv, base + i * sz, dt, s.LE); }
              base += n * sz;
            }
          }
        }
      }
    }
    // Yol → grup/kanal
    const unq = s => s.replace(/^'|'$/g, '').replace(/''/g, "'");
    const parsePath = p => { const m = p.match(/'((?:[^']|'')*)'/g) || []; return m.map(unq); };
    const root = {props: {}}, groups = new Map();
    for (const o of order) {
      const pp = parsePath(o.path);
      if (pp.length === 0) root.props = o.props;
      else if (pp.length === 1) { const g = groups.get(pp[0]) || {name: pp[0], props: {}, channels: []}; g.props = o.props; groups.set(pp[0], g); }
      else {
        const g = groups.get(pp[0]) || {name: pp[0], props: {}, channels: []}; groups.set(pp[0], g);
        const w = out.get(o), dt = o.idx && o.idx.dt;
        g.channels.push({name: pp[1], props: o.props, dtype: dt ? TNAME[dt] : '', n: w ? w.arr.length : 0, data: w ? w.arr : (dt === 0x20 ? [] : new Float32Array(0))});
      }
    }
    return {props: root.props, groups: [...groups.values()], warn};
  }
  return {parse};
})();
