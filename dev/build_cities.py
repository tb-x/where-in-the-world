"""Build assets/cities.json, the cities Look around shows as the child zooms in.

Source: Natural Earth 1:10m populated places, the simple version (public domain), from natural-earth-vector
v5.1.2 (GeoJSON), downloaded once into dev/data/cities/ (not committed). Plain Python, no packages.

    python dev/build_cities.py

What it keeps: every country's capital and every town Natural Earth shows by its web-map zoom level MAX_ZOOM
(about 3,000 places; science stations and historic places are left out). Natural Earth's `min_zoom` says
from which zoom a town is worth showing; the game turns it into how close the camera must be (CITY_ZOOM).

The country a city is in comes from the game's own map (assets/world.json), not from Natural Earth, so
the game says the same thing everywhere (Sevastopol is in Ukraine, as the map draws Crimea). A city on
the coast just outside the 1:50m outline takes the country next to it. Cities in a place whose side the
game never names (Western Sahara, Kosovo, Taiwan, Palestine, Kashmir) and Jerusalem get no country and no
capital star: tapping them says only "This is …". (The 1:50m Morocco shape covers Western Sahara too, so
there a town north of 27.67°N is Morocco's and one south of it isn't named.) A city whose own country isn't on
the map (Vatican City) isn't given the country round it either. Capitals take the spelling levels.json uses.

Output: { note, countries: [name, ...], cities: [[name, lon, lat, zoom, country, capital], ...] }
  country is an index into countries, or -1; capital is 1 for a country's capital (drawn with a star).
  Cities are in the order the game places their names: capitals first, then by zoom, then by size, so
  when two names would overlap the more important one wins.
"""
import json
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
SRC_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson'
SRC = HERE / 'data' / 'cities' / 'ne_10m_populated_places_simple.geojson'
OUT = GAME / 'assets' / 'cities.json'
MAX_ZOOM = 6.1                   # Natural Earth min_zoom: keep towns shown on a web map at this zoom or before
                                 # (6.1, not 6: Wrocław, Katowice, Szczecin and Lublin are 6.1)
SKIP = {'Scientific station', 'Meteorological Station', 'Historic place'}
NO_SIDE = {'Western Sahara', 'Kosovo', 'Taiwan', 'Palestine', 'Siachen Glacier'}   # never asked, never named
# cities in Kashmir (the map draws it as the data has it, but the game never says whose it is), and Jerusalem
NO_COUNTRY = {'Srinagar', 'Jammu', 'Leh', 'Gilgit', 'Skardu', 'Muzaffarabad', 'Kargil', 'Anantnag', 'Baramula',
              'Jerusalem'}
NAMES = {'Kuwait': 'Kuwait City',   # a capital named like its country, said so it doesn't sound like the country
         'København': 'Copenhagen', 'Ōsaka': 'Osaka', 'Ürümqi': 'Urumqi',   # the names English speakers use
         'Shenyeng': 'Shenyang'}   # a typo in the source
SAHARA_NORTH = 27.67             # Western Sahara's northern edge


def fetch(url, path):
    if not path.exists():
        print(f'downloading {url}')
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, path)
    return path


def decode(flat, q):
    out, x, y = [], 0, 0
    for i in range(0, len(flat), 2):
        x += flat[i]
        y += flat[i + 1]
        out.append((x / q, y / q))
    return out


def in_ring(x, y, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        (xi, yi), (xj, yj) = ring[i], ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def load_map():
    world = json.loads((GAME / 'assets' / 'world.json').read_text(encoding='utf-8'))
    out = []
    for c in world['countries']:
        polys = []
        for p in c['polys']:
            rings = [decode(r, world['q']) for r in p]
            xs, ys = [x for x, _ in rings[0]], [y for _, y in rings[0]]
            polys.append((rings, (min(xs), min(ys), max(xs), max(ys))))
        out.append((c, polys))
    return out


def country_at(world, lon, lat):
    for c, polys in world:
        for rings, (x0, y0, x1, y1) in polys:
            for x in (lon, lon + 360, lon - 360):   # rings that cross 180° run past it
                if x0 <= x <= x1 and y0 <= lat <= y1 and sum(in_ring(x, lat, r) for r in rings) % 2:
                    return c
    return None


def country_near(world, lon, lat):
    """The country under a city, or the one most of a small circle round it falls in (a city on the coast)."""
    c = country_at(world, lon, lat)
    if c:
        return c
    for r in (0.05, 0.1, 0.2, 0.4):
        votes = {}
        for k in range(8):
            d = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)][k]
            h = country_at(world, lon + d[0] * r, lat + d[1] * r)
            if h:
                votes[h['name']] = votes.get(h['name'], 0) + 1
        if votes:
            name = max(votes, key=votes.get)
            return next(c for c, _ in world if c['name'] == name)
    return None


def main():
    world = load_map()
    by_flag = {c['flag']: c for c, _ in world if c.get('flag')}
    levels = json.loads((GAME / 'assets' / 'levels.json').read_text(encoding='utf-8'))
    geo = json.loads(fetch(SRC_URL, SRC).read_text(encoding='utf-8'))
    places = [f['properties'] for f in geo['features']]
    kept = []
    for p in places:
        capital = p['featurecla'] == 'Admin-0 capital'
        if p['featurecla'] in SKIP or not (capital or p['min_zoom'] <= MAX_ZOOM):
            continue
        lon, lat = round(p['longitude'], 2), round(p['latitude'], 2)
        own = (p['iso_a2'] or '').lower()
        c = country_near(world, lon, lat) or by_flag.get(own)
        name = NAMES.get(p['name'], ' '.join(p['name'].split()))
        if (not c or c['name'] in NO_SIDE or name in NO_COUNTRY or (own != '-99' and own not in by_flag)
                or (c['name'] == 'Morocco' and lat < SAHARA_NORTH)):
            c, capital = None, False
        if capital and c['name'] in levels['capitals']:
            name = levels['capitals'][c['name']][0]
        kept.append({'name': name, 'lon': lon, 'lat': lat, 'zoom': round(min(p['min_zoom'], MAX_ZOOM), 1),
                     'country': c['name'] if c else None, 'capital': capital, 'pop': p['pop_max']})
    kept.sort(key=lambda k: (not k['capital'], k['zoom'], -k['pop']))

    # every capital the levels ask for should be starred here
    starred = {(k['country'], k['name']) for k in kept if k['capital']}
    for country, (capital, *_) in levels['capitals'].items():
        if (country, capital) not in starred:
            print(f'  warning: levels.json says the capital of {country} is {capital}, which has no star here')

    names = sorted({k['country'] for k in kept if k['country']})
    index = {n: i for i, n in enumerate(names)}
    out = {
        'note': 'Made by dev/build_cities.py from Natural Earth 1:10m populated places (public domain). '
                'cities: [name, lon, lat, zoom, country (index into countries, or -1), capital], most important first.',
        'countries': names,
        'cities': [[k['name'], k['lon'], k['lat'], k['zoom'], index.get(k['country'], -1), int(k['capital'])] for k in kept],
    }
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    text = text.replace('],[', '],\n[')   # one city a line, so a diff shows what changed
    OUT.write_text(text + '\n', encoding='utf-8', newline='\n')
    caps = sum(k['capital'] for k in kept)
    print(f'{len(kept)} cities ({caps} capitals, {sum(not k["country"] for k in kept)} with no country named), '
          f'{OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
