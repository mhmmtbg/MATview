import asyncio, os, base64
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'sablon/MATView_Cerceve_Sablonu.xlsx', ROOT + 'sablon/sablon_deneme.bin'])
        await pg.wait_for_selector('#modal:not(.hidden)'); await pg.click('#mfoot button.primary'); await pg.wait_for_function('S.files.length===1', timeout=60000)
        await pg.evaluate("(async()=>{const f=S.files[0]; const c=n=>f.channels.find(x=>x.name===n); await addToNewAxes([c('GUC_VOLT'),c('GUC_AKIM')],true); await addToNewAxes([c('ADC_KANAL')]);})()")
        await pg.wait_for_timeout(800)
        logo = 'data:image/png;base64,' + base64.b64encode(open('/tmp/logo.png', 'rb').read()).decode()
        await pg.evaluate("(l)=>{repAddView(); repAddStats(); repAddInfo(); REP.items.push({type:'text',title:'Değerlendirme',body:'Birinci paragraf. '.repeat(40)+'\\n\\nİkinci paragraf '.repeat(3)}); REP.items.push({type:'table',title:'Uzun tablo',head:['A','B','C'],rows:Array.from({length:70},(_,i)=>['satır '+i,String(i*3),'x'])}); Object.assign(repMeta(),{title:'Örnek Test Raporu',docNo:'DOK-001',date:'23.10.2026',project:'PRJ-42',rev:'B',cls:'HİZMETE ÖZEL',org:'Örnek Kurum',prep:'A. Yılmaz',chk:'B. Kaya',appr:'C. Demir',summary:'Bu bir sentetik özet metnidir.',revs:'A | 01.10.2026 | İlk yayın\\nB | 23.10.2026 | Güncelleme',logo:l})}", logo)
        await pg.wait_for_timeout(500)
        d = await pg.evaluate("async()=>{const b=await repDocx(repMeta()); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(let i=0;i<u.length;i+=8192) s+=String.fromCharCode(...u.subarray(i,i+8192)); return btoa(s)}")
        open('/tmp/rep.docx', 'wb').write(base64.b64decode(d)); print('ERRS', errs); await b.close()
asyncio.run(main())
