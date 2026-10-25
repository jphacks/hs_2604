# ADS-02（#30）共有Supabaseの確認
2026-10-25、通常のstore_staff 2アカウント（所属店舗が異なる）とmaker_staffで確認した。管理キーは使用しない。

## 結果
9項目成功：自店の下書き作成、メーカーから下書き拒否、別店舗の読取・UPDATE拒否、公開と公開範囲の読取、ポータル一覧反映、終了状態反映、終了後の新規申請拒否、再公開拒否、ログアウト後の拒否。

検証募集は c049b7c5-5bf0-4648-9ea4-329c38950eb2。検証終了時の状態はclosed。広告承認・配信・既存申請の変更は行っていない。終了後の申請INSERTは23514（Ad call is not open for applications）で拒否され、申請は作られていない。

## 再確認
scripts/check-store-calls-live.mts を使う。KAGO_ADS_ALLOW_TEST_CALL=1を明示した場合だけ、検証募集を1件作成して公開・終了する。作成した募集は削除せず履歴として残す。
非公開の環境ファイルへ接続設定と KAGO_ADS_STORE_CHECK_EMAIL/PASSWORD、KAGO_ADS_OTHER_STORE_EMAIL/PASSWORD、KAGO_ADS_CHECK_EMAIL/PASSWORD を設定する。先頭の店舗アカウントだけが対象店舗に所属し、比較用店舗アカウントは対象店舗へ所属させない。必要ならKAGO_ADS_CHECK_STORE_IDで対象店舗を指定する。

```bash
KAGO_ADS_ALLOW_TEST_CALL=1 node --experimental-strip-types --env-file=.env.local scripts/check-store-calls-live.mts
```

今回の確認は本人セッションの実APIと正式RLSによるもの。共有環境での画面操作・会場実機確認とは区別する。ブラウザによる店舗画面の保存操作は既存のローカルSQL・ブラウザ検証を参照する。
