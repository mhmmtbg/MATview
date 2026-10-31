# Izgara düzeni (1–4 sütun), tüm alt grafiklere boyut, eşzamanlı köşe boyutlandırma, lejant menüsü (boyut/konum), sığmayan araç çubuğu adları
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1600, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.evaluate("localStorage.removeItem('mv.layout'); localStorage.removeItem('mv.lg')")
        await pg.evaluate("""async()=>{ for(let k=0;k<6;k++){ const d=new Float64Array(1500).map((_,i)=>Math.sin(i/(20+5*k))+(i%300===0?3:0)); const c=addDerived('g_'+k,d,null); c.dtS=1/1000; await addToNewAxes([c]); } S.plot.fitAll(); }""")
        await pg.wait_for_timeout(300)
        rects = lambda: pg.evaluate("S.plot.axes.map(a=>[Math.round(a.rect.x),Math.round(a.rect.y),Math.round(a.rect.w),Math.round(a.rect.h)])")
        # Düzen menüsü: 3 sütun
        await pg.click('#tb-size'); await pg.wait_for_selector('#popm')
        await pg.click('#popm .pmseg button:has-text("3")'); await pg.wait_for_timeout(200)
        r = await rects(); print('3 sütun', r); assert len({x[1] for x in r}) == 2 and len({x[0] for x in r}) == 3 and r[0][1] == r[2][1] and r[3][1] > r[0][1]
        # genişlik + yükseklik değerle: otomatik sütun, sığan kadar yan yana, ortalı
        await pg.click('#popm .pmseg button:has-text("Otomatik")')
        await pg.fill('#popm .pmrow:has-text("Genişlik") input', '300'); await pg.press('#popm .pmrow:has-text("Genişlik") input', 'Enter')
        await pg.fill('#popm .pmrow:has-text("Yükseklik") input', '160'); await pg.press('#popm .pmrow:has-text("Yükseklik") input', 'Enter'); await pg.wait_for_timeout(250)
        r = await rects(); W = await pg.evaluate("S.plot.W"); cols = await pg.evaluate("S.plot.gridCols()"); print('W', W, 'sütun', cols, r)
        assert all(x[2] == 300 and x[3] == 160 for x in r) and cols == min(4, W // (300 + 74 + 18))
        left = r[0][0] - 74; right = W - (r[cols - 1][0] + r[cols - 1][2] + 18); print('kenar', left, right); assert abs(left - right) <= 1
        note = await pg.inner_text('#popm .pmnote'); assert 'sütun sığıyor' in note
        # eşzamanlı köşe boyutlandırma
        await pg.check('#popm .pmchk input'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
        cr = await pg.evaluate("(()=>{const c=document.querySelectorAll('.axcorner')[2].getBoundingClientRect(); return [c.left+6,c.top+6]})()")
        await pg.mouse.move(*cr); await pg.mouse.down(); await pg.mouse.move(cr[0] + 120, cr[1] + 40, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(250)
        r = await rects(); cw = await pg.evaluate("[S.plot.cellW,S.plot.cellH,S.plot.gridCols()]"); print('eşzamanlı', cw, r[:3]); assert cw[0] == 420 and cw[1] == 200 and all(x[2] == 420 and x[3] == 200 for x in r)
        await pg.screenshot(path='/tmp/claude-0/grid.png')
        # varsayılan yap → yeniden yüklemede gelir
        await pg.click('#tb-size'); await pg.click('#popm button:has-text("Varsayılan yap")'); await pg.keyboard.press('Escape')
        await pg.reload(); await pg.wait_for_timeout(300); d = await pg.evaluate("[S.plot.cols,S.plot.cellW,S.plot.cellH,S.plot.syncSize]"); print('varsayılan', d); assert d == ['auto', 420, 200, True]
        await pg.evaluate("localStorage.removeItem('mv.layout')")
        # lejant menüsü
        await pg.evaluate("""async()=>{ S.plot.cellW=S.plot.cellH=null; S.plot.syncSize=false; for(let k=0;k<2;k++){ const d=new Float64Array(800).map((_,i)=>Math.cos(i/(9+k))); const c=addDerived('L_'+k,d,null); c.dtS=1/500; await addToAxes(activeAxes(),[c]); } }"""); await pg.wait_for_timeout(300)
        await pg.click('#tb-legend'); await pg.wait_for_selector('#popm')
        await pg.click('#popm button:has-text("Büyük")'); await pg.click('#popm button:has-text("Sol alt")'); await pg.wait_for_timeout(200)
        st = await pg.evaluate("(()=>{const l=document.querySelector('.lgd'),a=S.plot.axes[0],cv=S.plot.cv.getBoundingClientRect(),r=l.getBoundingClientRect(); return [l.className, Math.round(r.left-cv.left-a.rect.x), Math.round(a.rect.y+a.rect.h-(r.bottom-cv.top)), getComputedStyle(l).fontSize]})()")
        print('lejant', st); assert 'lg-l' in st[0] and 0 <= st[1] <= 8 and 0 <= st[2] <= 8 and st[3] == '14px'
        svg = await pg.evaluate("S.plot.toSVG()"); assert 'font:14px' in svg.replace(' ', '') or '14px' in svg
        await pg.click('#popm button:has-text("Tümünü katla")'); assert await pg.evaluate("S.plot.axes.every(a=>a.lgMin)")
        await pg.uncheck('#popm .pmchk input'); assert await pg.evaluate("S.plot.legend===false && document.querySelectorAll('.lgd').length===0")
        await pg.check('#popm .pmchk input'); await pg.keyboard.press('Escape'); assert await pg.evaluate("!document.getElementById('popm')")
        # dar pencerede araç çubuğu: adlar gizlenir, taşma yok
        await pg.set_viewport_size({'width': 1100, 'height': 800}); await pg.wait_for_timeout(300)
        tb = await pg.evaluate("(()=>{const t=$('#toolbar'); return [t.classList.contains('compact'), t.scrollWidth<=t.clientWidth+1, Math.max(...[...t.querySelectorAll('button')].map(b=>b.offsetHeight))]})()"); print('araç çubuğu', tb)
        assert tb[0] and tb[1] and tb[2] < 34
        await pg.set_viewport_size({'width': 2300, 'height': 900}); await pg.wait_for_timeout(300)
        tb2 = await pg.evaluate("$('#toolbar').classList.contains('compact')"); print('geniş', tb2); assert not tb2
        print('ERR', errs); assert not errs; await b.close(); print('OK grid')
asyncio.run(main())
