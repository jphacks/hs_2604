# APP-04 関連購買ルールの評価結果

このファイルは `node mine-rules.mjs` が生成します。手で編集しません。

- 出典：Groceries (arules)（commit `cb89f0fc9996180a7044e5dd1b5a86d1fc577071`、sha256 `7a0e3408c631b5e3fe69af035a1209ffaf22b43b4af16218c5d5d23e761e6164`）
- ルールの版：1
- 全9835件のレシートを、通し番号で学習7868件・評価1967件（5件ごとに1件）へ分割
- 採用条件：学習で同時購入10件以上かつlift 1.2以上、評価で同時購入3件以上かつlift 1以上。デモ商品ごとにconfidence上位4件とlift上位4件を残す

## 評価（評価データ・Leave-one-out）

評価データのうちデモ商品へ対応する品目を2つ以上含むレシートで、1品目を隠し、残りの品目から上位3件を選んで当たるかを測りました。

| 方法 | 評価件数 | 候補を出せた割合 | 上位3件の的中率 |
| --- | --- | --- | --- |
| 関連購買ルール（liftの高い順） | 1979 | 99.8% | 19.7% |
| 関連購買ルール（confidenceの高い順） | 1979 | 99.8% | 48.3% |
| 比較：よく売れる品目の上位3件 | 1979 | 100.0% | 51.2% |

### 結果の読み方

- 「隠した品目を当てる」だけなら、よく売れる品目（牛乳・野菜など）を出す方法が強い。confidence順はその性質に近く、lift順は「その商品を買う人に特有の組み合わせ」を優先するため的中率は下がる。
- Appの通常推薦（APP-05）では的中しやすいconfidenceを、セレンディピティ販促（APP-13）では意外性のあるliftを主に使えるよう、両方の値をルールに保存する。
- 公開データは欧州のスーパー1店舗・1か月分で、品目はカテゴリ単位。デモ商品への対応は近いカテゴリへの近似であり、日本の店舗の購買傾向を表すものではない。実店舗の注文が貯まったら同じ手順で置き換える。

## 採用したカテゴリ間ルール（202件）

