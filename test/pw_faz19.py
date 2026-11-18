# v2.31 (sentetik veri): uzun işlerde İptal ve akustikte temizleme sonucunun yeniden kullanılması
# - İptal düğmesi her uzun işte görünür (kısa işlerde görünmez), Esc de iptal eder
# - ilerleme bildiren iş hemen durur; durmayan iş en geç ~1,5 sn sonra bırakılır; DSP işçisi sonlandırılır ve yeniden açılır
# - iç içe busy tek pencere
# - tek .mat (yerel yazıcı): iptal edilince yarım dosya silinir
# - akustik: otomatik temizlemeden sonra "▶ Temizlenmiş" yeniden temizlemez; …_temiz izi seçiliyken de temizlenmez
import asyncio, os, sys, subprocess, re, tempfile, time, signal, atexit
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
OUT = tempfile.mkdtemp(prefix='mv_iptal_')
srv = subprocess.Popen(['go', 'test', '-run', 'TestFsServe', '-v', '-timeout', '20m', '.'], cwd=ROOT + 'launcher', env=dict(os.environ, MATVIEW_FS_SERVE=OUT, GOFLAGS='-mod=vendor'),
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, start_new_session=True)
atexit.register(lambda: os.killpg(srv.pid, signal.SIGKILL))
port = token = None
for line in srv.stdout:
    m = re.match(r'FS (\d+) (\w+)', line)
    if m: port, token = int(m.group(1)), m.group(2); break
