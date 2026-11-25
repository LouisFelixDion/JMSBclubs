"""Daily updater: Instagram -> Claude -> SQLite -> events.json -> GitHub.

Run from the repo folder:
    py updater/run.py                      # real run: scrape, extract, save, export, push
    py updater/run.py --no-push            # same, but don't commit/push
    py updater/run.py --from-file tests/fixtures/sample_posts.json --no-push   # offline test, no Apify
    py updater/run.py --clubs casajmsb,jmmaonline --per-account 2              # small real test
See docs/updater.md.
"""
import argparse
import contextlib
import io
import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import FIELDS, RECRUIT_FIELDS, extract_event, extract_recruitment, extract_roster  # noqa: E402
from scrape import fetch_posts, fetch_since  # noqa: E402

DB_PATH = ROOT / "db" / "events.db"
SCHEMA = ROOT / "db" / "schema.sql"
CLUBS = ROOT / "clubs.json"
EXPORT = ROOT / "events.json"
TEAMS_EXPORT = ROOT / "assets" / "data" / "teams.json"  # under assets/ so Cloudflare publishes it
ROSTER_BACKFILL = ROOT / "updater" / "backfill" / "team_rosters_2026.json"
RECRUIT_EXPORT = ROOT / "assets" / "data" / "recruitment.json"
CACHE = ROOT / "updater" / ".cache"
LAST_POSTS = ROOT / "updater" / "state" / "last_posts.json"  # refresh cursor: most recent post scraped per club
EVENT_IMAGES = ROOT / "assets" / "events"  # flyer copies the site shows (Instagram links expire)


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
    # Older databases: add columns introduced after their creation.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(events)")}
    if "series_id" not in cols:
        conn.execute("ALTER TABLE events ADD COLUMN series_id INTEGER REFERENCES series(id)")
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


def save_flyer(data, code):
    """Keep a copy of an event's flyer at assets/events/<post code>.jpg for the site.
    Shrinks it to 800px wide when Pillow is installed; otherwise copies it as is."""
    EVENT_IMAGES.mkdir(parents=True, exist_ok=True)
    dest = EVENT_IMAGES / f"{code}.jpg"
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as im:
            im = im.convert("RGB")
            im.thumbnail((800, 800 * 2))
            im.save(dest, "JPEG", quality=80, optimize=True)
    except ImportError:
        dest.write_bytes(data)
    return dest


def flyer_path(post_url):
    """Site path of the saved flyer for this post, or None if there is none."""
    code = (post_url or "").rstrip("/").rsplit("/", 1)[-1]
    return f"assets/events/{code}.jpg" if code and (EVENT_IMAGES / f"{code}.jpg").exists() else None


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
    for part in re.split(r",(?![^()]*\))", f"{old},{new}"):  # ignore commas inside (...)
        part = part.strip()
        if part and part.lower() != "not shown" and part.lower() not in seen:
            seen.add(part.lower())
            items.append(part)
    return ", ".join(items) or "not shown"


def update_event(conn, event_id, ev, post_url):
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
            conn.execute("INSERT INTO event_changes (event_id, field, old_value, new_value, post_url, changed_at) "
                         "VALUES (?, ?, ?, ?, ?, ?)", (event_id, f, old[f], new[f], post_url, now()))
    if notes:
        conn.execute(f"UPDATE events SET {', '.join(f + '=?' for f in FIELDS)} WHERE id=?",
                     [new[f] for f in FIELDS] + [event_id])
    return notes


def club_series(conn, club_id):
    return [n for (n,) in conn.execute("SELECT name FROM series WHERE club_id=? ORDER BY name", (club_id,))]


def tag_series(conn, event_id, club_id, ev):
    """Link the event to its recurring series (created on first sight). Returns the series name or None."""
    name = ev.get("series_name")
    if not name:
        return None
    row = conn.execute("SELECT id, cadence FROM series WHERE club_id=? AND lower(name)=lower(?)",
                       (club_id, name)).fetchone()
    if row:
        series_id = row[0]
        if row[1] == "not shown" and ev["series_cadence"] != "not shown":
            conn.execute("UPDATE series SET cadence=? WHERE id=?", (ev["series_cadence"], series_id))
    else:
        series_id = conn.execute("INSERT INTO series (club_id, name, cadence, created_at) VALUES (?, ?, ?, ?)",
                                 (club_id, name, ev["series_cadence"], now())).lastrowid
        print(f"    new recurring series: {name} ({ev['series_cadence']})")
    conn.execute("UPDATE events SET series_id=? WHERE id=? AND series_id IS NULL", (series_id, event_id))
    return name


