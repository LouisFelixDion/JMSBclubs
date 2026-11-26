# Updater

## Post types
Every post the updater reads gets exactly one type (step 1 below):

| Type | What it is | Where it goes |
|---|---|---|
| `event` | Upcoming event, or a registration/application for an event (tickets, sign-ups, case competition registration) | `events` table and `events.json` |
| `team_roster` | Club presents its team with names + roles ("Meet the team", spotlights) | `team_rosters` / `team_members` (see `docs/team-rosters.md`) |
| `recruitment` | Call to join the club itself: exec hiring or a member program (analysts, delegates, first-year reps, ambassadors, volunteers...) | `recruitments` table and `assets/data/recruitment.json` (see `docs/recruitment.md`) |
| `other` | Recaps, thank-yous, giveaways, generic promos, spotlights without a role, company job offers | Only marked as seen |

Recruitment info sessions and mixers are `event`s (students attend them).

**Dropped as `other`:** recaps and thank-yous (also any event whose date is before the post date), giveaways, generic promos, member spotlights with no role, company job offers.

**Series tag (on `event`s only):** an event can also belong to a recurring series (`series` field in `events.json`, e.g. FISA "Academic Series"). Tagged only when the caption or image says so explicitly; never guessed. See step 6 below.

**What the website shows (Nov 18, 2026):** `event` → calendar and club pages; `team_roster` → `assets/data/teams.json` → Members & roles on club pages; `recruitment` → `assets/data/recruitment.json` → "When <club> recruits" on club pages (empty until the first real recruitment post is scraped; the usual timing per club comes from `assets/data/recruitment-timelines.json` meanwhile).

## What it does
`updater/run.py` keeps `events.json` up to date. One run:

1. Reads the 22 club accounts from `clubs.json`.
2. Asks Apify's `apify/instagram-scraper` for each account's posts **newer than that club's cursor** (see "Refresh runs" below; up to 20 per club). A club with no cursor yet (newly added) gets its last 10 posts.
3. Skips any post it has already looked at (tracked in the `processed_posts` table).
4. For each new post, Claude works in two steps:
   - **Classify:** Claude reads the caption and the first image only and decides if the post is relevant: an upcoming event or a registration/application announcement (sign-ups, deadlines, tickets). Recaps, thank-you posts, giveaways, generic promos, member spotlights and exec hiring calls are recorded as seen and dropped here. Nothing else is downloaded for them.
   - **Details (carousels only):** if a relevant post has more slides, the other slides (up to 19) are downloaded and Claude reads all of them to fill in the event fields. Values it found in step 1 are kept if step 2 leaves them empty.
   - Safety net: any "event" dated before the day it was posted is dropped as a recap.
