import { Almond } from './Almond'
import { DonQuijote } from './landmarks/DonQuijote'
import { Maman } from './landmarks/Maman'
import { MoriTower } from './landmarks/MoriTower'
import { Nact } from './landmarks/Nact'
import type { GameMap, MapTile } from './map'
import type { Focus } from './World'

// Hand-made landmarks, each modelled on the real place and placed from the
// map (its point of interest and building outline). Their places for
// people's day plans are listed in data/places/<area>.landmarks.json.
export function Landmarks(props: { map: GameMap; tiles: MapTile[]; focus: React.RefObject<Focus>; night: number }) {
  return (
    <>
      <Almond {...props} />
      <Maman {...props} />
      <MoriTower {...props} />
      <DonQuijote {...props} />
      <Nact {...props} />
    </>
  )
}
