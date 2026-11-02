"use client";

import { motion } from "framer-motion";

const AIMS = [
  {
    title: "Make the unspoken visible",
    body: "Thoughts are left anonymously, so people can be honest about what they actually carry.",
  },
  {
    title: "Show it's shared",
    body: "What feels private is usually common. Seeing someone else's worry next to yours makes both lighter to hold.",
  },
  {
    title: "Turn noticing into care",
    body: "Every thought can be answered with a star, a reply or a small act, so no one carries it alone.",
  },
];

/** What the project is and what it's for — read at the kiosk, under the question */
export default function Ethos() {
  return (
    <motion.section
      aria-labelledby="ethos"
      className="relative mx-auto w-full max-w-3xl px-6 pb-16 pt-8 text-foam"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 1.1, ease: "easeOut" }}
    >
      <h2 id="ethos" className="font-serif text-3xl leading-tight md:text-4xl">
        Why we dive
      </h2>
      <p className="mt-4 text-lg leading-relaxed text-foam/80">
        Dive Deep is an interactive installation about the gap between caring and taking part. At the
        kiosk, visitors anonymously answer one question:{" "}
        <em>What is a quiet weight or worry you carry about our world?</em> Each answer is released
        into shared water. It appears first on the projection, then in the dive on your phone, where
        anyone can find it.
      </p>
      <p className="mt-4 leading-relaxed text-foam/65">
        We have never had more access to suffering, injustice and crisis, or felt more stuck about what
        to do with it. Most of it reaches us between a meme and an ad, built for a reaction rather than
        a response. So we skim. That isn&apos;t apathy. Pulling back is often how people protect what
        they have left to give.
      </p>
      <p className="mt-4 leading-relaxed text-foam/65">
        Dive Deep slows that down. It asks you to go further, read what a stranger couldn&apos;t say out
        loud, and answer it. The deeper a thought sits, the more tangled the issue behind it.
      </p>
      <ul className="mt-8 grid gap-6 md:grid-cols-3">
        {AIMS.map(({ title, body }) => (
          <li key={title} className="flex gap-3 md:flex-col">
            <span
              className="dive-orb-pulse mt-1.5 block h-3 w-3 shrink-0 rounded-full"
              style={{
                background: "radial-gradient(circle at 35% 30%, #ffffff 0 18%, #aef5e9 45%, #4b908d 100%)",
                boxShadow: "0 0 8px #aef5e9, 0 0 18px #4b908d",
              }}
              aria-hidden
            />
            <div>
              <p className="font-serif text-xl leading-snug">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-foam/65">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}
