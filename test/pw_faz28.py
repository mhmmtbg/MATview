# v2.46 (sentetik veri): .mat açarken her kanal dosyadaki zamanla
# - düz değişkenler (MAT v5 yapı sınırını aşan birim: <birim>_t + <birim>_<alan>, matris sütunları dahil), farklı hızlı iki birim
# - alan uzunluğu zamanın tam katı değil (son çerçeve yarım: 2·n − 1)
# - kayan örnekleme (adım 5 → 7 ms, boşluk yok), yinelenen zaman damgaları, 300 sn kayıt boşluğu
# - zaman bulunamayınca uyarı
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
JS = r"""async () => {
  const out = {}, mk = async (nm, vars) => { const blob = matWrite(vars); await openFiles([new File([blob], nm)]); await sleep(200); return S.files[S.files.length - 1]; };
  const err = (c, T, k = 1) => { let mx = 0; for (let i = 0; i < c.n; i++) { const e = Math.abs(c.t(i) - T(i)); if (e > mx) mx = e; } return mx; };
  // A) düz: iki birim, biri 100 Hz ve 300 sn boşluklu, diğeri 200 Hz; matris alan
  { const n1 = 60000, t1 = new Float64Array(n1); for (let i = 0; i < n1; i++) t1[i] = 12.5 + i * 0.01 + (i >= 30000 ? 300 : 0);
    const n2 = 120000, t2 = new Float64Array(n2); for (let i = 0; i < n2; i++) t2[i] = 3 + i * 0.005;
    const a = new Float64Array(n1 * 2); for (let i = 0; i < n1 * 2; i++) a[i] = i % 7;
    const b = new Float64Array(n2); for (let i = 0; i < n2; i++) b[i] = Math.sin(i / 50);
    const f = await mk('duz.mat', [{name: 'BRM_A_t', data: t1}, {name: 'BRM_A_frame_counter', data: Float64Array.from(t1, (_, i) => i)}, {name: 'BRM_A_komut', data: a, rows: n1, cols: 2},
      {name: 'BRM_B_t', data: t2}, {name: 'BRM_B_hiz', data: b}]);
    const c1 = f.channels.find(c => c.name === 'BRM_A_komut[1]'), c2 = f.channels.find(c => c.name === 'BRM_B_hiz');
    out.A = {names: f.channels.map(c => c.name), e1: c1 && err(c1, i => t1[i]), e2: c2 && err(c2, i => t2[i]), noTime: f.noTime,
      gap: c1 && c1.t(30000) - c1.t(29999)}; closeFile(f); }
  // B) son çerçeve yarım: alan 2·n − 1 örnek, çerçeve başına 2
  { const n = 5000, t = Float64Array.from({length: n}, (_, i) => i * 0.02), x = new Float64Array(2 * n - 1);
    const f = await mk('yarim.mat', [{name: 't', data: t}, {name: 'hizli', data: x}, {name: 'bir_eksik', data: new Float64Array(n - 1)}]);
    const c = f.channels.find(c => c.name === 'hizli'), d = f.channels.find(c => c.name === 'bir_eksik');
    out.B = {e: c && err(c, i => i * 0.01), e2: d && err(d, i => i * 0.02), noTime: f.noTime}; closeFile(f); }
  // C) kayan örnekleme, D) yinelenen zaman damgaları
  { const n = 100000, t = new Float64Array(n); let acc = 0; for (let i = 0; i < n; i++) { t[i] = acc; acc += 0.005 + 0.002 * i / n; }
    const u = new Float64Array(n); for (let i = 0; i < n; i++) u[i] = Math.floor(i / 2) * 0.01;
    const f1 = await mk('kayan.mat', [{name: 'zaman', data: t}, {name: 'x', data: new Float64Array(n)}]); const c = f1.channels.find(c => c.name === 'x');
    out.C = {e: err(c, i => t[i]), end: c.t(n - 1), want: t[n - 1]}; closeFile(f1);
    const f2 = await mk('yineleme.mat', [{name: 't', data: u}, {name: 'y', data: new Float64Array(n)}]); const d = f2.channels.find(c => c.name === 'y');
    out.D = {e: err(d, i => u[i]), noTime: f2.noTime}; closeFile(f2); }
  // E) zaman yok → uyarı
  { const f = await mk('zamansiz.mat', [{name: 'p', data: new Float64Array(1000)}]); out.E = {noTime: f.noTime, toast: S.timeWarn || ''}; closeFile(f); }
  return out; }"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        r = await pg.evaluate(JS)
        for k, v in r.items(): print(k, v)
        A = r['A']; ok(A['e1'] is not None and A['e1'] < 1e-6 and A['e2'] < 1e-6, 'düz değişken zamanı %s' % A)
        ok(abs(A['gap'] - 300.01) < 1e-6, '300 sn boşluk korunmalı'); ok(A['noTime'] == 0, 'düz: zamansız kanal kalmamalı')
        ok('BRM_A_t' not in A['names'] and 'BRM_B_t' not in A['names'], 'birim zamanları kanal olarak listelenmemeli')
        ok(r['B']['e'] is not None and r['B']['e'] < 1e-9 and r['B']['e2'] < 1e-9, 'yarım çerçeve %s' % r['B'])
        ok(r['C']['e'] < 1e-9, 'kayan örnekleme: %s' % r['C']); ok(r['D']['e'] < 1e-9, 'yinelenen zaman: %s' % r['D'])
        ok(r['E']['noTime'] == 1 and 'zaman vektörü yok' in r['E']['toast'], 'zamansız uyarısı %s' % r['E'])
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz28:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
