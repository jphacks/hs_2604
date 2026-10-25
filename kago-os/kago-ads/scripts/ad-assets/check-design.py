"""Check new #196 assets and unchanged App photograph sources."""
import hashlib,json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
rows=json.loads((root/"src/data/demo/ad-design-v2.json").read_text())
assert len(rows)==11 and len({r["asset_id"] for r in rows})==11
for r in rows:
 p=(root/"public"/r["file"].lstrip("/")).resolve()
 assert p.is_relative_to((root/"public/ad-assets/design-v2").resolve())
 with Image.open(p) as img:assert img.size==(r["width"],r["height"]);img.verify()
 assert p.stat().st_size<=2*1024*1024
 if r["kind"]=="sponsored":assert r["status"]=="未申請・デザイン確認用"
sources=json.loads((root/"public/ad-assets/design-v2/sources.json").read_text())
for item in sources.values():
 p=root.parent/item["source"]
 assert hashlib.sha256(p.read_bytes()).hexdigest()==item["sha256"]
assert {r["maker_id"] for r in rows if r["kind"]=="sponsored"}=={"M1","M2"}
print("PASS 11 images / dimensions / 2MiB / 3 unchanged App photograph sources / 2 maker families")