SYN = r"""async()=>{let seed=5;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296,g=()=>Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
 const fs=16000,n=fs*8,x=new Float64Array(n); for(let i=0;i<n;i++){const t=i/fs;x[i]=0.2*Math.sin(2*Math.PI*440*t)*(t>2&&t<5?1:0)+0.05*Math.sin(2*Math.PI*50*t)+0.01*g();}
 const c=addDerived('ses_pa',x,null,0,true); c.kind='ac'; c.unit='Pa'; c.dtS=1/fs; await addDerivedToPlot(c); S.plot.fitAll(); 0}"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(300)
        await pg.evaluate("""([port, token, out]) => { window.mvFsInfo = async () => ({port, token}); window.mvPickFolder = async () => '';
          window.mvSaveFile = async (name) => out + '/' + name; 0 }""", [port, token, OUT])
        vis = "getComputedStyle(document.querySelector('#busycancel')).display !== 'none' && !document.querySelector('#busy').classList.contains('hidden')"
        # 1) kısa iş: iptal düğmesi görünmez
        await pg.evaluate("window.__r = 'bekliyor'; busy('kısa', async () => { await sleep(200); return 1; }).then(r => window.__r = r); 0")
        await pg.wait_for_timeout(120); ok(not await pg.evaluate(vis), 'kısa işte iptal görünmemeli')
        await pg.wait_for_function("window.__r === 1")
        # 2) ilerleme bildiren uzun iş: düğme görünür, tık → hemen durur, iptal bildirimi
        await pg.evaluate("window.__n = 0; window.__r = 'bekliyor'; busy('uzun', async prog => { for (let i = 0; ; i++) { await sleep(40); window.__n = i; prog(i / 1000); } }).then(r => window.__r = r === undefined ? 'bitti' : r); 0")
        await pg.wait_for_timeout(700); ok(await pg.evaluate(vis), 'uzun işte iptal görünmeli')
        t0 = time.time(); await pg.click('#busyCancelBtn'); await pg.wait_for_function("window.__r === 'bitti'", timeout=5000); dt = time.time() - t0
        n1 = await pg.evaluate("window.__n"); await pg.wait_for_timeout(300); n2 = await pg.evaluate("window.__n")
        ok(dt < 0.6 and n1 == n2, 'ilerlemeli iş hemen durmalı (%.2f sn, %d→%d)' % (dt, n1, n2))
        ok(await pg.evaluate("document.querySelector('#busy').classList.contains('hidden')"), 'pencere kapanmalı')
        ok('iptal' in await pg.evaluate("document.querySelector('#toast').textContent"), 'iptal bildirimi')
        # 3) ilerleme bildirmeyen iş: Esc ile, en geç ~1,5 sn sonra bırakılır
        await pg.evaluate("window.__r = 'bekliyor'; busy('takılan', () => new Promise(() => {})).then(r => window.__r = 'bitti'); 0")
        await pg.wait_for_timeout(700); t0 = time.time(); await pg.keyboard.press('Escape')
        await pg.wait_for_function("window.__r === 'bitti'", timeout=5000); dt = time.time() - t0
        ok(dt < 2.2, 'takılan iş bırakılmalı (%.2f sn)' % dt)
        # 4) DSP işçisi: uzun hesap iptal edilir, sonra işçi yeniden çalışır
        await pg.evaluate("""window.__r = 'bekliyor'; busy('dsp', async () => { const x = new Float64Array(16000 * 600); for (let i = 0; i < x.length; i++) x[i] = Math.sin(i * 0.01) + (i % 7) * 1e-3;
          await DSPW.run('omlsa', [x, 16000, {gminDb: -15}]); window.__r = 'tamamlandı'; }).then(() => { if (window.__r === 'bekliyor') window.__r = 'bitti'; }); 0""")
        await pg.wait_for_timeout(1200); t0 = time.time(); await pg.click('#busyCancelBtn')
        await pg.wait_for_function("window.__r !== 'bekliyor'", timeout=5000); dt = time.time() - t0
        ok(await pg.evaluate("window.__r") == 'bitti' and dt < 0.8, 'DSP işi hemen durmalı: %s %.2f sn' % (await pg.evaluate("window.__r"), dt))
        r = await pg.evaluate("DSPW.run('stats', [new Float64Array([1, 2, 3])]).then(s => !!s)"); ok(r, 'işçi yeniden çalışmalı')
        # 5) iç içe busy: tek pencere, iç bitince pencere açık kalır
        st = await pg.evaluate("""(async () => { const seen = []; await busy('dış', async () => { await busy('iç', async () => { await sleep(50); seen.push(document.querySelector('#busytxt').textContent); });
          seen.push(document.querySelector('#busy').classList.contains('hidden')); }); return seen; })()""")
        ok(st == ['iç', False], 'iç içe busy: ' + str(st))
        # 6) tek .mat (yerel yazıcı) iptali: yarım dosya kalmaz
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        await f.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000); await pg.wait_for_timeout(500)
        r = await pg.evaluate("""(async () => { const f = S.files.find(f => f.tlm), M = TLM.win.TPMat; const d = await M.dest('iptal.mat'); let cx = null;
          const pr = M.save(f.tlm.client, f.tlm.ss.id, d, null, fn => { cx = fn; }); cx(); try { await pr; return 'tamamlandı'; } catch (e) { return e.message; } })()""")
        await pg.wait_for_timeout(500)
        print('tek .mat iptal:', r, os.listdir(OUT))
        ok('iptal' in r and not os.path.exists(OUT + '/iptal.mat'), 'iptal edilen tek .mat silinmeli')
        r = await pg.evaluate("(async () => { const f = S.files.find(f => f.tlm), M = TLM.win.TPMat; const d = await M.dest('tam.mat'); const r = await M.save(f.tlm.client, f.tlm.ss.id, d); return r.bytes; })()")
        ok(os.path.exists(OUT + '/tam.mat') and os.path.getsize(OUT + '/tam.mat') == r, 'iptalden sonra yazım çalışmalı')
        # 7) akustik: otomatik temizlemeden sonra temiz oynatma yeniden temizlemez
        await pg.evaluate("clearPlot(); 0"); await pg.evaluate(SYN)
        await pg.click('#rtabs [data-t=acoustic]'); await pg.evaluate("()=>{document.querySelectorAll('#right .card.collapsed').forEach(c=>c.classList.remove('collapsed'));0}"); await pg.select_option('#acScope', 'all')
        await pg.click('button:has-text("Otomatik temizle (tespit + uygula)")')
        await pg.wait_for_function("S.derived && S.derived.channels.some(c => /_temiz$/.test(c.name)) && document.querySelector('#busy').classList.contains('hidden')", timeout=60000)
        await pg.evaluate("switchView('time'); 0")
        await pg.evaluate("window.__txt = []; new MutationObserver(() => window.__txt.push(document.querySelector('#busytxt').textContent)).observe(document.querySelector('#busytxt'), {childList: true, characterData: true, subtree: true}); 0")
        await pg.click('button:has-text("▶ Temizlenmiş")'); await pg.wait_for_timeout(1500)
        lg = await pg.evaluate("document.querySelector('#acLog').textContent"); tx = await pg.evaluate("window.__txt")
        print('oynatma:', tx, lg[-80:])
        ok('önceki temizleme sonucu' in lg and 'Temizleniyor…' not in tx, 'temiz oynatma yeniden temizlememeli')
        await pg.evaluate("acStop(); 0")
        # …_temiz izi seçiliyken
        await pg.evaluate("(() => { const ax = activeAxes(); ax.active = ax.traces.findIndex(t => /_temiz$/.test(t.ch.name)); 0 })()")
        await pg.click('button:has-text("▶ Temizlenmiş")'); await pg.wait_for_timeout(1500)
        lg = await pg.evaluate("document.querySelector('#acLog').textContent")
        ok('zaten temizlenmiş' in lg, 'temiz kanal yeniden temizlenmemeli: ' + lg[-80:])
        await pg.evaluate("acStop(); 0")
        # ayar değişince önbellek kullanılmaz
        await pg.evaluate("(() => { const ax = activeAxes(); ax.active = ax.traces.findIndex(t => t.ch.name === 'ses_pa'); document.querySelector('#acDnDb').value = 7; 0 })()")
        await pg.evaluate("window.__txt = []; 0"); await pg.click('button:has-text("▶ Temizlenmiş")'); await pg.wait_for_timeout(2500)
        ok('Temizleniyor…' in await pg.evaluate("window.__txt"), 'ayar değişince yeniden temizlenmeli')
        await pg.evaluate("acStop(); 0")
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('faz19:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
