# 共通の架空データ（DATA-01）

2026-10-24・hackday。[Issue #45](https://github.com/jphacks/hs_2604/issues/45)。内容は[共通仕様書11章](../specs/common-spec.md)の架空例と、Adsの下書き`kago-ads/src/data/demo/seed.ts`（基準日を2026-10-24に固定）に合わせています。

| ファイル | 用途 |
| --- | --- |
| `kago-os/kago-core/supabase/seed/data01_demo.sql` | DBへの投入。全migrationの後にOwner権限で1ファイルを実行 |
| `kago-os/kago-core/supabase/seed/data01_responses.json` | DB接続前の仮応答。各アカウントがDB-06の権限で読める行（PostgRESTの`select *`と同じJSON） |
| `kago-os/kago-app/tests/demo-data.test.mts` | 使い捨てPGliteへ投入し、仮応答・既存のApp/Ads架空データとの一致、権限、再実行を検査 |

すべて架空です。実在の企業・顧客・購買ではありません。過去の来店・操作・注文は`data_origin = 'seeded'`で、今回のデモで行う購入（`operated`）やDATA-03の代替注文とは別に集計されます。

## 含まれるデータ

固定UUIDは`0da7a0TT-0000-4000-8000-0000000000NN`です（TT＝種類、NN＝番号）。

| TT | 種類 | 内容 |
| --- | --- | --- |
| 01 | 店舗 | 01 S1 広島デモ店（`hiroshima-demo-store`）、02 S2 広島デモ店 駅前店（`hiroshima-station-demo-store`） |
| 02 | 商品 | 01〜22。App既存の15商品＋P-SAUCE（16、`2900000000162`）＋PLU 6商品。Adsの`products.csv`と同じ順 |
| — | 店舗別価格 | 両店で22商品を販売。P-SAUCEだけS1 298円・S2 278円 |
| 03 | メーカー | 01 M1 瀬戸内トマト食品、02 M2 確認用メーカー（どちらも`is_fictional = true`） |
| 04 | Signage端末 | 01 D1 S1入口、02 D2 S1パスタ・調味料の棚、03 D3 S2入口 |
| 05 | 広告募集 | 01 C1 パスタ関連（S1、公開中、全指標公開）、02 C2 惣菜・パン（S1、Signage）、03 C3 日用品（S2、期限切れ）、04 C4 Appおすすめ枠（S2）、05 C5 下書き（S1）、06 C6 終了（S2） |
| 06・07 | 素材・版 | 素材01 CR1（M1、P-SAUCE）：版01＝第1版、版02＝第2版。素材02 CR2（M2、プレーンヨーグルト）：版03＝第1版 |
| 08 | 掲載申請 | 01 A1：第1版を却下→第2版で再申請→承認、02 A2：C2へ審査待ち、03 A3：M2からS2のC4へ審査待ち（店舗・メーカーの隔離確認用） |
| 09 | 配信対象 | 01 PL1：A1第2版、App・Signage、2026-10-23〜12-01 JST |
| 0a・0b | 店舗販促・版 | 01 SP1：P-CROQ、16〜19時、App・Signage、「店内で揚げたてです」。02 SP2：塩パン、終日、Signage |
| 0c〜0f | 履歴 | U1の来店・注文・購入要求ID・操作イベント。Appの`customer.json`（order-demo-001〜011）と同じ日時・商品・単価。11注文・37明細・74イベント・9,430円 |
| 10 | 審査記録 | 01 A1の却下、02 A1の承認 |

来店中の選定・表示、Signageの再生・推定視認、実験は含みません。これらは各画面の操作で作ります。成果画面の固定表示はDATA-04、リセットはDATA-02です。

## 投入手順

1. 架空アカウント9件をSupabaseのAuthentication → Users → Add userで作成します。メール確認済みとし、パスワードは各自のパスワード管理ツールで管理します。Git・Issue・PRに書きません。

   | 略号 | メール | 役割・所属 |
   | --- | --- | --- |
   | U1 | `misaki.sato@example.test` | 消費者 佐藤 美咲。履歴利用ON、過去注文あり |
   | U2 | `ken.tanaka@example.test` | 消費者 田中 健。履歴利用OFF、履歴なし |
   | T1 | `staff.hiroshima-demo-store@example.test` | S1の店舗担当 |
   | T2 | `staff.hiroshima-station-demo-store@example.test` | S2の店舗担当 |
   | W1 | `staff.setouchi-tomato-foods@example.test` | M1のメーカー担当 |
   | W2 | `staff.check-maker@example.test` | M2のメーカー担当 |
   | DV1〜3 | `signage.hiroshima-demo-entrance@example.test`・`signage.hiroshima-demo-pasta-shelf@example.test`・`signage.hiroshima-station-entrance@example.test` | D1〜D3の端末 |

2. 全migrationを適用済みであることを確認し、SQL Editor（Owner）で`data01_demo.sql`の内容を実行します。psqlなら`kago-os/kago-core/`で`psql -X -v ON_ERROR_STOP=1 -f supabase/seed/data01_demo.sql`です。
3. 最後の結果が`DATA-01 seeded`、店舗2・商品22・募集6・申請2・注文11であることを確認します。
4. 各アカウントでログインし直します。投入で`app_metadata.kago`を設定するため、以前のセッションには役割が入っていません。

SQLは1トランザクションです。途中で失敗した場合は何も残りません。

- アカウントが足りない場合は、足りないメールを表示して止まります。
- `app_metadata.kago`が既に別の値のアカウントは、上書きせずに止まります。端末の`device_id`・`store_id`は上表の固定UUIDを設定します。
- 再実行では不足分だけを追加し、既存行を上書きしません。デモ中に変更した価格・状態は戻りません（DATA-02）。
- 固定UUIDが別の内容（slug・商品コード・審査結果など）で使われている場合は止まります。店舗slugなどの一意制約に当たる場合も同様です。
- 申請は募集の受付期間中しか登録できないため、初回の投入はC1の終了（2026-12-01 JST）前に行います。

広告画像のファイルは投入しません。`image_path`はCOM-03の形式（メーカーUUID/素材UUID/画像UUID.png）で、W1でログインして同じパスへ`kago-ads/public/ad-assets/CR1_v1_app.png`・`CR1_v2_app.png`をアップロードすると表示できます。

## 店舗・メーカーの隔離を確認する（INS-06・DB-06）

2店舗・2メーカーがそれぞれ自分の申請を持つため、片方から見えないことを空の結果ではなく実データで確認できます。

| アカウント | 見える申請 | 審査・更新 |
| --- | --- | --- |
| T1（S1） | A1・A2 | A3の承認・却下は`42501`で拒否 |
| T2（S2） | A3 | A1・A2の承認・却下は`42501`で拒否 |
| W1（M1） | A1・A2 | A3の更新は0行（RLSで見えない） |
| W2（M2） | A3 | A1・A2の更新は0行 |

店舗の権限は`app_metadata.kago.roles`の`store_staff`と`store_members`の行の両方で決まります。ロールだけで所属がないアカウントは、エラーではなく0件になります。投入SQLはT1→S1、T2→S2の`store_members`も作ります。

## 仮応答の使い方

`data01_responses.json`の`responses.<略号>.<テーブル>`が、そのアカウントでのDBの応答です。例えば`responses.U1.orders`はU1の注文履歴、`responses.T2.ad_applications`は空配列（S2宛の申請がない）です。

- `user_id`・`reviewed_by`などのアカウントUUIDは`0da7a0aa-…`の仮値です。実環境ではAuthの値になるため、メールで対応付けてください。
- `volatile`に挙げた列（更新・審査・受信時刻など）はDBの時計で決まるため固定値に置き換えています。
- 時刻はSupabaseと同じUTC表記です。

seedやmigrationで読める行が変わったら、`kago-os/kago-app/`で次を実行してJSONを作り直します。

```sh
pnpm generate:demo-responses
pnpm test:demo-data
```

## 確認記録

2026-10-24：Node.js 24.18.1・PGlite 0.5.11で、最新mainの全migrationとAuth/Storageの最小模擬定義に投入し、`pnpm test:demo-data`の8項目が成功しました。2回目の投入で行も応答も変わらないこと、仮応答JSONとの完全一致、App・Adsの商品と履歴との一致、9アカウントの読取範囲、他店舗の申請の審査・他社の申請の更新ができないこと、A1の審査履歴、Appの商品一覧関数での店舗別価格、アカウント不足・役割の不一致での停止を確認しています。

実PostgreSQL・共有Supabaseへの投入、実Authのログイン、画像のアップロード、各画面での表示は未確認です。
