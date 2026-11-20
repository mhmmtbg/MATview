# v2.34 (sentetik veri): imleç paneli grafiği kapatmaz; PNG / SVG dosya adı grafikteki parametre adından
# - varsayılan: grafiğin altında şerit (grafik alanı kısalır, üst üste binmez)
# - ⧉: taşınabilir ayrı pencere (konum hatırlanır) · ⬓: yeniden alta · ▾: küçült · yalnız açık görünümün paneli
# - dosya adı: tek parametre → adı; 2–3 → birleşik; daha çok → ilk ikisi + sayı; spektrum/spektrogram eki
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SETUP = """async()=>{ const fs=1000,n=4000; const mk=(nm,f)=>{const d=new Float64Array(n); for(let i=0;i<n;i++) d[i]=Math.sin(2*Math.PI*f*i/fs); const c=addDerived(nm,d,null); c.dtS=1/fs; c.unit='g'; c.kind='vib'; return c;};
  window.__c = [mk('OBC.sicaklik',5), mk('GPS/enlem:1',3), mk('PSU akim',2), mk('X4',7)]; await addToNewAxes([__c[0]],false); S.plot.fitAll(); S.plot.grms.mode='all'; return true; }"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.evaluate("try { localStorage.removeItem('mv.cpan'); } catch (e) {} CPAN.load(); delete window.showSaveFilePicker; window.showSaveFilePicker = undefined; 0")
        await pg.evaluate(SETUP)
        h0 = await pg.evaluate("document.querySelector('#stage').getBoundingClientRect().height")
        await pg.evaluate("setMode('cursor'); 0"); await pg.wait_for_timeout(200)
        r = await pg.evaluate("(() => { const p = document.querySelector('.curpanel'), st = document.querySelector('#stage').getBoundingClientRect(), pr = p.getBoundingClientRect(); return [p.classList.contains('dock'), p.parentElement.id, st.bottom <= pr.top + 0.5, st.height]; })()")
        print('alt şerit', r, h0)
        ok(r[0] and r[1] == 'center' and r[2] and r[3] < h0, 'panel grafiğin altında, grafik kısalmalı: ' + str(r))
        await pg.evaluate("(() => { const ax = S.plot.axes[0], tr = ax.traces[0]; S.plot.cursors = [{axes: ax, tr, x: 0.5, y: 0, i: 500}, {axes: ax, tr, x: 1.5, y: 0, i: 1500}]; S.plot.invalidate(); renderCursorPanel(S.plot); })()")
        ok('C1 → C2' in await pg.inner_text('.curpanel'), 'ölçümler')
        # ayrı pencere
        await pg.click('.curpanel button[title^="Ayrı pencere"]'); await pg.wait_for_timeout(200)
        r = await pg.evaluate("(() => { const p = document.querySelector('.curpanel'); return [p.classList.contains('float'), p.parentElement === document.body, getComputedStyle(p).position]; })()")
        ok(r == [True, True, 'fixed'], 'ayrı pencere: ' + str(r))
        hd = await pg.locator('.curpanel .cph').bounding_box()
        await pg.mouse.move(hd['x'] + 20, hd['y'] + 8); await pg.mouse.down(); await pg.mouse.move(300, 250, steps=5); await pg.mouse.up()
        pos = await pg.evaluate("(() => { const r = document.querySelector('.curpanel').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), JSON.parse(localStorage.getItem('mv.cpan')).pos]; })()")
        print('taşındı', pos); ok(abs(pos[0] - 280) < 6 and abs(pos[1] - 242) < 6 and pos[2], 'taşıma ve konumu hatırlama')
        # küçült
        await pg.click('.curpanel button[title^="Yalnız başlık"]'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate("getComputedStyle(document.querySelector('.curpanel .cpb')).display") == 'none', 'küçültme')
        await pg.click('.curpanel button[title^="Ölçümleri göster"]')
        # yeniden yükleyince ayrı pencere kipi sürer
        ok(await pg.evaluate("(CPAN.load(), CPAN.mode)") == 'float', 'kip hatırlanmalı')
        # başka görünümde zaman grafiğinin paneli görünmez
        await pg.evaluate("switchView('spec'); 0"); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("document.querySelector('.curpanel').classList.contains('hidden')"), 'spektrumda zaman paneli gizli')
        await pg.evaluate("switchView('time'); 0"); await pg.wait_for_timeout(200)
        ok(not await pg.evaluate("document.querySelector('.curpanel').classList.contains('hidden')"), 'zamana dönünce görünür')
        await pg.click('.curpanel button[title^="Grafiğin altına"]'); ok(await pg.evaluate("document.querySelector('.curpanel').classList.contains('dock')"), 'alta dönüş')
        # dosya adları
        names = []
        async def nm(js):
            await pg.evaluate(js); await pg.wait_for_timeout(100)
            async with pg.expect_download() as dl: await pg.evaluate("savePng()")
            d = await dl.value; names.append(d.suggested_filename); return d.suggested_filename
        await pg.evaluate("setMode('pan'); S.plot.cursors = []; 0")
        n1 = await nm("0"); ok(n1 == 'OBC.sicaklik.png', 'tek parametre: ' + n1)
        n2 = await nm("(async () => { await addToNewAxes([__c[1], __c[2]], true); })()"); ok(n2 == 'OBC.sicaklik_GPS_enlem_1_PSU_akim.png', '3 parametre: ' + n2)
        n3 = await nm("(async () => { await addToNewAxes([__c[3]], false); })()"); ok(n3 == 'OBC.sicaklik_GPS_enlem_1_ve_2_parametre.png', '4 parametre: ' + n3)
        await pg.evaluate("S.plot.axes[0].traces[0].visible = false; S.plot.invalidate(); 0")
        n4 = await nm("0"); ok(n4.startswith('GPS_enlem_1_PSU_akim'), 'gizli iz ada girmez: ' + n4)
        async with pg.expect_download() as dl: await pg.evaluate("saveSvg()")
        ok((await dl.value).suggested_filename == n4[:-4] + '.svg', 'SVG adı')
        await pg.evaluate("(async () => { clearPlot(); await addToNewAxes([__c[0]], false); const ax = S.plot.axes[0]; S.plot.active = ax; ax.active = 0; await computeSpectrum(ax.traces[0]); switchView('spec'); })()"); await pg.wait_for_timeout(800)
        async with pg.expect_download() as dl: await pg.evaluate("savePng()")
        n5 = (await dl.value).suggested_filename; ok(n5 == 'OBC.sicaklik_spektrum.png', 'spektrum: ' + n5)
        print('adlar', names + [n5])
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz21:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
