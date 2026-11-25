# Architecture (end state)

JMSBClubs keeps every JMSB/CASA club's events, team and recruitment info up to date by itself, from the clubs' Instagram accounts.
No manual step: a cloud job runs daily and the static site redeploys.

## Daily cloud job (GitHub Actions or a server)
1. **Scrape** new posts of the 22 clubs with Apify (`apify/instagram-scraper`), only posts newer than the last run.
2. **Download images** (first image + carousel slides) right after the scrape: Instagram image links expire after 3-4 days.
3. **Extract** with the Claude API: prompts and rules in `docs/api-prompt.md`.
4. **Store** in the database: events (updated, never duplicated, change log kept), series, rosters, recruitment.
5. **Export** `events.json`, `assets/data/teams.json`, `assets/data/recruitment.json`, and each new event's flyer to `assets/events/<post code>.jpg`.
6. **Commit** to GitHub; Cloudflare Pages deploys https://jmsbclubs.pages.dev.

## Secrets
Apify token and Anthropic API key, stored as secrets of the job (never in the repo).

## Risks to test first
- **Instagram may block image downloads from datacenter IPs** (GitHub Actions, cloud servers). Test on day one. Fallback: get the images through Apify and read them from Apify storage.
- **Apify cost:** about $0.0027 per post; only scrape posts newer than the last run.
- **Database location:** the job needs a database that persists between runs (today `db/events.db` is local and gitignored). Decide where it lives.

## Not built yet
- The extraction still calls Claude Code (`claude -p`) instead of the API: rewrite `ask_claude()` in `updater/extract.py`.
- No cloud job yet (GitHub Actions workflow + secrets + database storage).
- `save_roster` does not yet let a full lineup replace the old one (see `docs/api-prompt.md`).

## Changelog
- 2026-11-24: Created.
