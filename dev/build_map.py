"""Build assets/world.json, the globe's countries, from Natural Earth.

Source: Natural Earth 1:50m admin-0 countries (public domain) as packaged by world-atlas@2.0.2 (ISC),
downloaded once into dev/data/ (not committed). Plain Python, no packages.

    python dev/build_map.py

What it does:
- Fixes borders: Crimea is a separate polygon of Russia in the data; it is moved to Ukraine and the line
  between them dropped (Crimea is Ukraine, as Poland and the UN say). Northern Cyprus is merged into
  Cyprus and Somaliland into Somalia the same way.
- Simplifies every shared border once (so neighbours still meet exactly), then adds points so no edge is
  longer than MAX_EDGE degrees (a long straight border must bend with the globe, not cut through it).
- Makes rings that cross the 180th meridian continuous (longitudes may run past 180) and closes
  Antarctica through the South Pole, so every ring can be cut into triangles in longitude/latitude.
- Adds a display name, a spoken name, a continent, a map colour (neighbours never share one), a label
  point (the spot deepest inside the biggest part), a box around the main parts (for the camera) and
  the two-letter flag code (ISO 3166 alpha-2 from i18n-iso-countries@7.14.0, MIT, also downloaded into
  dev/data/; flags are copied by dev/flags.py).

Output, coordinates as integers of 1/Q degree, each list delta-encoded (first pair absolute):
  { q, countries: [{ id, name, say, cont, c, flag, label: [lon, lat], box: [w, s, e, n],
                     polys: [[outer, hole, ...], ...] }],      ring = [lon, lat, dlon, dlat, ...]
    coast: [line, ...], border: [line, ...] }                  line = same encoding as a ring
"""
import json
import math
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
SRC_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json'
SRC = HERE / 'data' / 'countries-50m.json'
OUT = GAME / 'assets' / 'world.json'
CODES_URL = 'https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.14.0/codes.json'
CODES = HERE / 'data' / 'iso-codes.json'
FLAG_CODES = {'Kosovo': 'xk', 'Indian Ocean Ter.': 'cx'}   # no ISO number in the data

Q = 100           # store coordinates in 1/100 degree (about 1 km)
SIMPLIFY = 0.01   # Douglas-Peucker tolerance in degrees of latitude (about 1 km, near the source's own detail)
MAX_EDGE = 1.0    # degrees; longer edges get extra points
MAIN_PART = 0.2   # parts at least this share of the biggest one count for the camera box
COLOURS = 5

MERGE = {'N. Cyprus': 'Cyprus', 'Somaliland': 'Somalia'}
CRIMEA = (34.1, 45.0)

# Data names that are shortened or not what a child hears.
NAMES = {
    'Antigua and Barb.': 'Antigua and Barbuda', 'Bosnia and Herz.': 'Bosnia and Herzegovina',
    'Br. Indian Ocean Ter.': 'British Indian Ocean Territory', 'British Virgin Is.': 'British Virgin Islands',
    'Cabo Verde': 'Cape Verde', 'Cayman Is.': 'Cayman Islands', 'Central African Rep.': 'Central African Republic',
    'Cook Is.': 'Cook Islands', "Côte d'Ivoire": 'Ivory Coast', 'Curaçao': 'Curacao', 'Dem. Rep. Congo': 'DR Congo',
    'Dominican Rep.': 'Dominican Republic', 'Eq. Guinea': 'Equatorial Guinea', 'eSwatini': 'Eswatini',
    'Faeroe Is.': 'Faroe Islands', 'Falkland Is.': 'Falkland Islands', 'Fr. Polynesia': 'French Polynesia',
    'Fr. S. Antarctic Lands': 'French Southern Lands', 'Heard I. and McDonald Is.': 'Heard and McDonald Islands',
    'Indian Ocean Ter.': 'Christmas Island', 'Ashmore and Cartier Is.': 'Ashmore and Cartier Islands',
    'Macao': 'Macau', 'Macedonia': 'North Macedonia', 'Marshall Is.': 'Marshall Islands',
    'N. Mariana Is.': 'Northern Mariana Islands', 'Pitcairn Is.': 'Pitcairn Islands', 'S. Sudan': 'South Sudan',
    'S. Geo. and the Is.': 'South Georgia', 'Solomon Is.': 'Solomon Islands', 'St-Barthélemy': 'Saint Barthelemy',
    'St-Martin': 'Saint Martin', 'St. Kitts and Nevis': 'Saint Kitts and Nevis',
    'St. Pierre and Miquelon': 'Saint Pierre and Miquelon', 'St. Vin. and Gren.': 'Saint Vincent and the Grenadines',
    'São Tomé and Principe': 'Sao Tome and Principe', 'Timor-Leste': 'East Timor',
    'Turks and Caicos Is.': 'Turks and Caicos Islands', 'U.S. Virgin Is.': 'U.S. Virgin Islands',
    'United States of America': 'United States', 'Vatican': 'Vatican City', 'W. Sahara': 'Western Sahara',
    'Wallis and Futuna Is.': 'Wallis and Futuna',
}
# Said with "the" ("This is the United States.").
THE = {'United States', 'United Kingdom', 'Netherlands', 'Philippines', 'Bahamas', 'Gambia', 'Maldives',
       'Seychelles', 'United Arab Emirates', 'Dominican Republic', 'Central African Republic', 'Isle of Man',
       'Siachen Glacier', 'British Indian Ocean Territory', 'Comoros', 'Solomon Islands', 'Marshall Islands',
       'Cook Islands', 'Cayman Islands', 'Faroe Islands', 'Falkland Islands', 'British Virgin Islands',
       'U.S. Virgin Islands', 'Northern Mariana Islands', 'Pitcairn Islands', 'Turks and Caicos Islands',
       'Ashmore and Cartier Islands', 'Heard and McDonald Islands', 'French Southern Lands'}

