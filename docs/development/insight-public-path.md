# Insightを /insight で公開する（#167）

公開入口は `https://kago-os.vercel.app/insight`。`kago-os.app.vercel` は現在の公開ドメインではありません。

AppとInsightは独立したNext.jsアプリとしてビルドし、Appの外部rewriteでInsightへ転送します。LPのPC・モバイルナビ、Insight紹介、フッターに入口を置きます。AppのルートやAPIは転送しません。

## Vercel設定（承認後の公開作業）

1. 同じリポジトリからInsight用プロジェクトを作成します。Root Directoryは `kago-os/kago-insight`、FrameworkはNext.js、Node.jsは22系。ルート外の共有コードをビルドに含める設定を有効にします。ビルドは `pnpm build`。
2. Insightに `NEXT_PUBLIC_INSIGHT_BASE_PATH=/insight` を設定します。これはビルド時の値なので、変更時は再ビルドします。直接の配信元でも `/insight` 配下で動きます。
3. Insightのサーバーに共有開発Supabase接続設定を入れます。通常ログインを使う場合はデモ担当者の資格情報は不要です。デモ自動接続を使う場合のみ、非公開設定のスタッフ情報を `KAGO_DEMO_STORE_EMAIL` と `KAGO_DEMO_STORE_PASSWORD` に設定します。パスワードはGit・Issue・PR・チャットへ記載しません。
4. モック表示の場合は `NEXT_PUBLIC_INSIGHT_DATA_SOURCE=mock`。ただし現在の販促設定画面は値引き設定を実DBから取得するため、DB接続が必要です。公開デモはデータソースを `supabase` にします。販促効果画面は独立したサンプル表示です。
5. Insightの配信元がReadyになったら、既存AppのVercel環境変数 `INSIGHT_ORIGIN` に配信元のHTTPS originのみを設定します。例は `https://<insight-project>.vercel.app`。`/insight`、資格情報、クエリ文字列を含めません。
6. Appを再デプロイします。`/insight/:path*` が配信元の同じパスへ転送されます。配信元のPreview保護により転送が401になる場合は、本番配信元を使ってください。保護解除や認証回避用キーの公開は行いません。

配信元未設定時は「公開準備中」を表示します。この状態は公開完了ではありません。設定済み配信元が停止した場合は転送エラーになるため、運用前に配信元も確認します。

## 認証と戻り先

- Insightは `kago-insight-auth` という独立したCookie名を使い、公開配置ではPathも `/insight` に限定します。Appの本人セッションを上書きしません。
- `next/link`・`next/navigation` はbasePathを自動適用します。Route Handlerの生のLocationとpublicファイルには `insightPath()` を使います。
- 自動ログインのLocationは相対パスを返し、転送先のホストをブラウザへ返しません。戻り先は実在する4画面に限定します。
- 実DBの権限・所属店舗の判定は既存のRLSと `store_members` を維持します。
- 設置パスを変更するときはCookieのPathも変わるので再ログインが必要です。

## ローカルの同一入口検証

Insightに `NEXT_PUBLIC_INSIGHT_BASE_PATH=/insight` を付けて3002番で起動し、Appに `INSIGHT_ORIGIN=http://127.0.0.1:3002` を付けて起動します。App側の `/insight` を開いてください。Insight単独を従来の `/review` などで使う場合はbasePathの環境変数を省略します。

確認対象：LPからの遷移、店舗名、広告審査・販促設定・成果・販促効果、CSS/JS・画像、ログイン・ログアウト、Appとの共存。画面変更だけではなく、ログアウトなどServer Actionも同じ公開originで通ることを確認します。サンプルと実DBの表示を混同しないでください。

この設定で新しい店舗担当者の権限や公開自動ログインを有効にする場合は、そのアクセス範囲を確認してから設定します。
