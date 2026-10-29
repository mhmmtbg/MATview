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
    const RED = {var: v => { let s = 0, s2 = 0; for (const x of v) { s += x; s2 += x * x; } const n = v.length, m = s / n; return Math.max(0, (s2 - n * m * m) / (n - 1)); }, meanabs: v => { let s = 0; for (const x of v) s += Math.abs(x); return s / v.length; }, count: v => v.length, energy: v => { let s = 0; for (const x of v) s += x * x; return s; }, skew: v => { const n = v.length; let m = 0; for (const x of v) m += x; m /= n; let a = 0, b = 0; for (const x of v) { const d = x - m; a += d * d; b += d * d * d; } return (b / n) / Math.pow(a / n || 1, 1.5); }, kurt: v => { const n = v.length; let m = 0; for (const x of v) m += x; m /= n; let a = 0, b = 0; for (const x of v) { const d = x - m; a += d * d; b += d * d * d * d; } return (b / n) / Math.pow(a / n || 1, 2); }, crest: v => { let s = 0, pk = 0; for (const x of v) { s += x * x; if (Math.abs(x) > pk) pk = Math.abs(x); } return pk / (Math.sqrt(s / v.length) || 1); }, mean: v => { let s = 0; for (const x of v) s += x; return s / v.length; }, std: v => { let s = 0, s2 = 0; for (const x of v) { s += x; s2 += x * x; } const n = v.length, m = s / n; return Math.sqrt(Math.max(0, (s2 - n * m * m) / (n - 1))); }, rms: v => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s / v.length); }, max: v => { let m = -Infinity; for (const x of v) if (x > m) m = x; return m; }, min: v => { let m = Infinity; for (const x of v) if (x < m) m = x; return m; }, median: sortedMed, sum: v => { let s = 0; for (const x of v) s += x; return s; }, p2p: v => { let a = Infinity, b = -Infinity; for (const x of v) { if (x < a) a = x; if (x > b) b = x; } return b - a; }};

    const trapz = a => { const n = a.v.length, o = new Float64Array(n), dt = 1 / a.fs; let s = 0; for (let i = 1; i < n; i++) { const x = a.v[i], y = a.v[i - 1]; s += (isFinite(x) && isFinite(y) ? (x + y) * 0.5 : 0) * dt; o[i] = s; } return o; };
    const mov = (v, w, kind) => {
      const n = v.length, o = new Float64Array(n), lo0 = Math.floor(w / 2);
      if (kind === 'movmax' || kind === 'movmin') {
        const mx = kind === 'movmax', dq = new Int32Array(n); let hd = 0, tl = 0, nxt = 0;
        for (let i = 0; i < n; i++) { const hi = Math.min(n - 1, i - lo0 + w - 1); while (nxt <= hi) { while (tl > hd && (mx ? v[dq[tl - 1]] <= v[nxt] : v[dq[tl - 1]] >= v[nxt])) tl--; dq[tl++] = nxt++; } while (dq[hd] < i - lo0) hd++; o[i] = v[dq[hd]]; }
        return o;
      }
      const c1 = new Float64Array(n + 1), c2 = new Float64Array(n + 1); for (let i = 0; i < n; i++) { const x = isFinite(v[i]) ? v[i] : 0; c1[i + 1] = c1[i] + x; c2[i + 1] = c2[i] + x * x; }
      for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - lo0), hi = Math.min(n - 1, i - lo0 + w - 1), m = hi - lo + 1, s1 = c1[hi + 1] - c1[lo], s2 = c2[hi + 1] - c2[lo];
        o[i] = kind === 'movrms' ? Math.sqrt(Math.max(0, s2 / m)) : kind === 'movsum' ? s1 : Math.max(0, (s2 - s1 * s1 / m) / Math.max(1, m - 1)) ** (kind === 'movstd' ? 0.5 : 1);
      }
      return o;
    };
    const polyTrend = (v, ord) => {
      const n = v.length, m = Math.max(0, Math.min(8, ord)), K = 2 * m + 1, S = new Float64Array(K), B = new Float64Array(m + 1);
      for (let i = 0; i < n; i++) { const t = n > 1 ? 2 * i / (n - 1) - 1 : 0, y = v[i]; if (!isFinite(y)) continue; let p = 1; for (let k = 0; k < K; k++) { S[k] += p; if (k <= m) B[k] += y * p; p *= t; } }
      const A = []; for (let r = 0; r <= m; r++) { A.push([]); for (let c = 0; c <= m; c++) A[r].push(S[r + c]); A[r].push(B[r]); }
      for (let c = 0; c <= m; c++) { let pv = c; for (let r = c + 1; r <= m; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r; [A[c], A[pv]] = [A[pv], A[c]]; const d = A[c][c] || 1e-300; for (let r = 0; r <= m; r++) if (r !== c) { const q = A[r][c] / d; for (let k = c; k <= m + 1; k++) A[r][k] -= q * A[c][k]; } }
      const co = A.map((r, i) => r[m + 1] / (r[i] || 1e-300)), o = new Float64Array(n);
      for (let i = 0; i < n; i++) { const t = n > 1 ? 2 * i / (n - 1) - 1 : 0; let y = 0; for (let k = m; k >= 0; k--) y = y * t + co[k]; o[i] = y; }
      return o;
    };
    function filt(a, type, p) { a = vec(a, type); const sos = ctx.DSP.design(type, p, a.fs); return {v: ctx.DSP.filtfilt(sos, a.v), fs: a.fs, ch: a.ch}; }
    function call(f, args) {
      f = f.toLowerCase();
      if (F1[f]) { if (args.length !== 1) throw new Error(f + ' tek argüman alır'); return map1(args[0], F1[f]); }
      if (RED[f] && args.length === 1) return red(args[0], RED[f]);
      switch (f) {
        case 'integral': case 'integrate': case 'cumtrapz': { const a = vec(args[0], f); return {v: trapz(a), fs: a.fs, ch: a.ch}; }
        case 'integral2': case 'integrate2': case 'dblint': { const a = vec(args[0], f), u = {v: trapz(a), fs: a.fs}; return {v: trapz(u), fs: a.fs, ch: a.ch}; }
        case 'gradient': case 'turev': case 'deriv': { const a = vec(args[0], f), n = a.v.length, o = new Float64Array(n); if (n > 1) { for (let i = 1; i < n - 1; i++) o[i] = (a.v[i + 1] - a.v[i - 1]) * a.fs / 2; o[0] = (a.v[1] - a.v[0]) * a.fs; o[n - 1] = (a.v[n - 1] - a.v[n - 2]) * a.fs; } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'turev2': case 'deriv2': { const a = vec(args[0], f), n = a.v.length, o = new Float64Array(n), k = a.fs * a.fs; for (let i = 1; i < n - 1; i++) o[i] = (a.v[i + 1] - 2 * a.v[i] + a.v[i - 1]) * k; if (n > 2) { o[0] = o[1]; o[n - 1] = o[n - 2]; } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'movrms': case 'movstd': case 'movsum': case 'movmax': case 'movmin': case 'movvar': { const a = vec(args[0], f), w = Math.max(1, Math.round(scal(args[1], f))); return {v: mov(a.v, w, f), fs: a.fs, ch: a.ch}; }
        case 'smooth': return call('movmean', args);
        case 'zscore': { const a = vec(args[0], f), m = RED.mean(a.v), sd = RED.std(a.v) || 1; return {v: a.v.map(x => (x - m) / sd), fs: a.fs, ch: a.ch}; }
        case 'normalize': case 'rescale': { const a = vec(args[0], f), lo = RED.min(a.v), hi = RED.max(a.v), A = args.length > 2 ? scal(args[1], f) : 0, B = args.length > 2 ? scal(args[2], f) : 1, k = (B - A) / ((hi - lo) || 1); return {v: a.v.map(x => A + (x - lo) * k), fs: a.fs, ch: a.ch}; }
        case 'clip': { const a = vec(args[0], f), lo = scal(args[1], f), hi = scal(args[2], f); return {v: a.v.map(x => Math.min(hi, Math.max(lo, x))), fs: a.fs, ch: a.ch}; }
        case 'shift': { const a = vec(args[0], f), k = Math.round(scal(args[1], f)), n = a.v.length, o = new Float64Array(n); for (let i = 0; i < n; i++) { const j = i - k; o[i] = j >= 0 && j < n ? a.v[j] : NaN; } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'unwrap': { const a = vec(args[0], f), n = a.v.length, o = new Float64Array(n); let off = 0; if (n) o[0] = a.v[0]; for (let i = 1; i < n; i++) { const d = a.v[i] - a.v[i - 1]; if (d > Math.PI) off -= 2 * Math.PI * Math.ceil((d - Math.PI) / (2 * Math.PI)); else if (d < -Math.PI) off += 2 * Math.PI * Math.ceil((-d - Math.PI) / (2 * Math.PI)); o[i] = a.v[i] + off; } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'detrend': { const a = vec(args[0], f), ord = args.length > 1 ? Math.round(scal(args[1], f)) : 1, tr = polyTrend(a.v, ord), o = new Float64Array(a.v.length); for (let i = 0; i < o.length; i++) o[i] = a.v[i] - tr[i]; return {v: o, fs: a.fs, ch: a.ch}; }
        case 'trend': case 'polyfit': { const a = vec(args[0], f); return {v: polyTrend(a.v, args.length > 1 ? Math.round(scal(args[1], f)) : 1), fs: a.fs, ch: a.ch}; }
        case 'decimate': { const a = vec(args[0], f), k = Math.max(1, Math.round(scal(args[1], f))), m = Math.floor(a.v.length / k), o = new Float64Array(m); for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < k; j++) s += a.v[i * k + j]; o[i] = s / k; } return {v: o, fs: a.fs / k, ch: a.ch}; }
        case 'percentile': case 'prctile': { const a = vec(args[0], f), p = scal(args[1], f), c = Float64Array.from(a.v).sort(), q = Math.min(c.length - 1, Math.max(0, p / 100 * (c.length - 1))), i = Math.floor(q); return c[i] + (c[Math.min(c.length - 1, i + 1)] - c[i]) * (q - i); }
        case 'corr': case 'cov': { const a = vec(args[0], f), b = vec(args[1], f), n = Math.min(a.v.length, b.v.length); let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a.v[i]; sb += b.v[i]; } sa /= n; sb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a.v[i] - sa, y = b.v[i] - sb; sab += x * y; saa += x * x; sbb += y * y; } return f === 'cov' ? sab / (n - 1) : sab / Math.sqrt(saa * sbb || 1); }
        case 'diff': { const a = vec(args[0], f), o = new Float64Array(a.v.length); for (let i = 1; i < o.length; i++) o[i] = a.v[i] - a.v[i - 1]; return {v: o, fs: a.fs, ch: a.ch}; }
        case 'gradient': case 'turev': { const a = vec(args[0], f), o = new Float64Array(a.v.length); for (let i = 1; i < o.length; i++) o[i] = (a.v[i] - a.v[i - 1]) * a.fs; return {v: o, fs: a.fs, ch: a.ch}; }
        case 'cumsum': { const a = vec(args[0], f), o = new Float64Array(a.v.length); let s = 0; for (let i = 0; i < o.length; i++) { s += a.v[i]; o[i] = s; } return {v: o, fs: a.fs, ch: a.ch}; }
        case 'integrate': case 'integral': { const a = vec(args[0], f), o = new Float64Array(a.v.length); let s = 0; for (let i = 0; i < o.length; i++) { s += a.v[i] / a.fs; o[i] = s; } return {v: o, fs: a.fs, ch: a.ch}; }
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
