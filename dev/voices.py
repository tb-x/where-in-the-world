"""Render every spoken line as an mp3 clip with Kokoro (a local, free text-to-speech model).

Kokoro-82M is Apache 2.0 (checked 2026-10-24 on huggingface.co/hexgrad/Kokoro-82M); it runs here through
kokoro-onnx (MIT), set up once in ../_tools/kokoro/ for What Should Frank Do? (the steps are at the top of
what-to-do/dev/voices.py). Nothing is sent anywhere, nothing costs credits.

Use (from the world-map folder):
    ../_tools/kokoro/venv/Scripts/python dev/voices.py              render missing clips
    ../_tools/kokoro/venv/Scripts/python dev/voices.py --force      render them all again
    ../_tools/kokoro/venv/Scripts/python dev/voices.py --phonemes   print how Kokoro will say every name
    ../_tools/kokoro/venv/Scripts/python dev/voices.py --audition   try narrator speeds -> dev/audition/

The lines come from assets/lines.json: the country templates for every name in assets/world.json
("This is …", said when any country is tapped) and for every name a level asks in assets/levels.json
("Where is …?", "Find the flag of …", "Yes! This is …"), plus the shared lines. Clips go to
assets/voice/<slug>-<hash>.mp3 and are listed by their exact text in assets/voice/clips.json, which the
game reads. A changed line or voice setting gets a new file name; clips no line uses any more are deleted.
Every build also writes dev/audition/clips.html, a page to listen to every clip (not committed).
"""
import datetime
import hashlib
import html
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
KOKORO = GAME.parent / '_tools' / 'kokoro' / 'models'
OUT = GAME / 'assets' / 'voice'
AUDITION = HERE / 'audition'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 24000

# The narrator: American English (decided 2026-10-27), the same voice as Frank's narrator.
NARRATOR = {'voice': 'af_heart', 'speed': 0.85}
SENTENCE_PAUSE = 0.45   # seconds between sentences ("Yes! This is Poland.")
CLAUSE_PAUSE = 0.2
BITRATE = '48k'         # mono speech; about 9 KB a clip
RENDER_V = 1            # bump to render every clip again after changing anything below

# Names Kokoro reads wrongly from their spelling: the voice gets this text instead (the game still
# looks the clip up by the real line). Checked with --phonemes.
SAY_AS = {'U.S.': 'U S', 'Brrr!': 'Burr!'}   # dots made Kokoro stop as at full stops; Brrr was spelled out

# Names whose sounds Kokoro gets wrong (checked with --phonemes on 2026-10-27): in a line containing the
# name, the sounds Kokoro would use for it are swapped for these (American English).
PHONEMES = {
    'Slovakia': 'sloʊvˈɑːkiə',      # not "sluh-VACK-ia"
    'Andorra': 'ændˈɔːɹə',
    'Anguilla': 'æŋɡwˈɪlə',
    'Curacao': 'kjˌʊɹəsˈaʊ',
    'Macau': 'məkˈaʊ',
    'Palau': 'pəlˈaʊ',
    'Maldives': 'mˈɔːldiːvz',
    'Niue': 'njˈuːeɪ',
    'Åland': 'ˈoʊlənd',
    'Qatar': 'kˈɑːtɑːɹ',
    'Montserrat': 'mˌɑːntsəɹˈæt',
    'Kyiv': 'kˈiːv',                 # capitals, checked 2026-10-27
    'Reykjavik': 'ɹˈeɪkjəvˌɪk',
    'Riyadh': 'ɹiːjˈɑːd',
    'Stockholm': 'stˈɑːkhˌoʊlm',
    'Gobi Desert': 'ɡˈoʊbi dˈɛzɚt',  # places on the physical map, checked 2026-10-30; "Namib" alone would also hit Namibia
    'Namib Desert': 'nˈɑːmɪb dˈɛzɚt',
    'Thar Desert': 'tˈɑːɹ dˈɛzɚt',
    'Taklamakan Desert': 'tˌɑːkləməkˈɑːn dˈɛzɚt',
    'Baikal': 'baɪkˈɑːl',
    'Mekong': 'mˈeɪkɑːŋ',
    'Onega': 'oʊnˈɛɡə',            # more places, checked 2026-10-30
    'Ladoga': 'lˈɑːdəɡə',
    'Kamchatka': 'kæmtʃˈætkə',
    'Tanganyika': 'tˌæŋɡənjˈiːkə',
    'Indus': 'ˈɪndəs',
    'Dnipro': 'dnˈiːpɹoʊ',
    'Yenisei': 'jˌɛnɪsˈeɪ',
    'Parana River': 'pˌɑːɹɑːnˈɑː ɹˈɪvɚ',
    'Karakoram': 'kˌæɹəkˈɔːɹəm',
    'Karakum': 'kˌɑːɹɑːkˈuːm',
    'Kyzylkum': 'kˌɪzɪlkˈuːm',
    'Pantanal': 'pˌæntənˈɑːl',
    'Patagonia': 'pˌætəɡˈoʊniə',
    'Pamir': 'pəmˈɪɹ',
    'Yucatan': 'jˌuːkətˈæn',
    'Balkhash': 'bælkˈæʃ',
    'Eyre': 'ˈɛɹ',
    'Kunlun': 'kˈʊnlʊn',
    'Amur': 'ɑːmˈʊɹ',
    'Ob': 'ˈoʊb',
    'Altai': 'ˈæltaɪ',
    'Zambezi': 'zæmbˈiːzi',
    'Sierra Madre': 'siːˈɛɹə mˈɑːdɹeɪ',
    'Teide': 'tˈeɪdeɪ',            # the Canary Islands, checked 2026-10-30
    'Gran Canaria': 'ɡɹˈɑːn kənˈɑːɹiə',
    'Lanzarote': 'lˌænzəɹˈɑːti',
    'Fuerteventura': 'fwˌɛɹteɪvɛntˈʊɹə',
    'La Palma': 'lˌɑː pˈɑːlmə',
    'La Gomera': 'lˌɑː ɡoʊmˈɛɹə',
    'El Hierro': 'ˌɛl jˈɛɹoʊ',
    'Madeira': 'mədˈɪɹə',
    'Porto Santo': 'pˈɔːɹtoʊ sˈɑːntoʊ',
}


