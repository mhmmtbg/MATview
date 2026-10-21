import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""async()=>{const fs=2000,n=fs*8,x=new Float64Array(n);let s=1;const r=()=>(s=(s*1664525+1013904223)>>>0)/4294967296;
          for(let i=0;i<n;i++)x[i]=0.5*Math.sqrt(-2*Math.log(r()+1e-12))*Math.cos(6.283*r())+0.3*Math.sin(2*Math.PI*120*i/fs);
          const c=addDerived('ts_test',x,null,0,true); c.kind='vib'; c.dtS=1/fs; await addDerivedToPlot(c); S.plot.fitAll();}""")
        await pg.click('#rtabs >> text=Analiz'); print('defaults', await pg.input_value('#spY'), await pg.input_value('#spX'))
        await pg.select_option('#spScope','all'); await pg.click('button:has-text("Spektrumu hesapla")'); await pg.wait_for_timeout(2000)
        print(await pg.evaluate("[S.specPlot.axes[0].ylabel, S.specPlot.axes[0].ylog, S.specPlot.axes[0].xlog]"))
        await pg.screenshot(path='/tmp/sp1.png')
        await pg.select_option('#spY','db'); await pg.click('button:has-text("Spektrumu hesapla")'); await pg.wait_for_timeout(1500)
        print(await pg.evaluate("S.specPlot.axes[0].ylabel")); print('ERR', errs); await b.close()
asyncio.run(main())
