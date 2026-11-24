"use client";

import Link from "next/link";
import { Search } from "lucide-react";

type DiveNavProps = {
  onSearch?: () => void;
  searchHref?: string;
  className?: string;
  tone?: "default" | "light";
};

export default function DiveNav({
  onSearch,
  searchHref,
  className = "",
  tone = "default",
}: DiveNavProps) {
  const linkClass = `flex min-h-11 items-center tracking-[0.04em] transition hover:opacity-60 ${
    tone === "light" ? "text-white/85" : ""
  }`;
  const searchClass = "-mr-3 grid h-11 w-11 place-items-center rounded-full transition hover:opacity-60";

  return (
    <nav aria-label="Main" className={`flex items-center justify-between ${className}`}>
      <Link href="/" className={linkClass}>
        home
      </Link>
      <Link href="/about" className={linkClass}>
        about
      </Link>
      <Link href="/kiosk" className={linkClass}>
        kiosk
      </Link>
      <Link href="/projection" className={linkClass}>
        projection
      </Link>
      {onSearch ? (
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search the thoughts"
          className={searchClass}
        >
          <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </button>
      ) : searchHref ? (
        <Link href={searchHref} aria-label="Search the thoughts" className={searchClass}>
          <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}
