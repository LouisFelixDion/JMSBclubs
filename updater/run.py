"""Daily updater: Instagram -> Claude -> SQLite -> events.json -> GitHub.

Run from the repo folder:
    py updater/run.py                      # real run: scrape, extract, save, export, push
    py updater/run.py --no-push            # same, but don't commit/push
    py updater/run.py --from-file tests/fixtures/sample_posts.json --no-push   # offline test, no Apify
    py updater/run.py --clubs casajmsb,jmmaonline --per-account 2              # small real test
See docs/updater.md.
"""
import argparse
import json
import os
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import FIELDS, extract_event  # noqa: E402
from scrape import fetch_posts  # noqa: E402

DB_PATH = ROOT / "db" / "events.db"
SCHEMA = ROOT / "db" / "schema.sql"
CLUBS = ROOT / "clubs.json"
EXPORT = ROOT / "events.json"
CACHE = ROOT / "updater" / ".cache"


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_env():
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def open_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    for c in json.loads(CLUBS.read_text(encoding="utf-8")):
        conn.execute("INSERT OR IGNORE INTO clubs (name, ig_handle) VALUES (?, ?)",
                     (c["name"], c["ig_handle"].lower()))
    conn.commit()
    return conn


def download_image(url, name):
    if not url:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.jpg"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            path.write_bytes(r.read())
        return path
    except Exception as e:  # image is a bonus; caption alone still works
        print(f"    (image download failed: {e})")
        return None


def process(conn, posts):
    clubs = {h: (cid, name) for cid, name, h in conn.execute("SELECT id, name, ig_handle FROM clubs")}
    added = skipped = errors = 0
    for p in posts:
        if p["owner"] not in clubs:
            continue
        if conn.execute("SELECT 1 FROM processed_posts WHERE post_url=?", (p["url"],)).fetchone():
            skipped += 1
            continue
        club_id, club_name = clubs[p["owner"]]
        print(f"- {club_name}: {p['url']}")
        slug = p["url"].rstrip("/").rsplit("/", 1)[-1]
        image = download_image(p.get("image_url"), slug)
        try:
            ev = extract_event(p["caption"], club_name, p["posted_at"], image)
        except Exception as e:
            print(f"    ERROR: {e}")  # not marked processed, so it retries next run
            errors += 1
            continue
        finally:
            if image and image.exists():
                image.unlink()
        if ev["is_event"]:
            conn.execute(
                f"INSERT OR IGNORE INTO events ({', '.join(FIELDS)}, post_url, club_id, scraped_at) "
                f"VALUES ({', '.join('?' * len(FIELDS))}, ?, ?, ?)",
                [ev[f] for f in FIELDS] + [p["url"], club_id, now()],
            )
            added += 1
            print(f"    event: {ev['event_name']} @ {ev['date_time']}")
        else:
            print("    not an event")
        conn.execute("INSERT INTO processed_posts VALUES (?, ?, ?)", (p["url"], int(ev["is_event"]), now()))
        conn.commit()
    return added, skipped, errors


def export(conn):
    rows = conn.execute(
        f"SELECT {', '.join('e.' + f for f in FIELDS)}, e.post_url, c.name, c.ig_handle "
        "FROM events e JOIN clubs c ON c.id = e.club_id ORDER BY e.date_time"
    ).fetchall()
    keys = FIELDS + ["post_url", "club", "ig_handle"]
    data = {"updated_at": now(), "events": [dict(zip(keys, r)) for r in rows]}
    EXPORT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(rows)


def git_publish():
    def git(*args):
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    git("add", "events.json")
    if git("diff", "--cached", "--quiet").returncode == 0:
        print("events.json unchanged, nothing to push.")
        return
    git("commit", "-m", f"Update events ({datetime.now():%Y-%m-%d})")
    r = git("push")
    print("Pushed to GitHub." if r.returncode == 0 else f"Push failed: {r.stderr.strip()}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-file", help="read posts from a JSON file instead of Apify (offline test)")
    ap.add_argument("--clubs", help="comma-separated IG handles to limit the run")
    ap.add_argument("--per-account", type=int, default=5, help="max posts per account (default 5)")
    ap.add_argument("--newer-than", default="7 days", help='only posts newer than this (default "7 days")')
    ap.add_argument("--no-push", action="store_true", help="don't git commit/push events.json")
    args = ap.parse_args()

    load_env()
    conn = open_db()
    handles = [h for (h,) in conn.execute("SELECT ig_handle FROM clubs")]
    if args.clubs:
        wanted = {h.strip().lower() for h in args.clubs.split(",")}
        handles = [h for h in handles if h in wanted]

    if args.from_file:
        posts = json.loads(Path(args.from_file).read_text(encoding="utf-8"))
    else:
        token = os.environ.get("APIFY_TOKEN")
        if not token or token.startswith("paste_"):
            sys.exit("APIFY_TOKEN missing. Copy .env.example to .env and add your token.")
        print(f"Scraping {len(handles)} accounts on Apify...")
        posts = fetch_posts(token, handles, args.per_account, args.newer_than)
    posts = [p for p in posts if p.get("owner", "").lower() in handles]
    print(f"{len(posts)} posts to check.")

    added, skipped, errors = process(conn, posts)
    total = export(conn)
    print(f"Done: {added} new events, {skipped} already seen, {errors} errors. events.json has {total} events.")
    if not args.no_push:
        git_publish()


if __name__ == "__main__":
    main()
