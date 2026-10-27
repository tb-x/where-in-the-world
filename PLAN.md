# Where in the World? — plan

Working title. A talking world-map game for 5-year-olds. A little plane flies round a 3D globe, the
camera follows it down to a part of the world, and a friendly voice asks *"Where is Italy?"*; the child taps
the country. Other questions show five flags and ask *"Which flag is Italy's?"*. Every country found
gets painted with its own flag, so over a level the map fills up with colour, and its stamp goes in a
passport. Twelve levels go from the continents and a few giant countries to small countries and
look-alike flags. All speech is rendered on this laptop with Kokoro, like What Should Frank Do?.

Folder `world-map/`, repo `where-in-the-world` (if the name sticks), port **5235**, American English.

Decided 2026-10-27: **American English** (Kokoro `af_heart`), a **3D globe** rather than a flat map (the
child can zoom in, so small countries are still tappable). Step 1 (globe, border fixes, camera, flights,
tapping a country, drag and pinch) is built.

## 1. How it plays

- **Start screen**: the globe turns slowly, the plane loops over it. Big buttons: ▶ Play (the level
  map), 🔍 Look around, 🛂 Passport. Home button top-left.
- **A level** is one trip: the plane takes off from Poland (home, always marked with a little house), flies
  to the level's part of the world, and the camera glides after it and zooms in. About **8 questions**,
  then the plane flies home and the end card shows the countries stamped.
