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

FIELDS = ["event_name", "date_time", "location", "description", "firms", "guest_speakers"]

PROMPT = """You extract event details from an Instagram post by a Concordia JMSB student club.

Club: {club}
Posted on: {posted_at}
Caption:
\"\"\"
{caption}
\"\"\"
{image_line}

Decide whether this post announces a specific upcoming event (a talk, workshop, case
competition, networking night, social, info session, etc.). Recaps of past events,
giveaways, hiring calls and generic promos are NOT events.

Reply with ONLY one JSON object, no prose, no code fences, with exactly these keys:
{{
  "is_event": true or false,
  "event_name": string,
  "date_time": string,   // ISO 8601 like "2026-11-20T18:00" (date only "2026-11-20" if no time). Use the post date to infer the year.
  "location": string,
  "description": string, // one or two plain sentences
  "firms": string,       // companies involved, comma-separated
  "guest_speakers": string // names (and titles if shown), comma-separated
}}
Use the exact string "not shown" for anything the caption and flyer don't state. Do not guess.
If is_event is false, set every other field to "not shown"."""


def extract_event(caption, club, posted_at, image_path=None):
    """Return a dict with is_event + FIELDS. Missing values become 'not shown'."""
    image_line = (
        f"The flyer image is saved at: {image_path}\nRead that image file and use it too."
        if image_path else "No image available."
    )
    prompt = PROMPT.format(club=club, posted_at=posted_at or "unknown",
                           caption=caption or "(no caption)", image_line=image_line)
    raw = ask_claude(prompt, workdir=Path(image_path).parent if image_path else None)
    return clean(parse_json(raw))


def ask_claude(prompt, workdir=None):
    """Send a prompt to Claude and return its text reply. Swap this for the API later."""
    exe = os.environ.get("CLAUDE_CMD") or shutil.which("claude")
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
    for f in FIELDS:
        v = data.get(f)
        v = str(v).strip() if v not in (None, "") else ""
        out[f] = v or "not shown"
    return out
