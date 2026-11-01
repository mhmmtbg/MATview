# Akustik Faz 1-2 (sentetik veri): OM-LSA + olay koruma, çıtırtı bastırma, konuşma / olay bulucu ve işaretler,
# ön ayarlar, dinleme seçenekleri (seviye dengeleme, perdeyi koruyarak yavaşlatma, bölüm dışını kısma), ⇤ ⇥ gezinme
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)) + '/../'
SYN = r"""async()=>{let seed=3;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296,g=()=>Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
 const fs=16000,n=fs*16,x=new Float64Array(n);
 for(const [a,b] of [[2,3.5],[5,7],[11,13]]){let ph=0;for(let i=Math.round(a*fs);i<b*fs;i++){const t=i/fs,f0=120+30*Math.sin(2*Math.PI*0.7*t);ph+=2*Math.PI*f0/fs;let v=0;for(let h=1;h*f0<4000;h++){const fh=h*f0;v+=(Math.exp(-(((fh-500)/250)**2))+0.6*Math.exp(-(((fh-1500)/300)**2))+0.3*Math.exp(-(((fh-2700)/400)**2)))*Math.sin(h*ph);}x[i]=0.02*v*Math.max(0,Math.sin(Math.PI*5*(t-a)))**0.5;}} window.__sp=Float64Array.from(x);
 for(let i=Math.round(9.5*fs);i<9.6*fs;i++){const t=i/fs-9.5;x[i]+=0.3*Math.exp(-t/0.012)*(Math.sin(2*Math.PI*3200*t)+0.6*Math.sin(2*Math.PI*5100*t)+0.5*g());}
 let lp=0;for(let i=0;i<n;i++){lp=0.9*lp+0.1*g();x[i]+=(0.004+0.004*i/n)*(g()+3*lp);}
 for(let k=0;k<n-100;k+=Math.round(fs*(0.01+0.03*rnd()))){const a=0.03*(0.5+rnd());for(let i=0;i<24;i++)x[k+i]+=a*g()*Math.exp(-i/6);}
 window.__clean=null; const c=addDerived('ses_pa',x,null,0,true); c.kind='ac'; c.unit='Pa'; c.dtS=1/fs; await addDerivedToPlot(c); S.plot.fitAll(); 0}"""
