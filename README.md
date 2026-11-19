# JapanGo

A top-down game for learning Japanese by exploring real Tokyo neighborhoods
and joining conversations with AI-powered locals. First area: Roppongi (六本木).

Built with React, React Three Fiber and drei, on Vite.

## Run it

```sh
npm install
npm run dev
```

Move with the arrow keys or WASD, hold Shift to run, scroll or press +/− to
zoom, and press M for the full map. On a phone, use the on-screen arrows.

## The map

The streets, buildings, parks and place names come from
[OpenStreetMap](https://www.openstreetmap.org) and are turned into a grid of
2 m tiles.

- `scripts/area.mjs` sets the area (bounding box), tile size and spawn point.
- `npm run map:fetch` downloads the area from the Overpass API into `data/`.
- `npm run map:build` converts it into `public/maps/<area>.json`, which the game loads.

The **Map data** GitHub Action runs both steps and commits the result whenever
the map scripts change, and can be run by hand from the Actions tab.

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).

## Code layout

- `src/game/MapLayer.tsx`: draws the whole tile map as one plane with a shader.
- `src/game/Player.tsx`: grid movement, collisions and camera follow.
- `src/game/Labels.tsx`: Japanese/English name tags for nearby places.
- `src/game/Minimap.tsx`, `src/game/DPad.tsx`: overview map and touch controls.
- `src/game/map.ts`, `src/game/tiles.ts`: map loading, tile types and lookups.
