import sys
h = open('dist/matview.html').read(); open('/tmp/_bundle.js', 'w').write(h[h.rindex('<script>') + 8:h.rindex('</script>')])
