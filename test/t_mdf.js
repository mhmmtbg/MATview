const fs=require('fs'); const src=['mat.js','mdf.js'].map(f=>fs.readFileSync(__dirname+'/../src/'+f,'utf8').replace(/if \(typeof module.*\n/,'')).join('\n');
const {MDF}=new Function(src+';return {MDF};')(); const exp=JSON.parse(fs.readFileSync('/tmp/mdft/exp.json','utf8')); let bad=0;
(async()=>{ for(const nm of Object.keys(exp)){ if(nm[0]==='_')continue; const b=fs.readFileSync('/tmp/mdft/'+nm); let r;
  try{ r=await MDF.open(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)); }catch(e){console.log(nm,'AÇILAMADI',e.message);bad++;continue;}
  const got={}; for(const g of r.groups) for(const c of g.channels){ try{ got[c.name]={d:await r.load(c),g}; }catch(e){ console.log(nm,c.name,'HATA',e.message); bad++; } }
  console.log(nm, r.version, r.groups.map(g=>g.name+':'+g.channels.length).join(' '), r.warn.join(';'));
  for(const k of Object.keys(exp[nm])){ const e=exp[nm][k], c=got[k]; if(!c){console.log(' EKSİK',k);bad++;continue;} if(c.d.length!==e.length){console.log(' UZUNLUK',k,c.d.length,e.length);bad++;continue;}
    let mx=0; for(let i=0;i<e.length;i++) mx=Math.max(mx,Math.abs(c.d[i]-e[i])/Math.max(1,Math.abs(e[i]))); if(mx>1e-6){console.log(' FARK',k,mx);bad++;} }
  if(nm==='v410_c0.mf4'){ const g=r.groups.find(g=>g.channels.some(c=>c.name==='acc_x')); const t=await r.time(g); if(Math.abs(t[1]-t[0]-1/2000)>1e-12||t.length!==4000){console.log(' ZAMAN HATA',t[1]-t[0],t.length);bad++;} const u=g.channels.find(c=>c.name==='acc_x').unit; if(u!=='g'){console.log(' BİRİM',u);bad++;} }
  if(nm==='unsorted.mf4'){ const gB=got.valB.g, t=await r.time(gB); if(Math.abs(t[10]-0.1)>1e-12){console.log(' sırasız zaman',t[10]);bad++;} }
 }
 if(bad){console.log('BAŞARISIZ',bad);process.exit(1);} console.log('t_mdf OK'); })();
