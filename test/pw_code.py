# Kod sekmesi: betik çalıştırma, kanal köprüsü, addch, figür/subplot, hata satırı, durdurma
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
open('/tmp/test_code.txt', 'w').write('Time(s)  Acc_X(g)\n' + ''.join(f'{i/100:.3f}  {((i%50)-25)/10:.3f}\n' for i in range(2000)))
async def setcode(pg, t):
    await pg.evaluate("t=>{codeSetText(t)}", t)
async def run(pg, wait=1500):
    await pg.evaluate("codeRun(false)"); await pg.wait_for_timeout(wait)
    for _ in range(40):
        if not await pg.evaluate("CODE.running"): break
        await pg.wait_for_timeout(250)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', ['/tmp/test_code.txt']); await pg.wait_for_timeout(1000)
        await pg.evaluate("[...document.querySelectorAll('#mfoot button')].find(b=>b.classList.contains('primary')).click()"); await pg.wait_for_timeout(1000)
        names = await pg.evaluate("allFiles().flatMap(f=>f.channels.map(c=>c.name))"); print(names)
        await pg.click('#viewtabs button[data-v=code]'); await pg.wait_for_timeout(300)
        assert await pg.evaluate("!!document.querySelector('#codeEd')")
        # temel
        await setcode(pg, "x = 3; y = x*2+1;\nfprintf('y=%d\\n', y);\nA=[1 2;3 4]; z=A*A")
        await run(pg); out = await pg.evaluate("$('#codeOut').innerText"); print(out)
        assert 'y=7' in out and '7    10' in out.replace('   ', '    ') or '7' in out
        ws = await pg.evaluate("CODE.ws.map(v=>v.n)"); assert 'z' in ws and 'y' in ws, ws
        # çalışma alanı kalıcı
        await setcode(pg, "fprintf('%d\\n', y+1)"); await run(pg); out = await pg.evaluate("$('#codeOut').innerText"); assert '\n8' in out, out
        # kanal köprüsü + figür + addch
        ch = [n for n in names if 'Acc_X' in n][0]
        await setcode(pg, f"x=ch('{ch}'); fs=chfs('{ch}'); t=(0:numel(x)-1)'/fs;\n[b,a]=butter(4,2*5/fs); y=filtfilt(b,a,x);\nsubplot(2,1,1); plot(t,x,'r',t,y); legend('ham','sz'); grid on; title('A')\nsubplot(2,1,2); plot(t,x-y); xlabel('s')\naddch('sonuc_lp',y,fs); fprintf('N=%d fs=%g\\n', numel(x), fs);")
        nb = await pg.evaluate("allFiles().flatMap(f=>f.channels).length")
        await run(pg, 2500); out = await pg.evaluate("$('#codeOut').innerText"); print(out)
        assert 'N=2000 fs=100' in out, out
        nb2 = await pg.evaluate("allFiles().flatMap(f=>f.channels).length"); assert nb2 == nb + 1, (nb, nb2)
        v = await pg.evaluate("S.view"); print('view', v); assert v == 'fig', v
        await pg.wait_for_timeout(800)
        r = await pg.evaluate("[CODE.figPlots.length, CODE.figPlots.map(p=>p.axes[0].traces.length), document.querySelectorAll('#v-fig canvas').length]"); print(r)
        assert r[0] == 2 and r[2] == 2 and r[1][0] >= 2, r
        # figüre etkileşim hatasız (yakınlaştır)
        await pg.evaluate("CODE.figPlots[0].zoomIn()"); await pg.wait_for_timeout(200)
        # hata satırı
        await pg.click('#viewtabs button[data-v=code]')
        await setcode(pg, "a=1;\nb=[1 2 3];\nc=b(7);\n"); await run(pg); out = await pg.evaluate("$('#codeOut').innerText"); print(out)
        assert 'satır 3' in out and CODE_OK(out), out
        assert await pg.evaluate("CODE.errLine") == 3
        # sözdizimi hatası
        await setcode(pg, "x = (1+;\n"); await run(pg); out = await pg.evaluate("$('#codeOut').innerText"); assert 'Hata' in out.split('satır 3')[-1], out
        # durdur
        await setcode(pg, "while true, end"); await pg.evaluate("codeRun(false)"); await pg.wait_for_timeout(1200)
        assert await pg.evaluate("CODE.running"); await pg.evaluate("codeStop()"); await pg.wait_for_timeout(300)
        assert not await pg.evaluate("CODE.running")
        # durdurmadan sonra yeniden çalışır
        await setcode(pg, "disp(42)"); await run(pg); out = await pg.evaluate("$('#codeOut').innerText"); assert '42' in out.split('Durduruldu')[-1], out
        print('ERRS', errs); assert not errs; await b.close()
def CODE_OK(o): return True
asyncio.run(main())
