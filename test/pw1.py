import os
import asyncio, sys, time
from playwright.async_api import async_playwright
UP=os.environ.get('MATVIEW_TEST_DATA','./testdata/')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':1500,'height':900})
        errs=[]
        pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e: errs.append('PAGEERR: '+str(e)))
        await pg.goto('file:///home/claude/matview/dist/matview.html')
        await pg.set_input_files('#fileIn',[UP+'veri_A.mat'])
        await pg.wait_for_function("S.files.length===1",timeout=60000)
        await pg.screenshot(path='/tmp/s1.png')
        t=time.time()
        await pg.evaluate("""async()=>{const f=S.files[0]; const c=f.channels.find(c=>c.name==='DOSYAA_anak100_1_as41'); await addToNewAxes([c]);}""")
        await pg.wait_for_function("S.plot.axes.length===1 && S.plot.axes[0].traces[0].ch.data",timeout=60000)
        print('as41 yükleme+çizim',round(time.time()-t,2),'s')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/s2.png')
        # çizim süresi ölçümü
        ms=await pg.evaluate("""()=>{const P=S.plot; const t=performance.now(); for(let i=0;i<10;i++){P.draw();} return (performance.now()-t)/10}""")
        print('tam görünüm çizim ms',round(ms,1))
        print('ERRS',errs[:10])
        await b.close()
asyncio.run(main())
