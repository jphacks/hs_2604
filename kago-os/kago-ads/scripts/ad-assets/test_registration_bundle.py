import csv, hashlib, io, json, tempfile, unittest, zipfile
from collections import Counter
from pathlib import Path
import registration_bundle as bundle

class RegistrationTests(unittest.TestCase):
    def fixture(self, root):
        asset = json.loads((bundle.ROOT / "src/data/demo/ad-design-v2.json").read_text())[0]
        supplied = json.loads((bundle.ROOT / "public/ad-assets/design-v2/supplied.json").read_text())
        for directory in ["src/data/demo", "public/ad-assets/design-v2"]:
            (root / directory).mkdir(parents=True)
        (root / "src/data/demo/ad-design-v2.json").write_text(json.dumps([asset]))
        (root / "src/data/demo/products.csv").write_bytes((bundle.ROOT / "src/data/demo/products.csv").read_bytes())
        (root / "public/ad-assets/design-v2/supplied.json").write_text(json.dumps(supplied))
        (root / "src/data/demo/ad-design-price-decisions.json").write_bytes((bundle.ROOT / "src/data/demo/ad-design-price-decisions.json").read_bytes())
        target = root / "public" / asset["file"].lstrip("/")
        target.write_bytes((bundle.ROOT / "public" / asset["file"].lstrip("/")).read_bytes())
        return asset, target

    def test_all_originals_and_mapping_are_packaged(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "assets.zip"
            items = bundle.build(path)
            with zipfile.ZipFile(path) as archive:
                rows = list(csv.DictReader(io.StringIO(archive.read("ad-design-v2.csv").decode("utf-8-sig"))))
                self.assertEqual(len(rows), 16)
                self.assertEqual(Counter(row["kind"] for row in rows), {"sponsored":8, "store_promo":6, "fallback":2})
                self.assertEqual(sum(row["price_check"] == "要照合" for row in rows), 0)
                self.assertEqual(sum(row["price_check"] == "販促価格として確認済み" for row in rows), 4)
                for row, original, _ in items:
                    self.assertEqual(archive.read(row["file"]), original)
                    self.assertEqual(hashlib.sha256(original).hexdigest(), row["sha256"])
                for line in archive.read("SHA256SUMS").decode().splitlines():
                    digest, name = line.split("  ", 1)
                    self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)
                self.assertIn("1版1画像", archive.read("README.md").decode())

    def test_zip_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            a, b = Path(directory)/"a.zip", Path(directory)/"b.zip"
            bundle.build(a); bundle.build(b)
            self.assertEqual(hashlib.sha256(a.read_bytes()).digest(), hashlib.sha256(b.read_bytes()).digest())

    def test_price_confirmation_does_not_cover_changed_prices(self):
        decisions = json.loads((bundle.ROOT / "src/data/demo/ad-design-price-decisions.json").read_text())
        self.assertEqual(bundle.price_check(138, "228", "2900000000056", decisions), "販促価格として確認済み")
        self.assertEqual(bundle.price_check(138, "229", "2900000000056", decisions), "要照合")
        self.assertEqual(bundle.price_check(139, "228", "2900000000056", decisions), "要照合")

    def test_output_cannot_overwrite_an_image(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"original.png";path.write_bytes(b"keep")
            with self.assertRaisesRegex(ValueError, ".zip"): bundle.build(path)
            self.assertEqual(path.read_bytes(), b"keep")

    def test_changed_original_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); _, image = self.fixture(root)
            image.write_bytes(image.read_bytes()+b"changed")
            with self.assertRaisesRegex(ValueError, "checksum"): bundle.rows(root)

    def test_path_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); asset, _ = self.fixture(root)
            asset["file"] = "/ad-assets/design-v2/../outside.png"
            (root/"src/data/demo/ad-design-v2.json").write_text(json.dumps([asset]))
            with self.assertRaisesRegex(ValueError, "within"): bundle.rows(root)

    def test_wrong_product_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); asset, _ = self.fixture(root)
            asset["product_name"] = "wrong product"
            (root/"src/data/demo/ad-design-v2.json").write_text(json.dumps([asset]))
            with self.assertRaisesRegex(ValueError, "mapping"): bundle.rows(root)

    def test_wrong_dimensions_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); asset, _ = self.fixture(root)
            asset["width"] += 1
            (root/"src/data/demo/ad-design-v2.json").write_text(json.dumps([asset]))
            with self.assertRaisesRegex(ValueError, "dimension"): bundle.rows(root)
if __name__ == "__main__": unittest.main()
