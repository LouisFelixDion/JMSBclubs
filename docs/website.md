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
| `#home` (default) | Landing page. Hero: full-width JMSB building photo (`assets/img/jmsb-building.jpg`) with dark overlay, headline, "Find Your Club" (→ `#clubs`) and "See Calendar" (→ `#events/month`) buttons, and a white bar with a looping club logo carousel. Below: next 3 upcoming events |
| `#events` | Upcoming events. List (grouped by day) or Month grid. Search box + club filter. "Show past events" toggle. Events with no date go under "Date to be announced" |
| `#events/month` | Events, opened on the month grid |
| `#clubs` | Grid of all clubs with their number of upcoming events |
| `#club/<ig_handle>` | One club: name, Instagram link, profile text (hidden until written), its upcoming events |

Add `?sample=1` to the URL to load `sample-events.json` instead of `events.json`. Example: `index.html?sample=1#events`.

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
- Past events are kept for 4 months (Louis, 2026-11-17). The updater drops older ones from `events.json`; the site also hides anything older than 4 months as a safety net (`PAST_MONTHS` in `assets/app.js`). They show on the month calendar and with "Show past events".
- Firms and speakers are split on commas that are not inside parentheses and shown as chips.
- Dates are shown in the visitor's local time zone, as written (no time zone conversion).

`clubs.json`: `name`, `ig_handle`. Optional `description` (club profile text). When it's missing, the club page shows no profile text. Adding `description` doesn't affect the updater (it only reads `name` and `ig_handle`).

## Style

Colors sampled from the JMSB logo Louis sent (2026-11-17): red `#92182f`, gold `#b18a63`. Layout ideas from casajmsb.ca: text `#333`, light gray `#eee`, square corners, bold uppercase headings. The site uses Barlow (headings) and Lato (body) from Google Fonts; CASA's own fonts are paid. No CASA logo is used. Follows `docs/design-guidelines.md` (PR #1): no emoji icons, no italic accent words, tabular numbers for dates, visible focus, reduced motion respected.

## Club logos

The home page hero has a tall white bar of all 19 clubs that scrolls slowly right to left in a loop (one full loop takes 2 minutes); the photo continues below the bar and fades to white. It pauses on hover and stops for visitors who turn on reduced motion. Each club shows a logo from `assets/clubs/<ig_handle>.png`, `.svg` or `.jpg` (tried in that order). Until a file exists, a red square with the club's initials is shown. A `logo` field in `clubs.json` overrides the path.

## Test locally

From the repo folder: `py -m http.server 8000`, then open http://localhost:8000/?sample=1. Opening `index.html` directly (file://) won't work because the browser blocks loading the JSON files.

## Publish (GitHub Pages)

Once, on GitHub: repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save**. The site is then at https://louisfelixdion.github.io/JMSBclubs/. Each push of `events.json` by the updater updates the site within a minute or two.

## Changelog
- 2026-11-17: Layout scales with screen size (container up to 1320px, fluid hero type, events in 3 columns on wide screens); sharper 2400px hero photo with a 1100px version for phones; smoother fade under the logo bar.
- 2026-11-17: Hero copy changed, top line removed; "Find Your Club" is white with red text, gold with white text on hover.
- 2026-11-17: Logo bar taller and slower; photo continues under it and fades to white; home page background white.
- 2026-11-17: Past events older than 4 months are hidden.
- 2026-11-17: Hero: "This week" cards replaced by a looping club logo carousel; "Coming up" events back below the hero. Colors changed to the JMSB logo red and gold.
- 2026-11-17: Hero redone (option A from the design canvas): full-width photo, "This week" cards in the hero, club grid below.
- 2026-11-17: Removed the yellow "sample data" banner.
- 2026-11-17: Added JMSB building photo (from Louis) to the landing hero.
- 2026-11-17: Added landing page (hero + two buttons + next 3 events), now the default view.
- 2026-11-17: First version: events list + month grid, search, club filter, past toggle, clubs grid, club pages with profile placeholders, sample data. Styled after casajmsb.ca.
