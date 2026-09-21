import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-foam">
      <div className="deep-dive-bg pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-sand/70">
          Installation testing hub
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-tight tracking-tight text-foam md:text-6xl">
          deep dive
        </h1>
        <div
          className="mt-3 h-1.5 w-28 rounded-full"
          style={{
            background: "linear-gradient(90deg, #4b908d, #147a90, #c6979d)",
          }}
          aria-hidden
        />
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-foam/65">
          Open the kiosk to shape your fish. Browse the archive. Keep the
          projection open on a second screen. Scan a QR to steward someone
          else&apos;s thought.
        </p>
        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <Link
            href="/kiosk"
            className="rounded-full bg-sand px-6 py-4 text-center text-navy transition hover:bg-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seafoam"
          >
            Open kiosk
          </Link>
          <Link
            href="/gallery"
            className="rounded-full border border-foam/20 px-6 py-4 text-center text-foam transition hover:border-foam/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand"
          >
            Browse archive
          </Link>
          <Link
            href="/projection"
            className="rounded-full border border-foam/20 px-6 py-4 text-center text-foam transition hover:border-foam/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand"
          >
            Open projection
          </Link>
        </div>
        <p className="mt-10 max-w-md font-mono text-xs leading-relaxed text-mist/50">
          Projection: run{" "}
          <code className="text-mist/80">cd dive-deep-7 && npm start</code> —
          it listens for kiosk ripples at{" "}
          <code className="text-mist/80">https://dive-deep.vercel.app</code>{" "}
          (or set{" "}
          <code className="text-mist/80">window.__KIOSK_API__</code> for local).
        </p>
      </div>
    </main>
  );
}
