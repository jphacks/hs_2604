# 広告画像の保存と取得（COM-03 / DB-06）

2026-10-24・hackday。[COM-03 #5](https://github.com/jphacks/hs_2604/issues/5)、[DB-06 #13](https://github.com/jphacks/hs_2604/issues/13)。実装は[PR #80](https://github.com/jphacks/hs_2604/pull/80)でレビューします。共有Supabaseへの適用と実StorageのHTTP確認はまだ行っていません。

## 保存先と版

Supabase Storageのprivate bucket `ad-images`を使います。上限5MiB、MIMEは`image/png`・`image/jpeg`・`image/webp`です。SVGや動画はこの保存先に入れません。この形式・上限はCOM-03の初期設定で、表示サイズ・縦横比はADS-05と各画面で調整します。

パスは`{maker_id}/{creative_id}/{新しい画像UUID}.{png|jpg|webp}`です。`creative_versions.image_path`にはこの相対パスだけを保存します。URL・期限付きURL・トークンをDBに保存しません。画像を差し替える場合は別パスへアップロードし、新しい素材の版を作ります。

`@kago/backend`の`uploadAdImage(client, makerId, creativeId, file)`がパスを生成します。`client`にはメーカー本人の認証済みクライアントを渡します。管理キーは使いません。DBの所属・素材所有者をStorageのポリシーでも確認するため、画面でmakerIdを変えても他社の保存先へ登録できません。

アップロードは`upsert:false`です。UPDATE・DELETEの許可ポリシーを設けず、自社分も含め一般のAPI利用者による上書き・移動・削除を許可しません。版の登録に失敗した未参照画像は、DATA-02等の管理者用手順で扱います。

## 閲覧範囲

| 役割 | 取得できる画像 |
| --- | --- |
| メーカー担当 | 自社の素材。版の保存前のアップロードもプレビュー可能 |
| 店舗担当 | 自店へ申請された素材の版。未申請の新版や他店だけへの申請は対象外 |
| customer | activeな配信対象で参照される素材の版 |
| Signage | DB-06の端末・店舗・Authの紐付けに一致する、自店のactiveな配信素材 |
| 未ログイン | 取得不可 |

登録画像の読取はDB-06の`kago_creative_version_visible`と同じ範囲を使います。広告の実際の掲載可否・期間・媒体の判断は配信候補の取得側でも行います。

`getAdImageUrl(client, imagePath)`は、本人の権限を使って5分有効の署名付きURLを発行します。Ads・InsightではそのURLをプレビュー画像へ渡し、期限切れ時に再取得します。発行済みURLは所持者が期限内に取得できるため、ログや公開資料に残さず、ログアウト時は画面・保持データから消します。停止やログアウトの直後に既発行URLまで無効になる保証はなく、最大5分残ります。Signageの通信断用キャッシュはSIG-03の期限・停止方針と合わせて扱います。

## 形式の検証

共通の`validateAdImage`は空ファイル・容量超過・許可外MIME・先頭バイトとMIMEの不一致を拒否します。PNG/JPEG/WebPのシグネチャ確認であり、完全な画像デコードやウイルス検査ではありません。StorageのHTTPサービス側でもbucketのMIMEと容量制限が適用されますが、MIMEの申告だけを画像内容の完全な検証とは扱いません。カスタムHTTPクライアントは共通クライアントの先頭バイト検査を迂回できるため、表示前に画像として読めることも確認してください。

## 適用・確認

マージ後、管理者が`20261024120000_ad_image_storage.sql`を適用履歴と照合して1回だけ適用します。既存`ad-images` bucketの設定が違う場合は途中で失敗させ、黙って変更しません。他のbucket・ポリシーには触れません。既存の汎用Storageポリシーが別途ある環境では、同bucketに広い許可を与えていないことも確認します。

ローカル・使い捨てDBの`supabase/tests/com03.sql`は2メーカー・2店舗・2端末の固定データで、他社登録の拒否、所有者とパスの一致、上書き・削除・upsertの拒否、審査中の店舗プレビュー、承認前後・停止後のcustomer/端末の可視性を検査します。全テストデータはrollbackします。実利用データのある共有DBでは実行しません。

共通クライアントは`kago-os/shared/backend/`で次を実行します。

```sh
node --experimental-strip-types --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

確認記録：Node 22.15.0で既存26件と画像5件の計31件・型検査が成功。PostgreSQL 16.11で正式な全migrationとStorage表の最小模擬定義を使い、DB-02〜09とCOM-03のSQLを各2回実行して成功しました。Authの署名検証・Storage HTTPの容量/MIME判定・実ファイルの取得を確認した結果ではありません。

実環境では、正常画像の登録→版の保存→Ads/Insightプレビュー、他社アクセス・上書き・不正MIME・5MiB超過の拒否、未承認素材の配信取得拒否、承認後の取得、停止後の新規URL発行拒否を確認し、Issueへ記録してください。これらが済むまでCOM-03とDB-06を完了扱いにしません。