def school_year_of(posted_at):
    """School year a team post belongs to when the post doesn't say: posts from March on
    (after elections) are for the year starting that fall; Jan-Feb posts for the current one."""
    try:
        d = datetime.fromisoformat((posted_at or "")[:10])
    except ValueError:
        d = datetime.now()
    start = d.year if d.month >= 3 else d.year - 1
    return f"{start}-{start + 1}"


def save_roster(conn, club_id, post, roster):
    """Add a team-roster post's members to the club's roster for that school year.
    A roster for a newer school year becomes the active one; older ones stay as history.
    Returns (school_year, members added, members updated)."""
    year = roster["school_year"] if roster["school_year"] != "not shown" else school_year_of(post["posted_at"])
    row = conn.execute("SELECT id FROM team_rosters WHERE club_id=? AND school_year=?", (club_id, year)).fetchone()
    if row:
        roster_id = row[0]
    else:
        newer = conn.execute("SELECT 1 FROM team_rosters WHERE club_id=? AND school_year>?", (club_id, year)).fetchone()
        if not newer:
            conn.execute("UPDATE team_rosters SET is_active=0 WHERE club_id=?", (club_id,))
        roster_id = conn.execute(
            "INSERT INTO team_rosters (club_id, school_year, is_active, created_at) VALUES (?, ?, ?, ?)",
            (club_id, year, 0 if newer else 1, now())).lastrowid
    added = updated = 0
    for m in roster["members"]:
        old = conn.execute("SELECT id, role FROM team_members WHERE roster_id=? AND lower(name)=lower(?)",
                           (roster_id, m["name"])).fetchone()
        if not old:
            conn.execute("INSERT INTO team_members (roster_id, name, role, post_url, slide, added_at) "
                         "VALUES (?, ?, ?, ?, ?, ?)",
                         (roster_id, m["name"], m["role"], post["url"], m["slide"], now()))
            added += 1
        elif m["role"] != "not shown" and m["role"] != old[1]:  # newer post wins on the role
            conn.execute("UPDATE team_members SET role=?, post_url=?, slide=? WHERE id=?",
                         (m["role"], post["url"], m["slide"], old[0]))
            updated += 1
    conn.execute("INSERT OR IGNORE INTO roster_sources VALUES (?, ?, ?, ?, ?)",
                 (roster_id, post["url"], post["posted_at"],
                  ",".join(map(str, roster["unreadable_slides"])), now()))
    return year, added, updated


def club_tracks(conn, club_id):
    """The club's known recruitment tracks, so Claude reuses the same names."""
    rows = conn.execute("SELECT DISTINCT track, track_name FROM recruitments WHERE club_id=? ORDER BY track_name",
                        (club_id,)).fetchall()
    return ", ".join(f"{name} ({track})" for track, name in rows)


def save_recruitment(conn, club_id, post, tracks):
    """Save each track of a recruitment post. Same club + track name + school year = the same
    recruitment: blanks are filled, a newer post's dates/link win, and changes are logged.
    Returns a list of (track_name, school_year, 'new' | 'updated' | 'no change')."""
    results = []
    for t in tracks:
        if t["track_name"] == "not shown":
            continue
        year = t["school_year"] if t["school_year"] != "not shown" else school_year_of(post["posted_at"])
        row = conn.execute(
            f"SELECT id, {', '.join(RECRUIT_FIELDS)} FROM recruitments "
            "WHERE club_id=? AND lower(track_name)=lower(?) AND school_year=?",
            (club_id, t["track_name"], year)).fetchone()
        if not row:
            rid = conn.execute(
                f"INSERT INTO recruitments (club_id, track, track_name, school_year, {', '.join(RECRUIT_FIELDS)}, created_at) "
                f"VALUES (?, ?, ?, ?, {', '.join('?' * len(RECRUIT_FIELDS))}, ?)",
                [club_id, t["track"], t["track_name"], year] + [t[f] for f in RECRUIT_FIELDS] + [now()]).lastrowid
            role, status = "created", "new"
        else:
            rid, old = row[0], dict(zip(RECRUIT_FIELDS, row[1:]))
            changed = []
            for f in RECRUIT_FIELDS:
                new = t[f]
                if f == "roles":
                    new = merge_list(old[f], new)
                elif new == "not shown" or (f == "details" and old[f] != "not shown"):
                    new = old[f]  # keep what we had; details are only filled when blank
                if new != old[f]:
                    changed.append(f)
                    conn.execute("INSERT INTO recruitment_changes (recruitment_id, field, old_value, new_value, "
                                 "post_url, changed_at) VALUES (?, ?, ?, ?, ?, ?)",
                                 (rid, f, old[f], new, post["url"], now()))
                    conn.execute(f"UPDATE recruitments SET {f}=? WHERE id=?", (new, rid))
            role, status = "update", ("updated: " + ", ".join(changed) if changed else "no change")
        conn.execute("INSERT OR IGNORE INTO recruitment_sources VALUES (?, ?, ?, ?, ?)",
                     (rid, post["url"], role, post["posted_at"], now()))
        results.append((t["track_name"], year, status))
    return results


