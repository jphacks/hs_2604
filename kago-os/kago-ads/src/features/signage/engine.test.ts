import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeed } from "@/data/demo/seed";
import { createMockRepository, memoryStorage } from "@/lib/data/mock-repository";
import type { Session, SignagePlay } from "@/lib/domain/types";
import type { SignageFeed } from "@/lib/signage/feed";
import { endPlay, startPlay } from "@/lib/signage/plays";
import { SignageEngine } from "./engine";
import { cacheKeyOf, clearMediaCache, createMediaLoader } from "./media";
import { NeedLoginError, type SignageSource } from "./source";

const DAY = "2026-10-25";
const T17 = new Date(`${DAY}T17:00:00+09:00`).getTime();

function memoryKv() {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), m };
}
const json = <T,>(kv: ReturnType<typeof memoryKv>, name: string) => JSON.parse(kv.get(`kago-signage-${name}-v1:T`) ?? "null") as T;

let session: Session;
let feed: SignageFeed;
beforeAll(async () => {
  const repo = createMockRepository(memoryStorage(), () => createSeed(DAY));
  session = await repo.signInDevice("D1");
  feed = await repo.getSignageFeed(session, new Date(T17));
});

function engineWith(source: Partial<SignageSource>, kv = memoryKv()) {
  const full: SignageSource = {
    cacheKey: "T",
    signIn: async () => session,
    getFeed: async () => feed,
    recordPlays: async () => ({ rejected: [] }),
    ...source,
  };
  const engine = new SignageEngine({ source: full, kv, loadMedia: async (p) => `blob:${p}`, now: () => T17 });
  return { engine, kv };
}

describe("Signage 端末の再生の仕組み（DB 版で増えた動き）", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] }));
  afterEach(() => vi.useRealTimers());

  it("ログインしていなければログイン画面にし、ログイン後に表示を始める", async () => {
    let loggedIn = false;
    const { engine } = engineWith({ signIn: async () => { if (!loggedIn) throw new NeedLoginError(); return session; } });
    await engine.start();
    expect(engine.getState().phase).toBe("login");
    loggedIn = true;
    await engine.afterLogin();
    await vi.advanceTimersByTimeAsync(300);
    expect(engine.getState()).toMatchObject({ phase: "running", online: true });
    expect(engine.getState().screen?.item?.key).toBe("PL1");
    engine.stop();
  });

  it("通信できない起動では、保存したログイン情報と期限内の配信内容で表示を続ける", async () => {
    const kv = memoryKv();
    kv.set("kago-signage-session-v1:T", JSON.stringify(session));
    kv.set("kago-signage-feed-v1:T", JSON.stringify(feed));
    const { engine } = engineWith({ signIn: async () => { throw new TypeError("fetch failed"); } }, kv);
    await engine.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(engine.getState()).toMatchObject({ phase: "running", online: false });
    expect(engine.getState().screen?.item?.key).toBe("PL1");
    engine.stop();
  });

  it("保存したログイン情報があっても、ログインが切れていればログイン画面にする", async () => {
    const kv = memoryKv();
    kv.set("kago-signage-session-v1:T", JSON.stringify(session));
    kv.set("kago-signage-feed-v1:T", JSON.stringify(feed));
    const { engine } = engineWith({ signIn: async () => { throw new NeedLoginError(); } }, kv);
    await engine.start();
    expect(engine.getState().phase).toBe("login");
    engine.stop();
  });

  it("表示中にログインが切れたら、表示をやめて保存した配信内容を消す（未送信の記録は残す）", async () => {
    let expired = false;
    const { engine, kv } = engineWith({ getFeed: async () => { if (expired) throw new NeedLoginError(); return feed; } });
    await engine.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(engine.getState().phase).toBe("running");
    expired = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(engine.getState()).toMatchObject({ phase: "login", screen: null });
    expect(json(kv, "feed")).toBeNull();
    expect(json<SignagePlay[]>(kv, "outbox").length).toBeGreaterThan(0);
  });

  it("別の端末のアカウントの記録は送らずに残し、記録を送れなくても配信内容は取り直す", async () => {
    const kv = memoryKv();
    const other = endPlay(startPlay("D9", null, "no_content", `${DAY}T16:00:00+09:00`, "other-1"), `${DAY}T16:00:10+09:00`, "updated");
    const mine = endPlay(startPlay("D1", feed.items[1], "no_content", `${DAY}T16:00:10+09:00`, "mine-1"), `${DAY}T16:00:20+09:00`, "completed");
    kv.set("kago-signage-outbox-v1:T", JSON.stringify([other, mine]));
    const sent: string[][] = [];
    let feeds = 0;
    const { engine } = engineWith({
      recordPlays: async (_s, plays) => { sent.push(plays.map((p) => p.id)); throw new TypeError("fetch failed"); },
      getFeed: async () => { feeds += 1; return feed; },
    }, kv);
    await engine.start();
    expect(sent).toEqual([["mine-1"]]);
    expect(feeds).toBe(1);
    expect(engine.getState()).toMatchObject({ phase: "running", online: true });
    expect(json<SignagePlay[]>(kv, "outbox").map((p) => p.id)).toEqual(expect.arrayContaining(["other-1", "mine-1"]));
    engine.stop();
  });

  it("DB に受け付けられなかった記録は数えて捨て、送り直さない", async () => {
    const kv = memoryKv();
    const bad = endPlay(startPlay("D1", feed.items[0], "no_content", `${DAY}T16:00:00+09:00`, "bad-1"), `${DAY}T16:00:10+09:00`, "completed");
    const good = endPlay(startPlay("D1", feed.items[1], "no_content", `${DAY}T16:00:10+09:00`, "good-1"), `${DAY}T16:00:20+09:00`, "completed");
    kv.set("kago-signage-outbox-v1:T", JSON.stringify([bad, good]));
    const sent: string[][] = [];
    const { engine } = engineWith({ recordPlays: async (_s, plays) => { sent.push(plays.map((p) => p.id)); return { rejected: ["bad-1"] }; } }, kv);
    await engine.start();
    expect(sent).toEqual([["bad-1", "good-1"]]);
    expect(engine.getState()).toMatchObject({ sent: 1, rejected: 1 });
    expect(json<SignagePlay[]>(kv, "outbox").map((p) => p.id)).not.toContain("bad-1");
    await vi.advanceTimersByTimeAsync(5_300);
    expect(sent.flat().filter((x) => x === "bad-1")).toHaveLength(1);
    engine.stop();
  });
});

