# Team rosters (club executive teams)

## Goal
Keep each club's current executive team (names + roles) in the database, for future club pages on the site. Clubs post their lineup on Instagram once or twice a year ("Meet the team", one slide per member or a group grid with names and titles).

## How the updater handles them
1. **Recognize.** In the classify step (caption + first image), Claude sets `post_type` to `team_roster` when the post presents the club's own team with names and roles. One-member spotlights with a name and role count too. Hiring calls, guest speakers, sponsors and alumni do not.
2. **Read everything.** For a team post, every slide is downloaded (Instagram max 20) and Claude reads the caption and each slide (`extract_roster()` in `updater/extract.py`). It returns each member's name and role exactly as written, the slide it came from, and the slides it could not read.
3. **Save** (`save_roster()` in `updater/run.py`):
   - One roster per club per **school year**. The year is the one written on the post; if none, it comes from the post date: March to December = year starting that fall (e.g. April 2026 → `2026-2027`), January-February = current year.
   - Several posts can feed one roster (e.g. "part 1 / part 2", one post per VP). A name already in the roster is not duplicated; if a newer post gives a different role, the role is updated.
   - A roster for a **newer school year becomes the active one** (`is_active = 1`); older rosters stay as history and are never deleted.
   - Each team post is logged in `roster_sources`, with any **unreadable slides** so they can be checked by hand.

## Rules
- Only names actually written on the post. Claude never guesses, completes or corrects a name.
- A name with no visible role is saved with role `not shown`.
- Tables: see `docs/storage.md` (`team_rosters`, `team_members`, `roster_sources`).

## Where the data lives
- **`assets/data/teams.json`** (on GitHub, under `assets/` so Cloudflare publishes it): each club's active roster (club, school year, members with name + role, source posts). This is what the website's club pages will read. Written by the updater after every run, like `events.json`.
- **Database** (`db/events.db`): full history (`team_rosters`, `team_members`, `roster_sources`).

## Backfill (teams posted before the updater ran)
Rosters read by hand are in `updater/backfill/team_rosters_2026.json` (club, post, school year, members, notes). The updater **loads this file automatically at the start of every run** (no duplicates), so nothing has to be done by hand. To load it alone: `py updater/run.py --import-rosters updater/backfill/team_rosters_2026.json`.

**Backfill Nov 17-18, 2026** (posts since Apr 1, 2026; 21 clubs; ~520 posts; Apify ≈ $1.40 total):
- **20 clubs, 380 members** (369 + 11 JSBA from 3 team posts found later in the same dataset). Most from captions; Enactus, JIC, JMMA and JMSM read from the images.
- Teams are announced in **April-May** right after elections, often again in Sept-Nov with photos, plus a separate first-year-rep post in Oct.
- JSBA: Academics, External, Events teams and first-year reps saved; JSBA presidents, marketing, finance/internal not found (Nov 2 post is group photos without names).
- JMMA: only the first 7 slides were available from the scrape; any later slides were not read.
- No team post found since April: CASA X (its director, Adrian Alexander, is in CASA's roster).
- To check: JSEC first-year rep is "Bernardo Fanti" (Oct 8) but "Bernardo Brotherhood" (Nov 12); Nov 12 kept. MCC's caption groups names per portfolio, so exact individual titles are on the images. JMAS caption gives portfolios, not titles.

## Stopped here (Nov 18, 2026: Louis asked to stop all scraping, Apify credit low)
Nothing more is being scraped. To resume later, at no cost first:
- **Scraped data used:** posts since 2026-04-01 for all 21 clubs (Apify datasets `16nVwtV683ayxnXSk`, `bCCqFfUuZip0M1FQX` FISA, `PPZz7KrP5XmwZfEH3` JMIS; Apify keeps them 7 days, until ~Nov 24-25).
- **Missing, to look for next:**
  - CASA X: no team post since April (its director Adrian Alexander is in CASA's roster).
  - JSBA: President(s), Marketing, Finance/Internal teams. Look for more "JSBA's ... Team 2026-2027" posts (Oct 30-Nov 2 series).
  - JMMA: only slides 1-7 of the Sep 10 post were read; a later slide may exist.
- **To check by hand:** JSEC first-year rep "Bernardo Fanti" (Oct 8) vs "Bernardo Brotherhood" (Nov 12, kept). JMCC "Calypso Bousthia" (Apr 25, kept) vs "Boustiha" (Nov 17). MCC caption groups names per portfolio, so individual titles are approximate.
- **Going forward:** the daily updater recognizes new team posts on its own (no extra scrape needed).
- The website shows rosters from `assets/data/teams.json`.

## Changelog
- 2026-11-18: Added 7 more team posts from the existing dataset (JSBA x3, JMCC x3, JSEC x1): 380 members. Scraping stopped (credit); resume notes above. `teams.json` moved to `assets/data/`.
- 2026-11-18: Read image-only rosters (Enactus, JIC, JMMA, JMSM): now 20 clubs, 369 members.
- 2026-11-18: Backfill of all 21 clubs from captions (18 clubs, 293 members). New `assets/data/teams.json` export; backfill file auto-loaded each run.
- 2026-11-17: Trial backfill FISA + JMIS (29 FISA members, 2 JMIS directors). Added `--import-rosters`.
- 2026-11-17: Created. `team_roster` post type, roster tables, offline test with a stand-in for Claude (two posts merged into one roster, role update, older year kept inactive, unreadable slide logged).
