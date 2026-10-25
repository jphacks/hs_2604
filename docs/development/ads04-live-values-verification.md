# ADS-04（#32）共有Supabaseの実数値を使った追加検証

2026-10-26に、通常のメーカー2アカウントで実行。既存の共有データを参照し、業務データの追加・変更・削除は行っていない。

## 結果

- メーカー別の配信対象は2件・0件。2メーカーでログイン、成果表示、390px表示、ログアウト後の画面・API拒否を確認（10チェック）。
- App・Signageに正の数値を含む集計が合計3行あり、DB版Repositoryから得た値を画面の20セルと照合した。
- 「非公開」1セル、「未計測」4セルを確認。0への置換はなかった。
- 通常のユーザーセッション・RLS・DB-09の集計関数を使用。管理者キー、レスポンス差し替え、模擬データは使用していない。
- 検証用ブラウザの業務データ書込み要求は0件。
- lint・型チェック・本番ビルド成功。既存テスト152件成功。

これは既存データと画面の一致確認であり、新しい購買操作やカメラ精度の確認ではない。集計処理自体の回帰確認は既存のDB・集計テストと併用する。共有データが並行して更新されると照合時刻の差で失敗しうるため、その場合は更新のない時間に再確認する。

## 再実行

`kago-os/kago-ads` で、以下を安全なローカル設定またはプロセス環境に用意する。値はIssue・PR・ログに掲載しない。

- `NEXT_PUBLIC_ADS_DATA_SOURCE=supabase`
- `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `KAGO_ADS_CHECK_EMAIL`、`KAGO_ADS_CHECK_PASSWORD`：数値のある自社成果を読めるメーカー
- `KAGO_ADS_CHECK_B_EMAIL`、`KAGO_ADS_CHECK_B_PASSWORD`：別メーカー
- 必要なら `CHROME_PATH`（既定はLinuxの `/usr/bin/google-chrome`）

同じ公開接続設定で `pnpm build` 後、実行する。

```sh
node --experimental-strip-types --env-file=.env.local tests/results-live-values.e2e.mts
```

空きポートに専用Next.jsを起動し、そのプロセス自身の起動完了を待つ。統合配信用の静的ファイル接頭辞 `/ads-static/_next/` は単独Next.jsの `/_next/` に接続する。APIレスポンスは変更しない。終了時は自分が起動したプロセスとブラウザだけを終了する。

ブラウザのRest API書込みを禁止し、例外は読取専用の `kago_app_metrics`・`kago_signage_metrics` のPOSTのみ。ログイン・ログアウトは通常のAuth APIを使う。数値のある集計や照合対象セルが0件の場合は失敗させる。

## Vercel

ローカル本番ビルドで検証。Vercel上での動作はこの検証の対象外。
