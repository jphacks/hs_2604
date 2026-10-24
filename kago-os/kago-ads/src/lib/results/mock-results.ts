// ADS-04 の仮データ版。Ads の仮データ（申請・配信対象・募集の公開範囲）と固定の集計から、メーカーに見せる結果を作る
import { demoResultRows } from "../../data/demo/results";
import { PermissionError, type AdsRepository } from "../data/repository";
import { storeLabel } from "../domain/rules";
import type { AdPlacement } from "../domain/types";
import { discloseAppRow, discloseSignageRow, type ResultPlacement, type ResultsRepository } from "./results";

const ms = (ts: string) => Date.parse(ts);

/** 期間で絞るための時刻を外す（DB-09 の行と同じ形にする） */
function withoutAt<T extends { at: string }>(row: T): Omit<T, "at"> {
  const copy: Partial<T> = { ...row };
  delete copy.at;
  return copy as Omit<T, "at">;
}

export function createMockResultsRepository(repo: AdsRepository, rows = demoResultRows()): ResultsRepository {
  return {
    async listMakerResults(session, query) {
      if (session.role !== "maker_staff") throw new PermissionError("メーカーとしてログインしてください");
      const [applications, creatives, calls, stores, products] = await Promise.all([
        repo.listMyApplications(session),
        repo.listMyCreatives(session),
        repo.listPublicAdCalls(),
        repo.listStores(),
        repo.listProducts(),
      ]);
      const placements: AdPlacement[] = (await Promise.all(applications.map((a) => repo.listPlacements(session, a.id)))).flat();
      const result: ResultPlacement[] = [];
      for (const p of placements) {
        if (query.storeId && p.store_id !== query.storeId) continue;
        const app = applications.find((a) => a.id === p.application_id);
        const call = calls.find((c) => c.id === app?.ad_call_id);
        const cw = creatives.find((c) => c.versions.some((v) => v.id === p.creative_version_id));
        const version = cw?.versions.find((v) => v.id === p.creative_version_id);
        const store = stores.find((s) => s.id === p.store_id);
        if (!app || !call || !cw || !version || !store) continue;
        result.push({
          id: p.id, store_id: p.store_id, store_name: storeLabel(store), call_title: call.title,
          product_name: products.find((x) => x.id === cw.creative.product_id)?.name ?? "",
          headline: version.headline, version: version.version, channels: p.channels,
          starts_at: p.starts_at, ends_at: p.ends_at, status: p.status, disclosure_scope: call.disclosure_scope,
        });
      }
      const scopeOf = (id: string | null) => result.find((p) => p.id === id)?.disclosure_scope;
      const inPeriod = (at: string) => ms(query.start) <= ms(at) && ms(at) < ms(query.end);
      return {
        placements: result,
        app: rows.app.filter((r) => scopeOf(r.ad_placement_id) && inPeriod(r.at))
          .map((r) => discloseAppRow(withoutAt(r), scopeOf(r.ad_placement_id)!)),
        signage: rows.signage.filter((r) => scopeOf(r.ad_placement_id) && inPeriod(r.at))
          .map((r) => discloseSignageRow(withoutAt(r), scopeOf(r.ad_placement_id)!)),
      };
    },
  };
}
