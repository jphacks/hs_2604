# 共通DBの適用・検証（DB-02）

2026-10-24・hackday。[設計書](../specs/database-design.md)、[認証・接続設定](backend.md)。

## 対象

`stores`・`store_members`・`products`・`store_products`・`customer_settings`の5表を作成する。商品は全店舗共通、取扱いと税込円の価格は(store_id,product_id)で保存する。商品コードはtextなので先頭0とPLUを保持する。在庫・賞味期限は採用していないため列や仮の値を作らない。

来店・かご・注文はDB-03、画面はAPP-02、所属ごとの許可はDB-06、デモデータの継続投入はDATA-01で行う。本変更に共有環境への適用・公開デプロイは含まない。

## 検証DBへの適用

1. データのないSupabase検証プロジェクトを用意する。Authの`auth.users`と`anon`・`authenticated`・`service_role`が必要。一般の空PostgreSQLだけにはそのまま適用しない。
2. 所有者権限のSQL Editorで、リポジトリの`kago-os/kago-core/supabase/migrations/`を名前順に実行する。
   - `20261024020000_connection_check.sql`（COM-02、適用済みなら省略）
   - `20261024030000_store_product_settings.sql`（DB-02）
3. DB-02は全体をBEGIN／COMMITで適用する。失敗時はROLLBACKして原因を直してから再実行する。成功済みのmigrationを再実行せず、適用履歴を残す。既存表を黙って上書きしないためIF NOT EXISTSを使用していない。
4. 次の検証SQLを所有者権限で実行する。成功時は`DB-02: all assertions passed; rolling back fixtures`を返し、ROLLBACKで全テストデータを取り消す。失敗時はセッションを終えるかROLLBACKする。

```sh
# 接続先は破棄可能な検証DB。認証情報はソースやコマンド履歴に記載しない。
# DB-02適用後、kago-os/kago-core/から実行する。
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/db02.sql
```

接続先はPGHOST・PGDATABASE・PGUSERと安全に管理した認証設定で指定する。SQL Editorでも`supabase/tests/db02.sql`の内容をそのまま実行できる。テスト用の固定UUIDとexample.testの架空Auth行を作るため、既存データのある共有DB・本番DBでは実行しない。

Supabase CLIのmigration管理を導入する場合は既存のCOM-02を含めて履歴を合わせる。接続ガイドの手動適用とCLIを無記録で混在させない。

## 検査する内容

| 内容 | 期待結果 |
| --- | --- |
| 同じ商品を2店舗で登録 | 248円・298円で独立保存。1店を250円にしても他店は298円 |
| 商品コード | `0123456789012`の先頭0を保持し完全一致検索、`PLU-2001`も検索可能 |
| 設定 | 初期値false、本人の行に設定保存。別利用者の設定値は変化しない |
| 更新日時 | 価格・設定のINSERT／UPDATE時にDBが更新。入力の過去日時で上書きできない |
| 不正価格・重複 | 負数・NULL・integer上限超過、商品コード・店舗slug・店舗商品組の重複を拒否。0円は許容 |
| 参照制約 | 不明な店舗・商品・Auth利用者を拒否。参照される店舗・商品・利用者の削除をRESTRICTで拒否 |
| 店舗の商品参照 | テスト内の参照用テーブルで(store_id,product_id)への複合FKを実証。他店だけの取扱商品を拒否 |
| 権限 | 5表でRLS有効、anon／authenticatedの一般権限なし。SELECT権限を検証内だけで追加してもRLSで0行、更新も0行 |

「店舗の商品参照」の検査用テーブルもROLLBACKで削除され、業務表には残らない。DB-03〜05の実際の表でも、商品ID単独ではなく店舗との組を参照すること。取扱停止`is_active=false`は過去の記録を壊さず保持し、新規追加・選定時に後続のDB処理で拒否する。複合FKは取扱いの存在を保証し、現在の取扱状態や利用者の所属認可までは保証しない。

