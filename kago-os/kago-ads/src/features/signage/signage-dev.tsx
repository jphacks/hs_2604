"use client";
// INS-02（店舗販促の設定）・INS-03（Signage の集計）ができるまでの確認用。店舗の担当者として使う
// SIG-01〜03 の確認方法（期間外・停止・切断・再送）を、この画面と端末の画面（?debug=1）で試す
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { getRepository } from "@/lib/data";
import { addDays, dayEnd, dayStart, storeLabel, today } from "@/lib/domain/rules";
import { PLAY_END_REASON_LABEL, type Product, type SignagePlay, type StorePromotion } from "@/lib/domain/types";
import { hourOf } from "@/lib/signage/feed";
import { isCountedPlay, playSeconds, playTarget, summarizePlays } from "@/lib/signage/plays";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, ErrorList, Field, inputClass, Loading, NeedRole, PageTitle } from "@/components/parts";
import { errorMessages, useLoad } from "@/lib/use-load";

export function SignageDev() {
  const session = useSession();
  const { state, reload } = useLoad(async () => {
    if (session.role !== "store_staff") return null;
    const repo = getRepository();
    const [stores, devices, products, promotions, placements, plays, offset] = await Promise.all([
      repo.listStores(),
      repo.listSignageDevices(session.storeId),
      repo.listProducts(),
      repo.devListPromotions(session),
      repo.devListStorePlacements(session),
      repo.devListPlays(session),
      repo.devGetClockOffset(session),
    ]);
    // 端末に届く配信内容を、端末と同じ方法で取って見せる（仮データ版だけでできる確認）
    const feeds = await Promise.all(
      devices.map(async (d) => ({ device: d, feed: await repo.getSignageFeed(await repo.signInDevice(d.id)) })),
    );
    // 店舗の時刻は読み込んだ時点の実時刻から出す（5秒ごとに読み直して進める）
    const loadedAt = Date.now();
    return { store: stores.find((s) => s.id === session.storeId), devices, products, promotions, placements, plays, offset, feeds, loadedAt };
  }, [JSON.stringify(session)]);
  const [errors, setErrors] = useState<string[]>([]);

  // 端末の再生記録が増えていくのを見られるよう、5秒ごとに読み直す
  const refresh = useEffectEvent(() => reload());
  useEffect(() => {
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
  }, []);

  if (session.role !== "store_staff") return <NeedRole role="店舗の担当者" />;

  const run = async (fn: () => Promise<unknown>) => {
    setErrors([]);
    try {
      await fn();
      reload();
    } catch (e) {
      setErrors(errorMessages(e));
    }
  };

  const data = state.status === "ready" ? state.data : null;
  const productName = (id: string) => data?.products.find((p) => p.id === id)?.name ?? id;
  const storeNow = data ? new Date(data.loadedAt + data.offset) : null;

  return (
    <>
      <PageTitle
        title="Signage の確認"
        lead="INS-02（店舗販促の設定）・INS-03（集計）ができるまでの仮の画面です。端末の画面と並べて、表示・停止・再生記録を確かめます。"
        action={
          <Link className="text-sm text-brand hover:underline" href="/signage">
            端末を開く
          </Link>
        }
      />
      <ErrorList errors={errors} />
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {data && (
        <div className="space-y-6">
          <p className="text-sm text-muted">{data.store && storeLabel(data.store)}</p>

          <Card>
            <h2 className="font-bold">デモ用の時刻</h2>
            <p className="mt-1 text-sm text-muted">
              店舗の時刻：
              <span className="font-semibold text-ink" data-testid="store-time">
                {storeNow ? storeNow.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "－"}
              </span>
              {data.offset !== 0 && <Badge tone="amber">デモ用の時刻</Badge>}
            </p>
            <DemoClock
              onSet={(hm) => run(() => getRepository().devSetDemoTime(session, `${today(storeNow ?? undefined)}T${hm}:00+09:00`))}
              onReset={() => run(() => getRepository().devSetDemoTime(session, null))}
            />
            <p className="mt-2 text-xs text-muted">提案：店舗ごとのデモ用の時刻を DB に持ち、App・Signage・Insight が同じ時刻を使う（DB-01 に依頼予定）</p>
          </Card>

          <Card>
            <h2 className="font-bold">端末に届いている内容（今の時刻）</h2>
            <div className="mt-3 space-y-3">
              {data.feeds.map(({ device, feed }) => (
                <div key={device.id} className="text-sm" data-testid={`feed-${device.id}`}>
                  <p className="font-semibold">
                    {device.id}｜{device.location}
                    <Link className="ml-3 font-normal text-brand hover:underline" href={`/signage/play?device=${device.id}&debug=1`} target="_blank">
                      端末の画面を開く
                    </Link>
                  </p>
                  <p>
                    表示する順：
                    {feed.items.length === 0
                      ? "なし（案内を表示）"
                      : feed.items.map((i) => `${i.placement_type === "sponsored" ? "広告" : "販促"} ${i.key}（${i.product_name}）`).join(" → ")}
                  </p>
                  {feed.skipped.length > 0 && (
                    <p className="text-muted">出さないもの：{feed.skipped.map((s) => `${s.key}（${s.reason}）`).join("、")}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="font-bold">店舗販促（INS-02 の代わり）</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {data.promotions.map((p) => (
                <PromotionRow
                  key={p.id}
                  promotion={p}
                  productName={productName(p.product_id)}
                  onToggle={() => run(() => getRepository().devSetPromotionStatus(session, p.id, p.status === "active" ? "inactive" : "active"))}
                />
              ))}
            </ul>
            <NewPromotion products={data.products} onCreate={(input) => run(() => getRepository().devCreatePromotion(session, input))} />
          </Card>

          <Card>
            <h2 className="font-bold">メーカー広告の配信対象</h2>
            <ul className="mt-2 text-sm">
              {data.placements.map((p) => (
                <li key={p.id}>
                  {p.id}｜{p.creative_version_id}｜{p.channels.join("・")}｜{p.status}
                  {p.suspend_reason && `（停止の理由：${p.suspend_reason}）`}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              停止は
              <Link className="mx-1 text-brand hover:underline" href="/ads/dev/review">
                審査（確認用）
              </Link>
              で行います。停止すると、端末は再生中でもすぐ切り替えます。
            </p>
          </Card>

          <PlayLog plays={data.plays} label={(p) => targetLabel(p, data, productName)} />
        </div>
      )}
    </>
  );
}

function targetLabel(
  p: SignagePlay,
  data: { placements: { id: string; creative_version_id: string }[]; promotions: StorePromotion[] },
  productName: (id: string) => string,
): string {
  if (p.ad_placement_id) return `広告 ${p.ad_placement_id}（${p.creative_version_id}）`;
  if (p.promotion_version_id) {
    const sp = data.promotions.find((x) => x.version_id === p.promotion_version_id);
    return `販促 ${p.promotion_version_id}（${sp ? productName(sp.product_id) : ""}）`;
  }
  return "案内";
}

function DemoClock({ onSet, onReset }: { onSet: (hm: string) => void; onReset: () => void }) {
  const [hm, setHm] = useState("17:00");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input type="time" step={60} value={hm} onChange={(e) => setHm(e.target.value)} className={`${inputClass} w-32`} aria-label="デモ用の時刻" />
      <Button onClick={() => onSet(hm)} disabled={!hm}>
        この時刻にする
      </Button>
      <Button variant="secondary" onClick={onReset}>
        実時刻に戻す
      </Button>
    </div>
  );
}

function PromotionRow({ promotion: p, productName, onToggle }: { promotion: StorePromotion; productName: string; onToggle: () => void }) {
  const windows = p.time_windows.length ? p.time_windows.map((w) => `${w.start}〜${w.end}`).join("・") : "終日";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`promo-${p.id}`}>
      <span>
        <span className="font-semibold">{p.id}</span> {productName}「{p.reason_text}」｜{windows}｜優先度 {p.priority}｜{p.channels.join("・")}
        <span className="ml-2">{p.status === "active" ? <Badge tone="green">配信中</Badge> : <Badge tone="gray">停止中</Badge>}</span>
      </span>
      <Button variant={p.status === "active" ? "danger" : "secondary"} onClick={onToggle}>
        {p.status === "active" ? "停止" : "再開"}
      </Button>
    </li>
  );
}

function NewPromotion({
  products,
  onCreate,
}: {
  products: Product[];
  onCreate: (input: Parameters<ReturnType<typeof getRepository>["devCreatePromotion"]>[1]) => void;
}) {
  const [productId, setProductId] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState(60);
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState(16);
  const [end, setEnd] = useState(19);
  return (
    <form
      className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const d = today();
        onCreate({
          product_id: productId,
          channels: ["signage"],
          time_windows: allDay ? [] : [{ weekdays: [1, 2, 3, 4, 5, 6, 7], start: hhmm(start), end: hhmm(end) }],
          priority,
          reason_text: reason,
          starts_at: dayStart(d),
          ends_at: dayEnd(addDays(d, 30)),
        });
      }}
    >
      <Field label="対象商品">
        <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">選んでください</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.category}）
            </option>
          ))}
        </select>
      </Field>
      <Field label="理由文" hint="40字以内">
        <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：本日焼きたてです" />
      </Field>
      <Field label="優先度" hint="0〜100、大きいほど先">
        <input type="number" min={0} max={100} className={inputClass} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
      </Field>
      <div>
        <span className="text-sm font-semibold">時間帯</span>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            終日
          </label>
          {!allDay && (
            <>
              <input type="number" min={0} max={23} className={`${inputClass} w-20`} value={start} onChange={(e) => setStart(Number(e.target.value))} aria-label="開始の時" />
              時〜
              <input type="number" min={1} max={24} className={`${inputClass} w-20`} value={end} onChange={(e) => setEnd(Number(e.target.value))} aria-label="終了の時" />
              時
            </>
          )}
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">販促を追加（Signage・今日から30日）</Button>
      </div>
    </form>
  );
}

