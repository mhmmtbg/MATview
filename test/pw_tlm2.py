# Telemetri tek panel: üst çubukta oynatma + çözümleme, katlanan oynatma paneli, aç/kapa canlı durum, işlem kaydı penceresi,
# grafik → MATView Zaman sekmesinde canlı kanal (dönüşte oynatma sürer), sağda sabit işlem düğmeleri, kalıcı sütun görünümü,
# kamera açılır penceresi (ekran alıntısı / MP4). Sentetik kayıt (test/make_tlm.js).
import asyncio, os, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
URL = 'file://' + os.path.abspath(ROOT + 'dist/matview.html')
fails = []
def ok(c, m):
    if not c: fails.append(m); print('  HATA:', m)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 920}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        await pg.evaluate("try{localStorage.removeItem('telemetryParser.cols.v1')}catch(e){}")
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        # tek panel: eski sekmeler yok, çözümleme düğmeleri üst çubukta
        ok(await f.evaluate("document.querySelectorAll('#mainTabs button[data-tab]').length") == 0, 'eski sekmeler duruyor')
        ok(await f.evaluate("!!document.querySelector('#mainTabs #btnRunMv') && !!document.querySelector('#mainTabs #btnRun') && !!document.querySelector('#mainTabs #lvConnect')"), 'çözümleme/oynatma düğmeleri üst çubukta değil')
        ok(await f.evaluate("getComputedStyle(document.querySelector('#tabFile')).display") == 'none', 'dosya çözümleme ekranı görünüyor')
        # .bin bırak → hem oynatma hem çözümleme listesi
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("/\\//.test(document.querySelector('#lvFrInfo').textContent)", timeout=30000)
        st = await f.evaluate("[document.querySelector('#tlFilesSum').textContent, document.querySelector('#btnRunMv').disabled, document.querySelector('#tlDrawer').classList.contains('hidden')]"); print('dosyalar', st)
        ok('kayit.bin' in st[0] and st[1] is False, 'dosya her iki listeye de girmedi')
        # oynat → panel katlanır
        if await f.evaluate("document.querySelector('#tlDrawer').classList.contains('hidden')"): await f.click('#tlDrawerBtn')
        ok(not await f.evaluate("document.querySelector('#tlDrawer').classList.contains('hidden')"), 'panel açılmadı')
        await f.click('#tlDrawerBtn'); ok(await f.evaluate("document.querySelector('#tlDrawer').classList.contains('hidden')"), 'panel katlanmadı'); await f.click('#tlDrawerBtn')
        await f.click('#lvConnect'); await pg.wait_for_timeout(1200)
        ok(await f.evaluate("document.querySelector('#tlDrawer').classList.contains('hidden')"), 'Oynat ile panel katlanmadı')
        # canlı durum aç / kapa
        ok(await f.evaluate("document.querySelector('#tlStatus').classList.contains('hidden')"), 'durum kutusu varsayılan açık')
        await f.click('#tlStatusBtn'); fr = await f.evaluate("[!document.querySelector('#tlStatus').classList.contains('hidden'), document.querySelector('#lvFrames').textContent]"); print('durum', fr)
        ok(fr[0] and fr[1] != '0', 'durum kutusu açılmadı / veri yok'); await f.click('#tlStatusX')
        # işlem kaydı penceresi
        await f.click('#tlLogBtn'); lg = await f.evaluate("[!document.querySelector('#logOverlay').classList.contains('hidden'), document.querySelector('#logView').textContent.length]"); print('log', lg)
        ok(lg[0] and lg[1] > 50, 'işlem kaydı açılmadı'); await f.click('#logX')
        # işlem düğmeleri sağda sabit (tablo yatay kaydırılınca da görünür)
        await f.evaluate("document.querySelector('#lvWrap').scrollLeft = 0")
        stk = await f.evaluate("""(() => { const w = document.querySelector('#lvWrap'); w.scrollLeft = 99999; const td = w.querySelector('tr[data-id] td.act'); const a = td.getBoundingClientRect(), r = w.getBoundingClientRect(); return [getComputedStyle(td).position, Math.round(r.right - a.right), w.scrollWidth > w.clientWidth]; })()"""); print('sabit', stk)
        ok(stk[0] == 'sticky' and stk[1] < 30, 'işlem sütunu sağda sabit değil')
        # grafik → MATView Zaman sekmesi, canlı akar
        await f.fill('#lvFilter', ''); await pg.wait_for_timeout(200)
        await f.evaluate("(() => { const b = [...document.querySelectorAll('#lvWrap tr[data-id] td.act button[data-act=chart]')].find(x => !/Video/.test(x.title)); b.click(); })()")
        await pg.wait_for_timeout(1500)
        v = await pg.evaluate("[S.view, S.plot.axes.length, S.plot.axes[0].traces[0].ch.n, S.plot.axes[0].traces[0].label, TLV.file && TLV.file.name]"); print('zaman', v)
        ok(v[0] == 'time' and v[1] == 1 and v[2] > 5 and v[4] == 'Canlı telemetri', 'canlı kanal Zaman sekmesine gelmedi')
        n1 = v[2]; await pg.wait_for_timeout(1500); n2 = await pg.evaluate("S.plot.axes[0].traces[0].ch.n"); print('akış', n1, '→', n2); ok(n2 > n1, 'Zaman sekmesindeyken veri akmıyor')
        xl = await pg.evaluate("S.plot.axes[0].xlim.slice()"); tm = await pg.evaluate("(() => { const c = S.plot.axes[0].traces[0].ch; return c.t(c.n - 1); })()"); ok(xl[1] >= tm - 0.6, 'izleme son veriyi göstermiyor')
        fsv = await pg.evaluate("S.plot.axes[0].traces[0].ch.fs"); print('fs', fsv)
        # telemetriye dön: oynatma kaldığı yerden sürüyor
        await pg.click('#viewtabs button[data-v=tlm]'); await pg.wait_for_timeout(600)
        c1 = await f.evaluate("[document.querySelector('#lvConnBadge').textContent, +document.querySelector('#lvFrNum').value]"); await pg.wait_for_timeout(800); c2 = await f.evaluate("+document.querySelector('#lvFrNum').value"); print('dönüş', c1, c2)
        ok(c1[0] == 'Bağlı' and c2 >= c1[1], 'telemetriye dönüşte oynatma sürmüyor')
        # gruba ekle menüsü MATView alt grafiklerini listeler
        await f.evaluate("(() => { const b = [...document.querySelectorAll('#lvWrap tr[data-id] td.act button[data-act=chartadd]')][1]; b.click(); })()"); await pg.wait_for_timeout(200)
        mt = await f.evaluate("document.querySelector('.ctxmenu:not(.hidden)') ? document.querySelector('.ctxmenu:not(.hidden)').textContent : ''"); print('menü', mt[:120]); ok('MATView' in mt and '1. alt grafik' in mt, 'gruba ekle menüsü MATView alt grafiklerini göstermiyor')
        await f.evaluate("(() => { const m = document.querySelector('.ctxmenu:not(.hidden)'); [...m.querySelectorAll('button')].find(x => /1\\. alt grafik/.test(x.textContent)).click(); })()"); await pg.wait_for_timeout(700)
        ok(await pg.evaluate("S.plot.axes.length === 1 && S.plot.axes[0].traces.length === 2"), 'mevcut alt grafiğe eklenmedi')
        # grafikteki parametreler üste sabitlenir
        await pg.click('#viewtabs button[data-v=tlm]'); await pg.wait_for_timeout(300)
        await f.click('#tlPinBtn'); await pg.wait_for_timeout(300)
        pn = await f.evaluate("[document.querySelector('#tlPinBtn').getAttribute('aria-pressed'), [...document.querySelectorAll('#lvWrap tbody tr[data-id]')].slice(0, 2).map(t => t.classList.contains('pinrow')), !!document.querySelector('#lvWrap tr.pinsep')]"); print('üstte', pn)
        ok(pn[0] == 'true' and pn[1] == [True, True] and pn[2], 'grafikteki parametreler üste sabitlenmedi')
        # Zaman sekmesinde grafiği temizle → tablodaki grafik işaretleri söner
        await pg.click('#viewtabs button[data-v=time]'); await pg.evaluate("clearPlot(); refreshAll()"); await pg.wait_for_timeout(600)
        on = await f.evaluate("document.querySelectorAll('#lvWrap td.act button[data-act=chart].on').length"); print('işaretli', on); ok(on == 0, 'grafik temizlenince işaretler kalmadı değil')
        pn2 = await f.evaluate("document.querySelectorAll('#lvWrap tr.pinrow').length"); ok(pn2 == 0, 'temizlenince üstteki sabitler kalktı değil')
        # etiket süzgeci açılır menü
        await pg.click('#viewtabs button[data-v=tlm]'); await pg.wait_for_timeout(200)
        await f.click('#tlPinBtn')
        await f.click('#tlUfBtn'); await pg.wait_for_timeout(150)
        nl = await f.evaluate("document.querySelectorAll('#tlUf label').length"); print('etiket sayısı', nl); ok(nl >= 5, 'filtre menüsü etiketleri listelemedi')
        await f.fill('#tlUf [data-uq]', 'psu'); await pg.wait_for_timeout(100)
        await f.click('#tlUf [data-ua=vis]'); await pg.wait_for_timeout(250)
        us = await f.evaluate("[document.querySelector('#tlUfBtn').textContent, [...new Set([...document.querySelectorAll('#lvWrap tr[data-id]')].map(t => t.querySelector('input[data-c=\"0\"]').value))]]"); print('süzgeç', us)
        ok('PSU' in us[0] and us[1] == ['PSU'], 'filtre uygulanmadı')
        await f.click('#tlUf [data-ua=all]'); await pg.keyboard.press('Escape')
        ok(await f.evaluate("!document.querySelector('#tlUf') && /Tüm etiketler/.test(document.querySelector('#tlUfBtn').textContent)"), 'filtre temizlenmedi / menü kapanmadı')
        # duraklatınca çerçeve göstergesi
        await f.evaluate("(() => { const b = document.querySelector('#lvPause'); if (!b.disabled && !/Devam/.test(b.textContent)) b.click(); })()"); await pg.wait_for_timeout(300)
        fb = await f.evaluate("[document.querySelector('#tlFrameBadge').textContent, document.querySelector('#tlFrameBadge').className]"); print('çerçeve', fb)
        ok('❚❚' in fb[0] and 'Çerçeve' in fb[0] and 'paused' in fb[1], 'duraklatınca çerçeve gösterilmiyor')
        # seçilen çerçevenin verileri Excel'e
        await pg.evaluate("window.__sv = []; MATViewTLM.saveFile = async (n, b) => { window.__sv.push([n, b.size]); window.__xb = b; return true; }; 0")
        await f.click('#tlFrameXls'); await f.fill('#tlXlsN', '120'); await f.click('#modalFoot .btn.primary')
        for _ in range(40):
            await pg.wait_for_timeout(200)
            if await pg.evaluate("window.__sv.length"): break
        xs = await pg.evaluate("window.__sv")
        if not xs: print('LOG', (await f.evaluate("document.querySelector('#logView').textContent"))[-600:])
        print('excel', xs); ok(xs and xs[-1][0].endswith('_cerceve120.xlsx') and xs[-1][1] > 2000, 'çerçeve Excel dosyası yazılmadı')
        rows = await pg.evaluate("(async () => { const sh = await XLSX.read(new File([window.__xb], 'a.xlsx')); return sh.map(s => [s.name, s.rows.length, s.rows[1], s.rows[5]]); })()"); print('sayfalar', rows)
        ok(rows and rows[0][2][1] == '120 / 1197' and rows[0][3][6] == 'Sonuç' and rows[0][1] > 20, 'Excel içeriği beklenen gibi değil')
        ok(await f.evaluate("+document.querySelector('#lvFrNum').value") == 120, 'çerçeveye gidilmedi')
        await f.evaluate("(() => { const b = document.querySelector('#lvPause'); if (!b.disabled && /Devam/.test(b.textContent)) b.click(); })()"); await pg.wait_for_timeout(300)
        # kamera açılır penceresi: ekran alıntısı ve MP4 düğmeleri
        await pg.click('#viewtabs button[data-v=tlm]'); await pg.wait_for_timeout(300)
        await f.fill('#lvFilter', 'goruntu'); await pg.wait_for_timeout(300)
        await f.locator('button[title="Videoyu oynat"]').first.click(); await pg.wait_for_timeout(1500)
        vw = await f.evaluate("(() => { const w = document.querySelector('#lvChartsCard'); return [getComputedStyle(w).position, !w.classList.contains('hidden'), !!w.querySelector('[data-v=snap]'), !!w.querySelector('[data-v=mp4]')]; })()"); print('kamera', vw)
        ok(vw == ['fixed', True, True, True], 'kamera açılır penceresi / seçenekleri yok')
        # kamera penceresinde kayıt konumu: ileri / geri sarma ve konum çubuğu
        nv = await f.evaluate("(() => { const n = document.querySelector('#lvChartsCard .vnav'); return n ? [n.classList.contains('off'), +n.querySelector('.vseek').max, n.querySelector('.vpos').textContent] : null; })()"); print('kamera konum', nv)
        ok(nv and not nv[0] and nv[1] > 1 and '/' in nv[2], 'kamera konum çubuğu yok / kapalı')
        await f.click('#lvChartsCard [data-v=vplay]'); await pg.wait_for_timeout(300)
        await f.select_option('#lvChartsCard .vstep', '1'); k0 = await f.evaluate("+document.querySelector('#lvChartsCard .vseek').value")
        await f.click('#lvChartsCard [data-v=vfwd]'); await pg.wait_for_timeout(600); k1 = await f.evaluate("+document.querySelector('#lvChartsCard .vseek').value")
        print('ileri sar', k0, k1); ok(k1 - k0 == 100, 'kamera ileri sarma (duraklatılmış, 1 s = 100 çerçeve)')
        await f.click('#lvChartsCard [data-v=vback]'); await pg.wait_for_timeout(600); k2 = await f.evaluate("+document.querySelector('#lvChartsCard .vseek').value")
        ok(k2 == k1 - 100, 'kamera geri sarma')
        await f.evaluate("(() => { const s = document.querySelector('#lvChartsCard .vseek'); s.value = 300; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); })()"); await pg.wait_for_timeout(700)
        ok(abs(await f.evaluate("+document.querySelector('#lvFrSlider').value") - 300) <= 30, 'kamera konum çubuğu ile gezinme')
        await f.click('#lvChartsCard [data-v=vplay]'); await pg.wait_for_timeout(500)
        saved = []
        await pg.evaluate("window.__sv = []; MATViewTLM.saveFile = async (n, b) => { window.__sv.push([n, b.size, b.type]); return true; }; 0")
        await f.click('#lvChartsCard [data-v=snap]'); await pg.wait_for_timeout(500)
        await f.click('#lvChartsCard [data-v=mp4]'); await pg.wait_for_timeout(1200)
        sv = await pg.evaluate("window.__sv"); print('kaydedilen', sv)
        if await f.evaluate("typeof VideoDecoder !== 'undefined'"):
            ok(any(x[0].endswith('.png') and x[1] > 500 for x in sv), 'ekran alıntısı kaydedilmedi')
        ok(any(x[0].endswith('.mp4') and x[1] > 1000 for x in sv), 'MP4 kaydedilmedi')
        await f.evaluate("(() => { const b = document.querySelector('#lvDisconnect'); if (!b.disabled) b.click(); })()")
        await f.click('#lvChartsClear'); ok(await f.evaluate("document.querySelector('#lvChartsCard').classList.contains('hidden')"), 'kamera penceresi kapanmadı')
        # sütun görünümü kalıcı
        await f.fill('#lvFilter', ''); await f.click('#tlColsBtn')
        await f.evaluate("(() => { const cb = document.querySelector('#tlCols input[data-col=hex]'); cb.checked = false; cb.dispatchEvent(new Event('change', {bubbles: true})); })()")
        await f.click('#tlCols [data-c=save]'); await pg.wait_for_timeout(400)
        hx = await f.evaluate("[...document.querySelectorAll('#lvWrap thead th')].some(t => t.textContent.trim() === 'Hex')"); ok(not hx, 'Hex sütunu gizlenmedi')
        await pg.reload(); await pg.wait_for_timeout(500); await pg.evaluate("switchView('tlm')")
        await pg.wait_for_function("TLM.ready", timeout=20000); f = next(fr for fr in pg.frames if fr != pg.main_frame); await pg.wait_for_timeout(500)
        cols = await f.evaluate("TPUI.getS().live.columns.filter(c => c.key === 'hex').map(c => c.visible)"); print('yeniden açılış hex', cols); ok(cols == [False], 'sütun görünümü açılışta korunmadı')
        await f.evaluate("localStorage.removeItem('telemetryParser.cols.v1')")
        print('ERR', errs); ok(not errs, 'sayfa hatası: ' + '; '.join(errs)); await b.close()
    print('telemetri tek panel', 'OK' if not fails else 'HATA (%d)' % len(fails)); raise SystemExit(1 if fails else 0)
asyncio.run(main())
