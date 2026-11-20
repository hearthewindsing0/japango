-- Players are anonymous: a random id the browser makes and keeps.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Places found and stamps collected (kind = 'found' or 'stamp'), by
-- Wikidata id.
CREATE TABLE IF NOT EXISTS progress (
  player_id TEXT NOT NULL REFERENCES players(id),
  kind TEXT NOT NULL CHECK (kind IN ('found', 'stamp')),
  item TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, kind, item)
);
