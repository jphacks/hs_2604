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
