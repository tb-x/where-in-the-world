# Where in the World?

A talking 3D globe for kids around 5. A friendly voice asks *"Where is Italy?"*, the camera flies to the
right part of the world and the child taps the country; found countries get their flag painted on, and
every place found goes into a passport. Other questions show five flags, or name a capital city.
After the last trip, a short talking scene in space shows why we have summer and winter.

Everything is spoken (American English), so a child who can't read yet can play. Working title; the plan,
with every decision and what's still to do, is in [PLAN.md](PLAN.md).

## How it plays

- **▶ Trips**: 13 trips on a level map, each opens when the one before is finished, then an endless
  **World tour**. They go from the continents (Russia split at the Urals) and the giant countries, through
  Poland's neighbors, each continent, famous islands (Hawaii, Sicily, Tasmania…), little Europe and
  look-alike flags, to capital cities and a round-the-world mix.
- **A trip** is 10 to 14 questions (the continents: 7), each about a different place picked afresh from a
  longer list each time (Poland's neighbors 10 of 12, Africa 12 of 16…), so no two trips are the same, and
  never two places of one country (not Sicily and Italy). Poland is always in Home and giants.
- **A question**: on the early trips the camera moves to that part of the world; from Look-alike flags on,
  it only zooms out to the whole globe, still facing wherever the child left it, so finding the right part
  of the world is part of the question. The voice asks (🔊 says it again; it is asked again by itself after
  9 seconds). While the question is being read (the 🔊 pulses), the globe and the flags can't be tapped, dragged or
  zoomed, so the child hears the whole question first; 🔊 (it starts the question again), home and back still work. Drag to turn the globe, pinch to zoom in on small countries.
- **A wrong tap** names what was tapped (*"This is Spain."*). Hints come slowly, so they don't give the
  answer away: after two wrong taps a wide ring pulses round the area, with the answer somewhere inside but
  not in the middle (on the later trips the globe first turns to it); after four a smaller ring; after six the
  camera flies there and it glows. Waiting brings the same steps, one every 9 seconds after the question is
  asked again. A tap in the sea doesn't count. Nothing ever ends a trip.
- **A right tap**: the country lifts, its flag spreads over it, and *"Yes!
  This is Italy."* A gold dot means first try.
- **Flag questions** are about a country the trip hasn't shown yet: it lights up with its name (painted flags
  are hidden meanwhile) and five flags appear at the bottom: *"Find the flag of Italy."* One wrong flag goes after
  two misses, all but two after four, all but the right one after six. Flags too alike to tell apart
  (Indonesia and Monaco, Romania and Chad, Andorra and Moldova) never come up together. The right flag flies onto the country and spreads over it.
- **Capital cities**: *"Find the country with the capital city Paris."* Then *"Yes! Paris is the capital
  city of France."* and a ⭐ on Paris.
- **End card**: one to three stars from first tries and a stamp for each place found.
- **🔍 Look around**: turn and zoom the globe freely; tap any country to hear its name. The animal buttons
  fly to each continent (🏰 Europe, 🦁 Africa, 🐼 Asia, 🦅 North America, 🦜 South America, 🦘 Australia,
  🐧 Antarctica) and 🏠 home.
- **Cities** (in Look around, on both maps): zoom in and cities appear as dots with their names, capitals with a
  gold ⭐. First the capitals and the biggest cities, then smaller ones as the child zooms in closer (Warsaw, then
  Kraków and Gdańsk, then Wrocław and Katowice). Names never overlap and never sit under a button, so a phone shows
  fewer than a big screen. Tap a city to hear it: *"This is Warsaw, the capital city of Poland."*, *"This is
  Kraków, a city in Poland."* Cities never show during a trip (they would give the capital-city answers away).
