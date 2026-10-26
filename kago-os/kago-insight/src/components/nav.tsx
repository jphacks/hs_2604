"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/signage-decisions", label: "サイネージ選定", issue: "SIG-06" },
  { href: "/promotions", label: "販促設定", issue: "INS-02" },
  { href: "/coupons", label: "販促効果", issue: "DEMO-09" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav aria-label="メインメニュー" className="border-b border-[var(--line)] bg-[var(--panel)] px-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={[
              "min-h-14 border-b-[3px] px-5 py-4 text-sm font-bold transition-colors",
              active
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
      </div>
    </nav>
  );
}
