# v2.32 (sentetik veri): sol panelde kamera videoları ve kamera penceresi
# - telemetri çözümünün videoları dosyanın "Kamera" grubunda; tık → taşınabilir kamera penceresi
# - video zamanı ↔ kanal zamanı eşlemesi (karelerin geldiği telemetri çerçevesi): konum çizgisi, imleçle video konumu,
#   "İmlece git", "Grafik izlesin"
# - dosya kapatılınca pencere kapanır; açılan .mp4 sol panelde video dosyası olarak
import asyncio, os, sys, subprocess, tempfile, base64
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        await f.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000); await pg.wait_for_timeout(600)
        info = await pg.evaluate("""(() => { const f = S.files.find(f => f.tlm), v = f.videos && f.videos[0]; if (!v) return null; const s = v.sync;
          let mono = true; for (let i = 1; i < s.tel.length; i++) if (s.tel[i] < s.tel[i - 1] || s.vid[i] < s.vid[i - 1]) mono = false;
          return {n: f.videos.length, k: s.vid.length, mono, t0: s.tel[0], t1: s.tel[s.tel.length - 1], span: f.tlm.ss.span * f.tlm.ss.T}; })()""")
        print('videolar', info)
        ok(info and info['n'] == 2 and info['k'] > 100 and info['mono'], 'video eşlemesi')
        ok(info and 0 <= info['t0'] < info['t1'] <= info['span'] + 0.05, 'eşleme kayıt süresi içinde')
        rows = await pg.evaluate("[...document.querySelectorAll('#tree .tdev, #tree .vidrow')].map(e => e.textContent)")
        ok(rows[0].startswith('▼Kamera') and 'KAMERA_A' in rows[1], 'Kamera grubu en üstte: ' + str(rows[:3]))
        # bir kanalı çiz, videoyu aç
        await pg.evaluate("(async () => { const f = S.files.find(f => f.tlm); await addToNewAxes([f.channels.find(c => !/counter/i.test(c.name))], false); switchView('tlm'); })()"); await pg.wait_for_timeout(500)
        await pg.click('#tree .vidrow >> nth=0'); await pg.wait_for_timeout(1200)
        st = await pg.evaluate("[!document.querySelector('#cvWin').classList.contains('hidden'), CAMV.video.readyState >= 1, S.view, CAMV.current.v.name]")
        ok(st[0] and st[1] and st[2] == 'time' and st[3].startswith('KAMERA_A'), 'kamera penceresi: ' + str(st))
        # konum çizgisi = eşlenmiş kanal zamanı
        await pg.evaluate("CAMV.video.pause(); CAMV.video.currentTime = 4; 0"); await pg.wait_for_timeout(500)
        r = await pg.evaluate("[S.plot.playhead, CAMV.vToT(CAMV.current.v, CAMV.video.currentTime)]")
        ok(r[0] is not None and abs(r[0] - r[1]) < 1e-6, 'konum çizgisi kanal zamanında: ' + str(r))
        # video dururken grafikte imleç → video o ana gider
        await pg.evaluate("(() => { const ax = S.plot.axes[0]; S.plot.cursors = [{axes: ax, tr: ax.traces[0], x: 8.0, y: 0}]; S.plot.invalidate(); })()"); await pg.wait_for_timeout(700)
        r = await pg.evaluate("[CAMV.video.currentTime, CAMV.tToV(CAMV.current.v, 8.0), S.plot.playhead]")
        ok(abs(r[0] - r[1]) < 0.05 and abs(r[2] - 8.0) < 0.1, 'imleç → video: ' + str(r))
        # İmlece git (imleç yokken görünen aralığın ortası)
        await pg.evaluate("S.plot.cursors = []; S.plot.axes[0].xlim = [2, 4]; CAMV.video.currentTime = 0; 0"); await pg.wait_for_timeout(300)
        await pg.click('#cvWin .cv-go'); await pg.wait_for_timeout(500)
        r = await pg.evaluate("[CAMV.video.currentTime, CAMV.tToV(CAMV.current.v, 3)]"); ok(abs(r[0] - r[1]) < 0.05, 'İmlece git: ' + str(r))
        # Grafik izlesin: oynarken konum çizgisi görünür aralıkta kalır
        await pg.check('#cvWin .cv-follow'); await pg.evaluate("S.plot.axes[0].xlim = [0, 1]; CAMV.video.currentTime = 6; CAMV.video.play(); 0"); await pg.wait_for_timeout(1200)
        r = await pg.evaluate("(() => { CAMV.video.pause(); const ax = S.plot.axes[0]; return [ax.xlim[0], ax.xlim[1], S.plot.playhead]; })()")
        ok(r[0] <= r[2] <= r[1], 'grafik izlemeli: ' + str(r))
        # Grafikte göster kapatılınca çizgi kalkar
        await pg.uncheck('#cvWin .cv-sync'); ok(await pg.evaluate("S.plot.playhead") is None, 'çizgi kalkmalı')
        b64 = await pg.evaluate("(async () => { const v = S.files.find(f => f.tlm).videos[1]; const u = new Uint8Array(await v.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); })()")
        tmp = tempfile.mkdtemp(prefix='mv_cam_'); mp4 = tmp + '/kamera_b.mp4'; open(mp4, 'wb').write(base64.b64decode(b64))
        # dosya kapatılınca pencere kapanır
        await pg.evaluate("closeFile(S.files.find(f => f.tlm)); 0"); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("document.querySelector('#cvWin').classList.contains('hidden') && CAMV.current === null"), 'dosya kapanınca pencere kapanmalı')
        # açılan .mp4
        await pg.set_input_files('#fileIn', [mp4]); await pg.wait_for_timeout(1200)
        r = await pg.evaluate("[S.files.some(f => f.videoOnly && f.name === 'kamera_b.mp4'), !document.querySelector('#cvWin').classList.contains('hidden'), CAMV.video.readyState >= 1, [...document.querySelectorAll('#tree .vidrow')].length]")
        ok(r == [True, True, True, 1], '.mp4 sol panelde: ' + str(r))
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz20:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
