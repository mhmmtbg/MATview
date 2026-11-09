# v2.25 (sentetik veri): .cnv gibi uzantılı kayıtlar telemetriye gider; atılacak byte ayarı arayüzde; Çöz ve MATView'de aç aynı sonucu verir
import asyncio, os, sys, subprocess, shutil
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
# her çerçevenin önüne 6 byte eklenmiş .cnv kopyası
raw = open(D + 'kayit.bin', 'rb').read(); FL = 12500; H = bytes.fromhex('EB90'); out = bytearray(); i = 0
while i + FL <= len(raw):
    if raw[i:i + 2] == H: out += b'\x11\x22\x33\x44\x55\x66' + raw[i:i + FL]; i += FL
    else: out.append(raw[i]); i += 1
out += raw[i:]; open(D + 'kayit_d6.cnv', 'wb').write(out)
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        # ayar: 6 byte, header'dan önce
        await f.evaluate("(()=>{const e=document.querySelector('#s_discardEnabled'); e.checked=true; e.dispatchEvent(new Event('change')); const c=document.querySelector('#s_discardCount'); c.value='6'; c.dispatchEvent(new Event('input')); c.dispatchEvent(new Event('change'));})()")
        await pg.wait_for_timeout(200)
        ok('kayıtta 12.506 byte' in await f.evaluate("document.querySelector('#s_flen').textContent"), 'çerçeve uzunluğu metni')
        await pg.set_input_files('#fileIn', [D + 'kayit_d6.cnv']); await pg.wait_for_timeout(1500)
        ok('kayit_d6.cnv' in await f.evaluate("document.querySelector('#fileBody').innerText"), '.cnv telemetri dosya listesine gelmedi')
        await f.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000)
        n = await pg.evaluate("(()=>{const f=S.files.find(f=>f.tlm);const c=f.channels.find(c=>c.name==='OBC/temp');return c? c.n : -1})()")
        print('OBC/temp örnek:', n); ok(n > 1000, 'çözülen kanal yok / az')
        log = await f.evaluate("document.querySelector('#logView').textContent"); ok("6 byte dikkate alınmıyor" in log, 'günlükte atılan byte satırı yok')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz13:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
