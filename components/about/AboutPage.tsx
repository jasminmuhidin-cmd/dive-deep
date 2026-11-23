"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import InstallationViewer from "@/components/installation-3d/InstallationViewer";
import OutlineLogo from "@/components/branding/OutlineLogo";

// Matches the 3D scene's background so the hero melts into the page
const DEEP = "#05070c";

const STEPS = [
  {
    label: "Share",
    body: "Participants submit a personal concern through a kiosk, receive a printed artefact and release it into a shared collection of thoughts.",
  },
  {
    label: "Uncover",
    body: "Through touch and movement, they uncover others’ thoughts concealed beneath an interactive water visualisation.",
  },
  {
    label: "Revisit",
    body: "An accompanying digital archive allows them to revisit these perspectives in their own time, beyond the installation.",
  },
];

/** Text rising gently out of the dark as it scrolls into view. */
function Surface({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={still ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 1.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-8 flex items-center gap-4 text-[0.7rem] uppercase tracking-[0.32em] text-[#8fd3ff]/60">
      <span aria-hidden className="h-px w-8 bg-[#8fd3ff]/40" />
      {children}
    </p>
  );
}

export default function AboutPage({ className = "" }: { className?: string }) {
  return (
    <main className={`${className} relative min-h-screen overflow-x-clip text-[#e4e6e8]`} style={{ background: DEEP }}>
      {/* ── Landing: the installation ─────────────────────────────── */}
      <section className="relative h-[100svh] min-h-[560px]" aria-label="3D model of the Dive Deep installation">
        <InstallationViewer embedded />

        {/* fade the model into the page below */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]"
          style={{ background: `linear-gradient(to bottom, transparent, ${DEEP} 92%)` }}
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-10 sm:px-12 sm:pb-14">
          <div className="mx-auto flex max-w-6xl items-end justify-between gap-8">
            <Surface>
              <OutlineLogo tone="light" className="w-[min(72vw,26rem)]" />
            </Surface>
            <Surface delay={0.4} className="hidden text-right text-xs leading-relaxed tracking-wide text-white/35 md:block">
              <p>drag to look around</p>
              <p>pinch or use + / − to zoom</p>
            </Surface>
          </div>
        </div>

        <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 hidden h-12 w-px -translate-x-1/2 overflow-hidden sm:block">
          <span className="about-descend block h-full w-px bg-gradient-to-b from-transparent via-[#8fd3ff]/70 to-transparent" />
        </div>
      </section>

      {/* ambient light pooling in the water below the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[100svh] h-[120vh] w-[140vw] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(90,166,196,0.10), transparent 60%)" }}
      />

      <div className="relative mx-auto max-w-6xl px-6 sm:px-12">
        {/* ── Statement ─────────────────────────────────────────────── */}
        <section className="py-32 sm:py-44">
          <Surface>
            <p className="max-w-4xl text-[1.65rem] font-light leading-[1.45] text-white/90 sm:text-4xl sm:leading-[1.4]">
              Dive Deep is an interactive installation that invites young adults to reflect on social issues,
              anonymously share their concerns and encounter the perspectives of others.
            </p>
          </Surface>
        </section>

        {/* ── Intent ────────────────────────────────────────────────── */}
        <section className="grid gap-4 border-t border-white/[0.07] py-24 sm:py-32 md:grid-cols-[1fr_2fr] md:gap-16">
          <Surface>
            <Eyebrow>Intent</Eyebrow>
          </Surface>
          <Surface delay={0.15}>
            <p className="max-w-2xl text-lg leading-[1.85] text-white/70 sm:text-xl">
              Drawing on the embodied, collective and socially visible qualities of traditional activism, Dive Deep
              offers an accessible starting point for participation. Its calming and self-directed approach prioritises
              autonomy and emotional comfort, inviting engagement without the pressures of public advocacy or immediate
              commitment.
            </p>
          </Surface>
        </section>

        {/* ── The experience ────────────────────────────────────────── */}
        <section className="grid gap-4 border-t border-white/[0.07] py-24 sm:py-32 md:grid-cols-[1fr_2fr] md:gap-16">
          <Surface>
            <Eyebrow>The experience</Eyebrow>
          </Surface>

          {/* a thin lit path, echoing the one that guides visitors through the room */}
          <ol className="relative max-w-2xl">
            <span
              aria-hidden
              className="absolute bottom-3 left-[5px] top-3 w-px bg-gradient-to-b from-[#8fd3ff]/50 via-[#8fd3ff]/20 to-transparent"
            />
            {STEPS.map((step, i) => (
              <li key={step.label} className="relative pb-20 pl-12 last:pb-0">
                <Surface delay={i * 0.12}>
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 h-[11px] w-[11px] rounded-full border border-[#8fd3ff]/60 bg-[#05070c] shadow-[0_0_14px_rgba(143,211,255,0.45)]"
                  />
                  <p className="mb-3 flex items-baseline gap-4">
                    <span className="text-xs tabular-nums tracking-[0.2em] text-white/30">0{i + 1}</span>
                    <span className="text-2xl font-light text-white/90 sm:text-3xl">{step.label}</span>
                  </p>
                  <p className="text-lg leading-[1.85] text-white/65">{step.body}</p>
                </Surface>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Invitation ────────────────────────────────────────────── */}
        <section className="border-t border-white/[0.07] py-32 text-center sm:py-44">
          <Surface>
            <Link
              href="/"
              className="group inline-flex items-center gap-4 rounded-full border border-[#8fd3ff]/30 px-8 py-4 text-sm tracking-[0.18em] text-white/85 uppercase transition-colors duration-700 hover:border-[#8fd3ff]/70 hover:bg-[#8fd3ff]/[0.06] hover:text-white"
            >
              Enter the archive
              <span aria-hidden className="transition-transform duration-700 group-hover:translate-y-1">
                ↓
              </span>
            </Link>
          </Surface>
        </section>
      </div>

      <footer className="relative px-6 pb-10 text-center text-[0.7rem] uppercase tracking-[0.32em] text-white/25 sm:px-12">
        dive deep
      </footer>
    </main>
  );
}
