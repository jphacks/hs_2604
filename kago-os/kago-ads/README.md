# kago-ads

KAGO/OS のうち **KAGO/Ads**（店舗の広告募集・メーカーの広告申請）と **KAGO/Signage**（店内サイネージの全画面表示・再生記録）の画面です。**Signage もこのアプリにあります**（`/signage`。2026-10-24 決定。開発ガイドにある `kago-signage/` は作りません）。Ads のデータ項目・状態・素材の仕様は [docs/specs/ads-spec.md](../../docs/specs/ads-spec.md) にまとめています。

**ADS-01の募集閲覧はSupabaseへ接続します。** 募集作成・申請保存・Signageは仮実装のため、接続済みの範囲を分けて扱います。

## ADS-01：共通認証と募集ポータルのDB接続

既定は `supabase` モードです。メーカーの実ログイン、`maker_members` の所属確認、店舗・募集の一覧／詳細、公開される成果の範囲、稼働中端末の設置場所、自社の申請済みIDを読取専用で取得します。DBにない店舗紹介・住所を仮の値で補いません。

```bash
cp .env.example .env.local
# .env.localをローカルで編集し、同じSupabaseプロジェクトのURLとpublishable keyを設定
pnpm dev
```

- `NEXT_PUBLIC_ADS_DATA_SOURCE=supabase`（未指定も同じ）を使用。URL・公開キーが不足／不正なら設定エラーを表示し、仮データには戻りません。変更後は再起動・再ビルドが必要です。
- アカウントは管理者が作成し、`app_metadata.kago.roles` に `maker_staff`、`maker_members` に本人Auth UUIDとメーカーUUIDを設定します。[共通認証ガイド](../../docs/development/backend.md)を参照してください。所属なし・別役割は拒否します。
- `/ads/portal` を開いてログインします。未ログイン時に募集を一般公開しません（DB-06はanonへ読取を許可しない）。`?as=...` やlocalStorageの仮セッションは実認証に使いません。
- DB-02・DB-04・DB-05・DB-06と前提migrationを適用した環境を使います。適用履歴を確認し、共有環境へ重複適用しないでください。ブラウザは公開キーと本人セッションで接続し、管理キーを使いません。
- 複数所属がある場合、募集一覧は各店舗の公開済み募集、自社申請は本人が所属するメーカーのものを取得します。RLSでさらに制限されます。
- ADS-02の募集作成、ADS-03の素材登録・申請保存、審査の確認用画面は実接続モードでは準備中の案内を出します。実ログインを仮データの書込みへ流さないためです。申請への入口は募集詳細に残しますが、保存はまだできません。

### 従来の仮データでの確認

`.env.local` に `NEXT_PUBLIC_ADS_DATA_SOURCE=mock` を明示して再起動・再ビルドしてください。以下にある役割切替・初期化・Adsの保存はこのモードに限ります。Signageは引き続き仮データ版です。

### 実Supabaseでの読取確認

`.env.local` にサーバー用の `KAGO_ADS_CHECK_EMAIL` と `KAGO_ADS_CHECK_PASSWORD` を追加し、`pnpm check:portal` を実行します。メーカーの認証・所属、店舗と募集の読取、ログアウト後の拒否を確認します。業務データは変更せず、認証情報や行の内容は出力しません。値をGit・Issue・PR・チャットに貼らないでください。

2店舗以上の募集・終了募集・募集0件の店舗はDATA-01等で用意する必要があります。このチェックの成功だけで、他社・下書きの拒否や別端末での実演まで確認済みにはしません。

### ローカル検証

```bash
pnpm test
pnpm lint
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm build --webpack
pnpm test:portal:e2e
```

- `pnpm test` は正式な全migrationを破棄可能なPGliteへ適用し、メーカー2社・2店舗、下書き・終了募集、所属なし・別役割・ログアウト・失効、自社申請の範囲を確認します。テスト用の追加GRANT・ポリシーは使いません。
- `pnpm test:portal:e2e` は架空の公開接続値で本番ビルドを作り、ポート3189で一時起動します。既存のChrome（Linuxでは `/usr/bin/google-chrome`、別パスは `CHROME_PATH`）で実操作します。認証とHTTP転送は検証用、DB行とRLSはPGliteの正式SQLです。実SupabaseのAuth署名・PostgREST・Storageの確認ではありません。
- このコマンドは `.next` を検証用ビルドに更新します。確認後に配布する場合は実環境の設定で再ビルドしてください。スクリーンショットは `docs/images/ads01-login.png`・`ads01-portal.png` に保存します。
- 共有Supabaseへの適用、実アカウントと実端末での通し確認は別途必要です。

## 仮データモードの起動・確認

Node.js 22・pnpm 11.19.0 を使います（`kago-os/` 全体が pnpm のワークスペース）。

```bash
cd kago-os
pnpm install --frozen-lockfile
cd kago-ads
pnpm dev        # http://localhost:3000/ads
pnpm test       # 判定ルールとデータ層のテスト（vitest）
pnpm lint
pnpm build
```

右上の「ログイン（デモ）」で役割を切り替えます。URL に `?as=store_staff:S1` や `?as=maker_staff:M1` を付けても切り替えられます。「仮データを初期化」で最初の状態に戻ります。仮データは共通仕様書 11 章の架空例（広島デモ店・瀬戸内トマト食品・トマトパスタソース）で、日付は今日を基準に作ります。