CONTINENTS = {
    'EU': 'Albania|Andorra|Austria|Belarus|Belgium|Bosnia and Herz.|Bulgaria|Croatia|Cyprus|Czechia|Denmark|Estonia|'
          'Faeroe Is.|Finland|France|Germany|Greece|Guernsey|Hungary|Iceland|Ireland|Isle of Man|Italy|Jersey|Kosovo|'
          'Latvia|Liechtenstein|Lithuania|Luxembourg|Macedonia|Malta|Moldova|Monaco|Montenegro|Netherlands|Norway|'
          'Poland|Portugal|Romania|Russia|San Marino|Serbia|Slovakia|Slovenia|Spain|Sweden|Switzerland|Ukraine|'
          'United Kingdom|Vatican|Åland',
    'AS': 'Afghanistan|Armenia|Azerbaijan|Bahrain|Bangladesh|Bhutan|Brunei|Cambodia|China|Georgia|Hong Kong|India|'
          'Indonesia|Iran|Iraq|Israel|Japan|Jordan|Kazakhstan|Kuwait|Kyrgyzstan|Laos|Lebanon|Macao|Malaysia|Maldives|'
          'Mongolia|Myanmar|Nepal|North Korea|Oman|Pakistan|Palestine|Philippines|Qatar|Saudi Arabia|Singapore|'
          'South Korea|Sri Lanka|Syria|Taiwan|Tajikistan|Thailand|Timor-Leste|Turkey|Turkmenistan|'
          'United Arab Emirates|Uzbekistan|Vietnam|Yemen|Siachen Glacier|Br. Indian Ocean Ter.',
    'AF': 'Algeria|Angola|Benin|Botswana|Burkina Faso|Burundi|Cabo Verde|Cameroon|Central African Rep.|Chad|Comoros|'
          "Congo|Côte d'Ivoire|Dem. Rep. Congo|Djibouti|Egypt|Eq. Guinea|Eritrea|eSwatini|Ethiopia|Gabon|Gambia|"
          'Ghana|Guinea|Guinea-Bissau|Kenya|Lesotho|Liberia|Libya|Madagascar|Malawi|Mali|Mauritania|Mauritius|Morocco|'
          'Mozambique|Namibia|Niger|Nigeria|Rwanda|S. Sudan|Saint Helena|São Tomé and Principe|Senegal|Seychelles|'
          'Sierra Leone|Somalia|South Africa|Sudan|Tanzania|Togo|Tunisia|Uganda|W. Sahara|Zambia|Zimbabwe',
    'NA': 'Anguilla|Antigua and Barb.|Aruba|Bahamas|Barbados|Belize|Bermuda|British Virgin Is.|Canada|Cayman Is.|'
          'Costa Rica|Cuba|Curaçao|Dominica|Dominican Rep.|El Salvador|Greenland|Grenada|Guatemala|Haiti|Honduras|'
          'Jamaica|Mexico|Montserrat|Nicaragua|Panama|Puerto Rico|St-Barthélemy|St-Martin|Sint Maarten|'
          'St. Kitts and Nevis|Saint Lucia|St. Pierre and Miquelon|St. Vin. and Gren.|Trinidad and Tobago|'
          'Turks and Caicos Is.|U.S. Virgin Is.|United States of America',
    'SA': 'Argentina|Bolivia|Brazil|Chile|Colombia|Ecuador|Falkland Is.|Guyana|Paraguay|Peru|Suriname|Uruguay|'
          'Venezuela|S. Geo. and the Is.',
    'OC': 'American Samoa|Ashmore and Cartier Is.|Australia|Cook Is.|Fiji|Fr. Polynesia|Guam|Indian Ocean Ter.|'
          'Kiribati|Marshall Is.|Micronesia|N. Mariana Is.|Nauru|New Caledonia|New Zealand|Niue|Norfolk Island|'
          'Palau|Papua New Guinea|Pitcairn Is.|Samoa|Solomon Is.|Tonga|Vanuatu|Wallis and Futuna Is.',
    'AN': 'Antarctica|Fr. S. Antarctic Lands|Heard I. and McDonald Is.',
}
CONTINENT = {n: c for c, text in CONTINENTS.items() for n in text.split('|')}


