// Signage 端末がデータを読み書きする窓口。仮データ版（localStorage）と DB 版（Supabase）を同じ形にする
// エンジン（engine.ts）はこの窓口だけを使い、どちらにつながっているかを知らない
import { toBackendError } from "@kago/backend";
import { insertSignagePlays, loadSignageFeed, requireDevice, type SignageClient } from "@/lib/backend/signage";
import type { AdsRepository } from "@/lib/data/repository";
import type { Session, SignagePlay } from "@/lib/domain/types";
import type { SignageFeed } from "@/lib/signage/feed";

export type SignageSource = {
  /** 端末に保存する配信内容・未送信の記録を分ける名前 */
  cacheKey: string;
  /** 端末としてのログイン状態を確かめる。ログインが必要なら NeedLoginError を投げる */
  signIn(): Promise<Session>;
  getFeed(session: Session): Promise<SignageFeed>;
  /** 終わった再生記録を送る。DB に受け付けられなかった記録の id を返す（送り直しても通らないので捨てる） */
  recordPlays(session: Session, plays: SignagePlay[]): Promise<{ rejected: string[] }>;
};

/** 端末のアカウントでログインしていない（ログイン画面を出す） */
export class NeedLoginError extends Error {
  constructor() {
    super("端末としてログインしてください");
  }
}

/** 仮データ版。端末 ID だけで入れる（同じブラウザの Ads の確認画面と仮データを共有する） */
export function mockSignageSource(repo: AdsRepository, deviceId: string): SignageSource {
  return {
    cacheKey: deviceId,
    signIn: () => repo.signInDevice(deviceId),
    getFeed: (session) => repo.getSignageFeed(session),
    async recordPlays(session, plays) {
      await repo.recordPlays(session, plays);
      return { rejected: [] };
    },
  };
}

/** ログインし直す必要がある失敗なら NeedLoginError にする（それ以外の失敗はそのまま投げ、キャッシュで表示を続ける） */
async function orLogin<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && ["unauthenticated", "session_expired", "forbidden"].includes(toBackendError(error).code)) throw new NeedLoginError();
    throw error;
  }
}

/** DB 版。端末のアカウントのログインは Supabase のクライアントが端末に保存する */
export function supabaseSignageSource(client: SignageClient, options: {crowd?:boolean} = {}): SignageSource {
  return {
    cacheKey: "db",
    signIn: () => orLogin(() => requireDevice(client)),
    getFeed: (session) => orLogin(() => loadSignageFeed(client, session,new Date(),options.crowd)),
    recordPlays: (session, plays) => orLogin(() => insertSignagePlays(client, session, plays)),
  };
}
