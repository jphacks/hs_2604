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
