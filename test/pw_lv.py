import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'api/args' not in m.text else None)
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""async()=>{const fs=2000,n=fs*18,x=new Float64Array(n);let s=7;const r=()=>(s=(s*1664525+1013904223)>>>0)/4294967296,g=()=>Math.sqrt(-2*Math.log(r()+1e-12))*Math.cos(2*Math.PI*r());
          const lv=[[0,2,null],[2,6,-9],[6,10,-6],[10,14,-3],[14,18,0]];
          for(let i=0;i<n;i++){const t=i/fs,L=lv.find(l=>t>=l[0]&&t<l[1]);const a=L&&L[2]!==null?Math.pow(10,L[2]/20):0.01;x[i]=a*(g()*0.5+Math.sin(2*Math.PI*100*t)+0.5*Math.sin(2*Math.PI*350*t))}
          const c=addDerived('ts_levels',x,null,0,true); c.kind='vib'; c.dtS=1/fs; await addDerivedToPlot(c); S.plot.fitAll();
          S.profiles.push({id:'pp',name:'Test profili',pts:[[20,0.00002],[100,0.0025],[400,0.0025],[900,0.00002]],tol:3,color:'#d62728'}); refreshUnvPanel();}""")
        await pg.click('#rtabs [data-t=analyze]'); await pg.select_option('#lvRef', 'max')
        await pg.click('button:has-text("Seviyeleri tespit et")'); await pg.wait_for_timeout(1500); print(await pg.inner_text('#lvInfo'))
        await pg.screenshot(path='/tmp/lv1.png')
        await pg.select_option('#lvRef', 'pp'); await pg.click('button:has-text("Seviyeleri tespit et")'); await pg.wait_for_timeout(1500); print(await pg.inner_text('#lvInfo'))
        await pg.click('button:has-text("Seviye başına spektrum")'); await pg.wait_for_timeout(2500)
        print(await pg.inner_text('#mbody')); await pg.screenshot(path='/tmp/lv2.png'); print('ERR', errs); await b.close()
asyncio.run(main())
