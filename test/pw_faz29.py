# v2.47 (sentetik veri)
# - .mat içerik görüntüleyici: değişken listesi (yapı alanları dahil), sayfalı tablo, hücre düzenleme (çift tık)
# - düzenlenmiş kopya: sıkıştırılmış ve sıkıştırmasız MATLAB dosyaları; yapı içi alan, int16, değişken silme / yeniden adlandırma;
#   değişmeyen öğeler bayt bayt aynı, scipy ile okunur, değerler doğru
# - zaman tanılama raporu: adlar gizli (A1…), <birim>_t ilişkisi görünür, zamansız kanal nedeni yazılı
import asyncio, os, sys, base64, subprocess, tempfile
from playwright.async_api import async_playwright
import numpy as np, scipy.io as sio
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; W = tempfile.mkdtemp(prefix='mv_mx_')
S = {'birim': {'t': np.arange(100) * 0.01, 'hiz': np.linspace(0, 1, 100), 'alt': {'v': np.arange(6, dtype=np.int16).reshape(2, 3)}},
     'sayac': np.arange(10, dtype=np.int16), 'bayrak': np.array([True, False, True]), 'kar': np.array([1 + 2j, 3 - 1j]),
     'metin': 'merhaba', 'hucre': np.array([np.arange(3.0), 'yazi'], dtype=object), 'buyuk': np.random.RandomState(1).rand(500, 30), 'silinecek': np.ones(4)}
