// 仮データで動く AdsRepository。ブラウザの localStorage に保存する（テストではメモリに保存）
// 権限の確認は DB-06 で RLS にする内容と同じにしておく。承認・却下・停止は DB-08 の関数の代わり
import {
  canResubmit,
  latestRevision,
  validateAdCall,
  validateApplication,
  validateApprovalChannels,
  validateReviewComment,
} from "../domain/rules";
import type { AdApplication, AdCall, AdPlacement, ApplicationRevision, CreativeVersion, Session } from "../domain/types";
import {
  type AdCallInput,
  type AdsRepository,
  type ApplicationInput,
  type CreativeInput,
  type CreativeWithVersions,
  PermissionError,
  ValidationError,
} from "./repository";
import { createSeed, type MockDb } from "../../data/demo/seed";

export type MockStorage = { load(): MockDb | null; save(db: MockDb): void };

const STORAGE_KEY = "kago-ads-mock-v2";

export function browserStorage(): MockStorage {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const db = raw ? (JSON.parse(raw) as MockDb) : null;
        return db?.version === 2 ? db : null;
      } catch {
        return null;
      }
    },
    save(db) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch {
        // 保存できない環境（プライベートモードなど）では、そのタブの中だけで動かす
      }
    },
  };
}

export function memoryStorage(initial?: MockDb): MockStorage {
  let db = initial ?? null;
  return { load: () => db, save: (next) => (db = next) };
}

