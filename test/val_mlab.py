# MATLAB alt kümesi DSP işlevlerini scipy/numpy ile karşılaştırır
import numpy as np, scipy.signal as sg, json, subprocess, os, tempfile
rng=np.random.default_rng(1); x=rng.standard_normal(200); tr={'x':x.tolist()}
b,a=sg.butter(4,0.2); tr['b4']=b.tolist(); tr['a4']=a.tolist()
b2,a2=sg.butter(3,0.3,'high'); tr['bh']=b2.tolist(); tr['ah']=a2.tolist()
b3,a3=sg.butter(2,[0.1,0.4],'bandpass'); tr['bb']=b3.tolist(); tr['ab']=a3.tolist()
tr['ff']=sg.filtfilt(b,a,x,padlen=12).tolist(); tr['fl']=sg.lfilter(b,a,x).tolist()
F=np.fft.fft(x[:150]); tr['fre']=F.real.tolist(); tr['fim']=F.imag.tolist()
f,P=sg.welch(x,fs=100,window=np.hamming(64),nperseg=64,noverlap=32,nfft=128,detrend=False); tr['pw']=P.tolist()
tr['pf']=np.polyfit(np.arange(1,201)/10,x,3).tolist()
p=os.path.join(tempfile.gettempdir(),'ml_truth.json'); json.dump(tr,open(p,'w'))
r=subprocess.run(['node',os.path.join(os.path.dirname(os.path.abspath(__file__)),'t_mlab_dsp.js'),p],capture_output=True,text=True); print(r.stdout+r.stderr)
raise SystemExit(r.returncode)
