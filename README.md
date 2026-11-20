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

- `scripts/area.mjs` sets the downloaded area, the playable rectangle and its
  rotation, and the spawn point.
- `npm run map:fetch` downloads the area from the Overpass API into `data/`.
- `npm run map:build` converts it into `public/maps/<area>.json`: vector shapes
  for drawing, plus a 1 m grid for collisions and the minimap.

Street-level detail comes from [Mapillary](https://www.mapillary.com):
`npm run map:mapillary` (needs a Mapillary client token in `MAPILLARY_TOKEN`)
downloads the street objects its detectors found in photos (street lights,
utility poles, signs, benches, post boxes, ...) and measures building-front
colors from photos. `map:build` then places those props and colors the walls.

Building heights and the shape of the ground come from
[PLATEAU](https://www.mlit.go.jp/plateau/), Japan's open 3D city models:
`npm run map:plateau` downloads buildings with measured heights and
`npm run map:terrain` a height grid of the bare ground. Slopes are drawn at
half their real steepness, to match the shortened buildings. Tokyo's named
slopes (坂, like 芋洗坂) get a sign at each end; stand next to one to see its
reading and meaning.

The **Map data** GitHub Action runs these steps (Mapillary only when the
`MAPILLARY_TOKEN` repository secret is set) and commits the result whenever
the map scripts change, and can be run by hand from the Actions tab.

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
Street-level data © Mapillary contributors, under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Buildings and terrain: 3D都市モデル（Project PLATEAU）国土交通省.

## Code layout

- `src/game/World.tsx`: ground, roads, buildings, trees, sun and shadows.
- `src/game/geometry.ts`: turns the map's shapes into Three.js geometry.
- `src/game/Props.tsx`: street lights, utility poles, signs and other street furniture.
- `src/game/patterns.ts`: procedural paving, asphalt and grass textures.
- `src/game/Player.tsx`: free movement with collisions, the walking character and the follow camera.
- `src/game/Labels.tsx`: Japanese/English name tags for nearby places.
- `src/game/Minimap.tsx`, `src/game/DPad.tsx`: overview map and touch controls.
- `src/game/map.ts`, `src/game/tiles.ts`: map loading, ground types, colors and lookups.
