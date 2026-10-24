import "server-only";
import { BackendError } from "@kago/backend";
import { DEMO_USERS, demoLabels, type DemoConfig, type DemoUser } from "@/features/demo/config";
import { getDemoBackendClient } from "@/features/demo/server";
import { startShoppingVisit } from "@/features/shopping/service";
import { ASSOCIATION_RULES } from "@/features/recommendations/association-rules";
import { loadCouponHistory } from "./service";
import { compareCoupon, regularProductIds } from "./demo-compare";
import type { CouponDecision } from "./targeting";
import type { OfferList, StoreOffer } from "./contracts";

export type DemoComparison = {
  user: DemoUser; label: string;
  decision: CouponDecision;
  offers: StoreOffer[];
  regularProducts: string[];
  claimedCouponCount: number;
};

// Each customer is read with their own demo session (RLS unchanged): the live store offers (so a rate
// changed in Insight shows up on reload) and the history they allowed. The cart itself is not touched.
export async function loadDemoComparison(config: DemoConfig, triggerCode: string) {
  const rows = await Promise.all(DEMO_USERS.map(async user => {
    const client = await getDemoBackendClient(config, user);
    const context = await startShoppingVisit(client, { storeId: config.storeId, startNew: false, previousVisitId: null });
    const visitId = context.visit!.id;
    const { data, error } = await client.rpc("app_list_offers", { p_visit_id: visitId });
    if (error) throw error;
    const list = data as OfferList;
    const history = await loadCouponHistory(client, visitId);
    const regularIds = regularProductIds(history);
    const products = await client.from("products").select("id,code,name").or(
      [`code.eq.${triggerCode}`, ...(regularIds.length ? [`id.in.(${regularIds.join(",")})`] : [])].join(","));
    if (products.error) throw products.error;
    const trigger = products.data?.find(product => product.code === triggerCode);
    if (!trigger) throw new BackendError("database_not_ready");
    return { user, label: demoLabels[user], trigger: { code: trigger.code, name: trigger.name },
      decision: compareCoupon({ offers: list.offers, trigger, history, rules: ASSOCIATION_RULES }),
      offers: list.offers,
      regularProducts: (products.data ?? []).filter(product => regularIds.includes(product.id)).map(product => product.name),
      claimedCouponCount: list.claimedCouponCount ?? 0 };
  }));
  const people: DemoComparison[] = rows;
  return { trigger: rows[0].trigger, people };
}
