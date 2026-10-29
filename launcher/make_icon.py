# MATView simgesi ve manifest: matview.svg → matview.ico (16–256 px); matview.manifest (DPI farkındalığı, asInvoker)
# → rsrc_windows_amd64.syso (Go derleyicisi exe'ye otomatik ekler). Kaynak kimlikleri: manifest 1, simge grubu 2.
# Gerekenler (yalnız simge değiştiğinde): playwright (Chromium), pillow, rsrc (go install github.com/akavel/rsrc@v0.10.2)
import asyncio, io, os, subprocess, sys
from PIL import Image
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__))
SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
async def render():
    svg = open(os.path.join(D, 'matview.svg')).read()
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        for s in SIZES:
            await pg.set_viewport_size({'width': s, 'height': s})
            await pg.set_content('<html><body style="margin:0;background:transparent">' + svg.replace('<svg ', f'<svg width="{s}" height="{s}" ') + '</body></html>')
            out[s] = Image.open(io.BytesIO(await pg.screenshot(omit_background=True))).convert('RGBA')
        await b.close()
    return out
imgs = asyncio.run(render())
ico = os.path.join(D, 'matview.ico')
imgs[256].save(ico, format='ICO', sizes=[(s, s) for s in SIZES], append_images=[imgs[s] for s in SIZES if s != 256])
rsrc = os.environ.get('RSRC', 'rsrc')
subprocess.run([rsrc, '-manifest', os.path.join(D, 'matview.manifest'), '-ico', ico, '-arch', 'amd64', '-o', os.path.join(D, 'rsrc_windows_amd64.syso')], check=True)
print('ok', ico)
