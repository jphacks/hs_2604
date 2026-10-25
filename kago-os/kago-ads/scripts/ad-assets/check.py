"""Validate ADS-05 catalog against real files and product mapping (no network or DB)."""
import csv,json,subprocess
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
rows=list(csv.DictReader((root/"src/data/demo/ad-assets.csv").open(encoding="utf8")))
products={p["code"]:p for p in csv.DictReader((root/"src/data/demo/products.csv").open(encoding="utf8"))}
assert json.loads((root/"src/data/demo/ad-assets.json").read_text())==rows,"Regenerate JSON from CSV"
assert len({r["asset_id"] for r in rows})==len(rows)
for r in rows:
 p=(root/"public"/r["file"]).resolve()
 assert p.is_relative_to((root/"public/ad-assets").resolve()) and p.is_file()
 size=(int(r["width"]),int(r["height"]))
 assert size==((800,800) if r["channel"]=="app" else (1920,1080))
 if r["format"]=="png":
  with Image.open(p) as img:assert img.size==size;img.verify()
  assert p.stat().st_size<=5*1024*1024
 else:
  media=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(p)]))
  video=next(s for s in media["streams"] if s["codec_type"]=="video")
  assert (video["width"],video["height"])==size
  assert abs(float(media["format"]["duration"])-float(r["duration_sec"]))<.15
  assert video["codec_name"]=="h264" and video["pix_fmt"]=="yuv420p"
 if r["kind"]=="sponsored":
  product=products[r["product_code"]]
  assert (product["name"],product["category"])==(r["product_name"],r["category"])
  assert "未申請" in r["status"]
 print("PASS",r["asset_id"])
print(f"{len(rows)} catalog/file checks passed")
