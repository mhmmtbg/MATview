import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'ornek/ornek.tdms']); await pg.wait_for_function('S.files.length===1', timeout=20000); await pg.wait_for_timeout(800)
        print(await pg.evaluate("S.files[0].channels.map(c=>[c.name,c.n,c.dtS,c.kind,c.unit].join('|'))"))
        print('eksen', await pg.evaluate("S.plot.axes.length"), 'iz', await pg.evaluate("S.plot.axes.reduce((a,x)=>a+x.traces.length,0)"))
        print('x aralığı', await pg.evaluate("(()=>{const c=S.files[0].channels[0];return [c.n*c.dtS]})()"))
        await pg.screenshot(path='/tmp/tdms.png'); print('ERRS', [e for e in errs]); await b.close()
asyncio.run(main())
