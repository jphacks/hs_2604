import type { NextRequest } from "next/server";
import { updateBackendSession } from "@/lib/backend/proxy";

export async function proxy(request: NextRequest) {
  return updateBackendSession(request);
}

export const config = { matcher: ["/App/:path*"] };
