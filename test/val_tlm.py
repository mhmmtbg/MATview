# Telemetri tek .mat dosyası scipy ile açılmalı; her yapı alanı birim .mat dosyasındaki değişkenle aynı olmalı (t_tlm.js çıktısı).
import glob, os, sys, numpy as np, scipy.io
D = '/tmp/_mv_tlm/out/'
if not os.path.exists(D + 'kayit_tum.mat'): print('t_tlm.js çıktısı yok — atlandı'); sys.exit(0)
T = scipy.io.loadmat(D + 'kayit_tum.mat'); bad = 0; n = 0
for u in [k for k in T if not k.startswith('__')]:
    st = T[u][0, 0]; per = scipy.io.loadmat(D + u + '.mat')
    for f in st.dtype.names:
        if f == 't' or f.endswith('_t'): continue
        n += 1
        if f not in per or not np.array_equal(st[f], per[f], equal_nan=True): print('fark', u, f); bad += 1
    assert 't' in st.dtype.names, u + ': t yok'
print('scipy: ', n, 'alan karşılaştırıldı,', bad, 'fark'); sys.exit(1 if bad else 0)
