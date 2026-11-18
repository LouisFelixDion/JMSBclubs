"""Turn one Instagram post into event fields using Claude.

This is the ONLY place that talks to Claude. Right now it shells out to the
Claude Code CLI (`claude -p`), which runs on Louis's Claude subscription.
To switch to the Anthropic API later, rewrite `ask_claude()` only; the rest
of the updater just calls `extract_event()`.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

FIELDS = ["event_name", "event_type", "date_time", "location", "description", "firms", "guest_speakers"]

PROMPT = """You extract event details from an Instagram post by a Concordia JMSB student club.

Club: {club}
Posted on: {posted_at}
Caption:
\"\"\"
{caption}
\"\"\"
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
  "post_type": "event" or "team_roster" or "other",
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
"post_type" is "event" when is_event is true, "team_roster" for a team-lineup post (see below),
else "other". If is_event is false, set every other field to "not shown"."""

CLASSIFY_TASK = """Decide whether this post is RELEVANT: it announces something upcoming that students
can attend or sign up for: an event (talk, workshop, case competition, networking night,
social, info session, conference, etc.) or a registration / application announcement
(sign-ups opening, a deadline, tickets on sale). For a registration announcement, use the
event's date if shown, otherwise the deadline, as date_time.
NOT relevant (is_event=false): recaps or photos of past events, thank-you posts, giveaways,
generic promos, member spotlights, and hiring calls for the club's own executive team.

