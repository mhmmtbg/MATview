# Faz 2: çift Y, çoklu imleç + tepe yakalama + ölçümler, senkron izleme, görünüm geçmişi, spektrogram imleç/kesit/log/renk
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SETUP = """async()=>{
  const fs=1000,n=4000; const mk=(nm,f,amp,u,kind)=>{const d=new Float64Array(n); for(let i=0;i<n;i++) d[i]=amp*Math.sin(2*Math.PI*f*i/fs)+(u==='°C'?20:0); const c=addDerived(nm,d,null); c.dtS=1/fs; c.unit=u; c.kind=kind||'calc'; return c;};
  const a=mk('sin_g',5,2,'g'), b=mk('sic_C',1,3,'°C'), c=mk('sin2_g',10,1,'g');
  await addToNewAxes([a,b,c],true); await addToNewAxes([mk('alt_g',5,1,'g')],false); S.plot.fitAll(); await new Promise(r=>setTimeout(r,200)); return true; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.evaluate(SETUP)
        r = await pg.evaluate("()=>{const ax=S.plot.axes[0]; return {yr: ax.traces.map(t=>!!t.yr), l: ax.ylabel, l2: ax.ylabel2, y2: ax.ylim2, y1: ax.ylim}}")
        print('dualY', r); assert r['yr'] == [False, True, False] and r['l'] == 'g' and r['l2'] == '°C'
        assert 16 < r['y2'][0] < 18 and 22 < r['y2'][1] < 24 and r['y1'][1] < 3, r
        # sağ eksen kenar boşluğu
        rr = await pg.evaluate("S.plot.axes[0].rect.x+S.plot.axes[0].rect.w"); W = await pg.evaluate("S.plot.W"); assert W - rr > 60, (W, rr)
        # imleçler: tepe yakalama ile 3 imleç
        await pg.evaluate("setSnap('peak'); setMode('cursor'); S.plot.axes[0].traces.forEach((t,i)=>{t.visible=i===0}); S.plot.invalidate()")
        ax = await pg.evaluate("(()=>{const a=S.plot.axes[0]; const b=S.plot.cv.getBoundingClientRect(); return {x:b.left, y:b.top, r:a.rect, xl:a.xlim, yl:a.ylim}})()")
        def px(t, y): R = ax['r']; return (ax['x'] + R['x'] + (t - ax['xl'][0]) / (ax['xl'][1] - ax['xl'][0]) * R['w'], ax['y'] + R['y'] + R['h'] - (y - ax['yl'][0]) / (ax['yl'][1] - ax['yl'][0]) * R['h'])
        # sin_g tepeleri 0.05+0.2k s'de (genlik 2)
        x, y = px(0.052, 0.5); await pg.mouse.click(x, y)
        x, y = px(0.251, 0.5); await pg.keyboard.down('Shift'); await pg.mouse.click(x, y)
        x, y = px(0.452, 0.5); await pg.mouse.click(x, y); await pg.keyboard.up('Shift')
        cs = await pg.evaluate("S.plot.cursors.map(c=>[c.tr.label,+c.x.toFixed(4),+c.y.toFixed(4),c.snap])"); print('cursors', cs)
        assert len(cs) == 3 and all(c[0] == 'sin_g' and abs(c[2] - 2) < 1e-6 for c in cs) and [c[1] for c in cs] == [0.05, 0.25, 0.45]
        st = await pg.evaluate("(()=>{const s=S.plot.cursorStats(); return s.pairs.map(p=>[p.dx,p.dy,p.rms,p.mean,p.area])})()"); print('stats', st)
        assert abs(st[0][0] - 0.2) < 1e-9 and abs(st[0][2] - 2 / 2 ** .5) < 0.01 and abs(st[0][3]) < 0.02
        txt = await pg.inner_text('.curpanel'); assert 'C1 → C2' in txt and 'RMS' in txt, txt
        await pg.evaluate("S.plot.axes[0].traces.forEach(t=>{t.visible=true}); S.plot.invalidate()")
        await pg.keyboard.press('Escape'); assert await pg.evaluate("S.plot.cursors.length") == 0
        # görünüm geçmişi
        x0 = await pg.evaluate("S.plot.axes[0].xlim.slice()")
        await pg.click('#tb-zin'); x1 = await pg.evaluate("S.plot.axes[0].xlim.slice()")
        await pg.keyboard.press('Alt+ArrowLeft'); x2 = await pg.evaluate("S.plot.axes[0].xlim.slice()")
        await pg.keyboard.press('Alt+ArrowRight'); x3 = await pg.evaluate("S.plot.axes[0].xlim.slice()")
        print('hist', x0, x1, x2, x3); assert x2 == x0 and x3 == x1 and x1 != x0
        # senkron izleme
        await pg.keyboard.press('Home'); await pg.keyboard.press('x'); assert await pg.evaluate("S.plot.crosshair")
        await pg.mouse.move(*px(0.3, 0)); await pg.wait_for_timeout(100)
        hv = await pg.evaluate("S.plot.hoverX"); assert hv and abs(hv - 0.3) < 0.01, hv
        v = await pg.evaluate("S.plot.axes.map(a=>a.traces.map(t=>{const q=S.plot.valueAt(t,a,S.plot.hoverX); return q&&+q.y.toFixed(2)}))"); print('xhair', v)
        await pg.screenshot(path='/tmp/claude-0/faz2_time.png'); await pg.keyboard.press('x')
        # sağ eksene taşı / sola taşı
        await pg.evaluate("(()=>{const ax=S.plot.axes[0]; ax.traces[1].yr=false; axisLabelFor(ax); S.plot.invalidate();})()")
        # SVG dışa aktarım çift Y ile
        await pg.evaluate("(()=>{const ax=S.plot.axes[0]; ax.traces[1].yr=true; axisLabelFor(ax);})()"); svg = await pg.evaluate("S.plot.toSVG().length"); assert svg > 1000
        # spektrogram
        await pg.evaluate("(()=>{S.plot.active=S.plot.axes[0]; S.plot.axes[0].active=0;})()")
        await pg.evaluate("setTab('analyze')")
        await pg.evaluate("(async()=>{$('#sgN').value='256'; await computeSpectrogram();})()"); await pg.wait_for_timeout(400)
        assert await pg.evaluate("S.view") == 'sgram'
        for m in ['inferno', 'magma', 'jet']:
            await pg.evaluate("m=>{$('#sgMap').value=m; $('#sgMap').dispatchEvent(new Event('change',{bubbles:true}))}", m); await pg.wait_for_timeout(50)
            assert await pg.evaluate("S.specView.cmap") == m
        await pg.evaluate("$('#sgLog').checked=true; $('#sgLog').dispatchEvent(new Event('change',{bubbles:true}))"); await pg.wait_for_timeout(100); assert await pg.evaluate("S.specView.logF")
        bb = await pg.evaluate("(()=>{const v=S.specView,r=v.rect(),b=v.cv.getBoundingClientRect(); return {x:b.left+r.x+r.w*0.5, y:b.top+v.fy(5,r)}})()")
        await pg.mouse.click(bb['x'], bb['y']); await pg.wait_for_timeout(100)
        c = await pg.evaluate("S.specView.cur && [S.specView.cur.f, S.specView.cur.v]"); print('sg cursor', c, await pg.inner_text('#sgCur'))
        assert c and abs(c[0] - 5) < 4.1, c
        sl = await pg.evaluate("(()=>{const v=S.specView; const a=v.sliceT(v.cur.t); let m=0; for(let k=1;k<a.length;k++) if(a[k]>a[m]) m=k; return m*v.spec.df})()"); print('slice peak f', sl)
        await pg.screenshot(path='/tmp/claude-0/faz2_sg.png')
        svg = await pg.evaluate("S.specView.toSVG().length"); assert svg > 1000
        print('ERR', errs); assert not errs; await b.close(); print('OK faz2')
asyncio.run(main())
