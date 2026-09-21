import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-ink">
      <div className="ocean-bg pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-mist/70">
          Installation hub
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-tight tracking-tight text-foam md:text-6xl">
          deep dive
        </h1>
        <div
          className="mt-3 h-1.5 w-28 rounded-full"
          style={{ background: "linear-gradient(90deg, #1a5f6e, #5eb0c0)" }}
          aria-hidden
        />
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist">
          Send a quiet weight from the kiosk. Watch it enter the water on the
          projection (dive-deep-7). Browse what we&apos;ve been carrying in the
          archive.
        </p>
        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <Link
            href="/kiosk"
            className="rounded-full bg-ripple px-6 py-4 text-center text-ocean-deep transition hover:bg-foam focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam"
          >
            Open kiosk
          </Link>
          <Link
            href="/gallery"
            className="rounded-full border border-ripple/30 px-6 py-4 text-center text-foam transition hover:border-foam/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple"
          >
            Archive
          </Link>
        </div>
        <p className="mt-10 max-w-md font-mono text-xs leading-relaxed text-mist/50">
          Projection: run{" "}
          <code className="text-mist/80">cd dive-deep-7 && npm start</code> —
          it listens for kiosk ripples on{" "}
          <code className="text-mist/80">localhost:3000</code>. Receipt QR
          links use{" "}
          <code className="text-mist/80">dive-deep.vercel.app</code> once
          deployed.
        </p>
      </div>
    </main>
  );
}
