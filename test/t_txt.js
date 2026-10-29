// .txt içe aktarma: boşluk/sekme ayraçlı, açıklama + giriş satırlı, ondalık virgüllü metin dosyaları
const fs = require('fs'), src = fs.readFileSync(__dirname + '/../src/app7.js', 'utf8');
eval(src.slice(src.indexOf('function parseCSV'), src.indexOf('async function readTextSmart')) + ';global.parseCSV = parseCSV;');
let bad = 0; const ck = (c, m) => { if (!c) { console.log('HATA:', m); bad++; } };
let r = parseCSV('# Kayıt: deneme\n% not\nInstrument: X-100\nDate: 2026-10-01\n\nTime(s)   Acc_X(g)   Acc_Y(g)\n0.000   0.10   -0.20\n0.001   0.12   -0.18\n0.002   0.11   -0.19\n');
ck(r.delim === 'ws' && r.rows.length === 4 && r.rows[0].length === 3 && r.rows[0][1] === 'Acc_X(g)' && r.rows[3][2] === '-0.19' && r.skipped >= 4, 'boşluk ayraçlı: ' + JSON.stringify(r));
r = parseCSV('Zaman\tDeğer\n0,0\t1,5\n0,1\t1,6\n'); ck(r.delim === '\t' && r.rows.length === 3 && r.rows[1][1] === '1,5', 'sekme');
r = parseCSV('a;b;c\n1;2;3\n4;5;6\n'); ck(r.delim === ';' && r.rows.length === 3, 'noktalı virgül');
r = parseCSV('t,x\n0,1\n1,2\n'); ck(r.delim === ',' && r.rows.length === 3 && r.skipped === 0, 'virgül');
r = parseCSV('Rapor başlığı satırı burada yazılı\n1 2 3\n4 5 6\nSon\n'); ck(r.delim === 'ws' && r.rows.length === 2 && r.rows[0].join() === '1,2,3', 'giriş/son satır atma: ' + JSON.stringify(r.rows));
r = parseCSV('x\n1\n2\n3\n'); ck(r.rows.length === 4, 'tek sütun');
console.log(bad ? 'BAŞARISIZ ' + bad : 'OK t_txt'); process.exit(bad ? 1 : 0);