整数価格のDB型はinteger。画面・API側でも小数を拒否し、暗黙の型変換で丸めないこと。通貨・税率・在庫管理は今回の範囲外。

## アクセス許可と投入

Supabaseの既定権限がある環境でも、5表のPUBLIC・anon・authenticated権限を明示的に取り消す。RLSは有効だが、許可ポリシーはまだ作らない。そのため一般利用者の設定保存や商品の参照もDB-06まではできない。テストの保存成功は所有者権限での制約検証であり、本人権限の実証ではない。

管理者・service_roleでのみ初期投入できる。store_membersの変更を利用者に開放しない。service_roleは秘密のサーバー／投入処理専用で、ブラウザの公開用環境変数に置かない。既存のApp用本人クライアントに管理者権限を追加しない。

## 今回の確認記録

- PGlite 0.5.11の空DBで、COM-02→DB-02の順に適用成功。
- Auth利用者表・Authの接続確認関数・3ロールを検証用に最小限模擬し、Supabase相当の既定テーブル権限も付与した上で取り消しを検証した。
- `supabase/tests/db02.sql`の正常系・拒否系が成功。2回実行して毎回ロールバック後の店舗件数0を確認。
- 実Supabaseへの適用、Auth連携、複数接続の同時実行、DB-06の本人・所属ごとの許可は未検証。PGliteの結果で実Supabaseの権限検証済みとはしない。

実Supabaseへの適用時は同じSQLの結果・適用者・日付・migration履歴を記録する。人間のレビュー・承認はPRで確認する。

## DB-03：来店・かご・注文・明細

DB-02の後に`20261024040000_visits_cart_orders.sql`を適用する。`visits`・`cart_items`・`orders`・`order_items`を作成する。DB-02が未適用の環境では実行しない。DB-03単独の検証も、空のSupabase検証プロジェクトへCOM-02→DB-02→DB-03の順に適用してから行う。

```sh
# kago-os/kago-core/から、所有者権限の破棄可能な検証DBに対して実行
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/db03.sql
```

成功時は`DB-03: all assertions passed; rolling back fixtures`を返す。固定UUIDの架空Auth利用者・店舗・商品・来店・注文は最後にROLLBACKする。失敗したSQL EditorセッションはROLLBACKして終了する。共有・本番DBでテストを実行しない。

### 保存形式と保証範囲

| 対象 | DB-03で保証すること | 後続Issueの範囲 |
| --- | --- | --- |
| 来店 | 利用者・店舗・状態・開始終了日時・最終操作日時・かご版。利用者・店舗・開始日時は変更不可。終了した来店は変更不可。版・操作日時は後戻り不可 | 放棄判定のタイマー、認証本人からの開始・更新はAPP-01／DB-06 |
| かご | (visit_id,product_id)で一意、数量1以上。active来店のみ更新・削除可。対象店舗で取扱中の商品だけ追加／更新可。更新日時はDBが付与 | かご版の加算・イベント同時保存・再送の冪等性はAPP-02／DB-05のかご更新処理 |
| 注文 | 来店ごとに1注文、要求キーは一意。来店・利用者・店舗の複合FK、非負整数金額、由来を保存。確定データのUPDATE／DELETEを拒否 | 注文・明細・来店終了の原子的保存、本人確認、版一致、合計検算はDB-07 |
| 明細 | 注文の商品がその注文の店舗で取り扱われることを挿入時に検査。商品名・税込単価・数量を保存し、UPDATE／DELETEを拒否 | 現価格・数量・名前から明細を生成する処理はDB-07。事前投入はDATA-01／03 |
| 履歴 | ordersをuser_id・ordered_atで検索しorder_itemsへ結合する。別の履歴テーブルを作らない | 本人だけが取得できる許可はDB-06、画面はAPP-03 |

