# 2 GB'ı aşan bir MAT v5 yapısı ve ondan sonra gelen değişkenler (seyrek dosya: veri bölgeleri sıfır, diskte yer kaplamaz).
#   python3 test/make_bigstruct.py <dosya.mat>
# Yapı: BIG.t (N×1), BIG.a (N×1), BIG.big1 (N×K, ~1.1 GB), BIG.big2 (N×K, ~1.1 GB), BIG.c (N×1);  ardından ARKA.t, ARKA.x
import struct, sys
path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/_mv_big/big.mat'
N, K = 1000, 140000            # 1000 × 140000 × 8 B = 1,12 GB
def pad8(n): return (n + 7) // 8 * 8
def numel(rows, cols, vals=None):
    db = rows * cols * 8
    body = struct.pack('<IIII', 6, 8, 6, 0) + struct.pack('<IIii', 5, 8, rows, cols) + struct.pack('<II', 1, 0) + struct.pack('<II', 9, db)
    return body, db, vals
def struct_el(name, fields):
    FN = 32; nb = name.encode(); nl = len(nb)
    nm = struct.pack('<II', 1, nl) + nb + b'\0' * (pad8(nl) - nl)
    fnames = b''.join(f[0].encode().ljust(FN, b'\0') for f in fields)
    hdr = struct.pack('<IIII', 6, 8, 2, 0) + struct.pack('<IIii', 5, 8, 1, 1) + nm + struct.pack('<HHi', 4, 5, FN) + struct.pack('<II', 1, len(fnames)) + fnames + b'\0' * (pad8(len(fnames)) - len(fnames))
    size = len(hdr) + sum(8 + len(f[1]) + pad8(f[2]) for f in fields)
    return hdr, size
def vec(n, f): return struct.pack('<%dd' % n, *[f(i) for i in range(n)])
t = vec(N, lambda i: i * 0.01)
fields = []
for nm, rows, cols, data in [('t', N, 1, t), ('a', N, 1, vec(N, lambda i: i * 2.0)), ('big1', N, K, None), ('big2', N, K, None), ('c', N, 1, vec(N, lambda i: -1.0 * i))]:
    body, db, _ = numel(rows, cols); fields.append((nm, body, db, data))
hdr, size = struct_el('BIG', fields)
assert size > 2**31, size
with open(path, 'wb') as fo:
    fo.write(b'MATLAB 5.0 MAT-file, test'.ljust(116, b' ') + b'\0' * 8 + struct.pack('<H', 0x0100) + b'IM')
    fo.write(struct.pack('<II', 14, size) + hdr)
    for nm, body, db, data in fields:
        fo.write(struct.pack('<II', 14, len(body) + pad8(db)) + body)
        if data is None: fo.seek(pad8(db), 1)
        else: fo.write(data + b'\0' * (pad8(db) - db))
    # yapıdan sonra gelen ikinci yapı
    f2 = []
    for nm, data in [('t', t), ('x', vec(N, lambda i: 7.0))]:
        body, db, _ = numel(N, 1); f2.append((nm, body, db, data))
    h2, s2 = struct_el('ARKA', f2)
    fo.write(struct.pack('<II', 14, s2) + h2)
    for nm, body, db, data in f2: fo.write(struct.pack('<II', 14, len(body) + pad8(db)) + body + data)
print(path, 'yapı boyutu', size)
