# Faz 6: v7.3 (HDF5) hücre/yapı/karakter/mantıksal/seyrek ve v5 seyrek test dosyaları (sentetik) -> /tmp/h5t/
import numpy as np, hdf5storage, scipy.io as sio, scipy.sparse as sp, os, sys
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/h5t'; os.makedirs(d, exist_ok=True)
cell = np.empty((1, 3), dtype=object); cell[0, 0] = np.array([[1.0, 2.0, 3.0]]); cell[0, 1] = 'merhaba'; cell[0, 2] = np.array([[7.0]])
S = {'a': np.array([[1.5]]), 'ad': 'deneme', 'v': np.arange(4.0).reshape(1, 4), 'ic': {'z': np.array([[9.0]])}}
spm = sp.csc_matrix(np.array([[0, 2.0, 0], [1.0, 0, 0], [0, 0, 3.5]]))
data = {'c': cell, 's': S, 'txt': 'Kanal_A', 'flag': np.array([[True, False, True]]), 'num': np.arange(6.0).reshape(2, 3)}
f73 = os.path.join(d, 'tree73.mat')
if os.path.exists(f73): os.remove(f73)
hdf5storage.savemat(f73, data, format='7.3', matlab_compatible=True)
import h5py   # seyrek: MATLAB düzeni (grup: data / ir / jc, MATLAB_sparse = satır sayısı)
with h5py.File(f73, 'a') as h:
    g = h.create_group('sp'); g.attrs['MATLAB_class'] = np.bytes_('double'); g.attrs['MATLAB_sparse'] = np.uint64(3)
    g['data'] = spm.data; g['ir'] = spm.indices.astype(np.uint64); g['jc'] = spm.indptr.astype(np.uint64)
sio.savemat(os.path.join(d, 'sp5.mat'), {'sp': spm, 'spl': sp.csc_matrix(np.array([[True, False], [False, True]])), 'num': np.arange(3.0)})
print('ok')
