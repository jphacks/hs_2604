// Printable sample barcodes for every product of the demo store (DATA-01 S1), grouped by what happens when the
// barcode is scanned: products that bring up a guerrilla coupon first (with the coupon per demo customer), then
// products that are only added to the cart. Output: docs/demo-barcodes/ (<code>.svg, index.html, PDF, README.md)
//
// The coupon each customer gets is computed with the App's own logic (targetCoupon) on the real seeds in PGlite:
// DATA-01 + DEMO-05 + #152 + #144 fresh products + #158 fresh coupons, APP-04 rules, demo day 2026-10-25 12:00 JST.
// Usage (kago-os/kago-app): node --experimental-strip-types scripts/generate-demo-barcode-sheet.mts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { createDemoDatabase, userId } from "../tests/fixtures/demo-database.mts";
import { buildPurchaseSummaries } from "../src/features/recommendations/customer.ts";
import { DEMO_PINNED_COUPONS, targetCoupon, type CouponHistory } from "../src/features/offers/targeting.ts";
import { rankSerendipity } from "../src/features/offers/serendipity.ts";
import type { StoreOffer } from "../src/features/offers/contracts.ts";
import type { PurchaseOrder } from "../src/features/account/contracts.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

// bwip-js has no type declarations; load it as the e2e tests do.
const bwipjs = createRequire(import.meta.url)("bwip-js") as { toSVG: (options: object) => string };
const seeds = resolve("../kago-core/supabase/seed");
const out = resolve("../../docs/demo-barcodes");
mkdirSync(out, { recursive: true });
const STORE = "0da7a001-0000-4000-8000-000000000001", AS_OF = "2026-10-25T12:00:00+09:00";
const U3 = "0de005aa-0000-4000-8000-000000000003";
const rules = JSON.parse(readFileSync("src/features/recommendations/association-rules.json", "utf8")) as AssociationRuleSet;

const demo = await createDemoDatabase();
await demo.seed();
await demo.db.query("insert into auth.users(id,email,raw_app_meta_data) values ($1,'yui.suzuki@example.test',$2)", [U3, { kago: { roles: ["customer"] } }]);
for (const file of ["demo05_users_offers.sql", "demo152_regular_reminder.sql", "app_menu_fresh_products.sql", "app_fresh_coupons.sql", "app_demo_set_deals.sql"]) {
  await demo.db.exec(readFileSync(join(seeds, file), "utf8"));
}
type Product = { code: string; name: string; category: string; price: number };
const products = (await demo.db.query<Product>(`select p.code,p.name,p.category,sp.price from products p
  join store_products sp on sp.product_id=p.id where sp.store_id=$1 and sp.is_active order by p.code`, [STORE])).rows;
if (products.length !== 50) throw new Error(`expected 50 demo store products, found ${products.length}`);
const offers = (await demo.db.query<{ value: StoreOffer }>(`select jsonb_build_object('offerId',o.id,'kind',o.kind,'headline',o.headline,
  'discountPercent',o.discount_percent,'discountAmount',o.discount_amount,'unitDiscount',public.kago_offer_unit_discount(sp.price,o.discount_percent,o.discount_amount),
  'startsAt',o.starts_at,'endsAt',o.ends_at,'trigger',null,'productInCart',false,'triggerInCart',false,'dismissed',false,
  'product',jsonb_build_object('productId',p.id,'code',p.code,'name',p.name,'category',p.category,'price',sp.price,'available',sp.is_active)) as value
  from store_offers o join products p on p.id=o.product_id join store_products sp on sp.store_id=o.store_id and sp.product_id=o.product_id
  where o.store_id=$1 and o.kind='guerrilla_coupon' and o.trigger_product_id is null and o.status='active'
    and o.starts_at <= $2::timestamptz and $2::timestamptz < o.ends_at order by o.id`, [STORE, AS_OF])).rows.map(r => r.value);
