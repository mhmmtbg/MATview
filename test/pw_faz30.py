# v2.47 (sentetik veri): Telemetri › Parametreler düğmesi
# - arama, etiket / parametre kutuları, Uygula → düğmede "n / toplam"; ayar kaydedilir
# - Çöz ve MATView'de aç: yalnız seçilen parametreler kanal olur; "Tümü" ile filtre kalkar
import asyncio, os, sys, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        ok((await f.inner_text('#btnParams')).strip() == 'Parametreler: tümü', 'başlangıç: tümü')
        await f.click('#btnParams'); await f.wait_for_selector('#pfList .pf-g')
        groups = await f.evaluate("[...document.querySelectorAll('#pfList .pf-g b')].map(e => e.textContent)"); print('etiketler', groups)
        import re; tot = int(re.search(r'/ (\d+) parametre', await f.inner_text('#pfCnt')).group(1)); print('toplam parametre', tot)
        await f.click('#pfNone')
        # OBC etiketini aç, iki parametre seç
        await f.fill('#pfQ', 'OBC'); await f.wait_for_timeout(100)
        boxes = await f.query_selector_all('#pfList .pf-ps input[data-p]'); ok(len(boxes) >= 3, 'OBC parametreleri görünmeli')
        await f.locator('#pfList .pf-ps input[data-p]').nth(0).click(); await f.locator('#pfList .pf-ps input[data-p]').nth(1).click()
        ok('2 / %d parametre seçili' % tot in await f.inner_text('#pfCnt'), 'sayaç: ' + await f.inner_text('#pfCnt'))
        ok(await f.evaluate("document.querySelector('#pfList input[data-lab]').indeterminate"), 'kısmi etiket kutusu')
        await f.fill('#pfQ', ''); await f.wait_for_timeout(100); await pg.screenshot(path='/tmp/claude-0/pf.png')
        await f.click('#modalFoot button.primary'); await f.wait_for_timeout(100)
        ok((await f.inner_text('#btnParams')).strip() == 'Parametreler: 2 / %d' % tot, 'düğme metni ' + await f.inner_text('#btnParams'))
        await f.click('#btnParams'); await f.wait_for_selector('#pfList .pf-g'); ok(('2 / %d parametre seçili' % tot) in await f.inner_text('#pfCnt'), 'seçim saklanmalı'); await f.click('#modalFoot button:not(.primary)')
        await f.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000); await pg.wait_for_timeout(500)
        chs = await pg.evaluate("S.files.find(f => f.tlm).channels.filter(c => !c.video).map(c => c.name)"); print('kanallar', chs)
        ok(len(chs) >= 2 and all(c.startswith('OBC/') for c in chs) and len([c for c in chs if not c.endswith('frame_counter')]) == 2, 'yalnız seçilen parametreler')
        # Tümü: filtre kalkar
        await f.click('#btnParams'); await f.click('#pfAll'); await f.click('#modalFoot button.primary'); await f.wait_for_timeout(100)
        ok((await f.inner_text('#btnParams')).strip() == 'Parametreler: tümü' , 'tümü seçilince filtre kalkmalı')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz30:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
