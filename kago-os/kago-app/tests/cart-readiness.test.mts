import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createCartDatabase } from "./fixtures/cart-database.mts";
const sql = await readFile(new URL("../../kago-core/supabase/checks/app-cart-readiness.sql", import.meta.url), "utf8");
test("readiness distinguishes deployed RPCs, revoked grants and missing migration without exposing rows", async () => {
  const { db } = await createCartDatabase();
  try {
    const check = async () => (await db.query<{ready:boolean; installed_functions:number; missing_functions:string[]; receipt_protected:boolean}>(sql)).rows[0];
    assert.equal((await check()).ready, true);
    await db.exec("begin; revoke execute on function app_get_cart(uuid) from authenticated");
    assert.equal((await check()).ready, false);
    await db.exec("rollback; begin; grant select on app_cart_requests to authenticated");
    assert.equal((await check()).receipt_protected, false);
    await db.exec("rollback; begin; grant execute on function app_get_cart(uuid) to anon");
    assert.equal((await check()).ready, false);
    await db.exec("rollback; begin; drop function app_get_cart(uuid) cascade; drop function app_list_products(uuid,text,integer); drop function app_lookup_product(uuid,uuid,text,uuid,text); drop function app_set_cart_item(uuid,uuid,uuid,integer,integer,text,uuid); drop table app_cart_requests");
    const missing = await check();
    assert.equal(missing.ready, false);
    assert.equal(missing.installed_functions, 0);
    assert.equal(missing.missing_functions.length, 4);
    await db.exec("rollback");
  } finally { await db.close(); }
});
