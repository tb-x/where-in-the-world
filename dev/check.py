"""Check every level in assets/levels.json against the map, the flags, the clips and the camera.

    python dev/check.py

For each level it prints the places it can ask and, for each one the usual view would show too small
(or not at all) on a phone, the closer view the game will fly to instead. It fails (exit code 1) when
something a level needs is missing:
- a name that isn't a country in assets/world.json, an island in levels.json or a continent;
- an island whose point or box finds no part of its country;
- a country without a flag in assets/flags/;
- a line without a clip in assets/voice/clips.json ("Where is …?", "Yes! This is …", "Find the flag of …",
  and "This is …" for every country, since any country can be tapped);
- a flag question with fewer than four wrong flags to choose from;
- a capital city that isn't inside its country, or a capitals level asking for a country without one.
Places without a sticker are listed as a warning (they get ⭐).

The camera rules mirror game.js (cameraFor, shows, closerView): a place is drawn at
2 × half its size × FIT_PAD × 360 / 2 / the view's half-width pixels on a 360 px wide phone.
"""
import json
import math
import sys
from pathlib import Path

GAME = Path(__file__).resolve().parent.parent
FIT_PAD = 0.82      # as in game.js
PHONE = 360         # the shorter side of a small phone, in CSS pixels
CARDS = 5
QUESTIONS = 12      # QUESTIONS_PER_LEVEL in game.js


def load(name):
    return json.loads((GAME / 'assets' / name).read_text(encoding='utf-8'))


def decode(flat, q):
    out, x, y = [], 0, 0
    for i in range(0, len(flat), 2):
        x += flat[i]
        y += flat[i + 1]
        out.append((x / q, y / q))
    return out


def inside(pt, ring):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def wrap(lon):
    return (lon + 540) % 360 - 180


def half_size(box):
    w, s, e, n = box
    return max((n - s) / 2, (e - w) / 2 * math.cos(math.radians((s + n) / 2)))


def away(a, b):
    """Angle in degrees between two (lon, lat) points."""
    (l1, p1), (l2, p2) = [(math.radians(x), math.radians(y)) for x, y in (a, b)]
    c = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(l1 - l2)
    return math.degrees(math.acos(max(-1, min(1, c))))


def px(box, ext):
    return 2 * half_size(box) * FIT_PAD * PHONE / 2 / ext


