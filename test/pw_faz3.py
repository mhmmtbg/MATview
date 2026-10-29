# Faz 3: 12 000 kanallı dosyada sanal kaydırmalı ağaç, gelişmiş arama (regex / birim / fs / ★), panel boyutlandırma ve gizleme
import asyncio, os, time, numpy as np, scipy.io as sio
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
F = '/tmp/_mv_many.mat'
if not os.path.exists(F):
    d = {}
    for i in range(12000): d['K%05d_%s' % (i, 'acc' if i % 3 == 0 else 'tmp' if i % 3 == 1 else 'prs')] = np.sin(np.arange(64) * (i % 7 + 1) * 0.1)
    sio.savemat(F, d)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [F]); await pg.wait_for_function('S.files.length===1 && S.files[0].channels.length>=12000', timeout=60000)
        await pg.evaluate("(()=>{const f=S.files[0]; for(const g of f.channels){ const dv=[...S.open].length; } for (const k of new Set(f.channels.map(c=>f.id+'/'+c.dev))) S.open.add(k); f.channels.forEach((c,i)=>{c.unit=c.name.includes('acc')?'g':c.name.includes('tmp')?'°C':'bar'; if(i%2) c.dtS=1/2000; else c.dtS=1/500;}); renderTree();})()")
        n = await pg.evaluate("[S.rowOrder.length, document.querySelectorAll('#tree .trow').length]"); print('rows', n)
        assert n[0] == 12000 and n[1] < 400, n
        t0 = time.time()
        for k in range(20): await pg.evaluate("(()=>{const b=document.querySelector('#tree .tbody'); b.scrollTop+=5000; b.dispatchEvent(new Event('scroll'));})()"); await pg.wait_for_timeout(20)
        await pg.wait_for_timeout(100)
        vis = await pg.evaluate("(()=>{const b=document.querySelector('#tree .tbody'); const r=[...b.querySelectorAll('.trow')]; const br=b.getBoundingClientRect(); const v=r.filter(x=>{const q=x.getBoundingClientRect(); return q.bottom>br.top&&q.top<br.bottom}); return [b.scrollTop, v.length, v[0]&&v[0].querySelector('.nm').textContent]})()")
        print('scroll', vis, '%.2fs' % (time.time() - t0)); assert vis[1] > 5 and vis[2]
        # tıklama ile seçim + klavye ile aşağı inme (sanal pencere sınırını aşarak)
        await pg.evaluate("(()=>{const b=document.querySelector('#tree .tbody'); b.scrollTop=0; treeSlice(b);})()")
        await pg.click('#tree .trow >> nth=0')
        for k in range(60): await pg.keyboard.press('ArrowDown')
        foc = await pg.evaluate("document.activeElement && document.activeElement._uid === S.rowOrder[60].uid"); print('focus60', foc); assert foc
        # arama
        async def q(s):
            await pg.fill('#q', s); await pg.wait_for_timeout(250); return await pg.evaluate("S.rowOrder.length")
        r1 = await q('/^K0001[0-9]_acc$/'); r2 = await q('[°C]'); r3 = await q('[g] fs>1000'); r4 = await q('acc fs=500'); r5 = await q('/(/')
        print('search', r1, r2, r3, r4, r5); assert r1 == 3 and r2 == 4000 and r3 == 2000 and r4 == 2000
        err = await pg.evaluate("document.querySelector('#tree').textContent.includes('Geçersiz')"); assert err
        await q('')
        # sık kullanılanlar
        await pg.evaluate("toggleFav(S.rowOrder[3]); toggleFav(S.rowOrder[7])")
        await pg.click('#btnFavOnly'); await pg.wait_for_timeout(100); r6 = await pg.evaluate("S.rowOrder.length"); await pg.click('#btnFavOnly')
        r7 = await q('★ acc'); print('fav', r6, r7); assert r6 == 2 and r7 <= 2
        await q('')
        # panel boyutu + gizleme
        sp = await pg.evaluate("(()=>{const r=document.querySelector('#left>.split').getBoundingClientRect(); return [r.left+3, r.top+300]})()")
        await pg.mouse.move(*sp); await pg.mouse.down(); await pg.mouse.move(sp[0] + 120, sp[1], steps=4); await pg.mouse.up()
        lw = await pg.evaluate("document.querySelector('#left').getBoundingClientRect().width"); print('lw', lw); assert 390 < lw < 430
        await pg.keyboard.press('Control+b'); hl = await pg.evaluate("getComputedStyle(document.querySelector('#left')).display"); assert hl == 'none'
        await pg.keyboard.press('Control+Shift+b'); hr = await pg.evaluate("getComputedStyle(document.querySelector('#right')).display"); assert hr == 'none'
        await pg.wait_for_timeout(200); await pg.screenshot(path='/tmp/claude-0/faz3_hidden.png')
        await pg.click('.reveal.l'); await pg.click('.reveal.r'); assert await pg.evaluate("!$('#app').classList.contains('hideL') && !$('#app').classList.contains('hideR')")
        await pg.reload(); await pg.wait_for_timeout(300); lw2 = await pg.evaluate("document.querySelector('#left').getBoundingClientRect().width"); print('lw kalıcı', lw2); assert abs(lw2 - lw) < 2
        await pg.evaluate("localStorage.removeItem('mv.panes'); localStorage.removeItem('mv.fav')")
        print('ERR', errs); assert not errs; await b.close(); print('OK faz3')
asyncio.run(main())
