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

APP-01からの開始・再開には、DB-03適用後に`20261024041000_app_start_visit.sql`も適用します。本人・店舗をDB側で確認し、再開と明示的な新規来店を一体の処理で保存する関数です。初期適用時は`SECURITY INVOKER`で、DB-06適用まで一般利用者からの実行は拒否されます。DB-06では本人・役割の検査を保って`SECURITY DEFINER`へ切り替え、一般利用者には来店の直接書込みを許可せず関数だけを実行できるようにします。[Appとの接続仕様](../specs/app-session-contract.md)を参照してください。共有Supabaseへの適用は本変更では実施していません。

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

## DB-05：選定・行動・実験・Signage計測

DB-04の後に`20261024060000_selections_events_signage.sql`を適用する。`experiments`・`experiment_assignments`・`selections`・`selection_items`・`events`・`signage_devices`・`signage_plays`・`audience_estimates`の8表を作成し、`visits`に`assignment_id`・`experiment_arm`を追加する。

```sh
# kago-os/kago-core/から、所有者権限の破棄可能な検証DBに対して実行
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/db05.sql
```

成功時は`DB-05: all assertions passed; rolling back fixtures`を返す。広告・販促は2026-01-01〜2099-01-01の固定期間で作り、現在時刻で配信可能な状態にする。共有・本番DBでテストを実行しない。

### 保存形式と保証範囲

| 対象 | DB-05で保証すること | 後続Issueの範囲 |
| --- | --- | --- |
| 選定 | active来店の現在のcart_versionに対してだけ保存。枠1〜3、同じ商品は1枠、広告・販促は各1枠まで。organicは参照なし、sponsoredは配信対象、store_promoは販促版が必須。対象は来店店舗で取扱中、広告はactive・App媒体・期間内で対象商品が一致、販促はactive・App媒体・期間内・時間帯内で対象商品が一致。`sponsored_*`／`store_*`の理由は該当種別だけ。履歴利用OFFの利用者に`replenishment`を保存しない。追加のみ | 候補の計算・優先順・かご内商品の除外はAPP-05、作成者の限定（Appサーバーのみ）はDB-06 |
| イベント | 共通仕様8.2の10種類。種類ごとのpayload（method・source・quantity・quantity_delta・cart_version・visible_ms≧1000・target・product_ids・削除理由）、提案操作の枠・商品の必須、`source=recommendation`と枠の一致をCHECKで検査。枠は同じ来店・同じ商品のもの、比較商品は店舗の取扱商品、削除理由は同じ来店の削除イベントを参照。来店終了後の遅延再送も受け付ける。追記のみ | かご更新・版の加算・かごイベントを同時に保存する処理はAPP-02、送信はAPP-07、本人だけの記録はDB-06 |
| 再送 | イベントID・選定ID・枠ID・再生ID・推定のplay_idは、同じ内容なら無操作、違う内容なら23505。同じIDの同時送信はアドバイザリロックで直列化する。実表示は枠ごとに最初の1件だけ保存し、2件目以降は無操作 | 集計の重複除外（来店・商品・種別）はDB-09 |
| 実験 | App実験はunit=`user`、Signage実験は`device_time_window`。2群以上。割当はApp実験の群だけで1利用者1件、変更不可。来店の群は割当と利用者・群を複合FKで一致させ、店舗・期間も検査し、一度付けたら変更不可 | 割当の作成はAPP-10、Signageの時間窓割当表は未実装（比較を実施する場合に追加） |
| Signage | 端末の店舗は固定。再生は終了後に1回送信（ended_at必須）。広告は同店舗・signage媒体・期間内・承認素材版と一致、販促は同店舗・signage媒体・期間内。案内（fallback）は参照なし。配信停止後に届いた再生も記録する。user_id・visit_idの列を持たない | 端末本人の記録だけの許可はDB-06、再生回数の数え方（3秒・動画の完了）はDB-09 |
| 推定視認 | 再生1件に1件。measuredは人数・秒数が0以上で必須、not_measured／errorはNULL（0人として保存しない）。由来は再生と同じか`synthetic` | カメラ処理はSIG-05 |

