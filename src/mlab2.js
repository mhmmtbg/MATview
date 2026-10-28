/* ===== MATLAB alt kümesi yorumlayıcısı — 2/3: işleçler, indeksleme, yorumlayıcı, gösterim, printf ===== */
(function (ML) {
  'use strict';
  const {M, MLError, err, num, bool, zeros, rowv, colv, str, empty, isStr, toStr, cell, isCell, isSA, isFH, isTrue, clone, sizeOf, numelOf, classOf, castM, isInt, INT, round0} = ML;
  const E = (id, msg) => { throw new MLError(msg, 0, id); };

  /* ---------- eleman-eleman işlemler (yayınlama dahil) ---------- */
  function outClass(a, b, cmp) {
    if (cmp) return 'l';
    const ta = a.t, tb = b.t;
    if (isInt(ta)) { if (isInt(tb) && ta !== tb) E('MATLAB:mixedClasses', `Farklı tamsayı sınıfları birlikte kullanılamaz (${ML.CLSNAME[ta]}, ${ML.CLSNAME[tb]})`); return ta; }
    if (isInt(tb)) return tb;
    if (ta === 's' || tb === 's') return 's';
    return 'd';
  }
  function bdims(A, B) {
    const r = A.r === B.r ? A.r : A.r === 1 ? B.r : B.r === 1 ? A.r : -1, c = A.c === B.c ? A.c : A.c === 1 ? B.c : B.c === 1 ? A.c : -1;
    if (r < 0 || c < 0) E('MATLAB:dimagree', 'Matris boyutları uyuşmuyor (' + A.r + '×' + A.c + ' ile ' + B.r + '×' + B.c + ').');
    return [r, c];
  }
  function ewReal(A, B, f, cls) {
    const ar = A.re, br = B.re, na = ar.length, nb = br.length;
    if (na === 1 && nb === 1) return new M(1, 1, Float64Array.of(f(ar[0], br[0])), null, cls);
    if (nb === 1) { const o = new Float64Array(na), y = br[0]; for (let i = 0; i < na; i++) o[i] = f(ar[i], y); return new M(A.r, A.c, o, null, cls); }
    if (na === 1) { const o = new Float64Array(nb), x = ar[0]; for (let i = 0; i < nb; i++) o[i] = f(x, br[i]); return new M(B.r, B.c, o, null, cls); }
    if (A.r === B.r && A.c === B.c) { const o = new Float64Array(na); for (let i = 0; i < na; i++) o[i] = f(ar[i], br[i]); return new M(A.r, A.c, o, null, cls); }
    const [R, C] = bdims(A, B), o = new Float64Array(R * C), ra = A.r === 1 ? 0 : 1, ca = A.c === 1 ? 0 : A.r, rb = B.r === 1 ? 0 : 1, cb = B.c === 1 ? 0 : B.r;
    for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) o[i + j * R] = f(ar[i * ra + j * ca], br[i * rb + j * cb]);
    return new M(R, C, o, null, cls);
  }
  const fin = (m, cls) => { if (isInt(cls)) { const r = INT[cls], re = m.re; for (let i = 0; i < re.length; i++) { let x = re[i]; x = Number.isNaN(x) ? 0 : round0(x); re[i] = x < r[0] ? r[0] : x > r[1] ? r[1] : x; } } else if (cls === 's') { for (let i = 0; i < m.re.length; i++) m.re[i] = Math.fround(m.re[i]); } return m; };
  // karmaşık eleman-eleman: f(ar, ai, br, bi) → [re, im]
  function ewCplx(A, B, f, cls) {
    const [R, C] = bdims(A, B), re = new Float64Array(R * C), im = new Float64Array(R * C), ra = A.r === 1 ? 0 : 1, ca = A.c === 1 ? 0 : A.r, rb = B.r === 1 ? 0 : 1, cb = B.c === 1 ? 0 : B.r;
    for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { const ia = i * ra + j * ca, ib = i * rb + j * cb; const q = f(A.re[ia], A.im ? A.im[ia] : 0, B.re[ib], B.im ? B.im[ib] : 0); re[i + j * R] = q[0]; im[i + j * R] = q[1]; }
    return dropIm(new M(R, C, re, im, cls));
  }
  const dropIm = m => { if (m.im) { let z = true; for (let i = 0; i < m.im.length; i++) if (m.im[i] !== 0) { z = false; break; } if (z) m.im = null; } return m; };
  const cdiv = (a, b, c, d) => { if (d === 0) return [a / c, b / c]; const s = c * c + d * d; return [(a * c + b * d) / s, (b * c - a * d) / s]; };
  function cpow(a, b, c, d) {
    if (a === 0 && b === 0) return (c === 0 && d === 0) ? [1, 0] : [0, 0];
    const lr = Math.log(Math.hypot(a, b)), th = Math.atan2(b, a), x = c * lr - d * th, y = d * lr + c * th, m = Math.exp(x);
    return [m * Math.cos(y), m * Math.sin(y)];
  }
  const OPS = {
    '+': [(x, y) => x + y, (a, b, c, d) => [a + c, b + d]], '-': [(x, y) => x - y, (a, b, c, d) => [a - c, b - d]],
    '.*': [(x, y) => x * y, (a, b, c, d) => [a * c - b * d, a * d + b * c]], './': [(x, y) => x / y, cdiv], '.\\': [(x, y) => y / x, (a, b, c, d) => cdiv(c, d, a, b)],
    '.^': [(x, y) => Math.pow(x, y), cpow],
  };
  const CMP = {'==': (x, y) => x === y ? 1 : 0, '~=': (x, y) => x !== y ? 1 : 0, '<': (x, y) => x < y ? 1 : 0, '<=': (x, y) => x <= y ? 1 : 0, '>': (x, y) => x > y ? 1 : 0, '>=': (x, y) => x >= y ? 1 : 0, '&': (x, y) => (x !== 0 && y !== 0) ? 1 : 0, '|': (x, y) => (x !== 0 || y !== 0) ? 1 : 0};
  function elementwise(op, A, B) {
    if (op in CMP) {
      if ((A.im || B.im) && (op === '==' || op === '~=')) { const r = ewCplx(A, B, (a, b, c, d) => [(a === c && b === d) === (op === '==') ? 1 : 0, 0], 'l'); r.t = 'l'; return r; }
      const r = ewReal(A, B, CMP[op], 'l'); return r;
    }
    const cls = outClass(A, B);
    const [fr, fc] = OPS[op];
    if (A.im || B.im) { return castKeep(ewCplx(A, B, fc, cls), cls); }
    if (op === '.^') {   // negatif taban + kesirli üs → karmaşık
      let needC = false; const ar = A.re, br = B.re;
      let anyNeg = false; for (let i = 0; i < ar.length; i++) if (ar[i] < 0) { anyNeg = true; break; }
      if (anyNeg) { for (let i = 0; i < br.length; i++) if (br[i] !== Math.floor(br[i])) { needC = true; break; } }
      if (needC) return castKeep(ewCplx(A, B, cpow, cls), cls);
    }
    return fin(ewReal(A, B, fr, cls), cls);
  }
  const castKeep = (m, cls) => { m.t = cls; return m; };
  const tr = A => { const o = new Float64Array(A.re.length), R = A.r, C = A.c; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) o[j + i * C] = A.re[i + j * R]; return new M(C, R, o, null, A.t); };
  function ctranspose(A, conj) {
    const T = tr(A); if (A.im) { const o = new Float64Array(A.im.length), R = A.r, C = A.c; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) o[j + i * C] = (conj ? -1 : 1) * A.im[i + j * R]; T.im = o; } return T;
  }
  function matmul(A, B) {
    if (A.c !== B.r) E('MATLAB:innerdim', `Matris boyutları uyuşmuyor: ${A.r}×${A.c} ile ${B.r}×${B.c} çarpılamaz (iç boyutlar eşit olmalı). Eleman-eleman çarpım için .* kullanın.`);
    const R = A.r, C = B.c, K = A.c, o = new Float64Array(R * C);
    if (A.im || B.im) {
      const oi = new Float64Array(R * C), ai = A.im, bi = B.im;
      for (let j = 0; j < C; j++) for (let k = 0; k < K; k++) { const br = B.re[k + j * K], bm = bi ? bi[k + j * K] : 0; for (let i = 0; i < R; i++) { const ar = A.re[i + k * R], am = ai ? ai[i + k * R] : 0; o[i + j * R] += ar * br - am * bm; oi[i + j * R] += ar * bm + am * br; } }
      return dropIm(new M(R, C, o, oi, 'd'));
    }
    const a = A.re, b = B.re;
    for (let j = 0; j < C; j++) { const oj = j * R; for (let k = 0; k < K; k++) { const bv = b[k + j * K]; if (bv === 0) continue; const ak = k * R; for (let i = 0; i < R; i++) o[oj + i] += a[ak + i] * bv; } }
    return new M(R, C, o, null, outClass(A, B));
  }
  // A\B: kare ise LU (kısmi pivot), değilse en küçük kareler (Householder QR)
  function solve(A, B) {
    if (A.r !== B.r) E('MATLAB:dimagree', 'A\\B için satır sayıları eşit olmalı.');
    if (A.im || B.im) E('MATLAB:unsupported', 'Karmaşık doğrusal sistem çözümü desteklenmiyor.');
    const m = A.r, n = A.c, k = B.c;
    if (m === n) {
      const a = A.re.slice(), b = B.re.slice(); const piv = new Int32Array(n); let sing = false;
      for (let c = 0; c < n; c++) {
        let p = c, mx = Math.abs(a[c + c * n]); for (let r = c + 1; r < n; r++) { const v = Math.abs(a[r + c * n]); if (v > mx) { mx = v; p = r; } }
        if (mx < 1e-300) { sing = true; continue; }
        if (p !== c) { for (let j = 0; j < n; j++) { const t = a[c + j * n]; a[c + j * n] = a[p + j * n]; a[p + j * n] = t; } for (let j = 0; j < k; j++) { const t = b[c + j * n]; b[c + j * n] = b[p + j * n]; b[p + j * n] = t; } }
        for (let r = c + 1; r < n; r++) { const f = a[r + c * n] / a[c + c * n]; if (f === 0) continue; for (let j = c; j < n; j++) a[r + j * n] -= f * a[c + j * n]; for (let j = 0; j < k; j++) b[r + j * n] -= f * b[c + j * n]; }
      }
      if (sing) { ML.warn && ML.warn('Matris tekil veya tekile çok yakın; sonuç güvenilir olmayabilir.'); }
      const x = new Float64Array(n * k);
      for (let j = 0; j < k; j++) for (let r = n - 1; r >= 0; r--) { let s = b[r + j * n]; for (let c = r + 1; c < n; c++) s -= a[r + c * n] * x[c + j * n]; x[r + j * n] = s / a[r + r * n]; }
      return new M(n, k, x, null, 'd');
    }
    // QR (m>=n) ya da asgari norm (m<n: normal denklemler üzerinden A'*(A*A')^-1)
    if (m > n) return lsq(A, B);
    const At = tr(A), AAt = matmul(A, At), y = solve(AAt, B); return matmul(At, y);
  }
  function lsq(A, B) {
    const m = A.r, n = A.c, k = B.c, a = A.re.slice(), b = B.re.slice();
    for (let c = 0; c < n; c++) {
      let nr = 0; for (let i = c; i < m; i++) nr += a[i + c * m] ** 2; nr = Math.sqrt(nr); if (nr === 0) continue;
      const al = a[c + c * m] > 0 ? -nr : nr, v = new Float64Array(m - c); for (let i = c; i < m; i++) v[i - c] = a[i + c * m]; v[0] -= al;
      let vn = 0; for (let i = 0; i < v.length; i++) vn += v[i] * v[i]; if (vn === 0) continue;
      for (let j = c; j < n; j++) { let d = 0; for (let i = c; i < m; i++) d += v[i - c] * a[i + j * m]; d = 2 * d / vn; for (let i = c; i < m; i++) a[i + j * m] -= d * v[i - c]; }
      for (let j = 0; j < k; j++) { let d = 0; for (let i = c; i < m; i++) d += v[i - c] * b[i + j * m]; d = 2 * d / vn; for (let i = c; i < m; i++) b[i + j * m] -= d * v[i - c]; }
    }
    const x = new Float64Array(n * k);
    for (let j = 0; j < k; j++) for (let r = n - 1; r >= 0; r--) { let s = b[r + j * m]; for (let c = r + 1; c < n; c++) s -= a[r + c * m] * x[c + j * n]; x[r + j * n] = Math.abs(a[r + r * m]) < 1e-300 ? 0 : s / a[r + r * m]; }
    return new M(n, k, x, null, 'd');
  }
  function matpow(A, p) {
    if (A.r !== A.c) E('MATLAB:square', 'Matris üssü için matris kare olmalı.');
    if (p.re[0] !== Math.floor(p.re[0])) E('MATLAB:unsupported', 'Matris için yalnız tamsayı üs desteklenir.');
    let k = Math.abs(p.re[0]), base = A, res = null; if (p.re[0] < 0) base = solve(A, eye(A.r));
    while (k > 0) { if (k & 1) res = res ? matmul(res, base) : base; base = k > 1 ? matmul(base, base) : base; k = Math.floor(k / 2); }
    return res || eye(A.r);
  }
  const eye = n => { const o = zeros(n, n); for (let i = 0; i < n; i++) o.re[i + i * n] = 1; return o; };
  function binop(op, a, b, line) {
    if (!(a instanceof M) || !(b instanceof M)) {
      if (isCell(a) || isCell(b)) E('MATLAB:undefinedFunction', `'${op}' işleci hücre dizileri için tanımlı değil.`);
      E('MATLAB:undefinedFunction', `'${op}' işleci bu veri türleri için tanımlı değil (${classOf(a)}, ${classOf(b)}).`);
    }
    switch (op) {
      case '+': case '-': case '.*': case './': case '.\\': case '.^': case '==': case '~=': case '<': case '<=': case '>': case '>=': case '&': case '|': return elementwise(op, a, b);
      case '*': if (a.re.length === 1 || b.re.length === 1) return elementwise('.*', a, b); return matmul(a, b);
      case '/': if (b.re.length === 1) return elementwise('./', a, b); return tr(solve(tr(b), tr(a)));
      case '\\': if (a.re.length === 1) return elementwise('.\\', a, b); return solve(a, b);
      case '^': if (a.re.length === 1 && b.re.length === 1) return elementwise('.^', a, b); if (b.re.length === 1) return matpow(a, b); E('MATLAB:unsupported', 'Skaler^matris desteklenmiyor.'); break;
    }
    err('Bilinmeyen işleç: ' + op, line);
  }
  const uminus = a => { const o = new M(a.r, a.c, new Float64Array(a.re.length), a.im ? new Float64Array(a.im.length) : null, a.t === 'l' || a.t === 'c' ? 'd' : a.t); for (let i = 0; i < o.re.length; i++) o.re[i] = -a.re[i] || 0; if (a.im) for (let i = 0; i < a.im.length; i++) o.im[i] = -a.im[i]; return fin(o, o.t); };
  const unot = a => { const o = new M(a.r, a.c, new Float64Array(a.re.length), null, 'l'); for (let i = 0; i < o.re.length; i++) o.re[i] = a.re[i] === 0 ? 1 : 0; return o; };

  /* ---------- aralık ---------- */
  function range(a, s, b) {
    if (!(isFinite(a) && isFinite(b)) || (s === 0) || Number.isNaN(s)) return new M(1, 0, new Float64Array(0));
    const n = Math.floor((b - a) / s * (1 + 2.2e-16) + 1e-10) + 1; if (n <= 0) return new M(1, 0, new Float64Array(0));
    const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = a + i * s;
    if (n > 1 && s > 0 && o[n - 1] > b) o[n - 1] = b;   // yuvarlama taşması
    return new M(1, n, o, null, 'd');
  }

  /* ---------- indeksleme ---------- */
  const COLON = {colon: true};
  function idxList(a, dimLen, what, line) {   // → Int32Array/Array 0-tabanlı indisler
    if (a === COLON) { const o = new Int32Array(dimLen); for (let i = 0; i < dimLen; i++) o[i] = i; return o; }
    if (!(a instanceof M)) E('MATLAB:badsubscript', 'Dizin sayısal veya mantıksal olmalı.');
    if (a.t === 'l') { if (a.re.length > dimLen) { for (let i = dimLen; i < a.re.length; i++) if (a.re[i]) E('MATLAB:badsubscript', `Mantıksal dizin, dizi boyutunu aşıyor (${dimLen}).`); } let k = 0; for (let i = 0; i < a.re.length; i++) if (a.re[i]) k++; const o = new Int32Array(k); k = 0; for (let i = 0; i < a.re.length; i++) if (a.re[i]) o[k++] = i; return o; }
    const re = a.re, o = new Int32Array(re.length);
    for (let i = 0; i < re.length; i++) { const v = re[i]; if (v !== Math.floor(v) || v < 1) E('MATLAB:badsubscript', v === 0 ? 'Dizin pozitif tamsayı olmalı: 0 geçersiz (MATLAB dizinleri 1\'den başlar).' : (v !== Math.floor(v) ? `Dizin tamsayı olmalı (${v}).` : `Dizin pozitif tamsayı olmalı (${v}).`)); o[i] = v - 1; }
    return o;
  }
  function readM(A, args, line) {
    const n = args.length;
    if (n === 1) {
      const N = A.r * A.c, a = args[0];
      if (a !== COLON && a.re.length === 1 && a.t !== 'l') { const v = a.re[0]; if (v !== Math.floor(v) || v < 1) idxList(a, N); if (v > N) E('MATLAB:badsubscript', `Dizin, dizi eleman sayısını aşıyor (${N}).`); return new M(1, 1, Float64Array.of(A.re[v - 1]), A.im ? Float64Array.of(A.im[v - 1]) : null, A.t); }
      const ix = idxList(a, N, '', line), k = ix.length, re = new Float64Array(k), im = A.im ? new Float64Array(k) : null;
      for (let i = 0; i < k; i++) { const q = ix[i]; if (q >= N) E('MATLAB:badsubscript', `Dizin, dizi eleman sayısını aşıyor (${N}).`); re[i] = A.re[q]; if (im) im[i] = A.im[q]; }
      let R, C;
      if (a === COLON) { R = k; C = 1; }
      else if (a.t === 'l') { if (A.r === 1 && A.c !== 1 || (A.r === 1 && a.r === 1)) { R = 1; C = k; } else if (a.r === 1 && A.r === 1) { R = 1; C = k; } else if (a.r === A.r && a.c === A.c && A.r !== 1 && A.c !== 1) { R = k; C = 1; } else { R = A.r === 1 ? 1 : k; C = A.r === 1 ? k : 1; if (A.c === 1) { R = k; C = 1; } } }
      else if (a.r > 1 && a.c > 1) { R = a.r; C = a.c; }
      else if (A.r === 1 && A.c !== 1) { R = 1; C = k; } else if (A.c === 1 && A.r !== 1) { R = k; C = 1; } else { R = a.r === 1 ? 1 : k; C = a.r === 1 ? k : 1; if (a.r !== 1 && a.c === 1) { R = k; C = 1; } }
      return new M(R, C, re, im ? (im.some(x => x !== 0) ? im : null) : null, A.t);
    }
    if (n === 2) {
      const ri = idxList(args[0], A.r, 'satır', line), ci = idxList(args[1], A.c, 'sütun', line), R = ri.length, C = ci.length, re = new Float64Array(R * C), im = A.im ? new Float64Array(R * C) : null;
      for (let i = 0; i < R; i++) if (ri[i] >= A.r) E('MATLAB:badsubscript', `Satır dizini sınırı aşıyor (${A.r} satır).`);
      for (let j = 0; j < C; j++) { const cj = ci[j]; if (cj >= A.c) E('MATLAB:badsubscript', `Sütun dizini sınırı aşıyor (${A.c} sütun).`); for (let i = 0; i < R; i++) { re[i + j * R] = A.re[ri[i] + cj * A.r]; if (im) im[i + j * R] = A.im[ri[i] + cj * A.r]; } }
      return new M(R, C, re, im, A.t);
    }
    // 3+ boyut: yalnız 1'e eşit ek indisler
    for (let k = 2; k < n; k++) { const a = args[k]; if (a !== COLON && !(a.re.length === 1 && a.re[0] === 1)) E('MATLAB:badsubscript', 'İkiden fazla boyut desteklenmiyor.'); }
    return readM(A, args.slice(0, 2), line);
  }
  function growTo(A, R, C) {
    if (R === A.r && C === A.c) return;
    const re = new Float64Array(R * C), im = A.im ? new Float64Array(R * C) : null;
    for (let j = 0; j < A.c; j++) for (let i = 0; i < A.r; i++) { re[i + j * R] = A.re[i + j * A.r]; if (im) im[i + j * R] = A.im[i + j * A.r]; }
    A.re = re; A.im = im; A.r = R; A.c = C;
  }
  function unifyT(A, B) { // atamada tür: hedef sınıf korunur (int/single/logical → hedef), char+double → double
    if (A.re.length === 0 && A.t === 'd') return B.t;
    if (A.t === B.t) return A.t;
    if (isInt(A.t)) return A.t; if (isInt(B.t)) return B.t; if (A.t === 's' || B.t === 's') return 's';
    if (A.t === 'c' && B.t === 'c') return 'c'; return 'd';
  }
  function assignM(A, args, B, line) {   // A yerinde değiştirilir
    const n = args.length;
    if (!(B instanceof M)) E('MATLAB:convert', 'Sayısal diziye sayısal olmayan değer atanamaz (' + classOf(B) + ').');
    const t = unifyT(A, B); if (t !== A.t) { if (isInt(t) || t === 's') { const c = castM(A, t); A.re = c.re; A.im = c.im; } A.t = t; }
    let bre = B.re, bim = B.im; if (isInt(t) && B.t !== t) { const c = castM(B, t); bre = c.re; bim = c.im; }
    if (bim && !A.im) A.im = new Float64Array(A.re.length);
    if (n === 1) {
      const a = args[0], N = A.r * A.c;
      const ix = idxList(a, N, '', line), k = ix.length;
      if (bre.length !== 1 && bre.length !== k) E('MATLAB:nonConformingAssign', `A(I) = X: X, I ile aynı sayıda eleman içermeli (${bre.length} ≠ ${k}).`);
      let mx = -1; for (let i = 0; i < k; i++) if (ix[i] > mx) mx = ix[i];
      if (mx >= N) {
        if (A.r === 0 && A.c === 0 || N === 0) { growVec(A, 1, mx + 1); }
        else if (A.r === 1) growVec(A, 1, mx + 1); else if (A.c === 1) growVec(A, mx + 1, 1); else E('MATLAB:badsubscript', 'A(I) = X: matrisi doğrusal indisle büyütmek mümkün değil. A(i,j) = x kullanın.');
      }
      for (let i = 0; i < k; i++) { const q = ix[i], s = bre.length === 1 ? 0 : i; A.re[q] = bre[s]; if (A.im) A.im[q] = bim ? bim[s] : 0; }
      return A;
    }
    for (let q = 2; q < n; q++) { const a = args[q]; if (a !== COLON && !(a.re.length === 1 && a.re[0] === 1)) E('MATLAB:badsubscript', 'İkiden fazla boyut desteklenmiyor.'); }
    const ri = idxList(args[0], A.r, '', line), ci = idxList(args[1], A.c, '', line);
    const colonR = args[0] === COLON, colonC = args[1] === COLON;
    let R = ri.length, C = ci.length;
    if (colonR && A.r === 0 && !colonC) { R = bre.length === 1 ? 1 : B.r; }
    let ri2 = ri, ci2 = ci;
    if (colonR && A.r === 0) { ri2 = new Int32Array(B.r === 1 && B.c === C ? 1 : Math.max(B.r, 1)); for (let i = 0; i < ri2.length; i++) ri2[i] = i; R = ri2.length; }
    if (colonC && A.c === 0) { ci2 = new Int32Array(B.c === 1 && B.r === R ? 1 : Math.max(B.c, 1)); for (let i = 0; i < ci2.length; i++) ci2[i] = i; C = ci2.length; }
    if (bre.length !== 1 && !(B.r === R && B.c === C) && !(bre.length === R * C && (B.r === 1 || B.c === 1) && (R === 1 || C === 1))) E('MATLAB:nonConformingAssign', `A(I,J) = X: boyutlar uyuşmuyor (${R}×${C} ≠ ${B.r}×${B.c}).`);
    let mr = A.r, mc = A.c; for (let i = 0; i < R; i++) if (ri2[i] + 1 > mr) mr = ri2[i] + 1; for (let j = 0; j < C; j++) if (ci2[j] + 1 > mc) mc = ci2[j] + 1;
    growTo(A, mr, mc); if (bim && !A.im) A.im = new Float64Array(A.re.length);
    for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) { const s = bre.length === 1 ? 0 : i + j * R, d = ri2[i] + ci2[j] * A.r; A.re[d] = bre[s]; if (A.im) A.im[d] = bim ? bim[s] : 0; }
    return A;
  }
  function growVec(A, R, C) {   // vektör büyütme: ek kapasiteyle amortize
    const need = R * C, old = A.re.length; if (need <= old) { A.r = R; A.c = C; return; }
    const buf = A.re.buffer; let re;
    if (A._cap && A._cap >= need && A.re.buffer === A._buf) { re = new Float64Array(A._buf, 0, need); for (let i = old; i < need; i++) re[i] = 0; }
    else { const cap = Math.max(need, Math.floor(need * 1.5) + 8); const nb = new ArrayBuffer(cap * 8); re = new Float64Array(nb, 0, need); re.set(A.re); A._buf = nb; A._cap = cap; if (A.im) { const ni = new Float64Array(cap); ni.set(A.im); A.im = ni.subarray(0, need); } }
    A.re = re; if (A.im && A.im.length !== need) { const ni = new Float64Array(need); ni.set(A.im.subarray(0, Math.min(old, need))); A.im = ni; }
    A.r = R; A.c = C;
  }
  function deleteM(A, args, line) {
    if (args.length === 1) {
      const N = A.r * A.c, ix = idxList(args[0], N), del = new Uint8Array(N); for (const q of ix) { if (q >= N) E('MATLAB:badsubscript', 'Silme dizini sınırı aşıyor.'); del[q] = 1; }
      let k = 0; for (let i = 0; i < N; i++) if (!del[i]) k++; const re = new Float64Array(k), im = A.im ? new Float64Array(k) : null; k = 0;
      for (let i = 0; i < N; i++) if (!del[i]) { re[k] = A.re[i]; if (im) im[k] = A.im[i]; k++; }
      const col = A.c === 1 && A.r !== 1; A.re = re; A.im = im; if (col) { A.r = k; A.c = 1; } else { A.r = k === 0 && args[0] === COLON ? 0 : 1; A.c = k; } return A;
    }
    const [a0, a1] = args;
    if (a0 === COLON || (a0 instanceof M && idxList(a0, A.r).length === A.r && new Set(idxList(a0, A.r)).size === A.r)) {
      const ci = idxList(a1, A.c), del = new Uint8Array(A.c); for (const q of ci) { if (q >= A.c) E('MATLAB:badsubscript', 'Silme dizini sınırı aşıyor.'); del[q] = 1; }
      const keep = []; for (let j = 0; j < A.c; j++) if (!del[j]) keep.push(j); const re = new Float64Array(A.r * keep.length), im = A.im ? new Float64Array(re.length) : null;
      keep.forEach((j, k) => { for (let i = 0; i < A.r; i++) { re[i + k * A.r] = A.re[i + j * A.r]; if (im) im[i + k * A.r] = A.im[i + j * A.r]; } }); A.re = re; A.im = im; A.c = keep.length; return A;
    }
    if (a1 === COLON || (a1 instanceof M && idxList(a1, A.c).length === A.c)) {
      const ri = idxList(a0, A.r), del = new Uint8Array(A.r); for (const q of ri) { if (q >= A.r) E('MATLAB:badsubscript', 'Silme dizini sınırı aşıyor.'); del[q] = 1; }
      const keep = []; for (let i = 0; i < A.r; i++) if (!del[i]) keep.push(i); const R = keep.length, re = new Float64Array(R * A.c), im = A.im ? new Float64Array(re.length) : null;
      for (let j = 0; j < A.c; j++) keep.forEach((i, k) => { re[k + j * R] = A.re[i + j * A.r]; if (im) im[k + j * R] = A.im[i + j * A.r]; }); A.re = re; A.im = im; A.r = R; return A;
    }
    E('MATLAB:badsubscript', 'Silme için indislerden biri tüm satır/sütunu seçmeli.');
  }

  /* ---------- yorumlayıcı ---------- */
  let SEQ = 1;
  class Scope { constructor(fn) { this.vars = new Map(); this.id = SEQ++; this.tok = new Map(); this.fn = fn || null; this.nargin = 0; this.nargout = 0; this.globals = null; } }
  const BREAK = 1, CONTINUE = 2, RETURN = 3;
  class Interp {
    constructor(opts) {
      opts = opts || {}; this.out = opts.out || (() => {}); this.funcs = new Map(); this.globalVars = new Map(); this.persist = new Map();
      this.base = new Scope(); this.depth = 0; this.endStack = []; this.deadline = opts.deadline || 0; this.steps = 0; this.maxDepth = 256; this.ctx = opts.ctx || {};
      this.ticT = Date.now(); this.stop = false; this.fig = null; this.lastErrorLine = 0; this.builtins = ML.builtins || {};
    }
    tokenOf(sc, name) { let t = sc.tok.get(name); if (!t) { t = sc.id * 100000 + sc.tok.size + 1; sc.tok.set(name, t); } return t; }
    getVar(sc, name) { if (sc.globals && sc.globals.has(name)) return this.globalVars.get(name); return sc.vars.get(name); }
    hasVar(sc, name) { return sc.globals && sc.globals.has(name) ? this.globalVars.has(name) : sc.vars.has(name); }
    setVar(sc, name, v) {
      if (v && v._o === undefined) v._o = this.tokenOf(sc, name); else if (v && v._o !== this.tokenOf(sc, name)) v._o = null;
      if (sc.globals && sc.globals.has(name)) this.globalVars.set(name, v); else sc.vars.set(name, v);
    }
    // yerinde değiştirme için sahiplik: başkasıyla paylaşılıyorsa kopyala
    own(sc, name, v) { const tk = this.tokenOf(sc, name); if (v && v._o !== tk) { v = clone(v); v._o = tk; if (sc.globals && sc.globals.has(name)) this.globalVars.set(name, v); else sc.vars.set(name, v); } return v; }
    load(src) {
      const ast = ML.parse(src); for (const f of ast.funcs) this.funcs.set(f.name, f); return ast;
    }
    run(src) {
      const ast = this.load(src);
      const st = this.execBlock(ast.body, this.base);
      return st;
    }
    tick(line) { if ((++this.steps & 0x3fff) === 0) { if (this.stop) E('MATLAB:interrupted', 'Çalışma durduruldu.'); if (this.deadline && Date.now() > this.deadline) E('MATLAB:timeout', 'Zaman aşımı: betik çok uzun sürdü (sonsuz döngü olabilir).'); } }
    execBlock(body, sc) {
      for (let i = 0; i < body.length; i++) { const s = this.exec(body[i], sc); if (s) return s; }
      return 0;
    }
    exec(s, sc) {
      this.cur = s.line; this.tick(s.line);
      switch (s.t) {
        case 'expr': {
          const e = s.e;
          // ifade: değer yazdır / ans
          const isCall = e.t === 'call' || e.t === 'id';
          const vals = this.evalMulti(e, sc, 0, true);
          if (vals.length) {
            const v = vals[0];
            const isVarRef = e.t === 'id' && this.hasVar(sc, e.n);
            if (!isVarRef && v !== undefined) this.setVar(sc, 'ans', v);
            if (s.print && v !== undefined) this.display(isVarRef ? e.n : 'ans', v);
          }
          return 0;
        }
        case 'assign': return this.execAssign(s, sc);
        case 'if': { for (const [c, b] of s.conds) { if (isTrue(this.condVal(c, sc))) return this.execBlock(b, sc); } if (s.els) return this.execBlock(s.els, sc); return 0; }
        case 'for': {
          const rng = this.eval(s.e, sc), name = s.v;
          const setLoop = v => this.assignTo(name, v, sc);
          if (rng instanceof M) {
            const R = rng.r, C = rng.c;
            if (R * C === 0) return 0;
            if (R === 1 || true) {
              for (let j = 0; j < C; j++) {
                let v; if (R === 1) { v = new M(1, 1, Float64Array.of(rng.re[j]), rng.im ? Float64Array.of(rng.im[j]) : null, rng.t); } else { v = new M(R, 1, rng.re.slice(j * R, (j + 1) * R), rng.im ? rng.im.slice(j * R, (j + 1) * R) : null, rng.t); }
                setLoop(v); const st = this.execBlock(s.body, sc); if (st === BREAK) break; if (st === RETURN) return st;
              }
            }
          } else if (isCell(rng)) { for (let j = 0; j < rng.c; j++) { const col = rng.v.slice(j * rng.r, (j + 1) * rng.r); setLoop({cell: true, r: rng.r, c: 1, v: col}); const st = this.execBlock(s.body, sc); if (st === BREAK) break; if (st === RETURN) return st; } }
          else if (isSA(rng)) { for (let j = 0; j < rng.v.length; j++) { setLoop({sa: true, r: 1, c: 1, v: [rng.v[j]]}); const st = this.execBlock(s.body, sc); if (st === BREAK) break; if (st === RETURN) return st; } }
          else { setLoop(rng); const st = this.execBlock(s.body, sc); if (st === RETURN) return st; }
          return 0;
        }
        case 'while': { while (isTrue(this.condVal(s.c, sc))) { const st = this.execBlock(s.body, sc); if (st === BREAK) break; if (st === RETURN) return st; this.tick(); } return 0; }
        case 'dountil': { do { const st = this.execBlock(s.body, sc); if (st === BREAK) break; if (st === RETURN) return st; } while (!isTrue(this.condVal(s.c, sc))); return 0; }
        case 'switch': {
          const v = this.eval(s.e, sc);
          const match = c => {
            if (isCell(c)) return c.v.some(x => match(x));
            if (v instanceof M && c instanceof M) { if (v.t === 'c' || c.t === 'c') return v.t === 'c' && c.t === 'c' && toStr(v) === toStr(c); if (!c.re.length || !v.re.length) return false; return v.re[0] === c.re[0]; }
            return false;
          };
          for (const [ce, b] of s.cases) { if (match(this.eval(ce, sc))) return this.execBlock(b, sc); }
          if (s.other) return this.execBlock(s.other, sc); return 0;
        }
        case 'try': {
          try { return this.execBlock(s.body, sc); }
          catch (e) {
            if (!(e instanceof MLError) && !(e instanceof RangeError)) throw e;
            if (e instanceof MLError && (e.mid === 'MATLAB:interrupted' || e.mid === 'MATLAB:timeout')) throw e;
            const msg = e instanceof RangeError ? 'Özyineleme çok derin' : e.message;
            if (s.cv) { const o = Object.create(null); o.message = str(msg); o.identifier = str(e.mid || 'MATLAB:error'); o.stack = {sa: true, r: 1, c: 1, v: [Object.assign(Object.create(null), {line: num(e.mline || s.line)})]}; this.setVar(sc, s.cv, {sa: true, r: 1, c: 1, v: [o]}); }
            this.lastErr = {message: msg, identifier: e.mid || 'MATLAB:error'};
            return this.execBlock(s.cb, sc);
          }
        }
        case 'break': return BREAK;
        case 'continue': return CONTINUE;
        case 'return': return RETURN;
        case 'global': { if (!sc.globals) sc.globals = new Set(); for (const n of s.names) { sc.globals.add(n); if (!this.globalVars.has(n)) this.globalVars.set(n, sc.vars.has(n) ? sc.vars.get(n) : empty()); } return 0; }
        case 'persistent': {
          const key = (sc.fn ? sc.fn.name : '') + ''; if (!this.persist.has(key)) this.persist.set(key, new Map()); const pm = this.persist.get(key);
          if (!sc.persistNames) sc.persistNames = new Set();
          for (const n of s.names) { if (!pm.has(n)) pm.set(n, s.init ? this.eval(s.init, sc) : empty()); sc.persistNames.add(n); sc.vars.set(n, pm.get(n)); }
          return 0;
        }
      }
      err('Bilinmeyen deyim: ' + s.t, s.line);
    }
    condVal(c, sc) { const v = this.eval(c, sc); if (!(v instanceof M)) E('MATLAB:nonLogicalConditional', 'Koşul ifadesi sayısal veya mantıksal olmalı.'); return v; }
    execAssign(s, sc) {
      const lhs = s.lhs;
      if (lhs.length === 1) {
        const l = lhs[0]; let rhsNode = s.rhs;
        let vals = this.evalMulti(rhsNode, sc, 1);
        if (!vals.length) E('MATLAB:needMoreRhsOutputs', 'İfade bir değer üretmedi (çıktısı olmayan işlev).');
        let v = vals[0];
        if (rhsNode.t === 'cidx' && vals.length > 1 && false) { }
        // [] ile silme: A(idx) = []
        if (l.t === 'call' && v instanceof M && v.r === 0 && v.c === 0 && v.t === 'd' && rhsNode.t === 'mat') { this.deleteAt(l, sc); }
        else this.assignTo(l, v, sc);
        if (s.print) this.printLV(l, sc);
        return 0;
      }
      const nout = lhs.length, vals = this.evalMulti(s.rhs, sc, nout);
      if (vals.length < lhs.filter(l => l.t !== 'tilde').length && vals.length < nout) {
        // çıktı sayısı yetersiz: yalnız istenen kadar atanır; fazlası hata
        let need = 0; lhs.forEach((l, i) => { if (l.t !== 'tilde') need = i + 1; }); if (vals.length < need) E('MATLAB:needMoreRhsOutputs', `Yeterli çıktı yok: ${need} çıktı isteniyor, ${vals.length} döndü.`);
      }
      lhs.forEach((l, i) => { if (l.t === 'tilde') return; this.assignTo(l, vals[i], sc); if (s.print) this.printLV(l, sc); });
      return 0;
    }
    printLV(l, sc) { let b = l; while (b.t !== 'id') b = b.f || b.a; this.display(b.n, this.getVar(sc, b.n)); }
    assignTo(l, v, sc) {
      if (l.t === 'id') { if (v && v._o !== undefined && v._o !== null && !(sc.persistNames && sc.persistNames.has(l.n))) { /* paylaşılan değer */ } this.setVar(sc, l.n, v); if (sc.persistNames && sc.persistNames.has(l.n)) { const key = (sc.fn ? sc.fn.name : '') + ''; this.persist.get(key).set(l.n, v); } return; }
      // erişimci zinciri: kök değişken + [paren|brace|field...]
      const accs = []; let b = l;
      while (b.t !== 'id') {
        if (b.t === 'call') accs.unshift({k: 'paren', args: b.args}); else if (b.t === 'cidx') accs.unshift({k: 'brace', args: b.args}); else if (b.t === 'field') accs.unshift({k: 'field', name: b.name, dyn: b.dyn});
        else err('Geçersiz atama hedefi', l.line); b = b.f || b.a;
      }
      const name = b.n; let cur = this.hasVar(sc, name) ? this.getVar(sc, name) : undefined;
      if (cur !== undefined) cur = this.own(sc, name, cur);
      const nv = this.setPath(cur, accs, 0, v, sc, this.tokenOf(sc, name));
      if (nv !== cur || cur === undefined) { this.setVar(sc, name, nv); nv._o = this.tokenOf(sc, name); }
      if (sc.persistNames && sc.persistNames.has(name)) { const key = (sc.fn ? sc.fn.name : '') + ''; this.persist.get(key).set(name, this.getVar(sc, name)); }
    }
    evalIdx(args, base, sc) {   // end bağlamıyla indis ifadeleri
      const out = []; const n = args.length;
      for (let k = 0; k < n; k++) {
        const a = args[k]; if (a.t === 'colon') { out.push(COLON); continue; }
        this.endStack.push({v: base, k, n}); try { const vs = this.evalMulti(a, sc, 1); for (const x of vs) out.push(x); } finally { this.endStack.pop(); }
      }
      return out;
    }
    setPath(cur, accs, i, rhs, sc, tok) {
      const a = accs[i], last = i === accs.length - 1;
      if (a.k === 'field') {
        const name = a.dyn ? toStr(this.eval(a.dyn, sc)) : a.name;
        let sa = cur; if (sa === undefined || (sa instanceof M && sa.re.length === 0)) sa = {sa: true, r: 1, c: 1, v: [Object.create(null)], _o: tok};
        if (!isSA(sa)) E('MATLAB:scalarStruct', 'Yapı olmayan değişkene alan atanamaz (önce struct oluşturun).');
        if (sa.v.length !== 1) E('MATLAB:scalarStruct', 'Alan atamak için yapı dizisinde bir eleman seçin: s(i).alan = ...');
        const o = sa.v[0]; if (last) { const val = rhs; if (val && val._o !== undefined && val._o !== null) val._o = null; else if (val) val._o = tok; o[name] = val; }
        else { let sub = o[name]; if (sub !== undefined && sub._o !== tok) { sub = clone(sub); } const nv = this.setPath(sub, accs, i + 1, rhs, sc, tok); nv._o = tok; o[name] = nv; }
        return sa;
      }
      if (a.k === 'brace') {
        let c = cur; if (c === undefined || (c instanceof M && c.re.length === 0)) c = {cell: true, r: 0, c: 0, v: [], _o: tok};
        if (!isCell(c)) E('MATLAB:cellAssToNonCell', 'Hücre olmayan değişkene {} ile atama yapılamaz.');
        const idx = this.evalIdx(a.args, c, sc);
        const pos = this.cellPos(c, idx);
        if (last) { const val = rhs; if (val && val._o !== undefined && val._o !== null) val._o = null; else if (val) val._o = tok; c.v[pos] = val; }
        else { let sub = c.v[pos]; if (sub !== undefined && sub._o !== tok && sub !== null) sub = clone(sub); const nv = this.setPath(sub && !(sub instanceof M && sub.re.length === 0 && sub.t === 'd' && accs[i + 1].k === 'field') ? sub : undefined, accs, i + 1, rhs, sc, tok); nv._o = tok; c.v[pos] = nv; }
        return c;
      }
      // paren
      const idx = this.evalIdx(a.args, cur === undefined ? empty() : cur, sc);
      if (cur === undefined) cur = (isCell(rhs) && last) ? {cell: true, r: 0, c: 0, v: [], _o: tok} : (isSA(rhs) && last) ? {sa: true, r: 0, c: 0, v: [], _o: tok} : (accs[i + 1] && accs[i + 1].k === 'field') ? {sa: true, r: 0, c: 0, v: [], _o: tok} : new M(0, 0, new Float64Array(0), null, 'd');
      if (cur instanceof M && cur.re.length === 0 && accs[i + 1] && accs[i + 1].k === 'field') cur = {sa: true, r: 0, c: 0, v: [], _o: tok};
      if (isCell(cur)) {
        if (!last) E('MATLAB:unsupported', 'Hücre için () sonrası iç içe atama desteklenmiyor; {} kullanın.');
        if (isCell(rhs)) { this.assignCellParen(cur, idx, rhs); return cur; }
        E('MATLAB:conversionToCell', 'Hücre dizisine () ile hücre olmayan atanamaz; c{i} = x kullanın.');
      }
      if (isSA(cur)) {
        const pos = this.cellPos(cur, idx, true);
        if (last) { if (!isSA(rhs) || rhs.v.length !== 1) E('MATLAB:unsupported', 'Yapı dizisi elemanına yapı atanmalı.'); const o = rhs.v[0]; this.growSA(cur, pos); cur.v[pos] = Object.assign(Object.create(null), o); return cur; }
        this.growSA(cur, pos); const el = {sa: true, r: 1, c: 1, v: [cur.v[pos]], _o: tok}; const nv = this.setPath(el, accs, i + 1, rhs, sc, tok); cur.v[pos] = nv.v[0]; return cur;
      }
      if (!(cur instanceof M)) E('MATLAB:badsubscript', 'Bu değişken indislenerek atanamaz.');
      if (!last) E('MATLAB:unsupported', 'Sayısal dizide indisten sonra erişim yapılamaz.');
      if (rhs instanceof M && rhs.re.length === 0 && rhs.r === 0 && rhs.c === 0) { deleteM(cur, idx); return cur; }
      return assignM(cur, idx, rhs, this.cur);
    }
    deleteAt(l, sc) {
      let b = l.f; if (b.t !== 'id') { const cur = this.eval(b, sc); const idx = this.evalIdx(l.args, cur, sc); if (isCell(cur)) { this.delCell(cur, idx); return; } deleteM(cur, idx); return; }
      let cur = this.getVar(sc, b.n); if (cur === undefined) E('MATLAB:undefinedVarOrClass', `'${b.n}' tanımsız.`); cur = this.own(sc, b.n, cur);
      const idx = this.evalIdx(l.args, cur, sc);
      if (cur instanceof M) deleteM(cur, idx); else if (isCell(cur)) this.delCell(cur, idx); else if (isSA(cur)) this.delCell(cur, idx); else E('MATLAB:badsubscript', 'Silme desteklenmiyor.');
    }
    delCell(c, idx) { const N = c.v.length, ix = idxList(idx[idx.length - 1], N), del = new Set(ix); const nv = c.v.filter((_, i) => !del.has(i)); c.v = nv; if (c.r === 1 || c.c !== 1) { c.r = 1; c.c = nv.length; } else { c.r = nv.length; c.c = 1; } }
    cellPos(c, idx, grow) {
      if (idx.length === 1) { const ix = idxList(idx[0], c.r * c.c); if (ix.length !== 1) E('MATLAB:badsubscript', 'Tek eleman indisi bekleniyordu.'); const p = ix[0]; if (p >= c.v.length) { if (c.r <= 1) { for (let q = c.v.length; q <= p; q++) c.v.push(isSA(c) ? Object.create(null) : empty()); c.r = 1; c.c = p + 1; } else if (c.c === 1) { for (let q = c.v.length; q <= p; q++) c.v.push(empty()); c.r = p + 1; } else E('MATLAB:badsubscript', 'Dizin sınırı aşıyor.'); } return p; }
      const ri = idxList(idx[0], c.r), ci = idxList(idx[1], c.c); if (ri.length !== 1 || ci.length !== 1) E('MATLAB:badsubscript', 'Tek eleman indisi bekleniyordu.');
      const r = ri[0], q = ci[0]; if (r >= c.r || q >= c.c) { const R = Math.max(c.r, r + 1), C = Math.max(c.c, q + 1), nv = new Array(R * C); for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) nv[i + j * R] = (i < c.r && j < c.c) ? c.v[i + j * c.r] : (isSA(c) ? Object.create(null) : empty()); c.v = nv; c.r = R; c.c = C; }
      return r + q * c.r;
    }
    growSA(sa, pos) { while (sa.v.length <= pos) sa.v.push(Object.create(null)); if (sa.r <= 1) { sa.r = 1; sa.c = sa.v.length; } else { sa.r = sa.v.length; sa.c = 1; } }
    assignCellParen(c, idx, rhs) {
      if (idx.length === 1) { const ix = idxList(idx[0], c.r * c.c); if (rhs.v.length !== 1 && rhs.v.length !== ix.length) E('MATLAB:nonConformingAssign', 'Hücre ataması boyutları uyuşmuyor.'); ix.forEach((p, k) => { this.cellPos(c, [num(p + 1)]); c.v[p] = rhs.v[rhs.v.length === 1 ? 0 : k]; }); return; }
      const ri = idxList(idx[0], c.r), ci = idxList(idx[1], c.c); let k = 0; for (let j = 0; j < ci.length; j++) for (let i = 0; i < ri.length; i++) { const p = this.cellPos(c, [num(ri[i] + 1), num(ci[j] + 1)]); c.v[p] = rhs.v[rhs.v.length === 1 ? 0 : k++]; }
    }
    /* ---------- ifade değerlendirme ---------- */
    eval(node, sc) { const v = this.evalMulti(node, sc, 1); if (!v.length) E('MATLAB:needMoreRhsOutputs', 'İfade bir değer üretmedi (çıktısı olmayan işlev ya da boş {} / yapı dizisi).'); return v[0]; }
    evalMulti(node, sc, nargout, stmt) {
      switch (node.t) {
        case 'num': return [num(node.v)];
        case 'imag': return [ML.cplx(0, node.v)];
        case 'str': return [str(node.v)];
        case 'paren': return [this.eval(node.a, sc)];
        case 'id': {
          const n = node.n;
          if (this.hasVar(sc, n)) return [this.getVar(sc, n)];
          return this.callNamed(n, [], nargout, node.line, sc, stmt);
        }
        case 'colon': return [str(':')];
        case 'end': { const t = this.endStack[this.endStack.length - 1]; if (!t) E('MATLAB:end', "'end' yalnızca indis içinde kullanılabilir."); const s = sizeOf(t.v); return [num(t.n === 1 ? s[0] * s[1] : t.k === 0 ? s[0] : t.k === 1 ? s[1] : 1)]; }
        case 'bin': { const a = this.eval(node.a, sc), b = this.eval(node.b, sc); this.cur = node.line; return [binop(node.op, a, b, node.line)]; }
        case 'andand': { const a = this.eval(node.a, sc); if (!(a instanceof M)) E('MATLAB:nonLogicalConditional', '&& işleneni mantıksal olmalı.'); if (!isTrue(a)) return [bool(false)]; const b = this.eval(node.b, sc); return [bool(isTrue(b))]; }
        case 'oror': { const a = this.eval(node.a, sc); if (!(a instanceof M)) E('MATLAB:nonLogicalConditional', '|| işleneni mantıksal olmalı.'); if (isTrue(a)) return [bool(true)]; const b = this.eval(node.b, sc); return [bool(isTrue(b))]; }
        case 'un': { const a = this.eval(node.a, sc); if (!(a instanceof M)) E('MATLAB:undefinedFunction', 'Tekli işleç bu tür için tanımlı değil.'); return [node.op === '-' ? uminus(a) : unot(a)]; }
        case 'post': { const a = this.eval(node.a, sc); if (a instanceof M) return [ctranspose(a, node.op === "'")]; if (isCell(a)) { const o = {cell: true, r: a.c, c: a.r, v: new Array(a.v.length)}; for (let i = 0; i < a.r; i++) for (let j = 0; j < a.c; j++) o.v[j + i * a.c] = a.v[i + j * a.r]; return [o]; } E('MATLAB:undefinedFunction', 'Devrik bu tür için tanımlı değil.'); break; }
        case 'range': { const a = this.eval(node.a, sc), b = this.eval(node.b, sc), s = node.s ? this.eval(node.s, sc) : null; if (!(a instanceof M && b instanceof M) || !a.re.length || !b.re.length) return [new M(1, 0)]; const r = range(a.re[0], s ? s.re[0] : 1, b.re[0]); if (isInt(a.t) || isInt(b.t)) r.t = isInt(a.t) ? a.t : b.t; else if (a.t === 'c' && b.t === 'c') r.t = 'c'; return [r]; }
        case 'mat': return [this.buildMatrix(node, sc)];
        case 'cellLit': return [this.buildCell(node, sc)];
        case 'anon': return [this.makeAnon(node, sc)];
        case 'fh': return [{fh: true, name: node.name}];
        case 'call': return this.evalCall(node, sc, nargout, stmt);
        case 'cidx': {
          const base = this.eval(node.f, sc); if (!isCell(base)) E('MATLAB:cellRefFromNonCell', "'{}' ile indisleme yalnızca hücre dizilerinde kullanılabilir (bu bir " + classOf(base) + ').');
          const idx = this.evalIdx(node.args, base, sc);
          return this.cellRead(base, idx);
        }
        case 'field': {
          const base = this.evalMulti(node.a, sc, 1); const name = node.dyn ? toStr(this.eval(node.dyn, sc)) : node.name;
          if (!base.length) E('MATLAB:needMoreRhsOutputs', 'Alan erişimi için değer yok.');
          const b = base[0];
          if (isSA(b)) { const out = []; for (const o of b.v) { if (!(name in o)) E('MATLAB:nonExistentField', `Yapıda '${name}' alanı yok.`); out.push(o[name]); } return out; }
          if (b instanceof M && b.re.length === 0 && false) return [];
          E('MATLAB:nonStructAsStruct', `'${name}' alanına erişim: değer bir yapı değil (${classOf(b)}).`);
        }
      }
      err('Bilinmeyen ifade: ' + node.t, node.line);
    }
    cellRead(c, idx) {
      if (idx.length === 1) { const ix = idxList(idx[0], c.v.length), out = []; for (const p of ix) { if (p >= c.v.length) E('MATLAB:badsubscript', `Dizin, hücre eleman sayısını aşıyor (${c.v.length}).`); out.push(c.v[p]); } return out; }
      const ri = idxList(idx[0], c.r), ci = idxList(idx[1], c.c), out = []; for (let j = 0; j < ci.length; j++) for (let i = 0; i < ri.length; i++) { if (ri[i] >= c.r || ci[j] >= c.c) E('MATLAB:badsubscript', 'Hücre dizini sınırı aşıyor.'); out.push(c.v[ri[i] + ci[j] * c.r]); } return out;
    }
    buildMatrix(node, sc) {
      const rows = [];
      for (const rowN of node.rows) { const items = []; for (const e of rowN) { const vs = this.evalMulti(e, sc, 1); for (const v of vs) items.push(v); } rows.push(items); }
      if (!rows.length) return empty();
      return ML.vcat(rows.map(r => ML.hcat(r)));
    }
    buildCell(node, sc) {
      const rows = [];
      for (const rowN of node.rows) { const items = []; for (const e of rowN) { const vs = this.evalMulti(e, sc, 1); for (const v of vs) { if (isCell(v)) items.push(v); else { const w = v; if (w && w._o !== undefined) w._o = null; items.push({cell: true, r: 1, c: 1, v: [w]}); } } } rows.push(items); }
      if (!rows.length) return cell(0, 0, []);
      const rr = rows.map(items => { const R = items.length ? Math.max(...items.map(x => x.r)) : 0; const nonEmpty = items.filter(x => x.v.length); if (!nonEmpty.length) return {cell: true, r: 0, c: 0, v: []}; const Rr = nonEmpty[0].r; let C = 0; for (const x of nonEmpty) { if (x.r !== Rr) E('MATLAB:catenate', 'Hücre birleştirmede satır sayıları uyuşmuyor.'); C += x.c; } const out = new Array(Rr * C); let off = 0; for (const x of nonEmpty) { for (let j = 0; j < x.c; j++) for (let i = 0; i < Rr; i++) out[i + (off + j) * Rr] = x.v[i + j * x.r]; off += x.c; } return {cell: true, r: Rr, c: C, v: out}; });
      const ne = rr.filter(x => x.v.length); if (!ne.length) return cell(0, 0, []); const C = ne[0].c; let R = 0; for (const x of ne) { if (x.c !== C) E('MATLAB:catenate', 'Hücre birleştirmede sütun sayıları uyuşmuyor.'); R += x.r; }
      const out = new Array(R * C); let off = 0; for (const x of ne) { for (let j = 0; j < C; j++) for (let i = 0; i < x.r; i++) out[off + i + j * R] = x.v[i + j * x.r]; off += x.r; }
      return {cell: true, r: R, c: C, v: out};
    }
    makeAnon(node, sc) {
      const free = new Set(); const walk = (n, bound) => {
        if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(x => walk(x, bound)); return; }
        if (n.t === 'id') { if (!bound.has(n.n)) free.add(n.n); return; }
        if (n.t === 'anon') { const b2 = new Set(bound); n.params.forEach(p => b2.add(p)); walk(n.body, b2); return; }
        for (const k in n) if (k !== 't' && k !== 'line') walk(n[k], bound);
      };
      walk(node.body, new Set(node.params));
      const env = new Map(); for (const nme of free) if (this.hasVar(sc, nme)) { const v = this.getVar(sc, nme); if (v && v._o !== undefined) v._o = null; env.set(nme, v); }
      return {fh: true, params: node.params, body: node.body, env, src: node};
    }
    evalCall(node, sc, nargout, stmt) {
      const f = node.f;
      if (f.t === 'id') {
        const n = f.n;
        if (this.hasVar(sc, n)) {
          const base = this.getVar(sc, n); return this.indexValue(base, node.args, sc, nargout, node.line);
        }
        // işlev çağrısı
        const args = this.evalArgs(node.args, sc); this.cur = node.line;
        return this.callNamed(n, args, nargout, node.line, sc, stmt);
      }
      const bs = this.evalMulti(f, sc, 1); if (!bs.length) E('MATLAB:needMoreRhsOutputs', 'İndislenecek değer yok.');
      return this.indexValue(bs[0], node.args, sc, nargout, node.line);
    }
    evalArgs(argNodes, sc) {
      const out = [];
      for (const a of argNodes) { if (a.t === 'colon') { out.push(str(':')); continue; } const vs = this.evalMulti(a, sc, 1); for (const v of vs) out.push(v); }
      return out;
    }
    indexValue(base, argNodes, sc, nargout, line) {
      if (isFH(base)) { const args = this.evalArgs(argNodes, sc); return this.callFH(base, args, nargout); }
      const idx = this.evalIdx(argNodes, base, sc);
      this.cur = line;
      if (base instanceof M) { if (!idx.length) return [base]; return [readM(base, idx, line)]; }
      if (isCell(base)) {
        if (!idx.length) return [base];
        const ix = this.cellRead(base, idx); let R, C;
        if (idx.length === 1) { const a = idx[0]; if (a === COLON) { R = ix.length; C = 1; } else if (a.r > 1 && a.c > 1) { R = a.r; C = a.c; } else if (base.r === 1) { R = 1; C = ix.length; } else if (base.c === 1) { R = ix.length; C = 1; } else { R = a.r === 1 ? 1 : ix.length; C = a.r === 1 ? ix.length : 1; } } else { R = idxList(idx[0], base.r).length; C = idxList(idx[1], base.c).length; }
        return [{cell: true, r: R, c: C, v: ix}];
      }
      if (isSA(base)) {
        if (!idx.length) return [base];
        const ix = idx.length === 1 ? idxList(idx[0], base.v.length) : (() => { const ri = idxList(idx[0], base.r), ci = idxList(idx[1], base.c), o = []; for (const c of ci) for (const r of ri) o.push(r + c * base.r); return o; })();
        for (const p of ix) if (p >= base.v.length) E('MATLAB:badsubscript', `Dizin, yapı dizisi boyutunu aşıyor (${base.v.length}).`);
        return [{sa: true, r: 1, c: ix.length, v: Array.from(ix, p => base.v[p])}];
      }
      E('MATLAB:badsubscript', 'Bu değer indislenemez.');
    }
    callFH(fh, args, nargout) {
      if (fh.src === undefined && fh.name) return this.callNamed(fh.name, args, nargout, this.cur, this.base);
      if (this.depth > this.maxDepth) E('MATLAB:recursionLimit', 'Özyineleme sınırı aşıldı.');
      const sc = new Scope(); for (const [k, v] of fh.env) sc.vars.set(k, v);
      fh.params.forEach((p, i) => { if (p === 'varargin') sc.vars.set('varargin', {cell: true, r: 1, c: Math.max(0, args.length - i), v: args.slice(i)}); else if (i < args.length) sc.vars.set(p, args[i]); });
      sc.nargin = args.length; sc.nargout = nargout;
      this.depth++; try { const vs = this.evalMulti(fh.body, sc, nargout); return vs; } finally { this.depth--; }
    }
    callNamed(name, args, nargout, line, sc, stmt) {
      const uf = this.funcs.get(name);
      if (uf) return this.callUser(uf, args, nargout);
      const bf = this.builtins[name];
      if (bf) {
        this.cur = line;
        const r = bf.call(this, args, nargout, sc, stmt);
        if (r === undefined) return [];
        return Array.isArray(r) ? r : [r];
      }
      E('MATLAB:UndefinedFunction', `'${name}' tanımsız: değişken ya da işlev bulunamadı` + (line ? ` (satır ${line})` : '') + '.');
    }
    callUser(f, args, nargout) {
      if (this.depth > this.maxDepth) E('MATLAB:recursionLimit', 'Özyineleme sınırı aşıldı (sonsuz özyineleme olabilir).');
      const sc = new Scope(f); const hasVA = f.ins.length && f.ins[f.ins.length - 1] === 'varargin';
      const np = hasVA ? f.ins.length - 1 : f.ins.length;
      if (args.length > np && !hasVA) E('MATLAB:TooManyInputs', `'${f.name}' işlevine çok fazla giriş argümanı verildi (en çok ${np}).`);
      for (let i = 0; i < np && i < args.length; i++) if (f.ins[i] !== '~') sc.vars.set(f.ins[i], args[i]);
      if (hasVA) sc.vars.set('varargin', {cell: true, r: 1, c: Math.max(0, args.length - np), v: args.slice(np)});
      sc.nargin = args.length; sc.nargout = nargout;
      const hasVO = f.outs.length && f.outs[f.outs.length - 1] === 'varargout';
      if (nargout > f.outs.length && !hasVO) E('MATLAB:TooManyOutputs', `'${f.name}' işlevi en çok ${f.outs.length} çıktı döndürür.`);
      this.depth++; const save = this.cur;
      try { this.execBlock(f.body, sc); } finally { this.depth--; this.cur = save; }
      const outs = [];
      const want = Math.max(1, nargout);
      for (let i = 0; i < f.outs.length && outs.length < want; i++) {
        const on = f.outs[i];
        if (on === 'varargout' && i === f.outs.length - 1) { const vo = sc.vars.get('varargout'); if (vo && isCell(vo)) for (const x of vo.v) { if (outs.length < want) outs.push(x); } break; }
        if (!sc.vars.has(on)) { if (i === 0 && nargout === 0) break; E('MATLAB:UnassignedOutputs', `'${f.name}' işlevinde '${on}' çıktı argümanı atanmadı.`); }
        outs.push(sc.vars.get(on));
      }
      return outs;
    }
    callFunctionValue(f, args, nargout) {   // yerleşik işlevlerin geri çağrıları (cellfun, arrayfun, fzero...)
      if (isFH(f)) { return this.callFH(f, args, nargout); }
      if (f instanceof M && f.t === 'c') return this.callNamed(toStr(f), args, nargout, this.cur, this.base);
      E('MATLAB:badFunc', 'İşlev tutamacı veya ad bekleniyordu.');
    }
    /* ---------- gösterim ---------- */
    display(name, v) {
      const out = s => this.out(s);
      if (v instanceof M) {
        if (v.t === 'c' && v.r <= 1) { out(`${name} = ${toStr(v)}\n`); return; }
        if (v.re.length === 0) { out(v.r === 0 && v.c === 0 ? `${name} = []\n` : `${name} = zeros(${v.r},${v.c})\n`.replace('zeros', v.t === 'c' ? '' : 'zeros')); return; }
        if (v.re.length === 1 && v.t !== 'c') { out(`${name} = ${fmtScalar(v, 0)}\n`); return; }
        out(`${name} =\n\n${fmtMatrix(v)}\n`); return;
      }
      if (isCell(v)) { out(`${name} =\n  ${v.r}×${v.c} cell array\n`); if (v.v.length <= 200) for (let i = 0; i < v.r; i++) { let line = '   '; for (let j = 0; j < v.c; j++) line += ' ' + cellSummary(v.v[i + j * v.r]) + ' '; out(line + '\n'); } out('\n'); return; }
      if (isSA(v)) { if (v.v.length === 1) { out(`${name} =\n  struct with fields:\n\n`); for (const k in v.v[0]) out(`    ${k}: ${cellSummary(v.v[0][k], true)}\n`); out('\n'); } else out(`${name} =\n  ${v.r}×${v.c} struct array with fields:\n\n` + (v.v[0] ? Object.keys(v.v[0]).map(k => '    ' + k + '\n').join('') : '') + '\n'); return; }
      if (isFH(v)) { out(`${name} = ${fhText(v)}\n`); return; }
      out(`${name} = <${classOf(v)}>\n`);
    }
  }

  /* ---------- sayı biçimleri ---------- */
  function fmtNumShort(x) {
    if (Number.isNaN(x)) return 'NaN'; if (x === Infinity) return 'Inf'; if (x === -Infinity) return '-Inf';
    if (x === Math.floor(x) && Math.abs(x) < 1e9) return String(x);
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) { let s = x.toExponential(4); return s.replace(/e([+-])(\d)$/, 'e$10$2'); }
    const dec = Math.max(0, 4 - Math.floor(Math.log10(a)) - (a >= 1 ? 0 : 0)); return x.toFixed(a >= 1 ? Math.min(4, Math.max(1, 4 - Math.floor(Math.log10(a)))) : 4);
  }
  function fmtScalar(v, k) {
    const x = v.re[k], im = v.im ? v.im[k] : 0;
    if (v.t === 'l' || isInt(v.t) || v.t === 'c') return String(v.t === 'c' ? String.fromCharCode(x) : x);
    if (!v.im) return fmtNumShort(x);
    return fmtNumShort(x) + (im < 0 || Object.is(im, -0) ? ' - ' : ' + ') + fmtNumShort(Math.abs(im)) + 'i';
  }
  function fmtMatrix(v) {
    const R = v.r, C = v.c; const cells = [];
    if (v.t === 'c') { const rows = []; for (let i = 0; i < R; i++) rows.push('    ' + ML.rowStr(v, i)); return rows.join('\n') + '\n'; }
    const allInt = !v.im && Array.from(v.re).every(x => !Number.isFinite(x) || (x === Math.floor(x) && Math.abs(x) < 1e9));
    let strs = []; let mxA = 0; for (let i = 0; i < v.re.length; i++) if (Number.isFinite(v.re[i])) mxA = Math.max(mxA, Math.abs(v.re[i]));
    for (let k = 0; k < v.re.length; k++) {
      if (v.im) strs.push(fmtScalar(v, k));
      else if (v.t === 'l' || isInt(v.t) || allInt) strs.push(Number.isFinite(v.re[k]) ? String(v.re[k]) : fmtNumShort(v.re[k]));
      else { const x = v.re[k]; strs.push(!Number.isFinite(x) ? fmtNumShort(x) : (mxA >= 1e5 || (mxA < 1e-3 && mxA > 0)) ? x.toExponential(4).replace(/e([+-])(\d)$/, 'e$10$2') : x.toFixed(4)); }
    }
    const w = Math.max(...strs.map(s => s.length)) + (v.t === 'l' || isInt(v.t) ? 2 : allInt ? 3 : 3);
    const colsPerChunk = Math.max(1, Math.floor(80 / w)); let out = '';
    for (let c0 = 0; c0 < C; c0 += colsPerChunk) {
      const c1 = Math.min(C, c0 + colsPerChunk); if (C > colsPerChunk) out += c1 - c0 === 1 ? `  Sütun ${c0 + 1}\n\n` : `  Sütunlar ${c0 + 1} - ${c1}\n\n`;
      for (let i = 0; i < R; i++) { let line = ''; for (let j = c0; j < c1; j++) line += strs[i + j * R].padStart(w + (v.t === 'l' || isInt(v.t) ? 0 : 0)); out += line + '\n'; }
      if (c1 < C) out += '\n';
    }
    return out;
  }
  function cellSummary(x, top) {
    if (x instanceof M) { if (x.t === 'c' && x.r <= 1) return top ? `'${toStr(x)}'` : `'${toStr(x)}'`; if (x.re.length === 1) return top ? fmtScalar(x, 0) : `[${fmtScalar(x, 0)}]`; if (x.re.length === 0) return '[]'; return `[${x.r}×${x.c} ${ML.CLSNAME[x.t]}]`; }
    if (isCell(x)) return `{${x.r}×${x.c} cell}`; if (isSA(x)) return `[${x.r}×${x.c} struct]`; if (isFH(x)) return fhText(x); return '?';
  }
  function unparse(n) {
    switch (n.t) {
      case 'num': return String(n.v); case 'imag': return n.v + 'i'; case 'str': return "'" + n.v.replace(/'/g, "''") + "'"; case 'id': return n.n; case 'colon': return ':'; case 'end': return 'end'; case 'tilde': return '~';
      case 'paren': return '(' + unparse(n.a) + ')';
      case 'bin': case 'andand': case 'oror': return unparse(n.a) + ' ' + n.op + ' ' + unparse(n.b);
      case 'un': return n.op + unparse(n.a); case 'post': return unparse(n.a) + n.op;
      case 'range': return unparse(n.a) + ':' + (n.s ? unparse(n.s) + ':' : '') + unparse(n.b);
      case 'call': return unparse(n.f) + '(' + n.args.map(unparse).join(', ') + ')'; case 'cidx': return unparse(n.f) + '{' + n.args.map(unparse).join(', ') + '}';
      case 'field': return unparse(n.a) + '.' + (n.name || '(' + unparse(n.dyn) + ')');
      case 'mat': return '[' + n.rows.map(r => r.map(unparse).join(', ')).join('; ') + ']'; case 'cellLit': return '{' + n.rows.map(r => r.map(unparse).join(', ')).join('; ') + '}';
      case 'anon': return '@(' + n.params.join(', ') + ') ' + unparse(n.body); case 'fh': return '@' + n.name;
    }
    return '?';
  }
  const fhText = f => f.src ? '@(' + f.params.join(', ') + ') ' + unparse(f.body) : '@' + f.name;

  /* ---------- birleştirme ---------- */
  function hcat(items) {
    items = items.filter(x => !(x instanceof M && x.r === 0 && x.c === 0 && x.t === 'd' && items.length > 1));
    if (!items.length) return empty(); if (items.length === 1) return items[0];
    if (items.some(isCell)) { const cs = items.map(x => isCell(x) ? x : {cell: true, r: 1, c: 1, v: [x]}).filter(c => c.v.length); if (!cs.length) return cell(0, 0, []); const R = cs[0].r; let C = 0; for (const c of cs) { if (c.r !== R) E('MATLAB:horzcat', 'Yatay birleştirme: satır sayıları uyuşmuyor.'); C += c.c; } const o = []; for (const c of cs) o.push(...c.v); return {cell: true, r: R, c: C, v: o}; }
    if (items.some(isSA)) { const o = []; for (const x of items) { if (!isSA(x)) E('MATLAB:concatenation', 'Yapı ile başka tür birleştirilemez.'); o.push(...x.v); } return {sa: true, r: 1, c: o.length, v: o}; }
    for (const x of items) if (!(x instanceof M)) E('MATLAB:concatenation', 'Bu türler birleştirilemez (' + classOf(x) + ').');
    const nz = items.filter(x => x.r * x.c > 0 || x.r > 0 && items.length === 1);
    const use = nz.length ? nz : [items[0]];
    const R = use[0].r; let C = 0, im = false; for (const x of use) { if (x.r !== R) E('MATLAB:horzcat', `Yatay birleştirme: satır sayıları uyuşmuyor (${R} ile ${x.r}).`); C += x.c; if (x.im) im = true; }
    const re = new Float64Array(R * C), ii = im ? new Float64Array(R * C) : null; let off = 0, t = use[0].t;
    for (const x of use) { re.set(x.re, off); if (ii && x.im) ii.set(x.im, off); off += x.re.length; t = catClass(t, x.t); }
    let out = new M(R, C, re, ii, t); if (isInt(t) || t === 's') out = fin(out, t); return out;
  }
  function catClass(a, b) { if (a === b) return a; if (isInt(a)) return a; if (isInt(b)) return b; if (a === 'c' || b === 'c') return 'c'; if (a === 's' || b === 's') return 's'; return 'd'; }
  function vcat(items) {
    items = items.filter(x => !(x instanceof M && x.r === 0 && x.c === 0 && x.t === 'd' && items.length > 1));
    if (!items.length) return empty(); if (items.length === 1) return items[0];
    if (items.some(isCell)) { const cs = items.filter(c => c.v.length); if (!cs.length) return cell(0, 0, []); const C = cs[0].c; let R = 0; for (const c of cs) { if (c.c !== C) E('MATLAB:vertcat', 'Dikey birleştirme: sütun sayıları uyuşmuyor.'); R += c.r; } const o = new Array(R * C); let off = 0; for (const c of cs) { for (let j = 0; j < C; j++) for (let i = 0; i < c.r; i++) o[off + i + j * R] = c.v[i + j * c.r]; off += c.r; } return {cell: true, r: R, c: C, v: o}; }
    if (items.some(isSA)) { const o = []; for (const x of items) o.push(...x.v); return {sa: true, r: o.length, c: 1, v: o}; }
    const nz = items.filter(x => x.r * x.c > 0); const use = nz.length ? nz : [items[0]];
    const isChar = use.every(x => x.t === 'c');
    const C = use[0].c; let R = 0, im = false; for (const x of use) { if (x.c !== C) { if (isChar) E('MATLAB:vertcat', 'Dikey birleştirme: karakter dizileri aynı uzunlukta olmalı.'); E('MATLAB:vertcat', `Dikey birleştirme: sütun sayıları uyuşmuyor (${C} ile ${x.c}).`); } R += x.r; if (x.im) im = true; }
    const re = new Float64Array(R * C), ii = im ? new Float64Array(R * C) : null; let off = 0, t = use[0].t;
    for (const x of use) { for (let j = 0; j < C; j++) for (let i = 0; i < x.r; i++) { re[off + i + j * R] = x.re[i + j * x.r]; if (ii && x.im) ii[off + i + j * R] = x.im[i + j * x.r]; } off += x.r; t = catClass(t, x.t); }
    let out = new M(R, C, re, ii, t); if (isInt(t) || t === 's') out = fin(out, t); return out;
  }

  /* ---------- printf ---------- */
  function escapes(s) { return s.replace(/\\(n|t|r|a|b|f|v|\\|"|'|%|[0-7]{1,3}|x[0-9a-fA-F]{1,2})/g, (m, c) => { switch (c[0]) { case 'n': return '\n'; case 't': return '\t'; case 'r': return '\r'; case 'a': return '\x07'; case 'b': return '\b'; case 'f': return '\f'; case 'v': return '\v'; case '\\': return '\\'; case '"': return '"'; case "'": return "'"; case '%': return '%%'; case 'x': return String.fromCharCode(parseInt(c.slice(1), 16)); default: return String.fromCharCode(parseInt(c, 8)); } }); }
  function fmtG(x, prec, alt) { if (prec === 0) prec = 1; if (x === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(x))); let s; if (e < -4 || e >= prec) { s = x.toExponential(prec - 1); if (!alt) s = s.replace(/\.?0+e/, 'e'); s = s.replace(/e([+-])(\d)$/, 'e$10$2'); } else { s = x.toFixed(Math.max(0, prec - 1 - e)); if (!alt && s.includes('.')) s = s.replace(/\.?0+$/, ''); } return s; }
  function sprintfImpl(fmt, args) {
    fmt = escapes(fmt); const items = [];
    for (const a of args) { if (a instanceof M) { if (a.t === 'c') items.push(toStr(a.r <= 1 ? a : ML.str(toStr(a)))); else for (let i = 0; i < a.re.length; i++) items.push(a.re[i]); } else if (isCell(a)) { for (const x of a.v) { if (x instanceof M && x.t === 'c') items.push(toStr(x)); else if (x instanceof M) for (let i = 0; i < x.re.length; i++) items.push(x.re[i]); } } else if (isFH(a)) items.push(fhText(a)); else E('MATLAB:sprintf', 'printf için desteklenmeyen argüman türü: ' + classOf(a)); }
    const re = /%(%|([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?([diuoxXfFeEgGcs]))/g;
    const specs = []; let m; const pieces = []; let last = 0; while ((m = re.exec(fmt))) { pieces.push(fmt.slice(last, m.index)); last = re.lastIndex; if (m[1] === '%') pieces.push({lit: '%'}); else { pieces.push({flags: m[2] || '', w: m[3], p: m[4], c: m[5]}); } } pieces.push(fmt.slice(last));
    const nspec = pieces.filter(p => typeof p === 'object' && !p.lit).length;
    let out = '', k = 0; const total = items.length;
    const fmtOne = (sp, v) => {
      let { flags, w, p, c } = sp; let s;
      if (w === '*') { w = items[k++]; } if (p === '*') { p = items[k++]; }
      w = w === undefined ? 0 : +w; const prec = p === undefined ? undefined : +p;
      if (c === 's') { s = typeof v === 'string' ? v : (Number.isInteger(v) ? String(v) : fmtG(v, prec === undefined ? 5 : prec)); if (prec !== undefined && typeof v === 'string') s = s.slice(0, prec); }
      else if (c === 'c') { s = typeof v === 'string' ? v : String.fromCharCode(v); }
      else {
        if (typeof v === 'string') { // metin sayısal belirtece: karakter kodları
          if (v.length === 1) v = v.charCodeAt(0); else { return v; } }
        if ('diuoxX'.includes(c) && !Number.isInteger(v) && Number.isFinite(v)) { s = prec === undefined ? v.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2') : fmtG(v, prec); if (flags.includes('+') && v >= 0) s = '+' + s; }
        else if (!Number.isFinite(v)) { s = Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf'; if (flags.includes('+') && v > 0) s = '+Inf'; flags = flags.replace('0', ''); }
        else {
          switch (c) {
            case 'd': case 'i': case 'u': s = String(Math.abs(v)); if (prec !== undefined) s = s.padStart(prec, '0'); if (v < 0) s = '-' + s; else if (flags.includes('+')) s = '+' + s; else if (flags.includes(' ')) s = ' ' + s; break;
            case 'o': s = (v >>> 0).toString(8); break; case 'x': s = Math.abs(v) > 0xffffffff ? BigInt(v).toString(16) : (v >>> 0).toString(16); if (flags.includes('#')) s = '0x' + s; break; case 'X': s = (v >>> 0).toString(16).toUpperCase(); break;
            case 'f': case 'F': s = Math.abs(v).toFixed(prec === undefined ? 6 : prec); if (v < 0 || Object.is(v, -0)) s = '-' + s; else if (flags.includes('+')) s = '+' + s; else if (flags.includes(' ')) s = ' ' + s; break;
            case 'e': case 'E': s = Math.abs(v).toExponential(prec === undefined ? 6 : prec).replace(/e([+-])(\d)$/, 'e$10$2'); if (c === 'E') s = s.toUpperCase(); if (v < 0) s = '-' + s; else if (flags.includes('+')) s = '+' + s; break;
            case 'g': case 'G': s = fmtG(Math.abs(v), prec === undefined ? 6 : prec, flags.includes('#')); if (c === 'G') s = s.toUpperCase(); if (v < 0) s = '-' + s; else if (flags.includes('+')) s = '+' + s; break;
          }
        }
      }
      if (s.length < w) { if (flags.includes('-')) s = s.padEnd(w); else if (flags.includes('0') && !'sc'.includes(c) && Number.isFinite(+v)) { const sg = /^[+-]/.test(s) ? s[0] : ''; s = sg + s.slice(sg.length).padStart(w - sg.length, '0'); } else s = s.padStart(w); }
      return s;
    };
    if (!nspec) { for (const p of pieces) out += typeof p === 'string' ? p : p.lit; return out; }
    do {
      for (const p of pieces) {
        if (typeof p === 'string') { out += p; continue; } if (p.lit) { out += p.lit; continue; }
        if (k >= total && total > 0) return out;   // argüman bitti: kalan biçim kesilir
        const v = total === 0 ? '' : items[k++]; out += total === 0 ? (('sc'.includes(p.c)) ? '' : '') : fmtOne(p, v);
      }
    } while (k < total && nspec > 0);
    return out;
  }

  ML.binop = binop; ML.elementwise = elementwise; ML.uminus = uminus; ML.unot = unot; ML.matmul = matmul; ML.solve = solve; ML.range = range; ML.readM = readM; ML.assignM = assignM; ML.deleteM = deleteM; ML.idxList = idxList; ML.COLON = COLON;
  ML.hcat = hcat; ML.vcat = vcat; ML.transpose = ctranspose; ML.Interp = Interp; ML.sprintfImpl = sprintfImpl; ML.escapes = escapes; ML.fmtScalar = fmtScalar; ML.fmtMatrix = fmtMatrix; ML.fmtNumShort = fmtNumShort; ML.fhText = fhText; ML.dropIm = dropIm; ML.eye = eye; ML.fin = fin; ML.E = E; ML.fmtG = fmtG; ML.lsq = lsq; ML.cdiv = cdiv; ML.cpow = cpow; ML.outClass = outClass; ML.catClass = catClass; ML.tr = tr; ML.unparse = unparse;
})(MLAB);
