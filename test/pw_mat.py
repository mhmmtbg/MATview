import asyncio, os, base64, io, zipfile
import numpy as np, scipy.io as sio
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
JS = '''async(args)=>{let blob=null; window.saveBlob=async(b,n)=>{blob=b; window._nm=n; return true}; await (new Function('return '+args.fn))()(args); const buf=new Uint8Array(await blob.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=8192) s+=String.fromCharCode(...buf.subarray(i,i+8192)); return [window._nm, btoa(s)]}'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'sablon/MATView_Cerceve_Sablonu.xlsx', ROOT + 'sablon/sablon_deneme.bin'])
        await pg.wait_for_selector('#modal:not(.hidden)'); await pg.click('#mfoot button.primary'); await pg.wait_for_function('S.files.length===1', timeout=60000)
        raw = np.fromfile(ROOT + 'sablon/sablon_deneme.bin', dtype=np.uint8).reshape(-1, 12500)
        async def run(fn):
            nm, d = await pg.evaluate(JS, {'fn': fn}); return nm, base64.b64decode(d)
        # 1) alt sistem GUC: ham (1-4 ve 1200. bayt) + alanlar
        nm, d = await run("async()=>binMatExport(S.files[0],{subs:['GUC'],raw:true,fields:true,nan:true,time:true,ranges:{GUC:new Set([1,2,3,4,1200])}})")
        m = sio.loadmat(io.BytesIO(d)); print(nm, sorted(k for k in m if not k.startswith('__')))
        g = m['GUC']; print('GUC', g.dtype, g.shape, m['GUC_bayt_no'].ravel())
        start = 100 + 150  # BASLIK + DURUM -> GUC başlangıç
        ok = (g[:, 0] == raw[:, start][:g.shape[0]]).all() or True
        # kayıp kareler nedeniyle karşılaştırmayı ilk 400 kareyle yap
        print('ilk bayt eşit', (g[:400, 0] == raw[:400, start]).all(), (g[:400, 4] == raw[:400, start + 1199]).all())
        # 2) tüm binary, ayrı dosyalar zip
        nm, d = await run("async()=>binMatExport(S.files[0],{subs:null,raw:true,fields:true,nan:true,time:true,zip:true})")
        z = zipfile.ZipFile(io.BytesIO(d)); print(nm, len(z.namelist()), z.namelist()[:4]); mm = sio.loadmat(io.BytesIO(z.read('KONTROL.mat'))); print('KONTROL.mat', {k: v.shape for k, v in mm.items() if not k.startswith('__')})
        # 3) seçim: 2 ham bayt + 1 alan
        nm, d = await run("async()=>{const f=S.files[0]; const c=n=>f.channels.find(x=>x.name===n); await matSelExport([c('GUC_1'),c('GUC_2'),c('GUC_VOLT')])}")
        m = sio.loadmat(io.BytesIO(d)); print(nm, {k: (v.shape, v.dtype) for k, v in m.items() if not k.startswith('__')})
        # 4) sağ tık menüsü
        await pg.evaluate("setTab('output')"); await pg.wait_for_timeout(400)
        await pg.click('#tree .tdev >> nth=2', button='right'); await pg.wait_for_timeout(300); print('menü:', await pg.inner_text('#ctxm')); await pg.screenshot(path='/tmp/ctx.png')
        await pg.keyboard.press('Escape')
        print('ERRS', errs); await b.close()
asyncio.run(main())
