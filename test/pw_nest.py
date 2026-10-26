import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        for nm in ('v5c.mat', 'v73.mat'):
            await pg.evaluate("S.files.length=0") if False else None
            await pg.set_input_files('#fileIn', ['/tmp/nest/' + nm]); await pg.wait_for_timeout(1500)
            if await pg.query_selector('#modal:not(.hidden)'): await pg.evaluate("document.querySelector('#mfoot button.primary,#mfoot button').click()"); await pg.wait_for_timeout(500)
            r = await pg.evaluate("(()=>{const f=S.files[S.files.length-1]; return [f.name, f.channels.map(c=>c.name+':'+c.n)]})()"); print(r)
            assert any(c.startswith('S.acc:1000') for c in r[1]) and any(c.startswith('C{1}:200') for c in r[1]), r
            d = await pg.evaluate("(async()=>{const c=S.files[S.files.length-1].channels.find(c=>c.name==='S.sub.y'); await ensureLoaded(c); return [c.data.length, c.data[299]]})()"); assert d == [300, 299], d
        await pg.set_input_files('#fileIn', ['/tmp/unvb/bin.unv']); await pg.wait_for_timeout(1500)
        r = await pg.evaluate("(()=>{const f=S.files[S.files.length-1]; return [f.name, f.channels.length, f.channels.map(c=>c.n)]})()"); print(r); assert r[0] == 'bin.unv' and r[2][0] == 400, r
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
