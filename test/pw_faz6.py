# Faz 6: oturum v2 gidiş-dönüş (türetilmiş kanal + formül, faz, rol, profil, rapor, çift Y), rapor düzenleyici, deflate zip, v7.3 ağaç (Kod), MDF3
import asyncio, os, json, zipfile, io, subprocess
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
subprocess.run(['python3', ROOT + 'test/make_tree.py'], capture_output=True); subprocess.run(['python3', ROOT + 'test/make_mdf3.py'], capture_output=True)
SETUP = """async()=>{ const fs=500,n=5000,a=new Float64Array(n),b=new Float64Array(n); for(let i=0;i<n;i++){a[i]=Math.sin(2*Math.PI*3*i/fs); b[i]=20+Math.cos(i/300);}
  const c1=addDerived('kaynak',a,null); c1.dtS=1/fs; c1.unit='g'; const c2=addDerived('sicak',b,null); c2.dtS=1/fs; c2.unit='°C'; await addToNewAxes([c1,c2],true); S.plot.fitAll(); return true; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); ctx = await b.new_context(accept_downloads=True, viewport={'width': 1500, 'height': 950}); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.evaluate("window.showSaveFilePicker=undefined"); await pg.evaluate(SETUP)
        # formül kanalı + durum
        await pg.evaluate("""async()=>{ const r=await evalFormula('kaynak*2',{}); S.opDesc='Formül: kaynak*2'; const c=addResult(r,'iki_kat',{dest:'new'}); c.formula='kaynak*2';
          S.roles={ctl:[chByName('kaynak').uid],resp:[chByName('iki_kat').uid]};
          const ch=chByName('kaynak'); S.levels={ch,a:0,ref:1,prof:null,segs:[{level:-3,t0:1,t1:4,i0:500,i1:2000,grms:0.5,db:-3},{level:0,t0:5,t1:9,i0:2500,i1:4500,grms:0.7,db:0}]};
          S.profiles.push({id:'p_test',name:'Profil T',pts:[[20,0.01],[2000,0.01]]});
          REP.items=[{type:'text',title:'Giriş',body:'deneme'},{type:'fig',url:S.plot.toPNG(1,true).toDataURL(),ar:0.5,title:'Şekil A',note:'a',half:true},{type:'fig',url:S.plot.toPNG(1,true).toDataURL(),ar:0.5,title:'Şekil B',note:'',half:true}]; repRefreshList(); }""")
        yr = await pg.evaluate("S.plot.axes[0].traces.map(t=>!!t.yr)"); assert yr == [False, True], yr
        async with pg.expect_download() as dl: await pg.evaluate("saveSession()")
        d = await dl.value; path = await d.path(); o = json.load(open(path))
        print('oturum v', o['v'], 'türetilmiş', [x['name'] for x in o['derived']], 'faz', len(o['phases']['segs']), 'rapor', len(o['report']['items']))
        assert o['v'] == 2 and {'kaynak', 'sicak', 'iki_kat'} <= {x['name'] for x in o['derived']} and next(x for x in o['derived'] if x['name'] == 'iki_kat')['formula'] == 'kaynak*2'
        # temiz sayfaya yükle
        await pg.reload(); await pg.evaluate("window.showSaveFilePicker=undefined")
        await pg.set_input_files('#sessIn', path); await pg.wait_for_timeout(1500)
        st = await pg.evaluate("""(()=>({der:S.derived.channels.map(c=>c.name), f:chByName('iki_kat').formula, v:chByName('iki_kat').data[125]-2*chByName('kaynak').data[125], ax:S.plot.axes.map(a=>a.traces.map(t=>t.label+(t.yr?'R':''))),
          roles:[S.roles.ctl.length,S.roles.resp.length], ph:S.levels&&S.levels.segs.length, prof:S.profiles.some(p=>p.id==='p_test'), rep:REP.items.map(i=>i.type+(i.half?'½':''))}))()""")
        print(st); assert st['f'] == 'kaynak*2' and abs(st['v']) < 1e-12 and ['kaynakR'] != st['ax'][0] and st['ax'][0] == ['kaynak', 'sicakR'] and st['roles'] == [1, 1] and st['ph'] == 2 and st['prof'] and st['rep'] == ['text', 'fig½', 'fig½']
        # rapor düzenleyici: sürükle-bırak sıralama
        await pg.evaluate("setTab('output')"); await pg.wait_for_timeout(100)
        await pg.evaluate("repMove(0,3)"); order = await pg.evaluate("REP.items.map(i=>i.title)"); print('sıra', order); assert order == ['Şekil A', 'Şekil B', 'Giriş']
        html = await pg.evaluate("repPaginate({}).pages.join('')"); assert 'display:flex' in html and 'Şekil 2' in html
        # docx: deflate sıkıştırmalı zip
        blob = await pg.evaluate("""async()=>{const m=repMeta? repMeta():{}; const b=await repDocx(Object.assign({title:'T',docNo:'1',date:'2026',rev:'A',cls:'TASNİF DIŞI',org:''},m)); const u=new Uint8Array(await b.arrayBuffer()); return Array.from(u);}""")
        z = zipfile.ZipFile(io.BytesIO(bytes(blob))); meth = {i.filename: i.compress_type for i in z.infolist()}; print('docx', meth.get('word/document.xml')); assert meth['word/document.xml'] == 8 and z.testzip() is None
        doc = z.read('word/document.xml').decode(); assert doc.count('Şekil') >= 2
        xb = await pg.evaluate("""async()=>Array.from(new Uint8Array(await (await XLSX.write([{name:'A',rows:[['x',1],['y',2]]}])).arrayBuffer()))"""); zx = zipfile.ZipFile(io.BytesIO(bytes(xb))); assert zx.testzip() is None
        # v7.3 ağaç: Kod sekmesinde load
        await pg.evaluate("switchView('code')"); await pg.wait_for_selector('#codeEd')
        await pg.set_input_files('#v-code input[accept=".mat"]', '/tmp/h5t/tree73.mat'); await pg.wait_for_timeout(800)
        await pg.evaluate("codeSetText(\"a = c{2}\\nb = s.ic.z\\nq = full(sp(1,2))\\nk = class(txt)\\n\")"); await pg.evaluate("codeRun('all')"); await pg.wait_for_function("!CODE.running", timeout=30000); await pg.wait_for_timeout(300)
        out = await pg.inner_text('#codeOut'); print(out[-300:]); assert "a = merhaba" in out and 'b = 9' in out and 'q = 2' in out and 'k = char' in out
        # MDF 3
        await pg.evaluate("switchView('time')"); await pg.set_input_files('#fileIn', '/tmp/mdft3/v330.mdf'); await pg.wait_for_function("S.files.some(f=>f.name==='v330.mdf')", timeout=20000)
        n = await pg.evaluate("S.files.find(f=>f.name==='v330.mdf').channels.map(c=>c.rest)"); print('mdf3', n); assert 'Temp1' in n and 'acc_x' in n
        print('ERR', errs); assert not errs; await b.close(); print('OK faz6')
asyncio.run(main())
