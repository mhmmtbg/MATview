# v2.26 (sentetik veri): canlı kaynaklar — Ethernet (UDP) MATView.exe'deki yerel köprüyle (Go, launcher/live) uçtan uca;
# seri port arayüzü (port listesi) ve tarayıcı modunda köprü indirme; kaynak seçimi arayüzü
import asyncio, os, sys, subprocess, socket, time, threading, re
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
env = dict(os.environ, MATVIEW_LIVE_SERVE='1', GOFLAGS='-mod=mod')
srv = subprocess.Popen(['go', 'test', '-run', 'TestServe', '-v', '-timeout', '20m', './live'], cwd=ROOT + 'launcher', env=env, stdout=subprocess.PIPE, text=True)
port = token = None
for line in srv.stdout:
    m = re.match(r'LIVE (\d+) (\w+)', line)
    if m: port, token = int(m.group(1)), m.group(2); break
assert port, 'canlı köprü başlamadı'
raw = open(D + 'kayit.bin', 'rb').read()
def sender(uport, stop):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); i = 0
    while not stop.is_set():
        s.sendto(raw[i:i + 1400], ('127.0.0.1', uport)); i += 1400
        if i >= len(raw): i = 0
        time.sleep(0.0005)
def free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1500, 'height': 900}, accept_downloads=True); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        # tarayıcı modu: UDP köprüsü indirilebilir, port listesi gizli
        await f.evaluate("document.querySelector('#lvSource button[data-src=udp]').click()"); await pg.wait_for_timeout(300)
        ok(await f.evaluate("document.querySelector('#tlDrawerBtn').textContent.includes('Ethernet (UDP)')"), 'çekmece düğmesi kaynak adını göstermiyor')
        ok(await f.evaluate("document.querySelector('#lvConnect').textContent.includes('Bağlan')"), 'Bağlan düğmesi')
        ok(await f.evaluate("!document.querySelector('#lvBridgeCell').classList.contains('hidden')"), 'tarayıcıda köprü alanı görünmeli')
        async with pg.expect_download() as dl: await f.evaluate("document.querySelector('#lvBridgeDl').click()")
        d = await dl.value; ok(d.suggested_filename == 'udp_kopru.zip', 'köprü zip')
        # MATView.exe gibi: yerel köprü (mvLiveInfo)
        await pg.evaluate("([p, t]) => { window.mvLiveInfo = async () => ({port: p, token: t}); }", [port, token])
        await f.evaluate("document.querySelector('#lvSource button[data-src=sim]').click(); document.querySelector('#lvSource button[data-src=udp]').click()"); await pg.wait_for_timeout(300)
        ok(await f.evaluate("document.querySelector('#lvBridgeCell').classList.contains('hidden')"), 'yerel modda köprü alanı gizlenmeli')
        up = free_port()
        await f.evaluate("(p) => { const e = document.querySelector('#lv_udpPort'); e.value = String(p); e.dispatchEvent(new Event('change')); }", up)
        stop = threading.Event(); th = threading.Thread(target=sender, args=(up, stop), daemon=True)
        await f.evaluate("document.querySelector('#lvConnect').click()")
        await f.wait_for_function("TPLive.connState() === 'connected'", timeout=8000)
        th.start(); await pg.wait_for_timeout(2500)
        st = await f.evaluate("TPLive.liveStats()"); print('UDP:', st)
        ok(st['frames'] > 50, 'UDP üzerinden çerçeve çözülmedi')
        ok('UDP dinleniyor' in st['label'], 'bağlantı etiketi')
        await f.evaluate("document.querySelector('#lvDisconnect').click()"); await pg.wait_for_timeout(300)
        ok(await f.evaluate("TPLive.connState()") == 'idle', 'bağlantı kesilmedi')
        stop.set()
        # aynı port ikinci kez açılamazsa hata modalı (port meşgul)
        bs = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); bs.bind(('0.0.0.0', up))
        await f.evaluate("document.querySelector('#lvConnect').click()"); await pg.wait_for_timeout(1200)
        ok(await f.evaluate("TPLive.connState()") == 'idle', 'meşgul portta bağlantı kurulmamalı')
        ok('UDP portu açılamadı' in await f.evaluate("document.body.innerText"), 'meşgul port hata mesajı')
        bs.close()
        await f.evaluate("document.querySelectorAll('.modal .btn, #modal button').forEach(b => /Tamam|Kapat/.test(b.textContent) && b.click())")
        # seri port: yerel modda port listesi alanı görünür (Linux'ta boş liste)
        await f.evaluate("document.querySelector('#lvSource button[data-src=serial]').click()"); await pg.wait_for_timeout(500)
        ok(await f.evaluate("!document.querySelector('#lvComCell').classList.contains('hidden')"), 'yerel modda port listesi görünmeli')
        await pg.screenshot(path='/tmp/_faz14_seri.png')
        ok(await f.evaluate("document.querySelector('#lv_com').options.length >= 1"), 'port listesi')
        # seri port uçtan uca (Linux'ta port yerine adlandırılmış boru; Windows'ta COM aynı yoldan okunur)
        fifo = '/tmp/_mv_tvec_seri'
        if os.path.exists(fifo): os.remove(fifo)
        os.mkfifo(fifo)
        await f.evaluate("(p) => { const s = document.querySelector('#lv_com'); const o = document.createElement('option'); o.value = p; o.textContent = p; s.append(o); s.value = p; s.dispatchEvent(new Event('change')); }", fifo)
        def feed():
            try:
                with open(fifo, 'wb') as w:
                    for k in range(0, len(raw), 4096):
                        w.write(raw[k:k + 4096]); w.flush(); time.sleep(0.002)
            except (BrokenPipeError, OSError): pass
        tf = threading.Thread(target=feed, daemon=True); tf.start()
        await f.evaluate("document.querySelector('#lvConnect').click()")
        await f.wait_for_function("TPLive.connState() === 'connected'", timeout=8000); await pg.wait_for_timeout(2500)
        st = await f.evaluate("TPLive.liveStats()"); print('seri:', st); ok(st['frames'] > 100 and 'açıldı' in st['label'], 'seri porttan çerçeve çözülmedi')
        await f.evaluate("document.querySelector('#lvDisconnect').click()"); await pg.wait_for_timeout(300)
        await f.evaluate("document.querySelector('#lvSource button[data-src=sim]').click()"); await pg.wait_for_timeout(200)
        ok(await f.evaluate("document.querySelector('#lvConnect').textContent.includes('Oynat')"), 'dosyadan oynatmaya dönüş')
        # Aç menüsü › Telemetri: canlı bağlantı → seri port / UDP kaynağı seçili açılır
        await pg.evaluate("$('#btnTlmLive').click()"); await pg.wait_for_timeout(400)
        ok(await f.evaluate("['serial','udp'].includes(document.querySelector('#lvSource button.active').dataset.src) && !document.querySelector('#tlDrawer').classList.contains('hidden')"), 'canlı bağlantı menüsü')
        ok(await f.evaluate("document.querySelector('#lvSimNav').classList.contains('hidden')"), 'canlı kaynakta çerçeve kaydırıcısı gizlenmeli')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    srv.kill()
    print('faz14:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
