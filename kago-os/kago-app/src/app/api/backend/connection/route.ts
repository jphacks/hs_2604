import { backendErrorStatus, checkBackendConnection, toBackendError } from "@kago/backend";
import { createServerBackendClient } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const client = await createServerBackendClient({ writableCookies: true });
    const connection = await checkBackendConnection(client);
    // Never return an access token, email, password, or provider error message.
    return Response.json({ status: "connected", ...connection }, { headers });
  } catch (cause) {
    const error = toBackendError(cause);
    return Response.json({ status: error.code, message: error.message }, {
      status: backendErrorStatus(error), headers,
    });
  }
}
