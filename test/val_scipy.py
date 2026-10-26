# scipy.signal.welch ile MATView DSP.welch karşılaştırması (aynı sentetik sinyal)
import numpy as np, subprocess, json, sys, os
from scipy.signal import welch
fs=8192; n=fs*8; rng=np.random.default_rng(1); x=0.7*np.sin(2*np.pi*1000.3*np.arange(n)/fs)+rng.normal(0,1.5,n)
f,p=welch(x,fs,window='hann',nperseg=2048,noverlap=1024,detrend='constant',scaling='density')
js="const D=require('"+os.path.abspath(os.path.join(os.path.dirname(__file__),'../src/dsp.js'))+"');const x=new Float64Array(JSON.parse(require('fs').readFileSync(0,'utf8')));const r=D.welch(x,8192,{nfft:2048,win:'hann',overlap:0.5,scale:'psd',maxSeg:100000});console.log(JSON.stringify(Array.from(r.y)))"
out=subprocess.run(['node','-e',js],input=json.dumps(x.tolist()),capture_output=True,text=True).stdout
y=np.array(json.loads(out)); err=np.max(np.abs(y-p)/np.maximum(p,1e-12)); print('maks göreli fark', err)
sys.exit(0 if err<1e-3 else 1)
