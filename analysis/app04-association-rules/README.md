# APP-04：公開購買データからの関連購買ルール

対象：[APP-04 / #20](https://github.com/jphacks/hs_2604/issues/20)。作業フェーズ：hackday。

公開されている実店舗のレシートデータから「一緒に買われる商品」のルールを作り、KAGOのデモ商品へ対応付けます。原データはこのフォルダの`raw/`（Git管理外）に置き、Appへは派生したルールだけを組み込みます。公開データを利用者の購買履歴としてDBへ投入しません。

## 出典と利用条件

| 項目 | 内容 |
| --- | --- |
| データ | Groceries：一般的な食料品店の30日分のPOSデータ。9,835件のレシート、169カテゴリ |
| 提供 | Michael Hahsler, Kurt Hornik, Thomas Reutterer。Rパッケージ[arules](https://github.com/mhahsler/arules)に同梱 |
| 利用条件 | arulesのライセンス（GPL-3）。論文での利用時は下記文献を引用 |
| 文献 | Hahsler, M., Hornik, K., Reutterer, T. (2006) Implications of probabilistic data modeling for mining association rules. Springer, pp. 598–605 |
| 取得元の版 | commit `cb89f0fc9996180a7044e5dd1b5a86d1fc577071` の`data/Groceries.rda`、sha256 `7a0e3408c631b5e3fe69af035a1209ffaf22b43b4af16218c5d5d23e761e6164` |

原データ・中間ファイルはリポジトリへ含めません。Appに含めるのは、集計値（support・confidence・lift）と対応表から作った派生ルールです。

## 再生成の手順

Node.js 22とR（追加パッケージ不要）を使います。

```bash
cd analysis/app04-association-rules
node fetch-groceries.mjs                              # raw/Groceries.rda を取得し sha256 を検証
Rscript export-baskets.R raw/Groceries.rda raw/baskets.txt   # 1行1レシートへ変換
node mine-rules.mjs                                   # ルールと評価を生成
```

Node.jsの`fetch`がプロキシを通らない環境では、上記URL（取得元の版）を`curl -L -o raw/Groceries.rda <URL>`で取得し、sha256が一致することを確認してから次の手順へ進みます。

生成物：

- `kago-os/kago-app/src/features/recommendations/association-rules.json`：Appが使うルール（版・出典・条件・評価・ルール）
- `evaluation.md`：評価結果、採用したルール、採用しなかったルールと理由、初期ルール

同じ原データ・同じ設定なら同じファイルが生成されます。生成物は手で編集しません。

## 分析の方法

1. レシートを通し番号で分け、5件ごとの1件（20%）を評価用、残りを学習用にする。
2. 学習用で、デモ商品へ対応するカテゴリの全組み合わせ（A→B）についてsupport・confidence・liftを計算する。
3. 採用条件：学習で同時購入10件以上かつlift 1.2以上、評価用でも同時購入3件以上かつlift 1.0以上（関連が再現する）。学習では基準を満たしたが評価で再現しなかったルールは、理由とともに`evaluation.md`へ残す。
4. `product-map.json`でカテゴリをデモ商品コードへ展開し、商品ごとにconfidence上位4件とlift上位4件を残す。
5. 評価：評価用レシートで1品目を隠し、残りの品目から上位3件の候補を選んで当たるかを、よく売れる品目の上位3件と比べる。

## 対応表と初期ルール

- `product-map.json`：デモ商品コード→Groceriesのカテゴリ。近いカテゴリへの近似です（例：スパゲッティ→`pasta`、トマトパスタソース→`sauces`、生バジル→`herbs`）。同じカテゴリの商品同士（バナナとアボカドなど）はルールにしません。
- `initial-rules.json`：データがなくても使える手作業の初期ルール（`origin = initial`）。分析ルール（`origin = analysis`）と区別し、Appではどちらを使うか選べます。

## 使い方と限界

- Appでは`src/features/recommendations/association.ts`の`relatedProducts()`で、かごの商品コードから候補を取り出します。初期ルールを先に、分析ルールを指定した指標（`confidence`または`lift`）の順に返します。かご内の商品は除きます。推薦枠の選定・表示・保存はAPP-05、セレンディピティ販促はAPP-13で行います。
- ルールの版（現在1）は、選定記録`selections.rule_version`へ保存する値です。ルールを変えたら`mine-rules.mjs`の`RULESET_VERSION`を上げます。
- 欧州の1店舗・1か月分のカテゴリ単位のデータです。日本の店舗の傾向を表すものではありません。例えばパスタ→ソースの関連はこのデータでは確認できず、初期ルールで補っています。実店舗の注文が貯まったら、同じ手順で置き換えます。
