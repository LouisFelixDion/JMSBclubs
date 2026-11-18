"""One-time: download the flyers of the events already in events.json (initial data, Nov 18).

Run on Louis's PC (the cloud can't reach Instagram's image servers), from the repo folder:
    py updater/fetch_event_images.py

Reads updater/backfill/event_image_urls.json (post code -> Instagram image link, taken from the
Apify datasets we already had, so no new scrape and no Apify credit), saves each flyer to
assets/events/<post code>.jpg, then adds "image_url" to the matching events in events.json.
Instagram links expire around Nov 21-22, 2026; after that this script can't download them.
New events get their flyer automatically from updater/run.py.
"""
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run import EXPORT, EVENT_IMAGES, ROOT, flyer_path, save_flyer  # noqa: E402

URLS = ROOT / "updater" / "backfill" / "event_image_urls.json"


def main():
    urls = json.loads(URLS.read_text(encoding="utf-8"))["images"]
    ok = failed = 0
    for code, url in urls.items():
        if (EVENT_IMAGES / f"{code}.jpg").exists():
            ok += 1
            continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                save_flyer(r.read(), code)
            ok += 1
        except Exception as e:
            print(f"  {code}: download failed ({e})")
            failed += 1
    data = json.loads(EXPORT.read_text(encoding="utf-8"))
    for e in data["events"]:
        e["image_url"] = flyer_path(e.get("post_url"))
    EXPORT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{ok} flyers saved in assets/events/, {failed} failed. events.json updated.")


if __name__ == "__main__":
    main()
