import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { createPortalDatabase, fixturePassword, id } from "./fixtures/portal-database.mts";

const root = new URL("../", import.meta.url).pathname;
const base = "http://127.0.0.1:3189";
const env = { ...process.env, NEXT_PUBLIC_ADS_DATA_SOURCE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://ads-fixture.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" };
async function run(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { cwd: root, env, stdio: "inherit" });
    p.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Next.js exited " + code)));
    p.once("error", reject);
  });
}
if (process.env.KAGO_E2E_SKIP_BUILD !== "1") await run(["build", "--webpack"]);
const fixture = await createPortalDatabase();
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const checks: string[] = [];
async function shown(page: Page, text: string) { await page.getByText(text, { exact: true }).first().waitFor(); }
async function login(page: Page, email = "maker-one@example.test", password = fixturePassword, role?: "maker_staff" | "store_staff") {
  if (role) await page.getByLabel(role === "store_staff" ? "店舗担当者" : "メーカー", { exact: true }).check();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
}
try {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3189"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  server.stdout?.on("data", (chunk) => { output = (output + chunk).slice(-2000); });
  server.stderr?.on("data", (chunk) => { output = (output + chunk).slice(-2000); });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Server startup failed: " + output);
    try { if ((await fetch(base + "/ads")).ok) break; } catch { /* starting */ }
    if (i === 99) throw new Error("Server startup timed out");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  let outage = false;
  let failPublishOnce = false;
  const pageErrors: string[] = [];
  async function context() {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("https://ads-fixture.invalid/**", async (route) => {
      if (outage) {
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"unavailable"}' });
        return;
      }
      const request = route.request();
      if (failPublishOnce && request.method() === "PATCH" && request.url().includes("/rest/v1/ad_calls") && request.postDataJSON()?.status === "open") {
        failPublishOnce = false;
        await route.fulfill({ status: 503, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"message":"unavailable"}' });
        return;
      }
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS" } });
        return;
      }
      let body: BodyInit | null = request.postData();
      if(request.headers()["content-type"]?.startsWith("multipart/form-data")) {
        body=await new Request(request.url(),{method:request.method(),headers:request.headers(),body:new Uint8Array(request.postDataBuffer()!).buffer}).formData();
      }
      const response = await fixture.fetcher(request.url(), { method: request.method(), headers: request.headers(), body });
      await route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), "access-control-allow-origin": "*", "access-control-expose-headers": "x-supabase-api-version" }, body: Buffer.from(await response.arrayBuffer()) });
    });
    ctx.on("page", (p) => p.on("pageerror", (e) => pageErrors.push(e.message)));
    return ctx;
  }
  const ctx = await context();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("kago-ads-session-v1", JSON.stringify({ role: "maker_staff", makerId: "M2" }));
  });
  await page.goto(base + "/ads/portal?as=maker_staff:M1");
  await shown(page, "メーカーとしてログイン");
  assert.equal(await page.getByRole("heading", { name: "募集ポータル", exact: true }).count(), 0);
  checks.push("URL・localStorageによる仮ログインで実認証を迂回できない");
  const images = new URL("../../../docs/images/", import.meta.url);
  await mkdir(images, { recursive: true });
  await page.screenshot({ path: new URL("ads01-login.png", images).pathname, fullPage: true });
  await login(page, "maker-one@example.test", "wrong-password");
  await shown(page, "メールアドレスまたはパスワードを確認してください。");
  checks.push("誤パスワードの案内");
  await login(page, "no-membership@example.test");
  await shown(page, "この役割での接続は許可されていません。");
  checks.push("メーカー所属なしの拒否");
  await login(page, "store@example.test");
  await shown(page, "この役割での接続は許可されていません。");
  checks.push("店舗担当者をメーカーとして扱わない");
  await login(page);
  await shown(page, "2件の募集");
  assert.equal(await page.getByText("秘密の下書き").count(), 0);
  assert.equal(await page.getByText("終了した募集", { exact: true }).count(), 0);
  checks.push("2店舗の公開募集、下書きと終了募集の除外");
  for (const [name, href] of [["広告素材", "/ads/maker/creatives"], ["申請一覧", "/ads/maker/applications"], ["広告の成果", "/ads/maker/results"]]) {
    const link = page.getByRole("link", { name, exact: true }).first();
    await link.waitFor();
    assert.equal(await link.getAttribute("href"), href);
  }
  checks.push("統合後も素材・申請・成果の3つの導線を保持");

  await page.screenshot({ path: new URL("ads01-portal.png", images).pathname, fullPage: true });
  await page.getByPlaceholder("キーワード").fill("見つからない条件");
  await shown(page, "条件に合う募集はありません。条件をゆるめるか、「終了した募集も表示」で過去の募集を確認してください。");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await shown(page, "2件の募集");
  await page.getByLabel("掲載先", { exact: true }).selectOption("app");
  await shown(page, "1件の募集");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page.getByLabel("店舗", { exact: true }).selectOption(id(2));
  await shown(page, "1件の募集");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page.getByLabel("カテゴリ", { exact: true }).selectOption("食品");
  await shown(page, "条件に合う募集はありません。条件をゆるめるか、「終了した募集も表示」で過去の募集を確認してください。");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page.locator('input[type="date"]').fill("2099-02-01");
  await shown(page, "条件に合う募集はありません。条件をゆるめるか、「終了した募集も表示」で過去の募集を確認してください。");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  checks.push("キーワード0件・カテゴリ・掲載先・店舗・期間終了境界の絞込み");
  await page.getByLabel("終了した募集も表示").check();
  await shown(page, "3件の募集");
  await page.getByText("終了した募集", { exact: true }).click();
  await page.getByText(/新しい申請は受け付けていません/).waitFor();
  assert.equal(await page.getByRole("link", { name: "この募集に申請する" }).count(), 0);
  checks.push("終了した募集に新規申請リンクを出さない");
  await page.goto(base + "/ads/portal/call?id=" + id(31));
  await page.getByRole("heading", { name: "パンの広告募集", exact: true }).waitFor();
  await shown(page, id(61));
  assert.equal(await page.getByText(id(62), { exact: true }).count(), 0);
  await page.getByRole("link", { name: "この募集に申請する" }).click();
  await page.getByRole("heading", { name: "募集に申請する", exact: true }).waitFor();
  checks.push("詳細・自社申請だけの表示・申請画面への入口");
  await page.goto(base + "/ads/portal/call?id=" + id(33));
  await shown(page, "募集が見つかりません（下書き、または削除された募集です）");
  checks.push("下書きのUUIDを直接指定しても表示しない");
  await page.goto(base + "/ads/portal/stores");
  await page.getByText("架空2号店 駅前", { exact: true }).click();
  await shown(page, "この店舗の募集");
  checks.push("店舗一覧から店舗別の募集へ移動");
  const ctx2 = await context();
  const page2 = await ctx2.newPage();
  await page2.goto(base + "/ads/portal");
  await shown(page2, "メーカーとしてログイン");
  await login(page2, "maker-two@example.test");
  await shown(page2, "2件の募集");
  await fixture.db.query("update ad_calls set title=$1 where id=$2", ["共有DBの更新後の募集", id(34)]);
  await page.goto(base + "/ads/portal");
  await page2.reload();
  await shown(page, "共有DBの更新後の募集");
  await shown(page2, "共有DBの更新後の募集");
  checks.push("別ブラウザの2メーカーが同じDB更新を取得");
  outage = true;
  await page.reload();
  await shown(page, "認証・DBへ接続できません。時間をおいて再試行してください。");
  assert.equal(await page.getByText("共有DBの更新後の募集", { exact: true }).count(), 0);
  checks.push("接続失敗時に前の募集や仮データを表示しない");
  outage = false;
  await page.goto(base + "/ads/portal");
  await shown(page, "共有DBの更新後の募集");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await shown(page, "メーカーとしてログイン");
  assert.equal(await page.getByText("共有DBの更新後の募集", { exact: true }).count(), 0);
  checks.push("ログアウト時に募集の表示を消す");
  await page2.setViewportSize({ width: 390, height: 844 });
  await page2.goto(base + "/ads/portal");
  await shown(page2, "共有DBの更新後の募集");
  assert.equal(await page2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  checks.push("スマホ幅でも横にはみ出さず募集を閲覧できる");
  const storeCtx = await context();
  const storePage = await storeCtx.newPage();
  await storePage.goto(base + "/ads/store/calls");
  await shown(storePage, "店舗担当者としてログイン");
  await login(storePage, "store-no-membership@example.test", fixturePassword, "store_staff");
  await shown(storePage, "この役割での接続は許可されていません。");
  checks.push("店舗役割があっても所属なしはログイン拒否");
  await login(storePage, "store@example.test", fixturePassword, "store_staff");
  await storePage.getByRole("heading", { name: "自店の募集", exact: true }).waitFor();
  assert.equal(await storePage.getByText("共有DBの更新後の募集", { exact: true }).count(), 0);
  checks.push("店舗担当者は自店の下書き・公開・終了だけを閲覧");
  async function fillCall(p: Page, title: string) {
    await p.getByLabel("募集名", { exact: true }).fill(title);
    await p.getByText("パン", { exact: true }).click();
    assert.equal(await p.getByLabel("パン", { exact: true }).isChecked(), true);
    await p.getByLabel("掲載期間（はじめ）").fill("2099-01-01");
    await p.getByLabel("掲載期間（おわり）").fill("2099-01-31");
    await p.getByLabel("案内文", { exact: false }).fill("検証用の架空募集です。");
  }
  await storePage.getByRole("link", { name: "新しい募集を作る" }).click();
  await fillCall(storePage, "ブラウザで作成した募集");
  for (const label of ["App のクリック数", "App の提案経由の追加数", "App の表示後の購入数", "Signage の再生回数・推定視認"]) {
    await storePage.getByLabel(label, { exact: true }).uncheck();
  }
  await storePage.getByRole("button", { name: "下書き保存", exact: true }).click();
  await storePage.getByRole("heading", { name: "ブラウザで作成した募集", exact: true }).waitFor();
  const call = (await fixture.db.query<{ id: string; status: string; disclosure_scope: string[] }>("select id,status,disclosure_scope from ad_calls where title=$1", ["ブラウザで作成した募集"])).rows[0];
  assert.equal(call.status, "draft");
  assert.deepEqual(call.disclosure_scope, ["impressions"]);
  await page2.goto(base + "/ads/portal/call?id=" + call.id);
  await shown(page2, "募集が見つかりません（下書き、または削除された募集です）");
  checks.push("下書き保存と成果公開範囲の永続化、メーカーからの非表示");
  await storePage.goto(base + "/ads/store/calls/edit?id=" + call.id);
  await storePage.getByLabel("募集名", { exact: true }).fill("ブラウザで編集した募集");
  await storePage.getByRole("button", { name: "保存して公開", exact: true }).click();
  await storePage.getByRole("heading", { name: "ブラウザで編集した募集", exact: true }).waitFor();
  await page2.reload();
  await page2.getByRole("heading", { name: "ブラウザで編集した募集", exact: true }).waitFor();
  await shown(page2, "App の実表示数");
  assert.equal(await page2.getByText("App のクリック数", { exact: true }).count(), 0);
  checks.push("店舗の編集・公開が別ブラウザのメーカーと公開指標へ反映");
  await storePage.goto(base + "/ads/store/calls/edit?id=" + call.id);
  assert.equal(await storePage.getByLabel("掲載期間（はじめ）").isDisabled(), true);
  assert.equal(await storePage.getByLabel("掲載期間（おわり）").isDisabled(), true);
  assert.equal(await storePage.getByRole("checkbox", { name: /^App.*スマホ/ }).isDisabled(), true);
  await storePage.screenshot({ path: new URL("ads02-edit.png", images).pathname, fullPage: true });
  checks.push("公開後の期間・掲載先の変更を画面でも禁止");
  const store2Ctx = await context();
  const store2Page = await store2Ctx.newPage();
  await store2Page.goto(base + "/ads/store/calls/edit?id=" + call.id);
  await shown(store2Page, "店舗担当者としてログイン");
  await login(store2Page, "store-two@example.test", fixturePassword, "store_staff");
  await shown(store2Page, "募集が見つからないか、他の店舗の募集です");
  assert.equal(await store2Page.getByRole("button", { name: "保存", exact: true }).count(), 0);
  checks.push("別店舗の担当者が募集IDを指定しても編集不可");
  await fixture.db.query("update ad_calls set description=$1 where id=$2", ["別担当者が先に更新", call.id]);
  await storePage.getByLabel("案内文", { exact: false }).fill("古いフォームからの書換え");
  await storePage.getByRole("button", { name: "保存", exact: true }).click();
  await shown(storePage, "募集が更新されています。再読み込みして最新の内容を確認してください。");
  assert.equal((await fixture.db.query<{ description: string }>("select description from ad_calls where id=$1", [call.id])).rows[0].description, "別担当者が先に更新");
  checks.push("古いフォームからの保存を拒否して他の担当者の変更を保持");
  await storePage.goto(base + "/ads/store/calls/new");
  await fillCall(storePage, "公開を再試行する募集");
  failPublishOnce = true;
  await storePage.getByRole("button", { name: "保存して公開", exact: true }).click();
  await shown(storePage, "認証・DBへ接続できません。時間をおいて再試行してください。");
  assert.equal((await fixture.db.query("select id from ad_calls where title='公開を再試行する募集'")).rows.length, 1);
  await storePage.getByRole("button", { name: "保存して公開", exact: true }).click();
  await storePage.getByRole("heading", { name: "公開を再試行する募集", exact: true }).waitFor();
  const retry = (await fixture.db.query<{ status: string }>("select status from ad_calls where title='公開を再試行する募集'")).rows;
  assert.equal(retry.length, 1);
  assert.equal(retry[0].status, "open");
  checks.push("保存後に公開が失敗しても再試行で募集を重複作成しない");
  const card = storePage.getByRole("heading", { name: "ブラウザで編集した募集", exact: true }).locator("..").locator("..");
  storePage.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "募集を終了", exact: true }).click();
  await card.getByText("募集終了", { exact: true }).waitFor();
  assert.equal(await card.getByRole("button", { name: "募集を終了" }).count(), 0);
  await page2.reload();
  await page2.getByText(/新しい申請は受け付けていません/).waitFor();
  assert.equal(await page2.getByRole("link", { name: "この募集に申請する" }).count(), 0);
  await storePage.screenshot({ path: new URL("ads02-calls.png", images).pathname, fullPage: true });
  checks.push("募集終了がメーカーへ反映され、再公開・新規申請の導線なし");
  assert.equal((await fixture.db.query<{ count: number }>("select count(*)::int as count from ad_placements")).rows[0].count, 0);
  checks.push("募集公開だけでは広告の配信対象を作成しない");
  const multiCtx = await context();
  const multiPage = await multiCtx.newPage();
  await multiPage.goto(base + "/ads/store/calls/new");
  await shown(multiPage, "店舗担当者としてログイン");
  await login(multiPage, "store-multi@example.test", fixturePassword, "store_staff");
  await multiPage.getByLabel("募集名", { exact: true }).fill("切替前の未保存入力");
  await multiPage.getByLabel("操作する店舗").selectOption(id(2));
  await multiPage.getByLabel("募集名", { exact: true }).waitFor();
  assert.equal(await multiPage.getByLabel("募集名", { exact: true }).inputValue(), "");
  await fillCall(multiPage, "2号店に作成する募集");
  await multiPage.getByRole("button", { name: "下書き保存", exact: true }).click();
  await multiPage.getByRole("heading", { name: "2号店に作成する募集", exact: true }).waitFor();
  assert.equal((await fixture.db.query<{ store_id: string }>("select store_id from ad_calls where title='2号店に作成する募集'")).rows[0].store_id, id(2));
  checks.push("所属店舗の切替で入力を分離し、選択した店舗に保存");
  await multiPage.setViewportSize({ width: 390, height: 844 });
  await multiPage.goto(base + "/ads/store/calls/new");
  await multiPage.getByLabel("募集名", { exact: true }).waitFor();
  assert.equal(await multiPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  checks.push("スマホ幅でも募集フォームが横にはみ出さない");
  await storePage.getByRole("button", { name: "ログアウト", exact: true }).click();
  await shown(storePage, "店舗担当者としてログイン");
  assert.equal(await storePage.getByRole("heading", { name: "ブラウザで編集した募集" }).count(), 0);
  checks.push("店舗のログアウト後に募集情報を残さない");
  const makerCtx=await context();
  const makerPage=await makerCtx.newPage();
  await makerPage.goto(base+"/ads/maker/creatives");
  await login(makerPage);
  await makerPage.getByRole("heading",{name:"自社の広告素材",exact:true}).waitFor();
  await makerPage.goto(base+"/ads/maker/creatives/new");
  await makerPage.getByLabel("対象商品").selectOption(id(21));
  await makerPage.getByLabel("見出し").fill("ブラウザから登録した広告");
  await makerPage.getByLabel("App用画像（正方形）",{exact:false}).setInputFiles(new URL("../public/ad-assets/design-v2/CR2_v1_app.png",import.meta.url).pathname);
  await makerPage.getByLabel("Signage用画像（横長）",{exact:false}).setInputFiles(new URL("../public/ad-assets/design-v2/CR2_v1_signage.png",import.meta.url).pathname);
  await makerPage.locator('img[src^="blob:"]').nth(1).waitFor();
  assert.equal(await makerPage.locator('img[src^="blob:"]').count(),2);
  await makerPage.screenshot({path:new URL("ads03-register.png",images).pathname,fullPage:true});
  await makerPage.getByRole("button",{name:"登録する",exact:true}).click();
  await makerPage.waitForURL("**/ads/maker/creative?id=*");
  const creativeId=new URL(makerPage.url()).searchParams.get("id")!;
  await makerPage.getByText("ブラウザから登録した広告",{exact:false}).first().waitFor();
  assert.equal((await fixture.db.query("select id from creative_versions where creative_id=$1",[creativeId])).rows.length,1);
  checks.push("App用とSignage用の別画像をプレビューし、共通Storageと同じ素材の第1版へ保存");
  const foreignCtx=await context(), foreignPage=await foreignCtx.newPage();
  await foreignPage.goto(base+"/ads/maker/creative?id="+creativeId);
  await login(foreignPage,"maker-two@example.test");
  await shown(foreignPage,"広告素材が見つからないか、他社の素材です");
  checks.push("別メーカーの素材詳細URLを直接指定しても閲覧しない");

  await makerPage.goto(base+"/ads/maker/applications/new?call="+id(31));
  await makerPage.getByLabel("申請する広告素材").selectOption(creativeId);
  await makerPage.getByRole("button",{name:"申請する",exact:true}).click();
  await makerPage.waitForURL("**/ads/maker/application?id=*");
  const applicationId=new URL(makerPage.url()).searchParams.get("id")!;
  await makerPage.getByText("審査中",{exact:true}).first().waitFor();
  assert.equal((await fixture.db.query<{status:string}>("select status from ad_applications where id=$1",[applicationId])).rows[0].status,"submitted");
  assert.equal(await makerPage.getByRole("button",{name:"承認",exact:true}).count(),0);
  checks.push("広告を募集へ申請し、メーカーに承認操作を出さない");

  await fixture.asUser({n:104,email:"store@example.test",role:"store_staff"},()=>fixture.db.query("select * from kago_reject_application($1,1,$2)",[applicationId,"商品名を大きくしてください"]),true);
  await makerPage.reload();
  await makerPage.getByText("却下の理由：商品名を大きくしてください",{exact:true}).waitFor();
  checks.push("店舗の正式審査関数による却下を再取得し、理由を表示");

  await makerPage.goto(base+"/ads/maker/creative?id="+creativeId);
  await makerPage.getByRole("button",{name:"新しい版を作る",exact:true}).click();
  await makerPage.getByLabel("見出し").fill("修正した広告");
  await makerPage.getByLabel("版のメモ").fill("商品名を大きく");
  await makerPage.getByLabel("App用画像（正方形）",{exact:false}).setInputFiles(new URL("../public/ad-assets/design-v2/CR2_v2_app.png",import.meta.url).pathname);
  await makerPage.getByLabel("Signage用画像（横長）",{exact:false}).setInputFiles(new URL("../public/ad-assets/design-v2/CR2_v2_signage.png",import.meta.url).pathname);
  await makerPage.locator('img[src^="blob:"]').nth(1).waitFor();
  await makerPage.getByRole("button",{name:"この版を保存",exact:true}).click();
  await makerPage.getByRole("button",{name:"この版を保存",exact:true}).waitFor({state:"hidden"});
  await makerPage.getByText("修正した広告",{exact:false}).first().waitFor();
  assert.equal((await fixture.db.query("select id from creative_versions where creative_id=$1",[creativeId])).rows.length,2);
  await makerPage.screenshot({path:new URL("ads03-versions.png",images).pathname,fullPage:true});
  checks.push("修正を別画像・第2版として保存し、第1版を履歴に保持");

  await makerPage.goto(base+"/ads/maker/application?id="+applicationId);
  await makerPage.getByRole("button",{name:"修正して再申請",exact:true}).click();
  await makerPage.getByRole("button",{name:"再申請する",exact:true}).click();
  await makerPage.getByRole("button",{name:"再申請する",exact:true}).waitFor({state:"hidden"});
  await makerPage.getByText("審査中",{exact:true}).first().waitFor();
  assert.equal((await fixture.db.query<{revision:number}>("select revision from ad_applications where id=$1",[applicationId])).rows[0].revision,2);
  assert.equal((await fixture.db.query("select revision from application_revisions where application_id=$1",[applicationId])).rows.length,2);
  await makerPage.screenshot({path:new URL("ads03-application.png",images).pathname,fullPage:true});
  checks.push("同じ申請IDで第2版を再申請し、第1回の却下コメントを保持");

  await fixture.asUser({n:104,email:"store@example.test",role:"store_staff"},()=>fixture.db.query("select * from kago_approve_application($1,2,null,null,array['app'])",[applicationId]),true);
  await makerPage.reload();
  await makerPage.getByText("店舗はこの掲載先を承認しませんでした（掲載先を絞って承認）。",{exact:true}).waitFor();
  const placement=(await fixture.db.query<{id:string}>("select id from ad_placements where application_id=$1 and status='active'",[applicationId])).rows[0];
  checks.push("Appだけの承認を取得し、Signageへ配信しない状態を表示");
  await fixture.asUser({n:104,email:"store@example.test",role:"store_staff"},()=>fixture.db.query("select * from kago_suspend_placement($1,$2)",[placement.id,"検証のため停止"]),true);
  await makerPage.reload();
  await makerPage.getByText("停止の理由：検証のため停止",{exact:true}).waitFor();
  checks.push("店舗で停止した配信の状態と理由を表示");

  await foreignPage.goto(base+"/ads/maker/application?id="+applicationId);
  await shown(foreignPage,"申請が見つからないか、他社の申請です");
  checks.push("別メーカーの申請詳細URLを直接指定しても閲覧しない");
  await makerPage.setViewportSize({width:390,height:844});
  await makerPage.goto(base+"/ads/maker/creatives/new");
  await makerPage.getByLabel("App用画像（正方形）",{exact:false}).waitFor();
  assert.equal(await makerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  checks.push("スマホ幅でも実画像の登録フォームが横にはみ出さない");
  await makerPage.getByRole("button",{name:"ログアウト",exact:true}).click();
  await makerPage.goto(base+"/ads/maker/application?id="+applicationId);
  await shown(makerPage,"メーカーとしてログイン");
  checks.push("ログアウト後は保存済み素材・申請の画面を表示しない");

  assert.deepEqual(pageErrors, []);
  checks.push("ブラウザの未処理エラーなし");
  console.log(checks.map((s, i) => (i + 1) + ". " + s).join("\n"));
  console.log("Ads browser checks passed: " + checks.length + " (Auth/HTTP simulated; formal SQL/RLS in PGlite)");
} catch (error) {
  const page = browser?.contexts().at(-1)?.pages().at(-1);
  if (page) {
    console.log("Failure screen:", await page.locator("body").innerText());
    await page.screenshot({ path: "/tmp/ads01-debug.png", fullPage: true });
  }
  console.log("Last fixture request paths:", fixture.requests.slice(-20));
  throw error;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await fixture.close();
}
