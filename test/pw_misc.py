import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'sablon/MATView_Cerceve_Sablonu.xlsx', ROOT + 'sablon/sablon_deneme.bin'])
        await pg.wait_for_selector('#modal:not(.hidden)'); await pg.click('#mfoot button.primary'); await pg.wait_for_function('S.files.length===1', timeout=60000)
        print(await pg.evaluate("(async()=>{const f=S.files[0],o={}; for(const n of ['PAKET12_A','PAKET12_B']){const c=f.channels.find(x=>x.name===n); await ensureLoaded(c); o[n]=Array.from(c.data.slice(0,4)).concat([c.data[500]])} return JSON.stringify(o)})()"))
        await pg.set_input_files('#fileIn', ['/tmp/test_f32.wav']); await pg.wait_for_function('S.files.length===2', timeout=20000); await pg.wait_for_timeout(500)
        print('toast', await pg.inner_text('#toast'), await pg.evaluate("S.plot.axes.length+' '+S.plot.axes[0].traces.map(t=>t.label)"))
        await pg.evaluate("setTab('analyze')"); await pg.evaluate("computeSpectrum()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("pickHarm()"); await pg.wait_for_timeout(500); print('f0', await pg.input_value('#hmF0'))
        await pg.screenshot(path='/tmp/harm.png'); print('ERRS', errs); await b.close()
asyncio.run(main())
