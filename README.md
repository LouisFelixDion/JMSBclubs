# JMSB Clubs

One place for every JMSB club and event at Concordia. Events are pulled automatically from club Instagram posts and shown in a single calendar.

COMM 227 project. Launch: November 25, 2026.

## What exists so far

| Path | What it is |
|---|---|
| `db/schema.sql` | SQLite schema: `clubs` and `events` tables |
| `db/init_db.py` | Creates `db/events.db` from the schema. Run: `py db/init_db.py` |
| `docs/storage.md` | How storage works: tables, fields, setup, changelog |

`db/events.db` is not committed. Rebuild it locally with the command above.

## Coming next
- Instagram scraper that fills the database
- `events.json` export
- Static calendar site on GitHub Pages that reads `events.json`

## Rules
- Everything built gets documented in `docs/`.
- Never commit secrets (API keys, `.env`). This repo is public.
