const MAT=require('../src/mat.js'); const fs=require('fs');
const dir=os.environ.get('MATVIEW_TEST_DATA','./testdata/');
(async()=>{
 for (const f of fs.readdirSync(dir)){
  const b=fs.readFileSync(dir+f); const file={arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)};
  let t=Date.now(); const m=await MAT.open(file); console.log(f,m.vars.length,'vars',Date.now()-t,'ms');
  const big=m.vars.filter(v=>v.numeric).sort((a,b)=>b.count-a.count)[0];
  t=Date.now(); const d=await MAT.load(m,big); let mn=1e99,mx=-1e99; for(let i=0;i<d.length;i++){if(d[i]<mn)mn=d[i];if(d[i]>mx)mx=d[i];}
  console.log(' load',big.name,big.dims,d.length,Date.now()-t,'ms',mn,mx);
  console.log(' unsupported:',m.vars.filter(v=>!v.numeric).map(v=>v.name+':'+v.clsName).join(','));
 }
})();
