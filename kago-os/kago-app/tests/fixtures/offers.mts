import type { createCartDatabase } from "./cart-database.mts";
import { id } from "./cart-database.mts";

// APP-13 demo-like data in the test DB: pasta → basil coupon, pasta + sauce set, karaage time sale.
// Product codes match the APP-04 rule set so the App's ranking can use real rules.
export const OFFER = { coupon: id(40), set: id(41), timeSale: id(42), future: id(43), ended: id(44), otherStore: id(45), untriggered: id(46) };
export const PRODUCT = { pasta: id(30), basil: id(31), sauce: id(32), karaage: id(33) };
export async function seedOffers(database: Awaited<ReturnType<typeof createCartDatabase>>) {
  const { db } = database;
  await db.query(`insert into products(id,code,name,category) values
    ($1,'2900000000100','スパゲッティ 500g','乾麺'),($2,'2900000000179','生バジル','青果'),
    ($3,'2900000000162','トマトパスタソース','加工食品'),($4,'PLU-2002','若鶏の唐揚げ 100g','惣菜')`,
    [PRODUCT.pasta, PRODUCT.basil, PRODUCT.sauce, PRODUCT.karaage]);
  await db.query(`insert into store_products(store_id,product_id,price,is_active) values
    ($1,$3,248,true),($1,$4,198,true),($1,$5,298,true),($1,$6,218,true),($2,$3,258,true),($2,$4,198,true)`,
    [id(1), id(2), PRODUCT.pasta, PRODUCT.basil, PRODUCT.sauce, PRODUCT.karaage]);
  const offer = (n: string, kind: string, product: string, trigger: string | null, percent: number | null, amount: number | null,
    headline: string, starts: string, ends: string, store = id(1)) => db.query(
    `insert into store_offers(id,store_id,kind,product_id,trigger_product_id,discount_percent,discount_amount,headline,starts_at,ends_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now()+$9::interval,now()+$10::interval)`,
    [n, store, kind, product, trigger, percent, amount, headline, starts, ends]);
  await offer(OFFER.coupon, "guerrilla_coupon", PRODUCT.basil, PRODUCT.pasta, 25, null, "生バジル 25% OFF", "-1 hour", "+1 day");
  await offer(OFFER.set, "set_deal", PRODUCT.sauce, PRODUCT.pasta, 10, null, "パスタ＋トマトソースで10%OFF", "-1 hour", "+1 day");
  await offer(OFFER.timeSale, "time_sale", PRODUCT.karaage, null, 20, null, "お惣菜 20%OFF", "-10 minutes", "+20 minutes");
  await offer(OFFER.future, "time_sale", id(20), null, 30, null, "牛乳 30%OFF", "+2 hours", "+3 hours");
  await offer(OFFER.ended, "guerrilla_coupon", id(21), id(20), null, 30, "りんご 30円引き", "-2 hours", "-1 hour");
  await offer(OFFER.otherStore, "guerrilla_coupon", PRODUCT.basil, PRODUCT.pasta, 50, null, "別店舗の生バジル", "-1 hour", "+1 day", id(2));
  await offer(OFFER.untriggered, "guerrilla_coupon", id(21), null, null, 50, "りんご 50円引き", "-1 hour", "+1 day");
}
