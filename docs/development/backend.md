# 共通の認証・DB接続（COM-02）

対象：[Issue #4](https://github.com/jphacks/hs_2604/issues/4)。作業フェーズはhackday。

## 接続の方針

2026-10-24にSupabase AuthとPostgreSQLを採用しました。各サービスは同じSupabaseプロジェクトを参照し、共通ライブラリを`kago-os/shared/backend/`に置きます。CoreにはDB定義を置き、業務用HTTP APIを追加しません。

ブラウザ・表示端末・通常のサーバー処理は公開用のpublishable keyと本人のセッションで接続します。secret key・service_role keyは通常の接続に使用せず、公開用変数に設定しません。

消費者・店舗担当者・メーカー担当者はSupabase Authの利用者、Signageは端末専用のAuth利用者として識別します。役割は管理者だけが変更できる`app_metadata`から取得します。店舗・メーカーへの所属とDBの行権限はDB-02・DB-04・DB-06で定義します。

## 実装・検証の状態

接続処理・Next.jsのCookie連携・再現手順を実装中です。実Supabaseプロジェクトでの接続確認は未実施です。ログイン画面への接続はAPP-01、DBの行権限はDB-06、画像保存はCOM-03で対応します。
