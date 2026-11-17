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

Missing values are stored as `not shown`, per the data spec.

## How to initialize
From the `Claude Builder Folder`, run:

```
py db/init_db.py
```

This creates `db/events.db` if it doesn't exist. It is safe to re-run because it uses `CREATE TABLE IF NOT EXISTS`.

## Changelog
- 2026-11-04: Created schema (`clubs`, `events`), init script, and this doc. No data inserted.
