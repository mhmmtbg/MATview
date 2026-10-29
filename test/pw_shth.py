import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def setv(pg, **kw):
    for k, v in kw.items(): await pg.evaluate("([k,v])=>{const e=document.getElementById(k); e.value=v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change'));}", [k, v])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""async()=>{
          const fs=20000,n=fs*0.2; const a=new Float64Array(n); // 11 ms yarım sinüs, 50 g, t=50..61 ms
          for(let i=0;i<n;i++){const t=i/fs; if(t>=0.05&&t<0.061) a[i]=50*Math.sin(Math.PI*(t-0.05)/0.011); a[i]+=0.01*Math.sin(i*0.37);}
          const c=addDerived('sok',a,null,0,true); c.kind='vib'; c.unit='g'; c.dtS=1/fs; await addDerivedToPlot(c); S.plot.fitAll(); setTab('test');
          // sıcaklık: 25°C'den 70°C'ye 15 dk'da rampa (3 °C/dk), 70'te bekleme; fs=1 Hz, 40 dk
          const T=new Float64Array(2400), T2=new Float64Array(2400); for(let i=0;i<2400;i++){const m=i/60; T[i]=m<15?25+3*m:70; T2[i]=T[i]-1.5;}
          const t1=addDerived('T1',T,null,0,true); t1.kind='temp'; t1.unit='C'; t1.dtS=1; const t2=addDerived('T2',T2,null,0,true); t2.kind='temp'; t2.unit='C'; t2.dtS=1; window._t=[t1,t2]; window._s=c;}""")
        await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())")
        await setv(pg, shScope='all', shSpec='10 10\n100 20\n1000 100\n10000 100'); await pg.evaluate("shockRun()"); await pg.wait_for_timeout(2500)
        print(await pg.inner_text('#toast')); rows = dict(await pg.evaluate("_sh.rows")); print(rows)
        assert abs(float(rows['Pozitif tepe'].split(' ')[0]) - 50) < 0.3, rows; dur = float(rows['Süre (%10 zarf)'].split(' ')[0]); assert abs(dur - 10.7) < 1.2, dur   # %10 zarf: 11ms*(1-2*asin(.1)/pi)=10.3 ms
        dv = float(rows['Hız değişimi ΔV'].split(' ')[0]); exp = 50 * 9.80665 * 0.011 * 2 / 3.14159265; assert abs(dv - exp) / exp < 0.04, (dv, exp)
        assert rows['En uygun şekil'].startswith('yarım sinüs'), rows
        await pg.evaluate("S.plot.axes.forEach(a=>{a.traces=[]}); addToNewAxes(window._t,false)"); await pg.wait_for_timeout(500); print("TR", await pg.evaluate("[sv('thmScope'), document.querySelectorAll('#thmScope').length]")); await setv(pg, thmScope='traces', thTgt='70', thTol='1', thDwell='120', thProf='0 25\n15 70\n40 70')
        await pg.evaluate("thermRun()"); await pg.wait_for_timeout(3000); print('TOAST', await pg.inner_text('#toast')); t = await pg.inner_text('#thBox'); print(t)
        r = await pg.evaluate("_th.rows[0]"); print(r); assert abs(float(r[4].split(' ')[0]) - 3.0) < 0.15, r; assert 'dk' in r[7]
        pr = await pg.evaluate("_th.profRows"); print(pr); assert abs(float(pr[0][2].split(' ')[0])) < 0.3
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
