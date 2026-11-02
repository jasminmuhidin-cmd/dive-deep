"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** The ways into the water — shared by every header and footer */
export const SECTIONS = [
  { href: "/kiosk", label: "Kiosk", blurb: "Leave a thought in the water." },
  { href: "/mobile", label: "Dive", blurb: "Swim down through them on your phone." },
] as const;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Kiosk · Dive as one segmented pill, the current page filled in.
 * Drawn in `currentColor`, so it takes on whatever colour its parent sets.
 */
export function SiteNavLinks() {
  const isActive = useActive();
  return (
    <ul className="flex items-center rounded-full border border-current/25 p-0.5">
      {SECTIONS.map(({ href, label }) => {
        const active = isActive(href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-9 items-center rounded-full px-3 text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-current sm:px-4 sm:text-sm ${
                active ? "bg-current/15" : "opacity-65 hover:opacity-100"
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Logo and the main links, for pages on the dark ocean background */
export function SiteHeader() {
  return (
    <header className="relative z-20 w-full text-foam">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-5 md:px-8">
        <Link href="/" aria-label="Dive Deep — home" className="relative block h-6 w-[104px] shrink-0 sm:h-7 sm:w-[121px]">
          <Image src="/branding/logo-white.png" alt="" fill sizes="121px" className="object-contain" priority />
        </Link>
        <nav aria-label="Main">
          <SiteNavLinks />
        </nav>
      </div>
    </header>
  );
}

/** Each way in with a line on what it's for, and where you are now */
export function SiteFooter() {
  const isActive = useActive();
  return (
    <footer className="relative z-10 w-full border-t border-foam/10 text-left text-foam">
      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <nav aria-label="Footer">
          <ul className="grid gap-3 sm:grid-cols-2">
            {SECTIONS.map(({ href, label, blurb }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`block min-h-11 rounded-2xl border p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam/70 ${
                      active ? "border-foam/35 bg-foam/5" : "border-foam/15 hover:border-foam/35"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2 font-serif text-lg text-foam/90">
                      {label}
                      {active && <span className="text-xs text-foam/45">You&apos;re here</span>}
                    </span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-foam/55">{blurb}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="mt-8 text-xs text-foam/35">
          Dive Deep · Don&apos;t just skim the surface.
        </p>
      </div>
    </footer>
  );
}
