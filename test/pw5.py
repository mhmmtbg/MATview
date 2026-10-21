import asyncio, time, io
import scipy.io as sio
from playwright.async_api import async_playwright
UP='/root/.claude/uploads/f9bb0b88-21cf-5346-b390-379830d8a473/'
async def step(name,coro,to=40):
    t=time.time()
    try: r=await asyncio.wait_for(coro,timeout=to); print(f'[{name}] {time.time()-t:.1f}s'); return r
    except Exception as e: print(f'[{name}] HATA {type(e).__name__} {str(e)[:150]}'); return None
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':1500,'height':900})
        pg.on('console',lambda m: print('CONSOLE',m.type,m.text[:200]) if m.type in('error',) and 'api/args' not in m.text else None)
        pg.on('pageerror',lambda e: print('PAGEERR',e))
        await pg.goto('file:///home/claude/matview/dist/matview.html')
        await pg.set_input_files('#fileIn',[UP+'823ba64c-MEST_ANAK_data.mat',UP+'cc54ac19-KTSAK4_data.mat'])
        await pg.wait_for_function("S.files.length===2",timeout=90000)
        await pg.evaluate("""async()=>{const c=S.files[0].channels.find(c=>c.name==='MEST_anak100_1_as11'); await addToNewAxes([c]);}""")
        await pg.wait_for_function("S.plot.axes.length===1 && S.plot.axes[0].traces[0].ch.data",timeout=60000)
        await pg.evaluate("S.plot.active=S.plot.axes[0]; S.plot.setXlim(S.plot.axes[0],50,60); setTab('acoustic'); document.getElementById('acClOn').click();document.getElementById('acHpOn').click()")
        await step('acAddClean',pg.evaluate("acAddClean()"))
        await step('shot1',pg.screenshot(path='/tmp/t5.png'))
        await step('ktsak',pg.evaluate("""async()=>{const f=S.files[1]; const cs=['GVDB4_24VsupplyVoltage','GVDB4_24VsupplyCurrent'].map(n=>f.channels.find(c=>c.name===n)); await addToNewAxes(cs);}"""))
        await step('shot2',pg.screenshot(path='/tmp/t6.png'))
        await pg.evaluate("window.__cap=null; window.saveBlob=async(blob,name)=>{const r=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(blob)}); window.__cap={name,b64:r.split(',')[1]}; return true}; 1")
        await step('export',pg.evaluate("setTab('output'); document.getElementById('exDec').value=10; exportData('mat')"),to=60)
        cap=await step('cap',pg.evaluate("window.__cap"))
        if cap:
            import base64; m=sio.loadmat(io.BytesIO(base64.b64decode(cap['b64']))); print('MAT:',[(k,v.shape) for k,v in m.items() if not k.startswith('__')])
        await b.close()
asyncio.run(main())
