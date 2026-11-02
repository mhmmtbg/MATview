# Faz 1 arayüz kararlılığı (sentetik veri): sayfa yakınlaştırması kapalı, araç satırları tek satır + "⋯" menüsü,
# sabit genişlikli kayan yazı, oynatma çubuğu tıklanınca grafik boyutu sabit, oynatma çizgisini sürükleme
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(400)
        # yakınlaştırma kısayolları ve Ctrl+tekerlek engellenir
        z = await pg.evaluate("""()=>{const k=new KeyboardEvent('keydown',{key:'+',ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(k);
          const w=new WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(w);
          const k0=new KeyboardEvent('keydown',{key:'0',ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(k0);return [k.defaultPrevented,w.defaultPrevented,k0.defaultPrevented]}""")
        ok(z == [True, True, True], 'yakınlaştırma engellenmedi ' + str(z))
        # dar pencere: araç satırları tek satır, fazlası ⋯ menüsünde
        await pg.set_viewport_size({'width': 980, 'height': 760}); await pg.wait_for_timeout(400)
        bars = await pg.evaluate("['viewbar','toolbar'].map(id=>{const e=document.getElementById(id);return [Math.round(e.getBoundingClientRect().height), e.scrollWidth<=e.clientWidth+1, !!e.querySelector('.mvov-more') && getComputedStyle(e.querySelector('.mvov-more')).display!=='none']})")
        print('çubuklar', bars); ok(all(x[0] <= 46 and x[1] for x in bars), 'araç satırı taştı / sarıldı'); ok(bars[1][2], 'araç çubuğunda ⋯ menüsü yok')
        await pg.click('#toolbar .mvov-more'); n = await pg.evaluate("document.querySelectorAll('#toolbar .mvov-pop > *').length"); ok(n > 0, 'menü boş')
        await pg.keyboard.press('Escape')
        await pg.set_viewport_size({'width': 1500, 'height': 900}); await pg.wait_for_timeout(400)
        ok(await pg.evaluate("document.querySelectorAll('#toolbar .mvov-pop > *').length") == 0, 'geniş pencerede öğeler geri gelmedi')
        # kayan yazı: istatistik satırı tek satır, yüksekliği sabit
        await pg.evaluate("""async()=>{const fs=8000,n=fs*20,x=new Float64Array(n);for(let i=0;i<n;i++)x[i]=Math.sin(2*Math.PI*200*i/fs);
          const c=addDerived('cok_uzun_bir_akustik_kanal_adi_ornek_ses_kaydi_1234567890',x,null,0,true);c.kind='ac';c.dtS=1/fs;await addDerivedToPlot(c);S.plot.fitAll();0}""")
        await pg.wait_for_timeout(500)
        sb = await pg.evaluate("(()=>{const e=document.getElementById('statsbar');return [Math.round(e.getBoundingClientRect().height), e.classList.contains('fx')]})()"); ok(sb[0] <= 29 and sb[1], 'istatistik satırı sabit değil ' + str(sb))
        # oynatma: çubuğa tıklama / ilerleme sırasında grafik boyutu ve kaydırma çubuğu sabit
        await pg.click('#rtabs [data-t=acoustic]'); await pg.evaluate("()=>{document.querySelectorAll('#right .card.collapsed').forEach(c=>c.classList.remove('collapsed'));0}"); await pg.select_option('#acScope', 'all')
        await pg.click('button:has-text("▶ Orijinal")'); await pg.wait_for_timeout(700)
        await pg.evaluate("window.__sz=new Set(); window.__iv=setInterval(()=>__sz.add(S.plot.W+'x'+S.plot.H+(S.plot.cv.parentElement.classList.contains('scrolly')?'s':'')),16); 0")
        for i in range(4): await pg.click('.acbar .acb-seek', position={'x': 40 + 60 * i, 'y': 8}); await pg.wait_for_timeout(150)
        await pg.click('.acbar .acb-pp'); await pg.click('.acbar .acb-pp'); await pg.mouse.move(700, 400); await pg.mouse.move(800, 420); await pg.wait_for_timeout(300)
        sz = await pg.evaluate("clearInterval(__iv), [...__sz]"); print('boyutlar', sz); ok(len(sz) == 1 and not sz[0].endswith('s'), 'grafik boyutu değişti / kaydırma çubuğu açıldı')
        # oynatma çizgisini sürükle
        await pg.click('.acbar .acb-pp'); await pg.evaluate("acSeekTo(5,true)"); await pg.wait_for_timeout(100)
        xy = await pg.evaluate("(()=>{const P=S.plot,ax=S.audio.ax,r=P.cv.getBoundingClientRect();return [r.left+P.xPx(ax,P.playhead), r.top+ax.rect.y+ax.rect.h/2, r.left+P.xPx(ax,12)]})()")
        await pg.mouse.move(xy[0], xy[1]); await pg.mouse.down(); await pg.mouse.move((xy[0]+xy[2])/2, xy[1]); await pg.mouse.move(xy[2], xy[1]); await pg.mouse.up()
        t = await pg.evaluate("acPos()"); print('sürükleme sonrası', t); ok(abs(t - 12) < 0.2, 'oynatma çizgisi sürüklenemedi')
        ok(await pg.evaluate("S.audio.paused"), 'duraklatılmışken sürükleyince duraklatılmış kalmalı')
        await pg.click('button:has-text("■ Durdur")')
        # telemetri çubuğu dar pencerede tek satır
        await pg.set_viewport_size({'width': 1000, 'height': 760}); await pg.click('#viewtabs button[data-v=tlm]'); await pg.wait_for_function("typeof TLM!=='undefined' && TLM.ready", timeout=20000); await pg.wait_for_timeout(600)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        tb = await f.evaluate("(()=>{const e=document.getElementById('mainTabs');return [Math.round(e.getBoundingClientRect().height), e.scrollWidth<=e.clientWidth+1, document.getElementById('tlFrameBadge').classList.contains('fx')]})()")
        print('telemetri çubuğu', tb); ok(tb[0] <= 46 and tb[1] and tb[2], 'telemetri çubuğu sarıldı / taştı')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('ui1:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
