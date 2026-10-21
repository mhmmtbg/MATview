const fs=require('fs');
const src=['mat.js','h5.js'].map(f=>fs.readFileSync('src/'+f,'utf8').replace(/if \(typeof module.*\n/,'')).join('\n');
const {MAT,H5}=new Function(src+';return {MAT,H5};')();
global.H5=H5;
(async()=>{ for(const nm of ['v73.mat','v73_latest.mat']){
  const b=fs.readFileSync('/tmp/h5t/'+nm); const file={size:b.length,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length),slice:(a,e)=>({arrayBuffer:async()=>b.buffer.slice(b.byteOffset+a,b.byteOffset+e)})};
  const m=await MAT.open(file); console.log('==',nm,m.vars.map(v=>`${v.name}:${v.clsName}[${v.dims}]${v.numeric?'':'(x)'}`).join(' '));
  for(const v of m.vars.filter(v=>v.numeric)){ const t=Date.now(); const d=await MAT.load(m,v); let s=0; for(let i=0;i<d.length;i+=Math.ceil(d.length/50))s+=d[i]; console.log('  ',v.name,d.length,'ilk:',Array.from(d.slice(0,3)).map(x=>+x.toFixed(4)),'ort-toplam',s.toFixed(3),(Date.now()-t)+'ms'); }
 }})();
