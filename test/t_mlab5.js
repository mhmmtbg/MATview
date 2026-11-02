// Faz 5 MATLAB işlevleri: sentetik veriler, MATLAB/SciPy ile aynı sonuçlar (beklenen değerler test/t_mlab5.json)
const {run, ML: MLX} = require('./t_mlab.js'); let fail = 0, n = 0;
const T = require('./t_mlab5.json').map(t => [t[0], t[1], t[2], t[3].map(v => v === null ? NaN : v), t[4]]);
for (const [name, src, v, exp, tol] of T) { n++; let g = null; try { const r = run(src); const q = r.it.getVar(r.it.base, v); g = q && q.re ? Array.from(q.re) : null; if (!g) console.log('ÇIKTI', r.out); } catch (e) { console.log('İSTİSNA', name, e.message); }
  const ok = g && g.length === exp.length && g.every((x, i) => (x !== x && exp[i] !== exp[i]) || Math.abs(x - exp[i]) <= tol * Math.max(1, Math.abs(exp[i])));
  if (!ok) { fail++; console.log('HATA', name, g && g.slice(0, 12), exp.slice(0, 12)); } }
// grafik: stairs / area / errorbar figür izleri
{ n++; const r = run("figure; stairs([1 2 3]); hold on; area([1 2 3],[2 1 2]); errorbar(1:3,[1 2 3],[0.1 0.2 0.3]);"); const f = r.it.figures ? r.it.figures : null; const out = r.out || ''; if (/Hata|Error/i.test(out)) { fail++; console.log('HATA grafik', out); } }
// İşlevler listesinde görünüyor mu
{ const MLAB = MLX; for (const k of ['lowpass', 'sgolayfilt', 'pspectrum', 'tf2sos', 'tukeywin', 'isoutlier', 'groupsummary', 'stairs', 'errorbar', 'area']) { n++; if (!MLAB.builtins[k]) { fail++; console.log('EKSİK', k); } } }
console.log('mlab5:', fail ? fail + ' HATA' : n + '/' + n + ' OK'); process.exit(fail ? 1 : 0);
