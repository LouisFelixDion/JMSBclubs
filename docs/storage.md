# Storage

## What it is
A local SQLite database, `db/events.db`, holding JMSB club events taken from Instagram posts. The schema lives in `db/schema.sql`.

## Tables

**clubs**
| Field | Notes |
|---|---|
| id | Primary key |
| name | Club name |
| ig_handle | Instagram handle, unique |

**events**
| Field | Notes |
|---|---|
| id | Primary key |
| event_name | |
| date_time | |
| location | |
| description | |
| firms | |
| guest_speakers | |
| post_url | Instagram post URL, unique (dedupe key) |
| club_id | Foreign key to `clubs.id` |
| scraped_at | When the post was scraped |
| series_id | Foreign key to `series.id`; empty for one-off events |

**processed_posts**
| Field | Notes |
|---|---|
| post_url | Instagram post URL, primary key |
| is_event | 1 if saved to `events`, 0 if not an event |
| processed_at | When the updater looked at it |

Every post the updater has checked, so Claude is never asked about the same post twice.

**event_sources**
| Field | Notes |
|---|---|
| event_id | Foreign key to `events.id` |
| post_url | Instagram post URL, unique |
| role | `created` (first post) or `update` (later post about the same event) |
| posted_at | When the club posted it |
| added_at | When the updater processed it |

**event_changes**
| Field | Notes |
|---|---|
| id | Primary key |
| event_id | Foreign key to `events.id` |
| field | Which field changed (e.g. `date_time`, `location`, `firms`) |
| old_value / new_value | Before and after |
| post_url | The post that caused the change |
| changed_at | When the updater made the change |

Internal log for a future "modified" label on the site.

**series**
| Field | Notes |
|---|---|
| id | Primary key |
| club_id | Foreign key to `clubs.id` |
| name | Series name, e.g. `Academic Series` (unique per club) |
| cadence | `weekly` / `biweekly` / `monthly`, or `not shown` |
| created_at | When the updater first saw it |

Missing values are stored as `not shown`, per the data spec.

Events are never deleted. `events.json` only shows events from the last 4 months onward (see `docs/updater.md`).

## How to initialize
From the `Claude Builder Folder`, run:

```
py db/init_db.py
```

This creates `db/events.db` if it doesn't exist. The updater (`docs/updater.md`) also does this automatically and fills `clubs` from `clubs.json`. It is safe to re-run because it uses `CREATE TABLE IF NOT EXISTS`.

## Changelog
- 2026-11-04: Created schema (`clubs`, `events`), init script, and this doc. No data inserted.
- 2026-11-17: Added `processed_posts` table for the updater. `events.db` is not committed to git.
- 2026-11-17: Added `event_sources` table (all posts linked to an event).
- 2026-11-17: Added `event_changes` table (internal change log).
- 2026-11-17: Added `series` table and `events.series_id` (older databases get the column added automatically).
