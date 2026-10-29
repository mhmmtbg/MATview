/* NI TDMS okuyucu (kurulumsuz). Desteklenen: çok segmentli dosyalar, interleaved / ardışık ham veri,
   big-endian, sayısal tipler, string, zaman damgası, özellikler, DAQmx ham veri (format değiştiren / sayısal hat ölçekleyiciler) ve NI ölçekleme
   (Linear, Polynomial, Table, Add/Subtract). RTD / Strain / Thermistor / Thermocouple ölçekleri desteklenmez (ham değer + uyarı). */
const TDMS = (() => {
  const SZ = {1: 1, 2: 2, 3: 4, 4: 8, 5: 1, 6: 2, 7: 4, 8: 8, 9: 4, 10: 8, 0x19: 4, 0x1A: 8, 0x21: 1, 0x44: 16};
  const TNAME = {1: 'i8', 2: 'i16', 3: 'i32', 4: 'i64', 5: 'u8', 6: 'u16', 7: 'u32', 8: 'u64', 9: 'f32', 10: 'f64', 0x19: 'f32', 0x1A: 'f64', 0x20: 'string', 0x21: 'bool', 0x44: 'time'};
  const EPOCH = Date.UTC(1904, 0, 1), RAW = 0xFFFFFFFF, DQT = {0: 5, 1: 1, 2: 6, 3: 2, 4: 7, 5: 3, 6: 8, 7: 4, 8: 9, 9: 10};   // DAQmx ölçekleyici tipi → TDMS tipi
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
  // NI ölçekleme özellikleri (NI_Scale[n]_...) → ölçek zinciri
  function getScales(props) {
    let num = props['NI_Number_Of_Scales']; if (num == null) { let mx = -1; for (const k in props) { const m = /^NI_Scale\[(\d+)\]_/.exec(k); if (m) mx = Math.max(mx, +m[1]); } num = mx + 1; }
    num = +num; if (!num) return null; if (props['NI_Scaling_Status'] === 'scaled') return null;
    const sc = [];
    for (let i = 0; i < num; i++) {
      const pre = 'NI_Scale[' + i + ']_', ty = props[pre + 'Scale_Type'], src = n => props[pre + n + '_Input_Source'] != null ? +props[pre + n + '_Input_Source'] : RAW;
      if (ty == null) sc.push({k: 'daq', id: i});
      else if (ty === 'Polynomial') { const n = props[pre + 'Polynomial_Coefficients_Size'] != null ? +props[pre + 'Polynomial_Coefficients_Size'] : 4, co = []; for (let j = 0; j < n; j++) co.push(+props[pre + 'Polynomial_Coefficients[' + j + ']']); sc.push({k: 'poly', co, src: src('Polynomial')}); }
      else if (ty === 'Linear') sc.push({k: 'lin', m: +props[pre + 'Linear_Slope'], b: +props[pre + 'Linear_Y_Intercept'], src: src('Linear')});
      else if (ty === 'AdvancedAPI') sc.push({k: 'noop', src: src('AdvancedAPI')});
      else if (ty === 'Add' || ty === 'Subtract') sc.push({k: ty, l: +props[pre + ty + '_Left_Operand_Input_Source'], r: +props[pre + ty + '_Right_Operand_Input_Source']});
      else if (ty === 'Table') {
        const n = +props[pre + 'Table_Pre_Scaled_Values_Size'], xs = [], ys = []; for (let j = 0; j < n; j++) { xs.push(+props[pre + 'Table_Pre_Scaled_Values[' + j + ']']); ys.push(+props[pre + 'Table_Scaled_Values[' + j + ']']); }
        if (xs.length > 1 && xs[1] < xs[0]) { xs.reverse(); ys.reverse(); } sc.push({k: 'table', xs, ys, src: src('Table')});
      } else return {unsupported: ty};
    }
    return sc;
  }
  function applyScales(sc, w) {
    const ev = i => {
      if (i === RAW) return w.arr; const s = sc[i]; if (!s) throw new Error('ölçek ' + i + ' yok');
      if (s.k === 'daq') return (w.sc && w.sc.get(s.id)) || w.arr;
      if (s.k === 'Add' || s.k === 'Subtract') { const L = ev(s.l), R = ev(s.r), y = new Float64Array(L.length); for (let q = 0; q < y.length; q++) y[q] = s.k === 'Add' ? L[q] + R[q] : R[q] - L[q]; return y; }
      const x = ev(s.src), y = new Float64Array(x.length);
      if (s.k === 'noop') { for (let q = 0; q < y.length; q++) y[q] = x[q]; }
      else if (s.k === 'lin') { for (let q = 0; q < y.length; q++) y[q] = x[q] * s.m + s.b; }
      else if (s.k === 'poly') { const co = s.co; for (let q = 0; q < y.length; q++) { let r = 0; for (let j = co.length - 1; j >= 0; j--) r = r * x[q] + co[j]; y[q] = r; } }
      else if (s.k === 'table') { const xs = s.xs, ys = s.ys, n = xs.length; for (let q = 0; q < y.length; q++) { const v = x[q]; if (v <= xs[0]) y[q] = ys[0]; else if (v >= xs[n - 1]) y[q] = ys[n - 1]; else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m; else hi = m; } y[q] = ys[lo] + (ys[hi] - ys[lo]) * (v - xs[lo]) / (xs[hi] - xs[lo]); } } }
      return y;
    };
    return ev(sc.length - 1);
  }
  function parse(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), N = u8.length, u8d = new TextDecoder('utf-8', {fatal: true}), ansi = new TextDecoder('windows-1254'), dec = {decode: b => { try { return u8d.decode(b); } catch (e) { return ansi.decode(b); } }};
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
          else if (ri === 0x1269 || ri === 0x126A) {   // DAQmx: 0x1269 format değiştiren, 0x126A sayısal hat ölçekleyici
            const dig = ri === 0x126A; p += 8; const nv = Number(dv.getBigUint64(p, LE)); p += 8; const ns = dv.getUint32(p, LE); p += 4; const scalers = [];
            for (let k = 0; k < ns; k++) {
              const t = dv.getUint32(p, LE), buf = dv.getUint32(p + 4, LE), off = dv.getUint32(p + 8, LE), id = dv.getUint32(p + (dig ? 13 : 16), LE); p += dig ? 17 : 20;
              if (!(t in DQT)) throw new Error('DAQmx: desteklenmeyen ham veri tipi ' + t + ' (' + path + ')');
              scalers.push({t: DQT[t], buf, off: dig ? off >> 3 : off, bit: dig ? off & 7 : -1, id});
            }
            const nw = dv.getUint32(p, LE); p += 4; const widths = []; for (let k = 0; k < nw; k++) { widths.push(dv.getUint32(p, LE)); p += 4; }
            o.idx = {dt: 10, nv, tb: 0, daq: {scalers, widths}}; if (!active.includes(o)) active.push(o);
          }
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
      const nd = s.act.filter(a => a.idx.daq).length; let chunk = 0;
      if (nd && nd !== s.act.length) { warn.push('DAQmx ve normal ham veri aynı segmentte; segment atlandı'); continue; }
      if (nd) {
        const dims = s.act[0].idx.daq.widths.map(w => [0, w]); let bad = false;
        for (const a of s.act) for (const sk of a.idx.daq.scalers) { if (sk.buf >= dims.length) { bad = true; break; } dims[sk.buf][0] = Math.max(dims[sk.buf][0], a.idx.nv); }
        if (bad) { warn.push('DAQmx tampon indeksi geçersiz; segment atlandı'); continue; }
        s.daq = true; s.dims = dims; for (const [n, w] of dims) chunk += n * w;
      } else for (const a of s.act) chunk += a.idx.dt === 0x20 ? a.idx.tb : a.idx.nv * SZ[a.idx.dt];
      if (!chunk) continue; s.chunk = chunk; s.nch = Math.floor((s.end - s.at) / chunk);
      if (s.nch < (s.end - s.at) / chunk && s.end - s.at > 0 && s.nch === 0) warn.push('Kısmi veri bloğu atlandı');
      for (const a of s.act) a.o.total += a.idx.nv * s.nch;
    }
    const out = new Map();
    for (const o of order) if (o.idx || o.total) {
      const dt = o.idx && o.idx.dt; let arr;
      if (o.idx && o.idx.daq) arr = new Float64Array(o.total); else if (dt === 0x20) arr = new Array(o.total); else arr = (dt === 1 || dt === 2 || dt === 5 || dt === 6 || dt === 9 || dt === 0x19 || dt === 0x21) ? new Float32Array(o.total) : new Float64Array(o.total);
      const wr = {arr, fill: 0}; if (o.idx && o.idx.daq) { wr.sc = new Map(); o.idx.daq.scalers.forEach((k, i) => wr.sc.set(k.id, i ? new Float64Array(o.total) : arr)); } out.set(o, wr);
    }
    for (const s of segs) {
      if (!s.chunk) continue;
      for (let c = 0; c < s.nch; c++) {
        let base = s.at + c * s.chunk;
        if (s.daq) {
          for (let b = 0; b < s.dims.length; b++) {
            const [nb, wd] = s.dims[b];
            for (const a of s.act) { const w = out.get(a.o), n = a.idx.nv;
              for (const sk of a.idx.daq.scalers) { if (sk.buf !== b) continue; const dst = w.sc.get(sk.id); if (!dst) continue; const o0 = base + sk.off;
                if (sk.bit >= 0) for (let i = 0; i < n; i++) dst[w.fill + i] = (rd(dv, o0 + i * wd, sk.t, s.LE) >> sk.bit) & 1; else for (let i = 0; i < n; i++) dst[w.fill + i] = rd(dv, o0 + i * wd, sk.t, s.LE); } }
            base += nb * wd;
          }
          for (const a of s.act) out.get(a.o).fill += a.idx.nv;
          continue;
        }
        if (s.inter && s.act.every(a => a.idx.dt !== 0x20)) {
          const nv = s.act[0].idx.nv, stride = s.act.reduce((q, a) => q + SZ[a.idx.dt], 0);
          for (let i = 0; i < nv; i++) { let q = base + i * stride; for (const a of s.act) { const w = out.get(a.o); w.arr[w.fill++] = rd(dv, q, a.idx.dt, s.LE); q += SZ[a.idx.dt]; } }
        } else {
          for (const a of s.act) {
            const w = out.get(a.o), n = a.idx.nv, dt = a.idx.dt;
            if (dt === 0x20) {
              const offs = []; for (let i = 0; i < n; i++) offs.push(dv.getUint32(base + 4 * i, s.LE)); const sb = base + 4 * n;
              for (let i = 0; i < n; i++) w.arr[w.fill++] = dec.decode(u8.subarray(sb + (i ? offs[i - 1] : 0), sb + offs[i])); base += a.idx.tb;
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
    const root = {props: {}}, groups = new Map(), scaleJobs = [];
    for (const o of order) {
      const pp = parsePath(o.path);
      if (pp.length === 0) root.props = o.props;
      else if (pp.length === 1) { const g = groups.get(pp[0]) || {name: pp[0], props: {}, channels: []}; g.props = o.props; groups.set(pp[0], g); }
      else {
        const g = groups.get(pp[0]) || {name: pp[0], props: {}, channels: []}; groups.set(pp[0], g);
        const w = out.get(o), dt = o.idx && o.idx.dt;
        const rec = {name: pp[1], props: o.props, dtype: dt ? TNAME[dt] : '', n: w ? w.arr.length : 0, data: w ? w.arr : (dt === 0x20 ? [] : new Float32Array(0))};
        g.channels.push(rec); if (w && dt !== 0x20) scaleJobs.push({rec, w, g});
      }
    }
    for (const {rec, w, g} of scaleJobs) {
      const sc = [rec.props, g.props, root.props].map(getScales).find(x => x);
      if (!sc) continue;
      if (sc.unsupported) { const m = 'Ölçek türü desteklenmiyor (' + sc.unsupported + '): ' + rec.name + ' ham değerle bırakıldı'; if (!warn.includes(m)) warn.push(m); continue; }
      try { rec.data = applyScales(sc, w); rec.dtype = 'f64'; rec.scaled = true; rec.n = rec.data.length; } catch (e) { warn.push('Ölçekleme hatası (' + rec.name + '): ' + e.message); }
    }
    return {props: root.props, groups: [...groups.values()], warn};
  }
  return {parse};
})();
