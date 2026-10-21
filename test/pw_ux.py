import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SHOT = os.environ.get('SHOT', '/tmp/ux_')
W, H = int(os.environ.get('W', 1366)), int(os.environ.get('H', 768))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': W, 'height': H})
        errs = []
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error',) else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERR: ' + str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=SHOT + '1_welcome.png')
        print('welcome visible:', await pg.is_visible('#welcome'))
        await pg.click('#btnOpenM'); await pg.screenshot(path=SHOT + '2_menu.png'); await pg.keyboard.press('Escape')
        await pg.set_input_files('#fileIn', [ROOT + 'ornek/ornek_cerceve.xlsx', ROOT + 'ornek/ornek_veri.bin'])
        await pg.wait_for_selector('#modal:not(.hidden)', timeout=5000)
        await pg.click('#mfoot button.primary'); await pg.wait_for_function('S.files.length===1', timeout=60000); await pg.wait_for_timeout(500)
        print('welcome after load:', await pg.is_visible('#welcome'))
        names = await pg.evaluate("S.files[0].channels.filter(c=>c.dev==='Alanlar').slice(0,5).map(c=>c.name)"); print(names)
        # yeni alt grafikler (çift tık davranışı), sonra aynı grafiğe ekleme
        await pg.evaluate("async n=>{ const c=n.map(x=>S.files[0].channels.find(c=>c.name===x)); await addToNewAxes([c[0]]); await addToNewAxes([c[1]]); await addToAxes(S.plot.axes[0],[c[2]]); await addToAxes(S.plot.axes[0],[c[3]]); }", names)
        await pg.wait_for_timeout(800)
        print('axes:', await pg.evaluate("S.plot.axes.map(a=>a.traces.length)"))
        await pg.hover('#cv-time', position={'x': 300, 'y': 120}); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SHOT + '3_plot.png')
        # lejant tıkla -> gizle
        await pg.click('.lrow >> nth=0'); await pg.wait_for_timeout(200)
        print('trace0 visible:', await pg.evaluate("S.plot.axes[0].traces[0].visible"))
        await pg.click('.lrow >> nth=0'); await pg.wait_for_timeout(200)
        # sağ tık menü
        await pg.click('.lrow >> nth=1', button='right'); await pg.wait_for_timeout(200); await pg.screenshot(path=SHOT + '4_ctx.png')
        await pg.keyboard.press('Escape'); await pg.click('#cv-time', position={'x': 120, 'y': 60}); await pg.evaluate("closeMenus()")
        # iz kaldır (x) ve geri al
        before = await pg.evaluate("S.plot.axes[0].traces.length")
        await pg.hover('.lrow >> nth=0'); await pg.click('.lrow >> nth=0 >> .x'); await pg.wait_for_timeout(300)
        print('trace removed:', before, '->', await pg.evaluate("S.plot.axes[0].traces.length"), 'toast:', await pg.inner_text('#toast'))
        await pg.screenshot(path=SHOT + '5_removed.png')
        await pg.click('#toast .tact'); await pg.wait_for_timeout(300)
        print('after undo:', await pg.evaluate("S.plot.axes[0].traces.length"))
        # alt grafik kaldır
        await pg.hover('#cv-time', position={'x': 300, 'y': 100})
        await pg.click('.axbar >> nth=1 >> button >> nth=0'); await pg.wait_for_timeout(300)
        print('axes after remove:', await pg.evaluate("S.plot.axes.length")); await pg.click('#toast .tact'); await pg.wait_for_timeout(300)
        print('axes after undo:', await pg.evaluate("S.plot.axes.length"))
        # iz taşı
        await pg.evaluate("moveTrace(S.plot,S.plot.axes[0],0,S.plot.axes[1])"); await pg.wait_for_timeout(300)
        print('after move:', await pg.evaluate("S.plot.axes.map(a=>a.traces.length)"))
        # ayırıcı sürükle
        sep = await pg.evaluate("(()=>{const e=document.querySelector('.hsep').getBoundingClientRect();return [e.x+e.width/2,e.y+4]})()")
        h0 = await pg.evaluate("S.plot.axes.map(a=>Math.round(a.rect.h))")
        await pg.mouse.move(*sep); await pg.mouse.down(); await pg.mouse.move(sep[0], sep[1] - 60, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(300)
        print('heights', h0, '->', await pg.evaluate("S.plot.axes.map(a=>Math.round(a.rect.h))"))
        # çift tık tercih + ağaç satırı
        await pg.click('#btnSet'); await pg.screenshot(path=SHOT + '6_settings.png'); await pg.click('#btnKeys'); await pg.wait_for_timeout(200); await pg.screenshot(path=SHOT + '7_keys.png'); await pg.click('#mclose')
        await pg.click('#rtabs >> text=Analiz'); await pg.screenshot(path=SHOT + '8_analyze.png')
        # sürükle-bırak bölgeleri
        await pg.evaluate("showDZ()"); await pg.screenshot(path=SHOT + '9_dz.png'); await pg.evaluate("hideDZ()")
        print('tabs rows (heights):', await pg.evaluate("document.querySelector('#rtabs').offsetHeight"), 'toolbar h:', await pg.evaluate("document.querySelector('#toolbar').offsetHeight"))
        print('ERRS', errs)
        await b.close()
asyncio.run(main())
