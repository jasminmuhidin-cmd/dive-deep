export default function ProjectionPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 text-foam">
      <div className="ocean-bg absolute inset-0" />
      <div className="relative max-w-lg text-center">
        <h1 className="font-serif text-4xl">Projection</h1>
        <p className="mt-4 text-mist leading-relaxed">
          Open the live water visualisation in the browser, or run Electron on
          the installation machine for camera and print.
        </p>
        <a
          href="/water/"
          className="mt-8 inline-block rounded-full bg-ripple px-6 py-4 text-ocean-deep transition hover:bg-foam"
        >
          Open live water
        </a>
        <pre className="mt-8 rounded-2xl border border-ripple/25 bg-ocean-mid/60 p-4 text-left font-mono text-sm text-foam">
          {`# Installation (camera + print)
cd dive-deep-7
npm start`}
        </pre>
      </div>
    </main>
  );
}
