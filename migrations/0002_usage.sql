-- Daily counters for the gate (worker/gate.ts) and the API's own limits:
-- who = '*' (all AI calls), 'pass:<name>' (one invite code's AI calls),
-- 'fail:<ip>' (wrong codes), 'save:<ip>' (progress saves).
CREATE TABLE IF NOT EXISTS usage (
  day TEXT NOT NULL,
  who TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, who)
);
