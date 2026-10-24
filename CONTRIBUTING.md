# KAGO/OS GitHub運用ルール【決定版】

更新日：2026-10-24

対象：KAGO/OSの開発メンバー・AIエージェント

GitHubで管理するコード・設定・ドキュメントの変更には、本書の手順を適用します。AIエージェントは作業前に本書を読み、人間と同じフローを守ります。旧「Git開発フロー」「GitHub・AI開発ワークフロー」は本書へ統合しました。

OneDrive内だけで完結する資料整理や相談は、このGit操作フローの対象外です。資料からサービスの変更が必要になった場合は、Issueを確認・作成してから実装します。

## 1. 必須の開発フロー

```text
Issue確認・担当者設定 → main最新化 → 作業ブランチ作成
→ 最初の変更をコミット・Push → Draft PR作成
→ 実装・検証を続ける → Ready for review・レビュー依頼
→ レビュー対応 → 別のメンバーのApproveを1件以上取得
→ Squash and merge → main最新化・結果確認
```

**mainへの直接コミット・直接Push、Issueなしの実装、強制Push、承認なしのマージは禁止です。** 緊急修正もIssue・PR・レビューを省略しません。

## 2. Issueを確認する

実装前に関連Issueを検索し、なければ作成します。同じ目的のIssueがある場合は重複させず、範囲と完了条件を確認します。

- Assigneeに実際の担当者を設定する。AIを使う場合も、人間の担当者が責任を持つ。
- 背景、対応範囲、完了条件、確認方法を記載する。
- 作業フェーズ（`prehack` / `hackday` / 未定）、対象領域、優先度を記載する。フェーズ未定の場合は着手前に確定する。
- 機能追加・改善、不具合、調査・その他の作業から該当するIssueテンプレートを選ぶ。テンプレートが未公開なら同じ項目を本文へ記載する。
- 優先度はP0＝作業を止める問題・至急対応、P1＝通常、P2＝後回し可。対象領域や優先度の本文記載は、GitHubのラベルやProjectへの自動反映を意味しない。

ラベルはリポジトリに存在するものを使います。GitHub Projectはチームで導入した場合に利用し、未導入のProjectや独自ラベルを作業開始の必須条件にしません。

## 3. mainを最新化し、ブランチを作る

最初に作業場所と差分を確認します。

```bash
cd hs_2604
git status --short --branch
```

