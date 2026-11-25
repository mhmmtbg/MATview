# v2.49 (sentetik veri): telemetri oturumu (Çöz ve MATView'de aç) için zaman tanılama raporu
# - Ayarlar › Zaman tanılama raporu telemetri kaydını da kabul eder
# - kayıt / birim / parametre bölümleri, her parametrenin zaman kaynağı ve çerçeveden beklenen hız, imleç noktaları
# - birim ve parametre adları gizli
import asyncio, os, sys, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        await f.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000); await pg.wait_for_timeout(500)
        names = await pg.evaluate("""(async () => { const f = S.files.find(f => f.tlm); const a = f.channels.find(c => /^OBC\\//.test(c.name) && !c.tlmCol.counter), b2 = f.channels.find(c => c.tlmCol.conditional || c.tlmCol.ctx === 'stream') || f.channels[5];
          clearPlot(); await addToNewAxes([a], false); await addToNewAxes([b2], false); switchView('time'); await sleep(300);
          const A = S.plot.axes[0], B = S.plot.axes[1]; S.plot.cursors = [{axes: A, tr: A.traces[0], x: a.t(100), y: 0, i: 100, name: 'C1'}, {axes: B, tr: B.traces[0], x: b2.t(Math.floor(b2.n / 2)), y: 0, i: Math.floor(b2.n / 2), name: 'C2'}];
          S.plot.invalidate(); return [a.name, b2.name]; })()""")
        print('imleçli kanallar', names)
        t0 = __import__('time').time(); await pg.click('#btnSet'); await pg.click('#btnTdiag')
        try: await pg.wait_for_selector('.mx-rep', timeout=60000)
        except Exception: print('TOAST', await pg.evaluate("document.querySelector('#toast').textContent"), errs); raise
        print('rapor süresi %.1f sn' % (__import__('time').time() - t0))
        rep = await pg.inner_text('.mx-rep'); print(rep[:1200]); print(rep[rep.find('== Saat'):rep.find('== Parametrelerin')]); print(rep[rep.find('== İmleç'):])
        ok('telemetri oturumu' in rep and '== Kayıt ==' in rep and '== Birimler' in rep and '== Parametrelerin zamanı ==' in rep, 'bölümler')
        ok('Çerçeve periyodu: 10 ms' in rep, 'periyot')
        ok('İmleç noktaları (2)' in rep and 'örnek 101' in rep and 'birim satırı 101' in rep, 'imleç noktası')
        ok('çerçeveden beklenen 100 Hz' in rep, 'beklenen hız')
        units = await pg.evaluate("S.files.find(f => f.tlm).tlm.ss.units.map(u => u.name)")
        leak = [u for u in units if len(u) > 2 and u in rep] + [n.split('/')[1] for n in names if n.split('/')[1] in rep]
        ok(not leak, 'raporda ad kalmamalı: %s' % leak)
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz31:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
