import { BackendError, getBackendIdentity, toBackendError, type createBrowserBackend } from "@kago/backend";
import type { AdApplication, AdCall, Channel, DisclosureMetric, Session, SignageDevice, Store } from "../domain/types";

export type PortalClient = ReturnType<typeof createBrowserBackend>;
export type MakerIdentity = { userId: string; makerIds: string[] };
export type PortalRepository = {
  listStores(): Promise<Store[]>;
  listCategories(): Promise<string[]>;
  listPublicAdCalls(): Promise<AdCall[]>;
  getAdCall(session: Session, id: string): Promise<AdCall | undefined>;
  listSignageDevices(storeId: string): Promise<SignageDevice[]>;
  listMyApplications(session: Session): Promise<Pick<AdApplication, "id" | "ad_call_id">[]>;
};

export type StoreRow = { id: string; slug: string; name: string; branch_name: string | null; timezone: string };
export type AdCallRow = {
  id: string; store_id: string; title: string; description: string | null;
  categories: string[]; channels: Channel[]; starts_at: string; ends_at: string;
  status: "draft" | "open" | "closed"; disclosure_scope: DisclosureMetric[];
  created_at: string; updated_at: string;
};
export const mapStore = (row: StoreRow): Store => ({
  ...row, branch_name: row.branch_name ?? "", description: "", address: "",
});
export const mapAdCall = (row: AdCallRow): AdCall => ({ ...row, description: row.description ?? "" });

export function portalError(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code ?? "")) {
    return new Error("募集データのDB設定がまだ適用されていません。担当者に確認してください。");
  }
  return toBackendError(error);
}

export async function requireMaker(client: PortalClient): Promise<MakerIdentity> {
  const identity = await getBackendIdentity(client, "maker_staff");
  const { data, error } = await client.from("maker_members").select("maker_id").eq("user_id", identity.userId);
  if (error) throw portalError(error);
  const makerIds = (data ?? []).map((row: { maker_id: string }) => row.maker_id);
  if (makerIds.length === 0) throw new BackendError("forbidden");
  return { userId: identity.userId, makerIds };
}

const callColumns = "id,store_id,title,description,categories,channels,starts_at,ends_at,status,disclosure_scope,created_at,updated_at";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 本人セッションと正式RLSによる読取専用の窓口。仮データへのフォールバックはしない。 */
export function createSupabasePortalRepository(client: PortalClient): PortalRepository {
  async function rows<T>(load: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
    await requireMaker(client);
    const { data, error } = await load();
    if (error) throw portalError(error);
    return (data ?? []) as T[];
  }
  return {
    async listStores() {
      return (await rows<StoreRow>(() => client.from("stores")
        .select("id,slug,name,branch_name,timezone").order("name").order("id"))).map(mapStore);
    },
    async listCategories() {
      return [...new Set((await rows<{ category: string }>(() => client.from("products")
        .select("category").order("category"))).map((row) => row.category))];
    },
    async listPublicAdCalls() {
      return (await rows<AdCallRow>(() => client.from("ad_calls").select(callColumns)
        .neq("status", "draft").order("starts_at", { ascending: false }).order("id")))
        .filter((row) => row.status !== "draft").map(mapAdCall);
    },
    async getAdCall(_session, id) {
      await requireMaker(client);
      if (!uuid.test(id)) return undefined;
      const { data, error } = await client.from("ad_calls").select(callColumns)
        .eq("id", id).neq("status", "draft").maybeSingle();
      if (error) throw portalError(error);
      return data && data.status !== "draft" ? mapAdCall(data as AdCallRow) : undefined;
    },
    async listSignageDevices(storeId) {
      if (!uuid.test(storeId)) { await requireMaker(client); return []; }
      // auth_user_id は列権限でも禁止される。必要な公開列だけを取得する。
      return rows<SignageDevice>(() => client.from("signage_devices")
        .select("id,store_id,slug,location").eq("store_id", storeId).eq("is_active", true).order("id"));
    },
    async listMyApplications() {
      const identity = await requireMaker(client);
      const { data, error } = await client.from("ad_applications")
        .select("id,ad_call_id").in("maker_id", identity.makerIds).order("id");
      if (error) throw portalError(error);
      return data ?? [];
    },
  };
}
