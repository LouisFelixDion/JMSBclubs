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

## Not done yet
- The website does not show rosters yet (club pages come later).
- One-time backfill of the 2026-2027 teams for the 19 clubs: in progress.

## Changelog
- 2026-11-17: Created. `team_roster` post type, roster tables, offline test with a stand-in for Claude (two posts merged into one roster, role update, older year kept inactive, unreadable slide logged).
