"use client";
// ADS-03：募集（ad_calls）への申請
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMakerRepository, usePortalSession as useSession } from "@/features/auth/ads-runtime";
import type { ApplicationInput } from "@/lib/data/repository";
import { canApplyTo, dayStart, storeLabel, today } from "@/lib/domain/rules";
import { Button, ButtonLink, Card, Empty, ErrorList, Field, inputClass, Loading, NeedRole, PageTitle } from "@/components/parts";
import { errorMessages, useLoad } from "@/lib/use-load";
import { ApplicationFields } from "./application-fields";

export function NewApplication() {
  const callId = useSearchParams().get("call") ?? "";
  const session = useSession();
  const getRepository = useMakerRepository();
  const router = useRouter();
  const { state } = useLoad(async () => {
    if (session.role !== "maker_staff") return null;
    const repo = getRepository();
    const [call, stores, creatives, makers, products, applications] = await Promise.all([
      repo.getAdCall(session, callId),
      repo.listStores(),
      repo.listMyCreatives(session),
      repo.listMakers(),
      repo.listProducts(),
      repo.listMyApplications(session),
    ]);
    const applied = new Set(applications.filter((a) => a.ad_call_id === callId).map((a) => a.creative_id));
    return {
      call,
      store: stores.find((s) => s.id === call?.store_id),
      creatives: creatives.filter((c) => !applied.has(c.creative.id)),
      appliedCount: applied.size,
      products,
      makerName: makers.find((m) => m.id === session.makerId)?.display_name,
    };
  }, [callId, JSON.stringify(session)]);

  const [creativeId, setCreativeId] = useState("");
  const [form, setForm] = useState<ApplicationInput | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (session.role !== "maker_staff") return <NeedRole role="メーカー" />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorList errors={[state.error]} />;
  const { call, store, creatives, makerName, appliedCount, products } = state.data!;
  if (!call || !store) return <ErrorList errors={["募集が見つかりません"]} />;
  if (!canApplyTo(call)) return <ErrorList errors={["この募集は終了しているため申請できません"]} />;

  const item = creatives.find((c) => c.creative.id === creativeId);
  const productName = (productId: string) => products.find((p) => p.id === productId)?.name;

  // 素材を選んだら、最新の版・募集と素材の両方にある掲載先・募集期間内の希望期間を初期値にする
  const selectCreative = (nextId: string) => {
    setCreativeId(nextId);
    const picked = creatives.find((c) => c.creative.id === nextId);
    if (!picked) return setForm(null);
    const latest = picked.versions[picked.versions.length - 1];
    const todayStart = dayStart(today());
    setForm({
      creative_version_id: latest.id,
      channels: call.channels.filter((ch) => latest.assets[ch]),
      requested_start: Date.parse(todayStart) > Date.parse(call.starts_at) ? todayStart : call.starts_at,
      requested_end: call.ends_at,
      message: "",
    });
  };

  const submit = async () => {
    if (!form || saving) return;
    setSaving(true);
    setErrors([]);
    try {
      const app = await getRepository().submitApplication(session, call.id, form);
      router.push(`/ads/maker/application?id=${app.id}`);
    } catch (e) {
      setErrors(errorMessages(e));
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle title="募集に申請する" lead={`${storeLabel(store)}｜${call.title}`} />
      <Card className="space-y-5"><fieldset disabled={saving} className="contents">
        {creatives.length === 0 ? (
          <Empty>
            申請できる広告素材がありません。
            {appliedCount > 0 && "この募集に申請済みの素材は、申請の詳細から再申請してください。"}
            <div className="mt-3">
              <ButtonLink href="/ads/maker/creatives/new">広告素材を登録する</ButtonLink>
            </div>
          </Empty>
        ) : (
          <>
            <Field label="申請する広告素材">
              <select className={inputClass} value={creativeId} onChange={(e) => selectCreative(e.target.value)}>
                <option value="">選んでください</option>
                {creatives.map(({ creative, versions }) => (
                  <option key={creative.id} value={creative.id}>
                    {productName(creative.product_id)}｜{versions[versions.length - 1].headline}（{creative.id}）
                  </option>
                ))}
              </select>
            </Field>
            {item && form && <ApplicationFields call={call} versions={item.versions} value={form} onChange={setForm} makerName={makerName} />}
            <p className="rounded-lg bg-gray-50 p-3 text-xs text-muted">
              申請すると、{storeLabel(store)} の担当者に届き、KAGO/Insight で審査されます。承認されるまで配信されません。メーカー側で承認済みにすることはできません。
            </p>
            <ErrorList errors={errors} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={!form || saving} onClick={submit}>
                申請する
              </Button>
              <Link href={`/ads/portal/call?id=${call.id}`} className="self-center px-2 text-sm text-muted underline">
                募集の詳細に戻る
              </Link>
            </div>
          </>
        )}
      </fieldset></Card>
    </>
  );
}