未コミットの変更がある場合は、内容と持ち主を確認して保持します。無断の破棄、退避、他のIssueへの混入はしません。作業ツリーを安全に切り替えられる状態にしてから進めます。

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/12-barcode-scan
```

`pull --ff-only`が失敗した場合は、ローカルとリモートの差分を確認します。強制リセットで解決しません。

ブランチ名は `種別/Issue番号-短い英語の説明` とします。例の`12`は実際のIssue番号へ置き換えます。

| 種別 | 用途 | 例 |
| --- | --- | --- |
| `feature` | 新機能・改善 | `feature/12-barcode-scan` |
| `fix` | 不具合修正 | `fix/13-cart-total` |
| `docs` | ドキュメント | `docs/14-setup-guide` |
| `refactor` | 動作を変えない整理 | `refactor/15-scan-service` |
| `experiment` | 仮説検証・実験 | `experiment/16-recommend-timing` |
| `chore` | 設定・依存関係・開発環境 | `chore/17-issue-templates` |

原則として1つのIssueに1つの作業ブランチ・PRを対応させます。大きいIssueを分割する場合は、各PRの担当範囲を明記します。

## 4. 実装・確認・コミット

Issueの範囲で、小さな論理単位に分けて変更します。無関係な修正は別Issue・別PRにします。

確認は変更に応じて行います。アプリの動作変更は関連テスト・必要な静的検査やビルド・実際の操作、文書だけの変更は内容・リンク、IssueフォームはYAMLと項目を確認します。既存CIで必要とされるチェックも通します。未実施・失敗した確認を成功と記載してはいけません。

コミット前に差分を確認し、対象ファイルを選んで追加します。

```bash
git diff
git add <対象ファイル>
git diff --cached
git commit -m "feat(prehack): 商品スキャン機能を追加 #12"
```

### コミットメッセージ

```text
種別(作業フェーズ): 変更内容の概要 #Issue番号
```

| prefix | 用途 |
| --- | --- |
| `feat` | 新機能・改善 |
| `fix` | 不具合修正 |
| `docs` | ドキュメント |
| `refactor` | 動作を変えない整理 |
| `test` | テストの追加・修正 |
| `chore` | 設定・ビルド・依存関係など |
| `style` | 動作に影響しない書式変更 |

日本語では「商品スキャン機能を追加」のように、対象と変更が分かる自然な文にします。「動詞始まり」は必須にしません。ブランチが`experiment`でも、コミットは実際の変更内容に応じて`feat`や`chore`などを選びます。[Conventional Commitsの形式](https://www.conventionalcommits.org/en/v1.0.0/)に従い、KAGO/OSでは作業時期の記録としてscopeを利用します。

### 事前実装を区別する

- 事前実装のコミットは`(prehack)`、実際のHack Day中のコミットは`(hackday)`を付ける。
- 作業日・実態に基づいて記録する。`prehack`というフォルダ名の有無や、デプロイ日では判定しない。
- 開催後の通常保守など、両フェーズに該当しない作業はscopeを省略してよい。
- 公開済みタグ`prehack-baseline-2026-10-21`とその履歴を保持する。過去の事前実装をHack Dayの成果として付け替えない。
- 作業フェーズが変わる場合は、それまでの作業を区切り、別PRで記録する。マージが後日でも、実装時のフェーズを維持する。

1コミットは1つの論理的変更とします。Push前の未公開コミットに限り、必要なら自分の履歴を整理できます。**Push済みの履歴は書き換えず、修正コミットを追加します。** WIP整理のためのrebaseは必須にしません。最終的な履歴はマージ時にSquashで整えます。

## 5. Pushと早期Draft PR

自分の作業ブランチにだけPushします。

```bash
git push -u origin feature/12-barcode-scan
```

最初の意味のある差分をPushできた時点で、`main`向けのDraft PRを作ります。完成まで待たず、途中経過と未完了事項を共有します。Draft作成だけを目的とする空コミットは不要です。小さな変更は、Draftを作成後すぐReadyへ変更して構いません。

PRタイトルは次の形式にします。

```text
[feat] #12 商品スキャン機能を追加
```

`feat`などの種別はコミットのprefixと同じ一覧を使います。本文は以下を基本とし、該当しない任意項目は省略できます。

```markdown
## 概要
解決する問題と、変更後の動作。

## 関連Issue
Closes #12

## 作業フェーズ
prehack / hackday / 通常保守（実際の作業に合わせて1つ記載）

## 変更内容
- 主な変更点

## 確認方法・結果
- 再現できる手順、期待結果、実行結果
- 未実施の確認があれば、その内容と理由

## スクリーンショット・動画
UI変更がある場合に添付。

## AI利用・人間の確認
AIを使った作業、担当者が確認した差分・動作・判断を記載。
確認前の項目は「未確認」と記載。

## 未対応事項
残る課題があれば関連Issueを記載。
```

Issueを完了させるPRは`Closes #12`、一部のみ対応するPRは`Related to #12`とします。`Closes`による自動クローズは、対象PRが既定ブランチへマージされる場合に働きます。[GitHub公式説明](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)

## 6. レビューと修正

実装と必要な確認が終わったらReady for reviewへ変更し、作成者以外のメンバーへレビューを依頼します。Draft期間は進捗共有、Ready後は正式なレビューの段階として扱います。[DraftとReadyの公式説明](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/changing-the-stage-of-a-pull-request)

