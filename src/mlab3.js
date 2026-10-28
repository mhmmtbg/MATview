/* ===== MATLAB alt kümesi yorumlayıcısı — 3/3: yerleşik işlevler, DSP, figür modeli ===== */
(function (ML) {
  'use strict';
  const {M, num, cplx, bool, zeros, rowv, colv, str, empty, toStr, cell, isCell, isSA, isFH, isTrue, classOf, sizeOf, castM, isInt, INT, INTNAME, CLSNAME, E} = ML;
  const B = {};
  ML.builtins = B;
  const unsup = n => function () { E('MATLAB:unsupported', `'${n}' bu uygulamada desteklenmiyor (MATLAB alt kümesi; toolbox işlevleri dahil değildir).`); };
  ['spectrogram', 'designfilt', 'cwt', 'wavedec', 'fdatool', 'sptool', 'ode45', 'ode23', 'fmincon', 'fminsearch', 'lsqnonlin', 'classdef', 'simulink', 'sim', 'uigetfile', 'uiputfile', 'input', 'keyboard', 'figure3', 'surf', 'mesh', 'contour', 'imagesc', 'imshow', 'plot3', 'scatter3', 'webread', 'system', 'eval', 'evalc', 'feval_str', 'xlsread', 'readtable', 'csvread', 'audioread', 'ifft2', 'fft2', 'conv2', 'filter2', 'resample', 'decimate', 'downsample_', 'cheby1', 'cheby2', 'ellip', 'besself', 'firpm', 'fir1', 'freqz', 'bode', 'tf', 'ss', 'lsim', 'step', 'impulse', 'kalman', 'ode15s'].forEach(n => { B[n] = unsup(n); });
  const mat = (v, n) => { if (!(v instanceof M)) E('MATLAB:invalidType', `${n || 'Argüman'} sayısal/mantıksal/karakter olmalı (${classOf(v)} verildi).`); return v; };
  const sc1 = (v, n) => { mat(v, n); if (!v.re.length) E('MATLAB:invalidType', `${n || 'Argüman'} boş olmamalı.`); return v.re[0]; };
  const S = v => toStr(v);
  const isVec = m => m.r === 1 || m.c === 1;
  const like = (m, re, im, t) => new M(m.r, m.c, re, im || null, t || 'd');
  const dbl = t => (t === 'l' || t === 'c' || t === 'd') ? 'd' : t;

  /* ---------- eleman-eleman matematik ---------- */
  function map1(name, f, fc, keepInt) {
    B[name] = function (a) {
      const m = mat(a[0], name); if (!m.re.length && !a.length) E('MATLAB:minrhs', 'Yetersiz giriş');
      if (m.im && fc) { const re = new Float64Array(m.re.length), im = new Float64Array(m.re.length); for (let i = 0; i < re.length; i++) { const q = fc(m.re[i], m.im[i]); re[i] = q[0]; im[i] = q[1]; } return ML.dropIm(like(m, re, im, 's' === m.t ? 's' : 'd')); }
      const o = new Float64Array(m.re.length); for (let i = 0; i < o.length; i++) o[i] = f(m.re[i]);
      const t = keepInt && (isInt(m.t) || m.t === 's') ? m.t : (m.t === 's' ? 's' : 'd'); const r = like(m, o, null, t); return isInt(t) ? ML.fin(r, t) : r;
    };
  }
  map1('sin', Math.sin, (a, b) => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)]); map1('cos', Math.cos, (a, b) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)]);
  map1('tan', Math.tan); map1('asin', Math.asin); map1('acos', Math.acos); map1('atan', Math.atan); map1('sinh', Math.sinh); map1('cosh', Math.cosh); map1('tanh', Math.tanh);
  map1('exp', Math.exp, (a, b) => { const e = Math.exp(a); return [e * Math.cos(b), e * Math.sin(b)]; });
  map1('sind', x => { const r = x % 180 === 0 ? 0 : Math.sin(x * Math.PI / 180); return r; }); map1('cosd', x => (x - 90) % 180 === 0 ? 0 : Math.cos(x * Math.PI / 180)); map1('tand', x => Math.tan(x * Math.PI / 180));
  map1('deg2rad', x => x * Math.PI / 180); map1('rad2deg', x => x * 180 / Math.PI);
  map1('floor', Math.floor, null, true); map1('ceil', Math.ceil, null, true); map1('fix', Math.trunc, null, true); map1('round', ML.round0 || (x => x < 0 ? -Math.round(-x) : Math.round(x)), null, true);
  map1('sign', Math.sign, null, true); map1('log1p', Math.log1p); map1('expm1', Math.expm1); map1('gamma', gammaF); map1('factorial', x => Math.round(gammaF(x + 1)));
  map1('isnan_', Number.isNaN);
  B.sqrt = function (a) { const m = mat(a[0], 'sqrt'); let neg = false; if (!m.im) for (let i = 0; i < m.re.length; i++) if (m.re[i] < 0) { neg = true; break; } if (!neg && !m.im) { const o = new Float64Array(m.re.length); for (let i = 0; i < o.length; i++) o[i] = Math.sqrt(m.re[i]); return like(m, o, null, m.t === 's' ? 's' : 'd'); } const re = new Float64Array(m.re.length), im = new Float64Array(m.re.length); for (let i = 0; i < re.length; i++) { const x = m.re[i], y = m.im ? m.im[i] : 0, r = Math.hypot(x, y); const a2 = Math.sqrt((r + x) / 2), b2 = Math.sqrt((r - x) / 2); re[i] = a2; im[i] = y < 0 ? -b2 : b2; } return ML.dropIm(like(m, re, im)); };
  const logc = (x, y, f) => [f(Math.hypot(x, y)), Math.atan2(y, x)];
  function logGen(name, f, k) {
    B[name] = function (a) { const m = mat(a[0], name); let neg = !!m.im; if (!neg) for (let i = 0; i < m.re.length; i++) if (m.re[i] < 0) { neg = true; break; } if (!neg) { const o = new Float64Array(m.re.length); for (let i = 0; i < o.length; i++) o[i] = f(m.re[i]); return like(m, o, null, m.t === 's' ? 's' : 'd'); } const re = new Float64Array(m.re.length), im = new Float64Array(m.re.length); for (let i = 0; i < re.length; i++) { re[i] = f(Math.hypot(m.re[i], m.im ? m.im[i] : 0)); im[i] = Math.atan2(m.im ? m.im[i] : 0, m.re[i]) / k; } return ML.dropIm(like(m, re, im)); };
  }
  logGen('log', Math.log, 1); logGen('log10', Math.log10, Math.LN10); logGen('log2', Math.log2, Math.LN2);
  function gammaF(x) { if (x === Math.floor(x)) { if (x <= 0) return Infinity; if (x < 171) { let r = 1; for (let i = 2; i < x; i++) r *= i; return r; } return Infinity; } if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaF(1 - x)); x -= 1; const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < g + 2; i++) a += c[i] / (x + i); return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a; }
  B.abs = function (a) { const m = mat(a[0], 'abs'); const o = new Float64Array(m.re.length); if (m.im) for (let i = 0; i < o.length; i++) o[i] = Math.hypot(m.re[i], m.im[i]); else for (let i = 0; i < o.length; i++) o[i] = Math.abs(m.re[i]); const t = (m.t === 'l' || m.t === 'c') ? 'd' : m.t; return ML.fin(like(m, o, null, t), t); };
  B.real = a => { const m = mat(a[0]); return like(m, m.re.slice(), null, dbl(m.t)); };
  B.imag = a => { const m = mat(a[0]); return like(m, m.im ? m.im.slice() : new Float64Array(m.re.length), null, 'd'); };
  B.conj = a => { const m = mat(a[0]); const o = ML.transpose(ML.transpose(m, false), false); if (m.im) { o.im = m.im.map(x => -x); } return o; };
  B.angle = B.arg = a => { const m = mat(a[0]); const o = new Float64Array(m.re.length); for (let i = 0; i < o.length; i++) o[i] = Math.atan2(m.im ? m.im[i] : 0, m.re[i]); return like(m, o); };
  B.complex = a => { const x = mat(a[0]), y = mat(a[1]); const r = ML.elementwise('+', x, ML.elementwise('.*', y, cplx(0, 1))); if (!r.im) r.im = new Float64Array(r.re.length); return r; };
  B.isreal = a => bool(a[0] instanceof M && !a[0].im);
  B.hypot = a => ML.elementwise('.^', ML.elementwise('+', ML.elementwise('.*', a[0], a[0]), ML.elementwise('.*', a[1], a[1])), num(0.5));
  function bin2(name, f) { B[name] = a => { const x = mat(a[0], name), y = mat(a[1], name); const cls = ML.outClass(x, y); const r = ML.elementwise('+', x, y); const [R, C] = [r.r, r.c]; const ra = x.r === 1 ? 0 : 1, ca = x.c === 1 ? 0 : x.r, rb = y.r === 1 ? 0 : 1, cb = y.c === 1 ? 0 : y.r; for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) r.re[i + j * R] = f(x.re[i * ra + j * ca], y.re[i * rb + j * cb]); r.t = cls === 'l' ? 'd' : cls; r.im = null; return ML.fin(r, r.t); }; }
  bin2('mod', (x, y) => y === 0 ? x : (x - Math.floor(x / y) * y)); bin2('rem', (x, y) => y === 0 ? x : x - Math.trunc(x / y) * y); bin2('atan2', Math.atan2); bin2('power_', Math.pow);
  bin2('gcd', (x, y) => { x = Math.abs(x); y = Math.abs(y); while (y) { [x, y] = [y, x % y]; } return x; }); bin2('lcm', (x, y) => { let a = Math.abs(x), b = Math.abs(y); while (b) { [a, b] = [b, a % b]; } return a ? Math.abs(x * y) / a : 0; });
  bin2('bitand', (x, y) => Number(BigInt(x) & BigInt(y))); bin2('bitor', (x, y) => Number(BigInt(x) | BigInt(y))); bin2('bitxor', (x, y) => Number(BigInt(x) ^ BigInt(y)));
  B.bitshift = a => { const x = mat(a[0]), n = sc1(a[1]); const o = new Float64Array(x.re.length); for (let i = 0; i < o.length; i++) o[i] = n >= 0 ? x.re[i] * Math.pow(2, n) : Math.floor(x.re[i] / Math.pow(2, -n)); return like(x, o, null, dbl(x.t) === 'd' ? x.t : x.t); };
  for (const [nm, op] of [['plus', '+'], ['minus', '-'], ['times', '.*'], ['rdivide', './'], ['power', '.^'], ['mtimes', '*'], ['eq', '=='], ['ne', '~='], ['lt', '<'], ['le', '<='], ['gt', '>'], ['ge', '>='], ['and', '&'], ['or', '|']]) B[nm] = a => ML.binop(op, a[0], a[1]);
  B.not = a => ML.unot(a[0]); B.uminus = a => ML.uminus(a[0]); B.xor = a => { const x = mat(a[0]), y = mat(a[1]); return ML.elementwise('~=', ML.unot(ML.unot(x)), ML.unot(ML.unot(y))); };
  B.floordiv_ = null; delete B.floordiv_; delete B.isnan_;
  B.idivide = a => { const x = mat(a[0]), y = mat(a[1]); const opt = a[2] ? S(a[2]) : 'fix'; const q = ML.elementwise('./', castM(x, 'd'), castM(y, 'd')); const f = { fix: Math.trunc, floor: Math.floor, ceil: Math.ceil, round: Math.round }[opt] || Math.trunc; for (let i = 0; i < q.re.length; i++) q.re[i] = f(q.re[i]); return castM(q, isInt(x.t) ? x.t : y.t); };

  /* ---------- sabitler ve oluşturucular ---------- */
  const k = (n, v) => { B[n] = function (a) { if (!a.length) return num(v); const [r, c] = dims(a); const m = zeros(r, c); m.re.fill(v); return m; }; };
  function dims(a, from) {
    const args = a.filter(x => !(x instanceof M && x.t === 'c')); let r, c;
    if (!args.length) return [1, 1];
    if (args.length === 1) { const m = args[0]; if (m.re.length === 1) { r = c = m.re[0]; } else { r = m.re[0]; c = m.re[1]; } } else { r = sc1(args[0]); c = sc1(args[1]); }
    r = Math.max(0, Math.floor(r)); c = Math.max(0, Math.floor(c)); if (r * c > 2e8) E('MATLAB:pmaxsize', 'Dizi çok büyük (bellek sınırı).'); return [r, c];
  }
  function cls(a) { const s = a.find(x => x instanceof M && x.t === 'c'); if (!s) return 'd'; const n = S(s); if (n === 'like') return 'd'; return INTNAME[n] || (n === 'single' ? 's' : n === 'logical' ? 'l' : 'd'); }
  B.zeros = a => { const [r, c] = dims(a); return zeros(r, c, cls(a)); };
  B.ones = a => { const [r, c] = dims(a); const m = zeros(r, c, cls(a)); m.re.fill(1); return m; };
  B.nan = B.NaN = a => { if (!a.length) return num(NaN); const [r, c] = dims(a); const m = zeros(r, c); m.re.fill(NaN); return m; };
  B.inf = B.Inf = a => { if (!a.length) return num(Infinity); const [r, c] = dims(a); const m = zeros(r, c); m.re.fill(Infinity); return m; };
  B.pi = () => num(Math.PI); B.eps = a => { if (a.length) { const x = Math.abs(sc1(a[0])); if (x === 0) return num(Math.pow(2, -1074)); return num(Math.pow(2, Math.floor(Math.log2(x)) - 52)); } return num(2.220446049250313e-16); };
  B.i = B.j = B.I = B.J = () => cplx(0, 1); B.e_ = null; delete B.e_;
  B['true'] = a => { const [r, c] = dims(a); const m = zeros(r, c, 'l'); m.re.fill(1); return m; }; B['false'] = a => { const [r, c] = dims(a); return zeros(r, c, 'l'); };
  B.realmax = () => num(Number.MAX_VALUE); B.realmin = () => num(2.2250738585072014e-308); B.intmax = a => { const n = a.length ? S(a[0]) : 'int32'; const t = INTNAME[n]; if (!t) E('MATLAB:intmax', 'Geçersiz tamsayı sınıfı: ' + n); return num(INT[t][1], t); }; B.intmin = a => { const n = a.length ? S(a[0]) : 'int32'; const t = INTNAME[n]; return num(INT[t][0], t); }; B.flintmax = () => num(9007199254740992);
  B.eye = a => { const [r, c] = dims(a); const m = zeros(r, c); for (let i = 0; i < Math.min(r, c); i++) m.re[i + i * r] = 1; return m; };
  B.linspace = a => { const x0 = sc1(a[0]), x1 = sc1(a[1]), n = a.length > 2 ? Math.floor(sc1(a[2])) : 100; const o = new Float64Array(Math.max(n, 1)); for (let i = 0; i < n; i++) o[i] = n === 1 ? x1 : x0 + (x1 - x0) * i / (n - 1); if (n >= 2) o[n - 1] = x1; return rowv(o); };
  B.logspace = a => { const l = B.linspace([a[0], a[1], a[2] || num(50)]); for (let i = 0; i < l.re.length; i++) l.re[i] = Math.pow(10, l.re[i]); return l; };
  B.colon = a => ML.range(sc1(a[0]), a.length > 2 ? sc1(a[1]) : 1, sc1(a[a.length - 1]));
  B.repmat = function (a) {
    const x = a[0]; let rn, cn; if (a.length === 2) { const m = a[1]; rn = m.re[0]; cn = m.re.length > 1 ? m.re[1] : m.re[0]; } else { rn = sc1(a[1]); cn = sc1(a[2]); } rn = Math.max(0, rn); cn = Math.max(0, cn);
    const row = []; for (let j = 0; j < cn; j++) row.push(x); const rowM = cn === 0 ? (isCell(x) ? cell(0, 0, []) : zeros(x.r, 0, x.t)) : ML.hcat(row); const col = []; for (let i = 0; i < rn; i++) col.push(rowM); return rn === 0 ? (isCell(x) ? cell(0, 0, []) : zeros(0, rowM.c, x.t)) : ML.vcat(col);
  };
  B.rand = a => { const [r, c] = dims(a.filter(x => !(x instanceof M && x.t === 'c'))); const m = zeros(r, c); for (let i = 0; i < m.re.length; i++) m.re[i] = Math.random(); return m; };
  function randn1() { let u = 0, v = 0; while (u === 0) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  B.randn = a => { const [r, c] = dims(a.filter(x => !(x instanceof M && x.t === 'c'))); const m = zeros(r, c); for (let i = 0; i < m.re.length; i++) m.re[i] = randn1(); return m; };
  B.randi = a => { const lim = a[0]; let lo = 1, hi; if (lim.re.length > 1) { lo = lim.re[0]; hi = lim.re[1]; } else hi = lim.re[0]; const [r, c] = dims(a.slice(1)); const m = zeros(r, c); for (let i = 0; i < m.re.length; i++) m.re[i] = lo + Math.floor(Math.random() * (hi - lo + 1)); return m; };
  B.randperm = a => { const n = sc1(a[0]), o = Array.from({length: n}, (_, i) => i + 1); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return rowv(o); };
  B.diag = a => { const m = mat(a[0]); if (isVec(m)) { const n = m.re.length, o = zeros(n, n); for (let i = 0; i < n; i++) o.re[i + i * n] = m.re[i]; return o; } const n = Math.min(m.r, m.c), o = zeros(n, 1); for (let i = 0; i < n; i++) o.re[i] = m.re[i + i * m.r]; return o; };
  B.meshgrid = (a, no) => { const x = a[0], y = a[1] || a[0]; const nx = x.re.length, ny = y.re.length; const X = zeros(ny, nx), Y = zeros(ny, nx); for (let j = 0; j < nx; j++) for (let i = 0; i < ny; i++) { X.re[i + j * ny] = x.re[j]; Y.re[i + j * ny] = y.re[i]; } return [X, Y]; };

  /* ---------- boyut / tür ---------- */
  B.size = function (a, no) {
    const [r, c] = sizeOf(a[0]);
    if (a.length > 1) { const d = sc1(a[1]); return num(d === 1 ? r : d === 2 ? c : 1); }
    if (no <= 1) return rowv([r, c]); const o = [num(r), num(c)]; for (let i = 2; i < no; i++) o.push(num(1)); return o;
  };
  B.numel = a => num(sizeOf(a[0])[0] * sizeOf(a[0])[1]); B.length = a => { const [r, c] = sizeOf(a[0]); return num(r * c === 0 ? 0 : Math.max(r, c)); }; B.ndims = () => num(2);
  B.rows = a => num(sizeOf(a[0])[0]); B.columns = a => num(sizeOf(a[0])[1]);
  B.isempty = a => bool(a[0] instanceof M || isCell(a[0]) || isSA(a[0]) ? sizeOf(a[0])[0] * sizeOf(a[0])[1] === 0 : false);
  B.isscalar = a => bool(sizeOf(a[0])[0] * sizeOf(a[0])[1] === 1); B.isvector = a => { const [r, c] = sizeOf(a[0]); return bool((r === 1 || c === 1) && r * c >= 1); };
  B.isrow = a => bool(sizeOf(a[0])[0] === 1); B.iscolumn = a => bool(sizeOf(a[0])[1] === 1); B.ismatrix = () => bool(true);
  B.isnumeric = a => bool(a[0] instanceof M && a[0].t !== 'c' && a[0].t !== 'l'); B.ischar = a => bool(a[0] instanceof M && a[0].t === 'c'); B.islogical = a => bool(a[0] instanceof M && a[0].t === 'l');
  B.iscell = a => bool(isCell(a[0])); B.isstruct = a => bool(isSA(a[0])); B.isa = a => { const c = classOf(a[0]), q = S(a[1]); return bool(c === q || (q === 'numeric' && a[0] instanceof M && !['c', 'l'].includes(a[0].t)) || (q === 'float' && ['d', 's'].includes(a[0].t)) || (q === 'integer' && isInt(a[0].t))); };
  B.is_function_handle = B.isfunction_handle = a => bool(isFH(a[0])); B.isfloat = a => bool(a[0] instanceof M && (a[0].t === 'd' || a[0].t === 's')); B.isinteger = a => bool(a[0] instanceof M && isInt(a[0].t));
  B.class = a => str(classOf(a[0]));
  for (const [n, t] of [['double', 'd'], ['single', 's'], ['logical', 'l'], ...Object.entries(INTNAME)]) B[n] = a => { const m = a[0]; if (!(m instanceof M)) E('MATLAB:invalidType', `${n}: yalnız sayısal dizilere uygulanabilir (${classOf(m)}).`); return castM(m, t); };
  B.char = function (a) { if (a.length === 1 && a[0] instanceof M) { const m = castM(a[0], 'd'); m.t = 'c'; return m; } const rows = []; for (const x of a) { if (isCell(x)) for (const y of x.v) rows.push(S(y)); else rows.push(S(x)); } const w = Math.max(...rows.map(s => s.length)); return ML.vcat(rows.map(s => str(s.padEnd(w)))); };
  B.cast = a => B[S(a[1])]([a[0]]); B.isnan = a => { const m = mat(a[0]); const o = zeros(m.r, m.c, 'l'); for (let i = 0; i < o.re.length; i++) o.re[i] = Number.isNaN(m.re[i]) || (m.im && Number.isNaN(m.im[i])) ? 1 : 0; return o; };
  B.isinf = a => { const m = mat(a[0]); const o = zeros(m.r, m.c, 'l'); for (let i = 0; i < o.re.length; i++) o.re[i] = Math.abs(m.re[i]) === Infinity ? 1 : 0; return o; }; B.isfinite = a => { const m = mat(a[0]); const o = zeros(m.r, m.c, 'l'); for (let i = 0; i < o.re.length; i++) o.re[i] = Number.isFinite(m.re[i]) ? 1 : 0; return o; };
  B.reshape = function (a) { const x = a[0]; let r, c; const n = sizeOf(x)[0] * sizeOf(x)[1]; if (a.length === 2) { r = a[1].re[0]; c = a[1].re[1]; } else { r = a[1].re.length ? a[1].re[0] : NaN; c = a[2].re.length ? a[2].re[0] : NaN; if (!a[1].re.length) r = n / c; if (!a[2].re.length) c = n / r; } if (r * c !== n) E('MATLAB:getReshapeDims:notSameNumel', `reshape: eleman sayısı değişemez (${n} → ${r}×${c}).`); if (isCell(x)) return {cell: true, r, c, v: x.v.slice()}; const o = new M(r, c, x.re.slice(), x.im ? x.im.slice() : null, x.t); return o; };
  B.squeeze = a => a[0]; B.vec_ = null; delete B.vec_;
  B.numel_ = null; delete B.numel_;
  B.transpose = a => ML.transpose(a[0], false); B.ctranspose = a => ML.transpose(a[0], true);
  B.horzcat = a => ML.hcat(a); B.vertcat = a => ML.vcat(a); B.cat = a => sc1(a[0]) === 1 ? ML.vcat(a.slice(1)) : ML.hcat(a.slice(1));
  B.fliplr = a => { const m = a[0]; const idx = []; for (let j = m.c; j >= 1; j--) idx.push(j); return ML.readM(m, [ML.COLON, rowv(idx)]); };
  B.flipud = a => { const m = a[0]; const idx = []; for (let j = m.r; j >= 1; j--) idx.push(j); return ML.readM(m, [rowv(idx), ML.COLON]); };
  B.flip = a => { const m = a[0]; const d = a[1] ? sc1(a[1]) : (m.r === 1 ? 2 : 1); return d === 1 ? B.flipud([m]) : B.fliplr([m]); };
  B.circshift = a => { const m = a[0]; const n = sc1(a[1]); const d = a[2] ? sc1(a[2]) : (m.r === 1 ? 2 : 1); const L = d === 1 ? m.r : m.c; const idx = []; for (let i = 0; i < L; i++) idx.push(((i - n) % L + L) % L + 1); return d === 1 ? ML.readM(m, [rowv(idx), ML.COLON]) : ML.readM(m, [ML.COLON, rowv(idx)]); };
  B.triu = a => { const m = ML.transpose(ML.transpose(a[0])); const kk = a[1] ? sc1(a[1]) : 0; for (let j = 0; j < m.c; j++) for (let i = 0; i < m.r; i++) if (j - i < kk) m.re[i + j * m.r] = 0; return m; }; B.tril = a => { const m = ML.transpose(ML.transpose(a[0])); const kk = a[1] ? sc1(a[1]) : 0; for (let j = 0; j < m.c; j++) for (let i = 0; i < m.r; i++) if (j - i > kk) m.re[i + j * m.r] = 0; return m; };
  B.inv = a => { const m = mat(a[0]); if (m.r !== m.c) E('MATLAB:square', 'inv: matris kare olmalı.'); return ML.solve(m, ML.eye(m.r)); };
  B.det = a => { const m = mat(a[0]); if (m.r !== m.c) E('MATLAB:square', 'det: matris kare olmalı.'); const n = m.r, x = m.re.slice(); let d = 1; for (let c = 0; c < n; c++) { let p = c, mx = Math.abs(x[c + c * n]); for (let r = c + 1; r < n; r++) if (Math.abs(x[r + c * n]) > mx) { mx = Math.abs(x[r + c * n]); p = r; } if (mx === 0) return num(0); if (p !== c) { for (let j = 0; j < n; j++) { const t = x[c + j * n]; x[c + j * n] = x[p + j * n]; x[p + j * n] = t; } d = -d; } d *= x[c + c * n]; for (let r = c + 1; r < n; r++) { const f = x[r + c * n] / x[c + c * n]; for (let j = c; j < n; j++) x[r + j * n] -= f * x[c + j * n]; } } return num(d); };
  B.trace = a => { const m = mat(a[0]); let s = 0; for (let i = 0; i < Math.min(m.r, m.c); i++) s += m.re[i + i * m.r]; return num(s); };
  B.dot = a => { const x = mat(a[0]), y = mat(a[1]); if (x.re.length !== y.re.length) E('MATLAB:dot:InputSizeMismatch', 'dot: vektör uzunlukları eşit olmalı.'); let s = 0; for (let i = 0; i < x.re.length; i++) s += x.re[i] * y.re[i]; return num(s); };
  B.cross = a => { const x = a[0].re, y = a[1].re; return like(a[0], Float64Array.of(x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0])); };
  B.kron = a => { const x = a[0], y = a[1]; const o = zeros(x.r * y.r, x.c * y.c); for (let i = 0; i < x.r; i++) for (let j = 0; j < x.c; j++) for (let p = 0; p < y.r; p++) for (let q = 0; q < y.c; q++) o.re[i * y.r + p + (j * y.c + q) * o.r] = x.re[i + j * x.r] * y.re[p + q * y.r]; return o; };

  /* ---------- indirgemeler ---------- */
  // f(sütun Float64Array) → sayı; sütun-yönlü (vektörse tüm vektör)
  function reduce(a, name, f, opt) {
    const m = mat(a[0], name); let d = a.length > 1 && a[1] instanceof M && a[1].t !== 'c' && a[1].re.length ? a[1].re[0] : (m.r === 1 ? 2 : 1);
    if (m.re.length === 0 && m.r === 0 && m.c === 0) return num(f(new Float64Array(0), m), 'd');
    if (d === 1) { const o = zeros(1, m.c); for (let j = 0; j < m.c; j++) o.re[j] = f(m.re.subarray(j * m.r, (j + 1) * m.r), m); return o; }
    const o = zeros(m.r, 1), tmp = new Float64Array(m.c); for (let i = 0; i < m.r; i++) { for (let j = 0; j < m.c; j++) tmp[j] = m.re[i + j * m.r]; o.re[i] = f(tmp, m); } return o;
  }
  const sumF = x => { let s = 0, c = 0; for (let i = 0; i < x.length; i++) { const y = x[i] - c, t = s + y; c = (t - s) - y; s = t; } return Number.isFinite(s) ? s : x.reduce((p, q) => p + q, 0); };
  const nanless = x => { let k = 0; const o = new Float64Array(x.length); for (let i = 0; i < x.length; i++) if (!Number.isNaN(x[i])) o[k++] = x[i]; return o.subarray(0, k); };
  const omitnan = a => a.some(x => x instanceof M && x.t === 'c' && S(x).toLowerCase() === 'omitnan');
  const wrapNaN = (a, f) => omitnan(a) ? x => f(nanless(x)) : f;
  B.sum = a => { const m = mat(a[0]); const r = reduce(a, 'sum', wrapNaN(a, sumF)); if (m.im) { const ri = reduce([like(m, m.im)].concat(a.slice(1)), 'sum', sumF); r.im = ri.re; return ML.dropIm(r); } if (isInt(m.t)) { r.t = m.t; ML.fin(r, m.t); } return r; };
  B.prod = a => reduce(a, 'prod', wrapNaN(a, x => { let p = 1; for (let i = 0; i < x.length; i++) p *= x[i]; return p; }));
  B.mean = a => { const m = mat(a[0]); if (a.length > 0 && m.im) E('MATLAB:unsupported', 'mean: karmaşık giriş desteklenmiyor.'); return reduce(a, 'mean', wrapNaN(a, x => x.length ? sumF(x) / x.length : NaN)); };
  B.median = a => reduce(a, 'median', wrapNaN(a, x => { if (!x.length) return NaN; for (let i = 0; i < x.length; i++) if (Number.isNaN(x[i])) return NaN; const s = Float64Array.from(x).sort(); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }));
  const varF = (x, flag) => { const n = x.length; if (n === 0) return NaN; if (n === 1) return 0; const mu = sumF(x) / n; let s = 0; for (let i = 0; i < n; i++) s += (x[i] - mu) ** 2; return s / (flag === 1 ? n : n - 1); };
  B['var'] = a => { const fl = a.length > 1 && a[1].re.length ? a[1].re[0] : 0; return reduce([a[0]].concat(a.slice(2)), 'var', wrapNaN(a, x => varF(x, fl))); };
  B.std = a => { const fl = a.length > 1 && a[1].re.length ? a[1].re[0] : 0; const r = reduce([a[0]].concat(a.slice(2)), 'std', wrapNaN(a, x => Math.sqrt(varF(x, fl)))); return r; };
  B.rms = a => reduce(a, 'rms', wrapNaN(a, x => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }));
  B.range = a => reduce(a, 'range', x => { let lo = Infinity, hi = -Infinity; for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo; });
  B.mode = a => reduce(a, 'mode', x => { const s = Float64Array.from(x).sort(); let best = NaN, bc = 0, cur = 0; for (let i = 0; i < s.length; i++) { cur = i && s[i] === s[i - 1] ? cur + 1 : 1; if (cur > bc) { bc = cur; best = s[i]; } } return best; });
  B.skewness = a => reduce(a, 'skewness', x => { const n = x.length, mu = sumF(x) / n; let m2 = 0, m3 = 0; for (const v of x) { m2 += (v - mu) ** 2; m3 += (v - mu) ** 3; } m2 /= n; m3 /= n; return m3 / Math.pow(m2, 1.5); });
  B.kurtosis = a => reduce(a, 'kurtosis', x => { const n = x.length, mu = sumF(x) / n; let m2 = 0, m4 = 0; for (const v of x) { m2 += (v - mu) ** 2; m4 += (v - mu) ** 4; } m2 /= n; m4 /= n; return m4 / (m2 * m2); });
  B.any = a => { const m = mat(a[0]); const r = reduce(a, 'any', x => { for (const v of x) if (v !== 0 && !Number.isNaN(v) || Number.isNaN(v)) return 1; return 0; }); r.t = 'l'; if (m.re.length === 0) return bool(false); return r; };
  B.all = a => { const m = mat(a[0]); const r = reduce(a, 'all', x => { for (const v of x) if (v === 0) return 0; return 1; }); r.t = 'l'; if (m.re.length === 0) return bool(true); return r; };
  B.nnz = a => num(Array.from(mat(a[0]).re).filter(x => x !== 0).length);
  function minmax(name, sgn) {
    B[name] = function (a, no) {
      const x = mat(a[0], name);
      if (a.length >= 2 && a[1].re.length) { const y = mat(a[1]); const r = ML.elementwise('+', x, y); const R = r.r, C = r.c, ra = x.r === 1 ? 0 : 1, ca = x.c === 1 ? 0 : x.r, rb = y.r === 1 ? 0 : 1, cb = y.c === 1 ? 0 : y.r; for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { const p = x.re[i * ra + j * ca], q = y.re[i * rb + j * cb]; r.re[i + j * R] = Number.isNaN(p) ? q : Number.isNaN(q) ? p : (sgn * p >= sgn * q ? p : q); } r.t = ML.outClass(x, y); r.im = null; return r; }
      const d = a.length > 2 ? sc1(a[2]) : (x.r === 1 ? 2 : 1);
      if (x.re.length === 0) return [empty(), empty()];
      const cmpv = x.im ? (i => Math.hypot(x.re[i], x.im[i])) : (i => x.re[i]);
      const pick = (idxs) => { let bi = -1, bv = 0; for (const i of idxs) { const v = cmpv(i); if (Number.isNaN(v)) continue; if (bi < 0 || sgn * v > sgn * bv) { bi = i; bv = v; } } return bi; };
      const out = d === 1 ? zeros(1, x.c, x.t) : zeros(x.r, 1, x.t), ix = zeros(out.r, out.c); if (x.im) out.im = new Float64Array(out.re.length);
      const n1 = d === 1 ? x.c : x.r, n2 = d === 1 ? x.r : x.c;
      for (let p = 0; p < n1; p++) { const idxs = []; for (let q = 0; q < n2; q++) idxs.push(d === 1 ? q + p * x.r : p + q * x.r); const bi = pick(idxs); if (bi < 0) { out.re[p] = NaN; ix.re[p] = 1; } else { out.re[p] = x.re[bi]; if (x.im) out.im[p] = x.im[bi]; ix.re[p] = idxs.indexOf(bi) + 1; } }
      return no > 1 ? [out, ix] : out;
    };
  }
  minmax('max', 1); minmax('min', -1);
  B.cumsum = a => cumulative(a, (p, v) => p + v, 0); B.cumprod = a => cumulative(a, (p, v) => p * v, 1);
  B.cummax = a => cumulative(a, (p, v, f) => f ? v : Math.max(p, v), NaN); B.cummin = a => cumulative(a, (p, v, f) => f ? v : Math.min(p, v), NaN);
  function cumulative(a, f, init) {
    const m = mat(a[0]); const d = a.length > 1 ? sc1(a[1]) : (m.r === 1 ? 2 : 1); const o = zeros(m.r, m.c, dbl(m.t) === 'd' ? 'd' : m.t);
    if (d === 1) for (let j = 0; j < m.c; j++) { let acc = init; for (let i = 0; i < m.r; i++) { acc = f(acc, m.re[i + j * m.r], i === 0); o.re[i + j * m.r] = acc; } }
    else for (let i = 0; i < m.r; i++) { let acc = init; for (let j = 0; j < m.c; j++) { acc = f(acc, m.re[i + j * m.r], j === 0); o.re[i + j * m.r] = acc; } }
    return o;
  }
  B.diff = function (a) {
    let m = mat(a[0]); let n = a.length > 1 ? sc1(a[1]) : 1;
    for (let k = 0; k < n; k++) {
      if (m.r === 1 || m.c === 1) { const L = m.re.length; if (L <= 1) return zeros(m.r === 1 ? 1 : 0, m.r === 1 ? 0 : 1); const o = new Float64Array(L - 1); for (let i = 0; i < L - 1; i++) o[i] = m.re[i + 1] - m.re[i]; m = m.r === 1 ? new M(1, L - 1, o) : new M(L - 1, 1, o); }
      else { const o = zeros(m.r - 1, m.c); for (let j = 0; j < m.c; j++) for (let i = 0; i < m.r - 1; i++) o.re[i + j * o.r] = m.re[i + 1 + j * m.r] - m.re[i + j * m.r]; m = o; }
    }
    return m;
  };
  B.sort = function (a, no) {
    const x = a[0];
    if (isCell(x)) { const strs = x.v.map(S); const ix = strs.map((_, i) => i).sort((p, q) => strs[p] < strs[q] ? -1 : strs[p] > strs[q] ? 1 : p - q); const desc = a.some(z => z instanceof M && z.t === 'c' && S(z) === 'descend'); if (desc) ix.reverse(); const o = {cell: true, r: x.r, c: x.c, v: ix.map(i => x.v[i])}; return no > 1 ? [o, colv(ix.map(i => i + 1))] : o; }
    const m = mat(x); const desc = a.some(z => z instanceof M && z.t === 'c' && S(z).toLowerCase() === 'descend'); const dd = a.find(z => z instanceof M && z.t !== 'c' && z !== x); const d = dd ? dd.re[0] : (m.r === 1 ? 2 : 1);
    const o = new M(m.r, m.c, new Float64Array(m.re.length), m.im ? new Float64Array(m.re.length) : null, m.t), ix = zeros(m.r, m.c);
    const key = m.im ? (i => Math.hypot(m.re[i], m.im[i])) : (i => m.re[i]);
    const n1 = d === 1 ? m.c : m.r, n2 = d === 1 ? m.r : m.c;
    for (let p = 0; p < n1; p++) {
      const idxs = new Array(n2); for (let q = 0; q < n2; q++) idxs[q] = d === 1 ? q + p * m.r : p + q * m.r;
      const ks = idxs.map(key);
      const ord = Array.from({length: n2}, (_, q) => q).sort((u, v) => { const A = ks[u], Bk = ks[v]; const an = Number.isNaN(A), bn = Number.isNaN(Bk); if (an || bn) return an && bn ? u - v : an ? (desc ? -1 : 1) : (desc ? 1 : -1); return (desc ? Bk - A : A - Bk) || u - v; });
      ord.forEach((q, t) => { const dst = d === 1 ? t + p * m.r : p + t * m.r; o.re[dst] = m.re[idxs[q]]; if (o.im) o.im[dst] = m.im[idxs[q]]; ix.re[dst] = q + 1; });
    }
    return no > 1 ? [o, ix] : o;
  };
  B.sortrows = function (a, no) { const m = mat(a[0]); const cols = a[1] ? Array.from(a[1].re) : [1]; const ord = Array.from({length: m.r}, (_, i) => i).sort((p, q) => { for (const c of cols) { const j = Math.abs(c) - 1, s = c < 0 ? -1 : 1; const d = m.re[p + j * m.r] - m.re[q + j * m.r]; if (d) return s * d; } return p - q; }); const idx = ord.map(i => i + 1); const o = ML.readM(m, [colv(idx), ML.COLON]); return no > 1 ? [o, colv(idx)] : o; };
  B.find = function (a, no) {
    const m = mat(a[0]); const lim = a.length > 1 ? sc1(a[1]) : Infinity; const dir = a.length > 2 ? S(a[2]) : 'first'; const ix = [];
    if (dir === 'last') { for (let i = m.re.length - 1; i >= 0 && ix.length < lim; i--) if (m.re[i] !== 0 || (m.im && m.im[i])) ix.unshift(i); } else for (let i = 0; i < m.re.length && ix.length < lim; i++) if (m.re[i] !== 0 || (m.im && m.im[i])) ix.push(i);
    const mk = arr => (m.r === 1 && m.c !== 1) ? rowv(arr) : colv(arr);
    if (no >= 2) return [mk(ix.map(i => i % m.r + 1)), mk(ix.map(i => Math.floor(i / m.r) + 1))]; return mk(ix.map(i => i + 1));
  };
  B.unique = function (a, no) {
    const x = a[0]; if (isCell(x)) { const strs = Array.from(new Set(x.v.map(S))).sort(); return {cell: true, r: strs.length, c: 1, v: strs.map(str)}; }
    const m = mat(x); const pairs = Array.from(m.re, (v, i) => [v, i]).sort((p, q) => p[0] - q[0] || p[1] - q[1]); const vals = [], first = [], last = []; const inv = new Float64Array(m.re.length);
    for (const [v, i] of pairs) { if (!vals.length || vals[vals.length - 1] !== v) { vals.push(v); first.push(i); last.push(i); } else last[last.length - 1] = i; inv[i] = vals.length; }
    const row = m.r === 1 && m.c > 1; const mk = arr => row ? rowv(arr, m.t) : colv(arr, m.t);
    const useFirst = a.some(z => z instanceof M && z.t === 'c' && S(z) === 'first'); const sel = useFirst ? first : last;
    if (no <= 1) return mk(vals); return [mk(vals), colv(sel.map(i => i + 1)), colv(Array.from(inv))];
  };
  B.ismember = function (a, no) {
    const x = a[0], s = a[1];
    if (x instanceof M && x.t === 'c' && isCell(s)) { const t = S(x), i = s.v.findIndex(y => S(y) === t); return no > 1 ? [bool(i >= 0), num(i + 1)] : bool(i >= 0); }
    if (isCell(x)) { const set = s.v.map(S); const o = zeros(x.r, x.c, 'l'); x.v.forEach((y, i) => { o.re[i] = set.includes(S(y)) ? 1 : 0; }); return o; }
    const m = mat(x), t = mat(s); const mp = new Map(); for (let i = t.re.length - 1; i >= 0; i--) mp.set(t.re[i], i); const o = zeros(m.r, m.c, 'l'), loc = zeros(m.r, m.c); for (let i = 0; i < m.re.length; i++) { const p = mp.get(m.re[i]); if (p !== undefined) { o.re[i] = 1; loc.re[i] = p + 1; } } return no > 1 ? [o, loc] : o;
  };
  const setOp = (name, f) => { B[name] = a => { if (isCell(a[0])) { const A = a[0].v.map(S), Bb = a[1].v.map(S); const r = f(A, Bb, (x, y) => x === y); const u = Array.from(new Set(r)).sort(); return {cell: true, r: u.length, c: 1, v: u.map(str)}; } const x = mat(a[0]), y = mat(a[1]); const r = f(Array.from(x.re), Array.from(y.re)); const u = Array.from(new Set(r)).sort((p, q) => p - q); return (x.c === 1 && x.r > 1 || y.c === 1 && y.r > 1) && !(x.r === 1 && y.r === 1) ? colv(u) : rowv(u); }; };
  setOp('union', (A, Bb) => A.concat(Bb)); setOp('intersect', (A, Bb) => A.filter(v => Bb.includes(v))); setOp('setdiff', (A, Bb) => A.filter(v => !Bb.includes(v)));
  B.histc = a => { const x = mat(a[0]), e = mat(a[1]); const o = zeros(e.r, e.c); for (const v of x.re) { for (let i = e.re.length - 1; i >= 0; i--) if (v >= e.re[i]) { if (i === e.re.length - 1 && v !== e.re[i]) break; o.re[i]++; break; } } return o; };
  B.cov = a => { const x = mat(a[0]); if (a.length > 1) { const y = mat(a[1]); const n = x.re.length, mx = sumF(x.re) / n, my = sumF(y.re) / n; let s = 0; for (let i = 0; i < n; i++) s += (x.re[i] - mx) * (y.re[i] - my); const c = s / (n - 1); const vx = varF(x.re), vy = varF(y.re); return new M(2, 2, Float64Array.of(vx, c, c, vy)); } return num(varF(x.re)); };
  B.corrcoef = a => { const x = mat(a[0]), y = mat(a[1]); const n = x.re.length, mx = sumF(x.re) / n, my = sumF(y.re) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const p = x.re[i] - mx, q = y.re[i] - my; sxy += p * q; sxx += p * p; syy += q * q; } const r = sxy / Math.sqrt(sxx * syy); return new M(2, 2, Float64Array.of(1, r, r, 1)); };
  B.corr = a => num(B.corrcoef(a).re[1]);
  B.prctile = a => { const x = Float64Array.from(mat(a[0]).re).sort(), p = mat(a[1]); const n = x.length; return like(p, Float64Array.from(p.re, q => { const pos = q / 100 * n + 0.5; if (pos <= 1) return x[0]; if (pos >= n) return x[n - 1]; const lo = Math.floor(pos); return x[lo - 1] + (pos - lo) * (x[lo] - x[lo - 1]); })); };
  B.quantile = a => B.prctile([a[0], ML.elementwise('.*', a[1], num(100))]);
  B.cumtrapz = a => { const y = a.length > 1 ? a[1] : a[0], x = a.length > 1 ? a[0] : null; const o = zeros(y.r, y.c); let s = 0; for (let i = 1; i < y.re.length; i++) { s += (x ? x.re[i] - x.re[i - 1] : 1) * (y.re[i] + y.re[i - 1]) / 2; o.re[i] = s; } return o; };
  B.trapz = a => { const c = B.cumtrapz(a); return num(c.re.length ? c.re[c.re.length - 1] : 0); };

  /* ---------- metin ---------- */
  B.num2str = function (a) {
    const x = a[0]; if (x instanceof M && x.t === 'c') return x; const m = mat(x);
    if (a.length > 1) { if (a[1].t === 'c') return str(ML.sprintfImpl(S(a[1]), [m])); const p = sc1(a[1]); return str(m.re.length === 1 ? ML.fmtG(m.re[0], p) : Array.from(m.re, v => ML.fmtG(v, p)).join('  ')); }
    const f1 = v => { if (Number.isNaN(v)) return 'NaN'; if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf'; if (v === Math.floor(v)) return String(v); return ML.fmtG(v, Math.max(Math.floor(Math.log10(Math.abs(v))) + 5, 5)); };
    if (m.im) { const s = f1(m.re[0]) + (m.im[0] < 0 ? '-' : '+') + f1(Math.abs(m.im[0])) + 'i'; return str(s); }
    if (m.re.length === 1) return str(f1(m.re[0]));
    const rows = []; for (let i = 0; i < m.r; i++) { const parts = []; for (let j = 0; j < m.c; j++) parts.push(f1(m.re[i + j * m.r])); rows.push(parts); }
    const w = Math.max(...rows.flat().map(s => s.length)) + 2; return ML.vcat(rows.map(r => str(r.map(s => s.padStart(w)).join('').replace(/^\s+/, ''))).map((s, i, arr) => s)).t ? ML.vcat(rows.map(r => str(r.map(s => s.padStart(w)).join('')))) : str('');
  };
  B.int2str = a => B.num2str([B.round([a[0]])]); B.mat2str = a => { const m = mat(a[0]); const f = v => m.t === 'l' ? (v ? 'true' : 'false') : ML.fmtG(v, 15); if (m.re.length === 1) return str(f(m.re[0])); const rows = []; for (let i = 0; i < m.r; i++) { const p = []; for (let j = 0; j < m.c; j++) p.push(f(m.re[i + j * m.r])); rows.push(p.join(' ')); } return str('[' + rows.join(';') + ']'); };
  B.str2num = B.str2double = function (a, no, sc, stmt) { const x = a[0]; if (isCell(x)) { const o = zeros(x.r, x.c); x.v.forEach((y, i) => { o.re[i] = parse1(y); }); return o; } if (!(x instanceof M && x.t === 'c')) return num(NaN); return num(parse1(x)); };
  function parse1(y) { if (!(y instanceof M && y.t === 'c')) return NaN; const s = S(y).trim(); if (!s) return NaN; if (/^[+-]?(inf|Inf)$/.test(s)) return s[0] === '-' ? -Infinity : Infinity; if (/^nan$/i.test(s)) return NaN; const v = Number(s.replace(/,/g, '')); return Number.isNaN(v) ? NaN : v; }
  B.sprintf = a => str(ML.sprintfImpl(S(a[0]), a.slice(1)));
  B.fprintf = function (a) { let fid = 1, rest = a; if (a[0] instanceof M && a[0].t !== 'c' && a[0].re.length === 1 && a.length >= 1 && (a.length === 1 ? false : true)) { fid = a[0].re[0]; rest = a.slice(1); } const s = ML.sprintfImpl(S(rest[0]), rest.slice(1)); if (fid === 2) this.out(s, 'err'); else this.out(s); };
  B.disp = function (a) { const v = a[0]; if (v instanceof M) { if (v.t === 'c') this.out(Array.from({length: v.r}, (_, i) => ML.rowStr(v, i)).join('\n') + (v.r === 0 ? '' : '') + '\n'); else if (v.re.length === 1) this.out(ML.fmtScalar(v, 0) + '\n'); else if (v.re.length === 0) this.out(''); else this.out(ML.fmtMatrix(v)); } else { let s = ''; const sv = this.out; this.out = t => { s += t; }; this.display('x', v); this.out = sv; this.out(s.replace(/^x =\n?/, '').replace(/^x = /, '') ); } };
  B.display = function (a) { this.display('ans', a[0]); };
  B.error = function (a) {
    if (a[0] instanceof M && a[0].t === 'c' && a.length >= 1) { let id = 'MATLAB:error', msg = S(a[0]), rest = a.slice(1); if (/^[A-Za-z]\w*(:\w+)+$/.test(msg) && a.length > 1) { id = msg; msg = S(a[1]); rest = a.slice(2); } E(id, rest.length || /%/.test(msg) ? ML.sprintfImpl(msg, rest) : msg); }
    if (isSA(a[0])) E('MATLAB:error', S(a[0].v[0].message)); E('MATLAB:error', 'Hata');
  };
  B.warning = function (a) { if (a[0] instanceof M && a[0].t === 'c') { const s = S(a[0]); if (s === 'off' || s === 'on') return; let msg = s, rest = a.slice(1); if (/^[A-Za-z]\w*(:\w+)+$/.test(s) && a.length > 1) { msg = S(a[1]); rest = a.slice(2); } this.out('Uyarı: ' + ML.sprintfImpl(msg, rest) + '\n', 'warn'); } };
  B.assert = function (a) { if (!isTrue(a[0])) E('MATLAB:assertion:failed', a[1] ? ML.sprintfImpl(S(a[1]), a.slice(2)) : 'Doğrulama (assert) başarısız.'); };
  B.MException = a => { const o = Object.create(null); o.identifier = a[0]; o.message = str(ML.sprintfImpl(S(a[1]), a.slice(2))); return {sa: true, r: 1, c: 1, v: [o]}; };
  B.rethrow = B.throw = a => E(a[0].v[0].identifier ? S(a[0].v[0].identifier) : 'MATLAB:error', S(a[0].v[0].message));
  B.lasterr = function () { return str(this.lastErr ? this.lastErr.message : ''); };
  B.strcat = function (a) { if (a.some(isCell)) { const n = Math.max(...a.map(x => isCell(x) ? x.v.length : 1)); const c = a.find(isCell); const v = []; for (let i = 0; i < n; i++) v.push(str(a.map(x => isCell(x) ? S(x.v[i]) : S(x)).join(''))); return {cell: true, r: c.r, c: c.c, v}; } return str(a.map(x => x.t === 'c' ? S(x).replace(/[ \t]+$/, '') : S(x)).join('')); };
  B.strtrim = a => { if (isCell(a[0])) return {cell: true, r: a[0].r, c: a[0].c, v: a[0].v.map(s => str(S(s).trim()))}; return str(S(a[0]).trim()); };
  B.upper = B.toupper = a => isCell(a[0]) ? {cell: true, r: a[0].r, c: a[0].c, v: a[0].v.map(s => str(S(s).toUpperCase()))} : str(S(a[0]).toUpperCase()); B.lower = B.tolower = a => isCell(a[0]) ? {cell: true, r: a[0].r, c: a[0].c, v: a[0].v.map(s => str(S(s).toLowerCase()))} : str(S(a[0]).toLowerCase());
  const cmp = (name, f) => { B[name] = a => { const x = a[0], y = a[1]; const n = a[2] ? sc1(a[2]) : 0; const one = (p, q) => (p instanceof M && p.t === 'c' && q instanceof M && q.t === 'c') && f(S(p), S(q), n); if (isCell(x) || isCell(y)) { const c = isCell(x) ? x : y, o = isCell(x) ? y : x; const r = zeros(c.r, c.c, 'l'); c.v.forEach((e, i) => { r.re[i] = one(e, isCell(o) ? o.v[i] : o) ? 1 : 0; }); return r; } return bool(one(x, y)); }; };
  cmp('strcmp', (p, q) => p === q); cmp('strcmpi', (p, q) => p.toLowerCase() === q.toLowerCase()); cmp('strncmp', (p, q, n) => p.length >= n && q.length >= n && p.slice(0, n) === q.slice(0, n)); cmp('strncmpi', (p, q, n) => p.slice(0, n).toLowerCase() === q.slice(0, n).toLowerCase());
  B.strfind = a => { if (isCell(a[0])) return {cell: true, r: a[0].r, c: a[0].c, v: a[0].v.map(s => B.strfind([s, a[1]]))}; const s = S(a[0]), p = S(a[1]), o = []; if (p.length) for (let i = s.indexOf(p); i >= 0; i = s.indexOf(p, i + 1)) o.push(i + 1); return o.length ? rowv(o) : new M(1, 0); };
  B.strrep = a => { const f = s => s.split(S(a[1])).join(S(a[2])); return isCell(a[0]) ? {cell: true, r: a[0].r, c: a[0].c, v: a[0].v.map(s => str(f(S(s))))} : str(f(S(a[0]))); };
  B.contains = a => { const f = s => S(a[1]).length ? s.includes(S(a[1])) : true; if (isCell(a[0])) { const o = zeros(a[0].r, a[0].c, 'l'); a[0].v.forEach((s, i) => { o.re[i] = f(S(s)) ? 1 : 0; }); return o; } return bool(f(S(a[0]))); };
  B.startsWith = a => bool(S(a[0]).startsWith(S(a[1]))); B.endsWith = a => bool(S(a[0]).endsWith(S(a[1])));
  B.strsplit = a => { const d = a[1] ? S(a[1]) : ' '; const p = S(a[0]).split(d.replace(/\\n/g, '\n').replace(/\\t/g, '\t')); return {cell: true, r: 1, c: p.length, v: p.map(str)}; };
  B.strjoin = a => { const d = a[1] ? ML.escapes(S(a[1])) : ' '; return str(a[0].v.map(S).join(d)); };
  B.regexprep = a => { try { return str(S(a[0]).replace(new RegExp(S(a[1]).replace(/\(\?<(\w+)>/g, '(?<$1>'), 'g'), S(a[2]).replace(/\$(\d)/g, '$$$1'))); } catch (e) { E('MATLAB:regexp', 'Geçersiz düzenli ifade: ' + e.message); } };
  B.regexp = function (a, no) { const s = S(a[0]); let re; try { re = new RegExp(S(a[1]), 'g'); } catch (e) { E('MATLAB:regexp', 'Geçersiz düzenli ifade'); } const opts = a.slice(2).map(S); const ms = [...s.matchAll(re)]; const res = {match: {cell: true, r: 1, c: ms.length, v: ms.map(m => str(m[0]))}, tokens: {cell: true, r: 1, c: ms.length, v: ms.map(m => ({cell: true, r: 1, c: m.length - 1, v: m.slice(1).map(x => str(x || ''))}))}, start: ms.length ? rowv(ms.map(m => m.index + 1)) : new M(1, 0), end: ms.length ? rowv(ms.map(m => m.index + m[0].length)) : new M(1, 0), names: (() => { const o = Object.create(null); if (ms[0] && ms[0].groups) for (const k in ms[0].groups) o[k] = str(ms[0].groups[k]); return {sa: true, r: 1, c: 1, v: [o]}; })()}; const once = opts.includes('once'); const pick = k => once && ms.length ? (k === 'match' ? res.match.v[0] : k === 'tokens' ? res.tokens.v[0] : k === 'start' ? num(res.start.re[0]) : res[k]) : res[k]; const order = opts.filter(o => o in res); if (!order.length) return [pick('start'), pick('end'), empty(), pick('match'), pick('tokens'), pick('names')].slice(0, Math.max(1, no)); return order.map(pick); };
  B.fliplr_s = null; delete B.fliplr_s;
  B.blanks = a => str(' '.repeat(sc1(a[0]))); B.repmat_s = null; delete B.repmat_s;
  B.ischar_ = null; delete B.ischar_;
  B.isspace = a => { const m = mat(a[0]); const o = zeros(m.r, m.c, 'l'); for (let i = 0; i < o.re.length; i++) o.re[i] = /\s/.test(String.fromCharCode(m.re[i])) ? 1 : 0; return o; }; B.isdigit = a => { const m = mat(a[0]); const o = zeros(m.r, m.c, 'l'); for (let i = 0; i < o.re.length; i++) o.re[i] = m.re[i] >= 48 && m.re[i] <= 57 ? 1 : 0; return o; }; B.isletter = B.isalpha = a => { const m = mat(a[0]); const o = zeros(m.r, m.c, 'l'); for (let i = 0; i < o.re.length; i++) o.re[i] = /[A-Za-z]/.test(String.fromCharCode(m.re[i])) ? 1 : 0; return o; };
  B.dec2bin = a => { let s = sc1(a[0]).toString(2); if (a[1]) s = s.padStart(sc1(a[1]), '0'); return str(s); }; B.bin2dec = a => num(parseInt(S(a[0]), 2)); B.dec2hex = a => { let s = sc1(a[0]).toString(16).toUpperCase(); if (a[1]) s = s.padStart(sc1(a[1]), '0'); return str(s); }; B.hex2dec = a => num(parseInt(S(a[0]), 16));
  B.fieldnames = a => { if (!isSA(a[0])) E('MATLAB:fieldnames:InvalidInput', 'fieldnames: yapı bekleniyordu.'); const k = Object.keys(a[0].v[0] || {}); return {cell: true, r: k.length, c: 1, v: k.map(str)}; };
  B.isfield = a => { if (!isSA(a[0])) return bool(false); const o = a[0].v[0] || {}; if (isCell(a[1])) { const r = zeros(a[1].r, a[1].c, 'l'); a[1].v.forEach((f, i) => { r.re[i] = S(f) in o ? 1 : 0; }); return r; } return bool(S(a[1]) in o); };
  B.rmfield = a => { const o = Object.assign(Object.create(null), a[0].v[0]); delete o[S(a[1])]; return {sa: true, r: 1, c: 1, v: [o]}; };
  B.getfield = a => { const o = a[0].v[0]; if (!(S(a[1]) in o)) E('MATLAB:nonExistentField', `Yapıda '${S(a[1])}' alanı yok.`); return o[S(a[1])]; };
  B.setfield = a => { const o = Object.assign(Object.create(null), a[0].v[0]); o[S(a[1])] = a[2]; return {sa: true, r: 1, c: 1, v: [o]}; };
  B.struct = function (a) {
    if (!a.length) return {sa: true, r: 1, c: 1, v: [Object.create(null)]};
    let n = 1; for (let i = 1; i < a.length; i += 2) if (isCell(a[i]) && a[i].v.length !== 1) n = a[i].v.length;
    const arr = []; for (let k = 0; k < n; k++) { const o = Object.create(null); for (let i = 0; i < a.length; i += 2) { const v = a[i + 1]; o[S(a[i])] = isCell(v) ? (v.v.length === 1 ? v.v[0] : v.v[k]) : v; } arr.push(o); }
    return {sa: true, r: 1, c: n, v: arr};
  };
  B.cell = a => { const [r, c] = dims(a); return cell(r, c); };
  B.num2cell = a => { const m = a[0]; return {cell: true, r: m.r, c: m.c, v: Array.from(m.re, (x, i) => num(x, m.t))}; };
  B.cell2mat = a => { const c = a[0]; const rows = []; for (let i = 0; i < c.r; i++) { const r = []; for (let j = 0; j < c.c; j++) r.push(c.v[i + j * c.r]); rows.push(ML.hcat(r)); } return ML.vcat(rows); };
  B.cellstr = a => isCell(a[0]) ? a[0] : {cell: true, r: a[0].r || 1, c: 1, v: Array.from({length: Math.max(a[0].r, 1)}, (_, i) => str(ML.rowStr(a[0], i).replace(/\s+$/, '')))};
  B.iscellstr = a => bool(isCell(a[0]) && a[0].v.every(x => x instanceof M && x.t === 'c'));
  B.struct2cell = a => { const o = a[0].v[0]; const k = Object.keys(o); return {cell: true, r: k.length, c: 1, v: k.map(f => o[f])}; };
  B.cell2struct = a => { const c = a[0], f = a[1]; const o = Object.create(null); f.v.forEach((n, i) => { o[S(n)] = c.v[i]; }); return {sa: true, r: 1, c: 1, v: [o]}; };
  B.func2str = a => str(ML.fhText(a[0]).replace(/^@(?!\()/, '')); B.str2func = function (a) { const s = S(a[0]); const ast = ML.parse('__f__ = ' + s + ';'); return this.eval(ast.body[0].rhs, this.base); };
  B.feval = function (a, no) { return this.callFunctionValue(a[0], a.slice(1), no); };
  B.isequal = function (a) { const eq = (x, y) => { if (x instanceof M && y instanceof M) { if (x.r !== y.r || x.c !== y.c) return false; for (let i = 0; i < x.re.length; i++) if (x.re[i] !== y.re[i] || (x.im ? x.im[i] : 0) !== (y.im ? y.im[i] : 0)) return false; return true; } if (isCell(x) && isCell(y)) return x.r === y.r && x.c === y.c && x.v.every((e, i) => eq(e, y.v[i])); if (isSA(x) && isSA(y)) return x.v.length === y.v.length && x.v.every((o, i) => { const ks = Object.keys(o); return ks.length === Object.keys(y.v[i]).length && ks.every(k => k in y.v[i] && eq(o[k], y.v[i][k])); }); return false; }; for (let i = 1; i < a.length; i++) if (!eq(a[0], a[i])) return bool(false); return bool(true); };
  B.cellfun = function (a, no) { return mapFun.call(this, a, no, 'cell'); };
  B.arrayfun = function (a, no) { return mapFun.call(this, a, no, 'array'); };
  B.structfun = function (a, no) { const o = a[1].v[0]; const vals = Object.keys(o).map(k => this.callFunctionValue(a[0], [o[k]], 1)[0]); const uni = !(a[2] && S(a[2]) === 'UniformOutput' && !isTrue(a[3])); return uni ? colv(vals.map(v => v.re[0])) : {cell: true, r: vals.length, c: 1, v: vals}; };
  function mapFun(a, no, kind) {
    let f = a[0], uni = true, errH = null; let ins = []; let i = 1;
    for (; i < a.length; i++) { const x = a[i]; if (x instanceof M && x.t === 'c' && i + 1 < a.length && ['UniformOutput', 'ErrorHandler'].includes(S(x))) { if (S(x) === 'UniformOutput') uni = isTrue(a[i + 1]); else errH = a[i + 1]; i++; } else ins.push(x); }
    if (f instanceof M && f.t === 'c') { const nm = S(f); if (nm === 'isempty' || nm === 'length' || nm === 'numel' || nm === 'ischar' || nm === 'isreal') f = {fh: true, name: nm}; else f = {fh: true, name: nm}; }
    const first = ins[0]; const n = kind === 'cell' ? (isCell(first) ? first.v.length : E('MATLAB:cellfun:NotACell', 'cellfun: ilk argüman hücre dizisi olmalı.')) : (first instanceof M ? first.re.length : isCell(first) ? first.v.length : first.v.length);
    for (const x of ins) { const m = x instanceof M ? x.re.length : x.v.length; if (m !== n) E('MATLAB:arrayfun:SizeMismatch', 'Girişlerin boyutları uyuşmuyor.'); }
    const nout = Math.max(1, no); const outs = Array.from({length: nout}, () => []);
    for (let k = 0; k < n; k++) {
      const args = ins.map(x => kind === 'cell' ? x.v[k] : x instanceof M ? new M(1, 1, Float64Array.of(x.re[k]), x.im ? Float64Array.of(x.im[k]) : null, x.t) : isCell(x) ? {cell: true, r: 1, c: 1, v: [x.v[k]]} : {sa: true, r: 1, c: 1, v: [x.v[k]]});
      let r; try { r = this.callFunctionValue(f, args, nout); } catch (e) { if (errH && e instanceof ML.MLError) { const s = Object.create(null); s.message = str(e.message); s.identifier = str(e.mid); s.index = num(k + 1); r = this.callFunctionValue(errH, [{sa: true, r: 1, c: 1, v: [s]}, ...args], nout); } else throw e; }
      if (no === 0 && !r.length) continue; if (r.length < nout) E('MATLAB:cellfun:NotEnoughOutputs', 'İşlev yeterli çıktı döndürmedi.');
      for (let q = 0; q < nout; q++) outs[q].push(r[q]);
    }
    const sh = first instanceof M ? [first.r, first.c] : [first.r, first.c];
    const res = outs.map(list => { if (uni) { const o = zeros(sh[0], sh[1]); let t = 'd'; list.forEach((v, i) => { if (!(v instanceof M) || v.re.length !== 1) E('MATLAB:cellfun:NotAScalar', 'Işlev tek eleman döndürmeli (UniformOutput=false deneyin).'); o.re[i] = v.re[0]; t = v.t; }); o.t = list.length ? t : 'd'; return o; } return {cell: true, r: sh[0], c: sh[1], v: list}; });
    return no === 0 && !res[0].re && !res[0].v.length ? [] : res;
  }
  B.nargin = function (a, no, sc) { return num(sc.nargin); }; B.nargout = function (a, no, sc) { return num(sc.nargout); };
  B.exist = function (a, no, sc) { const n = S(a[0]); return num(this.hasVar(sc, n) ? 1 : this.funcs.has(n) ? 103 : B[n] ? 5 : 0); };
  B.isvarname = a => bool(/^[A-Za-z]\w*$/.test(S(a[0])));
  B.tic = function () { this.ticT = performance.now(); }; B.toc = function (a, no) { const t = (performance.now() - this.ticT) / 1000; if (no >= 1) return num(t); this.out(`Geçen süre ${t.toFixed(6)} saniye.\n`); };
  B.clock = () => { const d = new Date(); return rowv([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]); }; B.now = () => num(Date.now() / 86400000 + 719529); B.cputime = () => num(performance.now() / 1000);
  B.datestr = () => str(new Date().toISOString().replace('T', ' ').slice(0, 19)); B.pause = () => {}; B.drawnow = () => {}; B.close_ = null; delete B.close_;
  B.clc = function () { this.out('', 'clc'); }; B.clear = function (a, no, sc) { if (!a.length || S(a[0]) === 'all') { sc.vars.clear(); sc.tok.clear(); } else for (const x of a) { sc.vars.delete(S(x)); } }; B.clearvars = B.clear; B.format = () => {}; B.more = () => {}; B.close = function (a) { if (this.figs) { if (a.length && S(a[0]) !== 'all') this.figs.delete(sc1(a[0])); else { this.figs.clear(); this.curFig = 0; } } }; B.rng = () => {};
  B.who = B.whos = function (a, no, sc) { for (const [k, v] of sc.vars) this.out(`  ${k}  ${sizeOf(v).join('x')}  ${classOf(v)}\n`); };
  B.deal = (a, no) => { if (a.length === 1) return Array.from({length: Math.max(1, no)}, () => a[0]); if (a.length !== Math.max(1, no)) E('MATLAB:deal:narginNargout', 'deal: giriş ve çıkış sayıları eşit olmalı.'); return a; };
  B.isequaln = B.isequal; B.numel2_ = null; delete B.numel2_;
  B.ifelse_ = null; delete B.ifelse_;
  B.validateattributes = () => {}; B.inputname = () => str(''); B.print_usage = () => E('MATLAB:print_usage', 'Kullanım hatası.'); B.nthargout = unsup('nthargout');
  B.floor_ = null; delete B.floor_;
  B.nextpow2 = a => map1fn(a, x => x === 0 ? 0 : Math.ceil(Math.log2(Math.abs(x)))); B.isprime = a => map1fn(a, x => { if (x < 2 || x !== Math.floor(x)) return 0; for (let i = 2; i * i <= x; i++) if (x % i === 0) return 0; return 1; }, 'l'); B.nchoosek = a => { const n = sc1(a[0]), kk = sc1(a[1]); let r = 1; for (let i = 1; i <= kk; i++) r = r * (n - kk + i) / i; return num(Math.round(r)); };
  B.primes = a => { const n = sc1(a[0]), o = []; for (let i = 2; i <= n; i++) { let p = true; for (let j = 2; j * j <= i; j++) if (i % j === 0) { p = false; break; } if (p) o.push(i); } return rowv(o); };
  B.sec = a => map1fn(a, x => 1 / Math.cos(x)); B.cot = a => map1fn(a, x => 1 / Math.tan(x)); B.sinc = a => map1fn(a, x => x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)); B.asinh = a => map1fn(a, Math.asinh); B.acosh = a => map1fn(a, Math.acosh); B.atanh = a => map1fn(a, Math.atanh); B.cbrt = a => map1fn(a, Math.cbrt); B.nthroot = a => { const n = sc1(a[1]); return map1fn([a[0]], x => x < 0 && n % 2 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)); }; B.erf = a => map1fn(a, erf); B.erfc = a => map1fn(a, x => 1 - erf(x));
  function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  function map1fn(a, f, t) { const m = mat(a[0]); const o = new Float64Array(m.re.length); for (let i = 0; i < o.length; i++) o[i] = f(m.re[i]); return like(m, o, null, t || 'd'); }

  /* ---------- DSP ---------- */
  function fftCore(re, im, inv) {   // yerinde; n 2'nin kuvveti
    const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) { const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1; for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < half; k++) { const a = i + k, b = a + half; const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  }
  function dft(xr, xi, inv) {   // keyfi n (Bluestein)
    const n = xr.length; if (n <= 1) return [xr.slice(), xi.slice()]; if ((n & (n - 1)) === 0) { const re = xr.slice(), im = xi.slice(); fftCore(re, im, inv); return [re, im]; }
    let m = 1; while (m < 2 * n - 1) m <<= 1; const wr = new Float64Array(n), wi = new Float64Array(n);
    for (let k = 0; k < n; k++) { const ang = Math.PI * ((k * k) % (2 * n)) / n * (inv ? 1 : -1); wr[k] = Math.cos(ang); wi[k] = Math.sin(ang); }
    const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
    for (let k = 0; k < n; k++) { ar[k] = xr[k] * wr[k] - xi[k] * wi[k]; ai[k] = xr[k] * wi[k] + xi[k] * wr[k]; }
    br[0] = wr[0]; bi[0] = -wi[0]; for (let k = 1; k < n; k++) { br[k] = br[m - k] = wr[k]; bi[k] = bi[m - k] = -wi[k]; }
    fftCore(ar, ai, false); fftCore(br, bi, false); for (let k = 0; k < m; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; } fftCore(ar, ai, true);
    const re = new Float64Array(n), im = new Float64Array(n); for (let k = 0; k < n; k++) { const r = ar[k] / m, i = ai[k] / m; re[k] = r * wr[k] - i * wi[k]; im[k] = r * wi[k] + i * wr[k]; }
    return [re, im];
  }
  ML.dft = dft; ML.fftCore = fftCore;
  function fftGen(a, inv) {
    const x = mat(a[0]); let n = a.length > 1 && a[1].re.length ? Math.floor(a[1].re[0]) : null; const d = a.length > 2 ? sc1(a[2]) : (x.r === 1 ? 2 : 1);
    const cols = d === 1 ? x.c : x.r, L = d === 1 ? x.r : x.c; const N = n === null ? L : n; const out = d === 1 ? zeros(N, cols) : zeros(cols, N); out.im = new Float64Array(out.re.length);
    for (let p = 0; p < cols; p++) {
      const xr = new Float64Array(N), xi = new Float64Array(N);
      for (let q = 0; q < Math.min(N, L); q++) { const s = d === 1 ? q + p * x.r : p + q * x.r; xr[q] = x.re[s]; xi[q] = x.im ? x.im[s] : 0; }
      const [re, im] = dft(xr, xi, inv); for (let q = 0; q < N; q++) { const t = d === 1 ? q + p * N : p + q * cols; out.re[t] = inv ? re[q] / N : re[q]; out.im[t] = inv ? im[q] / N : im[q]; }
    }
    return ML.dropIm(out);
  }
  B.fft = a => fftGen(a, false); B.ifft = a => { const r = fftGen(a, true); if (r.im) { let mx = 0, sc = 0; for (let i = 0; i < r.im.length; i++) { mx = Math.max(mx, Math.abs(r.im[i])); sc = Math.max(sc, Math.abs(r.re[i])); } if (mx <= 1e-12 * Math.max(sc, 1e-300)) r.im = null; } return r; };
  B.fftshift = a => { const m = a[0]; if (isVec(m)) { const n = m.re.length, h = Math.ceil(n / 2); const idx = []; for (let i = 0; i < n; i++) idx.push((i + n - Math.floor(n / 2)) % n + 1); return ML.readM(m, [m.r === 1 ? ML.COLON : rowv(idx), m.r === 1 ? rowv(idx) : ML.COLON].map((z, i) => i === 0 && m.r === 1 ? ML.COLON : z)); } return m; };
  B.ifftshift = B.fftshift;
  B.conv = a => { const x = mat(a[0]), y = mat(a[1]); const n = x.re.length + y.re.length - 1; const o = new Float64Array(n); for (let i = 0; i < x.re.length; i++) for (let j = 0; j < y.re.length; j++) o[i + j] += x.re[i] * y.re[j]; const shape = a[2] ? S(a[2]) : 'full'; let r = (x.c === 1 && x.r > 1 && !(y.r === 1 && y.c > 1 && false)) ? colv(o) : rowv(o); if (shape === 'same') { const s = Math.ceil((y.re.length - 1) / 2); r = (x.c === 1 && x.r > 1) ? colv(o.slice(s, s + x.re.length)) : rowv(o.slice(s, s + x.re.length)); } else if (shape === 'valid') { const L = Math.max(0, x.re.length - y.re.length + 1); r = rowv(o.slice(y.re.length - 1, y.re.length - 1 + L)); } return r; };
  B.deconv = a => { const y = Array.from(a[0].re), x = Array.from(a[1].re); const q = []; const r = y.slice(); for (let i = 0; i <= y.length - x.length; i++) { const c = r[i] / x[0]; q.push(c); for (let j = 0; j < x.length; j++) r[i + j] -= c * x[j]; } return [rowv(q), rowv(r)]; };
  function filt(b, a, x, zi) {
    const n = Math.max(b.length, a.length), bb = new Float64Array(n), aa = new Float64Array(n); bb.set(b); aa.set(a); const a0 = aa[0]; if (a0 === 0) E('MATLAB:filter:a0', 'filter: a(1) sıfır olamaz.'); if (a0 !== 1) { for (let i = 0; i < n; i++) { bb[i] /= a0; aa[i] /= a0; } }
    const z = new Float64Array(n); if (zi) z.set(zi.subarray(0, n - 1)); const y = new Float64Array(x.length);
    for (let t = 0; t < x.length; t++) { const xv = x[t]; const yv = (n > 1 ? z[0] : 0) + bb[0] * xv; for (let i = 1; i < n; i++) z[i - 1] = (i < n - 1 ? z[i] : 0) + bb[i] * xv - aa[i] * yv; y[t] = yv; }
    return [y, z.subarray(0, n - 1)];
  }
  B.filter = function (a, no) { const b = mat(a[0]).re, den = mat(a[1]).re, x = mat(a[2]); const zi = a[3] && a[3].re.length ? a[3].re : null; if (isVec(x)) { const [y, zf] = filt(b, den, x.re, zi); const r = like(x, y); return no > 1 ? [r, colv(zf)] : r; } const o = zeros(x.r, x.c); for (let j = 0; j < x.c; j++) o.re.set(filt(b, den, x.re.subarray(j * x.r, (j + 1) * x.r))[0], j * x.r); return o; };
  function filtfiltVec(b, a, x) {
    const n = Math.max(b.length, a.length), nf = 3 * (n - 1); if (x.length <= nf) E('MATLAB:filtfilt:ShortInput', `filtfilt: sinyal uzunluğu (${x.length}) filtre derecesinin 3 katından (${nf}) uzun olmalı.`);
    const ext = new Float64Array(x.length + 2 * nf); for (let i = 0; i < nf; i++) { ext[i] = 2 * x[0] - x[nf - i]; ext[ext.length - 1 - i] = 2 * x[x.length - 1] - x[x.length - 1 - nf + i]; } ext.set(x, nf);
    // başlangıç koşulu (kararlı durum) — scipy lfilter_zi
    const bb = new Float64Array(n), aa = new Float64Array(n); bb.set(b); aa.set(a); const a0 = aa[0]; for (let i = 0; i < n; i++) { bb[i] /= a0; aa[i] /= a0; }
    let zi = new Float64Array(n - 1); if (n > 1) { const A = ML.zeros(n - 1, n - 1), rhs = zeros(n - 1, 1); for (let i = 0; i < n - 1; i++) { A.re[i + i * (n - 1)] += 1; A.re[i] += aa[i + 1]; if (i < n - 2) A.re[i + (i + 1) * (n - 1)] -= 1; rhs.re[i] = bb[i + 1] - aa[i + 1] * bb[0]; } try { zi = ML.solve(A, rhs).re; } catch (e) { } }
    const run = sig => { const zz = zi.map(v => v * sig[0]); return filt(bb, aa, sig, zz)[0]; };
    let y = run(ext); y.reverse(); y = run(y); y.reverse(); return y.slice(nf, nf + x.length);
  }
  B.filtfilt = function (a) { let b, den, x; if (a.length === 3) { b = mat(a[0]).re; den = mat(a[1]).re; x = mat(a[2]); } else E('MATLAB:filtfilt:args', 'filtfilt(b,a,x) biçimi kullanılmalı.'); if (isVec(x)) return like(x, filtfiltVec(b, den, x.re)); const o = zeros(x.r, x.c); for (let j = 0; j < x.c; j++) o.re.set(filtfiltVec(b, den, x.re.subarray(j * x.r, (j + 1) * x.r)), j * x.r); return o; };
  // Butterworth: analog prototip → çift doğrusal dönüşüm (scipy.signal.butter ile aynı sonuç)
  function polyFromRoots(rts) { let p = [[1, 0]]; for (const r of rts) { const q = new Array(p.length + 1).fill(0).map(() => [0, 0]); for (let i = 0; i < p.length; i++) { q[i][0] += p[i][0]; q[i][1] += p[i][1]; q[i + 1][0] -= p[i][0] * r[0] - p[i][1] * r[1]; q[i + 1][1] -= p[i][0] * r[1] + p[i][1] * r[0]; } p = q; } return p.map(c => c[0]); }
  function butterDesign(N, Wn, type) {
    const fs = 2, cl = (w) => 2 * fs * Math.tan(Math.PI * w / fs);
    let poles = []; for (let k = 0; k < N; k++) { const th = Math.PI * (2 * k + 1 + N) / (2 * N); poles.push([Math.cos(th), Math.sin(th)]); }
    let zeros_ = [], gain = 1, wo, bw;
    const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], cdv = (a, b) => { const s = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / s, (a[1] * b[0] - a[0] * b[1]) / s]; };
    if (type === 'low') { wo = cl(Wn[0]); poles = poles.map(p => [p[0] * wo, p[1] * wo]); gain = Math.pow(wo, N); }
    else if (type === 'high') { wo = cl(Wn[0]); poles = poles.map(p => cdv([wo, 0], p)); zeros_ = new Array(N).fill(0).map(() => [0, 0]); gain = 1; }
    else {
      const w1 = cl(Wn[0]), w2 = cl(Wn[1]); wo = Math.sqrt(w1 * w2); bw = w2 - w1; const np = []; const sq = [];
      for (const p of poles) { const pl = [p[0] * bw / 2, p[1] * bw / 2]; const d = cm(pl, pl); const s = [d[0] - wo * wo, d[1]]; const mag = Math.hypot(s[0], s[1]), ang = Math.atan2(s[1], s[0]); const r = [Math.sqrt(mag) * Math.cos(ang / 2), Math.sqrt(mag) * Math.sin(ang / 2)]; np.push([pl[0] + r[0], pl[1] + r[1]]); np.push([pl[0] - r[0], pl[1] - r[1]]); }
      poles = np; zeros_ = new Array(N).fill(0).map(() => [0, 0]); gain = Math.pow(bw, N);
      if (type === 'stop') E('MATLAB:unsupported', "butter: 'stop' tipi desteklenmiyor.");
    }
    if (type === 'stop') E('MATLAB:unsupported', "butter: 'stop' tipi desteklenmiyor.");
    // çift doğrusal dönüşüm
    const fs2 = 2 * fs; const zd = zeros_.map(z => cdv([fs2 + z[0], z[1]], [fs2 - z[0], -z[1]])), pd = poles.map(p => cdv([fs2 + p[0], p[1]], [fs2 - p[0], -p[1]]));
    const degree = poles.length - zeros_.length; for (let i = 0; i < degree; i++) zd.push([-1, 0]);
    let kd = gain; for (const z of zeros_) { const t = [fs2 - z[0], -z[1]]; kd *= 1; kd = kd * Math.hypot(...[1, 0]) ; }
    // kazanç: ∏(fs2−z)/∏(fs2−p) × k
    let num_ = [1, 0], den_ = [1, 0]; for (const z of zeros_) num_ = cm(num_, [fs2 - z[0], -z[1]]); for (const p of poles) den_ = cm(den_, [fs2 - p[0], -p[1]]);
    const kk = cdv(num_, den_); const K = gain * kk[0];
    let bz = polyFromRoots(zd).map(v => v * K), az = polyFromRoots(pd);
    return [bz, az];
  }
  B.butter = function (a, no) {
    const N = Math.floor(sc1(a[0], 'derece')); if (N < 1 || N > 20) E('MATLAB:butter:order', 'butter: derece 1–20 arasında olmalı.'); const Wn = Array.from(mat(a[1]).re); let type = Wn.length === 2 ? 'bandpass' : 'low'; if (a[2]) { const s = S(a[2]).toLowerCase(); type = s === 'high' ? 'high' : s === 'low' ? 'low' : s === 'bandpass' ? 'bandpass' : s === 'stop' ? 'stop' : type; }
    for (const w of Wn) if (!(w > 0 && w < 1)) E('MATLAB:butter:Wn', 'butter: Wn (kesim frekansı) 0 ile 1 arasında (Nyquist ile normalize) olmalı, örn. 2*fc/fs.');
    const [bz, az] = butterDesign(N, Wn, type === 'bandpass' ? 'bandpass' : type); return [rowv(bz), rowv(az)];
  };
  B.polyfit = function (a, no) { const x = mat(a[0]).re, y = mat(a[1]).re, n = Math.floor(sc1(a[2])); if (x.length !== y.length) E('MATLAB:polyfit:XYSizeMismatch', 'polyfit: x ve y aynı uzunlukta olmalı.'); const A = zeros(x.length, n + 1); const mu = 0; for (let i = 0; i < x.length; i++) for (let j = 0; j <= n; j++) A.re[i + j * x.length] = Math.pow(x[i], n - j); const c = ML.lsq(A, colv(y)); return rowv(c.re); };
  B.polyval = a => { const p = mat(a[0]).re, x = mat(a[1]); return like(x, Float64Array.from(x.re, v => { let r = 0; for (const c of p) r = r * v + c; return r; })); };
  B.roots = a => { const p = Array.from(mat(a[0]).re); while (p.length && p[0] === 0) p.shift(); const n = p.length - 1; if (n < 1) return empty(); const C = zeros(n, n); for (let j = 0; j < n; j++) C.re[j * n] = -p[j + 1] / p[0]; for (let i = 1; i < n; i++) C.re[i + (i - 1) * n] = 1; return eigvals(C); };
  function eigvals(A) { // QR yinelemesi (Hessenberg'siz basit) — küçük n için
    const n = A.r; let re = Float64Array.from(A.re), cnt = 0; const get = (i, j) => re[i + j * n]; const out_r = [], out_i = []; let m = n; const H = (() => { const h = []; for (let i = 0; i < n; i++) { h.push([]); for (let j = 0; j < n; j++) h[i].push(get(i, j)); } return h; })();
    // basit shifted QR (Francis'e benzer değil, ama polinom kökleri için yeterli); Durand–Kerner'e geçiş
    const p = []; // karakteristik polinomu Faddeev–LeVerrier ile
    let M_ = H.map(r => r.slice()), c = [1]; let Mk = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));
    const mulM = (X, Y) => X.map((r, i) => Y[0].map((_, j) => r.reduce((s, v, k) => s + v * Y[k][j], 0)));
    let coef = [1]; let Mprev = Mk; for (let k = 1; k <= n; k++) { const AM = mulM(H, Mprev); const ck = -AM.reduce((s, r, i) => s + r[i], 0) / k; coef.push(ck); Mprev = AM.map((r, i) => r.map((v, j) => v + (i === j ? ck : 0))); }
    const rts = durandKerner(coef); return rts;
  }
  function durandKerner(c) { const n = c.length - 1; const z = []; for (let i = 0; i < n; i++) { const th = 2 * Math.PI * i / n + 0.4; z.push([0.9 * Math.cos(th), 0.9 * Math.sin(th)]); } const ev = x => { let r = [c[0], 0]; for (let i = 1; i <= n; i++) r = [r[0] * x[0] - r[1] * x[1] + c[i], r[0] * x[1] + r[1] * x[0]]; return r; };
    let sc = 1 + Math.max(...c.slice(1).map(Math.abs)); for (const q of z) { q[0] *= sc / 2; q[1] *= sc / 2; }
    for (let it = 0; it < 500; it++) { let md = 0; for (let i = 0; i < n; i++) { let d = [1, 0]; for (let j = 0; j < n; j++) if (j !== i) { const t = [z[i][0] - z[j][0], z[i][1] - z[j][1]]; d = [d[0] * t[0] - d[1] * t[1], d[0] * t[1] + d[1] * t[0]]; } const f = ev(z[i]); const s = d[0] * d[0] + d[1] * d[1]; if (s === 0) continue; const dl = [(f[0] * d[0] + f[1] * d[1]) / s, (f[1] * d[0] - f[0] * d[1]) / s]; z[i][0] -= dl[0]; z[i][1] -= dl[1]; md = Math.max(md, Math.hypot(dl[0], dl[1])); } if (md < 1e-14 * sc) break; }
    const re = Float64Array.from(z, q => q[0]), im = Float64Array.from(z, q => Math.abs(q[1]) < 1e-9 * sc ? 0 : q[1]); return ML.dropIm(new M(n, 1, re, im)); }
  B.poly = a => { const m = mat(a[0]); return rowv(polyFromRoots(Array.from(m.re, (v, i) => [v, m.im ? m.im[i] : 0]))); };
  B.interp1 = function (a) {
    let x, y, xq, method = 'linear', extrap = null; const rest = a.filter(z => z instanceof M && z.t === 'c').map(S); if (rest.length) method = rest[0].toLowerCase(); const nums = a.filter(z => !(z instanceof M && z.t === 'c'));
    if (nums.length === 2) { y = nums[0]; xq = nums[1]; x = rowv(Array.from({length: y.re.length}, (_, i) => i + 1)); } else { x = nums[0]; y = nums[1]; xq = nums[2]; if (nums[3]) extrap = nums[3].re[0]; if (rest.includes('extrap')) extrap = 'extrap'; }
    const X = x.re, Y = y.re, n = X.length; if (n !== Y.length) E('MATLAB:interp1:YInvalidNumRows', 'interp1: x ve y aynı uzunlukta olmalı.');
    const ord = Array.from(X.keys()).sort((p, q) => X[p] - X[q]); const xs = ord.map(i => X[i]), ys = ord.map(i => Y[i]);
    let ex = rest.includes('extrap'); const o = like(xq, new Float64Array(xq.re.length));
    for (let k = 0; k < o.re.length; k++) {
      const v = xq.re[k]; if (Number.isNaN(v)) { o.re[k] = NaN; continue; }
      if ((v < xs[0] || v > xs[n - 1]) && !ex) { o.re[k] = typeof extrap === 'number' ? extrap : NaN; continue; }
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= v) lo = mid; else hi = mid; }
      if (method === 'nearest') o.re[k] = (v - xs[lo]) < (xs[hi] - v) ? ys[lo] : ys[hi]; else if (method === 'previous') o.re[k] = v >= xs[hi] ? ys[hi] : ys[lo]; else if (method === 'next') o.re[k] = v <= xs[lo] ? ys[lo] : ys[hi];
      else { const t = (v - xs[lo]) / (xs[hi] - xs[lo]); o.re[k] = ys[lo] + t * (ys[hi] - ys[lo]); }
    }
    return o;
  };
  B.detrend = function (a) { const m = mat(a[0]); const ord = a[1] && a[1].t !== 'c' ? sc1(a[1]) : 1; const one = x => { const n = x.length; const A = zeros(n, ord + 1); for (let i = 0; i < n; i++) for (let j = 0; j <= ord; j++) A.re[i + j * n] = Math.pow(i / Math.max(n - 1, 1), j); const c = ML.lsq(A, colv(x)); const o = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j <= ord; j++) s += c.re[j] * A.re[i + j * n]; o[i] = x[i] - s; } return o; }; if (isVec(m)) return like(m, one(m.re)); const o = zeros(m.r, m.c); for (let j = 0; j < m.c; j++) o.re.set(one(m.re.subarray(j * m.r, (j + 1) * m.r)), j * m.r); return o; };
  B.xcorr = function (a, no) {
    const x = mat(a[0]).re; const hasY = a[1] && a[1].t !== 'c' && a[1].re.length > 1; const y = hasY ? a[1].re : x; let maxlag = a.find((z, i) => i > (hasY ? 1 : 0) && z.t !== 'c' && z.re.length === 1); maxlag = maxlag ? maxlag.re[0] : Math.max(x.length, y.length) - 1; const opt = a.filter(z => z.t === 'c').map(S)[0] || 'none';
    const N = Math.max(x.length, y.length); const lags = []; const out = []; let n0 = 0; for (let l = -maxlag; l <= maxlag; l++) { let s = 0; for (let i = 0; i < y.length; i++) { const j = i + l; if (j >= 0 && j < x.length) s += x[j] * y[i]; } lags.push(l); out.push(s); }
    let c = out; if (opt === 'biased') c = out.map(v => v / N); else if (opt === 'unbiased') c = out.map((v, i) => v / (N - Math.abs(lags[i]))); else if (opt === 'coeff') { const z = out[lags.indexOf(0)]; c = out.map(v => v / z); }
    const col = mat(a[0]).c === 1 && mat(a[0]).r > 1; const mk = col ? colv : rowv; return no > 1 ? [mk(c), mk(lags)] : mk(c);
  };
  B.hampel = function (a, no) { const x = mat(a[0]); const k = a[1] ? Math.floor(sc1(a[1])) : 3, ns = a[2] ? sc1(a[2]) : 3; const y = x.re.slice(), flag = zeros(x.r, x.c, 'l'); const n = y.length; for (let i = 0; i < n; i++) { const lo = Math.max(0, i - k), hi = Math.min(n - 1, i + k); const w = Array.from(x.re.subarray(lo, hi + 1)).sort((p, q) => p - q); const med = w.length % 2 ? w[(w.length - 1) / 2] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2; const dv = w.map(v => Math.abs(v - med)).sort((p, q) => p - q); const mad = 1.4826 * (dv.length % 2 ? dv[(dv.length - 1) / 2] : (dv[dv.length / 2 - 1] + dv[dv.length / 2]) / 2); if (Math.abs(x.re[i] - med) > ns * mad) { y[i] = med; flag.re[i] = 1; } } const r = like(x, y); return no > 1 ? [r, flag] : r; };
  function movGen(name, f) { B[name] = a => { const x = mat(a[0]); const w = a[1].re; let lo, hi; if (w.length === 2) { lo = w[0]; hi = w[1]; } else { const k = w[0]; if (k % 2) { lo = hi = (k - 1) / 2; } else { lo = k / 2; hi = k / 2 - 1; } } const col = j => x.re.subarray(j * x.r, (j + 1) * x.r); const one = v => { const n = v.length, o = new Float64Array(n); for (let i = 0; i < n; i++) { const s = Math.max(0, i - lo), e = Math.min(n - 1, i + hi); o[i] = f(v.subarray(s, e + 1)); } return o; }; if (isVec(x)) return like(x, one(x.re)); const o = zeros(x.r, x.c); for (let j = 0; j < x.c; j++) o.re.set(one(col(j)), j * x.r); return o; }; }
  movGen('movmean', v => sumF(v) / v.length); movGen('movmedian', v => { const s = Float64Array.from(v).sort(); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }); movGen('movmax', v => Math.max(...v)); movGen('movmin', v => Math.min(...v)); movGen('movsum', sumF); movGen('movstd', v => Math.sqrt(varF(v))); movGen('movvar', v => varF(v));
  B.medfilt1 = a => { const n = a[1] ? sc1(a[1]) : 3; const x = mat(a[0]); const h1 = Math.floor(n / 2), h2 = n - h1 - 1; const one = v => { const L = v.length, o = new Float64Array(L); for (let i = 0; i < L; i++) { const w = []; for (let k = i - h1; k <= i + h2; k++) w.push(k < 0 || k >= L ? 0 : v[k]); w.sort((p, q) => p - q); o[i] = w.length % 2 ? w[(w.length - 1) / 2] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2; } return o; }; return isVec(x) ? like(x, one(x.re)) : (() => { const o = zeros(x.r, x.c); for (let j = 0; j < x.c; j++) o.re.set(one(x.re.subarray(j * x.r, (j + 1) * x.r)), j * x.r); return o; })(); };
  B.smooth = a => B.movmean([a[0], num(a[1] ? sc1(a[1]) : 5)]);
  B.findpeaks = function (a, no) {
    const x = mat(a[0]).re; let minH = -Infinity, minD = 1, minP = 0; for (let i = 1; i + 1 < a.length; i += 2) { const k = S(a[i]).toLowerCase(), v = sc1(a[i + 1]); if (k === 'minpeakheight') minH = v; else if (k === 'minpeakdistance') minD = v; else if (k === 'minpeakprominence') minP = v; }
    let idx = []; for (let i = 1; i < x.length - 1; i++) { if (x[i] > x[i - 1] && x[i] >= x[i + 1]) { let j = i; while (j + 1 < x.length && x[j + 1] === x[i]) j++; if (j + 1 < x.length && x[j + 1] < x[i]) { idx.push(Math.floor((i + j) / 2)); i = j; } else if (j + 1 >= x.length) { } } }
    idx = idx.filter(i => x[i] >= minH);
    if (minP > 0) idx = idx.filter(i => { let l = i, lmin = x[i]; while (l > 0 && x[l - 1] <= x[i]) { l--; lmin = Math.min(lmin, x[l]); } let r = i, rmin = x[i]; while (r < x.length - 1 && x[r + 1] <= x[i]) { r++; rmin = Math.min(rmin, x[r]); } return x[i] - Math.max(lmin, rmin) >= minP; });
    if (minD > 1) { const ord = idx.slice().sort((p, q) => x[q] - x[p]); const keep = []; for (const i of ord) if (keep.every(j => Math.abs(i - j) >= minD)) keep.push(i); idx = keep.sort((p, q) => p - q); }
    const col = mat(a[0]).c === 1; const mk = col ? colv : rowv; return no > 1 ? [mk(idx.map(i => x[i])), mk(idx.map(i => i + 1))] : mk(idx.map(i => x[i]));
  };
  B.pwelch = function (a, no) {
    const x = mat(a[0]).re; let win = a[1] && a[1].re.length ? a[1] : null, nov = a[2] && a[2].re.length ? a[2].re[0] : null, nfft = a[3] && a[3].re.length ? a[3].re[0] : null; let fs = a[4] && a[4].re.length ? a[4].re[0] : null; let w;
    if (!win) { const L = Math.floor(x.length / 4.5); w = L; } else if (win.re.length === 1) w = win.re[0]; else w = win.re.length; const L = Math.floor(w); const wv = win && win.re.length > 1 ? Array.from(win.re) : Array.from({length: L}, (_, i) => 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (L - 1)));
    if (nov === null) nov = Math.floor(L / 2); const N = nfft || Math.max(256, Math.pow(2, Math.ceil(Math.log2(L)))); const step = L - nov; if (step < 1) E('MATLAB:pwelch:overlap', 'pwelch: örtüşme pencere uzunluğundan küçük olmalı.');
    const nseg = Math.floor((x.length - nov) / step); if (nseg < 1) E('MATLAB:pwelch:short', 'pwelch: sinyal pencere uzunluğundan kısa.'); const U = wv.reduce((s, v) => s + v * v, 0); const half = Math.floor(N / 2) + 1; const P = new Float64Array(half);
    for (let s = 0; s < nseg; s++) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < L; i++) re[i] = x[s * step + i] * wv[i]; const [R, I] = dft(re, im, false); for (let k = 0; k < half; k++) P[k] += R[k] * R[k] + I[k] * I[k]; }
    const sc = fs ? 1 / (fs * U * nseg) : 1 / (2 * Math.PI * U * nseg); for (let k = 0; k < half; k++) { P[k] *= sc; if (k > 0 && !(N % 2 === 0 && k === half - 1)) P[k] *= 2; }
    const f = Float64Array.from({length: half}, (_, k) => fs ? k * fs / N : 2 * Math.PI * k / N / Math.PI * Math.PI);
    return no > 1 ? [colv(P), colv(f)] : colv(P);
  };
  B.hamming = a => { const L = sc1(a[0]); return colv(Array.from({length: L}, (_, i) => L === 1 ? 1 : 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (L - 1)))); }; B.hann = B.hanning = a => { const L = sc1(a[0]); return colv(Array.from({length: L}, (_, i) => L === 1 ? 1 : 0.5 * (1 - Math.cos(2 * Math.PI * i / (L - 1))))); }; B.blackman = a => { const L = sc1(a[0]); return colv(Array.from({length: L}, (_, i) => 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (L - 1)))); };
  B.envelope_ = null; delete B.envelope_;
  B.hilbert = a => { const x = mat(a[0]); const n = x.re.length; const [R, I] = dft(x.re, new Float64Array(n), false); for (let k = 0; k < n; k++) { const h = k === 0 || (n % 2 === 0 && k === n / 2) ? 1 : k < (n + 1) / 2 ? 2 : 0; R[k] *= h; I[k] *= h; } const [r2, i2] = dft(R, I, true); const o = new M(x.r, x.c, r2.map(v => v / n), i2.map(v => v / n)); return o; };
  B.envelope = a => { const h = B.hilbert([a[0]]); return like(h, Float64Array.from(h.re, (v, i) => Math.hypot(v, h.im[i]))); };
  B.downsample = a => { const x = mat(a[0]); const n = sc1(a[1]); const idx = []; for (let i = 1; i <= x.re.length; i += n) idx.push(i); return ML.readM(x, x.r === 1 ? [ML.COLON, rowv(idx)].map((z, i) => i === 0 ? ML.COLON : z) : [rowv(idx), ML.COLON]); };
  B.rssq = a => reduce(a, 'rssq', x => Math.sqrt(x.reduce((s, v) => s + v * v, 0))); B.norm = a => { const m = mat(a[0]); const p = a[1] ? (a[1].t === 'c' ? S(a[1]) : sc1(a[1])) : 2; if (isVec(m)) { if (p === Infinity || p === 'inf' || p === 'Inf') return num(Math.max(...Array.from(m.re, Math.abs))); if (p === 1) return num(m.re.reduce((s, v) => s + Math.abs(v), 0)); if (p === 2) { let s = 0; for (let i = 0; i < m.re.length; i++) s += m.re[i] ** 2 + (m.im ? m.im[i] ** 2 : 0); return num(Math.sqrt(s)); } return num(Math.pow(m.re.reduce((s, v) => s + Math.pow(Math.abs(v), p), 0), 1 / p)); } if (p === 'fro') return num(Math.sqrt(m.re.reduce((s, v) => s + v * v, 0))); E('MATLAB:unsupported', 'norm: matris için yalnız ' + "'fro' desteklenir."); };
  B.mag2db = a => map1fn(a, x => 20 * Math.log10(x)); B.db2mag = a => map1fn(a, x => Math.pow(10, x / 20)); B.pow2db = a => map1fn(a, x => 10 * Math.log10(x)); B.db2pow = a => map1fn(a, x => Math.pow(10, x / 10)); B.db = a => map1fn(a, x => 20 * Math.log10(Math.abs(x)));
  B.unwrap = a => { const x = mat(a[0]); const o = x.re.slice(); let off = 0; for (let i = 1; i < o.length; i++) { const d = x.re[i] - x.re[i - 1]; if (d > Math.PI) off -= 2 * Math.PI * Math.ceil((d - Math.PI) / (2 * Math.PI)); else if (d < -Math.PI) off += 2 * Math.PI * Math.ceil((-d - Math.PI) / (2 * Math.PI)); o[i] = x.re[i] + off; } return like(x, o); };
  B.cumtrapz_ = null; delete B.cumtrapz_;
  B.fzero_ = null; delete B.fzero_;
  B.fzero = function (a) { const f = a[0]; let lo, hi; const g = x => this.callFunctionValue(f, [num(x)], 1)[0].re[0]; if (a[1].re.length === 2) { lo = a[1].re[0]; hi = a[1].re[1]; } else { let x0 = a[1].re[0], d = Math.max(Math.abs(x0) * 0.1, 0.1); lo = x0 - d; hi = x0 + d; for (let i = 0; i < 60 && g(lo) * g(hi) > 0; i++) { d *= 1.6; lo = x0 - d; hi = x0 + d; } } let flo = g(lo), fhi = g(hi); if (flo * fhi > 0) E('MATLAB:fzero:ValuesAtEndPtsSameSign', 'fzero: aralığın uçlarında işlev aynı işaretli.'); for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2, fm = g(mid); if (fm === 0) { lo = hi = mid; break; } if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } if (Math.abs(hi - lo) < 1e-15 * Math.max(1, Math.abs(lo))) break; } return num((lo + hi) / 2); };
  B.integral = B.quad = function (a) { const f = a[0]; const lo = sc1(a[1]), hi = sc1(a[2]); const g = x => this.callFunctionValue(f, [num(x)], 1)[0].re[0]; const simp = (l, h, fl, fm, fh) => (h - l) / 6 * (fl + 4 * fm + fh); const rec = (l, h, fl, fm, fh, whole, tol, d) => { const m = (l + h) / 2, lm = (l + m) / 2, rm = (m + h) / 2, flm = g(lm), frm = g(rm), left = simp(l, m, fl, flm, fm), right = simp(m, h, fm, frm, fh); if (d > 40 || Math.abs(left + right - whole) <= 15 * tol) return left + right + (left + right - whole) / 15; return rec(l, m, fl, flm, fm, left, tol / 2, d + 1) + rec(m, h, fm, frm, fh, right, tol / 2, d + 1); }; const fl = g(lo), fh = g(hi), fm = g((lo + hi) / 2); return num(rec(lo, hi, fl, fm, fh, simp(lo, hi, fl, fm, fh), 1e-10, 0)); };
  B.max_ = null; delete B.max_;
  B.cummean_ = null; delete B.cummean_;
  B.accumarray = a => { const s = mat(a[0]), v = mat(a[1]); const n = Math.max(...s.re); const o = zeros(n, 1); for (let i = 0; i < s.re.length; i++) o.re[s.re[i] - 1] += v.re.length === 1 ? v.re[0] : v.re[i]; return o; };
  B.histcounts = a => { const x = Array.from(mat(a[0]).re).filter(v => !Number.isNaN(v)); let edges; if (a[1] && a[1].re.length > 1) edges = Array.from(a[1].re); else { const nb = a[1] ? sc1(a[1]) : 10; const lo = Math.min(...x), hi = Math.max(...x); edges = Array.from({length: nb + 1}, (_, i) => lo + (hi - lo) * i / nb); } const c = new Float64Array(edges.length - 1); for (const v of x) { if (v < edges[0] || v > edges[edges.length - 1]) continue; let k = edges.length - 2; for (let i = 0; i < edges.length - 1; i++) if (v < edges[i + 1]) { k = i; break; } c[k]++; } return [rowv(c), rowv(edges)]; };
  B.floor_div_ = null; delete B.floor_div_;
  B.cummax_ = null; delete B.cummax_;
  B.bsxfun = function (a) { return this.callFunctionValue(a[0], [a[1], a[2]], 1); };
  B.sub2ind = a => { const s = a[0].re, r = mat(a[1]), c = mat(a[2]); return like(r, Float64Array.from(r.re, (v, i) => v + (c.re[i] - 1) * s[0])); }; B.ind2sub = (a, no) => { const s = a[0].re, i = mat(a[1]); return [like(i, Float64Array.from(i.re, v => (v - 1) % s[0] + 1)), like(i, Float64Array.from(i.re, v => Math.floor((v - 1) / s[0]) + 1))]; };
  B.magic = a => { const n = sc1(a[0]); const m = zeros(n, n); if (n % 2) { let i = 0, j = (n - 1) / 2; for (let k = 1; k <= n * n; k++) { m.re[i + j * n] = k; const ni = (i - 1 + n) % n, nj = (j + 1) % n; if (m.re[ni + nj * n]) i = (i + 1) % n; else { i = ni; j = nj; } } } else E('MATLAB:unsupported', 'magic: yalnız tek n desteklenir.'); return m; };
  B.fix_ = null; delete B.fix_;
  B.isspace_ = null; delete B.isspace_;
  B.typecast = unsup('typecast'); B.swapbytes = a => { const m = mat(a[0]); const bytes = { i16: 2, u16: 2, i32: 4, u32: 4 }[m.t]; if (!bytes) E('MATLAB:swapbytes', 'swapbytes: 16/32 bit tamsayı gerekir.'); const o = m.re.slice(); for (let i = 0; i < o.length; i++) { let v = o[i], r = 0; if (v < 0) v += Math.pow(2, 8 * bytes); for (let b = 0; b < bytes; b++) { r = r * 256 + (v % 256); v = Math.floor(v / 256); } o[i] = m.t[0] === 'i' && r >= Math.pow(2, 8 * bytes - 1) ? r - Math.pow(2, 8 * bytes) : r; } return like(m, o, null, m.t); };

  /* ---------- kanal köprüsü & dosya ---------- */
  B.ch = function (a) { const c = this.ctx; if (!c.getChannel) E('MATLAB:ch', 'ch(): kanal köprüsü bu ortamda kullanılamıyor.'); const nm = S(a[0]); const r = c.getChannel(nm); if (!r) E('MATLAB:ch:notFound', `ch('${nm}'): bu adda kanal bulunamadı. chlist() ile mevcut adları görün.`); this.lastFs = r.fs; return colv(r.data); };
  B.chfs = function (a) { const c = this.ctx; const r = c.getChannel && c.getChannel(S(a[0])); if (!r) E('MATLAB:ch:notFound', `chfs('${S(a[0])}'): kanal bulunamadı.`); return num(r.fs); };
  B.cht = function (a) { const c = this.ctx; const r = c.getChannel && c.getChannel(S(a[0])); if (!r) E('MATLAB:ch:notFound', `cht('${S(a[0])}'): kanal bulunamadı.`); if (r.time) return colv(r.time); const t = new Float64Array(r.data.length); for (let i = 0; i < t.length; i++) t[i] = i / r.fs; return colv(t); };
  B.chlist = function (a, no) { const c = this.ctx; const names = c.listChannels ? c.listChannels() : []; if (no === 0) { this.out(names.length ? names.join('\n') + '\n' : '(kanal yok)\n'); return; } return {cell: true, r: names.length, c: 1, v: names.map(str)}; };
  B.addch = function (a) { const c = this.ctx; if (!c.addChannel) E('MATLAB:addch', 'addch(): kanal köprüsü bu ortamda kullanılamıyor.'); const nm = S(a[0]), y = mat(a[1]); if (!(y.re.length > 1)) E('MATLAB:addch', 'addch: veri en az 2 örnek içermeli.'); const fs = a[2] ? sc1(a[2]) : (this.lastFs || 1); c.addChannel(nm, Float64Array.from(y.re), fs); };
  B.load = function (a, no) { const c = this.ctx; if (!c.loadMat) E('MATLAB:load', 'load: dosya erişimi yalnızca ana uygulamada (Kod sekmesinde açık .mat dosyaları) kullanılabilir. Dosyayı önce MATView içine açın, sonra load(\'dosya.mat\').'); const nm = S(a[0]); const vars = c.loadMat(nm); if (!vars) E('MATLAB:load:couldNotReadFile', `load: '${nm}' açık dosyalar arasında bulunamadı.`); const want = a.slice(1).map(S); const o = Object.create(null); for (const k in vars) { if (want.length && !want.includes(k)) continue; o[k] = vars[k]; } if (no >= 1) return {sa: true, r: 1, c: 1, v: [o]}; for (const k in o) this.setVar(this.base, k, o[k]); };
  B.save = function (a) { const c = this.ctx; if (!c.saveMat) E('MATLAB:save', 'save: bu ortamda kullanılamıyor.'); const nm = S(a[0]); const names = a.slice(1).map(S); const vars = Object.create(null); for (const [k, v] of this.base.vars) if (!names.length || names.includes(k)) vars[k] = v; c.saveMat(nm, vars); };
  B.exist_file_ = null; delete B.exist_file_;
  B.isfile = () => bool(false); B.pwd = () => str('/'); B.cd = () => {}; B.addpath = () => {}; B.mfilename = () => str('betik'); B.datenum = () => num(Date.now() / 86400000 + 719529);

  /* ---------- figür modeli ---------- */
  function fig(it, create) { if (!it.figs) { it.figs = new Map(); it.curFig = 0; } if (!it.curFig && create !== false) { newFig(it, 1); } return it.figs.get(it.curFig); }
  function newFig(it, id) { if (!it.figs) { it.figs = new Map(); } if (!id) { id = 1; while (it.figs.has(id)) id++; } if (!it.figs.has(id)) it.figs.set(id, {id, rows: 1, cols: 1, axes: [], cur: null, title: ''}); it.curFig = id; return it.figs.get(id); }
  function axes(it, pos) { const f = fig(it); if (!f.axes.length || !f.cur) { if (!f.cur) { const ax = mkAx(f, 1, 1, 1); f.cur = ax; } } return f.cur; }
  function mkAx(f, r, c, p) { const ex = f.axes.find(a => a.r === r && a.c === c && a.p === p); if (ex) return ex; f.rows = Math.max(f.rows, r); f.cols = Math.max(f.cols, c); const ax = {r, c, p, traces: [], xlabel: '', ylabel: '', title: '', xlim: null, ylim: null, grid: false, legend: null, xscale: 'linear', yscale: 'linear', hold: false, ci: 0}; f.axes.push(ax); return ax; }
  const STYLE_RE = /^([-:.]{0,2})?([rgbcmykw])?([-:.]{1,2})?([o+*.xsd^v<>ph]?)([-:.]{0,2})?$/;
  const COLS = {r: '#d62728', g: '#2ca02c', b: '#1f77b4', c: '#17becf', m: '#9467bd', y: '#bcbd22', k: '#000000', w: '#ffffff'};
  function parseStyle(s) { const o = {}; let m = s; const c = m.match(/[rgbcmykw]/); if (c) { o.color = COLS[c[0]]; m = m.replace(c[0], ''); } if (m.includes('--')) { o.dash = [6, 4]; m = m.replace('--', ''); } else if (m.includes('-.')) { o.dash = [6, 3, 1, 3]; m = m.replace('-.', ''); } else if (m.includes(':')) { o.dash = [1, 3]; m = m.replace(':', ''); } const mk = m.match(/[o+*.xsd^v<>ph]/); if (mk) { o.marker = mk[0]; if (!/-/.test(s) && !s.includes(':')) o.noLine = true; } return o; }
  B.figure = function (a) { if (!a.length) newFig(this, 0); else { const id = Math.floor(sc1(a[0])); newFig(this, id); } return; };
  B.gcf = function () { fig(this); return num(this.curFig); }; B.gca = function () { axes(this); return num(1); };
  B.clf = function () { const f = fig(this); f.axes = []; f.cur = null; f.rows = f.cols = 1; };
  B.cla = function () { const ax = axes(this); ax.traces = []; ax.ci = 0; };
  B.subplot = function (a) { const f = fig(this); let r, c, p; if (a.length === 1) { const v = Math.floor(sc1(a[0])); r = Math.floor(v / 100); c = Math.floor(v / 10) % 10; p = v % 10; } else { r = sc1(a[0]); c = sc1(a[1]); p = sc1(a[2]); } if (!(r >= 1 && c >= 1 && p >= 1 && p <= r * c)) E('MATLAB:subplot:InvalidIndex', `subplot(${r},${c},${p}): geçersiz konum.`); if (f.axes.some(x => x.r !== r || x.c !== c)) { f.axes = []; } f.cur = mkAx(f, r, c, p); };
  B.hold = function (a) { const ax = axes(this); const s = a.length ? S(a[0]) : 'toggle'; ax.hold = s === 'on' ? true : s === 'off' ? false : !ax.hold; };
  B.plot = function (a) {
    const ax = axes(this); if (!ax.hold) { ax.traces = []; ax.ci = 0; }
    let i = 0; const items = [];
    while (i < a.length) {
      if (a[i] instanceof M && a[i].t === 'c' && !(a[i].r === 1 && items.length === 0 && false)) { if (['LineWidth', 'Color', 'DisplayName', 'MarkerSize', 'LineStyle', 'Marker'].includes(S(a[i]))) break; i++; continue; }
      const x = a[i]; let y = null, st = ''; i++;
      if (i < a.length && !(a[i] instanceof M && a[i].t === 'c')) { y = a[i]; i++; }
      if (i < a.length && a[i] instanceof M && a[i].t === 'c' && !['LineWidth', 'Color', 'DisplayName', 'MarkerSize', 'LineStyle', 'Marker'].includes(S(a[i]))) { st = S(a[i]); i++; }
      items.push({x: y ? x : null, y: y || x, st});
    }
    const props = {}; for (; i + 1 < a.length; i += 2) props[S(a[i]).toLowerCase()] = a[i + 1];
    for (const it of items) {
      const Y = mat(it.y, 'plot y'); const X = it.x ? mat(it.x, 'plot x') : null;
      const cols = (isVec(Y) ? 1 : Y.c), n = isVec(Y) ? Y.re.length : Y.r;
      if (X && isVec(X) && X.re.length !== n) E('MATLAB:plot:xyMismatch', `plot: x (${X.re.length}) ve y (${n}) uzunlukları eşit olmalı.`);
      for (let k = 0; k < cols; k++) {
        const y = Float64Array.from(isVec(Y) ? Y.re : Y.re.subarray(k * Y.r, (k + 1) * Y.r)); const x = X ? Float64Array.from(isVec(X) ? X.re : X.re.subarray((X.c > 1 ? k : 0) * X.r, ((X.c > 1 ? k : 0) + 1) * X.r)) : null;
        const sty = parseStyle(it.st); const tr = {x, y, name: '', color: sty.color || null, dash: sty.dash || null, marker: sty.marker || null, noLine: !!sty.noLine, lw: 1.2, kind: 'line'};
        if (props.linewidth) tr.lw = sc1(props.linewidth); if (props.color) tr.color = props.color.t === 'c' ? ({red: COLS.r, blue: COLS.b, green: COLS.g, black: COLS.k, yellow: COLS.y, cyan: COLS.c, magenta: COLS.m}[S(props.color)] || null) : '#' + Array.from(props.color.re.slice(0, 3)).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); if (props.displayname) tr.name = S(props.displayname);
        ax.traces.push(tr);
      }
    }
  };
  B.semilogx = function (a) { B.plot.call(this, a); axes(this).xscale = 'log'; }; B.semilogy = function (a) { B.plot.call(this, a); axes(this).yscale = 'log'; }; B.loglog = function (a) { B.plot.call(this, a); const ax = axes(this); ax.xscale = ax.yscale = 'log'; };
  B.stem = function (a) { B.plot.call(this, a.length > 1 && !(a[1] instanceof M && a[1].t === 'c') ? [a[0], a[1], str('o')] : [a[0], str('o')]); const ax = axes(this); const t = ax.traces[ax.traces.length - 1]; if (t) t.kind = 'stem'; };
  B.scatter = function (a) { const ax = axes(this); if (!ax.hold) { ax.traces = []; ax.ci = 0; } ax.traces.push({x: Float64Array.from(mat(a[0]).re), y: Float64Array.from(mat(a[1]).re), name: '', color: null, marker: 'o', noLine: true, lw: 1, kind: 'line'}); };
  B.bar = function (a) { const ax = axes(this); if (!ax.hold) { ax.traces = []; ax.ci = 0; } const y = a.length > 1 && !(a[1] instanceof M && a[1].t === 'c') ? a[1] : a[0]; const x = a.length > 1 && !(a[1] instanceof M && a[1].t === 'c') ? a[0] : null; ax.traces.push({x: x ? Float64Array.from(x.re) : null, y: Float64Array.from(mat(y).re), name: '', kind: 'bar', color: null, lw: 1}); };
  B.hist = function (a, no) { const x = mat(a[0]).re; const nb = a[1] ? sc1(a[1]) : 10; const [c, e] = B.histcounts([a[0], num(nb)]); const ctr = Float64Array.from({length: nb}, (_, i) => (e.re[i] + e.re[i + 1]) / 2); if (no >= 1) return [rowv(c.re), rowv(ctr)]; const ax = axes(this); if (!ax.hold) { ax.traces = []; ax.ci = 0; } ax.traces.push({x: ctr, y: Float64Array.from(c.re), name: '', kind: 'bar', color: null, lw: 1}); };
  B.histogram = B.hist;
  B.xlabel = function (a) { axes(this).xlabel = S(a[0]); }; B.ylabel = function (a) { axes(this).ylabel = S(a[0]); }; B.title = function (a) { axes(this).title = S(a[0]); }; B.sgtitle = function (a) { fig(this).title = S(a[0]); };
  B.legend = function (a) { const ax = axes(this); const names = []; for (const x of a) { if (isCell(x)) x.v.forEach(y => names.push(S(y))); else if (x instanceof M && x.t === 'c' && !['Location', 'location', 'off', 'Orientation', 'northeast', 'northwest', 'best', 'southeast', 'southwest', 'north', 'south', 'east', 'west', 'northoutside', 'eastoutside'].includes(S(x))) names.push(S(x)); } if (a.length && a[0] instanceof M && a[0].t === 'c' && S(a[0]) === 'off') { ax.legend = false; return; } names.forEach((nm, i) => { if (ax.traces[i]) ax.traces[i].name = nm; }); ax.legend = true; };
  B.grid = function (a) { const ax = axes(this); const s = a.length ? S(a[0]) : 'toggle'; ax.grid = s === 'on' ? true : s === 'off' ? false : !ax.grid; };
  B.xlim = function (a) { const ax = axes(this); if (a.length && a[0].re.length === 2) ax.xlim = [a[0].re[0], a[0].re[1]]; else if (a.length && S(a[0]) === 'auto') ax.xlim = null; }; B.ylim = function (a) { const ax = axes(this); if (a.length && a[0].re.length === 2) ax.ylim = [a[0].re[0], a[0].re[1]]; else if (a.length && S(a[0]) === 'auto') ax.ylim = null; };
  B.axis = function (a) { const ax = axes(this); if (a.length && a[0].t !== 'c' && a[0].re.length === 4) { ax.xlim = [a[0].re[0], a[0].re[1]]; ax.ylim = [a[0].re[2], a[0].re[3]]; } else if (a.length && S(a[0]) === 'tight') { ax.xlim = ax.ylim = null; } };
  B.box = B.colormap = B.shading = B.colorbar = B.set = B.text = B.annotation = B.line_ = () => {}; delete B.line_;
  B.yyaxis = unsup('yyaxis'); B.tiledlayout = function (a) { const f = fig(this); f.tl = [sc1(a[0]), sc1(a[1])]; f.tlN = 0; }; B.nexttile = function () { const f = fig(this); if (!f.tl) E('MATLAB:nexttile', 'nexttile için önce tiledlayout(r,c) çağrılmalı.'); f.tlN++; f.cur = mkAx(f, f.tl[0], f.tl[1], f.tlN); };
  B.saveas = B.print = B.exportgraphics = () => {};
})(MLAB);