### DB-05の検証記録（2026-10-24）

- 空のPGlite 0.5.11へCOM-02→DB-02→DB-03→APP-01→DB-04→DB-05を適用成功。
- 選定3枠（通常・広告・販促）→保存直後の実表示0件→実表示（同じIDの再送・枠の2件目は無操作、異内容は拒否）→クリック→提案経由の追加→全数量削除と削除理由→スキャンで再追加→注文→来店終了後の遅延再送までを保存し、1つの組として追跡できることを確認。
- 他店・他来店・他利用者の参照、取扱外商品、古いかご版・終了済み来店への選定、時間帯外の販促、商品と一致しない広告、種別と合わない理由、履歴OFFの補充提案、不正なpayload（欠落・型違い・不正UUID）、イベントの変更・削除を拒否。
- 実験の群の固定・他店・他利用者の割当を拒否。Signageの再生・推定で、他店の配信、素材版違い、期間外、未計測の0、由来の不一致を拒否し、実測0と未計測を区別できることを確認。
- service_roleでの投入、DB-06想定（authenticatedへ対象表の権限と許可ポリシーだけを付与）でのイベント・再生・推定の保存、APP-01の`app_start_visit`と同じトランザクションでの選定保存を別途確認。kago-appの`visit-database.test.mts`を全migration適用で実行し9件成功。
- `supabase/tests/db02.sql`〜`db05.sql`を各2回成功し、各回ロールバック後の店舗件数0を確認。
- 実Supabase、複数接続の同時実行、DB-06の本人・所属ごとの許可は未検証。

## DB-06：役割ごとの読み書き権限

DB-05の後に`20261024070000_access_policies.sql`を適用する。全業務表のRLSは有効のまま、`authenticated`へ必要な操作だけを付与し、行を本人・自店・自社・自端末に絞るポリシーを作る。`anon`には何も付与しない。

```sh
# kago-os/kago-core/から、所有者権限の破棄可能な検証DBに対して実行
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/db06.sql
```

成功時は`DB-06: all assertions passed; rolling back fixtures`を返す。JWTの`sub`・`app_metadata.kago`を`request.jwt.claim.sub`／`request.jwt.claims`で模擬し、各役割に切り替えて確認する。`db02.sql`〜`db05.sql`もDB-06適用後に実行でき、一般ロールの権限確認はDB-06の有無で切り替わる。

### 判定の仕組み

- 役割は`app_metadata.kago.roles`（管理者のみ設定）で判定し、行は必ず`store_members`・`maker_members`・`signage_devices`・`auth.uid()`で絞る。役割だけでは何も読めない（所属のない`store_staff`は0件）。
- 端末は`signage_devices.auth_user_id = auth.uid()`かつ`is_active`かつJWTの`device_id`・`store_id`が行と一致する場合だけ自端末として扱う。主張を書き換えたJWT、停止した端末は0件。
- 判定用の関数（`kago_has_role`・`kago_my_store_ids`・`kago_my_maker_ids`・`kago_my_device_id`など）はSECURITY DEFINER・`search_path`空で、呼出し元自身についてだけ答える。ポリシー内では`(select …)`で包み、1文につき1回だけ評価する（2万行の再生記録で店舗担当の件数取得が約0.9秒→約15ms）。

### 役割ごとの範囲

