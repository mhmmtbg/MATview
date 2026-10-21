import asyncio, os, sys, struct, math
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SHOT = os.environ.get('SHOT', '/tmp/bin_')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 950})
        errs = []
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERR: ' + str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'ornek/ornek_cerceve.xlsx', ROOT + 'ornek/ornek_veri.bin'])
        await pg.wait_for_timeout(1500); print('E0', errs, await pg.evaluate('document.querySelector("#toast").textContent'))
        await pg.wait_for_selector('#modal:not(.hidden)', timeout=5000)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=SHOT + 'dialog.png')
        print('info:', await pg.inner_text('#bnInfo'))
        print('sync/fps/order:', await pg.input_value('#bnSync'), await pg.input_value('#bnFps'), await pg.input_value('#bnOrder'))
        await pg.click('#mfoot button.primary')
        await pg.wait_for_function('S.files.length===1', timeout=60000)
        await pg.wait_for_timeout(500)
        r = await pg.evaluate('''async()=>{const f=S.files[0]; const o={frames:f.sc.frames,lost:f.sc.lost,junk:f.sc.junk,n:f.channels.length,g:!!f.sc.g,
          nraw:f.channels.filter(c=>c.dev!=='Alanlar').length, fields:f.channels.filter(c=>c.dev==='Alanlar').map(c=>c.name)};
          const get=async n=>{const c=f.channels.find(c=>c.name===n); await ensureLoaded(c); return c;};
          const sayac=await get('SAYAC'); o.sayac=[sayac.data[0],sayac.data[79],sayac.data[80],sayac.data[150]];
          const v=await get('GUC_VOLT'); o.volt=[v.data[0],v.data[10],v.data[60]]; o.voltMax=Math.max(...v.data);
          const w=await get('GUC_WATT'); o.watt=[w.data[0], v.data[0]*(await get('GUC_AKIM')).data[0]];
          o.isil=(await get('ISIL_T1')).data[0]; o.enl=(await get('NAVIG_ENLEM')).data[5]; o.yakit=(await get('YAKIT_SEVIYE')).data[10];
          o.mod=Array.from((await get('KONTROL_MOD')).data.slice(0,60)).filter((x,i)=>i%20===0); o.cbit0=Array.from((await get('CBIT_0')).data.slice(0,12));
          o.names=[f.channels[0].name,f.channels[500].name]; o.t=[sayac.t(0),sayac.t(79),sayac.t(80)];
          return o;}''')
        for k, v in r.items(): print(k, v)
        # grafik: iki alan alt alta, aykırı nokta silme
        await pg.evaluate('''async()=>{const f=S.files[0]; const c=n=>f.channels.find(x=>x.name===n); await addToNewAxes([c('GUC_VOLT')]); await addToNewAxes([c('ISIL_T1'),c('YAKIT_SEVIYE')]);}''')
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=SHOT + 'plot.png')
        # .mat dışa aktarma (base64 yakala)
        res = await pg.evaluate('''async()=>{let blob=null; window.saveBlob=async(b)=>{blob=b;return true}; await binExport(S.files[0],true,true,true);
          const buf=new Uint8Array(await blob.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=8192) s+=String.fromCharCode(...buf.subarray(i,i+8192)); return btoa(s);}''')
        import base64; open('/tmp/bin_out.mat', 'wb').write(base64.b64decode(res))
        # XLSX yazıcı gidiş-dönüş
        rt = await pg.evaluate('''async()=>{const d=JSON.parse(JSON.stringify(S.files[0].bin.def)); const bl=XLSX.write(BIN.defToSheets(d)); const sh=await XLSX.read(new File([bl],'a.xlsx')); const d2=BIN.defFromSheets(sh);
          return {same: JSON.stringify(d2.grid)===JSON.stringify(d.grid), f: d2.fields.length, sync:d2.sync, fps:d2.fps, order:d2.order}}''')
        print('xlsx roundtrip', rt)
        print('ERRS', errs[:10])
        await b.close()
asyncio.run(main())
