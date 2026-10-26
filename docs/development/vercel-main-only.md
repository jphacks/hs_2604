# Vercelはmainの更新時に自動公開する

通常の確認はローカルで行い、Git連携による自動デプロイはmainだけ許可する。各vercel.jsonのgit.deploymentEnabledは、全ブランチを **: false とし、main: true を明示する。Vercelは一致するルールにtrueがあれば公開するためmainだけが対象になる。

スラッシュを含むfeature/fooやfix/243-insight-demo-returnも停止するため、単一階層の * ではなく ** を使う。リポジトリ、kago-os、およびApp・Ads・Insight・LPに同じ設定を置き、Vercel ProjectのRoot Directoryの違いに対応する。ビルドコマンドや環境変数は変更しない。

公式仕様：https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled

確認：公式スキーマにgit設定があることと設定形式を照合。実際のminimatchでmainのみtrue、feature/foo・fix/243-insight-demo-return・docs/241-shared-ads-signage・chore/244-vercel-main-only・developがfalseになることを確認した。自動公開の制御であり、手動CLIのデプロイを禁止する設定ではない。
