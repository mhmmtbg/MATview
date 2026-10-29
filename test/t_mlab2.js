// MATLAB alt kümesi: oturum içi save/load/who -file, save -struct/-append, (f(...)) çok çıktı, unique hücre, uiputfile, datacursormode,
// warning/tic/addpath çıktıları, klasör işlevleri (pwd/cd/dir/ls/exist)
const ML = require('./ml_load.js')(['mlab1.js', 'mlab2.js', 'mlab3.js', 'mlab4.js']); let bad = 0;
function run(code, ctx, folder) { let o = ''; const notes = []; const it = new ML.Interp({out: s => { o += s; }, ctx: Object.assign({saveMat: () => {}, notify: (k, p) => notes.push([k, p])}, ctx || {})}); if (folder) it.folder = folder; let err = null; try { it.run(code); } catch (e) { err = e.message; } return {o, err, it, notes}; }
function ck(name, code, want, opt) { const r = run(code, opt && opt.ctx, opt && opt.folder); const ok = !r.err && (typeof want === 'function' ? want(r) : r.o.includes(want)); if (!ok) { bad++; console.log('HATA', name, '\n  çıktı:', JSON.stringify(r.o.slice(-300)), '\n  hata:', r.err); } }
ck('save→who -file→load (işlev içinde)', `function r = f1()
  A_x = 1:3; A_y = 5; B_z = 'q'; v = whos; nd = {};
  for i = 1:numel(v), if strncmp(v(i).name, 'A_', 2), nd{end+1} = v(i).name; end, end
  save('Test_data.mat', nd{:}); r = who('-file', 'Test_data.mat');
end
l = f1(); fprintf('%s,', l{:}); P = load('Test_data.mat'); fprintf('|%d', P.A_x); load Test_data.mat A_y; fprintf('|%d\\n', A_y)`, 'A_x,A_y,|1|2|3|5');
ck('kayıttan sonra değişiklik kopyayı bozmaz', `x = [1 2 3]; save('k.mat','x'); x(2) = 99; S = load('k.mat'); disp(S.x(2))`, '2');
ck('save -struct / -append / whos -file', `S.a = 1; S.b = [1 2]; save('s.mat','-struct','S','b'); c = 7; save('s.mat','c','-append'); w = whos('-file','s.mat'); fprintf('%s ', w.name); fprintf('%d\\n', exist('s.mat','file'))`, r => /b c 2/.test(r.o.replace(/\s+/g, ' ')));
ck('[~,i] = (find(...))', `A = zeros(4,5,6); A(2,3,4) = 249; [~,f] = (find(A(2,3,:) == 249, 1, 'first')); g = f + 45; disp(g)`, '49');
ck('[m,i] = (max(...))', `[m, i] = (max([1 5 2])); fprintf('%d %d\\n', m, i)`, '5 2');
ck('unique hücre stable/satır/ia ic', `[c, ia, ic] = unique({'q','w','q','a'}); fprintf('%s ', c{:}); fprintf('|%d', size(c)); fprintf('|%d', ia); fprintf('|%d', ic); u = unique({'q','w','q','a'}, 'stable'); fprintf(' %s', u{:}); fprintf('\\n')`, 'a q w |1|3|4|1|2|2|3|2|1 q w a');
ck('uiputfile varsayılan adı 3. argümandan', `[f, p] = uiputfile('*.mat', 'Başlık', 'oneri.mat'); disp(f)`, 'oneri.mat');
ck('datacursormode nesnesi + getCursorInfo', `f = figure; dcm = datacursormode(f); set(dcm, 'UpdateFcn', @disp); c = getCursorInfo(dcm); disp(isempty(c))`, '1');
ck('warning/tic/addpath çıktıları', `s = warning('off', 'all'); warning(s); t = tic; e = toc(t); p = addpath('x'); disp(e >= 0)`, '1');
ck('klasör: pwd/cd/dir/ls/exist', `p = pwd; disp(p); dir; d = dir('*.mat'); disp(d(1).name); disp(isfolder('alt')); disp(exist('a.mat','file')); cd alt
ls`, r => r.o.includes('C:\\Veri') && r.o.includes('a.mat') && r.notes.some(n => n[0] === 'cd' && n[1] === 'alt'), {folder: {dir: 'C:\\Veri', items: [{name: 'alt', dir: true}, {name: 'a.mat', dir: false, size: 10}, {name: 'f.m', dir: false, size: 4}]}});
console.log(bad ? `mlab2: ${bad} HATA` : 'mlab2: OK'); process.exit(bad ? 1 : 0);
