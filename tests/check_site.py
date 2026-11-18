from html.parser import HTMLParser
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PAGES = [p for p in ROOT.glob("*.html") if p.name not in {"privacy.html", "terms.html"} and not p.name.startswith("google")]

class AuditParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []
        self.meta_description = False
        self.title = False
        self.jsonld = []
        self._capture_jsonld = False
        self._script_parts = []

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
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self._capture_jsonld = True
            self._script_parts = []

    def handle_data(self, data):
        if self._capture_jsonld:
            self._script_parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._capture_jsonld:
            self.jsonld.append("".join(self._script_parts))
            self._capture_jsonld = False
            self._script_parts = []

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
    for index, raw in enumerate(parser.jsonld, start=1):
        try:
            schema = json.loads(raw)
        except json.JSONDecodeError as exc:
            errors.append(f"{page.name}: JSON-LD block {index} is invalid JSON ({exc})")
            continue
        if schema.get("@type") == "FAQPage":
            questions = schema.get("mainEntity", [])
            if not questions:
                errors.append(f"{page.name}: FAQPage has no questions")
            for question in questions:
                if not question.get("name", "").strip():
                    errors.append(f"{page.name}: FAQPage contains an empty question")
                answer = question.get("acceptedAnswer", {}).get("text", "")
                if not answer.strip():
                    errors.append(f"{page.name}: FAQPage contains an empty answer")

js = (ROOT / "script.js").read_text(encoding="utf-8")
if "window.NSRFareEngine.calculate" not in js:
    errors.append("script.js: fare engine is not wired into the booking flow")
if "returnDate" not in js or "localDuration" not in js:
    errors.append("script.js: round-trip or local-rental fields are not wired")

sitemap_path = ROOT / "sitemap.xml"
sitemap_urls = set()
try:
    sitemap = ET.parse(sitemap_path).getroot()
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = sitemap.findall("sm:url", namespace)
    if not urls:
        errors.append("sitemap.xml: contains no URLs")
    for entry in urls:
        loc = entry.findtext("sm:loc", default="", namespaces=namespace)
        sitemap_urls.add(loc)
        if not loc.startswith("https://nsr-go-taxi.vercel.app/"):
            errors.append(f"sitemap.xml: invalid or non-canonical URL {loc}")
        lastmod = entry.findtext("sm:lastmod", default="", namespaces=namespace)
        if lastmod and (len(lastmod) != 10 or lastmod[4:5] != "-" or lastmod[7:8] != "-"):
            errors.append(f"sitemap.xml: invalid lastmod value for {loc}: {lastmod}")
except ET.ParseError as exc:
    errors.append(f"sitemap.xml: invalid XML ({exc})")

# Route discovery: every route must be reachable from both the homepage and the route hub,
# and every route landing page must be listed in the XML sitemap.
home_parser = AuditParser()
home_parser.feed((ROOT / "index.html").read_text(encoding="utf-8"))
hub_parser = AuditParser()
hub_parser.feed((ROOT / "tamil-nadu-taxi-routes.html").read_text(encoding="utf-8"))
route_pages = sorted(ROOT.glob("*-to-*-taxi.html"))
for route_page in route_pages:
    if route_page.name not in home_parser.links:
        errors.append(f"index.html: route page is not directly linked: {route_page.name}")
    if route_page.name not in hub_parser.links:
        errors.append(f"tamil-nadu-taxi-routes.html: route page is missing from directory: {route_page.name}")
    route_url = f"https://nsr-go-taxi.vercel.app/{route_page.name}"
    if route_url not in sitemap_urls:
        errors.append(f"sitemap.xml: route page is missing from sitemap: {route_url}")

if errors:
    raise SystemExit("\n".join(errors))
print(f"Static site and SEO checks passed for {len(PAGES)} HTML pages.")