sio.savemat(W + '/sik.mat', S, do_compression=True); sio.savemat(W + '/duz.mat', S, do_compression=False)
EDIT = r"""async (nm) => {
  const f = S.files.find(x => x.name === nm); const st = MXV[f.id] = {edits: new Map(), del: new Set(), ren: new Map()};
  st.edits.set('birim.hiz', new Map([[5, 123.25], [99, -7]])); st.edits.set('birim.alt.v', new Map([[3, 40.6]])); st.edits.set('sayac', new Map([[0, 99999]]));
  st.edits.set('buyuk', new Map([[500 * 2 + 7, 0.5]])); st.del.add('silinecek'); st.ren.set('metin', 'yeni_metin');
  const r = await matBuildEdited(f); const u8 = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return [btoa(s), r.nEnc]; }"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.set_input_files('#fileIn', [W + '/sik.mat', W + '/duz.mat']); await pg.wait_for_function("S.files.length === 2", timeout=20000)
        for nm in ['sik.mat', 'duz.mat']:
            b64, nEnc = await pg.evaluate(EDIT, nm); out = W + '/out_' + nm; open(out, 'wb').write(base64.b64decode(b64))
            print(nm, 'yeniden yazılan öğe', nEnc)
            ok(nEnc == 4, nm + ': yeniden yazılan üst öğe sayısı %d' % nEnc)
            M = sio.loadmat(out, squeeze_me=False)
            ok('silinecek' not in M and 'metin' not in M and str(M['yeni_metin'][0]) == 'merhaba', nm + ': silme / yeniden adlandırma')
            hz = M['birim']['hiz'][0, 0].ravel(); want = S['birim']['hiz'].copy(); want[5] = 123.25; want[99] = -7
            ok(np.array_equal(hz, want), nm + ': yapı içi alan'); ok(np.array_equal(M['birim']['t'][0, 0].ravel(), S['birim']['t']), nm + ': dokunulmayan alan')
            v = M['birim']['alt'][0, 0]['v'][0, 0]; wv = S['birim']['alt']['v'].copy(); wv.flat[[1, 0][0]] = wv.flat[1]
            # MATLAB sütun öncelikli indeks 3 = (satır 1, sütun 2) → 2×3'te [1,1] (0 tabanlı)
            ok(v.dtype == np.int16 and v[1, 1] == 41 and v[0, 0] == 0 and v[1, 2] == 5, nm + ': iç içe int16 (yuvarlama) %s' % v.tolist())
            ok(M['sayac'].dtype == np.int16 and M['sayac'].ravel()[0] == 32767 and M['sayac'].ravel()[1] == 1, nm + ': int16 doyma')
            bg = M['buyuk']; ok(bg.shape == (500, 30) and bg[7, 2] == 0.5 and np.array_equal(np.delete(bg.ravel(order='F'), 1007), np.delete(S['buyuk'].ravel(order='F'), 1007)), nm + ': büyük matris')
            ok(M['bayrak'].dtype == np.bool_ or M['bayrak'].dtype == np.uint8, nm + ': mantıksal korunmalı'); ok(np.array_equal(M['kar'].ravel(), S['kar']), nm + ': karmaşık korunmalı')
            ok(M['hucre'].shape == (1, 2) and str(M['hucre'][0, 1][0]) == 'yazi', nm + ': hücre korunmalı')
        # arayüz: liste, tablo, çift tık düzenleme
        await pg.evaluate("delete MXV[S.files.find(x => x.name === 'sik.mat').id]; matContentDlg(S.files.find(x => x.name === 'sik.mat')); 0"); await pg.wait_for_timeout(200)
        rows = await pg.evaluate("[...document.querySelectorAll('.mx-row .mx-n')].map(e => e.textContent)"); print('liste', rows[:12])
        ok(any('.hiz' in r for r in rows) and any('buyuk' in r for r in rows), 'liste yapı alanlarını göstermeli')
        await pg.click('.mx-row[title="buyuk"]'); await pg.wait_for_selector('.mx-t td[data-i]')
        ok(await pg.evaluate("document.querySelectorAll('.mx-t tr').length") == 101, '100 satırlık sayfa')
        ok('satır 1–100 / 500' in await pg.inner_text('.mx-nav'), 'sayfa bilgisi')
        await pg.dblclick('.mx-t td[data-i="1"]'); await pg.fill('.mx-in', '42'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
        ok(await pg.evaluate("document.querySelector('.mx-t td[data-i=\"1\"]').classList.contains('ed') && document.querySelector('.mx-t td[data-i=\"1\"]').textContent === '42'"), 'düzenlenen hücre')
        ok('1 değer' in await pg.inner_text('.mx-st'), 'durum satırı')
        await pg.click('.mx-nav button:has-text("▶")'); ok('satır 101–200' in await pg.inner_text('.mx-nav'), 'sonraki sayfa')
        await pg.screenshot(path='/tmp/claude-0/mx_ui.png')
        await pg.click('#mclose')
        # zaman tanılama raporu (anonim)
        n1 = 30000
        rep = await pg.evaluate("""(async () => { const n = 30000, t = Float64Array.from({length: n}, (_, i) => i * 0.01 + (i >= 15000 ? 300 : 0));
          await openFiles([new File([matWrite([{name: 'GIZLI_BIRIM_t', data: t}, {name: 'GIZLI_BIRIM_frame_counter', data: Float64Array.from({length: n}, (_, i) => 1000 + i)}, {name: 'GIZLI_BIRIM_sicaklik', data: new Float64Array(n)}, {name: 'YALNIZ_kanal', data: new Float64Array(777)}])], 'gizli_kayit.mat')]);
          await sleep(200); const f = S.files.find(f => f.name === 'gizli_kayit.mat'), ch = f.channels.find(c => /sicaklik/.test(c.name));
          clearPlot(); await addToNewAxes([ch], false); const tr = S.plot.axes[0].traces[0];
          S.plot.cursors = [{axes: S.plot.axes[0], tr, x: ch.t(100), y: 0, i: 100, name: 'C1'}, {axes: S.plot.axes[0], tr, x: ch.t(15000), y: 0, i: 15000, name: 'C2'}];
          return timeDiagReport(f, {cursors: true}); })()""")
        print(rep[:1600])
        leak = [w for w in ['GIZLI', 'BIRIM', 'sicaklik', 'YALNIZ', 'gizli_kayit'] if w in rep]; ok(not leak, 'raporda ad kalmamalı %s' % leak)
        ok('A1_A2_t' in rep and 'A1_A2_A3' in rep and 'önek t' in rep, 'önek zamanı ilişkisi görünmeli')
        ok('YOK' in rep and 'n=777' in rep, 'zamansız kanal')
        ok('boşluk (>1,5×adım) 1' in rep and '300.01 s' in rep, 'boşluk bilgisi')
        ok('İmleç noktaları (2)' in rep and 'örnek 15001' in rep and 'A1_A2_t(15001) = 450' in rep, 'imleç noktası: bağlı zamanın dosyadaki değeri')
        ok('(aynı)' in rep, 'model ↔ dosya kontrolü')
        ok('A1_A2_frame_counter(15001) = 16000' in rep, 'diğer sayaç vektörü aynı örnekte')
        ok('Fark (son − ilk imleç, MATView): 449' in rep, 'imleç farkı')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz29:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