const hhmm = (h: number) => `${String(h).padStart(2, "0")}:00`;

function PlayLog({ plays, label }: { plays: SignagePlay[]; label: (p: SignagePlay) => string }) {
  const sorted = [...plays].sort((a, b) => b.started_at.localeCompare(a.started_at));
  // 共通仕様書 9.3：開始時刻の時間帯（1時間）ごとに、対象別の再生回数・秒数
  const byHour = new Map<number, SignagePlay[]>();
  for (const p of plays) {
    const h = hourOf(new Date(p.started_at));
    byHour.set(h, [...(byHour.get(h) ?? []), p]);
  }
  const labelOf = new Map(plays.map((p) => [playTarget(p), label(p)]));
  return (
    <Card>
      <h2 className="font-bold">再生記録（SIG-02）</h2>
      <p className="mt-1 text-sm text-muted">
        保存 {plays.length} 件・再生回数に数える {plays.filter(isCountedPlay).length} 件。数えるのは「終わっていて3秒以上・案内ではない・動画は最後まで再生」の記録（DB-09 に渡す決まり）
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="play-summary">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-3">時間帯</th>
              <th className="py-1 pr-3">対象</th>
              <th className="py-1 pr-3">保存</th>
              <th className="py-1 pr-3">再生回数</th>
              <th className="py-1 pr-3">再生秒数</th>
            </tr>
          </thead>
          <tbody>
            {[...byHour.entries()]
              .sort((a, b) => b[0] - a[0])
              .flatMap(([h, list]) =>
                summarizePlays(list).map((r) => (
                  <tr key={`${h}-${r.target}`} className="border-t border-line">
                    <td className="py-1 pr-3">{h}時台</td>
                    <td className="py-1 pr-3">{labelOf.get(r.target)}</td>
                    <td className="py-1 pr-3">{r.saved}</td>
                    <td className="py-1 pr-3">{r.target === "fallback" ? "（数えない）" : r.counted}</td>
                    <td className="py-1 pr-3">{r.target === "fallback" ? "－" : r.seconds}</td>
                  </tr>
                )),
              )}
          </tbody>
        </table>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold">記録の一覧（新しい順・最大50件）</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="play-log">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-2">端末</th>
                <th className="py-1 pr-2">対象</th>
                <th className="py-1 pr-2">mode</th>
                <th className="py-1 pr-2">reason_code</th>
                <th className="py-1 pr-2">開始</th>
                <th className="py-1 pr-2">秒</th>
                <th className="py-1 pr-2">終了理由</th>
                <th className="py-1 pr-2">数える</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 50).map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-1 pr-2">{p.device_id}</td>
                  <td className="py-1 pr-2">{label(p)}</td>
                  <td className="py-1 pr-2">{p.mode}</td>
                  <td className="py-1 pr-2">{p.reason_code}</td>
                  <td className="py-1 pr-2">{new Date(p.started_at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}</td>
                  <td className="py-1 pr-2">{playSeconds(p)?.toFixed(1) ?? "再生中"}</td>
                  <td className="py-1 pr-2">{p.end_reason ? PLAY_END_REASON_LABEL[p.end_reason] : "－"}</td>
                  <td className="py-1 pr-2">{isCountedPlay(p) ? "○" : "－"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
