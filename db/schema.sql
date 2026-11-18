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
    event_type      TEXT NOT NULL DEFAULT 'other',
    date_time       TEXT NOT NULL DEFAULT 'not shown',
    location        TEXT NOT NULL DEFAULT 'not shown',
    description     TEXT NOT NULL DEFAULT 'not shown',
    firms           TEXT NOT NULL DEFAULT 'not shown',
    guest_speakers  TEXT NOT NULL DEFAULT 'not shown',
    image_url       TEXT NOT NULL DEFAULT 'not shown',
    post_url        TEXT NOT NULL UNIQUE,  -- dedupe key
    club_id         INTEGER NOT NULL REFERENCES clubs(id),
    scraped_at      TEXT NOT NULL,
    series_id       INTEGER REFERENCES series(id)  -- NULL = one-off event
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

-- Internal change log: one row per field an update post changed on an existing event
-- (e.g. new time or location, added firms). Basis for a future "modified" label on the site.
CREATE TABLE IF NOT EXISTS event_changes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    INTEGER NOT NULL REFERENCES events(id),
    field       TEXT NOT NULL,
    old_value   TEXT NOT NULL,
    new_value   TEXT NOT NULL,
    post_url    TEXT NOT NULL,   -- the post that caused the change
    changed_at  TEXT NOT NULL
);

-- Recurring series (e.g. FISA "Academic Series", weekly). Each session is still its own
-- event, created when its post appears; events.series_id links it to the series.
CREATE TABLE IF NOT EXISTS series (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id     INTEGER NOT NULL REFERENCES clubs(id),
    name        TEXT NOT NULL,
    cadence     TEXT NOT NULL DEFAULT 'not shown',  -- weekly / biweekly / monthly
    created_at  TEXT NOT NULL,
    UNIQUE (club_id, name)
);

-- Executive team lineups ("Meet the team" posts, usually once or twice a year).
-- One roster per club per school year. A roster for a newer school year becomes the
-- active one; older rosters stay as history (is_active = 0), never deleted.
CREATE TABLE IF NOT EXISTS team_rosters (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id      INTEGER NOT NULL REFERENCES clubs(id),
    school_year  TEXT NOT NULL,              -- e.g. '2026-2027'
    is_active    INTEGER NOT NULL DEFAULT 1, -- 1 = the club's current team
    created_at   TEXT NOT NULL,
    UNIQUE (club_id, school_year)
);

-- One row per person in a roster. Several posts can feed the same roster
-- (e.g. "Meet the VPs part 1 / part 2"); a name already in the roster is updated, not duplicated.
CREATE TABLE IF NOT EXISTS team_members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    roster_id   INTEGER NOT NULL REFERENCES team_rosters(id),
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'not shown',
    post_url    TEXT NOT NULL,   -- post the name was read from
    slide       INTEGER,         -- slide number in that post (1 = first), NULL if from the caption
    added_at    TEXT NOT NULL,
    UNIQUE (roster_id, name)
);

-- Every post that fed a roster, with slides that could not be read (to check by hand).
CREATE TABLE IF NOT EXISTS roster_sources (
    roster_id          INTEGER NOT NULL REFERENCES team_rosters(id),
    post_url           TEXT NOT NULL UNIQUE,
    posted_at          TEXT NOT NULL,
    unreadable_slides  TEXT NOT NULL DEFAULT '',  -- e.g. '4,7' or '' if all read
    added_at           TEXT NOT NULL
);
