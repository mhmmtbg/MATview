# v2.30 (sentetik veri): çok dosyada sol panel düzeni ve büyük .mat açma
# - akordeon: yeni açılan dosya açık, diğerleri kapalı; tık: yalnız o dosya · Ctrl+tık: birlikte
# - arama: eşleşmesi olmayan dosyalar soluk; liste düzeni seçeneği yalnız birden çok dosyada
# - "Parametreye göre": aynı adlı parametre tek satır (n dosya), çift tık → tek grafikte, lejantta dosya adları
# - tembel .mat okuma (MAT.lazyMin = 0 ile küçük dosyada): kanal listesi ve veri aynı
import asyncio, os, sys, subprocess, tempfile
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = tempfile.mkdtemp(prefix='mv_cok_')
subprocess.run(['python3', '-c', f'''
import numpy as np, scipy.io as sio
for k in range(4):
    N = 500 + 100 * k; t = np.arange(N) * 0.01
    d = {{"OBC": {{"zaman_s": t, "sicaklik": np.sin(t) + k, "gerilim": np.cos(t) * (k + 1)}}, "GPS": {{"zaman_s": t, "enlem": t * 0 + 39 + k}}}}
    if k == 2: d["OZEL"] = {{"zaman_s": t, "sadece_bende": t * 2}}
    sio.savemat("{D}/kayit_%d.mat" % k, d)
'''], check=True)
FILES = [D + '/kayit_%d.mat' % k for k in range(4)]
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(400)
        await pg.evaluate("try { localStorage.removeItem('mv.treeMode'); } catch (e) {} S.treeMode = null; 0")
        await pg.set_input_files('#fileIn', FILES[:1]); await pg.wait_for_function("S.files.length === 1")
        ok(await pg.evaluate("document.querySelector('#tmode').classList.contains('hidden')"), 'tek dosyada liste düzeni seçeneği görünmemeli')
        for k in range(1, 4):
            await pg.set_input_files('#fileIn', [FILES[k]]); await pg.wait_for_function("S.files.length === %d" % (k + 1))
        st = await pg.evaluate("[...document.querySelectorAll('#tree .fgrp')].map(g => [g.querySelector('.tfile .nm').textContent, g.classList.contains('open')])")
        print('gruplar', st)
        ok(len(st) == 4 and [o for _, o in st] == [False, False, False, True], 'yalnız son açılan dosya açık olmalı')
        ok(not await pg.evaluate("document.querySelector('#tmode').classList.contains('hidden')"), 'çok dosyada liste düzeni seçeneği görünmeli')
        # açık dosyanın listesi paneli doldurur (küçük kutuya sıkışmaz)
        hb = await pg.evaluate("(() => { const g = document.querySelector('#tree .fgrp.open .tbody'); return [g.getBoundingClientRect().height, g.scrollHeight]; })()")
        ok(hb[0] >= min(hb[1], 300) - 2, 'açık dosyanın listesi kısıtlı: %s' % hb)
        # tık: yalnız o · Ctrl+tık: birlikte
        await pg.click('#tree .fgrp:nth-child(1) .tfile')
        ok(await pg.evaluate("[...document.querySelectorAll('#tree .fgrp')].map(g => g.classList.contains('open')).join()") == 'true,false,false,false', 'tık yalnız o dosyayı açmalı')
        await pg.click('#tree .fgrp:nth-child(3) .tfile', modifiers=['Control'])
        ok(await pg.evaluate("[...document.querySelectorAll('#tree .fgrp')].map(g => g.classList.contains('open')).join()") == 'true,false,true,false', 'Ctrl+tık birlikte açmalı')
        # arama: eşleşmeyen dosya soluk
        await pg.fill('#q', 'sadece'); await pg.wait_for_timeout(400)
        nm = await pg.evaluate("[...document.querySelectorAll('#tree .fgrp')].map(g => g.classList.contains('nomatch')).join()")
        ok(nm == 'true,true,false,true', 'eşleşmeyen dosyalar soluk olmalı: ' + nm)
        await pg.fill('#q', ''); await pg.wait_for_timeout(400)
        # parametreye göre
        await pg.click('#tmode button[data-m=param]'); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("localStorage.getItem('mv.treeMode')") == 'param', 'düzen hatırlanmalı')
        ok(await pg.evaluate("document.querySelectorAll('#tree .fgrp').length") == 1, 'parametre düzeninde tek liste')
        await pg.click("#tree .tdev:has-text('OBC')"); await pg.click("#tree .tdev:has-text('OZEL')"); await pg.wait_for_timeout(200)
        rows = await pg.evaluate("[...document.querySelectorAll('#tree .trow, #tree .tdev')].map(r => r.textContent.replace(/\\s+/g, ' ').trim())")
        print('parametre satırları', rows[:8])
        ok(any('sicaklik' in r and '4 dosya' in r for r in rows), 'sicaklik 4 dosyada tek satır olmalı')
        ok(any('sadece_bende' in r and 'kayit_2' in r for r in rows), 'tek dosyadaki parametre dosya adıyla')
        # çift tık → tek grafik, lejantta dosya adları
        await pg.dblclick("#tree .trow:has-text('sicaklik')"); await pg.wait_for_timeout(1500)
        lab = await pg.evaluate("S.plot.axes.map(a => a.traces.map(t => t.label))")
        print('grafik', lab)
        ok(len(lab) == 1 and len(lab[0]) == 4 and len(set(lab[0])) == 4 and all('kayit_' in x for x in lab[0]), 'dört dosyanın sicaklik izi tek grafikte, ayırt edilebilir adlarla')
        await pg.click('#tmode button[data-m=file]'); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("document.querySelectorAll('#tree .fgrp').length") == 4, 'dosyaya göre düzene dönüş')
        # tembel .mat okuma tarayıcıda
        await pg.evaluate("MAT.lazyMin = 0; 0")
        await pg.set_input_files('#fileIn', [FILES[2]]); await pg.wait_for_function("S.files.length === 5")
        r = await pg.evaluate("""(async () => { const a = S.files[2], b = S.files[4]; const ca = a.channels.find(c => /sadece_bende/.test(c.name)), cb = b.channels.find(c => /sadece_bende/.test(c.name));
          await ensureLoaded(ca); await ensureLoaded(cb); return [b.mat.lazy, a.channels.length, b.channels.length, ca.data.length, cb.data.length, cb.data[7]]; })()""")
        print('tembel', r); ok(r[0] is True and r[1] == r[2] and r[3] == r[4] == 700 and abs(r[5] - 0.14) < 1e-9, 'tembel okuma: ' + str(r))
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz18:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