5. **Same event, new post?** Clubs often post several times about one event (announcement, sponsor reveal, speaker reveal, last call). Claude is shown the club's events that are still upcoming at the post's date, and says if this post is about one of them (same or similar title, same date).
   - **Match:** the existing event is updated, not duplicated. Firms and guest speakers are *added* (from the caption or from logos in the images), date and location are replaced if the new post states different ones, and the original name and description are kept (only blanks get filled). The event on the site is updated, and **every change is logged** in the `event_changes` table (field, old value, new value, which post caused it, when). That log is the basis for a future "modified" label on the site (not built yet).
   - **No match:** a new event is created.
   - Either way the post is recorded in `event_sources`, so every event keeps the list of posts it came from (`created`, then `update`s).
   Posts are processed oldest first so follow-ups always land after the original.
   - **Recruitment posts** (calls to join the club: exec hiring or a member program): step 1 tags these as `recruitment`. Every slide is downloaded and Claude lists each track the post announces (executive or participant, the club's own name for it, roles, open and close dates, how to apply, eligibility). Saved to `recruitments`, not to events. A later post about the same track (deadline extension, last call) updates it and the change is logged. Details: `docs/recruitment.md`.
   - **Team-roster posts** ("Meet the team", exec lineups, one-member spotlights with name + role): step 1 also tags these as `team_roster`. Every slide (up to 20) is then downloaded and Claude lists each member's name and role. They are saved to the club's roster, not to events. Details: `docs/team-rosters.md`.
6. **Recurring series.** Each session of a weekly series (e.g. FISA's "Academic Series") is its own event, created only when its post appears, since the topic is only known then. The only source of truth is the post itself: Claude tags a series **only if the caption or the image explicitly says it** ("weekly series", "Academic Series", "every Wednesday", "Week 7 of..."). It never guesses from patterns like the same room, time or similar titles. The series is recorded once in the `series` table (club, name, cadence if known) and each session is linked to it with `events.series_id`. Claude is shown the club's existing series names so it reuses the same name. Nothing on the site uses this yet; it's there to build on.
7. Saves events to `db/events.db` (missing values are `not shown`).
8. Writes events to `events.json` (with `series` and `sources`). **Past events stay on the site for 4 months** after their date, then drop out of `events.json`. They are never deleted from the database. Events with no known date are always kept. To change the window, edit `KEEP_PAST_MONTHS` in `updater/run.py`. (sorted by date), which the website reads.
9. Writes `assets/data/recruitment.json` (all recruitment tracks, newest school year first). Not shown on the site yet.
10. Commits `events.json` and `assets/data/recruitment.json` and pushes them to GitHub.

## Refresh runs (per-club cursor)
Each run starts where the last one stopped, club by club.

- `updater/state/last_posts.json` (committed) holds, for every club, the **most recent post of its feed that was handled**: `shortcode`, `posted_at`, and `checked_at` (when the club was last scraped).
- Each run makes one Apify call per club with `onlyPostsNewerThan` = that club's `posted_at`. Apify returns the cursor post itself again; it is skipped as already processed.
- After the posts are processed, each club's cursor moves to the newest post of its feed that is done: processed, or not the club's to process (a collab owned by another club, which is handled under its owner). If a post failed, the cursor stops just before it, so the next run fetches it again.
- Apify also returns a club's **pinned posts**, even when they are older than the cursor. They go through the normal dedupe (processed once, then skipped) and never move the cursor back.
- A club with no new post can come back as an `Empty or private data` error row instead of its cursor post: treat it as "no new posts", keep the cursor.
- The cursor only moves forward. A club with no new posts keeps its cursor; only `checked_at` changes.
- A new club in `clubs.json` has no cursor: its first run takes its last 10 posts.
- `--newer-than "14 days"` overrides the cursors for one run (backfills, tests).
- Apify allows at most 5 runs at the same time on the current plan: the per-club calls run 4 at a time.

## How Claude is called
Through the **Anthropic API**, one call per step (classify, detail, roster, recruitment), with the post's images attached. Prompts and rules: `docs/api-prompt.md`. All Claude code is in `updater/extract.py`, function `ask_claude()`.

## Setup
Secrets of the cloud job (never in the repo): `ANTHROPIC_API_KEY` and `APIFY_TOKEN`. For a manual run, put them in `.env` (copy `.env.example`; `.env` is gitignored).

## How to run
The cloud job runs `python updater/run.py` daily. For a manual or test run, from the repo folder:

| Command | What it does |
|---|---|
| `py updater/run.py --from-file tests/fixtures/sample_posts.json --no-push` | Offline test with 2 fake posts. No Apify, nothing pushed. It still calls Claude. |
| `py updater/run.py --clubs casajmsb --per-account 2 --no-push` | Small real test: 1 account, 2 posts, nothing pushed. |
| `py updater/run.py` | Full run, then commit and push. |

Other options: `--newer-than "14 days"` (ignore the cursors), `--per-account N` (max posts per club, default 20). Run `py updater/run.py -h` for all of them.

If you test with fake posts, delete `db/events.db` afterwards and run the updater again so the fake event doesn't stay in `events.json`.

## Reference test: Careers in Finance (FISA)
FISA posted about Careers in Finance 2026 (Nov 5) several times: a sponsor reveal on Oct 23 (Fidelity, Diligence/Manulife Wealth, CDPQ, Mackenzie, Raymond James, logos only), a second sponsor reveal on Oct 28 (Deloitte, SFL, CFA Montréal, NDG Capital), then two recaps after the event. Expected result, and what the offline test produced: **one** event, created from the Oct 23 post and updated by the Oct 28 post with all 10 firms; both recaps dropped. (Tested with a stand-in for Claude, so it checks the logic, not Claude's judgment.)

## Initial data (hand-reviewed)
The first real data (Nov 18, 2026: last 10 posts of each of the 21 clubs, 201 posts, 61 events) was reviewed by hand, before the automated job existed, following the rules above. Each club's decisions are in `updater/backfill/initial_scrape_<handle>.json` (per post: `event`, `update` with `same_as`, `dropped` with a reason, `recruitment`, or `team_roster`; plus the fields). To load all of them into your local database and `events.json`:

`py updater/import_reviewed.py updater/backfill/initial_scrape_fisajmsb.json updater/backfill/initial_scrape_*.json`

(or just `py updater/import_reviewed.py` followed by every file). It runs the updater's own matching, firm merging, change log and series code. Safe to re-run: posts already seen are skipped and get marked as processed, so the daily updater won't read them again. Two differences from the live updater: a post is matched to an existing event by the reviewed event name, and a reviewed update can attach to an event whose date has passed (needed when a deadline is extended after it expired).

## Event images (flyers)
- When a post creates a new event, the updater saves its first image to `assets/events/<post code>.jpg` (shrunk to 800px wide if Pillow is installed, else copied as is). Instagram image links expire after a few days, so the site never links to Instagram directly.
- `events.json` gets `image_url` (e.g. `assets/events/DfhyzVEIstb.jpg`) for each event whose flyer file exists, else `null`. The site shows it on the event card, or a placeholder when `null`.
- Images are downloaded right after the scrape (the links expire), sent to Claude, and the first one is kept as the flyer.

## Runs log
- 2026-11-18: initial data, last 10 posts per club (`updater/backfill/initial_scrape_*.json`), 61 events.
- 2026-11-24: posts since Nov 18 (`updater/backfill/scrape_2026-11-24.json`, Apify dataset goYKwmpJVnoj9C21x, about $0.10). 34 new posts: 5 new events, 6 events updated, 3 roster updates (Enactus, JIC, JMCC), 11 dropped. 66 events total. Rules learned: `docs/api-prompt.md`.
- 2026-11-25: first refresh run with per-club cursors (`updater/backfill/scrape_2026-11-25.json`, 23 Apify runs, about $0.12) + QUARCC's first 10 posts. 23 new posts: 8 new events (7 QUARCC, 1 FISA), CREC conference updated 4 times (panel speakers and firms), JMMA roster +3 members, 7 dropped. 73 events on the site (QUARCC's April event is past the 4-month window).
- 2026-11-26: refresh run 4 (`updater/backfill/scrape_2026-11-26.json`, 22 Apify runs, about $0.07). 6 new posts: 1 new event (JMAS Finals Tutorials), 1 update (JMSM conference schedule), 4 dropped. 74 events.
- Next run: starts from `updater/state/last_posts.json`.

## Cost
Apify: about $0.0027 per post. Claude API: one call per new post, plus one for relevant carousels and one per roster/recruitment post, priced by tokens (images count). Posts already seen cost nothing.

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
- 2026-11-18: Fixed `merge_list`: commas inside parentheses (e.g. "Name (Title, Company)") no longer split a firm or speaker in two.
- 2026-11-18: Initial data for all 21 clubs (61 events) in `updater/backfill/`.
- 2026-11-18: Added `import_reviewed.py` and the first hand-reviewed data (FISA, last 10 posts: 5 events).
- 2026-11-17: Series tagging only from explicit wording in the caption or image; no inference from patterns.
- 2026-11-18: New post type `recruitment` (exec hiring + member programs): `recruitments`, `recruitment_sources`, `recruitment_changes` tables and `assets/data/recruitment.json`. Exec hiring calls are no longer simply dropped. Tested offline with a stand-in for Claude (new tracks, deadline extension logged, unrelated post ignored).
- 2026-11-17: New post type `team_roster`: exec-team posts are saved as club rosters (`team_rosters`, `team_members`, `roster_sources`). Carousels now read up to 20 slides (was 10). Tested offline with a stand-in for Claude.
- 2026-11-18: Updater also writes `assets/data/teams.json` (active club rosters) and auto-loads `updater/backfill/team_rosters_2026.json` each run.
- 2026-11-18: Event flyers saved to assets/events/ and exported as image_url; added fetch_event_images.py for the initial 61 events.
- 2026-11-24: Run 2 (posts since Nov 18). `export_teams` now keeps hand-added member fields (photo, linkedin_url). Prompts + gotchas for the API switch in `docs/api-prompt.md`.
- 2026-11-24: Docs rewritten for the end state (cloud job + Claude API); new `docs/architecture.md`.
- 2026-11-25: Per-club refresh cursor (`updater/state/last_posts.json`, `fetch_since()` in `updater/scrape.py`, `update_last_posts()` in `updater/run.py`). Replaces the fixed "last 7 days" window. Tested offline: cursor advances, stops before a failed post, collab posts count as done.
