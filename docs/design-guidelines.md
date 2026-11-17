# Design guidelines: avoid the "AI-generated" look

Status: research done Nov 17, 2026. Applies to the static site (HTML/CSS/JS on GitHub Pages).

## TLDR

- AI UIs look alike because the model returns the average of its training data: purple/indigo gradient, Inter, centered hero with a pill badge, three identical icon cards, rounded-2xl + soft shadow on everything, emoji icons, glassmorphism, buzzword copy. Avoid all of these.
- "Anti-slop" styles are now their own cluster too: cream background + serif + terracotta, near-black + acid-green, Space Grotesk / Instrument Serif / Geist. Don't swap one default for another.
- Our fix is to ground the design in the real subject: **CASA JMSB's existing identity** (maroon `#9B233A`, gold `#F1BF4E`, white, grey text `#333`, square corners, Swiss grotesk type, real event photos).
- The content (event flyers, dates, club names) is the design. Build a dense, scannable listing, not a marketing landing page.
- Run the checklist below before every merge.

## 1. The tells (ranked by how many sources name them)

| Tell | Sources (of 6) |
|---|---|
| Purple / indigo / blue-purple gradients (hero, buttons, glows, gradient text) | 6 |
| Inter (or Roboto/Open Sans/Arial) as the only typeface | 5 |
| Row of 3 identical cards, icon on top, equal widths | 5 |
| Emoji as icons, bullets or nav items | 5 |
| Centered full-screen hero + generic headline | 4 |
| Dark mode with glows, aurora blobs, colored box-shadows | 4 |
| Pill badge / ALL-CAPS eyebrow label above every heading | 3 |
| Colored left-border "side stripe" on cards | 3 |
| Glassmorphism (frosted panels) with no purpose | 3 |
| Same big radius + same soft shadow + same padding on everything (`rounded-2xl shadow-lg p-6`) | 3 |
| Buzzword copy: "Seamless", "Elevate", "Unlock", "Build faster. Ship smarter." | 3 |
| Em-dash in every sentence, stock openers | 3 |
| Cards inside cards | 2 |
| Same section order every time (hero, features, social proof, pricing, FAQ, footer) | 2 |
| Fade-up-on-scroll on every section, bounce easing | 2 |
| Invented stats ("10x faster"), no real proof | 2 |
| One italic/colored "accent word" in the headline | 2 |
| Plastic AI illustrations, 3D blobs | 2 |

Single-source but worth avoiding: 5-6 competing neon accents, status dots everywhere, `01 / 02 / 03` numbering on non-sequences, middle-dot meta strings (`A · B · C`), `→` appended to every link, mono font for tiny labels, fake browser/phone frames, pure `#000`/`#fff`, gradient text via `background-clip`, missing focus states, alt text like "image".

## 2. Do / Don't checklist

**Color**
- [ ] DO use CASA maroon `#9B233A` as the one dominant color, gold `#F1BF4E` as a rare accent (e.g. "today" marker), neutrals for the rest. Define them as CSS variables.
- [ ] DO derive any extra color from meaning (e.g. event category), and explain it in text.
- [ ] DON'T use gradients, glows, colored shadows, neon accents, or a dark theme just to look "modern".

**Typography**
- [ ] DO pick one grotesk for UI/body and, at most, one clearly different face for headlines. CASA uses Neue Haas Unica + Neusa Next (Adobe Fonts, needs a license). Free stand-ins: **Schibsted Grotesk**, **Archivo**, **IBM Plex Sans**, **Public Sans** (Google Fonts).
- [ ] DO set a real type scale (e.g. 14 / 16 / 20 / 28 / 40px), body line length under ~75 characters, `font-variant-numeric: tabular-nums` for dates/times.
- [ ] DON'T use Inter, Roboto, Space Grotesk, Instrument Serif, Geist; no accent-word italics; no ALL-CAPS eyebrows above every section (one or two all-caps labels max, like CASA's nav).

**Layout**
- [ ] DO lead with the content: the first screen shows upcoming events, not a slogan. Left-align text.
- [ ] DO use a list/agenda layout grouped by date for events, and a dense grid of clubs (logo + name + one line). Cards only for things you click.
- [ ] DO vary rhythm: section spacing follows content, not one fixed padding.
- [ ] DON'T build hero + 3 feature cards + stats row + CTA. No card-in-card, no side-stripe cards, no 100vh hero.

