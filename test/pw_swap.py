# Grafiği değiştir düğmesi, .txt içe aktarma (boşluk ayraçlı) ve silinen noktaların çizgiyi kesmemesi
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
open('/tmp/test_sp.txt', 'w').write('# deneme\nInstrument: X\n\nTime(s)  Acc_X(g)  Acc_Y(g)\n' + ''.join(f'{i/100:.3f}  {((i%50)-25)/10:.3f}  {((i%30)-15)/7:.3f}\n' for i in range(500)))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', ['/tmp/test_sp.txt']); await pg.wait_for_timeout(1200)
        assert await pg.query_selector('#modal:not(.hidden)'), 'txt tablo diyaloğu açılmadı'
        print(await pg.evaluate("document.querySelector('#mbody').innerText.slice(0,300)"))
        assert 'Acc_Y' in await pg.evaluate("document.querySelector('#mbody').innerText"), 'sütunlar okunamadı'
        await pg.evaluate("[...document.querySelectorAll('#mfoot button')].find(b=>b.classList.contains('primary')).click()"); await pg.wait_for_timeout(1200)
        n = await pg.evaluate("S.files[0].channels.length"); print('kanal', n); assert n == 2, n
        await pg.evaluate("addToNewAxes([S.files[0].channels[0]])"); await pg.wait_for_timeout(500)
        await pg.evaluate("addToNewAxes([S.files[0].channels[1]])"); await pg.wait_for_timeout(500)
        print("axes", await pg.evaluate("S.plot.axes.length"))
        await pg.evaluate("replacePlot([S.files[0].channels[1]])"); await pg.wait_for_timeout(600)
        r = await pg.evaluate("[S.plot.axes.length, S.plot.axes[0].traces.length, S.plot.axes[0].traces[0].ch.name]"); print(r); assert r[0] == 1 and r[1] == 1 and 'Acc_Y' in r[2], r
        # tree'de değiştir düğmesi var
        assert await pg.evaluate("!!document.querySelector('#tree button[title^=\"Mevcut grafiği kaldırıp\"]')"), 'ağaçta değiştir düğmesi yok'
        # silinen kısa boşluk köprülenir: çizim hatasız
        await pg.evaluate("(()=>{const c=S.files[0].channels[1]; c.applyDelete(Uint32Array.from([10,11,12,40])); S.plot.invalidate();})()"); await pg.wait_for_timeout(400)
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
