import re, os, shutil, json
d = os.path.dirname(os.path.abspath(__file__)) + '/'
MOD_RE = r"if \(typeof module !== 'undefined'\) module\.exports = \w+;\n"
def src(f): return re.sub(MOD_RE, '', open(d + 'src/' + f, encoding='utf-8').read())
FILES = ['mat.js', 'h5.js', 'xlsx.js', 'bin.js', 'frm.js', 'unv.js', 'tdms.js', 'mdf.js', 'dsp.js', 'expr.js', 'plot.js', 'store.js', 'app1.js', 'app2.js', 'app3.js', 'app4.js', 'app5.js', 'app6.js', 'app7.js', 'app8.js', 'app9.js', 'app10.js', 'app11.js', 'qual.js', 'testan.js', 'xan.js', 'xan2.js', 'xan3.js', 'xan4.js', 'app12.js', 'mlab1.js', 'mlab2.js', 'mlab3.js', 'mlab4.js', 'app13.js', 'wsp.js', 'tlm.js', 'app14.js']
ML = ['mlab1.js', 'mlab2.js', 'mlab3.js', 'mlab4.js']
# DSP ve MATLAB yorumlayıcısı yalnız bir kez gömülür: kod bir üretici işlevin gövdesidir; işçiler (Web Worker)
# kaynaklarını çalışma zamanında Function.prototype.toString ile bu işlevden alır (eskiden ayrıca JSON dizesi olarak gömülüyordu).
parts = []
for f in FILES:
    if f == 'dsp.js': parts.append('function __dspFactory() {\n' + src(f) + '\nreturn DSP;\n}\nconst DSP = __dspFactory();\n')
    elif f in ML:
        if f == ML[0]: parts.append('function __mlFactory() {\n' + ''.join(src(m) + '\n' for m in ML) + 'return MLAB;\n}\nconst MLAB = __mlFactory();\n')
    else: parts.append(src(f) + '\n')
js = ''.join(parts)
js = js.replace('/*DSPSRC*/', "const __DSP_SRC = 'const DSP = (' + __dspFactory.toString() + ')();\\n';")
js = js.replace('/*MLSRC*/', "const __ML_SRC = 'const MLAB = (' + __mlFactory.toString() + ')();\\n';")
# Telemetri modülü (iframe srcdoc): '<' kaçışlı JSON dizesi — dış <script> içinde </script> / <!-- dizileri oluşmaz
tlm = open(d + 'src/tlm/telemetri.html', encoding='utf-8').read()
js = js.replace('/*TLMSRC*/', 'const __TLM_HTML = ' + json.dumps(tlm, ensure_ascii=False).replace('<', '\\u003c') + ';')
html = open(d + 'src/index.html', encoding='utf-8').read().replace('/*CSS*/', open(d + 'src/style.css', encoding='utf-8').read()).replace('/*JS*/', js.replace('</script>', '<\\/script>'))
open(d + 'dist/matview.html', 'w', encoding='utf-8').write(html); print(len(html) // 1024, 'KB')
shutil.copy(d + 'dist/matview.html', d + 'launcher/matview.html')