- 他の人間のメンバーによる、現在の変更に対する有効なApproveを1件以上得る。AIレビューやCI成功だけでは代替しない。
- 担当者とレビュワーは、差分と検証結果を確認する。動作変更は画面・APIなど実際の挙動も確認する。
- レビューコメントには必ず返信する。修正した場合は「対応しました」と変更箇所・確認結果を伝える。採用しない場合は理由を説明し、合意する。
- 修正は同じブランチへ追加コミット・Pushする。修正後は必要な確認を再実行し、再レビューを依頼する。
- 承認後に実質的な変更を加えた場合は、再度承認を得る。未解決の修正要求を残したままマージしない。

レビュー中に最新mainの取り込みが必要になった場合は、作業ブランチ上で以下を行います。

```bash
git fetch origin
git merge origin/main
# 競合があれば内容を確認して解決・コミットし、必要な確認を行う
git push origin feature/12-barcode-scan
```

競合の意図を判断できない場合は関係者へ確認します。強制Pushや片側の変更の無断削除で解決しません。

**レビュー待ちは正常な作業状態です。** AIエージェントはPR・検証結果・待っている相手を報告し、承認を待ちます。レビュワー不在を理由に自分で承認したり、レビュー条件を解除したりしません。

## 7. Squash and merge

以下をすべて満たしたら、チームからマージを任されたメンバーがマージします。

- Ready for reviewになっている。
- 他のメンバーのApproveが1件以上あり、必要な修正要求が解消されている。
- 必要な検証・CIが成功し、現在の差分を確認できている。
- PRの範囲とIssueの完了条件が一致している。

**マージ方式は必ずSquash and mergeを使います。** Create a merge commit、Rebase and mergeは使いません。

Squash時は最終コミットのタイトルを確認し、以下の形式へ整えます。PRタイトルの`[feat] #12 ...`をそのまま使わず、作業フェーズを最終履歴にも残します。Squashの既定メッセージは設定やコミット数に左右されるため、マージ画面で確認します。[GitHub公式説明](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests)

```text
feat(prehack): 商品スキャン機能を追加 #12
```

AIがマージを実行するのは、人間からマージまで任されていて、上記条件を満たす場合に限ります。承認・権限が不足していれば、具体的な待ち状態を報告します。

マージ後はIssueのクローズと必要なデプロイ結果を確認し、ローカルを最新にします。ブランチ削除は任意です。

```bash
git switch main
git pull --ff-only origin main
```

## 8. Vercelのデプロイ制限中の運用

Hack Day中の頻繁なPush・PR作成により、VercelのDeployment Rate Limitに到達し、Preview Deploymentを一時的に作成できない場合があります。GitHub上で以下のように表示される場合があります。

```text
Vercel — Deployment rate limited — retry in 24 hours.
This branch has not been deployed.
```

これは必ずしもアプリのビルドやコードに問題があることを意味しません。Vercelのデプロイ制限中は、Preview Deploymentを動作確認の必須条件とせず、各担当者・レビュワーがローカル環境で確認します。ただし、Vercel以外のテスト・型検査・lint・ビルドの失敗を無視してよいという意味ではありません。

### デプロイ制限中の基本方針

- 実装中の動作確認は原則ローカルで行う。
- Vercel Previewを作るためだけの不要なPush・空コミットは行わない。
- VercelのRate Limitのみが失敗している場合は、PR本文にその旨を記録する。
- 関連するローカルテスト・型検査・lint・ビルドを実行する。
- UI変更は実際にローカル画面を開いて確認する。
- 確認した担当者は、確認方法と結果をPRへ記載する。
- Vercel以外のCIやテストが失敗している場合は通常どおり修正する。
- Vercelが復旧した後、デモ・公開に使用するmainのDeploymentを改めて確認する。

### 初回のローカル環境準備

