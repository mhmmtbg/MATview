import os
import asyncio, time, json, io
import numpy as np, scipy.io as sio
from playwright.async_api import async_playwright
UP=os.environ.get('MATVIEW_TEST_DATA','./testdata/')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':1500,'height':900})
        errs=[]
        pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type=='error' and 'api/args' not in m.text else None)
        pg.on('pageerror',lambda e: errs.append('PAGEERR: '+str(e)))
        await pg.goto('file:///home/claude/matview/dist/matview.html')
        await pg.set_input_files('#fileIn',[UP+'veri_B.mat',UP+'veri_C.mat'])
        await pg.wait_for_function("S.files.length===2",timeout=90000)
        await pg.evaluate("""async()=>{const f=S.files[0]; const cs=['ts11_X','ts11_Y','ts11_Z'].map(n=>f.channels.find(c=>c.name==='DOSYAB_anak100_1_'+n)); await addToNewAxes(cs,true);}""")
        await pg.wait_for_function("S.plot.axes[0].traces.every(t=>t.ch.data)",timeout=60000)
        await pg.evaluate("setTab('analyze')"); await pg.select_option('#spScope','all')
        await pg.evaluate("computeSpectrum()"); await pg.wait_for_function("S.view==='spec'",timeout=60000)
        await pg.wait_for_timeout(400); await pg.screenshot(path='/tmp/t2.png')
        await pg.evaluate("switchView('time'); S.plot.active=S.plot.axes[0]; S.plot.axes[0].active=2"); 
        await pg.fill('#sgN','1024') if False else None
        await pg.evaluate("computeSpectrogram()"); await pg.wait_for_function("S.view==='sgram'",timeout=60000)
        await pg.wait_for_timeout(400); await pg.screenshot(path='/tmp/t3.png')
        # akustik: as11 üzerinde temizleme zinciri
        await pg.evaluate("""async()=>{switchView('time'); const c=S.files[0].channels.find(c=>c.name==='DOSYAB_anak100_1_as11'); await addToNewAxes([c]);}""")
        await pg.wait_for_function("S.plot.axes.length===2 && S.plot.axes[1].traces[0].ch.data",timeout=60000)
        await pg.evaluate("S.plot.active=S.plot.axes[1]; S.plot.axes[1].active=0; const a=S.plot.axes[1]; S.plot.setXlim(a,50,60); S.plot.invalidate(); setTab('acoustic')")
        await pg.evaluate("document.getElementById('acHpOn').click(); document.getElementById('acNOn').click(); document.getElementById('acClOn').click()")
        await pg.evaluate("setNoiseFromView()"); await pg.evaluate("document.getElementById('acDnOn').click()")
        r=await pg.evaluate("""async()=>{const t=performance.now(); const p=await acPrepare(true); return {ms:performance.now()-t, n:p.y.length, log:p.log, rmsIn:DSP.stats(p.raw,null,0,p.raw.length).rms, rmsOut:DSP.stats(p.y,null,0,p.y.length).rms}}""")
        print('akustik temizleme',r)
        await pg.evaluate("acAddClean()"); await pg.wait_for_function("S.derived && S.derived.channels.length>=1",timeout=60000)
        await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/t5.png')
        # kanal çiz
        await pg.evaluate("""async()=>{const f=S.files[1]; const cs=['GRUP_24VsupplyVoltage','GRUP_24VsupplyCurrent'].map(n=>f.channels.find(c=>c.name===n)); await addToNewAxes(cs);}""")
        await pg.wait_for_timeout(800); await pg.screenshot(path='/tmp/t6.png')
        await pg.evaluate("window.__cap=null; window.saveBlob=async(blob,name)=>{window.__cap={name,buf:Array.from(new Uint8Array(await blob.arrayBuffer()))}; return true}; 1")
        await pg.evaluate("setTab('output'); document.getElementById('exDec').value=10; exportData('mat')"); await pg.wait_for_function("window.__cap",timeout=60000)
        cap=await pg.evaluate("window.__cap"); m=sio.loadmat(io.BytesIO(bytes(cap['buf'])))
        print('MAT değişkenler:',[(k,v.shape) for k,v in m.items() if not k.startswith('__')])
        print('ERRS',errs[:10])
        await b.close()
asyncio.run(main())
