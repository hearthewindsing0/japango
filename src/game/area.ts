// Which map area to play: ?area=<id> (an areas/<id>.json that has been
// built), Roppongi by default.
const param = new URLSearchParams(location.search).get('area') ?? ''
export const AREA_ID = /^[a-z0-9-]+$/.test(param) ? param : 'roppongi'
