# SIG-01（#39）Adsと端末の独立ログイン

AdsとSignageが同じCookie名で同じ認証クライアントを使っていたため、同じブラウザで別々の専用アカウントを使うとセッションが上書きされる。

- Adsは既存のkago-ads-authを維持する。
- Signageはkago-signage-auth、path=/signageの専用Cookieを使う。端末は更新後に一度ログインし直す。旧Cookieから認証情報を自動コピーしない。
- 共通SDKは、ブラウザでプロジェクト・公開キー・Cookie名・pathごとにクライアントを再利用する。SDKの無条件の単一クライアントは無効にする。
- SSRではキャッシュを使わず、リクエスト間で認証クライアントを共有しない。
- 認可の根拠やDBのRLSは変更しない。メーカーと端末は従来どおり別の専用アカウントを使う。

## 確認（2026-10-26）

- 共通SDK32テスト、Ads通常155テスト成功。範囲別再利用・別path/接続先・SSR非共有の3件を追加。
- 本番ビルドのブラウザ7項目成功。メーカーと端末の同時ログイン、Cookie保持、Ads再読込、Adsからログアウト後も端末が維持されること、端末の再読込とログアウトを確認。
- ブラウザ試験のAuth/PostgREST通信はfixture、SQL/RLSは正式migrationを実行する使い捨てPGlite。共有Supabaseの変更や実端末カメラの確認ではない。
- App・Ads・Insightのビルド・型・lint、共通SDKの型チェック成功。

kago-os/kago-adsで KAGO_SESSION_E2E=1 pnpm test src/lib/backend/signage-session.browser.test.ts を実行してブラウザ検証を再現できる。通常のpnpm testではブラウザ試験をスキップし、単体・DB試験を実行する。公開Vercelの実ログインは未確認。
