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
