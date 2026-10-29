# Faz 4 arayüzü: süzgeç aileleri + canlı Bode, tam Δf spektrum, rainflow, kayan basıklık (sentetik veri)
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SETUP = """async()=>{ const fs=1000,n=20000; const d=new Float64Array(n); let s=1; const r=()=>{s=(s*16807)%2147483647; return s/2147483647-0.5;};
  for(let i=0;i<n;i++) d[i]=Math.sin(2*Math.PI*50*i/fs)+0.5*Math.sin(2*Math.PI*230*i/fs)+0.2*r()+(i%4000===2000?8:0);
  const c=addDerived('sig',d,null); c.dtS=1/fs; c.unit='g'; await addToNewAxes([c]); S.plot.fitAll(); return true; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.evaluate(SETUP)
        await pg.evaluate("setTab('analyze')")
        setv = "([id,v])=>{const e=$('#'+id); if(e.type==='checkbox') e.checked=v; else e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));}"
        for fam in ['butter', 'cheby1', 'bessel', 'fir']:
            await pg.evaluate(setv, ['flFam', fam]); await pg.evaluate(setv, ['flType', 'lp']); await pg.evaluate(setv, ['flF1', '100']); await pg.wait_for_timeout(120)
            info = await pg.inner_text('#flInfo'); print(fam, '|', info); assert 'dB' in info
            await pg.evaluate("applyFilterUI()"); await pg.wait_for_timeout(600)
        # tek geçiş bessel, bp cheby
        await pg.evaluate(setv, ['flFam', 'cheby1']); await pg.evaluate(setv, ['flType', 'bp']); await pg.evaluate(setv, ['flF2', '300']); await pg.evaluate(setv, ['flF1', '200']); await pg.evaluate(setv, ['flZero', False]); await pg.wait_for_timeout(120)
        await pg.evaluate("(async()=>{S.plot.active=S.plot.axes[0]; S.plot.axes[0].active=0; await applyFilterUI();})()"); await pg.wait_for_timeout(600)
        names = await pg.evaluate("S.derived.channels.map(c=>c.name)"); print(names)
        assert 'sig_LP100' in names and 'sig_LP100_C1' in names and 'sig_LP100_BE' in names and 'sig_LP100_FIR' in names and 'sig_BP200-300_C1' in names
        # LP100 süzülmüş: 230 Hz bileşeni bastırılmış olmalı (FIR)
        rms = await pg.evaluate("(()=>{const c=S.derived.channels.find(c=>c.name==='sig_LP100_FIR'); let s=0; for(let i=2000;i<18000;i++) s+=c.data[i]**2; return Math.sqrt(s/16000)})()"); print('rms LP', rms); assert 0.68 < rms < 0.76
        await pg.screenshot(path='/tmp/claude-0/faz4_filter.png')
        # tam Δf spektrum
        await pg.evaluate("(()=>{S.plot.active=S.plot.axes[0]; S.plot.axes[0].active=0; $('#spDf').value='1'; $('#spScope').value='all';})()")
        await pg.evaluate("computeSpectrum()"); await pg.wait_for_timeout(800)
        df = await pg.evaluate("S.specPlot.axes[0].traces[0].df"); print('df', df); assert abs(df - 1) < 1e-12
        # rainflow
        await pg.evaluate("switchView('time'); S.plot.active=S.plot.axes[0]; S.plot.axes[0].active=0"); await pg.evaluate("computeRainflow()"); await pg.wait_for_timeout(800)
        info = await pg.inner_text('#rfInfo'); print(info); assert 'çevrim' in info and await pg.evaluate("S.view") == 'xy'
        await pg.screenshot(path='/tmp/claude-0/faz4_rf.png')
        # kayan basıklık
        await pg.evaluate("switchView('time'); S.plot.active=S.plot.axes[0]; S.plot.axes[0].active=0"); await pg.evaluate("computeSliding()"); await pg.wait_for_timeout(800)
        k = await pg.evaluate("(()=>{const c=S.derived.channels.find(c=>c.name==='sig_kurt'); return [c.n, c.t(0), c.dtS, Math.max(...c.data)]})()"); print('kurt', k); assert k[0] == 39 and abs(k[1] - 0.4995) < 1e-9 and k[3] > 5
        await pg.screenshot(path='/tmp/claude-0/faz4_kurt.png')
        print('ERR', errs); assert not errs; await b.close(); print('OK faz4')
asyncio.run(main())
