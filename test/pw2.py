import os
import asyncio, time, json, base64
from playwright.async_api import async_playwright
UP=os.environ.get('MATVIEW_TEST_DATA','./testdata/')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':1500,'height':900})
        errs=[]
        pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' and 'api/args' not in m.text else None)
        pg.on('pageerror',lambda e: errs.append('PAGEERR: '+str(e)))
        await pg.goto('file:///home/claude/matview/dist/matview.html')
        await pg.set_input_files('#fileIn',[UP+'veri_A.mat'])
        await pg.wait_for_function("S.files.length===1",timeout=60000)
        await pg.evaluate("""async()=>{const f=S.files[0]; const c=f.channels.find(c=>c.name==='DOSYAA_anak100_1_as41'); await addToNewAxes([c]);}""")
        await pg.wait_for_function("S.plot.axes.length===1 && S.plot.axes[0].traces[0].ch.data",timeout=60000)
        await pg.wait_for_timeout(300)
        box=await pg.locator('#cv-time').bounding_box(); cx=box['x']+400; cy=box['y']+150
        # tekerlekle X yakınlaştırma
        await pg.mouse.move(cx,cy)
        for i in range(8): await pg.mouse.wheel(0,-300); await pg.wait_for_timeout(30)
        xl=await pg.evaluate("S.plot.axes[0].xlim"); print('xlim after zoom',xl)
        await pg.screenshot(path='/tmp/s3.png')
        # veri imleci
        await pg.keyboard.press('c'); await pg.mouse.click(cx,cy+60); await pg.wait_for_timeout(100)
        print('cursor',await pg.evaluate("S.plot.cursors.map(c=>[c.x,c.y,c.i])"))
        await pg.keyboard.press('b')
        # alt kısımdaki sıçramaları kutuyla seç: y<-1
        ax=await pg.evaluate("(()=>{const a=S.plot.axes[0],r=a.rect;return {r,y:[a.ylim[0],a.ylim[1]],x:a.xlim}})()")
        print(ax)
        r=ax['r']; y0=box['y']+r['y']+r['h']*0.85; y1=box['y']+r['y']+r['h']
        await pg.mouse.move(box['x']+r['x']+5,y0); await pg.mouse.down(); await pg.mouse.move(box['x']+r['x']+r['w']-5,y1-2,steps=5); await pg.mouse.up()
        await pg.wait_for_timeout(200)
        print('selCount',await pg.evaluate("selCount()"))
        await pg.screenshot(path='/tmp/s4.png')
        await pg.keyboard.press('Delete'); await pg.wait_for_timeout(300)
        print('delCount',await pg.evaluate("S.plot.axes[0].traces[0].ch.delCount"),'ylim',await pg.evaluate("S.plot.axes[0].ylim"))
        await pg.screenshot(path='/tmp/s5.png')
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(200)
        print('after undo',await pg.evaluate("S.plot.axes[0].traces[0].ch.delCount"))
        await pg.keyboard.press('Control+y'); await pg.wait_for_timeout(200)
        print('after redo',await pg.evaluate("S.plot.axes[0].traces[0].ch.delCount"))
        print('ERRS',errs[:10])
        await b.close()
asyncio.run(main())
