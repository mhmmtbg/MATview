"""Sentetik kompleks FRF (UNV dataset 58, ASCII): iki SDOF mod. Gerçek veri değildir."""
import sys
out = sys.argv[1] if len(sys.argv) > 1 else 'ornek/ornek_frf.unv'
modes = [(100.0, 0.02, 1.0), (250.0, 0.05, 0.6)]; N = 2001; df = 0.25
vals = []
for i in range(N):
    f = i * df; hr = hi = 0.0
    for fn, z, A in modes:
        r = f / fn; d = (1 - r * r) ** 2 + (2 * z * r) ** 2; hr += A * (1 - r * r) / d; hi += A * (-2 * z * r) / d
    vals += [hr, hi]
L = ['    -1', '    -1', '    58', 'Sentetik FRF', 'NONE', 'DATE: 23-Oct-26', 'MATView test', 'NONE',
     '    4         1    0         0 SENSOR1          101   3 REF                1   3',
     f'         5{N:10d}         1  0.00000E+00  {df:.5E}  0.00000E+00',
     '        18    0    0    0 Frequency            Hz                  ', '        12    0    0    0 Acceleration         g/N                 ',
     '         0    0    0    0 NONE                 NONE                ', '         0    0    0    0 NONE                 NONE                ']
for k in range(0, len(vals), 6): L.append(''.join(f'{v:13.5E}' for v in vals[k:k + 6]))
L.append('    -1'); open(out, 'w').write('\n'.join(L) + '\n'); print(out, N, 'nokta')
