# MDF4 test dosyaları (asammdf ile + elle yazılmış sırasız-kayıt-kimlikli dosya) -> /tmp/mdft/ ; beklenen değerler exp.json
import numpy as np, os, json, shutil, struct, sys
from asammdf import MDF, Signal
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mdft'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d); rng = np.random.default_rng(31)
fs = 2000.0; n = 4000; t = np.arange(n) / fs; ax = rng.normal(0, 1, n); ay = rng.normal(0, 2, n).astype(np.float32); cnt = (np.arange(n) % 65536).astype(np.uint16)
tr = np.arange(0, 20, 0.1); temp_raw = (rng.integers(0, 4000, len(tr))).astype(np.int16)
exp = {}
def sigs():
    from asammdf.blocks import v4_blocks as v4b
    cc = v4b.ChannelConversion(conversion_type=v4b.v4c.CONVERSION_TYPE_LIN, a=0.05, b=-10.0)
    return [Signal(ax, t, name='acc_x', unit='g'), Signal(ay, t, name='acc_y', unit='g'), Signal(cnt, t, name='counter')], [Signal(temp_raw, tr, name='Temp1', unit='degC', conversion=cc)]
for ver in ['4.00', '4.10', '4.20']:
    for comp in [0, 1, 2]:
        m = MDF(version=ver); a, b = sigs(); m.append(a, comment='hızlı'); m.append(b, comment='yavaş')
        fn = os.path.join(d, 'v%s_c%d.mf4' % (ver.replace('.', ''), comp)); m.save(fn, compression=comp, overwrite=True); m.close()
        exp[os.path.basename(fn)] = {'acc_x': [float(x) for x in ax], 'acc_y': [float(x) for x in ay], 'counter': [float(x) for x in cnt], 'Temp1': [float(-10 + 0.05 * x) for x in temp_raw]}
        if comp == 0 and ver == '4.10': exp['_time_fast'] = [fs, n]
# okuma doğrulaması (asammdf)
chk = MDF(os.path.join(d, 'v410_c2.mf4')); assert np.allclose(chk.get('Temp1').samples, -10 + 0.05 * temp_raw); chk.close()
# --- elle: sırasız (kayıt kimlikli) iki kanal grubu, tek DG ---
def blk(id_, links, data):
    body = b''.join(struct.pack('<Q', l) for l in links) + data; length = 24 + len(body); return id_.encode() + b'\0\0\0\0' + struct.pack('<QQ', length, len(links)) + body
tA = np.arange(300) / 1000.0; vA = rng.normal(0, 1, 300); tB = np.arange(100) / 100.0; vB = rng.integers(-500, 500, 100).astype(np.int32)
recs = bytearray(); ia = ib = 0
order = ([1] * 3 + [2]) * 100  # sırasız: A,A,A,B ...
for g in order[:400]:
    if g == 1 and ia < 300: recs += struct.pack('<B', 1) + struct.pack('<dd', tA[ia], vA[ia]); ia += 1
    elif g == 2 and ib < 100: recs += struct.pack('<B', 2) + struct.pack('<di', tB[ib], int(vB[ib])); ib += 1
# yerleşim: bloklar sembolik bağlantılarla, ofsetler ikinci geçişte hesaplanır
sym = []
def S(key, id_, links, data): sym.append((key, id_, links, data))
S('hd', '##HD', ['dg', 0, 0, 0, 0, 0], struct.pack('<QhhBB', 0, 0, 0, 0, 0) + b'\0' * 2)
S('dg', '##DG', [0, 'cgA', 'dt', 0], struct.pack('<B', 1) + b'\0' * 7)
S('cgA', '##CG', ['cgB', 'cnA1', 'txA', 0, 0, 0], struct.pack('<QQHHIII', 1, 300, 0, 0, 0, 16, 0))
S('cgB', '##CG', [0, 'cnB1', 'txB', 0, 0, 0], struct.pack('<QQHHIII', 2, 100, 0, 0, 0, 12, 0))
cnd = lambda typ, sync, dt, bo, bits: struct.pack('<BBBBIIIIBBH', typ, sync, dt, 0, bo, bits, 0, 0, 0, 0, 0) + struct.pack('<6d', 0, 0, 0, 0, 0, 0)
S('cnA1', '##CN', ['cnA2', 0, 'nTA', 0, 0, 0, 0, 0], cnd(2, 1, 4, 0, 64)); S('cnA2', '##CN', [0, 0, 'nVA', 0, 0, 0, 'uA', 0], cnd(0, 0, 4, 8, 64))
S('cnB1', '##CN', ['cnB2', 0, 'nTB', 0, 0, 0, 0, 0], cnd(2, 1, 4, 0, 64)); S('cnB2', '##CN', [0, 0, 'nVB', 0, 0, 0, 'uB', 0], cnd(0, 0, 2, 8, 32))
for k, s in [('txA', 'Hizli'), ('txB', 'Yavas'), ('nTA', 'time'), ('nVA', 'valA'), ('nTB', 'time'), ('nVB', 'valB'), ('uA', 'g'), ('uB', 'rpm')]:
    b = s.encode() + b'\0'; S(k, '##TX', [], b + b'\0' * ((8 - len(b) % 8) % 8))
S('dt', '##DT', [], bytes(recs) + b'\0' * ((8 - len(recs) % 8) % 8))
off = 64; offs = {}
for key, id_, links, data in sym: offs[key] = off; off += 24 + 8 * len(links) + len(data)
out = bytearray(b'MDF     4.10    MATView ' + b'\0' * 4 + struct.pack('<H', 410) + b'\0' * 34)  # 64 bayt ID
assert len(out) == 64, len(out)
for key, id_, links, data in sym:
    ls = [offs[l] if isinstance(l, str) else l for l in links]; out += blk(id_, ls, data)
open(os.path.join(d, 'unsorted.mf4'), 'wb').write(bytes(out))
exp['unsorted.mf4'] = {'valA': [float(x) for x in vA], 'valB': [float(x) for x in vB]}
json.dump(exp, open(os.path.join(d, 'exp.json'), 'w')); print('ok', len(out))
