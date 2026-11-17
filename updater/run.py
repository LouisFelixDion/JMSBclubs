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


def happened_before_post(event_dt, posted_at):
    """Safety net against recaps: True if the event's date is earlier than the post's date."""
    ev_day, post_day = event_dt[:10], (posted_at or "")[:10]
    try:
        return datetime.fromisoformat(ev_day) < datetime.fromisoformat(post_day)
    except ValueError:  # 'not shown' or unparseable: trust Claude's call
        return False


def upcoming_events(conn, club_id, posted_at):
    """The club's events that hadn't happened yet when this post went up."""
    day = (posted_at or "")[:10] or "0000"
    return conn.execute(
        f"SELECT id, {', '.join(FIELDS)} FROM events WHERE club_id=? "
        "AND (date_time='not shown' OR substr(date_time,1,10) >= ?) ORDER BY date_time",
        (club_id, day),
    ).fetchall()


def describe(rows):
    return "\n".join(
        f"#{r[0]} | {r[1]} | {r[2]} | {r[3]} | firms: {r[5]} | speakers: {r[6]}" for r in rows
    ) or "(none)"


def merge_list(old, new):
    """Union of two comma-separated lists, keeping order, ignoring case and 'not shown'."""
    items, seen = [], set()
    for part in f"{old},{new}".split(","):
        part = part.strip()
        if part and part.lower() != "not shown" and part.lower() not in seen:
            seen.add(part.lower())
            items.append(part)
    return ", ".join(items) or "not shown"


def update_event(conn, event_id, ev):
    """Enrich an existing event with a newer post about it. Returns a list of change notes."""
    cols = ["id"] + FIELDS
    old = dict(zip(cols, conn.execute(f"SELECT {', '.join(cols)} FROM events WHERE id=?", (event_id,)).fetchone()))
    new, notes = dict(old), []
    for f in ("firms", "guest_speakers"):          # add, never remove
        new[f] = merge_list(old[f], ev[f])
    for f in ("date_time", "location"):            # newer post wins if it states a different value
        if ev[f] != "not shown" and ev[f] != old[f]:
            new[f] = ev[f]
    for f in ("event_name", "description"):        # keep the original, only fill blanks
        if old[f] == "not shown":
            new[f] = ev[f]
    for f in FIELDS:
        if new[f] != old[f]:
            notes.append(f"{f}: {old[f]!r} -> {new[f]!r}")
    if notes:
        conn.execute(f"UPDATE events SET {', '.join(f + '=?' for f in FIELDS)} WHERE id=?",
                     [new[f] for f in FIELDS] + [event_id])
    return notes


def process(conn, posts):
    clubs = {h: (cid, name) for cid, name, h in conn.execute("SELECT id, name, ig_handle FROM clubs")}
    added = updated = skipped = errors = 0
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
        extras = []
        try:
            def slides():
                # Called only after the post is classified as relevant (saves downloads + Claude time).
                for n, u in enumerate(p.get("extra_image_urls") or [], start=2):
                    path = download_image(u, f"{slug}_{n}")
                    if path:
                        extras.append(path)
                return extras
            candidates = upcoming_events(conn, club_id, p["posted_at"])
            ev = extract_event(p["caption"], club_name, p["posted_at"], image, slides,
                               existing=describe(candidates))
        except Exception as e:
            print(f"    ERROR: {e}")  # not marked processed, so it retries next run
            errors += 1
            continue
        finally:
            for f in [image, *extras]:
                if f and f.exists():
                    f.unlink()
        if ev["is_event"] and happened_before_post(ev["date_time"], p["posted_at"]):
            print(f"    dropped: event date {ev['date_time']} is before the post date (recap)")
            ev["is_event"] = False
        if ev["is_event"]:
            match = ev.get("same_as_event_id")
            if match in {r[0] for r in candidates}:
                notes = update_event(conn, match, ev)
                role = "update"
                updated += 1
                print(f"    same event as #{match}: " + ("; ".join(notes) if notes else "nothing new"))
            else:
                cur = conn.execute(
                    f"INSERT INTO events ({', '.join(FIELDS)}, post_url, club_id, scraped_at) "
                    f"VALUES ({', '.join('?' * len(FIELDS))}, ?, ?, ?)",
                    [ev[f] for f in FIELDS] + [p["url"], club_id, now()],
                )
                match, role = cur.lastrowid, "created"
                added += 1
                print(f"    new event #{match}: {ev['event_name']} @ {ev['date_time']}")
            conn.execute("INSERT OR IGNORE INTO event_sources VALUES (?, ?, ?, ?, ?)",
                         (match, p["url"], role, p["posted_at"], now()))
        else:
            print("    not an event")
        conn.execute("INSERT INTO processed_posts VALUES (?, ?, ?)", (p["url"], int(ev["is_event"]), now()))
        conn.commit()
    return added, updated, skipped, errors


def export(conn):
    rows = conn.execute(
        f"SELECT e.id, {', '.join('e.' + f for f in FIELDS)}, e.post_url, c.name, c.ig_handle "
        "FROM events e JOIN clubs c ON c.id = e.club_id ORDER BY e.date_time"
    ).fetchall()
    keys = ["id"] + FIELDS + ["post_url", "club", "ig_handle"]
    events = []
    for r in rows:
        e = dict(zip(keys, r))
        e["sources"] = [
            {"post_url": u, "role": role, "posted_at": at}
            for u, role, at in conn.execute(
                "SELECT post_url, role, posted_at FROM event_sources WHERE event_id=? ORDER BY posted_at", (e["id"],))
        ]
        events.append(e)
    data = {"updated_at": now(), "events": events}
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
    posts.sort(key=lambda p: p.get("posted_at") or "")  # oldest first, so follow-up posts update the original
    print(f"{len(posts)} posts to check.")

    added, updated, skipped, errors = process(conn, posts)
    total = export(conn)
    print(f"Done: {added} new events, {updated} updated, {skipped} already seen, {errors} errors. events.json has {total} events.")
    if not args.no_push:
        git_publish()


if __name__ == "__main__":
    main()
