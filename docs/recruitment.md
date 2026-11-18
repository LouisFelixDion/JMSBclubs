# Recruitment (when each club hires)

## Goal
Know when each club recruits, so students can see it on the club pages (not built yet). Each club has up to two tracks:
- **Executive**: the club's own team (president, VPs, directors, organizing committee).
- **Participant**: member programs, under the club's own name (JMIS "Analyst Program", JMCC "Delegates", CREC "REIMI Analyst", "First-Year Representative", "Brand Ambassadors"...).

## How the updater handles it
1. **Recognize.** In the classify step (caption + first image), Claude sets `post_type` to `recruitment` when the post invites students to apply to join the club: exec hiring or a member program. Openings, deadlines, extensions and last calls count. Not recruitment: registration for an event or competition the club runs, company job offers, and recruitment info sessions or mixers (those are events).
2. **Read everything.** Every slide is downloaded and Claude reads the caption and all slides (`extract_recruitment()` in `updater/extract.py`). It lists each track in the post: `track`, `track_name`, `roles`, `opens_at`, `closes_at`, `how_to_apply`, `eligibility`, `school_year`, `details`. Claude is shown the club's existing track names so it reuses them. Anything not on the post is `not shown`; nothing is guessed. If the post says applications are open now with no date, the post date is the opening date.
3. **Save** (`save_recruitment()` in `updater/run.py`):
   - One recruitment per club + track name + school year. If the post gives no school year, it comes from the post date (same rule as rosters: March to December = year starting that fall).
   - A later post about the same track **updates** it: new dates, link or eligibility replace the old ones, roles are added, details are only filled if blank. Each change is logged in `recruitment_changes` (e.g. deadline Sept 19 → Sept 26).
   - Every post is recorded in `recruitment_sources`.
4. **Export.** `recruitment.json` lists every track with its sources. The website doesn't read it yet.

Tables: see `docs/storage.md`.

## Research baseline (Nov 18, 2026)
Before any recruitment post was scraped, timelines for the 21 clubs were researched from the web (club websites, Linktrees, CASA's opportunities page, CASA Survival Guides 2024-25 and 2025-26). No Apify. Full table with confirmed vs inferred labels and sources: project file `clubs/recruitment-timelines.md`.

Patterns found:
- Executive hiring: **February to May** (FISA and JHMA March, JMUCC organizing committee ~March, MCC April, JSEC May, JMCC "spring").
- First-Year Representatives: **September to October** at almost every club.
- Participant programs: JMIS Analyst / Senior Analyst (start of fall), JMCC Delegates (fall, interview), CREC REIMI Analyst (4-5 per year), MCC CMP Analyst, JMWL Ambassadors (end of Sept), CASA X Brand Ambassadors (Sept), Enactus Project Managers (Oct).
- Nothing found for BIA; little for JMTL. No club had posted 2027 dates yet.

## Changelog
- 2026-11-18: Created. `recruitment` post type, 3 tables, `recruitment.json`. Offline test with a stand-in for Claude: a post with two tracks (Analyst Program + Executive Team) created both; a deadline-extension post updated the Analyst Program close date and logged the change; a thank-you post was ignored. Not yet run against real Instagram or real Claude.
