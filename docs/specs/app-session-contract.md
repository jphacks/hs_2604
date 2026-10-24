# APP-01：認証・店舗選択・来店開始と復元

対象：[APP-01 / #17](https://github.com/jphacks/hs_2604/issues/17)。作業フェーズ：hackday。更新日：2026-10-24。

## 今回の範囲と全体への接続

COM-02の共通Supabase認証を利用し、`/App`をログイン→店舗選択→来店開始／再開→本人のかご表示へ接続します。本人・店舗・来店のUUIDを揃えることで、APP-02のかご更新、APP-05の提案選定、APP-07のイベント、APP-09の注文を同じ来店に接続できます。Coreへ業務用HTTP APIや推薦計算を追加しません。HTTPの窓口はAppの`/api/shopping`、DBでの原子的な来店開始はDB関数とします。

**担当者の指示により、今回は画面と接続処理を先行し、DB定義・RLSは変更しません。** DB-02・DB-03・DB-06の実装後に下記の契約を照合して接続します。テーブル・列・関数が未実装ならHTTP 503・`database_not_ready`とし、画面に「買い物機能は準備中」と表示します。認証済みでもローカルの架空データへ切り替えません。実DBでの完了条件は未確認です。

既存の固定利用者のプロフィール・購入履歴は、ログイン中の本人の情報として表示しません。履歴・利用設定の接続はAPP-03、商品・価格・かご更新はAPP-02へ引き継ぎます。それまではDBのかごを参照専用で表示し、商品追加・数量変更・削除を無効にします。既存の商品一覧・おすすめは表示サンプルと明記し、購入操作は提供しません。

## 画面の状態と復元

| 状態 | 画面と操作 |
| --- | --- |
| セッションなし | メール・パスワードでログイン。管理者が作成した`customer`アカウントを利用 |
| 誤パスワード | 誤入力の案内。パスワードを状態・localStorage・ログへ保持しない |
| 別の役割 | 買い物へ入れない旨を表示。共通認証処理がログイン状態を破棄 |
| ログイン済み・来店未選択 | 利用できる店舗と、本人の進行中の来店を表示 |
| 来店再開 | 「続きから開く」で既存の来店を取得。同じ来店のかごを表示 |
| 新しい来店 | 進行中の来店がある場合は終了を確認してから、新しい空のかごへ進む |
| 再読込・別ページから復帰 | HttpOnlyの`kago-app-visit` Cookieをヒントに、本人・店舗・`active`状態をDBで再確認。GETで新規来店を作らない |
| 他人・終了済み・不正な来店Cookie | そのかごを取得せず店舗選択へ戻す |
| 認証切れ・更新不可 | かごを画面から外し、再ログインを案内 |
| 通信失敗・接続設定不足・DB未準備 | 状態別の案内と再試行。ログアウト操作も提供 |
| 店舗が0件 | 登録待ちを表示。架空店舗を補わない |

利用者・店舗の変更、ログアウト、再検証の開始時には買い物の子コンポーネントをアンマウントし、前のかご・モーダル・推薦状態を消します。通信のキャンセルと要求の通し番号で古い応答を無視します。表示中は60秒ごと、タブが再表示された時、別タブからログイン・ログアウト・来店変更の通知が届いた時に再確認します。ログアウト失敗を成功として扱わず、エラー画面から再試行できます。

従来の共通キー`kago-os-cart`はログイン中の来店へ移行・復元しません。過去のデモのかごに本人情報がないためです。本人のかごはDBの応答を正本にします。

## DB担当へ引き継ぐ参照契約

列名・意味は[共通仕様書](common-spec.md#entities)に合わせた接続案です。DB-01で別名に確定する場合は、本書と`src/features/shopping/service.ts`を合わせて更新します。新たなテーブルをこのIssueで作成しません。

| テーブル | Appが参照する列・条件 | 担当Issue |
| --- | --- | --- |
| `stores` | `id, slug, name, branch_name`。`name`順。RLSで利用可能な店舗のみ | DB-02・DB-06 |
| `visits` | `id, store_id, cart_version, started_at`。`user_id = 認証済み本人`かつ`status = active` | DB-03・DB-06 |
| `cart_items` | `product_id, quantity`。確認済みの`visit_id`のみ | DB-03・DB-06 |
| `products` | `id, code, name, category`。かごの商品IDの集合で絞る | DB-02・DB-06 |
| `store_products` | `product_id, price`。来店の`store_id`とかごの商品IDで絞る | DB-02・DB-06 |

価格は店舗別の税込円整数、数量は1以上の整数とします。かごに残っている商品の価格・商品行が欠けた場合、行を黙って除外したりデモ価格で補ったりせず準備不足を通知します。取扱停止後もかごに残った商品の情報をどう解決するかはDB-02・APP-02で整えます。注文時の単価スナップショットはDB-03・DB-07の範囲です。

すべてpublishable keyと本人のセッションで接続し、サービスキーを利用しません。アプリで`getBackendIdentity(client, 'customer')`を確認したうえで、DB-06でも本人以外の来店・かごの読取を拒否してください。メーカー・店舗担当者・端末・未認証から個人のかごを読めないことをDB側で確認する必要があります。HTTPの要求値やCookieを信用する設計にはしません。

## DB担当へ引き継ぐ来店開始関数

関数名と返り値は**接続案・DB担当未合意**です。DB-03・DB-06で原子的な処理として実装し、DB-01の確定仕様に合わせて変更してください。App側で読取→複数回のINSERT／UPDATEに分解しません。

```text
app_start_visit(
  p_store_id uuid,
  p_start_new boolean,
  p_previous_visit_id uuid default null
) returns uuid  -- 開始または復元したvisit.id
```

- 利用者IDは引数に受けず`auth.uid()`から決めます。未認証・`customer`以外・利用できない店舗・他人の前回来店IDは拒否します。
- 本人・店舗ごとの進行中の来店は最大1件です。`p_start_new = false`なら既存の進行中の来店を返し、なければ新しく作ります。再読込はこの関数を呼びません。
- `p_start_new = true`は明示的な新規来店です。`p_previous_visit_id`が現在の進行中の来店に一致する場合だけ旧来店を`abandoned`として終了し、新しい来店を作ります。旧かごの記録は過去来店に保持します。新来店は`active`、`cart_version = 0`、空のかごです。
- 再送・二重タップ・複数タブの同時要求で新規来店を増やさないよう、本人・店舗単位でロック／一意性と再送判定を持たせます。既に新しい来店へ切り替わっている同じ前回来店IDの要求は、その後継の来店を返すか競合として拒否し、現在のかごを再び終了させません。`null`は初回来店用で、既存の進行中の来店を終了させません。
- 旧来店の終了・新規来店の開始は一体で保存します。途中の失敗で片方だけを残しません。放棄・来店終了時刻はサーバー時刻を使い、クライアントから指定させません。
- Appは返ってきたUUIDを、本人の進行中の来店一覧・選択店舗と照合し、かごを読み込めた後で選択Cookieを更新します。関数未実装は`database_not_ready`です。

## AppのHTTP窓口

`GET /api/shopping`は、検証済みの`userId`、利用可能な`stores`、本人の`activeVisits`、選択中の`visit`（未選択時`null`）、`cart`を返します。トークン・パスワード・プロバイダーの詳細エラーは返しません。`private, no-store`・`Vary: Cookie`を付けます。

`POST /api/shopping`は同一OriginのJSONのみ受け付け、次の操作を扱います。

| `action` | 入力 | 結果 |
| --- | --- | --- |
| `login` | `email, password` | 共通認証で`customer`を確認。以前の来店選択Cookieを削除 |
| `logout` | なし | 共通認証でログアウト。来店選択Cookieを削除。DBのかご自体は削除しない |
| `start_visit` | `storeId, startNew, previousVisitId` | 上記DB関数で開始／復元し、本人の買い物状態と選択Cookieを返す |

CookieはHttpOnly・SameSite=Lax、HTTPSではSecure、有効期間7日です。Cookieが残っていても、DBが来店を終了済みとした場合は復元しません。

## 検証手順と完了の条件

共通基盤の設定は[backend.md](../development/backend.md)を参照します。既存アカウントでのログインを対象とし、一般公開の新規登録・確認メール配信は追加しません。DB担当の実装後、以下を実DBで確認します。

1. `customer`の架空利用者2名と店舗を用意し、店舗選択→来店開始→本人のかご取得を確認。
2. 各利用者の来店に別の商品を登録して再読込し、同じ来店・かごになることを確認。
3. 利用者切替、他人の来店Cookieへの改変、別の役割・未認証からの直接DB読取を試し、他人のかごを返さないことを確認。
4. 明示的新規来店、同じ要求の再送、複数タブの同時開始で、来店の増殖やかごの誤終了がないことを確認。
5. 来店完了後の次回来店と再読込を区別し、認証失効・通信失敗・DB未準備の案内と再試行を確認。

Appの自動検証は`kago-os/kago-app/`から次を実行します。

```sh
pnpm test:shopping
pnpm test:backend
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm lint
pnpm build --webpack
pnpm exec playwright install chromium
pnpm test:shopping:e2e
```

E2Eはローカル限定の検証用Supabase HTTP応答とNext.jsの実API、Chromiumを使います。実在するアカウント・共有DBには接続しません。既存Chromeなどを使う場合は`PLAYWRIGHT_EXECUTABLE_PATH`に実行ファイルを指定できます。ポートの既定値は3107で、使用中なら`KAGO_E2E_ORIGIN`を別のローカルポートへ設定します。結果・画面画像・NextログはGit管理外の`internal/app01-evidence/`へ出力します。

**DB担当の実装待ちのため、E2Eの成功を実DB・RLSの検証成功とは扱いません。** 上記の実DB確認が終わるまでAPP-01のIssueは完了・自動クローズにしません。

### 2026-10-24の検証記録

Node.js 22.23.4を使い、接続処理11件・共通基盤26件の自動テスト、Appと共有基盤の型検査、lint、本番ビルド（Webpack）が成功しました。Playwrightと既存Chromeによる16ケースでは、実際のNext.js APIを経由し、2利用者の切替・再読込・新規来店・店舗変更・別タブログアウト・遅延応答・認証失効・役割違い・DB未準備・通信失敗・店舗0件を確認しました。スマートフォン幅390pxのログイン・店舗選択・かごの画面画像を確認しています。

画面確認の資料：[ログイン](../images/app01-login-mobile.png)、[店舗・来店選択](../images/app01-stores-mobile.png)。画像の店舗・利用者は検証用の架空データです。Node.js 22とpnpm 11.19.0で`install --frozen-lockfile --offline`の再現も確認しました。

本番起動では接続設定を空にし、APIがHTTP 503・`configuration_missing`、デスクトップ幅1280pxの画面が設定不足の案内になること、固定の架空プロフィールを表示しないこと、LPがHTTP 200になることを確認しました。実Supabaseでの業務データ取得・原子的な来店開始・RLSは未確認です。

設計の参照：[SupabaseのRLS（権限とポリシーの両方を設定）](https://supabase.com/docs/guides/database/postgres/row-level-security)。
