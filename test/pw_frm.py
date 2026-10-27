import asyncio, os, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; T = json.load(open('/tmp/frm/truth.json'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); ctx = await b.new_context(viewport={'width': 1500, 'height': 950}); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        url = 'file://' + os.path.abspath(ROOT + 'dist/matview.html'); await pg.goto(url)
        await pg.set_input_files('#fileIn', ['/tmp/frm/frame.xlsx']); await pg.wait_for_timeout(1200)
        assert await pg.query_selector('#modal:not(.hidden)'), 'çerçeve diyaloğu açılmadı'
        assert await pg.evaluate("FS.def && FS.def.sheets.length") == 4
        await pg.set_input_files('#mbody input[type=file]:not([accept])', ['/tmp/frm/data_tail.bin']); await pg.wait_for_timeout(300)
        info = await pg.evaluate("document.querySelector('#frmInfo').textContent"); print(info); assert '40 kare' in info and '3 bayt' in info, info
        await pg.evaluate("document.querySelector('#frmPerm').click()"); await pg.wait_for_timeout(200)
        assert await pg.evaluate("!!localStorage.getItem('mv.frame')"), 'kalıcı kaydedilmedi'
        await pg.evaluate("[...document.querySelectorAll('#mfoot button')].find(b=>b.textContent.startsWith('Çöz')).click()"); await pg.wait_for_timeout(1500)
        rep = await pg.evaluate("document.querySelector('#mbody').innerText"); print(rep[:600])
        assert 'HATA' in rep and 'UYARI' in rep and 'BADT' in rep and 'Tanımsız' in rep and 'artık' in rep or 'tam kare' in rep, rep[:400]
        await pg.evaluate("document.querySelector('#mclose').click()")
        r = await pg.evaluate("(()=>{const f=S.files[S.files.length-1]; return [f.name, [...new Set(f.channels.map(c=>c.dev))].join(), f.channels.length]})()"); print(r); assert r[1] == 'A,L,S,O' and r[2] == 17, r
        tr = await pg.evaluate("document.querySelector('#tree').innerText"); assert 'A' in tr and 'bin' in tr.lower() or 'data_tail' in tr, tr[:200]
        d = await pg.evaluate("(async()=>{const o={}; for (const n of ['A/T1','A/M12','L/LV','S/S3']) {const c=S.files[S.files.length-1].channels.find(c=>c.name===n); await ensureLoaded(c); o[n]=[c.data.length, c.data[3], c.g?c.g.length:0, c.dtS];} return o})()"); print(d)
        assert d['A/T1'][0] == 80 and abs(d['A/T1'][1] - T['A/T1'][3]) < 1e-9 and abs(d['A/T1'][3] - 0.005) < 1e-12, d
        assert d['A/M12'][0] == 160 and d['A/M12'][1] == T['A/M12'][3], d
        assert d['L/LV'][0] == len(T['L/LV']) and d['L/LV'][2] == len(T['L/LV']), d
        assert d['S/S3'][0] == len(T['S/S3']), d
        # kalıcılık: yeniden yükle
        await pg.reload(); await pg.wait_for_timeout(800)
        k = await pg.evaluate("[FS.perm, FS.def && FS.def.sheets.length, FS.name]"); print(k); assert k[0] is True and k[1] == 4, k
        await pg.evaluate("document.querySelector('#btnFrm').click()"); await pg.wait_for_timeout(300)
        assert 'kalıcı' in (await pg.evaluate("document.querySelector('#mbody').innerText")).lower()
        await pg.evaluate("[...document.querySelectorAll('#mbody button')].find(b=>b.textContent.startsWith('Kalıcı çerçeveyi kaldır')).click()"); await pg.wait_for_timeout(200)
        assert await pg.evaluate("localStorage.getItem('mv.frame')") is None
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
