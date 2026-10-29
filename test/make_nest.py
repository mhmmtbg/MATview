# iç içe struct / cell içeren MAT dosyaları (v5 ve v7.3) + beklenen toplamlar -> /tmp/nest/
import numpy as np, scipy.io, os, json, sys
import shutil; d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/nest'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d, exist_ok=True); rng = np.random.default_rng(7)
acc = rng.normal(0, 1, 1000); x = rng.normal(0, 1, 500); y = np.arange(300.0); c1 = rng.normal(0, 1, 200); c2 = rng.normal(5, 1, 100).astype(np.float32); v1 = rng.normal(0, 1, 64); v2 = rng.normal(2, 1, 64)
top = rng.normal(0, 1, 800)
exp = {'S.acc': acc.sum(), 'S.sub.x': x.sum(), 'S.sub.y': y.sum(), 'C{1}': c1.sum(), 'C{2}': float(c2.astype(np.float64).sum()), 'top': top.sum()}
cell = np.empty((1, 2), dtype=object); cell[0, 0] = c1; cell[0, 1] = c2
base = {'S': {'acc': acc, 'sub': {'x': x, 'y': y}, 'fs': 1000.0}, 'C': cell, 'top': top}
tst = np.empty((1, 2), dtype=object); tst2 = np.zeros((1, 2), dtype=[('v', 'O')]); tst2[0, 0]['v'] = v1; tst2[0, 1]['v'] = v2
v5 = dict(base); v5['T'] = tst2
scipy.io.savemat(os.path.join(d, 'v5c.mat'), v5, do_compression=True); scipy.io.savemat(os.path.join(d, 'v5u.mat'), v5, do_compression=False)
exp5 = dict(exp); exp5['T(1).v'] = v1.sum(); exp5['T(2).v'] = v2.sum()
json.dump({'v5c.mat': exp5, 'v5u.mat': exp5}, open(os.path.join(d, 'exp.json'), 'w'))
try:
    import hdf5storage
    hdf5storage.savemat(os.path.join(d, 'v73.mat'), base, format='7.3', matlab_compatible=True, compress=True)
    e2 = json.load(open(os.path.join(d, 'exp.json'))); e2['v73.mat'] = exp; json.dump(e2, open(os.path.join(d, 'exp.json'), 'w'))
    # MATLAB tarzı struct dizisi: alan = nesne başvuruları (h5py ile elle)
    import h5py
    with h5py.File(os.path.join(d, 'v73arr.mat'), 'w', userblock_size=512) as f:
        g = f.create_group('T'); g.attrs['MATLAB_class'] = np.bytes_('struct'); refs = f.create_group('#refs#'); rr = []
        for i, a in enumerate((v1, v2)):
            ds = refs.create_dataset('a%d' % i, data=a.reshape(-1, 1)); ds.attrs['MATLAB_class'] = np.bytes_('double'); rr.append(ds.ref)
        fd = g.create_dataset('v', shape=(2, 1), dtype=h5py.ref_dtype)
        for i, r in enumerate(rr): fd[i, 0] = r
        fd.attrs['MATLAB_class'] = np.bytes_('double')
    e2 = json.load(open(os.path.join(d, 'exp.json'))); e2['v73arr.mat'] = {'T.v(1)': v1.sum(), 'T.v(2)': v2.sum()}; json.dump(e2, open(os.path.join(d, 'exp.json'), 'w'))
except Exception as e:
    import traceback; traceback.print_exc()
print('ok')
