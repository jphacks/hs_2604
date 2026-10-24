"use client";
// ADS-03：申請・再申請で共通の入力欄（素材の版・掲載先・希望期間・メッセージ）
import { dateOf, dayEnd, dayStart, periodLabel } from "@/lib/domain/rules";
import { CHANNEL_LABEL, type AdCall, type CreativeVersion } from "@/lib/domain/types";
import type { ApplicationInput } from "@/lib/data/repository";
import { AdMedia } from "@/components/ad-media";
import { Field, inputClass } from "@/components/parts";

export function ApplicationFields({
  call,
  versions,
  value,
  onChange,
  makerName,
}: {
  call: AdCall;
  versions: CreativeVersion[];
  value: ApplicationInput;
  onChange: (v: ApplicationInput) => void;
  makerName?: string;
}) {
  const version = versions.find((v) => v.id === value.creative_version_id);
  const minDate = dateOf(call.starts_at);
  const maxDate = dateOf(call.ends_at);
  return (
    <div className="space-y-5">
      <Field label="素材の版">
        <select className={inputClass} value={value.creative_version_id} onChange={(e) => onChange({ ...value, creative_version_id: e.target.value })}>
          {[...versions].reverse().map((v) => (
            <option key={v.id} value={v.id}>
              第{v.version}版　{v.note}
            </option>
          ))}
        </select>
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">掲載先</legend>
        <p className="text-xs text-muted">この募集が募集している掲載先だけ選べます。店舗は承認するときに掲載先を絞ることがあります。</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {call.channels.map((ch) => {
            const asset = version?.assets[ch];
            return (
              <label key={ch} className={`block rounded-lg border p-3 ${asset ? "cursor-pointer" : "opacity-60"} ${value.channels.includes(ch) ? "border-brand bg-orange-50/40" : "border-line"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    disabled={!asset}
                    checked={value.channels.includes(ch)}
                    onChange={() =>
                      onChange({ ...value, channels: value.channels.includes(ch) ? value.channels.filter((x) => x !== ch) : [...value.channels, ch] })
                    }
                  />
                  {CHANNEL_LABEL[ch]}
                  {!asset && <span className="text-xs font-normal text-muted">（この版に素材がありません）</span>}
                </span>
                {asset && <AdMedia asset={asset} channel={ch} makerName={makerName} className={`mt-2 ${ch === "app" ? "max-w-40" : ""}`} />}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="希望期間（はじめ）" hint={`募集の掲載期間 ${periodLabel(call.starts_at, call.ends_at)}`}>
          <input
            type="date"
            className={inputClass}
            min={minDate}
            max={maxDate}
            value={value.requested_start ? dateOf(value.requested_start) : ""}
            onChange={(e) => onChange({ ...value, requested_start: e.target.value ? dayStart(e.target.value) : "" })}
          />
        </Field>
        <Field label="希望期間（おわり）">
          <input
            type="date"
            className={inputClass}
            min={minDate}
            max={maxDate}
            value={value.requested_end ? dateOf(value.requested_end) : ""}
            onChange={(e) => onChange({ ...value, requested_end: e.target.value ? dayEnd(e.target.value) : "" })}
          />
        </Field>
      </div>

      <Field label="店舗へのメッセージ" hint="任意">
        <textarea className={`${inputClass} min-h-20`} value={value.message} onChange={(e) => onChange({ ...value, message: e.target.value })} />
      </Field>
    </div>
  );
}
