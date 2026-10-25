export const insightBasePath = process.env.NEXT_PUBLIC_INSIGHT_BASE_PATH === "/insight" ? "/insight" : "";

// Next Link and next/navigation redirects apply basePath themselves. Use this
// only for raw URLs (Route Handler responses, public assets, native anchors).
export const insightPath = (path: string) => `${insightBasePath}${path}`;
export const insightCookieScope = { name: "kago-insight-auth", path: insightBasePath || "/" };
