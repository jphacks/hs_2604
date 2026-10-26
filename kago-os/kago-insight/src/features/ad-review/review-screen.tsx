"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveApplication,
  rejectApplication,
  suspendPlacement,
} from "@/lib/actions";
import { actionErrorMessage, type ActionErrorCode } from "@/lib/action-result";
import { channelLabel, placementStatusLabel } from "@/lib/labels";
import { approvalPeriod, formatDate, formatDateTime, formatExclusiveEndDate, inclusiveEndInstant, toDateInputValue } from "@/lib/format";
import { USING_MOCK } from "@/lib/mode";
import { EmptyState } from "@/components/state";
import type { Application, Channel, Placement } from "@/lib/types";

const SAVE_NOTICE = USING_MOCK ? "（モックのため保存されません）" : "";

const REASON_MAX = 200; // DB-08: 1〜200文字

export function ReviewScreen({
  applications,
  placements,
}: {
  applications: Application[];
  placements: Placement[];
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => applications.find((a) => a.status === "submitted")?.id ?? null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const pending = applications.filter((a) => a.status === "submitted");
  const decided = applications.filter((a) => a.status !== "submitted");
  const activePlacements = placements.filter((p) => p.status === "active");
  const otherPlacements = placements.filter((p) => p.status !== "active");
  const selected = applications.find((a) => a.id === selectedId) ?? null;

  const afterAction = (message: string) => {
    setNotice(message);
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
            // key で、別の申請を選んだときにフォームの状態を初期化する
            <ApplicationDetail
              key={`${selected.id}-${selected.revision}`}
              application={selected}
              onDone={afterAction}
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
            <PlacementRow key={placement.id} placement={placement} onDone={afterAction} />
          ))
        )}

        {otherPlacements.length > 0 ? (
          <>
            <h2 className="mt-3 text-sm font-bold text-[var(--muted)]">配信していない広告</h2>
            {otherPlacements.map((placement) => (
              <PlacementRow key={placement.id} placement={placement} onDone={afterAction} />
            ))}
          </>
        ) : null}
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
  const resubmitted = application.revision > 1;

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
        申請 {formatDateTime(application.submitted_at)} ・ 素材 第
        {application.creative_version}版
      </p>
      {resubmitted ? (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
          再申請（{application.revision}回目）
        </p>
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


/** 期限切れ・通信失敗を白い枠にせず、署名URLを再取得できるようにする。 */
function ReviewImage({ url, headline, channel }: { url: string | null; headline: string; channel?:Channel }) {
  const aspect=channel==="app"?"aspect-square":channel==="signage"?"aspect-video":"aspect-[16/10]";
  const router = useRouter();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [refreshing, refresh] = useTransition();
  const automaticallyRetried = useRef(false);
  const reload = () => refresh(() => router.refresh());

  if (!url || failedUrl === url) {
    return (
      <div role="status" className={aspect+" flex w-full flex-col items-center justify-center gap-3 rounded border border-[var(--line)] bg-[var(--panel-2,#f5f5f0)] px-4 text-center text-sm text-[var(--muted)]"}>
        <p>素材画像を読み込めませんでした。</p>
        <button type="button" disabled={refreshing}
          onClick={() => { setFailedUrl(null); reload(); }}
          className="min-h-11 rounded border border-[var(--line)] px-4 py-2 font-bold text-[var(--ink)] disabled:opacity-50">
          {refreshing ? "読み込み中…" : "画像を再読み込み"}
        </button>
      </div>
    );
  }

  return (
    // 署名URLはnext/imageの永続キャッシュへ保存しない。素材全体を審査できるように収める。
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${headline} の広告素材`}
      className={aspect+" w-full rounded border border-[var(--line)] bg-[var(--panel-2,#f5f5f0)] object-contain"}
      onLoad={() => { automaticallyRetried.current = false; }}
      onError={() => {
        setFailedUrl(url);
        // 壊れた素材などで無限に再取得しない。以降は利用者の再試行を待つ。
        if (!automaticallyRetried.current) {
          automaticallyRetried.current = true;
          reload();
        }
      }} />
  );
}

function ApplicationDetail({
  application,
  onDone,
}: {
  application: Application;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const requested = application.requested_period;
  const [startsAt, setStartsAt] = useState(() => toDateInputValue(requested.starts_at));
  const [endsAt, setEndsAt] = useState(() => toDateInputValue(inclusiveEndInstant(requested.ends_at)));
  const [channels, setChannels] = useState<Channel[]>(application.channels);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: ActionErrorCode; text: string } | null>(null);

  const decided = application.status !== "submitted";
  const rejections = application.history.filter(
    (h) => h.status === "rejected" && h.review_comment,
  );
  // いま見ている版の却下と、それより前の版の却下は意味が違う。
  // 前者は「この申請をこう却下した」、後者は「メーカーが直してくるはずの指摘」。
  const currentRejection = rejections.find((h) => h.revision === application.revision);
  const pastRejections = rejections.filter((h) => h.revision !== application.revision);

  const toggleChannel = (channel: Channel) => {
    setChannels((current) =>
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel],
    );
  };

  const fail = (code: ActionErrorCode) => setError({ code, text: actionErrorMessage(code) });

  const runApprove = async () => {
    const period = approvalPeriod(requested, startsAt, endsAt);
    if (channels.length === 0 || !period) return fail("invalid_argument");
    setBusy(true);
    setError(null);
    const result = await approveApplication(application.id, application.revision, {
      ...period,
      channels,
    });
    setBusy(false);
    if (result.ok) {
      onDone(
        result.data.replayed
          ? `申請 ${application.id} はすでに同じ内容で承認済みでした${SAVE_NOTICE}`
          : `申請 ${application.id} を承認しました${SAVE_NOTICE}`,
      );
    } else {
      setError({ code: result.code, text: result.message });
    }
  };

  const runReject = async () => {
    if (reason.trim().length === 0 || reason.trim().length > REASON_MAX) {
      return fail("invalid_argument");
    }
    setBusy(true);
    setError(null);
    const result = await rejectApplication(application.id, application.revision, reason.trim());
    setBusy(false);
    if (result.ok) {
      onDone(
        result.data.replayed
          ? `申請 ${application.id} はすでに同じ理由で却下済みでした${SAVE_NOTICE}`
          : `申請 ${application.id} を却下しました${SAVE_NOTICE}`,
      );
    } else {
      setError({ code: result.code, text: result.message });
    }
  };

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      {application.media_images ? <div className="grid gap-4">
        {application.channels.map(channel=><div key={channel}>
          <p className="mb-2 text-sm font-bold">{channel==="app"?"App用画像（1:1）":"Signage用画像（16:9）"}</p>
          <ReviewImage channel={channel} url={application.media_images?.[channel]?.url??null} headline={application.headline}/>
        </div>)}
      </div> : <ReviewImage url={application.image_url ?? null} headline={application.headline} />}

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
          {formatDate(requested.starts_at)} 〜 {formatExclusiveEndDate(requested.ends_at)}
        </dd>

        <dt className="text-[var(--muted)]">希望する掲載先</dt>
        <dd>{application.channels.map((c) => channelLabel[c]).join(" / ")}</dd>

        <dt className="text-[var(--muted)]">素材の版</dt>
        <dd>第{application.creative_version}版</dd>

        <dt className="text-[var(--muted)]">申請の版</dt>
        <dd>
          第{application.revision}版
          {application.revision > 1 ? "（再申請）" : ""}
        </dd>
      </dl>

      {application.message ? (
        <div className="mt-3 rounded border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
          <p className="text-xs font-bold text-[var(--muted)]">メーカーからの連絡</p>
          <p className="mt-1">{application.message}</p>
        </div>
      ) : null}

      {currentRejection ? (
        <div className="mt-4 rounded border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
          <p className="font-bold">この申請の却下理由</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {currentRejection.reviewed_at ? formatDateTime(currentRejection.reviewed_at) : ""}
          </p>
          <p className="mt-1">{currentRejection.review_comment}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            メーカーが内容を直して再申請すると、第{application.revision + 1}版として審査待ちに戻ります。
          </p>
        </div>
      ) : null}

      {pastRejections.length > 0 ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-bold text-amber-900">前の版の却下理由</p>
          <ul className="mt-2 grid gap-2">
            {pastRejections.map((h) => (
              <li key={h.revision} className="text-amber-900">
                <span className="text-xs">
                  第{h.revision}版 ・ {h.reviewed_at ? formatDateTime(h.reviewed_at) : ""}
                </span>
                <p>{h.review_comment}</p>
              </li>
            ))}
          </ul>
          {!decided ? (
            <p className="mt-2 text-xs text-amber-800">
              前回の指摘が直っているか確認してください。
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          className={[
            "mt-4 rounded border p-3 text-sm",
            error.code === "revision_changed"
              ? "border-amber-400 bg-amber-50 text-amber-900"
              : "border-red-300 bg-red-50 text-red-900",
          ].join(" ")}
        >
          <p>{error.text}</p>
          {error.code === "revision_changed" || error.code === "conflict" ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 rounded border border-current px-3 py-1.5 font-bold"
            >
              再読み込み
            </button>
          ) : null}
        </div>
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
          <p className="text-sm font-bold">掲載条件を確認してください</p>
          <p className="text-xs text-[var(--muted)]">
            メーカーの希望より<strong>狭める方向にだけ</strong>変更できます。広げることはできません。
          </p>

          <div>
            <p className="text-xs font-bold">掲載期間</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <input
                type="date"
                value={startsAt}
                min={toDateInputValue(requested.starts_at)}
                max={endsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="rounded border border-[var(--line)] px-2 py-1"
              />
              <span>〜</span>
              <input
                type="date"
                value={endsAt}
                min={startsAt}
                max={toDateInputValue(inclusiveEndInstant(requested.ends_at))}
                onChange={(e) => setEndsAt(e.target.value)}
                className="rounded border border-[var(--line)] px-2 py-1"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold">掲載先</p>
            <div className="mt-1 flex gap-4 text-sm">
              {application.channels.map((channel) => (
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
            <p className="mt-1 text-xs text-[var(--muted)]">
              メーカーが希望していない掲載先は選べません。
            </p>
          </div>

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
            maxLength={REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="例：対象商品の価格表記が店頭と異なります"
            className="rounded border border-[var(--line)] px-2 py-1 text-sm"
          />
          <p className="text-xs text-[var(--muted)]">
            {reason.length} / {REASON_MAX} 文字。メーカーのAds画面に表示されます。
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
  onDone,
}: {
  placement: Placement;
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = placement.status === "active";

  const run = async () => {
    if (reason.trim().length === 0 || reason.trim().length > REASON_MAX) {
      setError(actionErrorMessage("invalid_argument"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await suspendPlacement(placement.id, reason.trim());
    setBusy(false);
    if (result.ok) {
      onDone(
        result.data.replayed
          ? `配信 ${placement.id} はすでに停止済みでした${SAVE_NOTICE}`
          : `配信 ${placement.id} を停止しました${SAVE_NOTICE}`,
      );
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold">{placement.product_name}</p>
          <p className="text-sm text-[var(--muted)]">
            {placement.maker_display_name} ・{" "}
            {placement.channels.map((c) => channelLabel[c]).join(" / ")} ・{" "}
            {formatDate(placement.starts_at)} 〜 {formatExclusiveEndDate(placement.ends_at)}
          </p>
          {placement.suspend_reason ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              停止理由：{placement.suspend_reason}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={[
              "rounded px-2 py-0.5 text-xs font-bold",
              active ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700",
            ].join(" ")}
          >
            {placementStatusLabel[placement.status]}
          </span>
          {active ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded border border-[var(--line)] px-3 py-1.5 text-sm font-bold"
            >
              停止する
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3">
          <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
            <strong>停止すると元に戻せません。</strong>
            再び配信するには、メーカーに再申請してもらい、もう一度承認する必要があります。
          </p>
          <label className="text-sm font-bold" htmlFor={`suspend-${placement.id}`}>
            停止する理由（必須）
          </label>
          <input
            id={`suspend-${placement.id}`}
            value={reason}
            maxLength={REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例：対象商品が欠品したため"
            className="rounded border border-[var(--line)] px-2 py-1 text-sm"
          />
          <p className="text-xs text-[var(--muted)]">
            {reason.length} / {REASON_MAX} 文字
          </p>
          {error ? <p className="text-sm text-red-900">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run()}
              className="rounded border border-red-400 bg-red-50 px-4 py-2 text-sm font-bold text-red-900 disabled:opacity-50"
            >
              {busy ? "処理中" : "停止する（取り消せません）"}
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
