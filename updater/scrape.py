"""Fetch recent Instagram posts for the club accounts through Apify.

Uses the apify/instagram-scraper Actor via Apify's REST API (no extra packages).
"""
import json
import urllib.request

ACTOR = "apify~instagram-scraper"
API = f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items"


def fetch_posts(token, handles, per_account=5, newer_than="7 days", timeout=600):
    """Return a list of normalized posts: url, owner, caption, image_url, extra_image_urls, posted_at."""
    body = {
        "directUrls": [f"https://www.instagram.com/{h}/" for h in handles],
        "resultsType": "posts",
        "resultsLimit": per_account,
        "onlyPostsNewerThan": newer_than,
        "addParentData": False,
    }
    req = urllib.request.Request(
        API,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        items = json.load(resp)
    return [p for p in (normalize(i) for i in items) if p]


def normalize(item):
    """Map one Apify item to the fields the updater uses. Returns None for error rows."""
    url = item.get("url")
    if not url or item.get("error"):
        return None
    image = item.get("displayUrl") or (item.get("images") or [None])[0]
    # Carousel ("Sidecar"): every slide's image, in order. Videos inside a carousel give their cover frame.
    slides = [c.get("displayUrl") for c in item.get("childPosts") or [] if c.get("displayUrl")]
    slides = slides or list(item.get("images") or [])
    return {
        "url": url.rstrip("/") + "/",
        "owner": (item.get("ownerUsername") or "").lower(),
        "caption": item.get("caption") or "",
        "image_url": image,
        "extra_image_urls": [u for u in slides if u != image][:19],  # IG max is 20 slides
        "posted_at": item.get("timestamp") or "",
    }
