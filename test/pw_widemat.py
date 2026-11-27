# Telemetri tek .mat'i MATView'de açılınca oturumdaki (Çöz ve MATView'de aç) kanalların hepsi gelmeli.
# Regresyon: 256'dan çok elemanlı değişkenler (N satır × 300 sütun matris) kanala açılmıyor, kanallar sessizce eksik kalıyordu.
import asyncio, os, sys, json, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = '/tmp/_mv_w/'
subprocess.run(['node', ROOT + 'test/make_widemat.js', D], check=True, cwd=ROOT + 'test')
EXP = json.load(open(D + 'beklenen.json'))
JS = """async () => {
  const f = S.files[S.files.length - 1], by = {};
  f.channels.forEach(c => { const u = c.name.split('.')[0]; by[u] = (by[u] || 0) + 1; });
  const c = f.channels.find(c => c.name === 'WIDE.spec[137]'); let v = null, tt = null;
  if (c) { await ensureLoaded(c); v = [c.n, c.data[5], c.t(3)]; }
  return {total: f.channels.length, by, v};
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        bad = []
        for lazy in (False, True):   # küçük dosya + büyük dosya (parça parça okuma) kipi
            await pg.evaluate('S.files.length=0; MAT.lazyMin=%s' % ('1' if lazy else '1.5e9'))
            await pg.set_input_files('#fileIn', [D + 'out/kayit_tum.mat']); await pg.wait_for_timeout(2000)
            r = await pg.evaluate(JS); tag = 'lazy' if lazy else 'normal'
            print(tag, 'kanal', r['total'], 'beklenen', EXP['total'], 'WIDE', r['by'].get('WIDE'), 'örnek', r['v'])
            # .mat'te ≤256 baytlık byte dizileri de kanal olarak açılır (oturumda değil): her birimde en az oturumdaki kadar kanal
            for u, n in EXP['per'].items():
                if (r['by'].get(u) or 0) < n: bad.append((tag, 'eksik kanal', u, r['by'].get(u), n))
            if r['by'].get('WIDE') != EXP['per']['WIDE']: bad.append((tag, 'WIDE', r['by'].get('WIDE'), EXP['per']['WIDE']))
            if r['by'].get('CAM', 0) > 300: bad.append((tag, '863 baytlık payload kanala açılmamalı', r['by'].get('CAM')))
            if not r['v'] or r['v'][0] != 597 or abs(r['v'][2] - 0.03) > 1e-9: bad.append((tag, 'spec[137] zaman / uzunluk', r['v']))
        # 9 GB'lık kayıt benzetimi (küçültülmüş MAT sınırı): bölünen alanlar ve düz değişkenler — hiçbir kanal eksik olmamalı
        if EXP['nLost']: bad.append(('yazılamayan alan', EXP['nLost']))
        if EXP['nSplit'] < 2: bad.append(('bölme denenmedi', EXP['nSplit']))
        for lazy in (False, True):
            await pg.evaluate('S.files.length=0; MAT.lazyMin=%s' % ('1' if lazy else '1.5e9'))
            await pg.set_input_files('#fileIn', [D + 'bol/kayit_tum.mat']); await pg.wait_for_timeout(2000)
            r = await pg.evaluate("""async () => {
              const f = S.files[S.files.length - 1], U = %s, by = {};
              f.channels.forEach(c => { const u = U.find(u => c.name.startsWith(u + '.') || c.name.startsWith(u + '_')); if (u) by[u] = (by[u] || 0) + 1; });
              const c = f.channels.find(c => c.name === 'WIDE_spec_138'); let v = null;
              if (c) { await ensureLoaded(c); v = [c.n, Array.from(c.data.slice(0, 20)), c.t(3)]; }
              return {total: f.channels.length, by, v};
            }""" % json.dumps(list(EXP['per'].keys())))
            tag = 'bölünmüş ' + ('lazy' if lazy else 'normal')
            print(tag, 'kanal', r['total'], 'WIDE', r['by'].get('WIDE'))
            for u, n in EXP['per'].items():
                if (r['by'].get(u) or 0) < n: bad.append((tag, 'eksik kanal', u, r['by'].get(u), n))
            if not r['v'] or r['v'][1] != EXP['ref137'] or abs(r['v'][2] - 0.03) > 1e-9: bad.append((tag, 'WIDE_spec_138 değer / zaman', r['v'] and r['v'][2]))
        # 4 GB'ı aşan birimler "<birim>_<alan>" düz değişken yazılır: geniş matris "<birim>_t" ile yönlendirilmeli
        import numpy as np, scipy.io as sio
        N = 597; t = np.arange(N) * 0.01
        sio.savemat(D + 'duz.mat', {'WIDE_t': t[:, None], 'WIDE_frame_counter': np.arange(N)[:, None] * 1.0, 'WIDE_spec': np.random.rand(N, 300), 'OBC_t': t[:, None], 'OBC_temp': np.random.rand(N, 1)})
        await pg.evaluate('S.files.length=0; MAT.lazyMin=1.5e9')
        await pg.set_input_files('#fileIn', [D + 'duz.mat']); await pg.wait_for_timeout(1500)
        n = await pg.evaluate("S.files[0].channels.filter(c => /^WIDE_spec\\[/.test(c.name)).length")
        print('düz değişken WIDE_spec kanal', n)
        if n != 300: bad.append(('düz değişken', n))
        rep = await pg.evaluate("timeDiagReport(S.files[0])")
        if 'Kanala açılmayan' not in rep: bad.append('tanılama bölümü yok')
        await b.close()
        if errs: print('ERR', errs); sys.exit(1)
        if bad: print('HATALI', bad); sys.exit(1)
        print('OK')
asyncio.run(main())