// Set deals (セット割) of the demo period: shown when the trigger product is in the cart (APP-13).
const setDeals = (await demo.db.query<{ value: StoreOffer }>(`select jsonb_build_object('offerId',o.id,'kind',o.kind,'headline',o.headline,
  'discountPercent',o.discount_percent,'discountAmount',o.discount_amount,'unitDiscount',public.kago_offer_unit_discount(sp.price,o.discount_percent,o.discount_amount),
  'startsAt',o.starts_at,'endsAt',o.ends_at,'productInCart',false,'triggerInCart',false,'dismissed',false,
  'product',jsonb_build_object('productId',p.id,'code',p.code,'name',p.name,'category',p.category,'price',sp.price,'available',sp.is_active),
  'trigger',jsonb_build_object('productId',t.id,'code',t.code,'name',t.name,'category',t.category,'price',tsp.price,'available',tsp.is_active,
    'unitDiscount',public.kago_offer_unit_discount(tsp.price,o.discount_percent,o.discount_amount))) as value
  from store_offers o join products p on p.id=o.product_id join store_products sp on sp.store_id=o.store_id and sp.product_id=o.product_id
  join products t on t.id=o.trigger_product_id join store_products tsp on tsp.store_id=o.store_id and tsp.product_id=o.trigger_product_id
  where o.store_id=$1 and o.kind='set_deal' and o.status='active' and o.starts_at <= $2::timestamptz and $2::timestamptz < o.ends_at
    and o.ends_at >= '2026-11-01T00:00:00+09' order by o.id`, [STORE, AS_OF])).rows.map(r => r.value);

async function historyOf(user: string): Promise<CouponHistory> {
  const allowed = (await demo.db.query<{ on: boolean }>("select use_purchase_history as on from customer_settings where user_id=$1", [user])).rows[0]?.on;
  if (!allowed) return { status: "disabled" };
  const orders = (await demo.db.query<{ value: PurchaseOrder }>(`select jsonb_build_object('id',o.id,'orderedAt',o.ordered_at,'total',o.total,'dataOrigin',o.data_origin,
    'items',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.product_name,'unitPrice',i.unit_price,'quantity',i.quantity)) from order_items i where i.order_id=o.id)) as value
    from orders o where o.user_id=$1 and o.store_id=$2 and o.ordered_at < $3 order by o.ordered_at desc limit 50`, [user, STORE, AS_OF])).rows.map(r => r.value);
  if (!orders.length) return { status: "empty" };
  const summaries = buildPurchaseSummaries(orders, AS_OF);
  const categories = Object.fromEntries((await demo.db.query<{ id: string; category: string }>("select id,category from products where id = any($1)", [summaries.map(s => s.productId)])).rows.map(r => [r.id, r.category]));
  return { status: "available", summaries, categories };
}
const people = [{ name: "田中", history: await historyOf(userId("U2")) }, { name: "佐藤", history: await historyOf(userId("U1")) }, { name: "鈴木", history: await historyOf(U3) }];
await demo.db.close();

const short = (name: string) => name.replace(/\s+\S*\d\S*$/, "");
type Row = Product & { coupons: { person: string; coupon: string | null }[]; sets: string[]; useFor: string[] };
// #186: the product whose coupon is fixed for the demo (spaghetti → tomato sauce) is read again to use the coupon.
const nameOf = (code: string) => short(products.find(p => p.code === code)?.name ?? code);
const useFor = (p: Product) => Object.entries(DEMO_PINNED_COUPONS).filter(([, coupon]) => coupon === p.code).map(([trigger]) => nameOf(trigger));
const setsFor = (p: Product) => rankSerendipity({ visitId: "v", cartVersion: 1, serverTime: AS_OF, nextChangeAt: null, cartProductCodes: [p.code],
  offers: setDeals.map(o => ({ ...o, triggerInCart: o.trigger!.code === p.code, productInCart: o.product.code === p.code })),
  lastAddedProduct: { productId: p.code, code: p.code, name: p.name, category: p.category }, claimedCouponCount: 0 }, rules)
  .sets.map(o => `${short(o.trigger!.name)}＋${short(o.product.name)} 各${o.discountPercent}%OFF`);
