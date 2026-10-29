# Telemetri görünümü (telemetryParser tabanlı modül) uçtan uca:
# - Aç ile ayar JSON'u ve template .xlsx dosyaları → çerçeve tipleri; .bin → çözme listesi
# - "Çöz ve MATView'de aç" → kanallar, zaman ekseni (kayıp çerçeve boşluğu, B2 örnekleri, koşullu / undersample zamanları)
# - tek .mat (oturumdan), kamera videosu (MP4) oynatma, dosyadan canlı oynatma + canlı kamera (WebCodecs), çerçeveye gitme
# - tema eşitleme, dosya kapatınca oturumun kapanması
import asyncio, os, subprocess, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'):
    subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
URL = 'file://' + os.path.abspath(ROOT + 'dist/matview.html')
HAS_CAM = os.path.exists(D + 'kamera_1.h264')
fails = []
def ok(c, m):
    if not c: fails.append(m); print('  HATA:', m)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 920})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(700)
        # ayar JSON'u Aç ile → Telemetri görünümü, şablonlar
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        ok(await pg.evaluate("S.view") == 'tlm', 'Telemetri görünümüne geçilmedi')
        ok(await pg.evaluate("getComputedStyle(document.querySelector('#right')).display") == 'none', 'Telemetri görünümünde sağ panel gizlenmedi')
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        n_ft = await f.evaluate("TPUI.getS().frameTypes.length")
        ok(n_ft == 2, 'çerçeve tipi sayısı %s' % n_ft)
        # template .xlsx bırakma: aynı adlı çerçeve tipinin template'i yenilenir
        await pg.set_input_files('#fileIn', [D + 'template_cerceve0.xlsx'])
        await pg.wait_for_timeout(800)
        st = await f.evaluate("(() => { const s = TPUI.getS(); return [s.frameTypes.length, s.frameTypes.map(x => x.templateName)]; })()")
        print('çerçeve tipleri:', st)
        ok(st[0] == 3 or 'template_cerceve0.xlsx' in st[1], 'template eklenmedi')
        await f.evaluate("document.querySelector('#btnSettingsClose').click()")
        # yeniden ayarları yükle (temiz iki tip)
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_timeout(500)
        # .bin → çözme listesi
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        await f.click('#btnRunMv')
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000)
        r = await pg.evaluate("""(async () => {
          const f = S.files.find(f => f.tlm), get = n => f.channels.find(c => c.name === n);
          const a = get('ADCS/q1'), k = get('MOTOR_A/akim'), c = get('CAM/img_id'), o = get('OBC/temp');
          switchView('time'); await addToNewAxes([o, a, k, c]);
          const gap = []; for (let i = 1; i < o.n; i++) { const d = Math.round((o.t(i) - o.t(i - 1)) * 1000); if (d !== 10) gap.push([i, d]); }
          return {n: f.channels.length, devs: [...new Set(f.channels.map(c => c.dev))], gap, adcs: [a.n, a.spp, a.t(0), a.t(1), a.t(2)], motor: [k.n, k.t(0), k.t(1), k.t(2)], cam: [c.n, c.t(0)], loaded: [o, a, k, c].every(x => x.data && x.data.length === x.n)};
        })()""")
        print('kanallar:', r['n'], r['devs'], 'boşluk', r['gap'], 'ADCS', r['adcs'], 'MOTOR_A', r['motor'], 'CAM', r['cam'])
        ok(r['loaded'], 'kanal verisi yüklenmedi')
        ok(len(r['gap']) == 1 and r['gap'][0][1] == 40, 'kayıp çerçeve boşluğu yanlış: %s' % r['gap'])
        ok(r['adcs'][1] == 2 and abs(r['adcs'][3] - r['adcs'][2] - 0.005) < 1e-9, 'B2 örnek zamanı yanlış')
        ok(abs(r['motor'][2] - r['motor'][1] - 0.03) < 1e-9, 'koşullu (sel%3) zaman yanlış')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path='/tmp/_mv_tlm/pw_plot.png')
        # tek .mat (dosya sağ tık menüsündeki eylemle aynı istek)
        sz = await pg.evaluate("(async () => { const f = S.files.find(f => f.tlm); const r = await f.tlm.client.request('mat', {sid: f.tlm.ss.id}); return [r.name, r.blob.size]; })()")
        print('tek .mat:', sz); ok(sz[1] > 1000, 'tek .mat boş')
        # ağaç dosya menüsünde tek .mat seçeneği
        has_menu = await pg.evaluate("(() => { const f = S.files.find(f => f.tlm), it = []; tlmSessionMenu(f, it); return it.some(x => x && /tek \\.mat/.test(x.t)); })()")
        ok(has_menu, 'dosya menüsünde tek .mat yok')
        # kamera videosu
        await pg.click('#viewtabs button[data-v=tlm]')
        await f.click('#mainTabs button[data-tab=video]')
        nv = await f.locator('#vpList button').count()
        print('çözülen video:', nv)
        if HAS_CAM:
            ok(nv == 2, 'kamera videoları listede yok')
            can = await f.evaluate("document.createElement('video').canPlayType('video/mp4; codecs=\"avc1.42c01e\"')")
            await f.locator('#vpList button').first.click()
            await pg.wait_for_timeout(2000)
            vi = await f.evaluate("(() => { const v = document.querySelector('#vpPlayer video'); return {rs: v.readyState, w: v.videoWidth, d: v.duration}; })()")
            print('video:', vi, 'codec:', can)
            if can: ok(vi['w'] == 320 and vi['d'] > 10, 'video oynatılamadı')
        # dosyadan canlı oynatma
        await f.click('#mainTabs button[data-tab=live]')
        await f.set_input_files('#lvSimInput', [D + 'kayit.bin'])
        await f.wait_for_function("/\\//.test(document.querySelector('#lvFrInfo').textContent)", timeout=30000)
        await f.click('#lvConnect')
        await pg.wait_for_timeout(1200)
        if HAS_CAM:
            await f.fill('#lvFilter', 'goruntu')
            await pg.wait_for_timeout(300)
            await f.locator('button[title="Videoyu oynat"]').first.click()
        await pg.wait_for_timeout(2500)
        lv = await f.evaluate("({fr: document.querySelector('#lvFrames').textContent, st: document.querySelector('#lvConnBadge').textContent, vf: [...document.querySelectorAll('.vfig')].map(x => x.textContent.replace(/\\s+/g, ' ').slice(0, 160))})")
        print('canlı:', lv)
        ok(lv['st'] == 'Bağlı' and int(lv['fr'].split()[0].replace('.', '')) > 50, 'canlı oynatma çalışmadı')
        await pg.screenshot(path='/tmp/_mv_tlm/pw_live.png')
        await f.evaluate("(() => { const s = document.querySelector('#lvFrNum'); s.value = 700; s.dispatchEvent(new Event('change')); })()")
        await pg.wait_for_timeout(700)
        nav = await f.evaluate("[document.querySelector('#lvFrNum').value, document.querySelector('#lvConnBadge').textContent]")
        print('çerçeveye git:', nav); ok(nav == ['700', 'Duraklatıldı'], 'çerçeveye gidilemedi')
        await f.click('#lvDisconnect')
        # tema
        await pg.click('#btnTheme'); await pg.wait_for_timeout(200)
        ok(await f.evaluate("document.documentElement.dataset.theme") == await pg.evaluate("document.documentElement.dataset.theme"), 'tema eşitlenmedi')
        await pg.screenshot(path='/tmp/_mv_tlm/pw_dark.png')
        # dosya kapatma → oturum kapanır, işçi sonlanır
        cl = await pg.evaluate("(async () => { const f = S.files.find(f => f.tlm), c = f.tlm.client; closeFile(f); await new Promise(r => setTimeout(r, 400)); return [c.open.size, !!c.w, S.files.length]; })()")
        print('kapatma:', cl); ok(cl[0] == 0 and not cl[1], 'oturum kapanmadı')
        errs = [e for e in errs if 'api/args' not in e]
        ok(not errs, 'sayfa hataları: %s' % errs[:5])
        await b.close()
    if fails: print('BAŞARISIZ', len(fails)); sys.exit(1)
    print('telemetri arayüzü OK')

asyncio.run(main())
