# Yerel uygulamadaki çıktı klasörü yolu: Windows klasör seçicisi + 127.0.0.1 yerel yazıcı (launcher/fsbridge_windows.go).
# Burada yazıcı aynı uç noktalarla Python'da taklit edilir; "Çöz ve dosyalara yaz" çıktıları klasöre akıtılmalı (sentetik kayıt).
import asyncio, os, subprocess, tempfile, threading, secrets, urllib.parse, shutil
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = '/tmp/_mv_tlm/'
if not os.path.exists(D + 'kayit.bin'): subprocess.run(['node', ROOT + 'test/make_tlm.js', D], check=True)
OUT = tempfile.mkdtemp(prefix='mvout'); TOK = secrets.token_hex(12); hits = []
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        for k, v in [('Access-Control-Allow-Origin', '*'), ('Access-Control-Allow-Methods', 'PUT, POST, OPTIONS'), ('Access-Control-Allow-Headers', '*'), ('Access-Control-Allow-Private-Network', 'true')]: self.send_header(k, v)
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def handle_op(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query); p = os.path.realpath(q.get('p', [''])[0])
        if q.get('t', [''])[0] != TOK or not (p == OUT or p.startswith(OUT + os.sep)): self.send_response(403); self.cors(); self.end_headers(); return
        n = int(self.headers.get('Content-Length') or 0); body = self.rfile.read(n) if n else b''
        if u.path == '/mkdir': os.makedirs(p, exist_ok=True)
        elif u.path == '/write':
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, 'ab' if q.get('a', ['0'])[0] == '1' else 'wb') as f: f.write(body)
        hits.append(u.path); self.send_response(204); self.cors(); self.end_headers()
    do_PUT = handle_op; do_POST = handle_op
srv = ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
fails = []
def ok(c, m):
    if not c: fails.append(m); print('  HATA:', m)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.mvFsInfo = async () => ({port: %d, token: '%s'}); window.__picked = 0; window.mvPickFolder = async s => { window.__picked++; return '%s'; }; window.mvAllowDir = async p => true;" % (srv.server_address[1], TOK, OUT))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.wait_for_timeout(400)
        await pg.evaluate("window.showDirectoryPicker = () => { throw new Error('tarayıcı seçicisi çağrılmamalı'); }; 0")
        await pg.set_input_files('#fileIn', [D + 'ayarlar.json'])
        await pg.wait_for_function("typeof TLM !== 'undefined' && TLM.ready && TLM.win.TPHost.hasTemplates()", timeout=20000)
        f = next(fr for fr in pg.frames if fr != pg.main_frame)
        await f.evaluate("TPUI.getS().singleMat = false; 0")
        await pg.set_input_files('#fileIn', [D + 'kayit.bin'])
        await f.wait_for_function("!document.querySelector('#btnRun').disabled", timeout=30000)
        await f.evaluate("document.querySelector('#btnRun').click()")
        await f.wait_for_function("/tamamlandı/.test(document.querySelector('#result').textContent)", timeout=90000)
        made = [os.path.join(dp, x) for dp, _, fs in os.walk(OUT) for x in fs]
        print('yazılan dosyalar', len(made), sorted(os.path.basename(x) for x in made)[:6], 'istek', len(hits), 'seçici', await pg.evaluate('window.__picked'))
        ok(any(x.endswith('OBC.csv') for x in made), 'OBC.csv yazılmadı'); ok(any(x.endswith('.mp4') for x in made) or not os.path.exists(D + 'kamera_1.h264'), 'MP4 yazılmadı')
        csv = next((x for x in made if x.endswith('OBC.csv')), None)
        if csv: ok(sum(1 for _ in open(csv)) > 1000, 'OBC.csv eksik')
        ok(await pg.evaluate('window.__picked') == 1, 'yerel klasör seçici kullanılmadı')
        ok(await f.evaluate("document.querySelector('#outDirLabel').textContent") == OUT, 'klasör etiketi tam yol değil')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    shutil.rmtree(OUT, ignore_errors=True); srv.shutdown()
    print('yerel çıktı klasörü', 'OK' if not fails else 'HATA (%d)' % len(fails)); raise SystemExit(1 if fails else 0)
asyncio.run(main())
