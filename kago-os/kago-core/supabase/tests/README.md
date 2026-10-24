# DB検証

`db02.sql`〜`db09.sql`は、全migration適用後の使い捨てDBでOwnerとして実行します。各SQLは検証データをrollbackします。共有Supabaseや実利用データのあるDBでは実行しません。

## DB-07の二接続試験（#76）

`db07_concurrency.py`はPostgreSQL 16とPython 3、`pg8000==1.31.5`を使います。空のローカルDBを作り、専用仮想環境へドライバーを入れて実行します。

```sh
python3 -m venv /tmp/kago-db-test-venv
/tmp/kago-db-test-venv/bin/pip install pg8000==1.31.5
# ローカルPostgreSQLで、UTF8の空DB kago_checkout_test_76 をOwner権限で作成する。
export KAGO_TEST_PG_DATABASE=kago_checkout_test_76
export KAGO_TEST_PG_HOST=127.0.0.1
export KAGO_TEST_PG_PORT=5432
export KAGO_TEST_PG_USER=postgres
# 必要な場合、KAGO_TEST_PG_PASSWORDを環境から設定する。
/tmp/kago-db-test-venv/bin/python kago-os/kago-core/supabase/tests/db07_concurrency.py
```

コマンドはリポジトリのルートで実行します。接続先はloopbackかつDB名が`kago_checkout_test_`で始まり、public/authにテーブルがない場合に限ります。認証の模擬定義と全migrationを適用し、DB-02〜09のSQLを各2回実行した後、元の購入関数で総額248円・明細300円の競合を再現します。その後追加migrationの関数へ戻し、次のケースを各2回確認します。

- 価格更新を先にロック：購入側が待機し、更新後に`price_changed`で拒否。注文を残さない。
- 販売停止を先にロック：購入側が待機し、停止後に拒否。注文を残さない。
- 購入を先にロック：価格更新が購入commitを待ち、注文総額と明細は248円で一致。購入の再送は同じ注文を返す。
- 購入を先にロック：販売停止が購入commitを待ち、注文金額を保持。再送も成功。

待ち合わせは`pg_blocking_pids`で実際の行ロック待ちを観測します。任意の固定時間だけ待って更新順を仮定しません。試験後のDBには専用の検証データが残るため、同じ空DBには再実行せず、ローカルの使い捨てDBを作り直してください。

2026-10-24：PostgreSQL 16.11で旧版の不整合を再現し、修正版の4ケースを各2回確認しました。PGliteでも追加migrationを含むDB-02〜09のSQLを各2回実行しました。共有Supabaseへの修正適用は別途必要です。

## 商品別販売の集計（#84 / INS-08）

`20261024130000_product_sales.sql`を含む全migrationを適用した、破棄可能なSupabase互換DBでOwnerとして実行します。

```sh
# kago-os/kago-core/ で実行。接続先はPGHOST等で別途指定する。
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/product_sales.sql
```

41項目で商品・由来別の手計算値、明細の単価、無料明細、JST日／時間境界と別セッションタイムゾーン、部分区間、販売なし、空配列・重複商品、不正入力、2店舗の分離・別役割の拒否、返却型を確認します。イベント・選定・再生は作りません。データはrollbackします。共有・本番DBでは実行しません。

2026-10-24：PGlite 0.5.11 / PostgreSQL 16.11で、最新mainのmigrationと本追加SQLをファイル名順に適用。商品別41項目と、DB-02〜09・COM-03のSQLをそれぞれ各2回成功し、毎回fixtureのrollbackを確認しました。Auth/Storageの最小定義はローカルで模擬しており、実Supabaseの署名・HTTP・Insight画面は未検証です。既存migrationのversion重複は[利用ガイド](../../../../docs/development/product-sales.md)の適用上の注意を参照してください。

## 店舗販促の保存（`kago_save_promotion`）

`20261024140000_promotion_save.sql`を含む全migrationを適用した、破棄可能なSupabase互換DBでOwnerとして実行します。

```sh
# kago-os/kago-core/ で実行。接続先はPGHOST等で別途指定する。
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/promotion_save.sql
```

権限、初回作成・再送、新しい版への切替、古い画面からの保存（`40001`）、不正入力・取扱停止で失敗しても元の`active`版が残ること、停止後の再保存を確認します。データはrollbackします。契約は[データベース仕様](../../../../docs/development/database.md)を参照してください。
