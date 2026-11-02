/* ===== MATLAB alt kümesi yorumlayıcısı — 6: doğrusal cebir, polinom / ara değer, optimizasyon, eğri uydurma,
   datetime / duration, table, CSV dosyaları, string (Faz 6) ===== */
(function (ML) {
  'use strict';
  const B = ML.builtins, {M, num, zeros, rowv, colv, str, bool, empty, isCell, isSA, isFH, E, toStr, classOf, sizeOf} = ML, H = ML._h, {mat, sc1, S, isVec, like} = H;
  const isStrV = v => v instanceof M && v.t === 'c';
  const EPS = 2.220446049250313e-16;
  const epsOf = x => { x = Math.abs(x); if (!(x > 0)) return Math.pow(2, -1074); return Math.pow(2, Math.floor(Math.log2(x)) - 52); };
  const opts = (a, from) => { const o = {}; for (let i = from; i + 1 < a.length; i += 2) if (isStrV(a[i])) o[S(a[i]).toLowerCase()] = a[i + 1]; return o; };
  const cellOf = (arr, col) => ({cell: true, r: col ? arr.length : 1, c: col ? 1 : arr.length, v: arr});
  const structOf = o => { const q = Object.create(null); for (const k in o) q[k] = o[k]; return {sa: true, r: 1, c: 1, v: [q]}; };
  // matris ↔ satır dizisi
  const rows = m => { const o = []; for (let i = 0; i < m.r; i++) { const r = new Float64Array(m.c); for (let j = 0; j < m.c; j++) r[j] = m.re[i + j * m.r]; o.push(r); } return o; };
  const fromRows = (R, nr, nc) => { nr = nr == null ? R.length : nr; nc = nc == null ? (R[0] ? R[0].length : 0) : nc; const o = zeros(nr, nc); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) o.re[i + j * nr] = R[i][j]; return o; };
  const realM = (m, fn) => { if (m.im && m.im.some(v => v !== 0)) E('MATLAB:unsupported', fn + ': karmaşık matris desteklenmiyor.'); return m; };
  const sq = (m, fn) => { if (m.r !== m.c) E('MATLAB:square', fn + ': matris kare olmalı.'); return m; };
  const eye = n => { const o = zeros(n, n); for (let i = 0; i < n; i++) o.re[i + i * n] = 1; return o; };
  const mm = (A, Bm) => ML.matmul(A, Bm), tr = A => ML.transpose(A, false);
  const cplxM = (re, im, r, c) => { const o = new M(r, c, Float64Array.from(re), null, 'd'); if (im && im.some(v => Math.abs(v) > 0)) o.im = Float64Array.from(im); return o; };

  /* ================= özdeğer ================= */
  // simetrik: Jacobi döndürmeleri (özdeğerler artan)
  function jacobiEig(A) {
    const n = A.length, a = A.map(r => Float64Array.from(r)), V = Array.from({length: n}, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j]; if (off < 1e-30) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue; const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const ord = Array.from({length: n}, (_, i) => i).sort((p, q) => a[p][p] - a[q][q]);
    return {w: ord.map(i => a[i][i]), V: V.map(r => ord.map(i => r[i]))};
  }
  // genel gerçek matris: Hessenberg indirgeme + çift kaydırmalı QR (Numerical Recipes elmhes / hqr)
  function hessenberg(a) {
    const n = a.length;
    for (let m = 1; m < n - 1; m++) {
      let x = 0, i = m; for (let j = m; j < n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
      if (i !== m) { for (let j = m - 1; j < n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; } for (let j = 0; j < n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; } }
      if (x) for (i = m + 1; i < n; i++) { let y = a[i][m - 1]; if (y !== 0) { y /= x; a[i][m - 1] = y; for (let j = m; j < n; j++) a[i][j] -= y * a[m][j]; for (let j = 0; j < n; j++) a[j][m] += y * a[j][i]; } }
    }
    for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i][j] = 0;
    return a;
  }
  function hqr(a) {
    const n = a.length, wr = new Array(n).fill(0), wi = new Array(n).fill(0), SIGN = (x, y) => y >= 0 ? Math.abs(x) : -Math.abs(x);
    let anorm = 0; for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i][j]);
    let nn = n - 1, t = 0, p = 0, q = 0, r = 0, s = 0, w = 0, x = 0, y = 0, z = 0, l, m;
    while (nn >= 0) {
      let its = 0;
      do {
        for (l = nn; l >= 1; l--) { s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]); if (s === 0) s = anorm; if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; } }
        x = a[nn][nn];
        if (l === nn) { wr[nn] = x + t; wi[nn] = 0; nn--; }
        else {
          y = a[nn - 1][nn - 1]; w = a[nn][nn - 1] * a[nn - 1][nn];
          if (l === nn - 1) {
            p = 0.5 * (y - x); q = p * p + w; z = Math.sqrt(Math.abs(q)); x += t;
            if (q >= 0) { z = p + SIGN(z, p); wr[nn - 1] = wr[nn] = x + z; if (z) wr[nn] = x - w / z; wi[nn - 1] = wi[nn] = 0; }
            else { wr[nn - 1] = wr[nn] = x + p; wi[nn - 1] = -(wi[nn] = z); }
            nn -= 2;
          } else {
            if (its === 60) E('MATLAB:eig:noConvergence', 'eig: QR yinelemesi yakınsamadı.');
            if (its === 10 || its === 20) { t += x; for (let i = 0; i <= nn; i++) a[i][i] -= x; s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]); y = x = 0.75 * s; w = -0.4375 * s * s; }
            ++its;
            for (m = nn - 2; m >= l; m--) {
              z = a[m][m]; r = x - z; s = y - z; p = (r * s - w) / a[m + 1][m] + a[m][m + 1]; q = a[m + 1][m + 1] - z - r - s; r = a[m + 2][m + 1];
              s = Math.abs(p) + Math.abs(q) + Math.abs(r); p /= s; q /= s; r /= s; if (m === l) break;
              const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r)), v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1])); if (u + v === v) break;
            }
            for (let i = m + 2; i <= nn; i++) { a[i][i - 2] = 0; if (i !== m + 2) a[i][i - 3] = 0; }
            for (let k = m; k <= nn - 1; k++) {
              if (k !== m) { p = a[k][k - 1]; q = a[k + 1][k - 1]; r = 0; if (k !== nn - 1) r = a[k + 2][k - 1]; if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; } }
              if ((s = SIGN(Math.sqrt(p * p + q * q + r * r), p)) !== 0) {
                if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; } else a[k][k - 1] = -s * x;
                p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
                for (let j = k; j <= nn; j++) { p = a[k][j] + q * a[k + 1][j]; if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; } a[k + 1][j] -= p * y; a[k][j] -= p * x; }
                const mmin = nn < k + 3 ? nn : k + 3;
                for (let i = l; i <= mmin; i++) { p = x * a[i][k] + y * a[i][k + 1]; if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; } a[i][k + 1] -= p * q; a[i][k] -= p; }
              }
            }
          }
        }
      } while (l < nn - 1);
    }
    return {wr, wi};
  }
  // karmaşık doğrusal sistem (kısmi pivotlu Gauss) — A: [re[][], im[][]], b: [re[], im[]]
  function csolve(Ar, Ai, br, bi) {
    const n = br.length; Ar = Ar.map(r => Float64Array.from(r)); Ai = Ai.map(r => Float64Array.from(r)); br = Float64Array.from(br); bi = Float64Array.from(bi);
    for (let c = 0; c < n; c++) {
      let p = c, best = -1; for (let r = c; r < n; r++) { const v = Math.hypot(Ar[r][c], Ai[r][c]); if (v > best) { best = v; p = r; } }
      if (p !== c) { [Ar[p], Ar[c]] = [Ar[c], Ar[p]]; [Ai[p], Ai[c]] = [Ai[c], Ai[p]]; [br[p], br[c]] = [br[c], br[p]]; [bi[p], bi[c]] = [bi[c], bi[p]]; }
      let dr = Ar[c][c], di = Ai[c][c]; if (dr === 0 && di === 0) { dr = 1e-300; Ar[c][c] = dr; }
      const d2 = dr * dr + di * di;
      for (let r = c + 1; r < n; r++) { const fr = (Ar[r][c] * dr + Ai[r][c] * di) / d2, fi = (Ai[r][c] * dr - Ar[r][c] * di) / d2; if (fr === 0 && fi === 0) continue;
        for (let k = c; k < n; k++) { Ar[r][k] -= fr * Ar[c][k] - fi * Ai[c][k]; Ai[r][k] -= fr * Ai[c][k] + fi * Ar[c][k]; } br[r] -= fr * br[c] - fi * bi[c]; bi[r] -= fr * bi[c] + fi * br[c]; }
    }
    const xr = new Float64Array(n), xi = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) { let sr = br[r], si = bi[r]; for (let k = r + 1; k < n; k++) { sr -= Ar[r][k] * xr[k] - Ai[r][k] * xi[k]; si -= Ar[r][k] * xi[k] + Ai[r][k] * xr[k]; } const dr = Ar[r][r], di = Ai[r][r], d2 = dr * dr + di * di || 1e-300; xr[r] = (sr * dr + si * di) / d2; xi[r] = (si * dr - sr * di) / d2; }
    return [xr, xi];
  }
  // ters yineleme ile özvektör (λ karmaşık olabilir); birim 2-normlu
  function eigvec(A, lr, li) {
    const n = A.length; let nrm = 0; for (const r of A) for (const v of r) nrm = Math.max(nrm, Math.abs(v)); const d = Math.max(nrm, 1) * 1e-10;
    const Ar = A.map((r, i) => Float64Array.from(r, (v, j) => i === j ? v - lr - d : v)), Ai = A.map((r, i) => Float64Array.from(r, (v, j) => i === j ? -li : 0));
    let xr = Float64Array.from({length: n}, (_, i) => 1 + 0.1 * i), xi = new Float64Array(n);
    for (let it = 0; it < 4; it++) { [xr, xi] = csolve(Ar, Ai, xr, xi); let s = 0; for (let i = 0; i < n; i++) s += xr[i] * xr[i] + xi[i] * xi[i]; s = Math.sqrt(s) || 1; for (let i = 0; i < n; i++) { xr[i] /= s; xi[i] /= s; } }
    // fazı sabitle: en büyük bileşen gerçek ve (gerçek özdeğerde) işaret MATLAB'a benzer biçimde
    let k = 0, best = -1; for (let i = 0; i < n; i++) { const v = Math.hypot(xr[i], xi[i]); if (v > best + 1e-12) { best = v; k = i; } }
    const ph = Math.atan2(xi[k], xr[k]), c = Math.cos(-ph), s = Math.sin(-ph); for (let i = 0; i < n; i++) { const a = xr[i] * c - xi[i] * s, b = xr[i] * s + xi[i] * c; xr[i] = a; xi[i] = b; }
    if (li === 0) xi.fill(0);
    return [xr, xi];
  }
  function eigGeneral(A) { const h = hessenberg(A.map(r => Array.from(r))); return hqr(h); }
  const isSym = m => { for (let i = 0; i < m.r; i++) for (let j = i + 1; j < m.c; j++) if (Math.abs(m.re[i + j * m.r] - m.re[j + i * m.r]) > 1e-12 * (Math.abs(m.re[i + j * m.r]) + 1)) return false; return true; };
  B.eig = function (a, no) {
    let A = sq(realM(mat(a[0]), 'eig'), 'eig'); const n = A.r;
    if (a[1] && !isStrV(a[1])) { const Bm = mat(a[1]); A = ML.solve(Bm, A); }
    if (!n) return no >= 2 ? [empty(), empty()] : empty();
    if (isSym(A) && !(a[1] && !isStrV(a[1]))) { const {w, V} = jacobiEig(rows(A)); if (no < 2) return colv(w); const D = zeros(n, n); w.forEach((v, i) => { D.re[i + i * n] = v; }); const Vm = fromRows(V); // MATLAB işareti: her sütunda ilk sıfır olmayan... (normalize) — LAPACK gibi son bileşeni pozitif yapmayız; yalnız birim norm
      return [Vm, D]; }
    const R = rows(A), {wr, wi} = eigGeneral(R);
    // eşlenik çiftleri (+ sanal önce) sırala: MATLAB/LAPACK gibi
    for (let i = 0; i + 1 < n; i++) if (wi[i] !== 0 && Math.abs(wr[i] - wr[i + 1]) < 1e-12 * (1 + Math.abs(wr[i])) && Math.abs(wi[i] + wi[i + 1]) < 1e-12 * (1 + Math.abs(wi[i])) && wi[i] < 0) { [wi[i], wi[i + 1]] = [wi[i + 1], wi[i]]; i++; }
    if (no < 2) return cplxM(wr, wi, n, 1);
    const Vr = zeros(n, n), Vi = new Float64Array(n * n); let anyIm = false;
    for (let j = 0; j < n; j++) { const [xr, xi] = eigvec(R, wr[j], wi[j]); for (let i = 0; i < n; i++) { Vr.re[i + j * n] = xr[i]; Vi[i + j * n] = xi[i]; if (xi[i]) anyIm = true; } }
    if (anyIm) Vr.im = Vi; const D = zeros(n, n); const Di = new Float64Array(n * n); let dIm = false; for (let i = 0; i < n; i++) { D.re[i + i * n] = wr[i]; Di[i + i * n] = wi[i]; if (wi[i]) dIm = true; } if (dIm) D.im = Di;
    return [Vr, D];
  };
  // roots: eşlik matrisinin özdeğerleri (MATLAB gibi) — çoklu köklerde de doğru
  B.roots = a => { const p = Array.from(mat(a[0]).re); while (p.length && p[0] === 0) p.shift(); let nz = 0; while (p.length > 1 && p[p.length - 1] === 0) { p.pop(); nz++; } const n = p.length - 1;
    if (n < 1) return nz ? colv(new Array(nz).fill(0)) : empty();
    const C = Array.from({length: n}, () => new Array(n).fill(0)); for (let j = 0; j < n; j++) C[0][j] = -p[j + 1] / p[0]; for (let i = 1; i < n; i++) C[i][i - 1] = 1;
    const {wr, wi} = hqr(C.map(r => r.slice())); for (let i = 0; i < nz; i++) { wr.push(0); wi.push(0); }
    return cplxM(wr, wi, wr.length, 1); };

  /* ================= SVD ve türevleri ================= */
  // tek taraflı Jacobi (Hestenes): A (m×n, m ≥ n) = U·diag(s)·Vᵀ — U m×n (ince)
  function svdThin(A, m, n) {
    const U = A.map(r => Float64Array.from(r)), V = Array.from({length: n}, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    for (let sweep = 0; sweep < 75; sweep++) {
      let rot = false;
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        let al = 0, be = 0, ga = 0; for (let i = 0; i < m; i++) { const up = U[i][p], uq = U[i][q]; al += up * up; be += uq * uq; ga += up * uq; }
        if (Math.abs(ga) <= 1e-15 * Math.sqrt(al * be) || ga === 0) continue; rot = true;
        const ze = (be - al) / (2 * ga), t = Math.sign(ze || 1) / (Math.abs(ze) + Math.sqrt(1 + ze * ze)), c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (let i = 0; i < m; i++) { const up = U[i][p], uq = U[i][q]; U[i][p] = c * up - s * uq; U[i][q] = s * up + c * uq; }
        for (let i = 0; i < n; i++) { const vp = V[i][p], vq = V[i][q]; V[i][p] = c * vp - s * vq; V[i][q] = s * vp + c * vq; }
      }
      if (!rot) break;
    }
    const s = new Array(n).fill(0); for (let j = 0; j < n; j++) { let t = 0; for (let i = 0; i < m; i++) t += U[i][j] * U[i][j]; s[j] = Math.sqrt(t); if (s[j] > 0) for (let i = 0; i < m; i++) U[i][j] /= s[j]; }
    const ord = s.map((_, i) => i).sort((p, q) => s[q] - s[p]);
    return {U: U.map(r => ord.map(j => r[j])), s: ord.map(j => s[j]), V: V.map(r => ord.map(j => r[j]))};
  }
  // sütunları birim dikgen tabana tamamla (sıfır sütunlar da değiştirilir)
  function completeBasis(Q, m, k, tol) {   // Q: m satır, k sütun (satır dizisi) → m×m
    const cols = []; for (let j = 0; j < k; j++) cols.push(Float64Array.from({length: m}, (_, i) => Q[i][j]));
    const out = [], ok = []; for (let j = 0; j < k; j++) { let n2 = 0; for (const v of cols[j]) n2 += v * v; ok.push(Math.sqrt(n2) > 0.5); }
    const basis = cols.filter((_, j) => ok[j]);
    const add = v => { for (const b of basis) { let d = 0; for (let i = 0; i < m; i++) d += b[i] * v[i]; for (let i = 0; i < m; i++) v[i] -= d * b[i]; } for (const b of basis) { let d = 0; for (let i = 0; i < m; i++) d += b[i] * v[i]; for (let i = 0; i < m; i++) v[i] -= d * b[i]; } let n2 = 0; for (const x of v) n2 += x * x; n2 = Math.sqrt(n2); if (n2 < 1e-8) return null; for (let i = 0; i < m; i++) v[i] /= n2; basis.push(v); return v; };
    let e = 0; const nextVec = () => { while (e < m) { const v = new Float64Array(m); v[e++] = 1; const r = add(v); if (r) return r; } return new Float64Array(m); };
    for (let j = 0; j < k; j++) out.push(ok[j] ? cols[j] : nextVec());
    while (out.length < m) out.push(nextVec());
    return Array.from({length: m}, (_, i) => out.map(c => c[i]));
  }
  function svdFull(Am) {   // {U m×m, s (min), V n×n} — satır dizileri
    const m = Am.r, n = Am.c;
    if (m >= n) { const r = svdThin(rows(Am), m, n); return {U: completeBasis(r.U, m, n), Uthin: r.U, s: r.s, V: r.V, m, n}; }
    const r = svdThin(rows(tr(Am)), n, m); return {U: r.V, Uthin: r.V, s: r.s, V: completeBasis(r.U, n, m), Vthin: r.U, m, n};
  }
  const tolOf = (s, m, n) => Math.max(m, n) * epsOf(s[0] || 0);
  B.svd = function (a, no) {
    const A = realM(mat(a[0]), 'svd'), m = A.r, n = A.c, econ = a.length > 1, k = Math.min(m, n); const f = svdFull(A);
    if (no < 2) return colv(f.s);
    if (econ) { const U = fromRows(f.U.map(r => r.slice(0, k)), m, k), Sg = zeros(k, k), V = fromRows(f.V.map(r => r.slice(0, k)), n, k); f.s.forEach((v, i) => { Sg.re[i + i * k] = v; }); return [U, Sg, V]; }
    const U = fromRows(f.U, m, m), Sg = zeros(m, n), V = fromRows(f.V, n, n); f.s.forEach((v, i) => { Sg.re[i + i * m] = v; }); return [U, Sg, V];
  };
  B.rank = a => { const A = mat(a[0]); if (!A.re.length) return num(0); const f = svdFull(A), tol = a[1] ? sc1(a[1]) : tolOf(f.s, A.r, A.c); return num(f.s.filter(v => v > tol).length); };
  B.cond = a => { const A = mat(a[0]); if (a[1] && sc1(a[1]) !== 2) { const n1 = q => B.norm([q, a[1]]).re[0]; return num(n1(A) * n1(B.inv([A]))); } const f = svdFull(A), mn = f.s[f.s.length - 1]; return num(mn === 0 ? Infinity : f.s[0] / mn); };
  B.pinv = a => { const A = mat(a[0]), m = A.r, n = A.c; if (!A.re.length) return zeros(n, m); const f = svdFull(A), tol = a[1] ? sc1(a[1]) : tolOf(f.s, m, n), o = zeros(n, m);
    for (let k = 0; k < f.s.length; k++) { if (!(f.s[k] > tol)) continue; const iv = 1 / f.s[k]; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) o.re[i + j * n] += f.V[i][k] * iv * f.U[j][k]; } return o; };
  B.null = a => { const A = mat(a[0]), n = A.c; const f = svdFull(A), tol = tolOf(f.s, A.r, A.c), r = f.s.filter(v => v > tol).length, cols = []; for (let k = r; k < n; k++) cols.push(k); const o = zeros(n, cols.length); cols.forEach((k, j) => { for (let i = 0; i < n; i++) o.re[i + j * n] = f.V[i][k]; }); return o; };
  B.orth = a => { const A = mat(a[0]), m = A.r; const f = svdFull(A), tol = tolOf(f.s, A.r, A.c), r = f.s.filter(v => v > tol).length, o = zeros(m, r); for (let k = 0; k < r; k++) for (let i = 0; i < m; i++) o.re[i + k * m] = f.U[i][k]; return o; };

  const origNorm = B.norm; B.norm = function (a, no) { const m = a[0]; if (m instanceof M && !isVec(m) && m.re.length) { const p = a[1] ? (isStrV(a[1]) ? S(a[1]) : sc1(a[1])) : 2;
      if (p === 2) { let X = m; if (m.im && m.im.some(v => v)) { const r = m.r, c = m.c; X = zeros(2 * r, 2 * c); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { const re = m.re[i + j * r], im = m.im[i + j * r]; X.re[i + j * 2 * r] = re; X.re[i + r + (j + c) * 2 * r] = re; X.re[i + r + j * 2 * r] = im; X.re[i + (j + c) * 2 * r] = -im; } } return num(svdFull(X).s[0] || 0); } if (p === 1) { let b = 0; for (let j = 0; j < m.c; j++) { let s = 0; for (let i = 0; i < m.r; i++) s += Math.abs(m.re[i + j * m.r]); b = Math.max(b, s); } return num(b); }
      if (p === Infinity || p === 'inf' || p === 'Inf') { let b = 0; for (let i = 0; i < m.r; i++) { let s = 0; for (let j = 0; j < m.c; j++) s += Math.abs(m.re[i + j * m.r]); b = Math.max(b, s); } return num(b); } }
    return origNorm.call(this, a, no); };
  const origMagic = B.magic; B.magic = function (a, no) { const n = Math.floor(sc1(a[0])); if (n % 2 === 1 || n < 4) return n === 2 ? fromRows([[4, 3], [1, 2]]) : origMagic.call(this, a, no); const o = zeros(n, n), at = (i, j) => i + j * n;
    if (n % 4 === 0) { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = i * n + j + 1, keep = ((i % 4) % 3 === 0) === ((j % 4) % 3 === 0); o.re[at(i, j)] = keep ? n * n + 1 - v : v; } return o; }
    // tekil çift (n = 4k+2): LUX / MATLAB yöntemi
    const p = n / 2, A = origMagic.call(this, [num(p)], 1); const k = (n - 2) / 4;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) { const v = A.re[i + j * p]; o.re[at(i, j)] = v; o.re[at(i + p, j + p)] = v + p * p; o.re[at(i, j + p)] = v + 2 * p * p; o.re[at(i + p, j)] = v + 3 * p * p; }
    const swap = (i, j) => { const t = o.re[at(i, j)]; o.re[at(i, j)] = o.re[at(i + p, j)]; o.re[at(i + p, j)] = t; };
    for (let i = 0; i < p; i++) { const cols = []; for (let j = 0; j < k; j++) cols.push(j); for (let j = n - k + 1; j < n; j++) cols.push(j); for (const j of cols) swap(i, j); }
    swap(k, 0); swap(k, k);   // orta satır düzeltmesi
    return o; };

  /* ================= LU / QR / Cholesky / expm ================= */
  B.lu = function (a, no) {
    const A = realM(mat(a[0]), 'lu'), m = A.r, n = A.c, k = Math.min(m, n), R = rows(A), perm = Array.from({length: m}, (_, i) => i);
    for (let c = 0; c < k; c++) { let p = c, best = Math.abs(R[c][c]); for (let r = c + 1; r < m; r++) if (Math.abs(R[r][c]) > best) { best = Math.abs(R[r][c]); p = r; }
      if (p !== c) { [R[p], R[c]] = [R[c], R[p]]; [perm[p], perm[c]] = [perm[c], perm[p]]; }
      if (R[c][c] === 0) continue; for (let r = c + 1; r < m; r++) { const f = R[r][c] / R[c][c]; R[r][c] = f; if (f) for (let j = c + 1; j < n; j++) R[r][j] -= f * R[c][j]; } }
    const L = zeros(m, k), U = zeros(k, n); for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) L.re[i + j * m] = i === j ? 1 : i > j ? R[i][j] : 0; for (let i = 0; i < k; i++) for (let j = i; j < n; j++) U.re[i + j * k] = R[i][j];
    const P = zeros(m, m); perm.forEach((pi, i) => { P.re[i + pi * m] = 1; });
    if (no <= 1) { const Y = zeros(m, n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) Y.re[i + j * m] = i > j ? (j < k ? R[i][j] : 0) : R[i][j]; return Y; }
    if (no === 2) return [mm(tr(P), L), U];
    if (a[1] && isStrV(a[1]) && S(a[1]) === 'vector') return [L, U, rowv(perm.map(v => v + 1))];
    return [L, U, P];
  };
  function householderQR(A) {   // A satır dizisi m×n → {Q m×m, R m×n}
    const m = A.length, n = A[0] ? A[0].length : 0, R = A.map(r => Float64Array.from(r)), Q = Array.from({length: m}, (_, i) => { const r = new Float64Array(m); r[i] = 1; return r; });
    for (let c = 0; c < Math.min(m - 1, n); c++) {
      let nx = 0; for (let i = c; i < m; i++) nx += R[i][c] * R[i][c]; nx = Math.sqrt(nx); if (nx === 0) continue;
      const al = R[c][c] >= 0 ? -nx : nx, v = new Float64Array(m); for (let i = c; i < m; i++) v[i] = R[i][c]; v[c] -= al; let vn = 0; for (let i = c; i < m; i++) vn += v[i] * v[i]; if (vn === 0) continue;
      for (let j = 0; j < n; j++) { let d = 0; for (let i = c; i < m; i++) d += v[i] * R[i][j]; d = 2 * d / vn; for (let i = c; i < m; i++) R[i][j] -= d * v[i]; }
      for (let i = 0; i < m; i++) { let d = 0; for (let k = c; k < m; k++) d += Q[i][k] * v[k]; d = 2 * d / vn; for (let k = c; k < m; k++) Q[i][k] -= d * v[k]; }
      for (let i = c + 1; i < m; i++) R[i][c] = 0;
    }
    return {Q, R};
  }
  B.qr = function (a, no) {
    const A = realM(mat(a[0]), 'qr'), m = A.r, n = A.c, econ = a.length > 1, {Q, R} = householderQR(rows(A));
    if (no < 2) return fromRows(R, m, n);
    if (econ && m > n) return [fromRows(Q.map(r => r.slice(0, n)), m, n), fromRows(R.slice(0, n), n, n)];
    return [fromRows(Q, m, m), fromRows(R, m, n)];
  };
  B.chol = function (a, no) {
    const A = sq(realM(mat(a[0]), 'chol'), 'chol'), n = A.r, lower = a[1] && S(a[1]).toLowerCase() === 'lower', R = Array.from({length: n}, () => new Float64Array(n)); let fail = 0;
    for (let j = 0; j < n && !fail; j++) { let s = A.re[j + j * n]; for (let k = 0; k < j; k++) s -= R[k][j] * R[k][j]; if (!(s > 0)) { fail = j + 1; break; } R[j][j] = Math.sqrt(s);
      for (let i = j + 1; i < n; i++) { let t = A.re[j + i * n]; for (let k = 0; k < j; k++) t -= R[k][j] * R[k][i]; R[j][i] = t / R[j][j]; } }
    if (fail && no < 2) E('MATLAB:posdef', 'chol: matris pozitif tanımlı olmalı.');
    const q = fail ? fail - 1 : n; let o = fromRows(R.slice(0, q).map(r => r.slice(0, q)), q, q); if (lower) o = tr(o);
    return no >= 2 ? [o, num(fail)] : o;
  };
  // expm: ölçekle-kare al + Padé (6, 6)
  B.expm = a => { const A = sq(realM(mat(a[0]), 'expm'), 'expm'), n = A.r; let nrm = 0; for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += Math.abs(A.re[i + j * n]); nrm = Math.max(nrm, s); }
    const sP = Math.max(0, Math.ceil(Math.log2(nrm / 0.5))), X = like(A, Float64Array.from(A.re, v => v / Math.pow(2, sP))); X.r = n; X.c = n;
    const q = 6; let c = 1, Xk = eye(n), Nn = eye(n), Dd = eye(n);
    for (let k = 1; k <= q; k++) { c = c * (q - k + 1) / (k * (2 * q - k + 1)); Xk = mm(Xk, X); for (let i = 0; i < n * n; i++) { Nn.re[i] += c * Xk.re[i]; Dd.re[i] += (k % 2 ? -c : c) * Xk.re[i]; } }
    let F = ML.solve(Dd, Nn); for (let k = 0; k < sP; k++) F = mm(F, F); return F; };
  B.toeplitz = a => { const c = Array.from(mat(a[0]).re), r = a[1] ? Array.from(mat(a[1]).re) : c.slice(); const o = zeros(c.length, r.length); for (let i = 0; i < c.length; i++) for (let j = 0; j < r.length; j++) o.re[i + j * c.length] = i >= j ? c[i - j] : r[j - i]; return o; };
  B.hankel = a => { const c = Array.from(mat(a[0]).re), r = a[1] ? Array.from(mat(a[1]).re) : new Array(c.length).fill(0); const m = c.length, n = r.length, o = zeros(m, n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { const k = i + j; o.re[i + j * m] = k < m ? c[k] : r[k - m + 1]; } return o; };
  B.vander = a => { const v = Array.from(mat(a[0]).re), n = v.length, o = zeros(n, n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) o.re[i + j * n] = Math.pow(v[i], n - 1 - j); return o; };

  /* ================= polinomlar ================= */
  const pmul = (p, q) => { const o = new Array(p.length + q.length - 1).fill(0); for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) o[i + j] += p[i] * q[j]; return o; };
  const pder = p => p.length <= 1 ? [0] : p.slice(0, -1).map((c, i) => c * (p.length - 1 - i));
  const padd = (p, q) => { const n = Math.max(p.length, q.length), o = new Array(n).fill(0); p.forEach((c, i) => { o[n - p.length + i] += c; }); q.forEach((c, i) => { o[n - q.length + i] += c; }); return o; };
  const ptrim = p => { let i = 0; while (i < p.length - 1 && p[i] === 0) i++; return p.slice(i); };
  B.polyder = function (a, no) { const p = Array.from(mat(a[0]).re);
    if (a.length === 1) return rowv(ptrim(pder(p)));
    const q = Array.from(mat(a[1]).re);
    if (no >= 2) { const nu = padd(pmul(pder(p), q), pmul(p, pder(q)).map(v => -v)); return [rowv(ptrim(nu)), rowv(ptrim(pmul(q, q)))]; }
    return rowv(ptrim(pder(pmul(p, q)))); };
  B.polyint = a => { const p = Array.from(mat(a[0]).re), k = a[1] ? sc1(a[1]) : 0; return rowv([...p.map((c, i) => c / (p.length - i)), k]); };
  // kısmi kesirler: b(s)/a(s) = Σ r/(s−p)^j + k(s)
  B.residue = function (a, no) {
    const b = ptrim(Array.from(mat(a[0]).re)), den = ptrim(Array.from(mat(a[1]).re)); if (a.length > 2) E('MATLAB:unsupported', 'residue: yalnız [r,p,k] = residue(b,a) biçimi desteklenir.');
    let k = [], rem = b.slice(); if (b.length >= den.length) { const [q, r] = B.deconv([rowv(b), rowv(den)]); k = Array.from(q.re); rem = Array.from(r.re); }
    rem = rem.slice(Math.max(0, rem.length - (den.length - 1)));
    const pr = B.roots([rowv(den)]), N = den.length - 1; const P = Array.from(pr.re, (v, i) => [v, pr.im ? pr.im[i] : 0]);
    // çoklu kutupları grupla (MATLAB mpoles: göreli tolerans 1e-3), büyükten küçüğe büyüklük
    P.sort((x, y) => Math.hypot(y[0], y[1]) - Math.hypot(x[0], x[1]) || y[1] - x[1]);
    const groups = []; for (const p of P) { const g = groups.find(g => Math.hypot(g.p[0] - p[0], g.p[1] - p[1]) <= 1e-3 * Math.max(1, Math.hypot(p[0], p[1]))); if (g) { g.m++; g.s[0] += p[0]; g.s[1] += p[1]; g.p = [g.s[0] / g.m, g.s[1] / g.m]; } else groups.push({p: p.slice(), m: 1, s: p.slice()}); }
    const cpoly = rts => { let pr_ = [[1, 0]]; for (const [rr, ri] of rts) { const q = Array.from({length: pr_.length + 1}, () => [0, 0]); for (let i = 0; i < pr_.length; i++) { q[i][0] += pr_[i][0]; q[i][1] += pr_[i][1]; q[i + 1][0] -= pr_[i][0] * rr - pr_[i][1] * ri; q[i + 1][1] -= pr_[i][0] * ri + pr_[i][1] * rr; } pr_ = q; } return pr_; };
    const cols = [], labels = []; groups.forEach((g, gi) => { for (let j = 1; j <= g.m; j++) { const rts = []; groups.forEach((h, hi) => { const mult = hi === gi ? h.m - j : h.m; for (let t = 0; t < mult; t++) rts.push(h.p); }); const pc = cpoly(rts).map(c => [c[0] * den[0], c[1] * den[0]]); while (pc.length < N) pc.unshift([0, 0]); cols.push(pc); labels.push(g.p); } });
    const Ar = [], Ai = []; for (let i = 0; i < N; i++) { Ar.push(cols.map(c => c[i][0])); Ai.push(cols.map(c => c[i][1])); } const br = Array.from({length: N}, (_, i) => rem[i - (N - rem.length)] || 0);
    const [xr, xi] = N ? csolve(Ar, Ai, br, new Array(N).fill(0)) : [[], []];
    const r = cplxM(Array.from(xr, v => Math.abs(v) < 1e-13 ? 0 : v), Array.from(xi, v => Math.abs(v) < 1e-13 ? 0 : v), N, 1), p = cplxM(labels.map(q => q[0]), labels.map(q => q[1]), N, 1);
    const kk = k.length ? rowv(k) : zeros(0, 0); return no >= 2 ? [r, p, kk] : r;
  };
  // parçalı polinom (pp)
  const ppMake = (breaks, coefs, order) => structOf({form: str('pp'), breaks: rowv(breaks), coefs: fromRows(coefs, coefs.length, order), pieces: num(breaks.length - 1), order: num(order), dim: num(1)});
  B.mkpp = a => { const br = Array.from(mat(a[0]).re), C = mat(a[1]), L = br.length - 1; let cr = rows(C); if (C.r !== L) { const order = C.re.length / L; cr = Array.from({length: L}, (_, i) => Array.from({length: order}, (_, j) => C.re[i + j * L])); } return ppMake(br, cr, cr[0].length); };
  B.unmkpp = function (a, no) { const pp = a[0].v[0]; return [pp.breaks, pp.coefs, pp.pieces, pp.order, pp.dim].slice(0, Math.max(1, no)); };
  function ppEval(pp, xq) { const br = pp.breaks.re, C = pp.coefs, L = br.length - 1, k = C.c; return Float64Array.from(xq, x => { if (x !== x) return NaN; let i = 0, hi = L - 1; if (x >= br[L - 1]) i = L - 1; else if (x > br[0]) { let lo = 0; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (br[md] <= x) lo = md; else hi = md; } i = br[hi] <= x ? hi : lo; } const t = x - br[i]; let s = 0; for (let j = 0; j < k; j++) s = s * t + C.re[i + j * L]; return s; }); }
  B.ppval = a => { let pp = a[0], xq = mat(a[1]); if (!isSA(pp)) { pp = a[1]; xq = mat(a[0]); } return like(xq, ppEval(pp.v[0], xq.re)); };
  const hermitePP = (xs, ys, s) => { const coefs = []; for (let i = 0; i + 1 < xs.length; i++) { const h = xs[i + 1] - xs[i], dy = (ys[i + 1] - ys[i]) / h; coefs.push([(s[i] + s[i + 1] - 2 * dy) / (h * h), (3 * dy - 2 * s[i] - s[i + 1]) / h, s[i], ys[i]]); } return ppMake(xs, coefs, 4); };
  for (const nm of ['spline', 'pchip']) { const orig = B[nm]; B[nm] = function (a, no) { if (a.length === 2) { const x = mat(a[0]), y = mat(a[1]); const [xs, ys] = H.sortXY(Array.from(x.re), Array.from(y.re)); const s = nm === 'pchip' ? H.pchipSlopes(xs, ys) : H.splineCoef(xs, ys).s; return hermitePP(xs, ys, s); } return orig.call(this, a, no); }; }

  /* ================= 2B ara değer ================= */
  function gridAxes(X, Y, V) {   // meshgrid matrisleri ya da vektörler → x (sütunlar), y (satırlar)
    let x = X, y = Y; if (!isVec(X) && X.r === V.r && X.c === V.c) x = rowv(Array.from({length: V.c}, (_, j) => X.re[j * X.r])); if (!isVec(Y) && Y.r === V.r && Y.c === V.c) y = colv(Array.from({length: V.r}, (_, i) => Y.re[i]));
    if (x.re.length !== V.c || y.re.length !== V.r) E('MATLAB:interp2:sizes', 'interp2: X uzunluğu V sütun, Y uzunluğu V satır sayısına eşit olmalı.'); return [Array.from(x.re), Array.from(y.re)]; }
  const bracket = (xs, v) => { const n = xs.length; if (!(v >= xs[0] && v <= xs[n - 1])) return -1; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m; else hi = m; } return Math.min(lo, n - 2); };
  B.interp2 = a => {
    let i = 0; const nums = []; while (i < a.length && !isStrV(a[i])) nums.push(mat(a[i++])); const meth = i < a.length ? S(a[i++]).toLowerCase() : 'linear', ext = i < a.length ? sc1(a[i]) : NaN;
    let x, y, V, Xq, Yq; if (nums.length === 5) { V = nums[2]; [x, y] = gridAxes(nums[0], nums[1], V); Xq = nums[3]; Yq = nums[4]; } else if (nums.length === 3) { V = nums[0]; x = Array.from({length: V.c}, (_, j) => j + 1); y = Array.from({length: V.r}, (_, j) => j + 1); Xq = nums[1]; Yq = nums[2]; } else E('MATLAB:interp2:args', 'interp2(X,Y,V,Xq,Yq) ya da interp2(V,Xq,Yq) biçimi kullanılmalı.');
    if (isVec(Xq) && isVec(Yq) && Xq.re.length !== Yq.re.length || (isVec(Xq) && isVec(Yq) && Xq.r === 1 && Yq.c === 1 && Xq.re.length > 1 && Yq.re.length > 1)) { const g = B.meshgrid([Xq, Yq], 2); Xq = g[0]; Yq = g[1]; }
    const nr = V.r, Vv = (r, c) => V.re[r + c * nr];
    let rowS = null; if (meth === 'spline' || meth === 'cubic' || meth === 'makima') rowS = Array.from({length: nr}, (_, r) => H.splineCoef(x, x.map((_, c) => Vv(r, c))).s);
    const out = Float64Array.from(Xq.re, (xv, k) => { const yv = Yq.re[k], ix = bracket(x, xv), iy = bracket(y, yv); if (ix < 0 || iy < 0) return ext;
      if (meth === 'nearest') { const c = xv - x[ix] <= x[ix + 1] - xv ? ix : ix + 1, r = yv - y[iy] <= y[iy + 1] - yv ? iy : iy + 1; return Vv(r, c); }
      if (rowS) { const col = Array.from({length: nr}, (_, r) => H.hermiteEval(x, x.map((_, c) => Vv(r, c)), rowS[r], xv)); return H.hermiteEval(y, col, H.splineCoef(y, col).s, yv); }
      const tx = (xv - x[ix]) / (x[ix + 1] - x[ix]), ty = (yv - y[iy]) / (y[iy + 1] - y[iy]);
      return (1 - tx) * (1 - ty) * Vv(iy, ix) + tx * (1 - ty) * Vv(iy, ix + 1) + (1 - tx) * ty * Vv(iy + 1, ix) + tx * ty * Vv(iy + 1, ix + 1); });
    return like(Xq, out);
  };
  // Delaunay üçgenleme (Bowyer–Watson)
  function delaunay(px, py) {
    const n = px.length; let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity; for (let i = 0; i < n; i++) { mnx = Math.min(mnx, px[i]); mxx = Math.max(mxx, px[i]); mny = Math.min(mny, py[i]); mxy = Math.max(mxy, py[i]); }
    const d = Math.max(mxx - mnx, mxy - mny) || 1, cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, X = Array.from(px).concat([cx - 20 * d, cx, cx + 20 * d]), Y = Array.from(py).concat([cy - d, cy + 20 * d, cy - d]);
    const circ = (a, b, c) => { const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx_ = X[c], cy_ = Y[c], D = 2 * (ax * (by - cy_) + bx * (cy_ - ay) + cx_ * (ay - by)); if (Math.abs(D) < 1e-300) return {x: 0, y: 0, r2: Infinity}; const ux = ((ax * ax + ay * ay) * (by - cy_) + (bx * bx + by * by) * (cy_ - ay) + (cx_ * cx_ + cy_ * cy_) * (ay - by)) / D, uy = ((ax * ax + ay * ay) * (cx_ - bx) + (bx * bx + by * by) * (ax - cx_) + (cx_ * cx_ + cy_ * cy_) * (bx - ax)) / D; return {x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2}; };
    let T = [[n, n + 1, n + 2]]; T[0].c = circ(n, n + 1, n + 2);
    for (let i = 0; i < n; i++) {
      const bad = [], keep = []; for (const t of T) ((X[i] - t.c.x) ** 2 + (Y[i] - t.c.y) ** 2 <= t.c.r2 * (1 + 1e-12) ? bad : keep).push(t);
      const edges = new Map(); for (const t of bad) for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = p < q ? p + ',' + q : q + ',' + p; edges.set(k, edges.has(k) ? null : [p, q]); }
      T = keep; for (const e of edges.values()) if (e) { const t = [e[0], e[1], i]; t.c = circ(t[0], t[1], t[2]); T.push(t); }
    }
    return T.filter(t => t[0] < n && t[1] < n && t[2] < n);
  }
  B.delaunay = a => { const T = delaunay(mat(a[0]).re, mat(a[1]).re); return fromRows(T.map(t => t.map(v => v + 1)), T.length, 3); };
  B.griddata = function (a) {
    const x = mat(a[0]).re, y = mat(a[1]).re, v = mat(a[2]).re; let Xq = mat(a[3]), Yq = mat(a[4]); const meth = a[5] ? S(a[5]).toLowerCase() : 'linear';
    if (isVec(Xq) && isVec(Yq) && Xq.r === 1 && Yq.c === 1 && Xq.re.length > 1 && Yq.re.length > 1) { const g = B.meshgrid([Xq, Yq], 2); Xq = g[0]; Yq = g[1]; }
    if (meth === 'v4') { // biharmonik eğri (Sandwell): Green işlevleri
      const n = x.length, G = zeros(n, n), g = r2 => r2 > 0 ? r2 * (0.5 * Math.log(r2) - 1) : 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G.re[i + j * n] = g((x[i] - x[j]) ** 2 + (y[i] - y[j]) ** 2); const w = ML.solve(G, colv(Array.from(v))).re;
      return like(Xq, Float64Array.from(Xq.re, (xv, k) => { let s = 0; for (let j = 0; j < n; j++) s += w[j] * g((xv - x[j]) ** 2 + (Yq.re[k] - y[j]) ** 2); return s; })); }
    const T = delaunay(x, y);
    const out = Float64Array.from(Xq.re, (xv, k) => { const yv = Yq.re[k];
      for (const t of T) { const [i, j, l] = t, d = (y[j] - y[l]) * (x[i] - x[l]) + (x[l] - x[j]) * (y[i] - y[l]); if (!d) continue; const l1 = ((y[j] - y[l]) * (xv - x[l]) + (x[l] - x[j]) * (yv - y[l])) / d, l2 = ((y[l] - y[i]) * (xv - x[l]) + (x[i] - x[l]) * (yv - y[l])) / d, l3 = 1 - l1 - l2, tol = -1e-12;
        if (l1 >= tol && l2 >= tol && l3 >= tol) { if (meth === 'nearest') { let bi = i, bd = Infinity; for (const q of [i, j, l]) { const dd = (x[q] - xv) ** 2 + (y[q] - yv) ** 2; if (dd < bd) { bd = dd; bi = q; } } return v[bi]; } return l1 * v[i] + l2 * v[j] + l3 * v[l]; } }
      return NaN; });
    return like(Xq, out);
  };

  /* ================= optimizasyon ================= */
  const optGet = (o, k, d) => { if (!o || !isSA(o)) return d; const v = o.v[0][k] || o.v[0][Object.keys(o.v[0]).find(q => q.toLowerCase() === k.toLowerCase())]; return v instanceof M && v.re.length ? v.re[0] : d; };
  B.optimset = a => { const o = Object.create(null); let i = 0; if (a.length && isSA(a[0])) { Object.assign(o, a[0].v[0]); i = 1; } for (; i + 1 < a.length; i += 2) o[S(a[i])] = a[i + 1]; return {sa: true, r: 1, c: 1, v: [o]}; };
  B.optimoptions = a => B.optimset(a.slice(isStrV(a[0]) && a.length % 2 === 1 ? 1 : 0));
  const callNum = (it, f, x) => { let r = it.callFunctionValue(f, [x], 1); if (Array.isArray(r)) r = r[0]; return r; };
  // fminbnd: altın oran + parabolik ara değer (Brent; MATLAB ile aynı yöntem)
  B.fminbnd = function (a, no) {
    const f = a[0], ax = sc1(a[1]), bx = sc1(a[2]), tolX = optGet(a[3], 'TolX', 1e-4), maxIt = optGet(a[3], 'MaxIter', 500), F = x => callNum(this, f, num(x)).re[0];
    const c = 0.5 * (3 - Math.sqrt(5)); let A = ax, Bv = bx, v = A + c * (Bv - A), w = v, x = v, e = 0, d = 0, fx = F(x), fv = fx, fw = fx, it = 0, flag = 1;
    for (; it < maxIt; it++) { const xm = 0.5 * (A + Bv), tol1 = EPS ** 0.5 * Math.abs(x) + tolX / 3, tol2 = 2 * tol1; if (Math.abs(x - xm) <= tol2 - 0.5 * (Bv - A)) break;
      let gs = true; if (Math.abs(e) > tol1) { let r = (x - w) * (fx - fv), q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r; q = 2 * (q - r); if (q > 0) p = -p; q = Math.abs(q); const r0 = e; e = d; if (Math.abs(p) < Math.abs(0.5 * q * r0) && p > q * (A - x) && p < q * (Bv - x)) { d = p / q; const u = x + d; if (u - A < tol2 || Bv - u < tol2) d = xm >= x ? tol1 : -tol1; gs = false; } }
      if (gs) { e = x >= xm ? A - x : Bv - x; d = c * e; }
      const u = x + (Math.abs(d) >= tol1 ? d : d >= 0 ? tol1 : -tol1), fu = F(u);
      if (fu <= fx) { if (u >= x) A = x; else Bv = x; v = w; fv = fw; w = x; fw = fx; x = u; fx = fu; } else { if (u < x) A = u; else Bv = u; if (fu <= fw || w === x) { v = w; fv = fw; w = u; fw = fu; } else if (fu <= fv || v === x || v === w) { v = u; fv = fu; } } }
    if (it >= maxIt) flag = 0;
    return [num(x), num(fx), num(flag), structOf({iterations: num(it), funcCount: num(it + 1), algorithm: str('golden section search, parabolic interpolation')})].slice(0, Math.max(1, no));
  };
  // fminsearch: Nelder–Mead (Lagarias et al.; MATLAB varsayılanları)
  B.fminsearch = function (a, no) {
    const f = a[0], x0 = mat(a[1]), n = x0.re.length, tolX = optGet(a[2], 'TolX', 1e-4), tolF = optGet(a[2], 'TolFun', 1e-4), maxIt = optGet(a[2], 'MaxIter', 200 * n), maxF = optGet(a[2], 'MaxFunEvals', 200 * n);
    let fc = 0; const F = v => { fc++; return callNum(this, f, like(x0, Float64Array.from(v))).re[0]; };
    let S_ = [Array.from(x0.re)]; for (let i = 0; i < n; i++) { const y = Array.from(x0.re); y[i] = y[i] !== 0 ? 1.05 * y[i] : 0.00025; S_.push(y); }
    let fv = S_.map(F), it = 0;
    const sortS = () => { const o = fv.map((_, i) => i).sort((p, q) => fv[p] - fv[q]); S_ = o.map(i => S_[i]); fv = o.map(i => fv[i]); }; sortS();
    while (it < maxIt && fc < maxF) {
      let dx = 0, df = 0; for (let i = 1; i <= n; i++) { df = Math.max(df, Math.abs(fv[i] - fv[0])); for (let j = 0; j < n; j++) dx = Math.max(dx, Math.abs(S_[i][j] - S_[0][j])); } if (dx <= tolX && df <= tolF) break;
      it++; const xb = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) xb[j] += S_[i][j] / n;
      const pt = t => xb.map((v, j) => v + t * (S_[n][j] - v)); const xr = pt(-1), fr = F(xr);
      if (fr < fv[0]) { const xe = pt(-2), fe = F(xe); if (fe < fr) { S_[n] = xe; fv[n] = fe; } else { S_[n] = xr; fv[n] = fr; } }
      else if (fr < fv[n - 1]) { S_[n] = xr; fv[n] = fr; }
      else { let shrink = false; if (fr < fv[n]) { const xc = pt(-0.5), fcv = F(xc); if (fcv <= fr) { S_[n] = xc; fv[n] = fcv; } else shrink = true; } else { const xcc = pt(0.5), fcc = F(xcc); if (fcc < fv[n]) { S_[n] = xcc; fv[n] = fcc; } else shrink = true; }
        if (shrink) for (let i = 1; i <= n; i++) { S_[i] = S_[i].map((v, j) => S_[0][j] + 0.5 * (v - S_[0][j])); fv[i] = F(S_[i]); } }
      sortS();
    }
    return [like(x0, Float64Array.from(S_[0])), num(fv[0]), num(it < maxIt && fc < maxF ? 1 : 0), structOf({iterations: num(it), funcCount: num(fc), algorithm: str('Nelder-Mead simplex direct search')})].slice(0, Math.max(1, no));
  };
  // lsqnonneg: Lawson–Hanson
  B.lsqnonneg = function (a, no) {
    const C = mat(a[0]), d = mat(a[1]), m = C.r, n = C.c, tol = 10 * EPS * B.norm([C, num(1)]).re[0] * Math.max(m, n); const x = new Float64Array(n), P = new Uint8Array(n);
    const resid = xx => { const r = Float64Array.from(d.re); for (let j = 0; j < n; j++) if (xx[j]) for (let i = 0; i < m; i++) r[i] -= C.re[i + j * m] * xx[j]; return r; };
    const lsqP = () => { const idx = []; P.forEach((v, j) => { if (v) idx.push(j); }); const Cp = zeros(m, idx.length); idx.forEach((j, k) => { for (let i = 0; i < m; i++) Cp.re[i + k * m] = C.re[i + j * m]; }); const z = ML.lsq(Cp, colv(Array.from(d.re))).re, o = new Float64Array(n); idx.forEach((j, k) => { o[j] = z[k]; }); return o; };
    let it = 0, w; for (; it < 3 * n + 10; it++) { const r = resid(x); w = Float64Array.from({length: n}, (_, j) => { let s = 0; for (let i = 0; i < m; i++) s += C.re[i + j * m] * r[i]; return s; });
      let t = -1, bw = tol; for (let j = 0; j < n; j++) if (!P[j] && w[j] > bw) { bw = w[j]; t = j; } if (t < 0) break; P[t] = 1;
      for (let inner = 0; inner < 3 * n + 10; inner++) { const z = lsqP(); let ok = true; for (let j = 0; j < n; j++) if (P[j] && z[j] <= 0) ok = false; if (ok) { x.set(z); break; }
        let al = Infinity; for (let j = 0; j < n; j++) if (P[j] && z[j] <= 0) al = Math.min(al, x[j] / (x[j] - z[j])); for (let j = 0; j < n; j++) x[j] += al * (z[j] - x[j]); for (let j = 0; j < n; j++) if (P[j] && Math.abs(x[j]) < tol) { P[j] = 0; x[j] = 0; } } }
    const r = resid(x); let rn = 0; for (const v of r) rn += v * v;
    return [colv(Array.from(x)), num(rn), colv(Array.from(r)), num(1), structOf({iterations: num(it)}), colv(Array.from(w || []))].slice(0, Math.max(1, no));
  };
  // Levenberg–Marquardt (sınırlar izdüşümle)
  function levmar(fun, p0, lb, ub, maxIt) {
    let p = Float64Array.from(p0); const clamp = q => { for (let i = 0; i < q.length; i++) { if (lb && lb[i] === lb[i] && q[i] < lb[i]) q[i] = lb[i]; if (ub && ub[i] === ub[i] && q[i] > ub[i]) q[i] = ub[i]; } return q; }; clamp(p);
    let r = fun(p), cost = r.reduce((s, v) => s + v * v, 0), lam = 1e-3, it = 0, flag = 1; const n = p.length, m = r.length;
    for (; it < (maxIt || 400); it++) {
      const J = []; for (let j = 0; j < n; j++) { const h = 1e-7 * Math.max(1, Math.abs(p[j])), q = Float64Array.from(p); q[j] += h; const rq = fun(q); J.push(Float64Array.from(rq, (v, i) => (v - r[i]) / h)); }
      const A = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, k) => { let s = 0; for (let t = 0; t < m; t++) s += J[i][t] * J[k][t]; return s; })), g = Array.from({length: n}, (_, i) => { let s = 0; for (let t = 0; t < m; t++) s += J[i][t] * r[t]; return s; });
      let improved = false;
      for (let tries = 0; tries < 30; tries++) { const Am = zeros(n, n); for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) Am.re[i + k * n] = A[i][k] + (i === k ? lam * (A[i][i] || 1) : 0); let dp; try { dp = ML.solve(Am, colv(g.map(v => -v))).re; } catch (e) { lam *= 10; continue; }
        const q = clamp(Float64Array.from(p, (v, i) => v + dp[i])), rq = fun(q), cq = rq.reduce((s, v) => s + v * v, 0);
        if (cq === cq && cq < cost) { const rel = (cost - cq) / Math.max(cost, 1e-300); const step = Math.max(...Array.from(dp, (v, i) => Math.abs(v) / Math.max(1, Math.abs(p[i])))); p = q; r = rq; cost = cq; lam = Math.max(lam / 10, 1e-12); improved = true; if (rel < 1e-12 || step < 1e-10) it = maxIt || 400; break; }
        lam *= 10; }
      if (!improved) break;
    }
    return {p, r, cost, flag};
  }
  B.lsqcurvefit = function (a, no) {
    const f = a[0], x0 = mat(a[1]), xd = a[2], yd = mat(a[3]).re, lb = a[4] && a[4].re && a[4].re.length ? a[4].re : null, ub = a[5] && a[5].re && a[5].re.length ? a[5].re : null, maxIt = optGet(a[6], 'MaxIterations', optGet(a[6], 'MaxIter', 400));
    const fun = p => { let v = this.callFunctionValue(f, [like(x0, Float64Array.from(p)), xd], 1); if (Array.isArray(v)) v = v[0]; return Float64Array.from(v.re, (q, i) => q - yd[i]); };
    const res = levmar(fun, x0.re, lb, ub, maxIt);
    return [like(x0, res.p), num(res.cost), like(mat(a[3]), Float64Array.from(res.r)), num(res.flag)].slice(0, Math.max(1, no));
  };
  B.lsqnonlin = function (a, no) { const f = a[0], x0 = mat(a[1]), lb = a[2] && a[2].re && a[2].re.length ? a[2].re : null, ub = a[3] && a[3].re && a[3].re.length ? a[3].re : null;
    const res = levmar(p => { let v = this.callFunctionValue(f, [like(x0, Float64Array.from(p))], 1); if (Array.isArray(v)) v = v[0]; return Float64Array.from(v.re); }, x0.re, lb, ub, 400);
    return [like(x0, res.p), num(res.cost), colv(Array.from(res.r)), num(res.flag)].slice(0, Math.max(1, no)); };

  /* ================= fit / cfit ================= */
  const FITS = {
    exp1: {names: ['a', 'b'], f: (p, x) => p[0] * Math.exp(p[1] * x), txt: 'a*exp(b*x)'},
    exp2: {names: ['a', 'b', 'c', 'd'], f: (p, x) => p[0] * Math.exp(p[1] * x) + p[2] * Math.exp(p[3] * x), txt: 'a*exp(b*x) + c*exp(d*x)'},
    power1: {names: ['a', 'b'], f: (p, x) => p[0] * Math.pow(x, p[1]), txt: 'a*x^b'},
    power2: {names: ['a', 'b', 'c'], f: (p, x) => p[0] * Math.pow(x, p[1]) + p[2], txt: 'a*x^b+c'},
    gauss1: {names: ['a1', 'b1', 'c1'], f: (p, x) => p[0] * Math.exp(-(((x - p[1]) / p[2]) ** 2)), txt: 'a1*exp(-((x-b1)/c1)^2)'},
    sin1: {names: ['a1', 'b1', 'c1'], f: (p, x) => p[0] * Math.sin(p[1] * x + p[2]), txt: 'a1*sin(b1*x+c1)'},
  };
  function linfit(x, y) { const n = x.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; } const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1); return [b, (sy - b * sx) / n]; }
  function fitStart(type, x, y) {
    const n = x.length; let ymx = -Infinity, imx = 0; for (let i = 0; i < n; i++) if (Math.abs(y[i]) > ymx) { ymx = Math.abs(y[i]); imx = i; }
    if (type === 'exp1' || type === 'exp2') { const idx = []; const sg = y[imx] >= 0 ? 1 : -1; for (let i = 0; i < n; i++) if (sg * y[i] > 0) idx.push(i); const [b, l] = linfit(idx.map(i => x[i]), idx.map(i => Math.log(sg * y[i]))); const a = sg * Math.exp(l); return type === 'exp1' ? [a, b] : [a * 0.9, b, a * 0.1, b * 0.3]; }
    if (type === 'power1' || type === 'power2') { const idx = []; for (let i = 0; i < n; i++) if (x[i] > 0 && y[i] > 0) idx.push(i); const [b, l] = idx.length > 1 ? linfit(idx.map(i => Math.log(x[i])), idx.map(i => Math.log(y[i]))) : [1, 0]; return type === 'power1' ? [Math.exp(l), b] : [Math.exp(l), b, 0]; }
    if (type === 'gauss1') { let s = 0, sw = 0; for (let i = 0; i < n; i++) { const w = Math.max(0, y[i]); s += w * (x[i] - x[imx]) ** 2; sw += w; } return [y[imx], x[imx], Math.max(1e-6, Math.sqrt(2 * s / (sw || 1)))]; }
    if (type === 'sin1') { // en büyük tepe (ayrık Fourier, düzgün örneklenmiş varsayımı)
      const mn = Math.min(...x), mx = Math.max(...x), T = (mx - mn) || 1; let best = 0, bk = 1; for (let k = 1; k <= Math.min(200, n); k++) { let re = 0, im = 0; for (let i = 0; i < n; i++) { const t = 2 * Math.PI * k * (x[i] - mn) / T; re += y[i] * Math.cos(t); im += y[i] * Math.sin(t); } const p = re * re + im * im; if (p > best) { best = p; bk = k; } }
      const w = 2 * Math.PI * bk / T; let ss = 0, sc = 0; for (let i = 0; i < n; i++) { ss += y[i] * Math.sin(w * x[i]); sc += y[i] * Math.cos(w * x[i]); } return [2 * Math.hypot(ss, sc) / n, w, Math.atan2(sc, ss)]; }
    return null;
  }
  function makeFit(type, names, vals, fn, txt, extra) { return Object.assign({obj: 'cfit', r: 1, c: 1, type, names, vals: Float64Array.from(vals), fn, txt}, extra || {}); }
  B.fit = function (a, no) {
    const x = Array.from(mat(a[0]).re), y = Array.from(mat(a[1]).re), n = x.length; if (y.length !== n) E('MATLAB:fit:length', 'fit: x ve y aynı uzunlukta olmalı.'); const type = S(a[2]), o = opts(a, 3);
    let cf; const pm = /^poly([1-9])$/.exec(type);
    if (pm) { const d = +pm[1]; const p = Array.from(B.polyfit([rowv(x), rowv(y), num(d)]).re); cf = makeFit(type, p.map((_, i) => 'p' + (i + 1)), p, (q, xv) => q.reduce((s, c) => s * xv + c, 0), p.map((_, i) => 'p' + (i + 1) + (d - i > 1 ? '*x^' + (d - i) : d - i === 1 ? '*x' : '')).join(' + ')); }
    else if (FITS[type]) { const F = FITS[type], st = o.startpoint ? Array.from(mat(o.startpoint).re) : fitStart(type, x, y); const lb = o.lower ? mat(o.lower).re : null, ub = o.upper ? mat(o.upper).re : null; const res = levmar(p => Float64Array.from(x, (xv, i) => F.f(p, xv) - y[i]), st, lb, ub, 600); cf = makeFit(type, F.names, res.p, F.f, F.txt); }
    else { // özel ifade: katsayılar x dışındaki tanımlayıcılar
      const ids = [...new Set((type.match(/[A-Za-z_]\w*/g) || []).filter(w => w !== 'x' && !B[w] && !['pi', 'e', 'i', 'j', 'Inf', 'NaN'].includes(w)))].sort();
      if (!ids.length) E('MATLAB:fit:type', `fit: '${type}' modeli tanınmadı (poly1–poly9, exp1, exp2, power1, power2, gauss1, sin1 ya da katsayılı ifade).`);
      const it = this, expr = type.replace(/[A-Za-z_]\w*/g, w => ids.includes(w) ? 'p__(' + (ids.indexOf(w) + 1) + ')' : w).replace(/([^.])([*\/^])/g, '$1.$2'), fh = B.str2func.call(this, [str('@(p__, x) ' + expr)]);
      const fv = (p, xv) => { let r = it.callFunctionValue(fh, [rowv(Array.from(p)), num(xv)], 1); if (Array.isArray(r)) r = r[0]; return r.re[0]; };
      const st = o.startpoint ? Array.from(mat(o.startpoint).re) : ids.map(() => 0.5); const res = levmar(p => Float64Array.from(x, (xv, i) => fv(p, xv) - y[i]), st, o.lower ? mat(o.lower).re : null, o.upper ? mat(o.upper).re : null, 600); cf = makeFit('custom', ids, res.p, fv, type); }
    if (no >= 2) { let sse = 0, my = 0; for (const v of y) my += v / n; let sst = 0; for (let i = 0; i < n; i++) { sse += (y[i] - cf.fn(cf.vals, x[i])) ** 2; sst += (y[i] - my) ** 2; } const dfe = n - cf.vals.length, r2 = 1 - sse / sst;
      return [cf, structOf({sse: num(sse), rsquare: num(r2), dfe: num(dfe), adjrsquare: num(1 - (1 - r2) * (n - 1) / Math.max(1, dfe)), rmse: num(Math.sqrt(sse / Math.max(1, dfe)))})]; }
    return cf;
  };
  B.coeffvalues = a => rowv(Array.from(a[0].vals)); B.coeffnames = a => cellOf(a[0].names.map(str), true);
  const cfEval = (cf, xv) => { const X = mat(xv); return like(X, Float64Array.from(X.re, v => cf.fn(cf.vals, v))); };
  const origCFV = ML.Interp.prototype.callFunctionValue; ML.Interp.prototype.callFunctionValue = function (f, args, no) { if (f && f.obj === 'cfit') return [cfEval(f, args[0])]; return origCFV.call(this, f, args, no); };
  const origFeval = B.feval; B.feval = function (a, no) { if (a[0] && a[0].obj === 'cfit') return cfEval(a[0], a[1]); return origFeval.call(this, a, no); };

  /* ================= datetime / duration ================= */
  const MS_DAY = 86400000, DN0 = 719529;   // datenum(1970,1,1)
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mkDT = (ms, r, c, fmt) => ({obj: 'datetime', r: r == null ? 1 : r, c: c == null ? ms.length : c, d: Float64Array.from(ms), fmt: fmt || null});
  const mkDU = (ms, r, c, fmt) => ({obj: 'duration', r: r == null ? 1 : r, c: c == null ? ms.length : c, d: Float64Array.from(ms), fmt: fmt || null});
  const isDT = v => v && v.obj === 'datetime', isDU = v => v && v.obj === 'duration';
  const p2 = (n, w = 2) => String(Math.trunc(n)).padStart(w, '0');
  function fmtDT(ms, fmt) {
    if (ms !== ms) return 'NaT'; const d = new Date(Math.round(ms)), Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds(), msd = d.getUTCMilliseconds();
    return fmt.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d|eeee|eee|HH|hh|mm|ss|SSS|SS|S|a/g, t => ({yyyy: String(Y), yy: p2(Y % 100), MMMM: MONL[Mo], MMM: MON[Mo], MM: p2(Mo + 1), M: String(Mo + 1), dd: p2(D), d: String(D), eeee: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()], eee: WD[d.getUTCDay()], HH: p2(h), hh: p2(h % 12 || 12), mm: p2(mi), ss: p2(s), SSS: p2(msd, 3), SS: p2(msd / 10), S: String(Math.trunc(msd / 100)), a: h < 12 ? 'AM' : 'PM'})[t]);
  }
  const dtFmt = v => v.fmt || (Array.from(v.d).every(x => x !== x || x % MS_DAY === 0) ? 'dd-MMM-yyyy' : 'dd-MMM-yyyy HH:mm:ss');
  function fmtDU(ms, fmt) { if (ms !== ms) return 'NaN'; const neg = ms < 0; ms = Math.abs(ms); const f = fmt || 'hh:mm:ss'; let s;
    if (/^[ydhms]$/.test(f)) { const div = {y: 365.2425 * MS_DAY, d: MS_DAY, h: 3600000, m: 60000, s: 1000}[f]; const val = ms / div; s = ML.fmtG(val, 5) + ' ' + {y: 'yrs', d: 'days', h: 'hr', m: 'min', s: 'sec'}[f].replace(/s$/, val === 1 ? '' : 's'); if (f === 'h' || f === 'm' || f === 's') s = ML.fmtG(val, 5) + ' ' + {h: 'hr', m: 'min', s: 'sec'}[f]; }
    else { const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), sec = ms % 60000 / 1000; const dd = Math.floor(h / 24);
      s = f.startsWith('dd:') ? `${p2(dd)}:${p2(h % 24)}:${p2(m)}:${p2(Math.floor(sec))}` : f === 'mm:ss' ? `${p2(h * 60 + m)}:${p2(Math.floor(sec))}` : `${p2(h)}:${p2(m)}:${p2(Math.floor(sec))}`;
      const fr = /\.(S+)$/.exec(f); if (fr) s += '.' + String(Math.round((sec % 1) * Math.pow(10, fr[1].length))).padStart(fr[1].length, '0'); }
    return (neg ? '-' : '') + s; }
  // metinden tarih: ISO, 'dd-MMM-yyyy HH:mm:ss', 'dd.MM.yyyy', 'MM/dd/yyyy' ya da InputFormat
  function parseDT(s, inFmt) {
    s = String(s).trim(); const low = s.toLowerCase(), now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    if (low === 'now') return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()); if (low === 'today') return today; if (low === 'yesterday') return today - MS_DAY; if (low === 'tomorrow') return today + MS_DAY;
    if (inFmt) { const keys = []; const re = new RegExp('^' + inFmt.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/yyyy|yy|MMM|MM|M|dd|d|HH|hh|H|mm|ss|SSS|SS|S|a/g, t => { keys.push(t); return {yyyy: '(\\d{4})', yy: '(\\d{2})', MMM: '([A-Za-z]{3})', MM: '(\\d{1,2})', M: '(\\d{1,2})', dd: '(\\d{1,2})', d: '(\\d{1,2})', HH: '(\\d{1,2})', hh: '(\\d{1,2})', H: '(\\d{1,2})', mm: '(\\d{1,2})', ss: '(\\d{1,2})', SSS: '(\\d{1,3})', SS: '(\\d{1,2})', S: '(\\d)', a: '(AM|PM)'}[t]; }) + '$', 'i'); const m = re.exec(s); if (!m) return NaN;
      let Y = 1970, Mo = 0, D = 1, h = 0, mi = 0, se = 0, ms = 0, pm = null; keys.forEach((k, i) => { const v = m[i + 1]; if (k === 'yyyy') Y = +v; else if (k === 'yy') Y = 2000 + +v; else if (k === 'MMM') Mo = MON.findIndex(q => q.toLowerCase() === v.toLowerCase()); else if (k[0] === 'M') Mo = +v - 1; else if (k[0] === 'd') D = +v; else if (k[0] === 'H' || k === 'hh') h = +v; else if (k === 'mm') mi = +v; else if (k === 'ss') se = +v; else if (k[0] === 'S') ms = +v.padEnd(3, '0'); else if (k === 'a') pm = v.toUpperCase() === 'PM'; });
      if (pm !== null) h = h % 12 + (pm ? 12 : 0); return Date.UTC(Y, Mo, D, h, mi, se, ms); }
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?Z?$/.exec(s); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +((m[7] || '0').padEnd(3, '0').slice(0, 3)));
    m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s); if (m) return Date.UTC(+m[3], MON.findIndex(q => q.toLowerCase() === m[2].toLowerCase()), +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s); if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s); if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    E('MATLAB:datetime:ParseErr', `datetime: '${s}' metni tarih olarak çözülemedi; 'InputFormat' belirtin.`);
  }
  B.datetime = function (a) {
    let i = 0; const pos = []; while (i < a.length && !(isStrV(a[i]) && /^(InputFormat|Format|ConvertFrom|Locale|TimeZone|PivotYear)$/i.test(S(a[i])) && i + 1 < a.length)) pos.push(a[i++]); const o = opts(a, i), fmt = o.format ? S(o.format) : null;
    if (!pos.length) return mkDT([parseDT('now')], 1, 1, fmt);
    if (o.convertfrom) { const X = mat(pos[0]), k = S(o.convertfrom).toLowerCase(); const conv = {posixtime: v => v * 1000, datenum: v => (v - DN0) * MS_DAY, excel: v => (v - 25569) * MS_DAY, epochtime: v => v * 1000, juliandate: v => (v - 2440587.5) * MS_DAY}[k]; if (!conv) E('MATLAB:datetime:ConvertFrom', `datetime: '${k}' dönüşümü desteklenmiyor.`); return mkDT(Array.from(X.re, conv), X.r, X.c, fmt); }
    if (isStrV(pos[0]) || isCell(pos[0])) { const ss = isCell(pos[0]) ? pos[0].v.map(S) : [S(pos[0])], inF = o.inputformat ? S(o.inputformat) : null; return mkDT(ss.map(s => parseDT(s, inF)), isCell(pos[0]) ? pos[0].r : 1, isCell(pos[0]) ? pos[0].c : 1, fmt); }
    if (isDT(pos[0])) return mkDT(pos[0].d, pos[0].r, pos[0].c, fmt || pos[0].fmt);
    let parts; if (pos.length === 1) { const X = mat(pos[0]); if (X.c < 3) E('MATLAB:datetime:args', 'datetime: [y m d] ya da [y m d h mi s] matrisi bekleniyor.'); parts = Array.from({length: X.c}, (_, j) => Array.from({length: X.r}, (_, r) => X.re[r + j * X.r])); const ms = parts[0].map((_, r) => Date.UTC(parts[0][r], parts[1][r] - 1, 1, parts[3] ? parts[3][r] : 0, parts[4] ? parts[4][r] : 0, 0) + (parts[2][r] - 1) * MS_DAY + (parts[5] ? parts[5][r] * 1000 : 0)); return mkDT(ms, X.r, 1, fmt); }
    const M_ = pos.map(mat), L = Math.max(...M_.map(m => m.re.length)), g = (k, j, d) => M_[k] ? M_[k].re[M_[k].re.length === 1 ? 0 : j] : d, shp = M_.find(m => m.re.length === L);
    return mkDT(Array.from({length: L}, (_, j) => Date.UTC(g(0, j), g(1, j, 1) - 1, 1, g(3, j, 0), g(4, j, 0), 0) + (g(2, j, 1) - 1) * MS_DAY + g(5, j, 0) * 1000 + g(6, j, 0)), shp.r, shp.c, fmt);
  };
  const unitMs = {years: 365.2425 * MS_DAY, days: MS_DAY, hours: 3600000, minutes: 60000, seconds: 1000, milliseconds: 1};
  for (const [nm, u] of Object.entries(unitMs)) B[nm] = a => { if (isDU(a[0])) { const v = a[0]; return like(new M(v.r, v.c), Float64Array.from(v.d, x => x / u)); } const X = a.length ? mat(a[0]) : num(1); return mkDU(Array.from(X.re, x => x * u), X.r, X.c, {years: 'y', days: 'd', hours: 'h', minutes: 'm', seconds: 's'}[nm] || 's'); };
  B.duration = a => { let i = 0; const pos = []; while (i < a.length && !isStrV(a[i])) pos.push(mat(a[i++])); const o = opts(a, i), fmt = o.format ? S(o.format) : null;
    if (pos.length === 1) { const X = pos[0]; return mkDU(Array.from({length: X.r}, (_, r) => X.re[r] * 3600000 + (X.c > 1 ? X.re[r + X.r] * 60000 : 0) + (X.c > 2 ? X.re[r + 2 * X.r] * 1000 : 0) + (X.c > 3 ? X.re[r + 3 * X.r] : 0)), X.r, 1, fmt); }
    const L = Math.max(1, ...pos.map(m => m.re.length)), g = (k, j) => pos[k] ? pos[k].re[pos[k].re.length === 1 ? 0 : j] : 0, shp = pos.find(m => m.re.length === L) || num(0);
    return mkDU(Array.from({length: L}, (_, j) => g(0, j) * 3600000 + g(1, j) * 60000 + g(2, j) * 1000 + g(3, j)), shp.r, shp.c, fmt); };
  const dtPart = f => a => { const v = a[0]; if (!isDT(v)) E('MATLAB:datetime:part', 'datetime değeri bekleniyor.'); return like(new M(v.r, v.c), Float64Array.from(v.d, ms => { if (ms !== ms) return NaN; const d = new Date(ms); return f(d, ms); })); };
  const origYear = B.year; B.year = function (a, no) { if (isDT(a[0])) return dtPart(d => d.getUTCFullYear())(a); if (isDU(a[0])) return B.years(a); if (origYear) return origYear.call(this, a, no); E('MATLAB:year', 'year: datetime değeri bekleniyor.'); };
  B.month = dtPart(d => d.getUTCMonth() + 1); B.hour = dtPart(d => d.getUTCHours()); B.minute = dtPart(d => d.getUTCMinutes());
  const origDay = B.day; B.day = function (a, no) { if (isDT(a[0])) { const k = a[1] ? S(a[1]).toLowerCase() : 'dayofmonth'; return dtPart(d => k === 'dayofweek' ? d.getUTCDay() + 1 : k === 'dayofyear' ? Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / MS_DAY) + 1 : d.getUTCDate())(a); } if (origDay) return origDay.call(this, a, no); E('MATLAB:day', 'day: datetime değeri bekleniyor.'); };
  const origSecond = B.second; B.second = function (a, no) { if (isDT(a[0])) return dtPart((d, ms) => d.getUTCSeconds() + (ms % 1000 + 1000) % 1000 / 1000)(a); if (origSecond) return origSecond.call(this, a, no); E('MATLAB:second', 'second: datetime değeri bekleniyor.'); };
  const origWeekday = B.weekday; B.weekday = function (a, no) { if (isDT(a[0])) return dtPart(d => d.getUTCDay() + 1)(a); if (origWeekday) return origWeekday.call(this, a, no); const X = mat(a[0]); return like(X, Float64Array.from(X.re, v => new Date((v - DN0) * MS_DAY).getUTCDay() + 1)); };
  B.posixtime = a => { const v = a[0]; return like(new M(v.r, v.c), Float64Array.from(v.d, x => x / 1000)); };
  B.juliandate = a => { const v = a[0]; return like(new M(v.r, v.c), Float64Array.from(v.d, x => x / MS_DAY + 2440587.5)); };
  B.exceltime = a => { const v = a[0]; return like(new M(v.r, v.c), Float64Array.from(v.d, x => x / MS_DAY + 25569)); };
  const origDatenum = B.datenum; B.datenum = function (a, no) { if (isDT(a[0])) { const v = a[0]; return like(new M(v.r, v.c), Float64Array.from(v.d, x => x / MS_DAY + DN0)); } if (a.length && isStrV(a[0])) return num(parseDT(S(a[0]), a[1] ? S(a[1]).replace(/mmm/g, 'MMM').replace(/HH:MM/g, 'HH:mm').replace(/MM:SS/g, 'mm:ss') : null) / MS_DAY + DN0);
    if (a.length >= 3) { const g = k => a[k] ? sc1(a[k]) : 0; return num(Date.UTC(g(0), g(1) - 1, 1, g(3), g(4), 0) / MS_DAY + DN0 + g(2) - 1 + g(5) / 86400); } if (origDatenum) return origDatenum.call(this, a, no); E('MATLAB:datenum', 'datenum: geçersiz giriş.'); };
  const origDatestr = B.datestr; B.datestr = function (a, no) { if (!a.length) return origDatestr.call(this, a, no); let ms; if (isDT(a[0])) ms = Array.from(a[0].d); else { const X = mat(a[0]); ms = Array.from(X.re, v => (v - DN0) * MS_DAY); } let f = a[1] ? S(a[1]) : null; const mf = f ? f.replace(/yyyy/g, 'yyyy').replace(/mmm/g, 'MMM').replace(/(^|[^M])mm(?=[\/.-])/g, '$1MM').replace(/HH:MM/g, 'HH:mm').replace(/MM:SS/g, 'mm:ss').replace(/:SS/g, ':ss').replace(/FFF/g, 'SSS').replace(/PM/g, 'a') : null;
    const ss = ms.map(v => fmtDT(v, mf || (v % MS_DAY === 0 ? 'dd-MMM-yyyy' : 'dd-MMM-yyyy HH:mm:ss'))); if (ss.length === 1) return str(ss[0]); return B.char([cellOf(ss.map(str), true)]); };
  B.isdatetime = a => bool(isDT(a[0])); B.isduration = a => bool(isDU(a[0])); B.isnat = a => { const v = a[0]; const o = like(new M(v.r, v.c), Float64Array.from(v.d, x => x !== x ? 1 : 0)); o.t = 'l'; return o; };
  B.NaT = a => { const r = a.length ? sc1(a[0]) : 1, c = a.length > 1 ? sc1(a[1]) : r; return mkDT(new Array(r * c).fill(NaN), r, c); };
  B.dateshift = a => { const v = a[0], w = S(a[1]).toLowerCase(), u = S(a[2]).toLowerCase(); return mkDT(Array.from(v.d, ms => { const d = new Date(ms); const parts = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]; const k = {year: 1, month: 2, day: 3, hour: 4, minute: 5, second: 6}[u.replace(/s$/, '')]; if (!k) return ms; const st = parts.map((p, i) => i < k ? p : i === 1 || i === 2 ? (i === 2 ? 1 : 0) : 0); let t = Date.UTC(st[0], st[1], st[2], st[3], st[4], st[5]); if (w === 'end') { const nx = st.slice(); nx[k - 1]++; t = Date.UTC(nx[0], nx[1], nx[2], nx[3], nx[4], nx[5]) - (k >= 4 ? 1000 : MS_DAY); } return t; }), v.r, v.c, v.fmt); };
  B.between = a => { const x = a[0], y = a[1]; return mkDU(Array.from(x.d, (v, i) => y.d[y.d.length === 1 ? 0 : i] - v), x.r, x.c); };

  /* ---------- nesne işlemleri (datetime / duration / table / cfit / string) ---------- */
  const objM = v => { const o = new M(v.r, v.c, Float64Array.from(v.d), null, 'd'); return o; };
  const reshapeObj = (v, m) => ({...v, r: m.r, c: m.c, d: Float64Array.from(m.re)});
  const toMsLike = (x, ref) => isDT(x) || isDU(x) ? objM(x) : isStrV(x) && isDT(ref) ? num(parseDT(S(x))) : x instanceof M ? like(x, Float64Array.from(x.re, v => v * MS_DAY)) : x;
  const origBinop = ML.binop;
  ML.binop = function (op, a, b, line) {
    if ((a && a.s) || (b && b.s)) {   // string sınıfı: + birleştirme, == karşılaştırma
      if (op === '+' && (isStrV(a) || a instanceof M) && (isStrV(b) || b instanceof M)) { const ts = v => isStrV(v) ? toStr(v) : ML.fmtG(v.re[0], 15); const o = str(ts(a) + ts(b)); o.s = true; return o; }
      if ((op === '==' || op === '~=') && isStrV(a) && isStrV(b)) return bool((toStr(a) === toStr(b)) === (op === '=='));
      if (!(a && a.obj) && !(b && b.obj)) return origBinop(op, a instanceof M && a.s ? Object.assign(new M(a.r, a.c, a.re, a.im, a.t)) : a, b instanceof M && b.s ? Object.assign(new M(b.r, b.c, b.re, b.im, b.t)) : b, line);
    }
    const A = a, Bv = b, cmp = ['==', '~=', '<', '<=', '>', '>='].includes(op);
    if (isDT(A) || isDT(Bv)) {
      if (cmp) return origBinop(op, toMsLike(A, Bv), toMsLike(Bv, A), line);
      if (op === '-' && isDT(A) && (isDT(Bv) || isStrV(Bv))) { const r = origBinop('-', objM(A), toMsLike(Bv, A), line); return mkDU(r.re, r.r, r.c); }
      if ((op === '+' || op === '-') && isDT(A)) { const r = origBinop(op, objM(A), toMsLike(Bv), line); return {...mkDT(r.re, r.r, r.c), fmt: A.fmt}; }
      if (op === '+' && isDT(Bv)) { const r = origBinop(op, toMsLike(A), objM(Bv), line); return {...mkDT(r.re, r.r, r.c), fmt: Bv.fmt}; }
      E('MATLAB:datetime:op', `datetime için '${op}' işlemi tanımlı değil.`);
    }
    if (isDU(A) || isDU(Bv)) {
      if (cmp) return origBinop(op, toMsLike(A), toMsLike(Bv), line);
      if (op === '+' || op === '-') { const r = origBinop(op, toMsLike(A), toMsLike(Bv), line); return {...mkDU(r.re, r.r, r.c), fmt: (isDU(A) ? A : Bv).fmt}; }
      if (['*', '.*'].includes(op)) { if (isDU(A) && isDU(Bv)) E('MATLAB:duration:op', 'İki süre çarpılamaz.'); const r = origBinop(op, isDU(A) ? objM(A) : A, isDU(Bv) ? objM(Bv) : Bv, line); return {...mkDU(r.re, r.r, r.c), fmt: (isDU(A) ? A : Bv).fmt}; }
      if (['/', './'].includes(op)) { if (isDU(A) && isDU(Bv)) return origBinop(op, objM(A), objM(Bv), line); if (isDU(A)) { const r = origBinop(op, objM(A), Bv, line); return {...mkDU(r.re, r.r, r.c), fmt: A.fmt}; } }
      E('MATLAB:duration:op', `duration için '${op}' işlemi tanımlı değil.`);
    }
    if ((A && A.obj) || (Bv && Bv.obj)) E('MATLAB:undefinedFunction', `'${op}' işleci ${classOf(A && A.obj ? A : Bv)} için tanımlı değil.`);
    return origBinop(op, a, b, line);
  };
  ML.objPost = v => { if (isDT(v) || isDU(v)) return reshapeObj(v, ML.transpose(objM(v), false)); E('MATLAB:undefinedFunction', `Devrik ${v.obj} için tanımlı değil.`); };
  ML.objUnary = (op, a) => { if (op === '-' && isDU(a)) return {...a, d: Float64Array.from(a.d, v => -v)}; E('MATLAB:undefinedFunction', `Tekli '${op}' ${a.obj} için tanımlı değil.`); };
  ML.objIndex = function (it, v, idx) {
    if (v.obj === 'cfit') { if (idx.length !== 1) E('MATLAB:cfit', 'cfit: f(x) biçiminde tek giriş bekleniyor.'); return cfEval(v, idx[0]); }
    if (isDT(v) || isDU(v)) { const r = ML.readM(objM(v), idx); return reshapeObj(v, r); }
    if (v.obj === 'table') return tblIndex(v, idx, false);
    E('MATLAB:badsubscript', v.obj + ' indislenemez.');
  };
  ML.objCidx = (it, v, idx) => { if (v.obj === 'table') return tblIndex(v, idx, true); E('MATLAB:cellRefFromNonCell', `'{}' ile indisleme ${v.obj} için kullanılamaz.`); };
  ML.objSetIdx = (it, v, idx, rhs) => {
    if (isDT(v) || isDU(v)) { const m = objM(v); const rv = isDT(v) ? (isDT(rhs) ? objM(rhs) : isStrV(rhs) ? num(parseDT(S(rhs))) : E('MATLAB:datetime:assign', 'datetime dizisine datetime atanmalı.')) : (isDU(rhs) ? objM(rhs) : rhs instanceof M && rhs.re.length === 0 ? rhs : E('MATLAB:duration:assign', 'duration dizisine duration atanmalı.')); if (rv instanceof M && rv.re.length === 0 && rv.r === 0) { ML.deleteM(m, idx); } else ML.assignM(m, idx, rv); return reshapeObj(v, m); }
    if (v.obj === 'table') { const sub = tblIndex(v, idx, false); E('MATLAB:table:assign', 'Tabloya () ile atama desteklenmiyor; T.Değişken(i) = ... kullanın.' + (sub ? '' : '')); }
    E('MATLAB:badsubscript', v.obj + ' indisle atanamaz.');
  };
  ML.objField = (it, v, name) => {
    if (v.obj === 'cfit') { const k = v.names.indexOf(name); if (k < 0) E('MATLAB:cfit:field', `cfit: '${name}' katsayısı yok (${v.names.join(', ')}).`); return num(v.vals[k]); }
    if (isDT(v) || isDU(v)) { if (name === 'Format') return str(isDT(v) ? dtFmt(v) : v.fmt || 'hh:mm:ss'); const f = {Year: 'year', Month: 'month', Day: 'day', Hour: 'hour', Minute: 'minute', Second: 'second'}[name]; if (f && isDT(v)) return B[f]([v]); E('MATLAB:noSuchProperty', `${v.obj} için '${name}' özelliği yok.`); }
    if (v.obj === 'table') { if (name === 'Properties') return structOf({VariableNames: cellOf(v.names.map(str)), Description: str(''), RowNames: {cell: true, r: 0, c: 0, v: []}}); const k = v.names.indexOf(name); if (k < 0) E('MATLAB:table:UnrecognizedVarName', `Tabloda '${name}' değişkeni yok (${v.names.join(', ')}).`); return v.vars[k]; }
    E('MATLAB:noSuchProperty', `'${name}' özelliği yok.`);
  };
  ML.objSetField = (it, v, name, rhs) => {
    if (isDT(v) || isDU(v)) { if (name === 'Format') return {...v, fmt: S(rhs)}; E('MATLAB:noSuchProperty', `'${name}' atanamaz.`); }
    if (v.obj === 'table') { if (name === 'Properties') { const nv = rhs.v && rhs.v[0] && rhs.v[0].VariableNames; if (nv) { const names = nv.v.map(S); if (names.length !== v.names.length) E('MATLAB:table:names', 'VariableNames sayısı değişken sayısına eşit olmalı.'); return {...v, names}; } return v; }
      const h = tblHeight(rhs); if (v.c && h !== v.r && !(h === 1 && v.r > 0)) E('MATLAB:table:RowDimensionMismatch', `Yeni değişken ${v.r} satır olmalı (${h} verildi).`); let val = rhs; if (h === 1 && v.r > 1 && rhs instanceof M) { val = zeros(v.r, 1); val.re.fill(rhs.re[0]); }
      if (val instanceof M && val.r === 1 && val.c > 1 && val.c === v.r) val = ML.transpose(val, false);
      const k = v.names.indexOf(name), names = v.names.slice(), vars = v.vars.slice(); if (k >= 0) vars[k] = val; else { names.push(name); vars.push(val); } return mkTbl(names, vars); }
    if (v.obj === 'cfit') E('MATLAB:cfit', 'cfit katsayıları atanamaz.');
    E('MATLAB:noSuchProperty', `'${name}' atanamaz.`);
  };
  ML.objSummary = v => isDT(v) && v.d.length === 1 ? fmtDT(v.d[0], dtFmt(v)) : isDU(v) && v.d.length === 1 ? fmtDU(v.d[0], v.fmt) : `[${v.r}×${v.c} ${v.obj}]`;
  ML.objText = v => {
    if (isDT(v) || isDU(v)) { const f = isDT(v) ? x => fmtDT(x, dtFmt(v)) : x => fmtDU(x, v.fmt); if (v.d.length === 1) return '\n   ' + f(v.d[0]) + '\n'; const cells = Array.from(v.d, f), w = Math.max(...cells.map(s => s.length)); let s = '\n  ' + v.r + '×' + v.c + ' ' + v.obj + ' array\n\n'; for (let i = 0; i < v.r; i++) { s += '   '; for (let j = 0; j < v.c; j++) s += cells[i + j * v.r].padStart(w) + '   '; s += '\n'; } return s; }
    if (v.obj === 'cfit') { let s = `\n     General model ${v.type === 'custom' ? '' : v.type.replace(/^poly/, 'Poly').replace(/^exp/, 'Exp').replace(/^power/, 'Power').replace(/^gauss/, 'Gauss').replace(/^sin/, 'Sin')}:\n     f(x) = ${v.txt}\n     Coefficients:\n`; v.names.forEach((n, i) => { s += `       ${n} = ${ML.fmtG(v.vals[i], 5)}\n`; }); return s; }
    if (v.obj === 'table') return '\n' + tblText(v);
    return `<${v.obj}>`;
  };
  // disp / char / string / size / isempty / length vb. nesne desteği
  const origDisp = B.disp; B.disp = function (a, no) { if (a[0] && a[0].obj) { this.out(ML.objText(a[0]).replace(/^\n/, '') + (a[0].obj === 'table' ? '' : '')); return; } if (a[0] instanceof M && a[0].s) { this.out(toStr(a[0]) + '\n'); return; } return origDisp.call(this, a, no); };
  const objStrings = v => isDT(v) ? Array.from(v.d, x => fmtDT(x, dtFmt(v))) : isDU(v) ? Array.from(v.d, x => fmtDU(x, v.fmt)) : null;
  const origChar = B.char; B.char = function (a, no) { if (a.length === 1 && a[0] && a[0].obj) { const ss = objStrings(a[0]); if (ss) return ss.length === 1 ? str(ss[0]) : origChar.call(this, [cellOf(ss.map(str), true)], no); } if (a.length === 1 && a[0] instanceof M && a[0].s) { const o = str(toStr(a[0])); return o; } return origChar.call(this, a, no); };
  const origIsempty = B.isempty; B.isempty = function (a, no) { if (a[0] && a[0].obj) return bool(a[0].r * a[0].c === 0); return origIsempty.call(this, a, no); };
  for (const nm of ['diff', 'sort', 'min', 'max', 'mean', 'median', 'sum', 'cumsum', 'unique', 'abs', 'transpose', 'ctranspose', 'reshape', 'horzcat', 'vertcat', 'fliplr', 'flipud', 'linspace', 'colon', 'issorted', 'find', 'interp1', 'histcounts', 'isnan']) {
    const orig = B[nm]; if (!orig) continue;
    B[nm] = function (a, no) {
      const oi = a.findIndex(v => isDT(v) || isDU(v)); if (oi < 0) return orig.call(this, a, no);
      const ref = a[oi], args = a.map(v => isDT(v) || isDU(v) ? objM(v) : v); let r = orig.call(this, args, no); const one = x => { if (!(x instanceof M)) return x; if (nm === 'issorted' || nm === 'find' || nm === 'isnan' || nm === 'histcounts') return x; if (nm === 'interp1') return x; if (nm === 'diff' && isDT(ref)) return mkDU(x.re, x.r, x.c); if ((nm === 'sum' || nm === 'cumsum') && isDT(ref)) E('MATLAB:datetime:sum', 'datetime değerleri toplanamaz.'); return isDT(ref) ? {...mkDT(x.re, x.r, x.c), fmt: ref.fmt} : {...mkDU(x.re, x.r, x.c), fmt: ref.fmt}; };
      if (Array.isArray(r)) { r = r.slice(); r[0] = one(r[0]); return r; } return one(r);
    };
  }
  // matris birleştirme [t1 t2] / [t1; t2]: buildMatrix nesneleri tanımaz → Interp düzeyinde sarmala
  ML.Interp.prototype.buildMatrix = function (node, sc) {
    const vals = node.rows.map(r => r.map(e => this.evalMulti(e, sc, 1)).flat());
    const hasObj = vals.some(r => r.some(v => v && v.obj));
    if (!hasObj) { if (!vals.length) return empty(); return ML.vcat(vals.map(r => ML.hcat(r))); }   // "a" dizileri: geriye uyumlu karakter birleştirme
    const kind = vals.flat().find(v => v && v.obj).obj; if (kind !== 'datetime' && kind !== 'duration') E('MATLAB:catenate', kind + ' değerleri birleştirilemez.');
    const rowMs = vals.map(r => ML.hcat(r.filter(v => !(v instanceof M && v.re.length === 0 && !v.s)).map(v => v && v.obj ? objM(v) : isStrV(v) && kind === 'datetime' ? num(parseDT(S(v))) : v instanceof M ? like(v, Float64Array.from(v.re, x => x * (kind === 'duration' ? MS_DAY : MS_DAY))) : v)));
    const all = ML.vcat(rowMs), ref = vals.flat().find(v => v && v.obj); return kind === 'datetime' ? {...mkDT(all.re, all.r, all.c), fmt: ref.fmt} : {...mkDU(all.re, all.r, all.c), fmt: ref.fmt};
  };
  const origPlot = B.plot; B.plot = function (a, no) {   // datetime / duration eksenleri: saniye (datetime: ilk zamana göre)
    if (!a.some(v => v && v.obj)) return origPlot.call(this, a, no);
    let t0 = null; const conv = a.map(v => { if (isDT(v)) { if (t0 == null) t0 = v.d[0]; return like(new M(v.r, v.c), Float64Array.from(v.d, x => (x - t0) / 1000)); } if (isDU(v)) return like(new M(v.r, v.c), Float64Array.from(v.d, x => x / 1000)); return v; });
    const r = origPlot.call(this, conv, no); const ax = H.axes(this); if (!ax.xlabel) ax.xlabel = t0 != null ? 'Zaman (s) — başlangıç ' + fmtDT(t0, 'dd-MMM-yyyy HH:mm:ss') : 'Süre (s)'; return r; };

  /* ================= table ================= */
  const tblHeight = v => v instanceof M ? (isVec(v) && v.r === 1 && v.c > 1 ? v.c : v.r) : isCell(v) ? (v.c === 1 ? v.r : v.r === 1 ? v.c : v.r) : v && v.obj ? (v.r === 1 && v.c > 1 ? v.c : v.r) : 1;
  const asCol = v => { if (v instanceof M && v.r === 1 && v.c > 1) return ML.transpose(v, false); if (isCell(v) && v.r === 1 && v.c > 1) return {cell: true, r: v.c, c: 1, v: v.v.slice()}; if (v && v.obj && v.r === 1 && v.c > 1) return {...v, r: v.c, c: 1}; if (v instanceof M && v.s) { const o = str(toStr(v)); return {cell: true, r: 1, c: 1, v: [o]}; } return v; };
  function mkTbl(names, vars) { const h = vars.length ? tblHeight(vars[0]) : 0; vars.forEach((v, i) => { if (tblHeight(v) !== h) E('MATLAB:table:UnequalVarLengths', `table: tüm değişkenler aynı satır sayısında olmalı ('${names[i]}' ${tblHeight(v)}, beklenen ${h}).`); }); const seen = new Set(); for (const n of names) { if (seen.has(n)) E('MATLAB:table:DuplicateVarNames', `table: '${n}' adı yinelenmiş.`); seen.add(n); } return {obj: 'table', r: h, c: names.length, names, vars}; }
  // değişken adları: çağrıdaki argüman ifadelerinden (MATLAB gibi), yoksa Var1, Var2...
  function argNames(node, fname, k) { const found = node && node.f && node.f.n === fname ? node.args : null; return Array.from({length: k}, (_, i) => found && found[i] && found[i].t === 'id' ? found[i].n : 'Var' + (i + 1)); }
  B.table = function (a, no, sc, stmt) { let i = 0; const vals = []; while (i < a.length && !(isStrV(a[i]) && !a[i].s && /^(VariableNames|RowNames|Size|VariableTypes|DimensionNames)$/i.test(S(a[i])))) vals.push(a[i++]); const o = opts(a, i);
    let names = o.variablenames ? (isCell(o.variablenames) ? o.variablenames.v.map(S) : [S(o.variablenames)]) : argNames(this.callNode, 'table', vals.length); if (names.length !== vals.length) E('MATLAB:table:IncorrectNumberOfVarNames', 'table: VariableNames sayısı değişken sayısına eşit olmalı.');
    return mkTbl(names, vals.map(asCol)); };
  B.istable = a => bool(a[0] && a[0].obj === 'table');
  B.height = a => num(a[0].obj === 'table' ? a[0].r : sizeOf(a[0])[0]); B.width = a => num(a[0].obj === 'table' ? a[0].c : sizeOf(a[0])[1]);
  B.array2table = function (a) { const A = mat(a[0]), o = opts(a, 1), names = o.variablenames ? o.variablenames.v.map(S) : Array.from({length: A.c}, (_, j) => 'A' + (j + 1)); return mkTbl(names, Array.from({length: A.c}, (_, j) => colv(Array.from(A.re.subarray(j * A.r, (j + 1) * A.r))))); };
  B.table2array = a => { const T = a[0]; if (T.vars.every(v => v instanceof M)) return ML.hcat(T.vars); if (T.vars.every(v => isCell(v))) { const out = []; for (const v of T.vars) out.push(...v.v); return {cell: true, r: T.r, c: T.c, v: out}; } E('MATLAB:table2array', 'table2array: değişkenler aynı türde olmalı.'); };
  B.table2cell = a => { const T = a[0], out = []; T.vars.forEach(v => { for (let i = 0; i < T.r; i++) out.push(v instanceof M ? (v.c === 1 ? num(v.re[i]) : rowv(Array.from({length: v.c}, (_, j) => v.re[i + j * v.r]))) : isCell(v) ? v.v[i] : v.obj ? reshapeObj(v, num(v.d[i])) : v); }); return {cell: true, r: T.r, c: T.c, v: out}; };
  B.struct2table = a => { const s = a[0]; if (s.v.length === 1) { const k = Object.keys(s.v[0]); return mkTbl(k, k.map(n => asCol(s.v[0][n]))); } const k = Object.keys(s.v[0]); return mkTbl(k, k.map(n => { const vs = s.v.map(q => q[n]); return vs.every(v => v instanceof M && v.re.length === 1 && v.t !== 'c') ? colv(vs.map(v => v.re[0])) : {cell: true, r: vs.length, c: 1, v: vs}; })); };
  B.table2struct = a => { const T = a[0]; const vs = []; for (let i = 0; i < T.r; i++) { const o = Object.create(null); T.names.forEach((n, k) => { const v = T.vars[k]; o[n] = v instanceof M ? (v.t === 'c' ? str(ML.rowStr(v, i)) : num(v.re[i])) : isCell(v) ? v.v[i] : v.obj ? reshapeObj(v, num(v.d[i])) : v; }); vs.push(o); } return {sa: true, r: T.r, c: 1, v: vs}; };
  function rowPick(v, ri) { if (v instanceof M) { const o = zeros(ri.length, v.c); o.t = v.t; ri.forEach((r, k) => { for (let j = 0; j < v.c; j++) o.re[k + j * ri.length] = v.re[r + j * v.r]; }); if (v.s) o.s = true; return o; } if (isCell(v)) return {cell: true, r: ri.length, c: 1, v: ri.map(r => v.v[r])}; if (v && v.obj) return {...v, r: ri.length, c: 1, d: Float64Array.from(ri, r => v.d[r])}; return v; }
  function tblIndex(T, idx, brace) {
    if (idx.length !== 2) E('MATLAB:table:badsubscript', 'Tablo T(satırlar, değişkenler) biçiminde indislenmeli.');
    const ri = ML.idxList(idx[0], T.r); let vi; const vsel = idx[1];
    if (isStrV(vsel) && toStr(vsel) !== ':') vi = [T.names.indexOf(S(vsel))]; else if (isCell(vsel)) vi = vsel.v.map(v => T.names.indexOf(S(v))); else vi = Array.from(ML.idxList(vsel, T.c));
    if (vi.some(k => k < 0 || k >= T.c)) E('MATLAB:table:UnrecognizedVarName', 'Tabloda olmayan değişken seçildi.'); for (const r of ri) if (r >= T.r) E('MATLAB:badsubscript', `Satır indisi tablo yüksekliğini (${T.r}) aşıyor.`);
    const vars = vi.map(k => rowPick(T.vars[k], Array.from(ri)));
    if (!brace) return mkTbl(vi.map(k => T.names[k]), vars);
    if (vars.every(v => v instanceof M)) return ML.hcat(vars); if (vars.length === 1) return vars[0]; if (vars.every(isCell)) { const out = []; vars.forEach(v => out.push(...v.v)); return {cell: true, r: ri.length, c: vars.length, v: out}; }
    E('MATLAB:table:brace', 'T{...}: seçilen değişkenler birleştirilemez (farklı türler).');
  }
  const cellTxt = (v, i) => { if (v instanceof M) { if (v.t === 'c') return "'" + ML.rowStr(v, i) + "'"; if (v.c === 1) return ML.fmtNumShort(v.re[i]); return Array.from({length: v.c}, (_, j) => ML.fmtNumShort(v.re[i + j * v.r])).join('  '); } if (isCell(v)) { const e = v.v[i]; return e instanceof M && e.t === 'c' ? (e.s ? '"' + toStr(e) + '"' : "{'" + toStr(e) + "'}") : e instanceof M && e.re.length === 1 ? '{[' + ML.fmtNumShort(e.re[0]) + ']}' : '{…}'; } if (isDT(v)) return fmtDT(v.d[i], dtFmt(v)); if (isDU(v)) return fmtDU(v.d[i], v.fmt); return '?'; };
  function tblText(T) { const shown = Math.min(T.r, 50), cols = T.names.map((n, k) => { const cells = Array.from({length: shown}, (_, i) => cellTxt(T.vars[k], i)); const w = Math.max(n.length, ...cells.map(s => s.length)); return {n, cells, w}; });
    let s = '  ' + T.r + '×' + T.c + ' table\n\n'; s += '    ' + cols.map(c => c.n.padStart(Math.floor((c.w + c.n.length) / 2)).padEnd(c.w)).join('    ') + '\n'; s += '    ' + cols.map(c => '_'.repeat(c.w)).join('    ') + '\n\n';
    for (let i = 0; i < shown; i++) s += '    ' + cols.map(c => c.cells[i].padStart(c.w)).join('    ') + '\n'; if (shown < T.r) s += `    … (${T.r - shown} satır daha)\n`; return s + '\n'; }
  for (const nm of ['head', 'tail']) B[nm] = a => { const v = a[0], k = a[1] ? sc1(a[1]) : 8; const n = v.obj === 'table' ? v.r : tblHeight(v), cnt = Math.min(n, k), ri = nm === 'head' ? Array.from({length: cnt}, (_, i) => i) : Array.from({length: cnt}, (_, i) => n - cnt + i); if (v.obj === 'table') return mkTbl(v.names, v.vars.map(x => rowPick(x, ri))); return rowPick(v, ri); };
  const origSortrows = B.sortrows; B.sortrows = function (a, no) { const T = a[0]; if (!(T && T.obj === 'table')) return origSortrows.call(this, a, no); let col = a[1] ? (isStrV(a[1]) ? T.names.indexOf(S(a[1])) : sc1(a[1]) - 1) : 0, desc = a.some(v => isStrV(v) && /^descend$/i.test(S(v))); if (col < 0) E('MATLAB:table:UnrecognizedVarName', 'sortrows: değişken bulunamadı.'); const key = T.vars[col], kv = i => key instanceof M ? key.re[i] : isCell(key) ? toStr(key.v[i]) : key.d[i]; const ord = Array.from({length: T.r}, (_, i) => i).sort((p, q) => { const x = kv(p), y = kv(q); const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return desc ? -c : c; }); const r = mkTbl(T.names, T.vars.map(v => rowPick(v, ord))); return no >= 2 ? [r, colv(ord.map(i => i + 1))] : r; };
  const origSize = B.size; B.size = function (a, no) { return origSize.call(this, a, no); };
  const origNumel = B.numel; B.numel = function (a, no) { if (a[0] && a[0].obj === 'table') return num(a[0].r * a[0].c); return origNumel.call(this, a, no); };

  /* ================= CSV / metin dosyaları ================= */
  function readText(it, name) { const fs = ML._fs; const e = fs.vfsFind(it, name); if (!e) E('MATLAB:readmatrix:FileNotFound', `'${fs.base(name)}' dosyası bulunamadı. Dosyayı arayüzde “Dosya ekle” ile ekleyin ya da sol paneldeki klasörden seçin.`); const b = fs.readBytes(it, e, 0, e.size); let t; try { t = new TextDecoder('utf-8', {fatal: true}).decode(b); } catch (er) { t = new TextDecoder('windows-1254').decode(b); } return t.replace(/^\uFEFF/, ''); }
  function splitLines(t, delim) { const lines = t.split(/\r?\n/).filter(l => l.trim().length); if (!delim) { const L = lines.slice(0, 20), cnt = ch => L.map(l => l.split(ch).length - 1); const ok = ch => { const c = cnt(ch); return c[0] > 0 && c.every(x => x === c[0]); }; delim = ok('\t') ? '\t' : ok(';') ? ';' : ok(',') ? ',' : L.some(l => l.includes('\t')) ? '\t' : L.some(l => l.includes(';')) ? ';' : L.some(l => l.includes(',')) ? ',' : ' '; }
    const sp = l => { if (delim === ' ') return l.trim().split(/\s+/); const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
    return {rows: lines.map(sp), delim}; }
  const numOf = s => { if (s === '' || s == null) return NaN; const t = s.replace(/^"|"$/g, ''); if (/^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/.test(t)) return +t.replace(',', '.'); if (/^[-+]?(inf|nan)$/i.test(t)) return t.toLowerCase().includes('nan') ? NaN : (t[0] === '-' ? -Infinity : Infinity); return null; };
  B.readmatrix = function (a) { const o = opts(a, 1), {rows: R} = splitLines(readText(this, S(a[0])), o.delimiter ? S(o.delimiter).replace('\\t', '\t') : null); let start = o.numheaderlines ? sc1(o.numheaderlines) : 0; if (!o.numheaderlines) while (start < R.length && R[start].every(c => numOf(c) === null)) start++; if (o.range) { const m = /^([A-Z]+)?(\d+)/i.exec(S(o.range)); if (m) start = +m[2] - 1; }
    const body = R.slice(start), nc = Math.max(0, ...body.map(r => r.length)), out = zeros(body.length, nc); body.forEach((r, i) => { for (let j = 0; j < nc; j++) { const v = numOf(r[j]); out.re[i + j * body.length] = v == null ? NaN : v; } }); return out; };
  B.csvread = function (a) { const R0 = a[1] ? sc1(a[1]) : 0, C0 = a[2] ? sc1(a[2]) : 0; const {rows: R} = splitLines(readText(this, S(a[0])), ','); const body = R.slice(R0), nc = Math.max(0, ...body.map(r => r.length)) - C0, out = zeros(body.length, Math.max(0, nc)); body.forEach((r, i) => { for (let j = 0; j < nc; j++) { const v = numOf(r[j + C0]); out.re[i + j * body.length] = v == null || v !== v ? 0 : v; } }); return out; };
  B.dlmread = function (a) { const d = a[1] && isStrV(a[1]) ? S(a[1]).replace('\\t', '\t') : null; const {rows: R} = splitLines(readText(this, S(a[0])), d); const off = d ? 2 : 1, R0 = a[off] ? sc1(a[off]) : 0, C0 = a[off + 1] ? sc1(a[off + 1]) : 0; const body = R.slice(R0), nc = Math.max(0, ...body.map(r => r.length)) - C0, out = zeros(body.length, Math.max(0, nc)); body.forEach((r, i) => { for (let j = 0; j < nc; j++) { const v = numOf(r[j + C0]); out.re[i + j * body.length] = v == null || v !== v ? 0 : v; } }); return out; };
  B.readtable = function (a) { const o = opts(a, 1), {rows: R} = splitLines(readText(this, S(a[0])), o.delimiter ? S(o.delimiter).replace('\\t', '\t') : null); if (!R.length) return mkTbl([], []);
    const hasHdr = !(o.readvariablenames && !ML.isTrue(o.readvariablenames)) && R[0].some(c => numOf(c) === null) && R.length > 1, hdr = hasHdr ? R[0] : R[0].map((_, j) => 'Var' + (j + 1)), body = hasHdr ? R.slice(1) : R;
    const used = new Set(), names = hdr.map((h, j) => { let n = String(h).replace(/^"|"$/g, '').trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'Var' + (j + 1); if (!/^[A-Za-z]/.test(n)) n = 'x' + n; let k = n, q = 1; while (used.has(k)) k = n + '_' + (q++); used.add(k); return k; });
    const vars = names.map((_, j) => { const col = body.map(r => r[j] == null ? '' : r[j]); const nums = col.map(numOf); if (nums.every(v => v !== null)) return colv(nums); return {cell: true, r: col.length, c: 1, v: col.map(s => str(s.replace(/^"|"$/g, '')))}; });
    return mkTbl(names, vars); };
  function emit(it, name, text) { const bytes = new TextEncoder().encode(text); ML.vfsAdd(it, name, bytes); if (it.ctx.notify) it.ctx.notify('download', {name: ML._fs.base(name), bytes}); }
  const fmtCell = v => v !== v ? 'NaN' : v === Infinity ? 'Inf' : v === -Infinity ? '-Inf' : Number.isInteger(v) ? String(v) : String(+v.toPrecision(15));
  const csvQ = (s, d) => /["\n]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s;
  B.writematrix = function (a) { const A = a[0], name = a[1] ? S(a[1]) : 'matrix.txt', o = opts(a, 2), d = o.delimiter ? ({comma: ',', tab: '\t', semi: ';', space: ' ', '\\t': '\t'}[S(o.delimiter)] || S(o.delimiter)) : /\.txt$/i.test(name) ? ',' : ','; let lines = [];
    if (isCell(A)) for (let i = 0; i < A.r; i++) lines.push(Array.from({length: A.c}, (_, j) => { const e = A.v[i + j * A.r]; return e instanceof M && e.t === 'c' ? csvQ(toStr(e), d) : e instanceof M && e.re.length ? fmtCell(e.re[0]) : ''; }).join(d));
    else { const m = mat(A); if (m.t === 'c') lines = Array.from({length: m.r}, (_, i) => ML.rowStr(m, i)); else for (let i = 0; i < m.r; i++) lines.push(Array.from({length: m.c}, (_, j) => fmtCell(m.re[i + j * m.r])).join(d)); }
    emit(this, name, lines.join('\r\n') + '\r\n'); };
  B.csvwrite = function (a) { const m = mat(a[1]), lines = []; for (let i = 0; i < m.r; i++) lines.push(Array.from({length: m.c}, (_, j) => fmtCell(m.re[i + j * m.r])).join(',')); emit(this, S(a[0]), lines.join('\n') + '\n'); };
  B.dlmwrite = function (a) { const m = mat(a[1]), o = opts(a, 2); let d = a[2] && isStrV(a[2]) && !/^(delimiter|precision|newline|-append)$/i.test(S(a[2])) ? S(a[2]).replace('\\t', '\t') : o.delimiter ? S(o.delimiter).replace('\\t', '\t') : ','; const lines = []; for (let i = 0; i < m.r; i++) lines.push(Array.from({length: m.c}, (_, j) => fmtCell(m.re[i + j * m.r])).join(d)); emit(this, S(a[0]), lines.join('\n') + '\n'); };
  B.writetable = function (a) { const T = a[0]; if (!(T && T.obj === 'table')) E('MATLAB:writetable', 'writetable: ilk argüman tablo olmalı.'); const name = a[1] ? S(a[1]) : 'table.txt', o = opts(a, 2), d = o.delimiter ? ({comma: ',', tab: '\t', semi: ';', space: ' '}[S(o.delimiter)] || S(o.delimiter)) : ','; const hdr = [], cols = [];
    T.names.forEach((n, k) => { const v = T.vars[k]; if (v instanceof M && v.t !== 'c' && v.c > 1) for (let j = 0; j < v.c; j++) { hdr.push(n + '_' + (j + 1)); cols.push(i => fmtCell(v.re[i + j * v.r])); } else { hdr.push(n); cols.push(i => { const t = cellTxt(v, i); return csvQ(isCell(v) ? toStr(v.v[i]) : v instanceof M && v.t === 'c' ? ML.rowStr(v, i) : v instanceof M ? fmtCell(v.re[i]) : t, d); }); } });
    const lines = [(o.writevariablenames && !ML.isTrue(o.writevariablenames)) ? null : hdr.map(h => csvQ(h, d)).join(d)].filter(x => x !== null); for (let i = 0; i < T.r; i++) lines.push(cols.map(f => f(i)).join(d)); emit(this, name, lines.join('\r\n') + '\r\n'); };

  /* ================= string ================= */
  const tagS = s => { const o = str(s); o.s = true; return o; };
  B.string = a => { const v = a[0]; if (v === undefined) return tagS(''); if (isCell(v)) return {cell: true, r: v.r, c: v.c, v: v.v.map(e => tagS(toStr(e)))}; if (v && v.obj) { const ss = objStrings(v); return ss.length === 1 ? tagS(ss[0]) : {cell: true, r: v.r, c: v.c, v: ss.map(tagS)}; } const m = mat(v); if (m.t === 'c') { if (m.r <= 1) return tagS(toStr(m)); return {cell: true, r: m.r, c: 1, v: Array.from({length: m.r}, (_, i) => tagS(ML.rowStr(m, i).replace(/\s+$/, '')))}; } if (m.re.length === 1) return tagS(m.t === 'l' ? (m.re[0] ? 'true' : 'false') : ML.fmtG(m.re[0], 5)); return {cell: true, r: m.r, c: m.c, v: Array.from(m.re, x => tagS(m.t === 'l' ? (x ? 'true' : 'false') : ML.fmtG(x, 5)))}; };
  B.strings = a => { const r = a.length ? sc1(a[0]) : 1, c = a.length > 1 ? sc1(a[1]) : r; if (r === 1 && c === 1) return tagS(''); return {cell: true, r, c, v: Array.from({length: r * c}, () => tagS(''))}; };
  B.isstring = a => bool(a[0] instanceof M && !!a[0].s || (isCell(a[0]) && a[0].v.length > 0 && a[0].v.every(e => e instanceof M && e.s)));
  B.isStringScalar = a => bool(a[0] instanceof M && !!a[0].s);
  B.strlength = a => { const v = a[0]; if (isCell(v)) { const o = zeros(v.r, v.c); v.v.forEach((e, i) => { o.re[i] = toStr(e).length; }); return o; } return num(toStr(v).length); };
  const mapText = (v, f) => { if (isCell(v)) { const o = v.v.map(e => f(toStr(e))); if (o.every(x => !Array.isArray(x))) return {cell: true, r: v.r, c: v.c, v: o.map(s => { const q = str(s); if (v.v[0] && v.v[0].s) q.s = true; return q; })}; return {cell: true, r: v.v.length, c: 1, v: o.flat().map(s => str(s))}; } const r = f(toStr(v)); const wrap = s => { const q = str(s); if (v.s) q.s = true; return q; }; if (Array.isArray(r)) return r.length === 1 ? wrap(r[0]) : {cell: true, r: r.length, c: 1, v: r.map(wrap)}; return wrap(r); };
  const posOf = (s, p, after) => { if (p instanceof M && p.t !== 'c') return after ? p.re[0] : p.re[0] - 1; const k = s.indexOf(toStr(p)); return k < 0 ? -1 : after ? k + toStr(p).length : k; };
  B.extractBetween = a => { const o = opts(a, 3), incl = o.boundaries && /^inclusive$/i.test(S(o.boundaries)); return mapText(a[0], s => {
    if (a[1] instanceof M && a[1].t !== 'c') { const st = a[1].re[0] - 1, en = a[2].re[0]; return [s.slice(st, en)]; }
    const p = toStr(a[1]), q = toStr(a[2]), out = []; let i = 0; for (;;) { const k = s.indexOf(p, i); if (k < 0) break; const st = k + p.length, e = s.indexOf(q, st); if (e < 0) break; out.push(incl ? s.slice(k, e + q.length) : s.slice(st, e)); i = e + q.length; } return out.length ? out : ['']; }); };
  B.extractBefore = a => mapText(a[0], s => { const k = posOf(s, a[1], false); return k < 0 ? '' : s.slice(0, k); });
  B.extractAfter = a => mapText(a[0], s => { const k = posOf(s, a[1], true); return k < 0 ? '' : s.slice(k); });
  if (!B.strip) B.strip = a => mapText(a[0], s => s.trim());
  const origJoin = B.join; if (!origJoin) B.join = a => { const v = a[0], d = a[1] ? toStr(a[1]) : ' '; return tagS(isCell(v) ? v.v.map(toStr).join(d) : toStr(v)); };
  const origSplit = B.split; if (!origSplit) B.split = a => { const s = toStr(a[0]), d = a[1] ? (isCell(a[1]) ? a[1].v.map(toStr) : [toStr(a[1])]) : null; const parts = d ? s.split(new RegExp(d.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))) : s.trim().split(/\s+/); return {cell: true, r: parts.length, c: 1, v: parts.map(tagS)}; };
  B.newline = () => str('\n');
  const origNum2str = B.num2str; B.num2str = function (a, no) { if (a[0] instanceof M && a[0].s) return str(toStr(a[0])); return origNum2str.call(this, a, no); };
  const origStr2double = B.str2double; if (origStr2double) B.str2double = function (a, no) { if (a[0] && a[0].obj) E('MATLAB:str2double', 'str2double: metin bekleniyor.'); return origStr2double.call(this, a, no); };
})(MLAB);
