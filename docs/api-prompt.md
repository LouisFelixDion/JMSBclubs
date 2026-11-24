# Claude extraction prompts (for the Anthropic API switch)

Everything Claude is told when it reads a post, in one place, ready to paste into an API call.
Source of truth: `updater/extract.py` (copied here on 2026-11-24). If you change a prompt there, update this file.
The **Gotchas** section at the end lists everything that went wrong or that Louis corrected in past runs;
the final API prompt must cover each one. Every scrape run adds its gotchas here (rule from Louis, 2026-11-24).

## How the calls work
1. **Classify** each new post: `PROMPT` with `{task}` = `CLASSIFY_TASK`, caption + first image only.
2. If it is an event and has more slides: **detail** call, `PROMPT` with `{task}` = `DETAIL_TASK` and every slide.
3. If `post_type` is `team_roster`: `ROSTER_PROMPT` with every slide. If `recruitment`: `RECRUIT_PROMPT` with every slide.
4. Reply must be one JSON object (schemas inside each prompt). Missing values = the exact string `"not shown"`.

Placeholders: `{club}` club name, `{posted_at}` post timestamp (UTC), `{caption}`, `{existing}` = the club's upcoming
events as lines `#<id> | <event_name> | <date_time> | ...`, `{series}` = the club's known series names.

### What changes for the API
- `{image_line}`: today it lists local file paths that Claude Code opens with its Read tool. With the API, send each
  image as an image content block (base64 JPEG) in slide order, and replace `{image_line}` with
  "Image(s) from the post are attached, in slide order."
- Only `ask_claude()` in `updater/extract.py` needs rewriting; parsing (`parse_json`, `clean`) stays.
- Images must be downloaded on Louis's PC: the cloud cannot reach Instagram's image servers.

## PROMPT (classify + detail)
```text
You extract event details from an Instagram post by a Concordia JMSB student club.

Club: {club}
Posted on: {posted_at}
Caption:
"""
{caption}
"""
{image_line}

{task}

Events from this club already on our site (upcoming):
{existing}
Clubs often post several times about the SAME event (first announcement, sponsor reveal,
speaker reveal, last call...). If this post is about one of the events above (look for the
same or a similar title and the same date), set "same_as_event_id" to that event's number.
Otherwise set it to null.

Recurring series this club already has: {series}
Recurring series: ONLY tag a series when the post itself explicitly says so, in the caption
OR written in the image(s). Examples of explicit wording: "weekly series", "Academic Series",
"every Wednesday", "Week 7 of our ...", "biweekly workshop". Check both the caption and the
image text. Never infer a series from patterns (same room, same time, similar titles, past
events); if the post doesn't say it, set "series_name" to null.
If it does, set "series_name" to the series name (reuse the exact name above if it is one of
those) and "series_cadence" to the cadence the post states (weekly / biweekly / monthly),
else "not shown".

Reply with ONLY one JSON object, no prose, no code fences, with exactly these keys:
{{
  "post_type": "event" or "team_roster" or "recruitment" or "other",
  "is_event": true or false,
  "same_as_event_id": number or null,
  "series_name": string or null,
  "series_cadence": string,
  "event_name": string,
  "event_type": string, // exactly one of: seminar, workshop, speaker-series, career-event, club-recruiting, networking, competition, social-community, other
  "date_time": string,   // ISO 8601 like "2026-11-20T18:00" (date only "2026-11-20" if no time). Use the post date to infer the year.
  "location": string,
  "description": string, // one or two plain sentences
  "firms": string,       // every company involved or sponsoring, comma-separated. Read company LOGOS in the images too (sponsor reveals often only show logos).
  "guest_speakers": string // names (and titles if shown), comma-separated
}}
Use the exact string "not shown" for anything the caption and images don't state. Do not guess.
"post_type" is "event" when is_event is true, "team_roster" for a team-lineup post, "recruitment"
for a call to join the club (see below), else "other". If is_event is false, set every other field to "not shown".
```

