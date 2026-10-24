"use client";
// ADS-02：募集（ad_calls）の作成・編集フォーム。成果の公開範囲もここで募集ごとに決める（共通仕様書 5）
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getRepository } from "@/lib/data";
import type { AdCallInput } from "@/lib/data/repository";
import { addDays, dateOf, dayEnd, dayStart, today } from "@/lib/domain/rules";
import {
  CHANNEL_LABEL,
  CHANNELS,
  DISCLOSURE_LABEL,
  DISCLOSURE_METRICS,
  type AdCall,
  type Channel,
  type DisclosureMetric,
  type Session,
} from "@/lib/domain/types";
import { useSession } from "@/lib/session";
import { Button, Card, ErrorList, Field, inputClass, Loading, NeedRole, PageTitle } from "@/components/parts";
import { errorMessages, useLoad } from "@/lib/use-load";

/** 画面の入力（日付は YYYY-MM-DD）。保存するときに時刻へ直す */
type FormState = Omit<AdCallInput, "starts_at" | "ends_at"> & { startDate: string; endDate: string };

export function RecruitmentForm({ id }: { id?: string }) {
  const session = useSession();
  const { state } = useLoad(async () => {
    const repo = getRepository();
    const [categories, current] = await Promise.all([
      repo.listCategories(),
      id ? repo.getAdCall(session, id) : Promise.resolve(undefined),
    ]);
    return { categories, current };
  }, [id, JSON.stringify(session)]);

  if (session.role !== "store_staff") return <NeedRole role="店舗の担当者" />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorList errors={[state.error]} />;
  const { categories, current } = state.data;
  // 公開中の募集は誰でも読めるので、編集できるのは自店の募集だけと画面でも確かめる（保存はデータ層でも拒否する）
  if (id && (!current || current.store_id !== session.storeId)) {
    return <ErrorList errors={["募集が見つからないか、他の店舗の募集です"]} />;
  }
  return <FormBody key={current?.updated_at ?? "new"} id={id} session={session} categories={categories} current={current} />;
}

/** 読み込み後に描画する本体（初期値の日付はここで作るので、事前描画中に現在時刻を読まない） */
function FormBody({ id, session, categories, current }: { id?: string; session: Session; categories: string[]; current?: AdCall }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    current
      ? {
          title: current.title,
          categories: current.categories,
          channels: current.channels,
          startDate: dateOf(current.starts_at),
          endDate: dateOf(current.ends_at),
          description: current.description,
          disclosure_scope: current.disclosure_scope,
        }
      : {
          title: "",
          categories: [],
          channels: ["app", "signage"],
          startDate: today(),
          endDate: addDays(today(), 30),
          description: "",
          disclosure_scope: [...DISCLOSURE_METRICS],
        },
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = <K extends "categories" | "channels" | "disclosure_scope">(key: K, value: string) =>
    setForm((f) => {
      const list = f[key] as string[];
      return { ...f, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });

  const save = async (publish: boolean) => {
    setSaving(true);
    setErrors([]);
    try {
      const repo = getRepository();
      const { startDate, endDate, ...rest } = form;
      const input: AdCallInput = {
        ...rest,
        starts_at: startDate ? dayStart(startDate) : "",
        ends_at: endDate ? dayEnd(endDate) : "",
      };
      const saved = await repo.saveAdCall(session, input, id);
      if (publish && saved.status === "draft") await repo.setAdCallStatus(session, saved.id, "open");
      router.push("/ads/store/calls");
    } catch (e) {
      setErrors(errorMessages(e));
      setSaving(false);
    }
  };

  const isDraft = !current || current.status === "draft";

  return (
    <>
      <PageTitle title={id ? "募集を編集" : "新しい募集を作る"} lead="メーカーに「この売り場に広告を出しませんか」と案内する募集です。" />
      <Card className="space-y-5">
        <Field label="募集名">
          <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：パスタ関連商品の広告募集" />
        </Field>

        <fieldset>
          <legend className="text-sm font-semibold">対象カテゴリ</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((c) => (
              <label key={c} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${form.categories.includes(c) ? "border-brand bg-orange-50 text-brand" : "border-line"}`}>
                <input type="checkbox" className="sr-only" checked={form.categories.includes(c)} onChange={() => toggle("categories", c)} />
                {c}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="掲載期間（はじめ）">
            <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="掲載期間（おわり）">
            <input type="date" className={inputClass} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">掲載先</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {CHANNELS.map((c: Channel) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.channels.includes(c)} onChange={() => toggle("channels", c)} />
                {CHANNEL_LABEL[c]}
                <span className="text-xs text-muted">{c === "app" ? "（お客様のスマホのおすすめ枠）" : "（店内の画面。動画15秒以内も可）"}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="案内文" hint="売り場の様子や、どんな広告を求めているか">
          <textarea className={`${inputClass} min-h-28`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>

        <fieldset>
          <legend className="text-sm font-semibold">メーカーに公開する成果</legend>
          <p className="text-xs text-muted">
            承認した広告について、ここで選んだ指標だけをメーカーの成果画面（ADS-04）に出します。個人の購買明細は出しません。表示来店数が5未満の集計には「少数のため参考値」と注記します。
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {DISCLOSURE_METRICS.map((m: DisclosureMetric) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.disclosure_scope.includes(m)} onChange={() => toggle("disclosure_scope", m)} />
                {DISCLOSURE_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="rounded-lg bg-gray-50 p-3 text-xs text-muted">
          募集を公開しても、広告の掲載は承認されません。届いた申請は KAGO/Insight で審査し、承認するときに掲載先を絞ることもできます。
        </p>

        <ErrorList errors={errors} />

        <div className="flex flex-wrap gap-2">
          {isDraft ? (
            <>
              <Button disabled={saving} onClick={() => save(true)}>保存して公開</Button>
              <Button variant="secondary" disabled={saving} onClick={() => save(false)}>下書き保存</Button>
            </>
          ) : (
            <Button disabled={saving} onClick={() => save(false)}>保存</Button>
          )}
          <Button variant="secondary" onClick={() => router.back()}>戻る</Button>
        </div>
      </Card>
    </>
  );
}
