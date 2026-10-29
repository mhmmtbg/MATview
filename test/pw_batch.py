import asyncio, os, tempfile
import numpy as np
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
D = tempfile.mkdtemp(); fs = 5000; N = 60000; t = np.arange(N) / fs; rng = np.random.default_rng(5)
def wr(name, cn, sd):
    with open(os.path.join(D, name), 'w') as f:
        f.write(f't;{cn};dummy\n')
        x = rng.normal(0, sd, N)
        for i in range(N): f.write(f'{t[i]};{x[i]};{i%7}\n')
    return os.path.join(D, name)
A = wr('testA.csv', 'ctrl1', 1.0); B = wr('testB.csv', 'Kontrol_1', 2.0)
async def setv(pg, **kw):
    for k, v in kw.items(): await pg.evaluate("([k,v])=>{const e=document.getElementById(k); e.value=v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change'));}", [k, v])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        for f in (A, B):
            await pg.set_input_files('#fileIn', [f]); await pg.wait_for_timeout(1200)
            if await pg.query_selector('#modal:not(.hidden)'): await pg.evaluate("document.querySelector('#mfoot button.primary,#mfoot button').click()"); await pg.wait_for_timeout(600)
        print('files', await pg.evaluate("S.files.map(f=>f.name+':'+f.channels.map(c=>c.name+'/'+c.kind).join(','))"))
        await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())")
        await pg.evaluate("S.profiles.push({id:'ptest',name:'düz 4e-4',pts:[[20,4e-4],[1000,4e-4]],tol:3,color:'#d62728'}); saveProfiles(); refreshUnvPanel(); fillProfSelects()")
        # --- toplu özet
        await pg.evaluate("S.files.forEach(f=>f.channels.forEach(c=>{c.kind='vib'}))")
        await setv(pg, batPat='ctrl1|Kontrol_1', batProf='ptest', batDf='5')
        await pg.evaluate("batchRun()"); await pg.wait_for_timeout(2500)
        print(await pg.inner_text('#toast')); print(await pg.inner_text('#batBox'))
        rows = await pg.evaluate("_bat.rows.map(r=>[r.file,r.ch,r.rms,r.gm,r.gt,r.ok,r.dof])"); print(rows)
        assert len(rows) == 2; ra = [r for r in rows if r[0].startswith('testA')][0]; rb = [r for r in rows if r[0].startswith('testB')][0]
        assert abs(ra[2] - 1) < 0.02 and abs(rb[2] - 2) < 0.04, (ra[2], rb[2]); assert abs(ra[3] - 0.626) < 0.03 and abs(rb[3] - 1.252) < 0.06, (ra[3], rb[3])
        assert ra[5] is True and rb[5] is False, 'karar'; assert ra[6] > 20
        assert await pg.evaluate("DSPW.active && !DSPW.dead"), 'worker çalışmıyor'
        await pg.evaluate("batToReport()"); assert await pg.evaluate("REP.items.some(i=>i.title&&i.title.startsWith('Toplu özet'))")
        # --- şablon
        await setv(pg, tplName='deneme', batLvl='3', tplRoleCtl='ctrl1')
        await pg.evaluate("tplSave()"); await setv(pg, batLvl='-6', batPat='x'); await pg.evaluate("document.getElementById('batProf').value=''")
        assert await pg.evaluate("tplLoad().length") == 1
        r = await pg.evaluate("tplApply(tplLoad()[0])"); print('apply', r)
        v = await pg.evaluate("[batLvl.value, batPat.value, batProf.value, S.roles.ctl.length]"); print(v); assert v[0] == '3' and v[1] == 'ctrl1|Kontrol_1' and v[2] == 'ptest' and v[3] == 1, v
        # şablon profili silinse bile geri gelir
        await pg.evaluate("S.profiles.length=0; saveProfiles(); refreshUnvPanel(); fillProfSelects()"); await pg.evaluate("tplApply(tplLoad()[0])")
        assert await pg.evaluate("S.profiles.some(p=>p.name==='düz 4e-4')") and await pg.evaluate("batProf.value===S.profiles[0].id")
        # --- yardım / hata günlüğü / tanı
        await pg.evaluate("logErr('test','deneme hatası')"); await pg.keyboard.press('F1'); await pg.wait_for_timeout(300)
        assert await pg.evaluate("!document.getElementById('modal').classList.contains('hidden')"); txt = await pg.inner_text('#mbody'); assert 'Ctrl+S' in txt, txt[:200]
        await pg.click('#mbody button:has-text("Sorun bildir")'); assert 'deneme hatası' in await pg.inner_text('#mbody')
        d = await pg.evaluate("JSON.stringify(diagBundle(false))"); assert 'testA' not in d and 'deneme' in d
        print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
