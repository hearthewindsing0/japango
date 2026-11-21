## Run it

```sh
npm install
npm run dev
```

Move with the arrow keys or WASD, hold Shift to run, scroll or press +/− to
zoom, and press M for the full map. On a phone, use the on-screen arrows.

## The map

The streets, buildings, parks and place names come from
[OpenStreetMap](https://www.openstreetmap.org). The map is turned so that
Roppongi-dori runs straight across the screen (the minimap's compass points
north), and drawn as smooth 3D shapes: roads with sidewalks and lane lines,
crossings, paths, parks, low buildings with windows, and trees.

- Each map area is a file in `areas/<id>.json`: the playable rectangle's
  center, size in meters and rotation, and the spawn point. The download box
  is worked out from that. Scripts build the area named by `AREA=<id>`
  (default `roppongi`), and the game plays `?area=<id>`.
- `npm run map:area -- --id shibuya --name 渋谷 --name-en Shibuya --center
  35.6595,139.7005 --size 1500x1200` adds an area (or `--corners
  south,west,north,east` instead of center and size; `--rotation` turns it).
- `AREA=<id> npm run map:all` downloads every source below for that area at
  the same time, then builds the map and tiles. The Map data Action does the
  same on GitHub: "Run workflow" with an id plus a center and size (or
  corners) adds an area and builds it. It only runs when started by hand.
- `npm run map:fetch` downloads the area from the Overpass API into `data/`.
- `npm run map:build` converts it into `data/<area>.map.json`: vector shapes
  for drawing, plus a 1 m grid for collisions and the minimap. It then cuts
  that into 256 m tiles in `public/tiles/<area>/` (`npm run map:tiles`).
  The game loads the manifest and streams the tiles within a few hundred
  meters of the player, so the map can grow without a bigger download.
  Each tile holds every shape that touches it and clips drawing to its own
  square, so streets and buildings run across tile edges without seams.
  Set `VITE_TILES_URL` to load tiles from somewhere else (Cloudflare R2).

Street-level detail comes from [Mapillary](https://www.mapillary.com):
`npm run map:mapillary` (needs a Mapillary client token in `MAPILLARY_TOKEN`)
downloads the street objects its detectors found in photos (street lights,
utility poles, signs, benches, post boxes, ...) and measures building-front
colors from photos. `map:build` then places those props and colors the walls.

Building heights and the shape of the ground come from
[PLATEAU](https://www.mlit.go.jp/plateau/), Japan's open 3D city models:
`npm run map:plateau` downloads buildings with measured heights and
`npm run map:terrain` a height grid of the bare ground, and
`npm run map:bridges` footbridges and walkways as 3D surfaces. The elevated
Shuto Expressway is built from OpenStreetMap's motorway ways, at a deck
height from their layer. Slopes are drawn at
half their real steepness, to match the shortened buildings. Tokyo's named
slopes (坂, like 芋洗坂) get a sign at each end; stand next to one to see its
reading and meaning.

The game runs on Tokyo time: the sun sits where it really is over Roppongi
right now, and after dark windows and street lights come on. The weather is
live from [Open-Meteo](https://open-meteo.com/) (rain, snow, fog, clouds), and
the corner of the screen shows it in Japanese. Add `?time=21:30` or
`?weather=rain` (also `snow`, `fog`, `overcast`, ...) to the URL to try
others, and `?at=x,y` to start somewhere else.

Places with a Wikipedia article (found through Wikidata, `npm run map:wiki`)
are marked in the world; walk up to one to read the opening lines of its
Japanese and English articles. Ten landmarks form a stamp rally (スタンプラリー):
press B for the stamp book. Shop signs go where Mapillary's detectors saw
store signs, named after the nearest shop in OSM. Q/E or a right-drag turns
the camera.

Passers-by walk the sidewalks, more at lunch and in the evening (an
estimated daily curve), fewer in the rain. Press F for furigana over the
Japanese text, and tap a word for its reading and meaning: the Map data
Action builds a small dictionary of the map's own text with kuromoji and
[JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) (`npm run map:dict`).
The word card also shows the word's JLPT level (from the community lists in
[open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks),
after Jonathan Waller's), an example sentence from
[Tatoeba](https://tatoeba.org) (through JMdict's examples; tap its words too),
and each kanji's meanings and on/kun readings from
[KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) with its
strokes drawn in order from [KanjiVG](https://kanjivg.tagaini.net) (tap the
kanji to draw it again). Kanji go in a separate file, loaded the first time a
word card opens.

Shops follow their real opening hours from OpenStreetMap's `opening_hours`
(`scripts/opening-hours.mjs` turns them into a weekly schedule; holidays and
date ranges are skipped). On Tokyo time, an open shop has a 営業中 plate by
the door; a closed one has its sign off and its shutter down with a 準備中
plate. Walk up to a place to see whether it's open, today's hours, and for
restaurants what they serve in Japanese (イタリア料理, ラーメン, from
`cuisine`, see `scripts/cuisine.mjs`).

Background sound follows where you are: street noise that rises and falls
with the crowd, night air after dark, rain, birds near parks (cicadas in
summer), and the crossing chimes near pedestrian crossings. Press N or the
speaker button to turn it off. The recordings are CC0 or CC BY clips from
[Freesound](https://freesound.org) (`npm run map:sounds`, needs a Freesound
API key in `FREESOUND_TOKEN`); each one is credited at the bottom of the
screen.

The **Map data** GitHub Action runs these steps (Mapillary only when the
`MAPILLARY_TOKEN` repository secret is set, Freesound only with
`FREESOUND_TOKEN`) and commits the result whenever
the map scripts change, and can be run by hand from the Actions tab.

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
Street-level data © Mapillary contributors, under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Buildings and terrain: 3D都市モデル（Project PLATEAU）国土交通省.
Roof colors are measured from aerial photos (`npm run map:aerial`):
出典：国土地理院ウェブサイト（地理院タイル シームレス空中写真）.
Dictionary: JMdict © EDRDG (CC BY-SA 4.0).
Place text from Wikipedia (CC BY-SA 4.0) and Wikidata (CC0).
Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
Sounds from Freesound, credited per recording in `public/sounds/credits.json`.

## Stations

You can walk down any subway entrance in Roppongi into 六本木駅: the
Hibiya Line (H04) and the Ōedo Line (E23). `scripts/stations.mjs` builds
them at map-build time. Positions come from OpenStreetMap: the entrances
and their exit numbers, the platforms and the tracks. The layout comes
from `STATION_INFO` in that script, written from Tokyo Metro's and Toei's
station guides and the station's Wikipedia articles:

- Hibiya: two side platforms on B2 under Roppongi-dōri, staggered, about
  130 m long. Two separate gates on B1: 西麻布方面改札 (exits 1a–2) at
  the west end and 六本木交差点方面改札 (exits 3–4b) at the east end.
- Ōedo: one platform per level under Gaien-Higashi-dōri, stacked: 2番線
  for Daimon on B5 (32.8 m) and 1番線 for Tochōmae on B7 (42.3 m, the
  deepest in Japan). Escalators go from the gates on B1 to a B4 passage,
  which splits to the two levels. Gates at the Tokyo Midtown end (exits
  7, 8) and the crossing end (exits 5, 6), which links to the Hibiya
  gates outside the fare line, for changing lines.

The corridors from each exit are generated along the station's axes, so
their routes are approximate. The gates have lanes in the middle and fare
fence to the walls; the only way to the platforms is through them. Signs
(出口, 改札, 番線, のりば, のりかえ, the station name boards) explain their
Japanese when you stand near them. Trains arrive every two and a half
minutes on a made-up schedule; real timetables would need an ODPT key.

Start underground with `?at=x,y,z`, e.g. `?at=495,408.8,6.14` (Hibiya
west gates) or `?at=662,350,-12.08` (Ōedo B7).

### Walk-in places: Ant 'n Bee

アントンビー (Ant 'n Bee), the craft beer bar in the basement of 5-1-5
Roppongi, is the first place you can walk into. Its steep, narrow stairs go
down from the pavement on Gaien-Higashi-dōri, a minute from the crossing
toward Tokyo Tower. Downstairs: an L-shaped bar with ten stools, twenty taps
on the back wall, standing tables, and tables at the back, laid out from
public reviews and photos (nothing copied in). Walk up to the counter and
open 🍺 メニュー to order from a real day's tap list (13 Feb 2015), with the
phrases for ordering, 乾杯 and paying, each with its reading and meaning.

`scripts/interiors.mjs` finds the front door at map-build time (the face of
the bar's building that looks onto the pavement, nearest its OSM point), so
it follows the map when the area changes. The room itself is laid out in
meters from that door in `src/game/interiors/antnbee.ts`, and the menu,
phrases and signs live in `src/game/interiors/antnbee.json`. Start inside
with `?at=1112.2,1039.1,11.73`.

## Hosting on Cloudflare

The game runs as one Cloudflare Worker (`wrangler.toml`, `worker/index.ts`):

- The site itself is the Worker's static assets (`dist/`).
- `/tiles/<area>/…` serves the map tiles from the R2 bucket `japango-tiles`.
  Tiles are fetched with the build time in `?v=`, so the CDN can cache
  each version for good. Before the first upload, the copy built into the
  site is served instead.
- `/api/progress` keeps each player's found places and stamps in the D1
  database `japango` (`migrations/`). Players are anonymous, identified by a
  random id their browser keeps. The browser keeps its own copy too, so the
  game works the same without the API.

The **Deploy** Action runs on every push to `main` and after each Map data
run. It creates the database and bucket if needed (`scripts/cf-setup.mjs`),
uploads the tiles and a snapshot of the raw source data to R2
(`scripts/upload-r2.mjs`), applies database migrations, and deploys. It
needs the `CLOUDFLARE_API_TOKEN` (Workers, R2 and D1 edit rights) and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.

Map data is refreshed only on demand: run the Map data Action by hand. On
main, Deploy then uploads the new tiles to R2. A plain code deploy skips the
tile upload unless the push changed `public/tiles/`; tick "Upload map
tiles" when running Deploy by hand to force it.

Run it all locally with `npm run cf:dev`, which uses wrangler's local D1
and R2.

## Code layout

- `src/game/World.tsx`: ground, roads, buildings, trees, sun and shadows.
- `src/game/geometry.ts`: turns the map's shapes into Three.js geometry.
- `src/game/Props.tsx`: street lights, utility poles, signs and other street furniture.
- `src/game/patterns.ts`: procedural paving, asphalt and grass textures.
- `src/game/Player.tsx`: free movement with collisions, the walking character and the follow camera.
- `src/game/station.ts`, `src/game/Stations.tsx`: walking and drawing the subway stations.
- `src/game/interior.ts`, `src/game/Interiors.tsx`, `src/game/BarMenu.tsx`: walk-in places (Ant 'n Bee) and ordering at the bar.
- `src/game/Labels.tsx`: Japanese/English name tags for nearby places.
- `src/game/Minimap.tsx`, `src/game/DPad.tsx`: overview map and touch controls.
- `src/game/map.ts`, `src/game/tiles.ts`: map loading, ground types, colors and lookups.
