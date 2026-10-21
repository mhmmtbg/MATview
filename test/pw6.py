import asyncio,sys
from playwright.async_api import async_playwright
url=open('/tmp/mv_url.txt').read().strip()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':1500,'height':900})
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto(url)
        await pg.wait_for_function("S.files.length===1",timeout=30000)
        print('otomatik açılan:',await pg.evaluate("S.files.map(f=>f.name+' '+f.channels.length)"), 'server:',await pg.evaluate("S.server"))
        # koyu tema + lasso testi
        await pg.evaluate("applyTheme('dark')")
        await pg.evaluate("""async()=>{const f=S.files[0]; const c=f.channels.find(c=>c.name==='GRUP_EncPosition_deg_YGYSK1'); await addToNewAxes([c]);}""")
        await pg.wait_for_function("S.plot.axes.length===1 && S.plot.axes[0].traces[0].ch.data",timeout=30000)
        await pg.keyboard.press('l'); box=await pg.locator('#cv-time').bounding_box()
        r=await pg.evaluate("S.plot.axes[0].rect")
        cx=box['x']+r['x']+r['w']/2; cy=box['y']+r['y']+r['h']/2
        await pg.mouse.move(cx-120,cy-80); await pg.mouse.down()
        for k in range(24):
            import math; a=k/24*6.283; await pg.mouse.move(cx+120*math.cos(a),cy+80*math.sin(a))
        await pg.mouse.up(); await pg.wait_for_timeout(200)
        print('lasso seçilen:',await pg.evaluate("selCount()"))
        await pg.screenshot(path='/tmp/d1.png')
        print('hata:',errs)
        await b.close()
asyncio.run(main())
