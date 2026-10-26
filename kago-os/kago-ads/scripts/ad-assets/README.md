# 広告素材の生成（ADS-05）

`public/ad-assets/` のデモ広告素材と、`src/data/demo/` の対応表（`ad-assets.csv`・`products.csv`）を作るスクリプトです。素材の仕様（サイズ・形式・画面で重ねる領域）は [docs/specs/ads-spec.md](../../../../docs/specs/ads-spec.md) の 10 章にあります。

## 使い方

Python 3（Pillow）、google-chrome、ffmpeg が必要です。

```bash
cd kago-os/kago-ads
pnpm generate:ad-assets
```

- 素材の内容（商品・メーカー・版・文言・色）は `generate.py` の `PRODUCTS`・`MAKERS`・`CREATIVES`・`VERSIONS` と描画関数が正本です。変えたら作り直して、素材と対応表を一緒にコミットします
- `scripts/ad-assets/preview/index.html` に、「広告｜提供」と価格を画面側で重ねた確認ページができます（git には入れません）

## 今ある素材

| ファイル | 内容 |
| --- | --- |
| `CR1_v1_app.png`・`CR1_v1_signage.png` | 瀬戸内トマト食品「トマトパスタソース」（`2900000000162`）の第1版 |
| `CR1_v2_app.png`・`CR1_v2_signage.mp4` | 同じ素材の第2版（商品名を大きく、Signage は10秒の動画） |
| `FALLBACK_v1_signage.png` | Signage の案内（再生記録の `mode = fallback`） |
| `PROMO_TEMPLATE_v1_signage.png`・`PROMO_TEMPLATE_v1_app.png` | 店舗販促の背景（商品名・理由文・価格は画面で重ねる） |

メーカー・ブランドは架空です。素材の下端に「※デモ用の架空ブランドです」と入れています。

## 差し替え済みの提供素材16点（ADS-05 #33）

旧7素材用のad-assets.csvは互換性のため維持する。新16素材の正本はsrc/data/demo/ad-design-v2.json、出典・原本ハッシュはpublic/ad-assets/design-v2/supplied.json。登録候補用のad-design-v2.csvとZIPを同じ正本から作る。

```bash
python3 scripts/ad-assets/registration_bundle.py --write-csv
python3 scripts/ad-assets/registration_bundle.py --check
python3 -m unittest discover -s scripts/ad-assets -p test_registration_bundle.py
python3 scripts/ad-assets/registration_bundle.py --output /tmp/kago-ads-registration.zip
```

CSVはUTF-8 BOM付き。メーカー8点、店舗おすすめ6点、案内2点を分け、実寸・バイト数・SHA256・商品コード・素材案の版・価格を記載する。ZIPは原画像、CSV、出典JSON、登録注意事項、照合用SHA256SUMSを含み、同じ入力から同じバイト列を作る。Python標準ライブラリだけを使い、画像の再描画は行わない。

**価格は確認待ちを明示**：食パン画像は138円、既存products.csvは228円。販促価格の可能性もあるため、画像や店舗価格を自動変更せず、4点を要照合とする。参考の商品表の価格であり、共有DBの現在価格を検証した結果ではない。

**登録の制約**：現行DBは1版1画像。App用とSignage用は別候補であり、同一版へ2枚登録する契約ではない。M1/M2・asset_id・design_versionは架空データの識別子で、実DBのUUID・素材版番号として投入しない。店舗おすすめの対象商品は未指定。登録・申請・承認は別操作で、既存の承認済み配信を上書きしない。
