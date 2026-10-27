"""Copy the flag of every country in assets/world.json into assets/flags/.

Flags: flag-icons@7.5.0 by Lipis (MIT), the 4:3 SVGs, from jsDelivr; its licence is copied alongside,
since the MIT licence asks for its notice to go with the copies. Plain Python, no packages.

    python dev/flags.py            copy the flags that are missing
    python dev/flags.py --force    copy them all again
"""
import json
import sys
import urllib.request
from pathlib import Path

GAME = Path(__file__).resolve().parent.parent
OUT = GAME / 'assets' / 'flags'
BASE = 'https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/'


def main(force=False):
    OUT.mkdir(parents=True, exist_ok=True)
    world = json.loads((GAME / 'assets' / 'world.json').read_text(encoding='utf-8'))
    codes = sorted({c['flag'] for c in world['countries'] if c.get('flag')})
    made = 0
    for code in codes:
        path = OUT / f'{code}.svg'
        if path.exists() and not force:
            continue
        path.write_bytes(urllib.request.urlopen(f'{BASE}flags/4x3/{code}.svg').read())
        made += 1
    (OUT / 'LICENSE').write_bytes(urllib.request.urlopen(BASE + 'LICENSE').read())
    for f in OUT.glob('*.svg'):
        if f.stem not in codes:
            f.unlink()
    size = sum(f.stat().st_size for f in OUT.glob('*.svg'))
    print(f'{made} flags copied, {len(codes)} in all, {size // 1024} KB')
    no_flag = [c['name'] for c in world['countries'] if not c.get('flag')]
    if no_flag:
        print('no flag:', ', '.join(no_flag))


if __name__ == '__main__':
    main('--force' in sys.argv)
