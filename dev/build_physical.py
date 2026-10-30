"""Build the physical map for Look around: a relief picture of the Earth and the places on it a child can tap.

Sources (all Natural Earth, public domain, downloaded once into dev/data/physical/, not committed):
- Cross Blended Hypsometric Tints with Shaded Relief, Ocean Bottom and Drainages, 1:10m, high resolution
  (HYP_HR_SR_OB_DR, 21,600 x 10,800, a 400 MB download): green lowlands, tan deserts, brown mountains, white ice, deeper sea
  darker, rivers and lakes. https://www.naturalearthdata.com/downloads/10m-raster-data/10m-cross-blend-hypso/
- 1:50m physical vectors from natural-earth-vector v5.1.2 (GeoJSON; 1:10m rivers for the Colorado): marine areas, physical regions
  (mountain ranges, deserts, basins, plains), lakes, and rivers.
- 1:10m land, minor islands and lakes (same place): the outlines the close-up tiles' coasts are drawn sharp along,
  and the small islands picked by a point (the Canary Islands).

    python dev/build_physical.py            (needs Pillow, numpy and scipy; the rest of dev/ is plain Python)
    python dev/build_physical.py --places   only physical.json

Output:
- assets/physical/base.jpg, the whole Earth at 2048 x 1024, shown as soon as the physical map is chosen;
- assets/physical/t<col>-<row>.jpg, the Earth at 8192 x 4096 cut into 8 x 4 tiles of 45 degrees, loaded only
  where the camera is close; u<col>-<row>.jpg, 16384 x 8192 in 16 x 8 tiles of 22.5 degrees, closer still; and
  v<col>-<row>.jpg, 32768 x 16384 in 32 x 16 tiles of 11.25 degrees, closest, only where there's a coast or lake
  shore (LEVELS). The u and v tiles have their coasts drawn sharp from the 1:10m outlines (crisp_tile); the source
  picture itself has about 1.9 km to a pixel, so inland the v tiles are only scaled up (and a little sharpened);
- assets/physical.json, the places (FEATURES below), coordinates as in world.json (1/Q degree integers,
  delta-encoded): { q, sharpest: ['col-row', ...] (the v tiles there are), features: [{ name, kind, label: [lon, lat],
  polys: [[ring, hole...], ...] } or { name, kind, label, lines: [line, ...] } for rivers ] }. What the narrator says
  about each one is in assets/lines.json under "physical", keyed by the same name.
"""
import json
import math
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
DATA = HERE / 'data' / 'physical'
OUT = GAME / 'assets' / 'physical'
RASTER_URL = 'https://naciscdn.org/naturalearth/10m/raster/HYP_HR_SR_OB_DR.zip'
RASTER = DATA / 'hyp-hr' / 'HYP_HR_SR_OB_DR.tif'
VECTOR_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/{}.geojson'

BASE = (2048, 1024)
LEVELS = [(8192, 't'), (16384, 'u'), (32768, 'v')]   # the Earth's width in pixels for each set of tiles, and its prefix
TILE = 1024        # 8 x 4 tiles of 45 degrees, then 16 x 8 of 22.5, then 32 x 16 of 11.25
CRISP = 16384      # from this width up, coasts and lake shores are drawn sharp from the 1:10m outlines (crisp_tile);
                   # the sharpest step keeps only the tiles with a coast or shore in them (sharpest.json lists them)
LAND10 = ['ne_10m_land', 'ne_10m_minor_islands']
LAKES10 = 'ne_10m_lakes'
SHARPEN = (1.0, 70)  # unsharp mask (radius in picture pixels, percent) for land where a tile is scaled up from it
ISLAND_SIMPLIFY = 0.003  # degrees: small islands picked from the 1:10m land keep their shape
JPEG_Q = 82
COLOUR = 1.3       # the source is soft and pale; a little more colour and contrast reads better for a child
CONTRAST = 1.08
Q = 100            # coordinates in 1/100 degree, as in world.json
SIMPLIFY = 0.04    # degrees: the places are only for tapping and a soft highlight

