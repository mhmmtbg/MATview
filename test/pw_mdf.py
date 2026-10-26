import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        for nm in ('v410_c2.mf4', 'unsorted.mf4'):
            await pg.set_input_files('#fileIn', ['/tmp/mdft/' + nm]); await pg.wait_for_timeout(1500)
            r = await pg.evaluate("(()=>{const f=S.files[S.files.length-1]; return [f.name, f.channels.map(c=>c.name+':'+c.n+':'+(1/c.dtS).toFixed(2)+':'+c.unit+':'+c.kind)]})()"); print(r)
        d = await pg.evaluate("(async()=>{const f=S.files.find(f=>f.name==='v410_c2.mf4'); const c=f.channels.find(c=>c.name.endsWith('acc_x')); await ensureLoaded(c); const t=f.channels.find(c=>c.name.endsWith('Temp1')); await ensureLoaded(t); return [c.data.length, c.fs, t.data[0], t.n, t.fs]})()"); print(d)
        assert d[0] == 4000 and abs(d[1] - 2000) < 1e-6 and d[3] == 200 and abs(d[4] - 10) < 1e-6, d
        # Spektrum (worker + MDF kanalı)
        await pg.evaluate("addToNewAxes([S.files.find(f=>f.name==='v410_c2.mf4').channels.find(c=>c.name.endsWith('acc_x'))],false)"); await pg.wait_for_timeout(300)
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