- **Map question** (*"Where is Italy?"*): the line is spoken and repeats from a 🔊 button. The child taps.
  - Right: the country pops up a little, fills with its flag (painted onto the country's shape), a
    picture sticker appears on it (🍕 Italy, 🦘 Australia, 🐼 China…), *"Yes! This is Italy."*,
    a stamp sound.
  - Wrong: the tapped country wiggles and says its own name (*"This is Spain."*), so a wrong tap still
    teaches something. After the 2nd wrong tap a soft ring pulses around the right area; after the 3rd the
    plane flies to the country and it glows until tapped. Nothing ends, nothing is lost.
- **Flag question**, two kinds:
  - *"Which flag is Italy's?"* with five flag cards (the user's idea).
  - Later levels: a country found earlier in the level lights up on the map, *"This is Italy. Which flag
    is Italy's?"* — ties the shape to the flag.
  - Right card: it flies onto the country on the map. Wrong card: it says its country's name and wiggles;
    after two wrong cards the wrong ones fade until two are left.
  - Five cards: one row on a tablet or a phone held sideways, 3 + 2 on a phone held upright; each card at
    least 88 px wide, the flag at 4:3 with a thin border (white flags must show on a white card).
- **Order inside a level**: a country is asked on the map first and later as a flag, so each flag
  question is about a country the child has just found. The last question of a level is a map question,
  so the trip ends on a filled-in map.
- **Stars**: one per country found on the first try, shown as stamps on the end card. The end card is
  always cheerful (*"What a trip!"*); the next level opens after any finish, not only a good one.
- **Look around** (free mode, open from the start): drag to turn the globe, pinch to zoom; tap any country to hear its
  name and see its flag pop up. Cheap, since every clip already exists, and probably the part a
  5-year-old returns to most.
- **Passport**: a booklet of every country stamped so far (flag, sticker, name), kept in
  `localStorage`. Tapping a stamp says the name.

## 2. Levels

Difficulty grows along five knobs, in this order: **size on screen** (the target at least ~60 px in
early levels, ~25 px later), **zoom** (a tight region, then a continent, then the whole world), **how many
countries can be tapped** (only the level's set is coloured at first, the rest are pale and still say
their names; later everything is coloured), **how alike the flags are** (very different colours, then
neighbours, then look-alikes), and **how soon hints come**.

| # | Trip | Where the camera goes | Countries (draft) | Flags |
| --- | --- | --- | --- | --- |
| 1 | Continents | whole world, continents in 7 colours | Europe, Asia, Africa, North America, South America, Australia, Antarctica | none |
| 2 | Home and giants | world, then a zoom on Europe for Poland | Poland, Russia, China, USA, Canada, Brazil, Australia, India | 2, very different |
| 3 | Poland's neighbours | central Europe, tight | Germany, Czechia, Slovakia, Ukraine, Belarus, Lithuania | 3 |
| 4 | Big Europe | Europe | France, Spain, Italy (the boot), United Kingdom, Norway, Sweden, Greece, Portugal | 3 |
| 5 | The Americas | North, then South America | USA, Canada, Mexico, Cuba, Brazil, Argentina, Chile (the long one), Peru, Colombia | 3 |
| 6 | Africa | Africa | Egypt, Morocco, Algeria, Nigeria, Kenya, Ethiopia, South Africa, Madagascar | 3 |
| 7 | Asia | Asia | China, Japan, India, Mongolia, Saudi Arabia, Turkey, Thailand, South Korea, Indonesia | 4 |
| 8 | Famous islands | a wide view of the ocean round each island, the island off-centre | 8 picked at random from 16: island countries (Iceland, Ireland, Cyprus, Madagascar, Sri Lanka, Japan, New Zealand, Cuba, Jamaica, Philippines), Greenland, and famous islands that belong to a country (Great Britain, Sicily, Crete, Tasmania, Hawaii) | 4 |
| 9 | Flag party (Europe) | Europe, countries light up | mostly flag questions about levels 3–4, distractors are neighbours | 6 |
| 10 | Little Europe | western and central Europe | Netherlands, Belgium, Switzerland, Austria, Hungary, Denmark, Finland, Romania, Croatia | 4 |
| 11 | Look-alike flags | wherever the country is | Poland / Indonesia, Italy / Ireland / Mexico, France / Netherlands / Russia, Romania / Chad, Norway / Iceland / Denmark / Sweden / Finland | 6 |
| 12 | Capital cities | each country's continent | *"Find the country with the capital city Paris."* 8 of 24 big or nearby countries; right: *"Yes! Paris is the capital city of France."* and a ⭐ on the capital, labelled (asked 2026-10-27) | 0 |
| 13 | Round the world | each country's continent | a mix of every level (one question asked by its capital) | 4 |
| 14 | World tour | each country's continent | endless: mostly places from the passport, 2 not stamped yet (32 more countries are only here: Vietnam, Kenya's neighbours, the Baltics…), 2 asked by capital | 2 |

**Islands that belong to a country** (asked 2026-10-27): Hawaii, Sicily, Crete, Tasmania and Great Britain
aren't countries, so `levels.json` defines each as a country plus a point (the part containing it) or a
box (the parts whose middle falls inside it; Hawaii's 7 islands). Only those parts count as a right tap
and get the country's flag (Sicily gets Italy's, which teaches whose island it is); the rest of the
country is unchanged, since the mesh keeps each part's triangles in their own group. An island doesn't
lift (that would lift the whole country). The camera shows the sea round it, 3× its size (8°–16° each
way), with the island off-centre.

After Round the world (the first time only, 2.5 s after its end card, and from a 🌞 tile on the level map after
that): **the seasons finale**, section 8. Then **World tour**, endless random trips over countries the passport
already has, with a few new ones mixed in. About 100 countries in all; 53 have a capital city in `levels.json`
(`capitals`: name and where it is; `dev/check.py` checks every star falls inside its country).

**How a question frames the map** (changed 2026-10-27 after play-testing: a view zoomed in on the answer gives it
away). Each level's camera (`camera` in `levels.json`) is used as is when the place is inside its view and at least
`closer.minPx` (10) pixels on a 360 px phone; children can pinch to zoom in on small ones. Otherwise (an island level,
a place outside the view, or a really tiny one) the place gets a wide view of its own, 15°–30° each way, with the place
pushed well off-centre (`closer.offset`), so Sri Lanka shows up beside India, not alone. **Flag questions hide every
painted flag** while they're asked (the country lights up with its name instead), so they test remembering, not
matching (also changed 2026-10-27). Never asked: micro-states too small to tap, and the
disputed places in section 4.

## 3. Voice (Kokoro, local)

Same set-up as What Should Frank Do?: Kokoro-82M (Apache 2.0) through kokoro-onnx in
`../_tools/kokoro/` (already installed, models present), rendered by `dev/voices.py` into
`assets/voice/*.mp3` plus `assets/voice/clips.json`. No credits, nothing sent anywhere. Kokoro has no
Polish, so the game is in English.

- **One narrator**, warm and slow: `af_heart` (American, Frank's narrator), at speed ~0.85; fine-tune
  speed with `--audition`.
- **Whole sentences per country**, not "Where is" + a name glued on: joined clips sound choppy, and
  short separate lines drift off the voice. Per country: *"Where is Italy?"*, *"Which flag is Italy's?"*,
  *"Yes! This is Italy."*, *"This is Italy."* (wrong taps, Look around, passport). ~90 countries × 4 ≈
  360 short clips, about 4 MB, fetched per level (and cached by `sw.js`), not all at start.
- **Shared lines**: per region *"Let's fly to Africa!"*, plus *"Look here!"*, *"Try again!"*, *"Well
  done!"*, *"What a trip!"*, *"Time to fly home."*, a few end-card lines.
- **Names said the way a child hears them**: "the USA", "the UK", "Czechia" (or "the Czech Republic",
  to decide), "South Korea". Kokoro will mispronounce a few names (Qatar, Côte d'Ivoire, Nauru…): a
  `SAY` table in `dev/voices.py` gives a respelling or Kokoro phonemes for those, and every name is
  checked by ear on the audition page before it ships. (Built: `PHONEMES` in `dev/voices.py` swaps in
  the right sounds for a name inside any line; `SAY_AS` respells text.)
- Fallback as in Frank: a missing clip is read by `speechSynthesis` (`en-US`). Until the clips exist,
  that's what Look around uses. It's silent on test pages (`?tbxtest`).

## 4. Map data

- **Source**: Natural Earth 1:50m countries (public domain) from `world-atlas@2.0.2` (ISC), 241 shapes.
  A dev script, `dev/build_map.py` (plain Python, no packages; it downloads the source into the
  uncommitted `dev/data/`), turns it into `assets/world.json` (built 2026-10-27: 237 countries, 752 KB,
  255 KB gzipped): each country's rings in longitude/latitude, simplified to ~1 km and stored as
  1/100° integers, with no edge longer than 1° (so straight borders bend with the globe); the coast and
  border lines once each; a display name and a spoken name ("the United States"); continent (a hand
  table, since world-atlas drops it); a map colour (5 colours, neighbours never share one); a label point
  (deepest inside the biggest part); and a box round the main parts for the camera. Rings that cross the
  180° line are made continuous (longitudes may run past 180), and Antarctica is closed through the
  pole. Vatican City and the Ashmore and Cartier Islands are too small to survive and are dropped.
  ISO alpha-2 codes (for flags) come in step 4.
- **Borders we fix**, checked in the data on 2026-10-27:
  - **Crimea is drawn as part of Russia** in world-atlas (110m and 50m). It's a separate polygon of
    Russia's shape, so the script moves it to Ukraine and drops the line between them. Crimea is shown
    as Ukraine, as Poland and the UN do.
  - Northern Cyprus is merged into Cyprus, Somaliland into Somalia.
  - Western Sahara, Kosovo, Taiwan, Palestine and Kashmir are drawn as the data has them but are
    **never asked**, so the game never has to name a side.
- **Flags**: `flag-icons@7.5.0` (MIT; 7.6.0 is less than two weeks old), the 4:3 SVGs for all 236
  countries with a flag (1.5 MB, loaded only when needed), copied into `assets/flags/` by `dev/flags.py`
  with its MIT licence file (the licence asks for the notice to go with the copies). Each country's
  two-letter code comes from `i18n-iso-countries@7.14.0` (MIT), matched on the ISO number in the map data;
  Kosovo (`xk`) and Christmas Island (`cx`) are set by hand, the Siachen Glacier has none. Nothing drawn by
  hand, no PixelLab, no credits.
- **Painting a flag on a country**: the SVG is drawn onto a 512×384 canvas texture; the country's mesh
  gets texture coordinates that stretch the 4:3 flag to cover its main box (measured on the ground), and
  the found parts switch to the flag material.
- `dev/check.py` checks every level: each country exists in the map, has a flag, has all four clips,
  and is at least the level's minimum size on screen at the level's zoom on a 360 × 640 phone.

## 5. Making it work on a phone

- **3D globe** in three.js 0.160.0 (jsDelivr, as in most tb-x 3D games). Each country is a mesh: its
  rings are cut into triangles with three's earcut in longitude/latitude, triangles longer than 1° are
  split so the surface follows the sphere, then wrapped onto it (~180,000 triangles, built in ~0.2 s on
  load). The ocean is a slightly smaller sphere underneath; coasts and borders are line segments just
  above; a soft glow rings the globe when it's seen from far away. Flat pastel colours, a light that moves
  with the camera.
- **Camera**: always looks straight down at a point, from a height above the ground (`view.lon`,
  `view.lat`, `view.alt`). Flights use the van Wijk and Nuij smooth zoom (the curve d3 uses) along the
  great circle: climb, glide, come down. A country flown to fills ~45% of the screen so its neighbours
  show; a region fills ~82%. The camera goes no lower than ~190 km (the map's detail ends there).
- **Taps**: a ray from the finger hits the globe; the country under it is found by point-in-polygon on
  the rings. A tap in the sea within 12 or 24 px of a country still finds it. In question mode taps must
  not turn the globe; Look around turns (drag, with a little momentum), zooms (pinch, mouse wheel) and
  taps.
- **Layout**: globe full screen; the question bar (🔊 button, round dots for progress) at the top; flag
  cards slide up from the bottom (portrait) or in from the right (wide, short screens). Safe areas
  respected; the camera fits the region into what's left of the screen.
- **Sound**: Web Audio, synthesized: a soft plane hum while flying, pop and stamp for right answers, a
  gentle boop for wrong ones. No music to start with.
- The found country gets its flag painted on (the flag drawn into a small texture clipped to the
  country, mapped onto its mesh), instead of the SVG clip-path the flat map would have used.
- Static, no build: `index.html`, `styles.css`, `game.js` (`?v=N` cache busting), `assets/`, `dev/`;
  home button, manifest, icons, `sw.js` copied from `blast-off/` with `PREFIX` `world-map`.
- Persistence `world.<key>`: levels finished, stars, passport stamps, sound on/off.
- Telemetry (local only): `tbxEvent('level-start' | 'level-end', { level, firstTry })` and
  `tbxEvent('mixup', { asked, tapped })`, which shows which countries and flags kids confuse.
- Test hook `window.__wm`: `step(seconds)` runs the game without animation frames (a hidden test page
  gets none), `goRegion`, `goCountry`, `select`, `tap(x, y)`, `at(lon, lat)`, `near(x, y)`; later also
  answer the current question and jump to a level, so levels can be played through silently.

## 6. Tuning knobs (named constants at the top of `game.js`)

Already in: `FOV`, `MIN_ALT`, `MAX_ALT`, `FIT_PAD`, `COUNTRY_FIT`, `ISLAND_VIEW`, `MAX_TRI_EDGE`,
`TAP_MOVE_PX`, `TAP_SLOP_PX`, `IDLE_SPIN`, `FLY_RHO`, `FLY_SPEED`, `LABEL_SECONDS`, `CLIP_VOL`, `SFX_VOL`,
`QUESTIONS_PER_LEVEL` 8, `HINT_AFTER` [2, 3], `REMIND_SECONDS` 9, `LIFT`, `COLOURS`, `CONT_COLOURS`,
`PALE`, `REGIONS`, `CARDS` 5, `CARD_FLY`. Per level in `assets/levels.json`: `camera`, `view`, `pick`,
`pale`, `flags` (how many flag questions), `lightup`, `cards` ('far', 'near', 'alike'); plus the
`lookalikes` groups and the `stickers`.

## 7. Build order

1. **Done 2026-10-27.** `dev/build_map.py` and the globe on screen: Crimea and the other fixes, camera
   fit and flights, tapping a country names it (Look around, with the device's voice for now), drag and
   pinch. A row of animal buttons (🌍 🏰 🦁 🐼 🦅 🦜 🦘 🐧 🏠) flies to each continent and home.
2. **Done 2026-10-27.** `dev/voices.py`: 445 clips at first (now 692, 9.9 MB, with the World tour, capitals and finale; ~2 s each, 48 kbps mono), `af_heart` at
   0.85. "This is …" for all 237 countries and the continents; "Where is …?", "Find the flag of …" and
   "Yes! This is …" for every name in `assets/levels.json` (the draft levels); the shared lines in
   `assets/lines.json`. Names checked with `--phonemes`: eleven had wrong sounds and get fixed ones
   (`PHONEMES`: Slovakia, Andorra, Macau, Palau, the Maldives…), "U.S." is read as letters. Listening
   pages (not committed): `dev/audition/clips.html` (every clip) and `dev/audition/index.html` (four
   voices at four speeds). Not yet checked by ear. The game plays clips through Web Audio (unlocked on
   the first touch) and falls back to the device's voice for a line without one.
3. **Done 2026-10-27.** Start screen (▶ trips, 🔍 Look around), a level map of 12 (each opens when the one
   before is finished; `?all` opens them all), and the question loop: the camera moves per the level's
   `camera`, *"Where is …?"* (again from 🔊, and again by itself after 9 s without a tap), a wrong tap
   names what was tapped, the ring after 2 wrong taps, a flight there and a glow after 3; right: the flag
   is painted on, a sticker pops up, *"Yes! This is …"*, a gold dot for a first try. End card with stars
   (1–3 from first tries), the flag stamps, ↺ / 🗺️ / ▶, saved in `localStorage` (`world.progress`).
   Level 1 colours the continents (Russia split at the Urals); levels 2–3 draw the other countries pale.
   Synthesized sounds for right, wrong and the end. Levels 1, 2, 3 and 8 played through silently in the
   preview; every map-question level already works (9 and 11 ask on the map until step 4).
4. **Done 2026-10-27.** Flag questions: five flag cards along the bottom (3 + 2 on a phone held upright),
   the globe moved up above them. Two kinds: in most levels a flag question comes back to a country found
   earlier in the trip (its flag is painted on the map, so it's matching), placed between map questions,
   never last; in `lightup` levels (9 and 11) the country lights up unfound, *"This is Ireland. Find the
   flag of Ireland."* Wrong flags: `cards` per level, `far` (other continents), `near` (same continent) or
   `alike` (the `lookalikes` groups in `levels.json` first: Ireland gets Ivory Coast, Italy, Mexico,
   Hungary). A wrong card shakes and says its country; after 2 wrong only two cards are left, after 3
   only the right one, glowing; 9 s without a tap asks again, then also thins the cards. The right card
   flies onto the country. Flag dots in the progress bar are square. **Passport** (🛂 on the start
   screen): every place ever found, stamped with flag and sticker, grouped by continent, kept in
   `localStorage` (`world.passport`); tapping a stamp says its name. Levels 2 and 11 played through
   silently, on a laptop-sized screen and a phone.
5. **Done 2026-10-27.** `dev/check.py` checks every level (names, islands, flags, clips, wrong-flag pools, capitals
   inside their countries) and prints which places get their own view; 0 errors. World tour (level 14), the capitals
   level (12) and capital questions in levels 13 and 14. The camera rules and continent views moved into
   `levels.json` (`regions`, `closer`) so the checker and the game share them.
6. **Done 2026-10-27.** The seasons finale, `finale.js` (loaded only when needed), section 8. Played through
   silently beat by beat; the child's turn was tested by pushing the Earth from the test hook
   (`__wm.finale(beat)`, `__wm.push(theta)`), not yet with a finger on a real phone.
7. Offline (`sw.js`, manifest, icons), README with audio credits, play-test on a phone and a tablet both
   ways round, then publish and add it to `CLAUDE.md` and the landing page.

## 8. Finale: why we have summer and winter (planned and built 2026-10-27)

A talking, animated space scene of about 2 minutes, played once after the last level, then any time from
🌞 on the level map. It uses the game's own globe as the Earth, the same narrator (`af_heart`, ~17 new
Kokoro clips, free) and no picture files: everything is made in three.js plus emoji. Each beat waits for
its line to finish; a ⏭ button skips to the next beat and ✖ leaves. Ends with something to do, not only
something to watch.

**The idea a 5-year-old should leave with**: the Earth is tipped over a little and stays tipped the same
way all year. When our side leans towards the Sun we get summer, when it leans away we get winter. And
when it's winter here, it's summer in Australia.

**What it must not teach by mistake** (the usual misconceptions): the orbit is drawn as a circle (not a
long oval, which suggests seasons come from being nearer the Sun); the axis points the same way in space
all the way round (never turned towards the Sun); sizes and distances aren't to scale, and nothing says
they are.

| # | What you see | What the narrator says (draft) |
| --- | --- | --- |
| 1 | The end card fades; the camera pulls back from the globe until it's a small ball among stars. A little rocket 🚀 zooms past. | "You flew all around the world! Now let's fly up into space." |
| 2 | The Sun slides in from the side: a realistic glowing ball (churning grainy surface, darker redder edge, soft halo; changed from a cartoon face 2026-10-27). | "This is the Sun. It keeps us warm, and it gives us light." |
| 3 | The Sun now lights the Earth from one side: a day side and a night side (deep blue, little city lights twinkling). The Earth turns; Poland's house 🏠 goes into the dark (🌙 and ⭐ pop up over it), then back into the light (☀️). | "The Earth spins round and round. When our home faces the Sun, it's day. When it turns away, it's night." |
| 4 | A stick appears through the poles like a skewer through an orange, upright, then tips over to 23.4°. A dotted line from its top leads to a twinkling North Star. | "Look! The Earth is a little bit tipped over, like this. And it always points the same way, at the North Star." |
| 5 | The textbook view (changed 2026-10-27; a view from straight above with a small Earth hid the tilt): the camera looks at the orbit from the side and 22° above, the Earth grows to 2.2× and four faint Earths sit at December, March, June and September, every stick leaning the same way, each lit by the Sun; a sign under each: ❄️ ⛄, 🌸, ☀️ 🍦, 🍂. The Earth goes round in about 12 seconds; its stick keeps pointing at the star. | "Every year, the Earth travels all the way around the Sun." |
| 6 | The Earth stops in June. The camera flies close: the top half of the Earth leans towards the Sun and is bright. Three thick sunbeams hit Poland straight on; the day side covers most of the top. 🏖️ 🍦 pop up by Poland. | "When our half of the Earth leans toward the Sun, the sunshine is strong and the days are long. It's summer!" |
| 7 | The Earth glides half way round to December. Same camera: our half leans away; the beams hit Poland at a slant and spread thin; the night side covers most of the top. Snowflakes drift round Poland, ⛄ pops up. | "Half a year later, our half leans away from the Sun. The sunshine is weak and the days are short. Brrr! It's winter." |
| 7b | Why (asked 2026-10-27): a picture card of sky and ground. The Sun on an arc shines a band of parallel rays (always the same width: the same amount of light). High up (62°, Poland's June noon) the band lands on a small bright patch, the thermometer is red and high, 😎; low (15°, December) the same band spreads over a long pale patch, the thermometer drops, 🥶. Then the child drags the Sun up and down. | "Why is summer warm, and winter cold? Let's look at the sunshine." "In summer, the Sun is high up. Its light lands on a small spot, so the ground gets warm." "In winter, the Sun stays low. The same light spreads out over a bigger place, so the ground stays cold." "Now you move the Sun, up and down!" |
| 8 | Still December: the camera swings down to the bottom half. Australia is bright and straight under the beams; 🦘 with 😎 and 🎅 on a beach 🏖️. | "And guess what? When it's winter here, it's summer in Australia!" |
| 9 | Quick glide through March and September; blossom 🌸 and leaves 🍂 drift. | "In between come spring and fall." |
| 10 | **Your turn**, in the same side view with the faint Earths: a hand 👆 by the Earth shows where to push. The child drags it along the circle; a box at the top shows home's season (🏠 ⛄ / 🌸 / ☀️ 🍦 / 🍂) and each new season is said as it's reached (again at most every 1.4 s); after all four, the ending. | "Now you try! Push the Earth around the Sun." … "Winter!" "Spring!" "Summer!" "Fall!" |
| 11 | After all four seasons (or ✔): confetti, a medal 🏅 "World Explorer" lands in the passport. Buttons: ↺ again, 🗺 levels. | "The Earth goes round and round, and the seasons come again and again. Well done, world explorer!" |

How it's built:

- **The Earth** is the game's globe group, scaled down, with the camera's light switched off and a light at
  the Sun instead, so the day and night sides are real; the night side gets a dim blue fill (never black)
  and a few twinkling dots where big cities are. Flags painted during the levels stay on.
- **The tilt** is a parent group tipped 23.4° about a fixed axis; the Earth spins inside it. Orbiting moves
  the parent without turning it, so the axis stays parallel (and pointing at the star) all year.
- **The Sun**: a sphere with its own shader (two layers of moving noise for the gas, limb darkening towards a
  red-orange edge), a glow shell and a wide faint halo sprite; the light comes from a point light inside it.
- **Sunbeams**: three fat translucent cylinders from the Sun to Poland's spot; at a slant they're drawn
  wider and paler (the same light spread over more ground), which is the whole point of beats 6 and 7.
- **Snow, blossom, leaves**: small particle sprites drawn from emoji onto canvases.
- **Season signs, 🏠, 🌙, 🦘**: HTML labels placed over 3D points each frame, like the country name bubble.
- **Timeline**: beats are data (camera target, Earth position on the orbit, tilt, what shows, line);
  tweens run on the game clock, so `__wm.step()` can play the whole finale silently in tests and
  `__wm.finale(beat)` jumps to one beat.
- **Lines**: ~17 new entries under `finale` in `assets/lines.json`, rendered by `dev/voices.py` like the rest.
  American "fall", not "autumn".
- **Telemetry**: `tbxEvent('finale', { beat })` when a beat starts, so the report shows where children stop
  watching.

As built: `finale.js`, about 600 lines; 23 lines in `assets/lines.json` under `finale` ("Brrr!" is voiced as "Burr!",
since Kokoro spelled it out). Before the Sun appears the Earth is lit as in the game; the light then fades over to the
Sun. The camera rigs (close, both, side, profile, above, lean) follow the Earth as it moves. The medal is saved as
`world.medal` and shown on the passport; `world.finaleSeen` adds the 🌞 tile.

## 9. Open questions

- **Name**: "Where in the World?", or something with the plane in it ("Fly Me There!").
- **Russia's continent**: listed as Europe for now; level 1 (continents) may want it split.
- **"Czechia" or "the Czech Republic"**, and "the United States" or "America".
