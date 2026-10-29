const {run,ML}=require('./t_mlab.js');const fs=require('fs');
const T=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
let fail=0;
function cmp(name,got,exp,tol){let m=0;if(got.length!==exp.length){console.log('FAIL',name,'len',got.length,exp.length);fail++;return;}for(let i=0;i<exp.length;i++)m=Math.max(m,Math.abs(got[i]-exp[i])/Math.max(1,Math.abs(exp[i])));console.log(m<tol?'ok  ':'FAIL',name,m.toExponential(2));if(m>=tol)fail++;}
const fx='x=['+T.x.join(' ')+']; ';
function V(src,v){const r=run(src);if(r.out)console.log(r.out);const q=r.it.getVar(r.it.base,v);return q?Array.from(q.re):[];}
let r;
cmp('butter4 b',V('[b,a]=butter(4,0.2);','b'),T.b4,1e-9);cmp('butter4 a',V('[b,a]=butter(4,0.2);','a'),T.a4,1e-9);
cmp('butter high b',V("[b,a]=butter(3,0.3,'high');",'b'),T.bh,1e-9);cmp('butter high a',V("[b,a]=butter(3,0.3,'high');",'a'),T.ah,1e-9);
cmp('butter bp b',V("[b,a]=butter(2,[0.1 0.4]);",'b'),T.bb,1e-9);cmp('butter bp a',V("[b,a]=butter(2,[0.1 0.4]);",'a'),T.ab,1e-9);
cmp('filter',V(fx+'[b,a]=butter(4,0.2); y=filter(b,a,x);','y'),T.fl,1e-9);
cmp('filtfilt',V(fx+'[b,a]=butter(4,0.2); y=filtfilt(b,a,x);','y'),T.ff,1e-6);
const x150=fx+'x=x(1:150); F=fft(x);';
cmp('fft re',V(x150+' r=real(F);','r'),T.fre,1e-9);cmp('fft im',V(x150+' r=imag(F);','r'),T.fim,1e-9);
cmp('ifft',V(x150+' r=real(ifft(F));','r'),T.x.slice(0,150),1e-9);
cmp('pwelch',V(fx+'P=pwelch(x,hamming(64),32,128,100);','P'),T.pw,1e-9);
cmp('polyfit',V(fx+'t=(1:200)/10; p=polyfit(t,x,3);','p'),T.pf,1e-6);
process.exit(fail?1:0);
