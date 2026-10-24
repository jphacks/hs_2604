import type { SupabaseClient, User } from "@supabase/supabase-js";
import { BackendError, toBackendError } from "./errors.ts";

export const roles = ["customer", "store_staff", "maker_staff", "signage"] as const;
export type BackendRole = typeof roles[number];
export type BackendIdentity = {
  userId: string;
  roles: BackendRole[];
  device?: { deviceId: string; storeId: string };
};

// Call only with a User verified by Auth (getUser), never a decoded cookie/JWT.
function identityFromUser(user: User): BackendIdentity {
  const metadata = user.app_metadata.kago as { roles?: unknown; device_id?: unknown; store_id?: unknown } | undefined;
  if (!metadata || !Array.isArray(metadata.roles) || metadata.roles.length === 0 || metadata.roles.some((role) => !roles.includes(role))) {
    throw new BackendError("forbidden");
  }
  const identity: BackendIdentity = { userId: user.id, roles: [...new Set(metadata.roles)] };
  if (identity.roles.includes("signage")) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (identity.roles.length !== 1 || typeof metadata.device_id !== "string" || typeof metadata.store_id !== "string" || !uuid.test(metadata.device_id) || !uuid.test(metadata.store_id)) {
      throw new BackendError("forbidden");
    }
    identity.device = { deviceId: metadata.device_id, storeId: metadata.store_id };
  }
  return identity;
}

export async function getBackendIdentity(client: SupabaseClient, requiredRole?: BackendRole): Promise<BackendIdentity> {
  try {
    // Contacts Auth: validates the token and reflects logout/admin metadata changes.
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new BackendError("unauthenticated");
    const identity = identityFromUser(data.user);
    if (requiredRole && !identity.roles.includes(requiredRole)) throw new BackendError("forbidden");
    return identity;
  } catch (error) { throw toBackendError(error); }
}

export async function signInBackend(client: SupabaseClient, email: string, password: string, requiredRole?: BackendRole) {
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return await getBackendIdentity(client, requiredRole);
  } catch (error) {
    // A role mismatch must not leave a successfully authenticated session behind.
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw toBackendError(error);
  }
}

export async function signOutBackend(client: SupabaseClient) {
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
  } catch (error) { throw toBackendError(error); }
}

export async function checkBackendConnection(client: SupabaseClient, requiredRole?: BackendRole) {
  const identity = await getBackendIdentity(client, requiredRole);
  try {
    const { data, error } = await client.rpc("kago_connection_check");
    if (error) throw error;
    if (data !== true) throw new BackendError("forbidden");
    return { identity, database: "connected" as const };
  } catch (error) { throw toBackendError(error); }
}
