// 画面で共通に使う小さな部品
import Link from "next/link";
import type { ReactNode } from "react";

export function PageTitle({ title, lead, action }: { title: string; lead?: string; action?: ReactNode }) {
  return (
    <div className="ads-page-title">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ads-card ${className}`}>{children}</div>;
}

const TONES = {
  green: "bg-green-50 text-green-800 ring-green-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`ads-badge ring-1 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const BTN = {
  primary: "ads-button-primary",
  secondary: "ads-button-secondary",
  danger: "ads-button-danger",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button
      className={`ads-button ${BTN[variant]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: keyof typeof BTN;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`ads-button ${BTN[variant]}`}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="ads-field">
      <span className="ads-field-label">{label}</span>
      {hint && <span className="ads-field-hint">{hint}</span>}
      <div className="ads-field-control">{children}</div>
    </label>
  );
}

export const inputClass =
  "ads-input";

export function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <ul className="list-disc space-y-1 pl-5">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="ads-empty">{children}</div>;
}

export function Loading() {
  return <p className="ads-loading">読み込み中…</p>;
}

/** 役割が違うときの案内（ログインが必要な画面） */
export function NeedRole({ role }: { role: "店舗の担当者" | "メーカー" }) {
  return (
    <Empty>
      この画面は「{role}」として使います。右上の「ログイン（デモ）」で切り替えてください。
    </Empty>
  );
}
