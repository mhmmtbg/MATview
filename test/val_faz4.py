# Faz 4 doğrulaması (sentetik): Butterworth / Chebyshev I / Bessel / FIR yanıtları scipy.signal ile, rainflow 'rainflow' paketi ile,
# keyfi NFFT Welch (tam Δf) scipy.signal.welch ile, kayan basıklık scipy.stats ile karşılaştırılır.
import numpy as np, subprocess, json, sys, os
from scipy import signal, stats
D = os.path.abspath(os.path.join(os.path.dirname(__file__), '../src/dsp.js'))
def node(js, inp=None):
    r = subprocess.run(['node', '-e', "const D=require('" + D + "');" + js], input=json.dumps(inp) if inp is not None else '', capture_output=True, text=True)
    if r.returncode: print(r.stderr); sys.exit(1)
    return json.loads(r.stdout)
fs = 1000.0; bad = 0
cases = [('butter', 'lp', 4, 100, 0), ('butter', 'hp', 5, 50, 0), ('butter', 'bp', 4, 80, 200), ('butter', 'bs', 3, 80, 200),
         ('cheby1', 'lp', 5, 120, 0), ('cheby1', 'hp', 4, 60, 0), ('cheby1', 'bp', 3, 50, 150), ('cheby1', 'bs', 4, 100, 180),
         ('bessel', 'lp', 4, 100, 0), ('bessel', 'hp', 3, 40, 0), ('bessel', 'bp', 4, 60, 160), ('bessel', 'lp', 8, 150, 0)]
w = np.linspace(0, fs / 2, 400)
for fam, t, N, f1, f2 in cases:
    js = "const F=D.filterDesign({family:'%s',type:'%s',order:%d,f1:%g,f2:%g,rp:1},%g);const r=D.freqResp(F,%g,400,false);console.log(JSON.stringify(Array.from(r.mag)))" % (fam, t, N, f1, f2, fs, fs)
    m = np.array(node(js))
    Wn = f1 if t in ('lp', 'hp') else [f1, f2]; bt = {'lp': 'lowpass', 'hp': 'highpass', 'bp': 'bandpass', 'bs': 'bandstop'}[t]
    sos = {'butter': lambda: signal.butter(N, Wn, bt, fs=fs, output='sos'), 'cheby1': lambda: signal.cheby1(N, 1, Wn, bt, fs=fs, output='sos'), 'bessel': lambda: signal.bessel(N, Wn, bt, fs=fs, output='sos', norm='phase')}[fam]()
    _, H = signal.sosfreqz(sos, worN=w, fs=fs); ref = 20 * np.log10(np.abs(H) + 1e-300)
    msk = ref > -80; err = np.max(np.abs(m[msk] - ref[msk])); ok = err < 0.01; bad += not ok
    print('%-7s %-2s N=%d  maks fark %.2e dB %s' % (fam, t, N, err, 'OK' if ok else 'HATA'))
for t, n, f1, f2, win in [('lp', 101, 100, 0, 'hamming'), ('hp', 81, 120, 0, 'hann'), ('bp', 129, 80, 200, 'blackman'), ('bs', 101, 100, 250, 'kaiser')]:
    b = node("console.log(JSON.stringify(Array.from(D.firwin(%d,'%s',%g,%g,%g,'%s',8.6))))" % (n, t, f1, f2, fs, win))
    cut = f1 if t in ('lp', 'hp') else [f1, f2]; pz = t in ('lp', 'bs')
    ref = signal.firwin(n, cut, window=('kaiser', 8.6) if win == 'kaiser' else win, pass_zero=pz, fs=fs)
    err = np.max(np.abs(np.array(b) - ref)); ok = err < 1e-9; bad += not ok; print('FIR %-2s %-8s maks fark %.2e %s' % (t, win, err, 'OK' if ok else 'HATA'))
