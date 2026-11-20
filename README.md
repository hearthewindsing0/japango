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

The **Map data** GitHub Action runs both steps and commits the result whenever
the map scripts change, and can be run by hand from the Actions tab.

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).

## Code layout

- `src/game/World.tsx`: ground, roads, buildings, trees, sun and shadows.
- `src/game/geometry.ts`: turns the map's shapes into Three.js geometry.
- `src/game/patterns.ts`: procedural paving, asphalt and grass textures.
- `src/game/Player.tsx`: free movement with collisions, the walking character and the follow camera.
- `src/game/Labels.tsx`: Japanese/English name tags for nearby places.
- `src/game/Minimap.tsx`, `src/game/DPad.tsx`: overview map and touch controls.
- `src/game/map.ts`, `src/game/tiles.ts`: map loading, ground types, colors and lookups.
