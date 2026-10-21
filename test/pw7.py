import os
import asyncio, io, base64
import scipy.io as sio
from playwright.async_api import async_playwright
UP=os.environ.get('MATVIEW_TEST_DATA','./testdata/')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':1500,'height':900})
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'api/args' not in m.text else None)
        await pg.goto('file:///home/claude/matview/dist/matview.html')
        await pg.set_input_files('#fileIn',['/tmp/h5t/v73.mat',UP+'veri_A.mat'])
        await pg.wait_for_function("S.files.length===2",timeout=90000)
        print('dosyalar:',await pg.evaluate("S.files.map(f=>f.name+' → '+f.channels.length+' kanal')"))
        await pg.evaluate("""async()=>{const c=S.files[0].channels.find(c=>c.name==='sig1'); await addToNewAxes([c]);}""")
        await pg.wait_for_function("S.plot.axes[0].traces[0].ch.data",timeout=30000)
        print('v7.3 n=',await pg.evaluate("S.plot.axes[0].traces[0].ch.n"))
        # eşik ile bul + sil + CSV
        await pg.evaluate("setTab('clean'); document.getElementById('thMode').value='gt'; document.getElementById('thA').value=Math.max(...Array.from(S.plot.axes[0].traces[0].ch.data.slice(0,100000)))*0.0+20")
        await pg.evaluate("findOutliers('th')"); await pg.wait_for_timeout(500)
        n=await pg.evaluate("selCount()"); print('eşik >20 bulunan:',n)
        if n: await pg.evaluate("deleteSelection()")
        print('silinen:',await pg.evaluate("S.plot.axes[0].traces[0].ch.delCount"))
        await pg.evaluate("window.__cap=null; window.saveBlob=async(blob,name)=>{const r=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(blob)}); window.__cap={name,b64:r.split(',')[1]}; return true}; 1")
        await pg.evaluate("document.getElementById('exDec').value=1000; document.getElementById('exDel').value='nan'; exportData('csv')")
        await pg.wait_for_function("window.__cap",timeout=30000)
        cap=await pg.evaluate("window.__cap"); txt=base64.b64decode(cap['b64']).decode(); print('CSV başlık/ilk satır:',txt.split('\n')[:2], 'satır',len(txt.split('\n')))
        # PNG
        png=await pg.evaluate("S.plot.toPNG(2,true).toDataURL('image/png').length"); print('PNG dataurl uzunluğu',png)
        print('hata:',errs)
        await b.close()
asyncio.run(main())
