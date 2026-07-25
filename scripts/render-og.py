# Renders scripts/og-card.html to public/brand/og.png at 1200x630 — the size
# every link-preview crawler expects, and the size declared in index.html's
# og:image:width / og:image:height.
#
#   python scripts/render-og.py
#
# Re-run after editing og-card.html and commit the PNG; nothing renders this at
# build time, because a link preview has to be a static file on the CDN.

import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "og-card.html"
OUT = ROOT / "public" / "brand" / "og.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    page.goto(SOURCE.as_uri())
    # The webfont has to be in before the shot, or the card renders in the
    # fallback and the wordmark sits at the wrong width.
    page.wait_for_function("document.fonts.ready.then(() => true)")
    page.screenshot(path=str(OUT))
    browser.close()

print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.1f} KB)", file=sys.stderr)
