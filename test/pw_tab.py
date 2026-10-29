import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SHOT = os.environ.get('SHOT', '/tmp/tab_')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1366, 'height': 768})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'api/args' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERR: ' + str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(400)
        await pg.set_input_files('#fileIn', ['/tmp/tdata/zaman.csv']); await pg.wait_for_selector('#modal:not(.hidden)')
        print('dialog:', (await pg.inner_text('#mbody'))[:260].replace('\n', ' | '))
        await pg.screenshot(path=SHOT + '1_dialog.png'); await pg.click('#mfoot button.primary'); await pg.wait_for_timeout(800)
        print('axes', await pg.evaluate("S.plot.axes.map(a=>a.traces.map(t=>t.label+':'+t.ch.fs+':'+t.ch.unit+':'+t.ch.kind))"))
        await pg.screenshot(path=SHOT + '2_time.png')
        # formül sekmesi: integral ve kayan RMS
        await pg.click('#rtabs [data-t=expr]'); await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())");  await pg.select_option('#qOp', 'int'); await pg.click('button:has-text("Hesapla ve ekle")'); await pg.wait_for_timeout(600)
        print('after int:', await pg.evaluate("S.plot.axes.map(a=>a.traces.map(t=>t.label+'|'+t.ch.unit))"), await pg.inner_text('#qMsg'))
        await pg.select_option('#qOp', 'mrms'); await pg.click('button:has-text("Hesapla ve ekle")'); await pg.wait_for_timeout(600)
        await pg.fill('#exprIn', 'zscore(' + (await pg.evaluate("S.plot.axes[0].traces[0].ch.name")) + ')'); await pg.click('button:has-text("Hesapla ve grafiğe ekle")'); await pg.wait_for_timeout(500)
        print('axes now', await pg.evaluate("S.plot.axes.length"), await pg.inner_text('#exprMsg'))
        await pg.screenshot(path=SHOT + '3_formula.png')
        # grafikten spektrum / spektrogram
        await pg.evaluate("graphSpectrum(S.plot.axes[0])"); await pg.wait_for_timeout(1200); print('view', await pg.evaluate("S.view"), await pg.evaluate("S.specPlot.axes[0] && S.specPlot.axes[0].traces.length"))
        await pg.screenshot(path=SHOT + '4_spec.png')
        svg = await pg.evaluate("S.specPlot.toSVG(true)"); open('/tmp/tab_spec.svg','w').write(svg); print('spec svg bytes', len(svg))
        await pg.evaluate("graphSpectrogram(S.plot.axes[0])"); await pg.wait_for_timeout(1500); print('view', await pg.evaluate("S.view"))
        svg2 = await pg.evaluate("S.specView.toSVG(true)"); open('/tmp/tab_sg.svg','w').write(svg2); print('sg svg bytes', len(svg2))
        await pg.screenshot(path=SHOT + '5_sgram.png')
        svg3 = await pg.evaluate("S.plot.toSVG(true)"); open('/tmp/tab_time.svg','w').write(svg3); print('time svg bytes', len(svg3))
        # özellik verisi
        await pg.set_input_files('#fileIn', ['/tmp/tdata/ozellik.csv']); await pg.wait_for_selector('#modal:not(.hidden)')
        print('dialog2:', (await pg.inner_text('#mbody'))[:200].replace('\n', ' | ')); await pg.screenshot(path=SHOT + '6_dialog2.png')
        await pg.click('#mfoot button.primary'); await pg.wait_for_timeout(800)
        print('view', await pg.evaluate("S.view"), 'tab', await pg.evaluate("S.tab"))
        await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())"); await pg.select_option('#featBody select >> nth=3', 'linear'); await pg.click('#featBody button:has-text("Çiz")'); await pg.wait_for_timeout(500)
        print('info:', await pg.inner_text('#featInfo')); await pg.screenshot(path=SHOT + '7_feat.png')
        await pg.click('button:has-text("Korelasyon matrisi")'); await pg.wait_for_timeout(300); await pg.screenshot(path=SHOT + '8_corr.png'); await pg.click('#mclose')
        # akordeon: iki dosya
        await pg.screenshot(path=SHOT + '9_tree.png')
        ov = await pg.evaluate("[document.documentElement.scrollHeight>innerHeight, document.querySelector('#left').scrollHeight>document.querySelector('#left').clientHeight+1, document.querySelector('#right').scrollHeight>document.querySelector('#right').clientHeight+1]")
        print('page overflow / left overflow / right overflow:', ov)
        # xlsx
        await pg.set_input_files('#fileIn', ['/tmp/tdata/zaman.xlsx']); await pg.wait_for_selector('#modal:not(.hidden)'); print('xlsx dialog:', (await pg.inner_text('#mbody'))[:160].replace('\n',' | ')); await pg.click('#mfoot button.primary'); await pg.wait_for_timeout(600)
        print('files', await pg.evaluate("S.files.map(f=>f.name+':'+f.channels.length+':'+(f.feature?'feat':'time'))"))
        print('ERRS', errs)
        await b.close()
asyncio.run(main())
