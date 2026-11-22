# v2.39 (sentetik veri): imleç yakalama — düz / basamaklı çizgide imleç tıklanan yerde kalır
# - "Tepe/çukur (otomatik)": görünmeyen kıpırtıya (< 3 px) atlamaz; gerçek tepeye yakalar
# - Alt+tık: yakalama açıkken de tam tıklanan yere
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 850}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        # 0..1 aralığında düz taban + 1e-4'lük kıpırtılar + t=120 s'de belirgin tepe (0.8)
        await pg.evaluate("""(async()=>{ const n=20000, d=new Float64Array(n); let s=1; for(let i=0;i<n;i++){ s=(s*1664525+1013904223)>>>0; d[i]=0.2 + (s/4294967296<0.05?1e-4:0); }
          for (let i=11995;i<=12005;i++) d[i]=0.8 - Math.abs(i-12000)*0.05; const c=addDerived('taban',d,null); c.dtS=0.01; await addToNewAxes([c],false);
          const ax=S.plot.axes[0]; ax.xlim=[100,140]; ax.ylim=[0,1]; S.plot.invalidate(); setMode('cursor'); setSnap('auto'); })()""")
        await pg.wait_for_timeout(300)
        async def click(t, y=None, mods=None):
            pos = await pg.evaluate("([t, y]) => { const P = S.plot, ax = P.axes[0], r = P.cv.getBoundingClientRect(); return [r.left + P.xPx(ax, t), r.top + P.yPx(ax, y == null ? 0.2 : y), P.xPx(ax, t)]; }", [t, y])
            for m in mods or []: await pg.keyboard.down(m)
            await pg.mouse.click(pos[0], pos[1])
            for m in mods or []: await pg.keyboard.up(m)
            await pg.wait_for_timeout(60)
            return await pg.evaluate("(px => { const P = S.plot, c = P.cursors[0]; return [+(P.xPx(c.axes, c.x) - px).toFixed(1), c.snap || '']; })(%s)" % pos[2])
        r = [await click(t) for t in (105.0, 110.3, 131.7)]; print('düz', r)
        ok(all(abs(x[0]) <= 1 and x[1] == '' for x in r), 'düz çizgide imleç tıklanan yerde kalmalı: ' + str(r))
        r = await click(119.8, 0.7); print('tepe yakını', r); ok(r[1] == 'peak' and abs(r[0]) > 3, 'belirgin tepeye yakalamalı')
        r = await click(119.8, 0.7, ['Alt']); print('Alt', r); ok(r[1] == '' and abs(r[0]) <= 3, 'Alt+tık yakalamamalı')
        await pg.evaluate("setSnap('off'); 0")
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz25:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
