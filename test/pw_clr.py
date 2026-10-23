import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', ['/tmp/test_f32.wav']); await pg.wait_for_function('S.files.length===1'); await pg.wait_for_timeout(500)
        await pg.evaluate("setTab('analyze'); computeSpectrum()"); await pg.wait_for_timeout(1200); await pg.evaluate("pickHarm()")
        print('harm', await pg.evaluate("S.specPlot.harm.f0"))
        # legend sürükle
        await pg.evaluate("switchView('time')"); await pg.wait_for_timeout(300)
        box = await pg.evaluate("(()=>{const r=document.querySelector('.lgrip').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()")
        l0 = await pg.evaluate("document.querySelector('.lgd').getBoundingClientRect().x")
        await pg.mouse.move(*box); await pg.mouse.down(); await pg.mouse.move(box[0] - 250, box[1] + 120, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
        print('legend x', l0, '->', await pg.evaluate("document.querySelector('.lgd').getBoundingClientRect().x"), await pg.evaluate("JSON.stringify(S.plot.axes[0].lgPos)"))
        # farklı kaynakla yeni spektrum: harmonik yeni tepeye gider
        await pg.evaluate("(()=>{const c=S.files[0].channels[1]; const d=c.data; for(let i=0;i<d.length;i++) d[i]=Math.sin(2*Math.PI*1000*i/8000); c.pyr=null; S.plot.axes[0].traces=[]; return 1})()")
        await pg.evaluate("addToAxes(S.plot.axes[0],[S.files[0].channels[1]])"); await pg.wait_for_timeout(500); await pg.evaluate("computeSpectrum()"); await pg.wait_for_timeout(1200)
        print('harm sonra', await pg.evaluate("S.specPlot.harm.f0")); await pg.screenshot(path='/tmp/harm2.png')
        await pg.evaluate("switchView('time'); clearPlot()"); await pg.wait_for_timeout(300)
        print('temizlendi', await pg.evaluate("[S.plot.axes.length, S.specPlot.axes.length, !!S.specPlot.harm, S.view]")); print('ERRS', errs); await b.close()
asyncio.run(main())