def import_rosters(conn, path):
    """Load backfilled rosters (see updater/backfill/) into the database. Safe to re-run."""
    clubs = {h: cid for cid, h in conn.execute("SELECT id, ig_handle FROM clubs")}
    for r in json.loads(Path(path).read_text(encoding="utf-8")):
        if r["ig_handle"] not in clubs:
            print(f"- skipped {r['ig_handle']}: not in clubs.json")
            continue
        post = {"url": r["post_url"], "posted_at": r["posted_at"]}
        year, n_new, n_upd = save_roster(conn, clubs[r["ig_handle"]], post, r)
        conn.execute("INSERT OR IGNORE INTO processed_posts VALUES (?, 0, ?)", (r["post_url"], now()))
        print(f"- {r['ig_handle']} {year}: {n_new} new members, {n_upd} role changes")
    conn.commit()


def process(conn, posts):
    clubs = {h: (cid, name) for cid, name, h in conn.execute("SELECT id, name, ig_handle FROM clubs")}
    added = updated = skipped = errors = rosters = recruits = 0
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
                               existing=describe(candidates),
                               series=", ".join(club_series(conn, club_id)))
            if ev["post_type"] == "team_roster":
                # Team lineup: read the caption and every slide, save names + roles.
                roster = extract_roster(p["caption"], club_name, p["posted_at"], [image, *slides()])
                year, n_new, n_upd = save_roster(conn, club_id, p, roster)
                print(f"    team roster {year}: {n_new} new members, {n_upd} role changes"
                      + (f"; unreadable slides: {roster['unreadable_slides']}" if roster["unreadable_slides"] else ""))
                rosters += 1
            elif ev["post_type"] == "recruitment":
                # Call to join the club: read the caption and every slide, save each track.
                tracks = extract_recruitment(p["caption"], club_name, p["posted_at"], [image, *slides()],
                                             existing=club_tracks(conn, club_id))
                for name, year, status in save_recruitment(conn, club_id, p, tracks):
                    print(f"    recruitment {name} {year}: {status}")
                recruits += 1
        except Exception as e:
            print(f"    ERROR: {e}")  # not marked processed, so it retries next run
            errors += 1
            continue
        finally:
            flyer = image.read_bytes() if image and image.exists() else None  # kept for save_flyer
            for f in [image, *extras]:
                if f and f.exists():
                    f.unlink()
        if ev["post_type"] in ("team_roster", "recruitment"):
            conn.execute("INSERT INTO processed_posts VALUES (?, ?, ?)", (p["url"], 0, now()))
            conn.commit()
            continue
        if ev["is_event"] and happened_before_post(ev["date_time"], p["posted_at"]):
            print(f"    dropped: event date {ev['date_time']} is before the post date (recap)")
            ev["is_event"] = False
        if ev["is_event"]:
            match = ev.get("same_as_event_id")
            if match in {r[0] for r in candidates}:
                notes = update_event(conn, match, ev, p["url"])
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
                if flyer:
                    save_flyer(flyer, slug)
                added += 1
                print(f"    new event #{match}: {ev['event_name']} @ {ev['date_time']}")
            if tag_series(conn, match, club_id, ev):
                print(f"    part of series: {ev['series_name']}")
            conn.execute("INSERT OR IGNORE INTO event_sources VALUES (?, ?, ?, ?, ?)",
                         (match, p["url"], role, p["posted_at"], now()))
        else:
            print("    not an event")
        conn.execute("INSERT INTO processed_posts VALUES (?, ?, ?)", (p["url"], int(ev["is_event"]), now()))
        conn.commit()
    return added, updated, skipped, errors, rosters, recruits


KEEP_PAST_MONTHS = 4  # past events stay on the site this long after their date


