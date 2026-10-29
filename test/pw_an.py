import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'api/args' not in m.text else None)
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        # sentetik: 10 kHz, giriş = gürültü, çıkış = 2. derece rezonans (f0=300 Hz), SRS için darbe
        await pg.evaluate('''()=>{const fs=10000,N=60000; let sd=7; const rnd=()=>{sd=(sd*16807)%2147483647; return sd/2147483647-0.5};
          const x=new Float64Array(N), y=new Float64Array(N), s=new Float64Array(N); for(let i=0;i<N;i++) x[i]=rnd()*4;
          const w=2*Math.PI*300/fs, z=0.05; let y1=0,y2=0; for(let i=0;i<N;i++){const v=x[i]*w*w*0.2+2*Math.exp(-z*w)*Math.cos(w*Math.sqrt(1-z*z))*y1-Math.exp(-2*z*w)*y2; y2=y1; y1=v; y[i]=v}
          for(let i=0;i<N;i++) s[i]=Math.sin(2*Math.PI*1000*i/fs)*0.5; window._d={x,y,s,fs};
          const mk=(n,d)=>{const c=addDerived(n,d); return c}; window._cx=addDerived('GIRIS',x); window._cy=addDerived('CIKIS',y); window._cs=addDerived('SINUS',s);}''')
        await pg.evaluate("for(const c of [_cx,_cy,_cs]) c.dtS=1e-4; addToNewAxes([_cx,_cy], true)")
        await pg.wait_for_timeout(400); await pg.evaluate("setTab('analyze')"); await pg.wait_for_timeout(300)
        await pg.evaluate("refreshFrfPick(); $('#frIn').value='0'; $('#frOut').value='1'"); await pg.evaluate("computeFRF()"); await pg.wait_for_timeout(1200)
        print('toast', await pg.inner_text('#toast'), await pg.evaluate('S.plot.axes.length+" "+S.plot.axes[0].traces.map(t=>t.label)'))
        fi = await pg.evaluate("()=>{const t=S.specPlot.axes[0].traces[0]; let m=0; for(let i=1;i<t.y.length;i++) if(t.y[i]>t.y[m]) m=i; return [S.specPlot.axes.length, t.x[m], t.y[m], S.specPlot.axes[2].traces[0].y[m], document.querySelector('#frInfo').textContent]}")
        print('FRF ax, tepe f, |H|, coh, info', fi); await pg.screenshot(path='/tmp/an_frf.png')
        await pg.evaluate("computeSRS()"); await pg.wait_for_timeout(1500); print('SRS', await pg.inner_text('#srInfo')); await pg.screenshot(path='/tmp/an_srs.png')
        await pg.evaluate("computeOctave()"); await pg.wait_for_timeout(1500); print('OKT', await pg.inner_text('#ocInfo')); await pg.screenshot(path='/tmp/an_oct.png')
        await b.close(); print('ERRS', errs)
asyncio.run(main())
