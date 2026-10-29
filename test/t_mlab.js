const ML=require('./ml_load.js')(['mlab1.js','mlab2.js','mlab3.js','mlab4.js']);
let fail=0,n=0;
function run(src,ctx){let out='';const it=new ML.Interp({out:s=>{out+=s},ctx:ctx||{}});try{it.run(src);}catch(e){if(!(e instanceof ML.MLError))throw e;out+='ERR:'+e.message;}return {out,it};}
function eq(name,src,exp,ctx){n++;let r;try{r=run(src,ctx);}catch(e){console.log('CRASH',name,e.stack.split('\n').slice(0,4).join('\n'));fail++;return;}
 const o=r.out.replace(/\s+/g,' ').trim();if(o!==exp){fail++;console.log('FAIL',name,'\n  got:',JSON.stringify(o),'\n  exp:',JSON.stringify(exp));}}
const V=(it,k)=>{const v=it.getVar(it.base,k);return v;};
function near(name,src,vname,exp,tol){n++;const r=run(src);const v=r.it.getVar(r.it.base,vname);if(!v||!v.re){fail++;console.log('FAIL',name,r.out);return;}let ok=v.re.length===exp.length;for(let i=0;ok&&i<exp.length;i++)if(!(Math.abs(v.re[i]-exp[i])<=(tol||1e-9)*Math.max(1,Math.abs(exp[i]))))ok=false;if(!ok){fail++;console.log('FAIL',name,'got',Array.from(v.re).slice(0,8),'exp',exp.slice(0,8),r.out);}}
module.exports={eq,near,run,ML,done(){console.log(`mlab: ${n-fail}/${n} OK`);process.exit(fail?1:0);}};
if(require.main===module){
eq('basic','x=3; y=x*2+1; disp(y)','7');
eq('print','a=[1 2 3]','a = 1 2 3');
eq('range','a=1:5; disp(sum(a))','15');
eq('for','s=0; for i=1:10, s=s+i; end; disp(s)','55');
eq('while','k=0; while k<5, k=k+1; end; disp(k)','5');
eq('if','x=5; if x>3, disp("big"), else, disp("small"), end','big');
eq('func','function y=sq(x)\n y=x^2;\nend\ndisp(sq(4))','16');
eq('anon','f=@(x) x.^2+1; disp(f(3))','10');
eq('cellfun','c={1,2,3}; r=cellfun(@(x) x*2, c); disp(r)','2 4 6');
eq('struct','s.a=1; s.b="hi"; disp(s.a); disp(s.b)','1 hi');
eq('end','a=1:5; disp(a(end)); disp(a(end-1))','5 4');
eq('logical','a=[1 5 2 8]; disp(a(a>2))','5 8');
eq('growth','a=[]; for i=1:5, a(end+1)=i^2; end; disp(a)','1 4 9 16 25');
eq('delete','a=1:5; a(2)=[]; disp(a)','1 3 4 5');
eq('matmul','A=[1 2;3 4]; B=A*A; disp(B)','7 10 15 22');
eq('solve',"A=[2 1;1 3]; x=A\\[3;5]; disp(x')",'0.8000 1.4000');
eq('fprintf','fprintf("%d: %5.2f\\n", 3, pi)','3: 3.14');
eq('sprintf vec','s=sprintf("%d,",[1 2 3]); disp(s)','1,2,3,');
eq('try','try, error("myid:x","boom %d",3); catch e, disp(e.message); disp(e.identifier); end','boom 3 myid:x');
eq('switch','x="a"; switch x, case "b", disp(1); case {"a","c"}, disp(2); end','2');
eq('complex','z=3+4i; disp(abs(z))','5');
eq('undefined','disp(foo(1))',"ERR:'foo' tanımsız: değişken ya da işlev bulunamadı (satır 1). Kendi işlevinizse foo.m dosyasını da Kod sekmesinde açın; açık sekmelerdeki işlev ve betikler otomatik kullanılır.");
eq('idx0','a=1:3; a(0)','ERR:Dizin pozitif tamsayı olmalı: 0 geçersiz (MATLAB dizinleri 1\'den başlar).');
eq('dim','[1 2 3]+[1 2]','ERR:Matris boyutları uyuşmuyor (1×3 ile 1×2).');
eq('bcast','a=[1 2 3]+[10;20]; disp(a)','11 12 13 21 22 23');
eq('cumsum','disp(cumsum(1:4))','1 3 6 10');
eq('sort','[s,i]=sort([3 1 2]); disp(s); disp(i)','1 2 3 2 3 1');
eq('max','[m,i]=max([3 9 2]); disp(m); disp(i)','9 2');
eq('mean mat','disp(mean([1 2;3 4]))','2 3');
eq('str','s=["ab","cd"]; disp(upper(s)); disp(length(s))','ABCD 4');
eq('num2str','disp(num2str(3.14159)); disp(["a" num2str(5)])','3.1416 a5');
eq('persist','function c=cnt()\n persistent n; if isempty(n), n=0; end; n=n+1; c=n;\nend\ncnt(); cnt(); disp(cnt())','3');
eq('recursion','function r=f(n)\n if n<=1, r=1; else r=n*f(n-1); end\nend\ndisp(f(5))','120');
eq('nargin','function r=g(a,b)\n if nargin<2, b=10; end; r=a+b;\nend\ndisp(g(1)); disp(g(1,2))','11 3');
eq('cell idx','c={1,"x",[1 2 3]}; disp(c{3}(2))','2');
eq('struct arr','s(1).a=1; s(2).a=5; disp(numel(s)); disp(s(2).a)','2 5');
eq('copy sem','a=[1 2 3]; b=a; b(1)=99; disp(a(1)); disp(b(1))','1 99');
eq('fn copy','function r=m(x)\n x(1)=0; r=x;\nend\na=[5 6]; b=m(a); disp(a(1))','5');
eq('while break','k=0; while true, k=k+1; if k>3, break; end; end; disp(k)','4');
eq('colon assign','A=zeros(2,3); A(:,2)=[7;8]; disp(A)','0 0 0 7 8 0'.replace('0 0 0 7 8 0','0 7 0 0 8 0'));
eq('logical idx assign','a=1:5; a(a>3)=0; disp(a)','1 2 3 0 0');
eq('int sat','x=uint8(200)+uint8(100); disp(x)','255');
{n++;const it=new ML.Interp({out(){},deadline:Date.now()+300});let m='';try{it.run('while true, end');}catch(e){m=e.message;}if(!/Zaman aşımı/.test(m)){fail++;console.log('FAIL timeout',m);}}
eq('end in matrix idx','A=1:5; A([1 end])=[]; disp(A)','2 3 4');
eq('char range','disp(\'a\':\'e\')','abcde');
eq('deal','[p,q]=deal(1,2); disp(p+q)','3');
eq('x+=','x=1; x+=4; disp(x)','5');
eq('nested fn handle','g=@(f,x) f(f(x)); disp(g(@(y) y*2, 3))','12');
eq('cell display','c={1,\'a\'}; disp(class(c))','cell');
eq('struct field dyn','s=struct(); f=\'k\'; s.(f)=3; disp(s.k)','3');
eq('logical short','a=[]; if isempty(a) || a(1)>0, disp(1), end','1');
eq('while cond vec','x=[1 1]; while all(x<3), x=x+1; end; disp(x)','3 3');
module.exports.done();
}
