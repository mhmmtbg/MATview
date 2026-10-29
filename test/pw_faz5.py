# Faz 5: Kod sekmesi düzenleyicisi — Bul/Değiştir, Satıra git, ayraç eşleme, otomatik tamamlama, varsayılan parametre, yeni işlevler
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
CODE = "sinyal = sin(2*pi*5*(0:0.001:1));\nsonuc = olcek(3)\nsonuc2 = olcek(3, 4)\nv = interp1(0:3, [0 1 8 27], 1.5, 'spline')\nq = trapz([1 2;3 4;5 6])\nA = (1 + (2 * 3))\nfunction y = olcek(x, k=2)\n  y = x * k;\nend\n"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""(()=>{const fs=1000,d=new Float64Array(100); const c=addDerived('Ivme_X',d,null); c.dtS=1/fs; addDerived('Ivme_Y',d,null);})()""")
        await pg.evaluate("switchView('code')"); await pg.wait_for_selector('#codeEd')
        await pg.evaluate("t=>codeSetText(t)", CODE)
        # Bul
        await pg.click('#codeEd'); await pg.keyboard.press('Control+f'); await pg.wait_for_timeout(50)
        assert await pg.evaluate("!$('#codeFind').classList.contains('hidden')")
        await pg.keyboard.type('olcek'); await pg.wait_for_timeout(50); c = await pg.inner_text('#cfCount'); print('find', c); assert c.endswith('/ 3')
        assert await pg.evaluate("document.querySelectorAll('#codeMk .fm').length") == 3
        await pg.keyboard.press('Enter'); sel = await pg.evaluate("[$('#codeEd').selectionStart,$('#codeEd').selectionEnd]"); print('sel', sel)
        # regex + değiştir
        await pg.keyboard.press('Escape'); await pg.click('#codeEd'); await pg.keyboard.press('Control+h'); await pg.wait_for_timeout(50)
        await pg.fill('#cfFind', 'sonuc(\\d?)'); await pg.click('.cftg[title="Düzenli ifade"]'); await pg.fill('#cfRep', 'res$1'); await pg.dispatch_event('#cfRep', 'input')
        await pg.click('.cf-r button:has-text("Tümü")'); txt = await pg.evaluate("$('#codeEd').value"); assert 'res = olcek(3)' in txt and 'res2 = olcek(3, 4)' in txt, txt
        await pg.click('.cftg[title="Düzenli ifade"]'); await pg.click('.codefind .cfx')
        # satıra git
        await pg.click('#codeEd'); await pg.keyboard.press('Control+g'); await pg.keyboard.type('5'); await pg.keyboard.press('Enter')
        pos = await pg.evaluate("(()=>{const e=$('#codeEd'); return e.value.slice(0,e.selectionStart).split('\\n').length})()"); print('goto', pos); assert pos == 5
        # ayraç eşleme: son satırdaki ilk '(' ardına imleç
        await pg.evaluate("(()=>{const e=$('#codeEd'); const i=e.value.indexOf('A = (')+5; e.setSelectionRange(i,i); e.focus(); codeRefreshEd();})()")
        bm = await pg.evaluate("[...document.querySelectorAll('#codeMk .bm')].map(x=>x.textContent)"); print('bracket', bm); assert bm == ['(', ')']
        # otomatik tamamlama: işlev
        await pg.evaluate("(()=>{const e=$('#codeEd'); e.setSelectionRange(e.value.length,e.value.length); e.focus();})()")
        await pg.keyboard.type('z = interp'); await pg.wait_for_timeout(80)
        items = await pg.evaluate("[...document.querySelectorAll('#codeAc li .acn')].map(x=>x.textContent)"); print('ac', items[:5]); assert 'interp1' in items
        await pg.keyboard.press('Enter'); assert 'z = interp1' in await pg.evaluate("$('#codeEd').value")
        # kanal adı tamamlama
        await pg.keyboard.type("(1:3, 1:3, 2);\nw = ch('Ivm"); await pg.wait_for_timeout(80)
        items = await pg.evaluate("[...document.querySelectorAll('#codeAc li .acn')].map(x=>x.textContent)"); print('ac kanal', items); assert 'Ivme_X' in items and 'Ivme_Y' in items
        await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Tab'); v = await pg.evaluate("$('#codeEd').value"); assert "ch('Ivme_Y" in v
        await pg.keyboard.press('Escape')
        # çalıştır (varsayılan parametre + yeni işlevler)
        await pg.evaluate("t=>codeSetText(t)", CODE); await pg.evaluate("codeRun('all')"); await pg.wait_for_function("!CODE.running", timeout=30000); await pg.wait_for_timeout(300)
        out = await pg.inner_text('#codeOut'); print(out[-400:])
        import re as _re; flat = _re.sub(r'\s+', ' ', out)
        assert 'sonuc = 6' in out and 'sonuc2 = 12' in out and 'v = 3.3750' in out and 'q = 6 8' in flat, out
        await pg.screenshot(path='/tmp/claude-0/faz5.png')
        print('ERR', errs); assert not errs; await b.close(); print('OK faz5')
asyncio.run(main())