# ======== reading the topology ========

def fetch(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print('downloading', url)
        path.write_bytes(urllib.request.urlopen(url).read())
    return json.loads(path.read_text(encoding='utf-8'))


def flag_codes():
    return {num: a2.lower() for a2, _, num, *_ in fetch(CODES_URL, CODES)}


def load():
    fetch(SRC_URL, SRC)
    t = json.loads(SRC.read_text(encoding='utf-8'))
    (sx, sy), (tx, ty) = t['transform']['scale'], t['transform']['translate']
    arcs = []
    for a in t['arcs']:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append((x, y))
        arcs.append(pts)
    countries = []
    for g in t['objects']['countries']['geometries']:
        polys = [g['arcs']] if g['type'] == 'Polygon' else g['arcs'] if g['type'] == 'MultiPolygon' else []
        countries.append({'id': g.get('id'), 'src': g['properties']['name'], 'polys': [list(p) for p in polys]})
    return arcs, (lambda p: (p[0] * sx + tx, p[1] * sy + ty)), countries


def arc_pts(arcs, i):
    return arcs[i] if i >= 0 else arcs[~i][::-1]


def raw_ring(arcs, ll, ring):
    out = []
    for i in ring:
        out += [ll(p) for p in arc_pts(arcs, i)[(1 if out else 0):]]
    return out


def inside(pt, ring):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def area(ring):
    """Signed area in squared degrees, longitude scaled by cos(latitude)."""
    lat0 = sum(y for _, y in ring) / len(ring)
    k = math.cos(math.radians(lat0))
    return k * sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1])) / 2


# ======== border fixes ========

def dissolve(arcs, ll, country):
    """Drop the arcs a country now shares with itself, stitch what's left into rings, regroup into polygons."""
    rings = [r for p in country['polys'] for r in p]
    key = lambda i: i if i >= 0 else ~i
    count = Counter(key(i) for r in rings for i in r)
    keep = [i for r in rings for i in r if count[key(i)] == 1]
    start = lambda i: arc_pts(arcs, i)[0]
    end = lambda i: arc_pts(arcs, i)[-1]
    by_start = defaultdict(list)
    for i in keep:
        by_start[start(i)].append(i)
    used, out = set(), []
    for i in keep:
        if i in used:
            continue
        ring, cur = [i], end(i)
        used.add(i)
        while cur != start(ring[0]):
            nxt = next(j for j in by_start[cur] if j not in used)
            ring.append(nxt)
            used.add(nxt)
            cur = end(nxt)
        out.append(ring)
    # outer rings and holes by how deep each ring sits inside the others
    pts = [raw_ring(arcs, ll, r) for r in out]
    order = sorted(range(len(out)), key=lambda k: -abs(area(pts[k])))
    polys, owner = [], {}
    for k in order:
        containers = [j for j in order if j != k and abs(area(pts[j])) > abs(area(pts[k])) and inside(pts[k][0], pts[j])]
        if len(containers) % 2 == 0:
            owner[k] = len(polys)
            polys.append([out[k]])
        else:
            outer = min((j for j in containers if j in owner), key=lambda j: abs(area(pts[j])))
            polys[owner[outer]].append(out[k])
    country['polys'] = polys


