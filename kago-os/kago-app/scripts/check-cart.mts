// Read-only deployment check. Values come only from the ignored local environment file.
import { BackendError, createHeadlessBackend, signInBackend, signOutBackend, readBackendConfig } from "@kago/backend";
import { loadShoppingContext } from "../src/features/shopping/service.ts";
import { readCart, listProducts, cartError } from "../src/features/cart/service.ts";

let client: ReturnType<typeof createHeadlessBackend> | undefined;
try {
  client = createHeadlessBackend(readBackendConfig({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }));
  const email=process.env.KAGO_CHECK_CUSTOMER_A_EMAIL;
  const password=process.env.KAGO_CHECK_CUSTOMER_A_PASSWORD;
  const store=process.env.KAGO_CHECK_STORE_ID;
  if(!email || !password || !store) throw new BackendError("configuration_missing");
  await signInBackend(client,email,password,"customer");
  const context=await loadShoppingContext(client,null);
  const visits=context.activeVisits.filter(v=>v.store_id===store);
  if(visits.length!==1) { console.log("FAIL: verification requires one existing active visit in the configured store; no visit was created.");process.exitCode=1; }
  else {
    const snapshot=await readCart(client,visits[0].id);
    const products=await listProducts(client,visits[0].id,"",0);
    console.log(JSON.stringify({result:"passed",mode:"read-only",cartLines:snapshot.cart.length,listedProducts:products.products.length,mutationVerified:false}));
  }
}catch(error){console.log(JSON.stringify({result:"failed",code:cartError(error).code,mode:"read-only"}));process.exitCode=1;}
finally {if(client)try{await signOutBackend(client);}catch{/* No provider detail or credentials in output. */}}