| データ | customer | store_staff（所属店舗） | maker_staff（所属メーカー） | signage（自端末） |
| --- | --- | --- | --- | --- |
| 店舗・商品・店舗別価格・メーカー | 全件R | 自店R | 全件R | 自店R |
| 利用者設定 | 本人CRU | － | － | － |
| 来店・かご・注文・明細 | 本人R（書込みは関数のみ） | － | － | － |
| 募集 | － | 自店CRUD（削除はdraftのみ） | draft以外R | － |
| 素材・版 | 配信中の版R | 自店へ申請された分R | 自社CR | 自店で配信中の版R |
| 申請・審査履歴 | － | 自店宛R（審査はDB-08） | 自社CR、再申請のみU | － |
| 配信対象 | activeR | 自店R | 自社申請分R | 自店activeR |
| 販促・版 | active版R | 自店CR、active→inactiveのU | － | 自店R（版はactiveのみ） |
| 実験・割当 | 条件R、本人の割当R | 自店の実験CR | － | 自店の実験R |
| 選定・枠 | 本人R（保存は`kago_save_selection`） | － | － | － |
| イベント | 本人C・R（かご操作イベント以外、`operated`のみ、来店時間内） | － | － | － |
| 端末・再生・推定 | － | 自店R | 稼働中の端末の所在地R（`auth_user_id`は不可） | 自端末C・R |

`－`は0件（SELECT権限がある表）または権限エラー。店舗担当・メーカー・端末からは来店・かご・注文・明細・イベント・選定・利用者設定を1行も読めない。集計はDB-09のビューで渡す。

### 所有者権限の書込み経路

| 関数 | 呼べる人 | 内容 |
| --- | --- | --- |
| `app_start_visit`（APP-01） | customer | DB-06でSECURITY DEFINERへ変更。利用者は`auth.uid()`、来店の開始・再開・明示的な新規来店だけを行う。visitsへの直接INSERT／UPDATEは付与しない |
| `kago_save_selection(visit_id, cart_version, rule_version, items, selection_id)` | customer | 本人の来店に1〜3枠の選定を保存。DB-05のトリガーが版・店舗・種別・配信可否を再検査。同じ`selection_id`の再送は無操作 |
| かご更新（APP-02）・購入確定（DB-07）・承認／停止（DB-08）・実験割当（APP-10） | 各Issueで作成 | DB-06では直接書込みを付与しない。作成時はSECURITY DEFINER・`auth.uid()`・所属確認・`search_path`空で実装し、`authenticated`へEXECUTEだけを付与する |

APP-01の`kago-app/tests/visit-database.test.mts`もDB-06込みへ更新し、関数がSECURITY DEFINERであること、来店への直接INSERT／UPDATEを拒否すること、2利用者のかご復元が正式RLSで分離されることを確認する。テスト専用のGRANT／ポリシーは追加しない。

### 既知の制限

- 消費者は自分の来店に任意の選定を保存し、実表示イベントを送れる。生の行は増えるが、共通仕様9.1の集計は(来店・商品・種別)で1件に数えるため、1来店で水増しできるのは1件まで。複数来店を使った水増しは集計・監視側で扱う。
- トリガーがRLSより先に動くため、他テナントのUUIDを知っていると存在や版数がエラーコード（23505・23514）から推測できる。行の内容は返らない。
- 画像保存先（Supabase Storage）の権限はCOM-03で設定する。

### DB-06の検証記録（2026-10-24）

- 空のPGlite 0.5.11へ全migrationを適用し、`db02.sql`〜`db06.sql`を各2回成功（DB-06なしでも`db02`〜`db05`が成功）。
- anon・役割なし・customer 2名・store_staff 2名と所属なし1名・maker_staff 2名・signage 2台で、許可／拒否とID書換え（他人の来店ID・利用者ID・店舗ID・メーカーID・端末ID、JWTの端末主張の書換え、停止端末）を確認。
- kago-appの来店・かご取得処理（`loadShoppingContext`・`startShoppingVisit`）を、テスト用の許可なしでDB-06の権限だけで実行し10件成功。
- 実Supabaseでの適用、実JWTでの確認、複数接続の同時実行は未検証。

## DB-07：購入確定（注文・明細・来店終了を一体で保存）

