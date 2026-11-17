-- JMSB club events database (SQLite)
-- Missing values are stored as 'not shown', per the data spec.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clubs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    ig_handle  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name      TEXT NOT NULL DEFAULT 'not shown',
    date_time       TEXT NOT NULL DEFAULT 'not shown',
    location        TEXT NOT NULL DEFAULT 'not shown',
    description     TEXT NOT NULL DEFAULT 'not shown',
    firms           TEXT NOT NULL DEFAULT 'not shown',
    guest_speakers  TEXT NOT NULL DEFAULT 'not shown',
    post_url        TEXT NOT NULL UNIQUE,  -- dedupe key
    club_id         INTEGER NOT NULL REFERENCES clubs(id),
    scraped_at      TEXT NOT NULL
);

-- Every post the updater has looked at, event or not, so Claude is never asked twice.
CREATE TABLE IF NOT EXISTS processed_posts (
    post_url      TEXT PRIMARY KEY,
    is_event      INTEGER NOT NULL,  -- 1 = saved to events, 0 = not an event
    processed_at  TEXT NOT NULL
);

-- Every post linked to an event: the post that created it, then any later posts
-- about the same event (sponsor reveal, speaker reveal, last call...) that updated it.
CREATE TABLE IF NOT EXISTS event_sources (
    event_id   INTEGER NOT NULL REFERENCES events(id),
    post_url   TEXT NOT NULL UNIQUE,
    role       TEXT NOT NULL,   -- 'created' or 'update'
    posted_at  TEXT NOT NULL,   -- when the club posted it
    added_at   TEXT NOT NULL    -- when the updater processed it
);
