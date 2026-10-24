import { BackendError, getBackendIdentity } from "@kago/backend";
import { ValidationError, type AdCallInput, type AdsRepository } from "../data/repository";
import { validateAdCall } from "../domain/rules";
import { CHANNELS, DISCLOSURE_METRICS, type AdCall, type AdCallStatus, type Session } from "../domain/types";
import { mapAdCall, portalError, type AdCallRow, type PortalClient } from "./portal";

export type StoreIdentity = { userId: string; storeIds: string[] };
export type StoreCallsRepository = Pick<AdsRepository, "listCategories" | "getAdCall" | "listMyAdCalls"> & {
  saveAdCall(session: Session, input: AdCallInput, id?: string, expectedUpdatedAt?: string): Promise<AdCall>;
  setAdCallStatus(session: Session, id: string, status: AdCallStatus, expectedUpdatedAt?: string): Promise<AdCall>;
};
export async function requireStore(client: PortalClient): Promise<StoreIdentity> {
  const identity = await getBackendIdentity(client, "store_staff");
  const { data, error } = await client.from("store_members").select("store_id").eq("user_id", identity.userId);
  if (error) throw portalError(error);
  const storeIds = (data ?? []).map((row: { store_id: string }) => row.store_id);
  if (!storeIds.length) throw new BackendError("forbidden");
  return { userId: identity.userId, storeIds };
}
const columns = "id,store_id,title,description,categories,channels,starts_at,ends_at,status,disclosure_scope,created_at,updated_at";
const conflict = () => new Error("募集が更新されています。再読み込みして最新の内容を確認してください。");
export function storeCallError(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code;
  if (code === "23514") return new Error("現在の募集状態では保存できません。入力内容と公開後の変更制限を確認してください。");
  if (code === "23505") return conflict();
  return portalError(error);
}
export function adCallWrite(input: AdCallInput): AdCallInput {
  const errors = validateAdCall(input);
  if (!Number.isFinite(Date.parse(input.starts_at)) || !Number.isFinite(Date.parse(input.ends_at))) errors.push("有効な掲載期間を入力してください");
  if (input.categories.some((c) => !c.trim()) || new Set(input.categories).size !== input.categories.length) errors.push("対象カテゴリを確認してください");
  if (input.channels.some((c) => !CHANNELS.includes(c)) || new Set(input.channels).size !== input.channels.length) errors.push("掲載先を確認してください");
  if (input.disclosure_scope.some((m) => !DISCLOSURE_METRICS.includes(m)) || new Set(input.disclosure_scope).size !== input.disclosure_scope.length) errors.push("成果の公開範囲を確認してください");
  if (input.description.trim().length > 2000) errors.push("案内文は2000字以内にしてください");
  if (errors.length) throw new ValidationError(errors);
  // id・status・store_idなどを入力のスプレッドから受け取らない。
  return { title: input.title.trim(), categories: [...input.categories], channels: [...input.channels],
    starts_at: input.starts_at, ends_at: input.ends_at, description: input.description.trim(), disclosure_scope: [...input.disclosure_scope] };
}
/** 本人の所属を毎回検証する。画面の店舗IDだけでは保存を許可しない。 */
export function createSupabaseStoreCallsRepository(client: PortalClient): StoreCallsRepository {
  async function storeOf(session: Session) {
    const identity = await requireStore(client);
    if (session.role !== "store_staff" || !identity.storeIds.includes(session.storeId)) throw new BackendError("forbidden");
    return session.storeId;
  }
  async function current(session: Session, id: string) {
    const storeId = await storeOf(session);
    const { data, error } = await client.from("ad_calls").select(columns).eq("store_id", storeId).eq("id", id).maybeSingle();
    if (error) throw storeCallError(error);
    return data ? mapAdCall(data as AdCallRow) : undefined;
  }
  function checkCurrent(row: AdCall | undefined, expected?: string): asserts row is AdCall {
    if (!row) throw new BackendError("forbidden");
    if (expected && row.updated_at !== expected) throw conflict();
    if (row.status === "closed") throw new Error("終了した募集は変更・再公開できません。");
  }
  return {
    async listCategories() {
      await requireStore(client);
      const { data, error } = await client.from("products").select("category").order("category");
      if (error) throw storeCallError(error);
      return [...new Set((data ?? []).map((r: { category: string }) => r.category))];
    },
    getAdCall: current,
    async listMyAdCalls(session) {
      const storeId = await storeOf(session);
      const { data, error } = await client.from("ad_calls").select(columns).eq("store_id", storeId).order("created_at", { ascending: false }).order("id");
      if (error) throw storeCallError(error);
      return (data ?? []).map((row) => mapAdCall(row as AdCallRow));
    },
    async saveAdCall(session, input, id, expectedUpdatedAt) {
      const storeId = await storeOf(session);
      const values = adCallWrite(input);
      if (!id) {
        const { data, error } = await client.from("ad_calls").insert({ ...values, store_id: storeId, status: "draft" }).select(columns).single();
        if (error) throw storeCallError(error);
        return mapAdCall(data as AdCallRow);
      }
      const row = await current(session, id);
      checkCurrent(row, expectedUpdatedAt);
      if (row.status === "open" && (JSON.stringify(row.channels) !== JSON.stringify(values.channels)
        || Date.parse(row.starts_at) !== Date.parse(values.starts_at) || Date.parse(row.ends_at) !== Date.parse(values.ends_at))) {
        throw new Error("公開後は掲載期間と掲載先を変更できません。新しい募集を作成してください。");
      }
      const { data, error } = await client.from("ad_calls").update(values).eq("id", id).eq("store_id", storeId)
        .eq("updated_at", row.updated_at).eq("status", row.status).select(columns).maybeSingle();
      if (error) throw storeCallError(error);
      if (!data) throw conflict();
      return mapAdCall(data as AdCallRow);
    },
    async setAdCallStatus(session, id, status, expectedUpdatedAt) {
      const storeId = await storeOf(session);
      const row = await current(session, id);
      checkCurrent(row, expectedUpdatedAt);
      if (!((row.status === "draft" && status === "open") || (row.status === "open" && status === "closed"))) {
        throw new Error("募集は下書きから公開、公開から終了の順に変更してください。");
      }
      const { data, error } = await client.from("ad_calls").update({ status }).eq("id", id).eq("store_id", storeId)
        .eq("updated_at", row.updated_at).eq("status", row.status).select(columns).maybeSingle();
      if (error) throw storeCallError(error);
      if (!data) throw conflict();
      return mapAdCall(data as AdCallRow);
    },
  };
}
