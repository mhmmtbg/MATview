// Faz 6 MATLAB işlevleri: doğrusal cebir, polinom, ara değer, optimizasyon, fit, datetime/duration, table, CSV, string
// Beklenen değerler sentetik verilerle NumPy/SciPy'den (MATLAB ile aynı tanımlar) — test/t_mlab6.json
const {run, ML} = require('./t_mlab.js'); let fail = 0, n = 0;
const T = require('./t_mlab6.json').map(t => [t[0], t[1], t[2], t[3].map(v => v === null ? NaN : v), t[4]]);
for (const [name, src, v, exp, tol] of T) { n++; let g = null, out = ''; try { const r = run(src); out = r.out; const q = r.it.getVar(r.it.base, v); g = q && q.re ? Array.from(q.re) : null; } catch (e) { out = 'İSTİSNA ' + e.stack; }
  const ok = g && g.length === exp.length && g.every((x, i) => (x !== x && exp[i] !== exp[i]) || Math.abs(x - exp[i]) <= tol * Math.max(1, Math.abs(exp[i])));
  if (!ok) { fail++; console.log('HATA', name, g && g.slice(0, 12), exp.slice(0, 12), out.slice(0, 300)); } }
function has(name, src, re) { n++; const r = run(src); if (!re.test(r.out)) { fail++; console.log('HATA', name, JSON.stringify(r.out.slice(0, 400))); } }
// görüntüleme
has('datetime göster', "t = datetime(2024,3,15,10,20,30)", /15-Mar-2024 10:20:30/);
has('datetime Format', "t = datetime(2024,3,15,'Format','yyyy-MM-dd')", /2024-03-15/);
has('duration göster', "d = hours(1.5)", /1\.5 hr/);
has('duration hh:mm:ss', "d = duration(1,2,3)", /01:02:03/);
has('table göster', "a=[1;2]; b={'x';'y'}; T = table(a,b)", /2×2 table[\s\S]*a[\s\S]*b[\s\S]*1[\s\S]*'x'/);
has('cfit göster', "f = fit((1:5)',(2*(1:5)+1)','poly1')", /p1 = 2[\s\S]*p2 = 1/);
has('string göster', 's = "merhaba"', /s = "merhaba"/);
has('class', "disp(class(datetime(2020,1,1))); disp(class(hours(1))); disp(class(table(1))); disp(class(\"a\"))", /datetime\s+duration\s+table\s+string/);
has('datestr', "disp(datestr(datetime(2024,3,5,7,8,9)))", /05-Mar-2024 07:08:09/);
// CSV gidiş-dönüş (sanal dosya sistemi)
{ n++; const r = run("A=[1 2.5;-3 4]; writematrix(A,'a.csv'); B=readmatrix('a.csv'); x=table([1;2],{'p';'q'},'VariableNames',{'n','s'}); writetable(x,'t.csv'); T=readtable('t.csv'); v=[B(:)' T.n']; s=T.s{2}; csvwrite('c.csv',[1 2;3 4]); C=csvread('c.csv',1,0);");
  const v = r.it.getVar(r.it.base, 'v'), s = r.it.getVar(r.it.base, 's'), C = r.it.getVar(r.it.base, 'C');
  if (!v || Array.from(v.re).join() !== '1,-3,2.5,4,1,2' || ML.toStr(s) !== 'q' || Array.from(C.re).join() !== '3,4') { fail++; console.log('HATA csv', r.out, v && Array.from(v.re), s && ML.toStr(s), C && Array.from(C.re)); } }
// başlık satırlı CSV okuma
{ n++; const ctx = {}; const r0 = run("x=1;"); ML.vfsAdd(r0.it, 'olcum.csv', new TextEncoder().encode('zaman;deger\n0;1,5\n0,5;2\n')); r0.it.run("M=readmatrix('olcum.csv'); T=readtable('olcum.csv'); w=T.deger';");
  const Mv = r0.it.getVar(r0.it.base, 'M'), w = r0.it.getVar(r0.it.base, 'w'); if (!Mv || Array.from(Mv.re).join() !== '0,0.5,1.5,2' || Array.from(w.re).join() !== '1.5,2') { fail++; console.log('HATA csv ; ondalık virgül', Mv && Array.from(Mv.re), w && Array.from(w.re)); } }
// İşlevler listesi
for (const k of ['eig', 'svd', 'rank', 'pinv', 'lu', 'qr', 'chol', 'expm', 'null', 'orth', 'toeplitz', 'hankel', 'vander', 'polyder', 'polyint', 'residue', 'mkpp', 'ppval', 'interp2', 'griddata', 'fminbnd', 'fminsearch', 'lsqnonneg', 'lsqcurvefit', 'fit', 'datetime', 'seconds', 'duration', 'table', 'istable', 'readmatrix', 'writematrix', 'writetable', 'csvwrite', 'string', 'strings', 'isstring', 'extractBetween']) { n++; if (!ML.builtins[k]) { fail++; console.log('EKSİK', k); } }
console.log('mlab6:', fail ? fail + ' HATA' : n + '/' + n + ' OK'); process.exit(fail ? 1 : 0);
