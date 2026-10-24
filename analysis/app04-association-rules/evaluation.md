# APP-04 関連購買ルールの評価結果

このファイルは `node mine-rules.mjs` が生成します。手で編集しません。

- 出典：Groceries (arules)（commit `cb89f0fc9996180a7044e5dd1b5a86d1fc577071`、sha256 `7a0e3408c631b5e3fe69af035a1209ffaf22b43b4af16218c5d5d23e761e6164`）
- ルールの版：2
- 全9835件のレシートを、通し番号で学習7868件・評価1967件（5件ごとに1件）へ分割
- 採用条件：学習で同時購入10件以上かつlift 1.2以上、評価で同時購入3件以上かつlift 1以上。デモ商品ごとにconfidence上位4件とlift上位4件を残す

## 評価（評価データ・Leave-one-out）

評価データのうちデモ商品へ対応する品目を2つ以上含むレシートで、1品目を隠し、残りの品目から上位3件を選んで当たるかを測りました。

| 方法 | 評価件数 | 候補を出せた割合 | 上位3件の的中率 |
| --- | --- | --- | --- |
| 関連購買ルール（liftの高い順） | 3026 | 99.9% | 14.1% |
| 関連購買ルール（confidenceの高い順） | 3026 | 99.9% | 44.7% |
| 比較：よく売れる品目の上位3件 | 3026 | 100.0% | 43.5% |

### 結果の読み方

- 「隠した品目を当てる」だけなら、よく売れる品目（牛乳・野菜など）を出す方法が強い。confidence順はその性質に近く、lift順は「その商品を買う人に特有の組み合わせ」を優先するため的中率は下がる。
- Appの通常推薦（APP-05）では的中しやすいconfidenceを、セレンディピティ販促（APP-13）では意外性のあるliftを主に使えるよう、両方の値をルールに保存する。
- 公開データは欧州のスーパー1店舗・1か月分で、品目はカテゴリ単位。デモ商品への対応は近いカテゴリへの近似であり、日本の店舗の購買傾向を表すものではない。実店舗の注文が貯まったら同じ手順で置き換える。

## 採用したカテゴリ間ルール（406件）