DB-06の後に`20261024080000_checkout.sql`を適用する。本人のセッションから呼ぶ所有者権限の関数`kago_checkout`を追加する。テーブル定義・権限の変更はない。

```sh
# kago-os/kago-core/から、所有者権限の破棄可能な検証DBに対して実行
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/db07.sql
```

成功時は`DB-07: all assertions passed; rolling back fixtures`を返す。

### 呼出し契約（APP-09）

```text
kago_checkout(
  p_visit_id uuid,               -- 購入する来店
  p_idempotency_key uuid,        -- 購入確認画面を開いた時にAppが作る購入要求ID。再送でも同じ値
  p_expected_cart_version integer, -- 確認画面に表示したかごの版
  p_expected_total integer       -- 確認画面に表示した税込合計（円）
) returns table (order_id uuid, total integer, ordered_at timestamptz, replayed boolean)
```

Supabaseからは`client.rpc("kago_checkout", {...})`で呼ぶ。利用者IDは引数に受けず`auth.uid()`から決める。`replayed = true`は同じ購入要求の再送で、既存の注文を返したことを示す。

| 状況 | 結果 |
| --- | --- |
| 正常 | 現在の取扱・価格から明細（商品名・税込単価・数量）を作り、合計を検算して注文を保存し、来店を`completed`にする。注文時刻＝来店終了時刻。由来は`operated` |
| 同じ購入要求の再送（同じ本人・来店・版・合計） | 同じ注文を返す（`replayed = true`）。件数は増えない |
| 同じ購入要求IDを別の来店・版・合計・利用者で使用 | 23505。新しい注文を作らない |
| 注文済みの来店に別の購入要求ID | 23505 |
| かごの版が違う | 40001・detail `cart_changed`。かごを再読込して確認画面を出し直す |
| 現在価格の合計が確認画面と違う | 40001・detail `price_changed`。新しい合計で確認し直す |
| 空のかご・取扱停止の商品・終了済み／放棄済みの来店 | 23514 |
| 他人の来店・customer以外・未ログイン | 42501 |
| 合計がinteger上限を超える | 22003 |

同じ購入要求IDの同時送信はアドバイザリロックで、同じ来店への別IDの同時送信は来店行のロックで直列化する。かごの商品と店舗別価格は確定まで共有ロックする。途中で失敗した場合は関数全体が取り消され、注文・明細・来店終了の一部だけが残ることはない。購入イベントは作らない（注文が正本）。

### DB-07の検証記録（2026-10-24）

- PGlite 0.5.11（PostgreSQL 17相当）と実PostgreSQL 16.15で全migrationを適用し、`db02.sql`〜`db07.sql`を各2回成功した。実PostgreSQLではSupabaseと同じ定義の`auth.uid()`・`auth.jwt()`を使った。
- `db07.sql`：未ログイン・店舗担当・他人の来店・引数欠落・かご版違い・価格変更・空のかご・取扱停止・放棄済み来店・合計の上限超過を拒否することを確認した。途中失敗（明細2行目で失敗）では注文・明細0件、来店はactive・版2のまま、かご2行が残る。成功時は548円の注文1件・明細2件、来店終了＝注文時刻。再送では同じ注文を返し、別IDや別合計、他人による同じIDの再使用は23505。購入後に価格を変えても明細は変わらない。
- 実PostgreSQLの別接続で、同じ購入要求IDを3件同時に送ると注文1件（1件が作成、2件が再送扱い）になった。同じ来店へ別IDを2件同時に送ると、注文1件と23505になった。
- PostgreSQL 16ではON DELETE RESTRICTの違反が23503、17では23001になるため、`db02`〜`db04`の期待値をサーバーのバージョンで切り替えた。
- 実Supabaseでの適用、Appからの呼出し（APP-09）は未検証。

## DB-08：広告の承認・却下・停止と有効な版の切替

DB-07の後に`20261024090000_ad_approval.sql`を適用する。店舗担当が本人のセッションから呼ぶ所有者権限の関数3つと、操作履歴の表`ad_operation_logs`を追加する。