**Shape & depth**
- [ ] DO keep CASA's square corners (`border-radius: 0`) or a small single value (2-4px). Use 1px borders or whitespace to separate.
- [ ] DON'T stack big radius + drop shadow + glass on every element.

**Imagery & icons**
- [ ] DO use the real flyer images and club logos we scrape; that is our visual identity for free.
- [ ] DO use one icon set (e.g. Lucide or Phosphor), only where it helps (location, time, Instagram).
- [ ] DON'T use emoji as icons, AI illustrations, stock "diverse team" photos, 3D blobs.

**Motion**
- [ ] DO animate only in response to the user (opening a filter, expanding an event). 150-200ms ease-out. Respect `prefers-reduced-motion`.
- [ ] DON'T fade-up every section on scroll, or put hover animations on every card.

**Copy**
- [ ] DO write plain, specific, student-facing text: "Events from 19 JMSB clubs, updated daily from Instagram." Name real things (club, room, date).
- [ ] DO use clear action labels ("See event on Instagram", "Filter by club"), sentence case, no apologetic errors. Empty state: "No events this week. Check back Monday."
- [ ] DON'T use "Elevate / Seamless / Unlock / Empower / Discover your potential", emoji bullets, em-dash chains, invented numbers.

**Quality floor**
- [ ] Works at 360px wide, visible keyboard focus, color contrast AA (maroon on white passes; gold on white does NOT, use gold only as a fill with dark text), real `alt` text, real `<title>`/meta description.

## 3. What to keep / avoid from casajmsb.ca (our styling base)

Measured from the live page's computed styles on Nov 17, 2026 (site built on Webflow by agency Playground).

Keep:
- Palette: maroon `#9B233A` (rgb 155,35,58), gold `#F1BF4E`, text `#333333`, white background, light grey `#EEEEEE`. Close to Concordia's official burgundy `#912338`.
- Square corners everywhere (border-radius 0). Already un-AI.
- Swiss-style grotesk type, real event photos, casual student tone ("FREE STUFF!").
- /events page groups events by type with photos, no cards. Good model.

Avoid:
- The generic headline "Adding value to student life" and the stats row ("7,000+ undergraduates / 16 subsidiaries / $1M budget"): template patterns.
- Overuse of all-caps on buttons and labels.
- Empty "More events coming soon!" block: our site must always show real, dated events.
- Paid Adobe fonts unless the team has a license (use the free stand-ins above).

## 4. Reference sites (human-designed, fit an events/club directory)

- **casajmsb.ca**: the brand base (see section 3).
- **ra.co** (Resident Advisor): event listings grouped by date, dense, typographic, flyer-first.
- **lu.ma**: clean event page structure (date, time, place, host, one action).
- **concordia.ca/brand**: official colors and usage rules (burgundy `#912338`, digital gold `#CBB576` for buttons with black text).
- **are.na**: shows how a plain, mostly-type UI with almost no decoration still feels designed.

## 5. How to use this with Claude when building

Paste into the prompt: "Use docs/design-guidelines.md. Colors only from the CSS variables. Font: <chosen>. No gradients, shadows, emoji, glass, centered hero, or 3-card rows. First screen = upcoming events list." Then screenshot the result and check it against section 2.

## Sources

- Anthropic, frontend-design skill: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- Anthropic cookbook, Prompting for frontend aesthetics: https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb
- Adrian Krebs, scoring ~1,590 Show HN pages for AI design patterns (Apr 2026): https://adriankrebs.ch/blog/design-slop/
- The Fountain Institute, 7 signs a UI has been vibe coded: https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
- Utsubo, the "Built with AI" tell, 12 signals: https://www.utsubo.com/blog/built-with-ai-trust-signals-2026
- 925 Studios, AI slop fonts and gradients: https://www.925studios.co/blog/ai-slop-design-tells
- Hallmark (Nutlope) anti-pattern catalogue (summary page): https://instagit.com/Nutlope/hallmark/hallmark-anti-patterns-detected/
- CodeMySpec, why vibe-coded sites look the same: https://codemyspec.com/blog/vibe-coded-websites-look-the-same
- Concordia colour palette: https://www.concordia.ca/brand/brand-standards/colour-palette.html
- CASA JMSB site (styles measured in browser): https://www.casajmsb.ca/

## Changelog

- 2026-11-17: created from research thread.
