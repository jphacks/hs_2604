import { BackendError, createHeadlessBackend, readBackendConfig, signInBackend, signOutBackend } from "@kago/backend";
import { loadShoppingContext } from "../src/features/shopping/service.ts";
import { accountError, loadAccountSettings, loadPurchaseHistory, saveAccountSetting } from "../src/features/account/service.ts";
import { loadRecommendationInput } from "../src/features/recommendations/input.ts";
import type { PersonalizationSettings, SettingKey } from "../src/features/account/contracts.ts";

// Default: read-only. Opt-in writes only toggle the dedicated tester's preferences
// and restore them with the exact revision returned by this script's own last write.
const write = process.env.KAGO_CHECK_ALLOW_SETTINGS_WRITE === "1";
const clients: ReturnType<typeof createHeadlessBackend>[] = [];
let initial: PersonalizationSettings | undefined;
let latest: PersonalizationSettings | undefined;
let visitId: string | undefined;
let restored = false;
let failed = false;
try {
  const config=readBackendConfig({url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});
  const email=process.env.KAGO_CHECK_CUSTOMER_A_EMAIL,password=process.env.KAGO_CHECK_CUSTOMER_A_PASSWORD,store=process.env.KAGO_CHECK_STORE_ID;
  if(!email||!password||!store)throw new BackendError("configuration_missing");
  const client=createHeadlessBackend(config);clients.push(client);await signInBackend(client,email,password,"customer");
  const context=await loadShoppingContext(client,null);
  const visits=context.activeVisits.filter(v=>v.store_id===store);
  if(visits.length!==1)throw new Error("Expected one verification visit");visitId=visits[0].id;
  initial=(await loadAccountSettings(client,visitId)).settings;latest=initial;
  const history=await loadPurchaseHistory(client,visitId);
  const input=await loadRecommendationInput(client,visitId);
  if(!initial.usePurchaseHistory&&input.history.orders.length)throw new Error("History gate failed");
  if(!initial.useCurrentCart&&input.cart.items.length)throw new Error("Cart gate failed");
  console.log(JSON.stringify({check:"read",result:"passed",historyOrdersOnFirstPage:history.orders.length,hasMore:!!history.nextCursor}));
  if(write){
    const second=createHeadlessBackend(config);clients.push(second);await signInBackend(second,email,password,"customer");
    for(const key of ["usePurchaseHistory","useCurrentCart"] as SettingKey[]){
      const changed=await saveAccountSetting(client,visitId,{key,value:!initial[key],expectedUpdatedAt:latest.updatedAt});latest=changed.settings;
      const reread=(await loadAccountSettings(second,visitId)).settings;
      if(reread[key]!==!initial[key])throw new Error("Setting restore across clients failed");
      const gated=await loadRecommendationInput(second,visitId);
      if(key==="usePurchaseHistory"&&!reread[key]&&(gated.history.orders.length||gated.history.summaries.length))throw new Error("History OFF failed");
      if(key==="useCurrentCart"&&!reread[key]&&gated.cart.items.length)throw new Error("Cart OFF failed");
      latest=(await saveAccountSetting(client,visitId,{key,value:initial[key],expectedUpdatedAt:latest.updatedAt})).settings;
    }
    console.log(JSON.stringify({check:"save-and-second-client-restore",result:"passed"}));
  }
}catch(error){failed=true;console.log(JSON.stringify({result:"failed",code:accountError(error).code}));}
finally {
  if(write&&clients[0]&&visitId&&initial&&latest){
    try{
      for(const key of ["usePurchaseHistory","useCurrentCart"] as SettingKey[]){
        latest=(await saveAccountSetting(clients[0],visitId,{key,value:initial[key],expectedUpdatedAt:latest.updatedAt})).settings;
      }
      const actual=(await loadAccountSettings(clients[0],visitId)).settings;
      restored=actual.usePurchaseHistory===initial.usePurchaseHistory&&actual.useCurrentCart===initial.useCurrentCart;
    }catch{failed=true;}
    console.log(JSON.stringify({check:"original-settings-restored",result:restored?"passed":"failed"}));
  }
  for(const client of clients)try{await signOutBackend(client);}catch{/* Do not print provider details. */}
}
if(failed)process.exitCode=1;
