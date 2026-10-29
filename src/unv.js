/* UNV (I-DEAS Universal) dataset 58 okuyucu — ASCII; kanal sayısı dosyadan okunur */
const UNV = (() => {
  const FUNC_TYPE = {0: 'Genel', 1: 'Zaman Cevabı', 2: 'Auto Spectrum', 3: 'Cross Spectrum', 4: 'Frekans Cevap Fonksiyonu (FRF)', 5: 'Transmissibility', 6: 'Coherence', 7: 'Auto Correlation', 8: 'Cross Correlation',
    9: 'Güç Spektral Yoğunluğu (PSD)', 10: 'Enerji Spektral Yoğunluğu (ESD)', 11: 'Olasılık Yoğunluk Fonksiyonu', 12: 'Spektrum', 13: 'Kümülatif Frekans Dağılımı', 14: 'Peaks Valley', 15: 'Gerilme/Çevrim', 16: 'Şekil Değiştirme/Çevrim',
    17: 'Orbit', 18: 'Mode Indicator Function', 19: 'Force Pattern', 20: 'Partial Power', 21: 'Partial Coherence', 22: 'Özdeğer', 23: 'Özvektör', 24: 'Şok Cevap Spektrumu (SRS)', 25: 'FIR Filtre', 26: 'Multiple Coherence', 27: 'Order Function'};
  const DIRECTION = {0: 'skaler', 1: '+X', 2: '+Y', 3: '+Z', '-1': '-X', '-2': '-Y', '-3': '-Z', 4: '+Rx', 5: '+Ry', 6: '+Rz', '-4': '-Rx', '-5': '-Ry', '-6': '-Rz'};
  const ORD_TYPE = {2: 'reel (single)', 4: 'reel (double)', 5: 'kompleks (single)', 6: 'kompleks (double)'};
  const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  const tf = tok => { const t = String(tok).trim().replace(/D/g, 'E').replace(/d/g, 'e'); return t && NUM.test(t) ? parseFloat(t) : null; };
  const intOr = (tok, d) => { const v = tok == null ? null : tf(tok); return v != null ? Math.trunc(v) : d; };
  function numbers(lines, width) {
    const vals = [];
    for (const ln of lines) {
      const toks = ln.replace(/[\r\n]+$/, '').trim().split(/\s+/).filter(Boolean), parsed = toks.map(tf);
      if (toks.length && parsed.every(v => v != null)) { for (const v of parsed) vals.push(v); continue; }
      const raw = ln.replace(/[\r\n]+$/, '');
      for (let i = 0; i < raw.length; i += width) { const v = tf(raw.slice(i, i + width)); if (v != null) vals.push(v); }
    }
    return vals;
  }
  function rec6(line) {
    const o = {func_type: 0, func_id: 0, version: 0, load_case: 0, resp_name: '', resp_node: 0, resp_dir: 0, ref_name: '', ref_node: 0, ref_dir: 0};
    const head = line.slice(0, 30), tail = line.slice(30), ints = head.trim().split(/\s+/).map(tf).filter(v => v != null).map(Math.trunc);
    if (ints.length >= 4) [o.func_type, o.func_id, o.version, o.load_case] = ints;
    const iv = s => { if (!/^\s*[+-]?\d+\s*$/.test(s)) throw 0; return parseInt(s); };
    try { const b1 = tail.slice(0, 25), b2 = tail.slice(25, 50); o.resp_name = b1.slice(1, 11).trim(); o.resp_node = iv(b1.slice(11, 21)); o.resp_dir = iv(b1.slice(21, 25)); o.ref_name = b2.slice(1, 11).trim(); o.ref_node = iv(b2.slice(0 + 11, 21)); o.ref_dir = iv(b2.slice(21, 25)); }
    catch (e) {
      const toks = tail.trim().split(/\s+/).filter(Boolean), nums = []; toks.forEach((t, i) => { if (/^[+-]?\d+$/.test(t)) nums.push(i); });
      if (nums.length >= 4) { const n = nums.slice(-4).map(i => parseInt(toks[i])); [o.resp_node, o.resp_dir, o.ref_node, o.ref_dir] = n; o.resp_name = toks.slice(0, nums[nums.length - 4]).join(' ').trim(); }
    }
    return o;
  }
  function axis(line) {
    const rest = line.slice(25); let label = rest.slice(1, 21).trim(), unit = rest.slice(22, 42).trim();
    if (!unit) { const t = rest.trim().split(/\s+/).filter(Boolean); if (t.length >= 2) { label = t[0]; unit = t[1]; } else if (t.length === 1) unit = t[0]; }
    if (unit.toUpperCase() === 'NONE') unit = ''; if (label.toUpperCase() === 'NONE') label = '';
    return {label, unit};
  }
  // 11 satırlık ASCII başlık (kayıtlar 1-11): lines[j..j+10]
  function head(lines, j) {
    const id = [0, 1, 2, 3, 4].map(k => (lines[j + k] || '').trim()), r6 = rec6(lines[j + 5] || ''), r7 = (lines[j + 6] || '').trim().split(/\s+/).filter(Boolean);
    const ordType = r7.length > 0 ? intOr(r7[0], 2) : 2, npts = r7.length > 1 ? intOr(r7[1], 0) : 0, spacing = r7.length > 2 ? intOr(r7[2], 1) : 1;
    const xmin = r7.length > 3 ? (tf(r7[3]) ?? 0) : 0, dx = r7.length > 4 ? (tf(r7[4]) ?? 1) : 1, zval = r7.length > 5 ? (tf(r7[5]) ?? 0) : 0;
    return {id, r6, ordType, npts, spacing, xmin, dx, zval, absc: axis(lines[j + 7] || ''), ordn: axis(lines[j + 8] || ''), ordd: axis(lines[j + 9] || '')};
  }
  function body(M, vals, source) {
    const {ordType, npts, spacing, xmin, dx} = M, cx = ordType === 5 || ordType === 6; let x = [], y = [], yim = [];
    if (spacing === 1) {
      if (cx) for (let m = 0; m + 1 < vals.length; m += 2) { y.push(vals[m]); yim.push(vals[m + 1]); } else y = Array.from(vals);
      if (npts) { y = y.slice(0, npts); yim = yim.slice(0, npts); }
      for (let m = 0; m < y.length; m++) x.push(xmin + m * dx);
    } else {
      if (cx) for (let m = 0; m + 2 < vals.length; m += 3) { x.push(vals[m]); y.push(vals[m + 1]); yim.push(vals[m + 2]); }
      else for (let m = 0; m + 1 < vals.length; m += 2) { x.push(vals[m]); y.push(vals[m + 1]); }
      if (npts) { x = x.slice(0, npts); y = y.slice(0, npts); yim = yim.slice(0, npts); }
    }
    let unit = M.ordn.unit; if (M.ordd.unit) unit = unit ? unit + '/' + M.ordd.unit : '1/' + M.ordd.unit;
    return Object.assign({source: source || '', id1: M.id[0], id2: M.id[1], id3: M.id[2], id4: M.id[3], id5: M.id[4], ord_type: ordType, is_complex: cx, npts: y.length, spacing, xmin, dx, zval: M.zval,
      x: Float64Array.from(x), y: Float64Array.from(y), y_im: Float64Array.from(yim), x_unit: M.absc.unit, y_unit: unit}, M.r6);
  }
  function parse(text, source) {
    const lines = text.split(/\r?\n/), n = lines.length, funcs = []; let i = 0, bin58 = 0;
    while (i < n) {
      if (lines[i].trim() !== '-1') { i++; continue; }
      const nx = (lines[i + 1] || '').trim();
      if (/^58b/.test(nx)) { bin58++; i++; continue; }
      if (nx !== '58') { i++; continue; }
      const j = i + 2; if (j + 10 >= n) break;
      const M = head(lines, j);
      let k = j + 11; const dl = []; while (k < n && lines[k].trim() !== '-1') dl.push(lines[k++]);
      funcs.push(body(M, numbers(dl, (M.ordType === 4 || M.ordType === 6) ? 20 : 13), source));
      i = k + 1;
    }
    funcs.bin58 = bin58; return funcs;
  }
  // Bayt düzeyinde okuyucu: ASCII 58 ve ikili 58b veri kümeleri (karışık dosyalar dahil)
  function parseBytes(u8, source) {
    const L = u8.length, td = new TextDecoder('utf-8'), funcs = []; let pos = 0; funcs.bin58 = 0; funcs.warn = [];
    const lineAt = p => { let e = p; while (e < L && u8[e] !== 10) e++; return {s: td.decode(u8.subarray(p, e)).replace(/\r$/, ''), next: e + 1}; };
    while (pos < L) {
      const a = lineAt(pos); if (a.s.trim() !== '-1') { pos = a.next; continue; }
      const b = lineAt(a.next), bt = b.s.trim();
      if (/^58b/.test(bt)) {
        const tok = bt.slice(3).trim().split(/\s+/).map(Number), bo = tok[0], fp = tok[1], nl = tok[2] || 11, nbytes = tok[3] || 0; let p = b.next; const hl = [];
        for (let k = 0; k < nl; k++) { const ln = lineAt(p); hl.push(ln.s); p = ln.next; }
        const M = head(hl, 0), sz = (M.ordType === 4 || M.ordType === 6) ? 8 : 4; funcs.bin58++;
        // bayt sayısı: başlıktaki değer; tutarsızsa (bazı yazılımlar karmaşık veride eksik yazar) kayıt 7'den beklenen
        const perPt = (M.ordType === 5 || M.ordType === 6 ? 2 : 1) + (M.spacing === 1 ? 0 : 1), expN = M.npts * perPt * sz;
        const endsOk = q => { if (q > L) return false; let r = q; while (r < L && (u8[r] === 10 || u8[r] === 13) && r - q < 2) r++; return lineAt(r).s.trim() === '-1'; };
        let nb = nbytes; if (!endsOk(p + nb) && expN && endsOk(p + expN)) { funcs.warn.push('İkili 58b: başlıktaki bayt sayısı tutarsız, kayıt 7\'den hesaplandı'); nb = expN; }
        if (p + nb > L) { funcs.warn.push('İkili 58b: veri dosyada eksik (kesilmiş dosya?)'); break; }
        if (fp !== 2) { funcs.warn.push('İkili 58b: IEEE dışı kayan nokta biçimi (' + fp + ') desteklenmiyor'); pos = p + nb; continue; }
        const cnt = Math.floor(nb / sz), dv = new DataView(u8.buffer, u8.byteOffset + p, cnt * sz), le = bo === 1, vals = new Float64Array(cnt);
        if (sz === 8) for (let q = 0; q < cnt; q++) vals[q] = dv.getFloat64(q * 8, le); else for (let q = 0; q < cnt; q++) vals[q] = dv.getFloat32(q * 4, le);
        funcs.push(body(M, vals, source)); pos = p + nb; continue;
      }
      if (bt === '58') {
        let p = b.next; for (;;) { if (p >= L) break; const ln = lineAt(p); if (ln.s.trim() === '-1') break; p = ln.next; }
        const chunk = td.decode(u8.subarray(pos, p)) + '\n    -1\n'; for (const f of parse(chunk, source)) funcs.push(f); pos = p; continue;
      }
      pos = a.next;
    }
    return funcs;
  }
  const chanName = (f, idx) => { const base = f.id1 || `${f.resp_name} N${f.resp_node} ${DIRECTION[f.resp_dir] ?? ''}`; return (String(idx).padStart(2, '0') + ' | ' + (base.trim() || 'Kanal')).slice(0, 110); };
  const isPsd = f => !f.is_complex && [2, 9, 10].includes(f.func_type) && f.spacing === 1;
  const grms = f => isPsd(f) ? Math.sqrt(f.y.reduce((a, b) => a + b, 0) * f.dx) : null;
  return {FUNC_TYPE, DIRECTION, ORD_TYPE, parse, parseBytes, chanName, isPsd, grms};
})();
if (typeof module !== 'undefined') module.exports = UNV;