```sh
# kago-os/kago-core/から、所有者権限の破棄可能な検証DBに対して実行
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/db08.sql
```

成功時は`DB-08: all assertions passed; rolling back fixtures`を返す。

### 呼出し契約（INS-01）

| 関数 | 引数 | 戻り値 |
| --- | --- | --- |
| `kago_approve_application` | `p_application_id`、`p_expected_revision`（画面に表示した申請の回）、`p_starts_at`・`p_ends_at`（省略時は希望期間）、`p_channels`（省略時は申請の媒体。絞込みのみ可） | `placement_id, revision, replayed` |
| `kago_reject_application` | `p_application_id`、`p_expected_revision`、`p_reason`（必須・200字以内） | `revision, replayed` |
| `kago_suspend_placement` | `p_placement_id`、`p_reason`（必須・200字以内） | `placement_id, replayed` |

Supabaseからは`client.rpc("kago_approve_application", {...})`などで呼ぶ。操作者は`auth.uid()`で、申請・配信対象の店舗の`store_members`に所属する`store_staff`だけが実行できる。Insightの仮データ層`approveApplication(applicationId, {starts_at, ends_at})`・`rejectApplication(applicationId, reason)`・`suspendPlacement(placementId, reason)`は、申請の回（`revision`）を加えてそのまま対応する。

| 状況 | 結果 |
| --- | --- |
| 承認 | 申請を`approved`にし、同じ申請の旧`active`配信対象を`superseded`にして、新しい回の配信対象を`active`で作る。審査履歴・操作履歴（`supersede`→`approve`）も同時に保存する |
| 却下 | 申請を`rejected`にし、理由と審査者を残す。承認済みの前の回の配信は続く |
| 停止 | 配信対象を`suspended`にし、理由・停止者・時刻を残す。再開は再申請と承認で行う |
| 同じ操作の再送（同じ回・期間・媒体、または同じ理由） | 同じ結果を返す（`replayed = true`）。履歴は増えない |
| 審査済みの回に別の判断・内容 | 23505 |
| 画面表示後にメーカーが再申請した | 40001・detail `revision_changed`。再読込して新しい回を審査する |
| 期間が希望期間外、媒体が申請外、商品が取扱停止、停止済み・置換済みの配信の停止 | 23514 |
| 他店の担当・メーカー・所属のない担当・未ログイン | 42501 |
| 理由なし・201字以上・引数欠落 | 22023 |

同じ申請への操作は申請行のロックで直列化する（停止も申請→配信対象の順にロックし、承認と同時でもデッドロックしない）。途中で失敗した場合は申請・審査履歴・配信対象・操作履歴のどれも変わらない。

`ad_operation_logs`は追記のみで、自店の担当と申請したメーカーが読める。どの利用者も直接書き込めない。

### DB-08の検証記録（2026-10-24）

- PGlite 0.5.11と実PostgreSQL 16.15で全migrationを適用し、`db02.sql`〜`db08.sql`を各2回成功した。
- `db08.sql`：他店担当・メーカー・所属のない担当・未ログインを拒否した。範囲外の期間・媒体では申請が未審査のまま残った。承認と再送、第2版の承認による第1版の置換、第3版の承認途中の失敗（操作履歴の書込みで失敗させ、申請・配信・履歴が変わらないこと）を確認した。却下でも前の回の配信が続き、停止と再送、履歴の改ざん拒否も確認した。全過程で申請ごとの`active`は1件以下。
- 実PostgreSQLの別接続で、2人の担当が同じ回を同時に承認すると配信対象1件（作成1・再送1）、操作履歴1件だった。新しい回の承認と旧配信の停止を同時に行うと、承認が先に確定して旧配信は`superseded`、停止は23514になった。どちらも`active`は1件で、デッドロックはなかった。
- 実Supabaseへの適用、Insight画面からの呼出しは未検証。

