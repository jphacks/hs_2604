import { getBackendIdentity, type createHeadlessBackend } from "@kago/backend";
import { cartError, readCart } from "../cart/service.ts";
import { isUuid } from "../shopping/service.ts";
import { checkoutMessages, isCheckoutIntent, type CheckoutContext, type CheckoutReceipt } from "./contracts.ts";

type Client = ReturnType<typeof createHeadlessBackend>;
export class CheckoutError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, status = 400) { super(checkoutMessages[code] ?? checkoutMessages.connection_failed); this.code = code; this.status = status; }
}
export function checkoutError(error: unknown) {
  if (error instanceof CheckoutError) return error;
  const db = error as {code?:string;details?:string};
  if (db?.code === "40001") return new CheckoutError(db.details === "price_changed" ? "price_changed" : "cart_changed", 409);
  if (db?.code === "23505") return new CheckoutError("checkout_conflict", 409);
  if (db?.code === "23514") return new CheckoutError("checkout_unavailable", 409);
  if (["22023","22P02","22003"].includes(db?.code ?? "")) return new CheckoutError("invalid_request");
  const safe = cartError(error);
  return { ...safe, message: checkoutMessages[safe.code] ?? safe.message };
}
async function storeName(client: Client, storeId: string) {
  const {data,error} = await client.from("stores").select("name,branch_name").eq("id",storeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new CheckoutError("forbidden",403);
  return [data.name,data.branch_name].filter(Boolean).join(" ");
}
async function receipt(client: Client, userId: string, visitId: string): Promise<CheckoutReceipt> {
  const {data,error} = await client.from("orders").select("id,visit_id,store_id,ordered_at,total,data_origin,order_items(product_id,product_name,unit_price,quantity),order_discounts(product_id,amount)")
    .eq("user_id",userId).eq("visit_id",visitId).maybeSingle();
  if (error) throw error;
  if (!data) throw new CheckoutError("checkout_unavailable",409);
  const lines = data.order_items.map(item => ({productId:item.product_id,name:item.product_name,unitPrice:item.unit_price,quantity:item.quantity,
    discount:data.order_discounts.filter(d=>d.product_id===item.product_id).reduce((sum,d)=>sum+d.amount,0)}));
  const subtotal = lines.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  return {orderId:data.id,visitId:data.visit_id,storeId:data.store_id,storeName:await storeName(client,data.store_id),orderedAt:data.ordered_at,
    total:data.total,subtotal,discountTotal:subtotal-data.total,dataOrigin:data.data_origin,lines};
}
export async function loadCheckout(client: Client, selectedVisit: unknown): Promise<CheckoutContext> {
  const {userId} = await getBackendIdentity(client,"customer");
  if (selectedVisit == null || selectedVisit === "") return {userId,state:"no_visit"};
  if (!isUuid(selectedVisit)) throw new CheckoutError("invalid_request");
  const {data:visit,error} = await client.from("visits").select("id,store_id,status").eq("id",selectedVisit).eq("user_id",userId).maybeSingle();
  if (error) throw error;
  if (!visit) throw new CheckoutError("forbidden",403);
  if (visit.status === "completed") return {userId,state:"complete",receipt:await receipt(client,userId,visit.id)};
  if (visit.status !== "active") return {userId,state:"no_visit"};
  const cart = await readCart(client,visit.id);
  const subtotal = cart.cart.reduce((sum,line)=>sum+line.price*line.quantity,0), discountTotal=cart.discountTotal??0;
  return {userId,state:"review",quote:{userId,visitId:visit.id,storeId:visit.store_id,storeName:await storeName(client,visit.store_id),
    cartVersion:cart.visit.cart_version,lines:cart.cart,subtotal,discountTotal,total:subtotal-discountTotal,
    canCheckout:cart.cart.length>0 && cart.cart.every(line=>line.available)}};
}
export async function confirmCheckout(client: Client, input: unknown): Promise<CheckoutContext> {
  const {userId} = await getBackendIdentity(client,"customer");
  if (!isCheckoutIntent(input)) throw new CheckoutError("invalid_request");
  if (input.userId !== userId) throw new CheckoutError("forbidden",403);
  // Keep the confirmed visit/key/version/discounted total unchanged on retry, including after visit end.
  const {data,error} = await client.rpc("kago_checkout",{p_visit_id:input.visitId,p_idempotency_key:input.requestId,
    p_expected_cart_version:input.expectedVersion,p_expected_total:input.expectedTotal});
  if (error) throw error;
  const result=Array.isArray(data)?data[0]:data;
  if (!result || !isUuid(result.order_id)) throw new CheckoutError("connection_failed",503);
  const saved=await receipt(client,userId,input.visitId);
  if (saved.orderId!==result.order_id) throw new CheckoutError("connection_failed",503);
  return {userId,state:"complete",receipt:saved,replayed:result.replayed===true};
}
