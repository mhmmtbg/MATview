# MDF 3.x test dosyaları (asammdf ile, sentetik): sıralı iki grup, doğrusal dönüşümlü tamsayı, BE yok -> /tmp/mdft3/
import numpy as np, os, json, shutil, sys
from asammdf import MDF, Signal
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mdft3'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d); rng = np.random.default_rng(5)
fs = 1000.0; n = 3000; t = np.arange(n) / fs; ax = rng.normal(0, 1, n); ay = rng.normal(0, 2, n).astype(np.float32); cnt = (np.arange(n) % 1000).astype(np.uint16)
tr = np.arange(0, 10, 0.1); raw = rng.integers(0, 4000, len(tr)).astype(np.int16)
exp = {}
for ver in ['3.00', '3.30']:
    from asammdf.blocks import v2_v3_blocks as v3b
    cc = v3b.ChannelConversion(conversion_type=0, a=-10.0, b=0.05, unit=b'degC')
    m = MDF(version=ver); m.append([Signal(ax, t, name='acc_x', unit='g'), Signal(ay, t, name='acc_y', unit='g'), Signal(cnt, t, name='counter')], comment='hizli')
    m.append([Signal(raw, tr, name='Temp1', unit='degC', conversion=cc)], comment='yavas')
    fn = os.path.join(d, 'v%s.mdf' % ver.replace('.', '')); m.save(fn, overwrite=True); m.close()
    chk = MDF(fn); exp[os.path.basename(fn)] = {k: [float(x) for x in chk.get(k).samples] for k in ['acc_x', 'acc_y', 'counter', 'Temp1']}; exp['_t'] = [float(x) for x in chk.get('acc_x').timestamps[:3]]; chk.close()
json.dump(exp, open(os.path.join(d, 'exp.json'), 'w')); print('ok')
