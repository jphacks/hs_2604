# KAGO/OS

**いつもの買い物にちょうどいい提案を**

[![KAGO/OSのコンセプト：買い物客と店舗担当者をつなぐKAGO/Appのホーム画面とKAGO/Insightの販促効果画面（クリックしてYouTubeのデモ動画へ）](docs/images/kago-concept.png)](https://youtu.be/XD6icBN-xMQ)

**▶ [デモ動画を見る（YouTube）](https://youtu.be/XD6icBN-xMQ)**

上のコンセプト画像をクリック・タップしても、デモ動画が開きます。

**すぐ触る：** [KAGO/App（お客さん・スマホ）](https://kago-os.vercel.app/App)／[KAGO/Insight（店舗担当者・PC）](https://kago-os.vercel.app/insight/promotions)／[KAGO/Ads（メーカー担当者・PC）](https://kago-os.vercel.app/ads)　→ デモ用アカウントと手順は **[デモ体験ガイド](docs/demo-guide.md)**

## 製品概要

### 背景（製品開発のきっかけ、課題等）

スーパーの隅で、誰にも見られずに映像を流し続けるデジタルサイネージを見たことはありませんか？

小さな画面に流れる広告を見て、「これなら紙のポスターでもいいのでは？」と感じたことが、開発のきっかけです。デジタルなのに、情報を一方的に流すだけ。私たちは、その広告を「買い物に反応する広告」に変えたいと考えました。

お店はチラシやサイネージで商品を紹介しても、「お客さんに届いたか」「商品選びのきっかけになったか」を捉えにくい状況にあります。POSで分かるのは主に購入の結果であり、広告に触れてから商品を選ぶまでの過程は見えません。

一方、お客さんも、買い物中にすべての広告を探しているわけではありません。今の買い物に役立つおすすめやクーポンがあっても、気づかずに通り過ぎてしまいます。

そこで私たちは、買い物に必ずついてくる「カゴ」に着目しました。

**広告の前にお客さんを呼ぶのではなく、お客さんと一緒に広告が動いたら？**

KAGO/OSは、買い物カゴを、お店とお客さんをつなぐ接点に変えるプロダクトです。目指すのは、ただ広告を表示することではありません。買い物のタイミングに合わせて情報を届け、その情報が商品選びにつながったかをお店が振り返れる体験です。

### 製品説明（具体的な製品の説明）

**KAGO/OSは、お客さん・店舗・メーカーをつなぎ、買い物中の提案から販促の改善までを支えるプラットフォームです。** 利用する人と役割に応じて、KAGO/App・KAGO/Insight・KAGO/Adsの3つに分かれています。

| サービス | 対象 | 主な機能・役割 |
| --- | --- | --- |
| **KAGO/App** | スーパーで買い物をするお客さん | スマホで商品のバーコードを読み取り、かごを管理。買い物の内容や利用設定に合わせて、関連商品やクーポンを提案します。提案への反応・かごへの追加・疑似購入を、販促を振り返る情報につなげます。 |
| **KAGO/Insight** | 店舗担当者（店長・販促担当） | 店舗のおすすめやクーポンを設定し、メーカー広告の掲載を審査。表示・反応・購入などの指標を確認し、次の販促内容を見直すための店舗向け画面です。 |
| **KAGO/Ads** | 商品を届けたいメーカー担当者、広告を募集する店舗担当者 | 店舗が広告を募集し、メーカーが広告素材と対象商品を登録・申請。掲載状況や公開範囲内の成果を確認し、次の広告を企画するための画面です。広告の掲載承認はInsightで行います。 |

クーポン配布は、買い物中に商品との出会いをつくる販促手段の一つです。通常のおすすめ・店舗の販促・メーカー広告を区別しながら、お客さんに役立つ提案を届けます。

#### 3つのサービスで回す販促のPDCA

**広告を出して終わりにせず、「計画 → 提案 → 結果確認 → 改善」をつなぐことがKAGO/OSの特長です。**

| 段階 | サービスのつながり |
| --- | --- |
| **Plan：計画する** | Insightで店舗の販促を設定。Adsで店舗が募集した広告にメーカーが素材・対象商品を申請し、Insightで掲載を承認します。 |
| **Do：届ける** | Appで買い物中のお客さんに、おすすめ商品・クーポン・承認済み広告を提案します。 |
| **Check：確かめる** | Appの表示・反応・かご追加・疑似購入の記録をもとに、店舗はInsightで、メーカーはAdsで公開範囲内の成果を確認します。 |
| **Act：改善する** | 店舗はInsightで販促内容を見直し、メーカーはAdsで広告素材や対象商品を見直して次の申請へつなげます。 |

```text
Plan：Insight・Adsで販促／広告を計画し、掲載を承認
  → Do：Appで買い物中に提案
  → Check：反応・かご追加・購入をInsight・Adsで確認
  → Act：販促内容・広告素材を見直す → 次のPlanへ
```

買い物中の提案とその反応を、店舗・メーカーが次の施策を考えるための情報につなげます。

### 特長

#### 1. スキャンする買い物の中で、商品を提案

Appでの商品スキャン・かご管理に、関連商品のおすすめやクーポンを組み合わせます。商品をかごに入れたタイミングで、今の買い物に役立つ情報を届け、自然な流れで新しい商品との出会いをつくります。

#### 2. App・Insight・Adsをつなぎ、販促のPDCAを回す

店舗がInsightで設定・承認し、Appがお客さんに提案し、店舗とメーカーがInsight・Adsで結果を振り返る。一連の流れをつなげることで、広告の表示から反応・かご追加・購入までを、次の販促を考える判断材料にします。店舗の販促とメーカー広告の両方で、計画・実行・確認・改善を繰り返すことを目指します。

#### 3. 一人ひとりの買い物に合わせた提案

購入履歴や利用設定をもとに、関連商品の提案や定期購入品のお知らせを組み合わせます。いつもの商品の買い忘れを知らせながら、まだ手に取ったことのない商品との出会いをクーポンで後押しします。履歴を提案に使うかどうかは、お客さん自身が選べます。

### 解決できること・目指す価値

- **店舗担当者**：販促の設定から反応の確認までをつなぎ、施策を見直す判断材料を得る。
- **お客さん**：買い物中に関連商品やクーポンを知り、買い忘れやお得な情報の見逃しを減らす。
- **メーカー**：店舗への広告申請と掲載結果の確認を通じ、広告素材や対象商品の見直しにつなげる。

### 今後の展望

今後は、実店舗のPOS連携やプッシュ通知によって、買い物の前後にも役立つ体験へ広げていきます。App・Insight・Adsで蓄積した反応を販促の改善に生かし、KAGO/Signageを通じた店頭の情報発信にも展開していきます。

### 注力したこと（こだわり等）

- お客さんにとって便利な買い物の流れに、商品提案を組み込むこと。
- 通常のおすすめ・店舗の販促・メーカー広告を区別し、提案の理由を伝えること。
- App・Insight・Adsをつなぎ、店舗とメーカーが販促のPDCAを回せる流れを設計すること。
- 提案の理由と利用設定をわかりやすく示し、お客さんが納得して使える体験をつくること。

## デモを体験する

PCのKAGO/Insightでおすすめを設定し、スマホのKAGO/Appでスキャン・提案・疑似購入を体験できます。ゲリラクーポンのデモは、スパゲッティからトマトパスタソースを案内するシナリオです。メーカー担当者用アカウントでKAGO/Adsにログインすると、広告募集の確認から素材・申請・成果の確認、Insightでの審査までをたどれます。

**[デモ体験ガイドへ →](docs/demo-guide.md)**

ログイン方法、スマホのホーム画面への追加、広島デモ店の選択から購入まで、Adsでの広告申請の手順はこちらをご覧ください。

## 開発技術

### 活用した技術

#### API・データ

- Supabase：認証（Auth）・共通DB（PostgreSQL・行単位の権限RLS）・画像保存（Storage）。
- 公開購買データ **Groceries**：R言語パッケージ[arules](https://github.com/mhahsler/arules)に収録された、食料品店の30日分・9,835件のレシートデータ。関連商品ルールの学習・評価に使用（取得元のコミット・ハッシュは[評価結果](analysis/app04-association-rules/evaluation.md)に記載）。
- デモ用の架空データ：店舗・商品・顧客・購買履歴・広告募集・素材（実在の企業・顧客ではありません。[内容](docs/development/demo-data.md)）。

#### フレームワーク・ライブラリ・モジュール

- Next.js、React、TypeScript、Tailwind CSS。
- `@zxing/browser`：スマートフォンのカメラによるバーコード読み取り。
- `bwip-js`・`sharp`：バーコード・アイコン生成。

#### デバイス

- カメラ付きスマートフォン（App）、店舗・メーカー用PC（Insight・Ads）、店頭ディスプレイ（Signage）。

### 独自機能・技術（Hack Dayで開発）

紹介LP・商品スキャン・PWAなどの[事前実装](docs/development.md#prehack)を土台に、Hack Dayでは買い物中の提案と、店舗・メーカーの販促運用をつなぐ機能を開発しました。以下に、機能の工夫と主な実装箇所をまとめます。**実装リンクからコードへ、コミット番号から追加・更新時の差分へ進めます。**

#### 買い物に合わせて変わる提案（KAGO/App）

| 機能 | 内容・工夫 | 主な実装箇所 | 実装コミット |
| --- | --- | --- | --- |
| **公開購買データから作る関連商品ルール** | Groceriesの9,835件のレシートを学習用・評価用に分け、「一緒に買われる商品」の関連度・確信度を計算。カテゴリをデモ商品へ対応付け、手作業の初期ルールと分析ルールを区別します。 | [分析・生成](analysis/app04-association-rules/mine-rules.mjs)、[候補の取得](kago-os/kago-app/src/features/recommendations/association.ts)、[評価結果](analysis/app04-association-rules/evaluation.md) | [3b036e4](https://github.com/jphacks/hs_2604/commit/3b036e43047992b8b5fc0695912d901224b65ef4)、[5b6bd45](https://github.com/jphacks/hs_2604/commit/5b6bd451f4be05fd9f9ba29f0b24e494a045da1b) |
| **かごに連動する3種類の提案** | かご・購入履歴・店舗の販促・承認済み広告から、通常のおすすめ／店舗のおすすめ／メーカー広告を分けて選定。提案理由・広告主を示し、かごの変更後には古い結果を取り下げます。 | [選定](kago-os/kago-app/src/features/recommendations/selection.ts)、[再選定](kago-os/kago-app/src/features/recommendations/refresh.ts) | [435d2e1](https://github.com/jphacks/hs_2604/commit/435d2e174eb1ec286f683d1efebeb5c1c4014985)、[e37b81c](https://github.com/jphacks/hs_2604/commit/e37b81c26279e402890214cc210fae1f45acdc44) |
| **利用者ごとに選ぶゲリラクーポン** | 「商品の関連性 × 利用者にとっての新しさ × 割引のお得さ」で候補を評価。購入経験や定期購入の有無も考慮し、新しい商品との出会いを促します。履歴の利用はお客さん自身が選べます。 | [配布先・スコア判定](kago-os/kago-app/src/features/offers/targeting.ts)、[仕様](docs/specs/app-coupon-targeting.md) | [8323261](https://github.com/jphacks/hs_2604/commit/83232613a424b48b5d3f3edbd1cf213094382235) |
| **定期購入品の「そろそろ買う頃」** | 本人の購入回数・平均購入間隔・前回購入日から、補充時期の商品を来店時に提示。定期購入の判定を、おすすめ・クーポンの除外・買い忘れ防止で共通化しています。 | [購入周期の判定](kago-os/kago-app/src/features/recommendations/purchase-cycle.ts)、[来店時のカード](kago-os/kago-app/src/features/recommendations/regular-reminders.tsx) | [301542a](https://github.com/jphacks/hs_2604/commit/301542aabe27fcab43dd37325a7e23f8b42f0548) |
| **買い物中に届く3種類の販促** | ゲリラクーポン・セット割・タイムセールを、かごや有効時間に合わせて表示。クーポンは対象商品をスキャンして利用し、適用する値引きはDB側で計算します。 | [販促の選定](kago-os/kago-app/src/features/offers/serendipity.ts)、[クーポンの利用](kago-os/kago-app/src/features/offers/coupon-redemption.tsx)、[値引き処理](kago-os/kago-core/supabase/migrations/20261024140000_app_serendipity_offers.sql) | [3b036e4](https://github.com/jphacks/hs_2604/commit/3b036e43047992b8b5fc0695912d901224b65ef4)、[8edad18](https://github.com/jphacks/hs_2604/commit/8edad18f8e2351a427fc7314f41e205843deff3e) |
| **店舗別の商品・かご・購入履歴のDB連携** | スキャンした商品を来店先の価格で表示し、かごの数量変更・削除を共有DBへ保存。本人の購入履歴を読み取り、履歴を提案に使うかを設定できます。 | [商品・かご](kago-os/kago-app/src/features/cart/service.ts)、[購入履歴・設定](kago-os/kago-app/src/features/account/service.ts) | [2172256](https://github.com/jphacks/hs_2604/commit/2172256f04f62c5db4b34f675f9594b609c16ef4)、[cf13156](https://github.com/jphacks/hs_2604/commit/cf13156664e4c42107b88f8f241639652ff991b2) |
| **表示から購入までを追える行動記録** | カードが50%以上・連続1秒以上見えたときに表示を記録。クリック・かご操作を来店ID・選定枠へ結び付け、送信の再試行でも重複集計しない仕組みにしています。 | [実表示の判定](kago-os/kago-app/src/features/events/use-impression.ts)、[送信・再試行](kago-os/kago-app/src/features/events/outbox.ts)、[集計](kago-os/kago-core/supabase/migrations/20261024100000_metric_views.sql) | [b779222](https://github.com/jphacks/hs_2604/commit/b77922270bdfa9f52a7e925f16008d77d67dd854)、[aea6344](https://github.com/jphacks/hs_2604/commit/aea6344f613eea7e1f08c8f7dae809a9f9b016fc) |
| **疑似購入の確定と二重購入の防止** | 値引き後のかごを確認して疑似購入し、注文・明細・来店終了を一括保存。再送時の二重購入を防ぎ、価格やかごが変わった場合は再確認を求め、確定後は購入履歴へ反映します。 | [購入確定](kago-os/kago-app/src/features/checkout/service.ts)、[DBの一括保存](kago-os/kago-core/supabase/migrations/20261024080000_checkout.sql) | [28eca5e](https://github.com/jphacks/hs_2604/commit/28eca5e139715a28e37e59d080da5c96357c6e5c)、[6fb6901](https://github.com/jphacks/hs_2604/commit/6fb6901c9543170cd2950db2a68b600a4ac2fb1f) |

#### 店舗・メーカーが販促を運用する画面（KAGO/Insight・KAGO/Ads）

| 機能 | 内容・工夫 | 主な実装箇所 | 実装コミット |
| --- | --- | --- | --- |
| **店舗おすすめ・値引きの設定** | Insightで対象商品・掲載期間・優先度・理由や値引き率を設定し、共通DBを通じてAppの選定へ渡します。店舗おすすめの更新は、旧版の停止と新版の作成を一括で保存します。 | [おすすめの保存](kago-os/kago-insight/src/lib/supabase-actions.ts)、[値引き率の保存](kago-os/kago-insight/src/lib/supabase-offers.ts)、[Appとの連携手順](docs/development/store-pick-demo.md) | [39af27f](https://github.com/jphacks/hs_2604/commit/39af27ff282d2c295881bdaf03a41135972560de)、[4bf4fe8](https://github.com/jphacks/hs_2604/commit/4bf4fe8ef7fae9933a99cdc0b534339698f07c2b)、[1d44781](https://github.com/jphacks/hs_2604/commit/1d44781abf9e4434f73897d07683972966cbfe84) |
| **メーカー広告の審査・承認・停止** | 店舗担当者が申請を審査し、承認済みの有効な版を配信対象にします。承認・却下・停止をDB関数へ集約し、別店舗の操作や古い申請版での更新を防ぎます。 | [審査画面](kago-os/kago-insight/src/features/ad-review/review-screen.tsx)、[承認・版の切替](kago-os/kago-core/supabase/migrations/20261024090000_ad_approval.sql) | [39af27f](https://github.com/jphacks/hs_2604/commit/39af27ff282d2c295881bdaf03a41135972560de)、[0b23210](https://github.com/jphacks/hs_2604/commit/0b23210f3f72390f67a88e20b33edbc1fa5e95fa) |
| **販促を振り返るダッシュボード** | 店舗・施策別の表示・反応・購入を共通DBから取得。KPI・推移・商品比較・次の改善案を並べ、販促を見直しやすい画面にしています（クーポン効果画面はデモデータを使用）。 | [DBからの成果取得](kago-os/kago-insight/src/lib/supabase-source.ts)、[クーポン効果画面](kago-os/kago-insight/src/features/coupons/coupon-effect-screen.tsx) | [39af27f](https://github.com/jphacks/hs_2604/commit/39af27ff282d2c295881bdaf03a41135972560de)、[882f988](https://github.com/jphacks/hs_2604/commit/882f988894449168760d33bc1265da20101310a0) |
| **店舗の広告募集とメーカー向け検索** | 店舗が広告募集を作成・公開・終了し、メーカーが店舗・カテゴリ・掲載先・期間などで募集を検索。共通認証とDBへ接続し、各店舗が自店の募集を管理します。 | [募集の管理](kago-os/kago-ads/src/lib/backend/store-calls.ts)、[募集ポータル](kago-os/kago-ads/src/lib/backend/portal.ts) | [874a505](https://github.com/jphacks/hs_2604/commit/874a50515a1f6e2a6774664d3358e2b16cd3e7c5)、[52f4010](https://github.com/jphacks/hs_2604/commit/52f40107bc2eab5e99764e613d11743bb1da391d) |
| **広告素材の登録・掲載申請** | メーカーがApp・Signage向けの広告画像と対象商品を登録し、店舗の募集へ掲載を申請。画像の保存、素材の版管理、申請状況の確認、修正後の再申請まで共通DBへ接続しています。 | [素材・申請のDB処理](kago-os/kago-ads/src/lib/backend/maker.ts)、[登録画面](kago-os/kago-ads/src/features/creatives/new-creative.tsx)、[申請画面](kago-os/kago-ads/src/features/applications/new-application.tsx) | [7350594](https://github.com/jphacks/hs_2604/commit/73505946b4b84f6a70885395a48390a2c3b4ce76) |
| **メーカー別の広告成果と公開範囲の制御** | メーカーは自社広告の成果だけを取得し、店舗が公開を許可した指標だけを表示。非公開の値は0件と区別して扱い、AppとSignageの成果も分けています。 | [メーカーの成果画面](kago-os/kago-ads/src/features/results/maker-results.tsx)、[公開範囲を守る取得処理](kago-os/kago-ads/src/lib/backend/results.ts) | [37c4266](https://github.com/jphacks/hs_2604/commit/37c426622115b663435982692fd042e7ca51691b) |

#### サービスをつなぐ基盤・店頭表示

| 機能・技術 | 内容・工夫 | 主な実装箇所 | 実装コミット |
| --- | --- | --- | --- |
| **共通認証と役割別のデータ権限** | Supabase認証を共通化し、DBの行単位の権限（RLS）で、本人・自店・自社・自端末のデータにアクセスを限定。画面の表示制御だけに依存せず、DB側でも読み書きを制限します。 | [共通認証](kago-os/shared/backend/src/auth.ts)、[DBの権限](kago-os/kago-core/supabase/migrations/20261024070000_access_policies.sql) | [3036614](https://github.com/jphacks/hs_2604/commit/30366140fcf4a2fb6b1df347064f4208e2158c4d)、[75a8f1f](https://github.com/jphacks/hs_2604/commit/75a8f1f2d63b5ebb498a1638f32a4bf6931ea112) |
| **承認済み広告の店頭再生（Signage）** | 端末アカウントでログインし、承認済み広告・店舗販促を期間と時間帯に合わせて全画面表示。素材のキャッシュと再生記録の送信を実装しています。 | [再生エンジン](kago-os/kago-ads/src/features/signage/engine.ts)、[端末のDB接続](kago-os/kago-ads/src/lib/backend/signage.ts) | [3f65d21](https://github.com/jphacks/hs_2604/commit/3f65d215a3244422f9a08092b0f793923e547876)、[7c6c97f](https://github.com/jphacks/hs_2604/commit/7c6c97f8fc04b30fd60592d51388be64a3eb520d) |
| **店内傾向に応じた広告選定デモ** | カテゴリ別のデモ集計に合わせて広告を選び、理由・重み・ポリシー版をJSONへ記録。集計の人数や鮮度も考慮し、状況に応じた案内へ切り替えます。 | [集計からの選定](kago-os/kago-ads/src/lib/signage/crowd-selection.ts)、[比較デモ](kago-os/kago-ads/src/features/signage/crowd-demo.tsx) | [5be18b5](https://github.com/jphacks/hs_2604/commit/5be18b59887fb2739ee08b94552a332906b82429) |
