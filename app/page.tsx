import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-cream text-ink">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, #e8dcc8 0%, transparent 50%), radial-gradient(ellipse at 80% 90%, #d9cbb8 0%, transparent 45%), linear-gradient(160deg, #f3eee6 0%, #ebe4d8 100%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-stone">
          Installation testing hub
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-tight tracking-tight text-charcoal md:text-6xl">
          Shared Burdens
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone">
          Open the kiosk to leave a worry and an offering. Keep the projection
          visible on a second screen. Scan a receipt QR to steward someone
          else&apos;s burden.
        </p>
        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <Link
            href="/kiosk"
            className="rounded-sm bg-charcoal px-6 py-4 text-center text-cream transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
          >
            Open kiosk
          </Link>
          <Link
            href="/gallery"
            className="rounded-sm border border-charcoal/20 bg-cream/60 px-6 py-4 text-center text-charcoal transition hover:border-charcoal/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
          >
            Browse archive
          </Link>
          <Link
            href="/projection"
            className="rounded-sm border border-charcoal/20 bg-cream/60 px-6 py-4 text-center text-charcoal transition hover:border-charcoal/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warm"
          >
            Open projection
          </Link>
        </div>
      </div>
    </main>
  );
}
