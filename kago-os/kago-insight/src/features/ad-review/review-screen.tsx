"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveApplication,
  rejectApplication,
  suspendPlacement,
} from "@/lib/data-source";
import { channelLabel, placementStatusLabel } from "@/lib/labels";
import { formatDate, formatDateTime, toDateInputValue } from "@/lib/format";
import { EmptyState } from "@/components/state";
import type { Application, Placement } from "@/lib/types";

const REJECT_REASON_MAX = 200; // 暫定。Ads と要確認

export function ReviewScreen({
  applications,
  placements,
}: {
  applications: Application[];
  placements: Placement[];
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => applications.find((a) => a.status === "submitted")?.id ?? null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const pending = applications.filter((a) => a.status === "submitted");
  const decided = applications.filter((a) => a.status !== "submitted");
  const activePlacements = placements.filter((p) => p.status === "active");
  const selected = applications.find((a) => a.id === selectedId) ?? null;

  const afterAction = (message: string) => {
    setNotice(message);
    startRefresh(() => router.refresh());
  };

  return (
    <div className="grid gap-6" aria-busy={refreshing}>
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
            審査待ち（{pending.length}件）
          </h2>
          {pending.length === 0 ? (
            <EmptyState message="審査待ちの申請はありません。" />
          ) : (
            pending.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                selected={application.id === selectedId}
                onSelect={() => setSelectedId(application.id)}
              />
            ))
          )}

          {decided.length > 0 ? (
            <>
              <h2 className="mt-3 text-sm font-bold text-[var(--muted)]">審査済み</h2>
              {decided.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  selected={application.id === selectedId}
                  onSelect={() => setSelectedId(application.id)}
                />
              ))}
            </>
          ) : null}
        </div>

        <div className="self-start">
          {selected ? (
            // key を付けることで、別の申請を選んだときにフォームの状態が自動で初期化される。
            // useEffect で手動リセットしない（React 19 の set-state-in-effect 対策）。
            <ApplicationDetail
              key={selected.id}
              application={selected}
              onApproved={(id) =>
                afterAction(`申請 ${id} を承認しました（モックのため保存されません）`)
              }
              onRejected={(id) =>
                afterAction(`申請 ${id} を却下しました（モックのため保存されません）`)
              }
            />
          ) : (
            <EmptyState message="左の一覧から申請を選んでください。" />
          )}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-bold text-[var(--muted)]">
          配信中の広告（{activePlacements.length}件）
        </h2>
        {activePlacements.length === 0 ? (
          <EmptyState message="配信中の広告はありません。" />
        ) : (
          activePlacements.map((placement) => (
            <PlacementRow
              key={placement.id}
              placement={placement}
              onSuspended={(id) =>
                afterAction(`配信 ${id} を停止しました（モックのため保存されません）`)
              }
            />
          ))
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ApplicationCard({
  application,
  selected,
  onSelect,
}: {
  application: Application;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "w-full rounded-lg border bg-[var(--panel)] p-3 text-left transition-colors",
        selected
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20"
          : "border-[var(--line)] hover:border-[var(--muted)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold">{application.headline}</span>
        <StatusBadge status={application.status} />
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {application.maker_display_name}
        {application.maker_is_fictional ? "（架空）" : ""} ・ {application.product_name}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        申請 {formatDateTime(application.submitted_at)} ・ 第{application.creative_version}版
      </p>
      {application.review_comment_is_previous ? (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">再申請</p>
      ) : null}
    </button>
  );
}

function StatusBadge({ status }: { status: Application["status"] }) {
  const style =
    status === "submitted"
      ? "bg-blue-100 text-blue-900"
      : status === "approved"
        ? "bg-emerald-100 text-emerald-900"
        : "bg-slate-200 text-slate-700";
  const label =
    status === "submitted" ? "審査待ち" : status === "approved" ? "承認済み" : "却下";
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${style}`}>{label}</span>
  );
}

/* ------------------------------------------------------------------ */

function ApplicationDetail({
  application,
  onApproved,
  onRejected,
}: {
  application: Application;
  onApproved: (id: string) => void;
  onRejected: (id: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [startsAt, setStartsAt] = useState(() =>
    toDateInputValue(application.requested_period.starts_at),
  );
  const [endsAt, setEndsAt] = useState(() =>
    toDateInputValue(application.requested_period.ends_at),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decided = application.status !== "submitted";

  const runApprove = async () => {
    setBusy(true);
    setError(null);
    const result = await approveApplication(application.id, {
      starts_at: `${startsAt}T00:00:00+09:00`,
      ends_at: `${endsAt}T23:59:59+09:00`,
    });
    setBusy(false);
    if (result.ok) onApproved(application.id);
    else setError(errorMessage(result.error));
  };

  const runReject = async () => {
    if (reason.trim().length === 0) {
      setError("却下する理由を入力してください。メーカーの修正の手がかりになります。");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await rejectApplication(application.id, reason.trim());
    setBusy(false);
    if (result.ok) onRejected(application.id);
    else setError(errorMessage(result.error));
  };

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={application.image_path}
        alt={`${application.headline} の広告素材`}
        className="aspect-[16/10] w-full rounded border border-[var(--line)] object-cover"
      />

      <h2 className="mt-4 text-lg font-bold">{application.headline}</h2>

      <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
        <dt className="text-[var(--muted)]">メーカー</dt>
        <dd>
          {application.maker_display_name}
          {application.maker_is_fictional ? "（架空）" : ""}
        </dd>

        <dt className="text-[var(--muted)]">対象商品</dt>
        <dd>
          {application.product_name}
          <span className="ml-2 text-xs text-[var(--muted)]">{application.product_code}</span>
        </dd>

        <dt className="text-[var(--muted)]">募集</dt>
        <dd>{application.ad_call_title}</dd>

        <dt className="text-[var(--muted)]">希望期間</dt>
        <dd>
          {formatDate(application.requested_period.starts_at)} 〜{" "}
          {formatDate(application.requested_period.ends_at)}
        </dd>

        <dt className="text-[var(--muted)]">掲載先</dt>
        <dd>{application.channels.map((c) => channelLabel[c]).join(" / ")}</dd>

        <dt className="text-[var(--muted)]">素材の版</dt>
        <dd>第{application.creative_version}版</dd>
      </dl>

      {application.review_comment ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-bold text-amber-900">
            {application.review_comment_is_previous ? "前回の却下理由" : "審査コメント"}
          </p>
          <p className="mt-1 text-amber-900">{application.review_comment}</p>
          {application.review_comment_is_previous ? (
            <p className="mt-2 text-xs text-amber-800">
              この申請は再申請です。前回の指摘が直っているか確認してください。
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      {decided ? (
        <p className="mt-4 text-sm text-[var(--muted)]">この申請は審査済みです。</p>
      ) : mode === "idle" ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("approve")}
            className="rounded bg-[var(--accent)] px-4 py-2 font-bold text-white"
          >
            承認する
          </button>
          <button
            type="button"
            onClick={() => setMode("reject")}
            className="rounded border border-[var(--line)] px-4 py-2 font-bold"
          >
            却下する
          </button>
        </div>
      ) : mode === "approve" ? (
        <div className="mt-4 grid gap-3 rounded border border-[var(--line)] p-3">
          <p className="text-sm font-bold">掲載期間を確認してください</p>
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
          <p className="text-xs text-[var(--muted)]">
            初期値はメーカーの希望期間です。店舗が期間を変更できるかは未確定のため、暫定で編集可能にしています。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runApprove()}
              className="rounded bg-[var(--accent)] px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              {busy ? "処理中" : "この内容で承認"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="px-3 py-2">
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 rounded border border-[var(--line)] p-3">
          <label className="text-sm font-bold" htmlFor="reject-reason">
            却下する理由（必須）
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            maxLength={REJECT_REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="例：対象商品の価格表記が店頭と異なります"
            className="rounded border border-[var(--line)] px-2 py-1 text-sm"
          />
          <p className="text-xs text-[var(--muted)]">
            {reason.length} / {REJECT_REASON_MAX} 文字。メーカーのAds画面に表示されます。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runReject()}
              className="rounded border border-red-400 bg-red-50 px-4 py-2 font-bold text-red-900 disabled:opacity-50"
            >
              {busy ? "処理中" : "この理由で却下"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="px-3 py-2">
              やめる
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */

function PlacementRow({
  placement,
  onSuspended,
}: {
  placement: Placement;
  onSuspended: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (reason.trim().length === 0) {
      setError("停止する理由を入力してください。");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await suspendPlacement(placement.id, reason.trim());
    setBusy(false);
    if (result.ok) onSuspended(placement.id);
    else setError(result.error);
  };

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold">{placement.product_name}</p>
          <p className="text-sm text-[var(--muted)]">
            {placement.maker_display_name} ・{" "}
            {placement.channels.map((c) => channelLabel[c]).join(" / ")} ・{" "}
            {formatDate(placement.starts_at)} 〜 {formatDate(placement.ends_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
            {placementStatusLabel[placement.status]}
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded border border-[var(--line)] px-3 py-1.5 text-sm font-bold"
          >
            停止する
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3">
          <label className="text-sm font-bold" htmlFor={`suspend-${placement.id}`}>
            停止する理由（必須）
          </label>
          <input
            id={`suspend-${placement.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例：対象商品が欠品したため"
            className="rounded border border-[var(--line)] px-2 py-1 text-sm"
          />
          <p className="text-xs text-[var(--muted)]">
            停止すると配信候補から外れます。停止から再開できるかは未確定です。
          </p>
          {error ? <p className="text-sm text-red-900">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run()}
              className="rounded border border-red-400 bg-red-50 px-4 py-2 text-sm font-bold text-red-900 disabled:opacity-50"
            >
              {busy ? "処理中" : "停止する"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm">
              やめる
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function errorMessage(code: "not_owner" | "already_decided" | "not_found"): string {
  switch (code) {
    case "not_owner":
      return "この申請は自店舗宛ではないため操作できません。";
    case "already_decided":
      return "すでに他の担当者が審査しました。再読み込みしてください。";
    case "not_found":
      return "申請が見つかりません。";
  }
}
