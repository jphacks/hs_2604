import "server-only";
import { createHash } from "node:crypto";
import { BackendError, createHeadlessBackend, signInBackend } from "@kago/backend";
import { getBackendConfig } from "@/lib/backend/config";
import { DEMO_USERS, demoLabels, type DemoConfig, type DemoUser } from "./config";
import { startShoppingVisit } from "@/features/shopping/service";

type Client = ReturnType<typeof createHeadlessBackend>;
const sessions = new Map<DemoUser, { until: number; client: Promise<Client> }>();
let fingerprint = "";

// Auth tokens stay in server memory. Neither Auth cookies nor tokens go to the browser.
export async function getDemoBackendClient(config: DemoConfig, user: DemoUser): Promise<Client> {
  const backend = getBackendConfig();
  const key = createHash("sha256").update(JSON.stringify([backend, config])).digest("hex");
  if (key !== fingerprint) { sessions.clear(); fingerprint = key; }
  const existing = sessions.get(user);
  if (existing && existing.until > Date.now()) return existing.client;
  const client = (async () => {
    try {
      const result = createHeadlessBackend(backend);
      await signInBackend(result, config.users[user].email, config.users[user].password, "customer");
      return result;
    } catch { throw new BackendError("connection_failed"); }
  })();
  const entry = { until: Date.now() + 5 * 60_000, client };
  sessions.set(user, entry);
  try { return await client; } catch (error) { if (sessions.get(user) === entry) sessions.delete(user); throw error; }
}
export async function loadDemoShopping(config: DemoConfig, user: DemoUser) {
  const client = await getDemoBackendClient(config, user);
  const context = await startShoppingVisit(client, { storeId: config.storeId, startNew: false, previousVisitId: null });
  return {
    ...context,
    stores: context.stores.filter(s => s.id === config.storeId),
    activeVisits: context.activeVisits.filter(v => v.store_id === config.storeId),
    demo: { user, label: demoLabels[user], users: DEMO_USERS.map(id => ({ id, label: demoLabels[id] })) },
  };
}