def main():
    world, levels, lines = load('world.json'), load('levels.json'), load('lines.json')
    clips = load('voice/clips.json')['clips']
    q = world['q']
    by = {c['name']: c for c in world['countries']}
    continents = set(levels['continents'].values())
    errors, warnings = [], []
    err = errors.append

    # islands: which parts of their country they are
    islands = {}
    for name, isl in levels['islands'].items():
        c = by.get(isl['country'])
        if not c:
            err(f'island {name}: no country {isl["country"]!r}')
            continue
        parts = []
        for p in c['polys']:
            ring = decode(p[0], q)
            xs, ys = [x for x, _ in ring], [y for _, y in ring]
            box = (min(xs), min(ys), max(xs), max(ys))
            if 'at' in isl:
                hit = any(inside((lon, isl['at'][1]), ring) for lon in (isl['at'][0], isl['at'][0] + 360, isl['at'][0] - 360))
            else:
                w, s, e, n = isl['box']
                mx, my = wrap((box[0] + box[2]) / 2), (box[1] + box[3]) / 2
                hit = w <= mx <= e and s <= my <= n
            if hit:
                parts.append(box)
        if not parts:
            err(f'island {name}: its point or box finds no part of {isl["country"]}')
            continue
        box = (min(b[0] for b in parts), min(b[1] for b in parts), max(b[2] for b in parts), max(b[3] for b in parts))
        islands[name] = {'box': box, 'at': (wrap((box[0] + box[2]) / 2), (box[1] + box[3]) / 2), 'parts': len(parts),
                         'cont': by[isl['country']]['cont']}

    def place(name):
        if name in islands:
            return dict(islands[name], kind='island', flag=None, say=name)
        c = by.get(name)
        if c:
            return {'kind': 'country', 'box': c['box'], 'at': tuple(c['label']), 'cont': c['cont'], 'flag': c.get('flag'), 'say': c['say']}
        return None

    every = list(dict.fromkeys(n for l in levels['levels'] if l['camera'] != 'globe' and not l.get('mix') for n in l['ask']))
    tour = next((l for l in levels['levels'] if l.get('tour')), {'ask': []})
    known = [n for n in every if by.get(n, {}).get('flag')]
    alike = {}
    for g in levels['lookalikes']:
        for n in g:
            if n not in by:
                err(f'look-alike group {g}: no country {n!r}')
            alike.setdefault(n, set()).update(x for x in g if x != n)

    def need(text, what):
        if text not in clips:
            err(f'no clip for "{text}" ({what})')
        elif not (GAME / 'assets' / 'voice' / clips[text]['file']).exists():
            err(f'clip file missing for "{text}": {clips[text]["file"]}')

    for name, (capital, lon, lat) in levels.get('capitals', {}).items():
        c = by.get(name)
        if not c:
            err(f'capital {capital}: no country {name!r}')
            continue
        if not any(inside((x, lat), decode(p[0], q)) for p in c['polys'] for x in (lon, lon + 360, lon - 360)):
            err(f'capital {capital} ({lon}, {lat}) is not inside {name}')
        for kind in ('capital', 'capitalYes'):
            need(lines['country'][kind].replace('{say}', c['say']).replace('{capital}', capital), f'capital of {name}')

    for c in world['countries']:
        need(lines['country']['this'].replace('{say}', c['say']), 'any country can be tapped')
        if c.get('flag') and not (GAME / 'assets' / 'flags' / f'{c["flag"]}.svg').exists():
            err(f'{c["name"]}: no flag file {c["flag"]}.svg')

    for i, L in enumerate(levels['levels'], 1):
        names = every if L.get('tour') else [n for n in every if n not in tour['ask']] if L.get('mix') else L['ask']
        notes, small = [], []
        for name in names:
            if L['camera'] == 'globe':
                if name not in continents:
                    err(f'level {i}: {name!r} is not a continent')
                for kind in ('where', 'yes', 'this'):
                    need(lines['country'][kind].replace('{say}', name), f'level {i}')
                continue
            p = place(name)
            if not p:
                err(f'level {i}: {name!r} is not a country or an island')
                continue
            for kind in ('where', 'yes'):
                need(lines['country'][kind].replace('{say}', p['say']), f'level {i}')
            if L.get('capitals') is True and name not in levels.get('capitals', {}):
                err(f'level {i}: no capital city for {name}')
            if L.get('flags') and p['flag']:
                need(lines['country']['flag'].replace('{say}', p['say']), f'level {i} flag question')
                pool = [n for n in known if n != name]
                far = [n for n in pool if by[n]['cont'] != p['cont'] and n not in alike.get(name, ())]
                near = [n for n in pool if by[n]['cont'] == p['cont'] and n not in alike.get(name, ())]
                mode = L.get('cards', 'far')
                have = len(far) + len(near) + len(alike.get(name, ())) if mode == 'alike' else len(far) + len(near) if mode == 'near' else len(far)
                if have < CARDS - 1:
                    err(f'level {i}: only {have} wrong flags for {name} ({mode})')
            if name not in levels['stickers']:
                warnings.append(f'level {i}: no sticker for {name}')
            # the camera, as cameraFor decides it ('world' shows the whole globe, wherever the child left it)
            if L['camera'] == 'world':
                continue
            if L['camera'] == 'level':
                v = L['view'] if isinstance(L['view'], dict) else levels['regions'][L['view']]
            elif L['camera'] == 'continent':
                v = levels['regions'][p['cont']]
            else:
                v = None
            size = px(p['box'], v['ext']) if v else 0
            if not v or size < levels['closer']['minPx'] or away((v['lon'], v['lat']), p['at']) + half_size(p['box']) * 0.5 > v['ext'] / FIT_PAD:
                k, lo, hi = levels['closer']['view']
                ext = max(lo, min(hi, half_size(p['box']) * k))
                why = '' if not v else f'{size:.0f} px' if size < levels['closer']['minPx'] else 'outside the view'
                small.append(f'{name} ({why + ", " if why else ""}{px(p["box"], ext):.0f} px at {ext:.0f}°)')
        flagged = [n for n in names if L['camera'] != 'globe' and (place(n) or {}).get('flag')]
        if L.get('lightup') and len(flagged) < L.get('flags', 0) + 1:
            err(f'level {i}: {L["flags"]} light-up flag questions need more countries with flags')
        count = L.get('questions', QUESTIONS)
        if count <= L.get('flags', 0):
            err(f'level {i}: {count} questions leave none on the map after {L["flags"]} flag questions')
        again = max(0, count - (0 if L.get('lightup') else min(L.get('flags', 0), count - 1)) - len(names))
        print(f'{i:2}. {L["trip"]}: {count} questions from {len(names)} places{f" ({again} asked again)" if again else ""}, camera {L["camera"]}, {L.get("flags", 0)} flag questions ({L.get("cards", "-")})')
        if small:
            print(f'    closer view: {", ".join(small)}')

    for w in warnings:
        print('warning:', w)
    for e in errors:
        print('ERROR:', e)
    print(f'{len(errors)} errors, {len(warnings)} warnings')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
