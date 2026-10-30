#!/bin/bash
# Tüm testleri çalıştırır (sentetik veri; kullanıcı verisi gerekmez). Kullanım: bash test/run_tests.sh
cd "$(dirname "$0")/.." || exit 1; python3 build.py >/dev/null || exit 1; fail=0
run() { local n="$1"; shift; if out=$("$@" 2>&1); then echo "OK    $n"; else echo "HATA  $n"; echo "$out" | tail -5 | sed 's/^/      /'; fail=$((fail+1)); fi; }
python3 - <<'PY'
import re,subprocess
h=open('dist/matview.html').read(); i=h.rindex('<script>')+8; j=h.rindex('</script>'); open('/tmp/_bundle.js','w').write(h[i:j])
PY
run sozdizimi node --check /tmp/_bundle.js
python3 test/make_h5.py >/dev/null 2>&1; python3 test/make_tdms.py >/dev/null 2>&1; python3 test/make_nest.py >/dev/null 2>&1; python3 test/make_unvb.py >/dev/null 2>&1; python3 test/make_tdms_daq.py >/dev/null 2>&1; python3 test/make_mdf.py >/dev/null 2>&1; python3 test/make_frame.py >/dev/null 2>&1; python3 test/make_tree.py >/dev/null 2>&1; python3 test/make_mdf3.py >/dev/null 2>&1
node test/make_tlm.js /tmp/_mv_tlm >/dev/null 2>&1
for t in t_dsp t_val t_auto t_an t_bin t_unv t_tdms t_h5 t_mat t_store t_nest t_unvb t_tdmsq t_mdf t_frm t_cset t_txt t_hampel t_pyr t_mlab t_mlab2 t_mlab3 t_tree t_mdf3 t_gui t_tlm; do [ -f test/$t.js ] && run $t node test/$t.js; done
run val_scipy python3 test/val_scipy.py
run val_mlab python3 test/val_mlab.py
run val_tlm python3 test/val_tlm.py
run val_faz4 python3 test/val_faz4.py
for p in pw_qual pw_cp pw_ctl pw_rez pw_tdms pw_clr pw_unv pw_an pw_lv pw_tools pw_shth pw_batch pw_nest pw_mdf pw_frm pw_swap pw_code pw_code2 pw_gui pw_wsp pw_tsel pw_tlm pw_faz2 pw_faz3 pw_faz4 pw_faz5 pw_faz6 pw_hover pw_layout; do [ -f test/$p.py ] && run $p python3 test/$p.py; done
[ -f test/extra_tests.sh ] && source test/extra_tests.sh
echo; [ $fail = 0 ] && echo "TÜM TESTLER GEÇTİ" || echo "$fail test BAŞARISIZ"; exit $fail