Separately, set post_type to "team_roster" (and is_event=false) if the post PRESENTS the club's
own team: names of current or incoming executives/members with their roles, e.g. "Meet the team",
"Meet our 2026-2027 executive team", "Introducing our VPs", one slide per member or a group
grid with names and titles. One-member spotlights that give the person's name and role count too.
NOT a team roster: hiring calls ("we're hiring", "apply to join our team"), guest speakers,
event hosts, sponsors, or alumni."""

DETAIL_TASK = """This post was already identified as announcing an upcoming event or registration.
Set is_event to true. You now have ALL slides of the carousel; read every one and fill in
the fields as completely and accurately as you can."""


ROSTER_PROMPT = """This Instagram post by the Concordia JMSB student club {club} presents the club's team.
Posted on: {posted_at}
Caption:
\"\"\"
{caption}
\"\"\"
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
}}"""


def extract_roster(caption, club, posted_at, images):
    """Read every member's name + role from a team-roster post. Returns
    {"school_year", "members": [{"name","role","slide"}], "unreadable_slides": [int]}."""
    images = [str(Path(i).resolve()) for i in images if i]
    prompt = ROSTER_PROMPT.format(club=club, posted_at=posted_at or "unknown",
                                  caption=caption or "(no caption)", image_line=image_listing(images))
    data = parse_json(ask_claude(prompt, workdir=Path(images[0]).parent if images else None))
    members, seen = [], set()
    for m in data.get("members") or []:
        name = str(m.get("name") or "").strip()
        if not name or name.lower() == "not shown" or name.lower() in seen:
            continue
        seen.add(name.lower())
        role = str(m.get("role") or "").strip() or "not shown"
        try:
            slide = int(m.get("slide")) if m.get("slide") is not None else None
        except (TypeError, ValueError):
            slide = None
        members.append({"name": name, "role": role, "slide": slide})
    unreadable = sorted({int(n) for n in data.get("unreadable_slides") or [] if str(n).isdigit()})
    year = str(data.get("school_year") or "").strip()
    return {"school_year": year if re.fullmatch(r"\d{4}-\d{4}", year) else "not shown",
            "members": members, "unreadable_slides": unreadable}


def extract_event(caption, club, posted_at, image_path=None, get_extra_images=None, existing="", series=""):
    """Return a dict with is_event, same_as_event_id + FIELDS. Missing values become 'not shown'.

    Stage 1: classify using the caption + first image only.
    Stage 2: only if relevant, call get_extra_images() (downloads the other carousel
    slides) and read every slide to fill in details. Irrelevant posts stop at stage 1.
    `existing` lists the club's upcoming events so Claude can say if this post is about one.
    """
    args = (caption, club, posted_at, existing or "(none)", series or "(none)")
    first = run_prompt(CLASSIFY_TASK, *args, [image_path] if image_path else [])
    if first["post_type"] == "team_roster":
        return first  # run.py reads the full roster with extract_roster()
    if not first["is_event"] or get_extra_images is None:
        return first
    extras = list(get_extra_images())
    if not extras:
        return first
    images = ([image_path] if image_path else []) + extras
    full = run_prompt(DETAIL_TASK, *args, images)
    # Keep stage-1 values wherever stage 2 came back empty.
    merged = {"is_event": True, "post_type": "event",
              "same_as_event_id": full["same_as_event_id"] or first["same_as_event_id"],
              "series_name": full["series_name"] or first["series_name"],
              "series_cadence": full["series_cadence"] if full["series_cadence"] != "not shown" else first["series_cadence"]}
    for f in FIELDS:
        merged[f] = full[f] if full[f] != "not shown" else first[f]
    return merged


def run_prompt(task, caption, club, posted_at, existing, series, images):
    images = [str(Path(i).resolve()) for i in images if i]
    prompt = PROMPT.format(club=club, posted_at=posted_at or "unknown",
                           caption=caption or "(no caption)", image_line=image_listing(images), task=task,
                           existing=existing, series=series)
    raw = ask_claude(prompt, workdir=Path(images[0]).parent if images else None)
    return clean(parse_json(raw))


def image_listing(images):
    if not images:
        return "No image available."
    listing = "\n".join(f"- {i}" for i in images)
    return f"Image(s) from the post, in slide order (read each file with your Read tool):\n{listing}"


def desktop_app_claude():
    """The Claude desktop app (Windows) ships its own Claude Code, in a folder that changes
    with each app update. Return the newest one, or None."""
    base = Path(os.environ.get("LOCALAPPDATA", "")) / "Claude-Data"
    found = sorted(base.glob("*/claude-code/*/*/claude.exe"), key=lambda p: p.stat().st_mtime)
    return str(found[-1]) if found else None


def ask_claude(prompt, workdir=None):
    """Send a prompt to Claude and return its text reply. Swap this for the API later."""
    exe = os.environ.get("CLAUDE_CMD") or shutil.which("claude") or desktop_app_claude()
    if not exe:
        raise RuntimeError("Claude Code CLI not found. Install it or set CLAUDE_CMD in .env.")
    cmd = [exe, "-p", "--output-format", "json", "--allowedTools", "Read"]
    if os.environ.get("CLAUDE_MODEL"):
        cmd += ["--model", os.environ["CLAUDE_MODEL"]]
    proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True,
                          encoding="utf-8", cwd=workdir, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(f"claude exited {proc.returncode}: {proc.stderr.strip()[:500]}")
    envelope = json.loads(proc.stdout)
    if envelope.get("is_error"):
        raise RuntimeError(f"claude error: {envelope.get('result')}")
    return envelope.get("result", "")


def parse_json(text):
    """Pull the first {...} object out of Claude's reply."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON in Claude reply: {text[:200]!r}")
    return json.loads(match.group(0))


def clean(data):
    out = {"is_event": bool(data.get("is_event"))}
    ptype = str(data.get("post_type") or "").strip().lower()
    if ptype == "team_roster":
        out["is_event"] = False
    out["post_type"] = "team_roster" if ptype == "team_roster" else ("event" if out["is_event"] else "other")
    try:
        out["same_as_event_id"] = int(data.get("same_as_event_id")) if out["is_event"] else None
    except (TypeError, ValueError):
        out["same_as_event_id"] = None
    name = str(data.get("series_name") or "").strip()
    out["series_name"] = name if out["is_event"] and name and name.lower() not in ("null", "not shown") else None
    out["series_cadence"] = str(data.get("series_cadence") or "").strip() or "not shown"
    for f in FIELDS:
        v = data.get(f)
        v = str(v).strip() if v not in (None, "") else ""
        out[f] = v or "not shown"
    return out