| ルール | 学習の同時購入数 | confidence | lift | 評価の同時購入数 | 評価のlift |
| --- | --- | --- | --- | --- | --- |
| hygiene articles → napkins | 48 | 18.6% | 3.61 | 12 | 3.28 |
| napkins → hygiene articles | 48 | 11.8% | 3.61 | 12 | 3.28 |
| chicken → herbs | 15 | 4.4% | 2.81 | 5 | 3.28 |
| herbs → chicken | 15 | 12.2% | 2.81 | 5 | 3.28 |
| pip fruit → tropical fruit | 163 | 26.6% | 2.55 | 38 | 2.71 |
| tropical fruit → pip fruit | 163 | 19.8% | 2.55 | 38 | 2.71 |
| domestic eggs → onions | 40 | 8.2% | 2.54 | 8 | 2.25 |
| onions → domestic eggs | 40 | 15.7% | 2.54 | 8 | 2.25 |
| domestic eggs → hygiene articles | 37 | 7.6% | 2.32 | 10 | 2.18 |
| hygiene articles → domestic eggs | 37 | 14.3% | 2.32 | 10 | 2.18 |
| chicken → onions | 25 | 7.3% | 2.27 | 3 | 1.43 |
| onions → chicken | 25 | 9.8% | 2.27 | 3 | 1.43 |
| domestic eggs → white bread | 47 | 9.7% | 2.23 | 10 | 1.94 |
| white bread → domestic eggs | 47 | 13.8% | 2.23 | 10 | 1.94 |
| chicken → domestic eggs | 45 | 13.2% | 2.13 | 16 | 2.84 |
| domestic eggs → chicken | 45 | 9.2% | 2.13 | 16 | 2.84 |
| hygiene articles → detergent | 11 | 4.3% | 2.12 | 4 | 3.85 |
| detergent → hygiene articles | 11 | 7.0% | 2.12 | 4 | 3.85 |
| tropical fruit → white bread | 75 | 9.1% | 2.11 | 11 | 1.40 |
| white bread → tropical fruit | 75 | 22.1% | 2.11 | 11 | 1.40 |
| domestic eggs → herbs | 16 | 3.3% | 2.10 | 5 | 1.94 |
| herbs → domestic eggs | 16 | 13.0% | 2.10 | 5 | 1.94 |
| pip fruit → white bread | 55 | 9.0% | 2.08 | 10 | 2.01 |
| white bread → pip fruit | 55 | 16.2% | 2.08 | 10 | 2.01 |
| chocolate → salty snack | 30 | 7.9% | 2.06 | 5 | 1.29 |
| salty snack → chocolate | 30 | 9.9% | 2.06 | 5 | 1.29 |
| napkins → onions | 27 | 6.7% | 2.06 | 4 | 1.42 |
| onions → napkins | 27 | 10.6% | 2.06 | 4 | 1.42 |
| chocolate → white bread | 33 | 8.7% | 2.01 | 9 | 2.19 |
| white bread → chocolate | 33 | 9.7% | 2.01 | 9 | 2.19 |
| hygiene articles → pip fruit | 40 | 15.5% | 1.99 | 7 | 1.58 |
| pip fruit → hygiene articles | 40 | 6.5% | 1.99 | 7 | 1.58 |
| tropical fruit → yogurt | 222 | 27.0% | 1.96 | 66 | 2.15 |
| yogurt → tropical fruit | 222 | 20.5% | 1.96 | 66 | 2.15 |
| pasta → white bread | 10 | 8.4% | 1.94 | 4 | 3.67 |
| pip fruit → pasta | 18 | 2.9% | 1.94 | 5 | 2.57 |
| white bread → pasta | 10 | 2.9% | 1.94 | 4 | 3.67 |
| pasta → pip fruit | 18 | 15.1% | 1.94 | 5 | 2.57 |
| napkins → salty snack | 30 | 7.4% | 1.93 | 10 | 2.58 |
| salty snack → napkins | 30 | 9.9% | 1.93 | 10 | 2.58 |
| hygiene articles → tropical fruit | 51 | 19.8% | 1.89 | 15 | 2.14 |
| tropical fruit → hygiene articles | 51 | 6.2% | 1.89 | 15 | 2.14 |
| whole milk → detergent | 76 | 3.8% | 1.88 | 12 | 1.51 |
| detergent → whole milk | 76 | 48.1% | 1.88 | 12 | 1.51 |
| whole milk → herbs | 59 | 2.9% | 1.88 | 17 | 1.80 |
| herbs → whole milk | 59 | 48.0% | 1.88 | 17 | 1.80 |
| napkins → detergent | 15 | 3.7% | 1.84 | 4 | 2.33 |
| detergent → napkins | 15 | 9.5% | 1.84 | 4 | 2.33 |
| domestic eggs → napkins | 46 | 9.4% | 1.83 | 13 | 1.71 |
| napkins → domestic eggs | 46 | 11.3% | 1.83 | 13 | 1.71 |
| white bread → onions | 20 | 5.9% | 1.82 | 4 | 2.08 |
| onions → white bread | 20 | 7.9% | 1.82 | 4 | 2.08 |
| whole milk → domestic eggs | 225 | 11.2% | 1.81 | 70 | 2.00 |
| domestic eggs → whole milk | 225 | 46.2% | 1.81 | 70 | 2.00 |
| tropical fruit → onions | 48 | 5.8% | 1.81 | 8 | 1.48 |
| onions → tropical fruit | 48 | 18.9% | 1.81 | 8 | 1.48 |
| domestic eggs → pip fruit | 68 | 14.0% | 1.80 | 17 | 1.85 |
| pip fruit → domestic eggs | 68 | 11.1% | 1.80 | 17 | 1.85 |
| pip fruit → detergent | 22 | 3.6% | 1.79 | 3 | 1.44 |
| detergent → pip fruit | 22 | 13.9% | 1.79 | 3 | 1.44 |
| chocolate → napkins | 35 | 9.2% | 1.79 | 13 | 2.15 |
| napkins → chocolate | 35 | 8.6% | 1.79 | 13 | 2.15 |
| tropical fruit → napkins | 76 | 9.2% | 1.79 | 23 | 1.99 |
| napkins → tropical fruit | 76 | 18.7% | 1.79 | 23 | 1.99 |
| pip fruit → yogurt | 149 | 24.3% | 1.77 | 28 | 1.44 |
| yogurt → pip fruit | 149 | 13.8% | 1.77 | 28 | 1.44 |
| napkins → herbs | 11 | 2.7% | 1.73 | 3 | 1.46 |
| herbs → napkins | 11 | 8.9% | 1.73 | 3 | 1.46 |
| onions → yogurt | 60 | 23.6% | 1.72 | 11 | 1.47 |
| yogurt → onions | 60 | 5.5% | 1.72 | 11 | 1.47 |
| herbs → yogurt | 29 | 23.6% | 1.71 | 6 | 1.10 |
| yogurt → herbs | 29 | 2.7% | 1.71 | 6 | 1.10 |
| whole milk → chicken | 149 | 7.4% | 1.71 | 24 | 1.16 |
| chicken → whole milk | 149 | 43.7% | 1.71 | 24 | 1.16 |
| napkins → yogurt | 95 | 23.4% | 1.70 | 26 | 1.62 |
| yogurt → napkins | 95 | 8.8% | 1.70 | 26 | 1.62 |
| detergent → tropical fruit | 28 | 17.7% | 1.69 | 5 | 1.52 |
| tropical fruit → detergent | 28 | 3.4% | 1.69 | 5 | 1.52 |
| hygiene articles → chocolate | 21 | 8.1% | 1.69 | 6 | 1.64 |
| chocolate → hygiene articles | 21 | 5.5% | 1.69 | 6 | 1.64 |
| domestic eggs → tropical fruit | 85 | 17.5% | 1.67 | 27 | 1.85 |
| tropical fruit → domestic eggs | 85 | 10.3% | 1.67 | 27 | 1.85 |
| chocolate → pip fruit | 49 | 12.9% | 1.66 | 11 | 1.50 |
| pip fruit → chocolate | 49 | 8.0% | 1.66 | 11 | 1.50 |
| chicken → napkins | 29 | 8.5% | 1.65 | 9 | 2.01 |
| napkins → chicken | 29 | 7.1% | 1.65 | 9 | 2.01 |
| tea → whole milk | 13 | 41.9% | 1.64 | 3 | 1.68 |
| whole milk → tea | 13 | 0.6% | 1.64 | 3 | 1.68 |
| hygiene articles → coffee | 24 | 9.3% | 1.63 | 8 | 1.95 |
| coffee → hygiene articles | 24 | 5.3% | 1.63 | 8 | 1.95 |
| hygiene articles → white bread | 18 | 7.0% | 1.61 | 6 | 2.42 |
| white bread → hygiene articles | 18 | 5.3% | 1.61 | 6 | 2.42 |
| hygiene articles → yogurt | 57 | 22.1% | 1.61 | 15 | 1.55 |
| yogurt → hygiene articles | 57 | 5.3% | 1.61 | 15 | 1.55 |
| Instant food products → tropical fruit | 12 | 16.7% | 1.59 | 3 | 4.03 |
| tropical fruit → Instant food products | 12 | 1.5% | 1.59 | 3 | 4.03 |
| domestic eggs → yogurt | 106 | 21.8% | 1.58 | 35 | 1.74 |
| yogurt → domestic eggs | 106 | 9.8% | 1.58 | 35 | 1.74 |
| whole milk → yogurt | 437 | 21.7% | 1.58 | 114 | 1.54 |
| yogurt → whole milk | 437 | 40.4% | 1.58 | 114 | 1.54 |
| tropical fruit → bottled water | 147 | 17.9% | 1.58 | 35 | 1.67 |
| bottled water → tropical fruit | 147 | 16.5% | 1.58 | 35 | 1.67 |
| tropical fruit → whole milk | 330 | 40.1% | 1.57 | 86 | 1.61 |
| whole milk → tropical fruit | 330 | 16.4% | 1.57 | 86 | 1.61 |
| chocolate → tropical fruit | 62 | 16.4% | 1.56 | 18 | 1.55 |
| tropical fruit → chocolate | 62 | 7.5% | 1.56 | 18 | 1.55 |
| whole milk → pip fruit | 243 | 12.1% | 1.55 | 53 | 1.57 |
| pip fruit → whole milk | 243 | 39.7% | 1.55 | 53 | 1.57 |
| hygiene articles → bottled water | 45 | 17.4% | 1.54 | 11 | 1.66 |
| bottled water → hygiene articles | 45 | 5.1% | 1.54 | 11 | 1.66 |
| detergent → yogurt | 33 | 20.9% | 1.52 | 6 | 1.32 |
| yogurt → detergent | 33 | 3.0% | 1.52 | 6 | 1.32 |
| bottled water → herbs | 21 | 2.4% | 1.51 | 9 | 2.43 |
| herbs → bottled water | 21 | 17.1% | 1.51 | 9 | 2.43 |
| bottled water → napkins | 69 | 7.8% | 1.50 | 16 | 1.47 |
| napkins → bottled water | 69 | 17.0% | 1.50 | 16 | 1.47 |
| salty snack → domestic eggs | 28 | 9.3% | 1.50 | 7 | 1.44 |
| domestic eggs → salty snack | 28 | 5.7% | 1.50 | 7 | 1.44 |
| whole milk → white bread | 130 | 6.5% | 1.50 | 38 | 2.01 |
| white bread → whole milk | 130 | 38.2% | 1.50 | 38 | 2.01 |
| white bread → yogurt | 70 | 20.6% | 1.50 | 19 | 1.75 |
| yogurt → white bread | 70 | 6.5% | 1.50 | 19 | 1.75 |
| whole milk → onions | 97 | 4.8% | 1.49 | 22 | 1.69 |
| onions → whole milk | 97 | 38.2% | 1.49 | 22 | 1.69 |
| pip fruit → coffee | 52 | 8.5% | 1.49 | 16 | 1.95 |
| coffee → pip fruit | 52 | 11.6% | 1.49 | 16 | 1.95 |
| pip fruit → napkins | 47 | 7.7% | 1.49 | 19 | 2.60 |
| napkins → pip fruit | 47 | 11.6% | 1.49 | 19 | 2.60 |
| napkins → white bread | 26 | 6.4% | 1.48 | 8 | 1.95 |
| white bread → napkins | 26 | 7.6% | 1.48 | 8 | 1.95 |
| chocolate → onions | 18 | 4.7% | 1.47 | 4 | 1.42 |
| onions → chocolate | 18 | 7.1% | 1.47 | 4 | 1.42 |
| chicken → yogurt | 69 | 20.2% | 1.47 | 13 | 1.09 |
| yogurt → chicken | 69 | 6.4% | 1.47 | 13 | 1.09 |
| chicken → detergent | 10 | 2.9% | 1.46 | 3 | 2.35 |
| detergent → chicken | 10 | 6.3% | 1.46 | 3 | 2.35 |
| whole milk → hygiene articles | 96 | 4.8% | 1.46 | 30 | 1.78 |
| hygiene articles → whole milk | 96 | 37.2% | 1.46 | 30 | 1.78 |
| salty snack → white bread | 19 | 6.3% | 1.46 | 6 | 2.28 |
| white bread → salty snack | 19 | 5.6% | 1.46 | 6 | 2.28 |
| coffee → onions | 21 | 4.7% | 1.45 | 4 | 1.26 |
| onions → coffee | 21 | 8.3% | 1.45 | 4 | 1.26 |
| whole milk → pasta | 44 | 2.2% | 1.45 | 16 | 2.16 |
| pasta → whole milk | 44 | 37.0% | 1.45 | 16 | 2.16 |
| chicken → coffee | 28 | 8.2% | 1.44 | 10 | 1.99 |
| coffee → chicken | 28 | 6.2% | 1.44 | 10 | 1.99 |
| chicken → tropical fruit | 51 | 15.0% | 1.43 | 12 | 1.39 |
| tropical fruit → chicken | 51 | 6.2% | 1.43 | 12 | 1.39 |
| bottled water → yogurt | 175 | 19.7% | 1.43 | 51 | 1.76 |
| yogurt → bottled water | 175 | 16.2% | 1.43 | 51 | 1.76 |
| whole milk → napkins | 148 | 7.4% | 1.43 | 46 | 1.65 |
| napkins → whole milk | 148 | 36.5% | 1.43 | 46 | 1.65 |
| chicken → white bread | 21 | 6.2% | 1.43 | 4 | 1.31 |
| white bread → chicken | 21 | 6.2% | 1.43 | 4 | 1.31 |
| pip fruit → salty snack | 33 | 5.4% | 1.40 | 7 | 1.49 |
| salty snack → pip fruit | 33 | 10.9% | 1.40 | 7 | 1.49 |
| salty snack → tropical fruit | 44 | 14.6% | 1.39 | 11 | 1.48 |
| tropical fruit → salty snack | 44 | 5.3% | 1.39 | 11 | 1.48 |
| chocolate → coffee | 30 | 7.9% | 1.39 | 8 | 1.18 |
| coffee → chocolate | 30 | 6.7% | 1.39 | 8 | 1.18 |
| chicken → salty snack | 18 | 5.3% | 1.38 | 3 | 1.04 |
| salty snack → chicken | 18 | 6.0% | 1.38 | 3 | 1.04 |
| Instant food products → whole milk | 25 | 34.7% | 1.36 | 5 | 2.79 |
| whole milk → Instant food products | 25 | 1.2% | 1.36 | 5 | 2.79 |
| pasta → domestic eggs | 10 | 8.4% | 1.36 | 6 | 2.97 |
| domestic eggs → pasta | 10 | 2.1% | 1.36 | 6 | 2.97 |
| domestic eggs → rolls/buns | 121 | 24.8% | 1.34 | 33 | 1.34 |
| rolls/buns → domestic eggs | 121 | 8.3% | 1.34 | 33 | 1.34 |
| pasta → yogurt | 22 | 18.5% | 1.34 | 9 | 2.11 |
| yogurt → pasta | 22 | 2.0% | 1.34 | 9 | 2.11 |
| coffee → salty snack | 23 | 5.1% | 1.33 | 7 | 1.61 |
| salty snack → coffee | 23 | 7.6% | 1.33 | 7 | 1.61 |
| salty snack → onions | 13 | 4.3% | 1.33 | 3 | 1.65 |
| onions → salty snack | 13 | 5.1% | 1.33 | 3 | 1.65 |
| rolls/buns → yogurt | 266 | 18.3% | 1.33 | 72 | 1.38 |
| yogurt → rolls/buns | 266 | 24.6% | 1.33 | 72 | 1.38 |
| chicken → pip fruit | 35 | 10.3% | 1.32 | 12 | 2.21 |
| pip fruit → chicken | 35 | 5.7% | 1.32 | 12 | 2.21 |
| domestic eggs → bottled water | 72 | 14.8% | 1.31 | 18 | 1.31 |
| bottled water → domestic eggs | 72 | 8.1% | 1.31 | 18 | 1.31 |
| chocolate → yogurt | 68 | 17.9% | 1.30 | 23 | 1.44 |
| yogurt → chocolate | 68 | 6.3% | 1.30 | 23 | 1.44 |
| coffee → domestic eggs | 36 | 8.0% | 1.30 | 13 | 1.53 |
| domestic eggs → coffee | 36 | 7.4% | 1.30 | 13 | 1.53 |
| tropical fruit → rolls/buns | 197 | 23.9% | 1.29 | 45 | 1.20 |
| rolls/buns → tropical fruit | 197 | 13.5% | 1.29 | 45 | 1.20 |
| whole milk → chocolate | 124 | 6.2% | 1.28 | 40 | 1.44 |
| chocolate → whole milk | 124 | 32.7% | 1.28 | 40 | 1.44 |
| pip fruit → onions | 25 | 4.1% | 1.27 | 9 | 2.63 |
| onions → pip fruit | 25 | 9.8% | 1.27 | 9 | 2.63 |
| whole milk → coffee | 145 | 7.2% | 1.26 | 39 | 1.25 |
| coffee → whole milk | 145 | 32.3% | 1.26 | 39 | 1.25 |
| bottled water → pasta | 17 | 1.9% | 1.26 | 3 | 1.03 |
| pasta → bottled water | 17 | 14.3% | 1.26 | 3 | 1.03 |
| bottled water → pip fruit | 86 | 9.7% | 1.24 | 18 | 1.36 |
| pip fruit → bottled water | 86 | 14.1% | 1.24 | 18 | 1.36 |
| rolls/buns → chocolate | 87 | 6.0% | 1.24 | 29 | 1.48 |
| chocolate → rolls/buns | 87 | 23.0% | 1.24 | 29 | 1.48 |
| rolls/buns → bottled water | 199 | 13.7% | 1.21 | 39 | 1.10 |
| bottled water → rolls/buns | 199 | 22.4% | 1.21 | 39 | 1.10 |
| coffee → napkins | 28 | 6.2% | 1.21 | 12 | 1.78 |
| napkins → coffee | 28 | 6.9% | 1.21 | 12 | 1.78 |