function newId(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

const now = () => new Date().toISOString();

function requireStoreStaff(s: Session): string {
  if (s.role !== "store_staff") throw new PermissionError("店舗の担当者としてログインしてください");
  return s.storeId;
}

function requireMaker(s: Session): string {
  if (s.role !== "maker_staff") throw new PermissionError("メーカーとしてログインしてください");
  return s.makerId;
}

export function createMockRepository(storage: MockStorage, seed: () => MockDb = () => createSeed()): AdsRepository {
  let cache: MockDb | null = null;
  const read = (): MockDb => {
    if (!cache) {
      cache = storage.load() ?? seed();
      storage.save(cache);
    }
    return cache;
  };
  const write = (fn: (db: MockDb) => void) => {
    const db = structuredClone(read());
    fn(db);
    cache = db;
    storage.save(db);
  };
  // 画面へは複製を返し、呼び出し側の変更が仮DBに漏れないようにする
  const out = <T>(v: T): T => structuredClone(v);

  const canSeeApplication = (session: Session, app: AdApplication) =>
    (session.role === "maker_staff" && session.makerId === app.maker_id) ||
    (session.role === "store_staff" && session.storeId === app.store_id);

  /** 申請の入力を確かめ、版を返す（申請・再申請で共通） */
  const checkApplication = (db: MockDb, makerId: string, call: AdCall, creativeId: string, input: ApplicationInput): CreativeVersion => {
    const version = db.creative_versions.find((v) => v.id === input.creative_version_id && v.creative_id === creativeId);
    if (!version) throw new ValidationError(["この広告素材の版を選んでください"]);
    const creative = db.creatives.find((c) => c.id === creativeId)!;
    if (creative.maker_id !== makerId) throw new PermissionError("他のメーカーの広告素材では申請できません");
    const errors = validateApplication(call, version, input);
    if (errors.length) throw new ValidationError(errors);
    return version;
  };

  const repo: MaybeAsync<AdsRepository> = {
    listStores: () => out(read().stores),
    listSignageDevices: (storeId) => out(read().signage_devices.filter((d) => d.store_id === storeId)),
    listMakers: () => out(read().makers),
    listProducts: () => out(read().products),
    listStoreProducts: (storeId) => out(read().store_products.filter((p) => p.store_id === storeId)),
    listCategories: () => out([...new Set(read().products.map((p) => p.category))]),

    listPublicAdCalls: () => out(read().ad_calls.filter((c) => c.status !== "draft")),

    getAdCall(session, id) {
      const c = read().ad_calls.find((x) => x.id === id);
      if (!c) return undefined;
      if (c.status === "draft" && !(session.role === "store_staff" && session.storeId === c.store_id)) return undefined;
      return out(c);
    },

    listMyAdCalls(session) {
      const storeId = requireStoreStaff(session);
      return out(read().ad_calls.filter((c) => c.store_id === storeId).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    },

    saveAdCall(session, input: AdCallInput, id?: string) {
      const storeId = requireStoreStaff(session);
      const errors = validateAdCall(input);
      if (errors.length) throw new ValidationError(errors);
      let saved!: AdCall;
      write((db) => {
        if (id) {
          const c = db.ad_calls.find((x) => x.id === id);
          if (!c) throw new ValidationError(["募集が見つかりません"]);
          if (c.store_id !== storeId) throw new PermissionError("他の店舗の募集は変更できません");
          Object.assign(c, input, { updated_at: now() });
          saved = c;
        } else {
          saved = { id: newId("C"), store_id: storeId, ...input, status: "draft", created_at: now(), updated_at: now() };
          db.ad_calls.push(saved);
        }
      });
      return out(saved);
    },

    setAdCallStatus(session, id, status) {
      const storeId = requireStoreStaff(session);
      let saved!: AdCall;
      write((db) => {
        const c = db.ad_calls.find((x) => x.id === id);
        if (!c) throw new ValidationError(["募集が見つかりません"]);
        if (c.store_id !== storeId) throw new PermissionError("他の店舗の募集は変更できません");
        if (c.status === "closed" && status !== "closed") {
          throw new ValidationError(["終了した募集は再公開できません。新しい募集を作ってください"]);
        }
        c.status = status;
        c.updated_at = now();
        saved = c;
      });
      return out(saved);
    },

    listMyCreatives(session) {
      const makerId = requireMaker(session);
      const db = read();
      const list: CreativeWithVersions[] = db.creatives
        .filter((c) => c.maker_id === makerId)
        .map((creative) => ({
          creative,
          versions: db.creative_versions.filter((v) => v.creative_id === creative.id).sort((a, b) => a.version - b.version),
        }));
      return out(list);
    },

    createCreative(session, input: CreativeInput) {
      const makerId = requireMaker(session);
      const errors: string[] = [];
      if (!read().products.some((p) => p.id === input.product_id)) errors.push("対象商品を選んでください");
      if (!input.headline.trim()) errors.push("見出しを入力してください");
      if (!input.assets.app && !input.assets.signage) errors.push("App か Signage の素材を1つ以上登録してください");
      if (errors.length) throw new ValidationError(errors);
      let result!: CreativeWithVersions;
      write((db) => {
        const creative = { id: newId("CR"), maker_id: makerId, product_id: input.product_id, created_at: now() };
        const v1: CreativeVersion = {
          id: `${creative.id}-v1`, creative_id: creative.id, version: 1, headline: input.headline.trim(),
          assets: input.assets, note: input.note, created_at: now(),
        };
        db.creatives.push(creative);
        db.creative_versions.push(v1);
        result = { creative, versions: [v1] };
      });
      return out(result);
    },

    addCreativeVersion(session, creativeId, input) {
      const makerId = requireMaker(session);
      if (!input.assets.app && !input.assets.signage) throw new ValidationError(["App か Signage の素材を1つ以上登録してください"]);
      if (!input.headline.trim()) throw new ValidationError(["見出しを入力してください"]);
      let created!: CreativeVersion;
      write((db) => {
        const creative = db.creatives.find((c) => c.id === creativeId);
        if (!creative) throw new ValidationError(["広告素材が見つかりません"]);
        if (creative.maker_id !== makerId) throw new PermissionError("他のメーカーの広告素材は変更できません");
        // 版は対象ごとに1から始まる連番。古い版は書き換えない（共通仕様書 4.2）
        const version = Math.max(0, ...db.creative_versions.filter((v) => v.creative_id === creativeId).map((v) => v.version)) + 1;
        created = {
          id: `${creativeId}-v${version}`, creative_id: creativeId, version, headline: input.headline.trim(),
          assets: input.assets, note: input.note, created_at: now(),
        };
        db.creative_versions.push(created);
      });
      return out(created);
    },

    listMyApplications(session) {
      const makerId = requireMaker(session);
      return out(read().ad_applications.filter((a) => a.maker_id === makerId));
    },

    getApplication(session, id) {
      const app = read().ad_applications.find((a) => a.id === id);
      return app && canSeeApplication(session, app) ? out(app) : undefined;
    },

    listPlacements(session, applicationId) {
      const db = read();
      const app = db.ad_applications.find((a) => a.id === applicationId);
      if (!app || !canSeeApplication(session, app)) return [];
      return out(db.ad_placements.filter((p) => p.application_id === applicationId));
    },

    submitApplication(session, adCallId, input) {
      const makerId = requireMaker(session);
      const db = read();
      const call = db.ad_calls.find((c) => c.id === adCallId && c.status !== "draft");
      if (!call) throw new ValidationError(["募集が見つかりません"]);
      const version = db.creative_versions.find((v) => v.id === input.creative_version_id);
      if (!version) throw new ValidationError(["広告素材の版を選んでください"]);
      if (db.ad_applications.some((a) => a.ad_call_id === adCallId && a.creative_id === version.creative_id)) {
        throw new ValidationError(["この広告素材はすでにこの募集へ申請しています。申請の詳細から再申請してください"]);
      }
      checkApplication(db, makerId, call, version.creative_id, input);
      let app!: AdApplication;
      write((next) => {
        const rev = revisionFrom(1, input);
        app = {
          id: newId("A"), ad_call_id: adCallId, store_id: call.store_id, maker_id: makerId, creative_id: version.creative_id,
          creative_version_id: rev.creative_version_id, channels: rev.channels, requested_start: rev.requested_start,
          requested_end: rev.requested_end, status: "submitted", revisions: [rev], created_at: now(), updated_at: now(),
        };
        next.ad_applications.push(app);
      });
      return out(app);
    },

    resubmitApplication(session, applicationId, input) {
      const makerId = requireMaker(session);
      const db = read();
      const app = db.ad_applications.find((a) => a.id === applicationId);
      if (!app) throw new ValidationError(["申請が見つかりません"]);
      if (app.maker_id !== makerId) throw new PermissionError("他のメーカーの申請は変更できません");
      if (!canResubmit(app)) throw new ValidationError(["審査中のため再申請できません。結果が出てから再申請してください"]);
      const call = db.ad_calls.find((c) => c.id === app.ad_call_id)!;
      checkApplication(db, makerId, call, app.creative_id, input);
      let saved!: AdApplication;
      write((next) => {
        const target = next.ad_applications.find((a) => a.id === applicationId)!;
        const rev = revisionFrom(latestRevision(target).rev + 1, input);
        // 共通仕様書 6：同じ申請を submitted に戻す。承認済みの配信対象は、新しい版を承認するまで active のまま
        Object.assign(target, {
          creative_version_id: rev.creative_version_id, channels: rev.channels, requested_start: rev.requested_start,
          requested_end: rev.requested_end, status: "submitted", review_comment: undefined, updated_at: now(),
        });
        target.revisions.push(rev);
        saved = target;
      });
      return out(saved);
    },

    devListStoreApplications(session) {
      const storeId = requireStoreStaff(session);
      return out(read().ad_applications.filter((a) => a.store_id === storeId));
    },

    devApprove(session, applicationId, input) {
      const storeId = requireStoreStaff(session);
      let placement!: AdPlacement;
      write((db) => {
        const app = db.ad_applications.find((a) => a.id === applicationId);
        if (!app) throw new ValidationError(["申請が見つかりません"]);
        if (app.store_id !== storeId) throw new PermissionError("他の店舗の申請は審査できません");
        if (app.status !== "submitted") throw new ValidationError(["すでに審査済みです。再読み込みしてください"]);
        const errors = validateApprovalChannels(app.channels, input.channels);
        if (Date.parse(input.starts_at) > Date.parse(input.ends_at)) errors.push("配信期間の終わりは始まり以降にしてください");
        if (errors.length) throw new ValidationError(errors);
        // 新しい版を承認すると、旧版の配信対象は superseded になる（共通仕様書 6）
        for (const p of db.ad_placements) {
          if (p.application_id === app.id && p.status === "active") p.status = "superseded";
        }
        placement = {
          id: newId("PL"), application_id: app.id, store_id: app.store_id, creative_version_id: app.creative_version_id,
          channels: input.channels, starts_at: input.starts_at, ends_at: input.ends_at, status: "active",
          approved_by: `store_staff:${storeId}`, approved_at: now(),
        };
        db.ad_placements.push(placement);
        const rev = latestRevision(app);
        rev.status = "approved";
        rev.reviewed_at = now();
        app.status = "approved";
        app.updated_at = now();
      });
      return out(placement);
    },

    devReject(session, applicationId, comment) {
      const storeId = requireStoreStaff(session);
      const errors = validateReviewComment(comment);
      if (errors.length) throw new ValidationError(errors);
      let saved!: AdApplication;
      write((db) => {
        const app = db.ad_applications.find((a) => a.id === applicationId);
        if (!app) throw new ValidationError(["申請が見つかりません"]);
        if (app.store_id !== storeId) throw new PermissionError("他の店舗の申請は審査できません");
        if (app.status !== "submitted") throw new ValidationError(["すでに審査済みです。再読み込みしてください"]);
        const rev = latestRevision(app);
        Object.assign(rev, { status: "rejected", review_comment: comment.trim(), reviewed_at: now() });
        Object.assign(app, { status: "rejected", review_comment: comment.trim(), updated_at: now() });
        saved = app;
      });
      return out(saved);
    },

    devSuspend(session, placementId, reason) {
      const storeId = requireStoreStaff(session);
      const errors = validateReviewComment(reason);
      if (errors.length) throw new ValidationError(errors);
      let saved!: AdPlacement;
      write((db) => {
        const p = db.ad_placements.find((x) => x.id === placementId);
        if (!p) throw new ValidationError(["配信対象が見つかりません"]);
        if (p.store_id !== storeId) throw new PermissionError("他の店舗の広告は停止できません");
        if (p.status !== "active") throw new ValidationError(["配信中ではないため停止できません"]);
        p.status = "suspended";
        p.suspend_reason = reason.trim();
        saved = p;
      });
      return out(saved);
    },

    async reset() {
      cache = seed();
      storage.save(cache);
    },
  };
  return asyncMethods(repo);
}

function revisionFrom(rev: number, input: ApplicationInput): ApplicationRevision {
  return {
    rev,
    creative_version_id: input.creative_version_id,
    channels: input.channels,
    requested_start: input.requested_start,
    requested_end: input.requested_end,
    message: input.message,
    submitted_at: now(),
    status: "submitted",
  };
}

/** 仮データ版は同期でも返せる形で書き、asyncMethods で Promise にそろえる */
type MaybeAsync<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => R | Promise<R> : T[K];
};

/** 同期的に投げた例外も Promise の失敗として返す（Supabase 版と同じ振る舞いにする） */
function asyncMethods<T extends object>(obj: MaybeAsync<T>): T {
  const wrapped = {} as Record<string, unknown>;
  for (const [key, fn] of Object.entries(obj)) {
    wrapped[key] = async (...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args);
  }
  return wrapped as T;
}
