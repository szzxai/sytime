"""Offline historical import only. Production uses Node.js and vision models.

Reads copies of szzx-menu's table_run outputs and archived source articles.
No OCR, model calls, third-party packages, or edits to the source repository.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import unicodedata

IDS = [11392, 11389, 11386, 11380, 11358, 11354, 11347, 11343, 11341, 11333]
FIELDS = ["date", "weekday", "time", "place", "group", "name", "price", "spicy"]

class Images(HTMLParser):
    def __init__(self):
        super().__init__(); self.images = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() != "img": return
        attrs = dict(attrs)
        for key in ["src", "data-original", "data-src"]:
            value = attrs.get(key, "")
            if value.startswith("data:image/") and ";base64," in value:
                image = base64.b64decode(value.split(",", 1)[1], validate=True)
                if image not in self.images: self.images.append(image)

def build(menu_root: Path) -> dict:
    sources = []
    for article_id in IDS:
        article = json.loads((menu_root / ".scratch" / "audit_10" / str(article_id) / "article.json").read_text(encoding="utf-8"))
        article = article.get("data", article)
        parser = Images(); parser.feed(article["content_html"])
        if not parser.images: raise ValueError(f"{article_id}: no embedded menu images")
        title = " ".join(article["title"].split())
        hashes = [hashlib.sha256(image).hexdigest() for image in parser.images]
        content_hash = hashlib.sha256((title + "\n" + (article.get("published_date") or "") + "\n" + "\n".join(hashes)).encode()).hexdigest()
        raw = json.loads((menu_root / ".scratch" / "table_run" / f"{article_id}.json").read_text(encoding="utf-8"))
        records = []
        for item in raw:
            if set(item) not in [set(FIELDS), set(FIELDS) - {"spicy"}]: raise ValueError(f"{article_id}: unexpected fields")
            name = " ".join(unicodedata.normalize("NFC", item["name"]).split())
            if not name: raise ValueError(f"{article_id}: empty name")
            record = {field: item.get(field) for field in FIELDS}; record["name"] = name
            records.append(record)
        sources.append({"article_id": article_id, "title": title, "url": article["url"], "published_date": article.get("published_date"), "content_hash": content_hash, "image_hashes": hashes, "records": records})
    return {"schema_version": 1, "generated_at": "2026-10-01T00:00:00Z", "provenance": "szzx-menu table_run; historical recognition, not independent ground truth", "sources": sources}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--menu-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("data/menu-bootstrap.json"))
    args = parser.parse_args()
    document = build(args.menu_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    names = {item["name"].lower() for source in document["sources"] for item in source["records"]}
    print(f"{len(document['sources'])} sources, {sum(len(s['records']) for s in document['sources'])} records, {len(names)} normalized names")

if __name__ == "__main__": main()
