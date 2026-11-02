"use client";

import dynamic from "next/dynamic";

const ProjectionScene = dynamic(
  () => import("@/components/projection/ProjectionScene"),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-0 bg-[#60B3CC]"
        aria-label="Loading water projection"
      />
    ),
  },
);

/**
 * Projection, ripple-only version: identical water, background fish, ripples
 * and arm / body tracking as /projection — but a tap only makes a ripple
 * (no thought text, no fish surfacing).
 */
export default function ProjectionRipplesPage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#60B3CC]">
      <ProjectionScene tapThoughts={false} />
    </main>
  );
}
