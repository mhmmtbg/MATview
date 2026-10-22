import asyncio, os, base64
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width':1500,'height':950})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'sablon/MATView_Cerceve_Sablonu.xlsx', ROOT + 'sablon/sablon_deneme.bin'])
        await pg.wait_for_selector('#modal:not(.hidden)', timeout=8000); await pg.wait_for_timeout(500)
        print('info:', await pg.inner_text('#bnInfo'))
        await pg.click('#mfoot button.primary'); await pg.wait_for_function('S.files.length===1', timeout=60000); await pg.wait_for_timeout(500)
        r = await pg.evaluate('''async()=>{const f=S.files[0]; const g=async n=>{const c=f.channels.find(c=>c.name===n); if(!c) return null; await ensureLoaded(c); return c.data}; const T=n=>{const c=f.channels.find(c=>c.name===n); return [c.n, +c.t(0).toFixed(4), +c.t(1).toFixed(4), +c.t(c.n-1).toFixed(3)]};
          const o={frames:f.sc.frames,lost:f.sc.lost,fields:f.channels.filter(c=>c.dev==='Alanlar').map(c=>c.name)};
          for(const n of ['SAYAC','GUC_VOLT','GUC_AKIM','GUC_WATT','SICAKLIK_1','SICAKLIK_12BIT','ENLEM','BOYLAM','YAKIT_SEVIYE','KONTROL_MOD','BAYRAK_0','BAYRAK_1','ADC_KANAL']){const d=await g(n); o[n]=d?Array.from(d.slice(0,3)).map(x=>+x.toFixed(4)):'YOK'}
          o.T=['GUC_VOLT','SICAKLIK_1','YAKIT_SEVIYE'].map(T); return o}''')
        for k, v in r.items(): print(k, v)
        res = await pg.evaluate('''async()=>{let blob=null; window.saveBlob=async(b)=>{blob=b;return true}; await binExport(S.files[0],true,false,true);
          const buf=new Uint8Array(await blob.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=8192) s+=String.fromCharCode(...buf.subarray(i,i+8192)); return btoa(s);}''')
        open('/tmp/sablon_out.mat','wb').write(base64.b64decode(res)); print('ERRS', errs); await b.close()
asyncio.run(main())
