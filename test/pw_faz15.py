# v2.27 (sentetik veri): Canlı dinle — Aç menüsünden ayrı pencere; telemetri dosyadan oynatmasında seçilen parametrenin
# örnekleri sırayla alınır, süzülür ve çalınır; örnekleme hızı gelen akıştan; şebeke (50 Hz) tespiti; akustik sekmesi değişmez
import asyncio, os, sys, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required']); pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        ac0 = await pg.evaluate("document.querySelectorAll('#right *').length")
        # şebeke tespiti (DSP): 50 Hz + harmonikleri olan sentetik sinyal
        m = await pg.evaluate("(()=>{const fs=8000,n=fs*2,x=new Float32Array(n);let s=1;const r=()=>{s=(s*16807)%2147483647;return s/2147483647-0.5};for(let i=0;i<n;i++)x[i]=0.3*Math.sin(2*Math.PI*50*i/fs)+0.1*Math.sin(2*Math.PI*150*i/fs)+0.05*Math.sin(2*Math.PI*250*i/fs)+0.2*r();return LAUD.D.detectMains(x,fs)})()")
        print('şebeke:', m); ok(m and m['base'] == 50 and 1 in m['harm'] and 3 in m['harm'], 'şebeke 50 Hz bulunamadı')
        m2 = await pg.evaluate("(()=>{const fs=8000,n=fs*2,x=new Float32Array(n);let s=7;const r=()=>{s=(s*16807)%2147483647;return s/2147483647-0.5};for(let i=0;i<n;i++)x[i]=r();return LAUD.D.detectMains(x,fs)})()")
        ok(m2 is None, 'gürültüde yanlış şebeke tespiti')
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        # Aç menüsü › Canlı dinle
        await pg.evaluate("$('#btnLiveAud').click()"); await pg.wait_for_timeout(400)
        ok(await pg.evaluate("!$('#laWin').classList.contains('hidden')"), 'pencere açılmadı')
        sigs = await pg.evaluate("[...document.querySelectorAll('#laWin .la-sig option')].map(o=>o.value+'='+o.textContent)"); print(sigs[:4], len(sigs))
        ok(len(sigs) > 10, 'sinyal listesi')
        ok('Telemetri' in await pg.evaluate("$('#laWin .la-st').textContent"), 'akış yok durumu')
        key = await pg.evaluate("[...document.querySelectorAll('#laWin .la-sig option')].find(o=>/SENS\\/sensor/.test(o.textContent)).value")
        await pg.evaluate("(k)=>{const s=$('#laWin .la-sig'); s.value=k; s.dispatchEvent(new Event('change'))}", key)
        # dosyadan oynat
        await pg.set_input_files('#fileIn', [D + 'kayit.bin']); await pg.wait_for_timeout(800)
        await f.evaluate("TPHost.liveSource('sim'); document.querySelector('#lvConnect').click()")
        await f.wait_for_function("TPLive.connState() === 'connected'", timeout=10000)
        await pg.evaluate("$('#laWin .la-play').click()"); await pg.wait_for_timeout(3500)
        st = await pg.evaluate("(()=>{const A=LAUD.state;return A?{rate:A.rate, srcs:(A.srcs||[]).length, drop:A.drop, sr:LAUD.cfg.sr}:null})()"); print('dinleme:', st)
        ok(st and st['rate'] > 100, 'örnek gelmiyor')
        ok(st and abs(st['sr'] - st['rate']) < st['rate'] * 0.2, 'örnekleme hızı gelen hızdan alınmadı')
        ok('örnek/sn' in await pg.evaluate("$('#laWin .la-st').textContent"), 'durum satırı')
        # süzgeç değişince çalmaya devam
        await pg.evaluate("$('#laWin .la-seg button[data-ft=bp]').click()"); await pg.wait_for_timeout(600)
        ok(await pg.evaluate("!!LAUD.state && LAUD.state.chain.length >= 2"), 'bant geçiren zincir')
        await pg.screenshot(path='/tmp/_faz15.png')
        await pg.evaluate("$('#laWin .la-stop').click()"); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("LAUD.state === null"), 'durdurma')
        ok(await f.evaluate("TPLive.audioPull() === null"), 'telemetri dinleme kancası kalktı')
        await f.evaluate("document.querySelector('#lvDisconnect').click()")
        # akustik sekmesi değişmedi
        ok(await pg.evaluate("document.querySelectorAll('#right *').length") == ac0, 'akustik / sağ panel değişti')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz15:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
