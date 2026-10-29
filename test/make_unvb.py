# ikili (58b) ve karışık UNV test dosyaları (pyuff ile) -> /tmp/unvb/ ; beklenen değerler exp.json
import numpy as np, pyuff, os, json, shutil, sys
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/unvb'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d); rng = np.random.default_rng(11)
def mk(y, x, ftype, binary, dtype=4, cplx=False, even=True):
    return {'type': 58, 'binary': binary, 'func_type': ftype, 'func_id': 1, 'ver_num': 1, 'load_case_id': 0, 'rsp_ent_name': 'Kanal', 'rsp_node': 1, 'rsp_dir': 3, 'ref_ent_name': '', 'ref_node': 0, 'ref_dir': 0,
            'id1': 'Test %d' % ftype, 'id2': 'NONE', 'id3': 'NONE', 'id4': 'NONE', 'id5': 'NONE', 'ord_data_type': dtype, 'abscissa_spacing': 1 if even else 0, 'abscissa_min': x[0], 'abscissa_inc': x[1] - x[0], 'x': x, 'data': y,
            'abscissa_axis_lab': 'Frequency', 'abscissa_axis_units_lab': 'Hz', 'ordinate_axis_lab': 'Accel', 'ordinate_axis_units_lab': 'g', 'orddenom_axis_lab': 'NONE', 'orddenom_axis_units_lab': 'NONE', 'z_axis_axis_lab': 'NONE', 'z_axis_axis_units_lab': 'NONE',
            'abscissa_spec_data_type': 18, 'abscissa_len_unit_exp': 0, 'abscissa_force_unit_exp': 0, 'abscissa_temp_unit_exp': 0, 'ordinate_spec_data_type': 8, 'ordinate_len_unit_exp': 0, 'ordinate_force_unit_exp': 0, 'ordinate_temp_unit_exp': 0,
            'orddenom_spec_data_type': 0, 'orddenom_len_unit_exp': 0, 'orddenom_force_unit_exp': 0, 'orddenom_temp_unit_exp': 0, 'z_axis_spec_data_type': 0, 'z_axis_len_unit_exp': 0, 'z_axis_force_unit_exp': 0, 'z_axis_temp_unit_exp': 0, 'z_axis_value': 0.0}
x = np.arange(0, 400) * 2.5; psd = np.abs(rng.normal(1e-3, 3e-4, 400)); tr = rng.normal(0, 1, 2048); xt = np.arange(2048) / 1000.0
cx = rng.normal(0, 1, 300) + 1j * rng.normal(0, 1, 300); xc = np.arange(300) * 1.0
exp = {}
for nm, sets in {'bin.unv': [(psd, x, 9, 1), (tr, xt, 1, 1), (cx, xc, 4, 1)], 'mix.unv': [(psd, x, 9, 0), (tr, xt, 1, 1), (psd * 2, x, 9, 1)]}.items():
    u = pyuff.UFF(os.path.join(d, nm)); first = True
    for y, xx, ft, b in sets:
        s = mk(y, xx, ft, b, dtype=6 if np.iscomplexobj(y) else 4); u.write_sets(s, 'add')
    exp[nm] = [[float(np.sum(np.real(y))), float(np.sum(np.imag(y))), len(y), ft] for y, xx, ft, b in sets]
json.dump(exp, open(os.path.join(d, 'exp.json'), 'w')); print('ok')