# name: (kind, source, names in the source[, box]). A place made of several source shapes lists them all
# (the Mediterranean's own seas, the Andes' cordilleras); a river is every line with one of its names (the data
# names some stretches in the local language: Donau, Rhein, the Nile's Bahr el Jebel and El Bahr el Abyad). A box
# [west, south, east, north] keeps only the shapes starting inside it, for a name used twice (the Colorado River).
# Source 'land10' takes points instead of names: the 1:10m land shape under each point (an island the 1:50m data
# doesn't name, like each of the Canary Islands).
FEATURES = {
    'Pacific Ocean': ('ocean', 'marine', ['North Pacific Ocean', 'South Pacific Ocean']),
    'Atlantic Ocean': ('ocean', 'marine', ['North Atlantic Ocean', 'South Atlantic Ocean']),
    'Indian Ocean': ('ocean', 'marine', ['INDIAN OCEAN']),
    'Arctic Ocean': ('ocean', 'marine', ['Arctic Ocean']),
    'Southern Ocean': ('ocean', 'marine', ['SOUTHERN OCEAN']),
    'Baltic Sea': ('sea', 'marine', ['Baltic Sea', 'Gulf of Bothnia', 'Gulf of Finland']),
    'North Sea': ('sea', 'marine', ['North Sea']),
    'Mediterranean Sea': ('sea', 'marine', ['Mediterranean Sea', 'Tyrrhenian Sea', 'Ionian Sea', 'Balearic Sea',
                                            'Golfe du Lion']),
    'Adriatic Sea': ('sea', 'marine', ['Adriatic Sea']),
    'Aegean Sea': ('sea', 'marine', ['Aegean Sea']),
    'Black Sea': ('sea', 'marine', ['Black Sea']),
    'Red Sea': ('sea', 'marine', ['Red Sea']),
    'Caribbean Sea': ('sea', 'marine', ['Caribbean Sea', 'Gulf of Honduras']),
    'Gulf of Mexico': ('sea', 'marine', ['Gulf of Mexico', 'Bahía de Campeche']),
    'Arabian Sea': ('sea', 'marine', ['Arabian Sea']),
    'Bay of Bengal': ('sea', 'marine', ['Bay of Bengal']),
    'Hudson Bay': ('sea', 'marine', ['Hudson Bay', 'James Bay']),
    'Coral Sea': ('sea', 'marine', ['Coral Sea']),
    'Tasman Sea': ('sea', 'marine', ['Tasman Sea']),
    'Bering Sea': ('sea', 'marine', ['Bering Sea']),
    'Norwegian Sea': ('sea', 'marine', ['Norwegian Sea']),
    'Barents Sea': ('sea', 'marine', ['Barents Sea']),
    'Gulf of Guinea': ('sea', 'marine', ['Gulf of Guinea']),
    'Weddell Sea': ('sea', 'marine', ['Weddell Sea']),
    'Ross Sea': ('sea', 'marine', ['Ross Sea']),
    'South China Sea': ('sea', 'marine', ['South China Sea']),
    'East China Sea': ('sea', 'marine', ['East China Sea']),
    'Yellow Sea': ('sea', 'marine', ['Yellow Sea', 'Bo Hai']),
    'Philippine Sea': ('sea', 'marine', ['Philippine Sea']),
    'Sea of Okhotsk': ('sea', 'marine', ['Sea of Okhotsk']),
    'Java Sea': ('sea', 'marine', ['Java Sea']),
    'Andaman Sea': ('sea', 'marine', ['Andaman Sea']),
    'Gulf of Thailand': ('sea', 'marine', ['Gulf of Thailand']),
    'Timor Sea': ('sea', 'marine', ['Timor Sea']),
    'Arafura Sea': ('sea', 'marine', ['Arafura Sea']),
    'Gulf of Carpentaria': ('sea', 'marine', ['Gulf of Carpentaria']),
    'Great Australian Bight': ('sea', 'marine', ['Great Australian Bight']),
    'Gulf of Aden': ('sea', 'marine', ['Gulf of Aden']),
    'Gulf of Alaska': ('sea', 'marine', ['Gulf of Alaska']),
    'Gulf of California': ('sea', 'marine', ['Golfo de California']),
    'Labrador Sea': ('sea', 'marine', ['Labrador Sea']),
    'Baffin Bay': ('sea', 'marine', ['Baffin Bay']),
    'Beaufort Sea': ('sea', 'marine', ['Beaufort Sea']),
    'Chukchi Sea': ('sea', 'marine', ['Chukchi Sea']),
    'Greenland Sea': ('sea', 'marine', ['Greenland Sea']),
    'Kara Sea': ('sea', 'marine', ['Kara Sea']),
    'Laptev Sea': ('sea', 'marine', ['Laptev Sea']),
    'White Sea': ('sea', 'marine', ['White Sea']),
    'Irish Sea': ('sea', 'marine', ['Irish Sea']),
    'Bay of Biscay': ('sea', 'marine', ['Bay of Biscay']),
    'Sargasso Sea': ('sea', 'marine', ['Sargasso Sea']),
    'Scotia Sea': ('sea', 'marine', ['Scotia Sea']),
    'Caspian Sea': ('lake', 'marine', ['Caspian Sea']),
    'Lake Baikal': ('lake', 'lakes', ['Lake Baikal']),
    'Lake Victoria': ('lake', 'lakes', ['Lake Victoria']),
    'Lake Titicaca': ('lake', 'lakes', ['Lago Titicaca']),
    'Great Lakes': ('lake', 'lakes', ['Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario']),
    'Dead Sea': ('lake', 'lakes', ['Dead Sea']),
    'Lake Ladoga': ('lake', 'lakes', ['Lake Ladoga']),
    'Lake Onega': ('lake', 'lakes', ['Lake Onega']),
    'Lake Vanern': ('lake', 'lakes', ['Vänern']),
    'Lake Balaton': ('lake', 'lakes', ['Lake Balaton']),
    'Lake Geneva': ('lake', 'lakes', ['Lake Geneva']),
    'Aral Sea': ('lake', 'lakes', ['South Aral Sea', 'North Aral Sea']),
    'Lake Balkhash': ('lake', 'lakes', ['Lake Balkhash']),
    'Issyk-Kul': ('lake', 'lakes', ['Issyk-Kul']),
    'Lake Tanganyika': ('lake', 'lakes', ['Lake Tanganyika']),
    'Lake Malawi': ('lake', 'lakes', ['Lake Malawi']),
    'Lake Chad': ('lake', 'lakes', ['Lake Chad']),
    'Lake Turkana': ('lake', 'lakes', ['Lake Turkana']),
    'Lake Volta': ('lake', 'lakes', ['Lake Volta']),
    'Great Salt Lake': ('lake', 'lakes', ['Great Salt Lake']),
    'Lake Winnipeg': ('lake', 'lakes', ['Lake Winnipeg']),
    'Great Bear Lake': ('lake', 'lakes', ['Great Bear Lake']),
    'Great Slave Lake': ('lake', 'lakes', ['Great Slave Lake']),
    'Lake Nicaragua': ('lake', 'lakes', ['Lago de Nicaragua']),
    'Lake Eyre': ('lake', 'lakes', ['Lake Eyre North']),
    'Himalayas': ('mountains', 'regions', ['HIMALAYAS']),
    'Alps': ('mountains', 'regions', ['ALPS']),
    'Andes': ('mountains', 'regions', ['ANDES', 'CORDILLERA OCCIDENTAL', 'CORDILLERA  REAL', 'CORDILLERA ORIENTAL',
                                       'CORD. CENTRAL', 'CORD. OCCIDENTAL']),
    'Rocky Mountains': ('mountains', 'regions', ['ROCKY MOUNTAINS']),
    'Ural Mountains': ('mountains', 'regions', ['URAL MOUNTAINS']),
    'Carpathian Mountains': ('mountains', 'regions', ['CARPATHIAN MOUNTAINS']),
    'Atlas Mountains': ('mountains', 'regions', ['ATLAS MOUNTAINS', 'ATLAS SAHARIEN', 'HAUT ATLAS', 'Anti Atlas']),
    'Appalachian Mountains': ('mountains', 'regions', ['APPALACHIAN MTS.']),
    'Pyrenees': ('mountains', 'regions', ['PYRENEES']),
    'Caucasus Mountains': ('mountains', 'regions', ['CAUCASUS MTS.', 'Lesser Caucasus']),
    'Scandinavian Mountains': ('mountains', 'regions', ['KJØLEN MOUNTAINS']),
    'Apennines': ('mountains', 'regions', ['APPENNINI']),
    'Great Dividing Range': ('mountains', 'regions', ['GREAT DIVIDING RANGE']),
    'Southern Alps': ('mountains', 'regions', ['SOUTHERN ALPS']),
    'Transantarctic Mountains': ('mountains', 'regions', ['Transantarctic Mountains']),
    'Tian Shan': ('mountains', 'regions', ['TIAN SHAN']),
    'Karakoram': ('mountains', 'regions', ['KARAKORAM RA.']),
    'Hindu Kush': ('mountains', 'regions', ['HINDU KUSH']),
    'Pamirs': ('mountains', 'regions', ['PAMIRS']),
    'Kunlun Mountains': ('mountains', 'regions', ['KUNLUN MOUNTAINS']),
    'Altai Mountains': ('mountains', 'regions', ['ALTAY MOUNTAINS']),
    'Zagros Mountains': ('mountains', 'regions', ['ZAGROS MOUNTAINS']),
    'Western Ghats': ('mountains', 'regions', ['WESTERN GHATS']),
    'Ethiopian Highlands': ('mountains', 'regions', ['ETHIOPIAN HIGHLANDS']),
    'Drakensberg': ('mountains', 'regions', ['DRAKENSBERG']),
    'Balkan Mountains': ('mountains', 'regions', ['Balkan Mts.']),
    'Dinaric Alps': ('mountains', 'regions', ['Dinaric Alps']),
    'Sierra Madre': ('mountains', 'regions', ['SIERRA MADRE OCCIDENTAL', 'SIERRA MADRE ORIENTAL', 'Sierra Madre del Sur']),
    'Sierra Nevada': ('mountains', 'regions', ['SIERRA NEVADA']),
    'Cascade Range': ('mountains', 'regions', ['CASCADE RANGE']),
    'Alaska Range': ('mountains', 'regions', ['ALASKA RANGE']),
    'Brooks Range': ('mountains', 'regions', ['BROOKS RANGE']),
    'Guiana Highlands': ('mountains', 'regions', ['GUIANA HIGHLANDS']),
    'Sahara': ('desert', 'regions', ['SAHARA']),
    'Gobi Desert': ('desert', 'regions', ['GOBI DESERT']),
    'Empty Quarter': ('desert', 'regions', ['RUB’ AL KHALI']),
    'Kalahari Desert': ('desert', 'regions', ['KALAHARI DESERT']),
    'Namib Desert': ('desert', 'regions', ['NAMIB DESERT']),
    'Atacama Desert': ('desert', 'regions', ['DESIERTO DE ATACAMA']),
    'Great Sandy Desert': ('desert', 'regions', ['GREAT SANDY DESERT']),
    'Great Victoria Desert': ('desert', 'regions', ['GREAT VICTORIA DESERT']),
    'Thar Desert': ('desert', 'regions', ['THAR DESERT']),
    'Taklamakan Desert': ('desert', 'regions', ['TAKLIMAKAN DESERT']),
    'Syrian Desert': ('desert', 'regions', ['SYRIAN DESERT']),
    'Karakum Desert': ('desert', 'regions', ['GARAGUM DESERT']),
    'Kyzylkum Desert': ('desert', 'regions', ['QIZILQUM DESERT']),
    'Sonoran Desert': ('desert', 'regions', ['SONORAN DESERT']),
    'Chihuahuan Desert': ('desert', 'regions', ['CHIHUAHUAN DESERT']),
    'Gibson Desert': ('desert', 'regions', ['Gibson Desert']),
    'Amazon rainforest': ('forest', 'regions', ['AMAZON BASIN']),
    'Congo rainforest': ('forest', 'regions', ['CONGO BASIN']),
    'Tibetan Plateau': ('land', 'regions', ['PLATEAU OF TIBET']),
    'Great Plains': ('land', 'regions', ['GREAT PLAINS']),
    'North European Plain': ('land', 'regions', ['NORTHERN EUROPEAN PLAIN']),
    'Siberia': ('land', 'regions', ['SIBERIA']),
    'Kazakh Steppe': ('land', 'regions', ['KAZAKH STEPPE']),
    'Sahel': ('land', 'regions', ['SAHEL']),
    'Great Rift Valley': ('land', 'regions', ['GREAT RIFT VALLEY']),
    'Pantanal': ('land', 'regions', ['PANTANAL']),
    'Pampas': ('land', 'regions', ['PAMPAS']),
    'Patagonia': ('land', 'regions', ['PATAGONIA']),
    'Altiplano': ('land', 'regions', ['ALTIPLANO']),
    'Brazilian Highlands': ('land', 'regions', ['BRAZILIAN HIGHLANDS']),
    'Deccan Plateau': ('land', 'regions', ['DECCAN PLATEAU']),
    'Canadian Shield': ('land', 'regions', ['CANADIAN SHIELD']),
    'Great Basin': ('land', 'regions', ['GREAT BASIN']),
    'Greenland': ('island', 'regions', ['GREENLAND']),
    'New Guinea': ('island', 'regions', ['NEW GUINEA']),
    'Borneo': ('island', 'regions', ['BORNEO']),
    'Sumatra': ('island', 'regions', ['SUMATRA']),
    'Java': ('island', 'regions', ['JAVA']),
    'Great Britain': ('island', 'regions', ['GREAT BRITAIN']),
    'Ireland': ('island', 'regions', ['IRELAND']),
    'Iceland': ('island', 'regions', ['ICELAND']),
    'Sicily': ('island', 'regions', ['Sicilia']),
    'Sardinia': ('island', 'regions', ['Sardegna']),
    'Corsica': ('island', 'regions', ['Corse']),
    'Honshu': ('island', 'regions', ['HONSHÜ']),
    'Baffin Island': ('island', 'regions', ['BAFFIN ISLAND']),
    'Newfoundland': ('island', 'regions', ['ISLAND OF NEWFOUNDLAND']),
    'Tierra del Fuego': ('island', 'regions', ['TIERRA DEL FUEGO']),
    'Svalbard': ('island', 'regions', ['SVALBARD']),
    'Hawaiian Islands': ('island', 'regions', ['HAWAIIAN ISLANDS']),
    'Tenerife': ('island', 'land10', [(-16.6, 28.27)]),   # the Canary Islands, each by a point on it
    'Gran Canaria': ('island', 'land10', [(-15.6, 27.95)]),
    'Lanzarote': ('island', 'land10', [(-13.65, 29.03)]),
    'Fuerteventura': ('island', 'land10', [(-14.0, 28.4)]),
    'La Palma': ('island', 'land10', [(-17.86, 28.68)]),
    'La Gomera': ('island', 'land10', [(-17.23, 28.1)]),
    'El Hierro': ('island', 'land10', [(-18.0, 27.75)]),
    'Madeira': ('island', 'land10', [(-16.95, 32.75)]),   # and Madeira, with its neighbour
    'Porto Santo': ('island', 'land10', [(-16.34, 33.07)]),
    'Scandinavian Peninsula': ('land', 'regions', ['SCANDINAVIA']),
    'Iberian Peninsula': ('land', 'regions', ['PENÍNSULA IBÉRICA']),
    'Balkan Peninsula': ('land', 'regions', ['BALKAN PEN.']),
    'Arabian Peninsula': ('land', 'regions', ['ARABIAN PENINSULA']),
    'Horn of Africa': ('land', 'regions', ['SOMALI PENINSULA']),
    'Kamchatka': ('land', 'regions', ['KAMCHATKA PENINSULA']),
    'Malay Peninsula': ('land', 'regions', ['MALAY PENINSULA']),
    'Florida': ('land', 'regions', ['FLORIDA']),
    'Baja California': ('land', 'regions', ['BAJA CALIFORNIA']),
    'Yucatan Peninsula': ('land', 'regions', ['PEN. DE YUCATÁN']),
    'Antarctic Peninsula': ('land', 'regions', ['Antarctic Peninsula']),
    'Nile': ('river', 'rivers', ['Nile', 'Albert Nile', 'Victoria Nile', 'Bahr el Jebel', 'El Bahr el Abyad',
                                    'Rosetta Branch', 'Damietta Branch']),
    'Amazon River': ('river', 'rivers', ['Amazonas']),
    'Mississippi River': ('river', 'rivers', ['Mississippi']),
    'Yangtze': ('river', 'rivers', ['Yangtze', 'Chang Jiang', 'Jinsha']),
    'Yellow River': ('river', 'rivers', ['Huang']),
    'Danube': ('river', 'rivers', ['Danube', 'Donau']),
    'Vistula': ('river', 'rivers', ['Vistula']),
    'Oder': ('river', 'rivers', ['Oder']),
    'Rhine': ('river', 'rivers', ['Rhine', 'Rhein', 'Rhin']),
    'Volga': ('river', 'rivers', ['Volga']),
    'Ganges': ('river', 'rivers', ['Ganges']),
    'Congo River': ('river', 'rivers', ['Congo', 'Lualaba']),
    'Mekong': ('river', 'rivers', ['Mekong', 'Lancang']),
    'Murray River': ('river', 'rivers', ['Murray']),
    'Elbe': ('river', 'rivers', ['Elbe']),
    'Seine': ('river', 'rivers', ['Seine']),
    'Thames': ('river', 'rivers', ['Thames']),
    'Loire': ('river', 'rivers', ['Loire']),
    'Rhone': ('river', 'rivers', ['Rhône']),
    'Po': ('river', 'rivers', ['Po']),
    'Dnipro': ('river', 'rivers', ['Dnipro']),
    'Don': ('river', 'rivers', ['Don']),
    'Ural River': ('river', 'rivers', ['Ural']),
    'Tigris': ('river', 'rivers', ['Tigris']),
    'Euphrates': ('river', 'rivers', ['Euphrates', 'Al Furat', 'Firat']),
    'Indus': ('river', 'rivers', ['Indus']),
    'Brahmaputra': ('river', 'rivers', ['Brahmaputra', 'Yarlung', 'Dihang']),
    'Irrawaddy': ('river', 'rivers', ['Ayeyarwady']),
    'Ob': ('river', 'rivers', ['Ob']),
    'Yenisei': ('river', 'rivers', ['Yenisey']),
    'Lena': ('river', 'rivers', ['Lena']),
    'Amur': ('river', 'rivers', ['Amur', 'Heilong Jiang']),
    'Niger River': ('river', 'rivers', ['Niger']),
    'Zambezi': ('river', 'rivers', ['Zambezi']),
    'Orange River': ('river', 'rivers', ['Orange']),
    'Limpopo': ('river', 'rivers', ['Limpopo']),
    'Missouri River': ('river', 'rivers', ['Missouri']),
    'Colorado River': ('river', 'rivers10', ['Colorado'], [-120, 28, -100, 45]),   # 1:50m has only below Lake Mead
    'Columbia River': ('river', 'rivers', ['Columbia']),
    'St. Lawrence River': ('river', 'rivers', ['St. Lawrence']),
    'Yukon River': ('river', 'rivers', ['Yukon']),
    'Mackenzie River': ('river', 'rivers', ['Mackenzie']),
    'Orinoco': ('river', 'rivers', ['Orinoco']),
    'Parana River': ('river', 'rivers', ['Paraná']),
}
SOURCES = {'marine': ('ne_50m_geography_marine_polys', 'name'), 'regions': ('ne_50m_geography_regions_polys', 'NAME'),
           'lakes': ('ne_50m_lakes', 'name'), 'rivers': ('ne_50m_rivers_lake_centerlines', 'name'),
           'rivers10': ('ne_10m_rivers_lake_centerlines', 'name')}   # finer, for a river the 1:50m data cuts short


