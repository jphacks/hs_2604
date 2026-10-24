const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only accept this deployment's App entry URLs; never navigate to scanned content. */
export function parseStoreQr(value: string, origin: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.pathname !== "/App" || url.hash || url.username || url.password) return null;
    const ids = url.searchParams.getAll("store");
    return ids.length === 1 && uuid.test(ids[0]) ? ids[0].toLowerCase() : null;
  } catch { return null; }
}
