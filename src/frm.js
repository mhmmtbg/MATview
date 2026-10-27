/* ===== Telemetre çerçevesi: alt sistem başına bir sayfa içeren Excel tanımı → 12.500 baytlık kare çözücü ===== */
const FRM = (() => {
  const TY = {uint8: [1, 'getUint8'], int8: [1, 'getInt8'], uint16: [2, 'getUint16'], int16: [2, 'getInt16'], uint32: [4, 'getUint32'], int32: [4, 'getInt32'],
    float32: [4, 'getFloat32'], single: [4, 'getFloat32'], float: [4, 'getFloat32'], double: [8, 'getFloat64'], float64: [8, 'getFloat64'],
    uint24: [3, 'u24'], int24: [3, 's24'], uint12: [1.5, 'u12'], int12: [1.5, 's12']};
  const MAXSEP = 8;   // Eleman sayısı bu değere kadar ise ayrı kanallar (ad_1…ad_E), daha büyükse tek dalga kanalı
  const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
  const HC = {birim: 'unit', index: 'index', degisken: 'name', tip: 'type', elemansayisi: 'elems', formul: 'formula', byteendian: 'endian', bitendian: 'bitend', ornek: 'samples', ornoksayisi: 'samples', orneksayisi: 'samples', undersampleheader: 'hdr', isundersample: 'isu'};
  const num = v => { if (typeof v === 'number') return v; if (v == null) return NaN; const s = String(v).trim().replace(',', '.'); return s === '' ? NaN : Number(s); };
  const str = v => v == null ? '' : String(v).trim();

  /* ---- güvenli ifade derleyici (formül ve indeks ifadeleri) ---- */
  const FN = {sqrt: 'Math.sqrt', abs: 'Math.abs', log: 'Math.log', ln: 'Math.log', log10: 'Math.log10', log2: 'Math.log2', exp: 'Math.exp', sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', atan: 'Math.atan', pow: 'Math.pow', min: 'Math.min', max: 'Math.max', floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round'};
  function matchParen(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (!d) return k; } } return -1; }
  // Dönüş: {fn(x, sel, i), ids:[seçici adlar], cond:bool}  — if(koşul) ifade → koşul sağlanmazsa NaN
  function compile(src, vars) {
    let s = String(src ?? '').trim(), cond = null;
    const m = /^if\s*\(/i.exec(s);
    if (m) { const o = m[0].length - 1, c = matchParen(s, o); if (c < 0) throw new Error('if( ) parantezi kapanmıyor'); cond = s.slice(o + 1, c).trim(); s = s.slice(c + 1).trim(); if (!cond) throw new Error('if( ) koşulu boş'); if (!s) throw new Error('if( ) sonrası ifade yok'); }
    const ids = [];
    const rw = e => {
      e = e.replace(/\^/g, '**').replace(/(?<![=!<>])=(?!=)/g, '==');
      return e.replace(/0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|\S/g, t => {
        if (/^(0x|\d|\.\d)/.test(t)) return t;
        if (/^[A-Za-z_]/.test(t)) {
          if (t === 'x' || t === 'X') return 'x'; if (vars && vars.includes(t)) return t; const f = FN[t.toLowerCase()]; if (f) return f;
          if (t.toLowerCase() === 'pi') return 'Math.PI'; let k = ids.indexOf(t); if (k < 0) { ids.push(t); k = ids.length - 1; } return 's[' + k + ']';
        }
        if (!/[-+*\/%()<>=!&|?:,.\s]/.test(t)) throw new Error('Geçersiz karakter: ' + t); return t;
      });
    };
    const body = rw(s), cj = cond != null ? rw(cond) : null;
    let fn; try { fn = new Function('x', 's', 'i', 'return ' + (cj != null ? '(' + cj + ') ? (' + body + ') : NaN' : '(' + body + ')') + ';'); }
    catch (e) { throw new Error('Formül çözümlenemedi: ' + String(src).trim()); }
    return {fn, ids, cond: cond != null};
  }

  /* ---- Excel → tanım ---- */
  function parseHex(h) {
    let s = str(h).replace(/0x/gi, '').replace(/[\s,_-]/g, ''); if (!s) return null;
    if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2) throw new Error('Başlık onaltılık (hex) değil: ' + h);
    const o = []; for (let i = 0; i < s.length; i += 2) o.push(parseInt(s.slice(i, i + 2), 16)); return o;
  }
  function isFrameBook(sheets) {
    return (sheets || []).some(sh => { const hd = (sh.rows && sh.rows[0]) || []; const f = hd.map(fold); return f.includes('index') && f.includes('degisken') && f.includes('tip'); });
  }
  function parse(sheets, opt) {
    opt = opt || {}; const L = opt.frameBytes || 12500, warns = [], def = {ver: 1, frameBytes: L, sheets: [], warns};
    const W = (lvl, sheet, row, msg) => warns.push({lvl, sheet, row, msg});
    for (const sh of sheets) {
      const rows = sh.rows || [], hd = (rows[0] || []).map(fold), col = {};
      hd.forEach((h, i) => { const k = HC[h] || (h.startsWith('ornek') ? 'samples' : null); if (k && !(k in col)) col[k] = i; });
      if (!('index' in col) || !('name' in col) || !('type' in col)) { if (rows.some(r => (r || []).some(v => v != null && v !== ''))) W('warn', sh.name, 0, 'Sayfa atlandı: başlık satırında Index / Değişken / Tip sütunları yok'); continue; }
      const S = {name: String(sh.name).trim(), vars: [], streams: []}, g = (r, k) => k in col ? r[col[k]] : null;
      let ptr = 0, cur = null, unknown = false, amp = null;
      for (let ri = 1; ri < rows.length; ri++) {
        const r = rows[ri] || [], rn = ri + 1;
        const nm = str(g(r, 'name')), ty = str(g(r, 'type')).toLowerCase(), ix = g(r, 'index'), ixs = str(ix);
        if (!nm && !ty && !ixs) continue;   // boş satır
        if (!ty) { W('warn', S.name, rn, `"${nm}" atlandı: tip boş`); continue; }
        const isu = (() => { const v = str(g(r, 'isu')).toLowerCase(); return v === '1' || v === 'true' || v === 'evet' || v === 'yes' ? 1 : (v === '0' || v === 'false' || v === 'hayir' || v === 'hayır' || v === 'no' ? 0 : null); })();
        const Eraw = num(g(r, 'elems')), E = Eraw >= 1 ? Math.floor(Eraw) : 1;
        if (ty === 'stream') {
          let hdr = null; try { hdr = parseHex(g(r, 'hdr')); } catch (e) { W('err', S.name, rn, e.message); }
          if (!hdr) W('err', S.name, rn, 'stream satırında Undersample Header yok/geçersiz; bu bloktaki değişkenler okunamaz');
          let st = Number.isFinite(num(ix)) ? num(ix) - 1 : ptr;
          if (!(st >= 0 && st < L)) { W('err', S.name, rn, `stream başlangıcı çerçeve dışında: ${ixs}`); hdr = null; st = 0; }
          cur = {sheet: S.name, name: nm || 'stream', row: rn, start: st, win: Eraw >= 1 ? Eraw : (hdr ? hdr.length : 0), hdr, k: S.streams.length};
          if (cur.start + cur.win > L) W('warn', S.name, rn, `stream penceresi çerçeve sonunu aşıyor (${cur.start + 1}+${cur.win})`);
          S.streams.push(cur); ptr = hdr ? hdr.length : 0; unknown = false; continue;
        }
        if (cur && isu === 0) { cur = null; ptr = 0; }
        const tt = TY[ty];
        if (!tt) { W('err', S.name, rn, `"${nm}" okunamaz: bilinmeyen tip "${str(g(r, 'type'))}"`); unknown = true; continue; }
        const sm = str(g(r, 'samples')); let n = 1;
        if (sm) { const mb = /^b\s*(\d+)$/i.exec(sm); n = mb ? +mb[1] : Math.floor(num(sm)); if (!(n >= 1)) { W('warn', S.name, rn, `"${nm}": Örnek Sayısı "${sm}" anlaşılamadı, 1 alındı`); n = 1; } }
        const be = /^b/i.test(str(g(r, 'endian'))) || /^(msb|motorola|buyuk|büyük)/i.test(str(g(r, 'endian')));
        const v = {sheet: S.name, unit: str(g(r, 'unit')), row: rn, name: nm || `satir${rn}`, type: ty === 'single' || ty === 'float' ? 'float32' : (ty === 'float64' ? 'double' : ty), E, n, be, formula: str(g(r, 'formula')), stream: cur ? cur.k : -1, rel: !!cur};
        if (g(r, 'bitend') != null && str(g(r, 'bitend'))) v.bitend = str(g(r, 'bitend'));
        const mi = /^\s*([A-Za-z_]\w*)\s*=\s*(-?\d+)\s*:\s*(-?\d+)\s*,\s*(.+)$/.exec(ixs);
        const isU = ty.endsWith('12');
        try {
          if (mi) {   // i=1:35, ifade → aynı değişkenin kare içinde birden çok konumu
            if (isU) throw new Error('uint12 için konum formülü desteklenmez');
            const a = +mi[2], b = +mi[3], c = compile(mi[4], [mi[1]]); if (c.ids.length) throw new Error('indeks formülünde bilinmeyen ad: ' + c.ids[0]);
            const offs = []; for (let q = a; q <= b; q++) { const o = c.fn(0, [], q) - 1; if (!Number.isFinite(o)) throw new Error('indeks formülü sayı üretmedi'); offs.push(o); }
            if (!offs.length) throw new Error('indeks aralığı boş'); v.offs = offs; v.n = offs.length; v.base = offs[0];
            ptr = offs[offs.length - 1] + Math.ceil(E * tt[0]);
          } else {
            let base; if (!ixs || /^auto$/i.test(ixs)) base = ptr; else { const k = num(ix); if (!Number.isFinite(k)) throw new Error(`Index anlaşılamadı: "${ixs}"`); base = k - 1; }
            if (base < 0) throw new Error('Index 1\'den küçük'); if (unknown && (!ixs || /^auto$/i.test(ixs))) W('warn', S.name, rn, `"${nm}": önceki okunamayan satır yüzünden konum kaymış olabilir`);
            v.base = base; ptr = base + Math.ceil(v.n * E * tt[0]);
          }
        } catch (e) { W('err', S.name, rn, `"${nm}" okunamaz: ${e.message}`); unknown = true; continue; }
        v.bytes = v.offs ? v.n * Math.ceil(E * tt[0]) : Math.ceil(v.n * E * tt[0]);
        if (v.formula) { try { const c = compile(v.formula); if (/&/.test(v.formula) && /&[^()]*[-+]/.test(v.formula.replace(/\([^()]*\)/g, ''))) (amp = amp || []).push(v.name); } catch (e) { W('err', S.name, rn, `"${v.name}": ${e.message} — ham değer okunacak`); v.formulaErr = e.message; } }
        // çerçeve sınırı (akış içi değişkenler paket başına göredir; en yüksek konum sınırı yalnız mutlak için denetlenir)
        if (!v.rel) { const end = (v.offs ? Math.max(...v.offs) + Math.ceil(E * tt[0]) : v.base + v.bytes); if (v.base + 0 >= L || end > L) { W('err', S.name, rn, `"${v.name}" çerçeve dışına taşıyor (bayt ${v.base + 1}–${end}, çerçeve ${L})`); continue; } }
        else { const st = cur; const end = st.start + (v.offs ? Math.max(...v.offs) + Math.ceil(E * tt[0]) : v.base + v.bytes); if (end > L) { W('err', S.name, rn, `"${v.name}" (akış paketi içinde) çerçeve dışına taşıyor`); continue; } }
        S.vars.push(v);
      }
      if (amp) W('warn', S.name, 0, `Formülde & ile +/- parantezsiz birlikte (${amp.length} değişken: ${amp.slice(0, 3).join(', ')}${amp.length > 3 ? ' …' : ''}); C dilindeki gibi önce +/- işlenir, sonuç beklenenden farklı olabilir`);
      if (S.vars.length || S.streams.length) def.sheets.push(S); else W('warn', S.name, 0, 'Sayfada okunabilir değişken yok');
    }
    if (!def.sheets.length) throw new Error('Excel dosyasında çerçeve tanımı (Birim/Index/Değişken/Tip sütunlu sayfa) bulunamadı');
    def.coverage = coverage(def, W); return def;
  }
  /* ---- kapsama: çakışma ve tanımsız (boşluk) baytlar ---- */
  function varSpans(v, base0) {   // [[a, b)) bayt aralıkları (çerçeve içinde mutlak)
    const sz = Math.ceil(v.E * TY[v.type][0]);
    if (v.offs) return v.offs.map(o => [base0 + o, base0 + o + sz]);
    return [[base0 + v.base, base0 + v.base + v.bytes]];
  }
  function coverage(def, W) {
    const L = def.frameBytes, own = new Int16Array(L).fill(-1), names = []; let overl = 0;
    const ovl = new Map();
    def.sheets.forEach((S, si) => {
      names.push(S.name);
      for (const st of S.streams) for (let b = st.start; b < Math.min(L, st.start + st.win); b++) { if (own[b] >= 0 && own[b] !== si) { const k = names[own[b]] + '|' + S.name; const o = ovl.get(k) || {a: names[own[b]], b: S.name, lo: b, hi: b}; o.hi = b; ovl.set(k, o); overl++; } own[b] = si; }
      for (const v of S.vars) { if (v.rel) continue; for (const [a, b] of varSpans(v, 0)) for (let q = a; q < Math.min(L, b); q++) { if (own[q] >= 0 && own[q] !== si) { const k = names[own[q]] + '|' + S.name; const o = ovl.get(k) || {a: names[own[q]], b: S.name, lo: q, hi: q}; o.hi = q; o.lo = Math.min(o.lo, q); ovl.set(k, o); overl++; } own[q] = si; } }
    });
    for (const o of ovl.values()) W('warn', o.a + '/' + o.b, 0, `Çakışma: "${o.a}" ve "${o.b}" sayfaları aynı baytları tanımlıyor (bayt ${o.lo + 1}–${o.hi + 1}); sonraki sayfa üstüne yazar`);
    const gaps = []; let a = -1; for (let i = 0; i <= L; i++) { const free = i < L && own[i] < 0; if (free && a < 0) a = i; else if (!free && a >= 0) { gaps.push([a + 1, i]); a = -1; } }
    const undef = gaps.reduce((s, g) => s + g[1] - g[0] + 1, 0), cov = L - undef;
    if (gaps.length) W('warn', '(çerçeve)', 0, `Tanımsız bayt aralıkları (${gaps.length} adet, toplam ${undef} bayt = %${(100 * undef / L).toFixed(1)}): ` + gaps.slice(0, 12).map(g => g[0] === g[1] ? g[0] : g[0] + '–' + g[1]).join(', ') + (gaps.length > 12 ? ' …' : '') + ' — çözülmeyecek');
    return {covered: cov, undef, gaps, overlapBytes: overl};
  }

  /* ---- kanal planı ---- */
  // plan: [{sheet, name(görünen ad), v (değişken), e (eleman indeksi|-1), spp}]
  function plan(def) {
    const out = [], seen = new Map();
    for (const S of def.sheets) for (const v of S.vars) {
      const base = v.name, sep = v.E > 1 && v.E <= MAXSEP;
      for (let e = 0; e < (sep ? v.E : 1); e++) {
        let nm = sep ? `${base}_${e + 1}` : base; const key = S.name + '/' + nm; const k = (seen.get(key) || 0) + 1; seen.set(key, k); if (k > 1) nm += '_r' + v.row;
        out.push({sheet: S.name, name: nm, v, e: sep ? e : -1, spp: v.n * (!sep && v.E > 1 ? v.E : 1), unit: ''});
      }
    }
    return out;
  }
  function getElem(dv, u8, p, t, be) {
    switch (t) {
      case 'u24': return be ? (u8[p] << 16 | u8[p + 1] << 8 | u8[p + 2]) : (u8[p + 2] << 16 | u8[p + 1] << 8 | u8[p]);
      case 's24': { const x = be ? (u8[p] << 16 | u8[p + 1] << 8 | u8[p + 2]) : (u8[p + 2] << 16 | u8[p + 1] << 8 | u8[p]); return x & 0x800000 ? x - 0x1000000 : x; }
      case 'getUint8': case 'getInt8': return dv[t](p);
      default: return dv[t](p, !be);
    }
  }
  function u12At(u8, p, m, signed) {   // m. 12-bit eleman; 3 bayt = 2 değer
    const q = p + 3 * (m >> 1), b0 = u8[q], b1 = u8[q + 1], b2 = u8[q + 2]; let x = (m & 1) ? ((b1 & 0x0F) | (b2 << 4)) : (b0 | ((b1 & 0xF0) << 4));
    return signed && x & 0x800 ? x - 4096 : x;
  }
  // Akış başlıklarının kare içi konumları: Int32Array(nf), -1 = başlık yok
  function streamPos(u8, off0, nf, L, st) {
    const out = new Int32Array(nf).fill(-1); if (!st.hdr || !st.hdr.length) return out; const h = st.hdr, hl = h.length;
    for (let k = 0; k < nf; k++) {
      const a = off0 + k * L + st.start, last = Math.min(st.win, L - st.start) - hl;
      for (let o = 0; o <= last; o++) { let ok = true; for (let j = 0; j < hl; j++) if (u8[a + o + j] !== h[j]) { ok = false; break; } if (ok) { out[k] = o; break; } }
    }
    return out;
  }
  // Ham değer çıkarımı: u8 içinde kare k = off0 + k*L. Dönüş {v: Float64Array(nf*spp), ok: Uint8Array|null}
  function extractBlock(u8, off0, nf, L, def, ch, sp) {
    const v = ch.v, tt = TY[v.type], t = tt[1], sz = tt[0], spp = ch.spp, out = new Float64Array(nf * spp);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), be = v.be, signed = t === 's12';
    let ok = null, hp = null, sbase = 0;
    if (v.stream >= 0) { const st = def.sheets.find(s => s.name === v.sheet).streams[v.stream]; if (!st.hdr) { ok = new Uint8Array(nf * spp); out.fill(NaN); return {v: out, ok}; }
      hp = (sp && sp.has(st)) ? sp.get(st) : streamPos(u8, off0, nf, L, st); if (sp && !sp.has(st)) sp.set(st, hp); sbase = st.start; ok = new Uint8Array(nf * spp); }
    const E = v.E, elemSep = ch.e >= 0, nEl = elemSep ? 1 : E;
    for (let k = 0; k < nf; k++) {
      let fb = off0 + k * L, rb = 0;
      if (hp) { if (hp[k] < 0) { for (let j = 0; j < spp; j++) out[k * spp + j] = NaN; continue; } rb = sbase + hp[k]; } else rb = 0;
      const O = fb + rb;
      for (let j = 0; j < v.n; j++) for (let q = 0; q < nEl; q++) {
        const e = elemSep ? ch.e : q; let val;
        if (t === 'u12' || t === 's12') { const m = j * E + e; val = u12At(u8, O + v.base, m, signed); }
        else { const p = O + (v.offs ? v.offs[j] : v.base + j * E * sz) + e * sz; val = (p + sz > u8.length) ? NaN : getElem(dv, u8, p, t, be); }
        out[k * spp + (elemSep ? j : j * nEl + q)] = val; if (ok) ok[k * spp + (elemSep ? j : j * nEl + q)] = 1;
      }
    }
    return {v: out, ok};
  }
  // Formülü uygula; sel: ad → {v: Float64Array, spp}
  function applyFormula(ch, raw, ok, nf, selGet) {
    const v = ch.v; if (!v.formula || v.formulaErr) return {v: raw, ok};
    const c = compile(v.formula), sel = c.ids.map(id => { const s = selGet(id); if (!s) throw new Error(`formüldeki "${id}" değişkeni bulunamadı`); return s; });
    const spp = ch.spp, n = raw.length, out = new Float64Array(n), s = new Array(sel.length); let ok2 = c.cond ? (ok ? Uint8Array.from(ok) : new Uint8Array(n).fill(1)) : ok;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(i / spp), j = i % spp;
      for (let q = 0; q < sel.length; q++) { const o = sel[q], jj = Math.min(j, o.spp - 1); s[q] = o.v[k * o.spp + jj]; }
      const r = c.fn(raw[i], s, 0); if (c.cond && Number.isNaN(r)) { ok2[i] = 0; out[i] = NaN; } else out[i] = r;
    }
    return {v: out, ok: ok2};
  }
  // Geçersiz örnekleri at: {v, g(örnek indisleri|null)}
  function compact(r) {
    if (!r.ok) return {v: r.v, g: null}; let bad = 0; for (let i = 0; i < r.ok.length; i++) if (!r.ok[i]) bad++;
    if (!bad) return {v: r.v, g: null}; const m = r.v.length - bad, v = new Float64Array(m), g = new Float64Array(m); let p = 0;
    for (let i = 0; i < r.v.length; i++) if (r.ok[i]) { v[p] = r.v[i]; g[p++] = i; } return {v, g};
  }
  // Boyut/kare sayısı ve kısa rapor (uyarı listesi) üretir
  function frameInfo(size, L, skip) { const body = Math.max(0, size - (skip | 0)); return {frames: Math.floor(body / L), rest: body % L}; }
  return {TY, compile, parse, isFrameBook, coverage, plan, extractBlock, applyFormula, compact, streamPos, frameInfo, fold, MAXSEP, varSpans};
})();
if (typeof module !== 'undefined') module.exports = FRM;
