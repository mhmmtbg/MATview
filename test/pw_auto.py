import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""async()=>{const fs=16000,n=fs*12,x=new Float64Array(n);let s=1;const r=()=>(s=(s*1664525+1013904223)>>>0)/4294967296;
          for(let i=0;i<n;i++){const t=i/fs;let v=0.02*Math.sqrt(-2*Math.log(r()+1e-12))*Math.cos(6.283*r())+0.3+0.05*Math.sin(2*Math.PI*50*t)+0.03*Math.sin(2*Math.PI*100*t);if(t>4&&t<9)v+=0.5*Math.sin(2*Math.PI*440*t);x[i]=v}
          x[20000]+=3;x[60000]+=3;
          const c=addDerived('as_test',x,null,0,true); c.kind='vib'; c.dtS=1/fs; await addDerivedToPlot(c);}""")
        await pg.click('#rtabs >> text=Akustik'); await pg.select_option('#acScope','all'); await pg.click('button:has-text("Yalnız ayarla")'); await pg.wait_for_timeout(2500)
        print(await pg.inner_text('#acLog'))
        print(await pg.evaluate("[document.querySelector('#acNOn').checked, document.querySelector('#acNf').value, document.querySelector('#acNh').value, document.querySelector('#acClOn').checked, document.querySelector('#acDnOn').checked, document.querySelector('#acN0').value, document.querySelector('#acN1').value]"))
        await pg.click('button:has-text("Otomatik temizle (tespit")'); await pg.wait_for_timeout(5000)
        print(await pg.evaluate("S.derived.channels.map(c=>c.name+':'+c.n)"))
        # spektrum Grms
        await pg.click('#rtabs >> text=İzler'); await pg.select_option('#grmsMode','all'); await pg.click('#rtabs >> text=Analiz'); await pg.click('button:has-text("Spektrumu hesapla")'); await pg.wait_for_timeout(2500)
        print(await pg.evaluate("(()=>{const t=S.specPlot.axes[0].traces[0]; return [t.label, S.specPlot.legendExtra(t,S.specPlot.axes[0]), t.srcKind]})()"))
        await pg.screenshot(path='/tmp/au.png'); print('ERR', errs); await b.close()
asyncio.run(main())
