# Ads UI（#197）通常保守の操作・レスポンシブ確認

320/390/768/1280pxで募集検索・店舗・素材・申請・成果・ログインの表示、検索条件、ナビ、テーブルスクロール、操作領域、エラーの案内を確認する。オレンジと既存の構成を保ち、再現できた問題だけ直す。

使い捨てのAuth/DBテスト用バックエンドで実画面を操作し、共有データを変更しない。実機Safari/Chrome・端末のタッチ・縦横切替は別途であり、画面幅の確認で代替しない。カメラ・Vercel公開は使わない。

## 再現した問題と修正

- 素材詳細のSignageプレビューが320px幅で35pxはみ出し、ページ全体が355pxになった。親と画像枠を画面内の最大幅へ制限した。比率やcontain表示は維持。
- 一部の共通ボタン/入力が42px、ログアウトが34〜40pxだった。Ads内で44px以上へそろえ、ラジオ/チェックのラベルにも押せる領域を確保。
- 既存操作テストは1版1画像を前提としていた。App/Signageを別々に選び、両プレビューの検証完了を待つよう更新。製品に入力がない不具合ではなかった。

オレンジ・画面構成・認証/DB仕様は維持。Signageのスタイルは対象外。

## 確認結果

- 16画面×320/390/768/1280pxの64通りで、ページ横はみ出しなし、対象入力・ボタン・選択肢ラベル44px以上、文字切れ・ブラウザエラーなし。
- 対象：ログイン、ホーム、募集一覧/詳細、店舗一覧/詳細、素材一覧/登録/詳細、申請一覧/詳細/新規、店舗募集一覧/新規/編集、成果。
- 正式migration/RLSのPGliteとAuth/HTTPテスト用接続で、募集・素材・申請・店舗切替40項目、成果の条件切替・権限・失敗時表示14項目成功。
- 型・lint・本番ビルド成功。共有データ書込・カメラ・Vercel公開なし。
- AIによる実装/検証。人間の見た目確認、実機Safari/Chrome・物理タッチ・端末回転は未確認。#197全体を自動で閉じない。

## 画像（架空データだけ）

- [320px 修正前](../images/ads-ui197-creative-320-before.png) / [修正後](../images/ads-ui197-creative-320.png)
- [320px ログイン](../images/ads-ui197-login-320.png)
- [390px 媒体別登録](../images/ads-ui197-new-creative-390.png)
- [768px 募集作成](../images/ads-ui197-store-form-768.png)
- [1280px 申請一覧](../images/ads-ui197-applications-1280.png)
- [390px 成果](../images/ads-ui197-results-390.png)

既存テストが出力した他の画像はこのPRへ含めず、作業用に保持する。

    cd kago-os/kago-ads
    pnpm test:responsive:e2e
    KAGO_E2E_SKIP_BUILD=1 pnpm test:portal:e2e
    pnpm test:results:e2e

responsive/portalは同じads-fixture.invalidの本番ビルドを使える。resultsは別の設定で本番ビルドするため、違う設定のビルドをskipして使わない。結果は/tmp/kago197-responsive.json。実サービスのアカウント・キー・署名URLは不要。
