# Faz 6 (v2.20): Kod sekmesinde tablo / datetime / fit / CSV yazma (indirme) ve çalışma alanı özeti
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); ctx = await b.new_context(accept_downloads=True, viewport={'width': 1400, 'height': 900}); pg = await ctx.new_page(); errs = []; dls = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('download', lambda d: dls.append(d))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.click('#viewtabs button[data-v=code]'); await pg.wait_for_timeout(300)
        code = "t = datetime(2024,5,1,8,0,0) + minutes(0:10:40)'; v = [1;3;2;5;4]; T = table(t, v)\n[f, g] = fit((1:5)', v, 'poly1');\nwritetable(T, 'olcum.csv');\nfigure; plot(t, v); e = eig([2 0;0 3])'"
        await pg.evaluate("c => { CODE.docs[CODE.cur].text = c; codeShowDoc(); codeRun('all'); }", code); await pg.wait_for_timeout(2500)
        out = await pg.evaluate("$('#codeOut').innerText"); print(out[-600:])
        assert '5×2 table' in out and '01-May-2024 08:40:00' in out and 'e =' in out and 'Hata' not in out, out[-600:]
        ws = await pg.evaluate("CODE.ws.map(v=>v.n+':'+v.cls)"); print(ws); assert 'T:table' in ws and 't:datetime' in ws and 'f:cfit' in ws
        await pg.wait_for_timeout(500)
        assert any(d.suggested_filename == 'olcum.csv' for d in dls), [d.suggested_filename for d in dls]
        d = [d for d in dls if d.suggested_filename == 'olcum.csv'][0]; path = await d.path(); txt = open(path).read(); print(txt[:120]); assert txt.startswith('t,v') and '01-May-2024 08:00:00,1' in txt
        assert await pg.evaluate("CODE.figs.length") >= 1
        assert not errs, errs
        print('pw_faz10 OK')
        await b.close()
asyncio.run(main())
