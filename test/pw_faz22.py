# v2.35 / v2.41 (sentetik veri): .mat açarken zaman vektörü eşlemesi; telemetri birim .mat dosyalarında zaman
# - telemetri tek .mat (birim başına yapı, "t" ve "<alan>_t"): her kanalın zamanı çözümdekiyle birebir aynı
# - dosyadaki ilgisiz uzun bir değişken (ör. yüksek hızlı akustik) diğer kanalların zamanını bozmaz
# - düzensiz örnekleme ve kayıp çerçeveler kayıttaki zamanla aynı
import asyncio, os, sys, subprocess, tempfile
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
T = tempfile.mkdtemp(prefix='mv_zaman_')
subprocess.run(['python3', '-c', f'''
import numpy as np, scipy.io as sio
r = np.random.default_rng(2)
ta = np.arange(2000) * 0.005; ta = np.delete(ta, [100, 101, 700])                    # 200 Hz, 3 kayıp çerçeve
tb = np.cumsum(r.choice([0.01, 0.02, 0.03], 900)); tb -= tb[0]; tb += 0.5             # düzensiz
sio.savemat("{T}/yapi.mat", {{"A": {{"t": ta, "x": np.sin(ta)}}, "B": {{"t": tb, "y": np.cos(tb), "z": np.arange(5.0)}}, "ses": r.standard_normal(3_000_000)}})
'''], check=True)
CMP = """(async () => { const a = S.files.find(f => f.tlm), b = S.files.find(f => !f.tlm && /tek/.test(f.name)); const key = n => n.replace(/[\\/.]/g, '|'), key2 = n => key(n).replace(/\\[(\\d+)\\]$/, (m, k) => '[' + (+k + 1) + ']');
  const mb = new Map(b.channels.map(c => [key(c.name), c])); let n = 0, bad = [];
  for (const c of a.channels) { const d = mb.get(/\\[/.test(c.name) ? key2(c.name) : key(c.name)); if (!d) continue; await ensureLoaded(c); await ensureLoaded(d); n++;
    if (c.n !== d.n) { bad.push([c.name, 'n', c.n, d.n]); continue; } let mx = 0; for (let i = 0; i < c.n; i++) mx = Math.max(mx, Math.abs(c.t(i) - d.t(i))); if (mx > 1e-6) bad.push([c.name, mx]); }
  return [n, bad.slice(0, 8), b.channels.some(c => /(^|\\.)t$|_t$/.test(c.name))]; })()"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.evaluate("window.showSaveFilePicker = undefined; 0")
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        await f.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000); await pg.wait_for_timeout(500)
        async with pg.expect_download() as dl:
            await pg.evaluate("(async () => { const f = S.files.find(f => f.tlm); const r = await f.tlm.client.request('mat', {sid: f.tlm.ss.id}); const a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = 'tek.mat'; document.body.append(a); a.click(); })()")
        await (await dl.value).save_as(T + '/tek.mat')
        for lazy in (False, True):
            await pg.evaluate("MAT.lazyMin = %s; 0" % ('0' if lazy else '1.5e9'))
            await pg.set_input_files('#fileIn', [T + '/tek.mat']); await pg.wait_for_function("S.files.filter(f => /tek/.test(f.name)).length >= 1", timeout=60000)
            r = await pg.evaluate(CMP); print('tek .mat' + (' (parça parça)' if lazy else ''), r[0], 'kanal', r[1])
            ok(r[0] > 140 and not r[1], 'tek .mat zamanları çözümle aynı olmalı: ' + str(r[1]))
            ok(not r[2], 'zaman vektörleri kanal olarak listelenmemeli')
            await pg.evaluate("closeFile(S.files.find(f => /tek/.test(f.name))); 0")
        await pg.evaluate("MAT.lazyMin = 1.5e9; 0")
        # v2.41: telemetri "Çöz" — tek .mat kapalı, birim başına .mat dosyaları: her dosyada t / <alan>_t; zaman çözümle aynı
        U = T + '/birim'; os.makedirs(U, exist_ok=True)
        subprocess.run(['node', '-e', '''
const TP = require(process.argv[1] + '/test/tlm_core.js')(), fs = require('fs'), D = process.argv[2], O = process.argv[3];
(async () => { const S = (o => o.settings || o)(JSON.parse(fs.readFileSync(D + 'ayarlar.json', 'utf8'))); S.singleMat = false; S.matEnabled = true;
  const bin = new File([fs.readFileSync(D + 'kayit.bin')], 'kayit.bin');
  const sink = new TP.MemSink(); await TP.runJobs({settings: S, files: [bin], sink, folderName: 'x', mode: 'concat'}, () => {});
  for (const [k, v] of Object.entries(sink.out)) if (/\.mat$/.test(k)) fs.writeFileSync(O + '/' + k, v); })();''', ROOT, D, U], check=True)
        mats = sorted(x for x in os.listdir(U) if x.endswith('.mat')); print('birim .mat', mats)
        ok('kayit_tum.mat' not in mats and len(mats) >= 5, 'birim .mat dosyaları')
        await pg.set_input_files('#fileIn', [U + '/' + m for m in mats]); await pg.wait_for_function("S.files.filter(f => !f.tlm).length >= %d" % len(mats), timeout=60000)
        r = await pg.evaluate('''(async () => { const a = S.files.find(f => f.tlm); let n = 0, bad = [], tv = [];
          for (const c of a.channels) { const u = c.name.split('/')[0], f = S.files.find(f => f.name === u + '.mat'); if (!f) continue;
            const d = f.channels.find(x => x.name === c.name.slice(u.length + 1).replace(/\[(\d+)\]$/, (m, k) => '[' + (+k + 1) + ']')); if (!d) continue;
            await ensureLoaded(c); await ensureLoaded(d); n++;
            if (c.tlmCol && c.tlmCol.ownT && d.n > c.n) { const tf = S.files.find(f => f.name === u + '.mat'), tt = tf.vars.find(v => v.name === 't'); if (!tt || tt.count !== d.n || d.tvi == null) bad.push([c.name, 'koşullu: birim zamanı yok']); continue; }   // dosya kipi: çerçeve sayısına doldurulmuş
            if (c.n !== d.n) { bad.push([c.name, 'n', c.n, d.n, d.name, c.tlmCol && c.tlmCol.ownT]); continue; }
            let mx = 0; for (let i = 0; i < c.n; i++) mx = Math.max(mx, Math.abs(c.t(i) - d.t(i))); if (mx > 1e-6) bad.push([c.name, mx]); }
          for (const f of S.files) if (!f.tlm && f.channels.some(c => /(^|\.)t$|_t$/.test(c.name))) tv.push(f.name);
          return [n, bad.slice(0, 8), tv]; })()''')
        print('birim .mat ↔ çözüm', r[0], 'kanal', r[1])
        ok(r[0] > 140 and not r[1], 'birim .mat zamanları çözümle aynı olmalı: ' + str(r[1]))
        ok(not r[2], 'zaman alanları kanal listesinde görünmemeli: ' + str(r[2]))
        await pg.set_input_files('#fileIn', [T + '/yapi.mat']); await pg.wait_for_function("S.files.some(f => f.name === 'yapi.mat')", timeout=60000)
        r = await pg.evaluate("""(async () => { const f = S.files.find(f => f.name === 'yapi.mat'), g = n => f.channels.find(c => c.name === n); const x = g('A.x'), y = g('B.y'), z = g('B.z');
          return [x && [x.n, x.t(0), x.t(99), x.t(100), x.t(x.n - 1)], y && [y.t(0), y.t(1), y.t(y.n - 1)], !!z, f.channels.map(c => c.name)]; })()""")
        print('yapı', r[:3])
        import numpy as np
        rr = np.random.default_rng(2); tb = np.cumsum(rr.choice([0.01, 0.02, 0.03], 900)); tb -= tb[0]; tb += 0.5
        ok(r[0] and r[0][0] == 1997 and abs(r[0][2] - 0.495) < 1e-9 and abs(r[0][3] - 0.51) < 1e-9 and abs(r[0][4] - 9.995) < 1e-9, 'A.x zamanı (kayıp çerçeveler): ' + str(r[0]))
        ok(r[1] and abs(r[1][0] - 0.5) < 1e-9 and abs(r[1][1] - tb[1]) < 1e-9 and abs(r[1][2] - tb[-1]) < 1e-9, 'B.y düzensiz zaman: ' + str(r[1]))
        ok('A.t' not in r[3] and 'B.t' not in r[3] and 'ses' in r[3], 'kanal listesi: ' + str(r[3]))
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz22:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
