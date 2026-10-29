# v7.3 (HDF5) .mat test dosyaları (hdf5storage ile) -> /tmp/h5t/
import numpy as np, hdf5storage, os, sys
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/h5t'; os.makedirs(d, exist_ok=True); rng = np.random.default_rng(0)
base = {'x': rng.normal(0, 1, 5000), 'M': rng.normal(0, 1, (4, 300)), 'i16': (rng.normal(0, 1000, 2000)).astype(np.int16), 'u8': np.arange(256, dtype=np.uint8), 'f32': rng.normal(0, 1, 1000).astype(np.float32)}
hdf5storage.savemat(os.path.join(d, 'v73.mat'), base, format='7.3', matlab_compatible=True, compress=True)
hdf5storage.savemat(os.path.join(d, 'v73_latest.mat'), base, format='7.3', matlab_compatible=True, compress=False)
