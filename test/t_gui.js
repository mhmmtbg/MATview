// GUIDE arayüz çalışma zamanı (düğüm testi): .fig ağacı + GUIDE .m
const ML=require('./ml_load.js')(['mlab1.js','mlab2.js','mlab3.js','mlab4.js']);
const fs=require('fs');
const S=s=>({k:'num',cls:'c',dims:[1,s.length],re:Float64Array.from(s,c=>c.charCodeAt(0))});
const N=a=>({k:'num',cls:'d',dims:[1,a.length],re:Float64Array.from(a)});
const CH=rows=>{const w=Math.max(...rows.map(r=>r.length));const re=new Float64Array(rows.length*w);rows.forEach((r,i)=>{for(let j=0;j<w;j++)re[i+j*rows.length]=(r.charCodeAt(j)||32);});return {k:'num',cls:'c',dims:[rows.length,w],re};};
const node=(type,props,kids)=>({type:S(type),handle:N([1]),properties:{k:'struct',f:Object.keys(props),v:[props]},children:kids&&kids.length?{k:'struct',f:['type','handle','properties','children'],v:kids}:{k:'num',cls:'d',dims:[0,0],re:new Float64Array(0)}});
const ui=(style,str,pos,tag,extra)=>node('uicontrol',Object.assign({Style:S(style),String:typeof str==='string'?S(str):CH(str),Position:N(pos),Units:S('normalized'),Tag:S(tag)},extra||{}));
const kids=[ui('pushbutton','Ciz',[0.05,0.85,0.2,0.1],'pushbutton1'),ui('pushbutton','Dosya Sec',[0.3,0.85,0.2,0.1],'pushbutton2'),ui('text','-',[0.55,0.85,0.4,0.1],'text1'),ui('popupmenu',['bir','iki','uc'],[0.05,0.7,0.2,0.1],'popupmenu1',{Value:N([1])}),ui('edit','',[0.3,0.7,0.2,0.1],'edit1'),node('axes',{Position:N([0.1,0.1,0.8,0.5]),Units:S('normalized'),Tag:S('axes1')},[])];
const tree={k:'struct',f:['type','handle','properties','children'],v:[node('figure',{Name:S('demoGUI'),Units:S('characters'),Position:N([10,10,120,40]),Tag:S('figure1')},kids)]}.v[0];
let out='',notes=[];
const vfsFile={name:'ornek.bin',bytes:Uint8Array.from([7,1,2,3,4])};
const ctx={figLayout:n=>n==='demoGUI'?{v:[tree]}:null,notify:(k,p)=>notes.push(k),rpc:(k,p)=>k==='uigetfile'?['ornek.bin']:undefined,statFile:n=>n==='ornek.bin'?{name:n,size:5}:null,readFile:(n,o,l)=>vfsFile.bytes.subarray(o,o+l)};
const it=new ML.Interp({out:s=>{out+=s},ctx});
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m,'\n',out.slice(-400));}};
it.loadFile(fs.readFileSync(__dirname+'/fixtures/demoGUI.m','utf8'),'demoGUI.m');
try{it.run('h = demoGUI;');}catch(e){console.log('ERR',e.message,e.mfile,e.mline);fail++;}
const snap=ML.guiSnapshot(it,true); ok(snap&&snap.length===1,'snapshot');
const find=tag=>snap[0].objs.find(o=>o.props.Tag===tag);
ok(find('pushbutton1')&&find('axes1'),'nesneler');
ok(notes.includes('guiopen'),'guiopen');
const pid=find('popupmenu1').id;
ML.guiSetFromUI(it,pid,{Value:[2]});
try{ML.guiCallback(it,pid);}catch(e){console.log('ERR cb',e.message);fail++;}
ML.guiCallback(it,find('pushbutton1').id); ML.guiCallback(it,find('pushbutton1').id);
let s2=ML.guiSnapshot(it,false); const t1=s2[0].objs.find(o=>o.props.Tag==='text1');
ok(t1.props.String==='Tiklama: 2','text1 '+JSON.stringify(t1.props.String));
ok(s2[0].objs.find(o=>o.props.Tag==='edit1').props.String==='2','edit1');
const ax=s2[0].axes[0]; ok(ax&&ax.traces&&ax.traces.length===1&&ax.traces[0].y[9]===20&&ax.title==='iki','eksen '+JSON.stringify(ax&&{t:ax.title,n:ax.traces&&ax.traces.length}));
ML.guiCallback(it,find('pushbutton2').id); s2=ML.guiSnapshot(it,false);
ok(/ornek.bin: 5 bayt, ilk 7/.test(s2[0].objs.find(o=>o.props.Tag==='text1').props.String),'fread '+s2[0].objs.find(o=>o.props.Tag==='text1').props.String);
ok(it.base.vars.get('veri')&&it.base.vars.get('veri').t==='u8','assignin');
// handle nokta erişimi ve findobj
it.run("hh = findobj(h, 'Tag', 'edit1'); hh.String = 'abc'; q = get(hh, 'String');"); ok(ML.toStr(it.base.vars.get('q'))==='abc','findobj/dot');
console.log(out.trim().slice(-300)); console.log(fail?`gui: ${fail} HATA`:'gui: OK'); process.exit(fail?1:0);
