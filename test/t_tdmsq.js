const T=new Function(require('fs').readFileSync(__dirname+'/../src/tdms.js','utf8')+'; return TDMS;')(), fs=require('fs'), assert=require('assert'); const exp=JSON.parse(fs.readFileSync('/tmp/tdmsq/exp.json','utf8')); let bad=0;
for (const nm of Object.keys(exp)) { const b=fs.readFileSync('/tmp/tdmsq/'+nm+'.tdms'); const r=T.parse(new Uint8Array(b)); const got={}; for(const g of r.groups) for(const c of g.channels) got[c.name]=c;
  console.log(nm, Object.keys(got).map(k=>k+':'+got[k].n+'/'+got[k].dtype).join(' '), r.warn);
  for (const k of Object.keys(exp[nm])) { const e=exp[nm][k], c=got[k]; if(!c){console.log(' EKSİK',k);bad++;continue;} if(c.n!==e.length){console.log(' UZUNLUK',k,c.n,e.length);bad++;continue;}
    let mx=0; for(let i=0;i<e.length;i++) mx=Math.max(mx,Math.abs(c.data[i]-e[i])/Math.max(1,Math.abs(e[i]))); if(mx>1e-9){console.log(' FARK',k,mx);bad++;} } }
if(bad){console.log('BAŞARISIZ',bad);process.exit(1);} console.log('t_tdmsq OK');
