# KAGO/OS 共通仕様書 — 広告・提案・購買をつなぐID・データ形式・指標

| 項目 | 内容 |
| --- | --- |
| 対象Issue | [COM-01｜広告・提案・購買をつなぐ共通IDとデータ形式を仕様書にまとめる](../issues/issues.md#com-01) |
| 版 | v0.1（案） |
| 作成日 | 2026-10-23 |
| 状態 | 各担当の確認待ち。「提案」と書いた値は、確認後に「確定」へ変える |

この仕様書は、各サービスの担当者が実装前に同じ前提を持つための取り決めです。テーブルの最終的な列名・型・制約はDB-01で確定し、この仕様書と食い違う場合はこの仕様書を先に更新してから実装します。

## 目次

1. [決定事項の一覧](#decisions)
2. [サービスの役割と境界](#roles)
3. [保存・参照・更新の対応表](#crud)
4. [共通のID・データ形式](#formats)
5. [主なデータと共通項目](#entities)
6. [状態の遷移](#states)
7. [3種類の提案](#placements)
8. [イベントの定義](#events)
9. [指標の定義と数え方](#metrics)
10. [購入経路とカメラの方針](#policies)
11. [架空例による机上確認](#walkthrough)
12. [未決定事項と担当](#open-issues)
13. [各担当の確認記録](#review)
14. [改訂履歴](#history)

<a id="decisions"></a>

## 1. 決定事項の一覧

| No. | 項目 | 内容 | 状態 |
| --- | --- | --- | --- |
| D-01 | Coreの範囲 | CoreはDBのみ（テーブル・権限・整合性・DB関数・ビュー）。推薦エンジンや業務用HTTP APIを持たない | 確定（issues.mdの方針） |
| D-02 | 推薦の選定 | Appのサーバー側処理で行い、選定記録をDBへ保存する | 確定（issues.mdの方針） |
| D-03 | 提案の種別 | 通常推薦`organic`・店舗販促`store_promo`・メーカー広告`sponsored`の3種類 | 確定 |
| D-04 | 集計の単位 | Appは利用者・来店、Signageは画面（端末）・時間帯。両者を合算しない | 確定 |
| D-05 | 実表示の条件 | カード面積の50%以上が1秒以上続けて画面内にあった場合に1件 | 提案 |
| D-06 | 購入の正本 | 購入数は注文・明細から数える。購入イベントだけでは購入としない | 確定 |
| D-07 | 購入経路 | 推奨の購入操作経路（DB-07＋APP-09）を第一とし、間に合わない場合にDATA-03へ切り替える | 提案 |
| D-08 | カメラ | SIG-04の実機確認で採否を決める。採用時もSignageの結果を個人の購入と結び付けない | 確定（方針）／採否は未決定 |
| D-09 | 時刻 | DBはタイムゾーン付き時刻で保存し、表示・時間帯集計は`Asia/Tokyo`で行う | 提案 |
| D-10 | 少人数の扱い | 対象の来店数が5未満の集計には「少数」と注記する。メーカー向けにも個人単位の行は返さない | 提案 |
| D-11 | 提案枠 | Appの提案は1画面3枠まで。メーカー広告は1枠まで | 提案 |

<a id="roles"></a>

## 2. サービスの役割と境界

### 2.1 役割表

| サービス | 利用者 | 担当すること | 担当しないこと |
| --- | --- | --- | --- |
| KAGO/App | 消費者 | ログイン・店舗選択・スキャン・かご・履歴・疑似購入。提案の選定（サーバー側）と表示・操作の記録 | 広告の承認、店舗全体の集計表示 |
| KAGO/Ads | 店舗担当者・メーカー担当者 | 店舗の広告募集の作成・公開・終了と成果公開範囲の設定。メーカーの募集検索・広告登録・申請・再申請・自社成果の確認 | 申請の承認・却下・停止 |
| KAGO/Insight | 店舗担当者 | 申請の審査（承認・却下・停止）、店舗販促の設定、店舗の成果確認、実験条件の設定 | 提案の選定計算 |
| KAGO/Signage | 店舗の表示端末 | 承認済み広告の再生、再生記録、採用時のカメラ推定 | 個人のかご・履歴の取得 |
| KAGO/Core | （各サービスから利用） | テーブル・権限・整合性・DB関数（注文確定・承認切替）・集計ビュー | 推薦計算、業務用HTTP API |

### 2.2 処理の置き場所

| 処理 | 置き場所 | 理由 |
| --- | --- | --- |
| 画面表示・実表示やクリックの検出 | ブラウザ（App・Ads・Insight）、端末（Signage） | 利用者の画面でしか分からないため |
| 表示・クリック・スキャン・比較・閉じる操作の送信 | ブラウザからDBへ書き込み可。DB権限で本人の来店に限定する | 改ざんされても本人の記録の範囲に留まるため |
| 提案の選定・選定記録の保存 | Appのサーバー側処理 | 広告の種別や順位を利用者に書き換えさせないため |
| 実験群の割当 | Appのサーバー側処理 | 利用者が群を選べないようにするため |
| 注文の確定 | DB関数（DB-07）をAppのサーバー側から呼ぶ | 注文・明細・かご終了を一度に保存するため |
| 広告の承認・停止・版の切替 | DB関数（DB-08）をInsightから呼ぶ | 有効な版を常に1つにするため |
| 集計 | DBビュー（DB-09）。率の計算や表示はInsight・Ads | 同じ定義で数えるため |

<a id="crud"></a>

## 3. 保存・参照・更新の対応表

C＝作成、R＝参照、U＝更新、－＝扱わない。Coreはすべてのデータの定義・制約・権限を担当するため列を省略しています。

| データ | App | Ads（店舗） | Ads（メーカー） | Insight | Signage | 投入・初期化 |
| --- | --- | --- | --- | --- | --- | --- |
| 店舗・店舗担当者の所属 | R | R（自店） | R（公開情報） | R（自店） | R（自店） | DATA-01 |
| メーカー・メーカー担当者の所属 | R（広告主名） | R | R（自社） | R | R（広告主名） | DATA-01 |
| 商品・店舗別価格 | R | R | R | R | R | DATA-01 |
| 利用者設定（履歴利用の可否） | CRU（本人） | － | － | － | － | DATA-01 |
| 来店・かご | CRU（本人） | － | － | 集計のみR | － | DATA-02で初期化 |
| 注文・明細 | C（DB関数）・R（本人） | － | 集計のみR（公開範囲内） | 集計のみR | － | DATA-01（過去分）・DATA-03 |
| 広告募集（成果の公開範囲を含む） | － | CRU（自店） | R | R（自店） | － | DATA-01 |
| 広告素材・素材の版 | R（承認済み） | R（自店宛の申請分） | CRU（自社） | R（自店宛の申請分） | R（承認済み） | DATA-01 |
| 掲載申請 | － | R（自店宛） | CRU（自社） | R・U（審査、DB関数） | － | DATA-01 |
| 配信対象（承認済みの版） | R | R（状態） | R（状態） | C・U（DB関数） | R | DATA-01 |
| 店舗販促とその版 | R | － | － | CRU（自店） | R | DATA-01 |
| 選定記録 | C（サーバー側） | － | － | R | － | DATA-02で初期化 |
| 表示・操作イベント | C（本人の来店） | － | 集計のみR（公開範囲内） | 集計のみR | － | DATA-02で初期化 |
| 実験条件・割当 | R（条件）・C（割当、サーバー側） | － | － | CRU（条件） | R（条件） | － |
| Signage再生記録・推定視認 | － | － | 集計のみR（公開範囲内） | R | C（自端末） | DATA-02で初期化 |

<a id="formats"></a>

## 4. 共通のID・データ形式

### 4.1 ID

| 種類 | 形式 | 生成する場所 | 備考 |
| --- | --- | --- | --- |
| 各テーブルの主キー | UUID | DB | 架空データでは固定のUUIDを使い、DATA-01・DATA-02でそろえる |
| 人が読める識別子 | 英小文字・数字・ハイフン（例：`hiroshima-demo-store`） | 投入時 | 店舗・メーカー・端末・実験に`slug`として持つ。既存の`storeId`はこれに移す |
| 利用者ID | 認証基盤の利用者ID（UUIDを想定） | 認証基盤 | 既存の`demo-user-sato-misaki`は`slug`として残す |
| イベントID・再生ID | UUID | 送信する側（ブラウザ・端末） | 再送時は同じIDを使い、DBの一意制約で重複を除く |
| 提案枠ID（`selection_item_id`） | UUID | Appのサーバー側（選定時） | 表示・クリック・提案経由の追加がこのIDを参照する |
| 購入要求ID（`idempotency_key`） | UUID | App（購入確認画面を開いた時） | 同じ要求の再送で注文を1件に保つ（DB-07） |

### 4.2 値の形式

| 項目 | 形式 | 例 |
| --- | --- | --- |
| 時刻 | ISO 8601、タイムゾーン付き。DBはタイムゾーン付き時刻型 | `2026-10-25T17:30:05+09:00` |
| 発生時刻と受信時刻 | イベントは端末の発生時刻`occurred_at`とDBの受信時刻`received_at`を両方持つ。集計は`occurred_at`を使う | － |
| 金額 | 円の整数（税込）。小数を使わない | `248` |
| 商品コード | 文字列。先頭の0を保つ。JAN・インストアコード（`29`始まり13桁）・計量品の`PLU-`コード | `2900000000100`、`PLU-2001` |
| 数量 | 1以上の整数 | `2` |
| 列挙値 | 英小文字のスネークケース。画面表示名は別に持つ | `store_promo` |
| 版 | 対象ごとの1から始まる整数。更新すると新しい版を作り、古い版は書き換えない | `version = 2` |
| 媒体`channel` | `app`／`signage` | － |
| データの由来`data_origin` | `operated`＝画面・端末の実際の動作で発生（デモ担当者の操作を含む）／`seeded`＝DATA-01・DATA-03で投入した架空データ／`synthetic`＝カメラ未採用時などに作った疑似値 | － |

`data_origin`はイベント・注文・再生記録・推定視認に必ず持たせます。集計画面では由来ごとに分けて表示でき、`synthetic`を実測として扱いません。

<a id="entities"></a>

## 5. 主なデータと共通項目

列名は案です。DB-01で型・制約とともに確定します。

| データ | 主な項目 | 担当Issue |
| --- | --- | --- |
| 店舗`stores` | id、slug、name、branch_name、timezone | DB-02 |
| 店舗担当者`store_members` | store_id、user_id、role | DB-02 |
| メーカー`makers`・メーカー担当者`maker_members` | id、slug、display_name、is_fictional／maker_id、user_id | DB-04 |
| 商品`products` | id、code、name、category | DB-02 |
| 店舗別商品`store_products` | store_id、product_id、price、is_active | DB-02 |
| 利用者設定`customer_settings` | user_id、use_purchase_history、use_current_cart | DB-02 |
| 来店`visits` | id、user_id、store_id、status、started_at、ended_at、experiment_arm | DB-03 |
| かご明細`cart_items`／かごの版 | visit_id、product_id、quantity／visit.cart_version | DB-03 |
| 注文`orders`・明細`order_items` | id、visit_id、user_id、store_id、ordered_at、total、idempotency_key、data_origin／order_id、product_id、product_name、unit_price、quantity | DB-03 |
| 広告募集`ad_calls` | id、store_id、title、categories、channels、starts_at、ends_at、status、disclosure_scope | DB-04 |
| 広告素材`creatives`・素材の版`creative_versions` | id、maker_id、product_id／creative_id、version、image_path、headline、created_at | DB-04、COM-03 |
| 掲載申請`ad_applications` | id、ad_call_id、maker_id、creative_version_id、channels、requested_period、status、review_comment | DB-04 |
| 配信対象`ad_placements` | id、application_id、store_id、creative_version_id、channels、starts_at、ends_at、status、approved_by、approved_at | DB-04、DB-08 |
| 店舗販促`store_promotions`・版 | id、store_id、product_id、version、channels、time_windows、priority、reason_text、starts_at、ends_at、status | DB-04、INS-02 |
| 選定`selections`・提案枠`selection_items` | id、visit_id、cart_version、rule_version、created_at／id、selection_id、slot、placement_type、product_id、ad_placement_id、promotion_version_id、rank、reason_code、reason_text | DB-05、APP-05 |
| 行動イベント`events` | 「8. イベントの定義」の共通項目 | DB-05、APP-07 |
| 実験`experiments`・割当`experiment_assignments` | id、store_id、channel、unit、arms、starts_at、ends_at、version／experiment_id、user_id、arm | DB-05、APP-10 |
| Signage端末`signage_devices` | id、store_id、slug、location | DB-05 |
| 再生記録`signage_plays` | id、device_id、ad_placement_id、promotion_version_id、creative_version_id、mode、reason_code、started_at、ended_at、data_origin | DB-05、SIG-02 |
| 推定視認`audience_estimates` | play_id、method_version、measurement_status、estimated_viewers、estimated_view_seconds、data_origin | DB-05、SIG-05 |

`disclosure_scope`は、メーカーへ公開する指標の組（例：`["impressions","clicks","cart_adds","purchases","signage_views"]`）です。ADS-02で店舗が募集ごとに設定します。

<a id="states"></a>

## 6. 状態の遷移

| データ | 状態 | 遷移 |
| --- | --- | --- |
| 広告募集 | `draft`→`open`→`closed` | 公開（open）しても広告の配信承認にはならない。`closed`後は新規申請を受け付けない |
| 掲載申請 | `submitted`→`approved`／`rejected` | `rejected`の後、メーカーが素材を直して`submitted`へ戻す（再申請。素材は新しい版） |
| 配信対象 | `active`→`suspended`／`expired` | 承認で`active`。店舗の停止で`suspended`、期間終了で`expired`。新しい版を承認すると旧版は`superseded`になる |
| 来店 | `active`→`completed`／`abandoned` | 購入確定で`completed`。購入せず一定時間（提案：3時間）操作がない場合は`abandoned` |
| 店舗販促 | `active`／`inactive` | 内容を変えると新しい版を作る。過去の選定記録は古い版を参照したまま残る |

配信対象になるのは、`active`かつ期間内かつ対象店舗で取扱中の商品を持つ広告だけです。

<a id="placements"></a>

## 7. 3種類の提案

| 項目 | 通常推薦`organic` | 店舗販促`store_promo` | メーカー広告`sponsored` |
| --- | --- | --- | --- |
| 何か | かご・履歴に基づく提案 | 店舗が売りたい商品の提案 | メーカーが申請し、店舗が承認した広告 |
| 誰の意図か | 利用者の買い物の文脈 | 店舗 | メーカー（店舗の承認つき） |
| 選定の材料 | 関連購買ルール（APP-04）、購入周期、売れ筋 | INS-02の設定（対象商品・時間帯・優先度・期間） | 配信対象`active`の広告と対象商品の関連 |
| 画面の表示 | 「一緒におすすめ」「そろそろ補充」など | 「店舗からのおすすめ」 | 「広告」と「提供：広告主名」 |
| 理由の例（`reason_code`） | `co_purchase`「スパゲッティと一緒に選ばれています」、`replenishment`「いつもの購入周期から、そろそろです」、`popular`「売れ筋の商品です」 | `store_pick`（店舗が入力した理由文） | `sponsored_related`「スパゲッティを選んだ方への広告です」 |
| 記録する版 | ルールの版`rule_version` | 店舗販促の版 | 配信対象と素材の版 |

選定の共通ルール（提案）：

- 1画面に最大3枠。メーカー広告は最大1枠、店舗販促は最大1枠、残りは通常推薦で埋める。候補がない枠は通常推薦で埋め、それもなければ空ける。
- かごに入っている商品、店舗で取扱いがない商品、期間外・停止中の広告と販促は候補にしない。
- 同じ商品は1枠だけ表示する。記録する種別と画面のラベルは必ず一致させる。店舗販促やメーカー広告を通常推薦のラベルで見せない。
- 履歴利用がOFFの利用者には、履歴を材料にした通常推薦（`replenishment`）を出さない。

<a id="events"></a>

## 8. イベントの定義

### 8.1 共通項目

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| `event_id` | 必須 | 送信側で生成するUUID。再送時も同じ値 |
| `event_type` | 必須 | 下の表の値 |
| `schema_version` | 必須 | この仕様の版。現在は`1` |
| `occurred_at` | 必須 | 端末で発生した時刻 |
| `received_at` | 必須 | DBが受け取った時刻（DB側で付与） |
| `store_id`・`channel` | 必須 | 店舗と媒体 |
| `user_id`・`visit_id` | App必須 | Signageでは持たない |
| `selection_item_id` | 提案に対する操作で必須 | どの提案枠への操作か |
| `product_id` | 商品に関する操作で必須 | 対象商品 |
| `payload` | 任意 | 種類ごとの追加情報（JSON） |
| `data_origin` | 必須 | `operated`／`seeded`／`synthetic` |

### 8.2 Appのイベント

| `event_type` | 1件と数える条件 | `payload`の例 | 記録する処理 | 担当Issue |
| --- | --- | --- | --- | --- |
| `product_scanned` | バーコード読取または手動選択で商品が特定できたとき | `{"method":"barcode"}`、`{"method":"manual"}` | App（ブラウザ） | APP-02、APP-07 |
| `scan_failed` | 読み取れなかった、または未登録の商品だったとき | `{"reason":"not_found","code":"…"}` | App（ブラウザ） | APP-02 |
| `cart_item_added`・`cart_quantity_changed`・`cart_item_removed` | かごの更新がDBに保存されたとき。かご更新処理が更新と同時に1件記録し、APP-07では重ねて記録しない | `{"source":"recommendation","quantity":1,"cart_version":2}` | かご更新処理 | APP-02 |
| `recommendation_impression` | 実表示の条件（D-05）を満たしたとき。同じ提案枠では1件まで | `{"visible_ms":1200}` | App（ブラウザ） | APP-07 |
| `recommendation_click` | 提案カードをタップして商品詳細を開いた、またはカード上の追加ボタンを押したとき | `{"target":"detail"}`、`{"target":"add_button"}` | App（ブラウザ） | APP-07 |
| `recommendation_dismissed` | 提案カードを閉じたとき | － | App（ブラウザ） | APP-12（余力拡張） |
| `product_compared` | 比較画面で2つ以上の商品を並べたとき | `{"product_ids":["…","…"]}` | App（ブラウザ） | APP-11（余力拡張） |
| `removal_reason_submitted` | 削除理由を任意入力したとき。対象の削除イベントを参照する | `{"removal_event_id":"…","reason":"price"}` | App（ブラウザ） | APP-12（余力拡張） |

`source`は`scan`／`manual`／`recommendation`のいずれかです。`recommendation`のときは`selection_item_id`を必ず付けます。

購入はイベントではなく注文・明細（DB-03）として記録します。選定結果もイベントではなく選定記録（`selections`・`selection_items`）として記録します。

記録例：

```json
{
  "event_id": "5b1f0c1e-2c1a-4d7e-9a0b-0d3f1a2b3c4d",
  "event_type": "recommendation_impression",
  "schema_version": 1,
  "occurred_at": "2026-10-25T17:30:12+09:00",
  "store_id": "（店舗のUUID）",
  "channel": "app",
  "user_id": "（利用者のUUID）",
  "visit_id": "（来店のUUID）",
  "selection_item_id": "（提案枠のUUID）",
  "product_id": "（商品のUUID）",
  "payload": { "visible_ms": 1200 },
  "data_origin": "operated"
}
```

### 8.3 Signageの記録

Signageは個人に結び付く`user_id`・`visit_id`を持ちません。

| 記録 | 1件と数える条件 | 主な項目 | 担当Issue |
| --- | --- | --- | --- |
| 再生記録`signage_plays` | 1つの広告・販促を表示し始めてから切り替わるまで。最短表示時間（提案：3秒）未満は保存するが再生回数に数えない | 再生ID、端末、配信対象または販促の版、素材の版、`mode`（`schedule`＝設定順、`adaptive`＝店内傾向で選択、`fallback`＝通信断時の案内）、理由、開始・終了時刻 | SIG-02 |
| 推定視認`audience_estimates` | 再生1件につき1件 | 計測方式の版、`measurement_status`（`measured`／`not_measured`／`error`）、推定人数、推定秒数 | SIG-05（カメラ採用時） |

### 8.4 旧イベント名との対応

以前の構成資料（OneDriveの`02_調査資料/システム構成.md`）で使っていた名前との対応です。

| 旧名 | この仕様 |
| --- | --- |
| `ad_impression` | Signageの再生記録`signage_plays` |
| `product_scan` | `product_scanned` |
| `product_compare` | `product_compared` |
| `cart_add`・`cart_remove` | `cart_item_added`・`cart_item_removed` |
| `recommendation_shown` | 選定記録＋`recommendation_impression`（選定と実表示を分けた） |
| `recommendation_accepted` | `recommendation_click`と、提案経由の`cart_item_added` |
| `purchase` | 注文・明細 |

<a id="metrics"></a>

## 9. 指標の定義と数え方

### 9.1 重複を除くルール

- イベントは`event_id`、再生記録は再生ID、注文は`idempotency_key`で一意にする。再送しても件数は増えない。
- 実表示は「来店・商品・提案種別」の組で1件と数える。かご更新で提案が選び直され、同じ商品が同じ種別で再び表示されても増やさない。
- 選定されただけで画面に出なかった提案枠は、実表示に数えない。
- 明細が複数あっても、同じ来店の同じ商品は購入1件として数える（数量・金額は別の指標で合計する）。

### 9.2 Appの指標

集計の軸：店舗、期間、提案種別、配信対象・販促の版、ルールの版。母数は来店単位です。

| 指標 | 分子 | 分母 | 説明 |
| --- | --- | --- | --- |
| 選定枠数 | 選定記録の提案枠の数 | － | 参考値。実表示とは別 |
| 実表示数 | 実表示された「来店・商品・種別」の組の数 | － | 表示数の基本 |
| 表示来店数 | 実表示が1件以上あった来店の数 | － | 少人数判定（D-10）に使う |
| クリック数・クリック率 | クリックがあった組の数 | 実表示数 | 同じ組で何度押しても1件 |
| 提案経由の追加数・追加率 | 提案カードから追加された組の数 | 実表示数 | `source = recommendation` |
| 表示後の追加数 | 実表示の後、同じ来店で経路を問わず追加された組の数 | 実表示数 | スキャンで追加した場合も含む |
| 提案経由の削除数 | 提案経由で追加され、注文前にかごから外れた組の数 | 提案経由の追加数 | － |
| 表示後の購入数・購入率 | 実表示された組のうち、同じ来店の注文明細に含まれる組の数 | 実表示数 | 購入は注文・明細を正本とする |
| 表示後の購入金額 | 上の明細の単価×数量の合計 | － | 円 |

「表示後の購入」は、提案を見た後に買ったことを示す数値で、提案が購入の原因であることを示すものではありません。原因を比べる場合はINS-04・APP-10の実験で、広告なし群と比較します。

### 9.3 Signageの指標

集計の軸：店舗、端末、時間帯（提案：1時間刻み。記録は時刻のまま残すため後から変更できる）、配信対象・販促の版、`mode`。

| 指標 | 定義 |
| --- | --- |
| 再生回数・再生秒数 | 最短表示時間以上の再生記録の件数と、表示秒数の合計 |
| 計測率 | `measured`の再生記録の数 ÷ 再生回数 |
| 推定視認人数・推定視認秒数 | `measured`の推定値の合計。`not_measured`・`error`は0人として足さず、別に件数を示す |
| 同時間帯の対象商品販売数（参考） | 同じ店舗・同じ時間帯の注文明細に含まれる対象商品の数量。Signageを見た人の購入とはみなさない |

AppとSignageの数値は合算しません。Signageの推定視認とAppの購入を、同じ人の行動として結び付けません。

### 9.4 画面での状態の区別

集計画面（INS-03・ADS-04）では、次を区別して表示します。

| 状態 | 表示 |
| --- | --- |
| 0件 | 記録はあるが該当なし。「0」と表示 |
| 少数 | 表示来店数が5未満（D-10）。件数は表示し、率に「少数のため参考値」と注記 |
| 未計測 | カメラ未採用・計測失敗。「未計測」と表示し0にしない |
| 非公開 | 店舗が公開範囲に含めていない指標（メーカー向け）。「非公開」と表示 |
| 事前投入・疑似 | `seeded`・`synthetic`を含む場合、その旨を表示し、`operated`と分けて見られるようにする |

<a id="policies"></a>

## 10. 購入経路とカメラの方針

### 10.1 購入経路（D-07、提案）

| 経路 | 内容 | 使う場面 |
| --- | --- | --- |
| 購入操作経路（第一） | DB-07の注文確定処理とAPP-09の購入画面で、かごから疑似購入を完了する。注文は`data_origin = operated` | 通常のデモ |
| データ代替経路 | DATA-03で、整合した架空の注文・明細を事前投入する。注文は`data_origin = seeded` | 購入操作経路がTEST-01の通し確認に間に合わない場合 |

- 両方を実装する必要はありません。切り替える判断の期限と判断者は「12. 未決定事項」で決めます。
- どちらの経路でも、購入イベントだけを作って購入とはしません。
- 履歴表示（APP-03）の確認に使う過去の注文は、経路に関係なくDATA-01で`seeded`として投入します。
- どちらで実演したかをTEST-01の実施記録とDOC-01の資料に書きます。

### 10.2 カメラ（D-08）

SIG-04で次の条件を実機で確認し、採用か見送りかを決めます。数値は提案値です。

| 項目 | 方針 |
| --- | --- |
| 推定する対象 | まず顔の向き（画面正面からおおむね±30°）で判定する。視線推定は精度を確認できた場合だけ使う |
| 1人と数える条件 | 同じ人を連続フレームで追い、画面を向いていた時間の合計が1秒以上 |
| 採用の目安 | 人が数えた人数と推定人数を既知の場面（見る・見ない・複数人・顔が隠れる）で比べ、10場面中8場面以上で一致 |
| プライバシー | 映像は端末のメモリ内だけで処理し、保存・送信しない。DBへは人数・秒数・計測状態だけを保存する。展示時は計測中である旨を掲示する |
| 説明の仕方 | 「見た」と断定せず「画面を見ていた可能性のある人数（推定）」と表示する |
| 見送った場合 | 再生記録（SIG-02）だけを実装し、推定視認は「未計測」と表示する。疑似値（`synthetic`）や録画は実装済みの根拠にしない |

<a id="walkthrough"></a>

## 11. 架空例による机上確認

1店舗・1メーカー・2利用者で、申請→承認→表示→反応→購入の流れと、各段階で保存される記録・指標を確認します。IDは読みやすさのための略号で、実際はUUIDです。

### 11.1 登場するデータ

| 略号 | 内容 | 備考 |
| --- | --- | --- |
| S1 | 店舗「広島デモ店」（`hiroshima-demo-store`） | 既存データの店舗 |
| M1 | メーカー「瀬戸内トマト食品」（架空、`is_fictional = true`） | 実在企業ではない |
| U1 | 佐藤 美咲。購入履歴あり、履歴利用ON | 既存の架空利用者 |
| U2 | 田中 健。購入履歴なし、履歴利用OFF | DATA-01で追加 |
| D1 | S1の入口のSignage端末 | － |
| P-PASTA | スパゲッティ 500g（`2900000000100`、248円） | 既存商品 |
| P-SAUCE | トマトパスタソース（`2900000000162`、298円） | DATA-01で追加する架空商品 |
| P-CROQ | お店のコロッケ 1個（`PLU-2001`、98円） | 既存商品 |
| P-MILK | 成分無調整牛乳 1L（`2900000000049`） | 既存商品 |
| P-ONION | 玉ねぎ 1個（`PLU-1001`） | 既存商品 |
| P-TEA | KAGO 緑茶 500ml（`2900000000018`） | 既存商品 |

### 11.2 手順と記録

| No. | 操作（時刻は2026-10-25） | サービス | 保存・更新される記録 |
| --- | --- | --- | --- |
| 1 | S1が募集C1「パスタ関連商品の広告募集」を作成・公開。掲載先App・Signage、期間10/25〜11/30、公開範囲はすべての指標 | Ads（店舗） | `ad_calls`：C1（`open`、`disclosure_scope`） |
| 2 | M1がC1を見つけ、P-SAUCEの素材CR1の第1版を登録して申請A1 | Ads（メーカー） | `creatives`：CR1、`creative_versions`：第1版、`ad_applications`：A1（`submitted`） |
| 3 | S1がA1を却下（「価格表示を入れてください」） | Insight | A1：`rejected`、審査コメント |
| 4 | M1が素材を直して第2版を作り、A1を再申請 | Ads（メーカー） | `creative_versions`：第2版、A1：`submitted`（第2版を参照） |
| 5 | S1がA1を承認 | Insight（DB-08） | A1：`approved`、`ad_placements`：PL1（`active`、第2版、承認者・承認時刻） |
| 6 | S1が店舗販促SP1を設定（P-CROQ、16〜19時、App・Signage、理由「店内で揚げたてです」） | Insight | `store_promotions`：SP1第1版 |
| 7 | 17:00〜17:10、D1がPL1とSP1を15秒ずつ交互に表示。切替時に1回だけ2秒で途切れた | Signage | `signage_plays`：PL1が20件（300秒）、SP1が20件（300秒）、2秒の1件（数えない） |
| 8 | 17:30、U1が来店V1を開始し、P-PASTAをスキャン | App | `visits`：V1、`product_scanned`、`cart_item_added`（`source = scan`、かご第1版） |
| 9 | 選定SEL1：①広告P-SAUCE（PL1）②店舗販促P-CROQ（SP1）③通常推薦P-MILK（`replenishment`）。3枠とも実表示 | App | `selections`：SEL1、`selection_items`：3件、`recommendation_impression`：3件 |
| 10 | U1が①の追加ボタンを押す | App | `recommendation_click`、`cart_item_added`（`source = recommendation`、①を参照、かご第2版） |
| 11 | 選定SEL2：①店舗販促P-CROQ②通常推薦P-MILK③通常推薦P-ONION（`co_purchase`）。3枠とも画面内 | App | `selection_items`：3件、`recommendation_impression`：3件（うちP-CROQ・P-MILKは同じ組のため実表示数は増えない） |
| 12 | U1が疑似購入 | App（DB-07） | `orders`：O1（P-PASTA・P-SAUCE、546円）、`order_items`：2件、V1：`completed` |
| 13 | 17:40、U2が来店V2を開始し、P-PASTAをスキャン | App | `visits`：V2、`product_scanned`、`cart_item_added`（`source = scan`） |
| 14 | 選定SEL3：①広告P-SAUCE②店舗販促P-CROQ③通常推薦P-ONION。①②は実表示、③は画面外のまま | App | `selection_items`：3件、`recommendation_impression`：2件 |
| 15 | U2が②の追加ボタンを押す | App | `recommendation_click`、`cart_item_added`（`source = recommendation`） |
| 16 | 選定SEL4：①広告P-SAUCE②通常推薦P-ONION③通常推薦P-TEA。U2はスクロールせず①だけが画面内 | App | `selection_items`：3件、`recommendation_impression`：1件（P-SAUCEは同じ組のため実表示数は増えない） |
| 17 | U2がP-CROQをかごから削除 | App | `cart_item_removed` |
| 18 | U2が疑似購入 | App（DB-07） | `orders`：O2（P-PASTA、248円）、`order_items`：1件、V2：`completed` |

U2は履歴利用がOFFのため、SEL3・SEL4に`replenishment`の提案は含まれません。

### 11.3 期待する集計値（App）

| 指標 | メーカー広告 | 店舗販促 | 通常推薦 | 根拠 |
| --- | --- | --- | --- | --- |
| 選定枠数 | 3 | 3 | 6 | SEL1〜SEL4の12枠 |
| 実表示数 | 2 | 2 | 2 | V1：SAUCE・CROQ・MILK・ONION、V2：SAUCE・CROQ |
| 表示来店数 | 2 | 2 | 1 | 通常推薦はV1だけ |
| クリック数（率） | 1（50%） | 1（50%） | 0（0%） | No.10・No.15 |
| 提案経由の追加数（率） | 1（50%） | 1（50%） | 0（0%） | No.10・No.15 |
| 提案経由の削除数 | 0 | 1 | 0 | No.17 |
| 表示後の購入数（率） | 1（50%） | 0（0%） | 0（0%） | O1にP-SAUCEがある |
| 表示後の購入金額 | 298円 | 0円 | 0円 | － |
| 少数の注記 | あり | あり | あり | 表示来店数が5未満 |

P-PASTAはスキャンで追加した商品で、提案として表示していないため、提案の指標には入りません。注文全体は2件・明細3件・794円です。

### 11.4 期待する集計値（Signage、17時台・D1）

| 指標 | PL1（メーカー広告） | SP1（店舗販促） |
| --- | --- | --- |
| 再生回数 | 20 | 20 |
| 再生秒数 | 300 | 300 |
| 同時間帯の対象商品販売数（参考） | 1（O1のP-SAUCE） | 0 |
| 推定視認 | カメラ採用時のみ。見送り時は「未計測」 | 同左 |

再生記録とU1の購入は時間帯が同じでも結び付けません。

### 11.5 誰が何を見られるか

| 見る人 | 見られるもの | 見られないもの |
| --- | --- | --- |
| U1 | 自分の来店V1・注文O1・提案 | U2の来店・注文 |
| S1の担当者（Insight） | 11.3・11.4のすべての集計、A1の審査、SP1の設定 | 個人を選んで購買明細を一覧すること（集計のみ） |
| M1の担当者（Ads） | PL1の集計（公開範囲内）と「少数」の注記、A1の状態とコメント | SP1や通常推薦の集計、U1・U2の来店・注文の行 |
| D1（Signage） | S1の配信対象と販促、自端末の再生記録の作成 | 利用者・来店・かご・注文 |

### 11.6 この例で確認できること

- 選定枠数（12）と実表示数（6）が異なり、選定だけでは表示に数えない。
- 再選定で同じ商品が再び表示されても、実表示数が増えない。
- 却下→再申請で素材の版が変わり、配信されるのは承認した第2版だけ。
- 購入数は注文・明細から数え、スキャンで追加した商品は提案の成果に入らない。
- Signageの再生とAppの購入を結び付けず、メーカーには自社広告の集計だけが見える。

<a id="open-issues"></a>

## 12. 未決定事項と担当

担当・期限は未定です。決まったら記入し、決定した内容を「1. 決定事項の一覧」へ移します。

| No. | 未決定事項 | 現在の案 | 決める場・関連Issue | 担当 | 期限 |
| --- | --- | --- | --- | --- | --- |
| Q-01 | DB・認証・画像保存に使う基盤 | 行単位の権限・DB関数・ビューを使えるPostgreSQL系の基盤 | COM-02 | 未定 | 未定 |
| Q-02 | 購入経路の確定と、データ代替へ切り替える期限・判断者 | 購入操作経路を第一とする（D-07） | COM-01、TEST-01 | 未定 | 未定 |
| Q-03 | 実表示の条件の数値 | 面積50%以上・1秒以上（D-05） | APP-07 | 未定 | 未定 |
| Q-04 | 提案枠の数と、同じ商品が複数の種別で候補になったときの扱い | 3枠、広告1枠まで、同じ商品は1枠（D-11） | APP-05、APP-06 | 未定 | 未定 |
| Q-05 | 少人数とする閾値と、メーカー向けの見せ方 | 表示来店数5未満で「少数」注記、件数は表示（D-10） | DB-09、ADS-04 | 未定 | 未定 |
| Q-06 | Signageの集計時間帯の刻みと最短表示時間 | 1時間刻み・3秒 | SIG-02、INS-03 | 未定 | 未定 |
| Q-07 | 来店を放棄とみなす時間 | 操作がない状態で3時間 | APP-01、DB-03 | 未定 | 未定 |
| Q-08 | デモ用に追加する商品とメーカー | P-SAUCE（`2900000000162`）、架空メーカー「瀬戸内トマト食品」、利用者U2 | DATA-01、ADS-05 | 未定 | 未定 |
| Q-09 | 実在ブランドを広告素材に使うか | 権利を確認できない限り架空メーカーとする | ADS-05 | 未定 | 未定 |
| Q-10 | 広告画像の形式・サイズ・容量の上限 | App・Signageの表示枠に合わせて決める | COM-03、ADS-05 | 未定 | 未定 |
| Q-11 | カメラの採否 | SIG-04の実機確認で決める（10.2） | SIG-04 | 未定 | 未定 |
| Q-12 | A/B比較を実演するか | 余力がある場合のみ（APP-10・INS-04） | INS-04 | 未定 | 未定 |
| Q-13 | 既存のブラウザ内の店舗設定・商品管理（`/App/store`）の扱い | 共通DBの商品・店舗別価格へ移し、画面はInsightへ移すか残すかを決める | DB-02、APP-02 | 未定 | 未定 |

<a id="review"></a>

## 13. 各担当の確認記録

COM-01の完了条件は、各担当が架空例（11章）を自分の担当範囲で追え、未決定事項の担当が決まった状態です。確認したら記入してください。

| 担当範囲 | 確認者 | 確認日 | コメント |
| --- | --- | --- | --- |
| KAGO/App | | | |
| KAGO/Ads | | | |
| KAGO/Insight | | | |
| KAGO/Signage | | | |
| KAGO/Core（DB） | | | |

<a id="history"></a>

## 14. 改訂履歴

| 版 | 日付 | 内容 |
| --- | --- | --- |
| v0.1 | 2026-10-23 | 初版（案）。issues.mdの方針と既存の事前実装（商品コード・架空利用者・推薦の理由文）を基に作成 |
