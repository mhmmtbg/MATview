# Faz 3 (sentetik veri): tablo başlığına göre süzme / sıralama (genel bileşen) ve telemetri Çözülen Veriler sütun süzgeci
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
        # genel: belgeye eklenen tabloya ▾ gelir, değer listesi / metin / sayı aralığı / sıralama çalışır
        await pg.evaluate("""()=>{const t=document.createElement('table');t.className='ftab';t.id='tt';t.innerHTML='<thead><tr><th>Ad</th><th>Değer</th></tr></thead><tbody>'+[['alfa',5],['beta',12],['gama',7],['delta',30],['alfa2',1]].map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('')+'</tbody>';
          const w=document.createElement('div');w.id='ttw';w.style.cssText='position:fixed;left:400px;top:200px;background:#fff;z-index:50';w.append(t);document.body.append(w);0}""")
        await pg.wait_for_timeout(200)
        ok(await pg.evaluate("document.querySelectorAll('#tt th .tf-b').length") == 2, 'başlık düğmeleri yok')
        vis = "[...document.querySelectorAll('#tt tbody tr')].filter(r=>r.style.display!=='none').map(r=>r.cells[0].textContent)"
        await pg.click('#tt th:nth-child(1) .tf-b'); await pg.fill('.tf-pop input[type=search]', 'alf'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate(vis) == ['alfa', 'alfa2'], 'metin süzgeci')
        await pg.click('.tf-pop button:has-text("Temizle")')
        await pg.click('#tt th:nth-child(2) .tf-b'); await pg.fill('.tf-pop input[placeholder="en az"]', '6'); await pg.fill('.tf-pop input[placeholder="en çok"]', '20'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate(vis) == ['beta', 'gama'], 'sayı aralığı ' + str(await pg.evaluate(vis)))
        await pg.click('.tf-pop button:has-text("↓ Azalan")'); ok(await pg.evaluate(vis) == ['beta', 'gama'], 'sıralama')
        ok(await pg.evaluate("document.querySelector('#tt th:nth-child(2)').classList.contains('tf-on')"), 'etkin işaret yok')
        await pg.click('.tf-pop button:has-text("Temizle")'); ok(len(await pg.evaluate(vis)) == 5, 'temizle')
        await pg.click('#tt th:nth-child(1) .tf-b'); await pg.click('.tf-pop label:has-text("beta") input'); await pg.wait_for_timeout(100)
        ok('beta' not in await pg.evaluate(vis) and len(await pg.evaluate(vis)) == 4, 'değer listesi')
        await pg.keyboard.press('Escape')
        # tablo yeniden çizilince süzgeç korunur
        await pg.evaluate("(()=>{const t=document.getElementById('tt');const n=t.cloneNode(false);n.innerHTML=t.innerHTML.replace(/<button[^>]*>▾<\\/button>/g,'');document.getElementById('ttw').replaceChildren(n);0})()"); await pg.wait_for_timeout(200)
        ok('beta' not in await pg.evaluate(vis), 'yeniden çizimde süzgeç kayboldu')
        # telemetri: sütun süzgeci
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        n0 = await f.evaluate("TPLive.rowCount()"); ok(await f.evaluate("document.querySelectorAll('#lvWrap th .lvf').length") >= 3, 'telemetri başlık süzgeci yok')
        await f.evaluate("document.querySelector('#lvWrap th[data-col=unit] .lvf').click()"); await f.fill('.lvf-pop input', 'motor'); await pg.wait_for_timeout(200)
        n1 = await f.evaluate("TPLive.rowCount()"); print('telemetri satır', n0, '→', n1); ok(0 < n1 < n0, 'telemetri sütun süzgeci')
        ok(await f.evaluate("document.querySelector('#lvWrap th[data-col=unit]').classList.contains('tf-on')"), 'telemetri etkin işaret')
        await f.click('.lvf-pop .lvf-clr'); ok(await f.evaluate("TPLive.rowCount()") == n0, 'telemetri süzgeç temizle')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz8:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
