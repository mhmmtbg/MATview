# Sentetik TDMS üretir (nptdms ile) — ornek/ornek.tdms
import numpy as np, sys, os
from nptdms import TdmsWriter, ChannelObject, RootObject, GroupObject
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'ornek', 'ornek.tdms')
fs = 2000.; t = np.arange(4000) / fs
with TdmsWriter(out) as w:
    root = RootObject({'name': 'Sentetik test', 'author': 'MATView'})
    g1 = GroupObject('Titresim', {'description': 'ivmeolcer'}); g2 = GroupObject('Sicaklik')
    for k in range(2):  # birden çok segment
        sl = slice(k * 2000, (k + 1) * 2000)
        c1 = ChannelObject('Titresim', 'ax', np.sin(2 * np.pi * 50 * t[sl]).astype(np.float64), {'unit_string': 'g', 'wf_increment': 1 / fs, 'wf_start_offset': 0.0})
        c2 = ChannelObject('Titresim', 'ay', (0.5 * np.sin(2 * np.pi * 120 * t[sl])).astype(np.float32), {'unit_string': 'g', 'wf_increment': 1 / fs})
        c3 = ChannelObject('Sicaklik', 'T1', (20 + t[sl]).astype(np.float64)[::100], {'unit_string': 'C', 'wf_increment': 0.05})
        c4 = ChannelObject('Sicaklik', 'sayac', np.arange(k * 20, k * 20 + 20, dtype=np.int32), {})
        w.write_segment([root, g1, g2, c1, c2, c3, c4])
# metin (olay listesi) kanalları — ayrı dosya
with TdmsWriter(out.replace('.tdms', '_olay.tdms')) as w:
    w.write_segment([RootObject({'name': 'olay testi'}), GroupObject('Olay Listesi'),
        ChannelObject('Olay Listesi', 'Zaman', np.array(['8:38:01 PM', '8:38:02 PM'])), ChannelObject('Olay Listesi', 'Mesaj', np.array(['Donanim hazir', 'Haberlesme Uygun']))])
    w.write_segment([ChannelObject('Olay Listesi', 'Mesaj', np.array(['Test basladi']))])