- **The physical map** (in Look around): the round button by the back button shows a little picture of the
  other map; tap it to swap the colourful countries for a real relief map (green lowlands, sandy deserts,
  brown mountains, white ice, deep blue sea, rivers and lakes), and back. It gets sharper in three steps as
  the child zooms in, down to single valleys in the Tatras, and close up the coasts are drawn sharp, so even a
  small island like Gran Canaria has its real shape. A tap now names what's there: 224 places, from
  the five oceans and 47 seas, bays and gulfs (the Baltic *"by Poland"*) to 33 mountain ranges, 16 deserts,
  big islands (Greenland, Borneo, Sicily…), each of the seven Canary Islands (*"This is La Gomera, one of the
  Canary Islands, where people can talk by whistling!"*), Madeira and Porto Santo (a tap just off a small
  island still finds it), and
  peninsulas (Scandinavia, Kamchatka…), plains and valleys (the
  North European Plain, the Great Rift Valley, Siberia, the Pampas), the Amazon and Congo rainforests, 25
  lakes and 44 rivers like the Nile, the Danube, the Vistula and the Thames. The place lights up in gold,
  and many come with a little fact (*"These are the Himalayas, the highest mountains in the world."*,
  *"This is the Colorado River. It made the Grand Canyon."*). Where none of those is, it names the country,
  which lights up in its own colour. The choice is remembered for the next visit; trips always use the
  countries map.
- **🛂 Passport**: every place ever found, with its flag (a continent with its animal), grouped by continent; tap a stamp to
  hear its name. The 🏅 medal from the seasons scene shows here too.
- **🌞 The seasons**: after the last trip (and from the 🌞 tile afterwards): fly up into space, meet the
  Sun, see day and night, the Earth's tilt pointing at the North Star, a year around the Sun, summer and
  winter (and why slanted sunshine is colder, on a card where the child moves the Sun), summer in
  Australia, and then the child pushes the Earth round the Sun through the seasons. ⏭ skips a part.

Progress, the passport and the medal are kept on the device (`localStorage`). To start again (a new child on
the same tablet), hold the small ↺ in the bottom corner of the level map for 2 seconds; a tap alone does nothing.

It can be added to the Home Screen and then plays without internet: on the first visit it saves the whole game,
including every voice clip, flag and the physical map (about 18 MB, fetched once in the background). The
two sharpest steps of the physical map's close-ups load only online, when the child zooms right in; offline the
close-ups stop at the first step.

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
- `python dev/build_physical.py`: builds the physical map, the relief pictures in `assets/physical/` and the
  places in `assets/physical.json`, from Natural Earth (downloaded once into `dev/data/physical/`, about 400 MB
  for the picture; this one needs Pillow, numpy and scipy, and takes a few minutes; `--places` skips the pictures). The list of places is `FEATURES` at its top, and what the voice says
  about each one is under `"physical"` in `assets/lines.json`.
- `python dev/build_cities.py`: builds `assets/cities.json` (about 3,100 cities) from Natural Earth's populated
  places (downloaded once into `dev/data/cities/`). What the voice says about a tapped city is under `"city"` in
  `assets/lines.json`; capitals and the biggest cities get a recorded clip (`CITY_VOICE_ZOOM` in `dev/voices.py`),
  the other towns use the device's voice.