| ルール | 学習の同時購入数 | confidence | lift | 評価の同時購入数 | 評価のlift |
| --- | --- | --- | --- | --- | --- |
| hamburger meat → Instant food products | 25 | 9.6% | 10.51 | 5 | 20.97 |
| Instant food products → hamburger meat | 25 | 34.7% | 10.51 | 5 | 20.97 |
| hamburger meat → pasta | 21 | 8.1% | 5.34 | 6 | 6.07 |
| pasta → hamburger meat | 21 | 17.6% | 5.34 | 6 | 6.07 |
| white bread → ham | 41 | 12.1% | 4.79 | 9 | 4.12 |
| ham → white bread | 41 | 20.7% | 4.79 | 9 | 4.12 |
| herbs → root vegetables | 58 | 47.2% | 4.34 | 11 | 2.68 |
| root vegetables → herbs | 58 | 6.8% | 4.34 | 11 | 2.68 |
| hygiene articles → napkins | 48 | 18.6% | 3.61 | 12 | 3.28 |
| napkins → hygiene articles | 48 | 11.8% | 3.61 | 12 | 3.28 |
| beef → herbs | 21 | 5.2% | 3.30 | 7 | 3.41 |
| herbs → beef | 21 | 17.1% | 3.30 | 7 | 3.41 |
| beef → root vegetables | 134 | 32.9% | 3.03 | 37 | 3.06 |
| root vegetables → beef | 134 | 15.7% | 3.03 | 37 | 3.06 |
| onions → root vegetables | 78 | 30.7% | 2.83 | 15 | 2.65 |
| root vegetables → onions | 78 | 9.1% | 2.83 | 15 | 2.65 |
| chicken → herbs | 15 | 4.4% | 2.81 | 5 | 3.28 |
| herbs → chicken | 15 | 12.2% | 2.81 | 5 | 3.28 |
| beef → pork | 61 | 15.0% | 2.63 | 14 | 2.14 |
| pork → beef | 61 | 13.6% | 2.63 | 14 | 2.14 |
| pip fruit → tropical fruit | 163 | 26.6% | 2.55 | 38 | 2.71 |
| tropical fruit → pip fruit | 163 | 19.8% | 2.55 | 38 | 2.71 |
| domestic eggs → onions | 40 | 8.2% | 2.54 | 8 | 2.25 |
| onions → domestic eggs | 40 | 15.7% | 2.54 | 8 | 2.25 |
| domestic eggs → ham | 31 | 6.4% | 2.53 | 10 | 2.48 |
| ham → domestic eggs | 31 | 15.7% | 2.53 | 10 | 2.48 |
| chicken → hamburger meat | 28 | 8.2% | 2.48 | 9 | 3.26 |
| hamburger meat → chicken | 28 | 10.8% | 2.48 | 9 | 3.26 |
| hygiene articles → hamburger meat | 21 | 8.1% | 2.46 | 4 | 1.78 |
| hamburger meat → hygiene articles | 21 | 8.1% | 2.46 | 4 | 1.78 |
| onions → other vegetables | 119 | 46.9% | 2.45 | 21 | 2.04 |
| other vegetables → onions | 119 | 7.9% | 2.45 | 21 | 2.04 |
| herbs → pork | 17 | 13.8% | 2.42 | 4 | 1.80 |
| pork → herbs | 17 | 3.8% | 2.42 | 4 | 1.80 |
| pasta → root vegetables | 31 | 26.1% | 2.40 | 7 | 2.18 |
| root vegetables → pasta | 31 | 3.6% | 2.40 | 7 | 2.18 |
| herbs → other vegetables | 56 | 45.5% | 2.38 | 20 | 2.67 |
| other vegetables → herbs | 56 | 3.7% | 2.38 | 20 | 2.67 |
| chicken → root vegetables | 88 | 25.8% | 2.38 | 19 | 2.12 |
| root vegetables → chicken | 88 | 10.3% | 2.38 | 19 | 2.12 |
| pork → root vegetables | 115 | 25.6% | 2.36 | 19 | 1.45 |
| root vegetables → pork | 115 | 13.5% | 2.36 | 19 | 1.45 |
| domestic eggs → hygiene articles | 37 | 7.6% | 2.32 | 10 | 2.18 |
| hygiene articles → domestic eggs | 37 | 14.3% | 2.32 | 10 | 2.18 |
| beef → pasta | 14 | 3.4% | 2.27 | 3 | 1.87 |
| pasta → beef | 14 | 11.8% | 2.27 | 3 | 1.87 |
| chicken → onions | 25 | 7.3% | 2.27 | 3 | 1.43 |
| onions → chicken | 25 | 9.8% | 2.27 | 3 | 1.43 |
| other vegetables → root vegetables | 367 | 24.4% | 2.25 | 99 | 2.24 |
| root vegetables → other vegetables | 367 | 43.0% | 2.25 | 99 | 2.24 |
| domestic eggs → white bread | 47 | 9.7% | 2.23 | 10 | 1.94 |
| white bread → domestic eggs | 47 | 13.8% | 2.23 | 10 | 1.94 |
| chicken → pork | 43 | 12.6% | 2.21 | 14 | 2.88 |
| pork → chicken | 43 | 9.6% | 2.21 | 14 | 2.88 |
| pork → onions | 32 | 7.1% | 2.21 | 6 | 1.96 |
| onions → pork | 32 | 12.6% | 2.21 | 6 | 1.96 |
| chocolate → ham | 21 | 5.5% | 2.20 | 6 | 1.87 |
| ham → chocolate | 21 | 10.6% | 2.20 | 6 | 1.87 |
| hamburger meat → other vegetables | 108 | 41.5% | 2.17 | 28 | 2.07 |
| other vegetables → hamburger meat | 108 | 7.2% | 2.17 | 28 | 2.07 |
| detergent → root vegetables | 37 | 23.4% | 2.16 | 6 | 1.75 |
| root vegetables → detergent | 37 | 4.3% | 2.16 | 6 | 1.75 |
| beef → hamburger meat | 29 | 7.1% | 2.16 | 8 | 2.15 |
| hamburger meat → beef | 29 | 11.2% | 2.16 | 8 | 2.15 |
| beef → chicken | 38 | 9.3% | 2.15 | 9 | 2.01 |
| chicken → beef | 38 | 11.1% | 2.15 | 9 | 2.01 |
| hamburger meat → white bread | 24 | 9.2% | 2.14 | 4 | 1.59 |
| white bread → hamburger meat | 24 | 7.1% | 2.14 | 4 | 1.59 |
| chicken → domestic eggs | 45 | 13.2% | 2.13 | 16 | 2.84 |
| domestic eggs → chicken | 45 | 9.2% | 2.13 | 16 | 2.84 |
| chicken → other vegetables | 139 | 40.8% | 2.13 | 37 | 2.26 |
| other vegetables → chicken | 139 | 9.2% | 2.13 | 37 | 2.26 |
| hygiene articles → detergent | 11 | 4.3% | 2.12 | 4 | 3.85 |
| detergent → hygiene articles | 11 | 7.0% | 2.12 | 4 | 3.85 |
| tropical fruit → white bread | 75 | 9.1% | 2.11 | 11 | 1.40 |
| white bread → tropical fruit | 75 | 22.1% | 2.11 | 11 | 1.40 |
| domestic eggs → herbs | 16 | 3.3% | 2.10 | 5 | 1.94 |
| herbs → domestic eggs | 16 | 13.0% | 2.10 | 5 | 1.94 |
| domestic eggs → root vegetables | 111 | 22.8% | 2.10 | 30 | 1.98 |
| root vegetables → domestic eggs | 111 | 13.0% | 2.10 | 30 | 1.98 |
| pip fruit → white bread | 55 | 9.0% | 2.08 | 10 | 2.01 |
| white bread → pip fruit | 55 | 16.2% | 2.08 | 10 | 2.01 |
| chocolate → salty snack | 30 | 7.9% | 2.06 | 5 | 1.29 |
| salty snack → chocolate | 30 | 9.9% | 2.06 | 5 | 1.29 |
| napkins → onions | 27 | 6.7% | 2.06 | 4 | 1.42 |
| onions → napkins | 27 | 10.6% | 2.06 | 4 | 1.42 |
| tea → other vegetables | 12 | 38.7% | 2.02 | 3 | 2.12 |
| other vegetables → tea | 12 | 0.8% | 2.02 | 3 | 2.12 |
| chocolate → white bread | 33 | 8.7% | 2.01 | 9 | 2.19 |
| white bread → chocolate | 33 | 9.7% | 2.01 | 9 | 2.19 |
| hygiene articles → pip fruit | 40 | 15.5% | 1.99 | 7 | 1.58 |
| pip fruit → hygiene articles | 40 | 6.5% | 1.99 | 7 | 1.58 |
| other vegetables → pork | 169 | 11.2% | 1.97 | 44 | 1.84 |
| pork → other vegetables | 169 | 37.6% | 1.97 | 44 | 1.84 |
| tropical fruit → yogurt | 222 | 27.0% | 1.96 | 66 | 2.15 |
| yogurt → tropical fruit | 222 | 20.5% | 1.96 | 66 | 2.15 |
| beef → detergent | 16 | 3.9% | 1.96 | 3 | 1.75 |
| detergent → beef | 16 | 10.1% | 1.96 | 3 | 1.75 |
| pip fruit → root vegetables | 130 | 21.2% | 1.96 | 23 | 1.57 |
| root vegetables → pip fruit | 130 | 15.2% | 1.96 | 23 | 1.57 |
| ham → pip fruit | 30 | 15.2% | 1.95 | 9 | 2.31 |
| pip fruit → ham | 30 | 4.9% | 1.95 | 9 | 2.31 |
| pasta → white bread | 10 | 8.4% | 1.94 | 4 | 3.67 |
| pip fruit → pasta | 18 | 2.9% | 1.94 | 5 | 2.57 |
| white bread → pasta | 10 | 2.9% | 1.94 | 4 | 3.67 |
| pasta → pip fruit | 18 | 15.1% | 1.94 | 5 | 2.57 |
| domestic eggs → hamburger meat | 31 | 6.4% | 1.93 | 9 | 1.93 |
| hamburger meat → domestic eggs | 31 | 11.9% | 1.93 | 9 | 1.93 |
| napkins → salty snack | 30 | 7.4% | 1.93 | 10 | 2.58 |
| salty snack → napkins | 30 | 9.9% | 1.93 | 10 | 2.58 |
| beef → onions | 25 | 6.1% | 1.90 | 6 | 2.12 |
| onions → beef | 25 | 9.8% | 1.90 | 6 | 2.12 |
| hygiene articles → pork | 28 | 10.9% | 1.90 | 6 | 1.52 |
| pork → hygiene articles | 28 | 6.2% | 1.90 | 6 | 1.52 |
| hygiene articles → tropical fruit | 51 | 19.8% | 1.89 | 15 | 2.14 |
| tropical fruit → hygiene articles | 51 | 6.2% | 1.89 | 15 | 2.14 |
| tropical fruit → ham | 39 | 4.7% | 1.88 | 14 | 2.27 |
| ham → tropical fruit | 39 | 19.7% | 1.88 | 14 | 2.27 |
| whole milk → detergent | 76 | 3.8% | 1.88 | 12 | 1.51 |
| detergent → whole milk | 76 | 48.1% | 1.88 | 12 | 1.51 |
| tropical fruit → root vegetables | 168 | 20.4% | 1.88 | 39 | 1.68 |
| root vegetables → tropical fruit | 168 | 19.7% | 1.88 | 39 | 1.68 |
| whole milk → herbs | 59 | 2.9% | 1.88 | 17 | 1.80 |
| herbs → whole milk | 59 | 48.0% | 1.88 | 17 | 1.80 |
| ham → onions | 12 | 6.1% | 1.88 | 5 | 3.32 |
| onions → ham | 12 | 4.7% | 1.88 | 5 | 3.32 |
| beef → other vegetables | 146 | 35.9% | 1.88 | 48 | 2.18 |
| other vegetables → beef | 146 | 9.7% | 1.88 | 48 | 2.18 |
| ham → yogurt | 51 | 25.8% | 1.87 | 15 | 1.76 |
| yogurt → ham | 51 | 4.7% | 1.87 | 15 | 1.76 |
| napkins → root vegetables | 82 | 20.2% | 1.86 | 16 | 1.32 |
| root vegetables → napkins | 82 | 9.6% | 1.86 | 16 | 1.32 |
| napkins → detergent | 15 | 3.7% | 1.84 | 4 | 2.33 |
| detergent → napkins | 15 | 9.5% | 1.84 | 4 | 2.33 |
| domestic eggs → napkins | 46 | 9.4% | 1.83 | 13 | 1.71 |
| napkins → domestic eggs | 46 | 11.3% | 1.83 | 13 | 1.71 |
| beef → domestic eggs | 46 | 11.3% | 1.83 | 13 | 1.71 |
| domestic eggs → beef | 46 | 9.4% | 1.83 | 13 | 1.71 |
| white bread → onions | 20 | 5.9% | 1.82 | 4 | 2.08 |
| onions → white bread | 20 | 7.9% | 1.82 | 4 | 2.08 |
| ham → other vegetables | 69 | 34.8% | 1.82 | 21 | 1.79 |
| other vegetables → ham | 69 | 4.6% | 1.82 | 21 | 1.79 |
| whole milk → hamburger meat | 121 | 6.0% | 1.82 | 24 | 1.40 |
| hamburger meat → whole milk | 121 | 46.5% | 1.82 | 24 | 1.40 |
| whole milk → domestic eggs | 225 | 11.2% | 1.81 | 70 | 2.00 |
| domestic eggs → whole milk | 225 | 46.2% | 1.81 | 70 | 2.00 |
| tropical fruit → onions | 48 | 5.8% | 1.81 | 8 | 1.48 |
| onions → tropical fruit | 48 | 18.9% | 1.81 | 8 | 1.48 |
| beef → hygiene articles | 24 | 5.9% | 1.80 | 8 | 2.19 |
| hygiene articles → beef | 24 | 9.3% | 1.80 | 8 | 2.19 |
| domestic eggs → pip fruit | 68 | 14.0% | 1.80 | 17 | 1.85 |
| pip fruit → domestic eggs | 68 | 11.1% | 1.80 | 17 | 1.85 |
| pip fruit → detergent | 22 | 3.6% | 1.79 | 3 | 1.44 |
| detergent → pip fruit | 22 | 13.9% | 1.79 | 3 | 1.44 |
| chocolate → napkins | 35 | 9.2% | 1.79 | 13 | 2.15 |
| napkins → chocolate | 35 | 8.6% | 1.79 | 13 | 2.15 |
| tropical fruit → napkins | 76 | 9.2% | 1.79 | 23 | 1.99 |
| napkins → tropical fruit | 76 | 18.7% | 1.79 | 23 | 1.99 |
| tropical fruit → other vegetables | 279 | 33.9% | 1.77 | 74 | 1.75 |
| other vegetables → tropical fruit | 279 | 18.5% | 1.77 | 74 | 1.75 |
| pip fruit → yogurt | 149 | 24.3% | 1.77 | 28 | 1.44 |
| yogurt → pip fruit | 149 | 13.8% | 1.77 | 28 | 1.44 |
| ham → napkins | 18 | 9.1% | 1.76 | 7 | 2.18 |
| napkins → ham | 18 | 4.4% | 1.76 | 7 | 2.18 |
| other vegetables → pip fruit | 205 | 13.6% | 1.75 | 52 | 1.95 |
| pip fruit → other vegetables | 205 | 33.5% | 1.75 | 52 | 1.95 |
| domestic eggs → other vegetables | 163 | 33.5% | 1.75 | 56 | 2.02 |
| other vegetables → domestic eggs | 163 | 10.8% | 1.75 | 56 | 2.02 |
| napkins → herbs | 11 | 2.7% | 1.73 | 3 | 1.46 |
| herbs → napkins | 11 | 8.9% | 1.73 | 3 | 1.46 |
| whole milk → root vegetables | 378 | 18.8% | 1.73 | 103 | 1.85 |
| root vegetables → whole milk | 378 | 44.3% | 1.73 | 103 | 1.85 |
| pip fruit → hamburger meat | 35 | 5.7% | 1.73 | 9 | 2.00 |
| hamburger meat → pip fruit | 35 | 13.5% | 1.73 | 9 | 2.00 |
| other vegetables → white bread | 112 | 7.4% | 1.72 | 23 | 1.54 |
| white bread → other vegetables | 112 | 32.9% | 1.72 | 23 | 1.54 |
| onions → yogurt | 60 | 23.6% | 1.72 | 11 | 1.47 |
| yogurt → onions | 60 | 5.5% | 1.72 | 11 | 1.47 |
| herbs → yogurt | 29 | 23.6% | 1.71 | 6 | 1.10 |
| yogurt → herbs | 29 | 2.7% | 1.71 | 6 | 1.10 |
| whole milk → chicken | 149 | 7.4% | 1.71 | 24 | 1.16 |
| chicken → whole milk | 149 | 43.7% | 1.71 | 24 | 1.16 |
| white bread → root vegetables | 63 | 18.5% | 1.71 | 15 | 1.83 |
| root vegetables → white bread | 63 | 7.4% | 1.71 | 15 | 1.83 |
| hamburger meat → root vegetables | 48 | 18.5% | 1.70 | 13 | 1.75 |
| root vegetables → hamburger meat | 48 | 5.6% | 1.70 | 13 | 1.75 |
| whole milk → ham | 86 | 4.3% | 1.70 | 27 | 1.82 |
| ham → whole milk | 86 | 43.4% | 1.70 | 27 | 1.82 |
| napkins → yogurt | 95 | 23.4% | 1.70 | 26 | 1.62 |
| yogurt → napkins | 95 | 8.8% | 1.70 | 26 | 1.62 |
| hygiene articles → ham | 11 | 4.3% | 1.69 | 3 | 1.54 |
| ham → hygiene articles | 11 | 5.6% | 1.69 | 3 | 1.54 |
| detergent → tropical fruit | 28 | 17.7% | 1.69 | 5 | 1.52 |
| tropical fruit → detergent | 28 | 3.4% | 1.69 | 5 | 1.52 |
| root vegetables → yogurt | 199 | 23.3% | 1.69 | 55 | 1.72 |
| yogurt → root vegetables | 199 | 18.4% | 1.69 | 55 | 1.72 |
| hygiene articles → chocolate | 21 | 8.1% | 1.69 | 6 | 1.64 |
| chocolate → hygiene articles | 21 | 5.5% | 1.69 | 6 | 1.64 |
| domestic eggs → tropical fruit | 85 | 17.5% | 1.67 | 27 | 1.85 |
| tropical fruit → domestic eggs | 85 | 10.3% | 1.67 | 27 | 1.85 |
| chocolate → pip fruit | 49 | 12.9% | 1.66 | 11 | 1.50 |
| pip fruit → chocolate | 49 | 8.0% | 1.66 | 11 | 1.50 |
| other vegetables → yogurt | 343 | 22.8% | 1.66 | 84 | 1.44 |
| yogurt → other vegetables | 343 | 31.7% | 1.66 | 84 | 1.44 |
| detergent → other vegetables | 50 | 31.6% | 1.65 | 13 | 2.07 |
| other vegetables → detergent | 50 | 3.3% | 1.65 | 13 | 2.07 |
| chicken → napkins | 29 | 8.5% | 1.65 | 9 | 2.01 |
| napkins → chicken | 29 | 7.1% | 1.65 | 9 | 2.01 |
| tea → whole milk | 13 | 41.9% | 1.64 | 3 | 1.68 |
| whole milk → tea | 13 | 0.6% | 1.64 | 3 | 1.68 |
| napkins → pork | 38 | 9.4% | 1.64 | 13 | 1.99 |
| pork → napkins | 38 | 8.5% | 1.64 | 13 | 1.99 |
| chicken → ham | 14 | 4.1% | 1.63 | 3 | 1.26 |
| ham → chicken | 14 | 7.1% | 1.63 | 3 | 1.26 |
| hygiene articles → coffee | 24 | 9.3% | 1.63 | 8 | 1.95 |
| coffee → hygiene articles | 24 | 5.3% | 1.63 | 8 | 1.95 |
| pasta → pork | 11 | 9.2% | 1.62 | 3 | 1.72 |
| pork → pasta | 11 | 2.4% | 1.62 | 3 | 1.72 |
| hamburger meat → pork | 24 | 9.2% | 1.62 | 8 | 1.99 |
| pork → hamburger meat | 24 | 5.3% | 1.62 | 8 | 1.99 |
| hygiene articles → white bread | 18 | 7.0% | 1.61 | 6 | 2.42 |
| white bread → hygiene articles | 18 | 5.3% | 1.61 | 6 | 2.42 |
| hygiene articles → yogurt | 57 | 22.1% | 1.61 | 15 | 1.55 |
| yogurt → hygiene articles | 57 | 5.3% | 1.61 | 15 | 1.55 |
| white bread → pork | 31 | 9.1% | 1.60 | 10 | 2.25 |
| pork → white bread | 31 | 6.9% | 1.60 | 10 | 2.25 |
| Instant food products → tropical fruit | 12 | 16.7% | 1.59 | 3 | 4.03 |
| tropical fruit → Instant food products | 12 | 1.5% | 1.59 | 3 | 4.03 |
| beef → yogurt | 89 | 21.9% | 1.59 | 26 | 1.62 |
| yogurt → beef | 89 | 8.2% | 1.59 | 26 | 1.62 |
| other vegetables → pasta | 36 | 2.4% | 1.58 | 6 | 1.02 |
| pasta → other vegetables | 36 | 30.3% | 1.58 | 6 | 1.02 |
| domestic eggs → yogurt | 106 | 21.8% | 1.58 | 35 | 1.74 |
| yogurt → domestic eggs | 106 | 9.8% | 1.58 | 35 | 1.74 |
| whole milk → yogurt | 437 | 21.7% | 1.58 | 114 | 1.54 |
| yogurt → whole milk | 437 | 40.4% | 1.58 | 114 | 1.54 |
| tropical fruit → bottled water | 147 | 17.9% | 1.58 | 35 | 1.67 |
| bottled water → tropical fruit | 147 | 16.5% | 1.58 | 35 | 1.67 |
| hygiene articles → root vegetables | 44 | 17.1% | 1.57 | 9 | 1.23 |
| root vegetables → hygiene articles | 44 | 5.2% | 1.57 | 9 | 1.23 |
| tropical fruit → whole milk | 330 | 40.1% | 1.57 | 86 | 1.61 |
| whole milk → tropical fruit | 330 | 16.4% | 1.57 | 86 | 1.61 |
| pork → salty snack | 27 | 6.0% | 1.57 | 5 | 1.19 |
| salty snack → pork | 27 | 8.9% | 1.57 | 5 | 1.19 |
| chocolate → tropical fruit | 62 | 16.4% | 1.56 | 18 | 1.55 |
| tropical fruit → chocolate | 62 | 7.5% | 1.56 | 18 | 1.55 |
| beef → ham | 16 | 3.9% | 1.56 | 5 | 1.56 |
| ham → beef | 16 | 8.1% | 1.56 | 5 | 1.56 |
| whole milk → pip fruit | 243 | 12.1% | 1.55 | 53 | 1.57 |
| pip fruit → whole milk | 243 | 39.7% | 1.55 | 53 | 1.57 |
| domestic eggs → pork | 43 | 8.8% | 1.55 | 12 | 1.46 |
| pork → domestic eggs | 43 | 9.6% | 1.55 | 12 | 1.46 |
| hygiene articles → bottled water | 45 | 17.4% | 1.54 | 11 | 1.66 |
| bottled water → hygiene articles | 45 | 5.1% | 1.54 | 11 | 1.66 |
| beef → whole milk | 158 | 38.8% | 1.52 | 51 | 1.83 |
| whole milk → beef | 158 | 7.9% | 1.52 | 51 | 1.83 |
| detergent → yogurt | 33 | 20.9% | 1.52 | 6 | 1.32 |
| yogurt → detergent | 33 | 3.0% | 1.52 | 6 | 1.32 |
| chocolate → hamburger meat | 19 | 5.0% | 1.52 | 5 | 1.35 |
| hamburger meat → chocolate | 19 | 7.3% | 1.52 | 5 | 1.35 |
| bottled water → herbs | 21 | 2.4% | 1.51 | 9 | 2.43 |
| herbs → bottled water | 21 | 17.1% | 1.51 | 9 | 2.43 |
| whole milk → pork | 173 | 8.6% | 1.51 | 45 | 1.49 |
| pork → whole milk | 173 | 38.5% | 1.51 | 45 | 1.49 |
| hamburger meat → salty snack | 15 | 5.8% | 1.50 | 7 | 2.94 |
| salty snack → hamburger meat | 15 | 5.0% | 1.50 | 7 | 2.94 |
| bottled water → napkins | 69 | 7.8% | 1.50 | 16 | 1.47 |
| napkins → bottled water | 69 | 17.0% | 1.50 | 16 | 1.47 |
| hygiene articles → other vegetables | 74 | 28.7% | 1.50 | 20 | 1.50 |
| other vegetables → hygiene articles | 74 | 4.9% | 1.50 | 20 | 1.50 |
| whole milk → other vegetables | 576 | 28.7% | 1.50 | 160 | 1.57 |
| other vegetables → whole milk | 576 | 38.3% | 1.50 | 160 | 1.57 |
| salty snack → domestic eggs | 28 | 9.3% | 1.50 | 7 | 1.44 |
| domestic eggs → salty snack | 28 | 5.7% | 1.50 | 7 | 1.44 |
| whole milk → white bread | 130 | 6.5% | 1.50 | 38 | 2.01 |
| white bread → whole milk | 130 | 38.2% | 1.50 | 38 | 2.01 |
| white bread → yogurt | 70 | 20.6% | 1.50 | 19 | 1.75 |
| yogurt → white bread | 70 | 6.5% | 1.50 | 19 | 1.75 |
| whole milk → onions | 97 | 4.8% | 1.49 | 22 | 1.69 |
| onions → whole milk | 97 | 38.2% | 1.49 | 22 | 1.69 |
| hamburger meat → napkins | 20 | 7.7% | 1.49 | 6 | 1.62 |
| napkins → hamburger meat | 20 | 4.9% | 1.49 | 6 | 1.62 |
| pip fruit → coffee | 52 | 8.5% | 1.49 | 16 | 1.95 |
| coffee → pip fruit | 52 | 11.6% | 1.49 | 16 | 1.95 |
| pip fruit → napkins | 47 | 7.7% | 1.49 | 19 | 2.60 |
| napkins → pip fruit | 47 | 11.6% | 1.49 | 19 | 2.60 |
| hamburger meat → coffee | 22 | 8.5% | 1.48 | 7 | 1.68 |
| coffee → hamburger meat | 22 | 4.9% | 1.48 | 7 | 1.68 |
| napkins → white bread | 26 | 6.4% | 1.48 | 8 | 1.95 |
| white bread → napkins | 26 | 7.6% | 1.48 | 8 | 1.95 |
| hamburger meat → yogurt | 53 | 20.4% | 1.48 | 11 | 1.12 |
| yogurt → hamburger meat | 53 | 4.9% | 1.48 | 11 | 1.12 |
| chocolate → pork | 32 | 8.4% | 1.48 | 10 | 1.53 |
| pork → chocolate | 32 | 7.1% | 1.48 | 10 | 1.53 |
| rolls/buns → ham | 54 | 3.7% | 1.47 | 14 | 1.34 |
| ham → rolls/buns | 54 | 27.3% | 1.47 | 14 | 1.34 |
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
| pork → detergent | 13 | 2.9% | 1.44 | 4 | 2.15 |
| detergent → pork | 13 | 8.2% | 1.44 | 4 | 2.15 |
| chicken → coffee | 28 | 8.2% | 1.44 | 10 | 1.99 |
| coffee → chicken | 28 | 6.2% | 1.44 | 10 | 1.99 |
| hamburger meat → rolls/buns | 69 | 26.5% | 1.44 | 16 | 1.33 |
| rolls/buns → hamburger meat | 69 | 4.7% | 1.44 | 16 | 1.33 |
| pip fruit → pork | 50 | 8.2% | 1.43 | 10 | 1.26 |
| pork → pip fruit | 50 | 11.1% | 1.43 | 10 | 1.26 |
| chicken → tropical fruit | 51 | 15.0% | 1.43 | 12 | 1.39 |
| tropical fruit → chicken | 51 | 6.2% | 1.43 | 12 | 1.39 |
| napkins → other vegetables | 111 | 27.3% | 1.43 | 31 | 1.41 |
| other vegetables → napkins | 111 | 7.4% | 1.43 | 31 | 1.41 |
| bottled water → yogurt | 175 | 19.7% | 1.43 | 51 | 1.76 |
| yogurt → bottled water | 175 | 16.2% | 1.43 | 51 | 1.76 |
| beef → napkins | 30 | 7.4% | 1.43 | 10 | 1.66 |
| napkins → beef | 30 | 7.4% | 1.43 | 10 | 1.66 |
| whole milk → napkins | 148 | 7.4% | 1.43 | 46 | 1.65 |
| napkins → whole milk | 148 | 36.5% | 1.43 | 46 | 1.65 |
| pork → tropical fruit | 67 | 14.9% | 1.43 | 17 | 1.36 |
| tropical fruit → pork | 67 | 8.1% | 1.43 | 17 | 1.36 |
| chicken → white bread | 21 | 6.2% | 1.43 | 4 | 1.31 |
| white bread → chicken | 21 | 6.2% | 1.43 | 4 | 1.31 |
| other vegetables → salty snack | 82 | 5.4% | 1.42 | 24 | 1.69 |
| salty snack → other vegetables | 82 | 27.2% | 1.42 | 24 | 1.69 |
| beef → tropical fruit | 60 | 14.7% | 1.41 | 15 | 1.30 |
| tropical fruit → beef | 60 | 7.3% | 1.41 | 15 | 1.30 |
| beef → salty snack | 22 | 5.4% | 1.41 | 4 | 1.03 |
| salty snack → beef | 22 | 7.3% | 1.41 | 4 | 1.03 |
| pip fruit → salty snack | 33 | 5.4% | 1.40 | 7 | 1.49 |
| salty snack → pip fruit | 33 | 10.9% | 1.40 | 7 | 1.49 |
| salty snack → tropical fruit | 44 | 14.6% | 1.39 | 11 | 1.48 |
| tropical fruit → salty snack | 44 | 5.3% | 1.39 | 11 | 1.48 |
| chocolate → coffee | 30 | 7.9% | 1.39 | 8 | 1.18 |
| coffee → chocolate | 30 | 6.7% | 1.39 | 8 | 1.18 |
| chocolate → other vegetables | 100 | 26.4% | 1.38 | 25 | 1.13 |
| other vegetables → chocolate | 100 | 6.6% | 1.38 | 25 | 1.13 |
| chicken → salty snack | 18 | 5.3% | 1.38 | 3 | 1.04 |
| salty snack → chicken | 18 | 6.0% | 1.38 | 3 | 1.04 |
| sauces → other vegetables | 12 | 26.1% | 1.36 | 3 | 1.85 |
| other vegetables → sauces | 12 | 0.8% | 1.36 | 3 | 1.85 |
| Instant food products → whole milk | 25 | 34.7% | 1.36 | 5 | 2.79 |
| whole milk → Instant food products | 25 | 1.2% | 1.36 | 5 | 2.79 |
| pasta → domestic eggs | 10 | 8.4% | 1.36 | 6 | 2.97 |
| domestic eggs → pasta | 10 | 2.1% | 1.36 | 6 | 2.97 |
| beef → rolls/buns | 102 | 25.1% | 1.36 | 32 | 1.63 |
| rolls/buns → beef | 102 | 7.0% | 1.36 | 32 | 1.63 |
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
| salty snack → ham | 10 | 3.3% | 1.32 | 4 | 1.94 |
| ham → salty snack | 10 | 5.1% | 1.32 | 4 | 1.94 |
| domestic eggs → bottled water | 72 | 14.8% | 1.31 | 18 | 1.31 |
| bottled water → domestic eggs | 72 | 8.1% | 1.31 | 18 | 1.31 |
| chocolate → yogurt | 68 | 17.9% | 1.30 | 23 | 1.44 |
| yogurt → chocolate | 68 | 6.3% | 1.30 | 23 | 1.44 |
| root vegetables → ham | 28 | 3.3% | 1.30 | 8 | 1.24 |
| ham → root vegetables | 28 | 14.1% | 1.30 | 8 | 1.24 |
| coffee → domestic eggs | 36 | 8.0% | 1.30 | 13 | 1.53 |
| domestic eggs → coffee | 36 | 7.4% | 1.30 | 13 | 1.53 |
| tropical fruit → rolls/buns | 197 | 23.9% | 1.29 | 45 | 1.20 |
| rolls/buns → tropical fruit | 197 | 13.5% | 1.29 | 45 | 1.20 |
| coffee → beef | 30 | 6.7% | 1.29 | 7 | 1.04 |
| beef → coffee | 30 | 7.4% | 1.29 | 7 | 1.04 |
| bottled water → root vegetables | 124 | 13.9% | 1.28 | 30 | 1.37 |
| root vegetables → bottled water | 124 | 14.5% | 1.28 | 30 | 1.37 |
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
| chocolate → root vegetables | 50 | 13.2% | 1.22 | 13 | 1.08 |
| root vegetables → chocolate | 50 | 5.9% | 1.22 | 13 | 1.08 |
| other vegetables → rolls/buns | 337 | 22.4% | 1.21 | 82 | 1.14 |
| rolls/buns → other vegetables | 337 | 23.2% | 1.21 | 82 | 1.14 |
| rolls/buns → root vegetables | 191 | 13.1% | 1.21 | 48 | 1.22 |
| root vegetables → rolls/buns | 191 | 22.4% | 1.21 | 48 | 1.22 |
| rolls/buns → bottled water | 199 | 13.7% | 1.21 | 39 | 1.10 |
| bottled water → rolls/buns | 199 | 22.4% | 1.21 | 39 | 1.10 |
| coffee → napkins | 28 | 6.2% | 1.21 | 12 | 1.78 |
| napkins → coffee | 28 | 6.9% | 1.21 | 12 | 1.78 |