async def main():
    fail = []
    def ok(c, m):
        if not c: fail.append(m); print('HATA', m)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 950}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(ROOT + 'dist/matview.html')); await pg.evaluate(SYN)
        await pg.click('#rtabs [data-t=acoustic]'); await pg.evaluate("()=>{document.querySelectorAll('#right .card.collapsed').forEach(c=>c.classList.remove('collapsed'));0}"); await pg.select_option('#acScope', 'all')
        await pg.click('button:has-text("Yalnız ayarla")'); await pg.wait_for_timeout(3000)
        st = await pg.evaluate("({dn:ck('acDnOn'),m:sv('acDnM'),prot:ck('acProt'),cr:ck('acCrOn'),log:document.querySelector('#acLog').textContent})"); print(st['log'])
        ok(st['dn'] and st['m'] == 'omlsa' and st['prot'], 'otomatik plan OM-LSA + koruma'); ok(st['cr'], 'çıtırtı bulunmalı')
        # temizle ve ölç: arka plan bastırılır, darbe olayı korunur, konuşma kalır
        r = await pg.evaluate("""async()=>{const p=await acPrepare(true),y=p.y,x=p.raw,fs=p.fs;let m=0;for(const v of x)m+=v;m/=x.length;
          const rms=(z,a,b,o)=>{let q=0;for(let i=a*fs;i<b*fs;i++)q+=(z[i]-(o||0))**2;return Math.sqrt(q/((b-a)*fs))};let pk=0,pk0=0;for(let i=9.49*fs;i<9.56*fs;i++){pk=Math.max(pk,Math.abs(y[i]));pk0=Math.max(pk0,Math.abs(x[i]-m));}
          const snr=(z,o)=>{let q=0,r=0;for(let i=5*fs;i<7*fs;i++){q+=(z[i]-(o||0)-__sp[i])**2;r+=__sp[i]**2;}return 10*Math.log10(r/q)};
          return {bg:20*Math.log10(rms(y,0.3,1.8)/rms(x,0.3,1.8,m)),sp0:snr(x,m),sp:snr(y),pk:pk/pk0,log:p.log.join(' | ')}}""")
        print('temizleme', r); ok(r['bg'] < -12, 'arka plan bastırılmalı'); ok(r['sp'] > r['sp0'] + 3, 'konuşma SNR artmalı'); ok(r['pk'] > 0.8, 'darbe tepe korunmalı')
        # konuşma ve olay bulucu
        await pg.click('button:has-text("Konuşma ve olayları bul")'); await pg.wait_for_timeout(4000)
        mk = await pg.evaluate("({sp:S.acMarks.speech.map(m=>[m.t0,m.t1]),ev:S.acMarks.events.map(m=>m.t0),bands:S.plot.bands.filter(b=>b.ac).length,ui:document.querySelectorAll('#acMarks .acmk').length})"); print('işaretler', mk)
        ok(len(mk['ev']) == 1 and abs(mk['ev'][0] - 9.5) < 0.05, 'darbe olayı 9,5 s')
        cov = [any(a - 0.3 <= c <= b + 0.3 for a, b in mk['sp']) for c in (2.7, 6.0, 12.0)]; ok(all(cov), 'konuşma bölümleri ' + str(cov))
        ok(not any(a < 9.55 < b for a, b in mk['sp']), 'darbe konuşma sayılmamalı'); ok(mk['bands'] == len(mk['sp']) + 1 + (1 if await pg.evaluate("!!S.acNoise") else 0), 'grafik işaretleri'); ok(mk['ui'] == len(mk['sp']) + 1, 'liste')
        # ön ayar
        await pg.select_option('#acPreset', 'speech'); await pg.click('#acPresetBtn')
        pr = await pg.evaluate("[ck('acSpOn'),ck('acEqOn'),ck('acAgc'),num('acDnDb')]"); ok(pr == [True, True, True, 15], 'konuşma ön ayarı ' + str(pr))
        # perdeyi koruyarak yavaş dinleme + seviye dengeleme + bölüm dışını kısma
        await pg.fill('#acSpeed', '0.5'); await pg.check('#acMute')
        await pg.click('button:has-text("▶ Temizlenmiş")'); await pg.wait_for_timeout(5000)
        a = await pg.evaluate("({dur:S.audio.dur,bd:S.audio.buf.duration,rate:S.audio.buf.sampleRate,log:document.querySelector('#acLog').textContent})"); print('dinleme', a['dur'], a['bd'], a['rate'])
        ok(abs(a['dur'] - 16) < 0.01 and abs(a['bd'] - 32) < 0.1 and a['rate'] == 16000, 'perde korunarak 0,5× (tampon 2 kat uzun, örnekleme aynı)')
        ok('perde korunarak' in a['log'] and 'seviye dengeleme' in a['log'] and 'bölüm dışı' in a['log'], 'dinleme seçenekleri günlükte')
        await pg.click('.acbar .acb-pp'); await pg.evaluate("acSeekTo(0.5,true)")
        await pg.click('.acbar .acb-next'); t1 = await pg.evaluate("S.audio.t0+acPos()"); await pg.click('.acbar .acb-next'); t2 = await pg.evaluate("S.audio.t0+acPos()")
        print('gezinme', t1, t2); ok(abs(t1 - (mk['sp'][0][0] - 0.3)) < 0.05 and t2 > t1 + 1, 'sonraki bölüme atla')
        await pg.click('.acbar .acb-prev'); ok(abs(await pg.evaluate("S.audio.t0+acPos()") - t1) < 0.05, 'önceki bölüme atla')
        await pg.click('button:has-text("■ Durdur")')
        ok(not errs, 'sayfa hatası ' + str(errs)); await b.close()
    print('ac4:', 'OK' if not fail else f'{len(fail)} HATA'); sys.exit(1 if fail else 0)
asyncio.run(main())
