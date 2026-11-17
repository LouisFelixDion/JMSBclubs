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

## Backfill (one-time, for teams posted before the updater ran)
Rosters found by hand are stored in `updater/backfill/team_rosters_2026.json` (club, post, school year, members, unreadable slides). Load them into the local database with:

`py updater/run.py --import-rosters updater/backfill/team_rosters_2026.json`

Safe to re-run (no duplicates). Clubs not in `clubs.json` are skipped. The posts are also marked as processed so the updater won't read them again.

**Trial (Nov 17), FISA + JMIS**, scraped posts since April/March 2026 (46 posts, $0.13):
- FISA: 2026-2027 team announced Apr 14 (all 27 names + roles in the caption), plus 2 First-Year Reps on Oct 4. An Oct 8 post has group photos by team; names are not in its caption and its images were not read.
- JMIS (@jmis.ca, John Molson Investment Society): Apr 14 post names 2 Directors (Artem Shaporin, Joel Leger). No full team lineup found since March. JMIS is not in `clubs.json`, so it is not imported.
- Finding: team lineups are posted in **April** (right after elections), not only in the fall. Backfills must go back to at least April.

## Not done yet
- The website does not show rosters yet (club pages come later).
- Backfill of the other 18 clubs.

## Changelog
- 2026-11-17: Trial backfill FISA + JMIS (29 FISA members, 2 JMIS directors). Added `--import-rosters`.
- 2026-11-17: Created. `team_roster` post type, roster tables, offline test with a stand-in for Claude (two posts merged into one roster, role update, older year kept inactive, unreadable slide logged).