# ======== the lines ========

def load(name):
    return json.loads((GAME / 'assets' / name).read_text(encoding='utf-8'))


def all_lines():
    """{text: kind} for every line the game can say."""
    lines = load('lines.json')
    world = load('world.json')
    levels = load('levels.json')
    say = {c['name']: c['say'] for c in world['countries']}
    no_flag = (set(levels['continents'].values()) | set(levels['islands'])) - set(say)
    say.update({n: n for n in no_flag})
    asked = {n for lv in levels['levels'] for n in lv['ask']}
    missing = sorted(n for n in asked if n not in say)
    if missing:
        sys.exit(f'levels.json asks for names world.json lacks: {missing}')
    out = {}
    for name in sorted(say):
        kinds = {k: lines['country'][k] for k in ('where', 'flag', 'yes', 'this')} if name in asked else {'this': lines['country']['this']}
        for kind, template in kinds.items():
            if kind == 'flag' and name in no_flag:   # continents and islands have no flag of their own
                continue
            out[template.replace('{say}', say[name])] = kind
    for name, (capital, *_) in levels.get('capitals', {}).items():   # "Find the country with the capital city …"
        for kind in ('capital', 'capitalYes'):
            out[lines['country'][kind].replace('{say}', say[name]).replace('{capital}', capital)] = 'capital'
    for key, text in lines['shared'].items():
        out[text] = key
    for key, text in lines.get('finale', {}).items():   # the seasons finale
        out[text] = 'finale'
    for key, text in lines.get('physical', {}).items():   # places on the physical map (Look around)
        out[text] = 'physical'
    return out


# ======== rendering ========

_kokoro = None


def kokoro():
    global _kokoro
    if _kokoro is None:
        _kokoro = Kokoro(str(KOKORO / 'kokoro-v1.0.onnx'), str(KOKORO / 'voices-v1.0.bin'))
    return _kokoro


def spoken(text):
    for name, said in SAY_AS.items():
        text = text.replace(name, said)
    return text


def sounds(text):
    """The phonemes Kokoro will say for a line, with PHONEMES swapped in."""
    ph = kokoro().tokenizer.phonemize(spoken(text), 'en-us')
    for name, fixed in PHONEMES.items():
        if name in text:
            wrong = kokoro().tokenizer.phonemize(name, 'en-us')
            assert wrong in ph, f'cannot find the sounds of {name!r} ({wrong}) in {ph!r}'
            ph = ph.replace(wrong, fixed)
    return ph


def render(text, cfg=NARRATOR):
    opts = dict(voice=cfg['voice'], speed=cfg['speed'], sentence_pause=SENTENCE_PAUSE, clause_pause=CLAUSE_PAUSE)
    if any(name in text for name in PHONEMES):
        samples, sr = kokoro().create(sounds(text), is_phonemes=True, **opts)
    else:
        samples, sr = kokoro().create(spoken(text), lang='en-us', **opts)
    assert sr == SR
    pad = np.zeros(int(SR * 0.05), dtype=np.float32)
    return np.concatenate([pad, samples.astype(np.float32), pad])


def save_mp3(samples, path):
    peak = float(np.max(np.abs(samples))) or 1.0
    samples = samples * min(1.0, 0.89 / peak)          # same loudness ceiling for every clip
    cmd = [FFMPEG, '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0',
           '-codec:a', 'libmp3lame', '-b:a', BITRATE, '-y', str(path)]
    subprocess.run(cmd, input=samples.astype(np.float32).tobytes(), capture_output=True, check=True)


def file_name(text):
    slug = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:40].strip('-')
    fix = {n: p for n, p in PHONEMES.items() if n in text}
    h = hashlib.sha1(json.dumps([spoken(text), fix, NARRATOR, SENTENCE_PAUSE, CLAUSE_PAUSE, BITRATE, RENDER_V]).encode()).hexdigest()[:6]
    return f'{slug}-{h}.mp3'


# ======== commands ========

