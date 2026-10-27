"use client";
import { useEffect, useRef, useState } from "react";
import { useAppEvents } from "@/features/events/event-provider";
export function RemovalFeedback({
  removal,
  onDone,
}: {
  removal: { eventId: string; productId: string; name: string };
  onDone: () => void;
}) {
  const track = useAppEvents(),
    presented = useRef(false),
    finished = useRef(false);
  const [reason, setReason] = useState("");
  const region = useRef<HTMLElement>(null);
  useEffect(() => {
    let visible = false;
    const record = () => {
      if (presented.current || !visible || document.hidden) return;
      presented.current = true;
      track({
        event_type: "removal_reason_prompted",
        selection_item_id: null,
        product_id: removal.productId,
        payload: { removal_event_id: removal.eventId },
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some(
          (e) => e.isIntersecting && e.intersectionRatio >= 0.25,
        );
        record();
      },
      { threshold: [0, 0.25] },
    );
    if (region.current) observer.observe(region.current);
    document.addEventListener("visibilitychange", record);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", record);
    };
  }, [removal, track]);
  const finish = (skip: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (skip)
      track({
        event_type: "removal_reason_skipped",
        selection_item_id: null,
        product_id: removal.productId,
        payload: { removal_event_id: removal.eventId },
      });
    else
      track({
        event_type: "removal_reason_submitted",
        selection_item_id: null,
        product_id: removal.productId,
        payload: { removal_event_id: removal.eventId, reason },
      });
    onDone();
  };
  return (
    <section
      ref={region}
      aria-label="任意の削除理由"
      className="mx-4 my-3 space-y-3 rounded-xl border border-teal-100 bg-teal-50 p-4"
    >
      <h3 className="text-sm font-bold">{removal.name}を削除しました</h3>
      <p className="text-xs text-slate-600">
        よければ理由を教えてください。入力しなくてもお買い物を続けられます。
      </p>
      <label className="block text-sm">
        削除した理由（任意）
        <select
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="削除した理由（任意）"
        >
          <option value="">選択してください</option>
          {[
            "価格が合わない",
            "買う予定が変わった",
            "別の商品にする",
            "その他",
          ].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!reason}
          onClick={() => finish(false)}
          className="min-h-11 rounded-xl bg-[#019FA3] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          理由を送信
        </button>
        <button
          type="button"
          onClick={() => finish(true)}
          className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm"
        >
          理由を入力せず続ける
        </button>
      </div>
    </section>
  );
}