def fix_borders(arcs, ll, countries):
    by = {c['src']: c for c in countries}
    russia, ukraine = by['Russia'], by['Ukraine']
    crimea = [p for p in russia['polys'] if inside(CRIMEA, raw_ring(arcs, ll, p[0]))]
    assert len(crimea) == 1, 'Crimea polygon not found in Russia'
    russia['polys'].remove(crimea[0])
    ukraine['polys'] += crimea
    dissolve(arcs, ll, ukraine)
    for src, dst in MERGE.items():
        by[dst]['polys'] += by[src]['polys']
        countries.remove(by[src])
        dissolve(arcs, ll, by[dst])
    print('Crimea moved to Ukraine;', ', '.join(f'{a} merged into {b}' for a, b in MERGE.items()))


# ======== simplifying and densifying the arcs ========

def unwrap(pts):
    out = [pts[0]]
    for x, y in pts[1:]:
        px = out[-1][0]
        x += 360 * round((px - x) / 360)
        out.append((x, y))
    return out


def seg_dist(p, a, b):
    k = math.cos(math.radians(p[1]))
    px, ax, bx = p[0] * k, a[0] * k, b[0] * k
    dx, dy = bx - ax, b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(px - ax - t * dx, p[1] - a[1] - t * dy)


def douglas_peucker(pts):
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = seg_dist(pts[i], pts[a], pts[b])
            if d > best:
                best, bi = d, i
        if best > SIMPLIFY:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify(pts):
    if len(pts) < 3:
        return pts
    if pts[0] == pts[-1]:   # a closed arc (an island): split at the far point so both halves keep their ends
        far = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
        if far == 0:
            return pts
        return douglas_peucker(pts[:far + 1])[:-1] + douglas_peucker(pts[far:])
    return douglas_peucker(pts)


def densify(pts):
    out = [pts[0]]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        n = math.ceil(max(abs(x2 - x1), abs(y2 - y1)) / MAX_EDGE)
        out += [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(1, n)]
        out.append((x2, y2))
    return out


def quantize(pts):
    out = []
    for x, y in pts:
        p = (round(x * Q), round(y * Q))
        if not out or p != out[-1]:
            out.append(p)
    if len(pts) > 1 and len(out) == 1:
        out.append(out[0])
    return out


# ======== rings, labels, colours ========

POLE = -90 * Q


def on_seam(p):
    return (p[0] - 180 * Q) % (360 * Q) == 0 or p[1] <= POLE + 1


def ring_from_arcs(proc, ring):
    pts = []
    for i in ring:
        a = proc[i] if i >= 0 else proc[~i][::-1]
        if pts:
            shift = 360 * Q * round((pts[-1][0] - a[0][0]) / (360 * Q))
            a = [(x + shift, y) for x, y in a][1:]
        pts += a
    wrap = pts[-1][0] - pts[0][0]
    if wrap == 0:
        pts = pts[:-1]
    else:   # goes once round the globe: close it through the pole on its side
        pole = POLE if sum(y for _, y in pts) < 0 else -POLE
        pts = pts + [(pts[-1][0], pole), (pts[0][0], pole)]
    if all(on_seam(p) for p in pts):
        return 'seam'
    if len(set(pts)) < 3:
        return None
    return pts


