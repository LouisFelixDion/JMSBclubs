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
            posts.append({"url": p["url"], "owner": data["club"], "caption": "", "image_url": None,
                          "extra_image_urls": [], "posted_at": p["posted_at"]})
            answers[p["url"]] = p

    def reviewed_answer(caption, club, posted_at, image, slides, existing="", series=""):
        p = answers[current["url"]]
        if p["decision"] == "dropped":
            return dict(NOT_EVENT)
        ev = {"is_event": True, "same_as_event_id": None,
              "series_name": p.get("series_name"), "series_cadence": p.get("series_cadence", "not shown"),
              **p["event"]}
        if p.get("same_as"):  # find the event by name among the club's upcoming events
            for line in existing.splitlines():
                num, name = line.split(" | ")[:2]
                if name == p["same_as"]:
                    ev["same_as_event_id"] = int(num.lstrip("#"))
        return ev

    current = {}
    original = run.extract_event
    run.extract_event = reviewed_answer
    posts.sort(key=lambda p: p["posted_at"])
    try:
        for p in posts:
            current["url"] = p["url"]
            run.process(conn, [p])
    finally:
        run.extract_event = original
    total = run.export(conn)
    print(f"events.json has {total} events.")


if __name__ == "__main__":
    main(sys.argv[1:])
