"use client";

import dynamic from "next/dynamic";

const ProjectionScene = dynamic(
  () => import("@/components/projection/ProjectionScene"),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-0 bg-[#5ebfd4]"
        aria-label="Loading water projection"
      />
    ),
  },
);

/**
 * Projection: motion ripples + touch → cycling thoughts on luminous water.
 */
export default function ProjectionPage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#5ebfd4]">
      <ProjectionScene />
      <p className="pointer-events-none absolute bottom-6 left-6 z-10 font-mono text-[10px] uppercase tracking-[0.28em] text-[#0d4a5c]/40">
        deep dive · projection · phase 3
      </p>
    </main>
  );
}
