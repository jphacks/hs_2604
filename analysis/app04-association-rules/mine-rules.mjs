// APP-04: derive "bought together" rules from the public Groceries baskets and map them to demo products.
// Usage: node mine-rules.mjs [raw/baskets.txt]
// Output (deterministic, committed):
//   ../../kago-os/kago-app/src/features/recommendations/association-rules.json  (rules used by the App)
//   ./evaluation.md                                                            (adoption / rejection / holdout results)
import { readFile, writeFile } from "node:fs/promises";
import { SOURCE } from "./fetch-groceries.mjs";

export const RULESET_VERSION = 1;
export const PARAMS = {
  // Every 5th transaction (index % 5 === 4) is held out for evaluation; the rest is used for mining.
  holdoutEvery: 5,
  minTrainCount: 10, // co-occurrences in the training baskets
  minTrainLift: 1.2,
  minTestCount: 3, // the pair must also appear in the held-out baskets
  minTestLift: 1.0, // and still be positively associated there
  maxRulesPerProduct: 4, // per ranking (confidence / lift); the union is kept
};

const round = (value, digits = 4) => Number(value.toFixed(digits));
// The first word, plus the second when the first is a Latin-letter brand ("KAGO 緑茶 500ml" → "KAGO 緑茶").
// Same rule as kago-os/kago-app/src/lib/product-name.ts (#137).
export function shortProductName(name) {
  const words = name.trim().split(/\s+/);
  return words.slice(0, /^[A-Za-z][A-Za-z0-9&.'-]*$/.test(words[0]) && words.length > 1 ? 2 : 1).join(" ");
}

export function parseBaskets(text) {
  return text.split(/\r?\n/).filter(line => line.length > 0)
    .map(line => [...new Set(line.split("|").map(item => item.trim()).filter(Boolean))]);
}

function count(baskets) {
  const single = new Map(); const pair = new Map();
  for (const basket of baskets) {
    for (const a of basket) {
      single.set(a, (single.get(a) ?? 0) + 1);
      for (const b of basket) if (a !== b) pair.set(`${a}\u0000${b}`, (pair.get(`${a}\u0000${b}`) ?? 0) + 1);
    }
  }
  return { n: baskets.length, single, pair };
}
function stats(counts, a, b) {
  const both = counts.pair.get(`${a}\u0000${b}`) ?? 0;
  const na = counts.single.get(a) ?? 0; const nb = counts.single.get(b) ?? 0;
  const confidence = na ? both / na : 0;
  const lift = nb ? confidence / (nb / counts.n) : 0;
  return { count: both, support: counts.n ? both / counts.n : 0, confidence, lift };
}

export function mine(baskets, productMap, params = PARAMS) {
  const train = baskets.filter((_, i) => i % params.holdoutEvery !== params.holdoutEvery - 1);
  const test = baskets.filter((_, i) => i % params.holdoutEvery === params.holdoutEvery - 1);
  const trainCounts = count(train); const testCounts = count(test);
  const items = [...new Set(productMap.map(p => p.groceriesItem))].sort();
  const categoryRules = []; const rejected = [];
  for (const a of items) for (const b of items) {
    if (a === b) continue;
    const tr = stats(trainCounts, a, b); const te = stats(testCounts, a, b);
    const row = { from: a, to: b, train: tr, test: te };
    let reason = null;
    if (tr.count < params.minTrainCount) reason = "学習データでの同時購入が少ない";
    else if (tr.lift < params.minTrainLift) reason = "関連の強さ（lift）が基準未満";
    else if (te.count < params.minTestCount) reason = "評価データで同時購入をほぼ確認できない";
    else if (te.lift < params.minTestLift) reason = "評価データでは関連が再現しない";
    if (reason) { if (tr.count >= params.minTrainCount && tr.lift >= params.minTrainLift) rejected.push({ ...row, reason }); }
    else categoryRules.push(row);
  }
  categoryRules.sort((x, y) => y.train.lift - x.train.lift || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
  rejected.sort((x, y) => y.train.lift - x.train.lift || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));

  const byItem = new Map();
  for (const product of productMap) byItem.set(product.groceriesItem, [...(byItem.get(product.groceriesItem) ?? []), product]);
  // Per demo product keep the top rules by confidence (likely) and by lift (specific), so both uses stay possible.
  const candidates = new Map();
  for (const rule of categoryRules) {
    for (const from of byItem.get(rule.from) ?? []) for (const to of byItem.get(rule.to) ?? []) {
      candidates.set(from.code, [...(candidates.get(from.code) ?? []), {
        id: `grc-${from.code}-${to.code}`, origin: "analysis", from: from.code, to: to.code,
        evidence: { from: rule.from, to: rule.to },
        support: round(rule.train.support), confidence: round(rule.train.confidence), lift: round(rule.train.lift, 3),
        testLift: round(rule.test.lift, 3), reason: `${shortProductName(from.name)}と一緒に選ばれています`,
      }]);
    }
  }
  const rules = [];
  for (const code of [...candidates.keys()].sort()) {
    const list = candidates.get(code);
    const top = key => [...list].sort((a, b) => b[key] - a[key] || a.to.localeCompare(b.to)).slice(0, params.maxRulesPerProduct);
    const chosen = new Set([...top("confidence"), ...top("lift")].map(rule => rule.id));
    rules.push(...list.filter(rule => chosen.has(rule.id)).sort((a, b) => b.lift - a.lift || a.to.localeCompare(b.to)));
  }
  return { train, test, trainCounts, categoryRules, rejected, rules, evaluation: evaluate(test, categoryRules, trainCounts, items) };
}

// Leave-one-out on held-out baskets: hide one mapped item and check whether it is in the top 3
// candidates scored from the remaining items. Baseline: the 3 most frequent mapped items.
export function evaluate(test, categoryRules, trainCounts, items) {
  const known = new Set(items);
  const ruleMap = new Map();
  for (const rule of categoryRules) ruleMap.set(rule.from, [...(ruleMap.get(rule.from) ?? []), rule]);
  const popular = [...items].sort((a, b) => (trainCounts.single.get(b) ?? 0) - (trainCounts.single.get(a) ?? 0) || a.localeCompare(b));
  let cases = 0, liftHits = 0, confidenceHits = 0, popularHits = 0, covered = 0;
  const top3 = (scores) => [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([item]) => item);
  for (const basket of test) {
    const mapped = basket.filter(item => known.has(item));
    if (mapped.length < 2) continue;
    for (const hidden of mapped) {
      cases++;
      const rest = new Set(mapped.filter(item => item !== hidden));
      const byLift = new Map(); const byConfidence = new Map();
      for (const item of rest) for (const rule of ruleMap.get(item) ?? []) {
        if (rest.has(rule.to)) continue;
        byLift.set(rule.to, Math.max(byLift.get(rule.to) ?? 0, rule.train.lift));
        byConfidence.set(rule.to, Math.max(byConfidence.get(rule.to) ?? 0, rule.train.confidence));
      }
      if (byLift.size) covered++;
      if (top3(byLift).includes(hidden)) liftHits++;
      if (top3(byConfidence).includes(hidden)) confidenceHits++;
      if (popular.filter(item => !rest.has(item)).slice(0, 3).includes(hidden)) popularHits++;
    }
  }
  return { cases, coverage: cases ? round(covered / cases, 3) : 0,
    liftHitAt3: cases ? round(liftHits / cases, 3) : 0, confidenceHitAt3: cases ? round(confidenceHits / cases, 3) : 0, popularHitAt3: cases ? round(popularHits / cases, 3) : 0 };
}

function evaluationMarkdown(result, initial) {
  const pct = value => `${(value * 100).toFixed(1)}%`;
  const line = r => `| ${r.from} → ${r.to} | ${r.train.count} | ${pct(r.train.confidence)} | ${r.train.lift.toFixed(2)} | ${r.test.count} | ${r.test.lift.toFixed(2)} |`;
  return `# APP-04 関連購買ルールの評価結果

このファイルは \`node mine-rules.mjs\` が生成します。手で編集しません。

- 出典：${SOURCE.name}（commit \`${SOURCE.commit}\`、sha256 \`${SOURCE.sha256}\`）
- ルールの版：${RULESET_VERSION}
- 全${result.train.length + result.test.length}件のレシートを、通し番号で学習${result.train.length}件・評価${result.test.length}件（5件ごとに1件）へ分割
- 採用条件：学習で同時購入${PARAMS.minTrainCount}件以上かつlift ${PARAMS.minTrainLift}以上、評価で同時購入${PARAMS.minTestCount}件以上かつlift ${PARAMS.minTestLift}以上。デモ商品ごとにconfidence上位${PARAMS.maxRulesPerProduct}件とlift上位${PARAMS.maxRulesPerProduct}件を残す

## 評価（評価データ・Leave-one-out）

評価データのうちデモ商品へ対応する品目を2つ以上含むレシートで、1品目を隠し、残りの品目から上位3件を選んで当たるかを測りました。

| 方法 | 評価件数 | 候補を出せた割合 | 上位3件の的中率 |
| --- | --- | --- | --- |
| 関連購買ルール（liftの高い順） | ${result.evaluation.cases} | ${pct(result.evaluation.coverage)} | ${pct(result.evaluation.liftHitAt3)} |
| 関連購買ルール（confidenceの高い順） | ${result.evaluation.cases} | ${pct(result.evaluation.coverage)} | ${pct(result.evaluation.confidenceHitAt3)} |
| 比較：よく売れる品目の上位3件 | ${result.evaluation.cases} | 100.0% | ${pct(result.evaluation.popularHitAt3)} |

### 結果の読み方

- 「隠した品目を当てる」だけなら、よく売れる品目（牛乳・野菜など）を出す方法が強い。confidence順はその性質に近く、lift順は「その商品を買う人に特有の組み合わせ」を優先するため的中率は下がる。
- Appの通常推薦（APP-05）では的中しやすいconfidenceを、セレンディピティ販促（APP-13）では意外性のあるliftを主に使えるよう、両方の値をルールに保存する。
- 公開データは欧州のスーパー1店舗・1か月分で、品目はカテゴリ単位。デモ商品への対応は近いカテゴリへの近似であり、日本の店舗の購買傾向を表すものではない。実店舗の注文が貯まったら同じ手順で置き換える。

## 採用したカテゴリ間ルール（${result.categoryRules.length}件）

| ルール | 学習の同時購入数 | confidence | lift | 評価の同時購入数 | 評価のlift |
| --- | --- | --- | --- | --- | --- |
${result.categoryRules.map(line).join("\n")}

デモ商品へ展開したルール：${result.rules.length}件（\`association-rules.json\`）。

## 採用しなかったルール（学習では基準を満たしたもの、${result.rejected.length}件）

| ルール | 学習の同時購入数 | confidence | lift | 評価の同時購入数 | 評価のlift | 理由 |
| --- | --- | --- | --- | --- | --- | --- |
${result.rejected.map(r => `${line(r).slice(0, -1)}| ${r.reason} |`).join("\n") || "| なし | | | | | | |"}

## 初期ルール（${initial.length}件）

公開データに対応品目がない商品（例：生バジルは\`herbs\`に対応するが同時購入が少ない）や、分析ルールが出ない場合に使う手作業のルールです。\`origin = initial\`として分析ルールと区別します。

| ID | 対象 | 候補 | 理由 |
| --- | --- | --- | --- |
${initial.map(r => `| ${r.id} | ${r.from} | ${r.to} | ${r.reason} |`).join("\n")}
`;
}

if (process.argv[1]?.endsWith("mine-rules.mjs")) {
  const basketsPath = process.argv[2] ?? new URL("./raw/baskets.txt", import.meta.url);
  const baskets = parseBaskets(await readFile(basketsPath, "utf8"));
  const productMap = JSON.parse(await readFile(new URL("./product-map.json", import.meta.url), "utf8")).products;
  const initial = JSON.parse(await readFile(new URL("./initial-rules.json", import.meta.url), "utf8")).rules;
  const result = mine(baskets, productMap);
  const output = {
    version: RULESET_VERSION,
    source: { ...SOURCE, license: "GPL-3 (arules)", transactions: baskets.length,
      citation: "Hahsler, Hornik, Reutterer (2006) Implications of probabilistic data modeling for mining association rules." },
    params: PARAMS,
    evaluation: result.evaluation,
    rules: result.rules,
    initialRules: initial.map(rule => ({ ...rule, origin: "initial" })),
  };
  await writeFile(new URL("../../kago-os/kago-app/src/features/recommendations/association-rules.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
  await writeFile(new URL("./evaluation.md", import.meta.url), evaluationMarkdown(result, initial));
  console.log(JSON.stringify({ version: RULESET_VERSION, categoryRules: result.categoryRules.length, productRules: result.rules.length, rejected: result.rejected.length, evaluation: result.evaluation }));
}