const rows: Row[] = products.map(p => ({ ...p, sets: setsFor(p), useFor: useFor(p), coupons: people.map(person => {
  const selected = targetCoupon({ offers, triggers: [{ code: p.code, name: p.name }], cartProductCodes: [p.code], history: person.history, rules,
    pinnedCoupons: DEMO_PINNED_COUPONS }).selected;
  const offer = selected && offers.find(o => o.offerId === selected.offerId);
  return { person: person.name, coupon: offer ? `${short(offer.product.name)} ${offer.discountPercent}%OFF` : null };
}) }));
// Spaghetti first, then the product its coupon is used on, then the rest.
const first = ["2900000000100", ...Object.values(DEMO_PINNED_COUPONS)];
const rank = (r: Row) => first.includes(r.code) ? first.indexOf(r.code) : first.length;
const featured = (r: Row) => r.coupons.some(c => c.coupon) || r.sets.length > 0 || r.useFor.length > 0;
const withCoupon = rows.filter(featured).sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
const cartOnly = rows.filter(r => !featured(r));
const redeemText = (r: Row) => `${r.useFor.join("・")}で出たクーポンを使うときに読み取ります`;
const couponText = (r: Row) => {
  if (r.coupons.every(c => !c.coupon)) return "なし";
  const same = r.coupons.every(c => c.coupon === r.coupons[0].coupon);
  return same ? `全員：${r.coupons[0].coupon}` : r.coupons.map(c => `${c.person}：${c.coupon ?? "なし"}`).join(" ／ ");
};

