from html.parser import HTMLParser
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGES = [p for p in ROOT.glob("*.html") if p.name not in {"privacy.html", "terms.html"}]

class AuditParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []
        self.meta_description = False
        self.title = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        if tag == "meta" and attrs.get("name") == "description" and attrs.get("content"):
            self.meta_description = True
        if tag == "title":
            self.title = True

errors = []
for page in PAGES:
    parser = AuditParser()
    parser.feed(page.read_text(encoding="utf-8"))
    if not parser.title:
        errors.append(f"{page.name}: missing title")
    if not parser.meta_description:
        errors.append(f"{page.name}: missing meta description")
    for href in parser.links:
        if href.startswith(("http://", "https://", "mailto:", "tel:", "#", "javascript:")):
            continue
        target = (page.parent / href.split("#", 1)[0]).resolve()
        if not target.exists():
            errors.append(f"{page.name}: broken local link {href}")

js = (ROOT / "script.js").read_text(encoding="utf-8")
if "window.NSRFareEngine.calculate" not in js:
    errors.append("script.js: fare engine is not wired into the booking flow")
if "returnDate" not in js or "localDuration" not in js:
    errors.append("script.js: round-trip or local-rental fields are not wired")
if errors:
    raise SystemExit("\n".join(errors))
print(f"Static site checks passed for {len(PAGES)} HTML pages.")
