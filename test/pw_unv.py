import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'api/args' not in m.text else None)
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        await pg.set_input_files('#fileIn', [ROOT + 'ornek/ornek.unv']); await pg.wait_for_function('S.files.length===1', timeout=20000)
        print(await pg.evaluate("[S.files[0].channels.length, S.files[0].channels.map(c=>c.name).slice(0,3), S.plot.grms.mode]"))
        await pg.evaluate("addToNewAxes(S.files[0].channels.filter(c=>c.spec.sub==='real'))"); await pg.wait_for_timeout(500)
        print('traces', await pg.evaluate("S.specPlot.axes[0].traces.length"), await pg.evaluate("S.view"))
        # profil ekle
        await pg.evaluate("""()=>{const p={id:'pt',name:'Test profili',pts:profParse('20 0.01\\n100 0.04\\n500 0.04\\n1000 0.01'),tol:3,color:'#d62728'}; S.profiles.push(p); profShow(p); window._p=p;}""")
        await pg.wait_for_timeout(400); await pg.screenshot(path='/tmp/unv1.png')
        print('profGrms', await pg.evaluate("[profGrms(_p.pts), Math.sqrt(0.01*20*(Math.pow(5,1+Math.log(4)/Math.log(5))-1)/(1+Math.log(4)/Math.log(5))*1)]"))
        await pg.evaluate("profCompare(_p)"); await pg.wait_for_timeout(300); print(await pg.inner_text('#mbody')); await pg.screenshot(path='/tmp/unv2.png')
        await pg.evaluate("document.querySelector('#modal').classList.add('hidden')")
        await pg.evaluate("unvTableDialog()"); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/unv3.png')
        r = await pg.evaluate('''async()=>{let blob=null; window.saveBlob=async(b)=>{blob=b;return true}; await unvExcel(); const sh=await XLSX.read(new File([blob],'a.xlsx')); return sh.map(s=>[s.name,s.rows.length,(s.rows[0]||[]).length])}''')
        print('excel', r); print('ERR', errs); await b.close()
asyncio.run(main())
