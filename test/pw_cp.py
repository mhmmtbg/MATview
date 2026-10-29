import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e) + ' ' + str(getattr(e, 'stack', ''))[:400]))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""async()=>{
          const fs=4096,n=fs*60; let s=7; const r=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}, g=()=>Math.sqrt(-2*Math.log(r()+1e-12))*Math.cos(2*Math.PI*r());
          const sig=Math.sqrt(0.01*fs/2), x=new Float64Array(n), y=new Float64Array(n);
          for(let i=0;i<n;i++){const w=sig*g(); x[i]=w; y[i]=w+ 1.2*Math.sin(2*Math.PI*300*i/fs)}   // y: 300 Hz'de güçlü ton
          const c1=addDerived('kontrol_ok',x,null,0,true); c1.kind='vib'; c1.dtS=1/fs; const c2=addDerived('kontrol_ton',y,null,0,true); c2.kind='vib'; c2.dtS=1/fs;
          await addDerivedToPlot(c1); S.plot.fitAll(); S.profiles.push({id:'flat',name:'Düz profil',pts:[[20,0.01],[1000,0.01]],tol:3,color:'#d62728'}); setTab('test'); cpFillProf(); window._c2=c2;}""")
        await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())")
        await pg.select_option('#cpTpl', 'mil810avg'); await pg.evaluate("tolToUI(TOL_TPL.mil810avg)"); await pg.select_option('#cpScope', 'all')
        await pg.evaluate("complianceRun()"); await pg.wait_for_timeout(4000)
        r1 = await pg.evaluate("S.compliance.results.map(r=>[r.name,r.ok,r.gpct.toFixed(2),r.outPct.toFixed(2),r.dof.toFixed(0)])"); print('düz gürültü', r1); assert r1[0][1] is True, r1
        await pg.evaluate("addToNewAxes([window._c2],true)"); await pg.wait_for_timeout(500); await pg.evaluate("S.plot.active=S.plot.axes[S.plot.axes.length-1]"); await pg.select_option('#cpScope', 'all')
        await pg.evaluate("complianceRun()"); await pg.wait_for_timeout(4000)
        r2 = await pg.evaluate("S.compliance.results.map(r=>[r.name,r.ok,r.gpct.toFixed(2),r.outPct.toFixed(2),r.maxDev.toFixed(1),r.fMax.toFixed(0),r.rng.map(g=>g.f0.toFixed(0)+'-'+g.f1.toFixed(0))])"); print('tonlu', r2)
        assert r2[0][1] is False and abs(float(r2[0][5]) - 300) < 6, r2
        print(await pg.inner_text('#cpBox')); await pg.screenshot(path='/tmp/cp.png'); txt = await pg.evaluate("methodText().join('\\n')"); print(txt); assert 'Welch' in txt and 'Yazılım' in txt and 'Şartname uygunluk' in txt
        await pg.evaluate("methodToReport()"); assert await pg.evaluate("REP.items.some(i=>i.title==='Yöntem ve veri işleme')")
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
