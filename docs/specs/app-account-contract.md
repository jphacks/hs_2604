# APP-03：本人の購入履歴と推薦への利用設定

対象：[APP-03 / #19](https://github.com/jphacks/hs_2604/issues/19)。担当：nine0511。作業フェーズ：hackday。

## 実装方針

- APP-01の認証と選択来店を使い、本人・選択店舗の過去注文を表示する。注文時の商品名・単価・数量を使い、現在の商品マスターで履歴を書き換えない。
- DB-02の`customer_settings`へ履歴・かごの利用可否を保存する。未登録はDBの既定どおり両方OFFとし、以前の共通localStorage設定を移行しない。
- 履歴画面への表示と推薦への利用を分ける。履歴利用OFFでも本人は購入記録を確認できるが、推薦入力には履歴を含めない。かご利用OFFも同様に推薦入力から外す。
- 設定の保存は利用者IDを認証から決め、指定された1項目のみ変更する。更新日時による競合検査で、別画面の新しい設定を古い要求で上書きしない。
- APP-05向けに、最新の設定で履歴・かごを制限したサーバー側の入力取得処理を公開する。おすすめ商品の選定自体はAPP-05。
- DB-02・DB-03・DB-06の既存テーブルとRLSを使い、購入履歴を新たに生成しない。新しい業務migrationは予定しない。

## 検証方針

正式SQL/RLSの検証環境で、2利用者・2店舗、履歴あり／なし、利用ON／OFF、保存・再読込・別ブラウザ復元、保存失敗・競合、他人の履歴／設定拒否を確認する。推薦入力でOFFの情報が欠落し、履歴表示では参照可能であることを検証する。共有Supabase・公開Vercelの確認結果はローカル試験と区別して記録する。

## 接続契約

新しいmigrationは追加しない。DB-02の`customer_settings`、DB-03の`orders` / `order_items`、DB-06のRLSをそのまま使う。

| 窓口 | 用途 |
| --- | --- |
| `GET /api/account` | 認証済みcustomerと、HttpOnly Cookieの選択来店（本人・active）から範囲を決め、利用設定を返す。未登録は両方OFF・`updatedAt = null` |
| `GET /api/account?history=1&cursor=…` | 本人・選択店舗・今回の来店開始より前の注文を、注文日時と注文IDの降順で10件ずつ返す。商品名・単価・数量は注文時の値 |
| `POST /api/account` | 同一OriginのJSONに限定。`{ visitId, key, value, expectedUpdatedAt }`で1項目の絶対値を保存。利用者IDは要求値から受け取らない |
| `GET /api/recommendation-input` | APP-05向け。最新の設定で履歴（最大50件と商品別集計）・かごを制限した推薦入力を返す。OFFの項目はDBを読まず`status = disabled` |

- 設定の保存は`updated_at`による楽観的排他。古い`expectedUpdatedAt`は`409 settings_changed`で拒否し、最新値を再取得して再操作する。保存済みと同じ値の再送は無操作（応答喪失後の再試行で版を進めない）。
- 推薦入力の取得中に設定またはかごの版が変わった場合は`409 input_changed`とし、古い入力を返さない。
- 履歴のカーソルは注文日時とIDだけを含むbase64url値。形式外の値は`invalid_request`。
- 応答は`Cache-Control: private, no-store`。エラーは利用者向けコードとメッセージだけを返し、SQLやAuthの詳細を出さない。

## 画面

- マイページに「おすすめへの利用設定」（購入履歴・かご）と「この店舗での購入履歴」を表示する。設定は全店舗共通、履歴は選択中の店舗ごと。
- 保存中は操作を止め、通信失敗時は「同じ設定を再試行」と「設定を再読み込み」を表示する。別タブへは`BroadcastChannel`で再読込を通知する。
- 履歴の通信失敗は空の履歴と区別して「購入履歴を再試行」を表示する。投入データ（`data_origin`が`operated`以外）には「デモの購入記録」を表示する。
- 以前の共通localStorage（`kago-os-personalization`）と固定のデモ利用者・履歴は使わない。

## 検証結果

Node.js 22で`pnpm test:account`と`pnpm test:account:e2e`を実行する。DB関数・RLSは正式migrationをPGliteへ適用して実行し、AuthとPostgREST HTTPは試験用アダプタ。E2EはPlaywrightのChromium、または`PLAYWRIGHT_EXECUTABLE_PATH`で指定したChromeを使う。

2026-10-24の実行結果（最新mainを取り込んだ状態）：APP-03のSQL統合13件、APP-03ブラウザ12ケースが成功。既存の`test:shopping`（11）、`test:shopping:database`（11）、`test:shopping:check`（4）、`test:cart`（14）、`test:backend`（31）、APP-01回帰ブラウザ20ケース、APP-02回帰ブラウザ14ケース、型検査、ESLint、本番ビルドも成功。

確認した内容：未登録時のOFF既定と旧localStorageの無視、2利用者・2店舗の履歴分離、未来の注文の除外、同時刻注文のページ境界、購入時の商品名・価格の保持、ON／OFFによる推薦入力の変化と履歴表示の維持、再読込・別ブラウザでの復元、店舗切替、保存前・保存後の通信断と同じ値の再試行、別ブラウザの新しい設定の保護、他人の来店・設定・注文の拒否、取得中のOFF／かご更新による入力の無効化、履歴が空の場合と無効の場合の区別。

画面記録（架空データ・390px幅）：[購入履歴と設定](../images/app03-history-mobile.png)、[履歴なしの店舗](../images/app03-empty-history-mobile.png)。

## 公開環境での確認

`pnpm check:account`は検証利用者・店舗の設定（`.env.shopping-check.local`）で、既定は読取のみ。`KAGO_CHECK_ALLOW_SETTINGS_WRITE=1`の場合だけ設定を切り替え、終了時に元の値へ戻す。共有Supabase・公開Vercelでの確認は未実施であり、ローカル試験の成功と区別する。接続値・ログイン情報はこの文書やPRへ記載しない。
