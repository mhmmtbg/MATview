# v2.45 (sentetik veri)
# - .mat kaydet → aç: her yolda (binary "tüm alanlar", seçili kanallar, telemetri seçimi, Çıktı › .mat) zaman çözümdekiyle aynı
#   (farklı hızdaki kanalların <ad>_zaman_s / <ad>_t vektörleri açarken o kanala bağlanır)
# - imleçler: yeniden adlandır (çift tık / ✎), sırala (↑/↓), seçili imleci sil (🗑 / Delete); taşınan imleç adını korur
# - imleç paneli açıkken PNG / SVG çıktısına imleç tablosu eklenir; küçültülünce / kapalıyken eklenmez
import asyncio, os, sys, subprocess, base64
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
HELP = r"""window.__bl = {}; window.saveBlob = async (b, n) => { window.__bl[n] = await b; return true; };
window.__cmp = async (src, name, mapName) => { const blob = window.__bl[name]; if (!blob) return 'blob yok ' + Object.keys(window.__bl);
  const before = S.files.length; await openFiles([new File([blob], 'Z_' + name)]); await sleep(300); const g = S.files[S.files.length - 1]; if (S.files.length === before) return 'açılamadı';
  const mb = new Map(g.channels.map(c => [c.name, c])); let n = 0; const bad = [];
  for (const c of src) { const d = mb.get(mapName ? mapName(c) : sanitizeName(c.name)); if (!d) { bad.push([c.name, 'yok']); continue; } await ensureLoaded(c); await ensureLoaded(d); n++;
    if (c.n !== d.n) { bad.push([c.name, 'n', c.n, d.n]); continue; } let mx = 0; for (let i = 0; i < c.n; i++) mx = Math.max(mx, Math.abs(c.t(i) - d.t(i)));
    if (mx > 1e-6) bad.push([c.name, 'dt', mx]); }
  const tv = g.channels.filter(c => /_zaman_s$|_t$/.test(c.name)).map(c => c.name); closeFile(g); return [n, bad.slice(0, 6), tv]; };"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.evaluate(HELP + "; 0")
        # ---- binary çerçeve: tam ve yarım hızlı alanlar ----
        await pg.set_input_files('#fileIn', [ROOT + 'sablon/MATView_Cerceve_Sablonu.xlsx', ROOT + 'sablon/sablon_deneme.bin'])
        await pg.wait_for_selector('#modal:not(.hidden)', timeout=8000); await pg.wait_for_timeout(500)
        await pg.click('#mfoot button.primary'); await pg.wait_for_function('S.files.length===1', timeout=60000); await pg.wait_for_timeout(500)
        for nm, js in [('binary tüm alanlar', "const f = S.files[0]; await binMatExport(f, {subs: null, raw: false, fields: true, nan: true, time: true}); return __cmp(f.channels.filter(c => c.dev === 'Alanlar'), Object.keys(__bl).pop());"),
                       ('binary seçili alanlar', "const f = S.files[0]; const chs = f.channels.filter(c => c.dev === 'Alanlar'); await matSelExport(chs); return __cmp(chs, 'MATView_secim_' + chs.length + '_kanal.mat');")]:
            r = await pg.evaluate("(async () => { window.__bl = {}; " + js + " })()"); print(nm, r[:2])
            ok(r[0] >= 16 and not r[1] and not r[2], nm + ': ' + str(r))
        await pg.evaluate("closeFile(S.files[0]); 0")
        # ---- telemetri ----
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        await f.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000); await pg.wait_for_timeout(500)
        for nm, js in [('telemetri tüm kanallar', "const f = S.files.find(f => f.tlm); const chs = f.channels.filter(c => !c.video); await matSelExport(chs); return __cmp(chs, 'MATView_secim_' + chs.length + '_kanal.mat');"),
                       ('telemetri birim başına bir kanal', "const f = S.files.find(f => f.tlm); const units = [...new Set(f.channels.map(c => c.name.split('/')[0]))]; const chs = units.map(u => f.channels.find(c => c.name.startsWith(u + '/'))); await matSelExport(chs); return __cmp(chs, 'MATView_secim_' + chs.length + '_kanal.mat');"),
                       ('Çıktı › .mat', "const f = S.files.find(f => f.tlm); const chs = f.channels.filter(c => !c.video).filter((c, i, a) => a.findIndex(x => x.name.split('/')[0] === c.name.split('/')[0]) === i); clearPlot(); await addToNewAxes(chs, false); await exportData('mat'); return __cmp(chs, 'veri.mat');")]:
            r = await pg.evaluate("(async () => { window.__bl = {}; " + js + " })()"); print(nm, r[:2])
            ok(r[0] >= 9 and not r[1] and not r[2], nm + ': ' + str(r))
        await pg.evaluate("closeFile(S.files.find(f => f.tlm)); clearPlot(); 0")
        # ---- imleçler ----
        await pg.evaluate("""(async()=>{ const n=5000, x=new Float64Array(n); for(let i=0;i<n;i++) x[i]=Math.sin(i/200)+0.3*Math.sin(i/37);
          const c=addDerived('sinyal',x,null,0,true); c.dtS=1/1000; await addDerivedToPlot(c); S.plot.fitAll(); switchView('time'); setMode('cursor'); 0 })()""")
        await pg.wait_for_timeout(300)
        bx = await pg.evaluate("(() => { const r = S.plot.cv.getBoundingClientRect(), a = S.plot.axes[0].rect; return [r.left + a.x, r.top + a.y, a.w, a.h]; })()")
        for i, fx in enumerate([0.2, 0.5, 0.8]):
            if i: await pg.keyboard.down('Shift')
            await pg.mouse.click(bx[0] + bx[2] * fx, bx[1] + bx[3] * 0.5)
            if i: await pg.keyboard.up('Shift')
            await pg.wait_for_timeout(120)
        xs = await pg.evaluate("S.plot.cursors.map(c => c.x)"); print('imleçler', xs); ok(len(xs) == 3, 'üç imleç')
        # yeniden adlandır: ada çift tık
        await pg.dblclick('.curpanel tr[data-k="1"] .cpn'); await pg.fill('.curpanel .cpin', 'Tepe A'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate("S.plot.cursorName(1)") == 'Tepe A' and 'Tepe A' in await pg.inner_text('.curpanel'), 'yeniden adlandırma')
        ok(await pg.evaluate("S.plot.cursors.length") == 3, 'Enter imleçleri silmemeli')
        # Esc: vazgeç (imleçler silinmez)
        await pg.click('.curpanel tr[data-k="2"]'); await pg.click('.curpanel button[title^="Seçili imleci yeniden"]'); await pg.fill('.curpanel .cpin', 'xx'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate("[S.plot.cursors.length, S.plot.cursorName(2)]") == [3, 'C3'], 'Esc: vazgeç, imleçler kalmalı ' + str(await pg.evaluate("[S.plot.cursors.length, S.plot.cursorName(2)]")))
        # sırala: Tepe A yukarı
        await pg.click('.curpanel tr[data-k="1"]'); await pg.click('.curpanel button[title^="Seçili imleci yukarı"]'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate("[S.plot.cursorName(0), S.plot.curSel, S.plot.cursors[0].x]") == ['Tepe A', 0, xs[1]], 'yukarı taşı')
        ok('Tepe A → C1' in await pg.inner_text('.curpanel'), 'çift etiketi adla')
        # taşınan imleç adını korur
        await pg.mouse.click(bx[0] + bx[2] * 0.5 + 1, bx[1] + bx[3] * 0.5); await pg.wait_for_timeout(100)
        print('taşıma sonrası', await pg.evaluate("S.plot.cursors.map((c,k)=>S.plot.cursorName(k))"))
        # görsel: panel açık → tablo eklenir
        H = await pg.evaluate("S.plot.H")
        h1 = await pg.evaluate("S.plot.toPNG(1, true).height"); svg = await pg.evaluate("S.plot.toSVG(true)")
        print('PNG yükseklik', H, '→', h1); ok(h1 > H + 60, 'PNG imleç tablosunu içermeli')
        ok('İmleçler' in svg and 'Tepe A' in svg and 'ΔX' in svg, 'SVG imleç tablosu')
        png = await pg.evaluate("S.plot.toPNG(2, true).toDataURL('image/png')"); open('/tmp/claude-0/imlec_png.png', 'wb').write(base64.b64decode(png.split(',')[1]))
        # küçültülünce eklenmez
        await pg.click('.curpanel button[title^="Yalnız başlık"]'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate("S.plot.toPNG(1, true).height === S.plot.H"), 'küçültülmüş panel görsele eklenmemeli')
        await pg.click('.curpanel button[title^="Ölçümleri göster"]'); await pg.wait_for_timeout(100)
        # sil: seçili imleç (düğme) ve Delete
        await pg.click('.curpanel tr[data-k="0"]'); await pg.click('.curpanel button[title^="Seçili imleci sil"]'); await pg.wait_for_timeout(100)
        names = await pg.evaluate("S.plot.cursors.map((c,k)=>S.plot.cursorName(k))"); print('silme sonrası', names)
        ok(names == ['C1', 'C3'], 'seçili imleç silinmeli')
        await pg.click('.curpanel tr[data-k="1"]'); await pg.keyboard.press('Delete'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate("S.plot.cursors.length") == 1, 'Delete seçili imleci silmeli')
        await pg.evaluate("S.plot.cursors = []; S.plot.invalidate(); S.plot.onChange('cursor'); setMode('pan'); 0"); await pg.wait_for_timeout(100)
        ok(await pg.evaluate("S.plot.toPNG(1, true).height === S.plot.H"), 'imleç yokken görsel değişmemeli')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz27:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
