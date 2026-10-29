# Arayüz: uitable hücre seçimi (CellSelectionCallback, eventdata.Indices; tık / Ctrl / Shift) + uigetfile klasör listesi
import asyncio, os, shutil
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'; T = '/tmp/_mv_tsel'
shutil.rmtree(T, ignore_errors=True); os.makedirs(T); open(T + '/veri1.bin', 'wb').write(bytes(range(16))); open(T + '/not.txt', 'w').write('x')
CODE = r"""function tsel()
f = figure('Name', 'Secim');
t = uitable('Parent', f, 'Units', 'normalized', 'Position', [0.05 0.3 0.5 0.6], 'Data', {'alfa', 1; 'beta', 2; 'gama', 3; 'delta', 4}, 'Tag', 'tbl', 'CellSelectionCallback', @secildi);
uicontrol('Parent', f, 'Style', 'text', 'Units', 'normalized', 'Position', [0.6 0.8 0.35 0.1], 'String', '-', 'Tag', 'sonuc');
uicontrol('Parent', f, 'Style', 'pushbutton', 'Units', 'normalized', 'Position', [0.6 0.6 0.3 0.1], 'String', 'Dosya', 'Tag', 'dsy', 'Callback', @dosyaSec);
end
function secildi(h, e)
ix = e.Indices; d = get(h, 'Data');
s = findobj(gcbf, 'Tag', 'sonuc');
if isempty(ix), set(s, 'String', 'bos'); return; end
ad = d(ix(:,1), 1);
set(s, 'String', sprintf('%d:%s', size(ix,1), strjoin(ad', ',')));
end
function dosyaSec(h, e)
[f, p] = uigetfile('C:\uzak\yol\*.bin');
fid = fopen(fullfile(p, f)); b = fread(fid, inf, 'uint8'); fclose(fid);
set(findobj(gcbf, 'Tag', 'sonuc'), 'String', sprintf('%s=%d', f, sum(b)));
end
"""
async def idle(pg):
    await pg.wait_for_timeout(300)
    for _ in range(80):
        if not await pg.evaluate("CODE.running || CODE.gui.queue.length > 0"): break
        await pg.wait_for_timeout(150)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--allow-file-access-from-files', '--enable-features=SharedArrayBuffer']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html') + '#cwd=' + T); await pg.wait_for_timeout(1000)
        await pg.click('#viewtabs button[data-v=code]'); await pg.evaluate("c => { codeNewDoc('tsel.m', c); }", CODE)
        await pg.evaluate("codeRun('all')"); await idle(pg)
        assert await pg.evaluate("S.view") == 'gui', await pg.evaluate("$('#codeOut').innerText")
        cells = pg.locator('#v-gui [data-tag=tbl] td[data-r]'); assert await cells.count() == 8
        sonuc = lambda: pg.evaluate("document.querySelector('#v-gui [data-tag=sonuc]').textContent")
        await pg.locator('#v-gui [data-tag=tbl] td[data-r="2"][data-c="1"]').click(); await idle(pg); assert await sonuc() == '1:beta', await sonuc()
        await pg.locator('#v-gui [data-tag=tbl] td[data-r="4"][data-c="1"]').click(modifiers=['Control']); await idle(pg); assert await sonuc() == '2:beta,delta', await sonuc()
        await pg.locator('#v-gui [data-tag=tbl] td[data-r="3"][data-c="1"]').click(modifiers=['Shift']); await idle(pg); assert await sonuc() == '2:delta,gama' or await sonuc() == '2:gama,delta', await sonuc()
        assert await pg.evaluate("document.querySelectorAll('#v-gui [data-tag=tbl] td.gsel').length") == 2
        # uigetfile: filtredeki dizin yok sayılır, çalışma klasöründeki .bin listelenir
        await pg.click('#v-gui [data-tag=dsy]'); await pg.wait_for_selector('#modal:not(.hidden)')
        body = await pg.evaluate("$('#mbody').innerText"); assert 'veri1.bin' in body and 'not.txt' not in body, body
        await pg.click('#mbody button >> text=veri1.bin'); await idle(pg); await pg.wait_for_timeout(500)
        assert await sonuc() == 'veri1.bin=120', await sonuc()
        assert not errs, errs
        await b.close(); print('pw_tsel: OK')
asyncio.run(main())
