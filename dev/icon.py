"""Draw the Home Screen icon: the game's globe seen from above Europe and Africa, with a pin on Poland.

Writes icon.svg (vector, from assets/world.json) in the game folder; icon-180.png and icon-512.png are then
rendered from it in headless Chrome (opaque, since iOS shows transparency as black). Plain Python, no packages.

    python dev/icon.py
"""
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from check import GAME, decode, load
SIZE = 512                      # the SVG's viewBox
R = 214                         # globe radius
CX, CY = 256, 262
LON0, LAT0 = 14, 24             # the point of the globe facing us
MIN_STEP = 2.2                  # drop outline points closer than this (viewBox units)
PIN = (19.4, 52.1)              # Poland, the game's HOME
# the game's colours (game.js)
BG = '#14204a'
OCEAN, COAST = '#2f86d6', '#1c5c9e'
COLOURS = ['#ffd45c', '#8fd16a', '#ff9eb8', '#c3a3f2', '#ffad6b']
ANTARCTICA = '#f4f7ff'

CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          r'C:\Program Files\Google\Chrome\Application\chrome.exe',
          r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
          r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe']


def project(lon, lat):
    """Orthographic projection; a point on the far side is pulled onto the rim (good enough for fills)."""
    l, p = math.radians(lon - LON0), math.radians(lat)
    p0 = math.radians(LAT0)
    x = math.cos(p) * math.sin(l)
    y = math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(l)
    front = math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(l) >= 0
    if not front:
        n = math.hypot(x, y) or 1
        x, y = x / n, y / n
    return CX + R * x, CY - R * y, front


def ring_path(ring):
    pts = [project(lon, lat) for lon, lat in ring]
    if not any(f for _, _, f in pts):
        return ''
    out = []
    for x, y, _ in pts:
        if out and math.hypot(x - out[-1][0], y - out[-1][1]) < MIN_STEP:
            continue
        out.append((x, y))
    xs, ys = [x for x, _ in out], [y for _, y in out]
    if len(out) < 3 or max(xs) - min(xs) + max(ys) - min(ys) < 3:   # too small to see
        return ''
    return 'M' + 'L'.join(f'{x:.0f} {y:.0f}' for x, y in out) + 'Z'


def svg():
    world = load('world.json')
    q = world['q']
    shapes = []
    for c in world['countries']:
        d = ''.join(ring_path(decode(ring, q)) for poly in c['polys'] for ring in poly)
        if d:
            fill = ANTARCTICA if c['cont'] == 'AN' else COLOURS[c['c'] % len(COLOURS)]
            shapes.append(f'<path fill="{fill}" d="{d}"/>')   # (inner rings are holes: fill-rule below)
    px, py, _ = project(*PIN)
    pin = (f'<g transform="translate({px:.1f} {py:.1f})">'
           '<ellipse cx="0" cy="2" rx="13" ry="5" fill="#000" opacity=".25"/>'
           '<path d="M0 0C-8-16-26-30-26-50a26 26 0 0 1 52 0C26-30 8-16 0 0Z" fill="#ff4d5e" stroke="#fff" stroke-width="5"/>'
           '<circle cx="0" cy="-50" r="10" fill="#fff"/></g>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">'
        '<defs>'
        '<radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#26387a"/>'
        f'<stop offset="1" stop-color="{BG}"/></radialGradient>'
        '<radialGradient id="glow" r=".5"><stop offset=".8" stop-color="#7cc4ff" stop-opacity=".55"/>'
        '<stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="shade" cx=".36" cy=".3" r=".78"><stop offset=".45" stop-color="#fff" stop-opacity=".14"/>'
        '<stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#061030" stop-opacity=".45"/></radialGradient>'
        f'<clipPath id="disc"><circle cx="{CX}" cy="{CY}" r="{R}"/></clipPath>'
        '</defs>'
        f'<rect width="{SIZE}" height="{SIZE}" fill="url(#bg)"/>'
        f'<circle cx="{CX}" cy="{CY}" r="{R * 1.1:.0f}" fill="url(#glow)"/>'
        f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="{OCEAN}"/>'
        f'<g clip-path="url(#disc)" fill-rule="evenodd" stroke="{COAST}" stroke-width="1.6" stroke-linejoin="round">{"".join(shapes)}</g>'
        f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#shade)"/>'
        f'{pin}</svg>\n')


def render(svg_path):
    chrome = (next((p for p in CHROME if Path(p).exists()), None)
              or next(filter(None, map(shutil.which, ('chrome', 'google-chrome', 'chromium', 'chromium-browser'))), None))
    if not chrome:
        sys.exit('Chrome not found: render icon-180.png and icon-512.png from icon.svg by hand')
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:   # (Chrome can still hold its profile)
        for px in (512, 180):
            html = Path(tmp) / 'icon.html'
            html.write_text(f'<html><body style="margin:0;background:{BG}">'
                            f'<img src="{svg_path.as_uri()}" width="{px}" height="{px}" style="display:block"></body></html>')
            out = GAME / f'icon-{px}.png'
            subprocess.run([chrome, '--headless', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={tmp}/profile',
                            f'--window-size={px},{px}', '--default-background-color=ff14204a',
                            f'--screenshot={out}', html.as_uri()], check=True, capture_output=True)
            print(out.name, out.stat().st_size, 'bytes')


if __name__ == '__main__':
    path = GAME / 'icon.svg'
    path.write_text(svg(), encoding='utf-8', newline='\n')
    print('icon.svg', path.stat().st_size, 'bytes')
    render(path)
