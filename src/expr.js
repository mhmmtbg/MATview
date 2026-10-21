/* MATLAB tarzı ifade ayrıştırıcı: kanal adları, + - * / ^, fonksiyonlar */
const EXPR = (() => {
  function tokenize(s) {
    const t = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i)); if (!m) throw new Error('Sayı hatası: ' + s.slice(i, i + 5)); t.push({t: 'num', v: parseFloat(m[0])}); i += m[0].length; continue; }
      if (/[A-Za-z_À-ɏ]/.test(c)) { const m = /^[A-Za-z0-9_À-ɏ]+/.exec(s.slice(i)); t.push({t: 'id', v: m[0]}); i += m[0].length; continue; }
      if (c === '.' && '*/^'.includes(s[i + 1])) { t.push({t: 'op', v: s[i + 1]}); i += 2; continue; }
      if ('+-*/^(),'.includes(c)) { t.push({t: c === '(' || c === ')' || c === ',' ? c : 'op', v: c}); i++; continue; }
      throw new Error('Geçersiz karakter: ' + c);
    }
    return t;
  }
  function parse(toks) {
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    function expr() { let l = term(); while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const o = next().v; l = {k: 'bin', o, l, r: term()}; } return l; }
    function term() { let l = unary(); while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) { const o = next().v; l = {k: 'bin', o, l, r: unary()}; } return l; }
    function unary() { if (peek() && peek().t === 'op' && (peek().v === '-' || peek().v === '+')) { const o = next().v; const e = unary(); return o === '-' ? {k: 'neg', e} : e; } return power(); }
    function power() { const b = atom(); if (peek() && peek().t === 'op' && peek().v === '^') { next(); return {k: 'bin', o: '^', l: b, r: unary()}; } return b; }
    function atom() {
      const x = next(); if (!x) throw new Error('İfade eksik');
      if (x.t === 'num') return {k: 'num', v: x.v};
      if (x.t === 'id') {
        if (peek() && peek().t === '(') {
          next(); const args = [];
          if (peek() && peek().t === ')') { next(); return {k: 'call', f: x.v, args}; }
          for (;;) { args.push(expr()); const n = next(); if (!n) throw new Error('")" eksik'); if (n.t === ')') break; if (n.t !== ',') throw new Error('"," bekleniyordu'); }
          return {k: 'call', f: x.v, args};
        }
        return {k: 'id', v: x.v};
      }
      if (x.t === '(') { const e = expr(); const n = next(); if (!n || n.t !== ')') throw new Error('")" eksik'); return e; }
      throw new Error('Beklenmeyen: ' + (x.v ?? x.t));
    }
    const e = expr(); if (p < toks.length) throw new Error('Beklenmeyen: ' + (toks[p].v ?? toks[p].t)); return e;
  }

  // Değer: sayı veya {v: Float64Array, fs, ch}
  // ctx: {resolve(name)->{v,fs,ch}, DSP}
  function evaluate(ast, ctx) {
    const isV = a => typeof a !== 'number';
    const map1 = (a, f) => { if (!isV(a)) return f(a); const o = new Float64Array(a.v.length); for (let i = 0; i < o.length; i++) o[i] = f(a.v[i]); return {v: o, fs: a.fs, ch: a.ch}; };
    const bin = (a, b, f) => {
      if (!isV(a) && !isV(b)) return f(a, b);
      if (isV(a) && !isV(b)) { const o = new Float64Array(a.v.length); for (let i = 0; i < o.length; i++) o[i] = f(a.v[i], b); return {v: o, fs: a.fs, ch: a.ch}; }
      if (!isV(a) && isV(b)) { const o = new Float64Array(b.v.length); for (let i = 0; i < o.length; i++) o[i] = f(a, b.v[i]); return {v: o, fs: b.fs, ch: b.ch}; }
      const n = a.v.length; const bv = b.v.length === n ? b.v : ctx.DSP.resample(b.v, n);
      const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = f(a.v[i], bv[i]); return {v: o, fs: a.fs, ch: a.ch};
    };
    const scal = (a, name) => { if (isV(a)) throw new Error(name + ': skaler bekleniyordu'); return a; };
    const vec = (a, name) => { if (!isV(a)) throw new Error(name + ': kanal/vektör bekleniyordu'); return a; };
    const red = (a, f) => isV(a) ? f(a.v) : a;
    const sortedMed = v => { const c = Float64Array.from(v).sort(); return c[c.length >> 1]; };
    const F1 = {abs: Math.abs, sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, log10: Math.log10, sign: Math.sign, round: Math.round, floor: Math.floor, ceil: Math.ceil, asin: Math.asin, acos: Math.acos, atan: Math.atan, deg2rad: x => x * Math.PI / 180, rad2deg: x => x * 180 / Math.PI, db: x => 20 * Math.log10(Math.abs(x) + 1e-30)};
    const RED = {mean: v => { let s = 0; for (const x of v) s += x; return s / v.length; }, std: v => { let s = 0, s2 = 0; for (const x of v) { s += x; s2 += x * x; } const n = v.length, m = s / n; return Math.sqrt(Math.max(0, (s2 - n * m * m) / (n - 1))); }, rms: v => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s / v.length); }, max: v => { let m = -Infinity; for (const x of v) if (x > m) m = x; return m; }, min: v => { let m = Infinity; for (const x of v) if (x < m) m = x; return m; }, median: sortedMed, sum: v => { let s = 0; for (const x of v) s += x; return s; }, p2p: v => { let a = Infinity, b = -Infinity; for (const x of v) { if (x < a) a = x; if (x > b) b = x; } return b - a; }};
    function filt(a, type, p) { a = vec(a, type); const sos = ctx.DSP.design(type, p, a.fs); return {v: ctx.DSP.filtfilt(sos, a.v), fs: a.fs, ch: a.ch}; }
    function call(f, args) {
      f = f.toLowerCase();
      if (F1[f]) { if (args.length !== 1) throw new Error(f + ' tek argüman alır'); return map1(args[0], F1[f]); }
      if (RED[f] && args.length === 1) return red(args[0], RED[f]);
      switch (f) {
        case 'diff': { const a = vec(args[0], f), o = new Float64Array(a.v.length); for (let i = 1; i < o.length; i++) o[i] = a.v[i] - a.v[i - 1]; return {v: o, fs: a.fs, ch: a.ch}; }
        case 'gradient': case 'turev': { const a = vec(args[0], f), o = new Float64Array(a.v.length); for (let i = 1; i < o.length; i++) o[i] = (a.v[i] - a.v[i - 1]) * a.fs; return {v: o, fs: a.fs, ch: a.ch}; }
        case 'cumsum': { const a = vec(args[0], f), o = new Float64Array(a.v.length); let s = 0; for (let i = 0; i < o.length; i++) { s += a.v[i]; o[i] = s; } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'integrate': case 'integral': { const a = vec(args[0], f), o = new Float64Array(a.v.length); let s = 0; for (let i = 0; i < o.length; i++) { s += a.v[i] / a.fs; o[i] = s; } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'detrend': { const a = vec(args[0], f); return {v: ctx.DSP.detrendLinear(a.v), fs: a.fs, ch: a.ch}; }
        case 'demean': { const a = vec(args[0], f); const m = RED.mean(a.v); return {v: a.v.map(x => x - m), fs: a.fs, ch: a.ch}; }
        case 'movmean': { const a = vec(args[0], f), w = Math.max(1, Math.round(scal(args[1], f))), n = a.v.length, o = new Float64Array(n); const cs = new Float64Array(n + 1); for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + a.v[i]; for (let i = 0; i < n; i++) { const lo = Math.max(0, i - (w >> 1)), hi = Math.min(n - 1, i + ((w - 1) >> 1)); o[i] = (cs[hi + 1] - cs[lo]) / (hi - lo + 1); } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'movmedian': { const a = vec(args[0], f), w = Math.max(1, Math.round(scal(args[1], f))), n = a.v.length, o = new Float64Array(n); for (let i = 0; i < n; i++) { const lo = Math.max(0, i - (w >> 1)), hi = Math.min(n - 1, i + ((w - 1) >> 1)); o[i] = sortedMed(a.v.subarray(lo, hi + 1)); } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'lp': case 'lowpass': return filt(args[0], 'lp', {order: args[2] ?? 4, f1: scal(args[1], f)});
        case 'hp': case 'highpass': return filt(args[0], 'hp', {order: args[2] ?? 4, f1: scal(args[1], f)});
        case 'bp': case 'bandpass': return filt(args[0], 'bp', {order: args[3] ?? 4, f1: scal(args[1], f), f2: scal(args[2], f)});
        case 'notch': return filt(args[0], 'notch', {f1: scal(args[1], f), Q: args[2] ?? 30});
        case 'env': case 'zarf': { const a = vec(args[0], f), n = a.v.length; let m = 1; while (m < n) m <<= 1; const re = new Float64Array(m), im = new Float64Array(m); re.set(a.v); ctx.DSP.fft(re, im, false); for (let k = 1; k < m / 2; k++) { re[k] *= 2; im[k] *= 2; } for (let k = m / 2 + 1; k < m; k++) { re[k] = 0; im[k] = 0; } ctx.DSP.fft(re, im, true); const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = Math.hypot(re[i], im[i]) / m; return {v: o, fs: a.fs, ch: a.ch}; }
        case 'atan2': return bin(args[0], args[1], Math.atan2);
        case 'pow': return bin(args[0], args[1], Math.pow);
        case 'max': case 'min': if (args.length === 2) return bin(args[0], args[1], f === 'max' ? Math.max : Math.min); break;
      }
      throw new Error('Bilinmeyen fonksiyon: ' + f);
    }
    function ev(n) {
      switch (n.k) {
        case 'num': return n.v;
        case 'neg': return map1(ev(n.e), x => -x);
        case 'id': { const lo = n.v.toLowerCase(); if (lo === 'pi') return Math.PI; if (lo === 'e') return Math.E; const r = ctx.resolve(n.v); return r; }
        case 'bin': { const a = ev(n.l), b = ev(n.r); const f = {'+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '/': (x, y) => x / y, '^': Math.pow}[n.o]; return bin(a, b, f); }
        case 'call': return call(n.f, n.args.map(ev));
      }
    }
    return ev(ast);
  }
  return {run: (s, ctx) => evaluate(parse(tokenize(s)), ctx), identifiers: s => tokenize(s).filter(t => t.t === 'id').map(t => t.v)};
})();
if (typeof module !== 'undefined') module.exports = EXPR;
