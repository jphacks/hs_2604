import { NextResponse, type NextRequest } from "next/server";
import { canonicalAdsPath } from "../../shared/routes/ads-entry";

export function proxy(request: NextRequest) {
  const canonical = canonicalAdsPath(request.nextUrl.pathname);
  if (canonical === request.nextUrl.pathname) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = canonical;
  return NextResponse.redirect(url, 307);
}
export const config = { matcher: ["/:service([aA][dD][sS])/:path*"] };
