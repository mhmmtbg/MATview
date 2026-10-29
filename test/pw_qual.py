import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
import numpy as np, tempfile
CSV = os.path.join(tempfile.mkdtemp(), 'kalite_sentetik.csv'); fs = 1000; N = 20000; t = np.arange(N) / fs; rng = np.random.default_rng(3)
cols = {'ok': rng.normal(0, 1, N), 'clip': np.clip(2 * rng.normal(0, 1, N), -3, 3), 'const': np.full(N, 5.0), 'sine': np.sin(2 * np.pi * 125 * t)}
cols['nan'] = cols['ok'].copy(); cols['nan'][100:110] = np.nan; cols['jump'] = cols['ok'].copy(); cols['jump'][5000] += 60; cols['jump'][9000] -= 80
with open(CSV, 'w') as f:
    f.write('t;' + ';'.join(cols) + '\n')
    for i in range(N): f.write(';'.join(str(x) for x in [t[i]] + [c[i] for c in cols.values()]) + '\n')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [CSV]); await pg.wait_for_timeout(1500)
        if await pg.query_selector('#modal:not(.hidden)'): print('modal:', (await pg.inner_text('#mtitle'))); await pg.evaluate("document.querySelector('#mfoot button.primary,#mfoot button').click()"); await pg.wait_for_timeout(1200)
        print('files', await pg.evaluate("S.files.length"), await pg.evaluate("S.files[0]&&S.files[0].channels.map(c=>c.name).join(',')"))
        await pg.click('#rtabs [data-t=qual]'); await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())"); await pg.click('button:has-text("Denetle")'); await pg.wait_for_timeout(1500)
        txt = await pg.inner_text('#qBox'); print(txt)
        st = {l.split('\t')[1]: l.split('\t')[2] for l in txt.split('\n')[2:] if l.count('\t') > 3}
        exp = {'clip': 'Hata', 'nan': 'Hata', 'const': 'Uyarı', 'jump': 'Uyarı', 'ok': 'Tamam', 'sine': 'Tamam'}
        assert st == exp, (st, exp); print('kalite testi OK'); await pg.screenshot(path='/tmp/qual.png'); print('ERRS', errs); await b.close()
asyncio.run(main())
