# Sentetik telemetre çerçevesi: alt sistem sayfalı Excel + 12.500 baytlık karelerden oluşan binary + beklenen değerler -> /tmp/frm/
import numpy as np, openpyxl, json, os, shutil, sys, struct
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/frm'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
L, NF = 12500, 40; rng = np.random.default_rng(11)
HDR = ['Birim', 'Index', 'Değişken', 'Tip', 'Eleman Sayısı', 'Formül', 'Byte Endian', 'Bit Endian', 'Örnek Sayısı', 'Undersample Header', 'isUndersample']
def R(*a): a = list(a) + [None] * (11 - len(a)); return a
sheets = {
 'A': [R('A_10ms', 11, 'H1', 'UInt8', 4), R('A_10ms', 'auto', 'CNT', 'UInt16 ', 1, None, 'big'), R('A_5ms', 'auto', 'T1', 'UInt16', 1, 'X*0.01', None, None, 'B2'),
       R('A_5ms', 'AUTO', 'F1', 'Single', 1, None, None, None, 'B2'), R('A_10ms', 'auto', 'M12', 'uint12', 1, None, None, None, 4), R('A_10ms', 'auto', 'D24', 'int24', 1), R('A_10ms', 'auto', 'W', 'UInt8', 12),
       R('A_10ms', '50.2', 'FLG', 'bit3', 1)],
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
buf = rng.integers(0, 256, (NF, L), dtype=np.uint8); T = {}
def ch(k, v): T.setdefault(k, []).append(v)
# akış: paketler (14 bayt) arka arda, aralarda 0-3 dolgu baytı; her karede 16 baytlık yuva (200..215, 0 tabanlı 199..214)
stream = bytearray(); pk = []
while True:
    stream += bytes([0x01] * int(rng.integers(0, 4)))
    s1 = int(rng.integers(0, 0x70)); s2 = int(rng.integers(0, 0x7000)); s3 = [int(x) for x in rng.integers(0, 0x70, 3)]
    p = bytearray([0x01] * 14); p[0:3] = b'\xAA\xBB\x11'; p[3] = s1; p[4:6] = struct.pack('<H', s2); p[9] = s3[0]; p[11] = s3[1]; p[13] = s3[2]
    if len(stream) + 14 > NF * 16: stream += p[:max(0, NF * 16 - len(stream))]; break
    pk.append((len(stream), s1, s2, s3)); stream += p
stream = bytes(stream).ljust(NF * 16, b'\x01')[:NF * 16]
for i, (pos, s1, s2, s3) in enumerate(pk):
    fr = pos // 16; ch('S/S1', s1); ch('S/S2', s2); [ch(f'S/S3_{j+1}', s3[j]) for j in range(3)]; ch('S/_fr', fr)
for k in range(NF):
    f = buf[k]
    f[10:14] = [k, k + 1, k + 2, 7]; [ch(f'A/H1_{i+1}', int(f[10 + i])) for i in range(4)]
    f[14:16] = [(k >> 8) & 255, k & 255]; ch('A/CNT', k)
    t = [1000 + 7 * k, 2000 + 3 * k]; fl = [k + 0.5, -k - 0.25]    # blok: T1 s0, F1 s0, T1 s1, F1 s1 (blok boyu 6)
    f[16:18] = np.frombuffer(struct.pack('<H', t[0]), np.uint8); f[18:22] = np.frombuffer(struct.pack('<f', fl[0]), np.uint8)
    f[22:24] = np.frombuffer(struct.pack('<H', t[1]), np.uint8); f[24:28] = np.frombuffer(struct.pack('<f', fl[1]), np.uint8)
    [ch('A/T1', x * 0.01) for x in t]; [ch('A/F1', x) for x in fl]
    m = [k, 4095 - k, 100 + k, 2048]; bits = ''.join(format(x, '012b') for x in m)   # MSB-first bit akışı
    f[28:34] = [int(bits[i:i + 8], 2) for i in range(0, 48, 8)]; [ch('A/M12', x) for x in m]
    v24 = -1000 - k; u = v24 & 0xFFFFFF; f[34:37] = [u & 255, (u >> 8) & 255, u >> 16]; ch('A/D24', v24)
    [ch('A/W', int(x)) for x in f[37:49]]
    ch('A/FLG', (int(f[49]) >> 3) & 7)
    f[99] = k % 4; ch('L/SEL', k % 4); lv = int(f[100]) | int(f[101]) << 8
    if k % 4 == 1: ch('L/LV', lv * 2); ch('L/LV_g', k)
    f[199:215] = list(stream[k * 16:(k + 1) * 16])
buf.tofile(d + '/data.bin'); open(d + '/data_tail.bin', 'wb').write(buf.tobytes() + b'\x01\x02\x03')
json.dump(T, open(d + '/truth.json', 'w')); print('ok', d)