## CLASSIFY_TASK
```text
Decide whether this post is RELEVANT: it announces something upcoming that students
can attend or sign up for: an event (talk, workshop, case competition, networking night,
social, info session, conference, etc.) or a registration / application announcement
(sign-ups opening, a deadline, tickets on sale). For a registration announcement, use the
event's date if shown, otherwise the deadline, as date_time.
NOT relevant (is_event=false): recaps or photos of past events, thank-you posts, giveaways,
generic promos and member spotlights.

Separately, set post_type to "recruitment" (and is_event=false) if the post invites students to
APPLY TO JOIN THE CLUB ITSELF: hiring for its executive team (VPs, directors, president,
organizing committee) or for one of its member programs, whatever the club calls it (analysts,
senior analysts, delegates, first-year representatives, ambassadors, brand ambassadors,
mentees, project managers, volunteers, models, tutors...). Applications opening, a deadline,
a deadline extension or a "last call" all count.
NOT recruitment: applications to an event or competition run by the club for outside
participants (e.g. "register your team for our case competition"), job or internship offers
from companies, and info sessions/mixers about recruitment (those are events).

Separately, set post_type to "team_roster" (and is_event=false) if the post PRESENTS the club's
own team: names of current or incoming executives/members with their roles, e.g. "Meet the team",
"Meet our 2026-2027 executive team", "Introducing our VPs", one slide per member or a group
grid with names and titles. One-member spotlights that give the person's name and role count too.
NOT a team roster: hiring calls ("we're hiring", "apply to join our team": those are
"recruitment"), guest speakers, event hosts, sponsors, or alumni.
```

## DETAIL_TASK
```text
This post was already identified as announcing an upcoming event or registration.
Set is_event to true. You now have ALL slides of the carousel; read every one and fill in
the fields as completely and accurately as you can.
```

## ROSTER_PROMPT
```text
This Instagram post by the Concordia JMSB student club {club} presents the club's team.
Posted on: {posted_at}
Caption:
"""
{caption}
"""
{image_line}

Read the caption AND every image (in slide order) and list every team member shown, with their
role exactly as written (e.g. "President", "VP Finance", "Director of Marketing").
Rules:
- Only names actually written in the caption or images. Never guess, complete or correct a name.
- If a name is visible but its role isn't, use "not shown" as the role.
- "slide" is the image number the name was read from (1 = first image), or null if from the caption only.
- List in "unreadable_slides" every image number you could not read reliably (blurry, cut off,
  text too small, only a photo of the person with no name).
- "school_year": the school year if the post states it (format "2026-2027"), else "not shown".

Reply with ONLY one JSON object, no prose, no code fences:
{{
  "school_year": string,
  "members": [{{"name": string, "role": string, "slide": number or null}}],
  "unreadable_slides": [number]
}}
```

## RECRUIT_PROMPT
```text
This Instagram post by the Concordia JMSB student club {club} invites students to apply
to join the club.
Posted on: {posted_at}
Caption:
"""
{caption}
"""
{image_line}

Recruitment tracks this club already has on our site: {existing}

Read the caption AND every image, and list each recruitment track the post announces. A post
can announce several (e.g. executive roles AND first-year representatives).
For each track:
- "track": "executive" for the club's executive/organizing team (president, VPs, directors,
  AVPs, coordinators of the team itself); "participant" for member programs (analysts,
  delegates, first-year representatives, ambassadors, mentees, volunteers...).
- "track_name": the club's own name for it, e.g. "Executive Team", "Analyst Program",
  "Delegates", "First-Year Representative", "REIMI Analyst". If it is the same track as one
  listed above, reuse that exact name.
- "roles": the positions listed, comma-separated (e.g. "VP Finance, VP Marketing"), else "not shown".
- "opens_at" / "closes_at": ISO dates ("2026-09-15", or "2026-09-15T23:59" if a time is given).
  Use the post date to infer the year. If the post says applications are open now and gives
  no opening date, use the post date for "opens_at".
- "how_to_apply": the link or instruction exactly as given (e.g. "link in bio", a URL, "DM us").
- "eligibility": who can apply, as written (e.g. "first-year JMSB students").
- "school_year": the school year the positions are for if the post states it ("2026-2027").
- "details": one or two plain sentences (selection steps like interviews or a case, info session).
Use the exact string "not shown" for anything the post doesn't state. Do not guess.

Reply with ONLY one JSON object, no prose, no code fences:
{{
  "tracks": [{{"track": string, "track_name": string, "roles": string, "opens_at": string,
              "closes_at": string, "how_to_apply": string, "eligibility": string,
              "school_year": string, "details": string}}]
}}
```

