import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'ornek/ornek_frf.unv']); await pg.wait_for_function('S.files.length===1', timeout=20000); await pg.wait_for_timeout(600)
        await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())"); await pg.evaluate("refreshRezPick()")
        await pg.click('button:has-text("Rezonansları bul ve çiz")'); await pg.wait_for_timeout(1200)
        print(await pg.inner_text('#rzTab')); await pg.screenshot(path='/tmp/rez1.png')
        await pg.click('#viewtabs [data-v=xy]'); await pg.wait_for_timeout(400); await pg.screenshot(path='/tmp/rez2.png')
        await pg.evaluate("rezToReport()"); print('rapor öğesi', await pg.evaluate("REP.items.length"))
        await pg.evaluate("clearPlot()"); print('temiz', await pg.evaluate("[S.specPlot.axes.length, S.xyPlot.axes.length, S.view]"), 'ERRS', errs); await b.close()
asyncio.run(main())
