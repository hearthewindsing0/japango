// Loads the map's tiles around the player as they walk, nearest first, and
// lets go of tiles that are far behind.
import { useEffect, useRef, useState } from 'react'
import { loadTile, tileKey, type GameMap, type MapTile } from './map'

/** Tiles within this many meters of the player are loaded. */
const NEAR = 320
/** ...and kept until they're this much further away, so walking back and
 *  forth over an edge doesn't reload them. */
const KEEP = 200
const PARALLEL = 4

/** Distance from a point to a tile's square (0 inside it). */
function distToTile(map: GameMap, col: number, row: number, x: number, y: number) {
  const x0 = col * map.tile
  const y0 = row * map.tile
  const dx = Math.max(x0 - x, 0, x - (x0 + map.tile))
  const dy = Math.max(y0 - y, 0, y - (y0 + map.tile))
  return Math.hypot(dx, dy)
}

const loadRadius = (distance: number) => Math.max(NEAR, distance * 3)

/** Loads every tile within reach of a point; resolves when they're in. */
export async function loadAround(map: GameMap, x: number, y: number, distance: number) {
  const r = loadRadius(distance)
  await Promise.all(
    map.index
      .filter(([c, rw]) => !map.tiles.has(tileKey(c, rw)) && distToTile(map, c, rw, x, y) <= r)
      .map(async ([c, rw]) => map.tiles.set(tileKey(c, rw), await loadTile(map, c, rw))),
  )
}

/** Keeps the tiles around the player loaded. Returns the loaded tiles, as
 *  a new array whenever one comes or goes. */
export function useTileStream(map: GameMap | null, focus: { current: { x: number; y: number } }, distance: number) {
  const [tiles, setTiles] = useState<MapTile[]>(() => (map ? [...map.tiles.values()] : []))
  const dist = useRef(distance)
  dist.current = distance

  useEffect(() => {
    if (!map) return
    setTiles([...map.tiles.values()])
    let alive = true
    const loading = new Set<string>()
    const failed = new Map<string, number>() // key → when to try again
    const tick = () => {
      const { x, y } = focus.current
      const r = loadRadius(dist.current)
      let changed = false
      // Let go of far tiles.
      for (const t of map.tiles.values())
        if (distToTile(map, t.col, t.row, x, y) > r + KEEP) {
          map.tiles.delete(t.key)
          changed = true
        }
      if (changed) setTiles([...map.tiles.values()])
      // Fetch missing near ones, nearest first.
      const want = map.index
        .map(([c, rw]) => ({ c, rw, key: tileKey(c, rw), d: distToTile(map, c, rw, x, y) }))
        .filter((t) => t.d <= r && !map.tiles.has(t.key) && !loading.has(t.key) && (failed.get(t.key) ?? 0) < Date.now())
        .sort((a, b) => a.d - b.d)
      for (const t of want.slice(0, Math.max(0, PARALLEL - loading.size))) {
        loading.add(t.key)
        loadTile(map, t.c, t.rw)
          .then((tile) => {
            if (!alive) return
            map.tiles.set(t.key, tile)
            setTiles([...map.tiles.values()])
          })
          .catch(() => failed.set(t.key, Date.now() + 5000))
          .finally(() => loading.delete(t.key))
      }
    }
    tick()
    const id = setInterval(tick, 400)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [map, focus])
  return tiles
}
