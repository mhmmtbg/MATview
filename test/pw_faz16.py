# v2.28 (sentetik veri): çerçeve görünümü yakınlaştırma / kaydırma / sığdırma ve ofset ipucu; çıktı klasörünü açma (MATView.exe köprüsü taklit)
import asyncio, os, sys, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        # MATView.exe klasör köprüsü taklidi (yalnız klasör seçme ve açma çağrıları kaydedilir)
        await pg.evaluate("window.__opened = []; window.mvFsInfo = async () => ({port: 1, token: 'x'}); window.mvPickFolder = async () => 'C:\\\\Cikti'; window.mvAllowDir = async () => true; window.mvOpenFolder = async (p) => { window.__opened.push(p); return true; }; 0")
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        # çerçeve görünümü
        await f.evaluate("document.querySelector('#settingsOverlay').classList.remove('hidden'); document.querySelector('#ftBody button[data-fa=view]').click()"); await pg.wait_for_timeout(400)
        ok(await f.evaluate("!document.querySelector('#fvOverlay').classList.contains('hidden')"), 'çerçeve görünümü açılmadı')
        box = await f.evaluate("(()=>{const r=document.querySelector('#fvCanvas').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()")
        fr = await (await f.frame_element()).bounding_box()
        cx, cy = fr['x'] + box[0] + box[2] * 0.4, fr['y'] + box[1] + box[3] * 0.4
        await pg.mouse.move(cx, cy); await pg.wait_for_timeout(150)
        tip = await f.evaluate("document.querySelector('#fvTip').innerText"); print(tip[:160].replace('\n', ' | '))
        ok('Satır öncelikli ofset' in tip and 'Sütun öncelikli ofset' in tip, 'ipucunda ofsetler yok')
        for _ in range(6): await pg.mouse.wheel(0, -240); await pg.wait_for_timeout(60)
        z = await f.evaluate("document.querySelector('#fvCount').textContent"); print('zoom:', z); ok('zoom' in z, 'tekerle yakınlaşmadı')
        await pg.mouse.down(); await pg.mouse.move(cx - 150, cy - 80, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(100)
        await pg.mouse.dblclick(cx, cy); await pg.wait_for_timeout(150)
        ok('zoom' not in await f.evaluate("document.querySelector('#fvCount').textContent"), 'çift tık sığdırmadı')
        await f.evaluate("document.querySelector('#fvX').click()")
        # çıktı klasörü: seç → aç
        await f.evaluate("document.querySelector('#btnPickDir').click()"); await pg.wait_for_timeout(300)
        ok(await f.evaluate("!document.querySelector('#btnOpenOut').disabled"), 'Klasörü aç etkin değil')
        await f.evaluate("document.querySelector('#btnOpenOut').click()"); await pg.wait_for_timeout(200)
        op = await pg.evaluate("window.__opened"); print('açılan:', op); ok(op and op[0].startswith('C:\\Cikti'), 'klasör açma çağrısı')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz16:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
