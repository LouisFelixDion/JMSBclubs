# Updater

## What it does
`updater/run.py` keeps `events.json` up to date. One run:

1. Reads the 19 club accounts from `clubs.json`.
2. Asks Apify's `apify/instagram-scraper` for each account's recent posts (default: last 7 days, up to 5 per account).
3. Skips any post it has already looked at (tracked in the `processed_posts` table).
4. For each new post, Claude works in two steps:
   - **Classify:** Claude reads the caption and the first image only and decides if the post is relevant: an upcoming event or a registration/application announcement (sign-ups, deadlines, tickets). Recaps, thank-you posts, giveaways, generic promos, member spotlights and exec hiring calls are recorded as seen and dropped here. Nothing else is downloaded for them.
   - **Details (carousels only):** if a relevant post has more slides, the other slides (up to 9) are downloaded and Claude reads all of them to fill in the event fields. Values it found in step 1 are kept if step 2 leaves them empty.
   - Safety net: any "event" dated before the day it was posted is dropped as a recap.
5. **Same event, new post?** Clubs often post several times about one event (announcement, sponsor reveal, speaker reveal, last call). Claude is shown the club's events that are still upcoming at the post's date, and says if this post is about one of them (same or similar title, same date).
   - **Match:** the existing event is updated, not duplicated. Firms and guest speakers are *added* (from the caption or from logos in the images), date and location are replaced if the new post states different ones, and the original name and description are kept (only blanks get filled). The event on the site is updated, and **every change is logged** in the `event_changes` table (field, old value, new value, which post caused it, when). That log is the basis for a future "modified" label on the site (not built yet).
   - **No match:** a new event is created.
   - Either way the post is recorded in `event_sources`, so every event keeps the list of posts it came from (`created`, then `update`s).
   Posts are processed oldest first so follow-ups always land after the original.
6. **Recurring series.** Each session of a weekly series (e.g. FISA's "Academic Series") is its own event, created only when its post appears, since the topic is only known then. The only source of truth is the post itself: Claude tags a series **only if the caption or the image explicitly says it** ("weekly series", "Academic Series", "every Wednesday", "Week 7 of..."). It never guesses from patterns like the same room, time or similar titles. The series is recorded once in the `series` table (club, name, cadence if known) and each session is linked to it with `events.series_id`. Claude is shown the club's existing series names so it reuses the same name. Nothing on the site uses this yet; it's there to build on.
7. Saves events to `db/events.db` (missing values are `not shown`).
8. Writes events to `events.json` (with `series` and `sources`). **Past events stay on the site for 4 months** after their date, then drop out of `events.json`. They are never deleted from the database. Events with no known date are always kept. To change the window, edit `KEEP_PAST_MONTHS` in `updater/run.py`. (sorted by date), which the website reads.
9. Commits `events.json` and pushes it to GitHub.

## How Claude is called (proof of concept)
For now Claude runs through the **Claude Code CLI** (`claude -p`) on Louis's Claude subscription, so there is no Anthropic API key. All Claude code lives in `updater/extract.py`, in one function, `ask_claude()`. Moving to the Anthropic API later means rewriting only that function.

## Setup (once)
1. Claude Code: the Claude desktop app already includes it, and the updater finds it automatically (or uses `claude` if it's on PATH, or `CLAUDE_CMD` in `.env`). It needs **one sign-in of its own**, separate from the desktop app: in PowerShell run
   `& (Get-ChildItem "$env:LOCALAPPDATA\Claude-Data\*\claude-code\*\*\claude.exe" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName`
   then type `/login`, sign in with your Claude account in the browser, and type `/exit`.
2. Get an Apify token: sign in at console.apify.com, then go to **Settings → API & Integrations** and copy your **Personal API token**.
3. In the repo folder, copy `.env.example` to `.env` and paste the token after `APIFY_TOKEN=`. `.env` is gitignored, so never commit it.

## How to run
From the `JMSBClubs` folder:

| Command | What it does |
|---|---|
| `py updater/run.py --from-file tests/fixtures/sample_posts.json --no-push` | Offline test with 2 fake posts. No Apify, nothing pushed. It still calls Claude. |
| `py updater/run.py --clubs casajmsb --per-account 2 --no-push` | Small real test: 1 account, 2 posts, nothing pushed. |
| `py updater/run.py` | Full run, then commit and push. |

Other options: `--newer-than "14 days"`, `--per-account N`. Run `py updater/run.py -h` for all of them.

If you test with fake posts, delete `db/events.db` afterwards and run the updater again so the fake event doesn't stay in `events.json`.

## Reference test: Careers in Finance (FISA)
FISA posted about Careers in Finance 2026 (Nov 5) several times: a sponsor reveal on Oct 23 (Fidelity, Diligence/Manulife Wealth, CDPQ, Mackenzie, Raymond James, logos only), a second sponsor reveal on Oct 28 (Deloitte, SFL, CFA Montréal, NDG Capital), then two recaps after the event. Expected result, and what the offline test produced: **one** event, created from the Oct 23 post and updated by the Oct 28 post with all 10 firms; both recaps dropped. (Tested with a stand-in for Claude, so it checks the logic, not Claude's judgment.)

## Initial data (hand-reviewed)
The first real data was extracted by Claude in a project thread (not by `claude -p`), following the rules above, and saved as `updater/backfill/initial_scrape_<handle>.json` (each post: decision, reason, fields). To load it into your local database and `events.json`:

`py updater/import_reviewed.py updater/backfill/initial_scrape_fisajmsb.json`

It runs the same matching, firm merging, change log and series code as the updater. Safe to re-run (posts already seen are skipped). The posts are marked as processed, so the daily updater won't read them again.

## Cost
Each Apify run costs Apify credits (the free plan gives a monthly allowance). Each new post uses one Claude Code request on the subscription, plus a second one for relevant carousels. Posts already seen cost nothing.

## Errors
If Claude fails on a post, the post is not marked as seen, so the next run tries it again.

## Changelog
- 2026-11-17: First version: Apify scrape, Claude extraction via `claude -p`, SQLite, `events.json` export, git push. Tested offline with a stub in place of Claude; not yet run against real Instagram or real Claude.
- 2026-11-17: Added recap safety net: events dated before their post date are dropped.
- 2026-11-17: Two-step extraction. Classify on caption + first image; only relevant carousels get all slides read. Registration announcements count as relevant.
- 2026-11-17: Same-event matching. Follow-up posts update the existing event (firms/speakers added, incl. from logos) instead of creating a duplicate. New `event_sources` table; `events.json` now lists each event's `id` and `sources`.
- 2026-11-17: Added `event_changes` log: every field an update post changes (time, location, firms...) is recorded. Tested: a time change 6:00 -> 6:30 PM and the added firms were both logged.
- 2026-11-17: Updater auto-finds the Claude Code bundled with the Claude desktop app; no separate install needed.
- 2026-11-17: Recurring series tagging (`series` table, `events.series_id`). Tested: two FISA Academic Series sessions linked to one series.
- 2026-11-17: Past events stay in `events.json` for 4 months, then are left out (kept in the database).
- 2026-11-18: Added `import_reviewed.py` and the first hand-reviewed data (FISA, last 10 posts: 5 events).
- 2026-11-17: Series tagging only from explicit wording in the caption or image; no inference from patterns.
