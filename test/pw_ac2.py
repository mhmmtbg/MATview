import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'api/args' not in m.text else None)
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""async()=>{const fs=16000,n=fs*12,x=new Float64Array(n);let s=5;const r=()=>(s=(s*1664525+1013904223)>>>0)/4294967296,g=()=>Math.sqrt(-2*Math.log(r()+1e-12))*Math.cos(2*Math.PI*r());
          for(let i=0;i<n;i++){const t=i/fs;x[i]=0.05*g()+(t>4&&t<9?0.4*Math.sin(2*Math.PI*440*t):0)+0.04*Math.sin(2*Math.PI*50*t)}
          const c=addDerived('as_noisy',x,null,0,true); c.kind='ac'; c.dtS=1/fs; await addDerivedToPlot(c); S.plot.fitAll();}""")
        await pg.click('#rtabs >> text=Akustik'); await pg.select_option('#acScope','all')
        await pg.click('button:has-text("Otomatik temizle (tespit + uygula)")'); await pg.wait_for_timeout(4000)
        r = await pg.evaluate("""()=>{const a=S.derived.channels[0].data,c=S.derived.channels[1].data,fs=16000;const rms=(d,s,e)=>{let q=0;for(let i=s;i<e;i++)q+=d[i]*d[i];return Math.sqrt(q/(e-s))};
          return {names:S.derived.channels.map(x=>x.name), silentBefore:rms(a,fs,3*fs), silentAfter:rms(c,fs,3*fs), toneBefore:rms(a,5*fs,8*fs), toneAfter:rms(c,5*fs,8*fs), log:document.querySelector('#acLog').textContent}}""")
        print(r); print('ERR', errs); await b.close()
asyncio.run(main())