Appのローカル確認にはNode.js 22系（22.13以上23未満）とpnpm 11.19.0を使用します。リポジトリを取得した後、Appディレクトリへ移動します。

```bash
git clone https://github.com/jphacks/hs_2604.git
cd hs_2604/kago-os/kago-app
pnpm install --frozen-lockfile
```

すでにclone済みの場合、再度cloneする必要はありません。

認証・共有DBを使用するAppを確認する場合は、初回のみ以下を実行します。

```bash
cp .env.example .env.local
```

`.env.local`へ、チームで使用している共有Supabaseの以下の値を設定します。

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

接続値はGit、Issue、PR、チャット等の公開場所へ記載しません。秘密キー・`service_role`キーは通常のApp起動には使用しません。詳細は[docs/development/backend.md](docs/development/backend.md)を参照してください。

### 自分の作業ブランチをローカルで確認する

まず最新のリモート情報を取得します。

```bash
cd hs_2604
git fetch origin
git status --short --branch
```

自分の作業ブランチへ移動します。

```bash
git switch <ブランチ名>
git pull --ff-only origin <ブランチ名>
```

その後Appを起動します。

```bash
cd kago-os/kago-app
pnpm install --frozen-lockfile
pnpm dev
```

ブラウザで`http://localhost:3000/App`を開きます。LPのみ確認する場合は`http://localhost:3000/`です。

### 他のメンバーのPRをローカルで確認する

確認したいPRのブランチを取得します。

```bash
git fetch origin
```

すでにローカルにブランチがある場合：

```bash
git switch <ブランチ名>
git pull --ff-only origin <ブランチ名>
```

ローカルにまだない場合：

```bash
git switch -c <ブランチ名> --track origin/<ブランチ名>
```

その後、以下で起動し、対象機能を操作して確認します。

```bash
cd kago-os/kago-app
pnpm install --frozen-lockfile
pnpm dev
```

レビュー後は、自分の作業へ戻る前に未コミット差分がないことを確認してください。他の担当者の変更を無断で修正・破棄しません。

```bash
git status --short
```

### 最低限実行する確認

Appを変更した場合は、変更内容に応じた機能テストに加えて、原則として以下を確認します。

```bash
pnpm lint
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm build
```

機能ごとのテストが用意されている場合は、それも実行します。例：

```bash
# かご
pnpm test:cart

# 購入履歴
pnpm test:account

# セレンディピティ販促
pnpm test:offers

# セレンディピティ販促のブラウザ確認
pnpm test:offers:e2e

# 推薦
pnpm test:selection
```

すべてを毎回無条件に実行する必要はありません。変更した機能と影響範囲に応じて選択します。ただし、実行していないテストを「成功」と記載してはいけません。

### UI変更の確認

UIを変更したPRでは、テスト成功だけで完了とせず、ローカルのブラウザでも実際の画面を確認します。最低限、以下を確認します。

- 対象画面を開ける。
- 変更した操作を実際に行える。
- エラーが画面に残っていない。
- スマートフォン向け画面の場合は狭い画面幅でも崩れていない。
- DBを変更する機能の場合は、画面だけでなく保存・再読込後の状態も確認する。

必要に応じてスクリーンショットをPRへ添付します。

### Vercelが失敗しているPRの記載例

VercelのRate Limitだけが原因でPreviewを作成できない場合は、PRの「確認方法・結果」に以下のように記載します。

```markdown
## 確認方法・結果

- ローカルで対象機能を操作し、期待どおり動作することを確認
- `pnpm lint`：成功
- `pnpm exec tsc --noEmit`：成功
- `pnpm build`：成功
- 関連する機能テスト：成功
- Vercel Preview：未確認
  - `Deployment rate limited — retry in 24 hours` のためDeploymentを作成できない
  - コード・ビルドの失敗としては扱わず、Vercel復旧後に公開環境を確認する
```

### マージ時の扱い

VercelのRate Limitだけが失敗している場合は、以下をすべて満たしたうえでレビュー・マージ判断を行います。

