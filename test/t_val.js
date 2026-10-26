// Sayısal doğrulama: Welch PSD/RMS/amplitüd, ENBW, güven aralığı, oktav, Parseval — analitik referanslar
const DSP = require('../src/dsp.js'); let bad = 0; const ok = (n, c, d) => { console.log((c ? 'OK   ' : 'HATA ') + n + (d ? '  ' + d : '')); if (!c) bad++; };
const fs = 8192, N = 8192 * 16; let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
// 1) Sinüs: 0.5 g tepe, tam bin merkezinde (f = 1024 Hz), amp ölçeği tepe genliği vermeli
const x = new Float64Array(N); for (let i = 0; i < N; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 1024 * i / fs);
let r = DSP.welch(x, fs, {nfft: 4096, win: 'hann', overlap: 0.5, scale: 'amp'}); let pk = Math.max(...r.y);
ok('sinüs tepe genliği (amp)', Math.abs(pk - 0.5) < 0.5 * 0.002, pk.toFixed(5));
r = DSP.welch(x, fs, {nfft: 4096, win: 'hann', overlap: 0.5, scale: 'rms'}); pk = Math.max(...r.y); ok('sinüs RMS (rms)', Math.abs(pk - 0.5 / Math.SQRT2) < 0.002, pk.toFixed(5));
// 2) Beyaz gürültü: PSD = σ²/(fs/2); Parseval: ∫PSD df = σ²
const sig = 2, w = new Float64Array(N); for (let i = 0; i < N; i++) w[i] = sig * gauss();
r = DSP.welch(w, fs, {nfft: 2048, win: 'hann', overlap: 0.5, scale: 'psd'}); let m = 0, c = 0; for (let k = 5; k < r.y.length - 5; k++) { m += r.y[k]; c++; } m /= c;
ok('beyaz gürültü PSD seviyesi', Math.abs(m / (sig * sig / (fs / 2)) - 1) < 0.03, (m / (sig * sig / (fs / 2))).toFixed(4));
let tot = 0; for (let k = 0; k < r.y.length; k++) tot += r.y[k] * r.df; ok('Parseval (∫PSD = σ²)', Math.abs(tot / (sig * sig) - 1) < 0.03, (tot / (sig * sig)).toFixed(4));
// 3) ENBW (Hann = 1.5 bin), etkin ortalama sayısı
ok('Hann ENBW = 1.5·Δf', Math.abs(r.enbw / r.df - 1.5) < 1e-3, (r.enbw / r.df).toFixed(4));
const r0 = DSP.welch(w, fs, {nfft: 2048, win: 'hann', overlap: 0, scale: 'psd'}); ok('örtüşmesiz: etkin K = bölüt sayısı', Math.abs(r0.keff - r0.nseg) < 1e-6, r0.keff + '/' + r0.nseg);
ok('%50 Hann örtüşme: K/nseg ≈ 0.95 (Welch 1967)', Math.abs(r.keff / r.nseg - 0.947) < 0.02, (r.keff / r.nseg).toFixed(3));
// 4) Güven aralığı: χ² kuantil (scipy: chi2.ppf(.975,100)=129.561, chi2.ppf(.025,100)=74.222)
ok('chi2q(0.975,100)', Math.abs(DSP.chi2q(0.975, 100) - 129.561) < 0.3, DSP.chi2q(0.975, 100).toFixed(3)); ok('chi2q(0.025,100)', Math.abs(DSP.chi2q(0.025, 100) - 74.222) < 0.3, DSP.chi2q(0.025, 100).toFixed(3));
// ölçülen PSD tahminlerinin %95 aralığa girme oranı (ortalamaya göre)
const ci = DSP.psdCI(r.dof, 0.95); let inn = 0, tn = 0; const tru = sig * sig / (fs / 2); for (let k = 5; k < r.y.length - 5; k++) { tn++; if (r.y[k] * ci[0] <= tru && tru <= r.y[k] * ci[1]) inn++; }
ok('PSD %95 güven aralığı kapsaması', inn / tn > 0.9 && inn / tn < 0.99, (inn / tn).toFixed(3));
// 5) Oktav: beyaz gürültü genel seviyesi σ olmalı (A ağırlıksız)
const o = DSP.octaveBands(w, fs, {frac: 3, fmin: 20, fmax: 4000, ref: 1, weight: 'Z'}); const exp = 20 * Math.log10(sig * Math.sqrt((4000 - 20) / (fs / 2)));
ok('1/3 oktav genel seviye (beyaz gürültü, 20–4000 Hz)', Math.abs(o.overall - exp) < 0.7, o.overall.toFixed(2) + ' vs ' + exp.toFixed(2));
// 6) SRS: sönümsüz-yakın Q=10, f=100Hz sinüste kazanç ≈ Q
const t = new Float64Array(8192 * 2); for (let i = 0; i < t.length; i++) t[i] = Math.sin(2 * Math.PI * 100 * i / fs); const sr = DSP.srs(t, fs, [100], 10); const g = sr.maximax[0]; ok('SRS rezonans kazancı ≈ Q', Math.abs(g - 10) < 1.2, String(g));
console.log(bad ? bad + ' HATA' : 'val OK'); process.exit(bad ? 1 : 0);
