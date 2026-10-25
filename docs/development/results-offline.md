# DATA-04（#48）通信断時の説明用成果

## 使い方

通信があるうちに、通常の成果画面またはログイン画面から「説明用の固定成果」を開く。

- Ads：`/ads/fixed-results/index.html`
- Insight：単独起動では `/fixed-results/index.html`、統合公開では `/insight/fixed-results/index.html`

「オフライン表示の準備完了」を確認しておく。以降は通信が切れても、同じ画面の再読込とAds・Insightの切替ができる。1つのHTMLに両方の表示を含むため、切替で別のサーバーへアクセスしない。

「この画面をファイルに保存」も使える。保存したHTMLはネットもWebサーバーも不要で開ける。元の通常画面へのリンクも保持する。通常のDB表示に戻るときは通信を復旧して戻るリンクを開く。統合公開以外の構成では、別サービスへ戻るリンクのURLは構成に合わせて確認する。

**未準備のURLを初めて開くには通信が必要。** ブラウザの保存データを消すとオフライン準備も消える。Service WorkerはHTTPSまたはlocalhostが必要。保存済みHTMLファイルはこの制約を受けない。

## データと安全性

- 共通の正本は `kago-os/shared/demo/results-fixed.json`。既存の共通仕様の架空例を使い、App・Signage・注文の由来はすべて「模擬」にする。
- 想定時点は2026-10-25 18:00 JST。実DBの取得時点や現在値として扱わない。画面の先頭に固定値・架空・時点・DB書込みなしを表示する。
- Adsは通常のPlacementCard・集計変換、Insightは通常のMetricsScreenを再利用して静的HTMLを生成する。Insightの指標定義は読取専用表示で展開済み。
- 実利用者のデータ・Cookie・署名付き画像・認証値を取り込まない。生成器は公開のリポジトリ内ファイルだけを読む。ログイン不要の公開ファイルとして配信する。
- 外部のCSS・JS・画像・フォントは不要。Service Workerが保存するのはこの固定HTMLだけで、通常の画面・Auth・DB APIは保存しない。スコープも固定ファイルのフォルダ内だけ。
- 固定値をDBへ送る処理はない。書込み・承認・購入などの操作も含めない。実測と固定値を自動的に混ぜず、利用者が明示的に切り替える。
- 再生成忘れを検知するmanifestで、元の画面部品・共通JSON・生成したHTML/Workerの整合性を通常テストで確認する。

## 再生成

両アプリを通常と同じ公開接続設定でビルドする。これは既存アプリのビルド条件であり、固定データ生成に認証値やDBアクセスは使用しない。

```sh
cd kago-os/kago-ads
pnpm build
cd ../kago-insight
pnpm build
cd ../kago-ads
KAGO_GENERATE_OFFLINE_RESULTS=1 pnpm test src/lib/results/offline-artifacts.test.ts
```

通常の成果部品・書式・CSSや共通固定JSONを変えたら再生成する。生成ファイルとmanifestもコミットする。実DBの成果の自動書き出し用途には使わない。

## 確認結果（2026-10-26）

- Ads・Insightの型チェック・lint・本番ビルド成功。
- Adsの通常テスト153件成功。固定成果の生成・整合性検査を含む。
- 次のブラウザ検証で、両アプリ合計24項目成功。

```sh
KAGO_DATA04_E2E=1 pnpm test src/lib/results/offline-results.browser.test.ts
```

本番Next.jsで準備後、配信サーバー自体を停止し、ブラウザもオフラインにする。Service Workerからの再読込、両成果の切替、共通の数値、390px幅、保存したHTMLのfile://表示、元の戻り先の保持、サーバー復旧後の通常ログイン画面への復帰を確認。固定画面からAuth・DB APIの要求なし、書込み要求0件。共有Supabaseのデータは変更していない。

確認画像：

- [Ads・オフライン・390px](screenshots/data04-ads-offline-390.png)
- [Insight・オフライン・390px](screenshots/data04-insight-offline-390.png)

Vercelの実画面では未確認。最終公開先で、固定ページとWorkerの公開パス・通常画面へ戻るリンクを確認する。
