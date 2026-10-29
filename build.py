import re,sys
import os,shutil
d=os.path.dirname(os.path.abspath(__file__))+'/'
dsp_src=re.sub(r"if \(typeof module !== 'undefined'\) module\.exports = \w+;\n",'',open(d+'src/dsp.js').read())
import json
js=''.join(open(d+'src/'+f).read()+'\n' for f in ['mat.js','h5.js','xlsx.js', 'bin.js', 'frm.js', 'unv.js', 'tdms.js', 'mdf.js', 'dsp.js','expr.js','plot.js','store.js','app1.js','app2.js', 'app3.js', 'app4.js', 'app5.js', 'app6.js', 'app7.js', 'app8.js', 'app9.js', 'app10.js', 'app11.js', 'qual.js', 'testan.js', 'xan.js', 'xan2.js', 'xan3.js', 'xan4.js', 'app12.js', 'mlab1.js', 'mlab2.js', 'mlab3.js', 'mlab4.js', 'app13.js'])
js=js.replace('/*DSPSRC*/', 'const __DSP_SRC = '+json.dumps(dsp_src)+';')
ml_src=''.join(open(d+'src/'+f).read()+'\n' for f in ['mlab1.js','mlab2.js','mlab3.js','mlab4.js'])
js=js.replace('/*MLSRC*/', 'const __ML_SRC = '+json.dumps(ml_src)+';')
js=re.sub(r"if \(typeof module !== 'undefined'\) module\.exports = \w+;\n",'',js)
html=open(d+'src/index.html').read().replace('/*CSS*/',open(d+'src/style.css').read()).replace('/*JS*/',js.replace('</script>','<\\/script>'))
open(d+'dist/matview.html','w').write(html); print(len(html)//1024,'KB')
shutil.copy(d+'dist/matview.html',d+'launcher/matview.html')