def build(force=False):
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / 'clips.json'
    old = json.loads(manifest_path.read_text(encoding='utf-8'))['clips'] if manifest_path.exists() else {}
    lines = all_lines()
    clips, made = {}, 0
    for text, kind in lines.items():
        name = file_name(text)
        if not force and old.get(text, {}).get('file') == name and (OUT / name).exists():
            clips[text] = old[text]
            continue
        samples = render(text)
        save_mp3(samples, OUT / name)
        clips[text] = {'file': name, 'dur': round(len(samples) / SR, 2), 'made': datetime.date.today().isoformat()}
        made += 1
        print(f'  {name}  {text}')
    used = {c['file'] for c in clips.values()}
    removed = 0
    for f in OUT.glob('*.mp3'):
        if f.name not in used:
            f.unlink()
            removed += 1
    manifest = {'tool': 'Kokoro-82M v1.0 (kokoro-onnx), run locally', 'voice': NARRATOR['voice'],
                'speed': NARRATOR['speed'], 'clips': dict(sorted(clips.items()))}
    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    size = sum((OUT / c['file']).stat().st_size for c in clips.values())
    print(f'{made} new clips, {removed} old ones removed, {len(clips)} in clips.json, {size // 1024} KB')
    listening_page(lines, clips)


def listening_page(lines, clips):
    AUDITION.mkdir(exist_ok=True)
    groups = {}
    for text, kind in lines.items():
        groups.setdefault(kind if kind in ('where', 'flag', 'yes', 'this', 'capital', 'finale', 'physical') else 'shared', []).append(text)
    parts = []
    for kind in ('where', 'flag', 'yes', 'this', 'capital', 'shared', 'finale', 'physical'):
        rows = ''.join(
            f'<tr><td><audio controls preload="none" src="../../assets/voice/{clips[t]["file"]}"></audio></td>'
            f'<td>{html.escape(t)}</td><td>{clips[t]["dur"]} s</td></tr>' for t in groups.get(kind, []))
        parts.append(f'<h2>{kind} ({len(groups.get(kind, []))})</h2><table>{rows}</table>')
    (AUDITION / 'clips.html').write_text(f"""<!doctype html><meta charset="utf-8"><title>Every clip</title>
<style>body{{font-family:Verdana,sans-serif;margin:16px}}td{{padding:2px 8px;font-size:13px}}audio{{height:28px}}</style>
<h1>Every clip ({len(clips)})</h1><p>Narrator {NARRATOR['voice']}, speed {NARRATOR['speed']}. Serve the game folder
(port 5235) and open /dev/audition/clips.html so the clips load.</p>{''.join(parts)}""", encoding='utf-8', newline='\n')
    print(f'Listen: http://localhost:5235/dev/audition/clips.html')


def phonemes():
    world = load('world.json')
    levels = load('levels.json')
    names = sorted({c['say'] for c in world['countries']} | set(levels['continents'].values()) | set(levels['islands'])
                   | {c[0] for c in levels.get('capitals', {}).values()} | set(load('lines.json').get('physical', {})))
    for n in names:
        print(f'{n:40} {sounds(n)}{"   (fixed)" if any(p in n for p in PHONEMES) else ""}')


AUDITION_LINES = ['Where is Poland?', 'Yes! This is Poland.', 'Find the flag of the United States.']
AUDITION_SPEEDS = [0.78, 0.85, 0.92, 1.0]
AUDITION_VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah']


def audition():
    AUDITION.mkdir(exist_ok=True)
    rows = []
    for v in AUDITION_VOICES:
        cells = []
        for s in AUDITION_SPEEDS:
            gap = np.zeros(int(SR * 0.6), dtype=np.float32)
            samples = np.concatenate([x for t in AUDITION_LINES for x in (render(t, {'voice': v, 'speed': s}), gap)])
            name = f'{v}-{s:.2f}.mp3'
            save_mp3(samples, AUDITION / name)
            cells.append(name)
            print(f'  {name}')
        rows.append((v, cells))
    head = ''.join(f'<th>speed {s}</th>' for s in AUDITION_SPEEDS)
    body = ''.join(f'<tr><th>{v}</th>' + ''.join(f'<td><audio controls preload="none" src="{n}"></audio></td>' for n in cells) + '</tr>'
                   for v, cells in rows)
    (AUDITION / 'index.html').write_text(f"""<!doctype html><meta charset="utf-8"><title>Narrator audition</title>
<style>body{{font-family:Verdana,sans-serif;margin:16px}}td,th{{padding:6px;font-size:12px}}audio{{width:170px}}</style>
<h1>Narrator audition</h1><p>Lines: "{'" / "'.join(AUDITION_LINES)}". Set in NARRATOR at the top of dev/voices.py
(now {NARRATOR['voice']} at {NARRATOR['speed']}).</p><table><tr><th></th>{head}</tr>{body}</table>""", encoding='utf-8', newline='\n')
    print('Listen: http://localhost:5235/dev/audition/index.html')


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--phonemes' in args:
        phonemes()
    elif '--audition' in args:
        audition()
    else:
        build(force='--force' in args)
