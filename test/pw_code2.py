# Kod sekmesi: çok sekmeli editör, işlev dosyaları, betik çağırma, N boyutlu dizi, .mat yükle, whos/save, .fig önizleme, Windows-1254 .m
import asyncio, os, numpy as np, scipy.io as sio
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; T = '/tmp/_mv_code2/'; os.makedirs(T, exist_ok=True)
rng = np.random.default_rng(5); TM = rng.integers(0, 256, size=(20, 25, 160), dtype=np.uint8)
sio.savemat(T + 'veri.mat', {'TM': TM, 'etiket': 'deneme', 'hucre': np.array([1.5, 'ab'], dtype=object), 'yap': {'a': 3.0, 'b': np.array([1, 2, 3])}}, do_compression=True)
open(T + 'ikibayt.m', 'w').write('function y = ikibayt(a, b)\n% iki baytı birleştir\ny = double(a)*256 + double(b);\nend\n')
open(T + 'yardimci.m', 'w').write('% betik: çağıranın çalışma alanında çalışır\nkatsayi = 2;\n')
open(T + 'ana.m', 'wb').write('%% Bölüm 1 — ısı akısı (ş ğ ı)\nN = length(TM);\nR = reshape(TM, [20*25 1 N]);\nD = squeeze(R(11:30,:,:));\nyardimci\nv = ikibayt(D(1,:), D(2,:)) * katsayi;\n%% Bölüm 2\nw = whos; s = {};\nfor i = 1:length(w)\n  if strncmp(w(i).name, \'v\', 1), s{end+1} = w(i).name; end\nend\nsave(\'sonuc.mat\', s{:}, \'D\');\nfprintf(\'tamam %d %d\\n\', size(D,1), size(D,2));\n'.replace('\n', '\r\n').encode('cp1254'))
# basit GUIDE .fig benzeri yapı
def ui(style, s, pos, tag): return {'type': 'uicontrol', 'handle': 1.0, 'properties': {'Style': style, 'String': s, 'Position': np.array(pos, float), 'Units': 'normalized', 'Tag': tag}, 'children': np.zeros((0, 0))}
kids = np.empty((2,), dtype=object); kids[0] = ui('pushbutton', 'Dosya Sec', [0.1, 0.8, 0.2, 0.1], 'pushbutton1'); kids[1] = ui('popupmenu', 'Secin', [0.4, 0.8, 0.2, 0.1], 'popupmenu1')
sio.savemat(T + 'arayuz.fig', {'hgS_070000': {'type': 'figure', 'handle': 1.0, 'properties': {'Units': 'pixels', 'Position': np.array([0, 0, 600, 400.0]), 'Name': 'arayuz'}, 'children': kids}})
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); ctx = await b.new_context(accept_downloads=True, viewport={'width': 1500, 'height': 950}); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); dls = []; pg.on('download', lambda d: dls.append(d))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.click('#viewtabs button[data-v=code]'); await pg.wait_for_timeout(300)
        assert await pg.evaluate("document.querySelector('#welcome').classList.contains('hidden')"), 'karşılama katmanı Kod görünümünü örtüyor'
        assert await pg.evaluate("!!document.querySelector('#codeEd') && document.querySelector('#codeEd').offsetHeight > 100")
        await pg.set_input_files('#fileIn', [T + 'ana.m', T + 'ikibayt.m', T + 'yardimci.m', T + 'arayuz.fig']); await pg.wait_for_timeout(1500)
        names = await pg.evaluate("CODE.docs.map(d=>d.name)"); print(names); assert {'ana.m', 'ikibayt.m', 'yardimci.m'} <= set(names)
        assert 'Dosya Sec' in await pg.evaluate("document.querySelector('#mbody').innerText"), '.fig önizlemesi yok'
        await pg.evaluate("document.querySelector('#mclose').click()")
        txt = await pg.evaluate("CODE.docs.find(d=>d.name==='ana.m').text"); assert 'ısı akısı (ş ğ ı)' in txt, txt[:60]
        await pg.evaluate("CODE.cur = CODE.docs.findIndex(d=>d.name==='ana.m'); codeShowDoc()")
        assert await pg.evaluate("document.querySelectorAll('#codeHl .hs').length") >= 1, 'bölüm vurgusu yok'
        await pg.set_input_files('#v-code input[accept=".mat"]', [T + 'veri.mat']); await pg.wait_for_timeout(2000)
        ws = await pg.evaluate("CODE.ws.map(v=>v.n+':'+v.sz+':'+v.cls)"); print(ws); assert 'TM:20×25×160:uint8' in ws and any(w.startswith('yap:') for w in ws) and 'etiket:1×6:char' in ws
        await pg.evaluate("window.showSaveFilePicker=undefined; CODE.cur = CODE.docs.findIndex(d=>d.name==='ana.m'); codeShowDoc(); codeRun('all')"); await pg.wait_for_timeout(2500)
        out = await pg.evaluate("$('#codeOut').innerText"); print(out[-400:]); assert 'tamam 20 160' in out, out
        assert 'bellekte tutuluyor' in out and not dls, 'yalnız adla save klasör yokken indirmemeli'
        await pg.click('#codeOut button[title="sonuc.mat dosyasını indir"]'); await pg.wait_for_timeout(800)
        assert dls and dls[0].suggested_filename == 'sonuc.mat'; await dls[0].save_as(T + 'sonuc.mat')
        m = sio.loadmat(T + 'sonuc.mat'); print(sorted(k for k in m if not k.startswith('__')))
        R = TM.reshape(500, 160, order='F'); D = R[10:30, :]; v = (D[0].astype(float) * 256 + D[1]) * 2
        assert np.allclose(m['v'][0], v) and m['D'].dtype == np.uint8 and m['D'].shape == (20, 160)
        # komut penceresi ve bölüm çalıştırma
        await pg.fill('#codeCmd', 'x = yap.b(end) + numel(hucre)'); await pg.press('#codeCmd', 'Enter'); await pg.wait_for_timeout(800)
        out = await pg.evaluate("$('#codeOut').innerText"); assert 'x = 5' in out, out[-200:]
        # hata başka dosyada: satır ve dosya gösterilir
        await pg.evaluate("CODE.docs.find(d=>d.name==='ikibayt.m').text = 'function y = ikibayt(a, b)\\ny = a(1000);\\nend\\n'"); await pg.evaluate("codeRun('all')"); await pg.wait_for_timeout(1500)
        out = await pg.evaluate("$('#codeOut').innerText"); print(out[-200:]); assert 'ikibayt.m (satır 2)' in out, out[-300:]
        assert await pg.evaluate("codeDoc().name") == 'ikibayt.m' and await pg.evaluate("CODE.errLine") == 2
        # tanımsız işlev ipucu
        await pg.fill('#codeCmd', 'q = bilinmeyen_fn(1)'); await pg.press('#codeCmd', 'Enter'); await pg.wait_for_timeout(800)
        assert 'bilinmeyen_fn.m dosyasını da Kod sekmesinde açın' in await pg.evaluate("$('#codeOut').innerText")
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
