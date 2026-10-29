# Where in the World?

A talking 3D globe for kids around 5. A friendly voice asks *"Where is Italy?"*, the camera flies to the
right part of the world and the child taps the country; found countries get their flag painted on and a
sticker, and every place found goes into a passport. Other questions show five flags, or name a capital city.
After the last trip, a short talking scene in space shows why we have summer and winter.

Everything is spoken (American English), so a child who can't read yet can play. Working title; the plan,
with every decision and what's still to do, is in [PLAN.md](PLAN.md).

## How it plays

- **▶ Trips**: 13 trips on a level map, each opens when the one before is finished, then an endless
  **World tour**. They go from the continents (Russia split at the Urals) and the giant countries, through
  Poland's neighbors, each continent, famous islands (Hawaii, Sicily, Tasmania…), little Europe and
  look-alike flags, to capital cities and a round-the-world mix.
- **A trip** is 10 to 14 questions. When a trip has fewer places than that (the continents, Poland's
  neighbors), a few come back near the end, and a flag question never comes straight after its own country.
- **A question**: on the early trips the camera moves to that part of the world; from Look-alike flags on,
  it only zooms out to the whole globe, still facing wherever the child left it, so finding the right part
  of the world is part of the question. The voice asks (🔊 says it again; it is asked again by itself after
  9 seconds). Drag to turn the globe, pinch to zoom in on small countries.
- **A wrong tap** names what was tapped (*"This is Spain."*). After two, a ring pulses near the answer (on
  the later trips the globe first turns to face it); after three, the camera flies there and it glows. A tap in the sea doesn't count. Nothing ever ends a trip.
- **A right tap**: the country lifts, its flag is painted on, a sticker pops up (🍕, 🦘, 🐼…), and *"Yes!
  This is Italy."* A gold dot means first try.
- **Flag questions**: the country lights up with its name (painted flags are hidden meanwhile) and five
  flags appear at the bottom: *"Find the flag of Italy."* The wrong ones get fewer after two misses.
- **Capital cities**: *"Find the country with the capital city Paris."* Then *"Yes! Paris is the capital
  city of France."* and a ⭐ on Paris.
- **End card**: one to three stars from first tries and a stamp for each place found.
- **🔍 Look around**: turn and zoom the globe freely; tap any country to hear its name. The animal buttons
  fly to each continent (🏰 Europe, 🦁 Africa, 🐼 Asia, 🦅 North America, 🦜 South America, 🦘 Australia,
  🐧 Antarctica) and 🏠 home.
- **🛂 Passport**: every place ever found, with its flag and sticker, grouped by continent; tap a stamp to
  hear its name. The 🏅 medal from the seasons scene shows here too.
- **🌞 The seasons**: after the last trip (and from the 🌞 tile afterwards): fly up into space, meet the
  Sun, see day and night, the Earth's tilt pointing at the North Star, a year around the Sun, summer and
  winter (and why slanted sunshine is colder, on a card where the child moves the Sun), summer in
  Australia, and then the child pushes the Earth round the Sun through the seasons. ⏭ skips a part.

Progress, the passport and the medal are kept on the device (`localStorage`).

It can be added to the Home Screen and then plays without internet: on the first visit it saves the whole game,
including every voice clip and flag (about 12 MB, fetched once in the background).

## Running it

Any static file server, from this folder:

```bash
python -m http.server 5235
```

and open http://localhost:5235/. Add `?all` to open every trip and the seasons scene. From the tb-x root
server (port 5200) it's at `/world-map/`. Adding `?tbxtest` makes it silent (for automated tests).

For grown-ups changing it, the tools in `dev/` (plain Python; the voice needs Kokoro, see below):

- `python dev/build_map.py`: builds `assets/world.json` from Natural Earth (downloaded once into `dev/data/`).
- `python dev/flags.py`: copies the flags into `assets/flags/`.
- `../_tools/kokoro/venv/Scripts/python dev/voices.py`: records any new or changed line; `--phonemes` shows
  how every name will be said, `--audition` compares voices and speeds.
- `python dev/icon.py`: draws `icon.svg` from the map and renders `icon-180.png` and `icon-512.png` in headless Chrome.
- `python dev/check.py`: checks every level (names, islands, flags, clips, capitals inside their country,
  enough wrong flags) and lists the places that get a camera view of their own. It should say 0 errors.

## Tuning knobs

At the top of `game.js`: `QUESTIONS_PER_LEVEL` (12, when a trip doesn't set its own), `HINT_AFTER` ([2, 3] wrong taps), `REMIND_SECONDS` (9),
`CARDS` (5 flags), `TAP_SLOP_PX` (how near a miss still counts), `COUNTRY_FIT` (how much of the screen a
country flown to fills), `FLY_SPEED`, `MIN_ALT` (how close the camera can get), `IDLE_SPIN`, `CLIP_VOL`,
`SFX_VOL`, `LIFT`, `COLOURS`.

In `assets/levels.json`, per trip: the places asked (`ask`), how many questions (`questions`), the camera (`camera`, `view`; `world` for the
later trips), pale
other countries (`pale`), how many flag questions (`flags`, `lightup`) and how alike the wrong flags are
(`cards`: far, near, alike), capital questions (`capitals`). Also the continent views (`regions`), when a
place gets a view of its own (`closer`), the look-alike flag groups, the islands, the capital cities and
the stickers. Every spoken line is in `assets/lines.json`.

At the top of `finale.js`: `TILT`, `ORBIT`, `SUN_R`, `EARTH_BIG`, `GHOST`, `OBLIQUE`, `YEAR_SECONDS`, `SPIN`.

## Borders

The map is Natural Earth 1:50m. Crimea is drawn as part of Ukraine (the source data has it as Russia;
`dev/build_map.py` moves it). Northern Cyprus is part of Cyprus and Somaliland part of Somalia. Western
Sahara, Kosovo, Taiwan, Palestine and Kashmir are drawn as the data has them and never asked about.

## Credits and licences

- Map: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
  [world-atlas](https://github.com/topojson/world-atlas) 2.0.2 (ISC).
- Flags: [flag-icons](https://github.com/lipis/flag-icons) 7.5.0 by Panayiotis Lipiridis (MIT, see
  `assets/flags/LICENSE`). Country codes from [i18n-iso-countries](https://github.com/michaelwittig/node-i18n-iso-countries) 7.14.0 (MIT).
- 3D: [three.js](https://threejs.org/) 0.160.0 (MIT), from jsDelivr. Title font: Fredoka (Google Fonts, OFL).

### Audio credits

All voices: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) v1.0 (Apache 2.0, by hexgrad), run
locally with kokoro-onnx (MIT) by `dev/voices.py`, voice `af_heart` (American English) at speed 0.85,
made on 2026-10-27. No ElevenLabs audio, no credit needed. `assets/voice/clips.json` lists every clip with
its file, its text and the date it was made. A few names are given their sounds by hand (`PHONEMES` in
`dev/voices.py`: Slovakia, Kyiv, Reykjavik, the Maldives…). Sound effects are synthesized in the browser.
