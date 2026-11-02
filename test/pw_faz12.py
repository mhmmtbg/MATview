# v2.23 (sentetik veri): .mat içindeki zaman vektörü (zaman_s) örneklemeyi belirler; kayıp çerçeve boşlukları korunur, akustik 1× hızda çalar
import asyncio, os, sys
import numpy as np, scipy.io as sio
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; T = '/tmp/_mv_tvec/'; os.makedirs(T, exist_ok=True)
fs, spp = 8000, 80; n = spp * 500; k = np.arange(n) // spp
# basit: 52. ve 301. çerçeveden önce sırasıyla 2 ve 1 çerçeve kayıp
g = np.arange(500, dtype=float); g[52:] += 2; g[301:] += 1
t = (g[k] + (np.arange(n) % spp) / spp) * (spp / fs)
x = 0.3 * np.sin(2 * np.pi * 500 * t) + 0.01 * np.random.default_rng(1).standard_normal(n)
sio.savemat(T + 'tv.mat', {'zaman_s': t.reshape(-1, 1), 'BIRIM_as1': x.reshape(-1, 1)})
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required']); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [T + 'tv.mat']); await pg.wait_for_timeout(1500)
        r = await pg.evaluate("(()=>{const f=S.files[0];return {names:f.channels.map(c=>c.name), fs:f.channels[0].fs, kind:f.channels[0].kind, t:[f.channels[0].t(0), f.channels[0].t(52*80), f.channels[0].t(" + str(n - 1) + ")]}})()")
        print(r); ok(r['names'] == ['BIRIM_as1'], 'zaman vektörü kanal listesinde'); ok(abs(r['fs'] - fs) < 1e-6, 'fs zaman vektöründen alınmadı')
        ok(abs(r['t'][1] - t[52 * 80]) < 1e-9 and abs(r['t'][2] - t[-1]) < 1e-9, 'kayıp boşlukları zamanda korunmadı')
        await pg.evaluate("(async()=>{await addToNewAxes([S.files[0].channels[0]]);})()"); await pg.wait_for_timeout(600)
        await pg.click('#rtabs [data-t=acoustic]'); await pg.wait_for_timeout(200); await pg.evaluate("$('#acScope').value='all'")
        await pg.evaluate("acPlay(false)"); await pg.wait_for_timeout(1500)
        a = await pg.evaluate("S.audio ? [S.audio.speed, S.audio.buf.sampleRate] : null"); print('oynatma', a); ok(a == [1, fs], 'akustik 1× hızda çalmıyor')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz12:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
