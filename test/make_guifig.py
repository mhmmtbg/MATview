# demoGUI.fig: GUIDE benzeri hgS_070000 yapısı (scipy ile; çocuklar hücre dizisi olarak)
import numpy as np, scipy.io as sio, sys, os
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/demoGUI.fig'
def node(t, props, kids=()):
    ch = np.empty((len(kids),), dtype=object)
    for i, k in enumerate(kids): ch[i] = k
    return {'type': t, 'handle': 1.0, 'properties': props, 'children': ch if len(kids) else np.zeros((0, 0))}
def ui(style, s, pos, tag, **kw):
    p = {'Style': style, 'String': s, 'Position': np.array(pos, float), 'Units': 'normalized', 'Tag': tag, 'FontSize': 10.0}; p.update(kw); return node('uicontrol', p)
kids = [ui('pushbutton', 'Ciz', [0.05, 0.85, 0.2, 0.08], 'pushbutton1'), ui('pushbutton', 'Dosya Sec', [0.3, 0.85, 0.2, 0.08], 'pushbutton2'),
        ui('text', '-', [0.55, 0.85, 0.4, 0.08], 'text1', BackgroundColor=np.array([1.0, 1.0, 0.0])), ui('popupmenu', np.array(['bir', 'iki', 'uc '], dtype=object), [0.05, 0.72, 0.2, 0.08], 'popupmenu1', Value=1.0),
        ui('edit', '', [0.3, 0.72, 0.2, 0.08], 'edit1'),
        node('uipanel', {'Title': 'Panel', 'Units': 'normalized', 'Position': np.array([0.55, 0.62, 0.4, 0.2]), 'Tag': 'uipanel1'}, [ui('checkbox', 'Izgara', [0.1, 0.3, 0.8, 0.4], 'checkbox1', Value=0.0)]),
        node('axes', {'Units': 'normalized', 'Position': np.array([0.08, 0.08, 0.86, 0.5]), 'Tag': 'axes1'})]
fig = node('figure', {'Name': 'demoGUI', 'Units': 'characters', 'Position': np.array([10.0, 10, 120, 40]), 'Tag': 'figure1'}, kids)
sio.savemat(out, {'hgS_070000': fig})
