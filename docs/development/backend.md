# 共通の認証・DB接続（COM-02）

対象：[Issue #4](https://github.com/jphacks/hs_2604/issues/4)。作業フェーズはhackday。

## 接続の方針

2026-10-24にSupabase AuthとPostgreSQLを採用しました。各サービスは同じSupabaseプロジェクトを参照し、共通ライブラリを`kago-os/shared/backend/`に置きます。CoreにはDB定義を置き、業務用HTTP APIを追加しません。画像保存はCOM-03で決定します。

ブラウザ・表示端末・通常のサーバー処理は公開用のpublishable keyと本人のセッションで接続します。secret key・service_role keyは通常の接続に使用しません。共有ライブラリはmodern publishable key（`sb_publishable_`）以外を拒否します。旧anon JWTも受け付けないため、新しいpublishable keyを発行してください。

## 初回セットアップ

1. Supabaseで開発用プロジェクトを作成します。組織・リージョン・DBパスワードは担当者が選び、DBパスワードはパスワード管理ツールに保存します。全サービスで同じProject URLを使います。
2. ProjectのConnectからProject URLとpublishable keyを取得します。DBパスワードやsecret keyを取得する必要はありません。
3. リポジトリの`kago-os/kago-app/`で以下を実行します。Node.js 22.13以上の22系・pnpm 11.19.0を使います。

   ```sh
   pnpm install --frozen-lockfile
   cp .env.example .env.local
   ```

4. `.env.local`の次の値を設定します。このファイルはGit管理対象外です。`NEXT_PUBLIC_`はブラウザへ配信されます。秘密キー・ログインパスワードはこの接頭辞の変数に入れません。

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```

5. SupabaseのSQL Editorで`kago-os/kago-core/supabase/migrations/20261024020000_connection_check.sql`を実行します。読み取り専用の`kago_connection_check()`を作るだけで、業務テーブルは変更しません。後からmigration管理を導入する場合も同じファイルを適用履歴に含めます。再実行できます。
6. 以下の架空アカウントを用意し、役割を設定します。
7. `pnpm dev`で起動します。接続設定を変更した場合は再起動します。公開用変数はビルド時に組み込まれるため、配信済みAppへの変更には再ビルドも必要です。

設定不足は`GET /api/backend/connection`でHTTP 503・`configuration_missing`として確認できます。APP-01の先行実装後の`/App`は認証と業務DBへの接続が前提となり、設定不足やDB未準備を画面に表示します。DB定義・RLSの実装と照合する契約は[APP-01接続仕様](../specs/app-session-contract.md)を参照してください。COM-02の接続確認成功だけでは、本人の来店・かごが利用可能とは扱いません。

## 架空アカウントと役割

SupabaseのAuthentication → Users → Add userで、架空の消費者・店舗担当者・メーカー担当者・端末専用の4アカウントを作ります。管理者作成時にメール確認済みとして扱い、検証用パスワードはGit・Issue・PRへ記載しません。実在する顧客の情報を使いません。今回のAPP-01は既存アカウントでのログインを扱い、一般公開のサインアップや確認メール配信は追加しません。2利用者の買い物確認には消費者アカウントをもう1件作り、同じ`customer`の役割を設定してください。

ユーザーが編集できる`user_metadata`は役割に使用しません。SQL Editorで、各アカウントのAuth UUIDに置き換えて次を実行します。

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"kago":{"roles":["customer"]}}'::jsonb
where id = '<CUSTOMER_AUTH_UUID>'::uuid;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"kago":{"roles":["store_staff"]}}'::jsonb
where id = '<STORE_STAFF_AUTH_UUID>'::uuid;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"kago":{"roles":["maker_staff"]}}'::jsonb
where id = '<MAKER_STAFF_AUTH_UUID>'::uuid;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"kago":{"roles":["signage"],"device_id":"00000000-0000-4000-8000-000000000001","store_id":"00000000-0000-4000-8000-000000000002"}}'::jsonb
where id = '<DEVICE_AUTH_UUID>'::uuid;
```

上のdevice/store UUIDは接続確認用の架空値です。DATA-01の[共通の架空データ](demo-data.md)を投入すると、そのアカウントに固定の端末・店舗UUIDを設定します。Signageには他の役割を併用できず、UUID形式の端末IDと店舗IDが必須です。1端末1アカウントを使用し、故障・紛失・交換時は該当アカウントのセッションを失効させ、認証情報を交換します。端末のパスワードを画面・ソース・配布する静的ファイルへ埋め込みません。

役割はログインの分類です。店舗・メーカーの所属や読み書き可能な行をこのmetadataだけで認可しません。DB-02・DB-04の所属テーブルとDB-06のRLSで本人・自店・自社・自端末に制限します。接続確認成功は業務データの権限確認を意味しません。

## 実プロジェクトでの接続確認

`.env.local`に、確認する1アカウント分だけ次の**サーバー用変数**を追加します。端末でも同じ手順を使います。

```dotenv
KAGO_CHECK_ROLE=customer
KAGO_CHECK_EMAIL=YOUR_FICTIONAL_ACCOUNT_EMAIL
KAGO_CHECK_PASSWORD=YOUR_LOCAL_TEST_PASSWORD
```

`kago-os/kago-app/`で実行します。

```sh
pnpm check:backend
```

期待結果は「customer: ログイン・DB接続・ログアウト後の拒否を確認しました。」です。メール・パスワード・トークンは出力しません。`store_staff`・`maker_staff`・`signage`へアカウントと役割を切り替えて繰り返します。確認後は`KAGO_CHECK_*`を削除します。CLIはメモリ内セッションを使うため、ブラウザのログイン状態は変わりません。

設定不足は公開用変数を空にして、誤パスワードは検証用パスワードを変更して確認します。期限切れは自動テストで模擬しています。実環境では端末の別クライアントへセッションを保持した後に管理者が失効させ、`getBackendIdentity()`が`session_expired`になることを確認します。自動更新可能なアクセストークンの期限切れは通常動作として更新し、更新できない場合に再ログインを求めます。

ブラウザでログイン済みの場合は`GET /api/backend/connection`がHTTP 200・`connected`、本人のAuth UUID・役割・DB接続状態を返します。Signageの場合は端末・店舗IDも返します。未ログインならHTTP 401です。レスポンスは`private, no-store`でキャッシュしません。

## 各サービスからの利用

`kago-os/pnpm-workspace.yaml`と`pnpm-lock.yaml`を共有します。Appだけをコピーせず、ビルドには`kago-os/`全体（LP・sharedを含む）を用意してください。App内での`pnpm install`・`pnpm build`のコマンドは従来どおりです。デプロイ先の設定変更はCOM-05で行います。

Ads・Insight・Signageを実装するときはworkspaceの`packages`に追加し、依存関係へ`"@kago/backend": "workspace:*"`を設定します。Next.jsの場合は`transpilePackages: ["@kago/backend"]`とTypeScriptの`allowImportingTsExtensions: true`も設定します。共有パッケージはTypeScriptソースを公開する内部パッケージで、Next.jsなどのビルド、またはNode.js 22の`--experimental-strip-types`で使います。

| 実行場所 | 接続処理 | セッションの保存 |
| --- | --- | --- |
| ブラウザ（App・Ads・Insight） | `createBrowserBackend(config)` | Supabase SSRのCookie |
| Next.jsサーバー | `createServerBackend(config, cookieAdapter)` | リクエストごとのCookie。クライアントをリクエスト間で共有しない |
| Signageの専用プロセス・確認CLI | `createHeadlessBackend(config)` | プロセスのメモリのみ。再起動時は再ログイン |

Appには`src/lib/backend/browser.ts`・`server.ts`のアダプターを用意しています。Server Action・Route Handlerでは`createServerBackendClient({ writableCookies: true })`、Server Componentでは引数なしを使います。`src/proxy.ts`は`/App`のセッション更新を担当します。Proxyでの確認だけに依存せず、保護する処理ごとに`getBackendIdentity(client, requiredRole)`を呼びます。

```ts
import {
  createHeadlessBackend, readBackendConfig, signInBackend,
  getBackendIdentity, checkBackendConnection, signOutBackend,
} from '@kago/backend';

const client = createHeadlessBackend(readBackendConfig({
  url: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
}));
await signInBackend(client, process.env.DEVICE_EMAIL!, process.env.DEVICE_PASSWORD!, 'signage');
const identity = await getBackendIdentity(client, 'signage');
await checkBackendConnection(client, 'signage');
// DB-06のRLS適用後に、client.from(...)/client.rpc(...)を同じ本人権限で利用する。
// 長時間稼働する専用プロセスは期限前にclient.auth.refreshSession()で更新する。
// 更新失敗時は処理を止め、再接続・再ログインする。共有管理キーで代替しない。
await signOutBackend(client);
```

`getBackendIdentity`はAuthサーバーへ`getUser()`で検証を求めます。Cookieの復号結果や`getSession()`のuserをそのまま信用しません。API・DB操作へ渡すトークンはSDKが本人のセッションから付与します。通常サーバー処理でもRLSを迂回する管理キーを使いません。

## 状態の区別

| code | HTTP | 意味・対応 |
| --- | --- | --- |
| `configuration_missing` | 503 | URL・公開キーが未設定。担当者が設定 |
| `configuration_invalid` | 503 | URL・キーの形式が不正。公開用キーか確認 |
| `unauthenticated` | 401 | セッションなし。ログイン |
| `session_expired` | 401 | 失効・更新不可。再ログイン |
| `invalid_credentials` | 401 | メール・パスワードを確認 |
| `forbidden` | 403 | 役割なし・不一致、端末設定不正、DBで拒否。担当者が権限を確認 |
| `database_not_ready` | 503 | 接続確認関数が未適用。migrationを適用 |
| `connection_failed` | 503 | ネットワーク・基盤障害等。再試行 |

共有処理は`BackendError`を返し、APIは固定の日本語メッセージへ変換します。プロバイダーのエラー本文・SQL・接続値は返しません。各HTTPリクエストに10秒のタイムアウトを設けます（SDKによる再試行時間は別途発生する場合があります）。ログアウトはそのクライアントのセッションだけを失効させます。

## ローカル検証と残る確認

`kago-os/kago-app/`から実行します。

```sh
pnpm test:backend
pnpm typecheck:backend
pnpm lint
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm build
```

自動テストは架空のAuth・DB応答で、4役割の認証・ログアウト・期限切れ・役割不一致・編集可能metadataでの昇格拒否・DB設定不足等を確認します。別の開発環境では、上記の実接続手順も実施してください。APP-01の画面接続、DB-06の業務データ権限、COM-03の画像保存はこのIssueの対象外です。

### 実接続の検証記録（2026-10-24）

開発用のSupabaseプロジェクトを東京リージョン・無料プランで作成し、接続確認用migrationをSQL Editorから適用しました。担当者が4件の架空アカウントを作成し、管理者のSQL操作で役割と端末識別情報を設定しました。確認にはpublishable keyと本人のセッションを使い、管理キーは使っていません。

| 確認 | 結果 |
| --- | --- |
| `customer`・`store_staff`・`maker_staff`・`signage`でログイン→DB接続確認 | 4役割とも成功 |
| 各アカウントで別の役割を要求 | `forbidden` |
| ログアウト後に再接続 | `unauthenticated` |
| 保存セッションの期限を過去にし、ログアウトで失効した更新トークンからSSRの復元を試行 | 4役割とも`session_expired` |
| 未認証でDB接続確認関数を実行 | HTTP 401・`42501`で拒否 |
| Appの接続確認APIへ認証Cookieを送信 | HTTP 200・`connected`。役割・DB接続状態を取得 |
| Appの接続確認APIをCookieなしで実行 | HTTP 401・`unauthenticated` |
| API応答のキャッシュ・秘密情報 | `private, no-store`。パスワード・トークンを返さない |
| 同梱の`check:backend`確認処理を消費者アカウントで実行 | ログイン・DB接続・ログアウト後の拒否が成功 |
| 配信用ファイルへの検証用パスワード混入 | 83ファイルを確認し、混入なし |
| 実接続設定を読み込んだAppの本番ビルド | `pnpm build --webpack`成功 |

期限切れの検証では保存セッションの時刻を操作し、更新トークンの失効は実Supabaseのログアウトで行いました。認証済みの接続確認成功は、業務テーブルのRLS検証を意味しません。自動テスト26件・Appと共有パッケージの型検査・Appのlintも成功しています。担当者以外によるレビュー・手順の再現確認はPRで行います。

参照：[Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)、[getUser](https://supabase.com/docs/reference/javascript/auth-getuser)、[API keys](https://supabase.com/docs/guides/api/api-keys)。

### 媒体別広告画像（ADS-03追加・#226）

20261026100000_creative_media_paths.sqlは既存版を保持したままimage_pathsを追加する。Ads登録・App表示・Signageフィード・Insight審査は共通SDKのgetAdMediaPathsを使う。RPC未適用時の共通画像との互換、媒体ごとのStorage閲覧権限、共有環境への適用手順は[媒体別画像の検証記録](ads-media-images-226.md)を参照。