- Vercel以外の必要なチェックに問題がない。
- ローカルビルドが成功している。
- 変更した機能を担当者がローカルで確認している。
- 確認方法と結果がPRに記録されている。
- 別の人間のメンバーによるApproveを取得している。
- Vercelが未確認であることをPRに明記している。

Rate Limit以外の理由でVercelが失敗している場合は、この例外を適用しません。また、最終的にデモ・発表で使用するmainについては、Vercelの制限解除後に公開環境で改めて動作確認します。

## 9. AIエージェントの作業原則

- 作業前にIssue、Assignee、対象ブランチ、未コミット差分を確認する。
- Issueの範囲の実装・検証・コミット・Push・PR作成を進め、レビュー待ちを人間へ伝える。
- 他の人の作業、公開履歴、基準タグを無断で変更・削除しない。
- APIキー、`.env`の値、個人情報、非公開の内部資料を公開リポジトリやIssue・PRへ掲載しない。内部資料はOneDrive側で管理する。
- 確認していない項目や人間の承認を、完了したことにしない。結果と未確認事項を分けて報告する。

## 10. GitHub設定で補助すること

以下はチームで設定を確認・整備する項目です。本書を保存しただけではGitHubの設定は変わりません。

- mainへの変更をPR経由に限定し、他のメンバーによるApproveを1件以上必須にする。
- レビュー会話の解決、必要なCIチェック、変更後の再承認をルールで要求する。
- mainの強制Push・削除を許可せず、管理者も含めてルールの迂回を制限する。
- PRのマージ方式はSquashだけを有効にする。

設定はリポジトリの権限・プランで利用できる範囲を確認します。設定による強制ができない項目も、本書のチームルールを守ります。

## 11. 提案と既存ルールの比較・採用理由

**今回提示された案を基本として採用し、既存ルールのKAGO/OS固有の記録方法を統合しました。**

| 論点 | 決定 |
| --- | --- |
| Issue・担当者・ブランチ | 提案の必須フローを採用。切り替え前に既存差分を確認し、mainは`--ff-only`で更新 |
| Draft PR | 早期作成を採用。最初の意味のあるコミット後に作り、Ready後に正式なレビュー依頼 |
| レビュー・マージ | 他のメンバーのApproveを1件以上必須、Squashに統一 |
| WIP整理と強制Push禁止 | rebase必須を外し、Push後は追加コミット。最終整理はSquashで行う |
| 事前実装の証跡 | 既存の`prehack` / `hackday`と公開済み基準タグを維持。Squash後にもフェーズを残す |
| 日本語のコミット | 動詞始まりを必須にせず、対象と変更が分かる表現にする |
| AIによる作業 | 担当者の確認と別メンバーの承認を維持。AIの自己申告を承認とみなさない |
| ラベル・Project・検証 | 未導入の仕組みを前提にせず、存在する設定と変更内容に応じて運用 |

## 12. 最終チェック

- [ ] 作業前：Issue・Assignee・完了条件・フェーズを確認した。
- [ ] 作業前：既存差分を保持し、最新mainからIssue番号付きブランチを作った。
- [ ] 共有時：自分のブランチにPushし、早期Draft PRを作った。
- [ ] レビュー前：必要な確認と結果を記載し、Readyへ変更してレビュワーを設定した。
- [ ] マージ前：別メンバーのApproveがあり、修正要求と必要なチェックが解決している。
- [ ] マージ時：Squashを選び、最終コミットに種別・実際の作業フェーズ・Issue番号を残した。
- [ ] マージ後：Issue・必要なデプロイ結果・最新mainを確認した。

本書（ルートの`CONTRIBUTING.md`）を、このリポジトリのGitHub運用ルールの正本とします。Issue案は[Issue一覧](docs/issues/issues.md)を参照してください。資料内の管理IDとGitHubのIssue番号は異なります。
