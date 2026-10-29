import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def run(pg, stream):
    await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
    await pg.evaluate('BS.streamMin=%s;BS.streamBlock=3e6' % ('0' if stream else '1e12'))
    await pg.set_input_files('#fileIn', [ROOT + 'sablon/MATView_Cerceve_Sablonu.xlsx', ROOT + 'sablon/sablon_deneme.bin'])
    await pg.wait_for_selector('#modal:not(.hidden)'); await pg.click('#mfoot button.primary'); await pg.wait_for_function('S.files.length===1', timeout=60000)
    return await pg.evaluate('''async()=>{const f=S.files[0],o={frames:f.sc.frames,lost:f.sc.lost,junk:f.sc.junk,stream:f.bin.stream,pos:Array.from(f.sc.pos.slice(-3))};
      for(const c of f.channels.filter(c=>c.dev==='Alanlar')){await ensureLoaded(c); let s=0; for(const v of c.data) s+=v; o[c.name]=[c.data.length,+s.toFixed(3)]} return o}''')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page()
        a = await run(pg, False); s = await run(pg, True)
        a.pop('stream'); s.pop('stream'); print('EŞİT' if a == s else ('FARK', a, s)); await b.close()
asyncio.run(main())
