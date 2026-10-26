# 共通依存の監査指摘を解消（#222）

2026-10-26。Ads・Signageの再点検で見つかった開発依存と、3サービスのNext.jsを更新した。

| 対象 | 変更 |
| --- | --- |
| App・Ads・InsightのNext.js / eslint-config-next | 16.3.8 → 16.4.3 |
| Ads・SignageのVitest | 3.2.7 → 4.1.12 |
| ESLint経由のZod | 4.6.5 → 4.6.6 |

Zodは直接依存ではない。workspaceのoverrideを4.0.0以上4.6.6未満に限定し、次の系列の解決を妨げない。新しい直接依存は増やしていない。アプリの仕様、認可、共通DBは変更しない。

## 検証

- pnpm audit：指摘0件。
- 共通SDK：型検査と32テスト成功。
- Ads/Signage：通常183テスト成功。別実行の3ブラウザ試験は通常実行でスキップ。
- App：tests/*.test.ts、tests/*.test.mtsの209テスト成功。
- App・Ads・Insight：本番ビルド・型・lint成功。
- 本番ブラウザ93項目：メーカーと端末の同時ログイン7、Insightの自店限定履歴7、固定成果の完全通信断・ファイル保存24、Ads入口・メーカー/店舗・ログアウト44、Signageの同一URL更新・サーバー停止後の再読込11。
- ブラウザのAuthはfixture、DBは正式migrationのPGlite。共有DBの書込・カメラ撮影は行っていない。

通常試験はpnpm --filter kago-ads test、共通SDKはpnpm --filter @kago/backend test。Appの通常試験はkago-app内で node --experimental-strip-types --test --test-concurrency=2 tests/*.test.ts tests/*.test.mts。ブラウザ再現コマンドは各機能の検証ドキュメントを参照する。

## 参照

- [Next.js画像API](https://github.com/advisories/GHSA-2464-fhr4-w9xw)
- [Next.js Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)
- [Next.js use cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr)
- [Zodの検証時のメモリ消費](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [Vitest/mockerのファイル読取](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
- [tinypoolのworker options](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)
- [tinypoolのrun options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)

今回の監査結果は、攻撃や認証情報流出の発生を確認したという意味ではない。CLI試験の運用は維持し、公開テストサーバーを新設していない。
