/* ===== MATLAB alt kümesi yorumlayıcısı — 5: ek işlevler (Faz 5: sinyal işleme, veri temizleme / istatistik, grafik) =====
   MATLAB ile aynı adlar ve çağrı biçimleri; matrislerde (aksi belirtilmedikçe) sütun sütun çalışır. */
(function (ML) {
  'use strict';
  const B = ML.builtins, {M, num, zeros, rowv, colv, str, bool, empty, isCell, E, toStr} = ML, H = ML._h, {mat, sc1, S, isVec, like, dft, filt, filtfiltVec, butterDesign} = H;
  const isStrV = v => v instanceof M && v.t === 'c';
  const optNum = (v, d) => v instanceof M && v.re.length && !isStrV(v) ? v.re[0] : d;
  const shapeLike = (m, arr) => { const o = like(m, Float64Array.from(arr)); return o; };
  // vektörde doğrudan, matriste her sütuna uygula (çıktı aynı biçim; fn Float64Array → Float64Array aynı uzunluk)
  function colMap(m, fn) { if (isVec(m)) return like(m, Float64Array.from(fn(Float64Array.from(m.re)))); const o = zeros(m.r, m.c); for (let j = 0; j < m.c; j++) o.re.set(fn(m.re.slice(j * m.r, (j + 1) * m.r)), j * m.r); return o; }
  function colReduce(m, fn) { if (isVec(m)) return num(fn(Float64Array.from(m.re))); const o = zeros(1, m.c); for (let j = 0; j < m.c; j++) o.re[j] = fn(m.re.slice(j * m.r, (j + 1) * m.r)); return o; }
  const nv = (m, k) => { const v = m instanceof M ? m.re : m; return Float64Array.from(v); };
  const opts = (a, from) => { const o = {}; for (let i = from; i + 1 < a.length; i += 2) if (isStrV(a[i])) o[S(a[i]).toLowerCase()] = a[i + 1]; return o; };
  const fft = (re, im, inv) => dft(Float64Array.from(re), im ? Float64Array.from(im) : new Float64Array(re.length), !!inv);
  function median(x) { const v = Array.from(x).filter(q => q === q).sort((p, q) => p - q); if (!v.length) return NaN; const k = v.length >> 1; return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2; }
  function prctile(v, p) { v = Array.from(v).filter(q => q === q).sort((a, b) => a - b); if (!v.length) return NaN; const pos = p / 100 * v.length - 0.5; if (pos <= 0) return v[0]; if (pos >= v.length - 1) return v[v.length - 1]; const i = Math.floor(pos); return v[i] + (v[i + 1] - v[i]) * (pos - i); }
  const meanOf = x => { let s = 0, n = 0; for (const v of x) if (v === v) { s += v; n++; } return n ? s / n : NaN; };
  const stdOf = (x, w) => { const m = meanOf(x); let s = 0, n = 0; for (const v of x) if (v === v) { s += (v - m) ** 2; n++; } return n > 1 || w ? Math.sqrt(s / (w ? n : n - 1)) : 0; };

  /* ---------------- pencereler ---------------- */
  function bessI0(x) { let s = 1, t = 1; for (let k = 1; k < 50; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-17 * s) break; } return s; }
  const win = (L, f) => colv(Array.from({length: L}, (_, i) => f(i, L)));
  B.kaiser = a => { const L = sc1(a[0]), beta = optNum(a[1], 0.5), d = bessI0(beta); return win(L, (i, L) => L === 1 ? 1 : bessI0(beta * Math.sqrt(1 - ((2 * i) / (L - 1) - 1) ** 2)) / d); };
  B.tukeywin = a => { const L = sc1(a[0]), r = Math.max(0, Math.min(1, optNum(a[1], 0.5))); return win(L, (i, L) => { if (L === 1) return 1; const x = i / (L - 1); if (r <= 0) return 1; if (x < r / 2) return 0.5 * (1 + Math.cos(2 * Math.PI / r * (x - r / 2))); if (x >= 1 - r / 2) return 0.5 * (1 + Math.cos(2 * Math.PI / r * (x - 1 + r / 2))); return 1; }); };
  B.gausswin = a => { const L = sc1(a[0]), al = optNum(a[1], 2.5); return win(L, (i, L) => { const n = i - (L - 1) / 2; return L === 1 ? 1 : Math.exp(-0.5 * (al * n / ((L - 1) / 2)) ** 2); }); };
  B.flattopwin = a => { const L = sc1(a[0]), c = [0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368]; return win(L, (i, L) => { if (L === 1) return 1; const t = 2 * Math.PI * i / (L - 1); return c[0] - c[1] * Math.cos(t) + c[2] * Math.cos(2 * t) - c[3] * Math.cos(3 * t) + c[4] * Math.cos(4 * t); }); };
  B.rectwin = a => win(sc1(a[0]), () => 1);
  B.bartlett = a => win(sc1(a[0]), (i, L) => L === 1 ? 1 : 1 - Math.abs(2 * i / (L - 1) - 1));
  B.triang = a => win(sc1(a[0]), (i, L) => L % 2 ? 1 - Math.abs((2 * (i + 1) - L - 1) / (L + 1)) : 1 - Math.abs((2 * (i + 1) - L - 1) / L));

  /* ---------------- sinyal üretimi ---------------- */
  const tmap = (t, f) => like(mat(t), Float64Array.from(mat(t).re, f));
  B.sawtooth = a => { const w = optNum(a[1], 1); return tmap(a[0], t => { const x = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI); return w > 0 && x < w ? -1 + 2 * x / w : w < 1 ? 1 - 2 * (x - w) / (1 - w) : -1 + 2 * x; }); };
  B.square = a => { const d = optNum(a[1], 50) / 100; return tmap(a[0], t => { const x = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI); return x < d ? 1 : -1; }); };
  B.rectpuls = a => { const w = optNum(a[1], 1); return tmap(a[0], t => (t >= -w / 2 && t < w / 2) ? 1 : 0); };
  B.tripuls = a => { const w = optNum(a[1], 1), s = optNum(a[2], 0), p = s * w / 2; return tmap(a[0], t => { if (t <= -w / 2 || t >= w / 2) return 0; return t < p ? (t + w / 2) / (p + w / 2) : (w / 2 - t) / (w / 2 - p); }); };
  B.chirp = a => { const f0 = optNum(a[1], 0), t1 = optNum(a[2], 1), f1 = optNum(a[3], 100), meth = a[4] && isStrV(a[4]) ? S(a[4]).toLowerCase() : 'linear', phi = optNum(a[5], 0) * Math.PI / 180;
    return tmap(a[0], t => { let ph; if (meth.startsWith('q')) ph = 2 * Math.PI * (f0 * t + (f1 - f0) / (3 * t1 * t1) * t ** 3); else if (meth.startsWith('log')) { const b = Math.pow(f1 / f0, 1 / t1); ph = 2 * Math.PI * f0 * (Math.pow(b, t) - 1) / Math.log(b); } else ph = 2 * Math.PI * (f0 * t + (f1 - f0) / (2 * t1) * t * t); return Math.cos(ph + phi); }); };
  B.pulstran = function (a) { const t = mat(a[0]), d = mat(a[1]).re, fn = a[2]; const w = a.slice(3); const out = new Float64Array(t.re.length);
    for (const dd of d) { const sh = like(t, Float64Array.from(t.re, v => v - dd)); const r = typeof fn === 'object' && fn.fh ? this.callFunctionValue(fn, [sh, ...w], 1) : (B[S(fn)] || E('MATLAB:pulstran', 'pulstran: işlev bulunamadı'))([sh, ...w], 1); const rr = Array.isArray(r) ? r[0] : r; for (let i = 0; i < out.length; i++) out[i] += rr.re[i]; }
    return like(t, out); };
  B.buffer = a => { const x = mat(a[0]).re, n = sc1(a[1]), p = optNum(a[2], 0); if (p >= n) E('MATLAB:buffer', 'buffer: örtüşme n\'den küçük olmalı.'); const step = n - p, cols = Math.max(1, Math.ceil((x.length + (p > 0 ? p : 0)) / step)); const o = zeros(n, cols);
    const src = p > 0 ? Float64Array.from([...new Array(p).fill(0), ...x]) : x; for (let c = 0; c < cols; c++) for (let i = 0; i < n; i++) { const k = c * step + i; o.re[i + c * n] = k < src.length ? src[k] : 0; } return o; };

  /* ---------------- süzgeçler ---------------- */
  // sos: L×6 [b0 b1 b2 a0 a1 a2]
  const sosRows = m => { const s = mat(m); if (s.c !== 6) E('MATLAB:sos', 'SOS matrisi L×6 olmalı.'); const r = []; for (let i = 0; i < s.r; i++) r.push(Array.from({length: 6}, (_, j) => s.re[i + j * s.r])); return r; };
  B.sosfilt = a => { const rows = sosRows(a[0]); return colMap(mat(a[1]), x => { let y = x; for (const q of rows) y = filt([q[0], q[1], q[2]], [q[3], q[4], q[5]], y, null)[0]; return y; }); };
  function pzFilter(type, x, wp, fs, order) {
    const nyq = fs ? fs / 2 : 1, W = Array.from(wp).map(v => v / nyq); for (const w of W) if (!(w > 0 && w < 1)) E('MATLAB:' + type, type + ': geçirme frekansı 0 ile Nyquist (' + (fs ? fs / 2 + ' Hz' : '1 × π rad/örnek') + ') arasında olmalı.');
    const [b, den] = butterDesign(order || 8, W, type === 'lowpass' ? 'low' : type === 'highpass' ? 'high' : type === 'bandpass' ? 'bandpass' : 'stop');
    return colMap(x, v => filtfiltVec(b, den, v));
  }
  // lowpass / highpass / bandpass / bandstop: MATLAB gibi gecikmesiz (sıfır fazlı) — 8. derece Butterworth ile; 'Order' ile değiştirilebilir
  for (const [nm, n2] of [['lowpass', 1], ['highpass', 1], ['bandpass', 2], ['bandstop', 2]]) B[nm] = a => { const x = mat(a[0]), wp = mat(a[1]).re; if (wp.length !== n2) E('MATLAB:' + nm, nm + ': ' + (n2 === 2 ? '[f1 f2]' : 'tek frekans') + ' bekleniyor.'); const fs = a[2] && !isStrV(a[2]) ? sc1(a[2]) : 0, o = opts(a, fs ? 3 : 2); const ord = o.order ? Math.round(sc1(o.order)) : 8; return pzFilter(nm, x, wp, fs, Math.max(1, Math.min(nm.startsWith('band') ? 10 : 20, nm.startsWith('band') ? Math.ceil(ord / 2) : ord))); };
  B.iirnotch = a => { const w0 = sc1(a[0]), bw = sc1(a[1]), ab = optNum(a[2], 3), BW = bw * Math.PI, Gb = Math.pow(10, -Math.abs(ab) / 20), beta = Math.sqrt(1 - Gb * Gb) / Gb * Math.tan(BW / 2), g = 1 / (1 + beta), c = Math.cos(w0 * Math.PI); return [rowv([g, -2 * g * c, g]), rowv([1, -2 * g * c, 2 * g - 1])]; };
  // Savitzky–Golay: uçlarda da en küçük kareler uydurması (MATLAB sgolayfilt gibi)
  function sgMatrix(order, F) { const m = (F - 1) / 2, n = order + 1, X = zeros(F, n); for (let i = 0; i < F; i++) for (let j = 0; j < n; j++) X.re[i + j * F] = Math.pow(i - m, j); const Xt = ML.transpose(X, false), Ainv = B.inv([ML.matmul(Xt, X)]); return ML.matmul(ML.matmul(X, Ainv), Xt); }
  B.sgolayfilt = a => { const order = sc1(a[1]), F = sc1(a[2]); if (F % 2 !== 1 || F <= order) E('MATLAB:sgolayfilt', 'sgolayfilt: çerçeve uzunluğu tek ve dereceden büyük olmalı.'); const P = sgMatrix(order, F), m = (F - 1) / 2, row = (i, j) => P.re[i + j * F];
    return colMap(mat(a[0]), x => { const n = x.length; if (n < F) E('MATLAB:sgolayfilt', 'sgolayfilt: veri çerçeveden kısa.'); const y = new Float64Array(n);
      for (let i = m; i < n - m; i++) { let s = 0; for (let j = 0; j < F; j++) s += row(m, j) * x[i - m + j]; y[i] = s; }
      for (let i = 0; i < m; i++) { let s = 0, t = 0; for (let j = 0; j < F; j++) { s += row(i, j) * x[j]; t += row(F - m + i, j) * x[n - F + j]; } y[i] = s; y[n - m + i] = t; }
      return y; }); };
  B.smoothdata = a => { const x = mat(a[0]); let meth = 'movmean', w = null, k = 1; if (a[1] && isStrV(a[1])) { meth = S(a[1]).toLowerCase(); k = 2; } if (a[k] && !isStrV(a[k])) w = sc1(a[k]);
    const n = isVec(x) ? x.re.length : x.r; if (w == null) w = Math.max(3, Math.round(n * 0.04) | 1);
    if (meth === 'movmean' || meth === 'movmedian') return B[meth]([x, num(w)]);
    if (meth === 'gaussian') { const L = Math.max(1, Math.round(w)), sig = L / 5, h = Array.from({length: L}, (_, i) => Math.exp(-0.5 * ((i - (L - 1) / 2) / sig) ** 2)); return colMap(x, v => { const y = new Float64Array(v.length), half = (L - 1) / 2; for (let i = 0; i < v.length; i++) { let s = 0, sw = 0; for (let j = 0; j < L; j++) { const q = Math.round(i - half + j); if (q < 0 || q >= v.length) continue; s += h[j] * v[q]; sw += h[j]; } y[i] = s / sw; } return y; }); }
    if (meth === 'sgolay') { let F = Math.round(w); if (F % 2 === 0) F++; return B.sgolayfilt([x, num(2), num(Math.max(3, F))]); }
    if (meth === 'lowess' || meth === 'loess') { const deg = meth === 'loess' ? 2 : 1, L = Math.max(3, Math.round(w)); return colMap(x, v => { const n = v.length, y = new Float64Array(n), h = (L - 1) / 2; for (let i = 0; i < n; i++) { const a0 = Math.max(0, Math.round(i - h)), b0 = Math.min(n - 1, Math.round(i + h)), d = Math.max(i - a0, b0 - i) + 1; const xs = [], ys = [], ws = []; for (let q = a0; q <= b0; q++) { const u = Math.abs(q - i) / d; xs.push(q - i); ys.push(v[q]); ws.push((1 - u ** 3) ** 3); } y[i] = wpoly(xs, ys, ws, deg); } return y; }); }
    E('MATLAB:smoothdata', 'smoothdata: yöntem movmean, movmedian, gaussian, lowess, loess ya da sgolay olmalı.'); };
  function wpoly(xs, ys, ws, deg) { const n = deg + 1, A = new Float64Array(n * n), b = new Float64Array(n); for (let k = 0; k < xs.length; k++) { const p = []; for (let j = 0; j < n; j++) p.push(Math.pow(xs[k], j)); for (let r = 0; r < n; r++) { b[r] += ws[k] * p[r] * ys[k]; for (let c = 0; c < n; c++) A[r * n + c] += ws[k] * p[r] * p[c]; } } // Gauss eleme
    for (let c = 0; c < n; c++) { let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[piv * n + c])) piv = r; if (Math.abs(A[piv * n + c]) < 1e-14) return ys[xs.indexOf(0)]; for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[piv * n + k]; A[piv * n + k] = t; } const t = b[c]; b[c] = b[piv]; b[piv] = t; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r * n + c] / A[c * n + c]; for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k]; b[r] -= f * b[c]; } }
    return b[0] / A[0]; }
  B.fir2 = a => { const n = sc1(a[0]), f = mat(a[1]).re, m = mat(a[2]).re, wnd = a[3] && !isStrV(a[3]) ? mat(a[3]).re : null; const npt = n < 1024 ? 512 : Math.pow(2, Math.ceil(Math.log2(n))), N = n + 1;
    // istenen genliği npt+1 noktada doğrusal ara değerle, doğrusal faz, ters DFT, pencere
    const Hm = new Float64Array(npt + 1); for (let k = 0; k <= npt; k++) { const fr = k / npt; let j = 0; while (j < f.length - 2 && f[j + 1] < fr) j++; const t = f[j + 1] > f[j] ? (fr - f[j]) / (f[j + 1] - f[j]) : 0; Hm[k] = m[j] + (m[j + 1] - m[j]) * Math.max(0, Math.min(1, t)); }
    const L = 2 * npt, re = new Float64Array(L), im = new Float64Array(L); for (let k = 0; k <= npt; k++) { const ph = -Math.PI * k * (N - 1) / L * 2 / 2; re[k] = Hm[k] * Math.cos(ph * 1); im[k] = Hm[k] * Math.sin(ph); if (k > 0 && k < npt) { re[L - k] = re[k]; im[L - k] = -im[k]; } }
    const [r] = fft(re, im, true); const w = wnd ? Array.from(wnd) : Array.from({length: N}, (_, i) => N === 1 ? 1 : 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (N - 1)));
    return rowv(Array.from({length: N}, (_, i) => r[i] / L * w[i])); };
  B.kaiserord = a => { const fc = mat(a[0]).re, mags = mat(a[1]).re, devs = mat(a[2]).re, fs = optNum(a[3], 2); let dmin = Infinity; for (const d of devs) dmin = Math.min(dmin, d); const A = -20 * Math.log10(dmin);
    let dw = Infinity; for (let i = 0; i + 1 < fc.length; i += 2) dw = Math.min(dw, Math.abs(fc[i + 1] - fc[i])); dw = 2 * Math.PI * dw / fs;
    const beta = A > 50 ? 0.1102 * (A - 8.7) : A >= 21 ? 0.5842 * Math.pow(A - 21, 0.4) + 0.07886 * (A - 21) : 0; let n = Math.ceil((A - 7.95) / (2.285 * dw)); if (A <= 21) n = Math.ceil(5.79 / dw);
    const Wn = []; for (let i = 0; i + 1 < fc.length; i += 2) Wn.push((fc[i] + fc[i + 1]) / fs); const typ = mags[0] > mags[mags.length - 1] ? (mags.length === 2 ? 'low' : 'stop') : mags.length === 2 ? 'high' : 'bandpass'; if ((typ === 'high' || typ === 'stop') && n % 2) n++;
    return [num(n), rowv(Wn), num(beta), str(typ)]; };
  B.filtic = a => { const b = Array.from(mat(a[0]).re), den = Array.from(mat(a[1]).re), y = Array.from(mat(a[2]).re), x = a[3] ? Array.from(mat(a[3]).re) : []; const n = Math.max(b.length, den.length) - 1, a0 = den[0];
    const bb = Array.from({length: n + 1}, (_, i) => (b[i] || 0) / a0), aa = Array.from({length: n + 1}, (_, i) => (den[i] || 0) / a0); const z = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = i + 1; k <= n; k++) s += bb[k] * (x[k - i - 1] || 0) - aa[k] * (y[k - i - 1] || 0); z[i] = s; } return colv(z); };
  B.upfirdn = a => { const x = mat(a[0]).re, h = mat(a[1]).re, p = Math.round(optNum(a[2], 1)), q = Math.round(optNum(a[3], 1)); const up = new Float64Array((x.length - 1) * p + 1); for (let i = 0; i < x.length; i++) up[i * p] = x[i];
    const L = up.length + h.length - 1, y = []; for (let k = 0; k < L; k += q) { let s = 0; for (let j = 0; j < h.length; j++) { const i = k - j; if (i >= 0 && i < up.length) s += h[j] * up[i]; } y.push(s); } return mat(a[0]).c === 1 ? colv(y) : rowv(y); };

  /* ---------------- dönüşüm ve tasarım yardımcıları ---------------- */
  const polyMul = (p, q) => { const o = new Array(p.length + q.length - 1).fill(0); for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) o[i + j] += p[i] * q[j]; return o; };
  const cpolyFromRoots = rts => { let p = [[1, 0]]; for (const [rr, ri] of rts) { const q = Array.from({length: p.length + 1}, () => [0, 0]); for (let i = 0; i < p.length; i++) { q[i][0] += p[i][0]; q[i][1] += p[i][1]; q[i + 1][0] -= p[i][0] * rr - p[i][1] * ri; q[i + 1][1] -= p[i][0] * ri + p[i][1] * rr; } p = q; } return p.map(c => c[0]); };
  const rootsOf = c => { const r = B.roots([rowv(c)]); const o = []; for (let i = 0; i < r.re.length; i++) o.push([r.re[i], r.im ? r.im[i] : 0]); return o; };
  const cv = (rts, col) => { const re = rts.map(r => r[0]), im = rts.map(r => r[1]); const o = col ? colv(re) : rowv(re); if (im.some(v => Math.abs(v) > 1e-12)) o.im = Float64Array.from(im); return o; };
  const toRts = m => { const v = mat(m); return Array.from(v.re, (x, i) => { const im = v.im ? v.im[i] : 0; return [x, Math.abs(im) < 1e-4 * Math.max(1, Math.abs(x)) ? 0 : im]; }); };
  B.tf2zp = a => { const b = Array.from(mat(a[0]).re), den = Array.from(mat(a[1]).re); while (b.length && b[0] === 0) b.shift(); return [cv(rootsOf(b), true), cv(rootsOf(den), true), num(b[0] / den[0])]; };
  B.zp2tf = a => { const k = sc1(a[2]); return [rowv(cpolyFromRoots(toRts(a[0])).map(v => v * k)), rowv(cpolyFromRoots(toRts(a[1])))]; };
  // kökleri eşlenik çiftler / gerçek çiftler olarak 2. dereceden bölümlere ayır (kutuplar birim çembere yakından uzağa)
  function pairRoots(r) { const out = [], used = new Array(r.length).fill(false), mag = i => Math.hypot(r[i][0], r[i][1]); const idx = r.map((_, i) => i).sort((p, q) => mag(q) - mag(p));
    for (const i of idx) { if (used[i]) continue; used[i] = true; if (Math.abs(r[i][1]) > 1e-9) { let j = -1, bd = Infinity; for (let k = 0; k < r.length; k++) if (!used[k]) { const d = Math.hypot(r[k][0] - r[i][0], r[k][1] + r[i][1]); if (d < bd) { bd = d; j = k; } } if (j >= 0) used[j] = true; out.push([r[i], j >= 0 ? r[j] : [r[i][0], -r[i][1]]]); }
      else { let j = -1; for (const k of idx) if (!used[k] && Math.abs(r[k][1]) <= 1e-9) { j = k; break; } if (j >= 0) { used[j] = true; out.push([r[i], r[j]]); } else out.push([r[i]]); } }
    return out; }
  B.zp2sos = a => { const z = toRts(a[0]), p = toRts(a[1]), k = optNum(a[2], 1), zp = pairRoots(z), pp = pairRoots(p), L = Math.max(zp.length, pp.length, 1), o = zeros(L, 6);
    // MATLAB 'up' sırası: birim çembere en yakın kutuplar son bölümde; kazanç ilk bölüme gömülür
    for (let i = 0; i < L; i++) { const s = L - 1 - i, bz = zp[s] ? cpolyFromRoots(zp[s]) : [1], ap = pp[s] ? cpolyFromRoots(pp[s]) : [1]; const B3 = [...bz, 0, 0].slice(0, 3), A3 = [...ap, 0, 0].slice(0, 3); const row = i === 0 ? [...B3.map(v => v * k), ...A3] : [...B3, ...A3]; for (let j = 0; j < 6; j++) o.re[i + j * L] = row[j]; }
    // MATLAB: kazanç ayrı istenirse [sos, g]
    return [o, num(1)]; };
  B.tf2sos = function (a, no) { const [z, p, k] = B.tf2zp(a); const [sos] = B.zp2sos([z, p, k]); if (no >= 2) { const L = sos.r; for (let j = 0; j < 3; j++) sos.re[j * L] /= k.re[0]; return [sos, k]; } return sos; };
  B.sos2tf = a => { const rows = sosRows(a[0]), g = optNum(a[1], 1); let b = [1], den = [1]; for (const q of rows) { b = polyMul(b, q.slice(0, 3)); den = polyMul(den, q.slice(3)); } const trim = v => { while (v.length > 1 && Math.abs(v[v.length - 1]) < 1e-15) v.pop(); return v; }; return [rowv(trim(b).map(v => v * g)), rowv(trim(den))]; };
  B.impz = a => { const b = mat(a[0]).re, den = a[1] && a[1].re.length ? mat(a[1]).re : [1]; let n = a[2] && a[2].re.length ? sc1(a[2]) : 0;
    if (!n) { if (den.length === 1) n = b.length; else { const rr = rootsOf(Array.from(den)); const mx = Math.max(...rr.map(r => Math.hypot(r[0], r[1]))); n = mx >= 1 ? 100 : Math.min(10000, Math.max(b.length, Math.ceil(Math.log(1e-4) / Math.log(Math.max(1e-9, mx))) + b.length)); } }
    const x = new Float64Array(n); x[0] = 1; const fs = optNum(a[3], 1); return [colv(filt(b, den, x, null)[0]), colv(Array.from({length: n}, (_, i) => i / fs))]; };
  B.grpdelay = a => { const b = Array.from(mat(a[0]).re), den = a[1] && a[1].re.length ? Array.from(mat(a[1]).re) : [1], n = optNum(a[2], 512), fs = a[3] && a[3].re.length ? sc1(a[3]) : 0;
    // gd = Re{ DFT(k·c) / DFT(c) }, c = b * conj(ters(a))
    const c = polyMul(b, den.slice().reverse()), cr = c.map((v, k) => v * k), out = new Float64Array(n), w = new Float64Array(n), oa = den.length - 1;
    for (let k = 0; k < n; k++) { const om = Math.PI * k / n; let nr = 0, ni = 0, dr = 0, di = 0; for (let j = 0; j < c.length; j++) { const co = Math.cos(om * j), si = -Math.sin(om * j); dr += c[j] * co; di += c[j] * si; nr += cr[j] * co; ni += cr[j] * si; } const d2 = dr * dr + di * di; out[k] = d2 < 1e-30 ? 0 : (nr * dr + ni * di) / d2 - oa; w[k] = fs ? om / Math.PI * fs / 2 : om; }
    return [colv(out), colv(w)]; };
  B.freqs = a => { const b = mat(a[0]).re, den = mat(a[1]).re; let w = a[2] && a[2].re.length > 1 ? Float64Array.from(mat(a[2]).re) : null; if (!w) { const n = optNum(a[2], 200); w = Float64Array.from({length: n}, (_, i) => Math.pow(10, -1 + 3 * i / (n - 1))); }
    const ev = (p, x) => { let r = 0, im = 0; for (const c of p) { const nr = r * 0 - im * x + c, ni = r * x + im * 0; r = nr; im = ni; } return [r, im]; };
    const re = new Float64Array(w.length), im = new Float64Array(w.length); for (let i = 0; i < w.length; i++) { const [nr, ni] = ev(b, w[i]), [dr, di] = ev(den, w[i]), d2 = dr * dr + di * di; re[i] = (nr * dr + ni * di) / d2; im[i] = (ni * dr - nr * di) / d2; }
    const h = colv(Array.from(re)); h.im = im; return [h, colv(Array.from(w))]; };

  /* ---------------- spektral ---------------- */
  function welchCore(x, y, a, from) {   // ortak Welch: (x, y, window, noverlap, nfft, fs)
    const wv = a[from] && a[from].re.length ? (a[from].re.length > 1 ? Array.from(a[from].re) : Array.from({length: a[from].re[0]}, (_, i, arr) => 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (a[from].re[0] - 1)))) : null;
    const n = x.length, L = wv ? wv.length : Math.max(8, Math.floor(n / 4.5)), w = wv || Array.from({length: L}, (_, i) => 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (L - 1)));
    const nov = a[from + 1] && a[from + 1].re.length ? a[from + 1].re[0] : Math.floor(L / 2), N = a[from + 2] && a[from + 2].re.length ? a[from + 2].re[0] : Math.max(256, Math.pow(2, Math.ceil(Math.log2(L)))), fs = a[from + 3] && a[from + 3].re.length ? a[from + 3].re[0] : 0;
    const step = L - nov, K = Math.floor((n - nov) / step); if (K < 1) E('MATLAB:welch', 'Sinyal pencere uzunluğundan kısa.'); const half = Math.floor(N / 2) + 1, U = w.reduce((s, v) => s + v * v, 0);
    const Pxx = new Float64Array(half), Pyy = new Float64Array(half), Pxyr = new Float64Array(half), Pxyi = new Float64Array(half);
    for (let s = 0; s < K; s++) { const xr = new Float64Array(N), yr = new Float64Array(N); for (let i = 0; i < L; i++) { xr[i] = x[s * step + i] * w[i]; yr[i] = y[s * step + i] * w[i]; } const [X, Xi] = fft(xr), [Y, Yi] = fft(yr);
      for (let k = 0; k < half; k++) { Pxx[k] += X[k] * X[k] + Xi[k] * Xi[k]; Pyy[k] += Y[k] * Y[k] + Yi[k] * Yi[k]; Pxyr[k] += X[k] * Y[k] + Xi[k] * Yi[k]; Pxyi[k] += X[k] * Yi[k] - Xi[k] * Y[k]; } }
    const sc = fs ? 1 / (fs * U * K) : 1 / (2 * Math.PI * U * K); for (let k = 0; k < half; k++) { const d = k > 0 && !(N % 2 === 0 && k === half - 1) ? 2 : 1; Pxx[k] *= sc * d; Pyy[k] *= sc * d; Pxyr[k] *= sc * d; Pxyi[k] *= sc * d; }
    const f = Float64Array.from({length: half}, (_, k) => fs ? k * fs / N : 2 * Math.PI * k / N); return {Pxx, Pyy, Pxyr, Pxyi, f};
  }
  B.cpsd = a => { const r = welchCore(mat(a[0]).re, mat(a[1]).re, a, 2), o = colv(Array.from(r.Pxyr)); o.im = Float64Array.from(r.Pxyi); return [o, colv(Array.from(r.f))]; };
  B.mscohere = a => { const r = welchCore(mat(a[0]).re, mat(a[1]).re, a, 2); return [colv(Array.from(r.f, (_, k) => (r.Pxyr[k] ** 2 + r.Pxyi[k] ** 2) / (r.Pxx[k] * r.Pyy[k] || 1e-300))), colv(Array.from(r.f))]; };
  B.tfestimate = a => { const r = welchCore(mat(a[0]).re, mat(a[1]).re, a, 2), re = new Float64Array(r.f.length), im = new Float64Array(r.f.length); for (let k = 0; k < re.length; k++) { re[k] = r.Pxyr[k] / (r.Pxx[k] || 1e-300); im[k] = r.Pxyi[k] / (r.Pxx[k] || 1e-300); } const o = colv(Array.from(re)); o.im = im; return [o, colv(Array.from(r.f))]; };
  B.periodogram = a => { const x = mat(a[0]).re, n = x.length, w = a[1] && a[1].re.length ? (a[1].re.length > 1 ? Array.from(a[1].re) : null) : null, wv = w || new Array(n).fill(1), N = a[2] && a[2].re.length ? a[2].re[0] : Math.max(256, Math.pow(2, Math.ceil(Math.log2(n)))), fs = a[3] && a[3].re.length ? a[3].re[0] : 0;
    const xr = new Float64Array(N); for (let i = 0; i < Math.min(n, N); i++) xr[i] = x[i] * wv[i]; const [X, Xi] = fft(xr), half = Math.floor(N / 2) + 1, U = wv.reduce((s, v) => s + v * v, 0), sc = fs ? 1 / (fs * U) : 1 / (2 * Math.PI * U);
    const P = Float64Array.from({length: half}, (_, k) => (X[k] ** 2 + Xi[k] ** 2) * sc * (k > 0 && !(N % 2 === 0 && k === half - 1) ? 2 : 1)); return [colv(Array.from(P)), colv(Array.from({length: half}, (_, k) => fs ? k * fs / N : 2 * Math.PI * k / N))]; };
  // pspectrum: güç spektrumu (yoğunluk değil) — Kaiser (β = 0) pencereli Welch; ENBW'ye göre ölçeklenir
  B.pspectrum = a => { const x = mat(a[0]).re, fs = a[1] && a[1].re.length ? a[1].re[0] : 2 * Math.PI, n = x.length, L = Math.min(n, Math.max(64, Math.pow(2, Math.round(Math.log2(n / 8))))), w = Array.from({length: L}, (_, i) => 0.5 * (1 - Math.cos(2 * Math.PI * i / (L - 1))));
    const r = welchCore(x, x, [null, null, rowv(w), num(Math.floor(L / 2)), num(Math.max(L, 1024)), num(fs)], 2), sw = w.reduce((s, v) => s + v, 0), U = w.reduce((s, v) => s + v * v, 0), enbw = fs * U / (sw * sw);
    return [colv(Array.from(r.Pxx, v => v * enbw)), colv(Array.from(r.f))]; };
  B.bandpower = a => { if (a.length === 1) { const x = mat(a[0]).re; let s = 0; for (const v of x) s += v * v; return num(s / x.length); }
    if (a.length >= 4 && isStrV(a[3])) { const P = mat(a[0]).re, f = mat(a[1]).re, rg = mat(a[2]).re; let s = 0; for (let k = 0; k + 1 < f.length; k++) { if (f[k] < rg[0] - 1e-12 || f[k + 1] > rg[1] + 1e-12) continue; s += (P[k] + P[k + 1]) / 2 * (f[k + 1] - f[k]); } return num(s); }
    const x = mat(a[0]).re, fs = sc1(a[1]), rg = mat(a[2]).re, [P, f] = B.periodogram([rowv(Array.from(x)), rowv(Array.from(B.hamming([num(x.length)]).re)), num(Math.max(256, Math.pow(2, Math.ceil(Math.log2(x.length))))), num(fs)]); return B.bandpower([P, f, rowv([rg[0], rg[1]]), str('psd')]); };
  // snr / thd / sinad: Kaiser (β = 38) pencereli periyodogram; temel bileşen en büyük tepe, 2.–6. harmonikler
  function harmAnalysis(x, fs, nh) { const n = x.length, beta = 38, w = Array.from({length: n}, (_, i) => bessI0(beta * Math.sqrt(1 - ((2 * i) / (n - 1) - 1) ** 2)) / bessI0(beta)); let m = 0; for (const v of x) m += v; m /= n;
    const N = Math.pow(2, Math.ceil(Math.log2(n))), xr = new Float64Array(N); for (let i = 0; i < n; i++) xr[i] = (x[i] - m) * w[i]; const [X, Xi] = fft(xr), half = N / 2 + 1, P = Float64Array.from({length: half}, (_, k) => X[k] ** 2 + Xi[k] ** 2), lobe = Math.ceil(6 * N / n);
    let k1 = lobe; for (let k = lobe; k < half; k++) if (P[k] > P[k1]) k1 = k; const used = new Uint8Array(half); for (let k = 0; k <= lobe && k < half; k++) used[k] = 1;
    const band = c => { let s = 0; for (let k = Math.max(0, c - lobe); k <= Math.min(half - 1, c + lobe); k++) { s += P[k]; used[k] = 1; } return s; };
    const Pf = band(k1); let Ph = 0; for (let h = 2; h <= nh; h++) { const c = Math.round(k1 * h); if (c < half) Ph += band(c); } let Pn = 0; for (let k = 0; k < half; k++) if (!used[k]) Pn += P[k];
    return {Pf, Ph, Pn: Pn * half / Math.max(1, half - used.reduce((s, v) => s + v, 0)) * (half - used.reduce((s, v) => s + v, 0)) / half, f1: k1 * (fs || 1) / N}; }
  B.snr = a => { if (a.length >= 2 && !isStrV(a[1]) && mat(a[1]).re.length === mat(a[0]).re.length) { const x = mat(a[0]).re, y = mat(a[1]).re; let s = 0, q = 0; for (let i = 0; i < x.length; i++) { s += x[i] * x[i]; q += y[i] * y[i]; } return num(10 * Math.log10(s / q)); } const r = harmAnalysis(mat(a[0]).re, optNum(a[1], 1), optNum(a[2], 6)); return num(10 * Math.log10(r.Pf / r.Pn)); };
  B.thd = a => { const r = harmAnalysis(mat(a[0]).re, optNum(a[1], 1), optNum(a[2], 6)); return num(10 * Math.log10(r.Ph / r.Pf)); };
  B.sinad = a => { const r = harmAnalysis(mat(a[0]).re, optNum(a[1], 1), 6); return num(10 * Math.log10(r.Pf / (r.Pn + r.Ph))); };
  B.goertzel = a => { const x = mat(a[0]).re, N = x.length, ind = a[1] ? Array.from(mat(a[1]).re) : Array.from({length: N}, (_, i) => i + 1), re = new Float64Array(ind.length), im = new Float64Array(ind.length);
    ind.forEach((k1, j) => { const w = 2 * Math.PI * (k1 - 1) / N, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < N; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; } re[j] = s1 * Math.cos(w) - s2; im[j] = -s1 * Math.sin(w); });
    const o = colv(Array.from(re)); o.im = im; return o; };
  // DCT-II / DCT-III (MATLAB: dikgen ölçek)
  B.dct = a => colMap(mat(a[0]), x => { const N = a[1] ? sc1(a[1]) : x.length, y = new Float64Array(N); for (let k = 0; k < N; k++) { let s = 0; for (let n = 0; n < Math.min(N, x.length); n++) s += x[n] * Math.cos(Math.PI * (2 * n + 1) * k / (2 * N)); y[k] = s * Math.sqrt((k ? 2 : 1) / N); } return y; });
  B.idct = a => colMap(mat(a[0]), X => { const N = a[1] ? sc1(a[1]) : X.length, y = new Float64Array(N); for (let n = 0; n < N; n++) { let s = 0; for (let k = 0; k < Math.min(N, X.length); k++) s += Math.sqrt((k ? 2 : 1) / N) * X[k] * Math.cos(Math.PI * (2 * n + 1) * k / (2 * N)); y[n] = s; } return y; });
  B.xcov = function (a, no) { const dm = m => { const v = mat(m), mu = meanOf(v.re); return like(v, Float64Array.from(v.re, x => x - mu)); }; const b = a.slice(); b[0] = dm(a[0]); if (b[1] && !isStrV(b[1]) && b[1].re.length > 1) b[1] = dm(b[1]); return B.xcorr.call(this, b, no); };

  /* ---------------- veri temizleme / istatistik ---------------- */
  function outMask(x, meth, w, th) {
    const n = x.length, o = new Uint8Array(n);
    if (meth === 'movmedian' || meth === 'movmean') { const h = Math.floor(w / 2); for (let i = 0; i < n; i++) { const seg = Array.from(x.subarray(Math.max(0, i - h), Math.min(n, i + h + 1))); if (meth === 'movmedian') { const md = median(seg), mad = median(seg.map(v => Math.abs(v - md))) * 1.4826; o[i] = Math.abs(x[i] - md) > th * mad ? 1 : 0; } else { const mu = meanOf(seg), sd = stdOf(seg); o[i] = Math.abs(x[i] - mu) > th * sd ? 1 : 0; } } return o; }
    if (meth === 'mean') { const mu = meanOf(x), sd = stdOf(x); for (let i = 0; i < n; i++) o[i] = Math.abs(x[i] - mu) > th * sd ? 1 : 0; return o; }
    if (meth === 'quartiles') { const q1 = prctile(x, 25), q3 = prctile(x, 75), iq = q3 - q1; for (let i = 0; i < n; i++) o[i] = x[i] < q1 - th * iq || x[i] > q3 + th * iq ? 1 : 0; return o; }
    const md = median(x), mad = median(Array.from(x, v => Math.abs(v - md))) * 1.4826; for (let i = 0; i < n; i++) o[i] = Math.abs(x[i] - md) > th * mad ? 1 : 0; return o;
  }
  function outArgs(a, from) { let meth = 'median', w = 5; let i = from; if (a[i] && isStrV(a[i]) && ['median', 'mean', 'quartiles', 'movmedian', 'movmean', 'grubbs', 'gesd'].includes(S(a[i]).toLowerCase())) { meth = S(a[i]).toLowerCase(); i++; if (meth.startsWith('mov')) { w = sc1(a[i]); i++; } } if (meth === 'grubbs' || meth === 'gesd') meth = 'mean'; const o = opts(a, i); const th = o.thresholdfactor ? sc1(o.thresholdfactor) : meth === 'quartiles' ? 1.5 : 3; return {meth, w, th}; }
  B.isoutlier = a => { const m = mat(a[0]), {meth, w, th} = outArgs(a, 1); const r = colMap(m, x => outMask(x, meth, w, th)); r.t = 'l'; return r; };
  B.rmoutliers = function (a, no) { const m = mat(a[0]), {meth, w, th} = outArgs(a, 1); if (isVec(m)) { const k = outMask(Float64Array.from(m.re), meth, w, th), keep = Array.from(m.re).filter((_, i) => !k[i]); const r = m.c === 1 ? colv(keep) : rowv(keep); if (no >= 2) { const t = like(m, Float64Array.from(k)); t.t = 'l'; return [r, t]; } return r; }
    const bad = new Uint8Array(m.r); for (let j = 0; j < m.c; j++) { const k = outMask(m.re.slice(j * m.r, (j + 1) * m.r), meth, w, th); k.forEach((v, i) => { if (v) bad[i] = 1; }); } const rows = []; for (let i = 0; i < m.r; i++) if (!bad[i]) rows.push(i); const o = zeros(rows.length, m.c); rows.forEach((i, r) => { for (let j = 0; j < m.c; j++) o.re[r + j * rows.length] = m.re[i + j * m.r]; }); return o; };
  function fillCore(x, bad, meth, val) {
    const n = x.length, y = Float64Array.from(x), good = []; for (let i = 0; i < n; i++) if (!bad[i]) good.push(i);
    if (!good.length) return y;
    for (let i = 0; i < n; i++) { if (!bad[i]) continue;
      if (meth === 'constant') { y[i] = val; continue; }
      let lo = -1, hi = -1; for (let k = i - 1; k >= 0; k--) if (!bad[k]) { lo = k; break; } for (let k = i + 1; k < n; k++) if (!bad[k]) { hi = k; break; }
      if (meth === 'previous') y[i] = lo >= 0 ? x[lo] : NaN; else if (meth === 'next') y[i] = hi >= 0 ? x[hi] : NaN;
      else if (meth === 'nearest') y[i] = lo < 0 ? x[hi] : hi < 0 ? x[lo] : (i - lo <= hi - i ? x[lo] : x[hi]);
      else if (meth === 'linear') { if (lo >= 0 && hi >= 0) y[i] = x[lo] + (x[hi] - x[lo]) * (i - lo) / (hi - lo); else { const [p, q] = lo < 0 ? [good[0], good[1]] : [good[good.length - 2], good[good.length - 1]]; y[i] = q == null ? x[p] : x[p] + (x[q] - x[p]) * (i - p) / (q - p); } }
      else if (meth === 'movmean' || meth === 'movmedian') { const h = Math.floor(val / 2), seg = []; for (let k = Math.max(0, i - h); k <= Math.min(n - 1, i + h); k++) if (!bad[k]) seg.push(x[k]); y[i] = seg.length ? (meth === 'movmean' ? meanOf(seg) : median(seg)) : NaN; }
      else if (meth === 'center' || meth === 'clip') y[i] = val;
    }
    return y;
  }
  B.fillmissing = function (a, no) { const m = mat(a[0]), meth = a[1] ? S(a[1]).toLowerCase() : 'linear'; let val = NaN; if (meth === 'constant' || meth.startsWith('mov')) val = sc1(a[2]); if (!['constant', 'previous', 'next', 'nearest', 'linear', 'spline', 'pchip', 'movmean', 'movmedian'].includes(meth)) E('MATLAB:fillmissing', 'fillmissing: yöntem constant, previous, next, nearest, linear, spline, pchip, movmean ya da movmedian olmalı.');
    const r = colMap(m, x => { const bad = Uint8Array.from(x, v => v !== v ? 1 : 0); if ((meth === 'spline' || meth === 'pchip')) { const gi = [], gv = [], bi = []; x.forEach((v, i) => { if (v === v) { gi.push(i + 1); gv.push(v); } else bi.push(i + 1); }); if (gi.length < 2 || !bi.length) return x; const yy = B.interp1([rowv(gi), rowv(gv), rowv(bi), str(meth)]); const o = Float64Array.from(x); bi.forEach((i, k) => { o[i - 1] = yy.re[k]; }); return o; } return fillCore(x, bad, meth, val); });
    if (no >= 2) { const t = like(m, Float64Array.from(m.re, v => v !== v ? 1 : 0)); t.t = 'l'; return [r, t]; } return r; };
  B.filloutliers = function (a, no) { const m = mat(a[0]); let meth = 'linear', val = NaN; if (a[1] && isStrV(a[1])) meth = S(a[1]).toLowerCase(); else if (a[1]) { meth = 'constant'; val = sc1(a[1]); } const oa = outArgs(a, 2); if (meth.startsWith('mov')) val = 5;
    const mask = []; const r = colMap(m, x => { const bad = outMask(x, oa.meth, oa.w, oa.th); mask.push(bad); if (meth === 'clip' || meth === 'center') { const md = median(x), mad = median(Array.from(x, v => Math.abs(v - md))) * 1.4826, lo = md - oa.th * mad, hi = md + oa.th * mad; return Float64Array.from(x, (v, i) => bad[i] ? (meth === 'center' ? md : Math.max(lo, Math.min(hi, v))) : v); } return fillCore(x, bad, meth, val); });
    if (no >= 2) { const t = like(m, Float64Array.from(mask.flatMap(v => Array.from(v)))); t.t = 'l'; return [r, t]; } return r; };
  B.normalize = a => { const m = mat(a[0]), meth = a[1] ? S(a[1]).toLowerCase() : 'zscore', p = a[2];
    return colMap(m, x => { if (meth === 'zscore') { const mu = meanOf(x), sd = stdOf(x); return Float64Array.from(x, v => (v - mu) / (sd || 1)); }
      if (meth === 'range') { const r = p ? mat(p).re : [0, 1]; let lo = Infinity, hi = -Infinity; for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; } return Float64Array.from(x, v => r[0] + (v - lo) / ((hi - lo) || 1) * (r[1] - r[0])); }
      if (meth === 'center') { const c = p ? (isStrV(p) ? (S(p) === 'median' ? median(x) : meanOf(x)) : sc1(p)) : meanOf(x); return Float64Array.from(x, v => v - c); }
      if (meth === 'scale') { const s = p ? (isStrV(p) ? (S(p) === 'mad' ? median(Array.from(x, v => Math.abs(v - median(x)))) : stdOf(x)) : sc1(p)) : stdOf(x); return Float64Array.from(x, v => v / (s || 1)); }
      if (meth === 'norm') { const q = p ? sc1(p) : 2; let s = 0; if (q === Infinity) for (const v of x) s = Math.max(s, Math.abs(v)); else { for (const v of x) s += Math.abs(v) ** q; s = s ** (1 / q); } return Float64Array.from(x, v => v / (s || 1)); }
      E('MATLAB:normalize', 'normalize: yöntem zscore, range, center, scale ya da norm olmalı.'); }); };
  B.rescale = a => { const m = mat(a[0]), l = optNum(a[1], 0), u = optNum(a[2], 1); let lo = Infinity, hi = -Infinity; for (const v of m.re) { if (v < lo) lo = v; if (v > hi) hi = v; } return like(m, Float64Array.from(m.re, v => hi > lo ? l + (v - lo) / (hi - lo) * (u - l) : (l + u) / 2 * 0 + l)); };
  B.zscore = function (a, no) { const m = mat(a[0]), w = optNum(a[1], 0); const mus = [], sds = []; const r = colMap(m, x => { const mu = meanOf(x), sd = stdOf(x, w === 1); mus.push(mu); sds.push(sd); return Float64Array.from(x, v => (v - mu) / (sd || 1)); }); return no >= 2 ? [r, rowv(mus), rowv(sds)] : r; };
  B.bounds = a => [colReduce(mat(a[0]), x => Math.min(...x)), colReduce(mat(a[0]), x => Math.max(...x))];
  B.peak2peak = a => colReduce(mat(a[0]), x => Math.max(...x) - Math.min(...x));
  B.peak2rms = a => colReduce(mat(a[0]), x => { let m = 0, s = 0; for (const v of x) { m = Math.max(m, Math.abs(v)); s += v * v; } return m / Math.sqrt(s / x.length); });
  function localExt(x, sgn, minP, minSep, flat) { const n = x.length, y = Float64Array.from(x, v => sgn * v), o = new Uint8Array(n);
    for (let i = 1; i < n - 1; i++) { if (!(y[i] > y[i - 1])) continue; let j = i; while (j + 1 < n && y[j + 1] === y[i]) j++; if (j + 1 < n && y[j + 1] < y[i]) { o[flat === 'all' ? i : flat === 'first' ? i : flat === 'last' ? j : Math.floor((i + j) / 2)] = 1; if (flat === 'all') for (let k = i; k <= j; k++) o[k] = 1; } i = j; }
    if (minP > 0) for (let i = 0; i < n; i++) if (o[i]) { let l = i, lm = y[i]; while (l > 0 && y[l - 1] <= y[i]) { l--; lm = Math.min(lm, y[l]); } let r = i, rm = y[i]; while (r < n - 1 && y[r + 1] <= y[i]) { r++; rm = Math.min(rm, y[r]); } if (y[i] - Math.max(lm, rm) < minP) o[i] = 0; }
    if (minSep > 0) { const idx = []; o.forEach((v, i) => { if (v) idx.push(i); }); idx.sort((p, q) => y[q] - y[p]); const keep = []; for (const i of idx) if (keep.every(k => Math.abs(k - i) >= minSep)) keep.push(i); o.fill(0); keep.forEach(i => { o[i] = 1; }); }
    return o; }
  for (const [nm, sg] of [['islocalmax', 1], ['islocalmin', -1]]) B[nm] = a => { const m = mat(a[0]), o = opts(a, 1); const r = colMap(m, x => localExt(x, sg, o.minprominence ? sc1(o.minprominence) : 0, o.minseparation ? sc1(o.minseparation) : 0, o.flatselection ? S(o.flatselection).toLowerCase() : 'center')); r.t = 'l'; return r; };
  // değişim noktaları: ikili bölme, bölüt maliyeti (ortalama / rms / std / doğrusal); varsayılan en çok 1 nokta (MATLAB gibi)
  B.findchangepts = a => { const x = Float64Array.from(mat(a[0]).re), o = opts(a, 1), K = o.maxnumchanges ? Math.round(sc1(o.maxnumchanges)) : 1, st = o.statistic ? S(o.statistic).toLowerCase() : 'mean', minD = o.mindistance ? Math.round(sc1(o.mindistance)) : 2;
    const cost = (a0, b0) => { const n = b0 - a0; if (n < 1) return 0; let s = 0, s2 = 0; for (let i = a0; i < b0; i++) { s += x[i]; s2 += x[i] * x[i]; } if (st === 'rms') return n * Math.log(Math.max(1e-300, s2 / n)); if (st === 'std') { const v = Math.max(1e-300, s2 / n - (s / n) ** 2); return n * Math.log(v); } if (st === 'linear') { let sx = 0, sxx = 0, sxy = 0; for (let i = a0; i < b0; i++) { const t = i - a0; sx += t; sxx += t * t; sxy += t * x[i]; } const d = n * sxx - sx * sx, b1 = d ? (n * sxy - sx * s) / d : 0, b0v = (s - b1 * sx) / n; let r = 0; for (let i = a0; i < b0; i++) r += (x[i] - b0v - b1 * (i - a0)) ** 2; return r; } return s2 - s * s / n; };
    let segs = [[0, x.length]]; const pts = [];
    for (let k = 0; k < K; k++) { let best = null; for (const [a0, b0] of segs) { const base = cost(a0, b0); for (let c = a0 + minD; c <= b0 - minD; c++) { const g = base - cost(a0, c) - cost(c, b0); if (!best || g > best.g) best = {g, c, a0, b0}; } } if (!best || best.g <= 1e-12) break; pts.push(best.c); segs = segs.filter(s => !(s[0] === best.a0 && s[1] === best.b0)).concat([[best.a0, best.c], [best.c, best.b0]]); }
    pts.sort((p, q) => p - q); return colv(pts.map(p => p + 1)); };
  B.discretize = a => { const x = mat(a[0]), e = mat(a[1]).re, vals = a[2] && !isStrV(a[2]) ? mat(a[2]).re : null; return like(x, Float64Array.from(x.re, v => { if (!(v >= e[0] && v <= e[e.length - 1])) return NaN; let k = 0; while (k < e.length - 2 && v >= e[k + 1]) k++; return vals ? vals[k] : k + 1; })); };
  B.gradient = function (a, no) { const F = mat(a[0]), hx = optNum(a[1], 1), hy = optNum(a[2], hx);
    const d1 = (v, h) => { const n = v.length, o = new Float64Array(n); if (n < 2) return o; o[0] = (v[1] - v[0]) / h; o[n - 1] = (v[n - 1] - v[n - 2]) / h; for (let i = 1; i < n - 1; i++) o[i] = (v[i + 1] - v[i - 1]) / (2 * h); return o; };
    if (isVec(F)) return like(F, d1(F.re, hx));
    const GX = zeros(F.r, F.c), GY = zeros(F.r, F.c); for (let i = 0; i < F.r; i++) { const row = Float64Array.from({length: F.c}, (_, j) => F.re[i + j * F.r]), g = d1(row, hx); for (let j = 0; j < F.c; j++) GX.re[i + j * F.r] = g[j]; } for (let j = 0; j < F.c; j++) GY.re.set(d1(F.re.slice(j * F.r, (j + 1) * F.r), hy), j * F.r);
    return no >= 2 ? [GX, GY] : GX; };
  // gruplar: sayı ya da metin (hücre) anahtarları; ID sıralı
  function groupKeys(g) { if (isCell(g)) return g.v.map(v => toStr(v)); return Array.from(mat(g).re, v => v); }
  B.findgroups = function (a, no) { const ks = groupKeys(a[0]), uniq = [...new Set(ks.filter(k => k === k))].sort((p, q) => typeof p === 'number' ? p - q : String(p).localeCompare(String(q), 'tr')), id = new Map(uniq.map((k, i) => [k, i + 1]));
    const G = colv(ks.map(k => id.has(k) ? id.get(k) : NaN)); const ID = typeof uniq[0] === 'string' || isCell(a[0]) ? {cell: true, r: uniq.length, c: 1, v: uniq.map(s => str(String(s)))} : colv(uniq); return no >= 2 ? [G, ID] : G; };
  B.splitapply = function (a, no) { const fn = a[0], G = mat(a[a.length - 1]).re, data = a.slice(1, -1).map(mat), ng = Math.max(...Array.from(G).filter(v => v === v)), out = [];
    for (let g = 1; g <= ng; g++) { const idx = []; G.forEach((v, i) => { if (v === g) idx.push(i); }); const args = data.map(d => { if (isVec(d)) return colv(idx.map(i => d.re[i])); const o = zeros(idx.length, d.c); idx.forEach((i, r) => { for (let j = 0; j < d.c; j++) o.re[r + j * idx.length] = d.re[i + j * d.r]; }); return o; }); let r = this.callFunctionValue(fn, args, 1); if (Array.isArray(r)) r = r[0]; if (!(r instanceof M) || r.re.length !== 1) E('MATLAB:splitapply', 'splitapply: işlev her grup için tek sayı döndürmeli.'); out.push(r.re[0]); }
    return colv(out); };
  B.groupsummary = function (a, no) { const X = mat(a[0]), ks = groupKeys(a[1]), meth = a[2] ? S(a[2]).toLowerCase() : 'mean'; const uniq = [...new Set(ks)].sort((p, q) => typeof p === 'number' ? p - q : String(p).localeCompare(String(q), 'tr'));
    const F = {mean: meanOf, sum: v => v.reduce((s, q) => s + q, 0), max: v => Math.max(...v), min: v => Math.min(...v), median, std: v => stdOf(v), var: v => stdOf(v) ** 2, numel: v => v.length, range: v => Math.max(...v) - Math.min(...v), mode: v => { const c = new Map(); let b = v[0], bc = 0; for (const q of v) { const n = (c.get(q) || 0) + 1; c.set(q, n); if (n > bc || (n === bc && q < b)) { b = q; bc = n; } } return b; }}[meth];
    if (!F) E('MATLAB:groupsummary', 'groupsummary: yöntem mean, sum, max, min, median, std, var, numel, range ya da mode olmalı.');
    const cols = isVec(X) ? 1 : X.c, rows = isVec(X) ? X.re.length : X.r, o = zeros(uniq.length, cols), cnt = [];
    uniq.forEach((u, gi) => { const idx = []; ks.forEach((k, i) => { if (k === u) idx.push(i); }); cnt.push(idx.length); for (let j = 0; j < cols; j++) o.re[gi + j * uniq.length] = F(idx.map(i => X.re[i + j * rows])); });
    const BG = typeof uniq[0] === 'string' ? {cell: true, r: uniq.length, c: 1, v: uniq.map(s => str(s))} : colv(uniq); return no >= 2 ? [o, BG, colv(cnt)] : o; };

  /* ---------------- grafik: stairs / area / errorbar ---------------- */
  const {axes} = H;
  B.stairs = function (a) { const hasX = a.length > 1 && !isStrV(a[1]); const y = mat(hasX ? a[1] : a[0]).re, x = hasX ? mat(a[0]).re : Float64Array.from({length: y.length}, (_, i) => i + 1); const X = [], Y = []; for (let i = 0; i < y.length; i++) { if (i) { X.push(x[i]); Y.push(y[i - 1]); } X.push(x[i]); Y.push(y[i]); }
    B.plot.call(this, [rowv(X), rowv(Y), ...a.slice(hasX ? 2 : 1)]); };
  B.area = function (a) { const hasX = a.length > 1 && !isStrV(a[1]); B.plot.call(this, hasX ? [a[0], a[1]] : [a[0]]); const ax = axes(this), t = ax.traces[ax.traces.length - 1]; if (t) { t.kind = 'area'; t.area = true; } };
  B.errorbar = function (a) { let x, y, lo, hi; const nn = a.filter(v => !isStrV(v)).length; if (nn >= 4) { x = mat(a[0]).re; y = mat(a[1]).re; lo = mat(a[2]).re; hi = mat(a[3]).re; } else if (nn === 3) { x = mat(a[0]).re; y = mat(a[1]).re; lo = hi = mat(a[2]).re; } else { y = mat(a[0]).re; x = Float64Array.from({length: y.length}, (_, i) => i + 1); lo = hi = mat(a[1]).re; }
    const ax = axes(this), hold = ax.hold; B.plot.call(this, [rowv(Array.from(x)), rowv(Array.from(y)), ...a.filter(isStrV).slice(0, 1)]); const main = ax.traces[ax.traces.length - 1]; ax.hold = true;
    const X = [], Y = [], w = (Math.max(...x) - Math.min(...x)) / Math.max(1, x.length) * 0.15; for (let i = 0; i < y.length; i++) { X.push(x[i], x[i], NaN, x[i] - w, x[i] + w, NaN, x[i] - w, x[i] + w, NaN); Y.push(y[i] - lo[i], y[i] + hi[i], NaN, y[i] - lo[i], y[i] - lo[i], NaN, y[i] + hi[i], y[i] + hi[i], NaN); }
    ax.traces.push({x: Float64Array.from(X), y: Float64Array.from(Y), name: '', color: main ? main.color : null, dash: null, marker: null, noLine: false, lw: 1, kind: 'line', errbar: true}); ax.hold = hold; };
})(MLAB);
