import { NextResponse, type NextRequest } from "next/server";
import { updateBackendSession } from "@/lib/backend/proxy";
import { canonicalAdsPath } from "../../shared/routes/ads-entry";

export async function proxy(request: NextRequest) {
  const canonical = canonicalAdsPath(request.nextUrl.pathname);
  if (canonical !== request.nextUrl.pathname) {
    const url = request.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, 307);
  }
  // Ads has its own session. Do not refresh or replace App cookies here.
  if (/^\/ads(?:\/|$)/.test(canonical)) return NextResponse.next();
  return updateBackendSession(request);
}

export const config = { matcher: ["/App/:path*", "/:service([aA][dD][sS])/:path*"] };
