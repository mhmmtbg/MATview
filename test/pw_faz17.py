# v2.29 (sentetik veri): büyük tek .mat'in doğrudan hedefe akıtılması
# - MATView.exe yolu: "Farklı kaydet" (taklit) + Go yerel yazıcı (launcher, TestFsServe) → dosya, Blob yolu ile bayt bayt aynı
# - tarayıcı yolu: dosya tutamacı işçiye verilir (OPFS tutamacı kaydetme penceresinin yerine), içerik aynı
# - ilerleme bildirimi, iptal (pencere kapatılırsa hiçbir şey yazılmaz), saveBlob'un yerel yazıcıyla parça parça yazması
# - geçici depo kotası dolarsa veri sıfır okunmaz (Blob'a taşma)
import asyncio, os, sys, subprocess, re, tempfile, hashlib
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
OUT = tempfile.mkdtemp(prefix='mv_mat_')
env = dict(os.environ, MATVIEW_FS_SERVE=OUT, GOFLAGS='-mod=vendor')
srv = subprocess.Popen(['go', 'test', '-run', 'TestFsServe', '-v', '-timeout', '20m', '.'], cwd=ROOT + 'launcher', env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, start_new_session=True)
import atexit, signal; atexit.register(lambda: os.killpg(srv.pid, signal.SIGKILL))
port = token = None
for line in srv.stdout:
    m = re.match(r'FS (\d+) (\w+)', line)
    if m: port, token = int(m.group(1)), m.group(2); break
assert port, 'yerel yazıcı başlamadı'

async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        prof = tempfile.mkdtemp(prefix='mv_prof_')   # kalıcı profil: OPFS kotası gerçek kullanımdaki gibi
        b = await p.chromium.launch_persistent_context(prof, args=['--allow-file-access-from-files'], viewport={'width': 1500, 'height': 900}); pg = await b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        # MATView.exe taklidi: kaydetme penceresi yolu döndürür, yazma Go yazıcısına gider
        await pg.evaluate("""([port, token, out]) => { window.__save = []; window.mvFsInfo = async () => ({port, token}); window.mvPickFolder = async () => '';
          window.mvSaveFile = async (name, start) => { window.__save.push([name, start]); return window.__cancel ? '' : out + '/' + name; }; 0 }""", [port, token, OUT])
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("document.querySelector('#fileBody .frg-in') !== null", timeout=30000)
        await f.evaluate("document.querySelector('#btnRunMv').click()")
        await pg.wait_for_function("S.files.some(f => f.tlm)", timeout=60000); await pg.wait_for_timeout(500)
        # karşılaştırma için eski yol (bellekte Blob): başlıktaki tarih hariç özet
        ref = await pg.evaluate("""(async () => { const f = S.files.find(f => f.tlm); const r = await f.tlm.client.request('mat', {sid: f.tlm.ss.id});
          const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await r.blob.slice(128).arrayBuffer())); return [r.blob.size, Array.from(h).map(x => x.toString(16).padStart(2, '0')).join('')]; })()""")
        print('Blob yolu:', ref[0], 'bayt')
        # iptal: hiçbir şey yazılmaz
        await pg.evaluate("window.__cancel = true; tlmSaveSingleMat(S.files.find(f => f.tlm))"); await pg.wait_for_timeout(500)
        ok(not os.listdir(OUT), 'iptalde dosya yazıldı')
        await pg.evaluate("window.__cancel = false; window.__prog = []; tlmSaveSingleMat(S.files.find(f => f.tlm))")
        await pg.wait_for_function("document.querySelector('#busy').classList.contains('hidden') && window.__save.length === 2", timeout=60000)
        await pg.wait_for_timeout(300)
        nm = (await pg.evaluate("window.__save"))[1][0]; print('kaydetme penceresi:', await pg.evaluate("window.__save"))
        ok(nm.endswith('_tum.mat'), 'önerilen ad ' + nm)
        fp = os.path.join(OUT, nm); data = open(fp, 'rb').read() if os.path.exists(fp) else b''
        ok(len(data) == ref[0] and hashlib.sha256(data[128:]).hexdigest() == ref[1], 'yerel yazıcıyla yazılan .mat Blob yolundan farklı (%d bayt)' % len(data))
        ok(data[:10] == b'MATLAB 5.0', '.mat başlığı')
        ok('kaydedildi' in (await pg.evaluate("document.querySelector('#toast').textContent")), 'kaydedildi bildirimi')
        # ilerleme: işçi yazdıkça yüzde bildirir
        pr = await pg.evaluate("""(async () => { const f = S.files.find(f => f.tlm), M = TLM.win.TPMat, pr = [];
          const d = await M.dest('ilerleme.mat'); const r = await M.save(f.tlm.client, f.tlm.ss.id, d, x => pr.push(x)); return [r.bytes, pr.length, d.label]; })()""")
        print('ilerleme:', pr); ok(pr[0] == ref[0] and pr[2].endswith('ilerleme.mat'), 'ikinci yazım')
        # sonraki pencere son klasörde açılır
        ok((await pg.evaluate("window.__save"))[-1][1] == OUT, 'son klasör hatırlanmadı')
        # tarayıcı yolu: dosya tutamacı işçiye verilir (OPFS tutamacı kaydetme penceresinin yerine)
        br = await pg.evaluate("""(async () => { const root = await navigator.storage.getDirectory(), fh = await root.getFileHandle('t.mat', {create: true});
          const it = TLM.win.TPMat; const host = S.files.find(f => f.tlm); const r = await it.save(host.tlm.client, host.tlm.ss.id, {fh, name: 't.mat', label: 't.mat'});
          const file = await fh.getFile(), h = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.slice(128).arrayBuffer()));
          return [file.size, Array.from(h).map(x => x.toString(16).padStart(2, '0')).join(''), r.bytes]; })()""")
        ok(br[0] == ref[0] and br[1] == ref[1], 'dosya tutamacıyla yazılan .mat farklı')
        # saveBlob: yerel yazıcıya 16 MB'lık parçalarla (son parça kısa)
        await pg.evaluate("(async () => { const u = new Uint8Array((16 << 20) + 12345); for (let i = 0; i < u.length; i++) u[i] = (i * 7) & 255; await saveBlob(new Blob([u]), 'parca.bin'); })()")
        pb = os.path.join(OUT, 'parca.bin'); d2 = open(pb, 'rb').read() if os.path.exists(pb) else b''
        ok(len(d2) == (16 << 20) + 12345 and all(d2[i] == (i * 7) & 255 for i in (0, 1, 16 << 20, len(d2) - 1)), 'saveBlob yerel yazımı')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    srv.kill()
    print('faz17:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
