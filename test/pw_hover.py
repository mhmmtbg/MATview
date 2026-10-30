# İmleç konumu yazısı görünüm çubuğunu büyütmemeli / grafik alanını yeniden boyutlandırmamalı (dar pencere dahil)
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); bad = 0
        for w in (1500, 1100, 900):
            pg = await b.new_page(viewport={'width': w, 'height': 800}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
            await pg.evaluate("""async()=>{const d=new Float64Array(20000); for(let i=0;i<d.length;i++) d[i]=1234.567891+i*0.123456789; const c=addDerived('SAYAC',d,null); c.dtS=1/3333.3; await addToNewAxes([c]); S.plot.fitAll();}""")
            await pg.wait_for_timeout(200)
            m0 = await pg.evaluate("[$('#viewbar').getBoundingClientRect().height, S.plot.H, S.plot.W]")
            r = await pg.evaluate("(()=>{const r=S.plot.cv.getBoundingClientRect(); return [r.left,r.top,r.width,r.height]})()")
            hs = set()
            for k in range(12):
                await pg.mouse.move(r[0] + r[2] * (0.2 + 0.05 * k), r[1] + r[3] * 0.4); await pg.wait_for_timeout(40)
                hs.add(tuple(await pg.evaluate("[$('#viewbar').getBoundingClientRect().height, S.plot.H, S.plot.W]")))
            txt = await pg.inner_text('#hoverinfo'); ok = len(hs) == 1 and list(hs)[0] == tuple(m0) and not errs
            print(w, m0, hs, repr(txt), 'OK' if ok else 'HATA'); bad += not ok
            if w == 900: await pg.screenshot(path='/tmp/claude-0/hover900.png')
            await pg.close()
        await b.close(); print('hover:', 'OK' if not bad else 'HATA'); raise SystemExit(bad)
asyncio.run(main())
