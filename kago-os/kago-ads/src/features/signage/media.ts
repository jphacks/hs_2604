// Signage の素材の読み込み（SIG-01・SIG-03）。読み込んだ素材はブラウザの中の URL（blob:）にして表示する
// - 公開フォルダの素材（/ad-assets/…）：そのまま読む。保存は /signage/ の Service Worker が行う
// - DB の素材（非公開 Storage の相対パス）：その都度、署名付き URL で読む（URL は保存しない）。
//   通信が切れても表示を続けられるよう、読めた画像をブラウザの Cache に保存し、読めないときだけ使う。
//   パスは版ごとに新しく作られ上書きされない（COM-03）ので、保存した画像が別の内容に変わることはない
import { isStoragePath } from "@/lib/backend/signage";

const CACHE = "kago-signage-media-v1";

export type MediaDeps = {
  /** Storage の相対パスから署名付き URL を作る（DB 版だけ） */
  signedUrl?: (path: string) => Promise<string>;
  fetcher?: typeof fetch;
  caches?: CacheStorage;
  toUrl?: (blob: Blob) => string;
};

/** Cache の鍵。署名付き URL は毎回変わるので、パスから作った同じ鍵を使う */
export const cacheKeyOf = (path: string) => `https://kago-signage.invalid/media/${encodeURI(path)}`;

export function createMediaLoader(deps: MediaDeps = {}) {
  const fetcher = deps.fetcher ?? fetch;
  const store = deps.caches ?? (typeof caches === "undefined" ? undefined : caches);
  const toUrl = deps.toUrl ?? ((blob: Blob) => URL.createObjectURL(blob));

  return async function loadMedia(path: string): Promise<string> {
    if (!isStoragePath(path)) {
      const res = await fetcher(path);
      if (!res.ok) throw new Error(`${res.status}`);
      return toUrl(await res.blob());
    }
    if (!deps.signedUrl) throw new Error("この素材は DB 版でだけ読めます");
    try {
      const res = await fetcher(await deps.signedUrl(path));
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      try {
        await (await store?.open(CACHE))?.put(cacheKeyOf(path), new Response(blob, { headers: { "content-type": blob.type } }));
      } catch {
        // 保存できない環境では、開いている間だけ表示する
      }
      return toUrl(blob);
    } catch (error) {
      const hit = await (await store?.open(CACHE))?.match(cacheKeyOf(path));
      if (hit) return toUrl(await hit.blob());
      throw error;
    }
  };
}

/** 端末からログアウトしたときに、保存した DB の素材を消す */
export async function clearMediaCache(store: CacheStorage | undefined = typeof caches === "undefined" ? undefined : caches) {
  await store?.delete(CACHE).catch(() => false);
}
