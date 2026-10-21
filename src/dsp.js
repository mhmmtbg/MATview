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
  function window(type, n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
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
    return {f, y, nseg, nfft, df: fs / nfft};
  }

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
      const a = Math.max(0, i - k), b = Math.min(n - 1, i + k); let m = 0;
      for (let j = a; j <= b; j++) buf[m++] = x[j];
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
  // Spektral gürültü azaltma: noiseSeg gürültü profili çıkarmak için
  function spectralDenoise(x, noiseSeg, opt) {
    const N = opt.nfft || 2048, hop = N / 4, w = window('hann', N);
    const nb = N / 2 + 1, re = new Float64Array(N), im = new Float64Array(N);
    const Pn = new Float64Array(nb); let cnt = 0;
    for (let st = 0; st + N <= noiseSeg.length; st += hop) {
      for (let i = 0; i < N; i++) { re[i] = noiseSeg[st + i] * w[i]; im[i] = 0; }
      fft(re, im, false); for (let k = 0; k < nb; k++) Pn[k] += re[k] * re[k] + im[k] * im[k]; cnt++;
    }
    if (!cnt) throw new Error('Gürültü aralığı en az ' + N + ' örnek olmalı.');
    for (let k = 0; k < nb; k++) Pn[k] /= cnt;
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
    // sessiz bölüm -> gürültü profili
    const W = Math.max(16384, Math.round(fs * 0.5)), nw = Math.floor(n / W);
    if (nw >= 4) {
      const rms = [], clipW = []; for (let w = 0; w < nw; w++) { let s = 0, c = 0; for (let i = w * W; i < (w + 1) * W; i++) { s += z[i] * z[i]; if (Math.abs(x[i]) >= mx * 0.999) c++; } rms.push(Math.sqrt(s / W)); clipW.push(c > 0); }
      const ok = rms.map((r, i) => i).filter(i => !clipW[i]); const sorted = ok.map(i => rms[i]).sort((a, b) => a - b);
      if (sorted.length >= 4) {
        const q = sorted[0], top = sorted[Math.floor(sorted.length * 0.9)], range = 20 * Math.log10(top / (q + 1e-300));
        if (range >= 3 && q > 0) { const wi = ok.find(i => rms[i] === q); res.noise = [wi * W, (wi + 1) * W]; plan.dn = true; plan.dnDb = Math.min(18, Math.max(8, Math.round(range))); log.push(`Sessiz bölüm bulundu (${(wi * W / fs).toFixed(3)}–${((wi + 1) * W / fs).toFixed(3)} s, dinamik fark ${range.toFixed(1)} dB) → spektral gürültü azaltma ${plan.dnDb} dB`); }
        else log.push(`Belirgin sessiz bölüm yok (dinamik fark ${range.toFixed(1)} dB < 3 dB); spektral gürültü azaltma atlandı`);
      } else log.push('Sessiz bölüm analizi için yeterli temiz pencere yok');
    } else log.push('Kayıt, gürültü profili çıkarmak için çok kısa; spektral gürültü azaltma atlandı');
    return res;
  }
  return {autoClean, fft, window, nextPow2, segment, welch, spectrogram, design, filtfilt, hampelFlags, detrendLinear, declick, spectralDenoise, resample, stats, wavBlob};
})();
if (typeof module !== 'undefined') module.exports = DSP;
