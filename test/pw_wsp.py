# Çalışma klasörü (sol panel “Klasör”) ve kod sekmelerini toplu kapatma
# - yol kipi: MATView.exe gibi --allow-file-access-from-files ile; yazılan yoldan gezinme, .m/.mat/.bin açma, klasördeki işlevleri çağırma
# - tutamaç kipi: OPFS kökü (gerçek klasör izni yerine) ile okuma + yazma (.m kaydı, save, fwrite)
import asyncio, os, shutil, json, threading, http.server, functools
import numpy as np, scipy.io
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; T = '/tmp/_mv_wsp'
shutil.rmtree(T, ignore_errors=True); os.makedirs(T + '/alt klasör', exist_ok=True)
scipy.io.savemat(T + '/veri.mat', {'x': np.arange(1, 6, dtype=float).reshape(-1, 1), 'fs': 100.0})
open(T + '/karesi.m', 'w').write('function r = karesi(v)\n  r = yardimci(v).^2;\nend\n')
open(T + '/yardimci.m', 'w').write('function y = yardimci(v)\n  y = v + 0;\nend\n')
open(T + '/ana.m', 'w').write("load('veri.mat');\nfprintf('toplam=%d\\n', sum(karesi(x)));\nfid = fopen('ham.bin'); b = fread(fid, inf, 'uint8'); fclose(fid);\nfprintf('bayt=%d\\n', numel(b));\nd = dir('*.m'); fprintf('mdosya=%d\\n', numel(d));\n")
open(T + '/ham.bin', 'wb').write(bytes(range(10)))
open(T + '/notlar.xyz', 'w').write('?')
open(T + '/alt klasör/ic.m', 'w').write("disp('ic')\n")
URL = 'file://' + os.path.abspath(ROOT + 'dist/matview.html')

async def wait_run(pg):
    await pg.wait_for_timeout(300)
    for _ in range(60):
        if not await pg.evaluate("CODE.running"): break
        await pg.wait_for_timeout(200)

async def tabs(pg, errs):
    await pg.goto(URL); await pg.wait_for_timeout(600)
    await pg.click('#viewtabs button[data-v=code]'); await pg.wait_for_timeout(300)
    await pg.evaluate("codeNewDoc('a.m','x=1'); codeNewDoc('b.m','y=2'); codeNewDoc('c.m','z=3'); CODE.docs[2].dirty=true; codeRenderTabs()")
    n = await pg.evaluate("CODE.docs.length"); assert n >= 4, n
    assert await pg.evaluate("!!$('#codeCloseAll')"), 'Tümünü kapat düğmesi yok'
    await pg.click('#codeCloseAll'); await pg.wait_for_timeout(200)
    body = await pg.evaluate("$('#mbody').innerText"); assert 'b.m' in body and '1 sekmede' in body, body
    await pg.click('#mfoot button >> text=Kaydetmeden kapat'); await pg.wait_for_timeout(200)
    assert await pg.evaluate("CODE.docs.length") == 1 and await pg.evaluate("CODE.docs[0].text") == ''
    assert not await pg.evaluate("!!$('#codeCloseAll')")
    # sağ tık: diğerlerini kapat
    await pg.evaluate("codeNewDoc('a.m','1'); codeNewDoc('b.m','2'); codeNewDoc('c.m','3')")
    tab = pg.locator('#codeTabs .ctab', has_text='b.m'); await tab.click(button='right'); await pg.wait_for_timeout(200)
    await pg.click('#ctxm button >> text=Diğerlerini kapat'); await pg.wait_for_timeout(200)
    assert await pg.evaluate("CODE.docs.map(d=>d.name)") == ['b.m'] and await pg.evaluate("codeDoc().name") == 'b.m'
    # sağdakileri kapat, akıllı imleç
    await pg.evaluate("codeNewDoc('c.m','3'); codeNewDoc('d.m','4'); CODE.cur=0; codeShowDoc()")
    await pg.evaluate("codeTabMenu(0, 10, 10)"); await pg.click('#ctxm button >> text=Sağdakileri kapat'); await pg.wait_for_timeout(150)
    assert await pg.evaluate("CODE.docs.map(d=>d.name)") == ['b.m']
    print('sekmeler OK')