# FIR sıfır faz uygulama = gecikme düzeltilmiş evrişim
rng = np.random.default_rng(3); x = rng.normal(size=5000); b = signal.firwin(101, 100, fs=fs)
y = np.array(node("const x=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(Array.from(D.firApply(Float64Array.from(%s),Float64Array.from(x),true))))" % json.dumps(b.tolist()), x.tolist()))
ref = np.convolve(x, b)[50:50 + 5000]; err = np.max(np.abs(y - ref)); ok = err < 1e-9; bad += not ok; print('FIR uygulama maks fark %.2e %s' % (err, 'OK' if ok else 'HATA'))
# rainflow
import rainflow
x = np.cumsum(rng.normal(size=3000)) + 5 * np.sin(np.arange(3000) / 30)
r = node("const x=JSON.parse(require('fs').readFileSync(0,'utf8'));const q=D.rainflow(Float64Array.from(x));console.log(JSON.stringify([Array.from(q.range),Array.from(q.mean),Array.from(q.count)]))", x.tolist())
mine = sorted(zip(np.round(r[0], 9), np.round(r[1], 9), r[2])); ref = sorted((round(a, 9), round(m, 9), c) for a, m, c, *_ in rainflow.extract_cycles(x))
ok = len(mine) == len(ref) and all(abs(a[0] - b[0]) < 1e-7 and abs(a[1] - b[1]) < 1e-7 and a[2] == b[2] for a, b in zip(mine, ref)); bad += not ok
print('rainflow çevrim', len(mine), len(ref), 'OK' if ok else 'HATA')
# keyfi NFFT Welch: fs=1000, Δf = 1 Hz → nperseg = 1000
x = np.sin(2 * np.pi * 123 * np.arange(20000) / fs) + rng.normal(0, .5, 20000)
f, p = signal.welch(x, fs, window='hann', nperseg=1000, noverlap=500, detrend='constant')
y = np.array(node("const x=JSON.parse(require('fs').readFileSync(0,'utf8'));const r=D.welch(Float64Array.from(x),1000,{df:1,win:'hann',overlap:0.5,scale:'psd',maxSeg:1e6});console.log(JSON.stringify([r.df,Array.from(r.y)]))", x.tolist())[1])
err = np.max(np.abs(y - p) / np.maximum(p, 1e-12)); ok = err < 1e-6 and len(y) == len(p); bad += not ok; print('Welch Δf=1 Hz N=1000 göreli fark %.2e %s' % (err, 'OK' if ok else 'HATA'))
x2 = x[:15000]; f, p = signal.welch(x2, fs, window='hann', nperseg=10000, noverlap=5000)
y = np.array(node("const x=JSON.parse(require('fs').readFileSync(0,'utf8'));const r=D.welch(Float64Array.from(x),1000,{df:0.1,win:'hann',overlap:0.5,scale:'psd',maxSeg:1e6});console.log(JSON.stringify(Array.from(r.y)))", x2.tolist()))
err = np.max(np.abs(y - p) / np.maximum(p, 1e-12)); ok = err < 1e-6; bad += not ok; print('Welch Δf=0.1 Hz N=10000 göreli fark %.2e %s' % (err, 'OK' if ok else 'HATA'))
# kayan basıklık / tepe faktörü
x = rng.standard_t(5, 4000)
r = node("const x=JSON.parse(require('fs').readFileSync(0,'utf8'));const q=D.slidingStats(Float64Array.from(x),100,2,1);console.log(JSON.stringify([Array.from(q.kurt),Array.from(q.crest)]))", x.tolist())
kref = [stats.kurtosis(x[i:i + 200], fisher=False) for i in range(0, 4000 - 200 + 1, 100)]
cref = [np.max(np.abs(x[i:i + 200] - x[i:i + 200].mean())) / x[i:i + 200].std() for i in range(0, 4000 - 200 + 1, 100)]
err = max(np.max(np.abs(np.array(r[0]) - kref)), np.max(np.abs(np.array(r[1]) - cref))); ok = err < 1e-9; bad += not ok; print('kayan basıklık/tepe faktörü maks fark %.2e %s' % (err, 'OK' if ok else 'HATA'))
print('SONUÇ', 'TAMAM' if not bad else '%d HATA' % bad); sys.exit(1 if bad else 0)
