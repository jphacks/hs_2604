# kago-ads

KAGO/OS のうち **KAGO/Ads**（店舗の広告募集・メーカーの広告申請）の画面です。Ads のデータ項目・状態・素材の仕様は [docs/specs/ads-spec.md](../../docs/specs/ads-spec.md) にまとめています。

今は **仮データ（ブラウザの localStorage）** で動きます。Ads のテーブル（DB-04）と権限（DB-06）ができたら、共通の認証・DB接続（`@kago/backend`）を使うデータ層に差し替えます。

## 起動・確認

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

## 構成

kago-app と同じ形にしています。

| 場所 | 内容 |
| --- | --- |
| `src/app/` | ページとレイアウト。`/ads/store/calls`（ADS-02）、`/ads/portal`（ADS-01）、`/ads/maker/creatives`・`/ads/maker/applications`（ADS-03）、`/ads/dev/review` |
| `src/features/` | 機能ごとの画面。`ad-calls`（ADS-02）・`portal`（ADS-01）・`creatives`・`applications`（ADS-03）・`dev-review`・`shell`（ヘッダー・入口） |
| `src/components/` | 機能をまたいで使う部品。`ad-media.tsx` は素材の表示と「広告｜提供」・価格の重ね表示で、Signage（SIG-01）でも使う |
| `src/lib/domain/` | 型（共通仕様書の列名のまま）、判定ルール、素材の仕様 |
| `src/lib/data/` | データの窓口（`repository.ts`）と仮データ版（`mock-repository.ts`）。画面はここだけを通して読み書きする |
| `src/data/demo/` | 仮データ（`seed.ts`）、広告素材・商品の対応表（`ad-assets.csv`・`products.csv`） |
| `public/ad-assets/` | ADS-05 のデモ広告素材（画像・動画） |
| `scripts/ad-assets/` | 素材と対応表を作り直すスクリプト（ADS-05） |

Next.js の約束：描画中に現在時刻を読まず、`today()` は読み込み後やイベントの中で呼ぶ。URL のパラメータを読む画面は `<Suspense>` で包む。

## まだできていないこと

- 共通の認証・DB との接続（DB-04・DB-06・COM-03 待ち）。アップロードした素材は、仮データではページを再読み込みすると消える
- ADS-04（メーカー向けの成果画面）は DB-09・INS-03 待ち
- ID は読みやすい略号（`S1`・`C1` など）。DB では UUID と slug