const symbology = (code: string) => /^\d{13}$/.test(code) ? "ean13" : "code128";
for (const p of rows) {
  const svg = bwipjs.toSVG({ bcid: symbology(p.code), text: p.code, scale: 3, height: 14, includetext: true,
    textxalign: "center", textsize: 11, paddingwidth: 10, paddingheight: 8, backgroundcolor: "FFFFFF" });
  writeFileSync(join(out, `${p.code}.svg`), svg, "utf8");
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]!);
const card = (r: Row, coupon: boolean) => `<div class="card${coupon ? " coupon" : ""}"><div class="meta"><span>${esc(r.category)}</span><span>${yen(r.price)}</span></div>
<h2>${esc(r.name)}</h2><img src="${r.code}.svg" alt="${esc(r.name)} ${r.code}">${coupon && r.coupons.some(c => c.coupon) ? `<p class="deal">🎉 ゲリラクーポン<br>${esc(couponText(r))}</p>` : ""}${coupon && r.sets.length ? `<p class="deal set">🍽 セット割<br>${esc(r.sets.join(" ／ "))}</p>` : ""}${coupon && r.useFor.length ? `<p class="deal use">🎟 クーポンを使う<br>${esc(redeemText(r))}</p>` : ""}</div>`;
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>KAGO デモ店舗 サンプルバーコード</title>
<style>@page{size:A4;margin:10mm}body{font-family:"Noto Sans CJK JP","Hiragino Sans",sans-serif;margin:0;color:#111}
h1{font-size:16px;margin:0 0 2px}h2.section{font-size:14px;margin:4px 0 4px;padding:4px 8px;color:#fff;background:#be185d}
h2.section.plain{background:#475569}p.note{font-size:10px;margin:0 0 8px;color:#444}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.card{border:1px solid #999;padding:6px;break-inside:avoid}
.card.coupon{border:2px solid #be185d}.card h2{font-size:11px;margin:0;line-height:1.3}
.meta{font-size:9px;color:#555;display:flex;justify-content:space-between}
.card img{width:78%;height:auto;display:block;margin:4px auto 0}
.deal{font-size:9.5px;margin:4px 0 0;padding:3px 5px;background:#fdf2f8;color:#9d174d;font-weight:700;line-height:1.35}
.deal.set{background:#ecfdf5;color:#065f46}.deal.use{background:#eff6ff;color:#1e3a8a}.cart-only{break-before:page}</style></head><body>
<h1>KAGO/OS デモ店舗（hiroshima-demo-store）サンプルバーコード ${rows.length}点</h1>
<p class="note">架空の商品です。KAGO Appの「カメラで読み取る」で読み取れます（13桁はEAN-13、PLU-で始まる商品はCode 128）。スパゲッティを読み取ると、デモでは誰でも必ずトマトパスタソースのクーポンが出ます（クーポンを使うときはトマトパスタソースのバーコードを読み取ります）。ほかのクーポンは、その商品だけをかごに入れたときに出るもので、デモの3人（田中：履歴OFF、佐藤・鈴木：履歴ON）で異なる場合は人ごとに書いています。クーポンを受け取る・見送る・ほかの商品を入れると、次に出るクーポンは変わります。セット割は組の1つ目の商品を読み取ると出ます（10/25〜11/7）。倍率100%で印刷してください。</p>
<h2 class="section">① 読み取るとゲリラクーポン・セット割が出る商品（${withCoupon.length}点）</h2>
<div class="grid">${withCoupon.map(r => card(r, true)).join("\n")}</div>
<div class="cart-only"><h2 class="section plain">② かごに入るだけの商品（クーポン・セット割なし・${cartOnly.length}点）</h2>
<div class="grid">${cartOnly.map(r => card(r, false)).join("\n")}</div></div></body></html>`;
writeFileSync(join(out, "index.html"), html, "utf8");

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
const page = await browser.newPage();
await page.goto(`file://${join(out, "index.html")}`); await page.waitForLoadState("networkidle");
await page.pdf({ path: join(out, "demo-barcodes.pdf"), format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
await browser.close();

const line = (r: Row, coupon: boolean) => `| ${r.category} | ${r.name} | \`${r.code}\` | ${symbology(r.code) === "ean13" ? "EAN-13" : "Code 128"} |${coupon ? ` ${r.useFor.length && r.coupons.every(c => !c.coupon) ? `（${redeemText(r)}）` : couponText(r)} | ${r.sets.join(" ／ ") || "—"} |` : ""} [SVG](${r.code}.svg) |`;
writeFileSync(join(out, "README.md"), `# デモ店舗のサンプルバーコード

デモ店舗（DATA-01 S1・hiroshima-demo-store）で扱う架空商品${rows.length}点のバーコードです。KAGO Appの「カメラで読み取る」で読み取れます。

- 印刷用：[demo-barcodes.pdf](demo-barcodes.pdf)（A4。①クーポンが出る商品、改ページして②かごに入るだけの商品）
- 画面表示用：[index.html](index.html)、商品ごとのSVG
- 13桁のコードはEAN-13、\`PLU-\`で始まる商品はCode 128です。価格は参考で、購入時は店舗の現在価格が適用されます。
- スパゲッティを読み取ると、デモでは誰でも必ずトマトパスタソースのクーポンが出ます（#186）。クーポンを使うときは、すぐ下のトマトパスタソースのバーコードを読み取ります。
- ほかのクーポンは、その商品だけをかごに入れたときに出るものです。デモの3人（田中：履歴OFF、佐藤・鈴木：履歴ON）で異なる場合は人ごとに書いています。受け取る・見送る・ほかの商品を入れると、次に出るクーポンは変わります。
- クーポンはAppの配布ロジック（[app-coupon-targeting.md](../specs/app-coupon-targeting.md)）を実際のseed・ルールで計算した結果です（基準：2026-10-25 12:00 JST、有効なゲリラクーポン${offers.length}件）。店舗のクーポンや履歴が変わったら作り直してください。
- セット割は、組の1つ目の商品（きっかけ）を読み取ると「いまだけのお得」に出ます（\`app_demo_set_deals.sql\`、10/25〜11/7）。タイムセールは時間帯で出るため、この表には入れていません。
- 再生成：\`kago-os/kago-app\`で \`node --experimental-strip-types scripts/generate-demo-barcode-sheet.mts\`

## ① 読み取るとゲリラクーポン・セット割が出る商品（${withCoupon.length}点）

| 種類 | 商品 | コード | 形式 | 出るゲリラクーポン | 出るセット割 | 画像 |
| --- | --- | --- | --- | --- | --- | --- |
${withCoupon.map(r => line(r, true)).join("\n")}

## ② かごに入るだけの商品（クーポン・セット割なし・${cartOnly.length}点）

| 種類 | 商品 | コード | 形式 | 画像 |
| --- | --- | --- | --- | --- |
${cartOnly.map(r => line(r, false)).join("\n")}
`, "utf8");
console.log(`クーポン・セット割あり${withCoupon.length}件・かごのみ${cartOnly.length}件のバーコードを docs/demo-barcodes に出力しました。`);
