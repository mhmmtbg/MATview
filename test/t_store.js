global.MAT=require('../src/mat.js'); 
const src=require('fs').readFileSync('src/store.js','utf8'); const fn=new Function('MAT',src+';return {importFile,Channel,KIND};'); const S=fn(global.MAT);
const fs=require('fs'),dir=os.environ.get('MATVIEW_TEST_DATA','./testdata/');
(async()=>{for(const n of fs.readdirSync(dir)){const b=fs.readFileSync(dir+n);const f=await S.importFile({name:n,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)});
 console.log('==',n,f.channels.length,'kanal; cnt:',Object.keys(f.cnts).length,'lost:',Object.values(f.gcache).map(g=>g.lost).join(','));
 const seen={}; for(const c of f.channels){const k=c.dev+'/'+c.kind; (seen[k]=seen[k]||[]).push(c.rest+':'+c.n+'@'+c.fs.toFixed(0)+'Hz');}
 for(const k in seen) console.log(' ',k,seen[k].length,seen[k].slice(0,3).join(' '));
 const c=f.channels[0]; console.log('  t(0),t(n-1)',c.t(0),c.t(c.n-1).toFixed(3),'idx roundtrip',c.timeIdx(c.t(12345)).toFixed(3));
}})();
