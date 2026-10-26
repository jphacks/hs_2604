/** Only normalize the Ads service prefix; preserve resource IDs and other services. */
export function canonicalAdsPath(pathname: string): string {
  return pathname.replace(/^\/ads(?=\/|$)/i, "/ads");
}
