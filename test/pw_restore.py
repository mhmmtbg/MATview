# Silinen noktaları geri getirme: Silinenleri göster (gri işaret), seçimdeki silinmiş noktalar (delHits), Seçilenleri geri getir,
# Shift+Delete, Görünen aralıktakileri geri getir, Ctrl+Z / Ctrl+Y, silme geçmişinde bölge başına Geri getir / Göster, ham veri koruması.
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SETUP = r"""async () => {
  const n = 20000, v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = Math.sin(i / 400) * 10;
  const c = addDerived('geri', v, null); c.dtS = 1e-3; c.Tpkt = 1e-3; c.spp = 1; c.t0 = 0; c.g = null;
  await addToNewAxes([c]); const ax = S.plot.axes[S.plot.axes.length - 1];
  ax.xlim = [0, 20]; ax.ylim = [-12, 12]; ax.yAuto = false; S.plot.invalidate();
  window._c = c; window._ax = ax;
  // üç bölge sil: [2,3) s, [8,9) s, [14,15) s
  for (const [a, b] of [[2, 3], [8, 9], [14, 15]]) { S.plot.makeSelection({axes: ax, type: 'box', x0: a, x1: b - 1e-6, y0: -20, y1: 20}); deleteSelection(); }
  return c.delCount;
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        bad = []
        def chk(c, m):
            print(('✓ ' if c else '✗ ') + m)
            if not c: bad.append(m)
        n0 = await pg.evaluate(SETUP); chk(n0 == 3000, 'üç bölge silindi (%d)' % n0)
        # silinmiş noktalar normal seçime girmez, delHits'e girer
        r = await pg.evaluate("""() => { S.plot.makeSelection({axes: _ax, type: 'box', x0: 1.5, x1: 3.5, y0: -20, y1: 20});
          const s = S.plot.sel; return [s.hits.reduce((a, h) => a + h.idx.length, 0), s.delHits.reduce((a, h) => a + h.idx.length, 0), $('#selInfo') ? $('#selInfo').textContent : ''] }""")
        chk(abs(r[0] - 1000) <= 2 and r[1] == 1000, 'seçim: 1000 normal + 1000 silinmiş (%s)' % r[:2])
        # silinenleri göster: gri pikseller [2,3) s bölgesinde
        await pg.evaluate("S.plot.clearSelection()")
        def ghost_js(on):
            return """() => { toggleShowDel(%s); const cv = S.plot.toPNG(1), g = cv.getContext('2d'), T = S.plot.theme ? S.plot.theme() : null;
              let n = 0; for (let t = 2.05; t < 2.95; t += 0.05) { const x = Math.round(S.plot.xPx(_ax, t)), y = Math.round(S.plot.yPx(_ax, Math.sin(t * 1000 / 400) * 10));
                const d = g.getImageData(x - 1, y - 1, 3, 3).data; for (let k = 0; k < d.length; k += 4) { const mx = Math.max(d[k], d[k+1], d[k+2]), mn = Math.min(d[k], d[k+1], d[k+2]); if (mx - mn < 25 && mx < 215 && mx > 60) { n++; break; } } }
              return n; }""" % ('true' if on else 'false')
        on = await pg.evaluate(ghost_js(True)); off = await pg.evaluate(ghost_js(False))
        chk(on >= 15 and off <= 2, 'Silinenleri göster: gri işaretler (açık %d, kapalı %d)' % (on, off))
        await pg.evaluate("toggleShowDel(true)")
        # seçerek geri getir: [2,3) bölgesinin yarısı
        r = await pg.evaluate("""() => { S.plot.makeSelection({axes: _ax, type: 'box', x0: 2.0, x1: 2.4999, y0: -20, y1: 20}); restoreSelection(); return [_c.delCount, _c.del[2100], _c.del[2700], S.undo.length] }""")
        chk(r[0] == 2500 and r[1] == 0 and r[2] == 1, 'Seçilenleri geri getir: 500 nokta (%s)' % r)
        r = await pg.evaluate("() => { undo(); const a = _c.delCount; redo(); return [a, _c.delCount] }")
        chk(r == [3000, 2500], 'Ctrl+Z yeniden siler, Ctrl+Y yeniden getirir (%s)' % r)
        # Shift+Delete
        await pg.evaluate("S.plot.makeSelection({axes: _ax, type: 'box', x0: 2.5, x1: 2.9999, y0: -20, y1: 20})")
        await pg.evaluate("document.body.focus()")
        await pg.keyboard.press('Shift+Delete'); await pg.wait_for_timeout(100)
        r = await pg.evaluate("_c.delCount"); chk(r == 2000, 'Shift+Delete seçimdekileri geri getirir (%d)' % r)
        # görünen aralık: yalnız [7.5, 8.5] → [8, 8.5) bölgesi
        r = await pg.evaluate("() => { S.plot.axes.forEach(a => a.xlim = [7.5, 8.4999]); S.plot.invalidate(); restoreVisible(); return [_c.delCount, _c.del[8200], _c.del[8700], _c.del[14500]] }")
        chk(r == [1500, 0, 1, 1], 'Görünen aralıktakileri geri getir (%s)' % r)
        # silme geçmişi: 2. bölge (14-15 s) Göster + Geri getir
        r = await pg.evaluate("""() => { delHistoryDialog(); const rows = [...document.querySelectorAll('#modal tbody tr')];
          const btns = rows[1].querySelectorAll('button'); btns[1].click(); const after = _c.delCount;
          delHistoryDialog(); document.querySelectorAll('#modal tbody tr')[0].querySelectorAll('button')[0].click();
          return [rows.length, after, _ax.xlim[0] < 8.5 && _ax.xlim[1] > 8.99, S.plot.showDel] }""")
        chk(r[0] == 2 and r[1] == 500 and r[2] and r[3], 'Silme geçmişi: bölge Geri getir ve Göster (%s)' % r)
        # ham veri görünümünde geri getirme kapalı
        r = await pg.evaluate("() => { rawView(true); restoreVisible(); const a = _c._delStash ? _c._delStash.reduce((x, y) => x + y, 0) : -1; rawView(false); return [a, _c.delCount] }")
        chk(r == [500, 500], 'Ham veri görünümünde değişiklik yok (%s)' % r)
        # kalan: tüm kanal
        r = await pg.evaluate("() => { restoreChannel(_c); const a = _c.delCount; undo(); return [a, _c.delCount] }")
        chk(r == [0, 500], 'Tüm silmeleri geri al + Ctrl+Z (%s)' % r)
        await b.close()
        if errs: print('ERR', errs); sys.exit(1)
        if bad: print('HATALI', bad); sys.exit(1)
        print('OK')
asyncio.run(main())
