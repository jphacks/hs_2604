# INS-08：商品別の販売推移を取得する

対象：[Core #84](https://github.com/jphacks/hs_2604/issues/84)、[INS-08 #83](https://github.com/jphacks/hs_2604/issues/83)。2026-10-24・hackday、P2。

## RPCの契約

```sql
kago_product_sales(
  p_start timestamptz,
  p_end timestamptz,
  p_store_id uuid,
  p_product_ids uuid[] default null,
  p_bucket text default 'day'
) returns table (
  store_id uuid,
  product_id uuid,
  bucket_start timestamptz,
  data_origin text,
  orders bigint,
  quantity numeric,
  amount numeric
)
```

`orders`と`order_items`だけを使います。提案・スキャン・広告・Signageのイベントがない注文も含みます。現在の商品名、店舗別価格、取扱停止は過去の集計を変えません。数量と税込金額は明細の`quantity`と購入時の`unit_price`から計算します。

| 引数 | 契約 |
| --- | --- |
| `p_start`, `p_end` | オフセット付きの有限時刻。開始を含み終了を含まない。NULL・同時刻・逆転・infinityは`22023` |
| `p_store_id` | 必須。呼出者が所属する1店舗。NULL・他店・不明な店舗は`42501`。全店舗指定はない |
| `p_product_ids` | NULLで全商品、空配列で対象なし。重複IDでも二重計上しない。不明な商品は行なし。NULL要素・多次元配列は`22023` |
| `p_bucket` | `day`または`hour`。省略時は`day`。NULL・その他は`22023` |

本人の`app_metadata.kago.roles`に`store_staff`があり、`store_members`にも所属が必要です。メーカー・customer・端末・未ログイン・所属のない店舗担当は取得できません。APIロール`authenticated`へのEXECUTE許可だけでは取得できません。認可を先に確認するため、権限がない場合は不正な期間でも`42501`です。

1行は店舗×商品×時間区間×`data_origin`です。`operated`・`seeded`・`synthetic`を別行で返します。実操作の推移を表示する場合、画面で`operated`だけを使ってください。由来を合算して実績と表示しません。個人・来店・注文・イベントのIDは返しません。

## 時刻と販売なし

`bucket_start`は[PostgreSQLのタイムゾーン指定付きdate_trunc](https://www.postgresql.org/docs/16/functions-datetime.html#FUNCTIONS-DATETIME-TRUNC)で`Asia/Tokyo`の日／時間の先頭へ切った`timestamptz`です。接続セッションのタイムゾーンは集計区切りに影響しません。JSONではUTCの`Z`表記で返る場合も、同じ瞬間です。表示はJSTへ変換してください。

開始・終了を日／時間の先頭へ丸めることはしません。たとえば10:30〜11:15なら、10時の行は10:30以降、11時の行は11:15未満の注文だけを数えます。最初の`bucket_start`が`p_start`より前でも正常です。

**その商品・区間に注文明細がなければ行を返しません。** ゼロの行を自動生成しません。返却データが空配列だった画面は、後述の記録範囲が確認できる場合に「販売なし」と表示できます。数量があり金額0円の明細は、販売の行として返します。

`orders`は行ごとのdistinct注文件数です。同じ注文に商品AとBが入れば両方の行で1件ずつ数えるので、複数商品の`orders`を足して店舗全体の注文件数にしないでください。数量・金額は対象明細の合計です。店舗全体のdistinct注文件数が必要なら既存`kago_order_totals`を使用します。

## 画面からの呼出例

同じ店舗担当の本人セッションで呼びます。商品IDは対象の販促版から画面側で解決します。通信失敗・権限エラーを販売0件に置き換えません。

```ts
const { data, error } = await supabase.rpc("kago_product_sales", {
  p_start: startsAt, // 例：2026-10-23T00:00:00+09:00
  p_end: endsAt,     // 例：2026-10-24T00:00:00+09:00
  p_store_id: storeId,
  p_product_ids: productIds,
  p_bucket: "day",  // または hour
});
if (error) throw error;
const operatedRows = (data ?? []).filter(row => row.data_origin === "operated");
```

比較期間は同じ関数を再度呼びます。実施期間を`[a,b)`としたとき、直前の同じ長さの期間は`[a-(b-a),a)`です。各引数は実際の日時から計算し、両期間・同じ商品集合・同じ由来・同じ区切りを画面に明示します。

## 記録開始時刻と比較可否

**現在のDBから「この時刻以降の販売を漏れなく記録している」と保証できる時刻は取得できません。** 最初の注文日時は最初に観測した販売であり、収集開始・無欠落の証明ではありません。店舗の作成時刻、migration適用時刻、`min(ordered_at)`も代用できません。

そのため空の結果だけで「本当に販売0件」か「記録がない」かは区別できません。管理者等が確認した記録範囲が別途なければ、INS-08では販売の観測値を表示しつつ、前後の増減は「比較できません（記録範囲が未確認）」としてください。比較範囲の一部しか確認できない場合も0%や0件に置き換えません。

記録範囲を保証する設定・収集監視・履歴テーブルの追加は今回含めません。将来導入する場合は、店舗・由来・必要なら商品別の範囲と欠落を管理する別仕様にします。比較元が0件で記録範囲を確認できる場合でも、増加率の分母が0なので率は計算せず、件数差などを表示します。

## 適用・検証

追加migrationは`20261024130000_product_sales.sql`です。レビュー・マージ後、既存の適用履歴と照合して適用します。共有Supabaseへの適用、実JWT、Insight画面の動作確認は未実施です。

現mainには`20261024110000_app_cart.sql`と`20261024110000_checkout_price_lock.sql`のversion重複があります。既存ファイルの適用状況・履歴を照合して解決するまで、CLIで一括適用しないでください。本機能のSQLは別番号です。ローカル検証ではファイル名順に両方を適用していますが、CLIのversion管理が解決した意味ではありません。

`supabase/tests/product_sales.sql`を破棄可能なDBへ実行します。固定データは2店舗・複数商品・3つの由来、注文ごとの異なる単価・無料明細・JSTの日／時間境界を含み、イベント・再生を作りません。全データはrollbackします。実利用データのある共有DBでは実行しません。

確認記録（2026-10-24）：PGlite 0.5.11とPostgreSQL 16.11で専用41項目を各2回実行して成功しました。DB-02〜09・COM-03の既存SQLも両環境で各2回成功。Auth/Storageの最小定義は模擬しており、実Supabaseの署名・HTTP・Insight画面を確認した結果ではありません。
