# v2.21 (sentetik veri): dışa aktar menüsü, tablo başlığına tıklayarak sıralama, telemetri değer listesi süzgeci + sıralama, kod kapatma seçenekleri simgesiz
import asyncio, os, sys, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(400)
        # dışa aktar: tek düğme, üç seçenek, her biri farklı simge
        ok(await pg.evaluate("document.querySelectorAll('#viewbar #btnOut').length") == 1, 'dışa aktar düğmesi yok')
        await pg.evaluate("$('#btnOut').click()"); await pg.wait_for_timeout(150)
        items = await pg.evaluate("[...document.querySelectorAll('#ctxm:not(.hidden) button')].map(b=>[b.textContent.trim(), b.querySelector('svg') ? b.querySelector('svg').innerHTML : ''])")
        print([i[0] for i in items]); ok([i[0] for i in items] == ['Rapora ekle', 'PNG olarak kaydet', 'SVG (vektör) olarak kaydet'], 'menü seçenekleri')
        ok(len(set(i[1] for i in items)) == 3 and all(i[1] for i in items), 'simgeler farklı değil')
        await pg.evaluate("$('#btnOut').click()"); await pg.wait_for_timeout(100); ok(await pg.evaluate("$('#ctxm').classList.contains('hidden')"), 'ikinci tık menüyü kapatmalı')
        # genel tablo: başlığa tıklayınca artan → azalan → ilk sıra
        await pg.evaluate("""()=>{const t=document.createElement('table');t.className='ftab';t.id='tt';t.innerHTML='<thead><tr><th>Ad</th><th>Değer</th></tr></thead><tbody>'+[['alfa',5],['beta',12],['gama',7],['delta',30]].map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('')+'</tbody>';
          const w=document.createElement('div');w.style.cssText='position:fixed;left:400px;top:200px;background:#fff;z-index:50';w.append(t);document.body.append(w);0}""")
        await pg.wait_for_timeout(200)
        col = "[...document.querySelectorAll('#tt tbody tr')].map(r=>r.cells[1].textContent)"
        await pg.click('#tt th:nth-child(2)'); ok(await pg.evaluate(col) == ['5', '7', '12', '30'], 'artan ' + str(await pg.evaluate(col)))
        ok(await pg.evaluate("document.querySelector('#tt th:nth-child(2) .tf-s').textContent") == '▲', 'sıralama işareti')
        await pg.click('#tt th:nth-child(2)'); ok(await pg.evaluate(col) == ['30', '12', '7', '5'], 'azalan')
        await pg.click('#tt th:nth-child(2)'); ok(await pg.evaluate(col) == ['5', '12', '7', '30'], 'ilk sıra')
        # telemetri: başlıktan sıralama, değer listesinden seçim
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        n0 = await f.evaluate("TPLive.rowCount()")
        vals = await f.evaluate("TPLive.colValues('unit')"); print(vals[:5]); ok(len(vals) >= 2, 'değer listesi boş')
        await f.evaluate("document.querySelector('#lvWrap th[data-col=unit] .lvf').click()"); await pg.wait_for_timeout(100)
        opts = await f.evaluate("[...document.querySelectorAll('.lvf-pop select option')].map(o=>o.value)"); ok(len(opts) == len(vals) + 1, 'açılır liste')
        await f.select_option('.lvf-pop select', vals[0]['v']); await pg.wait_for_timeout(200)
        ok(await f.evaluate("TPLive.rowCount()") == vals[0]['n'], 'değer seçimi süzmedi')
        await f.click('.lvf-pop .lvf-clr'); ok(await f.evaluate("TPLive.rowCount()") == n0, 'temizle')
        first = "[...document.querySelectorAll('#lvWrap tbody tr[data-id]')].slice(0,40).map(r=>r.cells[[...document.querySelectorAll('#lvWrap thead th')].findIndex(t=>t.dataset.col==='unit')].textContent.trim())"
        await f.evaluate("document.querySelector('#lvWrap th[data-col=unit]').click()"); await pg.wait_for_timeout(200)
        a = await f.evaluate(first); ok(a == sorted(a, key=lambda s: s.lower()) or a == sorted(a), 'telemetri artan ' + str(a[:8]))
        ok(await f.evaluate("TPLive.colSort().dir") == 1 and await f.evaluate("!!document.querySelector('#lvWrap th[data-col=unit] .lvs')"), 'telemetri sıralama işareti')
        await f.evaluate("document.querySelector('#lvWrap th[data-col=unit]').click()"); await pg.wait_for_timeout(200)
        ok(await f.evaluate("TPLive.colSort().dir") == -1, 'telemetri azalan')
        await f.evaluate("document.querySelector('#lvWrap th[data-col=unit]').click()"); await pg.wait_for_timeout(200)
        ok(await f.evaluate("TPLive.colSort()") is None and await f.evaluate("TPLive.rowCount()") == n0, 'telemetri sırasız')
        # kod: sekme menüsündeki kapatma seçenekleri ve kapatma onayı simgesiz
        await pg.click('#viewtabs button[data-v=code]'); await pg.wait_for_timeout(300)
        await pg.evaluate("codeNewDoc('a.m','x=1'); codeNewDoc('b.m','y=2'); CODE.docs[CODE.docs.length-1].dirty=true; codeRenderTabs()")
        await pg.locator('#codeTabs .ctab', has_text='b.m').click(button='right'); await pg.wait_for_timeout(150)
        ok(await pg.evaluate("document.querySelectorAll('#ctxm button svg').length") == 0, 'sekme menüsünde simge var')
        await pg.click('#ctxm button >> text=Tümünü kapat'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("document.querySelectorAll('#mfoot button svg').length") == 0, 'kapatma onayında simge var')
        await pg.click('#mfoot button >> text=Vazgeç')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz11:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
