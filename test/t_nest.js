const fs=require('fs');
const src=['mat.js','h5.js'].map(f=>fs.readFileSync('src/'+f,'utf8').replace(/if \(typeof module.*\n/,'')).join('\n');
const {MAT,H5}=new Function(src+';return {MAT,H5};')(); global.H5=H5;
const dir='/tmp/nest/'; const exp=JSON.parse(fs.readFileSync(dir+'exp.json','utf8')); let bad=0;
(async()=>{ for(const nm of Object.keys(exp)){
  const b=fs.readFileSync(dir+nm); const file={size:b.length,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length),slice:(a,e)=>({arrayBuffer:async()=>b.buffer.slice(b.byteOffset+a,b.byteOffset+e)})};
  const m=await MAT.open(file); const got={};
  for(const v of m.vars.filter(v=>v.numeric&&v.count>=2)){ const d=await MAT.load(m,v); let s=0; for(const x of d)s+=x; got[v.name]=s; }
  console.log('==',nm,Object.keys(got).join(' '));
  for(const k of Object.keys(exp[nm])){ if(!(k in got)){console.log('  EKSİK',k); bad++; continue;} const e=exp[nm][k]; if(Math.abs(got[k]-e)>1e-6*Math.max(1,Math.abs(e))){console.log('  FARK',k,got[k],e); bad++;} }
 }
 if(bad){console.log('BAŞARISIZ',bad);process.exit(1);} console.log('iç içe yapı OK');
})();
