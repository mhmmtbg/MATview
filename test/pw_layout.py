# Lejant katlama, 5'ten fazla alt grafikte dikey kaydırma, köşeden boyutlandırma (sentetik veri)
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate("""async()=>{ const mk=(nm,k)=>{const d=new Float64Array(2000); for(let i=0;i<d.length;i++) d[i]=Math.sin(i/(30+k))*(k+1); const c=addDerived(nm,d,null); c.dtS=1/1000; c.unit='g'; return c;};
          const many=[]; for(let k=0;k<14;k++) many.push(mk('iz_'+k,k)); await addToNewAxes(many,true); S.plot.fitAll(); }""")
        await pg.wait_for_timeout(300)
        # lejant: 14 iz → alt grafik yüksekliğini aşmaz, katlanınca küçülür
        lg = await pg.evaluate("(()=>{const l=document.querySelector('.lgd'); return [l.offsetHeight, S.plot.axes[0].rect.h]})()"); print('lejant', lg); assert lg[0] <= lg[1] + 2
        await pg.click('.lgd .lfold'); await pg.wait_for_timeout(150)
        lg2 = await pg.evaluate("[document.querySelector('.lgd').offsetHeight, S.plot.axes[0].lgMin, document.querySelector('.lgd .lfold').textContent]"); print('katlı', lg2); assert lg2[0] < 30 and lg2[1] and '14 iz' in lg2[2]
        svg = await pg.evaluate("S.plot.toSVG()"); assert 'iz_13' not in svg   # katlı lejant dışa aktarmada da yok
        await pg.click('.lgd .lfold'); assert not await pg.evaluate("S.plot.axes[0].lgMin")
        await pg.click('#tb-legend'); assert await pg.evaluate("S.plot.axes.every(a=>a.lgMin)"); await pg.click('#tb-legend')
        # 8 alt grafik → kaydırma
        await pg.evaluate("""async()=>{ for(let k=0;k<7;k++){ const d=new Float64Array(500).map((_,i)=>Math.cos(i/(9+k))); const c=addDerived('alt_'+k,d,null); c.dtS=1/500; await addToNewAxes([c]); } }"""); await pg.wait_for_timeout(400)
        st = await pg.evaluate("(()=>{const v=S.plot.cv.parentElement; return {n:S.plot.axes.length, H:S.plot.H, Hv:S.plot.Hv, sh:v.scrollHeight, ch:v.clientHeight, cls:v.className, hs:S.plot.axes.map(a=>Math.round(a.rect.h))}})()"); print('kaydırma', st)
        assert st['n'] == 8 and st['H'] > st['Hv'] + 100 and st['sh'] > st['ch'] and 'scrolly' in st['cls'] and min(st['hs']) > 80
        # tekerlek kaydırır, yakınlaştırmaz
        x0 = await pg.evaluate("S.plot.axes[0].xlim.slice()"); r = await pg.evaluate("(()=>{const r=S.plot.cv.parentElement.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]})()")
        await pg.mouse.move(*r); await pg.mouse.wheel(0, 600); await pg.wait_for_timeout(300)
        sc = await pg.evaluate("S.plot.cv.parentElement.scrollTop"); x1 = await pg.evaluate("S.plot.axes[0].xlim.slice()"); print('scrollTop', sc); assert sc > 100 and x0 == x1
        # kaydırılmış konumda imleç doğru alt grafiği bulur
        await pg.evaluate("setMode('cursor')"); last = await pg.evaluate("(()=>{const a=S.plot.axes[7],b=S.plot.cv.getBoundingClientRect(); return [b.left+a.rect.x+a.rect.w*0.5, b.top+a.rect.y+a.rect.h*0.6]})()")
        await pg.evaluate("S.plot.cv.parentElement.scrollTop=1e6"); await pg.wait_for_timeout(100)
        last = await pg.evaluate("(()=>{const a=S.plot.axes[7],b=S.plot.cv.getBoundingClientRect(); return [b.left+a.rect.x+a.rect.w*0.5, b.top+a.rect.y+a.rect.h*0.6]})()")
        await pg.mouse.click(*last); cur = await pg.evaluate("S.plot.cursors.map(c=>c.tr.label)"); print('imleç', cur); assert cur == ['alt_6']
        await pg.screenshot(path='/tmp/claude-0/layout_scroll.png'); await pg.evaluate("setMode('pan')")
        # köşeden boyutlandır: ikinci alt grafik
        await pg.evaluate("S.plot.cv.parentElement.scrollTop=0"); await pg.wait_for_timeout(100)
        cr = await pg.evaluate("(()=>{const c=document.querySelectorAll('.axcorner')[1].getBoundingClientRect(); return [c.left+6,c.top+6]})()")
        h0 = await pg.evaluate("[S.plot.axes[1].rect.h, S.plot.axes[1].rect.w, S.plot.H]")
        await pg.mouse.move(*cr); await pg.mouse.down(); await pg.mouse.move(cr[0] - 200, cr[1] + 150, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
        h1 = await pg.evaluate("[S.plot.axes[1].rect.h, S.plot.axes[1].rect.w, S.plot.H, S.plot.axes[1].hpx, S.plot.axes[0].rect.w]"); print('köşe', h0, h1)
        assert abs(h1[0] - (h0[0] + 150)) < 3 and abs(h1[1] - (h0[1] - 200)) < 3 and h1[2] > h0[2] + 140 and abs(h1[4] - h0[1]) < 2
        await pg.dispatch_event('.axcorner >> nth=1', 'dblclick'); await pg.wait_for_timeout(150); assert await pg.evaluate("S.plot.axes[1].hpx==null && S.plot.axes[1].wfrac==null")
        # az alt grafikte kaydırma yok, tekerlek yine yakınlaştırır
        await pg.evaluate("while(S.plot.axes.length>3) S.plot.removeAxes(S.plot.axes[S.plot.axes.length-1]); S.plot.invalidate()"); await pg.wait_for_timeout(300)
        st2 = await pg.evaluate("[S.plot.H, S.plot.Hv, S.plot.cv.parentElement.classList.contains('scrolly')]"); print('3 alt grafik', st2); assert st2[0] == st2[1] and not st2[2]
        x0 = await pg.evaluate("S.plot.axes[0].xlim.slice()"); a0 = await pg.evaluate("(()=>{const a=S.plot.axes[0],b=S.plot.cv.getBoundingClientRect(); return [b.left+a.rect.x+a.rect.w/2, b.top+a.rect.y+a.rect.h/2]})()")
        await pg.mouse.move(*a0); await pg.mouse.wheel(0, -200); await pg.wait_for_timeout(200); x1 = await pg.evaluate("S.plot.axes[0].xlim.slice()"); assert x1 != x0
        print('ERR', errs); assert not errs; await b.close(); print('OK layout')
asyncio.run(main())
