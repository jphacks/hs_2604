# App画像（#166）
生成方法：組み込み image_gen。2026-10-25作成。生成プロンプトは app-image-prompts-166.json に保存。

## 商品写真
DATA-01・生鮮商品・生バジルの計50商品を、白背景の写真で統一。
画面用：kago-os/kago-app/public/images/products/catalog-v1/（768×768 WebP）。
対応表：kago-os/kago-app/src/lib/generated-product-photos.ts。
既存の商品画像の対応表へ追加し、コンポーネントの構造・CSS・操作は変更しない。
元の画像は残す。元PNGは専用作業場所の internal/product-photos-166-originals/ に保管し、Gitには含めない。

## 店舗からのおすすめ（3枚すべて採用）
- A：店員さん /images/shopping/store-recommendation-v2/a-staff.webp
- B：親子の食卓 /images/shopping/store-recommendation-v2/b-family.webp
- C：食材のかごと売り場 /images/shopping/store-recommendation-v2/c-basket.webp

3枚は商品を限定しない共通の背景画像。今回の対応は素材の配置まで。ランダム表示はユーザー側で実装するため、表示切替のコードは変更していない。
元PNGは専用作業場所の internal/store-recommendation-images-166-originals/ に保管。
既存カードのUIに画像だけを入れた比較は開発時の /ui-preview/store-recommendation-images で確認できる。

架空のデモ用生成画像であり、実在する商品の外観・パッケージや実在店舗・人物を示す写真ではない。