def fetch(url, path):
    if not path.exists():
        print(f'downloading {url}')
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, path)
    return path


# ======== the picture ========

def load_land10():
    """The 1:10m land and minor islands as polygons (lists of [lon, lat] rings), and the 1:10m lakes."""
    def polys(file):
        geo = json.loads(fetch(VECTOR_URL.format(file), DATA / f'{file}.geojson').read_text(encoding='utf-8'))
        return [p for f in geo['features'] for p in (f['geometry']['coordinates'] if f['geometry']['type'] == 'MultiPolygon'
                                                     else [f['geometry']['coordinates']])]
    return [p for file in LAND10 for p in polys(file)], polys(LAKES10)


def build_raster():
    from PIL import Image, ImageEnhance   # only this part needs Pillow
    import numpy as np
    if not RASTER.exists():
        import zipfile
        with zipfile.ZipFile(fetch(RASTER_URL, DATA / RASTER_URL.rsplit('/', 1)[1])) as z:
            z.extractall(RASTER.parent)
    Image.MAX_IMAGE_PIXELS = None
    src = Image.open(RASTER).convert('RGB')
    print(f'source {src.size[0]} x {src.size[1]}')
    OUT.mkdir(parents=True, exist_ok=True)
    full = src.resize((CRISP, CRISP // 2), Image.LANCZOS)
    del src
    full = ImageEnhance.Contrast(ImageEnhance.Color(full).enhance(COLOUR)).enhance(CONTRAST)
    full.resize(BASE, Image.LANCZOS).save(OUT / 'base.jpg', quality=JPEG_Q, optimize=True, progressive=True)
    print(f'pictures: base {BASE[0]} x {BASE[1]}, {(OUT / "base.jpg").stat().st_size // 1024} KB')
    land, lakes = load_land10()
    # each ring as a numpy array with its box, biggest polygons first so an island inside a hole is drawn after it
    shapes = []
    for fill, polys in ((255, land), (0, lakes)):
        for p in sorted(polys, key=lambda p: -ring_area(p[0])):
            for k, r in enumerate(p):
                a = np.asarray(r, dtype=np.float64)[:, :2]
                shapes.append((fill if k == 0 else 255 - fill, a, (a[:, 0].min(), a[:, 1].min(), a[:, 0].max(), a[:, 1].max())))
    pixels = np.asarray(full)
    for size, prefix in LEVELS:
        level = None if size >= CRISP else full.resize((size, size // 2), Image.LANCZOS)
        total, kept = 0, []
        for col in range(size // TILE):
            for row in range(size // 2 // TILE):
                if level:
                    img = level.crop((col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE))
                else:
                    img = crisp_tile(pixels, shapes, size, col, row, keep_inland=size == CRISP)
                    if img is None:
                        (OUT / f'{prefix}{col}-{row}.jpg').unlink(missing_ok=True)
                        continue
                path = OUT / f'{prefix}{col}-{row}.jpg'
                img.save(path, quality=JPEG_Q, optimize=True)
                total += path.stat().st_size
                kept.append(f'{col}-{row}')
        print(f'pictures: {size} x {size // 2}, {len(kept)} tiles ({prefix}*.jpg), {total // 1024} KB')
        if size == LEVELS[-1][0]:   # the game only asks for the sharpest tiles that exist
            (DATA / 'sharpest.json').write_text(json.dumps(kept))


def crisp_tile(pixels, shapes, size, col, row, keep_inland):
    """One tile of a picture `size` pixels round the Earth, from `pixels` (CRISP wide), with the coasts and lake shores
    drawn sharp from the 1:10m outlines: land pixels are stretched from the picture's land only and sea pixels from its
    sea only, then put together along the outline, smoothed over a quarter of a pixel. Returns None for a tile with no
    coast or shore in it when keep_inland is false (stretching the picture there adds nothing the game can't do)."""
    from PIL import Image, ImageDraw, ImageFilter
    import numpy as np
    from scipy import ndimage
    height, width = pixels.shape[:2]
    k = width / size                       # picture pixels per tile pixel
    m = 8                                  # margin, in picture pixels, so the edges of tiles match
    x0, y0 = round(col * TILE * k) - m, round(row * TILE * k) - m
    n = round(TILE * k) + 2 * m
    crop = pixels[np.clip(np.arange(y0, y0 + n), 0, height - 1)][:, np.arange(x0, x0 + n) % width]
    per_deg = width / 360
    west, north, span = x0 / per_deg - 180, 90 - y0 / per_deg, n / per_deg

    def draw(scale):
        img = Image.new('L', (round(n * scale),) * 2, 0)
        d = ImageDraw.Draw(img)
        for fill, ring, (w, s, e, nn) in shapes:
            for shift in (-360, 0, 360):
                if e + shift < west or w + shift > west + span or s > north or nn < north - span:
                    continue
                xy = np.empty_like(ring)
                xy[:, 0] = (ring[:, 0] + shift - west) * per_deg * scale
                xy[:, 1] = (north - ring[:, 1]) * per_deg * scale
                d.polygon(xy.ravel().tolist(), fill=fill)
        return img

    out, mo = round(n / k), round(m / k)
    if not keep_inland:   # a quick look, a pixel for a pixel, before the careful drawing
        inner = np.asarray(draw(1 / k))[mo:mo + TILE, mo:mo + TILE]
        if inner.min() == 255 or inner.max() == 0:
            return None
    edge = np.asarray(draw(4 / k).resize((out, out), Image.BOX), dtype=np.float32)[..., None] / 255
    land = np.asarray(draw(1)) > 127

    def stretch(keep, sharpen=False):   # every pixel takes the colour of the nearest pixel in `keep`, then it's scaled
        part = crop
        if keep.any() and not keep.all():
            iy, ix = ndimage.distance_transform_edt(~keep, return_distances=False, return_indices=True)
            part = crop[iy, ix]
        img = Image.fromarray(part).resize((out, out), Image.BICUBIC)
        if sharpen and k < 1:   # scaled up: the land's hills and valleys a little crisper
            img = img.filter(ImageFilter.UnsharpMask(radius=SHARPEN[0] / k, percent=SHARPEN[1], threshold=1))
        return np.asarray(img, dtype=np.float32)

    img = stretch(land, sharpen=True) * edge + stretch(~land) * (1 - edge)
    return Image.fromarray(np.clip(img[mo:mo + TILE, mo:mo + TILE], 0, 255).astype(np.uint8))


# ======== the places ========

def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == dy == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def simplify(pts, tol=SIMPLIFY):
    if len(pts) < 4:
        return pts
    keep, stack = {0, len(pts) - 1}, [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        far, d = 0, tol
        for k in range(i + 1, j):
            e = seg_dist(pts[k], pts[i], pts[j])
            if e > d:
                far, d = k, e
        if far:
            keep.add(far)
            stack += [(i, far), (far, j)]
    return [pts[k] for k in sorted(keep)]


def encode(pts):
    flat, px, py = [], 0, 0
    for x, y in pts:
        x, y = round(x * Q), round(y * Q)
        flat += [x - px, y - py]
        px, py = x, y
    return flat


def ring_area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2


def starts_in(geometry, box):
    first = geometry['coordinates']
    while isinstance(first[0], list):
        first = first[0]
    w, s, e, n = box
    return w <= first[0] <= e and s <= first[1] <= n


def label_of(polys, lines):
    """The middle of the biggest part's box (or the river's middle point): where a highlight is pointed at."""
    if lines:
        longest = max(lines, key=len)
        return longest[len(longest) // 2]
    big = max(polys, key=lambda p: ring_area(p[0]))[0]
    xs, ys = [p[0] for p in big], [p[1] for p in big]
    return [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2]


def inside(x, y, ring):
    c, j = False, len(ring) - 1
    for i in range(len(ring)):
        (xi, yi), (xj, yj) = ring[i][:2], ring[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def build_features():
    sources = {}
    for key, (file, field) in SOURCES.items():
        geo = json.loads(fetch(VECTOR_URL.format(file), DATA / f'{file}.geojson').read_text(encoding='utf-8'))
        sources[key] = (geo['features'], field)
    land10 = load_land10()[0]
    out, size = [], 0
    for name, (kind, src, names, *box) in FEATURES.items():
        if src == 'land10':   # an island picked by a point on it
            found = [{'geometry': {'type': 'Polygon', 'coordinates': p}} for p in land10
                     if any(inside(x, y, p[0]) for x, y in names)]
            if len(found) != len(names):
                sys.exit(f'{name}: {len(found)} pieces of 1:10m land for {len(names)} points')
        else:
            feats, field = sources[src]
            found = [f for f in feats if f['properties'].get(field) in names and (not box or starts_in(f['geometry'], box[0]))]
            missing = set(names) - {f['properties'][field] for f in found}
            if missing:
                sys.exit(f'{name}: not in {src}: {sorted(missing)}')
        tol = ISLAND_SIMPLIFY if src == 'land10' else SIMPLIFY
        polys, lines = [], []
        for f in found:
            g = f['geometry']
            if g['type'] in ('LineString', 'MultiLineString'):
                for line in (g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]):
                    lines.append(simplify([tuple(p[:2]) for p in line], tol / 2))
            else:
                for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
                    outer, *holes = [simplify([tuple(p[:2]) for p in r[:-1]], tol) for r in poly]
                    if len(outer) >= 3 and ring_area(outer) > tol ** 2:   # drop specks, and holes that shrank to nothing
                        polys.append([outer] + [h for h in holes if len(h) >= 3 and ring_area(h) > tol ** 2])
        feature = {'name': name, 'kind': kind, 'label': [round(v, 2) for v in label_of(polys, lines)]}
        if lines:
            feature['lines'] = [encode(l) for l in lines]
        else:
            feature['polys'] = [[encode(r) for r in p] for p in polys]
        out.append(feature)
        size += sum(len(r) for p in polys for r in p) // 2 + sum(len(l) for l in lines)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    path = GAME / 'assets' / 'physical.json'
    sharpest = json.loads((DATA / 'sharpest.json').read_text()) if (DATA / 'sharpest.json').exists() else []
    path.write_text(json.dumps({'q': Q, 'sharpest': sharpest, 'features': out}, separators=(',', ':')), encoding='utf-8')
    print(f'places: {len(out)}, {size} points, {path.stat().st_size // 1024} KB')

    said = json.loads((GAME / 'assets' / 'lines.json').read_text(encoding='utf-8')).get('physical', {})
    for name in FEATURES:
        if name not in said:
            print(f'  no line in lines.json "physical" for {name}')


if __name__ == '__main__':
    if '--places' not in sys.argv:
        build_raster()
    build_features()
