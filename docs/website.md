# Website

Static site (plain HTML/CSS/JS, no build step), hosted on GitHub Pages from the repo root.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page: header, Events view, Clubs view, one-club view |
| `assets/style.css` | All styling. Colors and fonts are CSS variables at the top |
| `assets/app.js` | Loads the data and renders everything |
| `clubs.json` | Club list (shared with the updater) |
| `events.json` | Events, written by `updater/run.py` |
| `sample-events.json` | Fake events for design and demos |

## Pages

The site is one page; the URL hash picks the view.

| URL | Shows |
|---|---|
| `#home` (default) | Landing page: maroon hero with "Find Your Club" (→ `#clubs`) and "See Calendar" (→ `#events/month`) buttons, then the next 3 upcoming events |
| `#events` | Upcoming events. List (grouped by day) or Month grid. Search box + club filter. "Show past events" toggle. Events with no date go under "Date to be announced" |
| `#events/month` | Events, opened on the month grid |
| `#clubs` | Grid of all clubs with their number of upcoming events |
| `#club/<ig_handle>` | One club: name, Instagram link, profile text (hidden until written), its upcoming events |

Add `?sample=1` to the URL to load `sample-events.json` instead of `events.json` (a yellow banner says so). Example: `index.html?sample=1#events`.

## Data it reads

`events.json` (format set by `updater/run.py`, fields from `db/schema.sql`):

```json
{
  "updated_at": "2026-11-17T14:27:56Z",
  "events": [
    {
      "event_name": "...",
      "date_time": "2026-11-20T18:00",   // or "2026-11-20" (no time) or "not shown"
      "location": "...",
      "description": "...",
      "firms": "A, B, C",                 // comma-separated
      "guest_speakers": "Name (Title, Firm), Name 2",
      "post_url": "https://www.instagram.com/p/...",
      "club": "FISA",
      "ig_handle": "fisajmsb"
    }
  ]
}
```

- Any field equal to `not shown` is hidden.
- Firms and speakers are split on commas that are not inside parentheses and shown as chips.
- Dates are shown in the visitor's local time zone, as written (no time zone conversion).

`clubs.json`: `name`, `ig_handle`. Optional `description` (club profile text). When it's missing, the club page shows no profile text. Adding `description` doesn't affect the updater (it only reads `name` and `ig_handle`).

## Style

Based on casajmsb.ca (checked 2026-11-17): maroon `#9b233a`, gold `#f1bf4e`, text `#333`, light gray `#eee`, square corners, bold uppercase headings, maroon footer. Their heading fonts are paid (Adobe), so the site uses Barlow (headings) and Lato (body) from Google Fonts. No CASA logo is used. Follows `docs/design-guidelines.md` (PR #1): no emoji icons, no italic accent words, tabular numbers for dates, visible focus, reduced motion respected.

## Test locally

From the repo folder: `py -m http.server 8000`, then open http://localhost:8000/?sample=1. Opening `index.html` directly (file://) won't work because the browser blocks loading the JSON files.

## Publish (GitHub Pages)

Once, on GitHub: repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save**. The site is then at https://louisfelixdion.github.io/JMSBclubs/. Each push of `events.json` by the updater updates the site within a minute or two.

## Changelog
- 2026-11-17: Added landing page (hero + two buttons + next 3 events), now the default view.
- 2026-11-17: First version: events list + month grid, search, club filter, past toggle, clubs grid, club pages with profile placeholders, sample data. Styled after casajmsb.ca.
