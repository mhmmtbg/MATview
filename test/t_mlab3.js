// Faz 5 yorumlayıcı eklemeleri: varsayılan parametre değerleri, spline/pchip, sütun bazlı trapz/cumtrapz, polyfit [p,S,mu]
const {run} = require('./t_mlab.js'); let fail = 0, n = 0;
function V(src, v) { const r = run(src); const q = r.it.getVar(r.it.base, v); if (!q || !q.re) { console.log('ÇIKTI', r.out); return null; } return Array.from(q.re); }
function near(name, src, v, exp, tol = 1e-9) { n++; const g = V(src, v); const ok = g && g.length === exp.length && g.every((x, i) => Math.abs(x - exp[i]) <= tol * Math.max(1, Math.abs(exp[i]))); if (!ok) { fail++; console.log('HATA', name, g, exp); } }
near('varsayılan', 'v = [g(1) g(1,3) g(1,3,0)];\nfunction y=g(x,a=2,b=a*10)\n y=x*a+b;\nend', 'v', [22, 33, 3]);
near('spline', "y=spline([0 1 2 3],[0 1 8 27],[1.5 4]);", 'y', [3.375, 64]);
near('interp1 spline', "y=interp1([0 1 2 3],[0 1 8 27],[1.5 4],'spline');", 'y', [3.375, 64]);
near('pchip', "y=interp1(1:5,[1 3 2 5 4],[1.5 2.5 3.7],'pchip');", 'y', [2.4375, 2.5, 4.352]);
near('pchip()', "y=pchip(1:5,[1 3 2 5 4],[1.5 2.5 3.7]);", 'y', [2.4375, 2.5, 4.352]);
near('spline 5', "y=spline(0:4,[0 1 0 2 1],[0.5 2.5 3.5]);", 'y', [1.234375, 0.828125, 2.421875]);
near('trapz matris', "t=trapz([1 2;3 4;5 6]);", 't', [6, 8]);
near('trapz x', "t=trapz(0:0.5:1,[1 2 3]);", 't', [2]);
near('cumtrapz matris', "c=cumtrapz([1 2;3 4]);", 'c', [0, 2, 0, 3]);
near('polyfit mu', "[p,S,mu]=polyfit(1:10,(1:10).^2,2);", 'p', [9.16666666667, 33.3041539, 30.25], 1e-7);
near('polyfit mu2', "[p,S,mu]=polyfit(1:10,(1:10).^2,2);", 'mu', [5.5, 3.0276503540974917]);
console.log('mlab3:', fail ? fail + ' HATA' : n + '/' + n + ' OK'); process.exit(fail ? 1 : 0);