かごと明細は設計書の列を維持し、店舗列を二重に持たせずに、トリガーでvisit／orderの店舗とstore_productsを照合する。かご処理は来店行を`FOR UPDATE`、取扱行を`FOR SHARE`でロックする。DB-07とAPP-02の呼出し側も**来店をロックしてからかごを更新**する順序に統一する。Appからの入力だけで店舗の一致を判断しない。

注文のstore_id・user_idはvisitsの複合FKで保証され、商品名・価格のマスター変更から注文明細への自動同期は行わない。過去明細には取扱停止前の購入も残すため、明細挿入の店舗参照検査はis_activeを条件にしない。通常購入時のis_active検査はDB-07で行う。

この段階では、所有者・管理用書込みは注文行だけ、または明細だけを段階的に投入できる。DB-03の制約だけでは空注文・totalと明細合計の不一致・cart_versionと現在のかごの不一致・購入前の時刻を拒否しない。これらの確定条件を検証し一体で保存するのはDB-07。一般ロールからはまだ4表へ直接書き込めず、DB-06で注文への直接INSERTも許可しないこと。

実験のassignment_id／experiment_armは、参照先のexperiment_assignmentsを作るDB-05で同時に追加する。DB-03でFKのない仮の割当IDを保存しない。終了後の来店は不変のため、実験割当は終了前に固定する設計にする。

### DB-03の検証記録（2026-10-24）

- 空のPGlite 0.5.11へCOM-02→DB-02→DB-03を適用成功。Auth関連はDB-02と同じ最小構成を模擬。
- 同じ利用者の2回来店・かご数量1／3・別々のかご版・注文248円／744円を保存。合計992円。
- 商品名と価格を変更し取扱停止しても、過去明細の名前と単価248円が変わらないことを確認。
- 終了済みかごの変更・来店の再開／所有者変更・他店舗商品の追加・不一致の利用者／店舗の注文・重複注文／要求キー・数量0・負金額・不正な由来を拒否。
- 注文と明細のUPDATE／DELETE拒否、来店参照中の削除RESTRICT、4表のRLSと一般権限の取消しを確認。
- `supabase/tests/db03.sql`を2回成功し、各回ロールバック後の店舗件数0を確認。
- 実Supabase、複数接続の競合、DB-07の購入確定、本人権限は未検証。DB-02 PR #58はマージ済み。DB-03はDB-02より後に適用する。

## DB-04：広告募集・申請・承認・店舗販促

DB-02の後に`20261024050000_ads_promotions.sql`を適用する（DB-03とは独立だが、名前順にCOM-02→DB-02→DB-03→DB-04で適用する）。`makers`・`maker_members`・`ad_calls`・`creatives`・`creative_versions`・`ad_applications`・`application_revisions`・`ad_placements`・`store_promotions`・`promotion_versions`の10表を作成する。

```sh
# kago-os/kago-core/から、所有者権限の破棄可能な検証DBに対して実行
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/db04.sql
```

成功時は`DB-04: all assertions passed; rolling back fixtures`を返す。募集期間は終了前でないと申請できないため、テストの募集は2099年の固定日付を使う。共有・本番DBでテストを実行しない。

### 保存形式と保証範囲

