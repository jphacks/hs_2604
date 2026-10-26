"use client";
// ADS-03：広告素材（対象商品・見出し・媒体ごとの素材）の登録
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMakerRepository, usePortalSession as useSession } from "@/features/auth/ads-runtime";
import type { CreativeInput } from "@/lib/data/repository";
import { CreativeAssetsPicker } from "./creative-assets-picker";
import { Button, Card, ErrorList, Field, inputClass, Loading, NeedRole, PageTitle } from "@/components/parts";
import { errorMessages, useLoad } from "@/lib/use-load";

export function NewAd() {
  const session = useSession();
  const getRepository = useMakerRepository();
  const router = useRouter();
  const { state } = useLoad(async () => {
    const repo = getRepository();
    const [products, makers] = await Promise.all([repo.listProducts(), repo.listMakers()]);
    return { products, makers };
  }, [JSON.stringify(session)]);
  const [form, setForm] = useState<CreativeInput>({ product_id: "", headline: "", assets: {}, note: "初版" });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [assetBlocked, setAssetBlocked] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());

  if (session.role !== "maker_staff") return <NeedRole role="メーカー" />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorList errors={[state.error]} />;
  const makerName = state.data.makers.find((m) => m.id === session.makerId)?.display_name;

  const save = async () => {
    if (saving || assetBlocked) return;
    setSaving(true);
    setErrors([]);
    try {
      const { creative } = await getRepository().createCreative(session, form, requestId);
      router.push(`/ads/maker/creative?id=${creative.id}`);
    } catch (e) {
      setErrors(errorMessages(e));
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle title="新しい広告素材を登録" lead="登録しただけでは配信されません。募集に申請し、店舗が承認した掲載先だけに配信されます。" />
      <Card className="space-y-5"><fieldset disabled={saving} className="contents">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="対象商品" hint="1つの素材に商品は1つ">
            <select className={inputClass} value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
              <option value="">選んでください</option>
              {state.data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.category}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="見出し" hint="一覧や審査画面に出す広告の一言">
            <input className={inputClass} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
          </Field>
        </div>
        <CreativeAssetsPicker makerName={makerName} value={form.assets} onBlockedChange={setAssetBlocked} onChange={assets => setForm(current => ({ ...current, assets }))} />
        <Field label="版のメモ" hint="何を変えた版か">
          <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <ErrorList errors={errors} />
        <div className="flex gap-2">
          <Button disabled={saving || assetBlocked} onClick={save}>登録する</Button>
          <Button variant="secondary" onClick={() => router.back()}>戻る</Button>
        </div>
      </fieldset></Card>
    </>
  );
}
