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
        await pg.wait_for_timeout(800); await pg.evaluate("setTab('output')")
        await pg.evaluate("repAddView(); repAddStats(); repAddInfo(); REP.items.push({type:'text',title:'Değerlendirme',body:'Birinci paragraf. '.repeat(40)+'\\n\\nİkinci paragraf. '.repeat(30)})")
        for i in range(3): await pg.evaluate("repAddView()")
        await pg.evaluate("REP.items.push({type:'table',title:'Uzun tablo',head:['A','B','C'],rows:Array.from({length:70},(_,i)=>['satır '+i,String(i*3),'x'])})")
        await pg.evaluate("Object.assign(repMeta(),{title:'Örnek Test Raporu',docNo:'DOK-001',date:'23.10.2026',project:'PRJ-42',rev:'B',cls:'HİZMETE ÖZEL',org:'Örnek Kurum',prep:'A. Yılmaz',chk:'B. Kaya',appr:'C. Demir',summary:'Bu bir sentetik özet metnidir.',revs:'A | 01.10.2026 | İlk yayın\\nB | 23.10.2026 | Güncelleme'})")
        await pg.evaluate("repPreview()"); await pg.wait_for_timeout(1500)
        html = await pg.evaluate("repHTML(repMeta())"); open('/tmp/rep.html', 'w').write(html)
        n = await pg.evaluate("document.querySelector('#repPrev iframe').contentDocument.querySelectorAll('.page').length"); print('sayfa', n, 'ERRS', errs)
        pg2 = await b.new_page(); await pg2.set_content(html); await pg2.wait_for_timeout(500)
        await pg2.pdf(path='/tmp/rep.pdf', prefer_css_page_size=True, print_background=True); await b.close()
asyncio.run(main())