function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    put: async (key: string, res: Response) => void store.set(key, res),
    match: async (key: string) => store.get(key)?.clone(),
  };
  return { open: async () => cache, delete: async () => (store.clear(), true), store } as unknown as CacheStorage & { store: Map<string, Response> };
}

describe("Signage の素材の読み込み", () => {
  const toUrl = (b: Blob) => `blob:${b.size}`;
  const path = "00000000-0000-4000-8000-000000000011/00000000-0000-4000-8000-000000000051/00000000-0000-4000-8000-000000000091.png";

  it("公開フォルダの素材はそのまま読む", async () => {
    const fetcher = vi.fn(async () => new Response(new Blob(["abc"])));
    expect(await createMediaLoader({ fetcher, toUrl })("/ad-assets/x.png")).toBe("blob:3");
    expect(fetcher).toHaveBeenCalledWith("/ad-assets/x.png");
  });

  it("DB の素材は署名付き URL で読み、通信できないときは保存した画像を使う。URL は保存しない", async () => {
    const caches = fakeCaches();
    let online = true;
    const signedUrl = vi.fn(async () => { if (!online) throw new Error("offline"); return "https://storage.example/signed?token=1"; });
    const fetcher = vi.fn(async () => new Response(new Blob(["image"], { type: "image/png" })));
    const load = createMediaLoader({ signedUrl, fetcher, caches, toUrl });
    expect(await load(path)).toBe("blob:5");
    expect([...caches.store.keys()]).toEqual([cacheKeyOf(path)]);
    expect(cacheKeyOf(path)).not.toContain("token");
    online = false;
    expect(await load(path)).toBe("blob:5");
    await expect(load(path.replace("91", "99"))).rejects.toThrow();
    await clearMediaCache(caches);
    await expect(load(path)).rejects.toThrow();
  });

  it("仮データ版では DB の素材を読まない", async () => {
    await expect(createMediaLoader({ toUrl })(path)).rejects.toThrow("DB 版");
  });
});
