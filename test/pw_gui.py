# Arayüz (GUIDE) çalışma zamanı: .m + .fig aç, F5 ile arayüz açılır, düğme/menü/dosya seçimi/çizim
import asyncio, os, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; T = '/tmp/_mv_gui/'; os.makedirs(T, exist_ok=True)
subprocess.run(['python3', ROOT + 'test/make_guifig.py', T + 'demoGUI.fig'], check=True)
open(T + 'demoGUI.m', 'w').write(open(ROOT + 'test/fixtures/demoGUI.m').read()); open(T + 'ornek.bin', 'wb').write(bytes([7, 1, 2, 3, 4]))
async def run(sab):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'] + (['--enable-features=SharedArrayBuffer'] if sab else [])); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        print('SAB', await pg.evaluate("typeof SharedArrayBuffer"))
        await pg.set_input_files('#fileIn', [T + 'demoGUI.m', T + 'demoGUI.fig']); await pg.wait_for_timeout(1500)
        btns = await pg.evaluate("[...document.querySelectorAll('#mfoot button')].map(b=>b.textContent)"); print(btns); assert 'Arayüzü çalıştır' in btns
        await pg.evaluate("[...document.querySelectorAll('#mfoot button')].find(b=>b.textContent==='Arayüzü çalıştır').click()"); await pg.wait_for_timeout(2500)
        print(await pg.evaluate("$('#codeOut').innerText.slice(-300)"))
        assert await pg.evaluate("S.view") == 'gui', 'arayüz görünümü açılmadı'
        assert await pg.evaluate("document.querySelectorAll('#v-gui .gbtn').length") == 2
        await pg.select_option('#v-gui select.gpop', index=1); await pg.wait_for_timeout(800)
        assert await pg.evaluate("document.querySelector('#v-gui .gedit').value") == '2'
        await pg.click('#v-gui .gbtn >> text=Ciz'); await pg.wait_for_timeout(800)
        await pg.click('#v-gui .gbtn >> text=Ciz'); await pg.wait_for_timeout(800)
        assert (await pg.evaluate("document.querySelector('#v-gui .gtext').textContent")) == 'Tiklama: 2'
        tr = await pg.evaluate("[...CODE.gui.plots.values()][0].axes[0].traces.length"); assert tr == 1, tr
        assert await pg.evaluate("[...CODE.gui.plots.values()][0].axes[0].title") == 'iki'
        # dosya seçimi
        if sab:
            await pg.click('#v-gui .gbtn >> text=Dosya Sec'); await pg.wait_for_timeout(800)
            assert 'Bilgisayardan seç' in await pg.evaluate("document.querySelector('#mbody').innerText")
            await pg.set_input_files('#mbody input[type=file]', [T + 'ornek.bin']); await pg.wait_for_timeout(1500)
        else:
            await pg.set_input_files('#v-gui .guibar input[type=file]', [T + 'ornek.bin']); await pg.wait_for_timeout(500)
            await pg.click('#v-gui .gbtn >> text=Dosya Sec'); await pg.wait_for_timeout(1500)
        txt = await pg.evaluate("document.querySelector('#v-gui .gtext').textContent"); print(txt); assert 'ornek.bin: 5 bayt, ilk 7' in txt, txt
        await pg.screenshot(path=T + ('gui_sab.png' if sab else 'gui.png'))
        # komut penceresine tıklayıp yazma
        await pg.click('#viewtabs button[data-v=code]'); await pg.click('#codeOut'); await pg.keyboard.type('numel(veri)'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(800)
        assert 'ans = 5' in await pg.evaluate("$('#codeOut').innerText"), await pg.evaluate("$('#codeOut').innerText.slice(-200)")
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(run(True)); asyncio.run(run(False))