async def path_mode(p):
    b = await p.chromium.launch(args=['--no-sandbox', '--allow-file-access-from-files']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await tabs(pg, errs)
    await pg.goto(URL + '#cwd=' + T); await pg.wait_for_timeout(1200)
    assert await pg.evaluate("WSP.canPath") and await pg.evaluate("WSP.mode") == 'path', await pg.evaluate("[WSP.mode, WSP.canPath]")
    names = await pg.evaluate("WSP.items.map(x=>x.name)"); print(names)
    assert names[0] == 'alt klasör' and 'veri.mat' in names and 'ham.bin' in names
    assert '#' not in pg.url
    await pg.click('#lptabs button[data-lp=folder]')
    assert await pg.evaluate("document.querySelectorAll('#wsList .wsrow').length") == len(names)
    # süzgeç
    await pg.select_option('#wsFilter', 'code'); n = await pg.evaluate("document.querySelectorAll('#wsList .wsrow').length"); assert n == 4, n   # klasör + 3 .m
    await pg.select_option('#wsFilter', 'all')
    # .m aç + çalıştır (klasördeki işlevler, load, fopen, dir)
    await pg.dblclick('#wsList .wsrow >> text=ana.m'); await pg.wait_for_timeout(700)
    assert await pg.evaluate("S.view") == 'code' and await pg.evaluate("codeDoc().name") == 'ana.m'
    assert await pg.evaluate("codeDoc().src && codeDoc().src.mode") == 'path'
    await pg.evaluate("codeRun('all')"); await wait_run(pg)
    out = await pg.evaluate("$('#codeOut').innerText"); print(out[-300:])
    assert 'toplam=55' in out and 'bayt=10' in out and 'mdosya=3' in out, out
    # pwd / cd komut sözdizimi
    await pg.evaluate("codeRunText('p = pwd', 0, '>>', 'komut')"); await wait_run(pg)
    assert T in await pg.evaluate("$('#codeOut').innerText")
    await pg.evaluate("codeRunText('cd alt klasör', 0, '>>', 'komut')"); await wait_run(pg); await pg.wait_for_timeout(500)
    assert await pg.evaluate("WSP.path") == T + '/alt klasör', await pg.evaluate("WSP.path")
    assert await pg.evaluate("WSP.items.map(x=>x.name)") == ['ic.m']
    # Backspace ile üst klasör
    await pg.focus('#wsList'); await pg.keyboard.press('Backspace'); await pg.wait_for_timeout(600)
    assert await pg.evaluate("WSP.path") == T and await pg.evaluate("WSP.items[WSP.sel].name") == 'alt klasör'
    # yola yazarak gitme + hata
    await pg.fill('#wsPath', T + '/yok'); await pg.press('#wsPath', 'Enter'); await pg.wait_for_timeout(500)
    assert await pg.evaluate("WSP.path") == T and 'açılamadı' in await pg.evaluate("$('#toast').innerText")
    # .mat çift tık → kanallar (zaman görünümünde)
    await pg.click('#viewtabs button[data-v=time]'); await pg.dblclick('#wsList .wsrow >> text=veri.mat'); await pg.wait_for_timeout(1500)
    assert await pg.evaluate("S.files.some(f=>f.name==='veri.mat')")
    # .bin → çerçeve penceresi
    await pg.dblclick('#wsList .wsrow >> text=ham.bin'); await pg.wait_for_timeout(800)
    assert await pg.evaluate("!$('#modal').classList.contains('hidden') && FS.bin && FS.bin.name") == 'ham.bin'
    await pg.click('#mclose')
    # sürükle: klasör satırını editöre bırakmak .m açar
    await pg.evaluate("""()=>{const dt=new DataTransfer(); dt.setData('text/matview-wsp','karesi.m'); window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));}"""); await pg.wait_for_timeout(700)
    assert await pg.evaluate("codeDoc().name") == 'karesi.m'
    # salt okunur: kaydet → indirme yolu (wspSaveDoc null)
    assert await pg.evaluate("wspSaveDoc(codeDoc(), 'x')") is None
    # exe’ye bırakılan dosya
    await pg.goto(URL + '#open=' + T + '/veri.mat'); await pg.wait_for_timeout(1500)
    assert await pg.evaluate("S.files.some(f=>f.name==='veri.mat')"), 'open= ile dosya açılmadı'
    assert await pg.evaluate("WSP.mode") == 'path'   # son klasör hatırlandı
    assert not errs, errs
    await b.close(); print('yol kipi OK')

async def handle_mode(p):
    # OPFS file:// kökenlerinde kapalı: sayfayı yerel HTTP üzerinden aç (uygulama kodu aynı)
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.abspath(ROOT + 'dist')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); URL = f'http://127.0.0.1:{srv.server_address[1]}/matview.html'
    b = await p.chromium.launch(args=['--no-sandbox', '--enable-features=SharedArrayBuffer']); cx = await b.new_context(viewport={'width': 1500, 'height': 950}); pg = await cx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(800)
    assert await pg.evaluate("WSP.canPath") is False
    files = {n: open(T + '/' + n, 'rb').read().decode('latin1') for n in ['veri.mat', 'karesi.m', 'yardimci.m', 'ana.m', 'ham.bin']}
    await pg.evaluate("""async fl=>{const r=await navigator.storage.getDirectory(); for await (const [n] of r.entries()) await r.removeEntry(n,{recursive:true});
      for (const [n,t] of Object.entries(fl)) { const b=Uint8Array.from(t,c=>c.charCodeAt(0)); const w=await (await r.getFileHandle(n,{create:true})).createWritable(); await w.write(b); await w.close(); }
      await r.getDirectoryHandle('alt',{create:true}); await wspOpenHandle(r); wspShowPane('folder');}""", files)
    await pg.wait_for_timeout(500)
    assert await pg.evaluate("WSP.mode") == 'handle' and await pg.evaluate("WSP.writeOk"), await pg.evaluate("[WSP.mode, WSP.writeOk]")
    assert 'yazılabilir' in await pg.evaluate("$('#wsFoot').innerText")
    # yazılan yol tarayıcıda: uyarı
    await pg.fill('#wsPath', 'C:\\Veri'); await pg.press('#wsPath', 'Enter'); await pg.wait_for_timeout(300)
    assert 'MATView.exe' in await pg.evaluate("$('#toast').innerText")
    # aç, düzenle, Ctrl+S → aynı dosyaya yazılır
    await pg.dblclick('#wsList .wsrow >> text=ana.m'); await pg.wait_for_timeout(600)
    await pg.evaluate("codeRun('all')"); await wait_run(pg)
    out = await pg.evaluate("$('#codeOut').innerText"); assert 'toplam=55' in out and 'bayt=10' in out, out
    await pg.evaluate("codeSetText(codeDoc().text + \"disp('ek')\\n\")"); assert await pg.evaluate("codeDoc().dirty")
    await pg.focus('#codeEd'); await pg.keyboard.press('Control+s'); await pg.wait_for_timeout(600)
    assert not await pg.evaluate("codeDoc().dirty")
    disk = await pg.evaluate("async()=>{const r=await navigator.storage.getDirectory(); return await (await (await r.getFileHandle('ana.m')).getFile()).text();}")
    assert "disp('ek')" in disk and '\r\n' in disk, disk
    # yeni bağsız betik → klasöre kaydet onayı
    await pg.evaluate("codeNewDoc('yeni.m','a=1')"); await pg.focus('#codeEd'); await pg.keyboard.press('Control+s'); await pg.wait_for_timeout(300)
    assert 'geçerli klasöre' in await pg.evaluate("$('#mbody').innerText")
    await pg.click('#mfoot button >> text=Klasöre kaydet'); await pg.wait_for_timeout(600)
    assert 'yeni.m' in await pg.evaluate("WSP.items.map(x=>x.name)") and await pg.evaluate("codeDoc().src.name") == 'yeni.m'
    # koddan save / fwrite → klasöre
    await pg.evaluate("codeRunText(\"q = [1 2 3]; save('cikti.mat','q'); fid=fopen('o.bin','w'); fwrite(fid, [65 66]); fclose(fid);\", 0, '>>', 'komut')"); await wait_run(pg); await pg.wait_for_timeout(800)
    names = await pg.evaluate("WSP.items.map(x=>x.name)"); assert 'cikti.mat' in names and 'o.bin' in names, names
    # yazılan .mat yeniden okunur
    await pg.evaluate("codeRunText(\"clear q; load('cikti.mat'); disp(sum(q))\", 0, '>>', 'komut')"); await wait_run(pg)
    assert '6' in (await pg.evaluate("$('#codeOut').innerText"))[-40:]
    # yeni betik menüden, alt klasöre gir/çık, kırıntı
    await pg.dblclick('#wsList .wsrow >> text=alt'); await pg.wait_for_timeout(400)
    assert (await pg.evaluate("wspDir()")).endswith('\\alt') and await pg.evaluate("WSP.stack.length") == 2
    await pg.click('#wsCrumb a >> nth=0'); await pg.wait_for_timeout(400); assert await pg.evaluate("WSP.stack.length") == 1
    # sekme menüsü: klasörde göster
    await pg.evaluate("codeTabMenu(CODE.cur, 50, 50)"); assert 'Klasörde göster' in await pg.evaluate("$('#ctxm').innerText"); await pg.keyboard.press('Escape'); await pg.evaluate("closeMenus()")
    # yeniden yükleme: son klasör kalıcı (OPFS izni hep var)
    assert not errs, errs
    # son klasörü geri yükleme (alt klasörüyle birlikte). Not: headless kabuk OPFS tutamacını IndexedDB’den başka sayfada açamıyor; bellekteki liste kullanılır
    await pg.dblclick('#wsList .wsrow >> text=alt'); await pg.wait_for_timeout(400)
    assert await pg.evaluate("WSP.recent[0].kind") == 'handle' and await pg.evaluate("WSP.recent[0].sub") == ['alt']
    await pg.evaluate("async()=>{wspClose(); await wspRestore(WSP.recent[0]);}"); await pg.wait_for_timeout(300)
    assert await pg.evaluate("WSP.mode") == 'handle' and (await pg.evaluate("wspDir()")).endswith('\\alt'), await pg.evaluate("wspDir()")
    assert not errs, errs
    await b.close(); srv.shutdown(); print('tutamaç kipi OK')

async def main():
    async with async_playwright() as p:
        await path_mode(p); await handle_mode(p)
    print('pw_wsp: OK')
asyncio.run(main())
