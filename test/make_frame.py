# Sentetik telemetre çerçevesi: alt sistem sayfalı Excel + 12.500 baytlık karelerden oluşan binary + beklenen değerler -> /tmp/frm/
import numpy as np, openpyxl, json, os, shutil, sys, struct
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/frm'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
L, NF = 12500, 40; rng = np.random.default_rng(11)
HDR = ['Birim', 'Index', 'Değişken', 'Tip', 'Eleman Sayısı', 'Formül', 'Byte Endian', 'Bit Endian', 'Örnek Sayısı', 'Undersample Header', 'isUndersample']
def R(*a): a = list(a) + [None] * (11 - len(a)); return a
sheets = {
 'A': [R('A_10ms', 11, 'H1', 'UInt8', 4), R('A_10ms', 'auto', 'CNT', 'UInt16 ', 1, None, 'big'), R('A_5ms', 'auto', 'T1', 'UInt16', 1, 'X*0.01', None, None, 'B2'),
       R('A_5ms', 'AUTO', 'F1', 'Single', 1, None, None, None, 'B2'), R('A_10ms', 'auto', 'M12', 'uint12', 1, None, None, None, 4), R('A_10ms', 'auto', 'D24', 'int24', 1), R('A_10ms', 'auto', 'W', 'UInt8', 12)],
 'L': [R('L', 100, 'SEL', 'UInt8'), R('L', 'auto', 'LV', 'UInt16', None, 'if(SEL%4 == 1) X*2'), R('L', 'auto', 'LB', 'UInt8', None, 'if(%8 == 0) X'), R('L', 'auto', 'BADT', 'Foo')],
 'S': [R('S', 200, 'stream', 'stream', 16, None, None, None, None, 'AA BB 11', 1), R('S', 'auto', 'S1', 'UInt8', 1, None, None, None, None, None, 1), R('S', 'auto', 'S2', 'UInt16', 1, None, None, None, None, None, 1),
       R('S', 'i=1:3, (i-1)*2+10', 'S3', 'UInt8', 1, None, None, None, None, None, 1)],
 'O': [R('O', 12, 'OV', 'UInt8')],
 'Z': [R('Z', 12499, 'ZZ', 'UInt32')],
}
wb = openpyxl.Workbook(); wb.remove(wb.active)
for n, rows in sheets.items():
    ws = wb.create_sheet(n); ws.append(HDR); [ws.append(r) for r in rows]
wb.save(d + '/frame.xlsx')
json.dump([{'name': n, 'rows': [HDR] + rows} for n, rows in sheets.items()], open(d + '/rows.json', 'w'))
buf = rng.integers(0, 256, (NF, L), dtype=np.uint8); buf[:, 199:215] = 0; T = {}
def ch(k, v): T.setdefault(k, []).append(v)
for k in range(NF):
    f = buf[k]
    f[10:14] = [k, k + 1, k + 2, 7]; [ch(f'A/H1_{i+1}', int(f[10 + i])) for i in range(4)]
    f[14:16] = [(k >> 8) & 255, k & 255]; ch('A/CNT', k)    # big endian
    t = [1000 + 7 * k, 2000 + 3 * k]; f[16:20] = np.frombuffer(struct.pack('<2H', *t), np.uint8); [ch('A/T1', x * 0.01) for x in t]
    fl = [k + 0.5, -k - 0.25]; f[20:28] = np.frombuffer(struct.pack('<2f', *fl), np.uint8); [ch('A/F1', x) for x in fl]
    m = [k, 4095 - k, 100 + k, 2048]; b = bytearray(6)
    for pi in range(2): a, c = m[2 * pi], m[2 * pi + 1]; b[3 * pi] = a & 255; b[3 * pi + 1] = ((a >> 8) << 4) | (c & 15); b[3 * pi + 2] = c >> 4
    f[28:34] = list(b); [ch('A/M12', x) for x in m]
    v24 = -1000 - k; u = v24 & 0xFFFFFF; f[34:37] = [u & 255, (u >> 8) & 255, u >> 16]; ch('A/D24', v24)
    [ch('A/W', int(x)) for x in f[37:49]]
    f[99] = k % 4; ch('L/SEL', k % 4); lv = int(f[100]) | int(f[101]) << 8
    if k % 4 == 1: ch('L/LV', lv * 2); ch('L/LV_g', k)
    if k % 5:
        o = k % 3; f[199 + o:199 + o + 3] = [0xAA, 0xBB, 0x11]; p = 199 + o
        ch('S/S1', int(f[p + 3])); ch('S/S2', int(f[p + 4]) | int(f[p + 5]) << 8); [ch('S/S3', int(f[p + q])) for q in (9, 11, 13)]; ch('S/S_k', k)
buf.tofile(d + '/data.bin'); open(d + '/data_tail.bin', 'wb').write(buf.tobytes() + b'\x01\x02\x03')
json.dump(T, open(d + '/truth.json', 'w')); print('ok', d)
