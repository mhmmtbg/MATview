import asyncio, os, sys, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); pg = await b.new_page(viewport={'width': 1500, 'height': 950}, accept_downloads=True); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html'))
        # 2 kontrol kanalı (aynı gürültü + küçük farklar), 1 cevap: 2. mertebe sistem (fn=200 Hz, ζ=0.05) süzgeci -> tepe 200 Hz'de ~1/(2ζ)=10
        await pg.evaluate("""async()=>{
          const fs=4096,n=fs*60; let s=11; const r=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}, g=()=>Math.sqrt(-2*Math.log(r()+1e-12))*Math.cos(2*Math.PI*r());
          const u=new Float64Array(n), c1=new Float64Array(n), c2=new Float64Array(n), y=new Float64Array(n);
          for(let i=0;i<n;i++){u[i]=g(); c1[i]=u[i]*1.0; c2[i]=u[i]*1.1;}
          // SDOF mutlak ivme transmisibilitesi: H(s)=(2ζωn s+ωn²)/(s²+2ζωn s+ωn²), bilineer yerine ZOH-değil: Smallwood/impulse-invariant yerine basit RK4 benzeri
          const wn=2*Math.PI*200, z=0.05, dt=1/fs; let x=0,v=0; // z̈ + 2ζωn ż + ωn² z = -ü ; abs ivme = -(2ζωn ż + ωn² z)
          // mutlak yanıt: y = ωn²(x_rel) + 2ζωn v_rel + ... kullanım: relatif koordinat q: q̈+2ζωn q̇+ωn² q = -a_base ; a_abs = a_base + q̈ = -(2ζωn q̇+ωn² q)
          const mean=u; let q=0,qd=0; const sub=8, h=dt/sub;
          for(let i=0;i<n;i++){ const ab=u[i]; for(let k=0;k<sub;k++){ const qdd=-ab-2*z*wn*qd-wn*wn*q; qd+=qdd*h; q+=qd*h; } y[i]=-(2*z*wn*qd+wn*wn*q); }
          const mk=(nm,d,k)=>{const c=addDerived(nm,d,null,0,true); c.kind=k||'vib'; c.dtS=1/fs; return c;}
          window._c=[mk('kontrol_A',c1),mk('kontrol_B',c2),mk('cevap_1',y)];
          await addDerivedToPlot(window._c[0]); S.plot.fitAll(); setTab('test'); roleAssign('ctl',[window._c[0],window._c[1]]); roleAssign('resp',[window._c[2]]);}""")
        await pg.evaluate("document.querySelectorAll('#rbody .card.collapsed>h4').forEach(h=>h.click())")
        await pg.select_option('#ctScope', 'all'); await pg.evaluate("controlRun()"); await pg.wait_for_timeout(5000)
        print(await pg.inner_text('#ctBox')); res = await pg.evaluate("_ct")
        # beklenen: cevap tepesi ~200 Hz, değer ≈ 1/(2ζ)=10 (ortalama kontrol gain 1.05 → ~9.5)
        pk = res['rowsT'][0][3]; print('tepe', pk); f = float(pk.split(' Hz')[0].replace(',', '.')); v = float(pk.split('→')[1].split(';')[0]); assert abs(f - 200) < 8 and 7 < v < 12, pk
        assert 'ORTALAMA' in await pg.inner_text('#ctBox')
        # akustik tablo: 94 dB (1 Pa rms) 1 kHz sinüs -> OASPL 93.98, 1/3 oktav bandı 1 kHz ≈ 93.98
        await pg.evaluate("""async()=>{const fs=16384,n=fs*4,d=new Float64Array(n); for(let i=0;i<n;i++) d[i]=Math.SQRT2*Math.sin(2*Math.PI*1000*i/fs); const c=addDerived('mik1',d,null,0,true); c.kind='ac'; c.unit='Pa'; c.dtS=1/fs; S.plot.axes.forEach(a=>S.plot.removeAxes(a)); await addDerivedToPlot(c);}""")
        await pg.select_option('#atScope', 'all'); await pg.fill('#atSpec', '100 90\n1000 94\n8000 94'); await pg.fill('#atOA', '94'); await pg.evaluate("acTableRun()"); await pg.wait_for_timeout(3000)
        txt = await pg.inner_text('#atBox'); print(txt[-380:]); row = [l for l in txt.split('\n') if l.startswith('OASPL')][0]; print(row); oa = float(row.split('\t')[1]); assert abs(oa - 93.98) < 0.3, row
        k = [l for l in txt.split('\n') if l.startswith('1000') or l.startswith('1k')]; print(k)
        # MAT dışa aktarımı + günlük: bloba yazılır, scipy ile doğrulanır
        await pg.evaluate("S.methodLog.push({t:Date.now(),op:'deneme',x:1})")
        data = await pg.evaluate("""async()=>{const bl=matWrite([{name:'v',data:Float64Array.from([1,2,3]),rows:3,cols:1}]); const ab=await bl.arrayBuffer(); let s=''; const u=new Uint8Array(ab); for(let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]); return btoa(s);}""")
        import base64; open('/tmp/log_test.mat', 'wb').write(base64.b64decode(data))
        # silme geçmişi / ham görünüm
        await pg.evaluate("(()=>{const c=window._c[0]; c.applyDelete(Uint32Array.from([10,11,12,500])); })()")
        n0 = await pg.evaluate("window._c[0].delCount"); await pg.evaluate("rawView(true)"); raw = await pg.evaluate("[S.rawOn, window._c[0].del===null]"); await pg.evaluate("rawView(false)"); back = await pg.evaluate("window._c[0].delCount+'/'+(window._c[0].del!==null)")
        print('silme', n0, raw, back); assert n0 == 4 and raw == [True, True] and back == '4/true'
        await pg.evaluate("delHistoryDialog()"); print((await pg.inner_text('#mbody'))[:200]); print('ERRS', errs); assert not errs; await b.close()
asyncio.run(main())
