## Run it

```sh
bun install
bun run dev
```

The project uses [Bun](https://bun.sh) (1.4 or newer) to install packages and
run the map scripts; install it with `curl -fsSL https://bun.sh/install | bash`.
Vite and wrangler run on Node.js when it is installed, otherwise on Bun. The
game itself runs in the browser and the API on Cloudflare Workers as before.

The map, dictionary, conversations and sounds aren't in git: `bun run dev`
loads any it doesn't find in `public/` from the live site, so there is
nothing to download first. See [Where the data lives](#where-the-data-lives).

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
- `bun run map:area -- --id shibuya --name 渋谷 --name-en Shibuya --center
  35.6595,139.7005 --size 1500x1200` adds an area (or `--corners
  south,west,north,east` instead of center and size; `--rotation` turns it).
- `AREA=<id> bun run map:all` downloads every source below for that area at
  the same time, then builds the map and tiles. The Map data Action does the
  same on GitHub: "Run workflow" with an id plus a center and size (or
  corners) adds an area and builds it. It only runs when started by hand.
- `bun run map:fetch` downloads the area from the Overpass API into `data/`.
- `bun run map:build` converts it into `data/<area>.map.json`: vector shapes
  for drawing, plus a 1 m grid for collisions and the minimap. It then cuts
  that into 256 m tiles in `public/tiles/<area>/` (`bun run map:tiles`).
  The game loads the manifest and streams the tiles within a few hundred
  meters of the player, so the map can grow without a bigger download.
  Each tile holds every shape that touches it and clips drawing to its own
  square, so streets and buildings run across tile edges without seams.
  Set `VITE_TILES_URL` to load tiles from somewhere else (Cloudflare R2).

Street-level detail comes from [Mapillary](https://www.mapillary.com):
`bun run map:mapillary` (needs a Mapillary client token in `MAPILLARY_TOKEN`)
downloads the street objects its detectors found in photos (street lights,
utility poles, signs, benches, post boxes, ...) and measures building-front
colors from photos. `map:build` then places those props and colors the walls.

Building heights and the shape of the ground come from
[PLATEAU](https://www.mlit.go.jp/plateau/), Japan's open 3D city models:
`bun run map:plateau` downloads buildings with measured heights and
`bun run map:terrain` a height grid of the bare ground, and
`bun run map:bridges` footbridges and walkways as 3D surfaces. The elevated
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

Places with a Wikipedia article (found through Wikidata, `bun run map:wiki`)
are marked in the world; walk up to one to read the opening lines of its
Japanese and English articles. Ten landmarks form a stamp rally (スタンプラリー):
press B for the stamp book. Shop signs go where Mapillary's detectors saw
store signs, named after the nearest shop in OSM. Q/E or a right-drag turns
the camera.

Passers-by walk the sidewalks, more at lunch and in the evening (an
estimated daily curve), fewer in the rain. Press F for furigana over the
Japanese text, and tap a word for its reading and meaning: the Map data
Action builds a small dictionary of the map's own text with kuromoji and
[JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) (`bun run map:dict`).
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
[Freesound](https://freesound.org) (`bun run map:sounds`, needs a Freesound
API key in `FREESOUND_TOKEN`); each one is credited at the bottom of the
screen.

The **Map data** GitHub Action runs these steps (Mapillary only when the
`MAPILLARY_TOKEN` repository secret is set, Freesound only with
`FREESOUND_TOKEN`) when run by hand from the Actions tab, and uploads the
result to the server (see below).

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
Street-level data © Mapillary contributors, under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Buildings and terrain: 3D都市モデル（Project PLATEAU）国土交通省.
Roof colors are measured from aerial photos (`bun run map:aerial`):
出典：国土地理院ウェブサイト（地理院タイル シームレス空中写真）.
Dictionary: JMdict © EDRDG (CC BY-SA 4.0).
Place text from Wikipedia (CC BY-SA 4.0) and Wikidata (CC0).
Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
Sounds from Freesound, credited per recording in `public/sounds/credits.json`.
Ōedo Line timetable: 東京都交通局・公共交通オープンデータ協議会 (CC BY 4.0).

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
Japanese when you stand near them.

### Trains

Trains run at the real times of day in Tokyo (the game clock, so `?time=`
moves them too): each one pulls in, stands with its doors open, and leaves
at its timetabled departure. A departure board (発車案内) over each platform
shows the next two trains (先発, 次発) and where they're going (〜行);
stand under it for the words. After the last train it says
本日の運転は終了しました and shows the first train (始発).

- **Ōedo Line (E23)**: Toei's published static timetable, from the
  [GTFS feed](https://ckan.odpt.org/dataset/train-toei) on the Public
  Transportation Open Data Center (ODPT), which is public (no key) under
  CC BY 4.0. Credit: 東京都交通局・公共交通オープンデータ協議会.
- **Hibiya Line (H04)**: Tokyo Metro's
  [GTFS feed](https://ckan.odpt.org/dataset/train-tokyometro) needs an
  ODPT developer key, so until there is one the Hibiya Line runs on an
  approximate schedule (`src/game/trains.ts`): real first and last trains
  and roughly the real gaps for each hour, weekday or weekend/holiday. The
  board says "approx." while it does.

`bun scripts/trains/build-timetables.mjs` downloads the feeds and writes
`public/trains/<area>.json` (each platform's trains, keyed by the next
stop, plus the service calendar, so holidays run the 土休日 timetable). The
**Train timetables** Action runs it and uploads the result to the server (the `trains` set of `scripts/data.mjs`); it runs by hand
and when the script changes on main. Timetables change a few times a year,
so run it after each ダイヤ改正.

**Live data.** The Worker's `/api/trains/live?area=roppongi`
(`worker/trains-live.ts`) reads ODPT's live `odpt:Train` (where each train
is and how late) and `odpt:TrainInformation` (each line's status) and
caches them for 30 seconds. The game asks for it every minute: trains due
around now run late by the delay of the trains coming in that way, and the
boards' bottom line says so (ただいま 約3分 遅れて 運転しています) or shows
the line's status when something is wrong (運転見合わせ...). It only applies
while the game clock is the real one (no `?time=`); otherwise, and when
ODPT can't be reached, trains keep to the timetable.

Toei's live data is public. Tokyo Metro's needs the ODPT developer key:

1. Get the consumer key at [developer.odpt.org](https://developer.odpt.org/)
   and add it as the `ODPT_TOKEN` repository secret.
2. Run the **Train timetables** Action: the Hibiya Line then uses Tokyo
   Metro's real timetable instead of the approximate one.
3. Run the **Deploy** Action (or push to main): it copies the key into the
   Worker secret `ODPT_TOKEN`, which turns on the Hibiya Line's live data.
   The key never reaches players.

To change which trains count for a platform's delay, or add a station,
edit `LIVE_LINES` in `worker/trains-live.ts`.

Start underground with `?at=x,y,z`, e.g. `?at=495,408.8,6.14` (Hibiya
west gates) or `?at=662,350,-12.08` (Ōedo B7).

### On the platforms

Step onto a platform and the camera comes down to eye level and turns to
look along it (Q/E still turn it; it stays inside the hall). From there:

- **LED departure boards** (発車案内) hang across the platform: 先発 and
  次発 with 各停, the time and where each train goes, and a line that
  alternates Japanese and English and announces the train as it comes in
  (まもなく…まいります) and as its doors close.
- **Station name boards** (駅名標) on the wall across the tracks: the
  station number (H04, E23), 六本木 in kanji, kana and English, and a band
  with the previous (前) and next (次) stations, the arrow pointing the
  way this platform's trains go. Stand at the edge in front of one for its
  card.
- **Riders** wait at the doors in two lines, get on when the doors open,
  and get off and head for the stairs, matched to the trains on the
  timetable. Every rider is someone (`src/game/riders.ts`): people from the
  day plans in `public/life/<area>/` whose outings start or end at a
  station exit, plus the everyday tier. Until the everyday tier is in
  people.json (`"tier": "everyday"`), `src/game/everyday.ts` stands in for
  it: 3,000 named people with a job, the station they live at and a plan
  (commuting in, living here and going out, lunch and shopping, a night
  out, changing lines). It switches off once people.json has everyday
  people.

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
- `/tiles/`, `/dict/`, `/talk/`, `/life/`, `/trains/`, `/sounds/`, `/data/`
  and `/index/` serve the generated data from the R2 bucket `japango-tiles`
  (see below). Tiles are fetched with the build time in `?v=`, so the CDN
  can cache each version for good.
- `/api/progress` keeps each player's found places and stamps in the D1
  database `japango` (`migrations/`). Players are anonymous, identified by a
  random id their browser keeps. The browser keeps its own copy too, so the
  game works the same without the API.

The **Deploy** Action runs on every push to `main`. It creates the database
and bucket if needed (`scripts/cf-setup.mjs`), applies database migrations,
and deploys the site and API. It needs the `CLOUDFLARE_API_TOKEN` (Workers,
R2 and D1 edit rights) and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

### Where the data lives

Git holds the code, the scripts and what people write by hand: `areas/`
(each map area's frame), `data/places/` (places added by hand) and the
interiors in `src/game/interiors/`. Everything the scripts make lives only
on the server, in R2, at the same path the game asks for:

| Set | Files | Made by |
| --- | --- | --- |
| `sources` | `data/<area>.*.json`: raw downloads and the built map | Map data Action |
| `tiles` | `public/tiles/<area>/` | Map data Action |
| `dict` | `public/dict/<area>.*` | Map data and Conversations Actions |
| `talk` | `public/talk/<area>.json` and its audio | Conversations Action |
| `life` | `data/life/<area>/`, `public/life/<area>/` | Life Action |
| `trains` | `public/trains/<area>.json` | Train timetables Action |
| `sounds` | `public/sounds/` (all areas) | Map data Action, when asked |

Each Action pulls what it builds on, runs, and pushes its sets; the game
sees the result as soon as the upload finishes, with no deploy. Nothing is
refreshed on a schedule. `scripts/data.mjs` does the moving, with an index
per set in R2 (`index/<set>.json`) so only changed files go up or down:

- `bun run data:pull` downloads every set from the live site into this
  folder (no sign-in needed), to run the scripts locally or play offline.
  `bun run data:pull tiles dict` pulls just those. `AREA=<id>` picks the area.
- `bun run data:status` lists what differs between here and the server.
- `bun run data:push tiles` uploads a set you built locally. It needs
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; add `--local` to fill
  wrangler's local R2 for `bun run cf:dev` instead.
- `bun run dev` serves files from `public/` when they're there and fetches
  the rest from the live site. `JAPANGO_DATA_URL` points it (and pull) at
  another site; `JAPANGO_DATA_URL=off bun run dev` uses only local files.

A new generator writes its output under `public/<kind>/<area>…` (or
`data/…` for files only scripts read), adds a set to `SETS` in
`scripts/data.mjs` and the folder to the Worker's list, and ends its
workflow with `bun scripts/data.mjs push <set>` instead of a commit.

Run it all locally with `bun run cf:dev`, which uses wrangler's local D1
and R2.

## UI kit and playground

Everything drawn over the 3D world (HUD boxes, cards, dialogue, menus,
buttons) has a component in `src/ui/`, built the shadcn/ui way: Radix
primitives for behaviour and focus, Tailwind v4 for looks, `cva` for
variants, and the source lives in the repo so it can be changed freely.
The look is retro arcade kept readable: M PLUS 1 for text, DotGothic16 and Press Start 2P pixel fonts for titles and labels,
ink-black rounded panels with a thin frame line, short hard shadows and
vermilion / gold accents.

- `import './ui/theme.css'` once, wrap UI in `<UiRoot scale={…}>`, then
  `import { Button, Panel, DialogueBox, … } from './ui'`.
- `UiRoot` scales everything inside it as one (CSS zoom), which is what
  `A−`/`A+` drive. Popups, windows and toasts follow the same scale.
- Dark (default) and light themes: `<UiRoot theme="dark" | "light" | "system">`.
  The light theme swaps the ink and paper tokens and darkens the accents;
  paper cards (word card, stamp book) stay dark text on white in both.
- The theme skips Tailwind's preflight reset, so it can sit next to the
  game's own CSS (`src/index.css`) without changing it.
- Furigana in hand-written text: `六本木[ろっぽんぎ]`; `<Furigana>` turns
  each `word[reading]` into ruby text that can be tapped for a word card.

**Playground**: `bun run dev` and open `/playground/`, or the deployed
site at `/playground/`. Each component has a story in
`src/playground/stories.tsx`: pick it on the left, tweak its props on the
right, see the JSX for those props, and watch its callbacks in the
Actions log. The stage can show a game screenshot behind the component
(day, night, rain), follows `A−`/`A+`, and switches Dark / Light / System. Adding a story is one entry in
that file with its controls (`text`, `boolean`, `select`, `number`,
`color`).

## Code layout

- `src/ui/`: the UI kit (components, theme). `src/playground/`: its playground.
- `src/game/World.tsx`: ground, roads, buildings, trees, sun and shadows.
- `src/game/geometry.ts`: turns the map's shapes into Three.js geometry.
- `src/game/Props.tsx`: street lights, utility poles, signs and other street furniture.
- `src/game/patterns.ts`: procedural paving, asphalt and grass textures.
- `src/game/Player.tsx`: free movement with collisions, the walking character and the follow camera.
- `src/game/station.ts`, `src/game/Stations.tsx`: walking and drawing the subway stations.
- `src/game/trains.ts`, `scripts/trains/build-timetables.mjs`: train timetables.
- `src/game/interior.ts`, `src/game/Interiors.tsx`, `src/game/BarMenu.tsx`: walk-in places (Ant 'n Bee) and ordering at the bar.
- `src/game/Labels.tsx`: Japanese/English name tags for nearby places.
- `src/game/Minimap.tsx`, `src/game/DPad.tsx`: overview map and touch controls.
- `src/game/map.ts`, `src/game/tiles.ts`: map loading, ground types, colors and lookups.
