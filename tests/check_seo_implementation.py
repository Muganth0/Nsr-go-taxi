from html.parser import HTMLParser
from pathlib import Path
import json, re, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
BASE="https://nsr-go-taxi.vercel.app"
REQUIRED=["taxi-in-avadi.html","taxi-in-ambattur.html","taxi-in-pattabiram.html","taxi-in-poonamallee.html","chennai-airport-taxi.html","tempo-traveller-rental-chennai.html"]
class Page(HTMLParser):
 def __init__(self):
  super().__init__(); self.h1=0; self.links=[]; self.meta={}; self.jsonld=[]; self.capture=False; self.parts=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=="h1": self.h1+=1
  if tag=="a" and a.get("href"): self.links.append(a["href"])
  if tag=="meta" and a.get("name") in {"description","robots"}: self.meta[a["name"]]=a.get("content","")
  if tag=="script" and a.get("type")=="application/ld+json": self.capture=True; self.parts=[]
 def handle_data(self,data):
  if self.capture: self.parts.append(data)
 def handle_endtag(self,tag):
  if tag=="script" and self.capture: self.jsonld.append("".join(self.parts)); self.capture=False
errors=[]
for path in ROOT.glob("*.html"):
 if path.name.startswith("google"): continue
 html=path.read_text(encoding="utf-8"); p=Page(); p.feed(html)
 title=re.search(r"<title>(.*?)</title>",html,re.I|re.S)
 if not title: errors.append(f"{path.name}: missing title")
 elif len(re.sub(r"\\s+"," ",title.group(1)).strip())>60: errors.append(f"{path.name}: title exceeds 60 characters")
 desc=p.meta.get("description","")
 if not desc: errors.append(f"{path.name}: missing meta description")
 elif len(desc)>160: errors.append(f"{path.name}: description exceeds 160 characters")
 if p.h1!=1: errors.append(f"{path.name}: expected one H1, got {p.h1}")
 for n,raw in enumerate(p.jsonld,1):
  try: json.loads(raw)
  except json.JSONDecodeError as e: errors.append(f"{path.name}: invalid JSON-LD block {n}: {e}")
home=(ROOT/"index.html").read_text(encoding="utf-8")
for name in REQUIRED:
 path=ROOT/name
 if not path.exists(): errors.append(f"missing landing page: {name}"); continue
 if f'href="{name}"' not in home: errors.append(f"{name}: not linked from homepage")
try:
 root=ET.parse(ROOT/"sitemap.xml").getroot(); ns={"sm":"http://www.sitemaps.org/schemas/sitemap/0.9"}
 urls={e.findtext("sm:loc",default="",namespaces=ns) for e in root.findall("sm:url",ns)}
 for name in REQUIRED:
  if f"{BASE}/{name}" not in urls: errors.append(f"sitemap missing {name}")
except (ET.ParseError,OSError) as e: errors.append(f"sitemap invalid: {e}")
if errors: raise SystemExit("\\n".join(errors))
print("SEO checks passed: titles, descriptions, H1s, JSON-LD, homepage links and sitemap.")
