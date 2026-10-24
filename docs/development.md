# 開発ガイド

サービスは`kago-os/`、開発資料は`docs/`、GitHub運用ルールはルートの`CONTRIBUTING.md`にまとめます。

<a id="structure"></a>

## フォルダ構成

```text
hs_2604/
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── .github/                 Issue・PRテンプレート
├── docs/
│   ├── development.md       この開発ガイド
│   ├── issues/issues.md     全体Issue案
│   └── specs/
│       ├── proposal.md      企画書
│       └── common-spec.md   共通仕様書（ID・データ形式・指標）
└── kago-os/
    ├── kago-app/            買い物アプリ（Next.js）
    │   ├── src/
    │   │   ├── app/         ページ・レイアウト・PWA
    │   │   ├── features/    cart・scanner・store・recommendations
    │   │   ├── components/ 共通UI・デモ確認UI
    │   │   ├── lib/        共通の商品定義・表示処理
    │   │   └── data/demo/  架空の商品・顧客データ
    │   ├── public/         配信用ロゴ・画像・アイコン
    │   ├── scripts/        LP取込・素材再生成
    │   ├── package.json
    │   └── 各種設定ファイル
    ├── lp/                  紹介サイト（静的HTML）
    │   ├── src/             HTML・CSS・JavaScript・画像
    │   ├── public/          配信用ロゴ・アイコン
    │   ├── scripts/build.mjs
    │   └── package.json
    ├── kago-ads/            未実装（.gitkeepのみ）
    ├── shared/backend/      共通の認証・DB接続ライブラリ
    ├── pnpm-workspace.yaml  App・共有ライブラリの依存管理
    ├── pnpm-lock.yaml       依存バージョンの固定
    ├── kago-core/           DBの接続確認用migration
    ├── kago-insight/        未実装（.gitkeepのみ）
    └── kago-signage/        未実装（.gitkeepのみ）
```

### 置き場所の判断

| 内容 | 置き場所 |
| --- | --- |
| URL・ページ・レイアウト | `kago-app/src/app/` |
| かご・スキャナ・店舗設定・推薦に固有の処理やUI | `kago-app/src/features/`の対応する機能フォルダ |
| 機能をまたいで使うUI | `kago-app/src/components/` |
| 共通の商品定義・表示補助 | `kago-app/src/lib/` |
| 固定の架空データ | `kago-app/src/data/demo/` |
| LPの編集対象 | `lp/src/` |
| 各サービスでWebに配信する素材 | 各サービスの`public/` |
| 今後のDB定義・変更履歴・初期データ | `kago-core/`（実装時に追加） |

`data/`に実利用者の購買データを保存しません。実際の購買・広告・店舗情報は今後共通DBで管理します。Coreへ推薦エンジンは置きません。

## Appの起動・検証

Node.js 22.13以上の22系、pnpm 11.19.0を使用します。サービスごとに`package.json`と`.nvmrc`を持ちます。

リポジトリのルートから実行します。

```sh
cd kago-os/kago-app
pnpm install --frozen-lockfile
pnpm dev
```

| URL | 内容 |
| --- | --- |
| `/` | LP（起動・ビルド時に兄弟の`lp/src/`から取り込む） |
| `/App` | ログイン→店舗選択→来店開始／復元→本人のかご（DB担当の実装待ち）。商品一覧・おすすめは表示サンプル |
| `/App/account` | ログイン中の買い物の情報。購入履歴・利用設定はAPP-03で接続 |
| `/App/store` | ローカルの店舗設定・商品管理 |
| `/App/demo-barcodes` | 読み取り確認用バーコード |

スマートフォンのカメラ確認にはHTTPSを使用します。現在の`/App`は本人の認証・DB接続が前提です。[共通接続のセットアップ](development/backend.md)に従って設定してください。設定不足や業務DB未準備は画面で案内し、ブラウザ内のデモへ自動で切り替えません。[APP-01の接続契約・検証手順](specs/app-session-contract.md)に、DB担当待ちのテーブル・関数・権限とテスト方法を記載しています。LPの閲覧には接続設定は不要です。静的検査・型検査・本番ビルドも`kago-app/`で実行します。

