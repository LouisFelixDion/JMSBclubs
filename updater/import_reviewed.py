"""Load hand-reviewed extraction results (updater/backfill/initial_scrape_*.json) into the
local database and events.json, through the same logic as the daily updater
(matching, firm merging, change log, series, recap safety net).

    py updater/import_reviewed.py updater/backfill/initial_scrape_fisajmsb.json [more files...]

Safe to re-run: posts already processed are skipped. See docs/updater.md.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run  # noqa: E402

NOT_EVENT = {"is_event": False, "same_as_event_id": None, "series_name": None, "series_cadence": "not shown",
             **{f: "not shown" for f in run.FIELDS}}


def main(paths):
    conn = run.open_db()
    posts, answers = [], {}
    for path in paths:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        for p in data["posts"]:
            posts.append({"url": p["url"], "owner": p.get("club") or data["club"], "caption": "", "image_url": None,
                          "extra_image_urls": [], "posted_at": p["posted_at"]})
            answers[p["url"]] = p

    def reviewed_answer(caption, club, posted_at, image, slides, existing="", series=""):
        p = answers[current["url"]]
        if p["decision"] not in ("event", "update"):  # dropped, recruitment, team_roster
            return dict(NOT_EVENT)
        ev = {"is_event": True, "same_as_event_id": None,
              "series_name": p.get("series_name"), "series_cadence": p.get("series_cadence", "not shown"),
              **p["event"]}
        # Same event = an existing event of this club with the reviewed name (works whichever
        # post about it comes first, e.g. a teaser posted before the announcement).
        name = p.get("same_as") or p["event"]["event_name"]
        for line in existing.splitlines():
            parts = line.split(" | ")
            if len(parts) > 1 and parts[1] == name:
                ev["same_as_event_id"] = int(parts[0].lstrip("#"))
        return ev

    def upcoming_or_named(conn_, club_id, posted_at):
        # Like the updater, offer the club's upcoming events; also offer the event the reviewer
        # named, even if its date has passed (e.g. a deadline that was extended afterwards).
        rows = original_upcoming(conn_, club_id, posted_at)
        name = answers[current["url"]].get("same_as") or (answers[current["url"]].get("event") or {}).get("event_name")
        if name and name not in {r[1] for r in rows}:
            rows += conn_.execute(f"SELECT id, {', '.join(run.FIELDS)} FROM events WHERE club_id=? AND event_name=?",
                                  (club_id, name)).fetchall()
        return rows

    current = {}
    original, original_upcoming = run.extract_event, run.upcoming_events
    run.extract_event, run.upcoming_events = reviewed_answer, upcoming_or_named
    posts.sort(key=lambda p: p["posted_at"])
    try:
        for p in posts:
            current["url"] = p["url"]
            run.process(conn, [p])
    finally:
        run.extract_event, run.upcoming_events = original, original_upcoming
    total = run.export(conn)
    print(f"events.json has {total} events.")


if __name__ == "__main__":
    main(sys.argv[1:])
