# KAGO/OS

**いつもの買い物にちょうどいい提案を**

[![KAGO/OSのコンセプト：スマホで商品をスキャンする買い物客と、販促を管理・分析する店舗スタッフ（クリックしてYouTubeのデモ動画へ）](docs/images/kago-concept.png)](https://youtu.be/XD6icBN-xMQ)

**▶ [デモ動画を見る（YouTube）](https://youtu.be/XD6icBN-xMQ)**

上のコンセプト画像をクリック・タップしても、デモ動画が開きます。

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
| **KAGO/Insight** | 店長・店舗の販促担当者 | 店舗のおすすめやクーポンを設定し、メーカー広告の掲載を審査。表示・反応・購入などの指標を確認し、次の販促内容を見直すための店舗向け画面です。 |
| **KAGO/Ads** | 商品を届けたいメーカーの広告担当者、広告を募集する店舗担当者 | 店舗が広告を募集し、メーカーが広告素材と対象商品を登録・申請。掲載状況や公開範囲内の成果を確認し、次の広告を企画するための画面です。広告の掲載承認はInsightで行います。 |

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

このPDCAは、3つのサービスが連携して目指す利用の流れです。各画面の実装と、全経路の接続・検証済み範囲は区別しています。購入はアプリ内の疑似購入を対象とし、外部POS連携・実決済は対象外です。「かご追加」はアプリ上の操作を指します。確認範囲とサンプルデータの扱いは[デモ構成・確認範囲](docs/development/demo-video.md)を参照してください。

### 特長

#### 1. スキャンする買い物の中で、商品を提案

商品スキャン・かご管理という買い物の操作に、関連商品のおすすめやクーポンを組み合わせます。広告を見るためだけの操作を増やさず、商品を選ぶタイミングで情報を届けることを狙います。今回の通知はAppを開いている間の画面内表示を対象とし、アプリを閉じていても届くプッシュ通知は対象外です。

#### 2. App・Insight・Adsをつなぎ、販促のPDCAを回す

店舗がInsightで設定・承認し、Appがお客さんに提案し、店舗とメーカーがInsight・Adsで結果を振り返る。一連の流れをつなげることで、広告の表示から反応・かご追加・購入までを、次の販促を考える判断材料にします。店舗の販促とメーカー広告の両方で、計画・実行・確認・改善を繰り返すことを目指します。

#### 3. 購入履歴を使った提案へ

同じ商品をかごに追加しても、購入履歴や利用設定に応じて提案を変えることに取り組んでいます。3人の架空利用者による比較を追加予定ですが、データの準備と、実際の配布ロジック・画面の接続確認は別の段階です。

### 解決できること・目指す価値

- **店員**：販促の設定から反応の確認までをつなぎ、施策を見直す判断材料を得る。
- **お客さん**：買い物中に関連商品やクーポンを知り、買い忘れやお得な情報の見逃しを減らす。
- **メーカー**：店舗への広告申請と掲載結果の確認を通じ、広告素材や対象商品の見直しにつなげる。

広告への反応と購入のつながりを可視化することを目指しており、売上向上や広告の因果効果を検証済みとするものではありません。

### 今後の展望

まず販促設定からAppの提案、反応・疑似購入の記録、Insightでの結果確認までの接続を仕上げます。その後、実店舗のPOS連携やプッシュ通知などを検討します。App・Insight・Adsを通じた記録と結果確認を充実させ、店舗・メーカーが繰り返し改善できる運用につなげます。店頭表示のKAGO/Signageとの連携も検証します。

### 注力したこと（こだわり等）

- お客さんにとって便利な買い物の流れに、商品提案を組み込むこと。
- 通常のおすすめ・店舗の販促・メーカー広告を区別し、提案の理由を伝えること。
- App・Insight・Adsをつなぎ、店舗とメーカーが販促のPDCAを回せる流れを設計すること。
- 実装・サンプルデータ・将来構想を分け、デモで確認できる範囲を明示すること。

## デモを体験する

PCのKAGO/Insightでおすすめを設定し、スマホのKAGO/Appでスキャン・提案・疑似購入を体験できます。販促効果のダッシュボードはモックデータで紹介しています。

**[デモ体験ガイドへ →](docs/demo-guide.md)**

ログイン方法、スマホのホーム画面への追加、広島デモ店の選択から購入までの手順はこちらをご覧ください。

## 開発技術

### 活用した技術

- Next.js、React、TypeScript、Tailwind CSS。
- Supabase：認証・共通DB（PostgreSQL）。
- `@zxing/browser`：スマートフォンのカメラによるバーコード読み取り。
- `bwip-js`・`sharp`：バーコード・アイコン生成。
- 動作確認用の架空の商品・顧客・購買履歴データ。
- デバイス：カメラ付きスマートフォン、店舗管理用PC。

### 独自機能・技術（Hack Dayで開発）

KAGO/OSでは、買い物中のかごを起点に商品を提案し、その反応を店舗・メーカーの次の販促へつなげます。以下に、機能の内容と主な実装箇所、対応するコミットをまとめます。**実装リンクからコードへ、コミット番号から追加・更新時の差分へ進めます。** コミットは各機能の主な実装・更新を示します。

#### 買い物に合わせて変わる提案（KAGO/App）

| 機能 | 内容・工夫 | 主な実装箇所 | 実装コミット |
| --- | --- | --- | --- |
| **公開購買データから作る関連商品ルール** | Groceriesの9,835件のレシートを学習用・評価用に分け、「一緒に買われる商品」の関連度・確信度を計算。カテゴリをデモ商品へ対応付け、手作業の初期ルールと分析ルールを区別します。 | [分析・生成](analysis/app04-association-rules/mine-rules.mjs)、[候補の取得](kago-os/kago-app/src/features/recommendations/association.ts)、[評価結果](analysis/app04-association-rules/evaluation.md) | [3b036e4](https://github.com/jphacks/hs_2604/commit/3b036e43047992b8b5fc0695912d901224b65ef4)、[5b6bd45](https://github.com/jphacks/hs_2604/commit/5b6bd451f4be05fd9f9ba29f0b24e494a045da1b) |
| **かごに連動する3種類の提案** | かご・購入履歴・店舗の販促・承認済み広告から、通常のおすすめ／店舗のおすすめ／メーカー広告を分けて選定。提案理由・広告主を示し、かごの変更後には古い結果を取り下げます。 | [選定](kago-os/kago-app/src/features/recommendations/selection.ts)、[再選定](kago-os/kago-app/src/features/recommendations/refresh.ts) | [435d2e1](https://github.com/jphacks/hs_2604/commit/435d2e174eb1ec286f683d1efebeb5c1c4014985)、[e37b81c](https://github.com/jphacks/hs_2604/commit/e37b81c26279e402890214cc210fae1f45acdc44) |
| **利用者ごとに選ぶゲリラクーポン** | 「商品の関連性 × 利用者にとっての新しさ × 割引のお得さ」で候補を評価。通常の選定では定期購入品を除き、まだ買ったことのない商品との出会いを促します。購入履歴の利用をOFFにすると履歴を使いません。 | [配布先・スコア判定](kago-os/kago-app/src/features/offers/targeting.ts)、[仕様](docs/specs/app-coupon-targeting.md) | [8323261](https://github.com/jphacks/hs_2604/commit/83232613a424b48b5d3f3edbd1cf213094382235) |
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
| **販促を振り返るダッシュボード** | 店舗・施策別の表示・反応・購入を共通DBから取得する成果画面に加え、KPI・推移・商品比較・次の改善案を示すクーポン効果画面を実装。**クーポン効果画面は固定のサンプルデータ**です。 | [DBからの成果取得](kago-os/kago-insight/src/lib/supabase-source.ts)、[クーポン効果画面](kago-os/kago-insight/src/features/coupons/coupon-effect-screen.tsx) | [39af27f](https://github.com/jphacks/hs_2604/commit/39af27ff282d2c295881bdaf03a41135972560de)、[882f988](https://github.com/jphacks/hs_2604/commit/882f988894449168760d33bc1265da20101310a0) |
| **店舗の広告募集とメーカー向け検索** | 店舗が広告募集を作成・公開・終了し、メーカーが店舗・カテゴリ・掲載先・期間などで募集を検索。共通認証とDBへ接続し、各店舗が自店の募集を管理します。 | [募集の管理](kago-os/kago-ads/src/lib/backend/store-calls.ts)、[募集ポータル](kago-os/kago-ads/src/lib/backend/portal.ts) | [874a505](https://github.com/jphacks/hs_2604/commit/874a50515a1f6e2a6774664d3358e2b16cd3e7c5)、[52f4010](https://github.com/jphacks/hs_2604/commit/52f40107bc2eab5e99764e613d11743bb1da391d) |
| **メーカー別の広告成果と公開範囲の制御** | メーカーは自社広告の成果だけを取得し、店舗が公開を許可した指標だけを表示。非公開の値は0件と区別して扱い、AppとSignageの成果も分けています。 | [メーカーの成果画面](kago-os/kago-ads/src/features/results/maker-results.tsx)、[公開範囲を守る取得処理](kago-os/kago-ads/src/lib/backend/results.ts) | [37c4266](https://github.com/jphacks/hs_2604/commit/37c426622115b663435982692fd042e7ca51691b) |

#### サービスをつなぐ基盤・店頭表示

| 機能・技術 | 内容・工夫 | 主な実装箇所 | 実装コミット |
| --- | --- | --- | --- |
| **共通認証と役割別のデータ権限** | Supabase認証を共通化し、DBの行単位の権限（RLS）で、本人・自店・自社・自端末のデータにアクセスを限定。画面の表示制御だけに依存せず、DB側でも読み書きを制限します。 | [共通認証](kago-os/shared/backend/src/auth.ts)、[DBの権限](kago-os/kago-core/supabase/migrations/20261024070000_access_policies.sql) | [3036614](https://github.com/jphacks/hs_2604/commit/30366140fcf4a2fb6b1df347064f4208e2158c4d)、[75a8f1f](https://github.com/jphacks/hs_2604/commit/75a8f1f2d63b5ebb498a1638f32a4bf6931ea112) |
| **承認済み広告の店頭再生（Signage）** | 端末アカウントでログインし、承認済み広告・店舗販促を期間と時間帯に合わせて全画面表示。素材のキャッシュと再生記録の送信を実装しています。 | [再生エンジン](kago-os/kago-ads/src/features/signage/engine.ts)、[端末のDB接続](kago-os/kago-ads/src/lib/backend/signage.ts) | [3f65d21](https://github.com/jphacks/hs_2604/commit/3f65d215a3244422f9a08092b0f793923e547876)、[7c6c97f](https://github.com/jphacks/hs_2604/commit/7c6c97f8fc04b30fd60592d51388be64a3eb520d) |
| **店内傾向に応じた広告選定の先行デモ** | 架空のカテゴリ別集計から広告を選び、理由・重み・ポリシー版をJSONへ記録。少人数・集計なし・期限切れでは汎用表示へ切り替えます。**固定データの独立デモで、実店内集計や通常再生への接続は未実装**です。 | [集計からの選定](kago-os/kago-ads/src/lib/signage/crowd-selection.ts)、[比較デモ](kago-os/kago-ads/src/features/signage/crowd-demo.tsx) | [5be18b5](https://github.com/jphacks/hs_2604/commit/5be18b59887fb2739ee08b94552a332906b82429) |

#### 審査・デモで確認する範囲

- **通常ロジックとデモ用の固定設定：** 公開デモでは、店舗おすすめはスパゲッティを優先し、スパゲッティがかごにある間のクーポンはトマトパスタソースを優先します。後者は利用者ごとのスコアに関係なく選ぶ経路です（[ddce7bf](https://github.com/jphacks/hs_2604/commit/ddce7bfc8b24f4b4366df69580401e11a0348e64)、[48a319d](https://github.com/jphacks/hs_2604/commit/48a319d113c6d86f8efa035f8100b47b8a43c7b5)）。
- **サンプル・未接続の範囲：** クーポン効果グラフと店内傾向の選定デモはサンプルデータです。Adsの[広告素材登録・申請画面](kago-os/kago-ads/src/lib/data/index.ts)はブラウザ内のモック保存を使用し、募集・申請・承認から成果までの全経路を実DBで確認済みとはしていません。購入は疑似購入で、外部POS・実決済・バックグラウンドのプッシュ通知・カメラによる視認計測は対象外です。
- **データ・効果の扱い：** デモの商品・利用者・購入履歴は架空です。Groceriesの分析結果は欧州の1店舗のカテゴリ単位のデータに基づき、日本の店舗での推薦精度や売上向上を実証したものではありません。[分析方法と限界](analysis/app04-association-rules/README.md)を参照してください。
- **事前実装との区別：** 紹介LP、商品スキャン、ブラウザ内のかご・商品管理、架空の履歴に基づくおすすめ、PWAは事前実装です。上表では、Hack Dayに追加した選定・共通DB連携・販促運用などを記載しています。[事前実装の記録](docs/development.md#prehack)と[導入コミット 08c5524](https://github.com/jphacks/hs_2604/commit/08c5524cd798caab72de27bed259f24d847b4780)で範囲を確認できます。

操作手順は[デモ体験ガイド](docs/demo-guide.md)、検証記録は各コミットの対応PR・[店舗おすすめの連携確認](docs/development/store-pick-demo.md)を参照してください。[デモ構成・確認範囲](docs/development/demo-video.md)には2026年10月24日時点の記録を掲載しており、最新の実装状況とは区別しています。

## 開発資料

- [デモ構成・確認範囲](docs/development/demo-video.md)
- [セット割・タイムセールの試し方（商品コード・期待金額・画面付き）](docs/development/offer-demo-scenarios.md)

- [共通仕様書：役割・ID・イベント・購入経路・担当確認](docs/specs/common-spec.md)
- [起動・検証手順](docs/development.md)
- [Supabaseの認証・DB接続と役割の設定](docs/development/backend.md)
- [Issue案・作業範囲・完成条件](docs/issues/issues.md)
- [GitHub運用ルール](CONTRIBUTING.md)

### SIG-06：店内傾向による選定の先行確認

Adsを起動し、`/signage/selection-demo` を開くと、架空の「パスタ多め」「パン多め」と、少人数・集計なし・期限切れ・停止を切り替えて、選定理由・重み・ポリシー版を確認できます。ログは画面内の直近20件とダウンロードJSONに保持します。個人のかごや履歴、共有DBへの通信は使いません。

`kago-os/kago-ads` で `pnpm test:signage:crowd:e2e` を実行すると、本番ビルドと実ブラウザで検証します。Chromeの場所は `CHROME_PATH` で指定できます。ポート3206を使います。

実店内集計・選定履歴のDB保存・通常の端末再生・Insight表示への接続は未実装です。暫定条件と入出力は[Ads仕様書](docs/specs/ads-spec.md)を参照してください。
