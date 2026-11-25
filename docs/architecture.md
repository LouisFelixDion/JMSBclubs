# Architecture (end state)

JMSBClubs keeps every JMSB/CASA club's events, team and recruitment info up to date by itself, from the clubs' Instagram accounts.
No manual step: a cloud job runs daily and the static site redeploys.

## Daily cloud job (GitHub Actions or a server)
1. **Scrape** new posts of the 22 clubs with Apify (`apify/instagram-scraper`): one call per club, only posts newer than that club's cursor in `updater/state/last_posts.json` (the most recent post handled for that club). New clubs get their last 10 posts.
2. **Download images** (first image + carousel slides) right after the scrape: Instagram image links expire after 3-4 days.
3. **Extract** with the Claude API: prompts and rules in `docs/api-prompt.md`.
4. **Store** in the database: events (updated, never duplicated, change log kept), series, rosters, recruitment.
5. **Move the cursors** to each club's newest handled post (a failed post is retried next day).
6. **Export** `events.json`, `assets/data/teams.json`, `assets/data/recruitment.json`, and each new event's flyer to `assets/events/<post code>.jpg`.
7. **Commit** (data + cursors) to GitHub; Cloudflare Pages deploys https://jmsbclubs.pages.dev.

## Secrets
Apify token and Anthropic API key, stored as secrets of the job (never in the repo).

## Risks to test first
- **Instagram may block image downloads from datacenter IPs** (GitHub Actions, cloud servers). Test on day one. Fallback: get the images through Apify and read them from Apify storage.
- **Apify cost:** about $0.0027 per post; only posts newer than each club's cursor are scraped.
- **Apify concurrency:** max 5 runs at the same time on the current plan; run the per-club calls 4 at a time.
- **Database location:** the job needs a database that persists between runs (today `db/events.db` is local and gitignored). Decide where it lives.

## Not built yet
- The extraction still calls Claude Code (`claude -p`) instead of the API: rewrite `ask_claude()` in `updater/extract.py`.
- No cloud job yet (GitHub Actions workflow + secrets + database storage).
- `save_roster` does not yet let a full lineup replace the old one (see `docs/api-prompt.md`).

## Changelog
- 2026-11-24: Created.
- 2026-11-25: Per-club cursor (steps 1 and 5), Apify concurrency limit.
