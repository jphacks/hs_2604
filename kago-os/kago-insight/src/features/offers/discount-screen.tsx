"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDiscount } from "@/lib/offer-actions";
import { formatDate, formatYen } from "@/lib/format";
import type { ProductDiscount } from "@/lib/supabase-offers";

/**
 * DEMO-03 商品ごとの値引き率。
 * 入力は1〜90の整数か空欄のみ。空欄はその商品の値引きを停止する。
 * 値引き単価は DB の kago_offer_unit_discount と同じ floor(price * percent / 100)。
 */

type RowState = { message: string; tone: "ok" | "error" } | undefined;

function unitDiscount(price: number, percent: number): number {
  return Math.min(price, Math.floor((price * percent) / 100));
}

/**
 * 入力の正規化。全角数字は半角に直し、空白は落とす。
 * 入力欄を type="number" にすると、ブラウザが解釈できない文字（全角・かな）を
 * 空文字として返すため、「入力したのに空欄＝値引き停止」と誤って扱われる。
 * そのため text で受け取り、検査はこちらで行う。
 */
function normalize(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[\s\u3000]/g, "");
}

export function DiscountScreen({ products }: { products: ProductDiscount[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      products.map((p) => [p.product_id, p.discount_percent === null ? "" : String(p.discount_percent)]),
    ),
  );
  const [states, setStates] = useState<Record<string, RowState>>({});

  const visible = keyword.trim()
    ? products.filter(
        (p) => p.name.includes(keyword.trim()) || p.code.includes(keyword.trim()) || p.category.includes(keyword.trim()),
      )
    : products;

  function setState(productId: string, state: RowState) {
    setStates((prev) => ({ ...prev, [productId]: state }));
  }

  function save(product: ProductDiscount) {
    const raw = normalize(inputs[product.product_id] ?? "");

    // 入力の検査は日本語で、その行に出す
    let percent: number | null;
    if (raw === "") {
      percent = null;
    } else if (!/^\d+$/.test(raw)) {
      setState(product.product_id, { tone: "error", message: "半角の数字で入力してください。" });
      return;
    } else {
      percent = Number(raw);
      if (percent < 1 || percent > 90) {
        setState(product.product_id, { tone: "error", message: "値引き率は1〜90%で入力してください。" });
        return;
      }
    }

    setState(product.product_id, undefined);
    setSavingId(product.product_id);
    startTransition(async () => {
      const result = await saveDiscount(product.product_id, percent);
      setSavingId(null);
      if (!result.ok) {
        setState(product.product_id, { tone: "error", message: result.message });
        return;
      }
      setState(product.product_id, {
        tone: "ok",
        message:
          percent === null
            ? "値引きを停止しました。"
            : result.data.stopped > 0
              ? `${percent}%で保存しました（前の設定は停止しました）。`
              : `${percent}%で保存しました。`,
      });
      router.refresh();
    });
  }

  if (products.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
        取扱商品が登録されていません。
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="keyword" className="text-sm font-bold">
          商品を絞り込む
        </label>
        <input
          id="keyword"
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="商品名・コード・カテゴリ"
          className="w-64 rounded border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
        />
        <span className="text-sm text-[var(--muted)]">
          {visible.length} / {products.length} 件
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
              <th className="px-3 py-2 font-normal">商品</th>
              <th className="px-3 py-2 text-right font-normal">価格</th>
              <th className="px-3 py-2 font-normal">値引き率</th>
              <th className="px-3 py-2 text-right font-normal">値引き後</th>
              <th className="px-3 py-2 font-normal">現在の設定</th>
              <th className="px-3 py-2 font-normal"> </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((product) => {
              const raw = normalize(inputs[product.product_id] ?? "");
              const parsed = /^\d+$/.test(raw) ? Number(raw) : null;
              // 空欄のまま保存すると停止になるので、ボタンの文言で先に伝える
              const willStop = raw === "" && product.discount_percent !== null;
              const preview =
                parsed !== null && parsed >= 1 && parsed <= 90
                  ? product.price - unitDiscount(product.price, parsed)
                  : null;
              const state = states[product.product_id];
              const saving = savingId === product.product_id && pending;

              return (
                <tr key={product.product_id} className="border-b border-[var(--line)] align-top">
                  <td className="px-3 py-3">
                    <div className="font-bold">{product.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {product.category} ・ {product.code}
                    </div>
                    {state ? (
                      <p
                        role={state.tone === "error" ? "alert" : "status"}
                        className={`mt-1 text-xs ${state.tone === "error" ? "text-red-700" : "text-green-800"}`}
                      >
                        {state.message}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatYen(product.price)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={inputs[product.product_id] ?? ""}
                        // 打たれた文字をそのまま保持し、こちらからは書き換えない。
                        // IMEの変換中に value を上書きすると変換が打ち切られ、
                        // 打った文字ごと消えて「空欄＝停止」と誤判定されるため。
                        // 全角から半角への読み替えは save() と表示計算の中だけで行う。
                        onChange={(event) =>
                          setInputs((prev) => ({
                            ...prev,
                            [product.product_id]: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          // 変換確定のEnterで保存しない
                          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            save(product);
                          }
                        }}
                        aria-label={`${product.name} の値引き率`}
                        className="w-20 rounded border border-[var(--line)] px-2 py-1 text-right tabular-nums"
                      />
                      <span className="text-sm text-[var(--muted)]">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {preview === null ? (
                      <span className="text-[var(--muted)]">—</span>
                    ) : (
                      <span className="font-bold">{formatYen(preview)}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {product.discount_percent === null ? (
                      <span className="text-[var(--muted)]">値引きなし</span>
                    ) : (
                      <>
                        <span className="rounded bg-[var(--accent)] px-2 py-0.5 font-bold text-white">
                          {product.discount_percent}%OFF
                        </span>
                        {product.ends_at ? (
                          <div className="mt-1 text-[var(--muted)]">
                            {formatDate(product.ends_at)} まで
                          </div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => save(product)}
                      disabled={saving}
                      className="rounded border border-[var(--line)] px-3 py-1.5 text-sm font-bold hover:bg-[var(--surface)] disabled:opacity-60"
                    >
                      {saving ? "保存中…" : willStop ? "値引きを停止" : "保存"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        空欄にして保存すると、その商品の値引きを停止します。値引き率を変えた場合は、
        前の設定を停止して新しい設定を作ります（DBの仕様上、作成後の条件は変更できないため）。
        値引き後の価格は1個あたりで、端数は切り捨てです。設定した内容はアプリのクーポンとして配布されます。
      </p>
    </div>
  );
}