def label_point(poly):
    """The point inside the polygon farthest from its edges (a grid search, refined twice)."""
    outer = poly[0]
    lat0 = sum(y for _, y in outer) / len(outer)
    k = math.cos(math.radians(lat0))
    rings = [[(x * k, y) for x, y in r] for r in poly]
    edges = [(a, b) for r in rings for a, b in zip(r, r[1:] + r[:1])]
    xs, ys = [x for x, _ in rings[0]], [y for _, y in rings[0]]

    def score(x, y):
        if sum(inside((x, y), r) for r in rings) % 2 == 0:
            return -1
        best = 1e9
        for (ax, ay), (bx, by) in edges:
            dx, dy = bx - ax, by - ay
            L = dx * dx + dy * dy
            t = 0 if L == 0 else max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L))
            best = min(best, (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2)
        return best

    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    best = (-2, (x0 + x1) / 2, (y0 + y1) / 2)
    n = 16
    for _ in range(3):
        sx, sy = (x1 - x0) / n, (y1 - y0) / n
        for i in range(n):
            for j in range(n):
                x, y = x0 + (i + .5) * sx, y0 + (j + .5) * sy
                s = score(x, y)
                if s > best[0]:
                    best = (s, x, y)
        _, bx, by = best
        x0, x1, y0, y1 = bx - 2 * sx, bx + 2 * sx, by - 2 * sy, by + 2 * sy
    lon = best[1] / k
    lon = (lon + 180) % 360 - 180
    return [round(lon, 2), round(best[2], 2)]


def main_box(polys):
    areas = [abs(area(p[0])) for p in polys]
    big = max(areas)
    main = [p[0] for p, a in zip(polys, areas) if a >= MAIN_PART * big]

    def box(rings):
        xs = [x for r in rings for x, _ in r]
        ys = [y for r in rings for _, y in r]
        return [min(xs), min(ys), max(xs), max(ys)]
    b = box(main)
    if b[2] - b[0] > 180:   # parts on both sides of the 180th meridian: measure them on one side
        b = box([[(x + 360 if sum(p[0] for p in r) / len(r) < 0 else x, y) for x, y in r] for r in main])
    w = (b[0] + 180) % 360 - 180
    return [round(w, 2), round(b[1], 2), round(w + b[2] - b[0], 2), round(b[3], 2)]


def colour(countries, owners):
    nb = defaultdict(set)
    for who in owners.values():
        if len(who) == 2:
            a, b = who
            nb[a].add(b)
            nb[b].add(a)
    out = {}
    for c in sorted(range(len(countries)), key=lambda c: -len(nb[c])):
        taken = {out[n] for n in nb[c] if n in out}
        out[c] = next((k for k in range(COLOURS) if k not in taken), c % COLOURS)
    return out


def encode(pts):
    flat, px, py = [], 0, 0
    for x, y in pts:
        flat += [x - px, y - py]
        px, py = x, y
    return flat


# ======== main ========

def main():
    arcs, ll, countries = load()
    codes = flag_codes()
    fix_borders(arcs, ll, countries)

    used = sorted({i if i >= 0 else ~i for c in countries for p in c['polys'] for r in p for i in r})
    proc = {}
    for i in used:
        proc[i] = quantize(densify(simplify(unwrap([ll(p) for p in arcs[i]]))))

    out, owners, dropped = [], defaultdict(set), []
    for c in countries:
        polys = []
        for p in c['polys']:
            rings = [ring_from_arcs(proc, r) for r in p]
            if rings[0] == 'seam':   # Antarctica's ring along the pole: its other rings stand on their own
                polys += [[r] for r in rings[1:] if isinstance(r, list)]
            elif rings[0]:
                polys.append([r for r in rings if isinstance(r, list)])
        if not polys:
            dropped.append(c['src'])
            continue
        idx = len(out)
        for p in c['polys']:
            for r in p:
                for i in r:
                    owners[i if i >= 0 else ~i].add(idx)
        name = NAMES.get(c['src'], c['src'])
        if c['src'] not in CONTINENT:
            raise SystemExit(f'no continent for {c["src"]!r}')
        biggest = max(polys, key=lambda p: abs(area([(x / Q, y / Q) for x, y in p[0]])))
        fl = lambda r: [(x / Q, y / Q) for x, y in r]
        out.append({
            'id': c['id'], 'name': name, 'say': ('the ' if name in THE else '') + name,
            'cont': CONTINENT[c['src']],
            'flag': FLAG_CODES.get(c['src']) or codes.get(c['id']),
            'label': label_point([fl(r) for r in biggest]),
            'box': main_box([[fl(r) for r in p] for p in polys]),
            'polys': [[encode(r) for r in p] for p in polys],
        })
    colours = colour(out, owners)
    for k, c in enumerate(out):
        c['c'] = colours[k]

    coast, border = [], []
    for i in used:
        who = owners.get(i)
        if not who:
            continue
        line = []
        for a, b in zip(proc[i], proc[i][1:]):
            if on_seam(a) and on_seam(b):   # the 180th meridian and the pole aren't coastlines
                if len(line) > 1:
                    (coast if len(who) == 1 else border).append(encode(line))
                line = []
                continue
            if not line:
                line = [a]
            line.append(b)
        if len(line) > 1:
            (coast if len(who) == 1 else border).append(encode(line))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps({'q': Q, 'countries': out, 'coast': coast, 'border': border}, separators=(',', ':'),
                      ensure_ascii=False)
    OUT.write_text(text, encoding='utf-8', newline='\n')
    print(f'{len(out)} countries, {len(coast)} coast lines, {len(border)} border lines, '
          f'{len(text) // 1024} KB -> {OUT.relative_to(GAME)}')
    if dropped:
        print('too small to keep:', ', '.join(dropped))


if __name__ == '__main__':
    main()
