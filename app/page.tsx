import Link from "next/link";

/**
 * Home: the "dive deep" wordmark over a grainy aqua → blue gradient, with
 * three white pill links.
 *
 * Accessibility (WCAG 2.2 AA):
 *  - Gradient stops #3892A5 → #408EBC → #6088C4 all give white ≥ 3.6 : 1, so
 *    the white wordmark and the white button shapes stand out (1.4.11, 3 : 1).
 *  - Button text is navy #2D3651 on white: 11.9 : 1 (1.4.3, 4.5 : 1).
 *  - Visible focus ring for keyboard users; links are real <a> elements.
 */
const links = [
  { href: "/kiosk", label: "Kiosk" },
  { href: "/projection", label: "Live Projection" },
  { href: "/gallery", label: "Website Archive" },
];

export default function HomePage() {
  return (
    <main className="home-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div className="home-grain pointer-events-none absolute inset-0" aria-hidden />

      <h1 className="relative m-0 w-full max-w-[640px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/dive-deep-wordmark.png"
          alt="dive deep"
          width={1292}
          height={306}
          className="block h-auto w-full"
        />
      </h1>

      <nav aria-label="Main" className="relative mt-[clamp(4rem,14vh,10rem)] flex w-full max-w-[340px] flex-col gap-5">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="home-pill">
            {l.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