```sh
pnpm lint
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm build
```

ビルド済みの起動は`pnpm start`です。`node_modules/`・`.next/`・環境変数ファイル・型検査の生成物はGit管理しません。

## LPの編集とビルド

LPは`kago-os/lp/src/`だけを編集します。Appの`public/website/`は生成物なので直接編集しません。

Appの`pnpm dev`と`pnpm build`は、先に`scripts/sync-lp.mjs`でLPを取り込みます。この構成で従来の`/`と`/App`を維持します。起動中にLPを変更した場合は、`kago-app/`から`pnpm sync:lp`を実行して再読み込みします。

LP単体の静的ファイルも出力できます。リポジトリのルートから実行します。

```sh
cd kago-os/lp
pnpm install --frozen-lockfile
pnpm build
```

出力先は`lp/dist/`です。LPのビルドに外部ライブラリは不要なので、`node scripts/build.mjs`でも同じ結果を得られます。`dist/`はGit管理しません。

LP単体を別ホストで公開する場合は、`/App`へのリンク先やURLの振り分けをデプロイ時に設定します。現在のApp同梱構成では同じホスト内の`/App`へ進めます。

## 素材とデプロイ

承認済みロゴをそれぞれのサービスの`public/brand/`へ配置します。同じロゴの書き出し元は共通の承認済み原本です。字体やシンボルを変更しません。素材再生成は`kago-app/`から実行します。

```sh
pnpm generate:icons
pnpm generate:barcodes
```

AppとLPの正本は別フォルダです。AppからLPも表示する現在のビルドでは、Appだけをコピーせず、共有ライブラリ・workspace設定・LPを含む`kago-os/`全体を用意してください。Vercelを接続する際も、ビルド処理からこの兄弟フォルダを参照できる設定が必要です。LP単体は`lp/`でビルドし`dist/`を配信できます。今回の整理でVercelの既存設定は変更しません。

`public/`は配信される場所です。内部資料・秘密情報は入れず、制作途中の資料・エージェント向け作業メモはリポジトリの外で管理します。

## サービスの分担

| サービス | 今後の実装方針 |
| --- | --- |
| App | 買い物操作、かご・履歴・店舗施策・承認済み広告からの推薦選定。 |
| Ads | 店舗の広告募集、メーカーの申請・成果確認。 |
| Insight | 店舗の承認・停止、販促条件の設定、結果確認と改善。 |
| Signage | 承認済み広告の再生・記録。カメラ計測は実機確認後に採否を決める。 |
| Core | 共通DBの構造・権限・整合性・記録・集計。 |

CoreにはCOM-02のDB接続確認関数を追加しています。共有の認証・接続は`shared/backend/`を利用します。Ads・Insight・Signageの画面は未実装です。`.gitkeep`は空フォルダをGitで保持するためのファイルです。[Issue案](issues/issues.md)の内容や担当者欄は変更していません。資料内の管理IDはGitHubのIssue番号とは別です。

<a id="prehack"></a>

## 事前実装の範囲

元リポジトリは[dustin-ctrl/KAGO-OS-prehack](https://github.com/dustin-ctrl/KAGO-OS-prehack)、基準タグは`prehack-baseline-2026-10-21`、元コミットは`cf135461c208c1def6835ddf6cec461a99caaf8f`です。

基準時点には紹介LP、商品スキャン、ブラウザ内のかご・商品管理、架空の購買履歴に基づくおすすめ、PWAが含まれます。認証・共通DB連携・広告運用・分析画面・実決済は含みません。

過去の基準タグと履歴は維持し、事前実装をHack Dayの新機能として扱いません。ローカルのタグはGitHubへの公開を意味しません。以降の作業も実態に合わせて`(prehack)`と`(hackday)`を記録します。

GitHubでの実装作業の手順は[CONTRIBUTING.md](../CONTRIBUTING.md)を参照してください。