| 対象 | DB-04で保証すること | 後続Issueの範囲 |
| --- | --- | --- |
| 募集 | 媒体`app/signage`の重複なし1件以上、カテゴリ1件以上、開始＜終了、公開範囲は5指標の部分集合。状態はdraft→open→closedのみ。公開後は店舗・媒体・期間を固定、closedは変更不可。削除はdraftのみ | 自店担当だけの作成・更新はDB-06、画面はADS-02 |
| 素材・版 | 素材のメーカー・商品は変更不可。版は素材ごとに1からの連番で追加のみ。image_pathは保存先キーでURL・クエリを拒否 | 画像保存と署名付きURLはCOM-03、媒体別assetsは合意後 |
| 申請 | 募集・店舗、素材・メーカー、版・素材を複合FKで一致させる。同じ募集に同じ素材は1件。新規・再申請は募集がopenかつ終了前、媒体と希望期間は募集内、商品が募集店舗で取扱中のときのみ。状態はsubmitted→approved/rejected、審査後→submitted（次の回）だけ。審査中は内容を変更不可。審査者は募集店舗の所属者、審査時刻はDBが付与。却下は理由必須（200字以内）。削除不可 | 本人・自社の申請操作はDB-06、審査操作はINS-01・DB-08 |
| 申請の履歴 | 申請・再申請のたびに回を追加し、審査結果・理由・審査者・時刻をその回に記録する。トリガー以外の追加・変更・削除を拒否（service_roleもSELECTのみ） | 表示はADS-03・INS-01 |
| 配信対象 | 承認中の現在の回だけを配信でき、版・媒体・期間・承認者は審査内容の範囲に固定。承認時刻は審査時刻を写す。1つの回に1件、申請ごとにactiveは1件。activeからsuspended（理由・自店所属の停止者必須）、expired（終了後のみ）、superseded（同じ申請の新しい回が承認済みのときのみ）へ一方向。削除不可 | 旧版のsuperseded化と新版の作成を1トランザクションで行う承認切替はDB-08 |
| 店舗販促 | 店舗・商品は店舗取扱表への複合FK。版は連番で追加のみ、activeは販促ごとに1版、状態はactive→inactiveのみ。time_windowsの構造・時刻・曜日・重なりを検査 | 作成・停止の操作はINS-02、配信時の選定はAPP-05・SIG-06 |

通常推薦・店舗販促・メーカー広告は、それぞれ参照なし・`promotion_versions`・`ad_placements`で区別する。提案枠にどれを保存するかはDB-05の`selection_items`で実装する。

### DB-08・DB-06への引継ぎ

- 承認切替は、申請行を`SELECT … FOR UPDATE`でロックし、申請をapprovedにした後、旧active配信をsupersededにしてから新しい配信を挿入する。値の変わらないUPDATEはトリガーが拒否するため、ロック目的のUPDATEは使わない。
- 承認時の媒体の絞込みは配信対象のchannelsで表す（申請の部分集合）。停止の再審査は新しい回の再申請と承認で行い、停止した回を再配信しない。
- 他表の参照・行ロックを行うガードはSECURITY DEFINER（search_path空、EXECUTE剥奪）で動く。DB-06では対象表への権限とRLSだけを付与すればよく、参照先の表を一般ロールへ開放しない。DB-03のガードはinvokerのままなので、DB-06で同じ扱いにするか確認する。
- 10表ともRLS有効、anon・authenticatedの権限なし。service_roleも既定のALLを取り消し、追加のみの表には削除・更新を与えない。

### DB-04の検証記録（2026-10-24）

- 空のPGlite 0.5.11へCOM-02→DB-02→DB-03→DB-04を適用成功（Auth・3ロールは従来と同じ最小模擬、service_roleはBYPASSRLS）。
- 募集→申請→却下→修正版で再申請→承認・配信→素材差替えの再申請→承認切替→停止を再現。3回分の履歴、旧配信の第2版固定、停止理由・停止者を確認。
- 他店担当の審査・停止、他社素材・他の素材の版・他店舗の申請や配信、取扱外・取扱停止の商品、draft・closed・期間終了後の募集への申請、範囲外の媒体・期間、審査中の内容変更、履歴の改ざん、配信の再作成・早すぎるsuperseded／expired、販促の不正な時間帯を拒否。
- service_roleでの版の追加・販促版の追加、DB-06想定（authenticatedへ対象表の権限と許可ポリシーだけを付与）での版・申請・承認・配信の作成を別途確認。
- `supabase/tests/db02.sql`〜`db04.sql`を各2回成功し、各回ロールバック後の店舗件数0を確認。
- 実Supabase、複数接続の同時実行、DB-06の本人・所属ごとの許可は未検証。