デモ商品へ展開したルール：538件（`association-rules.json`）。

## 採用しなかったルール（学習では基準を満たしたもの、68件）

| ルール | 学習の同時購入数 | confidence | lift | 評価の同時購入数 | 評価のlift | 理由 |
| --- | --- | --- | --- | --- | --- | --- |
| hamburger meat → sauces | 11 | 4.2% | 7.24 | 1 | 3.67 | 評価データで同時購入をほぼ確認できない |
| sauces → hamburger meat | 11 | 23.9% | 7.24 | 1 | 3.67 | 評価データで同時購入をほぼ確認できない |
| tea → tropical fruit | 11 | 35.5% | 3.39 | 2 | 2.69 | 評価データで同時購入をほぼ確認できない |
| tropical fruit → tea | 11 | 1.3% | 3.39 | 2 | 2.69 | 評価データで同時購入をほぼ確認できない |
| herbs → onions | 13 | 10.6% | 3.27 | 1 | 1.04 | 評価データで同時購入をほぼ確認できない |
| onions → herbs | 13 | 5.1% | 3.27 | 1 | 1.04 | 評価データで同時購入をほぼ確認できない |
| chicken → pasta | 14 | 4.1% | 2.71 | 2 | 1.67 | 評価データで同時購入をほぼ確認できない |
| pasta → chicken | 14 | 11.8% | 2.71 | 2 | 1.67 | 評価データで同時購入をほぼ確認できない |
| hamburger meat → onions | 22 | 8.5% | 2.62 | 2 | 1.15 | 評価データで同時購入をほぼ確認できない |
| onions → hamburger meat | 22 | 8.7% | 2.62 | 2 | 1.15 | 評価データで同時購入をほぼ確認できない |
| hygiene articles → pasta | 10 | 3.9% | 2.56 | 2 | 2.06 | 評価データで同時購入をほぼ確認できない |
| pasta → hygiene articles | 10 | 8.4% | 2.56 | 2 | 2.06 | 評価データで同時購入をほぼ確認できない |
| Instant food products → root vegetables | 18 | 25.0% | 2.30 | 1 | 1.29 | 評価データで同時購入をほぼ確認できない |
| root vegetables → Instant food products | 18 | 2.1% | 2.30 | 1 | 1.29 | 評価データで同時購入をほぼ確認できない |
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
| detergent → hamburger meat | 10 | 6.3% | 1.92 | 1 | 0.95 | 評価データで同時購入をほぼ確認できない |
| hamburger meat → detergent | 10 | 3.8% | 1.92 | 1 | 0.95 | 評価データで同時購入をほぼ確認できない |
| bottled water → onions | 54 | 6.1% | 1.88 | 4 | 0.78 | 評価データでは関連が再現しない |
| onions → bottled water | 54 | 21.3% | 1.88 | 4 | 0.78 | 評価データでは関連が再現しない |
| Instant food products → other vegetables | 25 | 34.7% | 1.82 | 2 | 1.41 | 評価データで同時購入をほぼ確認できない |
| other vegetables → Instant food products | 25 | 1.7% | 1.82 | 2 | 1.41 | 評価データで同時購入をほぼ確認できない |
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
| beef → white bread | 26 | 6.4% | 1.48 | 4 | 0.98 | 評価データでは関連が再現しない |
| white bread → beef | 26 | 7.6% | 1.48 | 4 | 0.98 | 評価データでは関連が再現しない |
| beef → chocolate | 28 | 6.9% | 1.43 | 5 | 0.83 | 評価データでは関連が再現しない |
| chocolate → beef | 28 | 7.4% | 1.43 | 5 | 0.83 | 評価データでは関連が再現しない |
| hygiene articles → salty snack | 14 | 5.4% | 1.41 | 2 | 0.85 | 評価データで同時購入をほぼ確認できない |
| salty snack → hygiene articles | 14 | 4.6% | 1.41 | 2 | 0.85 | 評価データで同時購入をほぼ確認できない |
| chicken → chocolate | 23 | 6.7% | 1.40 | 4 | 0.89 | 評価データでは関連が再現しない |
| chocolate → chicken | 23 | 6.1% | 1.40 | 4 | 0.89 | 評価データでは関連が再現しない |
| hamburger meat → tropical fruit | 37 | 14.2% | 1.36 | 5 | 0.70 | 評価データでは関連が再現しない |
| tropical fruit → hamburger meat | 37 | 4.5% | 1.36 | 5 | 0.70 | 評価データでは関連が再現しない |
| domestic eggs → detergent | 13 | 2.7% | 1.33 | 2 | 0.93 | 評価データで同時購入をほぼ確認できない |
| detergent → domestic eggs | 13 | 8.2% | 1.33 | 2 | 0.93 | 評価データで同時購入をほぼ確認できない |
| pip fruit → beef | 42 | 6.9% | 1.33 | 6 | 0.82 | 評価データでは関連が再現しない |
| beef → pip fruit | 42 | 10.3% | 1.33 | 6 | 0.82 | 評価データでは関連が再現しない |
| napkins → rolls/buns | 98 | 24.1% | 1.31 | 17 | 0.87 | 評価データでは関連が再現しない |
| rolls/buns → napkins | 98 | 6.7% | 1.31 | 17 | 0.87 | 評価データでは関連が再現しない |
| onions → rolls/buns | 60 | 23.6% | 1.28 | 7 | 0.76 | 評価データでは関連が再現しない |
| rolls/buns → onions | 60 | 4.1% | 1.28 | 7 | 0.76 | 評価データでは関連が再現しない |
| coffee → root vegetables | 62 | 13.8% | 1.27 | 10 | 0.74 | 評価データでは関連が再現しない |
| root vegetables → coffee | 62 | 7.3% | 1.27 | 10 | 0.74 | 評価データでは関連が再現しない |
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