- `python dev/icon.py`: draws `icon.svg` from the map and renders `icon-180.png` and `icon-512.png` in headless Chrome.
- `python dev/check.py`: checks every level (names, islands, flags, clips, capitals inside their country,
  enough wrong flags, the physical map's lines, clips and pictures) and lists the places that get a camera
  view of their own. It should say 0 errors.

## Tuning knobs

At the top of `game.js`: `QUESTIONS_PER_LEVEL` (12, when a trip doesn't set its own), `HINT_AFTER` ([2, 4, 6] wrong taps), `RESET_HOLD` (2 seconds to hold ↺), `REMIND_SECONDS` (9),
`CARDS` (5 flags), `FLAG_SPREAD` (how fast a flag spreads over its country), `TAP_SLOP_PX` (how near a miss still counts), `COUNTRY_FIT` (how much of the screen a
country flown to fills), `FLY_SPEED`, `MIN_ALT` (how close the camera can get), `IDLE_SPIN`, `CLIP_VOL`,
`SFX_VOL`, `LIFT`, `COLOURS`. For the physical map: `PHYS_TILE_PX` (how zoomed in before each sharper step
loads), `PHYS_TILES_KEPT` (how many sharp pictures of each step at once, 12: more looks sharper on a big screen
but uses more memory), `TILE_FACING`, `RIVER_TAP_PX` (how near a river a tap still names it), `RIVER_LIT_PX`,
`PLACE_LIT`; the three steps themselves are `SHARP`. For the cities: `CITY_MAX_ALT` (how close before any show),
`CITY_ZOOM` (how close before smaller towns show), `CITY_MAX` (most names on screen at once), `CITY_TAP_PX`. In `dev/build_physical.py`: the picture sizes (`BASE`,
`LEVELS`, `CRISP` for where the sharp coasts start), `SHARPEN`, `COLOUR` and `CONTRAST` (the source is pale) and `FEATURES`.

In `assets/levels.json`, per trip: the places asked (`ask`), how many questions (`questions`; `always` for places in every trip), the camera (`camera`, `view`; `world` for the
later trips), pale other countries (`pale`), how many flag questions (`flags`) and how alike the wrong flags are
(`cards`: far, near, alike), capital questions (`capitals`). Also the continent views (`regions`), when a
place gets a view of its own (`closer`), the look-alike flag groups, the islands, the capital cities and
the stickers (only the continents' animals are shown now). Every spoken line is in `assets/lines.json`.

At the top of `finale.js`: `TILT`, `ORBIT`, `SUN_R`, `EARTH_BIG`, `GHOST`, `OBLIQUE`, `YEAR_SECONDS`, `SPIN`.

## Borders

The map is Natural Earth 1:50m. Crimea is drawn as part of Ukraine (the source data has it as Russia;
`dev/build_map.py` moves it). Northern Cyprus is part of Cyprus and Somaliland part of Somalia. Western
Sahara, Kosovo, Taiwan, Palestine and Kashmir are drawn as the data has them and never asked about. Their
cities show in Look around, but a tap says only the city's name (*"This is Taipei."*), with no country and no
capital star; the same goes for Jerusalem.

## Credits and licences

- Map: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via
  [world-atlas](https://github.com/topojson/world-atlas) 2.0.2 (ISC).
- Physical map: Natural Earth's *Cross Blended Hypsometric Tints with Shaded Relief, Ocean Bottom and
  Drainages* (1:10m raster, high resolution, public domain), with a little more colour, and its 1:50m marine
  areas, physical regions, lakes and rivers (1:10m for the Colorado River), and its 1:10m land, minor islands and
  lakes for the sharp coasts and the Canary Islands (public domain, from
  [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) 5.1.2).
- Cities: Natural Earth's 1:10m populated places (public domain, natural-earth-vector 5.1.2).
- Flags: [flag-icons](https://github.com/lipis/flag-icons) 7.5.0 by Panayiotis Lipiridis (MIT, see
  `assets/flags/LICENSE`). Country codes from [i18n-iso-countries](https://github.com/michaelwittig/node-i18n-iso-countries) 7.14.0 (MIT).
- 3D: [three.js](https://threejs.org/) 0.160.0 (MIT), from jsDelivr. Title font: Fredoka (Google Fonts, OFL).

### Audio credits

All voices: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) v1.0 (Apache 2.0, by hexgrad), run
locally with kokoro-onnx (MIT) by `dev/voices.py`, voice `af_heart` (American English) at speed 0.85,
made on 2026-10-27 (the physical map's places on 2026-10-30). No ElevenLabs audio, no credit needed. `assets/voice/clips.json` lists every clip with
its file, its text and the date it was made. A few names are given their sounds by hand (`PHONEMES` in
`dev/voices.py`: Slovakia, Kyiv, Reykjavik, the Maldives, the Gobi, Lake Baikal…). Sound effects are synthesized in the browser.
