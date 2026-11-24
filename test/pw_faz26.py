# v2.44 (sentetik veri): Temizle › Otomatik temizle
# - dev bozuk değer kümeleri (≈ -1.3e155) + küçük sıçramalar: "Önizle" seçer, "Otomatik temizle" siler, y ekseni veriye oturur
# - Ctrl+Z ile geri alınır; "Grafikteki tüm izler" birden çok izi temizler; temiz izde bir şey silinmez
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SYN = r"""async()=>{let seed=5;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296,g=()=>Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
 const mk=(nm,bad)=>{const n=100000,x=new Float64Array(n);for(let i=0;i<n;i++)x[i]=0.02*Math.sin(i/300)+0.002*g();
  if(bad){for(const [s,L] of [[20000,1],[21000,30],[40000,150],[70000,8]])for(let i=s;i<s+L;i++)x[i]=-1.3e155;x[60000]=0.5;x[60001]=0.5;}
  const c=addDerived(nm,x,null,0,true);c.unit='V';c.dtS=1/1000;return c;};
 const a=mk('gurultulu',true),b=mk('temiz',false),c=mk('gurultulu2',true);await addDerivedToPlot(a);await addDerivedToPlot(b);await addDerivedToPlot(c);S.plot.fitAll();0}"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.evaluate(SYN); await pg.evaluate("switchView('time'); 0")
        n_ax = await pg.evaluate("S.plot.axes.length"); print('alt grafik:', n_ax)
        await pg.click('#rtabs [data-t=clean]'); await pg.evaluate("()=>{document.querySelectorAll('#right .card.collapsed').forEach(c=>c.classList.remove('collapsed'));0}"); await pg.wait_for_timeout(200)
        # aktif iz: gurultulu
        await pg.evaluate("(() => { for (const ax of S.plot.axes) { const k = ax.traces.findIndex(t => t.ch.name === 'gurultulu'); if (k >= 0) { S.plot.active = ax; ax.active = k; } } 0 })()")
        y0 = await pg.evaluate("activeAxes().ylim"); print('önce ylim', y0); ok(abs(y0[0]) > 1e100, 'başlangıçta y ekseni dev değerleri göstermeli')
        await pg.click('button:has-text("Önizle (seç)")'); await pg.wait_for_function("document.querySelector('#busy').classList.contains('hidden') && selCount() > 0", timeout=20000)
        ok(await pg.evaluate("selCount()") == 191, 'önizleme seçimi %d' % await pg.evaluate("selCount()"))
        await pg.evaluate("S.plot.clearSelection(); 0")
        await pg.click('#right button:text-is("Otomatik temizle")'); await pg.wait_for_function("document.querySelector('#busy').classList.contains('hidden') && activeTrace().ch.delCount > 0", timeout=20000)
        await pg.wait_for_timeout(200)
        d = await pg.evaluate("activeTrace().ch.delCount"); y1 = await pg.evaluate("activeAxes().ylim"); info = await pg.evaluate("document.querySelector('#auInfo').textContent")
        print('silinen', d, 'ylim', y1, info)
        ok(d == 191, 'silinen nokta %d' % d)
        ok('bozuk 189' in info and 'sıçrama 2' in info, 'bilgi metni ' + info)
        ok('silindi' in await pg.evaluate("document.querySelector('#toast').textContent"), 'bildirim')
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("activeTrace().ch.delCount") == 0, 'Ctrl+Z geri almalı')
        # tüm izler
        await pg.select_option('#auWhat', 'all'); await pg.click('#right button:text-is("Otomatik temizle")')
        await pg.wait_for_function("document.querySelector('#busy').classList.contains('hidden') && S.derived.channels.find(c => c.name === 'gurultulu2').delCount > 0", timeout=30000); await pg.wait_for_timeout(200)
        cnt = await pg.evaluate("Object.fromEntries(S.derived.channels.map(c => [c.name, c.delCount || 0]))"); print(cnt)
        y2 = await pg.evaluate("activeAxes().ylim"); ok(abs(y2[0]) < 0.1 and abs(y2[1]) < 0.1, 'y ekseni veriye oturmalı %s' % y2)
        ok(cnt.get('gurultulu') == 191 and cnt.get('gurultulu2') == 191 and cnt.get('temiz') == 0, 'tüm izler: %s' % cnt)
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz26:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
