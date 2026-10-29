import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'ornek/ornek_cerceve.xlsx', ROOT + 'ornek/ornek_veri.bin'])
        await pg.wait_for_selector('#modal:not(.hidden)'); await pg.click('#mfoot button.primary'); await pg.wait_for_function('S.files.length===1')
        # sentetik titreşim kanalı: ISIL_T1 değerlerini vib türüne çevir
        await pg.evaluate("""async()=>{const f=S.files[0]; const c=f.channels.find(x=>x.name==='GUC_AKIM'); c.kind='vib'; await addToNewAxes([c]);}""")
        await pg.wait_for_timeout(500)
        x0 = await pg.evaluate('S.plot.axes[0].xlim.slice()')
        await pg.click('#tb-zout'); x1 = await pg.evaluate('S.plot.axes[0].xlim.slice()')
        await pg.click('#tb-zin'); x2 = await pg.evaluate('S.plot.axes[0].xlim.slice()')
        print('zoom', x0, x1, x2)
        await pg.select_option('#grmsMode', 'all'); await pg.wait_for_timeout(300)
        v = await pg.evaluate("""()=>{const t=S.plot.axes[0].traces[0]; const d=t.ch.data; let s=0,s2=0; for(const x of d){s+=x;s2+=x*x} const m=s/d.length; return [S.plot.legendExtra(t,S.plot.axes[0]), Math.sqrt(s2/d.length-m*m)]}""")
        print('grms', v)
        await pg.select_option('#grmsMode', 'off')
        await pg.click('#rtabs [data-t=output]'); await pg.click('button:has-text("PNG kaydet")'); await pg.wait_for_selector('#modal:not(.hidden)'); print('sordu:', await pg.inner_text('#mbody'))
        await pg.screenshot(path='/tmp/zq.png'); print('ERR', errs); await b.close()
asyncio.run(main())
