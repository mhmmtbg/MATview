#!/bin/bash
# Tüm testleri çalıştırır (sentetik veri; kullanıcı verisi gerekmez). Kullanım: bash test/run_tests.sh
cd "$(dirname "$0")/.." || exit 1; python3 build.py >/dev/null || exit 1; fail=0
run() { local n="$1"; shift; if out=$("$@" 2>&1); then echo "OK    $n"; else echo "HATA  $n"; echo "$out" | tail -5 | sed 's/^/      /'; fail=$((fail+1)); fi; }
python3 test/make_h5.py >/dev/null 2>&1; python3 test/make_tdms.py >/dev/null 2>&1
for t in t_dsp t_val t_auto t_an t_bin t_unv t_tdms t_h5 t_mat t_store; do [ -f test/$t.js ] && run $t node test/$t.js; done
run val_scipy python3 test/val_scipy.py
for p in pw_qual pw_rez pw_tdms pw_clr pw_unv pw_an pw_lv; do [ -f test/$p.py ] && run $p python3 test/$p.py; done
[ -f test/extra_tests.sh ] && source test/extra_tests.sh
echo; [ $fail = 0 ] && echo "TÜM TESTLER GEÇTİ" || echo "$fail test BAŞARISIZ"; exit $fail