<a id="db09"></a>

## DB-09：表示・反応・購入とSignageの共通集計

DB-08の後に`20261024100000_metric_views.sql`を適用する。HTTP API・画面・率の計算は追加しない。本人JWTを持つ既存クライアントから、下記ビューのSELECTまたはDB関数のRPCを使う。

| 入口 | 内容・権限 |
| --- | --- |
| `kago_app_metrics_view` | 全期間のApp集計。自店の店舗担当、または許可指標のみの自社広告メーカー |
| `kago_signage_metrics_view` | 全期間のSignage集計。同上。端末・東京時間の1時間枠・配信対象／販促版・mode別 |
| `kago_selection_counts` | 自店担当のみ。店舗・東京日付・種別・施策版・ルール版別の選定枠数 |
| `kago_app_metrics(p_start, p_end, p_store_id?, p_data_origin?)` | 期間を指定したApp集計。先頭2引数の省略時は全期間 |
| `kago_signage_metrics(p_start, p_end, p_store_id?, p_data_origin?)` | 期間を指定したSignage集計。先頭2引数の省略時は全期間 |
| `kago_order_totals(p_start, p_end, p_store_id)` | 自店担当のみの注文総数・数量・金額。提案の帰属と独立した正本の合計 |

期間は`[p_start,p_end)`。NULL・逆転・同時刻の期間、未知のdata_originは22023を返す。App／Signageの集計で所属外を指定しても行は返らない。全体の注文合計で所属外を指定した場合は42501。記録がない期間は空配列／0行を返す。既存の集計行のうち購入なし等は0、非公開はNULLなので、画面でNULLを0へ置き換えないこと。

```sql
-- 実行者は認証済みの自店担当または自社メーカー。
-- 例のUUIDは実際に所属する検証店舗へ置き換える。
select * from public.kago_app_metrics(
  '2026-10-22T00:00:00+09', '2026-10-23T00:00:00+09',
  '20000000-0000-4000-8000-000000000001', 'operated');
select * from public.kago_signage_metrics(
  '2026-10-22T17:00:00+09', '2026-10-22T18:00:00+09',
  '20000000-0000-4000-8000-000000000001', 'operated');
```

### Appの数え方

