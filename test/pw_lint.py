# Faz 4: Kod düzenleyicide yazarken hata denetimi — sözdizimi hatası / eksik end / tanımsız ad / gölgeleme /
# kullanılmayan değişken; dalgalı çizgi, satır işareti, Sorunlar listesi ve satıra gitme
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(400)
        await pg.click('#viewtabs button[data-v=code]'); await pg.wait_for_timeout(400)
        async def setcode(t):
            await pg.evaluate("t => { const e = document.querySelector('#codeEd'); e.value = t; e.dispatchEvent(new Event('input')); }", t); await pg.wait_for_timeout(500)
            return await pg.evaluate("LINT.diags.map(d => [d.sev, d.line, d.msg])")
        d = await setcode("x = linspace(0, 1, 5);\ny = x.^2 + 1;\ndisp(mean(y))")
        ok(d == [], 'temiz kodda uyarı: ' + str(d))
        d = await setcode("x = 1;\ny = (x + 2;\nz = 3;"); print(d)
        ok(len(d) == 1 and d[0][0] == 'e' and d[0][1] == 2, 'parantez hatası satırı')
        ok(await pg.evaluate("!!document.querySelector('#codeGut .gerr') && !!document.querySelector('#codeMk .lint-e')"), 'hata işaretleri görünmüyor')
        d = await setcode("x = 1;\nfor k = 1:3\n  x = x + k;\n\ny = 2;"); print(d)
        ok(d and d[0][0] == 'e' and d[0][1] == 2 and 'end' in d[0][2], 'eksik end bloğun satırını göstermeli')
        d = await setcode("a = 1;\nb = a + qqq;\nsum = 3;\nr = foo(2);"); print(d)
        ok(any(x[0] == 'w' and x[1] == 2 and 'qqq' in x[2] for x in d), 'tanımsız değişken'); ok(any(x[1] == 3 and 'gölgeliyor' in x[2] for x in d), 'gölgeleme'); ok(any(x[1] == 4 and 'foo' in x[2] for x in d), 'tanımsız işlev')
        ok(await pg.evaluate("document.querySelectorAll('#codeProbs .lpi').length") == len(d), 'Sorunlar listesi')
        d = await setcode("r = kare(3);\nfunction y = kare(x)\n  t = 5;\n  y = x^2\nend"); print(d)
        ok(any('kullanılmıyor' in x[2] and x[1] == 3 for x in d) and any("';'" in x[2] and x[1] == 4 for x in d) and not any('kare' in x[2] for x in d), 'işlev uyarıları')
        # anonim işlev parametresi, try/catch değişkeni, for değişkeni tanımsız sayılmamalı
        d = await setcode("f = @(u, v) u + v;\ntry\n  q = f(1, 2);\ncatch ME\n  disp(ME.message);\nend\nfor kk = 1:2, disp(kk); end"); ok(d == [], 'yanlış uyarı: ' + str(d))
        # Sorunlar listesinden satıra git
        await setcode("a = 1;\nb = 2;\nc = a + zz;")
        await pg.click('#codeProbs .lpi'); ln = await pg.evaluate("(() => { const e = document.querySelector('#codeEd'); return e.value.slice(0, e.selectionStart).split('\\n').length; })()"); ok(ln == 3, 'satıra gitmedi')
        ok('zz' in await pg.text_content('#codePos'), 'konum satırında ileti yok')
        # çalışma hatası işaretlenir
        await setcode("a = 1;\nb = [1 2 3];\nc = b(5);")
        await pg.click('#codeRun'); await pg.wait_for_timeout(1500)
        d = await pg.evaluate("LINT.diags.map(d => [d.sev, d.line, d.msg])"); print(d); ok(any(x[0] == 'e' and x[1] == 3 and 'Çalışma' in x[2] for x in d), 'çalışma hatası işaretlenmedi')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('lint:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