def cutoff_day(today=None, months=KEEP_PAST_MONTHS):
    """ISO date `months` calendar months before today (day clamped to the month's end)."""
    t = today or datetime.now().date()
    y, m = divmod(t.year * 12 + t.month - 1 - months, 12)
    m += 1
    days_in_month = [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28,
                     31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return f"{y:04d}-{m:02d}-{min(t.day, days_in_month):02d}"


def export(conn):
    """Write events.json. Events older than KEEP_PAST_MONTHS are left out of the site
    but stay in the database. Events with no known date are always kept."""
    rows = conn.execute(
        f"SELECT e.id, {', '.join('e.' + f for f in FIELDS)}, e.post_url, c.name, c.ig_handle, s.name "
        "FROM events e JOIN clubs c ON c.id = e.club_id LEFT JOIN series s ON s.id = e.series_id "
        "WHERE e.date_time = 'not shown' OR substr(e.date_time, 1, 10) >= ? "
        "ORDER BY e.date_time", (cutoff_day(),)
    ).fetchall()
    keys = ["id"] + FIELDS + ["post_url", "club", "ig_handle", "series"]
    events = []
    for r in rows:
        e = dict(zip(keys, r))
        e["image_url"] = flyer_path(e["post_url"])
        e["sources"] = [
            {"post_url": u, "role": role, "posted_at": at}
            for u, role, at in conn.execute(
                "SELECT post_url, role, posted_at FROM event_sources WHERE event_id=? ORDER BY posted_at", (e["id"],))
        ]
        events.append(e)
    data = {"updated_at": now(), "events": events}
    EXPORT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(rows)


def export_teams(conn):
    """Write teams.json: each club's active roster (names + roles), for the site's club pages.
    Keeps fields added by hand to a member in the current file (e.g. photo, linkedin_url)."""
    extra = {}
    if TEAMS_EXPORT.exists():
        for t in json.loads(TEAMS_EXPORT.read_text(encoding="utf-8")).get("teams", []):
            for m in t.get("members", []):
                extra[(t.get("ig_handle"), m.get("name", "").lower())] = {
                    k: v for k, v in m.items() if k not in ("name", "role")}
    clubs = []
    for rid, name, handle, year in conn.execute(
            "SELECT r.id, c.name, c.ig_handle, r.school_year FROM team_rosters r JOIN clubs c ON c.id = r.club_id "
            "WHERE r.is_active = 1 ORDER BY c.name"):
        members = [{**extra.get((handle, n.lower()), {}), "name": n, "role": role} for n, role in conn.execute(
            "SELECT name, role FROM team_members WHERE roster_id=? ORDER BY id", (rid,))]
        sources = [u for (u,) in conn.execute(
            "SELECT post_url FROM roster_sources WHERE roster_id=? ORDER BY posted_at", (rid,))]
        clubs.append({"club": name, "ig_handle": handle, "school_year": year, "members": members, "sources": sources})
    TEAMS_EXPORT.write_text(json.dumps({"updated_at": now(), "teams": clubs}, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")
    return len(clubs)


def export_recruitment(conn):
    """Write recruitment.json: every club's recruitment tracks, newest school year first.
    Not shown on the site yet; it's there for the club pages."""
    keys = ["id", "club", "ig_handle", "track", "track_name", "school_year"] + RECRUIT_FIELDS
    rows = conn.execute(
        f"SELECT r.id, c.name, c.ig_handle, r.track, r.track_name, r.school_year, "
        f"{', '.join('r.' + f for f in RECRUIT_FIELDS)} FROM recruitments r JOIN clubs c ON c.id = r.club_id "
        "ORDER BY r.school_year DESC, c.name, r.track, r.track_name").fetchall()
    items = []
    for r in rows:
        item = dict(zip(keys, r))
        item["sources"] = [
            {"post_url": u, "role": role, "posted_at": at}
            for u, role, at in conn.execute(
                "SELECT post_url, role, posted_at FROM recruitment_sources WHERE recruitment_id=? ORDER BY posted_at",
                (item["id"],))
        ]
        items.append(item)
    RECRUIT_EXPORT.write_text(json.dumps({"updated_at": now(), "recruitments": items}, indent=2,
                                         ensure_ascii=False) + "\n", encoding="utf-8")
    return len(items)


def load_last_posts():
    return json.loads(LAST_POSTS.read_text(encoding="utf-8")) if LAST_POSTS.exists() else {}


def update_last_posts(conn, state, feeds):
    """Move each club's cursor to the most recent post of its feed that is done (processed, or not
    ours to process, e.g. another account's collab). If a post failed, the cursor stops before it,
    so the next run fetches it again."""
    clubs = {h for (h,) in conn.execute("SELECT ig_handle FROM clubs")}
    for handle, posts in feeds.items():
        posts = sorted((p for p in posts if p.get("posted_at")), key=lambda p: p["posted_at"])
        done = []
        for p in posts:
            ours = p.get("owner", "").lower() in clubs
            if ours and not conn.execute("SELECT 1 FROM processed_posts WHERE post_url=?", (p["url"],)).fetchone():
                break  # failed: keep it for the next run
            done.append(p)
        entry = state.get(handle) or {}
        if done and done[-1]["posted_at"] > (entry.get("posted_at") or ""):
            last = done[-1]
            entry = {"shortcode": last["url"].rstrip("/").rsplit("/", 1)[-1], "posted_at": last["posted_at"]}
        entry["checked_at"] = now()
        state[handle] = entry
    LAST_POSTS.parent.mkdir(parents=True, exist_ok=True)
    LAST_POSTS.write_text(json.dumps(dict(sorted(state.items())), indent=2) + "\n", encoding="utf-8")


def git_publish():
    def git(*args):
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    git("add", "events.json", "assets/events", "assets/data/teams.json", "assets/data/recruitment.json",
        "updater/state/last_posts.json")
    if git("diff", "--cached", "--quiet").returncode == 0:
        print("events.json, teams.json and recruitment.json unchanged, nothing to push.")
        return
    git("commit", "-m", f"Update events ({datetime.now():%Y-%m-%d})")
    r = git("push")
    print("Pushed to GitHub." if r.returncode == 0 else f"Push failed: {r.stderr.strip()}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-file", help="read posts from a JSON file instead of Apify (offline test)")
    ap.add_argument("--clubs", help="comma-separated IG handles to limit the run")
    ap.add_argument("--per-account", type=int, default=20, help="max new posts per account (default 20)")
    ap.add_argument("--newer-than", help='ignore the per-club cursor and take posts newer than this, e.g. "14 days"')
    ap.add_argument("--no-push", action="store_true", help="don't git commit/push events.json")
    ap.add_argument("--import-rosters", help="load team rosters read by hand/backfill from a JSON file, then stop")
    args = ap.parse_args()

    load_env()
    conn = open_db()
    if args.import_rosters:
        import_rosters(conn, args.import_rosters)
        print(f"teams.json has {export_teams(conn)} clubs.")
        return
    if ROSTER_BACKFILL.exists():  # rosters read before the updater existed; safe to re-load every run
        with contextlib.redirect_stdout(io.StringIO()):
            import_rosters(conn, ROSTER_BACKFILL)
    handles = [h for (h,) in conn.execute("SELECT ig_handle FROM clubs")]
    if args.clubs:
        wanted = {h.strip().lower() for h in args.clubs.split(",")}
        handles = [h for h in handles if h in wanted]

    feeds = {}
    if args.from_file:
        posts = json.loads(Path(args.from_file).read_text(encoding="utf-8"))
    else:
        token = os.environ.get("APIFY_TOKEN")
        if not token or token.startswith("paste_"):
            sys.exit("APIFY_TOKEN missing. Copy .env.example to .env and add your token.")
        print(f"Scraping {len(handles)} accounts on Apify...")
        if args.newer_than:
            posts, feeds = fetch_posts(token, handles, args.per_account, args.newer_than), {}
        else:
            # Normal refresh: each club from its own most recent scraped post (updater/state/last_posts.json).
            state = load_last_posts()
            feeds = fetch_since(token, {h: (state.get(h) or {}).get("posted_at") for h in handles},
                                args.per_account)
            posts = [p for ps in feeds.values() for p in ps]
    posts = [p for p in posts if p.get("owner", "").lower() in handles]
    posts.sort(key=lambda p: p.get("posted_at") or "")  # oldest first, so follow-up posts update the original
    print(f"{len(posts)} posts to check.")

    added, updated, skipped, errors, rosters, recruits = process(conn, posts)
    if feeds:
        update_last_posts(conn, state, feeds)
    total = export(conn)
    export_teams(conn)
    n_recruit = export_recruitment(conn)
    print(f"Done: {added} new events, {updated} updated, {skipped} already seen, {rosters} team-roster posts, "
          f"{recruits} recruitment posts, {errors} errors. events.json has {total} events, "
          f"recruitment.json has {n_recruit} tracks.")
    if not args.no_push:
        git_publish()


if __name__ == "__main__":
    main()
