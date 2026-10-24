# APP-05：かご・履歴に合う商品を選び、3種類の提案に分けて保存する

対象：[APP-05 / #21](https://github.com/jphacks/hs_2604/issues/21)。作業フェーズ：hackday。共通仕様書の[7章 3種類の提案](common-spec.md#placements)に従う。

## 実装方針

- 選定はAppのサーバー側で行う。ブラウザからは何も受け取らず（`GET /api/recommendations`）、来店はHttpOnly Cookieの選択来店、利用者は認証から決める。Coreには推薦の計算を置かない。
- 材料は1回のDB関数`app_selection_candidates`でまとめて取得する。配信できるかどうか（期間・時間帯・媒体`app`・取扱中）はDBの時計と店舗のタイムゾーンで判定する。
- 履歴・かごの利用可否はAPP-03の`loadRecommendationInput`で毎回DBから読む。OFFの材料は読み込まない。
- 選定結果は`kago_save_selection`（DB-06）で`selections`・`selection_items`へ保存する。DB-05のトリガーが、かごの版・店舗・枠の種別・配信可否・履歴設定を保存時に再確認する。
- 選定は決定的。同じ材料・同じルール版なら同じ枠になり、選定IDも同じになるため、画面の再読込で同じ選定を重複保存しない（同じ内容の再送はDBで無操作）。

## 選定ルール

| 枠 | 数 | 候補 | 順位 | 理由（`reason_code`／文言） |
| --- | --- | --- | --- | --- |
| 店舗販促`store_promo` | 最大1 | 有効な版・`app`・期間内・時間帯内・取扱中の販促 | 店舗の優先度→かごとの関連→ID | `store_pick`／店舗が入力した理由文 |
| メーカー広告`sponsored` | 最大1 | 有効な配信対象・`app`・期間内・取扱中で、**かごの商品と関連ルールがある**広告のみ | 関連の強さ→ID | `sponsored_related`／「スパゲッティを選んだ方への広告です」 |
| 通常推薦`organic` | 残り | 一緒に買われる商品（APP-04、confidence順）、購入周期（履歴）、売れ筋（店舗の直近30日の注文数） | 3種類から順番に1件ずつ | `co_purchase`／ルールの理由、`replenishment`／「いつもの購入周期から、そろそろです」、`popular`／「売れ筋の商品です」 |

- 合計最大3枠。店舗販促→メーカー広告の順に予約し、残りを通常推薦で埋める。候補がなければ空ける（1件もなければ保存しない）。
- かごの商品・取扱いのない商品・同じ商品の2回目は候補にしない。店舗販促と広告が同じ商品なら店舗販促を優先する。
- 補充（`replenishment`）は2回以上購入し、平均購入間隔の8割以上が経過した商品。履歴利用OFFでは使わない（DBトリガーでも拒否）。
- かご利用OFFでは、かごを材料にする`co_purchase`と`sponsored_related`を出さない。かご内の商品を候補から外すことは続ける。
- 表示順（`slot`・`rank`）：通常推薦の1件目、店舗販促、メーカー広告、残りの通常推薦。画面での見せ方はAPP-06。
- ルール版`rule_version`はAPP-04のルールファイルの版（現在1）。店舗販促は`promotion_version_id`、広告は`ad_placement_id`で版をたどれる。
- APP-10の実験群（広告なし群など）は未実装。`app_selection_candidates`が来店の`experiment_arm`を返すので、APP-10で広告枠の扱いを追加する。

## 接続契約

追加migration：`kago-os/kago-core/supabase/migrations/20261024160000_app_selection_candidates.sql`。既存テーブル・権限は変更しない。

`app_selection_candidates(visit_id)`（本人のactiveな来店のみ。他人・終了済みは`42501`／`P0001 visit_ended`）：

| 項目 | 内容 |
| --- | --- |
| `visit` | id・店舗・かごの版・開始時刻・実験群 |
| `cart` | かごの商品ID・コード（除外用） |
| `listings` | 取扱中の商品・価格 |
| `promotions` | いま配信できる店舗販促の版（優先度・理由文・期間） |
| `ads` | いま配信できる広告（配信対象ID・素材の版・対象商品・見出し・広告主名・期間） |
| `popular` | 店舗の直近30日の商品別注文件数（集計値のみ。他の利用者の注文は返さない） |

`GET /api/recommendations`の応答：`selectionId`、`visitId`、`cartVersion`、`ruleVersion`、`items[]`（`selectionItemId`・`slot`・`rank`・`placementType`・`reasonCode`・`reasonText`・`product`・`adPlacementId`・`promotionVersionId`・`sponsor{makerName, headline, creativeVersionId}`）。APP-06はこれを表示し、APP-07は`selectionItemId`へ表示・クリック・追加を記録する。

かごが読み込み後・保存前に変わった場合は保存せず`409 input_changed`を返す（同じ内容の古い選定が残っている場合も、版を確認して古い結果を返さない）。再取得はAPP-08で行う。

## 検証

Node.js 22で`pnpm test:selection`（固定入力9件・DATA-01のDB 5件・サーバー処理5件）と`pnpm test:selection:e2e`（Nextの実API）を実行する。

2026-10-24の実行結果：上記19件とAPIの確認が成功。回帰として`test:offers`（14）、`test:association`（6）、`test:cart`（14）、`test:account`（13）、`test:shopping`（11）、`test:shopping:database`（11）、`test:shopping:check`（4）、`test:backend`（31）、`test:demo-data`（7）、ブラウザ（APP-13 9、APP-02 14、APP-03 12、APP-01 20）、DB-02〜09の検証SQL（PGlite）、型検査、ESLint、本番ビルドも成功。

確認した内容（Issueの確認方法に対応）：

- パスタ追加：一緒に買われる商品（通常推薦）、店舗販促、関連広告（DATA-01のPL1・トマトパスタソース・瀬戸内トマト食品）の3種類と理由が区別される
- 履歴からの補充：U1（DATA-01の履歴・利用ON）で`replenishment`が出る。履歴OFFでは出ない
- 店舗注力商品：優先度の高い販促が1枠に入る。時間帯外（SP1の16〜19時以外）・Signage専用（SP2）は候補にならない
- 関連広告あり／なし：かごと関連のない広告、取扱いのない商品の広告は出さず通常推薦で埋める。停止した広告は候補から消え、古い選定の保存もDBが拒否
- 設定OFF：U2（履歴・かごOFF）は店舗販促と売れ筋だけ。かごの商品は出さない
- 候補なし：空の選定（保存しない）。同じ入力・版は同じ結果。保存の再送は重複しない。保存前のかご変更は`input_changed`

DATA-01の配信期間（PL1は2026-12-01まで）に依存する確認が含まれる。共有Supabaseへのmigration適用と公開環境での確認は未実施（APP-13の #100・#101 と同様に適用が必要）。

## 画面：提案カード（APP-06 / #22）

`src/features/recommendations/suggestion-cards.tsx`。買い物画面のスキャン欄の下に「あなたへのおすすめ」として、APP-05が保存した選定（`GET /api/recommendations`）をそのまま表示する。順位・種別の計算や並べ替えは画面で行わない。

| 種別 | ラベル | 見た目 | 詳細画面 |
| --- | --- | --- | --- |
| 通常推薦 | 理由に応じて「一緒におすすめ」「そろそろ補充」「売れ筋」 | 緑 | 理由 |
| 店舗販促 | 「店舗からのおすすめ」 | 黄 | 「店舗が選んだおすすめ商品です。」＋店舗の理由文 |
| メーカー広告 | 「広告」＋「提供：広告主名」 | 灰 | 見出し、「この枠は広告です。提供：広告主名（店舗が承認した広告）」＋理由 |

- ラベルは保存された種別（`placementType`）から決める。店舗販促・広告を通常推薦の見た目で出さない。
- 各カードから「かごに追加」「詳細を見る」へ進める。追加後はかごの版が変わり、選定を取り直す。かご内の商品は「かごに追加済み」と表示する。
- 読込中はカードの枠を表示し、失敗時は「おすすめを再試行」、候補がないときは「いまのかごに合うおすすめはありません」と理由を表示する。広告がないときは空枠を作らず、ある枠だけを表示する。
- 表示中のかごより古い版の選定結果は表示しない（APP-08の完全な更新制御は別Issue）。保存前にかごが変わった場合（`input_changed`）は1回だけ取り直す。
- 1枠ずつ縦にスライドして切り替える（約4秒ごと）。表示順は「メーカー広告→店舗からのおすすめ→個人のおすすめ（順位順）」。保存された`slot`・`rank`は変えず、表示の順番だけを並べ替える。
- 自動切り替えは、カードにポインターがある間・フォーカス中・詳細を開いている間・タブが非表示の間は止まる。「↑」「↓」で前後へ移動、「停止／再生」で自動切り替えを止められる（動き続ける表示を止める手段の提供）。動きを減らす設定の端末ではスライドのアニメーションを省く。
- 枠が1つのときは切り替えず、操作ボタンも表示しない。読み上げでは現在の1枠だけを公開し、手動で切り替えたときに「何枚目／全何枚：種類」を伝える。
- 長い商品名は2行で省略し、全文は`title`と詳細画面で確認できる。
- カードからの追加はAPP-07で`source = recommendation`と選定枠IDを既存のかご更新処理へ渡す。実表示・クリックの記録と再送は[イベント接続契約](app-events-contract.md)を参照。
- 来店開始・かご版変更後の再選定、要求の待ち合わせ、古い応答と詳細の取り下げは[APP-08の更新契約](app-recommendation-refresh.md)を参照。
- 広告画像（COM-03のStorage）はカードに表示していない。商品画像（`MENU_PRODUCT_IMAGES`）または商品アイコンを使う。

確認：`pnpm test:suggestions:e2e`（ブラウザ8ケース）。実API（店舗販促の表示→詳細→追加→空表示）、広告→店舗→個人の順のスライドと前後移動、約4秒の自動切り替えとポインター・フォーカス・停止ボタンでの停止、広告主・長い商品名の表示と375px幅での崩れなし、通信失敗→再試行、古い版の結果を表示しない、320px幅の空表示。

画面記録（架空データ・375px幅）：[広告](../images/app06-slide-ad-mobile.png)、[店舗からのおすすめ](../images/app06-slide-store-mobile.png)、[個人のおすすめ](../images/app06-slide-organic-mobile.png)、[広告の詳細](../images/app06-ad-detail-mobile.png)、[通信失敗](../images/app06-error-mobile.png)、[候補なし・320px](../images/app06-empty-320.png)。