デモ商品へ展開したルール：133件（`association-rules.json`）。

## 採用しなかったルール（学習では基準を満たしたもの、48件）

| ルール | 学習の同時購入数 | confidence | lift | 評価の同時購入数 | 評価のlift | 理由 |
| --- | --- | --- | --- | --- | --- | --- |
| tea → tropical fruit | 11 | 35.5% | 3.39 | 2 | 2.69 | 評価データで同時購入をほぼ確認できない |
| tropical fruit → tea | 11 | 1.3% | 3.39 | 2 | 2.69 | 評価データで同時購入をほぼ確認できない |
| herbs → onions | 13 | 10.6% | 3.27 | 1 | 1.04 | 評価データで同時購入をほぼ確認できない |
| onions → herbs | 13 | 5.1% | 3.27 | 1 | 1.04 | 評価データで同時購入をほぼ確認できない |
| chicken → pasta | 14 | 4.1% | 2.71 | 2 | 1.67 | 評価データで同時購入をほぼ確認できない |
| pasta → chicken | 14 | 11.8% | 2.71 | 2 | 1.67 | 評価データで同時購入をほぼ確認できない |
| hygiene articles → pasta | 10 | 3.9% | 2.56 | 2 | 2.06 | 評価データで同時購入をほぼ確認できない |
| pasta → hygiene articles | 10 | 8.4% | 2.56 | 2 | 2.06 | 評価データで同時購入をほぼ確認できない |
| herbs → pip fruit | 22 | 17.9% | 2.30 | 2 | 0.81 | 評価データで同時購入をほぼ確認できない |
| pip fruit → herbs | 22 | 3.6% | 2.30 | 2 | 0.81 | 評価データで同時購入をほぼ確認できない |
| white bread → detergent | 15 | 4.4% | 2.20 | 2 | 1.71 | 評価データで同時購入をほぼ確認できない |
| detergent → white bread | 15 | 9.5% | 2.20 | 2 | 1.71 | 評価データで同時購入をほぼ確認できない |
| hygiene articles → onions | 18 | 7.0% | 2.16 | 2 | 1.17 | 評価データで同時購入をほぼ確認できない |
| onions → hygiene articles | 18 | 7.1% | 2.16 | 2 | 1.17 | 評価データで同時購入をほぼ確認できない |
| sauces → tropical fruit | 10 | 21.7% | 2.08 | 2 | 2.35 | 評価データで同時購入をほぼ確認できない |
| tropical fruit → sauces | 10 | 1.2% | 2.08 | 2 | 2.35 | 評価データで同時購入をほぼ確認できない |
| coffee → pasta | 14 | 3.1% | 2.06 | 0 | 0.00 | 評価データで同時購入をほぼ確認できない |
| pasta → coffee | 14 | 11.8% | 2.06 | 0 | 0.00 | 評価データで同時購入をほぼ確認できない |
| tropical fruit → herbs | 25 | 3.0% | 1.94 | 3 | 0.76 | 評価データでは関連が再現しない |
| herbs → tropical fruit | 25 | 20.3% | 1.94 | 3 | 0.76 | 評価データでは関連が再現しない |
| bottled water → onions | 54 | 6.1% | 1.88 | 4 | 0.78 | 評価データでは関連が再現しない |
| onions → bottled water | 54 | 21.3% | 1.88 | 4 | 0.78 | 評価データでは関連が再現しない |
| whole milk → potato products | 11 | 0.5% | 1.72 | 1 | 1.30 | 評価データで同時購入をほぼ確認できない |
| potato products → whole milk | 11 | 44.0% | 1.72 | 1 | 1.30 | 評価データで同時購入をほぼ確認できない |
| sauces → whole milk | 19 | 41.3% | 1.62 | 2 | 0.98 | 評価データで同時購入をほぼ確認できない |
| whole milk → sauces | 19 | 0.9% | 1.62 | 2 | 0.98 | 評価データで同時購入をほぼ確認できない |
| Instant food products → rolls/buns | 21 | 29.2% | 1.58 | 2 | 1.59 | 評価データで同時購入をほぼ確認できない |
| rolls/buns → Instant food products | 21 | 1.4% | 1.58 | 2 | 1.59 | 評価データで同時購入をほぼ確認できない |
| tropical fruit → pasta | 19 | 2.3% | 1.53 | 3 | 0.97 | 評価データでは関連が再現しない |
| pasta → tropical fruit | 19 | 16.0% | 1.53 | 3 | 0.97 | 評価データでは関連が再現しない |
| hygiene articles → chicken | 17 | 6.6% | 1.52 | 2 | 0.74 | 評価データで同時購入をほぼ確認できない |
| chicken → hygiene articles | 17 | 5.0% | 1.52 | 2 | 0.74 | 評価データで同時購入をほぼ確認できない |
| hygiene articles → salty snack | 14 | 5.4% | 1.41 | 2 | 0.85 | 評価データで同時購入をほぼ確認できない |
| salty snack → hygiene articles | 14 | 4.6% | 1.41 | 2 | 0.85 | 評価データで同時購入をほぼ確認できない |
| chicken → chocolate | 23 | 6.7% | 1.40 | 4 | 0.89 | 評価データでは関連が再現しない |
| chocolate → chicken | 23 | 6.1% | 1.40 | 4 | 0.89 | 評価データでは関連が再現しない |
| domestic eggs → detergent | 13 | 2.7% | 1.33 | 2 | 0.93 | 評価データで同時購入をほぼ確認できない |
| detergent → domestic eggs | 13 | 8.2% | 1.33 | 2 | 0.93 | 評価データで同時購入をほぼ確認できない |
| napkins → rolls/buns | 98 | 24.1% | 1.31 | 17 | 0.87 | 評価データでは関連が再現しない |
| rolls/buns → napkins | 98 | 6.7% | 1.31 | 17 | 0.87 | 評価データでは関連が再現しない |
| onions → rolls/buns | 60 | 23.6% | 1.28 | 7 | 0.76 | 評価データでは関連が再現しない |
| rolls/buns → onions | 60 | 4.1% | 1.28 | 7 | 0.76 | 評価データでは関連が再現しない |
| bottled water → coffee | 62 | 7.0% | 1.22 | 10 | 0.82 | 評価データでは関連が再現しない |
| coffee → bottled water | 62 | 13.8% | 1.22 | 10 | 0.82 | 評価データでは関連が再現しない |
| Instant food products → yogurt | 12 | 16.7% | 1.21 | 2 | 1.94 | 評価データで同時購入をほぼ確認できない |
| yogurt → Instant food products | 12 | 1.1% | 1.21 | 2 | 1.94 | 評価データで同時購入をほぼ確認できない |
| salty snack → whole milk | 93 | 30.8% | 1.21 | 17 | 0.95 | 評価データでは関連が再現しない |
| whole milk → salty snack | 93 | 4.6% | 1.21 | 17 | 0.95 | 評価データでは関連が再現しない |

## 初期ルール（6件）

公開データに対応品目がない商品（例：生バジルは`herbs`に対応するが同時購入が少ない）や、分析ルールが出ない場合に使う手作業のルールです。`origin = initial`として分析ルールと区別します。

| ID | 対象 | 候補 | 理由 |
| --- | --- | --- | --- |
| init-pasta-sauce | 2900000000100 | 2900000000162 | スパゲッティと一緒に使えます |
| init-pasta-basil | 2900000000100 | 2900000000179 | スパゲッティの仕上げに合います |
| init-sauce-pasta | 2900000000162 | 2900000000100 | トマトパスタソースと一緒に使えます |
| init-curry-onion | 2900000000094 | PLU-1001 | カレーの具材に使えます |
| init-bread-milk | 2900000000056 | 2900000000049 | 朝食の組み合わせです |
| init-bread-egg | 2900000000056 | 2900000000063 | 朝食の組み合わせです |
