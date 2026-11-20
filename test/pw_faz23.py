# v2.36: sağ panel — sağ kenarda dikey simge çubuğu
# - varsayılan: yalnız simge çubuğu (grafik geniş); simgeye tık → panel o sekmeyle açılır
# - açık sekmenin simgesine ya da » düğmesine tık → yeniden simge durumu; başka simge → sekme değişir
# - bir işlem sekme açarsa (setTab) panel açılır; Ctrl+Shift+B; durum yeniden açılışta hatırlanır
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
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(400)
        await pg.evaluate("""(async()=>{const fs=1000,n=4000,d=new Float64Array(n); for(let i=0;i<n;i++) d[i]=Math.sin(i/50); const c=addDerived('x',d,null); c.dtS=1/fs; await addToNewAxes([c],false); S.plot.fitAll(); })()""")
        await pg.wait_for_timeout(300)
        st = "(() => { const r = document.querySelector('#right').getBoundingClientRect(), tb = document.querySelector('#rtabs').getBoundingClientRect(); return {rail: $('#app').classList.contains('railR'), rw: Math.round(r.width), vert: tb.height > tb.width * 4, body: getComputedStyle(document.querySelector('.rmain')).display !== 'none', tab: S.tab, title: $('#rtitle').textContent, W: S.plot.W}; })()"
        s0 = await pg.evaluate(st); print('başlangıç', s0)
        ok(s0['rail'] and 50 <= s0['rw'] <= 54 and s0['vert'] and not s0['body'], 'varsayılan simge çubuğu: ' + str(s0))
        await pg.click('#rtabs [data-t=analyze]'); await pg.wait_for_timeout(300); s1 = await pg.evaluate(st); print('açık', s1)
        ok(not s1['rail'] and s1['body'] and s1['tab'] == 'analyze' and s1['title'] == 'Analiz' and s1['rw'] > 380 and s1['W'] < s0['W'], 'simgeye tık paneli açmalı: ' + str(s1))
        await pg.click('#rtabs [data-t=tools]'); s2 = await pg.evaluate(st); ok(not s2['rail'] and s2['tab'] == 'tools' and s2['title'] == 'Araçlar', 'başka simge sekmeyi değiştirmeli')
        await pg.click('#rtabs [data-t=tools]'); await pg.wait_for_timeout(200); s3 = await pg.evaluate(st); ok(s3['rail'] and not s3['body'], 'açık sekmenin simgesi küçültmeli')
        await pg.evaluate("setTab('acoustic'); 0"); await pg.wait_for_timeout(200); s4 = await pg.evaluate(st); ok(not s4['rail'] and s4['tab'] == 'acoustic', 'setTab paneli açmalı')
        await pg.click('#rmin'); s5 = await pg.evaluate(st); ok(s5['rail'], '» küçültmeli')
        await pg.keyboard.press('Control+Shift+b'); s6 = await pg.evaluate(st); ok(not s6['rail'] and s6['tab'] == 'acoustic', 'Ctrl+Shift+B açmalı: ' + str(s6) + str(s5))
        await pg.reload(); await pg.wait_for_timeout(500); s7 = await pg.evaluate(st); ok(not s7['rail'], 'açık durum hatırlanmalı')
        await pg.keyboard.press('Control+Shift+b'); await pg.reload(); await pg.wait_for_timeout(500); s8 = await pg.evaluate(st); ok(s8['rail'], 'simge durumu hatırlanmalı')
        # telemetri görünümünde sağ panel yok
        await pg.evaluate("switchView('tlm'); 0"); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("getComputedStyle(document.querySelector('#right')).display") == 'none', 'telemetride sağ panel gizli')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz23:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
