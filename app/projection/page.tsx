export default function ProjectionPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 text-foam">
      <div className="ocean-bg absolute inset-0" />
      <div className="relative max-w-lg text-center">
        <h1 className="font-serif text-4xl">Projection lives in dive-deep-7</h1>
        <p className="mt-4 text-mist leading-relaxed">
          Run the water installation separately so camera, touch, and print stay
          intact:
        </p>
        <pre className="mt-6 rounded-2xl border border-ripple/25 bg-ocean-mid/60 p-4 text-left font-mono text-sm text-foam">
          {`cd dive-deep-7
npm install
npm start`}
        </pre>
        <p className="mt-4 text-sm text-mist/70">
          Keep the Next.js kiosk on port 3000 so ripples can enter the water.
        </p>
      </div>
    </main>
  );
}
