export const DEMO_COOKIE = "kago-demo-persona";
export const DEMO_USERS = ["U1", "U2", "U3"] as const;
export type DemoUser = typeof DEMO_USERS[number];
export const demoLabels: Record<DemoUser, string> = { U1: "佐藤 美咲", U2: "田中 健", U3: "鈴木 結衣" };
const emails: Record<DemoUser, string> = { U1: "misaki.sato@example.test", U2: "ken.tanaka@example.test", U3: "yui.suzuki@example.test" };
export type DemoConfig = { storeId: string; users: Record<DemoUser, { email: string; password: string }> };

// Called only on the server. An explicit flag AND all three fictional accounts are required.
export function readDemoConfig(env: Record<string, string | undefined>): DemoConfig | null {
  if (env.KAGO_DEMO_ENABLED !== "1") return null;
  const storeId = env.KAGO_DEMO_STORE_ID;
  if (!storeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId)) return null;
  const users = {} as DemoConfig["users"];
  for (const user of DEMO_USERS) {
    const email = env[`KAGO_DEMO_${user}_EMAIL`];
    const password = env[`KAGO_DEMO_${user}_PASSWORD`];
    if (email !== emails[user] || !password) return null;
    users[user] = { email, password };
  }
  return { storeId, users };
}
export function isDemoUser(value: unknown): value is DemoUser { return DEMO_USERS.includes(value as DemoUser); }
