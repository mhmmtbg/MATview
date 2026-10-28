/* Sinyal işleme: FFT, PSD, STFT, Butterworth, filtfilt, Hampel, gürültü azaltma */
const DSP = (() => {
  const twCache = {};
  function tw(n) {
    if (twCache[n]) return twCache[n];
    const c = new Float64Array(n / 2), s = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { c[i] = Math.cos(2 * Math.PI * i / n); s[i] = -Math.sin(2 * Math.PI * i / n); }
    const rev = new Uint32Array(n); const bits = Math.log2(n) | 0;
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    return twCache[n] = {c, s, rev};
  }
  // yerinde karmaşık FFT (n ikinin kuvveti); inverse=true -> ters (1/n uygulanmaz)
  function fft(re, im, inverse) {
    const n = re.length, {c, s, rev} = tw(n);
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    const sg = inverse ? -1 : 1;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = c[k], wi = sg * s[k];
          const a = i + j, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
  }
  // Spektral analiz için periyodik (DFT-even) pencere: scipy.signal.get_window(fftbins=True) ve MATLAB pwelch ile aynı
  function window(type, n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / n;
      switch (type) {
        case 'hann': w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * x); break;
        case 'hamming': w[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * x); break;
        case 'blackman': w[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * x) + 0.08 * Math.cos(4 * Math.PI * x); break;
        case 'flattop': w[i] = 0.2156 - 0.4160 * Math.cos(2 * Math.PI * x) + 0.2781 * Math.cos(4 * Math.PI * x) - 0.0836 * Math.cos(6 * Math.PI * x) + 0.0069 * Math.cos(8 * Math.PI * x); break;
        default: w[i] = 1;
      }
    }
    return w;
  }
  const nextPow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

  // x[i0..i1) bölümü, maske (del) varsa silinenler çıkarılmaz; NaN->0 yerine ortalama
  function segment(x, del, i0, i1) {
    const n = i1 - i0, out = new Float64Array(n);
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) { const v = x[i0 + i]; if ((del && del[i0 + i]) || !isFinite(v)) { out[i] = NaN; } else { out[i] = v; sum += v; cnt++; } }
    const m = cnt ? sum / cnt : 0;
    for (let i = 0; i < n; i++) if (isNaN(out[i])) out[i] = m;
    return out;
  }

  // Welch PSD. opt: nfft, overlap(0..0.9), win, detrend('mean'|'none'), scale('psd'|'amp')
  function welch(x, fs, opt, onProgress) {
    const nfft = Math.min(opt.nfft, nextPow2(x.length));
    const w = window(opt.win || 'hann', nfft);
    let s1 = 0, s2 = 0; for (let i = 0; i < nfft; i++) { s1 += w[i]; s2 += w[i] * w[i]; }
    let hop = Math.max(1, Math.round(nfft * (1 - (opt.overlap ?? 0.5))));
    const maxSeg = opt.maxSeg || 4000;
    if ((x.length - nfft) / hop + 1 > maxSeg) hop = Math.ceil((x.length - nfft) / (maxSeg - 1));
    const nb = nfft / 2 + 1, acc = new Float64Array(nb);
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    let nseg = 0;
    for (let st = 0; st + nfft <= x.length; st += hop) {
      let mean = 0;
      if (opt.detrend !== 'none') { for (let i = 0; i < nfft; i++) mean += x[st + i]; mean /= nfft; }
      for (let i = 0; i < nfft; i++) { re[i] = (x[st + i] - mean) * w[i]; im[i] = 0; }
      fft(re, im, false);
      for (let k = 0; k < nb; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
      nseg++;
    }
    if (!nseg) { // veri nfft'den kısa
      for (let i = 0; i < nfft; i++) { re[i] = (i < x.length ? x[i] : 0) * w[i]; im[i] = 0; }
      fft(re, im, false); for (let k = 0; k < nb; k++) acc[k] = re[k] * re[k] + im[k] * im[k]; nseg = 1;
    }
    const f = new Float64Array(nb), y = new Float64Array(nb);
    for (let k = 0; k < nb; k++) {
      f[k] = k * fs / nfft;
      const p = acc[k] / nseg;
      if (opt.scale === 'amp') { y[k] = Math.sqrt(p) * (k === 0 || k === nb - 1 ? 1 : 2) / s1; }       // tepe genlik
      else if (opt.scale === 'rms') { y[k] = Math.sqrt(p) * (k === 0 || k === nb - 1 ? 1 : Math.SQRT2) / s1; }
      else { y[k] = p / (fs * s2) * (k === 0 || k === nb - 1 ? 1 : 2); }                           // birim²/Hz
    }
    // Doğruluk bilgileri: ENBW, etkin ortalama sayısı ve serbestlik derecesi (Welch, örtüşmeli pencere korelasyonu ile)
    const enbw = fs * s2 / (s1 * s1); let K = nseg, ro = 0;
    if (nseg > 1) { let wa = 0; for (let m = 1; m * hop < nfft; m++) { let c = 0; for (let i = 0; i + m * hop < nfft; i++) c += w[i] * w[i + m * hop]; const r = c / s2; if (r < 1e-6) break; wa += 2 * r * r * (1 - m / nseg); } ro = wa; K = nseg / (1 + wa); }
    return {f, y, nseg, nfft, df: fs / nfft, enbw, keff: K, dof: 2 * K, hop, s1, s2};
  }
  // Ki-kare kuantili (Wilson–Hilferty) ve Welch PSD için %güven aralığı çarpanları [alt, üst]
  function chi2q(p, k) { const z = normQ(p), a = 2 / (9 * k); return k * Math.pow(1 - a + z * Math.sqrt(a), 3); }
  function normQ(p) { // Acklam yaklaşımı
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
      c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425; let q, r; if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) return -normQ(1 - p); q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function psdCI(dof, conf) { conf = conf || 0.95; const lo = dof / chi2q(1 - (1 - conf) / 2, dof), hi = dof / chi2q((1 - conf) / 2, dof); return [lo, hi]; }

  // Spektrogram: dB, kare sayısı en fazla maxFrames
  function spectrogram(x, fs, opt) {
    const nfft = Math.min(opt.nfft, nextPow2(x.length));
    const w = window(opt.win || 'hann', nfft);
    let s2 = 0; for (let i = 0; i < nfft; i++) s2 += w[i] * w[i];
    let hop = Math.max(1, Math.round(nfft * (1 - (opt.overlap ?? 0.5))));
    const maxFrames = opt.maxFrames || 1500;
    const frames0 = Math.floor((x.length - nfft) / hop) + 1;
    if (frames0 > maxFrames) hop = Math.ceil((x.length - nfft) / (maxFrames - 1));
    const nf = Math.max(1, Math.floor((x.length - nfft) / hop) + 1), nb = nfft / 2 + 1;
    const z = new Float32Array(nf * nb);
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    for (let fI = 0; fI < nf; fI++) {
      const st = fI * hop; let mean = 0;
      for (let i = 0; i < nfft; i++) mean += x[st + i]; mean /= nfft;
      for (let i = 0; i < nfft; i++) { re[i] = (x[st + i] - mean) * w[i]; im[i] = 0; }
      fft(re, im, false);
      for (let k = 0; k < nb; k++) z[fI * nb + k] = 10 * Math.log10((re[k] * re[k] + im[k] * im[k]) / (fs * s2) + 1e-30);
    }
    return {z, nf, nb, hop, nfft, df: fs / nfft, dt: hop / fs, tStart: (nfft / 2) / fs};
  }

  // ---- Butterworth / biquad ----
  function rbj(type, f0, Q, fs) {
    const w0 = 2 * Math.PI * f0 / fs, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * Q);
    let b0, b1, b2, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * cw; b2 = 1; }
    else throw new Error('tip');
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function firstOrder(type, fc, fs) {
    const K = Math.tan(Math.PI * fc / fs);
    if (type === 'lp') return [K / (1 + K), K / (1 + K), 0, (K - 1) / (K + 1), 0];
    return [1 / (1 + K), -1 / (1 + K), 0, (K - 1) / (K + 1), 0];
  }
  function butter(type, order, fc, fs) { // type lp|hp
    const sec = []; const N = order;
    fc = Math.min(fc, fs * 0.499);
    for (let k = 1; k <= Math.floor(N / 2); k++) {
      const Q = 1 / (2 * Math.sin((2 * k - 1) * Math.PI / (2 * N)));
      sec.push(rbj(type, fc, Q, fs));
    }
    if (N % 2) sec.push(firstOrder(type, fc, fs));
    return sec;
  }
  // tip: lp|hp|bp|bs|notch ; p: {order, f1, f2, Q}
  function design(type, p, fs) {
    const o = p.order || 4;
    if (type === 'lp') return butter('lp', o, p.f1, fs);
    if (type === 'hp') return butter('hp', o, p.f1, fs);
    if (type === 'bp') return butter('hp', o, p.f1, fs).concat(butter('lp', o, p.f2, fs));
    if (type === 'notch') { const s = []; const n = p.harmonics || 1; for (let h = 1; h <= n; h++) { const f = p.f1 * h; if (f < fs * 0.49) s.push(rbj('notch', f, p.Q || 30, fs)); } return s; }
    if (type === 'bs') { const f0 = Math.sqrt(p.f1 * p.f2), Q = f0 / (p.f2 - p.f1); const s = []; for (let i = 0; i < Math.max(1, Math.floor(o / 2)); i++) s.push(rbj('notch', f0, Q, fs)); return s; }
    throw new Error('Bilinmeyen filtre');
  }
  function sosRun(sos, x, y, reverse) {
    const n = x.length;
    for (let i = 0; i < n; i++) y[i] = x[i];
    for (const [b0, b1, b2, a1, a2] of sos) {
      let z1 = 0, z2 = 0;
      if (!reverse) {
        for (let i = 0; i < n; i++) { const v = y[i]; const o = b0 * v + z1; z1 = b1 * v - a1 * o + z2; z2 = b2 * v - a2 * o; y[i] = o; }
      } else {
        for (let i = n - 1; i >= 0; i--) { const v = y[i]; const o = b0 * v + z1; z1 = b1 * v - a1 * o + z2; z2 = b2 * v - a2 * o; y[i] = o; }
      }
    }
  }
  // sıfır faz (ileri-geri) süzme, uçlarda tek yönlü yansıtma
  function filtfilt(sos, x) {
    const n = x.length; if (!sos.length || n < 4) return Float64Array.from(x);
    const pad = Math.min(n - 1, 3000);
    const ext = new Float64Array(n + 2 * pad);
    for (let i = 0; i < pad; i++) { ext[pad - 1 - i] = 2 * x[0] - x[i + 1]; ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i]; }
    ext.set(x, pad);
    const t = new Float64Array(ext.length);
    sosRun(sos, ext, t, false); sosRun(sos, t, ext, true);
    return ext.slice(pad, pad + n);
  }

  // ---- Hampel / medyan ----
  function hampelFlags(x, k, nsig, del, gmin) {
    const n = x.length, w = 2 * k + 1, buf = new Float64Array(w), dev = new Float64Array(w);
    const flags = [];
    for (let i = 0; i < n; i++) {
      if (del && del[i]) continue;
      if (!isFinite(x[i])) continue;
      const a = Math.max(0, i - k), b = Math.min(n - 1, i + k); let m = 0;
      for (let j = a; j <= b; j++) if (!(del && del[j]) && isFinite(x[j])) buf[m++] = x[j];   // silinmiş / NaN örnekler medyanı bozmasın
      if (m < 3) continue;
      const sub = buf.subarray(0, m); sub.sort();
      const med = sub[m >> 1];
      for (let j = 0; j < m; j++) dev[j] = Math.abs(sub[j] - med);
      const dsub = dev.subarray(0, m); dsub.sort();
      const mad = 1.4826 * dsub[m >> 1];
      const d = Math.abs(x[i] - med);
      if (mad > 0 && d > nsig * mad && d > (gmin || 0)) flags.push(i);
    }
    return Uint32Array.from(flags);
  }

  // ---- Akustik temizleme ----
  function detrendLinear(x) {
    const n = x.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
    const d = n * sxx - sx * sx || 1, b = (n * sxy - sx * sy) / d, a = (sy - b * sx) / n;
    const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = x[i] - (a + b * i); return o;
  }
  // tık/pop: Hampel ile işaretle, genişlet, doğrusal ara değerle
  // Genel gürültü düzeyi (birinci farkın sağlam σ'sı): küçük pencerede MAD'in rastlantısal küçülmesinden doğan yanlış alarmları önler
  function clickMin(x) {
    const n = x.length, d = new Float64Array(Math.max(0, n - 1)); for (let i = 1; i < n; i++) d[i - 1] = Math.abs(x[i] - x[i - 1]);
    if (!d.length) return 0; const s = d.slice().sort(); return 6 * 1.4826 * s[s.length >> 1] / Math.SQRT2;
  }
  function declick(x, k, nsig, grow) {
    const flags = hampelFlags(x, k, nsig, null, clickMin(x));
    const n = x.length, bad = new Uint8Array(n);
    for (const i of flags) for (let j = Math.max(0, i - grow); j <= Math.min(n - 1, i + grow); j++) bad[j] = 1;
    const o = Float64Array.from(x); let cnt = 0;
    for (let i = 0; i < n; ) {
      if (!bad[i]) { i++; continue; }
      let j = i; while (j < n && bad[j]) j++;
      const a = i > 0 ? o[i - 1] : (j < n ? o[j] : 0), b = j < n ? o[j] : a;
      for (let m = i; m < j; m++) o[m] = a + (b - a) * (m - i + 1) / (j - i + 1);
      cnt += j - i; i = j;
    }
    return {y: o, count: cnt, events: flags.length};
  }
  // Sessiz bölüm yokken gürültü tabanı: her frekans için en düşük %pct çerçeve gücü (minimum istatistik).
  // Gauss gürültüde güç üstel dağılımlıdır: pct. yüzdelik = -ln(1-pct)·ortalama → ortalamaya çevrilir.
  function noiseFloorMinStat(x, N, pct) {
    pct = pct || 0.1; const nb = N / 2 + 1, w = window('hann', N), re = new Float64Array(N), im = new Float64Array(N);
    const nfr = Math.floor((x.length - N) / (N / 2)) + 1; if (nfr < 8) throw new Error('Gürültü tabanı tahmini için kayıt çok kısa');
    const use = Math.min(nfr, 600), P = []; for (let k = 0; k < nb; k++) P.push(new Float64Array(use));
    for (let f = 0; f < use; f++) {
      const st = Math.round(f * (nfr - 1) / Math.max(1, use - 1)) * (N / 2);
      for (let i = 0; i < N; i++) { re[i] = x[st + i] * w[i]; im[i] = 0; } fft(re, im, false);
      for (let k = 0; k < nb; k++) P[k][f] = re[k] * re[k] + im[k] * im[k];
    }
    const out = new Float64Array(nb), q = Math.max(0, Math.floor(pct * (use - 1))), c = -Math.log(1 - pct) ;
    for (let k = 0; k < nb; k++) { P[k].sort(); out[k] = P[k][q] / c; }
    // Sabit tonlarda yüzdelik tahmini gürültüyü şişirir (tonlar üstel dağılımlı değil): komşu medyanına göre sınırla
    const cap = new Float64Array(nb), R = 10;
    for (let k = 0; k < nb; k++) { const a = Math.max(0, k - R), b = Math.min(nb, k + R + 1), v = Array.from(out.subarray(a, b)).sort((p, r) => p - r); cap[k] = 2 * v[v.length >> 1]; }
    for (let k = 0; k < nb; k++) if (out[k] > cap[k]) out[k] = cap[k];
    return out;
  }
  // Test seviyesi plato tespiti (ör. -9/-6/-3/0 dB): pencere RMS'i dB'ye çevrilir, adım katlarına yuvarlanır, ardışık aynı seviyeler birleştirilir.
  // opt: step (dB), minDur (s), win (s), ref (Grms; verilmezse en yüksek seviye = 0 dB)
  function levelSegments(x, fs, opt) {
    const step = opt.step || 3, W = Math.max(64, Math.round((opt.win || 0.5) * fs)), nw = Math.floor(x.length / W), rms = new Float64Array(nw);
    for (let k = 0; k < nw; k++) { let s = 0, s2 = 0; for (let i = k * W; i < (k + 1) * W; i++) { s += x[i]; s2 += x[i] * x[i]; } const m = s / W; rms[k] = Math.sqrt(Math.max(0, s2 / W - m * m)); }
    const so = Array.from(rms).sort((a, b) => a - b); let ref = opt.ref || so[Math.min(nw - 1, Math.floor(nw * 0.95))] || 1;
    const lab = new Array(nw).fill(null), dbv = new Float64Array(nw), minLvl = -(step * 7 + step / 2);
    for (let k = 0; k < nw; k++) { const d = 20 * Math.log10(Math.max(rms[k], 1e-300) / ref); dbv[k] = d; if (d < minLvl) { lab[k] = 'idle'; continue; } const q = (Math.min(opt.ref ? 99 : 0, Math.round(d / step) * step)) || 0; if (Math.abs(d - q) <= 0.35 * step) lab[k] = q; }
    for (let k = 1; k + 1 < nw; k++) if (lab[k] === null && lab[k - 1] !== null && lab[k - 1] === lab[k + 1]) lab[k] = lab[k - 1];
    const segs = [], minW = Math.max(1, Math.ceil((opt.minDur || 1) * fs / W));
    for (let k = 0; k < nw;) {
      if (lab[k] === null || lab[k] === 'idle') { k++; continue; }
      let e = k; while (e < nw && lab[e] === lab[k]) e++;
      if (e - k >= minW) { let s = 0, s2 = 0; const i0 = k * W, i1 = e * W; for (let i = i0; i < i1; i++) { s += x[i]; s2 += x[i] * x[i]; } const m = s / (i1 - i0), g = Math.sqrt(Math.max(0, s2 / (i1 - i0) - m * m)); segs.push({level: lab[k], i0, i1, grms: g, db: 20 * Math.log10(g / ref)}); }
      k = e;
    }
    return {segs, ref, rms, win: W};
  }
  // Spektral gürültü azaltma: noiseSeg gürültü profili çıkarmak için
  function spectralDenoise(x, noiseSeg, opt) {
    const N = opt.nfft || 2048, hop = N / 4, w = window('hann', N);
    const nb = N / 2 + 1, re = new Float64Array(N), im = new Float64Array(N);
    let Pn = new Float64Array(nb), cnt = 0;
    if (opt.noisePower) Pn = Float64Array.from(opt.noisePower);
    else {
      for (let st = 0; st + N <= noiseSeg.length; st += hop) {
        for (let i = 0; i < N; i++) { re[i] = noiseSeg[st + i] * w[i]; im[i] = 0; }
        fft(re, im, false); for (let k = 0; k < nb; k++) Pn[k] += re[k] * re[k] + im[k] * im[k]; cnt++;
      }
      if (!cnt) throw new Error('Gürültü aralığı en az ' + N + ' örnek olmalı.');
      for (let k = 0; k < nb; k++) Pn[k] /= cnt;
    }
    const alpha = opt.alpha ?? 2, floor = Math.pow(10, -(opt.reduceDb ?? 15) / 20);
    const n = x.length, out = new Float64Array(n + N), norm = new Float64Array(n + N);
    const pad = new Float64Array(n + 2 * N); pad.set(x, N);
    let prevG = new Float64Array(nb).fill(1);
    for (let st = 0; st + N <= pad.length; st += hop) {
      for (let i = 0; i < N; i++) { re[i] = pad[st + i] * w[i]; im[i] = 0; }
      fft(re, im, false);
      const G = new Float64Array(nb);
      for (let k = 0; k < nb; k++) {
        const py = re[k] * re[k] + im[k] * im[k] + 1e-30;
        let g = Math.sqrt(Math.max(0, 1 - alpha * Pn[k] / py)); g = Math.max(floor, g);
        G[k] = 0.6 * g + 0.4 * prevG[k];
      }
      prevG = G;
      // frekans yönünde hafif yumuşatma
      const Gs = new Float64Array(nb); for (let k = 0; k < nb; k++) Gs[k] = (G[Math.max(0, k - 1)] + 2 * G[k] + G[Math.min(nb - 1, k + 1)]) / 4;
      for (let k = 0; k < nb; k++) { re[k] *= Gs[k]; im[k] *= Gs[k]; if (k > 0 && k < nb - 1) { re[N - k] = re[k]; im[N - k] = -im[k]; } }
      fft(re, im, true);
      for (let i = 0; i < N; i++) { const t = st + i - N; if (t >= 0 && t < n) { out[t] += re[i] / N * w[i]; norm[t] += w[i] * w[i]; } }
    }
    const y = new Float64Array(n); for (let i = 0; i < n; i++) y[i] = norm[i] > 1e-9 ? out[i] / norm[i] : x[i];
    return y;
  }

  // ---- yardımcılar ----
  function resample(x, n) { // doğrusal, bağıl konuma göre
    if (x.length === n) return x;
    const o = new Float64Array(n), m = x.length;
    if (m === 1) { o.fill(x[0]); return o; }
    const r = (m - 1) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) { const p = i * r, i0 = Math.floor(p), i1 = Math.min(m - 1, i0 + 1), f = p - i0; o[i] = x[i0] * (1 - f) + x[i1] * f; }
    return o;
  }
  function stats(x, del, i0, i1) {
    let n = 0, s = 0, s2 = 0, mn = Infinity, mx = -Infinity, nd = 0;
    for (let i = i0; i < i1; i++) {
      if (del && del[i]) { nd++; continue; }
      const v = x[i]; if (!isFinite(v)) continue;
      n++; s += v; s2 += v * v; if (v < mn) mn = v; if (v > mx) mx = v;
    }
    const mean = n ? s / n : NaN, rms = n ? Math.sqrt(s2 / n) : NaN;
    const std = n > 1 ? Math.sqrt(Math.max(0, (s2 - n * mean * mean) / (n - 1))) : NaN;
    return {n, mean, rms, std, min: mn, max: mx, p2p: mx - mn, deleted: nd};
  }
  function wavBlob(y, rate) {
    const n = y.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, y[i])) * 32767, true);
    return new Blob([buf], {type: 'audio/wav'});
  }
  // Otomatik parazit analizi: DC/eğilim, şebeke uğultusu (50/60 Hz + harmonikler), düşük frekans gürültüsü,
  // tık/pop, sessiz bölümden gürültü profili. Çıktı: {plan, log, noise:[a,b)|null}
  function autoClean(x, fs) {
    const n = x.length, log = [], plan = {dc: 'mean', hp: 0, lp: 0, notch: 0, nq: 30, nh: 1, click: false, ck: 5, cs: 8, dn: false, dnDb: 12, dnA: 2}, res = {plan, log, noise: null};
    let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
    let sd = 0; for (let i = 0; i < n; i++) sd += (x[i] - mean) ** 2; sd = Math.sqrt(sd / n);
    if (!(sd > 1e-12)) { log.push('Sinyal sabit; temizlenecek bir şey yok.'); plan.dc = 'none'; return res; }
    const dl = detrendLinear(x); let sr = 0; for (let i = 0; i < n; i++) sr += (dl[i]) ** 2; sr = Math.sqrt(sr / n);
    if (sr < 0.9 * sd) { plan.dc = 'lin'; log.push(`Eğilim: doğrusal kayma bulundu (σ ${sd.toPrecision(3)} → ${sr.toPrecision(3)}), çıkarılacak`); } else log.push('DC: ortalama çıkarılacak');
    // kırpılma bilgisi
    let mx = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > mx) mx = a; }
    let clip = 0; for (let i = 0; i < n; i++) if (Math.abs(x[i]) >= mx * 0.999) clip++;
    if (clip / n > 0.001) log.push(`UYARI: örneklerin %${(100 * clip / n).toFixed(2)}'i en büyük genlikte (doygunluk/kırpılma); bu bozulma filtreyle düzeltilemez.`);
    // PSD
    const nfft = Math.min(8192, nextPow2(n) >> (n < 16384 ? 1 : 0)); if (nfft < 256) return res;
    const P = welch(plan.dc === 'lin' ? dl : x, fs, {nfft, win: 'hann', overlap: 0.5, scale: 'psd', maxSeg: 600}), f = P.f, y = P.y, df = P.df, nyq = fs / 2;
    const med = (a, b) => { const c = Array.from(y.slice(Math.max(0, a), Math.min(y.length, b))).sort((p, q) => p - q); return c.length ? c[c.length >> 1] : 0; };
    // şebeke uğultusu
    let best = null;
    for (const f0 of [50, 60]) {
      let nh = 0, hits = [];
      for (let h = 1; h <= 10 && h * f0 < nyq * 0.95; h++) {
        const c = Math.round(h * f0 / df); let pk = 0; for (let i = c - 2; i <= c + 2; i++) if (y[i] > pk) pk = y[i];
        const base = (med(c - 40, c - 6) + med(c + 6, c + 40)) / 2 + 1e-300, db = 10 * Math.log10(pk / base);
        if (db >= 10) { hits.push(h); nh = h; }
      }
      if (hits.length && hits.includes(1) || hits.length >= 2) if (!best || hits.length > best.hits.length) best = {f0, hits, nh};
    }
    if (best) { let c = 0; while (best.hits.includes(c + 1)) c++; best.nh = Math.max(1, c); plan.notch = best.f0; plan.nh = best.nh; log.push(`Şebeke uğultusu: ${best.f0} Hz ve harmonikleri (${best.hits.join(', ')}. harmonik) → notch`); } else log.push('Şebeke uğultusu bulunmadı');
    // düşük frekans gürültüsü
    const fc = Math.min(20, nyq / 20), ref = med(Math.round(Math.min(200, nyq / 4) / df), Math.round(Math.min(2000, nyq / 2) / df));
    let lowPow = 0, lc = 0; for (let i = 1; i < y.length && f[i] < fc; i++) { lowPow += y[i]; lc++; }
    if (lc && ref > 0 && 10 * Math.log10(lowPow / lc / ref) > 20) { plan.hp = fc; log.push(`Düşük frekans gürültüsü (<${fc} Hz) baskın → yüksek geçiren ${fc} Hz`); } else log.push('Düşük frekans gürültüsü belirgin değil');
    if (fs > 44100) { plan.lp = 20000; log.push('Örnekleme >44,1 kHz: 20 kHz üstü alçak geçiren ile kesilecek'); }
    // ön temizleme kopyası (tık ve sessiz bölüm analizi için)
    let z = plan.dc === 'lin' ? dl : Float64Array.from(x, v => v - mean);
    if (plan.hp) z = filtfilt(design('hp', {order: 4, f1: plan.hp}, fs), z);
    if (plan.notch) z = filtfilt(design('notch', {f1: plan.notch, Q: plan.nq, harmonics: plan.nh}, fs), z);
    // tık / pop
    for (const sg of [8, 12]) {
      const fl = hampelFlags(z, 5, sg, null, clickMin(z)), frac = fl.length / n;
      if (frac < 0.005) { if (fl.length) { plan.click = true; plan.cs = sg; log.push(`Tık/pop: ${fl.length} olay (σ>${sg}) → temizlenecek`); } else log.push('Tık/pop bulunmadı'); break; }
      if (sg === 12) log.push(`Tık/pop: aykırı örnek oranı yüksek (%${(100 * frac).toFixed(2)}), sinyalin doğal yapısı olabilir; otomatik temizleme atlandı`);
    }
    // sessiz bölüm yoksa: durağan gürültü tabanını minimum istatistikle tahmin et (yalnızca sinyal/gürültü ayrımı mümkünse)
    let pkr = 0; { let mxp = 0; for (let i = 1; i < y.length; i++) if (y[i] > mxp) mxp = y[i]; pkr = 10 * Math.log10(mxp / (med(1, y.length) + 1e-300)); }
    const minStat = (why, range) => {
      if (n < 16384) { log.push(why + '; kayıt gürültü tabanı tahmini için çok kısa, spektral azaltma atlandı'); return; }
      if (range < 1.5 && pkr < 30) { log.push(why + '; kayıt durağan ve belirgin bir bileşen yok (sinyal/gürültü ayrılamaz), spektral azaltma atlandı'); return; }
      plan.dn = true; plan.dnMode = 'min'; plan.dnDb = 10; log.push(why + ' → durağan gürültü tabanı sinyalden otomatik tahmin edilecek (frekans başına en düşük %10 çerçeve), spektral azaltma 10 dB');
    };
    // sessiz bölüm -> gürültü profili
    const W = Math.max(16384, Math.round(fs * 0.5)), nw = Math.floor(n / W);
    if (nw >= 4) {
      const rms = [], clipW = []; for (let w = 0; w < nw; w++) { let s = 0, c = 0; for (let i = w * W; i < (w + 1) * W; i++) { s += z[i] * z[i]; if (Math.abs(x[i]) >= mx * 0.999) c++; } rms.push(Math.sqrt(s / W)); clipW.push(c > 0); }
      const ok = rms.map((r, i) => i).filter(i => !clipW[i]); const sorted = ok.map(i => rms[i]).sort((a, b) => a - b);
      if (sorted.length >= 4) {
        const q = sorted[0], top = sorted[Math.floor(sorted.length * 0.9)], range = 20 * Math.log10(top / (q + 1e-300));
        if (range >= 3 && q > 0) { const wi = ok.find(i => rms[i] === q); res.noise = [wi * W, (wi + 1) * W]; plan.dn = true; plan.dnDb = Math.min(18, Math.max(8, Math.round(range))); log.push(`Sessiz bölüm bulundu (${(wi * W / fs).toFixed(3)}–${((wi + 1) * W / fs).toFixed(3)} s, dinamik fark ${range.toFixed(1)} dB) → spektral gürültü azaltma ${plan.dnDb} dB`); }
        else minStat(`Belirgin sessiz bölüm yok (dinamik fark ${range.toFixed(1)} dB)`, range);
      } else minStat('Sessiz bölüm analizi için yeterli temiz pencere yok', 0);
    } else minStat('Kayıt kısa', 0);
    return res;
  }

  // WAV okuyucu: PCM 8/16/24/32 ve float 32/64, çok kanallı; kanallar tam ölçeğe (±1) normalize edilir
  function parseWav(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (u8.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Geçerli bir WAV dosyası değil');
    let p = 12, fmt = null, data = null;
    while (p + 8 <= u8.length) { const id = tag(p), sz = dv.getUint32(p + 4, true), b = p + 8;
      if (id === 'fmt ') fmt = {tag: dv.getUint16(b, true), ch: dv.getUint16(b + 2, true), rate: dv.getUint32(b + 4, true), bits: dv.getUint16(b + 14, true), ext: sz >= 26 ? dv.getUint16(b + 24, true) : 0};
      else if (id === 'data') { data = [b, Math.min(sz, u8.length - b)]; break; }
      p = b + sz + (sz & 1); }
    if (!fmt || !data) throw new Error('WAV başlığı eksik');
    const ft = fmt.tag === 0xFFFE ? fmt.ext : fmt.tag, B = fmt.bits >> 3, nch = fmt.ch, n = Math.floor(data[1] / (B * nch));
    if (!(ft === 1 || ft === 3) || ![1, 2, 3, 4, 8].includes(B)) throw new Error('Desteklenmeyen WAV biçimi (tür ' + ft + ', ' + fmt.bits + ' bit)');
    const out = Array.from({length: nch}, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) { const o = data[0] + (i * nch + c) * B; let v;
      if (ft === 3) v = B === 4 ? dv.getFloat32(o, true) : dv.getFloat64(o, true);
      else if (B === 1) v = (dv.getUint8(o) - 128) / 128; else if (B === 2) v = dv.getInt16(o, true) / 32768;
      else if (B === 3) { let x = u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16); if (x & 0x800000) x -= 0x1000000; v = x / 8388608; } else v = dv.getInt32(o, true) / 2147483648;
      out[c][i] = v; }
    return {rate: fmt.rate, channels: out, bits: fmt.bits, float: ft === 3};
  }

  // ---- Rezonans (mod) tespiti: FRF'nin Re/Im değerlerinden |H| tepeleri, yarı-güç bant genişliği ile sönüm ----
  // opt: promDb (en az tepe belirginliği, dB), fmin, fmax, max (en çok tepe sayısı)
  function resonances(f, re, im, opt = {}) {
    const n = f.length, mag = new Float64Array(n), promDb = opt.promDb ?? 3, fmin = opt.fmin ?? -Infinity, fmax = opt.fmax ?? Infinity;
    for (let i = 0; i < n; i++) mag[i] = Math.hypot(re[i], im[i]);
    const cand = []; for (let i = 1; i < n - 1; i++) if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && f[i] >= fmin && f[i] <= fmax && isFinite(mag[i])) cand.push(i);
    const out = [], ratio = 10 ** (promDb / 20);
    for (const i of cand) {
      let lm = mag[i], j = i; while (j > 0 && mag[j - 1] < mag[i]) { j--; if (mag[j] < lm) lm = mag[j]; }
      let rm = mag[i], k = i; while (k < n - 1 && mag[k + 1] < mag[i]) { k++; if (mag[k] < rm) rm = mag[k]; }
      const base = Math.max(lm, rm); if (!(mag[i] >= ratio * Math.max(base, 1e-300))) continue;
      // parabolik ara değer (tepe frekansı ve genliği)
      const a = mag[i - 1], b = mag[i], c = mag[i + 1], den = a - 2 * b + c, d = den !== 0 ? 0.5 * (a - c) / den : 0, df = f[i + 1] - f[i];
      const fn = f[i] + d * df, pk = b - 0.25 * (a - c) * d, half = pk / Math.SQRT2;
      let f1 = NaN, f2 = NaN;
      for (let q = i; q > 0; q--) if (mag[q - 1] < half) { f1 = f[q - 1] + (half - mag[q - 1]) / (mag[q] - mag[q - 1]) * (f[q] - f[q - 1]); break; }
      for (let q = i; q < n - 1; q++) if (mag[q + 1] < half) { f2 = f[q] + (mag[q] - half) / (mag[q] - mag[q + 1]) * (f[q + 1] - f[q]); break; }
      const bw = isFinite(f1) && isFinite(f2) ? f2 - f1 : isFinite(f1) ? 2 * (fn - f1) : isFinite(f2) ? 2 * (f2 - fn) : NaN, zeta = bw / (2 * fn);
      let imx = i, lo = isFinite(f1) ? f1 : f[Math.max(0, i - 3)], hi = isFinite(f2) ? f2 : f[Math.min(n - 1, i + 3)];
      for (let q = 0; q < n; q++) if (f[q] >= lo && f[q] <= hi && Math.abs(im[q]) > Math.abs(im[imx])) imx = q;
      out.push({i, fn, mag: pk, re: re[i], im: im[i], phase: Math.atan2(im[i], re[i]) * 180 / Math.PI, f1, f2, bw, zeta, q: zeta > 0 ? 1 / (2 * zeta) : NaN, fnIm: f[imx], prom: mag[i] / Math.max(base, 1e-300)});
    }
    out.sort((x, y) => y.mag - x.mag); const mx = opt.max || 20; const top = out.slice(0, mx); top.sort((x, y) => x.fn - y.fn); return top;
  }

  // ---- 1/3 oktav (ve 1/1 oktav) bant seviyeleri: PSD'nin bantlar üzerinden integrali ----
  function wA(f) { const f2 = f * f, r = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); return 20 * Math.log10(r) + 2.0; }
  function wC(f) { const f2 = f * f, r = 12194 ** 2 * f2 / ((f2 + 20.6 ** 2) * (f2 + 12194 ** 2)); return 20 * Math.log10(r) + 0.06; }
  // opt: frac (3 = 1/3 oktav, 1 = oktav), fmin, fmax, ref, weight ('Z'|'A'|'C'), win, overlap
  function octaveBands(x, fs, opt) {
    const frac = opt.frac || 3, fmin = opt.fmin || 20, fmax = Math.min(opt.fmax || fs / 2.5, fs / 2.2), ref = opt.ref || 1;
    const nfft = Math.min(131072, Math.max(1024, nextPow2(Math.ceil(fs / (fmin * (frac === 3 ? 0.06 : 0.12))))));
    const ps = welch(x, fs, {nfft, overlap: opt.overlap ?? 0.5, win: opt.win || 'hann', scale: 'psd', maxSeg: 3000});
    const df = ps.df, fc = [], L = [], P = [], step = frac === 3 ? 0.1 : 0.3, half = frac === 3 ? 0.05 : 0.15, W = opt.weight || 'Z';
    for (let n = -40; n <= 20; n++) {
      const c = 1000 * 10 ** (n * step), lo = c * 10 ** -half, hi = c * 10 ** half; if (hi < fmin * 0.999 || lo > fmax) continue;
      let pw = 0; for (let k = Math.max(0, Math.floor(lo / df)); k <= Math.min(ps.f.length - 1, Math.ceil(hi / df)); k++) { const a = Math.max(lo, (k - 0.5) * df), b = Math.min(hi, (k + 0.5) * df); if (b > a) pw += ps.y[k] * (b - a); }
      const wdb = W === 'A' ? wA(c) : W === 'C' ? wC(c) : 0; pw *= 10 ** (wdb / 10);
      fc.push(c); P.push(pw); L.push(10 * Math.log10(pw / (ref * ref) + 1e-300));
    }
    let tot = 0; for (const p of P) tot += p;
    return {fc: Float64Array.from(fc), L: Float64Array.from(L), power: Float64Array.from(P), overall: 10 * Math.log10(tot / (ref * ref) + 1e-300), nfft, df};
  }

  // ---- SRS: Smallwood rampa-değişmez dijital süzgeç, mutlak ivme yanıtı (SDOF) ----
  function srs(x, fs, freqs, Q) {
    const T = 1 / fs, z = 1 / (2 * Q), n = x.length, pos = new Float64Array(freqs.length), neg = new Float64Array(freqs.length);
    for (let j = 0; j < freqs.length; j++) {
      const w = 2 * Math.PI * freqs[j], wd = w * Math.sqrt(1 - z * z), E = Math.exp(-z * w * T), K = wd * T, C = E * Math.cos(K), Sn = E * Math.sin(K), Sp = Sn / K;
      const b0 = 1 - Sp, b1 = 2 * (Sp - C), b2 = E * E - Sp, a1 = -2 * C, a2 = E * E;
      let x1 = x[0], x2 = x[0], y1 = x[0], y2 = x[0], mx = -Infinity, mn = Infinity;   // başlangıçta sabit durum
      for (let i = 0; i < n; i++) { const xi = x[i], y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = y; if (y > mx) mx = y; if (y < mn) mn = y; }
      // artık yanıt: giriş bittikten sonra sıfır girişle salınım (en fazla ~2 periyot)
      const tail = Math.min(Math.ceil(2 * fs / freqs[j]), 200000);
      for (let i = 0; i < tail; i++) { const yy = b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = 0; y2 = y1; y1 = yy; if (yy > mx) mx = yy; if (yy < mn) mn = yy; }
      pos[j] = mx; neg[j] = -mn;
    }
    const mm = pos.map((v, i) => Math.max(v, neg[i])); return {f: Float64Array.from(freqs), pos, neg, maximax: mm};
  }
  function srsFreqs(fmin, fmax, ppo) { const o = []; for (let f = fmin; f <= fmax * 1.0001; f = f * 2 ** (1 / ppo)) o.push(f); return o; }

  // ---- FRF: H1, H2, koherans (x = giriş, y = çıkış) ----
  function frf(x, y, fs, opt) {
    const n0 = Math.min(x.length, y.length), nfft = Math.min(opt.nfft, nextPow2(n0)), w = window(opt.win || 'hann', nfft), nb = nfft / 2 + 1;
    let hop = Math.max(1, Math.round(nfft * (1 - (opt.overlap ?? 0.5)))); const maxSeg = opt.maxSeg || 4000; if ((n0 - nfft) / hop + 1 > maxSeg) hop = Math.ceil((n0 - nfft) / (maxSeg - 1));
    const Sxx = new Float64Array(nb), Syy = new Float64Array(nb), Sr = new Float64Array(nb), Si = new Float64Array(nb);
    const ar = new Float64Array(nfft), ai = new Float64Array(nfft), br = new Float64Array(nfft), bi = new Float64Array(nfft); let nseg = 0;
    for (let st = 0; st + nfft <= n0; st += hop) {
      let mx = 0, my = 0; for (let i = 0; i < nfft; i++) { mx += x[st + i]; my += y[st + i]; } mx /= nfft; my /= nfft;
      for (let i = 0; i < nfft; i++) { ar[i] = (x[st + i] - mx) * w[i]; ai[i] = 0; br[i] = (y[st + i] - my) * w[i]; bi[i] = 0; }
      fft(ar, ai, false); fft(br, bi, false);
      for (let k = 0; k < nb; k++) { Sxx[k] += ar[k] * ar[k] + ai[k] * ai[k]; Syy[k] += br[k] * br[k] + bi[k] * bi[k]; Sr[k] += ar[k] * br[k] + ai[k] * bi[k]; Si[k] += ar[k] * bi[k] - ai[k] * br[k]; }   // conj(X)*Y
      nseg++;
    }
    if (!nseg) throw new Error('Veri NFFT için çok kısa');
    const f = new Float64Array(nb), h1 = new Float64Array(nb), h2 = new Float64Array(nb), ph = new Float64Array(nb), coh = new Float64Array(nb);
    for (let k = 0; k < nb; k++) {
      f[k] = k * fs / nfft; const sxy2 = Sr[k] * Sr[k] + Si[k] * Si[k], sxy = Math.sqrt(sxy2);
      h1[k] = sxy / (Sxx[k] || 1e-300); h2[k] = Syy[k] / (sxy || 1e-300); ph[k] = Math.atan2(Si[k], Sr[k]) * 180 / Math.PI; coh[k] = sxy2 / ((Sxx[k] * Syy[k]) || 1e-300);
    }
    return {f, h1, h2, phase: ph, coh, nseg, nfft, df: fs / nfft};
  }

  return {chi2q, psdCI, noiseFloorMinStat, levelSegments, autoClean, fft, window, nextPow2, segment, welch, spectrogram, design, filtfilt, hampelFlags, detrendLinear, declick, spectralDenoise, resample, stats, wavBlob, octaveBands, resonances, parseWav, srs, srsFreqs, frf, wA, wC};
})();
if (typeof module !== 'undefined') module.exports = DSP;
