import asyncio, time
from playwright.async_api import async_playwright
UP='/root/.claude/uploads/f9bb0b88-21cf-5346-b390-379830d8a473/'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':1500,'height':900})
        pg.on('console',lambda m: print('CONSOLE',m.type,m.text[:200]) if m.type in('error','warning') and 'api/args' not in m.text else None)
        pg.on('pageerror',lambda e: print('PAGEERR',e))
        await pg.goto('file:///home/claude/matview/dist/matview.html')
        await pg.set_input_files('#fileIn',[UP+'823ba64c-MEST_ANAK_data.mat'])
        await pg.wait_for_function("S.files.length===1",timeout=60000)
        await pg.evaluate("""async()=>{const c=S.files[0].channels.find(c=>c.name==='MEST_anak100_1_as11'); await addToNewAxes([c]);}""")
        await pg.wait_for_function("S.plot.axes.length===1 && S.plot.axes[0].traces[0].ch.data",timeout=60000)
        await pg.evaluate("S.plot.active=S.plot.axes[0]; S.plot.setXlim(S.plot.axes[0],50,52); setTab('acoustic'); document.getElementById('acClOn').click()")
        t=time.time()
        try:
            await asyncio.wait_for(pg.evaluate("acAddClean()"),timeout=40)
        except Exception as e: print('TIMEOUT/ERR',type(e).__name__,e)
        print('geçen',round(time.time()-t,1))
        print(await pg.evaluate("[S.derived&&S.derived.channels.length, document.getElementById('toast').textContent, document.getElementById('busy').className]"))
        await b.close()
asyncio.run(main())
