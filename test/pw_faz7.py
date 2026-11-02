# Faz 2 (akustik ve kanallar; sentetik veri): Parazit temizleme kartından "Temizle ve grafiğe ekle", ayırt edilir lejant
# renkleri (aynı grafikte tekrar yok, 12'den sonra kesikli), formüle [birim/parametre] kanal ekleme, türetilmiş kanal sil / geri al / formül güncelle
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(400)
        # telemetri benzeri adlı kanallar: '/' içerir
        await pg.evaluate("""async()=>{const fs=1000,n=fs*5;const mk=(nm,f)=>{const x=new Float64Array(n);for(let i=0;i<n;i++)x[i]=Math.sin(2*Math.PI*f*i/fs);const c=addDerived(nm,x,null,0,true);c.dtS=1/fs;return c};
          window.__a=mk('PSU/voltage',3); window.__b=mk('PSU/current',5); await addDerivedToPlot(__a); S.plot.active.traces.push(makeTrace(__b)); S.plot.fitAll(); 0}""")
        # renkler: 14 iz aynı grafikte → 12 farklı renk, sonra kesikli
        cols = await pg.evaluate("""(()=>{const ax=S.plot.addAxes();for(let i=0;i<14;i++)ax.traces.push(makeTrace(__a));S.plot.draw();return ax.traces.map(t=>t.color+'|'+(t.dash||[]).join(','))})()""")
        ok(len(set(cols)) == 14 and len(set(c.split('|')[0] for c in cols[:12])) == 12 and cols[12].split('|')[1] != '', 'renk / çizgi ayrımı ' + str(cols[:3]))
        await pg.evaluate("S.plot.removeAxes(S.plot.axes[S.plot.axes.length-1]); 0")
        # formül: Kanal ekle → [PSU/voltage]
        await pg.click('#rtabs [data-t=expr]'); await pg.evaluate("()=>{document.querySelectorAll('#right .card.collapsed').forEach(c=>c.classList.remove('collapsed'));refreshCalcUI&&0;0}")
        await pg.evaluate("refreshCalcUI(); 0") if await pg.evaluate("typeof refreshCalcUI==='function'") else None
        await pg.evaluate("(()=>{const u=__a.uid;const s=document.querySelector('#exprPick');s.value=String(u);0})()")
        await pg.fill('#exprIn', ''); await pg.evaluate("exprInsertPick(); 0"); await pg.type('#exprIn', ' * 2 + ')
        await pg.evaluate("(()=>{const s=document.querySelector('#exprPick');s.value=String(__b.uid);exprInsertPick();0})()")
        txt = await pg.input_value('#exprIn'); print('formül', txt); ok(txt == '[PSU/voltage] * 2 + [PSU/current]', 'kanal ekle biçimi')
        await pg.fill('#exprName', 'toplam'); await pg.click('button:has-text("Hesapla ve grafiğe ekle")'); await pg.wait_for_timeout(600)
        r = await pg.evaluate("(()=>{const c=S.derived.channels.find(c=>c.name==='toplam');return c?[c.data[100], 2*__a.data[100]+__b.data[100], S.plot.axes.some(a=>a.traces.some(t=>t.ch===c))]:null})()")
        print('formül sonucu', r, await pg.text_content('#exprMsg')); ok(r and abs(r[0] - r[1]) < 1e-12 and r[2], 'formül hesaplanıp grafiğe eklenmedi')
        # formül güncelle
        await pg.evaluate("editDerivedFormula(S.derived.channels.find(c=>c.name==='toplam')); 0")
        await pg.fill('#mbody textarea', '[PSU/voltage] - [PSU/current]'); await pg.click('#mfoot button:has-text("Güncelle")'); await pg.wait_for_timeout(600)
        r2 = await pg.evaluate("(()=>{const c=S.derived.channels.find(c=>c.name==='toplam');return [c.data[100], __a.data[100]-__b.data[100], c.formula]})()")
        ok(abs(r2[0] - r2[1]) < 1e-12 and '-' in r2[2], 'formül güncellenmedi ' + str(r2))
        # sil + geri al
        n0 = await pg.evaluate("S.derived.channels.length")
        await pg.evaluate("deleteDerived([S.derived.channels.find(c=>c.name==='toplam')]); 0"); await pg.click('#mfoot button:has-text("Sil")'); await pg.wait_for_timeout(200)
        d = await pg.evaluate("[S.derived.channels.length, S.plot.axes.some(a=>a.traces.some(t=>t.ch&&t.ch.name==='toplam'))]"); ok(d == [n0 - 1, False], 'silinmedi ' + str(d))
        await pg.click('#toast button:has-text("Geri al")') if await pg.locator('#toast button:has-text("Geri al")').count() else await pg.evaluate("document.querySelector('.toast button')&&document.querySelector('.toast button').click()")
        await pg.wait_for_timeout(200)
        d2 = await pg.evaluate("[S.derived.channels.length, S.plot.axes.some(a=>a.traces.some(t=>t.ch&&t.ch.name==='toplam'))]"); ok(d2 == [n0, True], 'geri alınamadı ' + str(d2))
        # akustik: Parazit temizleme kartından temizle ve grafiğe ekle
        await pg.evaluate("S.plot.active=S.plot.axes[0]; S.plot.axes[0].active=0; 0")
        await pg.click('#rtabs [data-t=acoustic]'); await pg.evaluate("()=>{document.querySelectorAll('#right .card.collapsed').forEach(c=>c.classList.remove('collapsed'));0}"); await pg.select_option('#acScope', 'all')
        await pg.check('#acHpOn'); await pg.click('#acCleanAdd'); await pg.wait_for_timeout(800)
        ok(await pg.evaluate("S.derived.channels.some(c=>/_temiz$/.test(c.name)) && S.plot.axes.some(a=>a.traces.some(t=>t.ch&&/_temiz$/.test(t.ch.name)))"), 'temiz kanal grafiğe eklenmedi')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz7:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
