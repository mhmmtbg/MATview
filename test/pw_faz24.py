# v2.37 (sentetik veri): İzleme açıkken grafiğe tıklayarak sabit izleme çizgisi; PNG / SVG çıktısında görünür
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SETUP = """async()=>{ const fs=1000,n=4000; const mk=(nm,f,a)=>{const d=new Float64Array(n); for(let i=0;i<n;i++) d[i]=a*Math.sin(2*Math.PI*f*i/fs); const c=addDerived(nm,d,null); c.dtS=1/fs; return c;};
  const a=mk('ivme_x',2,1), b=mk('ivme_y',3,2); await addToNewAxes([a],false); await addToNewAxes([b],false); S.plot.axes.forEach(ax=>{ax.xlim=[0,4];}); S.plot.fitAll(); setMode('pan'); return true; }"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.evaluate(SETUP); await pg.wait_for_timeout(300)
        at = lambda t: pg.evaluate("(t => { const P = S.plot, ax = P.axes[0], r = P.cv.getBoundingClientRect(); return [r.left + P.xPx(ax, t), r.top + ax.rect.y + ax.rect.h / 2]; })(%s)" % t)
        # İzleme kapalıyken tık sabitlemez
        x, y = await at(1.0); await pg.mouse.click(x, y); ok(await pg.evaluate("S.plot.xpins.length") == 0, 'izleme kapalıyken sabitlememeli')
        await pg.click('#tb-xhair'); ok(await pg.evaluate("S.plot.crosshair"), 'izleme açık')
        png0 = await pg.evaluate("S.plot.toPNG(1, true).toDataURL()"); svg0 = await pg.evaluate("S.plot.toSVG(true)")
        await pg.mouse.move(x, y); await pg.mouse.click(x, y); await pg.wait_for_timeout(200)
        pins = await pg.evaluate("S.plot.xpins"); print('sabit', pins)
        ok(len(pins) == 1 and abs(pins[0] - 1.0) < 1e-9, 'tık çizgi sabitlemeli')
        ok('sabit' in await pg.evaluate("document.querySelector('#toast').textContent"), 'bildirim')
        # çıktılar: PNG değişir, SVG'de çizgi değeri ve iki alt grafiğin değerleri
        png1 = await pg.evaluate("S.plot.toPNG(1, true).toDataURL()"); svg1 = await pg.evaluate("S.plot.toSVG(true)")
        ok(png1 != png0, 'PNG çıktısında çizgi görünmeli')
        import re; print('svg', re.findall(r'>[^<]*= [^<]*<', svg1)[:3], re.findall(r'>ivme_[xy]:[^<]*<', svg1)[:2])
        ok('>t = 1<' in svg1 and 'ivme_x:' in svg1 and 'ivme_y:' in svg1 and 't = ' not in svg0, 'SVG çıktısında çizgi ve değerler')
        # fare grafikten çıkınca da durur; ikinci çizgi
        await pg.mouse.move(5, 5); await pg.wait_for_timeout(100)
        x2, y2 = await at(2.5); await pg.mouse.click(x2, y2); ok(len(await pg.evaluate("S.plot.xpins")) == 2, 'ikinci çizgi')
        svg2 = await pg.evaluate("S.plot.toSVG(true)"); ok(svg2.count('t = ') >= 4, 'iki çizgi × iki alt grafik değer kutusu')
        # sürükleme (kaydırma) çizgi eklemez
        await pg.mouse.move(x2 - 100, y2); await pg.mouse.down(); await pg.mouse.move(x2 - 40, y2, steps=5); await pg.mouse.up()
        ok(len(await pg.evaluate("S.plot.xpins")) == 2, 'kaydırma çizgi eklememeli')
        # çizginin üstüne tık: kaldırır (kaydırma sonrası yeni konumdan)
        x3, y3 = await at(await pg.evaluate("S.plot.xpins[0]")); await pg.mouse.click(x3, y3)
        ok(len(await pg.evaluate("S.plot.xpins")) == 1, 'çizgiye tık kaldırmalı')
        # imleç kipinde tık imleç koyar, çizgi değil
        await pg.evaluate("setMode('cursor'); 0"); x4, y4 = await at(3.2); await pg.mouse.click(x4, y4)
        ok(len(await pg.evaluate("S.plot.xpins")) == 1 and await pg.evaluate("S.plot.cursors.length") >= 1, 'imleç kipi')
        # PNG dosyası: çizgiyle kaydedilir
        await pg.evaluate("setMode('pan'); window.showSaveFilePicker = undefined; S.plot.cursors = []; 0")
        async with pg.expect_download() as dl: await pg.evaluate("savePng()")
        ok((await dl.value).suggested_filename.endswith('.png'), 'PNG indirilmeli')
        # İzleme kapanınca çizgiler kalkar
        await pg.click('#tb-xhair'); ok(await pg.evaluate("S.plot.xpins.length") == 0, 'izleme kapanınca kalkmalı')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz24:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
