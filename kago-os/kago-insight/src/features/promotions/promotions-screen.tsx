"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deactivatePromotion, savePromotion } from "@/lib/data-source";
import { channelLabel } from "@/lib/labels";
import { formatDate, toDateInputValue } from "@/lib/format";
import { EmptyState } from "@/components/state";
import type { Channel, Product, Promotion, PromotionDraft } from "@/lib/types";

const REASON_MAX = 60; // 利用者の画面に出るため短く。暫定値

type Editing = { kind: "new" } | { kind: "edit"; promotion: Promotion } | null;

export function PromotionsScreen({
  promotions,
  products,
}: {
  promotions: Promotion[];
  products: Product[];
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = promotions.filter((p) => p.status === "active");

  const afterAction = (message: string) => {
    setNotice(message);
    setEditing(null);
    startRefresh(() => router.refresh());
  };

  return (
    <div className="grid gap-6">
      {notice ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-bold">
            閉じる
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid gap-3 self-start">
          <h2 className="text-sm font-bold text-[var(--muted)]">
            設定中の販促（{active.length}件）
          </h2>

          {active.length === 0 ? (
            <EmptyState message="設定中の販促はありません。" />
          ) : (
            active.map((promotion) => (
              <PromotionCard
                key={promotion.id}
                promotion={promotion}
                selected={editing?.kind === "edit" && editing.promotion.id === promotion.id}
                onEdit={() => setEditing({ kind: "edit", promotion })}
                onDeactivated={(id) =>
                  afterAction(`販促 ${id} を停止しました（モックのため保存されません）`)
                }
              />
            ))
          )}

          <button
            type="button"
            onClick={() => setEditing({ kind: "new" })}
            className="rounded border border-dashed border-[var(--muted)] px-4 py-3 text-sm font-bold text-[var(--accent)]"
          >
            ＋ 販促を追加する
          </button>
        </div>

        <div className="self-start">
          {editing === null ? (
            <EmptyState message="左の一覧から設定を選ぶか、「販促を追加する」を押してください。" />
          ) : (
            <PromotionForm
              key={editing.kind === "new" ? "new" : editing.promotion.id}
              promotion={editing.kind === "edit" ? editing.promotion : null}
              products={products}
              onSaved={(version) =>
                afterAction(
                  `第${version}版として保存しました（モックのため保存されません）`,
                )
              }
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PromotionCard({
  promotion,
  selected,
  onEdit,
  onDeactivated,
}: {
  promotion: Promotion;
  selected: boolean;
  onEdit: () => void;
  onDeactivated: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const result = await deactivatePromotion(promotion.id);
    setBusy(false);
    if (result.ok) onDeactivated(promotion.id);
  };

  return (
    <div
      className={[
        "rounded-lg border bg-[var(--panel)] p-3",
        selected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20" : "border-[var(--line)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold">{promotion.product_name}</span>
        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
          第{promotion.version}版
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {promotion.time_windows.map((w) => `${w.start}〜${w.end}`).join("、")} ・{" "}
        {promotion.channels.map((c) => channelLabel[c]).join(" / ")} ・ 優先度{" "}
        {promotion.priority}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {formatDate(promotion.starts_at)} 〜 {formatDate(promotion.ends_at)}
      </p>
      <p className="mt-2 rounded bg-[var(--surface)] px-2 py-1 text-sm">
        「{promotion.reason_text}」
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded border border-[var(--line)] px-3 py-1.5 text-sm font-bold"
        >
          編集する
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="rounded border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {busy ? "処理中" : "停止する"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PromotionForm({
  promotion,
  products,
  onSaved,
  onCancel,
}: {
  promotion: Promotion | null;
  products: Product[];
  onSaved: (version: number) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString();
  const [productId, setProductId] = useState(promotion?.product_id ?? products[0]?.product_id ?? "");
  const [windows, setWindows] = useState<{ start: string; end: string }[]>(
    promotion?.time_windows ?? [{ start: "16:00", end: "19:00" }],
  );
  const [channels, setChannels] = useState<Channel[]>(promotion?.channels ?? ["app"]);
  const [priority, setPriority] = useState(promotion?.priority ?? 50);
  const [reasonText, setReasonText] = useState(promotion?.reason_text ?? "");
  const [startsAt, setStartsAt] = useState(
    toDateInputValue(promotion?.starts_at ?? today),
  );
  const [endsAt, setEndsAt] = useState(toDateInputValue(promotion?.ends_at ?? today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.product_id === productId) ?? null;
  const categories = Array.from(new Set(products.map((p) => p.category)));

  const toggleChannel = (channel: Channel) => {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel],
    );
  };

  const run = async () => {
    if (!productId) return setError("商品を選んでください。");
    if (channels.length === 0) return setError("掲載先を1つ以上選んでください。");
    if (reasonText.trim().length === 0)
      return setError("おすすめの理由を入力してください。利用者の画面に表示されます。");
    if (windows.some((w) => w.start >= w.end))
      return setError("時間帯の開始は終了より前にしてください。");
    if (startsAt > endsAt) return setError("有効期間の開始は終了より前にしてください。");

    const draft: PromotionDraft = {
      id: promotion?.id ?? null,
      product_id: productId,
      channels,
      time_windows: windows,
      priority,
      reason_text: reasonText.trim(),
      starts_at: `${startsAt}T00:00:00+09:00`,
      ends_at: `${endsAt}T23:59:59+09:00`,
    };

    setBusy(true);
    setError(null);
    const result = await savePromotion(draft);
    setBusy(false);
    if (result.ok) onSaved(promotion ? promotion.version + 1 : result.version);
    else setError(result.error);
  };

  return (
    <article className="grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 className="text-lg font-bold">
        {promotion ? `販促を編集（現在 第${promotion.version}版）` : "販促を追加"}
      </h2>

      {promotion ? (
        <p className="rounded border border-blue-300 bg-blue-50 p-2 text-xs text-blue-900">
          保存すると<strong>第{promotion.version + 1}版</strong>として新しく記録されます。
          これまでの表示実績は第{promotion.version}版のまま残り、書き換わりません。
        </p>
      ) : null}

      <Field label="対象商品">
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full rounded border border-[var(--line)] px-2 py-2 text-sm"
        >
          {categories.map((category) => (
            <optgroup key={category} label={category}>
              {products
                .filter((p) => p.category === category)
                .map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.name}（{p.price}円）
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="時間帯" hint="この時間帯だけ提案されます。曜日の指定は未対応です。">
        <div className="grid gap-2">
          {windows.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="time"
                value={w.start}
                onChange={(e) =>
                  setWindows((cur) =>
                    cur.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                  )
                }
                className="rounded border border-[var(--line)] px-2 py-1"
              />
              <span>〜</span>
              <input
                type="time"
                value={w.end}
                onChange={(e) =>
                  setWindows((cur) =>
                    cur.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                  )
                }
                className="rounded border border-[var(--line)] px-2 py-1"
              />
              {windows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setWindows((cur) => cur.filter((_, j) => j !== i))}
                  className="text-sm text-[var(--muted)] underline"
                >
                  削除
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWindows((cur) => [...cur, { start: "09:00", end: "12:00" }])}
            className="justify-self-start text-sm font-bold text-[var(--accent)] underline"
          >
            ＋ 時間帯を追加
          </button>
        </div>
      </Field>

      <Field label="掲載先">
        <div className="flex gap-4 text-sm">
          {(["app", "signage"] as Channel[]).map((channel) => (
            <label key={channel} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={channels.includes(channel)}
                onChange={() => toggleChannel(channel)}
              />
              {channelLabel[channel]}
            </label>
          ))}
        </div>
      </Field>

      <Field
        label={`優先度 ${priority}`}
        hint="0〜100。大きいほど優先して提案されます。同じ値のときの扱いはApp側と要確認です。"
      >
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field
        label="おすすめの理由"
        hint="利用者の画面にそのまま表示されます。店頭のPOPを書くつもりで。"
      >
        <input
          value={reasonText}
          maxLength={REASON_MAX}
          onChange={(e) => setReasonText(e.target.value)}
          placeholder="例：店内で揚げたてです"
          className="w-full rounded border border-[var(--line)] px-2 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          {reasonText.length} / {REASON_MAX} 文字
        </p>
      </Field>

      <Field label="有効期間">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="rounded border border-[var(--line)] px-2 py-1"
          />
          <span>〜</span>
          <input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="rounded border border-[var(--line)] px-2 py-1"
          />
        </div>
      </Field>

      <AppPreview product={selectedProduct} reasonText={reasonText} />

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="rounded bg-[var(--accent)] px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {busy ? "保存中" : promotion ? "新しい版として保存" : "この内容で追加"}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2">
          やめる
        </button>
      </div>
    </article>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-bold">{label}</p>
      {hint ? <p className="mb-1.5 text-xs text-[var(--muted)]">{hint}</p> : <div className="h-1.5" />}
      {children}
    </div>
  );
}

/**
 * 利用者のアプリでどう見えるかのプレビュー。
 * 設定した理由文がそのまま出るため、書いた人が結果を想像できるようにする。
 */
function AppPreview({
  product,
  reasonText,
}: {
  product: Product | null;
  reasonText: string;
}) {
  return (
    <div>
      <p className="text-sm font-bold">利用者の画面でのみえ方</p>
      <div className="mt-1.5 max-w-xs rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
        <p className="text-xs font-bold text-[var(--accent)]">店舗からのおすすめ</p>
        <p className="mt-1 font-bold">{product ? product.name : "（商品を選んでください）"}</p>
        {product ? <p className="text-sm">{product.price}円</p> : null}
        <p className="mt-2 text-sm text-[var(--muted)]">
          {reasonText.trim().length > 0 ? reasonText : "（理由を入力してください）"}
        </p>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        実際の見た目はAppの実装に合わせます。ここでは文言の確認用です。
      </p>
    </div>
  );
}