| 役割（共通の認証の roles） | できること |
| --- | --- |
| `store_staff`（広島デモ店／駅前店） | ADS-02：自店の募集の作成・編集・公開・終了、成果の公開範囲の設定。審査（確認用） |
| `maker_staff`（瀬戸内トマト食品／確認用メーカー） | ADS-01：募集を探す。ADS-03：広告素材と版の登録・申請・再申請・結果の確認 |

`/ads/dev/review` の審査画面は、INS-01（KAGO/Insight）と DB-08 ができるまでの確認用です。Insight ができたら削除します。

## Signage（SIG-01〜03）

| URL | 内容 |
| --- | --- |
| `/signage` | 端末を選ぶ入口 |
| `/signage/play?device=D1` | 端末の全画面表示。`&debug=1` で通信・キャッシュ・未送信の記録の状態と「通信を切る（確認用）」ボタンを出す |
| `/signage/dev` | 店舗の担当者の確認画面（INS-02・INS-03 ができるまでの仮）。デモ用の時刻、端末に届く内容と出さないもの、販促の停止・再開・追加、再生記録と時間帯別の集計 |

会場の端末では Chrome のキオスクモードで開きます（クリックでも全画面になります）。

```bash
google-chrome --kiosk --autoplay-policy=no-user-gesture-required "https://<デプロイ先>/signage/play?device=D1"
```

決まり（COM-01 案 C・E・F・G、共通仕様書 8.3・9.3）：

- 出すもの：自店で承認済み（`active`・期間内・掲載先に Signage）のメーカー広告と、時間帯・期間内の店舗販促。広告（承認順）と販促（優先度順）を交互に流す。出せるものがなければ案内（`mode = fallback`）
- 画像は1枠10秒、動画は最後まで。5秒ごとに取り直し、内容が変わったら画像は表示3秒以上で、動画は終わってから切り替える（新しく入ったものを先に出す）。停止・期間や時間帯の終わりはすぐ切り替える
- 取得した内容の有効期限は10分。通信が切れても期限まで表示を続け、過ぎたら案内にする。素材は先に読み込み、`/signage/` の範囲の Service Worker（`public/signage/sw.js`、本番ビルドのみ）が保存する
- 再生記録は再生の開始と終了ごとに端末で作り（id は端末が採番）、端末に貯めて5秒ごとに送る。同じ id は1件にまとめるので、再送しても増えない。「再生1回」は「終わっていて3秒以上・案内ではない・動画は最後まで再生」（`src/lib/signage/plays.ts` の `isCountedPlay`。DB-09 に渡す）
- 端末は利用者・来店・かご・注文を読まない。記録にも `user_id`・`visit_id` を持たない

仮データでは Ads と Signage が同じブラウザの localStorage を共有します。確認画面（別のタブ）で販促を止めると、端末の画面は次の取得（5秒以内）で切り替わります。

## 構成

kago-app と同じ形にしています。

| 場所 | 内容 |
| --- | --- |
| `src/app/` | ページとレイアウト。`/ads/store/calls`（ADS-02）、`/ads/portal`（ADS-01）、`/ads/maker/creatives`・`/ads/maker/applications`（ADS-03）、`/ads/dev/review`、`/signage`・`/signage/play`・`/signage/dev`（SIG-01〜03） |
| `src/features/` | 機能ごとの画面。`ad-calls`（ADS-02）・`portal`（ADS-01）・`creatives`・`applications`（ADS-03）・`dev-review`・`shell`（ヘッダー・入口）・`signage`（端末の画面と再生の仕組み `engine.ts`・確認画面） |
| `src/components/` | 機能をまたいで使う部品。`ad-media.tsx` は素材の表示と「広告｜提供」・価格の重ね表示、店舗販促の表示（`PromoMedia`）。ADS-03 のプレビューと Signage の全画面表示で同じものを使う |
| `src/lib/domain/` | 型（共通仕様書の列名のまま）、判定ルール、素材の仕様 |
| `src/lib/signage/` | Signage の配信内容の組み立て（`feed.ts`）、切り替えの判定（`player.ts`）、再生記録の数え方（`plays.ts`）。画面から切り離した関数でテストする |
| `src/lib/data/` | データの窓口（`repository.ts`）と仮データ版（`mock-repository.ts`）。画面はここだけを通して読み書きする |
| `src/data/demo/` | 仮データ（`seed.ts`）、広告素材・商品の対応表（`ad-assets.csv`・`products.csv`） |
| `public/ad-assets/` | ADS-05 のデモ広告素材（画像・動画） |
| `scripts/ad-assets/` | 素材と対応表を作り直すスクリプト（ADS-05） |

Next.js の約束：描画中に現在時刻を読まず、`today()` は読み込み後やイベントの中で呼ぶ。URL のパラメータを読む画面は `<Suspense>` で包む。

## まだできていないこと

- ADS-02・ADS-03のDB保存・画像保存（COM-03との調整が必要）。アップロードした素材は、仮データではページを再読み込みすると消える
- ADS-04（メーカー向けの成果画面）の実集計はDB-09待ち。INS-03とは定義・部品を揃える
- Signage の端末ログインは仮（端末 ID だけで入れる）。COM-02 の signage 役割のアカウントに差し替える。店舗販促・再生記録のテーブルは実装済みだが、Signage画面からは未接続
- カメラ（SIG-04・SIG-05）、店内傾向での切り替え（SIG-06）はまだない
- 仮データのIDは読みやすい略号（`S1`・`C1` など）。DB接続済みの募集ポータルはUUIDを使用
