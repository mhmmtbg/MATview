import re,sys
import os,shutil
d=os.path.dirname(os.path.abspath(__file__))+'/'
js=''.join(open(d+'src/'+f).read()+'\n' for f in ['mat.js','h5.js','xlsx.js', 'bin.js', 'unv.js', 'tdms.js', 'dsp.js','expr.js','plot.js','store.js','app1.js','app2.js', 'app3.js', 'app4.js', 'app5.js', 'app6.js', 'app7.js', 'app8.js', 'app9.js', 'app10.js', 'app11.js', 'qual.js', 'testan.js'])
js=re.sub(r"if \(typeof module !== 'undefined'\) module\.exports = \w+;\n",'',js)
html=open(d+'src/index.html').read().replace('/*CSS*/',open(d+'src/style.css').read()).replace('/*JS*/',js.replace('</script>','<\\/script>'))
open(d+'dist/matview.html','w').write(html); print(len(html)//1024,'KB')
shutil.copy(d+'dist/matview.html',d+'launcher/matview.html')
