# Faz 5 (v2.19): stairs / area / errorbar figür çizimi ve İşlevler listesi
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.click('#viewtabs button[data-v=code]'); await pg.wait_for_timeout(300)
        await pg.fill('#codeCmd', "figure; area(1:5,[1 3 2 4 1]); hold on; stairs(1:5,[2 1 3 2 4]); errorbar(1:5,[1 2 3 2 1],0.3*ones(1,5)); x = lowpass(randn(1,500),0.2); disp(numel(x))"); await pg.press('#codeCmd', 'Enter'); await pg.wait_for_timeout(1500)
        out = await pg.evaluate("$('#codeOut').innerText"); assert '500' in out and 'Hata' not in out, out[-300:]
        await pg.wait_for_timeout(800); await pg.screenshot(path='/tmp/_faz9.png')
        assert not errs, errs
        print('pw_faz9 OK')
        await b.close()
asyncio.run(main())
