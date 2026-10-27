/* ===== Telemetre çerçevesi: alt sistem başına bir sayfa içeren Excel tanımı → 12.500 baytlık kare çözücü =====
   Anlamlar telemetryParser ile aynıdır: B(n) blok örnekleme (blok n kez tekrarlanır), intN/bitN bit akışı, byte.bit index,
   stream = her karedeki yuva baytları art arda eklenip header aranır (paket birkaç kareye yayılabilir), tekrar index'i ayrı değişken. */
const FRM = (() => {
  const MAXSEP = 8;   // Eleman sayısı bu değere kadar ayrı kanallar (ad_1…ad_N), daha büyükse tek dalga kanalı
  const NUMB = 53;
  const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
  const HC = {birim: 'unit', index: 'index', degisken: 'name', tip: 'type', elemansayisi: 'elems', formul: 'formula', byteendian: 'endian', bitendian: 'bitend', undersampleheader: 'hdr', isundersample: 'isu'};
  const num = v => { if (typeof v === 'number') return v; if (v == null) return NaN; const s = String(v).trim().replace(',', '.'); return s === '' ? NaN : Number(s); };
  const str = v => v == null ? '' : (typeof v === 'number' ? String(v) : String(v).trim());

  /* ---- ifade derleyici (formül ve indeks ifadeleri) ---- */
  const FN = {sqrt: 'Math.sqrt', abs: 'Math.abs', log: 'Math.log', ln: 'Math.log', log10: 'Math.log10', log2: 'Math.log2', exp: 'Math.exp', sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan', atan2: 'Math.atan2', pow: 'Math.pow', min: 'Math.min', max: 'Math.max', floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round', trunc: 'Math.trunc', sign: 'Math.sign', hypot: 'Math.hypot'};
  function matchParen(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (!d) return k; } } return -1; }
  // Dönüş: {fn(x, sel, i), ids:[seçici adlar], cond:bool}  — if(koşul) ifade → koşul sağlanmazsa NaN
  function compile(src, vars) {
    let s = String(src ?? '').trim(), cond = null;
    const m = /^if\s*\(/i.exec(s);
    if (m) { const o = m[0].length - 1, c = matchParen(s, o); if (c < 0) throw new Error('if( ) parantezi kapanmıyor'); cond = s.slice(o + 1, c).trim(); s = s.slice(c + 1).trim() || 'x'; if (!cond) throw new Error('if( ) koşulu boş'); }
    const ids = [];
    const rw = e => {
      e = e.replace(/\^/g, '**').replace(/(?<![=!<>])=(?!=)/g, '==');
      return e.replace(/0[xX][0-9a-fA-F]+|0[bB][01]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_À-ɏ][A-Za-z_0-9À-ɏ]*(?:\.[A-Za-z_À-ɏ][A-Za-z_0-9À-ɏ]*)?(?:\s*\[\s*\d+\s*\])?|\S/g, t => {
        if (/^(0[xXbB]|\d|\.\d)/.test(t)) return t;
        if (/^[A-Za-z_À-ɏ]/.test(t)) {
          t = t.replace(/\s+/g, ''); if (t === 'x' || t === 'X') return 'x'; if (vars && vars.includes(t)) return 'i'; const f = FN[t.toLowerCase()]; if (f) return f;
          if (t.toLowerCase() === 'pi') return 'Math.PI'; if (t.toLowerCase() === 'e' ) return 'Math.E'; let k = ids.indexOf(t); if (k < 0) { ids.push(t); k = ids.length - 1; } return 's[' + k + ']';
        }
        if (!/[-+*\/%()<>=!&|?:,.~\s]/.test(t)) throw new Error('Geçersiz karakter: ' + t); return t === '~' ? '~' : t;
      });
    };
    const body = rw(s), cj = cond != null ? rw(cond) : null;
    let fn; try { fn = new Function('x', 's', 'i', 'return ' + (cj != null ? '(' + cj + ') ? (' + body + ') : NaN' : '(' + body + ')') + ';'); }
    catch (e) { throw new Error('Formül çözümlenemedi: ' + String(src).trim()); }
    return {fn, ids, cond: cond != null};
  }

  /* ---- tip / index çözümleme ---- */
  function parseType(raw) {
    const s = String(raw ?? '').trim().toLowerCase().replace(/[\s_\-]+/g, ''); if (!s) return null;
    if (s === 'stream') return {kind: 'stream', bits: 8};
    if (/^(bytearray|bytes|byte\[\]|uint8array)$/.test(s)) return {kind: 'bytes', bits: 8};
    if (/^(single|float|float32|real32)$/.test(s)) return {kind: 'float', bits: 32};
    if (/^(double|float64|real64)$/.test(s)) return {kind: 'float', bits: 64};
    if (s === 'byte') return {kind: 'int', signed: false, bits: 8};
    if (/^(bit|bool|boolean)$/.test(s)) return {kind: 'bit', signed: false, bits: 1};
    let m = /^(u?)int(\d+)$/.exec(s); if (m) { const b = +m[2]; if (b < 1 || b > 64) return null; return {kind: 'int', signed: m[1] !== 'u', bits: b}; }
    m = /^bit(\d+)$/.exec(s); if (m) { const b = +m[1]; if (b < 1 || b > 64) return null; return {kind: 'bit', signed: false, bits: b}; }
    return null;
  }
  function parseHex(h) {
    let s = str(h).replace(/0x/gi, '').replace(/[\s,_-]/g, ''); if (!s) return null;
    if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2) throw new Error('Başlık onaltılık (hex) değil: ' + h);
    const o = []; for (let i = 0; i < s.length; i += 2) o.push(parseInt(s.slice(i, i + 2), 16)); return o;
  }
  // idx: metin. Dönüş {auto}|{byte,bit}|{rep:{v,vals,expr}}|{error}
  function parseIndex(s) {
    if (!s || /^(auto|otomatik)$/i.test(s)) return {auto: true, blank: !s};
    if (/^0x[0-9a-f]+$/i.test(s)) return {byte: parseInt(s.slice(2), 16), bit: 0};
    if (/^\d+$/.test(s)) return {byte: parseInt(s, 10), bit: 0};
    if (/^\d+[.,]\d+$/.test(s)) { const p = s.split(/[.,]/), byte = parseInt(p[0], 10), bit = p[1].length === 1 ? +p[1] : Math.round((Number(s.replace(',', '.')) - byte) * 10); if (bit > 7) return {error: 'Bit numarası 0-7 olmalı (' + s + ')'}; return {byte, bit}; }
    const m = /^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(s); if (!m) return {error: `Geçersiz index "${s}" (auto, 100, 100.5 veya i=1:35, 100+i*5 olmalı)`};
    const rest = m[2]; let depth = 0, cut = -1;
    for (let j = 0; j < rest.length; j++) { const ch = rest[j]; if (ch === '[' || ch === '(') depth++; else if (ch === ']' || ch === ')') depth--; else if ((ch === ',' || ch === ';') && !depth) { cut = j; break; } }
    if (cut < 0) return {error: 'Tekrar index\'inde ifade eksik (örn. i=1:35, 100+i*5)'};
    const rs = rest.slice(0, cut).trim(), es = rest.slice(cut + 1).trim(), vals = []; let lm;
    if (!es) return {error: 'Tekrar index\'inde ifade eksik'};
    if ((lm = /^\[([\s\S]*)\]$/.exec(rs))) { const it = lm[1].trim() ? lm[1].trim().split(/[\s,;]+/) : []; for (const t of it) { const x = Number(t); if (!Number.isFinite(x)) return {error: `Tekrar listesinde geçersiz değer "${t}"`}; vals.push(x); } }
    else {
      const p = rs.split(':').map(t => t.trim()); if (p.length < 2 || p.length > 3 || p.some(t => !t || !Number.isFinite(Number(t)))) return {error: `Geçersiz tekrar aralığı "${rs}" (1:35, 0:2:20 veya [1 3 5])`};
      const a = Number(p[0]), st = p.length === 3 ? Number(p[1]) : 1, b = Number(p[p.length - 1]); if (st === 0) return {error: 'Tekrar adımı 0 olamaz'};
      const cnt = Math.floor((b - a) / st + 1e-9) + 1; if (cnt > 100000) return {error: 'Tekrar sayısı çok büyük'}; for (let c = 0; c < cnt; c++) vals.push(+(a + c * st).toPrecision(12));
    }
    if (!vals.length) return {error: 'Tekrar aralığı boş'};
    let c; try { c = compile(es, [m[1]]); if (c.ids.length) throw new Error('bilinmeyen ad: ' + c.ids[0]); } catch (e) { return {error: `Tekrar ifadesi hatalı "${es}": ${e.message}`}; }
    const at = []; for (const v of vals) { let r = c.fn(0, [], v); if (typeof r !== 'number' || !Number.isFinite(r) || r < 0) return {error: `Tekrar ifadesi ${m[1]}=${v} için geçerli sayı vermedi`}; r = +r.toPrecision(12); const byte = Math.floor(r), bit = Math.round((r - byte) * 10); if (bit > 7) return {error: `${m[1]}=${v} için index ${r} geçersiz`}; at.push({val: v, byte, bit}); }
    return {rep: {v: m[1], at}};
  }
  function isFrameBook(sheets) { return (sheets || []).some(sh => { const f = ((sh.rows && sh.rows[0]) || []).map(fold); return f.includes('index') && f.includes('degisken') && f.includes('tip'); }); }

  /* ---- Excel → tanım ---- */
  function parse(sheets, opt) {
    opt = opt || {}; const L = opt.frameBytes || 12500, base = opt.indexBase === 0 ? 0 : 1, blockMode = opt.blockMode === 'var' ? 'var' : 'block';
    const warns = [], def = {ver: 2, frameBytes: L, indexBase: base, blockMode, sheets: [], warns};
    const W = (lvl, sheet, row, msg) => warns.push({lvl, sheet, row, msg});
    for (const sh of sheets) {
      const rows = sh.rows || [], hd = (rows[0] || []).map(fold), col = {};
      hd.forEach((h, i) => { const k = HC[h] || (h.startsWith('ornek') ? 'samples' : null); if (k && !(k in col)) col[k] = i; });
      if (!('index' in col) || !('name' in col) || !('type' in col)) { if (rows.some(r => (r || []).some(v => v != null && v !== ''))) W('warn', String(sh.name).trim(), 0, 'Sayfa atlandı: başlık satırında Index / Değişken / Tip sütunları yok'); continue; }
      const SN = String(sh.name).trim(), g = (r, k) => k in col ? r[col[k]] : null, defs = [];
      /* 1. geçiş: satırlar */
      for (let ri = 1; ri < rows.length; ri++) {
        const r = rows[ri] || [], rn = ri + 1, nm = str(g(r, 'name')), tys = str(g(r, 'type')), ixs = str(g(r, 'index'));
        if (!nm && !tys && !ixs) continue;
        const d = {sheet: SN, row: rn, unit: str(g(r, 'unit')) || SN, name: nm, bad: false};
        const E_ = (m) => W('err', SN, rn, `${nm ? '"' + nm + '" ' : ''}${m}`);
        if (!tys) { W('warn', SN, rn, `"${nm}" atlandı: tip boş`); continue; }
        d.type = parseType(tys); if (!d.type) { E_(`okunamaz: geçersiz veri tipi "${tys}"`); continue; }
        d.isSlot = d.type.kind === 'stream'; if (!d.name) { if (d.isSlot) d.name = 'stream'; else { E_('değişken adı boş'); continue; } }
        const es = str(g(r, 'elems')); d.E = 1; if (es) { if (/^\d+(\.0+)?$/.test(es) && +es >= 1) d.E = Math.floor(+es); else { E_(`geçersiz eleman sayısı "${es}"`); continue; } }
        const ix = parseIndex(ixs); if (ix.error) { E_(ix.error); continue; } d.idx = ix; if (ix.blank) W('info', SN, rn, `"${d.name}": Index boş, auto kabul edildi`);
        const be = str(g(r, 'endian')).toLowerCase(); d.le = !/^(big|be|msb|b)/.test(be); const bt = str(g(r, 'bitend')).toLowerCase(); d.msb = !/^(lsb|little|le)/.test(bt);
        const sm = str(g(r, 'samples')); d.sMode = 'var'; d.n = 1;
        if (sm) { let q; if ((q = /^(\d+)(\.0+)?$/.exec(sm)) && +q[1] >= 1) d.n = +q[1]; else if ((q = /^[bB]\s*(\d+)$/.exec(sm)) && +q[1] >= 1) { d.n = +q[1]; d.sMode = blockMode === 'block' ? 'block' : 'var'; } else { E_(`geçersiz örnek sayısı "${sm}" (örn. 60 veya B2)`); continue; } }
        const us = str(g(r, 'isu')).toLowerCase(); d.isUS = /^(1|true|evet|yes)$/.test(us); if (us && !/^(0|1|true|false|evet|hayir|hayır|yes|no)$/.test(us)) { E_(`geçersiz isUndersample "${us}"`); continue; }
        d.formula = str(g(r, 'formula'));
        if (d.isSlot) {
          if (!d.isUS) d.isUS = true; let hdr = null; try { hdr = parseHex(g(r, 'hdr')); } catch (e) { E_(e.message); continue; } if (!hdr) { E_('stream satırında Undersample Header yok; bu birimin akış değişkenleri okunamaz'); d.hdr = null; } else d.hdr = hdr;
          if (d.n !== 1) { E_('stream satırında örnek sayısı kullanılamaz'); continue; } d.formula = '';
          if (d.idx.rep) { E_('stream satırı tekrar index\'iyle çoğaltılamaz'); continue; }
        } else if (str(g(r, 'hdr'))) W('info', SN, rn, `"${d.name}": Undersample Header yalnızca stream satırında kullanılır, yok sayıldı`);
        if (d.type.kind === 'bytes') { d.formula = ''; }
        if (d.isUS && !d.isSlot && d.sMode === 'block') { E_('undersample paket içinde blok örnekleme (B) desteklenmez'); continue; }
        if (d.idx.rep) {
          const rp = d.idx.rep, has = new RegExp('\\{\\s*' + rp.v + '\\s*\\}', 'g'); let kk = 0;
          for (const a of rp.at) { const dc = Object.assign({}, d); dc.idx = {byte: a.byte, bit: a.bit}; dc.name = has.test(d.name) ? d.name.replace(has, String(a.val)) : d.name + '_' + a.val; has.lastIndex = 0; if (dc.formula) dc.formula = dc.formula.replace(has, String(a.val)); has.lastIndex = 0; dc.rep = {k: kk++, count: rp.at.length}; defs.push(dc); }
        } else defs.push(d);
      }
      /* 2. geçiş: konum çözümleme */
      let framePtr = 0, blk = null; const closed = new Set(), sp = new Map(), streams = [], stByUnit = new Map(), vars = [];
      const closeBlk = () => { if (!blk) return; const size = blk.maxEnd - blk.minStart, end = blk.minStart + size * blk.B; for (const r of blk.rows) r.blockSize = size; if (end > L) for (const r of blk.rows) if (!r.bad) { r.bad = true; W('err', SN, r.row, `"${r.name}": blok örnekleme (B${blk.B}) çerçeve dışına taşıyor (bitiş ${end} > ${L})`); } framePtr = end; closed.add(blk.unit); blk = null; };
      for (const d of defs) {
        if (d.bad) continue;
        const ctx = (d.isUS && !d.isSlot) ? 'stream' : 'frame'; d.ctx = ctx;
        if (ctx === 'frame' && blk && (d.unit !== blk.unit || d.sMode !== 'block')) closeBlk();
        let ptr; if (ctx === 'stream') { if (!stByUnit.has(d.unit)) { W('err', SN, d.row, `"${d.name}": isUndersample=1 satırından önce "${d.unit}" birimi için stream satırı gerekli`); continue; } ptr = sp.get(d.unit); } else ptr = framePtr;
        const off = ix => ix - base;   // dosyadaki Index → 0 tabanlı bayt
        if (d.idx.auto) { d.byte = ptr; d.bit = 0; } else { d.byte = off(d.idx.byte); d.bit = d.idx.bit; if (d.byte < 0) { W('err', SN, d.row, `"${d.name}": Index ${d.idx.byte} çerçeve başlangıcından önce (Index tabanı ${base})`); continue; } }
        const k = d.type.kind; if (d.bit && (k === 'float' || k === 'bytes' || d.isSlot)) { W('err', SN, d.row, `"${d.name}": bu tip bit konumundan başlayamaz`); continue; }
        d.elemBits = (k === 'bytes' || k === 'stream') ? 8 * d.E : d.type.bits; d.per = (k === 'bytes' || k === 'stream') ? 1 : d.E;
        d.oneBits = d.elemBits * d.per; d.totalBits = d.sMode === 'var' ? d.oneBits * d.n : d.oneBits; d.sizeBytes = Math.ceil((d.bit + d.totalBits) / 8); d.end = d.byte + d.sizeBytes;
        d.aligned = d.bit === 0 && (k === 'float' || k === 'bytes' || k === 'stream' || (k === 'int' && d.type.bits % 8 === 0));
        if (ctx === 'frame') {
          if (d.sMode === 'block') {
            if (!blk) { if (closed.has(d.unit)) { W('err', SN, d.row, `"${d.name}": blok örneklemeli (B) birimin satırları ardışık olmalı`); continue; } blk = {unit: d.unit, B: d.n, minStart: d.byte, maxEnd: d.end, rows: [d]}; }
            else { if (d.n !== blk.B) { W('err', SN, d.row, `"${d.name}": aynı birimde farklı blok örnek sayısı (B${blk.B} / B${d.n})`); continue; } blk.minStart = Math.min(blk.minStart, d.byte); blk.maxEnd = Math.max(blk.maxEnd, d.end); blk.rows.push(d); }
          }
          if (d.end > L) { W('err', SN, d.row, `"${d.name}": çerçeve dışına taşıyor (bitiş baytı ${d.end}, çerçeve ${L})`); continue; }
          framePtr = d.end;
          if (d.isSlot) {
            if (stByUnit.has(d.unit)) { W('err', SN, d.row, `"${d.name}": bir birim için tek stream satırı olabilir`); continue; }
            const st = {unit: d.unit, sheet: SN, name: d.name, row: d.row, start: d.byte, win: d.E, hdr: d.hdr || null, P: d.hdr ? d.hdr.length : 0, n: 0};
            stByUnit.set(d.unit, st); streams.push(st); sp.set(d.unit, st.P); if (d.byte + d.E > L) W('warn', SN, d.row, 'stream yuvası çerçeve sonunu aşıyor');
          }
        } else { sp.set(d.unit, d.end); const st = stByUnit.get(d.unit); st.P = Math.max(st.P, d.end); st.n++; }
        if (!d.isSlot) vars.push(d);
      }
      closeBlk();
      /* 3. geçiş: ad tekrarları, formül, bytes */
      const seen = new Map(), out = [];
      for (const d of vars) {
        if (d.bad) continue;
        const key = d.unit + '\u0000' + d.name; if (seen.has(key)) { W('err', SN, d.row, `"${d.name}": aynı birimde tekrar eden değişken adı`); continue; } seen.set(key, 1);
        const v = {sheet: SN, unit: d.unit, row: d.row, name: d.name, kind: d.type.kind, bits: d.type.bits, signed: !!d.type.signed, le: d.le, msb: d.msb, E: d.E, n: d.n, sMode: d.sMode, blockSize: d.blockSize || 0, byte: d.byte, bit: d.bit, per: d.per, elemBits: d.elemBits, aligned: d.aligned, sizeBytes: d.sizeBytes, formula: d.formula, stream: d.ctx === 'stream' ? d.unit : null, reserved: /^(reserved|rezerve|rezerv)/i.test(d.name)};
        if (v.kind === 'bytes') { W('info', SN, d.row, `"${v.name}": bayt dizisi, sayısal kanal olarak gösterilmez`); v.skip = true; }
        if (v.formula && !v.skip) { try { const c = compile(v.formula); if (/&/.test(v.formula) && /&[^()]*[-+]/.test(v.formula.replace(/\([^()]*\)/g, ''))) (v._amp = true); } catch (e) { W('err', SN, d.row, `"${v.name}": ${e.message} — ham değer okunacak`); v.formulaErr = e.message; } }
        out.push(v);
      }
      const amp = out.filter(v => v._amp).map(v => v.name); out.forEach(v => delete v._amp);
      if (amp.length) W('warn', SN, 0, `Formülde & ile +/- parantezsiz birlikte (${amp.length} değişken: ${amp.slice(0, 3).join(', ')}${amp.length > 3 ? ' …' : ''}); C dilindeki gibi önce +/- işlenir, sonuç beklenenden farklı olabilir`);
      for (const st of streams) if (!st.n) W('warn', SN, st.row, `${st.unit}: stream paket içeriği (isUndersample=1 satırları) tanımlı değil`);
      if (out.length || streams.length) def.sheets.push({name: SN, vars: out, streams}); else W('warn', SN, 0, 'Sayfada okunabilir değişken yok');
    }
    if (!def.sheets.length) throw new Error('Excel dosyasında çerçeve tanımı (Birim/Index/Değişken/Tip sütunlu sayfa) bulunamadı');
    def.coverage = coverage(def, W); return def;
  }
  /* ---- kapsama: çakışma ve tanımsız (boşluk) baytlar ---- */
  function spans(v) {   // çerçeve içi [a,b) bayt aralıkları
    if (v.sMode === 'block') { const o = []; for (let s = 0; s < v.n; s++) o.push([v.byte + s * v.blockSize, v.byte + s * v.blockSize + v.sizeBytes]); return o; }
    return [[v.byte, v.byte + v.sizeBytes]];
  }
  function coverage(def, W) {
    const L = def.frameBytes, own = new Int16Array(L).fill(-1), names = [], ovl = new Map(); let overl = 0;
    const take = (q, si, S) => { if (q < 0 || q >= L) return; if (own[q] >= 0 && own[q] !== si) { const k = names[own[q]] + '|' + S.name; const o = ovl.get(k) || {a: names[own[q]], b: S.name, lo: q, hi: q}; o.hi = Math.max(o.hi, q); o.lo = Math.min(o.lo, q); ovl.set(k, o); overl++; } own[q] = si; };
    def.sheets.forEach((S, si) => {
      names.push(S.name);
      for (const st of S.streams) for (let b = st.start; b < Math.min(L, st.start + st.win); b++) take(b, si, S);
      for (const v of S.vars) { if (v.stream || v.reserved) continue; for (const [a, b] of spans(v)) for (let q = a; q < b; q++) take(q, si, S); }
      for (const v of S.vars) { if (v.stream || !v.reserved) continue; for (const [a, b] of spans(v)) for (let q = a; q < Math.min(L, b); q++) if (own[q] < 0) own[q] = si; }
    });
    for (const o of ovl.values()) W('info', o.a + '/' + o.b, 0, `"${o.a}" ve "${o.b}" sayfaları aynı baytları tanımlıyor (bayt ${o.lo + base1(def)}–${o.hi + base1(def)}); üst/alt sistem ilişkisi olabilir, ikisi de ayrı ayrı çözülür`);
    const gaps = []; let a = -1; for (let i = 0; i <= L; i++) { const free = i < L && own[i] < 0; if (free && a < 0) a = i; else if (!free && a >= 0) { gaps.push([a + base1(def), i - 1 + base1(def)]); a = -1; } }
    const undef = gaps.reduce((s, g) => s + g[1] - g[0] + 1, 0), cov = L - undef;
    if (gaps.length) W('warn', '(çerçeve)', 0, `Tanımsız bayt aralıkları (${gaps.length} adet, toplam ${undef} bayt = %${(100 * undef / L).toFixed(1)}): ` + gaps.slice(0, 12).map(g => g[0] === g[1] ? g[0] : g[0] + '–' + g[1]).join(', ') + (gaps.length > 12 ? ' …' : '') + ' — çözülmeyecek');
    return {covered: cov, undef, gaps, overlapBytes: overl};
  }
  const base1 = def => def.indexBase === 0 ? 0 : 1;

  /* ---- kanal planı ---- */
  // [{sheet, name, v, e (eleman|-1), spp (örnek/kare veya paket)}]
  function plan(def) {
    const out = [], seen = new Map();
    for (const S of def.sheets) for (const v of S.vars) {
      if (v.reserved || v.skip) continue;
      const sep = v.E > 1 && v.E <= MAXSEP;
      for (let e = 0; e < (sep ? v.E : 1); e++) {
        let nm = sep ? `${v.name}_${e + 1}` : v.name; const key = S.name + '/' + nm; const k = (seen.get(key) || 0) + 1; seen.set(key, k); if (k > 1) nm += '_r' + v.row;
        out.push({sheet: S.name, name: nm, v, e: sep ? e : -1, spp: v.n * (!sep && v.E > 1 ? v.E : 1), unit: ''});
      }
    }
    return out;
  }

  /* ---- bit/bayt okuyucuları ---- */
  function readMSB(b, pos, n) { let v = 0; while (n > 0) { const used = pos % 8, avail = 8 - used, take = avail < n ? avail : n; v = v * (1 << take) + ((b[Math.floor(pos / 8)] >>> (avail - take)) & ((1 << take) - 1)); pos += take; n -= take; } return v; }
  function readLSB(b, pos, n) { let v = 0, mul = 1; while (n > 0) { const used = pos % 8, avail = 8 - used, take = avail < n ? avail : n; v += ((b[Math.floor(pos / 8)] >>> used) & ((1 << take) - 1)) * mul; mul *= (1 << take); pos += take; n -= take; } return v; }
  function readBig(b, pos, n, msb) { let v = 0n; if (msb) for (let i = 0; i < n; i++, pos++) v = (v << 1n) | BigInt((b[Math.floor(pos / 8)] >>> (7 - (pos % 8))) & 1); else for (let i = 0; i < n; i++, pos++) v |= BigInt((b[Math.floor(pos / 8)] >>> (pos % 8)) & 1) << BigInt(i); return v; }
  function mkReader(v) {
    const bits = v.bits, signed = v.signed, le = v.le;
    if (v.kind === 'float') return bits === 32 ? (b, dv, bp) => dv.getFloat32(Math.floor(bp / 8), le) : (b, dv, bp) => dv.getFloat64(Math.floor(bp / 8), le);
    if (v.aligned && v.kind === 'int') {
      if (bits === 8) return signed ? (b, dv, bp) => dv.getInt8(Math.floor(bp / 8)) : (b, dv, bp) => b[Math.floor(bp / 8)];
      if (bits === 16) return signed ? (b, dv, bp) => dv.getInt16(Math.floor(bp / 8), le) : (b, dv, bp) => dv.getUint16(Math.floor(bp / 8), le);
      if (bits === 32) return signed ? (b, dv, bp) => dv.getInt32(Math.floor(bp / 8), le) : (b, dv, bp) => dv.getUint32(Math.floor(bp / 8), le);
      const nb = bits / 8;
      if (bits <= NUMB) { const full = 2 ** bits, half = full / 2; return (b, dv, bp) => { const o = Math.floor(bp / 8); let x = 0; if (le) for (let i = nb - 1; i >= 0; i--) x = x * 256 + b[o + i]; else for (let i = 0; i < nb; i++) x = x * 256 + b[o + i]; return signed && x >= half ? x - full : x; }; }
      const fullB = 1n << BigInt(bits), halfB = fullB >> 1n; return (b, dv, bp) => { const o = Math.floor(bp / 8); let x = 0n; if (le) for (let i = nb - 1; i >= 0; i--) x = (x << 8n) | BigInt(b[o + i]); else for (let i = 0; i < nb; i++) x = (x << 8n) | BigInt(b[o + i]); if (signed && x >= halfB) x -= fullB; return Number(x); };
    }
    if (bits <= NUMB) { const f = 2 ** bits, h = f / 2, rd = v.msb ? readMSB : readLSB; return signed ? (b, dv, bp) => { const x = rd(b, bp, bits); return x >= h ? x - f : x; } : (b, dv, bp) => rd(b, bp, bits); }
    const f = 1n << BigInt(bits), h = f >> 1n; return (b, dv, bp) => { let x = readBig(b, bp, bits, v.msb); if (signed && x >= h) x -= f; return Number(x); };
  }
  const rdCache = new WeakMap();
  const reader = v => { let r = rdCache.get(v); if (!r) { r = mkReader(v); rdCache.set(v, r); } return r; };

  // Çerçeve değişkeni: u8 içinde kare k = off0 + k*L → {v: Float64Array(nf*spp)}
  function extractFrames(u8, off0, nf, L, ch) {
    const v = ch.v, rd = reader(v), spp = ch.spp, out = new Float64Array(nf * spp), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const E = v.E, sep = ch.e >= 0, nEl = sep ? 1 : E, eb = v.elemBits, sstep = v.sMode === 'block' ? v.blockSize * 8 : E * eb, start = v.byte * 8 + v.bit;
    for (let k = 0; k < nf; k++) { const bb = (off0 + k * L) * 8 + start; for (let s = 0; s < v.n; s++) for (let q = 0; q < nEl; q++) { const e = sep ? ch.e : q; out[k * spp + (sep ? s : s * nEl + q)] = rd(u8, dv, bb + s * sstep + e * eb); } }
    return {v: out, ok: null, g: null};
  }
  // Akış: her karedeki yuva baytlarını art arda ekle (slot: Uint8Array(nf*win)), header'ı ara; paket konumları
  function streamScan(slot, st) {
    const pos = [], h = st.hdr, hl = h ? h.length : 0, P = st.P, n = slot.length; if (!hl) return Int32Array.from(pos);
    let p = 0; for (;;) {
      let f = -1; for (let q = p; q + hl <= n; q++) { if (slot[q] !== h[0]) continue; let ok = true; for (let j = 1; j < hl; j++) if (slot[q + j] !== h[j]) { ok = false; break; } if (ok) { f = q; break; } }
      if (f < 0 || f + P > n) break; pos.push(f); p = f + P;
    }
    return Int32Array.from(pos);
  }
  function streamPackets(slot, pos, win, ch) {   // paket değişkeni: {v, g (örnek indisleri; dt = T/spp, kare no × spp + s)}
    const v = ch.v, rd = reader(v), spp = ch.spp, np = pos.length, out = new Float64Array(np * spp), g = new Float64Array(np * spp), dv = new DataView(slot.buffer, slot.byteOffset, slot.byteLength);
    const E = v.E, sep = ch.e >= 0, nEl = sep ? 1 : E, eb = v.elemBits, start = v.byte * 8 + v.bit;
    for (let k = 0; k < np; k++) { const bb = pos[k] * 8 + start, fr = Math.floor(pos[k] / win); for (let s = 0; s < v.n; s++) for (let q = 0; q < nEl; q++) { const e = sep ? ch.e : q, i = k * spp + (sep ? s : s * nEl + q); out[i] = rd(slot, dv, bb + (s * E + e) * eb); g[i] = fr * spp + (i - k * spp); } }
    return {v: out, ok: null, g};
  }
  // Formülü uygula; sel: ad → {v, spp}
  function applyFormula(ch, r, selGet) {
    const v = ch.v; if (!v.formula || v.formulaErr) return r;
    const c = compile(v.formula), sel = c.ids.map(id => { const s = selGet(id); if (!s) throw new Error(`formüldeki "${id}" değişkeni bulunamadı`); return s; });
    const spp = ch.spp, raw = r.v, n = raw.length, out = new Float64Array(n), s = new Array(sel.length), ok = c.cond ? (r.ok ? Uint8Array.from(r.ok) : new Uint8Array(n).fill(1)) : r.ok;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(i / spp), j = i % spp;
      for (let q = 0; q < sel.length; q++) { const o = sel[q], jj = Math.min(j, o.spp - 1), ix = k * o.spp + jj; s[q] = ix < o.v.length ? o.v[ix] : NaN; }
      const y = c.fn(raw[i], s, 0); if (c.cond && Number.isNaN(y)) { ok[i] = 0; out[i] = NaN; } else out[i] = y;
    }
    return {v: out, ok, g: r.g};
  }
  // Koşulu sağlamayan örnekleri at; {v, g (örnek indisleri | null)}
  function compact(r) {
    let bad = 0; if (r.ok) for (let i = 0; i < r.ok.length; i++) if (!r.ok[i]) bad++;
    if (!bad && !r.g) return {v: r.v, g: null};
    const m = r.v.length - bad, v = new Float64Array(m), g = new Float64Array(m); let p = 0;
    for (let i = 0; i < r.v.length; i++) if (!r.ok || r.ok[i]) { v[p] = r.v[i]; g[p++] = r.g ? r.g[i] : i; } return {v, g};
  }
  function frameInfo(size, L, skip) { const body = Math.max(0, size - (skip | 0)); return {frames: Math.floor(body / L), rest: body % L}; }
  return {parse, parseType, parseIndex, parseHex, compile, isFrameBook, coverage, plan, extractFrames, streamScan, streamPackets, applyFormula, compact, frameInfo, fold, MAXSEP, spans};
})();
if (typeof module !== 'undefined') module.exports = FRM;
