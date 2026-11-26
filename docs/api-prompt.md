# Claude API prompts

What the daily cloud job sends to the Claude API for each new Instagram post, and the rules those prompts must follow.
Pipeline overview: `docs/architecture.md`. Code: `updater/extract.py` (keep both in sync).
Every scrape run adds what it learned to **Rules learned from real posts** at the end (Louis, 2026-11-24).

## Calls per post
1. **Classify:** `PROMPT` with `{task}` = `CLASSIFY_TASK`. Input: caption + first image.
2. **Detail** (events with more than one slide): `PROMPT` with `{task}` = `DETAIL_TASK`. Input: caption + every slide.
3. **Roster** (`post_type` = `team_roster`): `ROSTER_PROMPT` with every slide.
4. **Recruitment** (`post_type` = `recruitment`): `RECRUIT_PROMPT` with every slide.

Images are sent as image content blocks (base64 JPEG), in slide order, in the same message as the prompt.
`{image_line}` = "Image(s) from the post are attached, in slide order." (or "No image available.").
The reply must be one JSON object (schema in each prompt). Unknown values = the exact string `"not shown"`.

Placeholders: `{club}` club name; `{posted_at}` post time (UTC); `{caption}`; `{existing}` = the club's upcoming and
recently passed events, one per line `#<id> | <event_name> | <date_time> | ...`; `{series}` = the club's known series.

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

## Rules learned from real posts
Each rule must be covered by the prompt or the pipeline code. Source run in brackets.

### Classifying posts
- Drop recaps, thank-yous, giveaways, generic promos and company job offers. (Louis's decision 2026-11-17, can change)
- A post whose event date is before the post date is a recap: drop it. (rule 2026-11-17)
- Never compute a date from a relative phrase ("100 days until JMUCC"). No written date = "not shown". [run 2]
- Applications to a course or program run by a club (e.g. JMCC's COMM 299) are not club recruitment: treat as a registration event with the deadline as `date_time`. [run 2]
- A post can list several dated activities (CASA Wellness Week: Tue, Wed, Thu). The current schema stores one event per post, with every day in the description. Decide if the API should return a list of events instead. [run 2]
- Video posts: only the cover image is available. [run 1]
- A post marked "CANCELLED" is not an event: drop it, or if the event already exists, flag it as cancelled (no cancelled status in the schema yet). [run 3]
- A competition with several stages (qualifier online, campus final, world final) is one event per post, dated at its first stage, with the other stages in the description. Same open question as Wellness Week (list of events?). [run 3]
- A carousel of sessions with different dates (JMAS Finals Tutorials: 4 courses, 3 dates): one event dated at the first session, every session in the description. [run 4]
- A new club's first scrape includes old posts: keep past events (the site hides them after 4 months), drop research/analysis and club-intro posts. [run 3]

### Matching posts to existing events
- Clubs post several times about the same event (announcement, sponsor reveal, speakers, last call): update, never duplicate. [run 1]
- A teaser can come before the announcement: match on the event name, whichever comes first. [run 1]
- A deadline extension can come after the original date: `{existing}` must include recently passed events too. [run 1]
- When an update states the same place in other words, return "not shown" for `location` so the stored one is kept. Only a real change of place overwrites. [run 2]

### Reading fields
- Speakers like "Name (Title, Company)": commas inside parentheses do not split items. [run 1]
- Sponsor slides often show only logos: read logos as `firms`. [run 1]
- Some flyers never give a date (CREC "From Site to Skyline", Enactus "ID8"): keep "not shown". [run 1]
- Series only when the post says so (FISA "Academic Series", flyer says "weekly"; confirmed by Louis 2026-11-18). [run 1]

### Ownership
- Collab posts appear in several clubs' feeds: keep the post once, under the club that owns it (`ownerUsername`). [run 1]
- A non-club co-author (e.g. @cmpconcordia with MCC) counts for the club whose feed it came from. [run 2]

### Team rosters
- Group photos with no written names: no roster. [run 2]
- Posts naming people by first name only: do not save them as members. [run 2]
- A full lineup post for a school year replaces that year's roster: people no longer listed are removed (Enactus, JIC). The code (`save_roster`) still only adds; it must support this. [run 2]
- Names can be spelled differently between posts ("Nguyen" / "Nyugen", "Francoise" / "Françoise"): match accent- and typo-tolerantly to the existing member, keep the existing spelling. [run 2]
- Conflicting roles across posts must be flagged for review, not silently overwritten (JMCC: Nwe Forjet, open question to Louis). [run 2]
- Fields added by hand to members (FISA photos, LinkedIn) must survive every export. [run 2]
- "Meet the team" can be split into several posts the same day, one per department (JMMA: 6 posts). Each one adds to the roster; none of them is a full lineup, so none removes members. [run 3]
- Same role in other words ("EVP" / "Executive Vice President"): keep the existing wording, no role change. [run 3]
- A newer post can name someone else in a role (JMMA Speaker Relations: Melinda Polito, was Maya Lux Mehra): flag for review, don't drop the old member silently. [run 3]

## Runs
- Run 1, 2026-11-18: last 10 posts per club, 201 posts, 61 events.
- Run 2, 2026-11-24: posts since Nov 18, 34 posts: 5 new events, 6 updates, 3 roster updates, 11 dropped.
- Run 3, 2026-11-25: per-club cursors + QUARCC first 10 posts, 23 posts: 8 new events, 4 updates (CREC panels), JMMA roster (6 posts), 7 dropped.
- Run 4, 2026-11-26: refresh, 6 posts: 1 new event, 1 update, 4 dropped (pinned old posts, podcast, results recap).
