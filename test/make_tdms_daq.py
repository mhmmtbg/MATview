# DAQmx ham veri + NI ölçekleme içeren TDMS test dosyaları (nptdms'in test yardımcılarıyla üretilir; beklenen değerler nptdms okumasından) -> /tmp/tdmsq/
import numpy as np, os, sys, json, shutil, struct, binascii
from nptdms import TdmsFile
from nptdms.test.util import GeneratedFile, hexlify_value, string_hexlify, segment_objects_metadata, hex_properties, root_metadata, group_metadata, channel_metadata
from nptdms.test.test_daqmx import daqmx_channel_metadata, daqmx_scaler_metadata, digital_scaler_metadata
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tdmsq'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d); rng = np.random.default_rng(21)
def P(v):
    if isinstance(v, bool): return (0x21, '01' if v else '00')
    if isinstance(v, int): return (3, hexlify_value('<i', v))
    if isinstance(v, float): return (10, hexlify_value('<d', v))
    return (0x20, hexlify_value('<I', len(v)) + string_hexlify(v))
def props(**kw): return {k: P(v) for k, v in kw.items()}
def poly(i, co, src=0):
    p = {'NI_Scale[%d]_Scale_Type' % i: 'Polynomial', 'NI_Scale[%d]_Polynomial_Input_Source' % i: src, 'NI_Scale[%d]_Polynomial_Coefficients_Size' % i: len(co)}
    p.update({'NI_Scale[%d]_Polynomial_Coefficients[%d]' % (i, j): float(c) for j, c in enumerate(co)}); return p
TOC = ['kTocMetaData', 'kTocRawData', 'kTocDAQmxRawData', 'kTocNewObjList']
def hexb(b): return ' '.join('%02X' % x for x in b)
exp = {}
# A) iki kanal, tek tampon (genişlik 4), i16, polinom ölçekleme; 3 yığın
n = 400; a0 = rng.integers(-3000, 3000, n * 3).astype(np.int16); a1 = rng.integers(-3000, 3000, n * 3).astype(np.int16)
def scl(): return {'NI_Number_Of_Scales': 2}
pA0 = props(**scl(), **poly(1, [0.5, 0.01, 1e-7])); pA1 = props(**scl(), **poly(1, [-1.0, 0.002]))
meta = segment_objects_metadata(root_metadata(), group_metadata(),
    daqmx_channel_metadata('AI0', n, [4], [daqmx_scaler_metadata(0, 3, 0)], properties=pA0), daqmx_channel_metadata('AI1', n, [4], [daqmx_scaler_metadata(0, 3, 2)], properties=pA1))
data = b''.join(struct.pack('<hh', int(a0[i]), int(a1[i])) for i in range(n * 3))
g = GeneratedFile(); g.add_segment(TOC, meta, hexb(data)); open(d + '/daqA.tdms', 'wb').write(g.get_bytes_io_file().getvalue())
# B) f64 ham, ölçeksiz + ikinci segment (aynı yapı, yeni nesne listesi yok)
b0 = rng.normal(0, 1, 200); data = b''.join(struct.pack('<d', v) for v in b0)
meta = segment_objects_metadata(root_metadata(), group_metadata(), daqmx_channel_metadata('F0', 100, [8], [daqmx_scaler_metadata(0, 9, 0)]))
g = GeneratedFile(); g.add_segment(TOC, meta, hexb(data)); open(d + '/daqB.tdms', 'wb').write(g.get_bytes_io_file().getvalue())
# C) iki tampon (kart): tampon0 genişlik 2 (i16), tampon1 genişlik 4 (i32); kanal1 tampon0, kanal2 tampon1
c0 = rng.integers(-100, 100, 50).astype(np.int16); c1 = rng.integers(-100000, 100000, 50).astype(np.int32)
meta = segment_objects_metadata(root_metadata(), group_metadata(), daqmx_channel_metadata('B0', 50, [2, 4], [daqmx_scaler_metadata(0, 3, 0, 0)]), daqmx_channel_metadata('B1', 50, [2, 4], [daqmx_scaler_metadata(0, 5, 0, 1)]))
data = b''.join(struct.pack('<h', int(v)) for v in c0) + b''.join(struct.pack('<i', int(v)) for v in c1)
g = GeneratedFile(); g.add_segment(TOC, meta, hexb(data)); open(d + '/daqC.tdms', 'wb').write(g.get_bytes_io_file().getvalue())
# D) sayısal hat (bit 0 ve bit 3 ayrı kanallar, u8 geniş.1)
bits = rng.integers(0, 256, 60).astype(np.uint8)
meta = segment_objects_metadata(root_metadata(), group_metadata(), daqmx_channel_metadata('L0', 60, [1], [digital_scaler_metadata(0, 0, 0)], digital_line_scaler=True), daqmx_channel_metadata('L3', 60, [1], [digital_scaler_metadata(0, 0, 3)], digital_line_scaler=True))
g = GeneratedFile(); g.add_segment(TOC, meta, hexb(bits.tobytes())); open(d + '/daqD.tdms', 'wb').write(g.get_bytes_io_file().getvalue())
# E) normal (DAQmx olmayan) i16 kanal + Linear ve Table ölçekleme
e0 = rng.integers(-500, 500, 100).astype(np.int16); e1 = rng.integers(0, 100, 100).astype(np.int16)
def chmeta(name, dt, n, pr): 
    path = "/'Group'/'%s'" % name
    return hexlify_value('<I', len(path)) + string_hexlify(path) + '14 00 00 00' + hexlify_value('<I', dt) + '01 00 00 00' + hexlify_value('<Q', n) + hex_properties(pr)
tp = {'NI_Number_Of_Scales': 1, 'NI_Scale[0]_Scale_Type': 'Table', 'NI_Scale[0]_Table_Pre_Scaled_Values_Size': 3, 'NI_Scale[0]_Table_Scaled_Values_Size': 3}
for i, (x, y) in enumerate([(0, 0.0), (50, 10.0), (100, 40.0)]): tp['NI_Scale[0]_Table_Pre_Scaled_Values[%d]' % i] = float(x); tp['NI_Scale[0]_Table_Scaled_Values[%d]' % i] = y
lp = {'NI_Number_Of_Scales': 1, 'NI_Scale[0]_Scale_Type': 'Linear', 'NI_Scale[0]_Linear_Slope': 0.25, 'NI_Scale[0]_Linear_Y_Intercept': -3.0}
meta = segment_objects_metadata(root_metadata(), group_metadata(), chmeta('E0', 2, 100, props(**lp)), chmeta('E1', 2, 100, props(**tp)))
data = e0.tobytes() + e1.tobytes()
g = GeneratedFile(); g.add_segment(['kTocMetaData', 'kTocRawData', 'kTocNewObjList'], meta, hexb(data)); open(d + '/normE.tdms', 'wb').write(g.get_bytes_io_file().getvalue())
# beklenen değerler: nptdms (ölçekli okuma)
for nm in ['daqA', 'daqB', 'daqC', 'daqD', 'normE']:
    f = TdmsFile.read(d + '/%s.tdms' % nm); exp[nm] = {ch.name: [float(v) for v in (ch[:] if nm in ('daqA', 'normE') else ch.raw_data)] for grp in f.groups() for ch in grp.channels()}
json.dump(exp, open(d + '/exp.json', 'w')); print('ok', {k: {c: len(v) for c, v in e.items()} for k, e in exp.items()})