基準は[共通仕様9章](../specs/common-spec.md#metrics)。`(visit_id,product_id,placement_type,data_origin)`で最初の有効な実表示を選び、その枠の配信対象・販促版・ルール版へ帰属する。期間もその実表示時刻で絞るため、後日に同じ商品が再表示されても新たな表示として計上しない。同時刻の表示はevent_id順で決定する。

返却する軸はstore_id・channel=`app`・data_origin・placement_type・ad_placement_id・promotion_version_id・rule_version。件数は以下。

| 列 | 内容 |
| --- | --- |
| `impressions`／`shown_visits` | 重複排除した表示組数／その集計行の異なる来店数 |
| `clicks` | 基準表示以降〜来店終了のクリックが1回以上ある組数。表示前クリックは保存されても除外 |
| `recommendation_adds`／`adds_after_impression` | 提案経由の追加／経路を問わない追加がある組数 |
| `recommendation_removes` | 提案経由の追加後、購入前に全量削除した組数。削除後再追加・購入した場合も削除1・購入1 |
| `purchases`／`purchased_quantity`／`purchase_amount` | 同じ由来・来店の実表示以降の注文に対象商品がある組数／数量／円 |
| `small_sample` | その集計行の表示来店数が5未満。表示数非公開ならNULL |
| `disclosed_metrics` | 今回許可される指標。自店担当には内部指標、メーカーには募集のdisclosure_scope |

反応は実際に操作した枠を保持したまま、同じ来店・商品・種別・由来の基準表示へ帰属させる。反応の行数と明細の行数を直接掛け合わせず、存在判定と1商品1明細で購入金額の増殖を防ぐ。来店終了後のイベントは除外する。

表示のない選定はimpressionsへ入れない。DB-05のselectionsには由来列がないため、`kago_selection_counts.data_origin`は**unclassified**（operatedの別名ではない）。表示イベントがある選定だけから全選定の由来を推測せず、未表示の枠も選定数に残す。由来別の選定数が必要なら、後続の選定書込み契約で由来を追加してから対応する。由来別の表示・反応・購入は既存のdata_originで分けて取得できる。

表示来店数は集計行を跨いで足すと重複し得る。任意期間の値は日別値の合算ではなく期間指定関数で再集計する。同じ来店・商品が複数の種別で表示されると、その購入は各種別で評価されるため、提案別の購入数・金額を全店総計として足さない。全店の正本は`kago_order_totals`を使う。

### Signageの数え方

終了済み・3秒以上・fallback以外を対象とし、開始時刻の東京時間の1時間枠へ1回だけ帰属させる。時間境界を跨ぐ15秒の再生も、開始した時間枠に1回・15秒として数える。Appの表示・購入と個人単位で結合しない。

- `plays`・`play_seconds`：再生回数と秒数。
- `measured_plays`・`not_measured_plays`・`error_plays`：同じ由来の計測状態。推定行がない再生も未計測。
- `estimated_viewers`・`estimated_view_seconds`：同じ由来のmeasuredのみの合計。実測0は0、計測がなければNULL。人数は延べ人数でユニーク人数ではない。
- `synthetic_estimates`・`synthetic_viewers`・`synthetic_view_seconds`：実操作／事前投入の再生に添えた疑似計測の件数と値を分離。実測側の分子・推定合計へは入れない。再生自体がsyntheticなら通常の列をdata_origin=syntheticで返す。
- `reference_sales_quantity`：同店舗・同じ1時間枠・同商品・同由来の販売数量の参考値。任意期間の境界が時間枠の途中でも、選ばれた再生の**時間枠全体**で販売を数える。同じ商品・時間枠を複数端末や複数版で出した場合は同じ参考値が各行に現れるため、行を足して総販売数にしない。

### メーカーへの公開制限

DB関数は所有者権限で集計するが、必ず認証利用者のstore_members／maker_membersと役割を確認し、集計済みの行だけ返す。呼出し側の任意の利用者IDを引数にしない。

| disclosure_scope | 公開する列 |
| --- | --- |
| impressions | impressions、shown_visits、small_sample |
| clicks | clicks |
| cart_adds | recommendation_adds、adds_after_impression、recommendation_removes |
| purchases | purchases、purchased_quantity、purchase_amount、reference_sales_quantity |
| signage_views | 再生・計測の各列（疑似値の分離列も含む） |

メーカーには自社の広告行だけが見え、通常推薦・店舗販促・他社広告・生イベント・利用者ID・来店ID・注文IDを返さない。公開範囲は読取時の募集設定を使う。指標が非公開でも自社配信対象の行は存在し得るが、値はNULLになる。自店担当は公開設定にかかわらず自店の内部指標を取得できる。

`kago_app_cohorts_internal`には帰属計算のため来店IDがあるが、PUBLIC・anon・authenticated・service_roleからの直接アクセスを剥奪する。公開ビューは集計関数または自店だけに絞った集計を呼び、個人列を持たない。customer・Signage役割は集計行0件、anonは関数・ビューの実行自体を拒否する。

### DB-09の検証記録（2026-10-24・hackday）

`supabase/tests/db09.sql`を破棄可能な検証DBの所有者で実行する。全fixtureはROLLBACKする。実Auth・RLSの最終検証は共有Supabaseの本人JWTで別途行う。

```sh
# kago-os/kago-core/から、全migration適用済みの破棄可能な検証DBへ
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/db09.sql
```

- PGlite 0.5.11へCOM-02〜DB-09の全migrationを適用し、DB-02〜09の検証SQLを各2回実行して成功。毎回fixtureのロールバックを確認。
- 2店舗・2利用者・2メーカーで確認。S1のM1広告はoperatedで表示1・クリック1・追加1・削除1・購入1・数量2・金額200円。再送と別枠での再表示は表示数を増やさず、初回のルール版へ帰属。
- 通常推薦の2商品は表示2・表示来店1・購入2・金額400円。別種別との購入重複があるため、S1のoperated正本の注文2件・数量4・500円とは足し合わせない。
- seededの表示とoperatedの注文、およびoperatedの表示とseededの注文を結合しない。対象なしの期間、期間端、表示前クリックも検証。
- M1のoperated Signageは3再生・45秒。実測0人・エラー1・疑似計測1（5人・10秒）を分け、3秒未満とfallbackを除外。17:59:50〜18:00:05を17時台だけに計上。
- 自店／自社だけの取得、公開範囲の変更、個人列なし、内部ビュー拒否、customer・端末・anon拒否を確認。
- 実PostgreSQLサーバー・実Supabaseへの適用、実JWT、画面からの確認は今回未実施。UIのグラフ・率はINS-03／ADS-04で実装する。

## 共有開発DBの確認記録（2026-10-24）

コードのローカル検証とは別に、開発用SupabaseでCOM-02、DB-02〜08、APP-01来店開始関数とDB-09の定義を確認しました。publicの業務テーブル28個はすべてRLSが有効で、ポリシーは42件です。適用済みのSQLを再実行してはいけません。

既存の検証用店舗担当・Signageアカウントを検証店舗へ紐付けた後、新しい本人セッションで、自店1件・自端末1件の読取を確認しました。4役割でDB-09の`kago_app_metrics_view`・`kago_signage_metrics_view`・`kago_selection_counts`へ接続でき、内部の`kago_app_cohorts_internal`は拒否されます。未ログインの集計参照も拒否されました。メーカーとSignageから個人の来店・注文は取得されませんでした。集計元は0件のため、実データの集計値・複数メーカーの公開範囲を実環境で確認した意味ではありません。

手動適用したCOM-02〜DB-09の10ファイルについて、管理者のmanifestに記録したハッシュとmainのファイルを照合し、`supabase_migrations.schema_migrations`へ適用済みとして登録しました。業務SQLの再実行はしていません。10件のversion・nameと290件のSQL文を保存し、履歴表のコメントに元ファイルのハッシュと参照コミットを残しています。履歴表でもRLSを有効にし、anon/authenticatedからスキーマへアクセスできないことを確認しました。

履歴のversionは`20261024020000`〜`20261024100000`です。[公式CLI v2.54.11の履歴定義](https://github.com/supabase/cli/blob/v2.54.11/pkg/migration/history.go)と同じ列形式を使い、ローカルPostgreSQLでも登録・読取を確認しました。公式CLIによるローカル照合はTLS接続で停止し、実SupabaseへのCLIログイン・接続も未実施です。次回は適用履歴を確認し、未適用かつマージ済みのSQLだけを適用します。履歴が見えない場合も、既存テーブルを作るSQLをまとめて再実行しないでください。

残件：購入時の同時価格変更に対する追加修正[PR #77](https://github.com/jphacks/hs_2604/pull/77)、[画像保存と権限](ad-images.md)、各画面からの実操作・非0件集計の確認。未マージの修正や画像migrationは共有DBへ適用していません。

## INS-08向け商品別販売集計（#84）

`kago_product_sales(p_start,p_end,p_store_id,p_product_ids?,p_bucket?)`を追加します。自店の店舗担当だけに、注文・明細を正本とした商品別の販売数・金額をJSTの日別／時間別、由来別で返します。販売がない区間は行なしです。最初の注文日時を記録開始時刻とみなさず、比較可能な記録範囲が不明な場合は画面で比較不可とします。契約・呼出例・適用上の注意は[商品別販売集計ガイド](product-sales.md)を参照してください。
