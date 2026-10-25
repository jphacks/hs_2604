# Adsを /ads で公開する（#205）

公開入口は `https://kago-os.vercel.app/ads`。Adsは独立したNext.jsアプリとしてビルドし、Appの外部rewriteで同じドメインから配信します。

## 公開設定

1. Vercelで同じリポジトリからAds用プロジェクトを作成します。Root Directoryは `kago-os/kago-ads`、FrameworkはNext.js、Node.jsは22系。ルート外のworkspace共有コードをビルドに含めます。
2. Adsに `NEXT_PUBLIC_ADS_DATA_SOURCE=supabase` と、既存の共有DBの `NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を設定します。通常のログインを使い、管理キーやデモ用パスワードは設定しません。
3. Adsの本番配信元がReadyになったら、Appの `ADS_ORIGIN` にそのHTTPS originのみを設定します。例：`https://<ads-project>.vercel.app`。`/ads`・クエリ・資格情報は含めません。
4. レビュー・承認済みのコードをmainへ反映し、AdsとAppを再デプロイします。

## 転送と認証

- `/ads/:path*` はAdsの同じパスへ転送し、画面内のリンク・クエリ文字列を維持します。
- 入口の `/ads` は個別の規則で `/ads` へ転送します。Vercelでは `/ads/:path*` の空のpathが `/ads/` になり、Adsが `/ads` へ308で戻すためループします（#208）。
- AdsのJavaScriptとCSSは `assetPrefix=/ads-static` で分離し、`/ads-static/:path*` をAdsへ転送します。Appの `/_next` と衝突しません。
- デモ広告の `/ad-assets/:path*` もAdsへ転送します。Supabase Storageの署名付き画像URLは既存の処理を使用します。
- Adsは `kago-ads-auth` という独立したCookie名を使い、App・Insightのログインを上書きしません。Adsと同じアプリにあるSignageでの利用も保つため、CookieのPathは `/` です。
- 認証後の役割・店舗／メーカー所属・RLSは既存の処理を維持します。
- `ADS_ORIGIN` が未設定の環境では準備中の案内を表示します。

## 確認

Adsを3003番で起動し、Appには `ADS_ORIGIN=http://127.0.0.1:3003` を設定します。Appの `/ads` から、入口・募集ポータル・素材・申請・成果へ移動し、再読み込みも確認します。CSS・JS・画像の取得、ログイン・ログアウト、App・Insightとの共存を確認してください。

Appの既存の `/`・`/App`・`/insight` は引き続き各サービスが処理します。公開後もそれぞれの入口を確認します。

Appで `pnpm test:ads-public:e2e` を実行すると、AdsとAppの本番ビルドを同時に起動し、同じ入口での静的ファイル取得・ログイン・画面遷移・再読込・ログアウト・Cookieの分離を確認します。認証・DBへの通信は既存の正式SQL／RLSを使う使い捨てDBへ差し替え、共有DBへは書き込みません。Chromeの場所は `CHROME_PATH` で指定します。
