"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/review", label: "広告審査", issue: "INS-01" },
  { href: "/promotions", label: "販促設定", issue: "INS-02" },
  { href: "/metrics", label: "成果", issue: "INS-03" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-[var(--line)] bg-[var(--panel)] px-4">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={[
              "border-b-2 px-4 py-3 text-sm font-bold transition-colors",
              active
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
