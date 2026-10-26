"use client";
// ADS-03：広告素材の版（creative_versions）の一覧と、新しい版の作成
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMakerRepository, usePortalSession as useSession } from "@/features/auth/ads-runtime";
import type { CreativeVersionInput } from "@/lib/data/repository";
import { CHANNEL_LABEL, CHANNELS } from "@/lib/domain/types";
import { ConnectedAdMedia as AdMedia } from "./connected-media";
import { CreativeAssetsPicker } from "./creative-assets-picker";
import { Button, Card, ErrorList, Field, inputClass, Loading, NeedRole } from "@/components/parts";
import { errorMessages, useLoad } from "@/lib/use-load";

export function AdDetail() {
  const id = useSearchParams().get("id") ?? "";
  const session = useSession();
  const getRepository = useMakerRepository();
  const { state, reload } = useLoad(async () => {
    if (session.role !== "maker_staff") return null;
    const repo = getRepository();
    const [creatives, products, makers, applications] = await Promise.all([
      repo.listMyCreatives(session),
      repo.listProducts(),
      repo.listMakers(),
      repo.listMyApplications(session),
    ]);
    return {
      item: creatives.find((c) => c.creative.id === id),
      products,
      makerName: makers.find((m) => m.id === session.makerId)?.display_name,
      applications: applications.filter((a) => a.creative_id === id),
    };
  }, [id, JSON.stringify(session)]);

  const [draft, setDraft] = useState<CreativeVersionInput | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [assetBlocked, setAssetBlocked] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  if (session.role !== "maker_staff") return <NeedRole role="メーカー" />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorList errors={[state.error]} />;
  const data = state.data!;
  if (!data.item) return <ErrorList errors={["広告素材が見つからないか、他社の素材です"]} />;
  const { creative, versions } = data.item;
  const product = data.products.find((p) => p.id === creative.product_id);
  const latest = versions[versions.length - 1];

  const save = async () => {
    if (!draft || saving || assetBlocked) return;
    setSaving(true);
    setErrors([]);
    try {
      await getRepository().addCreativeVersion(session, creative.id, draft, requestId);
      setDraft(null);
      reload();
    } catch (e) {
      setErrors(errorMessages(e));
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/ads/maker/creatives" className="text-sm text-brand underline">
        ← 自社の広告素材へ戻る
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{creative.id}</p>
          <h1 className="text-2xl font-bold">{product?.name}</h1>
          <p className="text-sm text-muted">
            対象商品：{product?.name}（{product?.code}）
          </p>
        </div>
        {!draft && (
          <Button onClick={() => { setRequestId(crypto.randomUUID()); setDraft({ headline: latest.headline, assets: { ...latest.assets }, note: "" }); }}>新しい版を作る</Button>
        )}
      </div>

      {draft && (
        <Card className="space-y-4"><fieldset disabled={saving} className="contents">
          <h2 className="font-bold">第{latest.version + 1}版を作る</h2>
          <p className="text-sm text-muted">
            新しい版を申請に使うには、申請の詳細から再申請してください。新しい版が承認されるまで、今承認されている版の配信が続きます。
          </p>
          <Field label="見出し">
            <input className={inputClass} value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
          </Field>
          <CreativeAssetsPicker makerName={data.makerName} value={draft.assets} onBlockedChange={setAssetBlocked} onChange={assets => setDraft(current => current ? ({ ...current, assets:typeof assets==="function"?assets(current.assets):assets }) : null)} />
          <Field label="版のメモ" hint="何を変えたか（審査する店舗にも見えます）">
            <input className={inputClass} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </Field>
          <ErrorList errors={errors} />
          <div className="flex gap-2">
            <Button disabled={saving || assetBlocked} onClick={save}>この版を保存</Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              やめる
            </Button>
          </div>
        </fieldset></Card>
      )}

      <section className="space-y-3">
        <h2 className="font-bold">版の履歴</h2>
        {[...versions].reverse().map((v) => (
          <Card key={v.id}>
            <p className="font-semibold">
              第{v.version}版
              <span className="ml-2 text-sm font-normal text-muted">
                {v.headline}｜{v.note || "メモなし"}
              </span>
            </p>
            {v.image_error && <ErrorList errors={[v.image_error]} />}
            <div className="mt-3 flex flex-wrap items-start gap-4">
              {CHANNELS.map((ch) => (
                <div key={ch}>
                  <p className="mb-1 text-xs text-muted">{CHANNEL_LABEL[ch]}</p>
                  {v.assets[ch] ? (
                    <AdMedia asset={v.assets[ch]!} channel={ch} makerName={data.makerName} className={ch === "app" ? "w-40" : "w-80"} />
                  ) : (
                    <p className="text-xs text-muted">素材なし（{CHANNEL_LABEL[ch]}には申請できません）</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </section>

      <section>
        <h2 className="font-bold">この素材の申請</h2>
        {data.applications.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            まだ申請していません。<Link href="/ads/portal" className="text-brand underline">募集を探す</Link>
          </p>
        ) : (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {data.applications.map((a) => (
              <li key={a.id}>
                <Link href={`/ads/maker/application?id=${a.id}`} className="text-brand underline">
                  {a.id}（募集 {a.ad_call_id}）
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
