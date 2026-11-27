# Seyrek / düzensiz örnekli kanal: yoğun bir patlamadan sonra seyrek örnekler. Tam görünümde (min/max inceltme dalı)
# seyrek örnekler birbirine bağlı çizilmeli; NaN çizgiyi kesmeli; görünüm kenarındaki komşu örneğe bağlanmalı.
# Hem zaman serisi (ts) hem xy izleri denetlenir.
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
JS = r"""async () => {
  const mk = () => {   // 5600-5632 s: 0 (10 Hz), 5632-5638 s: 1 kHz patlama ~31, 5638 s sonrası 7.5 s'de bir örnek
    const t = [], v = [];
    for (let s = 5600; s < 5632; s += 0.1) { t.push(s); v.push(0); }
    for (let s = 5632; s < 5638; s += 0.001) { t.push(s); v.push(31 + 13 * (Math.floor(s * 1000) % 50 === 0)); }
    for (let s = 5645; s <= 5800; s += 7.5) { t.push(s); v.push(s > 5695 && s < 5715 ? 38 : 31); }
    return {t, v};
  };
  const {t, v} = mk(), Tp = 1e-3;
  // zaman vektörlü .mat gibi (g[0] = 0, t0 = ilk zaman); ayrıca telemetri gibi g mutlak çerçeve numarası (g[0] ≠ 0, t0 = 0)
  const c = addDerived('seyrek', Float64Array.from(v), null); c.g = Float64Array.from(t, x => (x - t[0]) / Tp); c.spp = 1; c.Tpkt = Tp; c.t0 = t[0];
  const cA = addDerived('seyrek_mutlak', Float64Array.from(v), null); cA.g = Float64Array.from(t, x => x / Tp); cA.spp = 1; cA.Tpkt = Tp; cA.t0 = 0;
  await addToNewAxes([c]);
  const ax = S.plot.axes[S.plot.axes.length - 1], tr = ax.traces[0];
  // tam görünüm, sabit y ölçeği
  const R = {};
  const probe = (name, axx, pts) => {
    const cv = S.plot.toPNG(1), g = cv.getContext('2d');   // iz pikseli: renkli (doygun) piksel; ızgara gri, arka plan beyaz
    const res = pts.map(([x, y, want]) => {
      const px = Math.round(S.plot.xPx(axx, x)), py = Math.round(S.plot.yPx(axx, y));
      const d = g.getImageData(px - 1, py - 3, 3, 7).data; let hit = false;   // 3×7 piksel pencere
      for (let k = 0; k < d.length; k += 4) { const mx = Math.max(d[k], d[k + 1], d[k + 2]), mn = Math.min(d[k], d[k + 1], d[k + 2]); if (mx - mn > 40) hit = true; }
      return {x, y, want, hit, okk: hit === want};
    });
    R[name] = res;
  };
  ax.xlim = [5590, 5805]; ax.ylim = [-2, 47]; ax.yAuto = false; S.plot.invalidate();
  const W = ax.rect.w, cnt = c.n;
  probe('ts_tam', ax, [[5660, 31, true], [5680, 31, true], [5705, 38, true], [5740, 31, true], [5700, 20, false]]);
  // yakınlaştırılmış (inceltmesiz dal) ile aynı sonuç
  ax.xlim = [5640, 5790]; S.plot.invalidate();
  probe('ts_yakin', ax, [[5660, 31, true], [5705, 38, true], [5740, 31, true]]);
  // kenar: iki seyrek örnek arasına bakan, ama patlamayı da içeren görünüm (inceltme dalı) — sağ kenara bağlanmalı
  ax.xlim = [5630, 5649]; S.plot.invalidate();
  probe('ts_kenar', ax, [[5642, 31, true], [5647, 31, true]]);
  // mutlak çerçeve numaralı zaman (g[0] ≠ 0), görünüm ilk örnekten önce başlıyor
  await addToNewAxes([cA]); const axA = S.plot.axes[S.plot.axes.length - 1];
  axA.xlim = [5590, 5805]; axA.ylim = [-2, 47]; axA.yAuto = false; S.plot.invalidate();
  R.timeIdx = [{x: 0, y: 0, want: true, hit: Math.abs(cA.timeIdx(5590) - c.timeIdx(5590)) < 1e-6 && Math.abs(cA.timeIdx(5700) - c.timeIdx(5700)) < 1e-6, okk: Math.abs(cA.timeIdx(5590) - c.timeIdx(5590)) < 1e-6 && Math.abs(cA.timeIdx(5700) - c.timeIdx(5700)) < 1e-6}];
  probe('ts_mutlak', axA, [[5620, 0, true], [5660, 31, true], [5705, 38, true]]);
  axA.xlim = [5595, 5640]; S.plot.invalidate();
  probe('ts_mutlak_yakin', axA, [[5620, 0, true]]);
  // NaN çizgiyi kesmeli (inceltme dalında)
  const d2 = Float64Array.from(c.data); const iN = d2.length - 5; d2[iN] = NaN;   // 5645+... dizinin sonundan bir örnek
  const tn = c.t(iN), c2 = addDerived('seyrek_nan', d2, null); c2.copyTiming(c);
  await addToNewAxes([c2]); const ax2 = S.plot.axes[S.plot.axes.length - 1];
  ax2.xlim = [5590, 5805]; ax2.ylim = [-2, 47]; ax2.yAuto = false; S.plot.invalidate();
  probe('ts_nan', ax2, [[tn, 31, false], [tn - 3, 31, false], [5780, 31, true]]);
  // xy izi (Figür / plot): aynı veri
  const ax3 = S.plot.addAxes(); ax3.traces.push({kind: 'xy', x: Float64Array.from(t), y: Float64Array.from(v), color: '#0072bd', width: 1, label: 'xy', visible: true});
  ax3.xlim = [5590, 5805]; ax3.ylim = [-2, 47]; ax3.yAuto = false; S.plot.invalidate(); refreshAll();
  ax3.xlim = [5590, 5805]; ax3.ylim = [-2, 47]; ax3.yAuto = false; S.plot.invalidate();
  probe('xy_tam', ax3, [[5660, 31, true], [5705, 38, true], [5740, 31, true]]);
  ax3.xlim = [5630, 5649]; S.plot.invalidate();
  probe('xy_kenar', ax3, [[5642, 31, true], [5647, 31, true]]);
  const yN = Float64Array.from(v); yN[yN.length - 5] = NaN; ax3.traces[0] = {kind: 'xy', x: Float64Array.from(t), y: yN, color: '#0072bd', width: 1, label: 'xy', visible: true};
  ax3.xlim = [5590, 5805]; S.plot.invalidate();
  probe('xy_nan', ax3, [[t[t.length - 5], 31, false], [t[t.length - 5] - 3, 31, false], [5780, 31, true]]);
  return {R, W, cnt};
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        r = await pg.evaluate(JS); bad = []
        print('genişlik', r['W'], 'örnek', r['cnt'])
        for k, v in r['R'].items():
            for q in v:
                if not q['okk']: bad.append((k, q))
            print(k, ['%s@%.1f:%s' % ('✓' if q['okk'] else '✗', q['x'], q['hit']) for q in v])
        await b.close()
        if errs: print('ERR', errs); sys.exit(1)
        if bad: print('HATALI', bad); sys.exit(1)
        print('OK')
asyncio.run(main())
