# v2.52 (sentetik veri): bir kanalı dosyanın zaman ekseni yapmak
# - .mat: sayaç zamanında sahte 300 sn boşluk var; gerçek saat (tick, 10 ms) ile olay aralığı doğru çıkar
# - ölçek önerisi (tick → 0,01), geri giden / sıçrayan saat değerleri atlanır, timeIdx tersi, imleç, türetilmiş kanal, geri al
# - telemetri oturumunda da çalışır
import asyncio, os, sys, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        # t: 100 Hz sayaç zamanı, 20000. örnekte 300 sn sahte boşluk; tick: gerçek saat (5000 + k, 10 ms), iki bozuk değer
        await pg.evaluate("""(async () => { const n = 40000, t = new Float64Array(n), tick = new Float64Array(n), x = new Float64Array(n);
          for (let k = 0; k < n; k++) { t[k] = k * 0.01 + (k >= 20000 ? 300 : 0); tick[k] = 500000 + k; x[k] = (k === 10000 || k === 30000) ? 1 : 0; }
          tick[25000] = 9e9; tick[26000] = 3;   // bozuk okumalar
          await openFiles([new File([matWrite([{name: 't', data: t}, {name: 'tick', data: tick}, {name: 'olay', data: x}])], 'saat.mat')]); await sleep(200); 0 })()""")
        r0 = await pg.evaluate("(() => { const f = S.files[0], c = f.channels.find(c => c.name === 'olay'); return c.t(30000) - c.t(10000); })()")
        print('sayaç zamanıyla olay aralığı', r0); ok(abs(r0 - 500) < 1e-6, 'başlangıç: 500 sn (sahte boşluklu)')
        # kanal menüsü → diyalog → öneri 0,01
        await pg.evaluate("timeAxisDlg(S.files[0].channels.find(c => c.name === 'tick')); 0"); await pg.wait_for_selector('#modal:not(.hidden) input[type=number]')
        sug = await pg.evaluate("document.querySelector('#modal input[type=number]').value"); print('önerilen ölçek', sug); ok(sug == '0.01', 'ölçek önerisi 0,01')
        await pg.click('#mfoot button.primary'); await pg.wait_for_function("S.files[0].tmap", timeout=10000); await pg.wait_for_timeout(200)
        r = await pg.evaluate("""(() => { const f = S.files[0], c = f.channels.find(c => c.name === 'olay'); const M = f.tmap;
          return [c.t(30000) - c.t(10000), c.t(10000), Math.round(c.timeIdx(c.t(30000))), M.drop, document.querySelector('#toast').textContent]; })()""")
        print('saatle', r); ok(abs(r[0] - 200) < 1e-6 and abs(r[1] - 5100) < 1e-6, 'saat zamanıyla olay aralığı 200 sn, mutlak 5100 sn')
        ok(r[2] == 30000, 'timeIdx tersi'); ok(r[3] == 2, 'iki bozuk değer atlanmalı: %s' % r[3]); ok('zaman ekseni' in r[4], 'bildirim')
        # çizim + imleç + türetilmiş kanal
        r = await pg.evaluate("""(async () => { const f = S.files[0], c = f.channels.find(c => c.name === 'olay'); clearPlot(); await addToNewAxes([c], false); switchView('time'); S.plot.fitAll(); await sleep(200);
          const ax = S.plot.axes[0]; const d = addDerived('olay2', Float64Array.from(c.data), c, 0, true); return [ax.xlim, d.t(30000) - d.t(10000)]; })()""")
        print('xlim / türetilmiş', r); ok(r[0][0] >= 4999 and r[0][1] <= 5501, 'eksen saat zamanında'); ok(abs(r[1] - 200) < 1e-6, 'türetilmiş kanal eşlemeyi korumalı')
        rep = await pg.evaluate("timeDiagReport(S.files[0], {cursors: false})"); ok('ZAMAN EKSENİ: kanal' in rep, 'raporda zaman ekseni')
        print(rep[rep.find('== Sayaç'):rep.find('== Kanal')]); ok('== Sayaç / saat vektörleri' in rep and 'A1 (ZAMAN EKSENİ)' in rep and 'eş zamana göre hız: 100 sayım/s' in rep and '+1 ' in rep, 'raporda sayaç adımları')
        # bozuk ilk değer + sayaç sıfırlanması (taşma): eşleme yine doğru, köprülenir
        r = await pg.evaluate("""(async () => { const n = 40000, t = new Float64Array(n), tk = new Float64Array(n), x = new Float64Array(n);
          for (let k = 0; k < n; k++) { t[k] = k * 0.01 + (k >= 20000 ? 300 : 0); tk[k] = k < 25000 ? 4294000000 + k : k - 25000; x[k] = (k === 10000 || k === 30000) ? 1 : 0; }
          tk[0] = 7; tk[1] = 1e12;
          await openFiles([new File([matWrite([{name: 't', data: t}, {name: 'tick2', data: tk}, {name: 'olay', data: x}])], 'tasma.mat')]); await sleep(200);
          const f = S.files.find(f => f.name === 'tasma.mat'), c = f.channels.find(c => c.name === 'olay');
          f.tmap = await timeFromChannel(f.channels.find(c => c.name === 'tick2'), 0.01, 'zero'); return [c.t(30000) - c.t(10000), c.t(0), f.tmap.resets, f.tmap.outliers, f.tmap.n]; })()""")
        print('taşma', r); ok(abs(r[0] - 200) < 1e-6 and abs(r[1]) < 0.025 and r[2] == 1 and r[3] >= 2, 'bozuk ilk değer ve sayaç taşması: %s' % r)
        await pg.evaluate("timeAxisReset(S.files[0]); 0")
        ok(abs(await pg.evaluate("(() => { const c = S.files[0].channels.find(c => c.name === 'olay'); return c.t(30000) - c.t(10000); })()") - 500) < 1e-6, 'geri al')
        # telemetri oturumu: frame_counter × periyot → sayaç zamanıyla aynı
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        fr = next(x for x in pg.frames if x != pg.main_frame)
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await fr.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        await fr.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000); await pg.wait_for_timeout(500)
        r = await pg.evaluate("""(async () => { const f = S.files.find(f => f.tlm), fc = f.channels.find(c => /^OBC\\/frame_counter/.test(c.name)), a = f.channels.find(c => /^OBC\\//.test(c.name) && c !== fc);
          await ensureLoaded(a); const before = a.t(500); f.tmap = await timeFromChannel(fc, 0.01, 'raw'); await ensureLoaded(fc); return [before, a.t(500), fc.data[500] * 0.01, f.tmap.drop]; })()""")
        print('telemetri', r); ok(abs(r[1] - r[2]) < 1e-9, 'telemetri: zaman = sayaç × 0,01')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz32:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
