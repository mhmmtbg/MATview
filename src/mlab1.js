/* ===== MATLAB alt kümesi yorumlayıcısı — 1/3: değerler, sözcük çözümleyici, ayrıştırıcı ===== */
const MLAB = (() => {
  'use strict';
  class MLError extends Error { constructor(msg, line, id) { super(msg); this.mline = line || 0; this.mid = id || 'MATLAB:error'; } }
  const err = (m, line, id) => { throw new MLError(m, line, id); };

  /* ---------- değerler ----------
     M: iki boyutlu dizi, sütun öncelikli. t: 'd' double, 's' single, 'l' logical, 'c' char, 'i8','u8','i16','u16','i32','u32','i64','u64'
     Cell: {cell:true, r, c, v: []}.  Yapı dizisi: {sa:true, r, c, v: [nesne]}.  İşlev tutamacı: {fh:true, ...} */
  class M {
    constructor(r, c, re, im, t) { this.r = r; this.c = c; this.re = re || new Float64Array(r * c); this.im = im || null; this.t = t || 'd'; }
    get n() { return this.r * this.c; }
  }
  const INT = {i8: [-128, 127], u8: [0, 255], i16: [-32768, 32767], u16: [0, 65535], i32: [-2147483648, 2147483647], u32: [0, 4294967295], i64: [-9223372036854775808, 9223372036854775807], u64: [0, 18446744073709551615]};
  const INTNAME = {int8: 'i8', uint8: 'u8', int16: 'i16', uint16: 'u16', int32: 'i32', uint32: 'u32', int64: 'i64', uint64: 'u64'};
  const CLSNAME = {d: 'double', s: 'single', l: 'logical', c: 'char', i8: 'int8', u8: 'uint8', i16: 'int16', u16: 'uint16', i32: 'int32', u32: 'uint32', i64: 'int64', u64: 'uint64'};
  const isInt = t => t in INT;
  const num = (x, t) => new M(1, 1, Float64Array.of(x), null, t || 'd');
  const cplx = (re, im) => new M(1, 1, Float64Array.of(re), im ? Float64Array.of(im) : null, 'd');
  const bool = b => new M(1, 1, Float64Array.of(b ? 1 : 0), null, 'l');
  const zeros = (r, c, t) => new M(r, c, new Float64Array(r * c), null, t || 'd');
  const rowv = (a, t) => { const re = a instanceof Float64Array ? a : Float64Array.from(a); return new M(1, re.length, re, null, t || 'd'); };
  const colv = (a, t) => { const re = a instanceof Float64Array ? a : Float64Array.from(a); return new M(re.length, 1, re, null, t || 'd'); };
  const str = s => { s = String(s); const re = new Float64Array(s.length); for (let i = 0; i < s.length; i++) re[i] = s.charCodeAt(i); return new M(s.length ? 1 : 0, s.length, re, null, 'c'); };
  const empty = () => new M(0, 0, new Float64Array(0), null, 'd');
  const isM = v => v instanceof M;
  const isStr = v => v instanceof M && v.t === 'c' && (v.r <= 1);
  const toStr = v => { if (!(v instanceof M)) err('Karakter dizisi bekleniyordu'); if (v.r <= 1) { let s = ''; for (let i = 0; i < v.re.length; i++) s += String.fromCharCode(v.re[i]); return s; } let s = ''; for (let i = 0; i < v.r; i++) { for (let j = 0; j < v.c; j++) s += String.fromCharCode(v.re[i + j * v.r]); } return s; };
  const rowStr = (v, i) => { let s = ''; for (let j = 0; j < v.c; j++) s += String.fromCharCode(v.re[i + j * v.r]); return s; };
  const cell = (r, c, v) => ({cell: true, r, c, v: v || new Array(r * c).fill(null).map(() => empty())});
  const isCell = v => v && v.cell === true;
  const isSA = v => v && v.sa === true;
  const isFH = v => v && v.fh === true;
  const scalarOf = (v, what) => { if (v instanceof M && v.re.length >= 1) return v.re[0]; err((what || 'Değer') + ' sayısal olmalı'); };
  const isTrue = v => {
    if (!(v instanceof M)) err('Koşul sayısal/mantıksal olmalı'); if (!v.re.length) return false;
    for (let i = 0; i < v.re.length; i++) if (v.re[i] === 0 && !(v.im && v.im[i])) return false; return true;
  };
  const clone = v => {
    if (v instanceof M) { const o = new M(v.r, v.c, v.re.slice(), v.im ? v.im.slice() : null, v.t); if (v.nd) o.nd = v.nd.slice(); return o; }
    if (isCell(v)) { const o = {cell: true, r: v.r, c: v.c, v: v.v.slice()}; for (const e of o.v) if (e) e._o = null; return o; }
    if (isSA(v)) { const o = {sa: true, r: v.r, c: v.c, v: v.v.map(s => { const q = Object.assign(Object.create(null), s); for (const k in q) if (q[k]) q[k]._o = null; return q; })}; return o; }
    return v;
  };
  const sizeOf = v => v instanceof M ? (v.nd ? v.nd.slice() : [v.r, v.c]) : isCell(v) || isSA(v) ? [v.r, v.c] : [1, 1];
  const numelOf = v => sizeOf(v).reduce((a, b) => a * b, 1);
  // N-boyutlu: nd = [d1, d2, d3, ...] (sondaki 1'ler atılmış, en az 3 öğe); r = d1, c = d2*d3*...
  const setDims = (m, d) => { d = d.slice(); while (d.length > 2 && d[d.length - 1] === 1) d.pop(); while (d.length < 2) d.push(1); m.r = d[0]; m.c = d.slice(1).reduce((a, b) => a * b, 1); m.nd = d.length > 2 ? d : undefined; return m; };
  const classOf = v => v instanceof M ? CLSNAME[v.t] : isCell(v) ? 'cell' : isSA(v) ? 'struct' : isFH(v) ? 'function_handle' : 'double';
  // sayıyı sınıfa göre yuvarla/doyur
  function castVal(x, t) { if (t === 'd' || t === 'l' || t === 'c') return x; if (t === 's') return Math.fround(x); const r = INT[t]; if (Number.isNaN(x)) return 0; x = Math.round(x); if (x - Math.trunc(x) === 0.5 || false) { /* yuvarlama: .5 sıfırdan uzağa */ } return x < r[0] ? r[0] : x > r[1] ? r[1] : x; }
  const round0 = x => x < 0 ? -Math.round(-x) : Math.round(x);   // MATLAB round: .5 sıfırdan uzağa
  function castM(m, t) {
    const o = new M(m.r, m.c, new Float64Array(m.re.length), null, t); if (m.nd) o.nd = m.nd.slice();
    if (isInt(t)) { const r = INT[t]; for (let i = 0; i < m.re.length; i++) { let x = m.re[i]; x = Number.isNaN(x) ? 0 : round0(x); o.re[i] = x < r[0] ? r[0] : x > r[1] ? r[1] : x; } }
    else if (t === 's') { for (let i = 0; i < m.re.length; i++) o.re[i] = Math.fround(m.re[i]); if (m.im) { o.im = new Float64Array(m.im.length); for (let i = 0; i < m.im.length; i++) o.im[i] = Math.fround(m.im[i]); } }
    else if (t === 'l') { for (let i = 0; i < m.re.length; i++) { if (Number.isNaN(m.re[i])) err('NaN mantıksal değere dönüştürülemez'); o.re[i] = m.re[i] !== 0 ? 1 : 0; } }
    else { o.re.set(m.re); if (m.im) o.im = m.im.slice(); }
    return o;
  }

  /* ---------- sözcük çözümleyici ---------- */
  const KW = new Set(['if', 'elseif', 'else', 'end', 'for', 'parfor', 'while', 'switch', 'case', 'otherwise', 'try', 'catch', 'break', 'continue', 'return', 'function', 'global', 'persistent', 'endif', 'endfor', 'endwhile', 'endfunction', 'endswitch', 'end_try_catch', 'do', 'until']);
  function lex(src) {
    const toks = [], stack = []; let i = 0, line = 1, sp = false;
    const n = src.length; const push = (k, v, extra) => { const t = Object.assign({k, v, line, sp}, extra); toks.push(t); sp = false; return t; };
    const prevEnds = () => { const p = toks[toks.length - 1]; if (!p) return false; return p.k === 'num' || p.k === 'imag' || p.k === 'str' || p.k === 'id' || (p.k === 'op' && (p.v === ')' || p.v === ']' || p.v === '}' || p.v === "'" || p.v === ".'")) || (p.k === 'kw' && p.v === 'end' && stack.length > 0); };
    const inMat = () => stack.length && (stack[stack.length - 1] === '[' || stack[stack.length - 1] === '{');
    let lineStart = true;
    while (i < n) {
      const c = src[i];
      // blok yorum: satır başında %{ ... %}
      if (lineStart && c === '%' && src[i + 1] === '{') { let j = i + 2; while (j < n && (src[j] === ' ' || src[j] === '\t')) j++; if (j >= n || src[j] === '\n' || src[j] === '\r') { let depth = 1, k = j; while (k < n && depth > 0) { while (k < n && src[k] !== '\n') k++; if (k < n) { k++; line++; } let m = k; while (m < n && (src[m] === ' ' || src[m] === '\t')) m++; if (src[m] === '%' && src[m + 1] === '{') { let q = m + 2; while (q < n && (src[q] === ' ' || src[q] === '\t' || src[q] === '\r')) q++; if (src[q] === '\n' || q >= n) depth++; } else if (src[m] === '%' && src[m + 1] === '}') { let q = m + 2; while (q < n && (src[q] === ' ' || src[q] === '\t' || src[q] === '\r')) q++; if (src[q] === '\n' || q >= n) { depth--; k = q; } } } i = k; continue; } }
      if (c === ' ' || c === '\t') { sp = true; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '.' && src[i + 1] === '.' && src[i + 2] === '.') { while (i < n && src[i] !== '\n') i++; i++; line++; sp = true; continue; }   // satır devamı
      if (c === '%' || c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '\n') {
        if (stack.length && stack[stack.length - 1] === '(') { i++; line++; sp = true; continue; }
        if (inMat()) { const p = toks[toks.length - 1]; if (p && !(p.k === 'op' && (p.v === ';' || p.v === '[' || p.v === '{'))) { push('op', ';'); } i++; line++; lineStart = true; continue; }
        push('nl', '\n'); i++; line++; lineStart = true; continue;
      }
      lineStart = false;
      // matris içinde boşlukla ayırma: [1 -2], [a' b'], [x (1)] ...
      const startsValue = () => {
        if (!inMat() || !sp || !prevEnds()) return false;
        if (/[0-9]/.test(c) || c === '.' && /[0-9]/.test(src[i + 1] || '') || /[A-Za-z_]/.test(c) || c === '"' || c === "'" || c === '(' || c === '[' || c === '{' || c === '@') return true;
        if ((c === '~' || c === '!') && src[i + 1] !== '=') return true;
        if ((c === '+' || c === '-') && src[i + 1] !== ' ' && src[i + 1] !== '\t' && src[i + 1] !== '=') return true;
        return false;
      };
      if (startsValue()) { const s0 = sp; push('op', ','); sp = s0; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i;
        if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X') && /[0-9a-fA-F]/.test(src[i + 2] || '')) { j = i + 2; while (/[0-9a-fA-F]/.test(src[j] || '')) j++; push('num', parseInt(src.slice(i + 2, j), 16)); i = j; continue; }
        while (/[0-9]/.test(src[j] || '')) j++;
        if (src[j] === '.' && !'*/\\^\''.includes(src[j + 1] || ' ') && !(src[j + 1] === '.' && src[j + 2] === '.')) { j++; while (/[0-9]/.test(src[j] || '')) j++; }
        if ((src[j] === 'e' || src[j] === 'E' || src[j] === 'd' || src[j] === 'D') && (/[0-9]/.test(src[j + 1] || '') || ((src[j + 1] === '+' || src[j + 1] === '-') && /[0-9]/.test(src[j + 2] || '')))) { j += 2; while (/[0-9]/.test(src[j] || '')) j++; }
        const v = parseFloat(src.slice(i, j).replace(/[dD]/, 'e'));
        if ((src[j] === 'i' || src[j] === 'j') && !/[A-Za-z0-9_]/.test(src[j + 1] || '')) { push('imag', v); i = j + 1; continue; }
        push('num', v); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1; while (/[A-Za-z0-9_]/.test(src[j] || '')) j++;
        const w = src.slice(i, j);
        const prev = toks[toks.length - 1];
        if (KW.has(w) && !(prev && prev.k === 'op' && prev.v === '.' )) push('kw', w === 'endif' || w === 'endfor' || w === 'endwhile' || w === 'endfunction' || w === 'endswitch' || w === 'end_try_catch' ? 'end' : (w === 'parfor' ? 'for' : w), {raw: w});
        else push('id', w);
        i = j; continue;
      }
      if (c === '"' || (c === "'" && !(prevEnds() && !(sp && inMat())))) {
        const q = c; let j = i + 1, s = '';
        for (;;) {
          if (j >= n || src[j] === '\n') err('Kapanmamış karakter dizisi', line);
          if (src[j] === q) { if (src[j + 1] === q) { s += q; j += 2; continue; } break; }
          s += src[j++];
        }
        push('str', s, {dq: q === '"'}); i = j + 1; continue;
      }
      const three = src.substr(i, 3), two = src.substr(i, 2);
      if (three === '.^\'') { push('op', '.^'); i += 2; continue; }
      if (['==', '~=', '!=', '<=', '>=', '&&', '||', '.*', './', '.\\', '.^', ".'", '++', '--', '+=', '-=', '*=', '/='].includes(two)) {
        if ((two === '++' || two === '--') ) { /* a++ yok; iki ayrı işlem */ }
        else if ((two === '+=' || two === '-=' || two === '*=' || two === '/=') && inMat()) { }
        else { push('op', two === '!=' ? '~=' : two); i += 2; continue; }
      }
      if ('+-*/\\^<>=&|~!:,;.@'.includes(c)) { push('op', c === '!' ? '~' : c); i++; continue; }
      if (c === "'") { push('op', "'"); i++; continue; }
      if (c === '(' || c === '[' || c === '{') { stack.push(c); push('op', c); i++; continue; }
      if (c === ')' || c === ']' || c === '}') { stack.pop(); push('op', c); i++; continue; }
      err(`Geçersiz karakter: '${c}'`, line);
    }
    push('nl', '\n'); push('eof', '');
    return toks;
  }

  /* ---------- ayrıştırıcı ---------- */
  const CMDS = new Set(['hold', 'close', 'clear', 'clc', 'format', 'warning', 'grid', 'axis', 'box', 'figure', 'clf', 'more', 'clearvars', 'disp_off', 'pkg', 'drawnow', 'shg', 'colormap', 'cla', 'colorbar', 'zoom', 'pause']);
  function parse(src) {
    const toks = lex(src); let p = 0; const funcs = [];
    const T = () => toks[p], at = (k, v) => toks[p].k === k && (v === undefined || toks[p].v === v), isOp = v => toks[p].k === 'op' && toks[p].v === v;
    const next = () => toks[p++];
    const expectOp = v => { if (!isOp(v)) err(`'${v}' bekleniyordu (bulunan: '${toks[p].v === '\n' ? 'satır sonu' : toks[p].v}')`, toks[p].line); return next(); };
    const skipNl = () => { while (at('nl') || isOp(';') || isOp(',')) p++; };
    function parseBlock(stops) {
      const body = [];
      for (;;) {
        skipNl();
        const t = T(); if (t.k === 'eof') { if (stops.includes('eof')) return body; err('Beklenmeyen dosya sonu: eksik end?', t.line); }
        if (t.k === 'kw' && stops.includes(t.v)) return body;
        const s = parseStmt(); if (s) body.push(s);
      }
    }
    function endStmt() {   // ifadenin sonu: ; → sessiz, , veya satır sonu → yazdır
      if (isOp(';')) { p++; while (at('nl')) p++; return false; }
      if (isOp(',')) { p++; return true; }
      if (at('nl')) { p++; return true; }
      if (at('eof')) return true;
      if (at('kw')) return true;   // "if x, y=1, end" biçimi
      err(`Beklenmeyen simge: '${T().v}'`, T().line);
    }
    function parseStmt() {
      const t = T(), line = t.line;
      if (t.k === 'kw') {
        switch (t.v) {
          case 'if': { p++; const conds = []; let els = null; let c = parseExpr(); let b = parseBlock(['elseif', 'else', 'end']); conds.push([c, b]);
            for (;;) { const k = T(); if (k.v === 'elseif') { p++; c = parseExpr(); b = parseBlock(['elseif', 'else', 'end']); conds.push([c, b]); } else if (k.v === 'else') { p++; els = parseBlock(['end']); } else { p++; break; } }
            return {t: 'if', conds, els, line}; }
          case 'for': { p++; const paren = isOp('('); if (paren) p++; const v = parsePostfixLV(); expectOp('='); const e = parseExpr(); if (paren && isOp(')')) p++; const body = parseBlock(['end']); p++; return {t: 'for', v, e, body, line}; }
          case 'while': { p++; const c = parseExpr(); const body = parseBlock(['end']); p++; return {t: 'while', c, body, line}; }
          case 'do': { p++; const body = parseBlock(['until']); p++; const c = parseExpr(); return {t: 'dountil', c, body, line}; }
          case 'switch': { p++; const e = parseExpr(); skipNl(); const cases = []; let other = null;
            for (;;) { skipNl(); const k = T(); if (k.v === 'case') { p++; const ce = parseExpr(); const b = parseBlock(['case', 'otherwise', 'end']); cases.push([ce, b]); } else if (k.v === 'otherwise') { p++; other = parseBlock(['case', 'otherwise', 'end']); } else if (k.v === 'end') { p++; break; } else err('switch içinde case/otherwise/end bekleniyordu', k.line); }
            return {t: 'switch', e, cases, other, line}; }
          case 'try': { p++; if (isOp(',')) p++; const body = parseBlock(['catch', 'end']); let cv = null, cb = [];
            if (T().v === 'catch') { p++; if (at('id') && toks[p].line === toks[p - 1].line && toks[p + 1] && (toks[p + 1].k === 'nl' || (toks[p + 1].k === 'op' && (toks[p + 1].v === ';' || toks[p + 1].v === ',')))) { cv = T().v; p++; } cb = parseBlock(['end']); }
            p++; return {t: 'try', body, cv, cb, line}; }
          case 'break': p++; return {t: 'break', line};
          case 'continue': p++; return {t: 'continue', line};
          case 'return': p++; return {t: 'return', line};
          case 'global': case 'persistent': { p++; const names = []; while (at('id')) names.push(next().v); let init = null; if (t.v === 'persistent' && isOp('=')) { p++; init = parseExpr(); } return {t: t.v, names, init, line}; }
          case 'function': parseFunction(); return null;
          default: err(`Beklenmeyen anahtar sözcük: ${t.raw || t.v}`, line);
        }
      }
      // komut sözdizimi: hold on, close all, format long
      if (t.k === 'id' && CMDS.has(t.v)) {
        const n1 = toks[p + 1];
        if (n1.k === 'nl' || n1.k === 'eof' || (n1.k === 'op' && (n1.v === ';' || n1.v === ','))) { p++; const pr = endStmtLoose(); return {t: 'expr', e: {t: 'call', f: {t: 'id', n: t.v, line}, args: [], line}, print: false, line, cmd: true}; }
        if (n1.k === 'id' && n1.sp && !(toks[p + 2].k === 'op' && (toks[p + 2].v === '=' || toks[p + 2].v === '('))) { p++; const args = []; while (at('id') || at('num') || at('str')) { const a = next(); args.push({t: 'str', v: String(a.v)}); } endStmtLoose(); return {t: 'expr', e: {t: 'call', f: {t: 'id', n: t.v, line}, args, line}, print: false, line, cmd: true}; }
      }
      // atama veya ifade
      const e = parseExpr();
      if (isOp('=') ) {
        p++; let lhs;
        if (e.t === 'mat') { if (e.rows.length !== 1) err('Çoklu atamada sol taraf tek satır olmalı', line); lhs = e.rows[0]; } else lhs = [e];
        for (const l of lhs) if (!(l.t === 'tilde' || isLV(l))) err('Atamanın sol tarafı geçersiz', line);
        const rhs = parseExpr(); const pr = endStmt(); return {t: 'assign', lhs, rhs, print: pr, line};
      }
      if ((isOp('+=') || isOp('-=') || isOp('*=') || isOp('/=')) && isLV(e)) { const op = next().v[0]; const rhs = parseExpr(); const pr = endStmt(); return {t: 'assign', lhs: [e], rhs: {t: 'bin', op, a: e, b: rhs, line}, print: pr, line}; }
      if (isOp('+') && toks[p + 1].k === 'op' && toks[p + 1].v === '+' && isLV(e)) { p += 2; const pr = endStmt(); return {t: 'assign', lhs: [e], rhs: {t: 'bin', op: '+', a: e, b: {t: 'num', v: 1}, line}, print: pr, line}; }
      const pr = endStmt(); return {t: 'expr', e, print: pr, line};
    }
    function endStmtLoose() { if (isOp(';') || isOp(',')) p++; else if (at('nl')) p++; }
    function isLV(e) { return e.t === 'id' || ((e.t === 'call' || e.t === 'cidx' || e.t === 'field') && isLV(e.f || e.a)); }
    function parsePostfixLV() { const e = parsePrimaryPost(); if (!isLV(e)) err('Geçersiz döngü değişkeni', T().line); return e; }
    function parseFunction() {
      const line = T().line; p++;   // function
      let outs = [], name, ins = [];
      // [o1,o2] = ad(...)  |  o = ad(...)  |  ad(...)
      if (isOp('[')) { p++; while (!isOp(']')) { if (isOp(',')) { p++; continue; } outs.push(next().v); } p++; expectOp('='); name = next().v; }
      else { const a = next().v; if (isOp('=')) { p++; outs = [a]; name = next().v; } else name = a; }
      while (isOp('.')) { p++; name += '.' + next().v; }
      if (isOp('(')) { p++; while (!isOp(')')) { if (isOp(',')) { p++; continue; } if (isOp('~')) { p++; ins.push('~'); continue; } const t = next(); ins.push(t.v); if (isOp('=')) { /* varsayılan değer yok */ } } p++; }
      const body = parseBlock(['end', 'function', 'eof']);
      if (T().k === 'kw' && T().v === 'end') p++;
      funcs.push({name, ins, outs, body, line});
    }
    /* ifade — öncelik: || && | & karşılaştırma : + - * / unary ^ */
    function parseExpr() { return parseOrOr(); }
    function bin(op, a, b, line) { return {t: op === '&&' ? 'andand' : op === '||' ? 'oror' : 'bin', op, a, b, line}; }
    function parseOrOr() { let a = parseAndAnd(); while (isOp('||')) { const l = next().line; a = bin('||', a, parseAndAnd(), l); } return a; }
    function parseAndAnd() { let a = parseOr(); while (isOp('&&')) { const l = next().line; a = bin('&&', a, parseOr(), l); } return a; }
    function parseOr() { let a = parseAnd(); while (isOp('|')) { const l = next().line; a = bin('|', a, parseAnd(), l); } return a; }
    function parseAnd() { let a = parseCmp(); while (isOp('&')) { const l = next().line; a = bin('&', a, parseCmp(), l); } return a; }
    function parseCmp() { let a = parseRange(); while (at('op') && ['==', '~=', '<', '<=', '>', '>='].includes(T().v)) { const o = next(); a = bin(o.v, a, parseRange(), o.line); } return a; }
    function parseRange() {
      if (isOp(':') && inIndexCtx > 0 && (toks[p + 1].k === 'op' && (toks[p + 1].v === ')' || toks[p + 1].v === ','))) { p++; return {t: 'colon'}; }
      let a = parseAdd();
      if (isOp(':') && !(toks[p + 1].k === 'op' && (toks[p + 1].v === ')' || toks[p + 1].v === ',' && false))) {
        const l = T().line; p++; let b = parseAdd();
        if (isOp(':')) { p++; const c = parseAdd(); return {t: 'range', a, s: b, b: c, line: l}; }
        return {t: 'range', a, s: null, b, line: l};
      }
      return a;
    }
    function parseAdd() { let a = parseMul(); while (at('op') && (T().v === '+' || T().v === '-') && !(toks[p + 1].k === 'op' && toks[p + 1].v === '=' ) ) { const o = next(); a = bin(o.v, a, parseMul(), o.line); } return a; }
    function parseMul() { let a = parseUnary(); while (at('op') && ['*', '/', '.*', './', '\\', '.\\'].includes(T().v)) { const o = next(); a = bin(o.v, a, parseUnary(), o.line); } return a; }
    function parseUnary() {
      if (at('op') && (T().v === '-' || T().v === '+' || T().v === '~')) { const o = next(); const a = parseUnary(); if (o.v === '+') return a; if (o.v === '-' && a.t === 'num') return {t: 'num', v: -a.v}; return {t: 'un', op: o.v, a, line: o.line}; }
      return parsePower();
    }
    function parsePower() {
      let a = parsePrimaryPost();
      while (at('op') && (T().v === '^' || T().v === '.^')) {
        const o = next();
        // üs işleneni: tekli işaretli olabilir (2^-2)
        let b; if (at('op') && (T().v === '-' || T().v === '+' || T().v === '~')) { const u = next(); const x = parsePowerOperand(); b = u.v === '+' ? x : {t: 'un', op: u.v, a: x, line: u.line}; } else b = parsePrimaryPost();
        a = bin(o.v, a, b, o.line);
      }
      return a;
    }
    function parsePowerOperand() { if (at('op') && (T().v === '-' || T().v === '+' || T().v === '~')) { const u = next(); const x = parsePowerOperand(); return u.v === '+' ? x : {t: 'un', op: u.v, a: x, line: u.line}; } return parsePrimaryPost(); }
    let inIndexCtx = 0;
    function parseArgs(close) {
      const args = []; inIndexCtx++;
      while (!isOp(close)) {
        if (isOp(',')) { p++; continue; }
        if (isOp(':') && (toks[p + 1].k === 'op' && (toks[p + 1].v === close || toks[p + 1].v === ','))) { p++; args.push({t: 'colon'}); continue; }
        args.push(parseExpr());
        if (!isOp(',') && !isOp(close)) err(`'${close}' veya ',' bekleniyordu`, T().line);
      }
      inIndexCtx--; p++; return args;
    }
    function parsePrimaryPost() {
      let e = parsePrimary();
      for (;;) {
        const t = T();
        if (t.k === 'op') {
          if (t.v === '(' && !(inMatrix > 0 && t.sp)) { p++; const saveM = inMatrix; inMatrix = 0; const args = parseArgs(')'); inMatrix = saveM; e = {t: 'call', f: e, args, line: t.line}; continue; }
          if (t.v === '{' && !(inMatrix > 0 && t.sp)) { p++; const saveM = inMatrix; inMatrix = 0; const args = parseArgs('}'); inMatrix = saveM; e = {t: 'cidx', f: e, args, line: t.line}; continue; }
          if (t.v === '.' && toks[p + 1].k === 'id' && !(inMatrix > 0 && t.sp)) { p += 2; e = {t: 'field', a: e, name: toks[p - 1].v, line: t.line}; continue; }
          if (t.v === '.' && toks[p + 1].k === 'op' && toks[p + 1].v === '(') { p += 2; const x = parseExpr(); expectOp(')'); e = {t: 'field', a: e, dyn: x, line: t.line}; continue; }
          if (t.v === "'" || t.v === ".'") { p++; e = {t: 'post', op: t.v, a: e, line: t.line}; continue; }
        }
        break;
      }
      return e;
    }
    let inMatrix = 0;
    function parseMatrix(close) {
      p++; inMatrix++; const rows = []; let row = []; const save = inIndexCtx;
      for (;;) {
        if (isOp(close)) { p++; break; }
        if (isOp(';')) { p++; if (row.length) rows.push(row); row = []; continue; }
        if (isOp(',')) { p++; continue; }
        if (at('nl')) { p++; continue; }
        if (at('eof')) err('Kapanmamış parantez', T().line);
        if (isOp('~') && toks[p + 1].k === 'op' && (toks[p + 1].v === ',' || toks[p + 1].v === close)) { p++; row.push({t: 'tilde'}); continue; }
        row.push(parseExpr());
      }
      if (row.length) rows.push(row); inMatrix--; inIndexCtx = save;
      return rows;
    }
    function parsePrimary() {
      const t = T();
      switch (t.k) {
        case 'num': p++; return {t: 'num', v: t.v};
        case 'imag': p++; return {t: 'imag', v: t.v};
        case 'str': p++; return {t: 'str', v: t.v};
        case 'id': p++; return {t: 'id', n: t.v, line: t.line};
        case 'kw': if (t.v === 'end' && inIndexCtx > 0) { p++; return {t: 'end'}; } err(`Beklenmeyen anahtar sözcük '${t.raw || t.v}' (ifade bekleniyordu)`, t.line); break;
        case 'op':
          if (t.v === '(') { p++; const save = inMatrix, sv2 = inIndexCtx; inMatrix = 0; const e = parseExpr(); inMatrix = save; inIndexCtx = sv2; expectOp(')'); return {t: 'paren', a: e}; }
          if (t.v === '[') { const rows = parseMatrix(']'); return {t: 'mat', rows, line: t.line}; }
          if (t.v === '{') { const rows = parseMatrix('}'); return {t: 'cellLit', rows, line: t.line}; }
          if (t.v === '@') {
            p++;
            if (isOp('(')) { p++; const params = []; while (!isOp(')')) { if (isOp(',')) { p++; continue; } if (isOp('~')) { p++; params.push('~'); continue; } params.push(next().v); } p++; const save = inMatrix, sv2 = inIndexCtx; inMatrix = 0; inIndexCtx = 0; const body = parseExpr(); inMatrix = save; inIndexCtx = sv2; return {t: 'anon', params, body, line: t.line}; }
            let name = next().v; while (isOp('.') && toks[p + 1].k === 'id') { p++; name += '.' + next().v; }
            return {t: 'fh', name, line: t.line};
          }
          if (t.v === ':') { p++; return {t: 'colon'}; }
          break;
      }
      err(`Beklenmeyen simge: '${t.v === '\n' ? 'satır sonu' : t.v}'`, t.line);
    }
    const body = parseBlock(['eof']);
    return {body, funcs};
  }

  return {M, MLError, err, lex, parse, setDims, num, cplx, bool, zeros, rowv, colv, str, empty, isM, isStr, toStr, rowStr, cell, isCell, isSA, isFH, scalarOf, isTrue, clone, sizeOf, numelOf, classOf, castM, castVal, round0, isInt, INT, INTNAME, CLSNAME};
})();
