# Akustik oynatma: ileri/geri sarma, duraklatma, konum çubuğu ve kalibre 32-bit float WAV (sentetik veri)
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 950}, accept_downloads=True); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.evaluate('window.showSaveFilePicker=undefined')
        await pg.evaluate("""async()=>{const fs=8000,n=fs*40,x=new Float64Array(n);for(let i=0;i<n;i++)x[i]=2*Math.sin(2*Math.PI*200*i/fs);
          const c=addDerived('ses_pa',x,null,0,true); c.kind='ac'; c.unit='Pa'; c.dtS=1/fs; await addDerivedToPlot(c); S.plot.fitAll(); 0}""")
        await pg.click('#rtabs [data-t=acoustic]'); await pg.evaluate("()=>{document.querySelectorAll('#right .card.collapsed').forEach(c=>c.classList.remove('collapsed'));0}"); await pg.select_option('#acScope', 'all')
        ok(await pg.is_disabled('#acFwd'), 'çalmadan önce sarma kapalı olmalı')
        await pg.click('button:has-text("▶ Orijinal")'); await pg.wait_for_timeout(600)
        ok(not await pg.is_disabled('#acFwd'), 'çalarken sarma açık')
        await pg.select_option('#acStep', '10'); p0 = await pg.evaluate('acPos()')
        await pg.click('#acFwd'); p1 = await pg.evaluate('acPos()'); ok(p1 - p0 > 9.5, f'ileri sar {p0}->{p1}')
        await pg.click('#acBack'); await pg.click('#acBack'); p2 = await pg.evaluate('acPos()'); ok(p2 < 1.5, f'geri sar başa sınırlı {p2}')
        await pg.click('#acPP'); await pg.wait_for_timeout(100); a = await pg.evaluate('acPos()'); await pg.wait_for_timeout(500); b2 = await pg.evaluate('acPos()')
        ok(abs(a - b2) < 1e-6 and await pg.evaluate('S.audio.paused'), f'duraklatınca konum sabit {a} {b2}')
        ok('duraklatıldı' in await pg.text_content('#acPos'), 'konum etiketi')
        await pg.click('#acFwd'); ok(await pg.evaluate('S.audio.paused') and abs(await pg.evaluate('acPos()') - a - 10) < 1e-3, 'duraklıyken sarma duraklı kalır')
        await pg.evaluate("()=>{const e=document.querySelector('#acSeek');e.value=500;e.dispatchEvent(new Event('input'));0}")
        ok(abs(await pg.evaluate('acPos()') - 20) < 0.05, 'çubukla konuma git')
        ok(abs(await pg.evaluate('S.plot.playhead') - 20) < 0.05, 'oynatma imleci grafikte')
        await pg.click('#acPP'); await pg.wait_for_timeout(500); ok(await pg.evaluate('acPos()') > 20.2, 'devam')
        await pg.keyboard.press('Shift+ArrowRight'); ok(await pg.evaluate('acPos()') > 30, 'Shift+→')
        await pg.click('button:has-text("■ Durdur")'); ok(await pg.is_disabled('#acPP') and await pg.text_content('#acPos') == '–', 'durdur')
        async with pg.expect_download() as d: await pg.click('button:has-text("kalibre, 32-bit float")')
        path = await (await d.value).path(); raw = open(path, 'rb').read()
        import struct
        ok(raw[:4] == b'RIFF' and struct.unpack('<H', raw[20:22])[0] == 3 and struct.unpack('<I', raw[24:28])[0] == 8000, 'float WAV başlığı')
        i = raw.index(b'data'); n = struct.unpack('<I', raw[i+4:i+8])[0] // 4; v = struct.unpack('<%df' % n, raw[i+8:i+8+n*4])
        ok(n == 320000 and abs(max(v) - 2) < 1e-3, f'Pa değerleri korunur n={n} max={max(v)}')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('ac3:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
