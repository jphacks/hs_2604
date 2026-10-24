import { BackendError, getBackendIdentity } from "@kago/backend";
import { mapStore, portalError, requireMaker, type MakerIdentity, type PortalClient, type StoreRow } from "./portal.ts";
import { requireStore, type StoreIdentity } from "./store-calls.ts";
import type { Store } from "../domain/types.ts";

export type AdsRole = "maker_staff" | "store_staff";
export type AdsIdentity = (MakerIdentity & { role: "maker_staff" })
  | (StoreIdentity & { role: "store_staff"; stores: Store[] });

export async function getAdsIdentity(client: PortalClient, preferred?: AdsRole): Promise<AdsIdentity> {
  const verified = await getBackendIdentity(client);
  const role = preferred ?? (verified.roles.includes("maker_staff") ? "maker_staff" : "store_staff");
  if (!verified.roles.includes(role)) throw new BackendError("forbidden");
  if (role === "maker_staff") return { ...await requireMaker(client), role };
  const identity = await requireStore(client);
  const { data, error } = await client.from("stores").select("id,slug,name,branch_name,timezone").in("id", identity.storeIds).order("name").order("id");
  if (error) throw portalError(error);
  if (!data?.length) throw new BackendError("forbidden");
  return { ...identity, role, stores: data.map((r) => mapStore(r as StoreRow)) };
}
