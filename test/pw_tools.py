import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""async()=>{
          // A: 1000 Hz, B: 500 Hz, ortak içerik: gürültü + 20 Hz sinüs; B, A'dan 0.05 s GEÇ
          const fa=1000,fb=500,T=20; let s=5; const r=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}; const noise=new Float64Array(T*1000+1000); for(let i=0;i<noise.length;i++) noise[i]=r()-0.5;
          const sig=t=>Math.sin(2*Math.PI*3*t)+Math.sin(2*Math.PI*7.3*t)*0.7 + 0.4*(noise[Math.floor(t*1000)%noise.length]);
          const A=new Float64Array(fa*T), B=new Float64Array(fb*T); for(let i=0;i<A.length;i++) A[i]=sig(i/fa); for(let i=0;i<B.length;i++) B[i]=sig(i/fb-0.05);
          A[5000]+=30; A[12000]-=40;   // sıçrama olayları
          const mk=(n,d,f)=>{const c=addDerived(n,d,null,0,true); c.kind='vib'; c.dtS=1/f; return c;}
          const a=mk('A',A,fa), bb=mk('B',B,fb); await addDerivedToPlot(a); await addDerivedToPlot(bb,S.plot.axes[0]); S.plot.fitAll(); setTab('tools'); window._a=a; window._b=bb;}""")
        await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())")
        await pg.select_option('#coScope', 'traces'); await pg.select_option('#coWin', 'all'); await pg.fill('#coLag', '0.5'); await pg.evaluate("corrRun()"); await pg.wait_for_timeout(2500)
        rows = await pg.evaluate("_co.rows"); print(rows); lag = float(rows[0][3].split(' ')[0]); assert abs(lag - 0.05) < 0.004 and float(rows[0][2]) > 0.8, rows
        # olaylar: sıçrama (A'da 2 olay)
        await pg.select_option('#evScope', 'traces'); await pg.evaluate("document.getElementById('evT1').checked=false; document.getElementById('evT3').checked=true"); await pg.evaluate("evRun()"); await pg.wait_for_timeout(1500)
        ev = await pg.evaluate("_ev.filter(e=>e.ch==='A').map(e=>[e.type,e.t0.toFixed(3)])"); print(ev); assert len(ev) == 2 and abs(float(ev[0][1]) - 5.0) < 0.01 and abs(float(ev[1][1]) - 12.0) < 0.01, ev
        # yeniden örnekleme
        await pg.select_option('#rsScope', 'traces'); await pg.evaluate("resampleRun()"); await pg.wait_for_timeout(1500)
        info = await pg.evaluate("S.derived.channels.filter(c=>/_rs/.test(c.name)).map(c=>[c.name,c.n,c.fs])"); print(info); assert len(info) == 2 and info[0][1] == info[1][1] and abs(info[0][2] - 500) < 1e-6, info
        # not
        await pg.evaluate("noteAdd(3.0,4.5,'deneme notu')"); assert await pg.evaluate("S.plot.notes.length") == 1; await pg.evaluate("S.plot.fitAll()"); await pg.wait_for_timeout(300)
        svg = await pg.evaluate("S.plot.toSVG(true)"); assert 'deneme notu' in svg; print('not svg OK')
        await pg.screenshot(path='/tmp/tools.png'); print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
