import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHeadlessBackend, signInBackend } from "@kago/backend";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { selectAndSave } from "../src/features/recommendations/selection-service.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

test("store save, edit and stop reach App without changing its cart; stale/invalid saves preserve the current version", async () => {
  const f = await createCartBackend();
  try {
    await f.db.query("insert into store_members(store_id,user_id,role) values ($1,$2,'staff')", [id(1),id(5)]);
    const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
    const client = createHeadlessBackend({url:f.url,publishableKey:"sb_publishable_fixture"});
    await signInBackend(client,"user3@example.test","fixture-password","customer");
    const save = (reason: string, expected: number, product = id(21)) => f.as(5, async () => {
      const {rows} = await f.db.query<{promotion_id:string;promotion_version_id:string;version:number}>(`select * from kago_save_promotion($1::uuid,$2::uuid,'{app}','[]',100,$3,now()-interval '1 hour',now()+interval '7 days',null,$4)`,[id(1),product,reason,expected]);
      return rows[0];
    }, "store_staff");
    const before = await f.rpc("app_get_cart",[id(13)]);
    const first = await save("本日の店舗おすすめです",0);
    const a = await selectAndSave(client,id(13),rules);
    assert.equal(a.items.find(i=>i.placementType==="store_promo")?.product.productId,id(21));
    assert.equal(a.items.find(i=>i.placementType==="store_promo")?.reasonText,"本日の店舗おすすめです");
    const second = await save("新しいおすすめ理由です",first.version);
    const b = await selectAndSave(client,id(13),rules);
    assert.equal(b.cartVersion,a.cartVersion);assert.notEqual(b.selectionId,a.selectionId);
    assert.equal(b.items.find(i=>i.placementType==="store_promo")?.reasonText,"新しいおすすめ理由です");
    await assert.rejects(save("古い画面からの保存",first.version), e=>(e as {code:string}).code==="40001");
    await assert.rejects(save("",second.version), e=>(e as {code:string}).code==="22023");
    const still = await selectAndSave(client,id(13),rules);
    assert.equal(still.items.find(i=>i.placementType==="store_promo")?.promotionVersionId,second.promotion_version_id);
    await f.as(5,()=>f.db.query("update promotion_versions set status='inactive' where id=$1",[second.promotion_version_id]),"store_staff");
    const stopped = await selectAndSave(client,id(13),rules);
    assert.ok(stopped.items.every(i=>i.placementType!=="store_promo"));
    assert.deepEqual(await f.rpc("app_get_cart",[id(13)]),before);
    await save("別の商品をおすすめ",0,id(20));
    const changed = await selectAndSave(client,id(13),rules);
    assert.equal(changed.items.find(i=>i.placementType==="store_promo")?.product.productId,id(20));
    await f.rpc("app_set_cart_item",[id(13),id(9600),id(20),1,changed.cartVersion,"manual",null]);
    const inCart = await selectAndSave(client,id(13),rules);
    assert.ok(inCart.items.every(i=>i.product.productId!==id(20)));
    await assert.rejects(f.as(5,()=>f.db.query("select * from kago_save_promotion($1::uuid,$2::uuid,'{app}','[]',100,'他店舗',now(),now()+interval '1 day')",[id(2),id(20)]),"store_staff"),e=>(e as {code:string}).code==="42501");
  } finally {await f.close();}
});