## Gotchas (add to this list after every run)

### Run 1: last 10 posts per club (2026-11-18)
- **Images unreachable from the cloud.** Flyers were read in Claude's browser on Louis's PC. The API version must download images on the PC.
- **Instagram image links expire after about 3-4 days.** Never store Instagram links for the site; save a copy (`assets/events/<post code>.jpg`, done by the updater since PR #10).
- **Commas inside parentheses.** "Name (Title, Company)" was split into two speakers. Fixed in `merge_list` (regex split).
- **Deadline extended after the original date.** The extension post was matched against upcoming events only, so it created a duplicate. Recently passed events must also be offered as `existing` candidates.
- **Teaser posted before the announcement.** Match on the event name, whichever post comes first.
- **Collab posts show up in two clubs' feeds.** Keep the post once, under the club that owns it (`ownerUsername`).
- **Flyers with no date.** 2 events (CREC "From Site to Skyline", Enactus "ID8: Golden Minds") have none. Keep "not shown", never guess.
- **Logo-only sponsor slides and small panelist text.** Some slides were not read reliably. Read logos as firms; list unreadable slides.
- **Series (Louis checked, 2026-11-18).** FISA "Academic Series" tagged weekly because the flyer says "weekly". Tag only when the post says it.
- **Drop rule (Louis's decision, 2026-11-17).** Recaps, thank-yous, giveaways, generic promos and company job offers are dropped. Louis questioned it on 2026-11-18 and can change it.
- **Video posts.** Only the thumbnail is visible.

### Run 2: posts since 2026-11-18 (2026-11-24)
- **One post, several dated activities.** CASA Wellness Week listed 3 days (Nov 24, 25, 26). The pipeline stores one event per post, so it became one event with every day in the description. Decide whether the API should return a list of events.
- **Relative dates.** "100 days until JMUCC" has no written date. Dropped: never compute a date from a relative phrase.
- **Course applications are not club recruitment.** JMCC's COMM 299 elective applications were kept as a registration event with the deadline as date (like JIC's Project Global applications).
- **Non-club co-author.** A recap by @cmpconcordia appeared in MCC's feed. Attribute to the feed's club, or drop if not relevant.
- **Updates restating the location in other words.** "Maison de l'Arbre Frédéric-Back, 4500 Boul. Rosemont" vs the stored "Montreal Botanical Garden, Maison de l'Arbre Frédéric-Back". The updater overwrites the location whenever the text differs. Prompt should return "not shown" when the location is the same place.
- **Partial roster posts.** JIC introduced 2 people by first name only, then posted the full team 3 days later. First names only should not be saved as members.
- **Full lineup replaces the old one.** Enactus and JIC posted full 2026-2027 lineups that no longer include Angelina Pham and Jillian Rose Morneau. `save_roster` only adds, never removes, so they were removed by hand in `assets/data/teams.json`. A rebuilt database will bring them back until the updater supports "full lineup replaces".
- **Name spelling differs between posts.** "Diem Mai Nyugen" (new caption) vs "Nguyen" (older post); "Françoise" vs "Francoise". Kept the existing spelling to avoid duplicate people. Match names accent- and typo-tolerantly.
- **Conflicting roles.** JMCC's Regionals post lists Nwe Forjet as SMNG Coordinator; the stored roster has Nwe Forjet as Co-President and Derek Rodriguez as SMNG Coordinator. Left unchanged, needs Louis to confirm.
- **Group photos with no names.** JMCC exec photo: no roster.
- **Hand-added roster fields.** FISA member photos and LinkedIn links were added by hand to `teams.json`; `export_teams` used to rewrite the file from the database and would have erased them. It now keeps extra member fields.
- **Empty Apify rows.** Clubs with no new posts return an empty row. Ignored.

## Corrections by Louis
- 2026-11-17: drop rule above; past events kept 4 months; series only when explicit.
- 2026-11-18: confirmed the FISA Academic Series weekly tag; asked for event images (flyers now saved and shown).
