"""ADS-05: supplied artwork handoff. Copies original bytes; no DB access."""
import argparse
import csv
import hashlib
import io
import json
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = "src/data/demo/ad-design-v2.csv"
FIELDS = ["asset_id", "kind", "maker_code", "maker_name", "product_code", "product_name",
          "design_version", "channel", "file", "width", "height", "bytes", "sha256",
          "embedded_price_yen", "reference_price_yen", "price_check", "status"]
NOTES = """# ADS-05 登録候補の素材一式

メーカー広告8点・店舗おすすめ6点・買い物案内2点。画像は提供原本のバイトのままです。
対応表はUTF-8 BOM付きCSV。価格と寸法は登録前に照合してください。

- 食パン4点：画像内138円、参考の商品表228円。販促価格かどうかを店舗と確認するまで確定しないでください。
- 現行DBは1版1画像です。App用とSignage用は別候補であり、同じ版へ2枚同時登録する指示ではありません。
- maker_code（M1/M2）、asset_id、design_versionは素材案の識別子です。共有DBのUUIDや版番号として投入しません。
- メーカー広告はログイン中のメーカー・対象商品を確認し、新しい素材版として登録して申請します。店舗の承認前に配信しません。
- 店舗おすすめは対象商品が未指定の素材です。メーカー広告へ流用せず、店舗販促の設定と合わせて使います。
- 買い物案内はfallbackです。メーカー広告の申請・成果計上とは分けます。
- 既存の承認済み画像や共有DBはこのパッケージでは変更していません。
- provenance.jsonは提供ファイルの出典記録、SHA256SUMSは梱包ファイルの照合用です。
"""

def sha(data):
    return hashlib.sha256(data).hexdigest()

def rows(root=ROOT):
    root = Path(root)
    catalog = json.loads((root / "src/data/demo/ad-design-v2.json").read_text(encoding="utf-8"))
    supplied = json.loads((root / "public/ad-assets/design-v2/supplied.json").read_text(encoding="utf-8"))
    with (root / "src/data/demo/products.csv").open(encoding="utf-8-sig", newline="") as f:
        products = {p["code"]: p for p in csv.DictReader(f)}
    base = (root / "public/ad-assets/design-v2").resolve()
    result, seen = [], set()
    for asset in catalog:
        if asset["asset_id"] in seen:
            raise ValueError("duplicate asset_id")
        seen.add(asset["asset_id"])
        path = (root / "public" / asset["file"].lstrip("/")).resolve()
        if base not in path.parents or path.suffix != ".png":
            raise ValueError("artwork must stay within design-v2")
        data = path.read_bytes()
        record = supplied[path.name]
        if sha(data) != record["sha256"]:
            raise ValueError("source checksum mismatch: " + path.name)
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("not a PNG: " + path.name)
        width, height = struct.unpack(">II", data[16:24])
        if (width, height) != (asset["width"], asset["height"]) or (width, height) != (record["width"], record["height"]):
            raise ValueError("dimension mismatch: " + path.name)
        if asset["channel"] not in ("app", "signage") or asset["kind"] not in ("sponsored", "store_promo", "fallback"):
            raise ValueError("unknown channel/kind")
        product = products.get(asset.get("product_code"))
        if asset["kind"] == "sponsored":
            if not product or product["name"] != asset["product_name"] or not asset.get("maker_id"):
                raise ValueError("product/maker mapping mismatch")
            if len(data) > 5 * 1024 * 1024:
                raise ValueError("manufacturer artwork exceeds 5MiB")
        if asset.get("embedded_price") != record.get("embedded_price"):
            raise ValueError("embedded price metadata mismatch")
        embedded, reference = asset.get("embedded_price", ""), product["price"] if product else ""
        check = "要照合" if embedded != "" and reference != "" and str(embedded) != str(reference) else ("一致" if reference else "対象商品未指定")
        row = dict(asset_id=asset["asset_id"], kind=asset["kind"], maker_code=asset.get("maker_id", ""),
                   maker_name=asset.get("maker_name", ""), product_code=asset.get("product_code", ""),
                   product_name=asset.get("product_name", asset.get("display_name", "")),
                   design_version=asset.get("creative_version", ""), channel=asset["channel"],
                   file="images/" + path.name, width=width, height=height, bytes=len(data), sha256=sha(data),
                   embedded_price_yen=embedded, reference_price_yen=reference, price_check=check, status=asset["status"])
        result.append((row, data, record))
    return result

def csv_bytes(items):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(row for row, _, _ in items)
    return stream.getvalue().encode("utf-8-sig")

def build(output, root=ROOT):
    output = Path(output).resolve()
    if output.suffix.lower() != ".zip":
        raise ValueError("output must be a .zip")
    items = rows(root)
    files = {"ad-design-v2.csv": csv_bytes(items), "README.md": NOTES.encode("utf-8")}
    provenance = {}
    for row, data, record in items:
        files[row["file"]] = data
        provenance[Path(row["file"]).name] = record
    files["provenance.json"] = (json.dumps(provenance, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    files["SHA256SUMS"] = "".join(sha(data) + "  " + name + "\n" for name, data in sorted(files.items())).encode("utf-8")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    return items

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write-csv", action="store_true")
    mode.add_argument("--output", type=Path)
    args = parser.parse_args()
    items = rows()
    if args.write_csv:
        (ROOT / CSV_PATH).write_bytes(csv_bytes(items))
    elif args.check:
        if (ROOT / CSV_PATH).read_bytes() != csv_bytes(items):
            raise SystemExit("CSV is stale; run --write-csv")
    else:
        build(args.output)
    print(json.dumps({"assets": len(items), "price_checks": sum(row["price_check"] == "要照合" for row, _, _ in items),
                      "shared_writes": 0}, ensure_ascii=False))

if __name__ == "__main__":
    main()
